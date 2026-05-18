// عرض العناصر في الـ DOM وإدارة Toast والـ Modals.

export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

export function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
}

export function openModal(id) {
    const overlay = document.getElementById(id);
    if (overlay) overlay.classList.add('show');
}

export function closeModal(id) {
    const overlay = document.getElementById(id);
    if (overlay) overlay.classList.remove('show');
}

export function closeAllModals() {
    document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
}

const TONE_LABELS = {
    complaint: { label: 'شكوى / اعتراض', class: 'tone-complaint' },
    inquiry: { label: 'استفسار', class: 'tone-inquiry' },
    request: { label: 'طلب', class: 'tone-request' },
    neutral: { label: 'محايدة', class: 'tone-neutral' },
};

export function renderAnalysis(analysis) {
    const box = document.getElementById('analysisBox');
    const content = document.getElementById('analysisContent');
    const toneInfo = TONE_LABELS[analysis.tone.primary] || TONE_LABELS.neutral;

    let html = '';
    html += `<div class="analysis-item"><strong>نبرة الرسالة:</strong> <span class="tag ${toneInfo.class}">${escapeHtml(toneInfo.label)}</span>`;
    if (analysis.tone.urgent) html += ' <span class="tag" style="background:#e67e22;">⚡ عاجل</span>';
    html += '</div>';

    if (analysis.detectedIntents.length > 0) {
        html += '<div class="analysis-item"><strong>الموضوع الرئيسي:</strong><div class="tag-list">';
        analysis.detectedIntents.forEach(i => {
            html += `<span class="tag intent">${escapeHtml(i.intent)}</span>`;
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
        html += `<div class="analysis-item"><strong>كلمات مفتاحية (${analysis.foundKeywords.length}):</strong><div class="tag-list">`;
        analysis.foundKeywords.forEach(k => {
            html += `<span class="tag">${escapeHtml(k)}</span>`;
        });
        html += '</div></div>';
    }

    content.innerHTML = html;
    box.classList.add('show');
}

export function renderArticles(articles, selectedIds) {
    const container = document.getElementById('articlesContainer');

    if (articles.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><p>لم يتم العثور على مواد ذات صلة</p></div>';
        return;
    }

    container.innerHTML = articles.map(article => {
        const scoreTag = typeof article.score === 'number' && article.score > 0
            ? `<span class="article-score">تطابق ${article.score}</span>`
            : '';
        const isSelected = selectedIds.includes(article.id) ? 'selected' : '';
        const sourceLink = article.sourceUrl
            ? `<a class="article-source" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener" title="المصدر الرسمي" data-no-toggle>🔗</a>`
            : '';
        const truncated = article.text.length > 150
            ? article.text.substring(0, 150) + '...'
            : article.text;
        return `
        <div class="article-item ${isSelected}" data-id="${escapeHtml(article.id)}">
            <div>
                <span class="article-number">${escapeHtml(article.number)}</span>
                ${scoreTag}
                ${sourceLink}
            </div>
            <div class="article-title">${escapeHtml(article.title)}</div>
            <div class="article-text">${escapeHtml(truncated)}</div>
            <span class="article-category">${escapeHtml(article.category)}</span>
        </div>`;
    }).join('');
}

export function renderTemplates(templates) {
    const grid = document.getElementById('templatesGrid');
    grid.innerHTML = templates.map(template =>
        `<div class="template-card" data-id="${template.id}">
            <div class="template-icon">${escapeHtml(template.icon)}</div>
            <div class="template-name">${escapeHtml(template.name)}</div>
        </div>`,
    ).join('');
}

export function renderCategoryFilter(categories) {
    const container = document.getElementById('categoryFilter');
    let html = '<button class="category-btn active" data-category="all">الكل</button>';
    categories.forEach(cat => {
        html += `<button class="category-btn" data-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`;
    });
    container.innerHTML = html;
}

export function renderSavedResponses(savedResponses, searchQuery = '') {
    const container = document.getElementById('savedList');
    const filtered = searchQuery
        ? savedResponses.filter(r => r.text.toLowerCase().includes(searchQuery.toLowerCase()))
        : savedResponses;

    if (filtered.length === 0) {
        const msg = searchQuery ? 'لا توجد نتائج مطابقة' : 'لا توجد ردود محفوظة بعد';
        container.innerHTML = `<div class="empty-state"><div class="icon">📭</div><p>${msg}</p></div>`;
        return;
    }

    container.innerHTML = filtered.map(response =>
        `<div class="saved-item">
            <div class="saved-item-actions">
                <button data-action="load" data-id="${response.id}" title="تحميل">📂</button>
                <button data-action="delete" data-id="${response.id}" title="حذف">🗑️</button>
            </div>
            <div class="saved-item-preview">${escapeHtml(response.preview)}...</div>
            <div class="saved-item-date">${escapeHtml(response.date)}</div>
        </div>`,
    ).join('');
}

export function renderStats(stats, articlesCount) {
    const els = {
        articles: document.getElementById('articlesCount'),
        saved: document.getElementById('savedCount'),
        today: document.getElementById('statToday'),
        week: document.getElementById('statWeek'),
        total: document.getElementById('statTotal'),
        topCategory: document.getElementById('statTopCategory'),
    };
    if (els.articles) els.articles.textContent = articlesCount;
    if (els.saved) els.saved.textContent = stats.total;
    if (els.today) els.today.textContent = stats.today;
    if (els.week) els.week.textContent = stats.week;
    if (els.total) els.total.textContent = stats.total;
    if (els.topCategory) els.topCategory.textContent = stats.topCategory || '—';
}
