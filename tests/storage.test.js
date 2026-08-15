// اختبارات أرشيف الردود: تعتمد على محاكاة localStorage قبل استيراد الوحدة.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

function makeLocalStorageMock() {
    const store = new Map();
    return {
        getItem: k => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => {
            if (globalThis.__quotaFull) throw new Error('QuotaExceededError');
            store.set(k, String(v));
        },
        removeItem: k => store.delete(k),
        clear: () => store.clear(),
    };
}

globalThis.localStorage = makeLocalStorageMock();

const {
    loadSavedResponses,
    addResponse,
    deleteResponse,
    findResponse,
    importResponses,
    clearAllResponses,
    computeStats,
    filterSavedResponses,
    setResponseStatus,
    normalizeSavedItem,
    applyRetention,
    getRetentionDays,
    setRetentionDays,
    takeLastPurgedCount,
    MAX_SAVED,
    DEFAULT_RETENTION_DAYS,
    STATUSES,
    DEFAULT_STATUS,
} = await import('../js/storage.js');

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
    globalThis.localStorage.clear();
    globalThis.__quotaFull = false;
    takeLastPurgedCount();
});

test('addResponse: يحفظ ويعيد العنصر ويقدمه في أول القائمة', () => {
    const item = addResponse('الرد الأول', 'فئة');
    assert.ok(item);
    assert.equal(item.text, 'الرد الأول');
    addResponse('الرد الثاني');
    const list = loadSavedResponses();
    assert.equal(list.length, 2);
    assert.equal(list[0].text, 'الرد الثاني');
});

test('addResponse: يحفظ النبرة والاستعجال من آخر تحليل ويطبّع القيم الشاذة', () => {
    const item = addResponse('رد شكوى', 'فئة', { tone: 'complaint', urgent: true });
    assert.equal(item.tone, 'complaint');
    assert.equal(item.urgent, true);
    // بلا extras أو بقيم غير صالحة → افتراضات آمنة.
    const plain = addResponse('رد عادي');
    assert.equal(plain.tone, null);
    assert.equal(plain.urgent, false);
    const weird = addResponse('رد', null, { tone: 7, urgent: 'yes' });
    assert.equal(weird.tone, null);
    assert.equal(weird.urgent, false);
});

test('importResponses: يحفظ النبرة والاستعجال الصالحين ويطبّع الشاذ', () => {
    // المعرفات حديثة حتى لا تسقط العناصر بسياسة الاحتفاظ (timestamp يعتمد id).
    const now = Date.now();
    const added = importResponses([
        { id: now - 1000, text: 'أ', tone: 'complaint', urgent: true },
        { id: now - 2000, text: 'ب', tone: 5, urgent: 'نعم' },
    ]);
    assert.equal(added, 2);
    assert.equal(findResponse(now - 1000).tone, 'complaint');
    assert.equal(findResponse(now - 1000).urgent, true);
    assert.equal(findResponse(now - 2000).tone, null);
    assert.equal(findResponse(now - 2000).urgent, false);
});

test('addResponse: يعيد null عند امتلاء مساحة التخزين بدل رمي استثناء', () => {
    globalThis.__quotaFull = true;
    assert.equal(addResponse('نص'), null);
});

test('addResponse: يحترم الحد الأقصى للأرشيف', () => {
    // طوابع زمنية حديثة: عناصر قديمة كانت ستُحذف بسياسة الاحتفاظ قبل فحص الحد الأقصى.
    const now = Date.now();
    const many = Array.from({ length: MAX_SAVED }, (_, i) => ({
        id: now - i,
        text: `رد ${i}`,
        timestamp: now - i,
        preview: `رد ${i}`,
    }));
    globalThis.localStorage.setItem('savedResponses', JSON.stringify(many));
    addResponse('الرد الجديد');
    const list = loadSavedResponses();
    assert.equal(list.length, MAX_SAVED);
    assert.equal(list[0].text, 'الرد الجديد');
});

test('deleteResponse و findResponse', () => {
    const a = addResponse('أ');
    assert.equal(findResponse(a.id).text, 'أ');
    deleteResponse(a.id);
    assert.equal(findResponse(a.id), undefined);
});

test('loadSavedResponses: يتعافى من JSON تالف', () => {
    globalThis.localStorage.setItem('savedResponses', '{ليس json صالحاً');
    assert.deepEqual(loadSavedResponses(), []);
});

test('importResponses: يدمج الردود الجديدة ويتجاهل المعرفات الموجودة', () => {
    addResponse('موجود');
    const existing = loadSavedResponses()[0];
    const now = Date.now();
    const added = importResponses([
        { id: existing.id, text: 'مكرر' },
        { id: 9001, text: 'جديد أ', timestamp: now - DAY },
        { id: 9002, text: 'جديد ب', timestamp: now - 2 * DAY },
    ]);
    assert.equal(added, 2);
    const list = loadSavedResponses();
    assert.equal(list.length, 3);
    // العنصر المكرر لم يُستبدل نصه
    assert.equal(findResponse(existing.id).text, 'موجود');
});

test('importResponses: يرفض غير المصفوفة ويتخطى العناصر بلا نص', () => {
    assert.equal(importResponses({}), -1);
    assert.equal(importResponses('نص'), -1);
    const added = importResponses([{ text: '' }, { foo: 1 }, null, { text: '   ' }]);
    assert.equal(added, 0);
});

test('importResponses: يعيد null عند امتلاء مساحة التخزين', () => {
    globalThis.__quotaFull = true;
    assert.equal(importResponses([{ id: 1, text: 'x' }]), null);
});

test('clearAllResponses: يفرّغ الأرشيف كاملاً', () => {
    addResponse('أ');
    addResponse('ب');
    assert.equal(loadSavedResponses().length, 2);
    assert.equal(clearAllResponses(), true);
    assert.deepEqual(loadSavedResponses(), []);
});

test('applyRetention: يُسقط ما تجاوز المدة ويُبقي الباقي', () => {
    const now = Date.now();
    const list = [
        { id: 1, timestamp: now - 2 * DAY },
        { id: 2, timestamp: now - 45 * DAY },
        { id: 3, timestamp: now - 29 * DAY },
    ];
    const { list: kept, purged } = applyRetention(list, 30, now);
    assert.equal(purged, 1);
    assert.deepEqual(kept.map(r => r.id), [1, 3]);
});

test('applyRetention: القيمة 0 تعني بلا حد فلا تحذف شيئاً', () => {
    const now = Date.now();
    const list = [{ id: 1, timestamp: 1 }, { id: 2, timestamp: now }];
    const { list: kept, purged } = applyRetention(list, 0, now);
    assert.equal(purged, 0);
    assert.equal(kept.length, 2);
});

test('applyRetention: يعتمد id عند غياب timestamp', () => {
    const now = Date.now();
    const { list: kept, purged } = applyRetention(
        [{ id: now - DAY }, { id: now - 90 * DAY }], 30, now,
    );
    assert.equal(purged, 1);
    assert.equal(kept.length, 1);
});

test('loadSavedResponses: يحذف المنتهي ويُبلّغ بعدده مرة واحدة فقط', () => {
    const now = Date.now();
    globalThis.localStorage.setItem('savedResponses', JSON.stringify([
        { id: 1, text: 'قديم', timestamp: now - 60 * DAY },
        { id: 2, text: 'حديث', timestamp: now - DAY },
    ]));
    const list = loadSavedResponses();
    assert.equal(list.length, 1);
    assert.equal(list[0].text, 'حديث');
    assert.equal(takeLastPurgedCount(), 1);
    // العدّاد يُستهلك مرة واحدة حتى لا يتكرر الإشعار
    assert.equal(takeLastPurgedCount(), 0);
    // الحذف مُثبَّت في التخزين لا في الذاكرة فقط
    assert.equal(JSON.parse(globalThis.localStorage.getItem('savedResponses')).length, 1);
});

test('getRetentionDays/setRetentionDays: افتراضي سليم ويرفض القيم غير المسموحة', () => {
    assert.equal(getRetentionDays(), DEFAULT_RETENTION_DAYS);
    assert.equal(setRetentionDays(90), 90);
    assert.equal(getRetentionDays(), 90);
    assert.equal(setRetentionDays(0), 0);
    assert.equal(getRetentionDays(), 0);
    // قيمة غير موجودة في الخيارات ترجع للافتراضي بدل تعطيل السياسة
    assert.equal(setRetentionDays(999), DEFAULT_RETENTION_DAYS);
    assert.equal(getRetentionDays(), DEFAULT_RETENTION_DAYS);
});

test('الترحيل عند القراءة: عنصر قديم بلا حقول الحالة يحصل على افتراضات آمنة', () => {
    const now = Date.now();
    // عنصر بالبنية القديمة تماماً (قبل إضافة tone/urgent/status).
    globalThis.localStorage.setItem('savedResponses', JSON.stringify([
        { id: now, text: 'قديم', category: 'فئة', date: '١', timestamp: now, preview: 'قديم' },
    ]));
    const item = loadSavedResponses()[0];
    assert.equal(item.status, DEFAULT_STATUS);
    assert.equal(item.tone, null);
    assert.equal(item.urgent, false);
    assert.equal(item.text, 'قديم', 'بقية الحقول لم تُمس');
});

test('normalizeSavedItem: يصحح القيم الشاذة ويبقي الصالح', () => {
    const ok = normalizeSavedItem({ id: 1, status: 'closed', tone: 'inquiry', urgent: true });
    assert.equal(ok.status, 'closed');
    assert.equal(ok.tone, 'inquiry');
    const bad = normalizeSavedItem({ id: 2, status: 'مغلق', tone: '', urgent: 1 });
    assert.equal(bad.status, DEFAULT_STATUS);
    assert.equal(bad.tone, null);
    assert.equal(bad.urgent, false);
});

test('setResponseStatus: يغيّر الحالة ويثبّتها ويرفض غير الصالح', () => {
    const item = addResponse('رد', 'فئة');
    assert.equal(item.status, DEFAULT_STATUS);
    const updated = setResponseStatus(item.id, 'in-progress');
    assert.ok(updated);
    assert.equal(findResponse(item.id).status, 'in-progress');
    // مثبّتة في التخزين لا في الذاكرة فقط.
    assert.equal(JSON.parse(globalThis.localStorage.getItem('savedResponses'))[0].status, 'in-progress');
    assert.equal(setResponseStatus(item.id, 'not-a-status'), null);
    assert.equal(setResponseStatus(-999, 'closed'), null, 'معرف غير موجود');
    globalThis.__quotaFull = true;
    assert.equal(setResponseStatus(item.id, 'closed'), null, 'فشل الكتابة لا يمر صامتاً');
});

test('importResponses: الحالة الصالحة تُحفظ والشاذة تعود للافتراضي (round-trip التصدير)', () => {
    const now = Date.now();
    importResponses([
        { id: now - 1000, text: 'أ', status: 'closed', tone: 'complaint', urgent: true },
        { id: now - 2000, text: 'ب', status: 'whatever' },
    ]);
    assert.equal(findResponse(now - 1000).status, 'closed');
    assert.equal(findResponse(now - 2000).status, DEFAULT_STATUS);
    // ما يُصدَّر (القائمة المحمّلة) يحمل الحقول الجديدة فيصمد عبر تصدير→استيراد.
    const exported = loadSavedResponses();
    globalThis.localStorage.clear();
    importResponses(exported);
    assert.equal(findResponse(now - 1000).status, 'closed');
    assert.equal(findResponse(now - 1000).tone, 'complaint');
    assert.equal(findResponse(now - 1000).urgent, true);
});

test('filterSavedResponses: توليفات النص والحالة والنبرة والفئة', () => {
    const list = [
        { id: 1, text: 'تأخر الرد على طلبي', status: 'new', tone: 'complaint', category: 'شكوى من تأخر الرد' },
        { id: 2, text: 'استفسار عن موعد', status: 'closed', tone: 'inquiry', category: 'استفسار عن موعد جلسة' },
        { id: 3, text: 'رد قديم بلا حقول' },
    ];
    assert.equal(filterSavedResponses(list, {}).length, 3, 'بلا تصفية يعيد الكل');
    assert.deepEqual(filterSavedResponses(list, { status: 'new' }).map(r => r.id), [1, 3], 'القديم يُعامل كجديد');
    assert.deepEqual(filterSavedResponses(list, { tone: 'inquiry' }).map(r => r.id), [2]);
    assert.deepEqual(filterSavedResponses(list, { tone: 'neutral' }).map(r => r.id), [3], 'بلا نبرة = محايدة');
    assert.deepEqual(filterSavedResponses(list, { query: 'تأخر' }).map(r => r.id), [1]);
    assert.deepEqual(
        filterSavedResponses(list, { query: 'الرد', status: 'new', tone: 'complaint' }).map(r => r.id),
        [1],
        'التصفيات تتقاطع',
    );
    assert.deepEqual(filterSavedResponses(list, { category: 'استفسار عن موعد جلسة' }).map(r => r.id), [2]);
});

test('computeStats: توزيع النبرة والحالة وعدّاد المفتوح', () => {
    const now = Date.now();
    const stats = computeStats([
        { id: 1, timestamp: now, tone: 'complaint', status: 'new' },
        { id: 2, timestamp: now, tone: 'complaint', status: 'in-progress' },
        { id: 3, timestamp: now, tone: 'inquiry', status: 'closed' },
        { id: 4, timestamp: now },
    ]);
    assert.equal(stats.byTone.complaint, 2);
    assert.equal(stats.byTone.inquiry, 1);
    assert.equal(stats.byTone.neutral, 1, 'بلا نبرة يُحسب محايداً');
    assert.equal(stats.byStatus['new'], 2, 'بلا حالة يُحسب جديداً');
    assert.equal(stats.byStatus['closed'], 1);
    assert.equal(stats.open, 3, 'جديد + قيد المعالجة');
    assert.ok(STATUSES.includes(DEFAULT_STATUS));
});

test('computeStats: اليوم والأسبوع والفئة الأكثر تكراراً', () => {
    const now = Date.now();
    const list = [
        { id: 1, timestamp: now, category: 'جلسات' },
        { id: 2, timestamp: now - 2 * DAY, category: 'جلسات' },
        { id: 3, timestamp: now - 3 * DAY, category: 'تبليغ' },
        { id: 4, timestamp: now - 30 * DAY, category: 'تبليغ' },
    ];
    const stats = computeStats(list);
    assert.equal(stats.total, 4);
    assert.equal(stats.today, 1);
    assert.equal(stats.week, 3);
    assert.equal(stats.topCategory, 'جلسات');
    assert.equal(computeStats([]).topCategory, '—');
});
