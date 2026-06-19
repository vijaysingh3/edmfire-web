// ============================================
// EDMFire Support - Page Auth Guard
// Loaded on every protected support page (chats).
// If not logged in → redirect to /support/
// If logged in but no helper permission → sign out + redirect to /support/
// ============================================

var currentHelper = null;
var currentHostData = null;
var currentHostDocId = null;

function initSupportAuthGuard(callback) {
  var loadingEl = document.getElementById("loadingOverlay");
  if (loadingEl) loadingEl.style.display = "flex";

  onAuthChange(function(user) {
    if (!user) {
      // Not logged in → redirect to login
      window.location.href = "/support/";
      return;
    }

    // User logged in — verify helper permission
    checkHelperPermission(user).then(function(result) {
      if (!result.allowed) {
        // Show access denied message before redirect
        if (loadingEl) loadingEl.style.display = "none";
        showSupportAccessDenied(result.reason || "unknown");
        // Auto sign-out after 3 seconds
        setTimeout(function() {
          handleHostLogout();
        }, 3500);
        return;
      }

      currentHelper = user;
      currentHostData = result.hostData;
      currentHostDocId = result.hostDocId;

      // Persist helper info to localStorage for fast UI access on reload
      try {
        localStorage.setItem("edmfire_helper_info", JSON.stringify({
          uid: user.uid,
          email: result.hostData.gmail || user.email || "",
          name: result.hostData.fullName || "Helper",
          helperRead: result.hostData.helperRead,
          helperWrite: result.hostData.helperWrite,
          hostDocId: result.hostDocId
        }));
      } catch (e) {}

      if (loadingEl) loadingEl.style.display = "none";

      // Update UI
      updateHelperInfoUI();

      if (callback) callback(user, result.hostData, result.hostDocId);
    }).catch(function(err) {
      console.error("[SUPPORT-GUARD] Permission check error:", err);
      if (loadingEl) loadingEl.style.display = "none";
      showSupportAccessDenied("permission-check-error");
      setTimeout(function() {
        handleHostLogout();
      }, 3500);
    });
  });
}

// ============ UPDATE UI WITH HELPER INFO ============
function updateHelperInfoUI() {
  if (!currentHelper || !currentHostData) return;

  var nameEl = document.getElementById("sidebarUserName");
  var emailEl = document.getElementById("sidebarUserEmail");
  var avatarEl = document.getElementById("sidebarUserAvatar");
  var mobileNameEl = document.getElementById("mobileHelperName");

  var name = currentHostData.fullName || "Helper";
  var email = currentHostData.gmail || currentHelper.email || "";

  if (nameEl) nameEl.textContent = name;
  if (emailEl) emailEl.textContent = email;
  if (avatarEl) avatarEl.textContent = (name || "H").charAt(0).toUpperCase();
  if (mobileNameEl) mobileNameEl.textContent = name;
}

// ============ ACCESS DENIED ============
function showSupportAccessDenied(reason) {
  var messages = {
    "no-host": "No host account found for your login. Please contact admin.",
    "not-verified": "Your host account is not verified yet. Please wait for admin approval.",
    "no-read": "You do not have helper access. Please contact admin to enable helperRead.",
    "permission-check-error": "Could not verify your access. Please try again."
  };
  var msg = messages[reason] || "Access denied. Redirecting to login...";

  var main = document.querySelector(".support-main") || document.querySelector(".main-content") || document.body;
  main.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:16px;color:#f87171;text-align:center;padding:40px;font-family:Poppins,sans-serif;">' +
    '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
    '<h2 style="font-size:20px;color:#e8e9f0;">Access Denied</h2>' +
    '<p style="font-size:14px;color:#7c7f96;max-width:400px;">' + msg + '</p>' +
    '<p style="font-size:12px;color:#5a5d72;">Redirecting to login in a few seconds...</p>' +
    '</div>';
}

// ============ UTILITY ============
function escapeHtml(t) {
  var d = document.createElement("div");
  d.appendChild(document.createTextNode(t));
  return d.innerHTML;
}

// IST formatter (same as admin)
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
  return parseInt(p.day) + " " + months[parseInt(p.month) - 1] + ", " + h + ":" + m + " " + ap;
}

function formatTimeAgo(ts) {
  if (!ts) return "";
  var diff = Date.now() - ts;
  var sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  var min = Math.floor(sec / 60);
  if (min < 60) return min + "m ago";
  var hr = Math.floor(min / 60);
  if (hr < 24) return hr + "h ago";
  var day = Math.floor(hr / 24);
  if (day < 7) return day + "d ago";
  return formatTime(ts);
}
