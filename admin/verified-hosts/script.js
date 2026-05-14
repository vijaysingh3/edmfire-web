// ============================================
// EDMFire Admin - Verified Hosts Logic
// ============================================

var hostsList = document.getElementById("hostsList");
var hostsTotalCount = document.getElementById("hostsTotalCount");
var MANAGE_HOST_API = "/api/manage-host";

// Credentials map: hostUid -> password
var credentialsMap = {};

// Load all verified hosts from Firestore + credentials via API
function loadVerifiedHosts() {
  if (!firebase.firestore) {
    hostsList.innerHTML = '<div class="hosts-empty"><p>Firestore not available</p></div>';
    return;
  }

  // Step 1: Fetch credentials from API (admin-only hostCredentials collection)
  fetch(MANAGE_HOST_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "getAllCredentials" }),
  })
  .then(function(res) { return res.json(); })
  .then(function(credData) {
    // Build credentials map
    credentialsMap = {};
    if (credData.success && credData.result && credData.result.credentials) {
      credData.result.credentials.forEach(function(cred) {
        credentialsMap[cred.hostUid] = cred.password || "";
      });
    }
    // Step 2: Now fetch hosts from Firestore
    loadHostsFromFirestore();
  })
  .catch(function(error) {
    console.error("Fetch credentials error:", error);
    // Still load hosts without passwords
    loadHostsFromFirestore();
  });
}

// Load hosts from Firestore and render
function loadHostsFromFirestore() {
  var db = firebase.firestore();
  db.collection("hosts").where("status", "==", "verified").get().then(function(snapshot) {
    if (snapshot.empty) {
      hostsList.innerHTML =
        '<div class="hosts-empty">' +
          '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3a3d52" stroke-width="1"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>' +
          '<h2>No Verified Hosts</h2>' +
          '<p>Approved host accounts will appear here</p>' +
        '</div>';
      if (hostsTotalCount) hostsTotalCount.textContent = "0";
      return;
    }

    if (hostsTotalCount) hostsTotalCount.textContent = snapshot.size;

    var html = "";

    snapshot.forEach(function(doc) {
      var data = doc.data();
      var initial = (data.fullName || "H").charAt(0).toUpperCase();
      var name = escapeHtml(data.fullName || "Unknown Host");
      var gmail = escapeHtml(data.gmail || "-");
      var mobile = data.mobile || "-";
      var state = data.state || "-";
      var ffNickname = data.ffNickname || "-";
      var gameMode = data.gameModes === "br" ? "Battle Royale" : data.gameModes === "cs" ? "Clash Squad" : (data.gameModes || "-");
      var verifiedBy = data.verifiedBy || "-";
      var verifiedAt = formatDate(data.verifiedAt);
      var hostUid = doc.id;

      // Get password from credentials map (fetched from hostCredentials via API)
      var password = credentialsMap[hostUid] || "";
      var maskedPw = password ? "\u2022".repeat(password.length) : "Not set";
      var hasPassword = password.length > 0;

      html +=
        '<div class="host-card" data-host-uid="' + escapeHtml(hostUid) + '">' +
          '<div class="host-card-top">' +
            '<div class="host-card-avatar">' + initial + '</div>' +
            '<div class="host-card-info">' +
              '<div class="host-card-name">' + name + '</div>' +
              '<div class="host-card-email">' + gmail + '</div>' +
            '</div>' +
            '<span class="host-card-verified-badge">' +
              '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' +
              'Verified' +
            '</span>' +
          '</div>' +
          '<div class="host-card-details">' +
            '<div class="host-card-detail">' +
              '<span class="host-card-detail-label">Mobile</span>' +
              '<span class="host-card-detail-value">' + escapeHtml(String(mobile)) + '</span>' +
            '</div>' +
            '<div class="host-card-detail">' +
              '<span class="host-card-detail-label">State</span>' +
              '<span class="host-card-detail-value">' + escapeHtml(state) + '</span>' +
            '</div>' +
            '<div class="host-card-detail">' +
              '<span class="host-card-detail-label">FF Nickname</span>' +
              '<span class="host-card-detail-value">' + escapeHtml(ffNickname) + '</span>' +
            '</div>' +
            '<div class="host-card-detail">' +
              '<span class="host-card-detail-label">Game Mode</span>' +
              '<span class="host-card-detail-value">' + escapeHtml(gameMode) + '</span>' +
            '</div>' +
            '<div class="host-card-detail">' +
              '<span class="host-card-detail-label">Verified By</span>' +
              '<span class="host-card-detail-value">' + escapeHtml(verifiedBy) + '</span>' +
            '</div>' +
            '<div class="host-card-detail">' +
              '<span class="host-card-detail-label">Verified On</span>' +
              '<span class="host-card-detail-value">' + escapeHtml(verifiedAt) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="host-card-password">' +
            '<span class="host-card-password-label">Password</span>' +
            '<span class="host-card-password-value" data-pw="' + (hasPassword ? escapeHtml(password) : "") + '" data-visible="false">' + maskedPw + '</span>' +
            '<div class="host-card-password-actions">' +
              (hasPassword ?
                '<button class="host-pw-eye" title="Show/Hide password">' +
                  '<svg class="eye-open" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
                  '<svg class="eye-closed" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>' +
                '</button>' +
                '<button class="host-pw-copy" title="Copy password">' +
                  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
                '</button>'
              : '') +
            '</div>' +
          '</div>' +
        '</div>';
    });

    hostsList.innerHTML = html;
    bindHostPasswordEvents();

  }).catch(function(error) {
    console.error("Load hosts error:", error);
    hostsList.innerHTML =
      '<div class="hosts-empty">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
        '<h2>Error Loading</h2>' +
        '<p>' + escapeHtml(error.message) + '</p>' +
      '</div>';
  });
}

// Bind password eye toggle and copy events on host cards
function bindHostPasswordEvents() {
  // Eye toggles
  var eyeBtns = document.querySelectorAll(".host-pw-eye");
  eyeBtns.forEach(function(btn) {
    btn.addEventListener("click", function() {
      var passwordRow = btn.closest(".host-card-password");
      var pwSpan = passwordRow.querySelector(".host-card-password-value");
      var isVisible = pwSpan.getAttribute("data-visible") === "true";
      var actualPw = pwSpan.getAttribute("data-pw");
      var eyeOpen = btn.querySelector(".eye-open");
      var eyeClosed = btn.querySelector(".eye-closed");

      if (isVisible) {
        pwSpan.textContent = "\u2022".repeat(actualPw.length);
        pwSpan.setAttribute("data-visible", "false");
        eyeOpen.style.display = "block";
        eyeClosed.style.display = "none";
      } else {
        pwSpan.textContent = actualPw;
        pwSpan.setAttribute("data-visible", "true");
        eyeOpen.style.display = "none";
        eyeClosed.style.display = "block";
      }
    });
  });

  // Copy buttons
  var copyBtns = document.querySelectorAll(".host-pw-copy");
  copyBtns.forEach(function(btn) {
    btn.addEventListener("click", function() {
      var passwordRow = btn.closest(".host-card-password");
      var pwSpan = passwordRow.querySelector(".host-card-password-value");
      var pw = pwSpan.getAttribute("data-pw");

      if (pw && navigator.clipboard) {
        navigator.clipboard.writeText(pw).then(function() {
          showToast("Password copied!", "success");
          btn.classList.add("copied");
          setTimeout(function() { btn.classList.remove("copied"); }, 1500);
        }).catch(function() {
          showToast("Failed to copy", "error");
        });
      } else if (pw) {
        var textarea = document.createElement("textarea");
        textarea.value = pw;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        showToast("Password copied!", "success");
      }
    });
  });
}

// Show toast notification
function showToast(message, type) {
  var existing = document.getElementById("appToast");
  if (existing) existing.remove();

  var toast = document.createElement("div");
  toast.id = "appToast";
  toast.className = "toast-notification toast-" + (type || "info");

  var icon = "";
  if (type === "success") {
    icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
  } else if (type === "error") {
    icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  } else {
    icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  }

  toast.innerHTML = icon + '<span>' + escapeHtml(message) + '</span>';
  document.body.appendChild(toast);

  setTimeout(function() {
    if (toast.parentNode) {
      toast.classList.add("toast-fade");
      setTimeout(function() { if (toast.parentNode) toast.remove(); }, 400);
    }
  }, 4000);
}

// Format date helper
function formatDate(ts) {
  if (!ts) return "-";
  var d;
  if (ts && typeof ts.toDate === "function") {
    d = ts.toDate();
  } else if (typeof ts === "number") {
    d = new Date(ts);
  } else if (ts && ts.seconds) {
    d = new Date(ts.seconds * 1000);
  } else {
    d = new Date(ts);
  }
  if (isNaN(d.getTime())) return String(ts);
  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear() + ", " +
    (d.getHours() % 12 || 12) + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes() +
    " " + (d.getHours() >= 12 ? "PM" : "AM");
}

// ========== INIT ==========
initAuthGuard(function(user) {
  loadVerifiedHosts();
});
initCommonUI();
