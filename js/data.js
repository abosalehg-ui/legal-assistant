// تحميل ملفات JSON والتحقق النوعي للمواد وتجهيزها للبحث.

import { normalizeArabic } from './analyzer.js';

async function fetchJson(path) {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`فشل تحميل ${path}`);
    return response.json();
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

// تحقق نوعي موحد للمادة (النموذج والاستيراد والتخزين): يعيد { article, error }.
// error: 'invalid' (ليس كائناً) | 'missing' (حقل أساسي فارغ) | 'unsafe-url'.
// strictUrl: النموذج يرفض الرابط غير الآمن ليُصلحه الموظف، بينما الاستيراد يجرّده
// بصمت ويقبل المادة — ملف كامل لا يُرفض بسبب رابط واحد.
export function checkArticle(raw, { strictUrl = false } = {}) {
    if (!raw || typeof raw !== 'object') return { article: null, error: 'invalid' };

    const asText = v => (typeof v === 'string' ? v.trim() : '');
    const id = asText(raw.id);
    const number = asText(raw.number);
    const title = asText(raw.title);
    const category = asText(raw.category);
    const text = asText(raw.text);
    if (!id || !number || !title || !category || !text) return { article: null, error: 'missing' };

    const keywords = Array.isArray(raw.keywords) ? raw.keywords.map(asText).filter(Boolean) : [];
    const rawUrl = asText(raw.sourceUrl);
    if (rawUrl && !isSafeUrl(rawUrl) && strictUrl) return { article: null, error: 'unsafe-url' };
    const sourceUrl = isSafeUrl(rawUrl) ? rawUrl : '';

    const article = { id, number, title, category, keywords, sourceUrl, text };
    const lastVerified = asText(raw.lastVerified);
    if (lastVerified) article.lastVerified = lastVerified;
    return { article, error: null };
}

// الصيغة المختصرة: نسخة نظيفة أو null.
export function validateArticle(raw) {
    return checkArticle(raw).article;
}

// نسخة نظيفة للتصدير: بلا الحقول الداخلية المطبّعة (_norm*) ولا درجة التطابق،
// حتى يبقى الملف المصدَّر مطابقاً لبنية data/articles.json الأصلية.
export function toPlainArticle(article) {
    const plain = {
        id: article.id,
        number: article.number,
        title: article.title,
        category: article.category,
        keywords: article.keywords || [],
        sourceUrl: article.sourceUrl || '',
        text: article.text,
    };
    if (article.lastVerified) plain.lastVerified = article.lastVerified;
    return plain;
}

// تُحسب الحقول المطبّعة مرة واحدة عند التحميل بدل إعادة حسابها لكل كلمة مفتاحية في كل بحث.
// كانت findRelevantArticles تطبّع نص كل مادة كاملاً مرة لكل كلمة مفتاحية (~880 عملية للتحليل الواحد).
export function withNormalized(articles) {
    return articles.map(article => ({
        ...article,
        _normTitle: normalizeArabic(article.title || ''),
        _normText: normalizeArabic(article.text || ''),
        _normNumber: normalizeArabic(article.number || ''),
        _normKeywords: (article.keywords || []).map(normalizeArabic),
    }));
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

    return {
        baseArticles,
        templates,
        intentPatterns: intents.patterns,
        defaultResponse: intents.defaultResponse || '',
        toneIndicators: intents.toneIndicators,
        synonymsMap: intents.synonyms,
        language,
    };
}
