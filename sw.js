// Service Worker: يخزّن أصول التطبيق ليعمل دون اتصال.
//
// الاستراتيجية مقسومة حسب نوع المورد بدل «الشبكة أولاً» للكل:
//  • الأصول الثابتة (CSS/JS/خطوط/أيقونات) → cache-first: إقلاع فوري بلا انتظار الشبكة.
//    تحديثها مضمون لأن كل إصدار يستخدم CACHE_NAME جديداً و activate يمسح القديم.
//  • المستند وملفات البيانات → stale-while-revalidate: يُعرض المخزّن فوراً ويُحدَّث بالخلفية.
// كان «الشبكة أولاً» للكل يعني انتظار الشبكة في كل زيارة حتى مع وجود نسخة صالحة.

const CACHE_NAME = 'legal-assistant-v2';

const CORE_ASSETS = [
    './',
    './index.html',
    './manifest.webmanifest',
    './icon.svg',
    './css/fonts.css',
    './css/themes.css',
    './css/styles.css',
    './css/print.css',
    './js/app.js',
    './js/data.js',
    './js/store.js',
    './js/safe-storage.js',
    './js/format.js',
    './js/analyzer.js',
    './js/response.js',
    './js/storage.js',
    './js/ui.js',
    './js/theme.js',
    './js/shortcuts.js',
    './js/admin.js',
    './data/articles.json',
    './data/templates.json',
    './data/intents.json',
    './data/colloquial-map.json',
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then(cache => cache.addAll(CORE_ASSETS))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches
            .keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
            .then(() => self.clients.claim()),
    );
});

// رد بديل مفهوم بدل تمرير undefined إلى respondWith (الذي يرمي TypeError ويظهر كخطأ شبكة خام).
function offlineResponse(request) {
    const accept = request.headers.get('accept') || '';
    if (request.mode === 'navigate' || accept.includes('text/html')) {
        return new Response(
            '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">'
            + '<title>غير متاح دون اتصال</title>'
            + '<p style="font-family:system-ui,sans-serif;text-align:center;padding:3rem 1rem;line-height:1.9">'
            + '⚠️<br>هذه الصفحة غير متاحة دون اتصال.<br>افتح التطبيق مرة واحدة وأنت متصل ليُخزَّن للعمل بلا إنترنت.</p>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
        );
    }
    return new Response('غير متاح دون اتصال', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
}

async function putInCache(request, response) {
    if (!response || !response.ok) return;
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
}

async function cacheFirst(request) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
        const response = await fetch(request);
        await putInCache(request, response);
        return response;
    } catch {
        return offlineResponse(request);
    }
}

async function staleWhileRevalidate(request) {
    const cached = await caches.match(request, { ignoreSearch: true });
    const networkPromise = fetch(request)
        .then(async response => {
            await putInCache(request, response);
            return response;
        })
        .catch(() => null);

    // النسخة المخزّنة تُعرض فوراً والتحديث يجري بالخلفية.
    if (cached) return cached;

    const response = await networkPromise;
    return response || offlineResponse(request);
}

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;

    let url;
    try {
        url = new URL(request.url);
    } catch {
        return;
    }
    if (url.origin !== self.location.origin) return;

    // سكربت الـ SW نفسه لا يُخزَّن أبداً حتى لا يمنع تحديث الإصدار.
    if (url.pathname.endsWith('/sw.js')) return;

    const isDocument = request.mode === 'navigate';
    const isData = url.pathname.endsWith('.json');

    event.respondWith(
        isDocument || isData ? staleWhileRevalidate(request) : cacheFirst(request),
    );
});
