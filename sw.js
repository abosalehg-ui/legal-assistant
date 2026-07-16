// Service Worker: يخزّن أصول التطبيق ليعمل دون اتصال.
// الاستراتيجية: الشبكة أولاً مع التخزين عند النجاح والرجوع للنسخة المخزنة عند الانقطاع —
// يضمن أحدث نسخة عند توفر الاتصال ويبقي التطبيق عاملاً بدونه.

const CACHE_NAME = 'legal-assistant-v1';

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

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;

    event.respondWith(
        fetch(request)
            .then(response => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
                }
                return response;
            })
            .catch(() => caches.match(request, { ignoreSearch: true })),
    );
});
