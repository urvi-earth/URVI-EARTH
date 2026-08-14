/* =====================================================
   URVI – sw.js  |  Next-Gen PWA Service Worker & Offline Cache
   ===================================================== */

const CACHE_NAME = 'urvi-pwa-v3';

// Core Application Shell Assets
const PRECACHE_ASSETS = [
    './',
    './index.html',
    './index/index.css',
    './index/index.js',
    './manifest.json',
    './assets/logo.png',
    './components/translator.css',
    './components/translator.js',
    './components/theme-toggle.js',
    './components/drawer.js',
    './components/pwa.js',
    './components/notifications.js',
    './components/support-modal.js',
    './community/community.html',
    './community/community.css',
    './community/community.js',
    './activities/activities.html',
    './impact/impact.html',
    './profile/profile.html',
    './profile/mycertificates.html',
    './profile/my-virtual-tree.html',
    './notifications/notifications.html',
    './logins/login.html',
    'https://fonts.googleapis.com/css2?family=Alex+Brush&family=Cinzel:wght@600;700;800;900&family=Cormorant+Garamond:ital,wght@0,600;0,700;1,500&family=Poppins:wght@400;500;600;700;800&display=swap',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css'
];

// Domains / APIs that must NEVER be intercepted or cached statically
const BYPASS_DOMAINS = [
    'firebaseio.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'cloudinary.com',
    'res.cloudinary.com',
    'api.cloudinary.com',
    'nominatim.openstreetmap.org',
    'firestore.googleapis.com'
];

// 1. Install Event: Pre-cache Essential Shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return Promise.all(
                PRECACHE_ASSETS.map((url) => {
                    return cache.add(url).catch((err) => {
                        console.warn(`[URVI SW] Precache skipped for ${url}:`, err);
                    });
                })
            );
        })
    );
    self.skipWaiting();
});

// 2. Activate Event: Clean Out Old Caches & Take Immediate Control
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log(`[URVI SW] Removing legacy cache: ${key}`);
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// 3. Fetch Event: Intelligent Strategy Router
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = request.url;

    // Only handle GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Bypass real-time database, auth, and external upload APIs
    if (BYPASS_DOMAINS.some(domain => url.includes(domain))) {
        return;
    }

    // A. Navigation / HTML Page Requests: Network-First with Offline Cache Fallback
    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                    }
                    return networkResponse;
                })
                .catch(async () => {
                    const cachedResponse = await caches.match(request);
                    if (cachedResponse) return cachedResponse;
                    // Fallback to cached index.html
                    return caches.match('./index.html') || caches.match('/index.html');
                })
        );
        return;
    }

    // B. Fonts, CDNs & Web Icons: Cache-First
    if (
        url.includes('fonts.googleapis.com') ||
        url.includes('fonts.gstatic.com') ||
        url.includes('cdn.jsdelivr.net') ||
        url.includes('cdnjs.cloudflare.com') ||
        url.endsWith('.woff') ||
        url.endsWith('.woff2') ||
        url.endsWith('.ttf')
    ) {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;
                return fetch(request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                    }
                    return networkResponse;
                });
            })
        );
        return;
    }

    // C. Static App Assets (CSS, JS, Images): Stale-While-Revalidate
    if (
        url.endsWith('.css') ||
        url.endsWith('.js') ||
        url.endsWith('.png') ||
        url.endsWith('.jpg') ||
        url.endsWith('.jpeg') ||
        url.endsWith('.svg') ||
        url.endsWith('.webp') ||
        url.endsWith('.json')
    ) {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                const fetchPromise = fetch(request)
                    .then((networkResponse) => {
                        if (networkResponse && networkResponse.status === 200) {
                            const responseClone = networkResponse.clone();
                            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                        }
                        return networkResponse;
                    })
                    .catch(() => null);

                return cachedResponse || fetchPromise;
            })
        );
        return;
    }
});
