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
                intent: pattern.intent,
                score: matchCount * pattern.priority,
                matches: matchCount,
            });
        }
    });
    return detected.sort((a, b) => b.score - a.score).slice(0, 3);
}

export function detectTone(normalizedText, toneIndicators) {
    const scores = { complaint: 0, inquiry: 0, request: 0, urgent: 0 };
    for (const [tone, words] of Object.entries(toneIndicators)) {
        words.forEach(w => {
            if (normalizedText.includes(normalizeArabic(w))) scores[tone]++;
        });
    }
    const isUrgent = scores.urgent > 0;
    delete scores.urgent;
    const dominant = Object.entries(scores).reduce((a, b) => (b[1] > a[1] ? b : a));
    return {
        primary: dominant[1] > 0 ? dominant[0] : 'neutral',
        urgent: isUrgent,
        scores,
    };
}

export function extractEntities(originalText) {
    const entities = [];

    const requestNumbers = originalText.match(/\b\d{7,}\b/g);
    if (requestNumbers) requestNumbers.forEach(n => entities.push({ type: 'رقم طلب/مذكرة', value: n }));

    const dates = originalText.match(/\b\d{1,4}[\/\-]\d{1,2}[\/\-]\d{1,4}\b/g);
    if (dates) dates.forEach(d => entities.push({ type: 'تاريخ', value: d }));

    const phones = originalText.match(/\b05\d{8}\b/g);
    if (phones) phones.forEach(p => entities.push({ type: 'رقم جوال', value: p }));

    const ids = originalText.match(/\b[12]\d{9}\b/g);
    if (ids) {
        ids.forEach(id => {
            if (!entities.find(e => e.value === id)) entities.push({ type: 'رقم هوية', value: id });
        });
    }
    return entities;
}

export function findRelevantArticles(articles, keywords, intents) {
    const scored = articles.map(article => {
        let score = 0;

        keywords.forEach(keyword => {
            const normalizedKw = normalizeArabic(keyword);

            article.keywords.forEach(k => {
                const normalizedK = normalizeArabic(k);
                if (normalizedK === normalizedKw) score += 15;
                else if (normalizedK.includes(normalizedKw) || normalizedKw.includes(normalizedK)) score += 10;
            });

            if (normalizeArabic(article.title).includes(normalizedKw)) score += 8;
            if (normalizeArabic(article.text).includes(normalizedKw)) score += 3;
        });

        if (intents.length > 0) {
            const topIntent = intents[0].intent;
            if (topIntent.includes('موعد') && article.category === 'الجلسات') score += 20;
            if (topIntent.includes('موعد') && article.category === 'المواعيد') score += 15;
            if (topIntent.includes('إغلاق') && article.category === 'الاعتراض') score += 15;
            if (topIntent.includes('استئناف') && article.category === 'الاعتراض') score += 20;
            if (topIntent.includes('تبليغ') && article.category === 'التبليغ') score += 20;
            if (topIntent.includes('أحوال شخصية') && article.category === 'الأحوال الشخصية') score += 20;
            if (topIntent.includes('ورثة') && article.category === 'حصر الورثة') score += 20;
        }

        return { ...article, score };
    });

    return scored
        .filter(a => a.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
}
