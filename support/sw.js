// ============================================
// EDMFire Support - Service Worker
// Caches support page assets for fast reload after first login
// ============================================

var CACHE_NAME = 'support-v2';

var CACHE_URLS = [
  '/support/',
  '/support/index.html',
  '/support/login.css',
  '/support/login.js',
  '/support/chats/',
  '/support/chats/index.html',
  '/support/chats/style.css',
  '/support/chats/script.js',
  '/support/common/firebase-init.js',
  '/support/common/host-auth.js',
  '/support/common/nav.js',
  '/firebase/auth.js',
  '/firebase/database.js',
  '/firebase/storage.js'
];

var FIREBASE_SDK_URLS = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js'
];

var FONT_URLS = [
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap'
];

// ============ INSTALL ============
self.addEventListener('install', function(event) {
  console.log('[SUPPORT-SW] Installing Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      var allUrls = CACHE_URLS.concat(FIREBASE_SDK_URLS).concat(FONT_URLS);
      return Promise.allSettled(
        allUrls.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[SUPPORT-SW] Failed to cache:', url, err);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

// ============ ACTIVATE ============
self.addEventListener('activate', function(event) {
  console.log('[SUPPORT-SW] Activating Service Worker...');
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
          .map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

// ============ FETCH ============
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // API calls — always network
  if (url.pathname.startsWith('/api/')) return;

  // Firebase SDK — stale-while-revalidate
  if (url.hostname === 'www.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          var fetchPromise = fetch(event.request).then(function(response) {
            if (response && response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(function() { return cached; });
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // Google Fonts — cache first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          if (cached) return cached;
          return fetch(event.request).then(function(response) {
            if (response && response.ok) cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // Own static assets — stale-while-revalidate
  if (url.hostname === self.location.hostname) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          var fetchPromise = fetch(event.request).then(function(response) {
            if (response && response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(function() { return cached; });
          return cached || fetchPromise;
        });
      })
    );
    return;
  }
});
