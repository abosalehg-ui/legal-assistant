// اختبارات التنسيق الموحّد: التقويم مثبّت، والأرقام هندية، وشارة قِدم التحقق.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formatDate, formatNumber, fileStamp, isStaleVerification } from '../js/format.js';

const DAY = 24 * 60 * 60 * 1000;

test('formatDate: هجري بأرقام هندية بغض النظر عن ICU في البيئة', () => {
    const out = formatDate(Date.UTC(2026, 7, 15, 12));
    // 'ar-SA' وحدها تعطي ميلادياً في بعض البيئات — التثبيت يضمن الهجري في كلها.
    assert.match(out, /١٤٤٨/);
    assert.match(out, /هـ/);
});

test('formatDate: يتحمل المدخلات غير الصالحة بلا رمي استثناء', () => {
    assert.equal(formatDate('ليس تاريخاً'), '');
    assert.equal(formatDate(NaN), '');
});

test('formatNumber: أرقام هندية، ويمرر غير الرقمي كما هو', () => {
    assert.equal(formatNumber(44), '٤٤');
    assert.equal(formatNumber(0), '٠');
    assert.equal(formatNumber('نص'), 'نص');
});

test('fileStamp: يجمع الهجري والميلادي بأرقام لاتينية', () => {
    const stamp = fileStamp(Date.UTC(2026, 7, 15, 12));
    assert.match(stamp, /^\d{4}-\d{2}-\d{2}H-2026-08-15$/);
    // بلا أرقام هندية: أسماء الملفات يجب أن تبقى آمنة لأنظمة الملفات وأدوات النقل
    assert.ok(!/[٠-٩]/.test(stamp));
});

test('isStaleVerification: يميّز التحقق الحديث من القديم', () => {
    const now = Date.UTC(2026, 7, 15);
    assert.equal(isStaleVerification('2026-07-16', 12, now), false);
    assert.equal(isStaleVerification('2024-01-01', 12, now), true);
    assert.equal(isStaleVerification('', 12, now), false);
    assert.equal(isStaleVerification(undefined, 12, now), false);
    assert.equal(isStaleVerification('ليس تاريخاً', 12, now), false);
});

test('isStaleVerification: الحد يقع عند العمر المحدد لا قبله', () => {
    const now = Date.UTC(2026, 7, 15);
    const elevenMonths = now - 11 * 30 * DAY;
    const thirteenMonths = now - 13 * 30 * DAY;
    assert.equal(isStaleVerification(new Date(elevenMonths).toISOString(), 12, now), false);
    assert.equal(isStaleVerification(new Date(thirteenMonths).toISOString(), 12, now), true);
});
