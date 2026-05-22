// ============================================
// EDMFire World Chat - Service Worker
// Static assets cache karta hai for fast loading
// API calls aur Firebase config ko cache NAHI karta
// ============================================

var CACHE_NAME = 'world-chat-v4';

// Cache karne wali files — ye install time pe cache ho jayengi
var CACHE_URLS = [
  '/world-chat/',
  '/world-chat/index.html',
  '/world-chat/world-chat.css',
  '/world-chat/world-chat.js',
  '/firebase/auth.js'
];

// Firebase SDK URLs — ye bhi cache hongi par network-first approach se
var FIREBASE_SDK_URLS = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js'
];

// Google Fonts
var FONT_URLS = [
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap'
];

// ============ INSTALL ============
// Sab static assets ko cache me daalo
self.addEventListener('install', function(event) {
  console.log('[WC-SW] Installing Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[WC-SW] Caching static assets');
      // Sab URLs cache karo — agar koi fail ho toh bhi baaki cache ho
      var allUrls = CACHE_URLS.concat(FIREBASE_SDK_URLS).concat(FONT_URLS);
      return Promise.allSettled(
        allUrls.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[WC-SW] Failed to cache:', url, err);
          });
        })
      );
    })
  );
  // Activate immediately — wait mat karo
  self.skipWaiting();
});

// ============ ACTIVATE ============
// Purane caches delete karo
self.addEventListener('activate', function(event) {
  console.log('[WC-SW] Activating Service Worker...');
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== CACHE_NAME;
        }).map(function(key) {
          console.log('[WC-SW] Deleting old cache:', key);
          return caches.delete(key);
        })
      );
    })
  );
  // Sab clients ko immediately control karo
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
  // Pehle cache se do, background me update karo
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

  // Own static assets — cache first, then network (with update)
  if (url.hostname === self.location.hostname) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          // Background me update karo (stale-while-revalidate)
          var fetchPromise = fetch(event.request).then(function(response) {
            if (response && response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(function() {
            // Network fail — cached response use karo (agar hai)
            return cached;
          });

          // Agar cached hai toh turant dedo, nahi toh network ka wait karo
          return cached || fetchPromise;
        });
      })
    );
    return;
  }
});
