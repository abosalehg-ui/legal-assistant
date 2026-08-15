// مُطابقة عبارات عربية بحدود كلمات صحيحة — الوحدة المشتركة بين المحلل ومحسّن الصياغة.
//
// المشكلة التي تحلها: String.includes تطابق داخل الكلمات («هل» داخل «مهله»)،
// وregex لكل كلمة على حدة يعني مئات الكائنات في كل تحليل. هنا تُبنى regex واحدة
// بتبادل مرتب تنازلياً بالطول (الأطول يُجرَّب أولاً لأن التبادل يختار أول بديل يطابق).
//
// بنية المطابقة: (^|[غير حرف عربي])(سوابق اختيارية)(تبادل العبارات)(?=[غير حرف عربي]|$)
// فهارس المجموعات ثابتة: [1] ما قبل الحد، [2] السابقة، [3] العبارة المطابقة.

export const ARABIC_LETTER = '\\u0621-\\u064A';

export function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// المسافة داخل العبارة متعددة الكلمات تُطابق أي فراغ (مسافة مكررة أو سطر جديد):
// رسائل المستفيدين لا تلتزم بمسافة واحدة، والعبارة «لم يتم الرد» يجب أن تصمد أمام ذلك.
function toAlternative(phrase) {
    return escapeRegExp(phrase).replace(/ +/g, '\\s+');
}

// prefix:
//  false        → بلا سوابق (المصطلحات القانونية: المفتاح يبدأ بـ«ال» أصلاً).
//  'clitic'     → ([وفبلك]?) سابقة عطف/جر واحدة (سلوك محسّن الصياغة).
//  'clitic+al'  → سابقة عطف/جر ثم «ال» التعريف اختيارياً (والجلسة، بالحكم، وبالحكم) —
//                 للمحلل حيث الكلمات المفتاحية تُكتب مجردة في JSON.
function prefixGroup(prefix) {
    if (prefix === 'clitic') return '([وفبلك]?)';
    if (prefix === 'clitic+al') return '((?:[وف]?[بلك]?)(?:ال)?)';
    return '()';
}

// تبني RegExp عامة (علم g) من قائمة عبارات، أو null لقائمة فارغة.
// لا backtracking كارثي: التبادل حرفي بالكامل والسوابق محدودة الطول.
export function compileMatcher(phrases, { prefix = false } = {}) {
    const keys = Array.from(phrases).sort((a, b) => b.length - a.length);
    if (keys.length === 0) return null;
    return new RegExp(
        `(^|[^${ARABIC_LETTER}])${prefixGroup(prefix)}(${keys.map(toAlternative).join('|')})(?=[^${ARABIC_LETTER}]|$)`,
        'g',
    );
}

// كم عبارة *مختلفة* من القائمة ظهرت في النص (تكرار العبارة نفسها يُعدّ مرة واحدة —
// نفس دلالة العدّ القديم بـ includes). فراغ العبارة المطابقة يُوحَّد ليطابق مفتاحها الأصلي.
export function countDistinctMatches(text, regex) {
    if (!regex) return 0;
    const seen = new Set();
    for (const m of text.matchAll(regex)) {
        seen.add(m[3].replace(/\s+/g, ' '));
    }
    return seen.size;
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
    const key = String(opts.prefix || false);
    let regex = byOpts.get(key);
    if (regex === undefined) {
        regex = compileMatcher(normalizeFn ? phrases.map(normalizeFn) : phrases, opts);
        byOpts.set(key, regex);
    }
    return regex;
}
