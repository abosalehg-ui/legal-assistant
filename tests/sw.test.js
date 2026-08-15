// اختبارات Service Worker: يُحمَّل بـ self وcaches وfetch مُحاكاة.
// الهدف الأساسي: ألا يمرَّر undefined إلى respondWith عند غياب النسخة المخزّنة —
// كان ذلك يرمي TypeError ويظهر للموظف كخطأ شبكة خام بدل رسالة مفهومة.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const ORIGIN = 'https://example.test';

const cacheStore = new Map();
let networkHandler = null;
const putCalls = [];

const fakeCache = {
    addAll: async () => {},
    put: async (request, response) => {
        putCalls.push(keyOf(request));
        cacheStore.set(keyOf(request), response);
    },
    keys: async () => Array.from(cacheStore.keys()),
};

function keyOf(request) {
    return new URL(typeof request === 'string' ? request : request.url).pathname;
}

function makeResponse(body, { status = 200 } = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        body,
        clone() { return makeResponse(body, { status }); },
    };
}

function makeRequest(url, { method = 'GET', mode = 'no-cors', accept = '' } = {}) {
    return { url: `${ORIGIN}${url}`, method, mode, headers: { get: () => accept } };
}

const listeners = {};

globalThis.self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
};
globalThis.caches = {
    open: async () => fakeCache,
    keys: async () => ['legal-assistant-v1', 'legal-assistant-v2'],
    delete: async () => true,
    match: async request => cacheStore.get(keyOf(request)),
};
globalThis.fetch = async request => {
    if (!networkHandler) throw new TypeError('Failed to fetch');
    return networkHandler(request);
};
globalThis.Response = class {
    constructor(body, init = {}) {
        this.body = body;
        this.status = init.status ?? 200;
        this.ok = this.status >= 200 && this.status < 300;
        this.headers = new Map(Object.entries(init.headers || {}));
    }
};

await import('../sw.js');

// يشغّل معالج fetch ويعيد ما مُرِّر فعلياً إلى respondWith.
async function handleFetch(request) {
    let responded;
    listeners.fetch({ request, respondWith: value => { responded = value; } });
    return responded === undefined ? undefined : await responded;
}

beforeEach(() => {
    cacheStore.clear();
    putCalls.length = 0;
    networkHandler = null;
});

test('غياب النسخة المخزّنة وانقطاع الشبكة يعطي 503 مفهوماً لا undefined', async () => {
    const response = await handleFetch(makeRequest('/data/missing.json'));
    assert.notEqual(response, undefined, 'respondWith لا يستقبل undefined أبداً');
    assert.equal(response.status, 503);
    assert.match(String(response.body), /غير متاح دون اتصال/);
});

test('طلب مستند فاشل يعطي صفحة HTML عربية بدل نص خام', async () => {
    const response = await handleFetch(makeRequest('/index.html', { mode: 'navigate' }));
    assert.equal(response.status, 503);
    assert.match(String(response.body), /dir="rtl"/);
    assert.match(String(response.body), /افتح التطبيق مرة واحدة وأنت متصل/);
});

test('الأصول الثابتة: النسخة المخزّنة تُعرض بلا لمس الشبكة', async () => {
    cacheStore.set('/css/styles.css', makeResponse('cached-css'));
    let networkCalls = 0;
    networkHandler = () => { networkCalls++; return makeResponse('fresh-css'); };

    const response = await handleFetch(makeRequest('/css/styles.css'));
    assert.equal(response.body, 'cached-css');
    assert.equal(networkCalls, 0, 'cache-first: لا انتظار للشبكة عند وجود نسخة');
});

test('الأصول الثابتة غير المخزّنة تُجلب وتُخزَّن', async () => {
    networkHandler = () => makeResponse('fresh-js');
    const response = await handleFetch(makeRequest('/js/app.js'));
    assert.equal(response.body, 'fresh-js');
    assert.ok(putCalls.includes('/js/app.js'));
});

test('ملفات البيانات: المخزّن يُعرض فوراً والتحديث يجري بالخلفية', async () => {
    cacheStore.set('/data/articles.json', makeResponse('old-data'));
    networkHandler = () => makeResponse('new-data');

    const response = await handleFetch(makeRequest('/data/articles.json'));
    assert.equal(response.body, 'old-data', 'stale-while-revalidate يعرض المخزّن أولاً');

    await new Promise(resolve => setImmediate(resolve));
    assert.ok(putCalls.includes('/data/articles.json'), 'والتحديث يُكتب بالخلفية');
});

test('ملفات البيانات بلا نسخة مخزّنة تعود للشبكة', async () => {
    networkHandler = () => makeResponse('fresh-data');
    const response = await handleFetch(makeRequest('/data/intents.json'));
    assert.equal(response.body, 'fresh-data');
});

test('لا يُخزَّن رد فاشل من الشبكة', async () => {
    networkHandler = () => makeResponse('not found', { status: 404 });
    const response = await handleFetch(makeRequest('/js/missing.js'));
    assert.equal(response.status, 404);
    assert.equal(putCalls.length, 0, 'تخزين 404 يفسد الكاش');
});

test('يتجاهل غير GET والأصول الخارجية وسكربت الـ SW نفسه', async () => {
    assert.equal(await handleFetch(makeRequest('/api', { method: 'POST' })), undefined);
    assert.equal(await handleFetch({
        url: 'https://other.test/x.js', method: 'GET', mode: 'no-cors', headers: { get: () => '' },
    }), undefined);
    // تخزين sw.js نفسه يمنع وصول الإصدارات الجديدة
    assert.equal(await handleFetch(makeRequest('/sw.js')), undefined);
});

test('activate يمسح إصدارات الكاش القديمة فقط', async () => {
    const deleted = [];
    globalThis.caches.delete = async key => { deleted.push(key); return true; };
    let done;
    listeners.activate({ waitUntil: promise => { done = promise; } });
    await done;
    assert.deepEqual(deleted, ['legal-assistant-v1'], 'الإصدار الحالي يبقى');
});
