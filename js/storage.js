// إدارة الردود المحفوظة في localStorage.

import { readArray, writeJson, readString, writeString } from './safe-storage.js';
import { formatDate } from './format.js';

const KEY = 'savedResponses';
const RETENTION_KEY = 'retentionDays';

// حد أقصى للأرشيف يمنع النمو غير المحدود وامتلاء مساحة التخزين.
export const MAX_SAVED = 500;

// سياسة الاحتفاظ: ردود المستفيدين تحوي أرقام هوية وجوال، والجهاز قد يكون مشتركاً
// بين موظفي المناوبة. الافتراضي 30 يوماً، والقيمة 0 تعني «بلا حد» لمن يحتاج أرشيفاً أطول.
export const DEFAULT_RETENTION_DAYS = 30;
export const RETENTION_OPTIONS = [7, 30, 90, 0];

// حالات معالجة الرد المحفوظ (CRM مصغّر): تتيح للموظف تمييز ما أُنجز وما ينتظر.
export const STATUSES = ['new', 'in-progress', 'closed'];
export const DEFAULT_STATUS = 'new';

const DAY_MS = 24 * 60 * 60 * 1000;

function itemTimestamp(item) {
    return item.timestamp || item.id || 0;
}

// ترحيل عند القراءة: عناصر محفوظة قبل إضافة حقول الحالة/النبرة تحصل هنا على
// افتراضات آمنة، وتُثبَّت في التخزين مع أول كتابة تالية. لا حاجة لترحيل مُرقَّم.
export function normalizeSavedItem(item) {
    return {
        ...item,
        status: STATUSES.includes(item.status) ? item.status : DEFAULT_STATUS,
        tone: typeof item.tone === 'string' && item.tone ? item.tone : null,
        urgent: item.urgent === true,
    };
}

export function getRetentionDays() {
    // الفحص على السلسلة قبل التحويل: Number('') يساوي 0، و0 خيار صالح («بلا حد»).
    // بدون هذا التمييز يقرأ التفضيل غير المضبوط كأنه إلغاء صريح للسياسة.
    const raw = readString(RETENTION_KEY, null);
    if (raw === null || raw.trim() === '') return DEFAULT_RETENTION_DAYS;
    const value = Number(raw);
    return RETENTION_OPTIONS.includes(value) ? value : DEFAULT_RETENTION_DAYS;
}

export function setRetentionDays(days) {
    const value = RETENTION_OPTIONS.includes(Number(days)) ? Number(days) : DEFAULT_RETENTION_DAYS;
    writeString(RETENTION_KEY, value);
    return value;
}

// تُسقط ما تجاوز مدة الاحتفاظ. تعيد { list, purged } ولا تكتب شيئاً بنفسها.
export function applyRetention(list, days = getRetentionDays(), now = Date.now()) {
    if (!days) return { list, purged: 0 };
    const cutoff = now - days * DAY_MS;
    const kept = list.filter(item => itemTimestamp(item) >= cutoff);
    return { list: kept, purged: list.length - kept.length };
}

// عدد ما حُذف تلقائياً في آخر تحميل — يقرأه app.js لإظهار إشعار بدل حذف صامت.
let lastPurgedCount = 0;

export function takeLastPurgedCount() {
    const count = lastPurgedCount;
    lastPurgedCount = 0;
    return count;
}

export function loadSavedResponses() {
    const stored = readArray(KEY);
    const { list, purged } = applyRetention(stored);
    if (purged > 0) {
        lastPurgedCount += purged;
        writeJson(KEY, list);
    }
    return list.map(normalizeSavedItem);
}

// تعيد العنصر المحفوظ، أو null إذا تعذّرت الكتابة.
// extras: نتيجة آخر تحليل تُحفظ مع الرد { tone, urgent } — اختيارية بالكامل.
export function addResponse(text, category = null, extras = {}) {
    const list = loadSavedResponses();
    const now = Date.now();
    const item = {
        id: now,
        text,
        category,
        tone: typeof extras.tone === 'string' && extras.tone ? extras.tone : null,
        urgent: extras.urgent === true,
        status: DEFAULT_STATUS,
        date: formatDate(now),
        timestamp: now,
        preview: text.substring(0, 100),
    };
    list.unshift(item);
    if (list.length > MAX_SAVED) list.length = MAX_SAVED;
    return writeJson(KEY, list) ? item : null;
}

// تغيّر حالة معالجة رد محفوظ. تعيد القائمة المحدّثة،
// أو null لحالة غير صالحة أو معرف غير موجود أو فشل كتابة.
export function setResponseStatus(id, status) {
    if (!STATUSES.includes(status)) return null;
    const list = loadSavedResponses();
    const item = list.find(r => r.id === id);
    if (!item) return null;
    item.status = status;
    return writeJson(KEY, list) ? list : null;
}

export function deleteResponse(id) {
    const list = loadSavedResponses().filter(r => r.id !== id);
    writeJson(KEY, list);
    return list;
}

export function clearAllResponses() {
    return writeJson(KEY, []);
}

export function findResponse(id) {
    return loadSavedResponses().find(r => r.id === id);
}

// يدمج أرشيفاً مستورداً مع الحالي (تجاهل المعرفات الموجودة).
// يعيد عدد المضاف، أو null عند فشل الكتابة، أو -1 إن لم يكن الملف مصفوفة.
export function importResponses(items) {
    if (!Array.isArray(items)) return -1;
    const list = loadSavedResponses();
    const seen = new Set(list.map(r => r.id));
    let added = 0;

    for (const raw of items) {
        if (!raw || typeof raw !== 'object') continue;
        if (typeof raw.text !== 'string' || !raw.text.trim()) continue;
        const id = typeof raw.id === 'number' ? raw.id : Date.now() + added;
        if (seen.has(id)) continue;
        seen.add(id);
        list.push(normalizeSavedItem({
            id,
            text: raw.text,
            category: typeof raw.category === 'string' ? raw.category : null,
            tone: raw.tone,
            urgent: raw.urgent,
            status: raw.status,
            date: typeof raw.date === 'string' ? raw.date : '',
            timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : id,
            preview: raw.text.substring(0, 100),
        }));
        added++;
    }

    list.sort((a, b) => itemTimestamp(b) - itemTimestamp(a));
    if (list.length > MAX_SAVED) list.length = MAX_SAVED;
    return writeJson(KEY, list) ? added : null;
}

export function computeStats(savedResponses) {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let today = 0;
    let week = 0;
    const categoryCount = {};
    const byTone = {};
    const byStatus = {};

    savedResponses.forEach(r => {
        const ts = itemTimestamp(r);
        if (ts >= todayStart.getTime()) today++;
        if (now - ts <= 7 * DAY_MS) week++;
        if (r.category) {
            categoryCount[r.category] = (categoryCount[r.category] || 0) + 1;
        }
        // العناصر القديمة بلا نبرة تُحسب «محايدة» حتى لا تختفي من التوزيع.
        const tone = r.tone || 'neutral';
        byTone[tone] = (byTone[tone] || 0) + 1;
        const status = STATUSES.includes(r.status) ? r.status : DEFAULT_STATUS;
        byStatus[status] = (byStatus[status] || 0) + 1;
    });

    const topCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0];

    return {
        total: savedResponses.length,
        today,
        week,
        topCategory: topCategory ? topCategory[0] : '—',
        byTone,
        byStatus,
        // «مفتوحة» = كل ما لم يُغلق بعد — رقم المتابعة اليومي للموظف.
        open: (byStatus['new'] || 0) + (byStatus['in-progress'] || 0),
    };
}

// تصفية الأرشيف — دالة نقية قابلة للاختبار بلا DOM. 'all' تعني بلا تصفية للحقل.
export function filterSavedResponses(list, { query = '', status = 'all', tone = 'all', category = 'all' } = {}) {
    const q = query.trim().toLowerCase();
    return list.filter(r =>
        (!q || r.text.toLowerCase().includes(q)) &&
        (status === 'all' || (r.status || DEFAULT_STATUS) === status) &&
        (tone === 'all' || (r.tone || 'neutral') === tone) &&
        (category === 'all' || r.category === category),
    );
}
