// تنسيق موحّد للتواريخ والأرقام في كل الواجهة.
//
// ليش التقويم مثبّت صراحةً: 'ar-SA' وحدها لا تضمن الهجري — تعتمد على بيانات ICU في البيئة.
// (نفس السطر يعطي هجرياً في Chromium وميلادياً في Node.) تثبيت islamic-umalqura يجعل
// المخرج واحداً في كل مكان، وهو المطلوب في أداة قضائية.

const HIJRI_LOCALE = 'ar-SA-u-ca-islamic-umalqura';
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export function formatDate(value = Date.now()) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    try {
        return date.toLocaleDateString(HIJRI_LOCALE, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    } catch {
        return date.toISOString().slice(0, 10);
    }
}

// الأرقام في الواجهة بالهندية لتتسق مع التواريخ الهجرية.
export function formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value);
    try {
        return new Intl.NumberFormat('ar-SA').format(n);
    } catch {
        return String(n);
    }
}

// طابع اسم الملف: هجري + ميلادي معاً ليسهل ربط الملف المصدَّر بالسجلات الورقية والرقمية.
// بأرقام لاتينية عمداً — الأرقام الهندية في أسماء الملفات تربك بعض أنظمة الملفات وأدوات النقل.
export function fileStamp(value = Date.now()) {
    const date = new Date(value);
    const gregorian = date.toISOString().slice(0, 10);
    try {
        const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(date);
        const get = type => (parts.find(p => p.type === type)?.value || '').replace(/\D/g, '');
        const year = get('year');
        const month = get('month');
        const day = get('day');
        if (!year || !month || !day) return gregorian;
        return `${year}-${month}-${day}H-${gregorian}`;
    } catch {
        return gregorian;
    }
}

// المواد النظامية تحمل lastVerified بصيغة ISO ميلادية (بيانات مصدرية، لا عرض واجهة).
// تُعتبر قديمة بعد 12 شهراً افتراضياً — عمر التحقق معلومة تخص الموظف مباشرة في أداة قانونية.
export function isStaleVerification(isoDate, months = 12, now = Date.now()) {
    if (!isoDate) return false;
    const verified = new Date(isoDate);
    if (Number.isNaN(verified.getTime())) return false;
    return now - verified.getTime() > months * MONTH_MS;
}
