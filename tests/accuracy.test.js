// اختبار دقة التصنيف على مجموعة تقييم مصنّفة يدوياً (رسائل واقعية بلهجة سعودية).
//
// هذا هو حارس تعديلات القوائم: أي إضافة أو حذف في data/intents.json يمر من هنا،
// فإن هبطت الدقة تحت العتبة انكسر الاختبار بدل أن يُكتشف التراجع عند الموظف.
// العتبات أدنى من 100% عمداً حتى لا تتحول كل إضافة كلمة إلى معركة مع حالة حدية واحدة.
//
// تنبيه على قراءة الرقم: مجموعة التقييم كُتبت بالتوازي مع قوائم الكلمات، فهي تقيس
// «هل انكسر ما كان يعمل» لا «كيف يتصرف التطبيق أمام رسالة لم يرها أحد». الرقم
// الحقيقي يأتي من رسائل واردة فعلية تُضاف إلى الملف كلما ظهر تصنيف خاطئ عند العمل.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeArabic, detectTone, detectIntent } from '../js/analyzer.js';

const intents = JSON.parse(readFileSync(new URL('../data/intents.json', import.meta.url), 'utf8'));
const samples = JSON.parse(readFileSync(new URL('./fixtures/labeled-messages.json', import.meta.url), 'utf8'));

const TONE_THRESHOLD = 0.95;
const INTENT_THRESHOLD = 0.93;

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

test('مجموعة التقييم نفسها سليمة: نبرات ونوايا معرّفة في data/intents.json', () => {
    const toneKeys = new Set([...Object.keys(intents.toneIndicators), 'neutral']);
    const intentIds = new Set(intents.patterns.map(p => p.id));
    for (const sample of samples) {
        assert.ok(toneKeys.has(sample.tone), `نبرة غير معرّفة: ${sample.tone}`);
        if (sample.intentId !== null) {
            assert.ok(intentIds.has(sample.intentId), `نية غير معرّفة: ${sample.intentId}`);
        }
    }
});
