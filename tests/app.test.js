// اختبارات تكامل لطبقة الربط (app.js): الصفحة الحقيقية + البيانات الحقيقية في jsdom.
//
// app.js كان بلا أي اختبار، وفيه وقعت أخطاء مراجعة أكتوبر 2026 كلها تقريباً: «مسح»
// يبقي رقم المستفيد السابق فيملأ القالب التالي، وإضافة «المادة 1/1» تُتخطى بصمت إذا ورد
// في الرد «المادة 1/11». هذه أخطاء في الحدود بين الوحدات، فلا تلتقطها اختبارات الوحدات.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');

const dom = new JSDOM(html, { url: 'https://example.test/' });
const { window } = dom;

globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
globalThis.CustomEvent = window.CustomEvent;
globalThis.Blob = window.Blob;
globalThis.URL = window.URL;
// jsdom لا يوفّر CSS.escape — صيغة مبسطة تكفي معرّفات المواد (1/1 و 2/3 ...).
globalThis.CSS = { escape: value => String(value).replace(/[^\w-]/g, ch => `\\${ch}`) };
window.print = () => {};
// البيانات تُقرأ من القرص بدل الشبكة: نفس الملفات التي يخدمها التطبيق فعلاً.
globalThis.fetch = async path => {
    const body = readFileSync(new URL(path, root), 'utf8');
    return { ok: true, json: async () => JSON.parse(body) };
};

await import('../js/app.js');
document.dispatchEvent(new window.Event('DOMContentLoaded'));

const $ = id => document.getElementById(id);

// start() غير متزامنة (تحميل البيانات): ننتظر حتى يرتفع aria-busy.
async function waitUntilLoaded() {
    for (let i = 0; i < 200; i++) {
        if ($('mainContainer').getAttribute('aria-busy') === 'false') return;
        await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error('لم يكتمل تحميل التطبيق');
}
await waitUntilLoaded();

function click(el) {
    el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

function analyze(message) {
    $('beneficiaryMessage').value = message;
    click($('analyzeBtn'));
}

function useTemplate(id) {
    click(document.querySelector(`.template-card[data-id="${id}"]`));
}

const CLOSE_REQUEST_TEMPLATE = 4; // «إغلاق طلب» — نصه فيه [رقم الطلب]

beforeEach(() => {
    click($('clearInputBtn'));
});

test('التحليل يملأ [رقم الطلب] في القالب من الرسالة الحالية', () => {
    analyze('أبغى أعرف وش صار على طلب رقم 4521987');
    useTemplate(CLOSE_REQUEST_TEMPLATE);
    assert.match($('finalOutput').value, /طلبكم رقم 4521987/);
});

test('«مسح» يمسح التحليل كله: القالب التالي لا يحمل رقم المستفيد السابق', () => {
    analyze('أبغى أعرف وش صار على طلب رقم 4521987');
    click($('clearInputBtn'));
    useTemplate(CLOSE_REQUEST_TEMPLATE);
    const output = $('finalOutput').value;
    assert.ok(!output.includes('4521987'), 'رقم المستفيد السابق انتقل إلى القالب');
    assert.ok(output.includes('[رقم الطلب]'), 'الحقل يبقى فارغاً ليعبّئه الموظف');
});

test('جوال المستفيد لا يُكتب في الرد المقترح كرقم مرجعي', () => {
    analyze('متى موعد جلستي جوالي 00966512345678');
    const output = $('finalOutput').value;
    assert.ok(!output.includes('00966512345678'), output);
    assert.ok(!output.includes('(المرجع:'), 'لا مرجع في رسالة ليس فيها رقم طلب');
});

test('الحفظ بعد «مسح» لا يسجّل فئة التحليل السابق ولا نبرته', () => {
    localStorage.clear();
    analyze('متى موعد الجلسة القادمة؟ ضروري');
    click($('clearInputBtn'));
    $('finalOutput').value = 'رد جديد لمستفيد آخر';
    click($('saveBtn'));
    const [saved] = JSON.parse(localStorage.getItem('savedResponses'));
    assert.equal(saved.text, 'رد جديد لمستفيد آخر');
    assert.equal(saved.category, null);
    assert.equal(saved.tone, null);
    assert.equal(saved.urgent, false);
});

test('إضافة «المادة 1/1» تعمل ولو كان الرد يذكر «المادة 1/11»', () => {
    click(document.querySelector('.category-btn[data-category="all"]'));
    $('finalOutput').value = 'نص الرد\n\n📚 السند النظامي:\n• المادة 1/11: التبليغ';
    click(document.querySelector('.article-item[data-id="1/1"]'));
    click($('addArticleBtn'));
    const output = $('finalOutput').value;
    assert.ok(output.includes('📌 المادة 1/1:'), 'المادة 1/1 لم تُضف');

    // والإضافة الثانية للمادة نفسها لا تكررها.
    click($('addArticleBtn'));
    assert.equal($('finalOutput').value.split('📌 المادة 1/1:').length - 1, 1);
});
