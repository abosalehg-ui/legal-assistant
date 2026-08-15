// توليد الرد المقترح وتحسين الصياغة.

export function suggestResponse(message, articles, intents, entities, language, defaultResponse = '') {
    let response = language.openings[0] + '\n\n';

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

    response += language.closings[0];
    return response;
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ARABIC_LETTER = '\\u0621-\\u064A';

// تعبير واحد بتبادل بدل تعبير لكل مدخل. فائدتان:
//  1) تمريرة واحدة على النص، فلا يمكن لمخرج استبدال مبكر أن يطابقه مفتاح لاحق (تسلسل).
//  2) التعبيرات تُبنى مرة واحدة لكل قاموس بدل ~359 كائن RegExp في كل نقرة.
// الترتيب تنازلياً بالطول ضروري: التبادل يختار أول بديل يطابق، فالأطول يجب أن يُجرَّب أولاً.
function buildMatcher(map, withPrefix) {
    const keys = Object.keys(map).sort((a, b) => b.length - a.length);
    if (keys.length === 0) return null;
    const prefix = withPrefix ? '([وفبلك]?)' : '()';
    return new RegExp(
        `(^|[^${ARABIC_LETTER}])${prefix}(${keys.map(escapeRegExp).join('|')})(?=[^${ARABIC_LETTER}]|$)`,
        'g',
    );
}

const matcherCache = new WeakMap();

function getMatchers(language) {
    let matchers = matcherCache.get(language);
    if (!matchers) {
        matchers = {
            colloquial: buildMatcher(language.colloquialToFormal, true),
            legalTerms: buildMatcher(language.legalTerms, false),
        };
        matcherCache.set(language, matchers);
    }
    return matchers;
}

export function improveLanguage(input, language) {
    let improved = input;
    const { colloquial, legalTerms } = getMatchers(language);

    // دالة استبدال بدل سلسلة '$1$2': تمنع تفسير أي '$' داخل النص الفصيح كمرجع مجموعة.
    if (colloquial) {
        improved = improved.replace(colloquial, (match, before, wordPrefix, word) =>
            before + wordPrefix + language.colloquialToFormal[word]);
    }

    if (legalTerms) {
        improved = improved.replace(legalTerms, (match, before, wordPrefix, word) =>
            before + language.legalTerms[word]);
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
