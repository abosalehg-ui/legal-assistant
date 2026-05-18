// توليد الرد المقترح وتحسين الصياغة.

export function suggestResponse(message, articles, intents, entities, language) {
    let response = language.openings[0] + '\n\n';

    if (intents.length > 0) {
        const topIntent = intents[0].intent;
        if (topIntent.includes('موعد')) {
            response += 'بخصوص استفساركم عن موعد الجلسة، نفيدكم بأنه يمكنكم الاطلاع على تفاصيل الموعد المحدد من خلال البوابة الإلكترونية، أو بالتواصل مع إدارة المحكمة المختصة.';
        } else if (topIntent.includes('إغلاق')) {
            response += 'بخصوص اعتراضكم على إغلاق الطلب، نفيدكم بأنه قد تم الاطلاع على ما ورد، وسيجري مراجعة الإجراء المتخذ وفقاً للأنظمة المعمول بها، وسيتم الرد عليكم بنتيجة المراجعة.';
        } else if (topIntent.includes('تأخر الرد')) {
            response += 'نعتذر عن أي تأخير قد يكون حصل، ونفيدكم بأنه جارٍ متابعة طلبكم، وسيتم الرد عليكم بما يستجد في أقرب وقت بإذن الله.';
        } else if (topIntent.includes('تبليغ')) {
            response += 'بخصوص التبليغ، نفيدكم بأن إجراءات التبليغ تتم وفقاً لما نصت عليه اللوائح التنفيذية لنظام المرافعات الشرعية، ويمكنكم مراجعة حالة التبليغ عبر البوابة الإلكترونية.';
        } else if (topIntent.includes('استئناف')) {
            response += 'بخصوص استفساركم عن الاستئناف، نفيدكم بأن مدة الاستئناف تبدأ من تاريخ استلامكم صورة الحكم، وتقدم مذكرة الاعتراض عبر القنوات النظامية.';
        } else if (topIntent.includes('أحوال شخصية')) {
            response += 'بخصوص طلبكم المتعلق بالأحوال الشخصية، نفيدكم بأنه يتم النظر في هذا النوع من الدعاوى وفقاً لأحكام نظام المرافعات الشرعية ولوائحه التنفيذية.';
        } else if (topIntent.includes('متابعة مذكرة')) {
            response += 'بخصوص متابعة مذكرتكم المشار إليها، نفيدكم بأنه جارٍ العمل على مراجعة ما ورد، وسيتم إشعاركم بالمستجدات عبر القنوات المعتمدة.';
        } else {
            response += 'بخصوص طلبكم المشار إليه، نفيدكم بأنه جارٍ العمل على معالجته وفقاً للإجراءات النظامية المتبعة.';
        }
    } else {
        response += 'بخصوص طلبكم المشار إليه، نفيدكم بأنه جارٍ العمل على معالجته وفقاً للإجراءات النظامية المتبعة.';
    }

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

export function improveLanguage(input, language) {
    let improved = input;

    const sortedColloquial = Object.entries(language.colloquialToFormal).sort((a, b) => b[0].length - a[0].length);
    sortedColloquial.forEach(([colloquial, formal]) => {
        const escaped = colloquial.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp('(^|[^\\u0621-\\u064A])([وفبلك]?)' + escaped + '(?=[^\\u0621-\\u064A]|$)', 'g');
        improved = improved.replace(regex, '$1$2' + formal);
    });

    Object.entries(language.legalTerms).forEach(([term, legal]) => {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp('(^|[^\\u0621-\\u064A])' + escaped + '(?=[^\\u0621-\\u064A]|$)', 'g');
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
