// اختبار دقة التصنيف على مجموعة تقييم مصنّفة يدوياً (رسائل واقعية بلهجة سعودية).
//
// هذا هو حارس تعديلات القوائم: أي إضافة أو حذف في data/intents.json يمر من هنا،
// فإن هبطت الدقة تحت العتبة انكسر الاختبار بدل أن يُكتشف التراجع عند الموظف.
// العتبات أدنى من 100% عمداً حتى لا تتحول كل إضافة كلمة إلى معركة مع حالة حدية واحدة.
//
// مجموعتان، ولكل واحدة معنى مختلف:
//  • labeled-messages.json (110) — مجموعة الضبط: كُتبت بالتوازي مع قوائم الكلمات، فهي
//    تقيس «هل انكسر ما كان يعمل» لا «كيف يتصرف التطبيق أمام رسالة لم يرها أحد».
//  • labeled-messages.holdout.json (30) — مجموعة محجوزة كُتبت بعد تجميد القوائم ولم
//    تُستخدم لإضافة أي كلمة. هي الرقم الأقرب للواقع، والفجوة بينها وبين الأولى هي مقدار
//    الإفراط في المواءمة (overfitting).
//
// قاعدة المجموعة المحجوزة: لا تُضاف كلمة إلى data/intents.json لأن رسالة منها فشلت.
// الرسالة الفاشلة تُنقل إلى مجموعة الضبط ثم تُكتب رسالة محجوزة جديدة مكانها؛ وإلا صارت
// المحجوزة مجموعة ضبط ثانية وفقد رقمها معناه.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeArabic, detectTone, detectIntent } from '../js/analyzer.js';

const intents = JSON.parse(readFileSync(new URL('../data/intents.json', import.meta.url), 'utf8'));
const samples = JSON.parse(
    readFileSync(new URL('./fixtures/labeled-messages.json', import.meta.url), 'utf8'),
);
const holdout = JSON.parse(
    readFileSync(new URL('./fixtures/labeled-messages.holdout.json', import.meta.url), 'utf8'),
);

const TONE_THRESHOLD = 0.95;
const INTENT_THRESHOLD = 0.93;

// القياس الأول على المحجوزة (أكتوبر 2026): النية 17/28 = 61%، النبرة 22/30 = 73%،
// الاستعجال 30/30. العتبات أرضية تمنع التراجع عن هذا الرقم، لا هدف.
const HOLDOUT_TONE_THRESHOLD = 0.7;
const HOLDOUT_INTENT_THRESHOLD = 0.6;

function measure(set) {
    let tone = 0;
    let urgent = 0;
    let intent = 0;
    const withIntent = set.filter(s => s.intentId !== null);
    for (const sample of set) {
        const normalized = normalizeArabic(sample.text);
        const detected = detectTone(normalized, intents.toneIndicators);
        if (detected.primary === sample.tone) tone++;
        if (detected.urgent === sample.urgent) urgent++;
        if (sample.intentId !== null) {
            const top = detectIntent(normalized, intents.patterns)[0];
            if (top && top.id === sample.intentId) intent++;
        }
    }
    return {
        tone: tone / set.length,
        urgent: urgent / set.length,
        intent: intent / withIntent.length,
    };
}

test('دقة النبرة على مجموعة التقييم ≥ 95% والاستعجال مضبوط بالكامل', () => {
    const toneFails = [];
    const urgentFails = [];
    for (const sample of samples) {
        const tone = detectTone(normalizeArabic(sample.text), intents.toneIndicators);
        if (tone.primary !== sample.tone) {
            toneFails.push(`«${sample.text}» → ${tone.primary} (المتوقع ${sample.tone})`);
        }
        if (tone.urgent !== sample.urgent) {
            urgentFails.push(`«${sample.text}» → urgent=${tone.urgent}`);
        }
    }
    const accuracy = (samples.length - toneFails.length) / samples.length;
    assert.ok(
        accuracy >= TONE_THRESHOLD,
        `دقة النبرة ${(accuracy * 100).toFixed(0)}% تحت العتبة ${TONE_THRESHOLD * 100}%:\n${toneFails.join('\n')}`,
    );
    assert.deepEqual(urgentFails, [], 'علم الاستعجال أخطأ في هذه الرسائل');
});

test('دقة النية الأولى على الرسائل ذات النية المتوقعة ≥ 93%', () => {
    const withIntent = samples.filter(s => s.intentId !== null);
    const fails = [];
    for (const sample of withIntent) {
        const detected = detectIntent(normalizeArabic(sample.text), intents.patterns);
        const top = detected[0] ? detected[0].id : null;
        if (top !== sample.intentId) {
            fails.push(`«${sample.text}» → ${top} (المتوقع ${sample.intentId})`);
        }
    }
    const accuracy = (withIntent.length - fails.length) / withIntent.length;
    assert.ok(
        accuracy >= INTENT_THRESHOLD,
        `دقة النية ${(accuracy * 100).toFixed(0)}% تحت العتبة ${INTENT_THRESHOLD * 100}%:\n${fails.join('\n')}`,
    );
});

test('المجموعة المحجوزة: لا تراجع عن الدقة المقاسة على رسائل لم تُضبط عليها القوائم', () => {
    const result = measure(holdout);
    const pct = v => `${(v * 100).toFixed(0)}%`;
    assert.ok(result.intent >= HOLDOUT_INTENT_THRESHOLD, `دقة النية على المحجوزة ${pct(result.intent)}`);
    assert.ok(result.tone >= HOLDOUT_TONE_THRESHOLD, `دقة النبرة على المحجوزة ${pct(result.tone)}`);
    assert.equal(result.urgent, 1, 'علم الاستعجال أخطأ في المجموعة المحجوزة');
});

test('المجموعة المحجوزة لا تتداخل مع مجموعة الضبط', () => {
    const tuning = new Set(samples.map(s => normalizeArabic(s.text)));
    for (const sample of holdout) {
        assert.ok(!tuning.has(normalizeArabic(sample.text)), `رسالة مكررة في المجموعتين: ${sample.text}`);
    }
});

test('مجموعتا التقييم سليمتان: نبرات ونوايا معرّفة في data/intents.json', () => {
    const toneKeys = new Set([...Object.keys(intents.toneIndicators), 'neutral']);
    const intentIds = new Set(intents.patterns.map(p => p.id));
    for (const sample of [...samples, ...holdout]) {
        assert.ok(toneKeys.has(sample.tone), `نبرة غير معرّفة: ${sample.tone}`);
        if (sample.intentId !== null) {
            assert.ok(intentIds.has(sample.intentId), `نية غير معرّفة: ${sample.intentId}`);
        }
    }
});
