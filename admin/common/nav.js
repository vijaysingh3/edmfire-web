// ============================================
// EDMFire Admin - Shared Navigation & Auth Guard
// Sidebar toggle (PC + mobile), auth check, logout
// Smart auto-close system
// ============================================

var currentAdmin = null;

// ========== AUTH GUARD ==========
// Call this on every inner page (dashboard, chats, etc.)
// If not logged in → redirect to /admin/
// If logged in but not admin → show access denied
function initAuthGuard(callback) {
  var loadingEl = document.getElementById("loadingOverlay");
  onAuthChange(function(user) {
    if (user) {
      if (!checkAdminAccess(user)) {
        if (loadingEl) loadingEl.style.display = "none";
        showAccessDenied();
        return;
      }
      currentAdmin = user;
      updateUserInfo();
      if (loadingEl) loadingEl.style.display = "none";
      if (callback) callback(user);

      // BACKGROUND (non-blocking): admin FCM token generate + save
      // Taaki user ke messages pe admin ko push notification mile
      initAdminFCM(user);
    } else {
      // Not logged in → redirect to login page
      window.location.href = "/admin/";
    }
  });
}

// ========== ADMIN FCM TOKEN INIT ==========
// Background me FCM token generate karke RTDB helpCenter/admins/{uid} me save karta hai
// Ye sab non-blocking hai — admin page load ko affect nahi karta
var adminFCMInitialized = false;
function initAdminFCM(user) {
  if (adminFCMInitialized) return;
  adminFCMInitialized = true;

  // Firebase Messaging SDK loaded hai ya nahi check karo
  if (!firebase.messaging || !FCM_VAPID_KEY) {
    console.warn("[ADMIN-FCM] Messaging SDK not loaded or VAPID key missing — skipping FCM init");
    return;
  }

  try {
    var messaging = firebase.messaging();

    // Service Worker register karo admin SW (background push handle karne ke liye)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/admin/sw.js').then(function(reg) {
        console.log('[ADMIN-FCM] Service Worker registered:', reg.scope);

        // Notification permission request karo
        if (Notification.permission === 'default') {
          Notification.requestPermission().then(function(permission) {
            if (permission === 'granted') {
              console.log('[ADMIN-FCM] Notification permission granted');
              getTokenAndSave(messaging, reg);
            } else {
              console.warn('[ADMIN-FCM] Notification permission not granted');
            }
          });
        } else if (Notification.permission === 'granted') {
          getTokenAndSave(messaging, reg);
        }
      }).catch(function(err) {
        console.warn('[ADMIN-FCM] SW registration failed:', err);
        // Try without SW (foreground only)
        getTokenAndSave(messaging, null);
      });
    } else {
      console.warn('[ADMIN-FCM] Service Worker not supported in this browser');
    }

    // Token refresh listener — agar FCM token rotate ho jaye
    messaging.onTokenRefresh(function() {
      console.log('[ADMIN-FCM] Token refreshed, getting new token');
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration('/admin/sw.js').then(function(reg) {
          getTokenAndSave(messaging, reg);
        });
      } else {
        getTokenAndSave(messaging, null);
      }
    });

    // Foreground message listener — jab admin tab active hai
    messaging.onMessage(function(payload) {
      console.log('[ADMIN-FCM] Foreground message received:', payload);
      handleForegroundNotification(payload);
    });

  } catch (err) {
    console.warn('[ADMIN-FCM] Init error:', err);
  }
}

// ========== GET FCM TOKEN + SAVE TO RTDB ==========
function getTokenAndSave(messaging, swRegistration) {
  var options = { vapidKey: FCM_VAPID_KEY };
  if (swRegistration) options.serviceWorkerRegistration = swRegistration;

  messaging.getToken(options).then(function(token) {
    if (!token) {
      console.warn('[ADMIN-FCM] No token received');
      return;
    }
    console.log('[ADMIN-FCM] FCM token generated:', token.substring(0, 20) + '...');

    // RTDB me save karo — helpCenter/admins/{uid}
    var adminRef = firebase.database().ref("helpCenter/admins/" + currentAdmin.uid);

    // Pehle existing token check karo — agar same hai toh update nahi karna
    adminRef.child("fcmToken").once("value").then(function(snap) {
      var existingToken = snap.val();
      if (existingToken === token) {
        console.log('[ADMIN-FCM] Token already up-to-date in RTDB');
        return;
      }

      // Save token + admin metadata
      var updates = {
        fcmToken: token,
        email: currentAdmin.email || '',
        uid: currentAdmin.uid,
        lastActive: Date.now(),
        lastTokenUpdate: Date.now()
      };
      adminRef.update(updates).then(function() {
        console.log('[ADMIN-FCM] Token saved to RTDB helpCenter/admins/' + currentAdmin.uid);
      }).catch(function(err) {
        console.warn('[ADMIN-FCM] RTDB save error:', err);
      });
    }).catch(function(err) {
      console.warn('[ADMIN-FCM] Token check error:', err);
    });
  }).catch(function(err) {
    console.warn('[ADMIN-FCM] getToken error:', err);
  });
}

// ========== FOREGROUND NOTIFICATION HANDLER ==========
// Jab admin tab active hai aur notification aaye — in-app toast dikhao
function handleForegroundNotification(payload) {
  var notification = payload.notification || {};
  var data = payload.data || {};

  var title = notification.title || 'EDMFire Admin';
  var body = notification.body || 'New activity';
  var userUid = data.userUid || data.uid || '';

  // In-app toast notification dikhao (top-right corner)
  showAdminNotificationToast(title, body, userUid);

  // Optional: tab title update karo agar tab background me hai
  if (document.visibilityState === 'hidden' || document.hidden) {
    document.title = '(' + title + ') EDMFire Admin';
    // Reset title when tab becomes visible
    document.addEventListener('visibilitychange', function reset() {
      if (!document.hidden) {
        document.title = 'EDMFire Admin';
        document.removeEventListener('visibilitychange', reset);
      }
    });
  }
}

// ========== ADMIN NOTIFICATION TOAST ==========
function showAdminNotificationToast(title, body, userUid) {
  // Remove existing toast if any
  var existing = document.getElementById('adminNotifToast');
  if (existing) existing.remove();

  var toast = document.createElement('div');
  toast.id = 'adminNotifToast';
  toast.style.cssText = [
    'position:fixed',
    'top:20px',
    'right:20px',
    'background:linear-gradient(135deg,#5b4cc4,#7c6cf0)',
    'color:white',
    'padding:14px 18px',
    'border-radius:12px',
    'box-shadow:0 8px 24px rgba(0,0,0,0.3)',
    'font-family:Poppins,sans-serif',
    'font-size:14px',
    'max-width:340px',
    'cursor:pointer',
    'z-index:99999',
    'animation:slideInRight 0.3s ease-out',
    'display:flex',
    'gap:12px',
    'align-items:flex-start'
  ].join(';');

  var icon = '<div style="font-size:20px;flex-shrink:0;">💬</div>';
  var content =
    '<div style="flex:1;">' +
      '<div style="font-weight:600;font-size:14px;margin-bottom:4px;">' + escapeHtml(title) + '</div>' +
      '<div style="font-size:13px;opacity:0.9;line-height:1.4;">' + escapeHtml(body) + '</div>' +
    '</div>';

  toast.innerHTML = icon + content;

  // Click kare toh chat page pe le jao
  toast.addEventListener('click', function() {
    if (userUid) {
      window.location.href = '/admin/chats/?uid=' + encodeURIComponent(userUid);
    } else {
      window.location.href = '/admin/chats/';
    }
  });

  document.body.appendChild(toast);

  // Auto-dismiss after 6 seconds
  setTimeout(function() {
    toast.style.transition = 'opacity 0.4s, transform 0.4s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(function() {
      if (toast.parentNode) toast.remove();
    }, 400);
  }, 6000);
}

// Listen for messages from Service Worker (background notification captured)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', function(event) {
    if (!event.data) return;

    if (event.data.type === 'ADMIN_FCM_NOTIFICATION') {
      // Background se aaya notification — foreground tab ko inform karo
      handleForegroundNotification({
        notification: { title: event.data.title, body: event.data.body },
        data: { userUid: event.data.userUid, senderUid: event.data.senderUid }
      });
    } else if (event.data.type === 'ADMIN_NOTIF_CLICK') {
      // SW ne notification click handle kiya — navigate to chat
      if (event.data.url) {
        window.location.href = event.data.url;
      }
    }
  });
}

// Add CSS for slide-in animation
(function() {
  var style = document.createElement('style');
  style.textContent = [
    '@keyframes slideInRight {',
    '  from { opacity:0; transform:translateX(20px); }',
    '  to { opacity:1; transform:translateX(0); }',
    '}'
  ].join('\n');
  document.head.appendChild(style);
})();

// ========== UPDATE USER INFO IN SIDEBAR ==========
function updateUserInfo() {
  if (!currentAdmin) return;
  var nameEl = document.getElementById("sidebarUserName");
  var emailEl = document.getElementById("sidebarUserEmail");
  var avatarEl = document.getElementById("sidebarUserAvatar");
  if (nameEl) nameEl.textContent = "Admin";
  if (emailEl) emailEl.textContent = currentAdmin.email || currentAdmin.uid;
  if (avatarEl) avatarEl.textContent = (currentAdmin.email || "A").charAt(0).toUpperCase();
}

// ========== ACCESS DENIED ==========
function showAccessDenied() {
  var main = document.querySelector(".main-content");
  if (main) {
    main.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:16px;color:#f87171;text-align:center;padding:40px;">' +
      '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
      '<h2 style="font-size:20px;color:#e8e9f0;">Access Denied</h2>' +
      '<p style="font-size:14px;color:#7c7f96;">UID (' + (currentAdmin ? currentAdmin.uid : '') + ') is not authorized as admin</p>' +
      '<button onclick="handleLogout()" style="padding:10px 28px;border:none;border-radius:10px;background:#d13a3a;color:white;font-size:14px;cursor:pointer;font-family:Poppins,sans-serif;">Sign Out</button>' +
      '</div>';
  }
}

// ========== SIDEBAR OPEN/CLOSE HELPERS ==========
function openSidebar() {
  var sidebar = document.getElementById("sidebar");
  var overlay = document.getElementById("sidebarOverlay");
  var hamburgerBtn = document.getElementById("hamburgerBtn");
  if (sidebar) sidebar.classList.add("open");
  if (overlay) overlay.classList.add("active");
  if (hamburgerBtn) hamburgerBtn.classList.add("active");
}

function closeSidebar() {
  var sidebar = document.getElementById("sidebar");
  var overlay = document.getElementById("sidebarOverlay");
  var hamburgerBtn = document.getElementById("hamburgerBtn");
  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("active");
  if (hamburgerBtn) hamburgerBtn.classList.remove("active");
}

function isSidebarOpen() {
  var sidebar = document.getElementById("sidebar");
  return sidebar && sidebar.classList.contains("open");
}

// ========== SIDEBAR TOGGLE (PC - COLLAPSE/EXPAND) ==========
function initSidebarCollapseToggle() {
  var sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  // Only add toggle button on desktop
  if (window.innerWidth <= 768) return;

  // Check if toggle button already exists
  if (document.getElementById("sidebarToggleBtn")) return;

  // Create toggle button
  var toggleBtn = document.createElement("button");
  toggleBtn.id = "sidebarToggleBtn";
  toggleBtn.className = "sidebar-toggle-btn";
  toggleBtn.title = "Toggle sidebar";
  toggleBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>';

  // Insert into sidebar-brand
  var brand = sidebar.querySelector(".sidebar-brand");
  if (brand) {
    brand.appendChild(toggleBtn);
  }

  // Add data-label to nav items for tooltip
  var navItems = sidebar.querySelectorAll(".nav-item");
  for (var i = 0; i < navItems.length; i++) {
    var span = navItems[i].querySelector("span");
    if (span) {
      navItems[i].setAttribute("data-label", span.textContent);
    }
  }

  // Restore collapsed state from localStorage
  if (localStorage.getItem("edmfireSidebarCollapsed") === "true") {
    sidebar.classList.add("collapsed");
  }

  // Toggle handler
  toggleBtn.addEventListener("click", function(e) {
    e.stopPropagation();
    sidebar.classList.toggle("collapsed");
    localStorage.setItem("edmfireSidebarCollapsed", sidebar.classList.contains("collapsed"));
  });
}

// ========== SIDEBAR TOGGLE (MOBILE - HAMBURGER) ==========
function initSidebar() {
  var hamburgerBtn = document.getElementById("hamburgerBtn");
  var sidebarOverlay = document.getElementById("sidebarOverlay");

  if (hamburgerBtn) {
    hamburgerBtn.addEventListener("click", function() {
      if (isSidebarOpen()) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  }

  // Close sidebar when clicking overlay
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", function() {
      closeSidebar();
    });
  }

  // ===== SMART AUTO-CLOSE: Close sidebar on nav link click (mobile) =====
  var navItems = document.querySelectorAll(".sidebar-nav .nav-item");
  for (var i = 0; i < navItems.length; i++) {
    navItems[i].addEventListener("click", function() {
      if (window.innerWidth <= 768) {
        closeSidebar();
      }
    });
  }
}

// ========== SMART AUTO-CLOSE ON RESIZE ==========
function initSmartAutoClose() {
  var sidebar = document.getElementById("sidebar");
  var prevWidth = window.innerWidth;

  window.addEventListener("resize", function() {
    var currentWidth = window.innerWidth;

    // If transitioning from desktop to mobile: close sidebar
    if (prevWidth > 768 && currentWidth <= 768) {
      closeSidebar();
      if (sidebar) sidebar.classList.remove("collapsed");
    }

    // If transitioning from mobile to desktop: reset mobile state
    if (prevWidth <= 768 && currentWidth > 768) {
      closeSidebar(); // removes .open class
      // Restore desktop collapsed state
      if (sidebar && localStorage.getItem("edmfireSidebarCollapsed") === "true") {
        sidebar.classList.add("collapsed");
      }
    }

    prevWidth = currentWidth;
  });
}

// ========== LOGOUT ==========
function handleLogout() {
  // Clean up: FCM token RTDB se remove karo (non-blocking)
  if (currentAdmin && firebase.database) {
    try {
      firebase.database().ref("helpCenter/admins/" + currentAdmin.uid + "/fcmToken").remove();
    } catch (e) {
      console.warn('[ADMIN-FCM] Token cleanup error:', e);
    }
  }

  signOutUser().then(function() {
    window.location.href = "/admin/";
  });
}

function initLogoutButtons() {
  var sidebarLogoutBtn = document.getElementById("sidebarLogoutBtn");
  var mobileLogoutBtn = document.getElementById("mobileLogoutBtn");
  if (sidebarLogoutBtn) sidebarLogoutBtn.addEventListener("click", handleLogout);
  if (mobileLogoutBtn) mobileLogoutBtn.addEventListener("click", handleLogout);
}

// ========== PAGE SIDEBAR TOGGLE BUTTON (Desktop) ==========
// Creates a toggle button in page headers that appears when sidebar is collapsed
function initPageSidebarToggle() {
  var pageHeaders = document.querySelectorAll(".page-header");
  if (pageHeaders.length === 0) return;
  if (window.innerWidth <= 768) return;

  var sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  // Add toggle button to each page header
  for (var i = 0; i < pageHeaders.length; i++) {
    if (pageHeaders[i].querySelector(".page-sidebar-toggle")) continue;

    var btn = document.createElement("button");
    btn.className = "page-sidebar-toggle";
    btn.title = "Expand sidebar";
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>';

    (function(button) {
      button.addEventListener("click", function() {
        sidebar.classList.remove("collapsed");
        localStorage.setItem("edmfireSidebarCollapsed", "false");
      });
    })(btn);

    pageHeaders[i].insertBefore(btn, pageHeaders[i].firstChild);
  }
}

// ========== AUTO INIT ==========
// Call these on DOMContentLoaded for every inner page
function initCommonUI() {
  initSidebar();
  initSidebarCollapseToggle();
  initPageSidebarToggle();
  initSmartAutoClose();
  initLogoutButtons();
}

// ========== UTILITY ==========
function escapeHtml(t) { var d = document.createElement("div"); d.appendChild(document.createTextNode(t)); return d.innerHTML; }

// IST (Indian Standard Time, UTC+5:30) me convert karna
// Har device ki local timezone ignore karke always IST show karega
// Intl.DateTimeFormat use karta hai — har device pe accurate IST
function getISTParts(date) {
  var parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", hour12: false
  }).formatToParts(date);
  var p = {};
  for (var i = 0; i < parts.length; i++) p[parts[i].type] = parts[i].value;
  return p;
}

function formatTime(ts) {
  if (!ts) return "";
  var p = getISTParts(new Date(ts));
  var h = parseInt(p.hour); var m = parseInt(p.minute);
  var ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; m = m < 10 ? "0" + m : m;
  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  // Always show date + month + time
  return parseInt(p.day) + " " + months[parseInt(p.month) - 1] + ", " + h + ":" + m + " " + ap;
}
