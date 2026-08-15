// اختبارات طبقة البيانات: الدمج، التحقق من الروابط، التحقق النوعي للمواد.

import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = globalThis.localStorage || {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
};

const { mergeArticles, isSafeUrl, validateArticle, withNormalized, toPlainArticle } = await import('../js/data.js');

test('mergeArticles: المخصص يطغى على الأساسي والمحذوف يُستبعد', () => {
    const base = [
        { id: 'a', title: 'أصل أ' },
        { id: 'b', title: 'أصل ب' },
    ];
    const custom = [
        { id: 'a', title: 'معدلة أ' },
        { id: 'c', title: 'جديدة ج' },
    ];
    const merged = mergeArticles(base, custom, ['b']);
    assert.equal(merged.length, 2);
    assert.equal(merged.find(x => x.id === 'a').title, 'معدلة أ');
    assert.ok(merged.find(x => x.id === 'c'));
    assert.ok(!merged.find(x => x.id === 'b'));
});

test('isSafeUrl: يقبل https فقط', () => {
    assert.equal(isSafeUrl('https://laws.boe.gov.sa/x'), true);
    assert.equal(isSafeUrl('http://example.com'), false);
    assert.equal(isSafeUrl('javascript:alert(1)'), false);
    assert.equal(isSafeUrl('ليس رابطاً'), false);
    assert.equal(isSafeUrl(''), false);
    assert.equal(isSafeUrl(undefined), false);
});

test('validateArticle: يقبل المادة السليمة وينظف حقولها', () => {
    const a = validateArticle({
        id: ' 1/1 ',
        number: 'المادة 1/1',
        title: 'عنوان',
        category: 'فئة',
        text: 'نص',
        keywords: [' تبليغ ', '', 42, 'جلسة'],
        sourceUrl: 'https://laws.boe.gov.sa/x',
        lastVerified: '2026-01-01',
    });
    assert.equal(a.id, '1/1');
    assert.deepEqual(a.keywords, ['تبليغ', 'جلسة']);
    assert.equal(a.sourceUrl, 'https://laws.boe.gov.sa/x');
    assert.equal(a.lastVerified, '2026-01-01');
});

test('validateArticle: يرفض الأنواع الخاطئة والحقول الناقصة', () => {
    assert.equal(validateArticle(null), null);
    assert.equal(validateArticle('نص'), null);
    assert.equal(validateArticle({ id: { evil: 1 }, number: 'x', title: 'x', category: 'x', text: 'x' }), null);
    assert.equal(validateArticle({ id: '1', number: 'x', title: 'x', category: 'x' }), null);
    assert.equal(validateArticle({ id: '  ', number: 'x', title: 'x', category: 'x', text: 'x' }), null);
});

test('validateArticle: يجرّد الروابط غير الآمنة ويصلح keywords غير المصفوفية', () => {
    const a = validateArticle({
        id: '1',
        number: 'م',
        title: 'ع',
        category: 'ف',
        text: 'ن',
        keywords: 'ليست مصفوفة',
        sourceUrl: 'javascript:alert(1)',
    });
    assert.deepEqual(a.keywords, []);
    assert.equal(a.sourceUrl, '');
    assert.equal(a.lastVerified, undefined);
});

test('withNormalized: يحسب حقول البحث مرة واحدة ويحفظ الأصل', () => {
    const [a] = withNormalized([{
        id: '1', number: 'المادة ١', title: 'إبْلاغ الخصم', text: 'نص المرافعة',
        category: 'التبليغ', keywords: ['إشعار', 'جلسة'],
    }]);
    assert.equal(a._normTitle, 'ابلاغ الخصم');
    assert.equal(a._normText, 'نص المرافعه');
    assert.deepEqual(a._normKeywords, ['اشعار', 'جلسه']);
    assert.equal(a.title, 'إبْلاغ الخصم', 'الحقول الأصلية تبقى كما هي للعرض');
});

test('withNormalized: يتحمل الحقول الناقصة', () => {
    const [a] = withNormalized([{ id: '1' }]);
    assert.equal(a._normTitle, '');
    assert.deepEqual(a._normKeywords, []);
});

test('toPlainArticle: يجرّد الحقول الداخلية قبل التصدير', () => {
    const [enriched] = withNormalized([{
        id: '1', number: 'م١', title: 'ع', text: 'ن', category: 'ف',
        keywords: ['ك'], sourceUrl: 'https://laws.boe.gov.sa/x', lastVerified: '2026-07-16',
    }]);
    const plain = toPlainArticle({ ...enriched, score: 42 });
    assert.deepEqual(Object.keys(plain).sort(), [
        'category', 'id', 'keywords', 'lastVerified', 'number', 'sourceUrl', 'text', 'title',
    ]);
    assert.equal(plain.score, undefined, 'درجة التطابق ليست بيانات مادة');
    assert.equal(plain._normText, undefined);
});

test('toPlainArticle: يحذف lastVerified عند غيابه بدل كتابته فارغاً', () => {
    const plain = toPlainArticle({
        id: '1', number: 'م', title: 'ع', category: 'ف', text: 'ن', keywords: [],
    });
    assert.ok(!('lastVerified' in plain));
    assert.equal(plain.sourceUrl, '');
});
