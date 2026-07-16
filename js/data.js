// تحميل بيانات JSON ودمج التعديلات المحلية على المواد.

const STORAGE_KEYS = {
    customArticles: 'customArticles',
    deletedArticles: 'deletedArticles',
};

async function fetchJson(path) {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`فشل تحميل ${path}`);
    return response.json();
}

function getCustomArticles() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.customArticles) || '[]');
    } catch {
        return [];
    }
}

function getDeletedArticleIds() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.deletedArticles) || '[]');
    } catch {
        return [];
    }
}

// تعيد false عند فشل الكتابة (مثل امتلاء مساحة التخزين) بدل رمي استثناء.
function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

export function saveCustomArticles(list) {
    return safeSetItem(STORAGE_KEYS.customArticles, JSON.stringify(list));
}

export function saveDeletedArticleIds(ids) {
    return safeSetItem(STORAGE_KEYS.deletedArticles, JSON.stringify(ids));
}

// يقبل روابط https فقط؛ يمنع أنظمة خطرة مثل javascript:
export function isSafeUrl(url) {
    if (!url) return false;
    try {
        return new URL(url).protocol === 'https:';
    } catch {
        return false;
    }
}

// تحقق نوعي موحد للمادة (النموذج والاستيراد): تعيد نسخة نظيفة أو null.
export function validateArticle(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const asText = v => (typeof v === 'string' ? v.trim() : '');
    const id = asText(raw.id);
    const number = asText(raw.number);
    const title = asText(raw.title);
    const category = asText(raw.category);
    const text = asText(raw.text);
    if (!id || !number || !title || !category || !text) return null;

    const keywords = Array.isArray(raw.keywords)
        ? raw.keywords.map(asText).filter(Boolean)
        : [];
    const sourceUrl = isSafeUrl(asText(raw.sourceUrl)) ? asText(raw.sourceUrl) : '';

    const article = { id, number, title, category, keywords, sourceUrl, text };
    const lastVerified = asText(raw.lastVerified);
    if (lastVerified) article.lastVerified = lastVerified;
    return article;
}

export function resetCustomArticles() {
    localStorage.removeItem(STORAGE_KEYS.customArticles);
    localStorage.removeItem(STORAGE_KEYS.deletedArticles);
}

export function mergeArticles(base, custom, deletedIds) {
    const map = new Map();
    base.forEach(a => map.set(a.id, a));
    custom.forEach(a => map.set(a.id, a));
    deletedIds.forEach(id => map.delete(id));
    return Array.from(map.values());
}

export async function loadData() {
    const [baseArticles, templates, intents, language] = await Promise.all([
        fetchJson('data/articles.json'),
        fetchJson('data/templates.json'),
        fetchJson('data/intents.json'),
        fetchJson('data/colloquial-map.json'),
    ]);

    const customArticles = getCustomArticles();
    const deletedIds = getDeletedArticleIds();
    const articles = mergeArticles(baseArticles, customArticles, deletedIds);

    return {
        baseArticles,
        articles,
        customArticles,
        deletedIds,
        templates,
        intentPatterns: intents.patterns,
        defaultResponse: intents.defaultResponse || '',
        toneIndicators: intents.toneIndicators,
        synonymsMap: intents.synonyms,
        language,
    };
}
