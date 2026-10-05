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
const SUFFIXES = [
    'كما',
    'هما',
    'تين',
    'تان',
    'كم',
    'كن',
    'هم',
    'هن',
    'نا',
    'ها',
    'ات',
    'ين',
    'ون',
    'ان',
    'ي',
    'ك',
    'ه',
];

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
function toAlternative(key, inflect, innerArticle) {
    const words = key.split(/ +/).map(escapeRegExp);
    if (innerArticle) {
        for (let i = 1; i < words.length; i++) words[i] = withOptionalArticle(words[i]);
    }
    const body = words.join('\\s+');
    if (inflect && key.length > 2 && key.endsWith('ه')) {
        return body.slice(0, -1) + '(?:ه|ات|ت)';
    }
    return body;
}

// innerArticle: «ال» التعريف اختيارية على كل كلمة بعد الأولى في العبارة متعددة الكلمات.
// سابقة الكلمة الأولى تتكفّل بها prefixGroup، أما ما بعدها فكان يُطابَق حرفياً: المفتاح
// «موعد جلسة» لا يطابق «متى موعد الجلسة» — أشيع صيغة للسؤال — فتسقط الرسالة بلا تصنيف.
// الحكم متماثل: «تاريخ الجلسة» في البيانات تطابق «تاريخ جلسة» في الرسالة كذلك.
// كلمتان من حرفين أو أقل («عن»، «في») تُترك كما هي: لا تعريف عليها، والتبادل يضيف ضجيجاً.
function withOptionalArticle(word) {
    const stem = word.startsWith('ال') && word.length > 4 ? word.slice(2) : word;
    if (stem.length <= 2) return word;
    return `(?:ال)?${stem}`;
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
export function compileMatcher(
    phrases,
    { prefix = false, suffix = false, innerArticle = false, normalize = null } = {},
) {
    const entries = Array.from(phrases, raw => ({ raw, key: normalize ? normalize(raw) : raw }));
    if (entries.length === 0) return null;
    entries.sort((a, b) => b.key.length - a.key.length);
    const alternatives = entries
        .map(e => toAlternative(e.key, suffix && e.raw.endsWith('ة'), innerArticle))
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
//
// المطابقات متداخلة: يُبحث عن أطول عبارة تبدأ عند *كل* كلمة، لا عن مطابقات منفصلة فقط.
// matchAll يستهلك ما طابقه، ففي «كم رسوم رفع الدعوى» تأكل «كم رسوم» كلمة «رسوم» فلا تجد
// العبارة الأدق «رسوم رفع الدعوى» بدايتها، ويتعادل موضوع الرسوم مع «رفع دعوى». بعد كل
// مطابقة يُستأنف البحث من الحرف التالي لبداية الكلمة المطابقة؛ وحد الكلمة في أول التعبير
// يضمن أن المطابقة التالية تبدأ عند الكلمة التالية لا في وسط كلمة.
export function collectMatches(text, regex, keys) {
    const seen = new Set();
    if (!regex) return seen;
    const canonical = keys ? canonicalizer(keys) : null;
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(text)) !== null) {
        const matched = m[3].replace(/\s+/g, ' ');
        seen.add(canonical ? canonical(matched) : matched);
        regex.lastIndex = m.index + m[1].length + 1;
    }
    return seen;
}

// «ال» على كلمة غير أولى تُتجاهل في المقارنة (انظر withOptionalArticle).
function withoutInnerArticle(phrase) {
    return phrase
        .split(' ')
        .map((word, i) => (i > 0 && word.startsWith('ال') && word.length > 4 ? word.slice(2) : word))
        .join(' ');
}

// يردّ العبارة المطابقة إلى مفتاحها في البيانات: «جلسات» و«جلست» ← «جلسه» (التاء المربوطة
// المصرّفة)، و«موعد الجلسه» ← «موعد جلسه» («ال» على كلمة داخلية). أي صيغة أخرى تعود كما هي.
function canonicalizer(keys) {
    const exact = new Set(keys);
    const byArticleless = new Map();
    for (const key of keys) {
        const loose = withoutInnerArticle(key);
        if (!byArticleless.has(loose)) byArticleless.set(loose, key);
    }
    const find = candidate =>
        exact.has(candidate) ? candidate : byArticleless.get(withoutInnerArticle(candidate));
    return matched => {
        const direct = find(matched);
        if (direct) return direct;
        for (const tail of ['ات', 'ت']) {
            if (matched.endsWith(tail)) {
                const key = find(matched.slice(0, -tail.length) + 'ه');
                if (key) return key;
            }
        }
        return matched;
    };
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

// كل خيار يغيّر شكل التعبير يجب أن يدخل مفتاح الكاش، وإلا أعاد الكاش تعبيراً بُني بخيارات أخرى.
function optsKey(opts) {
    return `${opts.prefix || false}|${opts.suffix || false}|${opts.innerArticle || false}`;
}

export function getCachedMatcher(phrases, normalizeFn, opts = {}) {
    if (!Array.isArray(phrases) || phrases.length === 0) return null;
    let byOpts = matcherCache.get(phrases);
    if (!byOpts) {
        byOpts = new Map();
        matcherCache.set(phrases, byOpts);
    }
    const key = optsKey(opts);
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
    const key = `${optsKey(opts)}|${phrase}`;
    let regex = singleCache.get(key);
    if (regex === undefined) {
        // حدّ بسيط يمنع نمو الكاش بلا سقف في جلسة طويلة؛ الكلمات المتكررة تُعاد سريعاً.
        if (singleCache.size >= SINGLE_CACHE_LIMIT) singleCache.clear();
        regex = compileMatcher([phrase], opts);
        singleCache.set(key, regex);
    }
    return regex;
}
