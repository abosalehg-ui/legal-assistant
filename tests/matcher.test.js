// اختبارات وحدة المُطابق المشترك: الحدود، السوابق، العبارات، الكاش.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    escapeRegExp,
    compileMatcher,
    countDistinctMatches,
    hasMatch,
    getCachedMatcher,
    getPhraseMatcher,
} from '../js/matcher.js';
import { normalizeArabic } from '../js/analyzer.js';

test('compileMatcher: لا يطابق داخل كلمة أطول («هل» لا تطابق «مهله»)', () => {
    const rx = compileMatcher(['هل'], { prefix: 'clitic+al' });
    assert.equal(hasMatch('مهله', rx), false);
    assert.equal(hasMatch('المهله بعيده', rx), false);
    assert.equal(hasMatch('هل يمكن ذلك', rx), true);
    assert.equal(hasMatch('اسال: هل', rx), true);
});

test('compileMatcher: سوابق العطف والجر و«ال» التعريف في وضع clitic+al', () => {
    const rx = compileMatcher(['جلسه', 'حكم'], { prefix: 'clitic+al' });
    assert.equal(hasMatch('والجلسه غدا', rx), true);
    assert.equal(hasMatch('بالحكم الصادر', rx), true);
    assert.equal(hasMatch('وبالحكم ايضا', rx), true);
    assert.equal(hasMatch('فالجلسه مهمه', rx), true);
    assert.equal(hasMatch('الجلسه', rx), true);
    // «لل»: لام الجر مع «ال» المدغمة (للجلسة = ل + الجلسة).
    assert.equal(hasMatch('موعد للجلسه القادمه', rx), true);
    // حروف ليست سوابق لا تُقبل: «مجلسه» ليست «جلسه».
    assert.equal(hasMatch('مجلسه', rx), false);
});

test('compileMatcher: وضع clitic يطابق سلوك محسّن الصياغة القديم (سابقة واحدة بلا «ال»)', () => {
    const rx = compileMatcher(['تروح'], { prefix: 'clitic' });
    assert.equal(hasMatch('وتروح', rx), true);
    assert.equal(hasMatch('تروح', rx), true);
    assert.equal(hasMatch('مشتروح', rx), false);
    assert.equal(hasMatch('التروح', rx), false);
});

test('compileMatcher: العبارة متعددة الكلمات تصمد أمام مسافة مكررة وسطر جديد', () => {
    const rx = compileMatcher(['لم يتم الرد']);
    assert.equal(hasMatch('لم يتم الرد على طلبي', rx), true);
    assert.equal(hasMatch('لم  يتم الرد', rx), true);
    assert.equal(hasMatch('لم يتم\nالرد', rx), true);
    assert.equal(hasMatch('لم يتم الردود', rx), false);
});

test('countDistinctMatches: يعدّ العبارات المختلفة والتكرار مرة واحدة والأطول يسبق', () => {
    const rx = compileMatcher(['تاخير الرد', 'تاخير', 'اهمال']);
    // «تاخير الرد» تطابق العبارة الأطول فقط — لا تُعدّ «تاخير» معها في الموضع نفسه.
    assert.equal(countDistinctMatches('حصل تاخير الرد عندكم', rx), 1);
    assert.equal(countDistinctMatches('تاخير ثم تاخير مره ثانيه', rx), 1);
    assert.equal(countDistinctMatches('تاخير ثم اهمال واضح', rx), 2);
    // العبارة المطابقة بفراغ غير قياسي تُعاد لمفتاحها فلا تُعدّ عبارة مستقلة.
    assert.equal(countDistinctMatches('تاخير الرد ثم تاخير  الرد', rx), 1);
});

test('escapeRegExp: يحيّد رموز regex داخل المفاتيح وقائمة فارغة تعيد null', () => {
    assert.equal(escapeRegExp('س.و(ال)'), 'س\\.و\\(ال\\)');
    const rx = compileMatcher(['ما هو؟']);
    assert.equal(hasMatch('اسال ما هو؟ بالضبط', rx), true);
    assert.equal(compileMatcher([]), null);
    assert.equal(hasMatch('نص', null), false);
    assert.equal(countDistinctMatches('نص', null), 0);
});

test('getCachedMatcher: نفس المصفوفة تعيد نفس الكائن ومصفوفة جديدة تعيد كائناً جديداً', () => {
    const words = ['استفسار', 'سوال'];
    const first = getCachedMatcher(words, normalizeArabic, { prefix: 'clitic+al' });
    const second = getCachedMatcher(words, normalizeArabic, { prefix: 'clitic+al' });
    assert.equal(first, second, 'الكاش بهوية المصفوفة');
    const copy = getCachedMatcher([...words], normalizeArabic, { prefix: 'clitic+al' });
    assert.notEqual(first, copy, 'نسخة جديدة = ترجمة جديدة (عقد الهوية)');
    // خيارات مختلفة على نفس المصفوفة لا تتصادم.
    const noPrefix = getCachedMatcher(words, normalizeArabic, {});
    assert.notEqual(first, noPrefix);
});

test('getCachedMatcher: يطبّع العبارات قبل الترجمة فيطابق النص المطبّع', () => {
    const words = ['أرجو الإفادة'];
    const rx = getCachedMatcher(words, normalizeArabic, { prefix: 'clitic+al' });
    assert.equal(hasMatch(normalizeArabic('أرجو الإفادة عاجلاً'), rx), true);
});

test('compileMatcher: اللواحق المتصلة تُطابق الكلمة المجردة (طلبكم، قضيتهم، جلساتنا)', () => {
    const rx = compileMatcher(['طلب', 'قضية', 'جلسة'], {
        prefix: 'clitic+al', suffix: true, normalize: normalizeArabic,
    });
    for (const text of ['وصلني طلبكم', 'بخصوص قضيتهم', 'حضرنا جلساتنا', 'الطلبات المقدمة']) {
        assert.ok(hasMatch(normalizeArabic(text), rx), `يفترض أن يطابق: ${text}`);
    }
});

test('compileMatcher: التاء المربوطة وحدها تتصرّف — «ليه» لا تطابق «ليت»', () => {
    // بعد التطبيع تصير «ليه» و«جلسة» كلتاهما منتهيتين بهاء؛ الفرق في الأصل الخام وحده.
    const real = compileMatcher(['ليه'], { prefix: 'clitic+al', suffix: true, normalize: normalizeArabic });
    assert.equal(hasMatch(normalizeArabic('يا ليت الأمر انتهى'), real), false);
    const marbuta = compileMatcher(['جلسة'], { prefix: 'clitic+al', suffix: true, normalize: normalizeArabic });
    assert.ok(hasMatch(normalizeArabic('موعد جلستنا'), marbuta));
});

test('compileMatcher: تعطيل اللواحق يمنع ابتلاع حرف ليس من الكلمة (وضع محسّن الصياغة)', () => {
    const rx = compileMatcher(['ابغى'], { prefix: 'clitic', normalize: normalizeArabic });
    const m = normalizeArabic('ابغاك تساعدني').match(rx);
    assert.equal(m, null, 'بلا لواحق: «ابغاك» ليست «ابغى»');
});

test('countDistinctMatches: الصيغة المصرّفة تُردّ إلى مفتاحها فلا تُعدّ مرتين', () => {
    const keys = ['جلسة'];
    const normKeys = keys.map(normalizeArabic);
    const rx = compileMatcher(keys, { prefix: 'clitic+al', suffix: true, normalize: normalizeArabic });
    const text = normalizeArabic('الجلسة والجلسات وجلستي');
    assert.equal(countDistinctMatches(text, rx, normKeys), 1);
});

test('getPhraseMatcher: كاش بالنص لا بالهوية — نفس العبارة تعيد نفس الكائن', () => {
    const a = getPhraseMatcher('تبليغ', { prefix: 'clitic+al', suffix: true, normalize: normalizeArabic });
    const b = getPhraseMatcher('تبليغ', { prefix: 'clitic+al', suffix: true, normalize: normalizeArabic });
    assert.equal(a, b);
    assert.equal(getPhraseMatcher('', {}), null);
});
