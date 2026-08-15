// عرض العناصر في الـ DOM وإدارة Toast والـ Modals.

import { isSafeUrl } from './data.js';
import { formatNumber, fileStamp, isStaleVerification } from './format.js';

export function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// تنزيل بيانات كملف JSON — كان هذا المنطق مكرراً حرفياً في app.js و admin.js.
export function downloadJson(data, prefix) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${prefix}-${fileStamp()}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

export function setBusy(isBusy) {
    const main = document.getElementById('mainContainer');
    if (main) main.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    document.body.classList.toggle('app-loading', isBusy);
}

// حبس التركيز داخل النافذة المفتوحة واستعادته عند الإغلاق (إتاحة الوصول).
let lastFocusedElement = null;

function getFocusable(overlay) {
    return Array.from(
        overlay.querySelectorAll('button, [href], input:not([hidden]), textarea, select'),
    ).filter(el => el.offsetParent !== null);
}

function handleModalKeydown(e) {
    if (e.key !== 'Tab') return;
    const focusables = getFocusable(e.currentTarget);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
}

export function openModal(id) {
    const overlay = document.getElementById(id);
    if (!overlay) return;
    lastFocusedElement = document.activeElement;
    overlay.classList.add('show');
    overlay.addEventListener('keydown', handleModalKeydown);
    const focusables = getFocusable(overlay);
    if (focusables.length > 0) focusables[0].focus();
}

function restoreFocus() {
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
    }
    lastFocusedElement = null;
}

// يُطلق حدث modal:close حتى يعرف confirmDialog أن النافذة أُغلقت بـ Esc أو بالنقر خارجها.
function dismiss(overlay) {
    overlay.classList.remove('show');
    overlay.removeEventListener('keydown', handleModalKeydown);
    overlay.dispatchEvent(new CustomEvent('modal:close'));
}

export function closeModal(id) {
    const overlay = document.getElementById(id);
    if (!overlay) return;
    dismiss(overlay);
    restoreFocus();
}

export function closeAllModals() {
    const open = document.querySelectorAll('.modal-overlay.show');
    open.forEach(dismiss);
    if (open.length > 0) restoreFocus();
}

// بديل عن confirm() الأصلي: يستخدم نفس نظام النوافذ (RTL، حبس تركيز، تنسيق موحّد).
// يرجع إلى confirm() فقط إذا لم تكن النافذة موجودة في الصفحة.
export function confirmDialog(message, { confirmLabel = 'تأكيد', danger = true } = {}) {
    const overlay = document.getElementById('confirmModal');
    if (!overlay) return Promise.resolve(window.confirm(message));

    return new Promise(resolve => {
        const messageEl = document.getElementById('confirmModalMessage');
        const okBtn = document.getElementById('confirmOk');
        const cancelBtn = document.getElementById('confirmCancel');

        messageEl.textContent = message;
        okBtn.textContent = confirmLabel;
        okBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';

        const finish = result => {
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('modal:close', onDismiss);
            if (overlay.classList.contains('show')) closeModal('confirmModal');
            resolve(result);
        };
        const onOk = () => finish(true);
        const onCancel = () => finish(false);
        const onDismiss = () => finish(false);

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        overlay.addEventListener('modal:close', onDismiss);
        openModal('confirmModal');
    });
}

const TONE_LABELS = {
    complaint: { label: 'شكوى / اعتراض', class: 'tone-complaint' },
    inquiry: { label: 'استفسار', class: 'tone-inquiry' },
    request: { label: 'طلب', class: 'tone-request' },
    neutral: { label: 'محايدة', class: 'tone-neutral' },
};

// وصف النبرة للعرض: الاسم من بيانات JSON أولاً، ثم الخريطة المدمجة، وأخيراً — لنبرة
// جديدة في JSON بلا label — مفتاحها نفسه بدل ادّعاء «محايدة» لنبرة مرصودة فعلاً.
export function toneDisplay(primary, jsonLabel = undefined) {
    const known = TONE_LABELS[primary];
    return {
        label: jsonLabel || (known ? known.label : primary),
        class: known ? known.class : 'tone-neutral',
    };
}

export function renderAnalysis(analysis) {
    const box = document.getElementById('analysisBox');
    const content = document.getElementById('analysisContent');
    const toneInfo = toneDisplay(analysis.tone.primary, analysis.tone.label);

    let html = '';
    html += `<div class="analysis-item"><strong>نبرة الرسالة:</strong> <span class="tag ${toneInfo.class}">${escapeHtml(toneInfo.label)}</span>`;
    if (analysis.tone.urgent) html += ' <span class="tag urgent">⚡ عاجل</span>';
    html += '</div>';

    if (analysis.detectedIntents.length > 0) {
        html += '<div class="analysis-item"><strong>الموضوع الرئيسي:</strong><div class="tag-list">';
        analysis.detectedIntents.forEach(i => {
            html += `<span class="tag intent">${escapeHtml(i.label)}</span>`;
        });
        html += '</div></div>';
    }

    if (analysis.entities.length > 0) {
        html += '<div class="analysis-item"><strong>المعلومات المستخرجة:</strong><div class="tag-list">';
        analysis.entities.forEach(e => {
            html += `<span class="tag entity">${escapeHtml(e.type)}: ${escapeHtml(e.value)}</span>`;
        });
        html += '</div></div>';
    }

    if (analysis.foundKeywords.length > 0) {
        html += `<div class="analysis-item"><strong>كلمات مفتاحية (${formatNumber(analysis.foundKeywords.length)}):</strong><div class="tag-list">`;
        analysis.foundKeywords.forEach(k => {
            html += `<span class="tag">${escapeHtml(k)}</span>`;
        });
        html += '</div></div>';
    }

    content.innerHTML = html;
    box.classList.add('show');
}

// شارة تاريخ آخر تحقق: في أداة قانونية، عمر التحقق من نص المادة معلومة تخص الموظف.
// التاريخ يُعرض كما هو في البيانات (ISO ميلادي) لأنه ختم مصدر لا تاريخ واجهة.
function verifiedBadge(article) {
    if (!article.lastVerified) return '';
    const stale = isStaleVerification(article.lastVerified);
    const icon = stale ? '⚠️' : '✓';
    const title = stale
        ? 'مضى أكثر من سنة على آخر تحقق من نص المادة — يُنصح بمراجعة المصدر الرسمي'
        : 'تاريخ آخر تحقق من نص المادة (ميلادي)';
    return `<span class="article-verified${stale ? ' stale' : ''}" title="${escapeHtml(title)}">${icon} ${escapeHtml(article.lastVerified)}</span>`;
}

export function renderArticles(articles, selectedIds) {
    const container = document.getElementById('articlesContainer');

    if (articles.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><p>لم يتم العثور على مواد ذات صلة</p></div>';
        return;
    }

    container.innerHTML = articles.map(article => {
        const scoreTag = typeof article.score === 'number' && article.score > 0
            ? `<span class="article-score">تطابق ${formatNumber(article.score)}</span>`
            : '';
        const isSelected = selectedIds.includes(article.id) ? 'selected' : '';
        const sourceLink = isSafeUrl(article.sourceUrl)
            ? `<a class="article-source" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener" title="المصدر الرسمي" data-no-toggle>🔗</a>`
            : '';
        const truncated = article.text.length > 150
            ? article.text.substring(0, 150) + '...'
            : article.text;
        return `
        <div class="article-item ${isSelected}" data-id="${escapeHtml(article.id)}" role="button" tabindex="0" aria-pressed="${isSelected ? 'true' : 'false'}">
            <div>
                <span class="article-number">${escapeHtml(article.number)}</span>
                ${scoreTag}
                ${sourceLink}
            </div>
            <div class="article-title">${escapeHtml(article.title)}</div>
            <div class="article-text">${escapeHtml(truncated)}</div>
            <div class="article-footer">
                <span class="article-category">${escapeHtml(article.category)}</span>
                ${verifiedBadge(article)}
            </div>
        </div>`;
    }).join('');
}

export function renderTemplates(templates) {
    const grid = document.getElementById('templatesGrid');
    grid.innerHTML = templates.map(template =>
        `<div class="template-card" data-id="${escapeHtml(template.id)}" role="button" tabindex="0">
            <div class="template-icon">${escapeHtml(template.icon)}</div>
            <div class="template-name">${escapeHtml(template.name)}</div>
        </div>`,
    ).join('');
}

export function renderCategoryFilter(categories, activeCategory = 'all') {
    const container = document.getElementById('categoryFilter');
    let html = `<button class="category-btn${activeCategory === 'all' ? ' active' : ''}" data-category="all">الكل</button>`;
    categories.forEach(cat => {
        const active = cat === activeCategory ? ' active' : '';
        html += `<button class="category-btn${active}" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`;
    });
    container.innerHTML = html;
}

export const STATUS_LABELS = {
    'new': 'جديد',
    'in-progress': 'قيد المعالجة',
    'closed': 'مغلق',
};

function statusSelect(response) {
    const current = STATUS_LABELS[response.status] ? response.status : 'new';
    const options = Object.entries(STATUS_LABELS).map(([value, label]) =>
        `<option value="${value}"${value === current ? ' selected' : ''}>${escapeHtml(label)}</option>`,
    ).join('');
    return `<select class="saved-status status-${current}" data-action="status" data-id="${escapeHtml(response.id)}" aria-label="حالة معالجة الرد">${options}</select>`;
}

function savedItemBadges(response) {
    let html = '';
    if (response.tone) {
        const toneInfo = toneDisplay(response.tone);
        html += `<span class="tag ${toneInfo.class}">${escapeHtml(toneInfo.label)}</span>`;
    }
    if (response.urgent) html += '<span class="tag urgent">⚡ عاجل</span>';
    if (response.category) html += `<span class="tag intent">${escapeHtml(response.category)}</span>`;
    return html;
}

// filters: { query, status, tone, category } — التصفية نفسها في storage.filterSavedResponses،
// وهنا العرض فقط. تمرير لا شيء يعرض القائمة كاملة.
export function renderSavedResponses(savedResponses, filtered = null) {
    const container = document.getElementById('savedList');
    const list = filtered || savedResponses;

    if (list.length === 0) {
        const msg = savedResponses.length > 0 ? 'لا توجد نتائج مطابقة' : 'لا توجد ردود محفوظة بعد';
        container.innerHTML = `<div class="empty-state"><div class="icon">📭</div><p>${escapeHtml(msg)}</p></div>`;
        return;
    }

    container.innerHTML = list.map(response =>
        `<div class="saved-item">
            <div class="saved-item-actions">
                <button data-action="load" data-id="${escapeHtml(response.id)}" title="تحميل" aria-label="تحميل الرد المحفوظ">📂</button>
                <button data-action="delete" data-id="${escapeHtml(response.id)}" title="حذف" aria-label="حذف الرد المحفوظ">🗑️</button>
            </div>
            <div class="saved-item-meta">${savedItemBadges(response)}</div>
            <div class="saved-item-preview">${escapeHtml(response.preview)}${response.text.length > response.preview.length ? '…' : ''}</div>
            <div class="saved-item-footer">
                <span class="saved-item-date">${escapeHtml(response.date)}</span>
                ${statusSelect(response)}
            </div>
        </div>`,
    ).join('');
}

// تعبئة قائمة تصفية الفئات من فئات الردود المحفوظة فعلاً، مع الحفاظ على الاختيار الحالي.
export function syncArchiveCategoryOptions(savedResponses, selected = 'all') {
    const select = document.getElementById('archiveCategoryFilter');
    if (!select) return;
    const categories = Array.from(new Set(savedResponses.map(r => r.category).filter(Boolean)));
    let html = '<option value="all">كل الفئات</option>';
    categories.forEach(cat => {
        html += `<option value="${escapeHtml(cat)}"${cat === selected ? ' selected' : ''}>${escapeHtml(cat)}</option>`;
    });
    select.innerHTML = html;
    select.value = categories.includes(selected) ? selected : 'all';
}

export function renderStats(stats, articlesCount) {
    const els = {
        articles: document.getElementById('articlesCount'),
        saved: document.getElementById('savedCount'),
        today: document.getElementById('statToday'),
        week: document.getElementById('statWeek'),
        total: document.getElementById('statTotal'),
        topCategory: document.getElementById('statTopCategory'),
        open: document.getElementById('statOpen'),
        complaints: document.getElementById('statComplaints'),
    };
    if (els.articles) els.articles.textContent = formatNumber(articlesCount);
    if (els.saved) els.saved.textContent = formatNumber(stats.total);
    if (els.today) els.today.textContent = formatNumber(stats.today);
    if (els.week) els.week.textContent = formatNumber(stats.week);
    if (els.total) els.total.textContent = formatNumber(stats.total);
    if (els.topCategory) els.topCategory.textContent = stats.topCategory || '—';
    if (els.open) els.open.textContent = formatNumber(stats.open || 0);
    if (els.complaints) els.complaints.textContent = formatNumber((stats.byTone && stats.byTone.complaint) || 0);
}
