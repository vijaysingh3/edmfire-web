// ============================================
// EDMFire User Help Chat - Service Worker
// Static assets cache karta hai for fast loading
// API calls aur Firebase config ko cache NAHI karta
// Messages ko localStorage me cache karta hai (user.js me)
// ============================================

var CACHE_NAME = 'user-chat-v1';

// Cache karne wali files — ye install time pe cache ho jayengi
var CACHE_URLS = [
  '/user/',
  '/user/index.html',
  '/user/user.css',
  '/user/user.js',
  '/firebase/auth.js',
  '/firebase/database.js',
  '/firebase/storage.js'
];

// Firebase SDK URLs — ye bhi cache hongi par stale-while-revalidate se
var FIREBASE_SDK_URLS = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage-compat.js'
];

// Google Fonts
var FONT_URLS = [
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap'
];

// ============ INSTALL ============
self.addEventListener('install', function(event) {
  console.log('[UC-SW] Installing Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[UC-SW] Caching static assets');
      var allUrls = CACHE_URLS.concat(FIREBASE_SDK_URLS).concat(FONT_URLS);
      return Promise.allSettled(
        allUrls.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[UC-SW] Failed to cache:', url, err);
          });
        })
      );
    })
  );
  // Activate immediately — wait mat karo
  self.skipWaiting();
});

// ============ ACTIVATE ============
self.addEventListener('activate', function(event) {
  console.log('[UC-SW] Activating Service Worker...');
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== CACHE_NAME;
        }).map(function(key) {
          console.log('[UC-SW] Deleting old cache:', key);
          return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// ============ FETCH ============
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // API calls — hamesha network se, cache nahi
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Firebase config endpoint — network only
  if (url.pathname === '/api/firebase-config') {
    return;
  }

  // Firebase SDK scripts — stale-while-revalidate strategy
  if (url.hostname === 'www.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          var fetchPromise = fetch(event.request).then(function(response) {
            if (response && response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(function() {
            return cached;
          });
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // Google Fonts — cache first, network fallback
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          if (cached) return cached;
          return fetch(event.request).then(function(response) {
            if (response && response.ok) {
              cache.put(event.request, response.clone());
            }
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
            if (response && response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(function() {
            return cached;
          });
          return cached || fetchPromise;
        });
      })
    );
    return;
  }
});
