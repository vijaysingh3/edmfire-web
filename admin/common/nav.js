// ============================================
// EDMFire Admin - Shared Navigation & Auth Guard
// Sidebar toggle, auth check, logout, user info
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
    } else {
      // Not logged in → redirect to login page
      window.location.href = "/admin/";
    }
  });
}

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

// ========== SIDEBAR TOGGLE (MOBILE) ==========
function initSidebar() {
  var hamburgerBtn = document.getElementById("hamburgerBtn");
  var sidebar = document.getElementById("sidebar");
  var sidebarOverlay = document.getElementById("sidebarOverlay");

  if (hamburgerBtn) {
    hamburgerBtn.addEventListener("click", function() {
      if (sidebar) sidebar.classList.toggle("open");
      if (sidebarOverlay) sidebarOverlay.classList.toggle("active");
    });
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", function() {
      if (sidebar) sidebar.classList.remove("open");
      sidebarOverlay.classList.remove("active");
    });
  }
}

// ========== LOGOUT ==========
function handleLogout() {
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

// ========== AUTO INIT ==========
// Call these on DOMContentLoaded for every inner page
function initCommonUI() {
  initSidebar();
  initLogoutButtons();
}

// ========== UTILITY ==========
function escapeHtml(t) { var d = document.createElement("div"); d.appendChild(document.createTextNode(t)); return d.innerHTML; }

function formatTime(ts) {
  if (!ts) return "";
  var d = new Date(ts); var now = new Date(); var today = d.toDateString() === now.toDateString();
  var h = d.getHours(); var m = d.getMinutes(); var ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; m = m < 10 ? "0" + m : m;
  if (today) return h + ":" + m + " " + ap;
  return d.getDate() + " " + d.toLocaleString("en", { month: "short" }) + ", " + h + ":" + m + " " + ap;
}
