// تحليل رسائل المستفيدين: تطبيع، استخراج كلمات/كيانات، تحديد نية ونبرة.

import { getCachedMatcher, countDistinctMatches, hasMatch } from './matcher.js';

// سوابق العطف/الجر و«ال» التعريف مقبولة قبل كلمات التصنيف: الكلمات تُكتب مجردة
// في data/intents.json وتَرِد في الرسائل بصيغة «والجلسة» و«بالحكم» ونحوها.
const MATCH_OPTS = { prefix: 'clitic+al' };

export function normalizeArabic(text) {
    return String(text)
        .replace(/[إأآ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/[ً-ْ]/g, '')
        .replace(/ـ/g, '')
        .toLowerCase();
}

export function extractKeywords(normalizedText, synonymsMap) {
    const found = new Set();
    for (const [mainKeyword, synonyms] of Object.entries(synonymsMap)) {
        const matcher = getCachedMatcher(synonyms, normalizeArabic, MATCH_OPTS);
        if (hasMatch(normalizedText, matcher)) found.add(mainKeyword);
    }
    return Array.from(found);
}

export function detectIntent(normalizedText, intentPatterns) {
    const detected = [];
    intentPatterns.forEach(pattern => {
        const matcher = getCachedMatcher(pattern.keywords, normalizeArabic, MATCH_OPTS);
        const matchCount = countDistinctMatches(normalizedText, matcher);
        if (matchCount > 0) {
            detected.push({
                id: pattern.id,
                label: pattern.label,
                boostCategories: pattern.boostCategories || {},
                responseText: pattern.responseText || '',
                score: matchCount * pattern.priority,
                matches: matchCount,
            });
        }
    });
    return detected.sort((a, b) => b.score - a.score).slice(0, 3);
}

// النبرة في JSON بشكلين: مصفوفة كلمات (الشكل القديم) أو كائن { label, priority, words }.
// priority تحسم التعادل بين نبرتين بنفس عدد المطابقات — بدل الاعتماد على ترتيب المفاتيح.
function toneEntry(raw) {
    if (Array.isArray(raw)) return { label: undefined, priority: 0, words: raw };
    return {
        label: typeof raw.label === 'string' ? raw.label : undefined,
        priority: typeof raw.priority === 'number' ? raw.priority : 0,
        words: Array.isArray(raw.words) ? raw.words : [],
    };
}

export function detectTone(normalizedText, toneIndicators) {
    // تُبنى النبرات من مفاتيح JSON نفسها حتى لا تنكسر الدالة عند إضافة نبرة جديدة.
    const scores = {};
    const entries = {};
    for (const [tone, raw] of Object.entries(toneIndicators)) {
        const entry = toneEntry(raw);
        entries[tone] = entry;
        const matcher = getCachedMatcher(entry.words, normalizeArabic, MATCH_OPTS);
        scores[tone] = countDistinctMatches(normalizedText, matcher);
    }
    const isUrgent = (scores.urgent || 0) > 0;
    delete scores.urgent;

    let best = null;
    for (const [tone, score] of Object.entries(scores)) {
        if (score <= 0) continue;
        if (!best || score > best.score
            || (score === best.score && entries[tone].priority > best.priority)) {
            best = { tone, score, priority: entries[tone].priority };
        }
    }
    return {
        primary: best ? best.tone : 'neutral',
        label: best ? entries[best.tone].label : undefined,
        urgent: isUrgent,
        scores,
    };
}

export function extractEntities(originalText) {
    const entities = [];
    const seen = new Set();
    const add = (type, value) => {
        if (seen.has(value)) return;
        seen.add(value);
        entities.push({ type, value });
    };

    // الأنواع الأكثر تحديداً أولاً حتى لا يُصنّف الرقم نفسه مرتين (جوال/هوية ثم رقم طلب).
    (originalText.match(/\b05\d{8}\b/g) || []).forEach(p => add('رقم جوال', p));
    (originalText.match(/\b[12]\d{9}\b/g) || []).forEach(id => add('رقم هوية', id));
    (originalText.match(/\b\d{7,}\b/g) || []).forEach(n => add('رقم طلب/مذكرة', n));
    (originalText.match(/\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b/g) || []).forEach(d => add('تاريخ', d));

    return entities;
}

export function findRelevantArticles(articles, keywords, intents) {
    // الحقول المطبّعة تُحسب مرة واحدة عند التحميل (data.js → withNormalized).
    // البديل هنا للاستدعاءات التي تمرر مواد خاماً (الاختبارات مثلاً).
    const normalizedKeywords = keywords.map(normalizeArabic);

    const scored = articles.map(article => {
        let score = 0;
        const artKeywords = article._normKeywords || (article.keywords || []).map(normalizeArabic);
        const artTitle = article._normTitle ?? normalizeArabic(article.title || '');
        const artText = article._normText ?? normalizeArabic(article.text || '');

        normalizedKeywords.forEach(normalizedKw => {
            artKeywords.forEach(normalizedK => {
                if (normalizedK === normalizedKw) score += 15;
                else if (normalizedK.includes(normalizedKw) || normalizedKw.includes(normalizedK)) score += 10;
            });

            if (artTitle.includes(normalizedKw)) score += 8;
            if (artText.includes(normalizedKw)) score += 3;
        });

        if (intents.length > 0) {
            const boosts = intents[0].boostCategories || {};
            score += boosts[article.category] || 0;
        }

        return { ...article, score };
    });

    return scored
        .filter(a => a.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
}
