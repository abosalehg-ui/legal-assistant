// اختبارات وحدة المحلل: التطبيع، الكلمات، النوايا، النبرة، الكيانات، ترتيب المواد.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeArabic,
    extractKeywords,
    detectIntent,
    detectTone,
    extractEntities,
    findRelevantArticles,
} from '../js/analyzer.js';

test('normalizeArabic: توحيد الهمزات والتاء المربوطة وإزالة التشكيل والتطويل', () => {
    assert.equal(normalizeArabic('إبْلاغ'), 'ابلاغ');
    assert.equal(normalizeArabic('أحكام'), 'احكام');
    assert.equal(normalizeArabic('آمل'), 'امل');
    assert.equal(normalizeArabic('جلسة'), 'جلسه');
    assert.equal(normalizeArabic('مبنى'), 'مبني');
    assert.equal(normalizeArabic('مؤجل'), 'موجل');
    assert.equal(normalizeArabic('مسؤولية'), 'مسووليه');
    assert.equal(normalizeArabic('مـــرافعة'), 'مرافعه');
});

test('extractKeywords: يجمع الكلمة الرئيسية عند ورود أي مرادف', () => {
    const synonyms = {
        'تبليغ': ['تبليغ', 'إشعار', 'بلغوني'],
        'جلسة': ['جلسة', 'قعدة'],
        'حكم': ['صك'],
    };
    const text = normalizeArabic('ما وصلني إشعار عن القعدة');
    const found = extractKeywords(text, synonyms);
    assert.deepEqual(found.sort(), ['تبليغ', 'جلسة']);
});

test('detectIntent: يعيد النية بحقول البيانات (slug/label/boosts/response) مرتبة بالدرجة', () => {
    const patterns = [
        {
            id: 'session-date',
            label: 'استفسار عن موعد جلسة',
            keywords: ['موعد الجلسة', 'وين جلستي'],
            priority: 10,
            boostCategories: { 'الجلسات': 20 },
            responseText: 'رد الجلسة',
        },
        {
            id: 'delayed-reply',
            label: 'شكوى من تأخر الرد',
            keywords: ['ما ردوا'],
            priority: 9,
            boostCategories: {},
            responseText: 'رد التأخير',
        },
    ];
    const text = normalizeArabic('وين جلستي وما ردوا علي عن موعد الجلسة');
    const detected = detectIntent(text, patterns);
    assert.equal(detected[0].id, 'session-date');
    assert.equal(detected[0].label, 'استفسار عن موعد جلسة');
    assert.equal(detected[0].score, 20);
    assert.equal(detected[0].responseText, 'رد الجلسة');
    assert.deepEqual(detected[0].boostCategories, { 'الجلسات': 20 });
    assert.equal(detected[1].id, 'delayed-reply');
});

test('detectIntent: يقتصر على أعلى ثلاث نوايا', () => {
    const patterns = Array.from({ length: 5 }, (_, i) => ({
        id: `p${i}`,
        label: `نية ${i}`,
        keywords: ['كلمة'],
        priority: i + 1,
    }));
    const detected = detectIntent(normalizeArabic('كلمة'), patterns);
    assert.equal(detected.length, 3);
    assert.equal(detected[0].id, 'p4');
});

test('detectTone: يحدد النبرة السائدة ويلتقط الاستعجال', () => {
    const indicators = {
        complaint: ['ظلم', 'متضرر'],
        inquiry: ['كيف', 'متى'],
        request: ['أرجو'],
        urgent: ['عاجل'],
    };
    const tone = detectTone(normalizeArabic('أنا متضرر وواقع علي ظلم والموضوع عاجل، كيف أعترض؟'), indicators);
    assert.equal(tone.primary, 'complaint');
    assert.equal(tone.urgent, true);
});

test('detectTone: لا ينكسر عند إضافة نبرة جديدة في JSON ولا عند نص محايد', () => {
    const indicators = { complaint: ['ظلم'], gratitude: ['شاكر'], urgent: ['عاجل'] };
    const tone = detectTone(normalizeArabic('أنا شاكر لكم تعاونكم'), indicators);
    assert.equal(tone.primary, 'gratitude');
    const neutral = detectTone('نص عادي تماماً', indicators);
    assert.equal(neutral.primary, 'neutral');
    assert.equal(neutral.urgent, false);
});

test('detectTone: لا يطابق داخل الكلمات — «مهلة» ليست «هل» و«سؤال» داخل كلمة لا يُحسب', () => {
    const indicators = {
        inquiry: ['هل', 'كيف'],
        request: ['أرجو', 'إمهال'],
    };
    const tone = detectTone(normalizeArabic('أرجو إعطائي مهلة إضافية'), indicators);
    assert.equal(tone.primary, 'request');
    assert.equal(tone.scores.inquiry, 0, '«هل» يجب ألا تطابق داخل «مهلة»');
});

test('detectTone: الشكل الكائني يعمل والتعادل يُكسر بالأولوية لا بترتيب المفاتيح', () => {
    // inquiry قبل complaint في الترتيب عمداً — الأولوية الأعلى هي التي يجب أن تحسم.
    const indicators = {
        inquiry: { label: 'استفسار', priority: 2, words: ['كيف'] },
        complaint: { label: 'شكوى / اعتراض', priority: 3, words: ['ظلم'] },
        urgent: { words: ['عاجل'] },
    };
    const tone = detectTone(normalizeArabic('كيف يقع هذا الظلم؟ الأمر عاجل'), indicators);
    assert.equal(tone.primary, 'complaint');
    assert.equal(tone.label, 'شكوى / اعتراض');
    assert.equal(tone.urgent, true);
});

test('detectTone: السوابق تُقبل قبل كلمات النبرة (ال التعريف وواو العطف)', () => {
    const indicators = { complaint: ['تأخير'], inquiry: ['متى'] };
    assert.equal(detectTone(normalizeArabic('أشتكي من التأخير المتكرر'), indicators).primary, 'complaint');
    assert.equal(detectTone(normalizeArabic('وتأخير الرد مستمر'), indicators).primary, 'complaint');
});

test('extractEntities: يستخرج الأنواع الأربعة ولا يكرر الرقم الواحد بنوعين', () => {
    const text = 'مذكرة رقم 251934827 بتاريخ 20/6/1447 وجوالي 0512345678 وهويتي 1098765432';
    const entities = extractEntities(text);
    const byType = t => entities.filter(e => e.type === t).map(e => e.value);
    assert.deepEqual(byType('رقم طلب/مذكرة'), ['251934827']);
    assert.deepEqual(byType('تاريخ'), ['20/6/1447']);
    assert.deepEqual(byType('رقم جوال'), ['0512345678']);
    assert.deepEqual(byType('رقم هوية'), ['1098765432']);
    // الجوال والهوية أرقام من 10 خانات — يجب ألا تظهر أيضاً كرقم طلب.
    assert.equal(entities.length, 4);
});

const sampleArticles = [
    { id: '1', number: 'المادة 1', title: 'مدة الجلسة', text: 'تكون مدة الجلسة ثلاثين دقيقة', category: 'الجلسات', keywords: ['جلسة', 'مدة'] },
    { id: '2', number: 'المادة 2', title: 'التبليغ بالعنوان', text: 'يعد التبليغ بالعنوان الوطني تبليغاً', category: 'التبليغ', keywords: ['تبليغ', 'عنوان وطني'] },
    { id: '3', number: 'المادة 3', title: 'سقوط الاستئناف', text: 'يسقط الحق في الاستئناف بمضي المدة', category: 'الاعتراض', keywords: ['استئناف', 'اعتراض'] },
];

test('findRelevantArticles: تطابق الكلمات يرفع الدرجة والفئة المعززة تتقدم', () => {
    const intents = [{ id: 'session-date', boostCategories: { 'الجلسات': 20 } }];
    const results = findRelevantArticles(sampleArticles, ['جلسة'], intents);
    assert.equal(results[0].id, '1');
    assert.ok(results[0].score >= 35); // 15 تطابق تام + 20 تعزيز فئة
    assert.ok(results.every(a => a.score > 0));
});

test('findRelevantArticles: بلا نوايا يعتمد على الكلمات فقط ويستبعد عديم الصلة', () => {
    const results = findRelevantArticles(sampleArticles, ['تبليغ'], []);
    assert.equal(results[0].id, '2');
    assert.ok(!results.find(a => a.id === '1'));
});
