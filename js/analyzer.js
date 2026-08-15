// تحليل رسائل المستفيدين: تطبيع، استخراج كلمات/كيانات، تحديد نية ونبرة.

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
        for (const syn of synonyms) {
            if (normalizedText.includes(normalizeArabic(syn))) {
                found.add(mainKeyword);
                break;
            }
        }
    }
    return Array.from(found);
}

export function detectIntent(normalizedText, intentPatterns) {
    const detected = [];
    intentPatterns.forEach(pattern => {
        let matchCount = 0;
        pattern.keywords.forEach(kw => {
            if (normalizedText.includes(normalizeArabic(kw))) matchCount++;
        });
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

export function detectTone(normalizedText, toneIndicators) {
    // تُبنى النبرات من مفاتيح JSON نفسها حتى لا تنكسر الدالة عند إضافة نبرة جديدة.
    const scores = {};
    for (const [tone, words] of Object.entries(toneIndicators)) {
        scores[tone] = 0;
        words.forEach(w => {
            if (normalizedText.includes(normalizeArabic(w))) scores[tone]++;
        });
    }
    const isUrgent = (scores.urgent || 0) > 0;
    delete scores.urgent;
    const entries = Object.entries(scores);
    const dominant = entries.length
        ? entries.reduce((a, b) => (b[1] > a[1] ? b : a))
        : ['neutral', 0];
    return {
        primary: dominant[1] > 0 ? dominant[0] : 'neutral',
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
