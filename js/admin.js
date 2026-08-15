// شاشة إدارة المواد النظامية + تصدير/استيراد.

import { escapeHtml, showToast, downloadJson, confirmDialog } from './ui.js';
import { isSafeUrl, validateArticle, toPlainArticle } from './data.js';
import {
    getArticles,
    findArticle,
    upsertArticle,
    removeArticle,
    replaceCustomArticles,
    resetArticles,
    subscribe,
} from './store.js';

// حد لحجم الملف المستورد: file.text() + JSON.parse على ملف ضخم يجمّد الواجهة تماماً.
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export function initAdmin() {
    renderAdminList();
    bindAdminEvents();
    subscribe(renderAdminList);
}

function getCurrentList() {
    return getArticles().slice().sort((a, b) => a.number.localeCompare(b.number, 'ar'));
}

function renderAdminList() {
    const container = document.getElementById('adminList');
    if (!container) return;

    const list = getCurrentList();
    if (list.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>لا توجد مواد</p></div>';
        return;
    }

    container.innerHTML = list.map(a => `
        <div class="admin-list-item" data-id="${escapeHtml(a.id)}">
            <div class="info">
                <div class="item-title">${escapeHtml(a.number)} — ${escapeHtml(a.title)}</div>
                <div class="item-meta">${escapeHtml(a.category)}${a.sourceUrl ? ' · 🔗' : ''}</div>
            </div>
            <div class="actions">
                <button data-action="edit" title="تعديل" aria-label="تعديل المادة">✏️</button>
                <button data-action="delete" title="حذف" aria-label="حذف المادة">🗑️</button>
            </div>
        </div>
    `).join('');
}

function clearForm() {
    ['fId', 'fNumber', 'fTitle', 'fCategory', 'fKeywords', 'fSourceUrl', 'fText'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    document.getElementById('fId').readOnly = false;
}

function loadForm(article) {
    document.getElementById('fId').value = article.id;
    document.getElementById('fId').readOnly = true;
    document.getElementById('fNumber').value = article.number;
    document.getElementById('fTitle').value = article.title;
    document.getElementById('fCategory').value = article.category;
    document.getElementById('fKeywords').value = (article.keywords || []).join('، ');
    document.getElementById('fSourceUrl').value = article.sourceUrl || '';
    document.getElementById('fText').value = article.text;
}

function readForm() {
    const id = document.getElementById('fId').value.trim();
    const number = document.getElementById('fNumber').value.trim();
    const title = document.getElementById('fTitle').value.trim();
    const category = document.getElementById('fCategory').value.trim();
    const keywords = document.getElementById('fKeywords').value
        .split(/[،,]/).map(s => s.trim()).filter(Boolean);
    const sourceUrl = document.getElementById('fSourceUrl').value.trim();
    const text = document.getElementById('fText').value.trim();
    if (!id || !number || !title || !category || !text) {
        showToast('يرجى تعبئة الحقول الأساسية');
        return null;
    }
    if (sourceUrl && !isSafeUrl(sourceUrl)) {
        showToast('رابط المصدر يجب أن يكون رابط https صالحاً');
        return null;
    }
    const article = validateArticle({ id, number, title, category, keywords, sourceUrl, text });
    if (!article) {
        showToast('تعذّر التحقق من بيانات المادة');
        return null;
    }
    return article;
}

// يتحقق من الحجم ويقرأ الملف كـ JSON. يعيد null بعد إظهار السبب للمستخدم.
async function readJsonFile(file) {
    if (file.size > MAX_IMPORT_BYTES) {
        showToast('الملف أكبر من ٥ ميجابايت — تعذّر الاستيراد');
        return null;
    }
    try {
        return JSON.parse(await file.text());
    } catch {
        showToast('ملف غير صالح');
        return null;
    }
}

function bindAdminEvents() {
    const adminList = document.getElementById('adminList');
    if (adminList) {
        adminList.addEventListener('click', async (e) => {
            const item = e.target.closest('.admin-list-item');
            if (!item) return;
            const id = item.dataset.id;
            const action = e.target.dataset.action;
            if (action === 'edit') {
                const article = findArticle(id);
                if (article) loadForm(article);
            } else if (action === 'delete') {
                const ok = await confirmDialog(
                    'هل أنت متأكد من حذف هذه المادة؟ يمكن استعادتها بالضغط على «إعادة تعيين».',
                    { confirmLabel: 'حذف' },
                );
                if (!ok) return;
                if (!removeArticle(id)) {
                    showToast('تعذّر حفظ التغيير: امتلأت مساحة التخزين المحلية');
                }
            }
        });
    }

    document.getElementById('adminSave')?.addEventListener('click', () => {
        const article = readForm();
        if (!article) return;
        if (!upsertArticle(article)) {
            showToast('تعذّر الحفظ: امتلأت مساحة التخزين المحلية');
            return;
        }
        clearForm();
        showToast('تم حفظ المادة');
    });

    document.getElementById('adminClear')?.addEventListener('click', clearForm);

    document.getElementById('adminReset')?.addEventListener('click', async () => {
        const ok = await confirmDialog(
            'سيتم إلغاء كل التعديلات المحلية والعودة للمواد الأساسية. هل أنت متأكد؟',
            { confirmLabel: 'إعادة تعيين' },
        );
        if (!ok) return;
        resetArticles();
        showToast('تم إعادة التعيين');
    });

    document.getElementById('adminExport')?.addEventListener('click', () => {
        downloadJson(getArticles().map(toPlainArticle), 'articles');
        showToast('تم تصدير المواد');
    });

    document.getElementById('adminImport')?.addEventListener('click', () => {
        document.getElementById('adminImportFile')?.click();
    });

    document.getElementById('adminImportFile')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const ok = await confirmDialog(
            'سيستبدل الاستيراد كل المواد المخصصة الحالية ويعيد المواد المحذوفة سابقاً. هل أنت متأكد؟',
            { confirmLabel: 'استيراد' },
        );
        if (!ok) {
            e.target.value = '';
            return;
        }

        const parsed = await readJsonFile(file);
        if (parsed === null) {
            e.target.value = '';
            return;
        }
        if (!Array.isArray(parsed)) {
            showToast('ملف غير صالح');
            e.target.value = '';
            return;
        }

        const valid = parsed.map(validateArticle).filter(Boolean);
        const rejected = parsed.length - valid.length;

        if (!replaceCustomArticles(valid)) {
            showToast('تعذّر الاستيراد: امتلأت مساحة التخزين المحلية');
            e.target.value = '';
            return;
        }

        showToast(rejected > 0
            ? `تم استيراد ${valid.length} مادة (رُفضت ${rejected} لعدم اكتمال بياناتها)`
            : `تم استيراد ${valid.length} مادة`);
        e.target.value = '';
    });
}
