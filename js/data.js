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

export function resetCustomArticles() {
    localStorage.removeItem(STORAGE_KEYS.customArticles);
    localStorage.removeItem(STORAGE_KEYS.deletedArticles);
}

function mergeArticles(base, custom, deletedIds) {
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
        toneIndicators: intents.toneIndicators,
        synonymsMap: intents.synonyms,
        language,
    };
}
