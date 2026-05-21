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
