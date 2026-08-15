// اختبارات مخزن المواد: مصدر الحقيقة الوحيد + إشعار المشتركين.

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

const store = await import('../js/store.js');

const BASE = [
    { id: 'a', number: 'المادة 1', title: 'أصل أ', category: 'التبليغ', text: 'نص أ', keywords: ['تبليغ'] },
    { id: 'b', number: 'المادة 2', title: 'أصل ب', category: 'الجلسات', text: 'نص ب', keywords: ['جلسة'] },
];

beforeEach(() => {
    globalThis.localStorage.clear();
    globalThis.__quotaFull = false;
    store.init(BASE);
});

test('init: يبني القائمة من الأساسي ويحسب الحقول المطبّعة مسبقاً', () => {
    const articles = store.getArticles();
    assert.equal(articles.length, 2);
    // الحقول المطبّعة هي سبب عدم إعادة تطبيع نص كل مادة في كل بحث
    assert.equal(articles[0]._normTitle, 'اصل ا');
    assert.deepEqual(articles[0]._normKeywords, ['تبليغ']);
});

test('upsertArticle: يضيف مادة مخصصة ويُشعر المشتركين', () => {
    let notified = 0;
    const unsubscribe = store.subscribe(() => { notified++; });

    const saved = store.upsertArticle({
        id: 'c', number: 'المادة 3', title: 'جديدة', category: 'التنفيذ', text: 'نص ج', keywords: [],
    });

    assert.equal(saved, true);
    assert.equal(notified, 1);
    assert.equal(store.getArticles().length, 3);
    assert.equal(store.findArticle('c').title, 'جديدة');
    unsubscribe();
});

test('upsertArticle: تعديل مادة أساسية يطغى عليها بلا تكرار', () => {
    store.upsertArticle({
        id: 'a', number: 'المادة 1', title: 'معدلة', category: 'التبليغ', text: 'نص محدث', keywords: [],
    });
    assert.equal(store.getArticles().length, 2);
    assert.equal(store.findArticle('a').title, 'معدلة');
});

test('removeArticle: يخفي الأساسية ويحذف المخصصة نهائياً', () => {
    store.removeArticle('a');
    assert.equal(store.findArticle('a'), undefined);

    store.upsertArticle({
        id: 'c', number: 'المادة 3', title: 'مؤقتة', category: 'التنفيذ', text: 'نص', keywords: [],
    });
    store.removeArticle('c');
    assert.equal(store.findArticle('c'), undefined);

    // الأساسية المحذوفة تعود بإعادة التعيين، والمخصصة لا لأنها لم تعد موجودة
    store.resetArticles();
    assert.ok(store.findArticle('a'));
    assert.equal(store.findArticle('c'), undefined);
});

test('upsertArticle: إعادة إضافة مادة أساسية محذوفة تلغي حذفها', () => {
    store.removeArticle('a');
    assert.equal(store.findArticle('a'), undefined);
    store.upsertArticle({
        id: 'a', number: 'المادة 1', title: 'رجعت', category: 'التبليغ', text: 'نص', keywords: [],
    });
    assert.equal(store.findArticle('a').title, 'رجعت');
});

test('getCategories: فئات فريدة من القائمة المدموجة', () => {
    assert.deepEqual(store.getCategories().sort(), ['التبليغ', 'الجلسات']);
    store.removeArticle('b');
    assert.deepEqual(store.getCategories(), ['التبليغ']);
});

test('replaceCustomArticles: يستبدل الكل ويعيد المحذوفات', () => {
    store.removeArticle('a');
    const ok = store.replaceCustomArticles([
        { id: 'z', number: 'المادة 9', title: 'مستوردة', category: 'الإثبات', text: 'نص', keywords: [] },
    ]);
    assert.equal(ok, true);
    assert.ok(store.findArticle('a'), 'المحذوفة سابقاً تعود بعد الاستيراد');
    assert.ok(store.findArticle('z'));
});

test('upsertArticle: يعيد false عند امتلاء التخزين مع بقاء الحالة متسقة مع الواجهة', () => {
    globalThis.__quotaFull = true;
    const saved = store.upsertArticle({
        id: 'c', number: 'المادة 3', title: 'لن تُحفظ', category: 'التنفيذ', text: 'نص', keywords: [],
    });
    assert.equal(saved, false);
    // الحالة في الذاكرة تتحدث حتى لا تتناقض الواجهة مع رسالة الفشل المعروضة
    assert.ok(store.findArticle('c'));
});

test('init: يتعافى من قيم مخزّنة تالفة أو من نوع خاطئ', () => {
    globalThis.localStorage.setItem('customArticles', '{ليس json');
    globalThis.localStorage.setItem('deletedArticles', '{"not":"array"}');
    const articles = store.init(BASE);
    assert.equal(articles.length, 2);
});
