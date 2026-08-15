// تحليل رسائل المستفيدين: تطبيع، استخراج كلمات/كيانات، تحديد نية ونبرة.

import { getCachedMatcher, getPhraseMatcher, collectMatches, hasMatch } from './matcher.js';

// سوابق العطف/الجر و«ال» التعريف مقبولة قبل كلمات التصنيف، واللواحق المتصلة كذلك:
// الكلمات تُكتب مجردة في data/intents.json وتَرِد في الرسائل بصيغة «والجلسة» و«بالحكم»
// و«طلبكم» و«قضيتهم». هذا الخيار هو الفرق بين قائمة كلمات تُكتب مرة وقائمة تُطارَد بلا نهاية.
const MATCH_OPTS = { prefix: 'clitic+al', suffix: true };

// الأرقام العربية والفارسية تُردّ إلى اللاتينية: المستفيد يكتب «طلب رقم ٤٥٢١٩٨٧»
// والمستخرِج يبحث عن \d — بلا هذا التطبيع يضيع رقم الطلب من كل رسالة مكتوبة بلوحة عربية.
const EASTERN_DIGITS = /[٠-٩۰-۹]/g;

function toLatinDigits(text) {
    return text.replace(EASTERN_DIGITS, d => {
        const code = d.charCodeAt(0);
        return String((code >= 0x06F0 ? code - 0x06F0 : code - 0x0660));
    });
}

export function normalizeArabic(text) {
    return toLatinDigits(String(text))
        .replace(/[إأآٱ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        // التشكيل والهمزات الفوقية والألف الخنجرية وعلامات الاتجاه الصفرية العرض
        .replace(/[\u064B-\u0655\u0670\u200B-\u200F\u061C]/g, '')
        .replace(/ـ/g, '')
        // المدّ التعبيري: «متىىىى» و«ضرووووري» شائعان في رسائل الشكوى — يُردّان للأصل.
        // ثلاثة فأكثر فقط: العربية تعرف تكرار حرفين (مثل «الله») ولا تعرف ثلاثة.
        .replace(/([ء-ي])\1{2,}/g, '$1')
        .toLowerCase();
}

// الكلمات المطبَّعة تُحسب مرة واحدة لكل مصفوفة بيانات (هوية المصفوفة ثابتة طوال الجلسة)
// وتُستخدم لردّ الصيغة المصرّفة إلى مفتاحها المجرد عند العدّ.
const normalizedKeysCache = new WeakMap();

function normalizedKeys(phrases) {
    let keys = normalizedKeysCache.get(phrases);
    if (!keys) {
        keys = phrases.map(normalizeArabic);
        normalizedKeysCache.set(phrases, keys);
    }
    return keys;
}

export function extractKeywords(normalizedText, synonymsMap) {
    const found = new Set();
    for (const [mainKeyword, synonyms] of Object.entries(synonymsMap)) {
        const matcher = getCachedMatcher(synonyms, normalizeArabic, MATCH_OPTS);
        if (hasMatch(normalizedText, matcher)) found.add(mainKeyword);
    }
    return Array.from(found);
}

// العبارة المركّبة أدلّ من الكلمة المفردة: «موعد الجلسة» تحسم النية، بينما «جلسة»
// وحدها تَرِد في نصف الرسائل. فيُوزن كل تطابق بعدد كلماته بدل عدّه واحداً كسابقه.
function matchWeight(phrase) {
    return 1 + 0.5 * (phrase.trim().split(/\s+/).length - 1);
}

export function detectIntent(normalizedText, intentPatterns) {
    const detected = [];
    intentPatterns.forEach(pattern => {
        const matcher = getCachedMatcher(pattern.keywords, normalizeArabic, MATCH_OPTS);
        const matched = collectMatches(normalizedText, matcher, normalizedKeys(pattern.keywords));
        if (matched.size === 0) return;
        let weight = 0;
        matched.forEach(phrase => { weight += matchWeight(phrase); });
        detected.push({
            id: pattern.id,
            label: pattern.label,
            boostCategories: pattern.boostCategories || {},
            responseText: pattern.responseText || '',
            score: weight * pattern.priority,
            matches: matched.size,
            // العبارات التي أدّت للتصنيف — تُعرض للموظف ليحكم بنفسه على صحة التصنيف
            // بدل أن يواجه تصنيفاً بلا تفسير فيفقد الثقة بالأداة.
            matchedTerms: Array.from(matched),
        });
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
    const terms = {};
    for (const [tone, raw] of Object.entries(toneIndicators)) {
        const entry = toneEntry(raw);
        entries[tone] = entry;
        const matcher = getCachedMatcher(entry.words, normalizeArabic, MATCH_OPTS);
        const matched = collectMatches(normalizedText, matcher, normalizedKeys(entry.words));
        scores[tone] = matched.size;
        terms[tone] = Array.from(matched);
    }
    const isUrgent = (scores.urgent || 0) > 0;
    const urgentTerms = terms.urgent || [];
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
        matchedTerms: best ? terms[best.tone] : [],
        urgentTerms,
    };
}

// أنماط الأرقام تُطبَّق على النص بعد ردّ الأرقام الشرقية إلى اللاتينية، وتقبل الفواصل
// التي يكتبها الناس داخل الأرقام (مسافة أو شرطة في رقم الجوال مثلاً).
const SEPARATORS = /[\s\u00A0-]/g;
const PHONE_PATTERNS = [
    /(?:\+|00)?966[\s-]?5\d(?:[\s-]?\d){7}/g,
    /\b05(?:[\s-]?\d){8}\b/g,
];
// رقم بعد كلمة دالة يُلتقط ولو كان قصيراً: «طلب رقم 45219» لا يبلغ سبع خانات
// لكنه رقم مرجعي بلا شك، وهو أكثر ما يُلصق في رسائل المستفيدين.
const REF_CONTEXT = /(?:رقم|برقم|طلب|معامله|معاملة|قضيه|قضية|دعوى|مذكره|مذكرة|صك|ملف|بلاغ|شكوى)\s*(?:[:#]|رقم\s*)?\s*(\d{4,})/g;

export function extractEntities(originalText) {
    const text = toLatinDigits(String(originalText));
    const entities = [];
    const seen = new Set();
    const add = (type, value) => {
        const clean = String(value).trim();
        if (!clean || seen.has(clean)) return;
        seen.add(clean);
        entities.push({ type, value: clean });
    };

    // الأنواع الأكثر تحديداً أولاً حتى لا يُصنّف الرقم نفسه مرتين (جوال/هوية ثم رقم طلب).
    // الفواصل وبادئة الاتصال الدولي تُحذف حتى يخرج الرقم بصيغة واحدة مهما كُتب:
    // «+966 51 234 5678» و«00966512345678» رقم واحد لا رقمان.
    PHONE_PATTERNS.forEach(pattern => {
        (text.match(pattern) || []).forEach(raw => {
            add('رقم جوال', raw.replace(SEPARATORS, '').replace(/^(?:\+|00)/, ''));
        });
    });
    (text.match(/\b[12]\d{9}\b/g) || []).forEach(id => add('رقم هوية', id));
    for (const m of text.matchAll(REF_CONTEXT)) {
        add('رقم طلب/مذكرة', m[1]);
    }
    (text.match(/\b\d{7,}\b/g) || []).forEach(n => add('رقم طلب/مذكرة', n));
    (text.match(/\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b/g) || []).forEach(d => add('تاريخ', d));

    return entities;
}

// درجات الصلة: تطابق تام مع كلمة المادة أوثق من ورودها في العنوان، والعنوان أوثق من المتن.
const SCORE_EXACT_KEYWORD = 15;
const SCORE_KEYWORD_HIT = 10;
const SCORE_TITLE_HIT = 8;
const SCORE_TEXT_HIT = 3;

export function findRelevantArticles(articles, keywords, intents) {
    // الحقول المطبّعة تُحسب مرة واحدة عند التحميل (data.js → withNormalized).
    // البديل هنا للاستدعاءات التي تمرر مواد خاماً (الاختبارات مثلاً).
    const normalizedKeywords = keywords.map(normalizeArabic);
    // مطابقة بحدود الكلمات بدل includes: «حكم» كانت تطابق داخل «محكمة» فتُرجّح
    // كل مادة فيها ذكر للمحكمة — أي كل المواد تقريباً — فيغرق الترتيب في الضجيج.
    const matchers = keywords.map(kw => getPhraseMatcher(kw, { ...MATCH_OPTS, normalize: normalizeArabic }));

    const scored = articles.map(article => {
        let score = 0;
        const artKeywords = article._normKeywords || (article.keywords || []).map(normalizeArabic);
        const artTitle = article._normTitle ?? normalizeArabic(article.title || '');
        const artText = article._normText ?? normalizeArabic(article.text || '');

        normalizedKeywords.forEach((normalizedKw, i) => {
            const matcher = matchers[i];
            artKeywords.forEach(normalizedK => {
                if (normalizedK === normalizedKw) score += SCORE_EXACT_KEYWORD;
                else if (hasMatch(normalizedK, matcher)) score += SCORE_KEYWORD_HIT;
            });

            if (hasMatch(artTitle, matcher)) score += SCORE_TITLE_HIT;
            if (hasMatch(artText, matcher)) score += SCORE_TEXT_HIT;
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
