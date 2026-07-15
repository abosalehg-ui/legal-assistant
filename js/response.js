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

export function improveLanguage(input, language) {
    let improved = input;

    const sortedColloquial = Object.entries(language.colloquialToFormal).sort((a, b) => b[0].length - a[0].length);
    sortedColloquial.forEach(([colloquial, formal]) => {
        const regex = new RegExp('(^|[^\\u0621-\\u064A])([وفبلك]?)' + escapeRegExp(colloquial) + '(?=[^\\u0621-\\u064A]|$)', 'g');
        improved = improved.replace(regex, '$1$2' + formal);
    });

    Object.entries(language.legalTerms).forEach(([term, legal]) => {
        const regex = new RegExp('(^|[^\\u0621-\\u064A])' + escapeRegExp(term) + '(?=[^\\u0621-\\u064A]|$)', 'g');
        improved = improved.replace(regex, '$1' + legal);
    });

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
