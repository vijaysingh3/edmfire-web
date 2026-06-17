// ============================================
// EDMFire Admin - Service Worker
// FCM push notifications handle karta hai background me
// Foreground me bhi capture karke page ko notify karta hai
// ============================================

var ADMIN_SW_VERSION = 'admin-sw-v1';

// ============ INSTALL ============
self.addEventListener('install', function(event) {
  console.log('[ADMIN-SW] Installing Service Worker v' + ADMIN_SW_VERSION);
  self.skipWaiting();
});

// ============ ACTIVATE ============
self.addEventListener('activate', function(event) {
  console.log('[ADMIN-SW] Activating Service Worker');
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Old admin SW versions clean up
      caches.keys().then(function(keys) {
        return Promise.all(
          keys.filter(function(key) {
            return key.startsWith('admin-') && key !== ADMIN_SW_VERSION;
          }).map(function(key) {
            return caches.delete(key);
          })
        );
      })
    ])
  );
});

// ============ PUSH EVENT ============
// Ye background me chalta hai jab admin browser me notification receive karta hai
self.addEventListener('push', function(event) {
  console.log('[ADMIN-SW] Push event received');

  var payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (e) {
      try {
        payload = { notification: { title: 'Notification', body: event.data.text() } };
      } catch (e2) {
        payload = { notification: { title: 'EDMFire Admin', body: 'New activity' } };
      }
    }
  }

  // FCM payload format: { notification: { title, body }, data: { ... } }
  var notification = payload.notification || {};
  var data = payload.data || {};

  var title = notification.title || 'EDMFire Admin';
  var body = notification.body || 'New activity';
  var icon = notification.icon || '/admin/icon-192.png';
  var badge = notification.badge || '/admin/badge-72.png';
  var tag = notification.tag || 'edmfire-admin-chat';

  // Click action URL — direct chat page for specific user
  var clickUrl = '/admin/chats/';
  if (data.userUid) {
    clickUrl += '?uid=' + data.userUid;
  } else if (data.uid) {
    clickUrl += '?uid=' + data.uid;
  } else if (notification.click_action) {
    clickUrl = notification.click_action;
  } else if (data.link) {
    clickUrl = data.link;
  }

  var options = {
    body: body,
    icon: icon,
    badge: badge,
    tag: tag,
    data: {
      url: clickUrl,
      userUid: data.userUid || data.uid || '',
      senderUid: data.senderUid || '',
      type: data.type || 'support_message'
    },
    requireInteraction: false,
    silent: false
  };

  event.waitUntil(
    // Show notification
    self.registration.showNotification(title, options).then(function() {
      // Also notify all open admin tabs — taaki in-app badge update ho sake
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    }).then(function(clientList) {
      var msgData = {
        type: 'ADMIN_FCM_NOTIFICATION',
        title: title,
        body: body,
        userUid: data.userUid || data.uid || '',
        senderUid: data.senderUid || '',
        notifType: data.type || 'support_message',
        timestamp: Date.now()
      };
      for (var i = 0; i < clientList.length; i++) {
        clientList[i].postMessage(msgData);
      }
    })
  );
});

// ============ NOTIFICATION CLICK ============
// Admin jab notification pe click kare toh us user ki chat khul jaye
self.addEventListener('notificationclick', function(event) {
  console.log('[ADMIN-SW] Notification clicked');
  event.notification.close();

  var targetUrl = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/admin/chats/';

  // Make sure URL is relative to admin domain
  if (targetUrl.indexOf('http') === 0) {
    try {
      var u = new URL(targetUrl);
      targetUrl = u.pathname + u.search;
    } catch (e) {}
  }

  event.waitUntil(
    self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(function(clientList) {
      // 1. Try to find an existing admin tab focused on chats
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url && client.url.indexOf('/admin/chats') !== -1 && 'focus' in client) {
          // Send message to navigate to specific user
          client.postMessage({
            type: 'ADMIN_NOTIF_CLICK',
            url: targetUrl
          });
          return client.focus();
        }
      }

      // 2. Try to find any existing admin tab
      for (var j = 0; j < clientList.length; j++) {
        if (clientList[j].url && clientList[j].url.indexOf('/admin/') !== -1 && 'focus' in clientList[j]) {
          clientList[j].postMessage({
            type: 'ADMIN_NOTIF_CLICK',
            url: targetUrl
          });
          return clientList[j].focus();
        }
      }

      // 3. Open new tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// ============ MESSAGE FROM PAGE ============
// Page se messages handle karna (e.g., token refresh, status checks)
self.addEventListener('message', function(event) {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: ADMIN_SW_VERSION });
  }
});
