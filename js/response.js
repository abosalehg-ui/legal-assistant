// توليد الرد المقترح وتحسين الصياغة.

import { compileMatcher } from './matcher.js';

export function suggestResponse(message, articles, intents, entities, language, defaultResponse = '', tone = null) {
    let response = language.openings[0] + '\n\n';

    // النبرة تُكيّف الرد من البيانات لا من الكود: فقرة اعتذارية للشكوى مثلاً
    // (data/colloquial-map.json ← toneOpenings). غياب الحقل أو النبرة = لا تغيير.
    const toneOpening = tone && language.toneOpenings && language.toneOpenings[tone.primary];
    if (toneOpening) {
        response += toneOpening + '\n\n';
    }

    // نص الرد يأتي من بيانات النية نفسها (data/intents.json) لا من الكود.
    const topIntent = intents[0];
    response += (topIntent && topIntent.responseText) || defaultResponse;

    const requestRefs = entities.filter(e => e.type === 'رقم طلب/مذكرة');
    if (requestRefs.length > 0) {
        response += '\n\n(المرجع: ' + requestRefs.map(r => r.value).join('، ') + ')';
    }

    if (articles.length > 0) {
        response += '\n\n📚 السند النظامي:\n';
        articles.slice(0, 3).forEach(article => {
            response += '\n• ' + article.number + ': ' + article.title;
        });
    }

    if (tone && tone.urgent && language.urgentNote) {
        response += '\n\n' + language.urgentNote;
    }

    response += language.closings[0];
    return response;
}

// تعبير واحد بتبادل (compileMatcher من matcher.js) بدل تعبير لكل مدخل. فائدتان:
//  1) تمريرة واحدة على النص، فلا يمكن لمخرج استبدال مبكر أن يطابقه مفتاح لاحق (تسلسل).
//  2) التعبيرات تُبنى مرة واحدة لكل قاموس بدل ~359 كائن RegExp في كل نقرة.
// الكاش هنا بمفتاح كائن اللغة نفسه (مفاتيح القواميس تُستخرج جديدة في كل استدعاء
// فلا يصلح كاش matcher.js المبني على هوية المصفوفة).
const matcherCache = new WeakMap();

function getMatchers(language) {
    let matchers = matcherCache.get(language);
    if (!matchers) {
        matchers = {
            colloquial: compileMatcher(Object.keys(language.colloquialToFormal), { prefix: 'clitic' }),
            legalTerms: compileMatcher(Object.keys(language.legalTerms)),
        };
        matcherCache.set(language, matchers);
    }
    return matchers;
}

// العبارة المطابقة قد تحمل فراغاً غير قياسي (مسافة مكررة) — توحيده يعيدها لمفتاح القاموس.
function toMapKey(word) {
    return word.replace(/\s+/g, ' ');
}

export function improveLanguage(input, language) {
    let improved = input;
    const { colloquial, legalTerms } = getMatchers(language);

    // دالة استبدال بدل سلسلة '$1$2': تمنع تفسير أي '$' داخل النص الفصيح كمرجع مجموعة.
    if (colloquial) {
        improved = improved.replace(colloquial, (match, before, wordPrefix, word) =>
            before + wordPrefix + language.colloquialToFormal[toMapKey(word)]);
    }

    if (legalTerms) {
        improved = improved.replace(legalTerms, (match, before, wordPrefix, word) =>
            before + language.legalTerms[toMapKey(word)]);
    }

    if (!improved.includes('السلام عليكم')) {
        improved = language.openings[0] + '\n\n' + improved;
    }
    if (!improved.includes('التقدير') && !improved.includes('التحية') && !improved.includes('الاحترام')) {
        improved += language.closings[0];
    }
    return improved;
}

export async function copyToClipboard(text) {
    if (!text.trim()) throw new Error('empty');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    throw new Error('unsupported');
}

export function fallbackCopy(textareaEl) {
    textareaEl.select();
    return document.execCommand('copy');
}
