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

export function saveCustomArticles(list) {
    localStorage.setItem(STORAGE_KEYS.customArticles, JSON.stringify(list));
}

export function saveDeletedArticleIds(ids) {
    localStorage.setItem(STORAGE_KEYS.deletedArticles, JSON.stringify(ids));
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

export { STORAGE_KEYS };
