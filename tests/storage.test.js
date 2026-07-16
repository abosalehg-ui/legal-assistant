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
    computeStats,
    MAX_SAVED,
} = await import('../js/storage.js');

beforeEach(() => {
    globalThis.localStorage.clear();
    globalThis.__quotaFull = false;
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

test('addResponse: يعيد null عند امتلاء مساحة التخزين بدل رمي استثناء', () => {
    globalThis.__quotaFull = true;
    assert.equal(addResponse('نص'), null);
});

test('addResponse: يحترم الحد الأقصى للأرشيف', () => {
    const many = Array.from({ length: MAX_SAVED }, (_, i) => ({
        id: i + 1,
        text: `رد ${i}`,
        timestamp: i + 1,
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
    const added = importResponses([
        { id: existing.id, text: 'مكرر' },
        { id: 9001, text: 'جديد أ', timestamp: 9001 },
        { id: 9002, text: 'جديد ب', timestamp: 9002 },
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

test('computeStats: اليوم والأسبوع والفئة الأكثر تكراراً', () => {
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
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
