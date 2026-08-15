// اختبارات طبقة العرض (jsdom): التهريب، حالة aria، حبس التركيز، نافذة التأكيد.
// هذي الطبقة كانت بلا تغطية، وفيها وقعت أخطاء aria-pressed والتهريب في الخصائص.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html lang="ar" dir="rtl"><body></body></html>', {
    url: 'https://example.test/',
});

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.Blob = dom.window.Blob;
globalThis.URL = dom.window.URL;
globalThis.localStorage = dom.window.localStorage;

const {
    escapeHtml,
    renderArticles,
    renderSavedResponses,
    renderCategoryFilter,
    renderTemplates,
    openModal,
    closeModal,
    closeAllModals,
    confirmDialog,
    setBusy,
} = await import('../js/ui.js');

function resetDom() {
    document.body.className = '';
    document.body.innerHTML = `
        <main id="mainContainer"></main>
        <div id="articlesContainer"></div>
        <div id="savedList"></div>
        <div id="categoryFilter"></div>
        <div id="templatesGrid"></div>
        <div id="toast"></div>
        <div class="modal-overlay" id="testModal">
            <div class="modal">
                <button id="firstBtn">أول</button>
                <button id="lastBtn">آخر</button>
            </div>
        </div>
        <div class="modal-overlay" id="confirmModal">
            <div class="modal">
                <p id="confirmModalMessage"></p>
                <button id="confirmCancel">إلغاء</button>
                <button id="confirmOk">تأكيد</button>
            </div>
        </div>`;
}

beforeEach(resetDom);

const article = (over = {}) => ({
    id: 'a1', number: 'المادة 1', title: 'عنوان', text: 'نص المادة',
    category: 'التبليغ', keywords: [], sourceUrl: '', ...over,
});

test('escapeHtml: يهرّب الأحرف الخمسة بما فيها الاقتباس (سياق الخصائص)', () => {
    assert.equal(escapeHtml('<b>'), '&lt;b&gt;');
    assert.equal(escapeHtml('x" onmouseover="alert(1)'), 'x&quot; onmouseover=&quot;alert(1)');
    assert.equal(escapeHtml("it's"), 'it&#39;s');
    assert.equal(escapeHtml('a&b'), 'a&amp;b');
    assert.equal(escapeHtml(null), '');
});

test('renderArticles: لا يسمح بالخروج من الخاصية عبر id خبيث', () => {
    renderArticles([article({ id: 'x" onmouseover="alert(1)' })], []);
    const item = document.querySelector('.article-item');
    // القيمة تصل كنص كامل في الخاصية، ولا تتحول إلى خاصية حدث منفصلة
    assert.equal(item.dataset.id, 'x" onmouseover="alert(1)');
    assert.equal(item.getAttribute('onmouseover'), null);
});

test('renderArticles: يضبط aria-pressed حسب التحديد فعلياً', () => {
    renderArticles([article({ id: 'a1' }), article({ id: 'a2' })], ['a2']);
    const items = document.querySelectorAll('.article-item');
    assert.equal(items[0].getAttribute('aria-pressed'), 'false');
    assert.equal(items[1].getAttribute('aria-pressed'), 'true');
    assert.ok(items[1].classList.contains('selected'));
});

test('renderArticles: يعرض رابط المصدر الآمن فقط', () => {
    renderArticles([article({ sourceUrl: 'https://laws.boe.gov.sa/x' })], []);
    assert.ok(document.querySelector('.article-source'));

    renderArticles([article({ sourceUrl: 'javascript:alert(1)' })], []);
    assert.equal(document.querySelector('.article-source'), null);
});

test('renderArticles: شارة التحقق تصبح تحذيرية بعد سنة', () => {
    renderArticles([article({ lastVerified: '2024-01-01' })], []);
    assert.ok(document.querySelector('.article-verified.stale'), 'القديم يُوسم');

    const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    renderArticles([article({ lastVerified: recent })], []);
    assert.ok(document.querySelector('.article-verified'));
    assert.equal(document.querySelector('.article-verified.stale'), null);

    renderArticles([article()], []);
    assert.equal(document.querySelector('.article-verified'), null, 'بلا حقل لا شارة');
});

test('renderArticles: حالة فارغة عند غياب النتائج', () => {
    renderArticles([], []);
    assert.ok(document.querySelector('.empty-state'));
});

test('renderSavedResponses/renderTemplates: تهريب المعرّفات والنصوص', () => {
    renderSavedResponses([
        { id: 7, text: 'نص كامل طويل', preview: '<script>x</script>', date: '١ محرم ١٤٤٨' },
    ]);
    assert.equal(document.querySelector('#savedList script'), null);
    assert.equal(document.querySelector('button[data-action="load"]').dataset.id, '7');

    renderTemplates([{ id: 1, icon: '📄', name: '<img src=x onerror=y>' }]);
    assert.equal(document.querySelector('#templatesGrid img'), null);
});

test('renderCategoryFilter: يحافظ على الفئة النشطة بعد إعادة البناء', () => {
    renderCategoryFilter(['التبليغ', 'الجلسات'], 'الجلسات');
    const active = document.querySelectorAll('.category-btn.active');
    assert.equal(active.length, 1);
    assert.equal(active[0].dataset.category, 'الجلسات');

    renderCategoryFilter(['التبليغ'], 'all');
    assert.equal(document.querySelector('.category-btn.active').dataset.category, 'all');
});

test('openModal/closeModal: يفتح ويعيد التركيز للعنصر السابق', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    openModal('testModal');
    assert.ok(document.getElementById('testModal').classList.contains('show'));

    closeModal('testModal');
    assert.ok(!document.getElementById('testModal').classList.contains('show'));
    assert.equal(document.activeElement, trigger, 'التركيز يعود لمن فتح النافذة');
});

test('closeAllModals: يغلق كل المفتوح ويُطلق modal:close', () => {
    let closed = 0;
    document.getElementById('testModal').addEventListener('modal:close', () => { closed++; });
    openModal('testModal');
    closeAllModals();
    assert.equal(closed, 1);
    assert.equal(document.querySelectorAll('.modal-overlay.show').length, 0);
});

test('confirmDialog: يعيد true عند التأكيد و false عند الإلغاء', async () => {
    const accepted = confirmDialog('هل تريد الحذف؟');
    assert.equal(document.getElementById('confirmModalMessage').textContent, 'هل تريد الحذف؟');
    document.getElementById('confirmOk').click();
    assert.equal(await accepted, true);

    const rejected = confirmDialog('مرة ثانية');
    document.getElementById('confirmCancel').click();
    assert.equal(await rejected, false);
});

test('confirmDialog: الإغلاق بـ Esc أو النقر خارجاً يحسم الوعد بـ false', async () => {
    const pending = confirmDialog('سيُغلق بالهروب');
    closeAllModals();
    assert.equal(await pending, false, 'لا يبقى الوعد معلقاً');
});

test('confirmDialog: لا يتسرب مستمع بين النداءات المتتالية', async () => {
    const first = confirmDialog('أول');
    document.getElementById('confirmOk').click();
    assert.equal(await first, true);

    const second = confirmDialog('ثانٍ');
    document.getElementById('confirmCancel').click();
    assert.equal(await second, false);

    // نقرة إضافية بعد الحسم يجب ألا تفعل شيئاً
    document.getElementById('confirmOk').click();
    assert.equal(document.getElementById('confirmModal').classList.contains('show'), false);
});

test('setBusy: يضبط aria-busy وصنف التحميل', () => {
    setBusy(true);
    assert.equal(document.getElementById('mainContainer').getAttribute('aria-busy'), 'true');
    assert.ok(document.body.classList.contains('app-loading'));

    setBusy(false);
    assert.equal(document.getElementById('mainContainer').getAttribute('aria-busy'), 'false');
    assert.ok(!document.body.classList.contains('app-loading'));
});
