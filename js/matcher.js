// مُطابقة عبارات عربية بحدود كلمات صحيحة — الوحدة المشتركة بين المحلل ومحسّن الصياغة.
//
// المشكلة التي تحلها: String.includes تطابق داخل الكلمات («هل» داخل «مهله»، و«حكم»
// داخل «محكمه»)، وregex لكل كلمة على حدة يعني مئات الكائنات في كل تحليل. هنا تُبنى
// regex واحدة بتبادل مرتب تنازلياً بالطول (الأطول يُجرَّب أولاً لأن التبادل يختار أول
// بديل يطابق).
//
// بنية المطابقة: (^|[غير حرف عربي])(سوابق اختيارية)(تبادل العبارات)(لواحق اختيارية)(?=[غير حرف عربي]|$)
// فهارس المجموعات ثابتة: [1] ما قبل الحد، [2] السابقة، [3] العبارة المطابقة، [4] اللاحقة.

export const ARABIC_LETTER = '\\u0621-\\u064A';

export function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// اللواحق المتصلة: ضمائر الملكية/المفعول وعلامات الجمع والمثنى. المرتبة تنازلياً
// بالطول لأن التبادل يختار أول بديل يطابق («كم» قبل «ك» وإلا بقيت الميم بلا مطابقة).
// تُكرَّر حتى مرتين لتغطية التركيب الشائع: جمع + ضمير («طلباتكم» = طلب + ات + كم).
const SUFFIXES = ['كما', 'هما', 'تين', 'تان', 'كم', 'كن', 'هم', 'هن', 'نا', 'ها', 'ات', 'ين', 'ون', 'ان', 'ي', 'ك', 'ه'];

// المسافة داخل العبارة متعددة الكلمات تُطابق أي فراغ (مسافة مكررة أو سطر جديد):
// رسائل المستفيدين لا تلتزم بمسافة واحدة، والعبارة «لم يتم الرد» يجب أن تصمد أمام ذلك.
//
// inflect: التاء المربوطة (المطبَّعة إلى «ه») تنقلب في التصريف إلى «ت» عند الإضافة
// وإلى «ات» في الجمع: جلسة ← جلستي، جلسات، جلساتهم. فتُستبدل الهاء الأخيرة بتبادل
// يغطي الثلاثة، ثم تتكفّل مجموعة اللواحق بالضمير الذي يليها.
//
// القرار يُتخذ من العبارة الخام قبل التطبيع لا بعده: التطبيع يوحّد «ة» و«ه» في حرف
// واحد، فلو حُكم بعده لانقلبت كل كلمة تنتهي بهاء أصلية إلى تاء — و«ليه» صارت تطابق
// «ليت»، و«فيه» تطابق «فيت». الهاء الأصلية لا تتصرّف، والتاء المربوطة وحدها تتصرّف.
function toAlternative(key, inflect) {
    const body = escapeRegExp(key).replace(/ +/g, '\\s+');
    if (inflect && key.length > 2 && key.endsWith('ه')) {
        return body.slice(0, -1) + '(?:ه|ات|ت)';
    }
    return body;
}

// prefix:
//  false        → بلا سوابق (المصطلحات القانونية: المفتاح يبدأ بـ«ال» أصلاً).
//  'clitic'     → ([وفبلك]?) سابقة عطف/جر واحدة (سلوك محسّن الصياغة).
//  'clitic+al'  → سابقة عطف/جر ثم «ال» التعريف اختيارياً (والجلسة، بالحكم، وبالحكم،
//                 وكذلك «لل» حيث تُدغم ألف التعريف بعد لام الجر: للمحكمة = ل + المحكمة) —
//                 للمحلل حيث الكلمات المفتاحية تُكتب مجردة في JSON.
function prefixGroup(prefix) {
    if (prefix === 'clitic') return '([وفبلك]?)';
    if (prefix === 'clitic+al') return '((?:[وف]?(?:[بك](?:ال)?|ل(?:ال|ل)?|ال)?))';
    return '()';
}

// suffix: تفعيل اللواحق يوسّع الاستدعاء (recall) كثيراً — «طلبكم» و«قضيتهم» و«جلساتنا»
// تُطابق مفاتيحها المجردة — لكنه غير مقبول في محسّن الصياغة: هناك تُستبدل العبارة
// المطابقة بمقابلها الفصيح من القاموس، واللاحقة تجعل الاستبدال يبتلع حرفاً ليس منه.
// لذلك الخيار معطّل افتراضياً ويُفعَّل في المحلل وحده.
// normalize: دالة التطبيع تُمرَّر إلى هنا بدل تطبيق النتيجة مسبقاً، لأن بناء التبادل
// يحتاج العبارة الخام والمطبَّعة معاً (انظر toAlternative).
export function compileMatcher(phrases, { prefix = false, suffix = false, normalize = null } = {}) {
    const entries = Array.from(phrases, raw => ({ raw, key: normalize ? normalize(raw) : raw }));
    if (entries.length === 0) return null;
    entries.sort((a, b) => b.key.length - a.key.length);
    const alternatives = entries
        .map(e => toAlternative(e.key, suffix && e.raw.endsWith('ة')))
        .join('|');
    const suffixes = suffix ? `((?:${SUFFIXES.join('|')}){0,2})` : '()';
    return new RegExp(
        `(^|[^${ARABIC_LETTER}])${prefixGroup(prefix)}(${alternatives})${suffixes}(?=[^${ARABIC_LETTER}]|$)`,
        'g',
    );
}

// مجموعة العبارات *المختلفة* من القائمة التي ظهرت في النص (تكرار العبارة نفسها يُعدّ
// مرة واحدة). فراغ العبارة المطابقة يُوحَّد ليطابق مفتاحها الأصلي، والصيغة المصرّفة
// تُردّ إلى المفتاح المجرد («جلسات» ← «جلسه») حتى لا تُحسب صيغتان لكلمة واحدة مرتين.
export function collectMatches(text, regex, keys) {
    const seen = new Set();
    if (!regex) return seen;
    const lookup = keys ? new Set(keys) : null;
    for (const m of text.matchAll(regex)) {
        const matched = m[3].replace(/\s+/g, ' ');
        seen.add(lookup ? canonicalKey(matched, lookup) : matched);
    }
    return seen;
}

// «جلسات» و«جلست» ليستا مفتاحين في البيانات — المفتاح «جلسه». تُجرَّب الصيغ الثلاث
// للتاء المربوطة فقط، فأي تصريف آخر يعود بالنص كما هو.
function canonicalKey(matched, lookup) {
    if (lookup.has(matched)) return matched;
    for (const tail of ['ات', 'ت']) {
        if (matched.endsWith(tail)) {
            const candidate = matched.slice(0, -tail.length) + 'ه';
            if (lookup.has(candidate)) return candidate;
        }
    }
    return matched;
}

export function countDistinctMatches(text, regex, keys) {
    return collectMatches(text, regex, keys).size;
}

export function hasMatch(text, regex) {
    if (!regex) return false;
    regex.lastIndex = 0;
    return regex.test(text);
}

// كاش بهوية مصفوفة العبارات نفسها: يعمل لأن loadData() تنتج كائنات جديدة مرة واحدة
// لكل جلسة، والاختبارات تبني fixture لكل اختبار. العقد على المستدعي: لا تمرر نسخة
// جديدة ([...arr]) في كل استدعاء وإلا أُعيدت الترجمة صامتاً في كل مرة.
const matcherCache = new WeakMap();

export function getCachedMatcher(phrases, normalizeFn, opts = {}) {
    if (!Array.isArray(phrases) || phrases.length === 0) return null;
    let byOpts = matcherCache.get(phrases);
    if (!byOpts) {
        byOpts = new Map();
        matcherCache.set(phrases, byOpts);
    }
    const key = `${opts.prefix || false}|${opts.suffix || false}`;
    let regex = byOpts.get(key);
    if (regex === undefined) {
        regex = compileMatcher(phrases, { ...opts, normalize: normalizeFn });
        byOpts.set(key, regex);
    }
    return regex;
}

// كاش لعبارة واحدة (البحث عن كلمة مفتاحية داخل نصوص المواد): المفتاح هو نص العبارة
// نفسه لا هوية المصفوفة، لأن المستدعي يبني قائمة كلمات جديدة في كل تحليل.
const singleCache = new Map();
const SINGLE_CACHE_LIMIT = 500;

export function getPhraseMatcher(phrase, opts = {}) {
    if (!phrase) return null;
    const key = `${opts.prefix || false}|${opts.suffix || false}|${phrase}`;
    let regex = singleCache.get(key);
    if (regex === undefined) {
        // حدّ بسيط يمنع نمو الكاش بلا سقف في جلسة طويلة؛ الكلمات المتكررة تُعاد سريعاً.
        if (singleCache.size >= SINGLE_CACHE_LIMIT) singleCache.clear();
        regex = compileMatcher([phrase], opts);
        singleCache.set(key, regex);
    }
    return regex;
}
