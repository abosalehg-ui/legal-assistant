// اختبارات توليد الرد وتحسين الصياغة.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestResponse, improveLanguage } from '../js/response.js';

const language = {
    openings: ['السلام عليكم ورحمة الله وبركاته،\n\nنشكر لكم تواصلكم.'],
    closings: ['\n\nمع خالص التحية والتقدير.'],
    colloquialToFormal: {
        'تروح': 'تذهب',
        'بتلاقي': 'ستجد',
        'اخوي': 'أخي الكريم',
        'بكره': 'غداً',
        'ما وصلني': 'لم يصلني',
    },
    legalTerms: {
        'المحكمه': 'الجهة العدلية المختصة',
        'القضية': 'الدعوى',
    },
};

const DEFAULT = 'رد افتراضي.';

test('suggestResponse: يستخدم نص الرد من بيانات النية', () => {
    const intents = [{ id: 'x', label: 'نية', responseText: 'نص الرد الخاص بالنية.' }];
    const out = suggestResponse('رسالة', [], intents, [], language, DEFAULT);
    assert.ok(out.includes('نص الرد الخاص بالنية.'));
    assert.ok(out.startsWith(language.openings[0]));
    assert.ok(out.endsWith(language.closings[0]));
});

test('suggestResponse: يعود للرد الافتراضي بلا نوايا أو بلا responseText', () => {
    assert.ok(suggestResponse('رسالة', [], [], [], language, DEFAULT).includes(DEFAULT));
    const intents = [{ id: 'x', label: 'نية', responseText: '' }];
    assert.ok(suggestResponse('رسالة', [], intents, [], language, DEFAULT).includes(DEFAULT));
});

test('suggestResponse: يدرج أرقام المرجع وأول ثلاث مواد فقط', () => {
    const entities = [
        { type: 'رقم طلب/مذكرة', value: '111' },
        { type: 'رقم طلب/مذكرة', value: '222' },
        { type: 'رقم جوال', value: '0512345678' },
    ];
    const articles = Array.from({ length: 5 }, (_, i) => ({
        number: `المادة ${i + 1}`,
        title: `عنوان ${i + 1}`,
    }));
    const out = suggestResponse('رسالة', articles, [], entities, language, DEFAULT);
    assert.ok(out.includes('(المرجع: 111، 222)'));
    assert.ok(!out.includes('0512345678'));
    assert.ok(out.includes('المادة 3'));
    assert.ok(!out.includes('المادة 4'));
});

test('improveLanguage: يحول العامية مع البادئات ويحترم حدود الكلمة', () => {
    const out = improveLanguage('اخوي وتروح المحكمه بكره وبتلاقي القضية', language);
    assert.ok(out.includes('أخي الكريم'));
    assert.ok(out.includes('وتذهب')); // بادئة الواو محفوظة
    assert.ok(out.includes('الجهة العدلية المختصة'));
    assert.ok(out.includes('غداً'));
    assert.ok(out.includes('ستجد'));
    assert.ok(out.includes('الدعوى'));
});

test('improveLanguage: لا يستبدل داخل كلمة أطول', () => {
    // «مشتروح» تحتوي «تروح» لكنها ليست كلمة مستقلة — يجب ألا تُستبدل.
    const out = improveLanguage('مشتروح', language);
    assert.ok(out.includes('مشتروح'));
});

test('improveLanguage: يضيف الافتتاحية والخاتمة عند غيابهما فقط', () => {
    const out = improveLanguage('نص بلا تحية', language);
    assert.ok(out.startsWith(language.openings[0]));
    assert.ok(out.endsWith(language.closings[0]));

    const already = 'السلام عليكم ورحمة الله، نصكم. مع خالص التقدير.';
    const out2 = improveLanguage(already, language);
    assert.equal(out2.split('السلام عليكم').length - 1, 1);
    assert.ok(!out2.endsWith(language.closings[0]));
});
