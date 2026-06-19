// ============================================
// EDMFire Admin - Helper Manager Logic
// Lists verified hosts + toggles helperRead / helperWrite
// Also mirrors permission to RTDB helpCenter/helperAccess/{authUid}
// for fast security-rule checks on the support page.
// ============================================

var hmHostsList = document.getElementById("hmHostsList");
var hmTotalCount = document.getElementById("hmTotalCount");
var hmActiveCount = document.getElementById("hmActiveCount");
var hmWriteCount = document.getElementById("hmWriteCount");
var hmSearchInput = document.getElementById("hmSearchInput");

var allHosts = []; // Cached for search filter

// ========== LOAD VERIFIED HOSTS ==========
function loadVerifiedHosts() {
  if (!firebase.firestore) {
    hmHostsList.innerHTML = '<div class="hm-empty"><p>Firestore not available</p></div>';
    return;
  }

  var db = firebase.firestore();
  db.collection("hosts").where("status", "==", "verified").onSnapshot(function(snapshot) {
    if (snapshot.empty) {
      hmHostsList.innerHTML =
        '<div class="hm-empty">' +
          '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3a3d52" stroke-width="1"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>' +
          '<h2>No Verified Hosts</h2>' +
          '<p>Approve host applications first to manage helper permissions</p>' +
        '</div>';
      updateStats(0, 0, 0);
      allHosts = [];
      return;
    }

    allHosts = [];
    var activeCount = 0;
    var writeCount = 0;

    snapshot.forEach(function(doc) {
      var data = doc.data();
      data._docId = doc.id;
      allHosts.push(data);
      if (data.helperRead === "yes") activeCount++;
      if (data.helperWrite === "yes") writeCount++;
    });

    updateStats(snapshot.size, activeCount, writeCount);
    renderHosts(allHosts);
  }, function(err) {
    console.error("[HM] Load hosts error:", err);
    hmHostsList.innerHTML =
      '<div class="hm-empty">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
        '<h2>Error Loading</h2>' +
        '<p>' + escapeHtml(err.message || "Unknown error") + '</p>' +
      '</div>';
  });
}

function updateStats(total, active, write) {
  if (hmTotalCount) hmTotalCount.textContent = total;
  if (hmActiveCount) hmActiveCount.textContent = active;
  if (hmWriteCount) hmWriteCount.textContent = write;
}

// ========== RENDER HOSTS ==========
function renderHosts(hosts) {
  var html = "";

  for (var i = 0; i < hosts.length; i++) {
    var h = hosts[i];
    var initial = (h.fullName || "H").charAt(0).toUpperCase();
    var name = escapeHtml(h.fullName || "Unknown Host");
    var gmail = escapeHtml(h.gmail || "-");
    var mobile = escapeHtml(String(h.mobile || "-"));
    var state = escapeHtml(h.state || "-");
    var authUid = escapeHtml(h.authUid || "");

    var canRead = h.helperRead === "yes";
    var canWrite = h.helperWrite === "yes";

    var cardClass = "hm-host-card";
    if (canRead) cardClass += " active-helper";
    if (canWrite) cardClass += " write-enabled";

    var statusClass = "inactive";
    var statusLabel = "No Access";
    if (canRead && canWrite) {
      statusClass = "full";
      statusLabel = "Full Access";
    } else if (canRead) {
      statusClass = "readonly";
      statusLabel = "Read Only";
    }

    html +=
      '<div class="' + cardClass + '" data-doc-id="' + escapeHtml(h._docId) + '" data-auth-uid="' + authUid + '">' +
        '<div class="hm-host-avatar">' + initial + '</div>' +
        '<div class="hm-host-info">' +
          '<div class="hm-host-name">' + name + '</div>' +
          '<div class="hm-host-meta">' +
            '<span>📧 ' + gmail + '</span>' +
            '<span>📱 ' + mobile + '</span>' +
            '<span>📍 ' + state + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="hm-host-permissions">' +
          '<div class="hm-perm-toggle">' +
            '<span class="hm-perm-label">Read</span>' +
            '<button class="hm-perm-switch' + (canRead ? ' on' : '') + '" data-perm="helperRead" data-current="' + (canRead ? 'yes' : 'no') + '" title="Toggle read access"></button>' +
          '</div>' +
          '<div class="hm-perm-toggle">' +
            '<span class="hm-perm-label">Write</span>' +
            '<button class="hm-perm-switch' + (canWrite ? ' on' : '') + '" data-perm="helperWrite" data-current="' + (canWrite ? 'yes' : 'no') + '" title="Toggle write access"></button>' +
          '</div>' +
        '</div>' +
        '<div class="hm-host-status ' + statusClass + '">' + statusLabel + '</div>' +
      '</div>';
  }

  hmHostsList.innerHTML = html;
  bindToggleEvents();
}

// ========== TOGGLE EVENTS ==========
function bindToggleEvents() {
  var switches = hmHostsList.querySelectorAll(".hm-perm-switch");
  for (var i = 0; i < switches.length; i++) {
    switches[i].addEventListener("click", function() {
      var btn = this;
      var perm = btn.getAttribute("data-perm");
      var currentVal = btn.getAttribute("data-current");
      var newVal = currentVal === "yes" ? "no" : "yes";
      var card = btn.closest(".hm-host-card");
      var docId = card.getAttribute("data-doc-id");
      var authUid = card.getAttribute("data-auth-uid");

      // Disable button while saving
      btn.disabled = true;

      updatePermission(docId, authUid, perm, newVal, function(success) {
        btn.disabled = false;
        if (success) {
          btn.setAttribute("data-current", newVal);
          if (newVal === "yes") {
            btn.classList.add("on");
            showToast((perm === "helperRead" ? "Read" : "Write") + " access enabled", "success");
          } else {
            btn.classList.remove("on");
            showToast((perm === "helperRead" ? "Read" : "Write") + " access disabled", "info");
          }
        } else {
          showToast("Failed to update permission", "error");
        }
      });
    });
  }
}

// ========== UPDATE PERMISSION IN FIRESTORE + RTDB ==========
function updatePermission(docId, authUid, perm, value, callback) {
  if (!docId || !perm) {
    if (callback) callback(false);
    return;
  }

  var db = firebase.firestore();
  var updateData = {};
  updateData[perm] = value;
  updateData["lastUpdated"] = firebase.firestore.FieldValue.serverTimestamp();

  // 1. Update Firestore hosts/{docId}
  db.collection("hosts").doc(docId).update(updateData).then(function() {
    console.log("[HM] Firestore updated:", docId, perm, value);

    // 2. Mirror to RTDB helpCenter/helperAccess/{authUid} for security rules
    if (authUid) {
      var rtdbRef = firebase.database().ref("helpCenter/helperAccess/" + authUid);
      var rtdbUpdate = {};
      rtdbUpdate[perm] = value;
      rtdbUpdate["lastUpdated"] = Date.now();
      rtdbRef.update(rtdbUpdate).then(function() {
        console.log("[HM] RTDB mirror updated:", authUid, perm, value);
        if (callback) callback(true);
      }).catch(function(err) {
        console.warn("[HM] RTDB mirror error (non-fatal):", err);
        // Firestore succeeded — that's enough
        if (callback) callback(true);
      });
    } else {
      if (callback) callback(true);
    }
  }).catch(function(err) {
    console.error("[HM] Firestore update error:", err);
    if (callback) callback(false);
  });
}

// ========== SEARCH ==========
if (hmSearchInput) {
  hmSearchInput.addEventListener("input", function() {
    var query = hmSearchInput.value.toLowerCase().trim();
    if (!query) {
      renderHosts(allHosts);
      return;
    }
    var filtered = allHosts.filter(function(h) {
      return (h.fullName || "").toLowerCase().indexOf(query) !== -1
        || (h.gmail || "").toLowerCase().indexOf(query) !== -1
        || String(h.mobile || "").toLowerCase().indexOf(query) !== -1;
    });
    renderHosts(filtered);
  });
}

// ========== TOAST ==========
function showToast(message, type) {
  var existing = document.getElementById("hmToast");
  if (existing) existing.remove();

  var toast = document.createElement("div");
  toast.id = "hmToast";
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
  }, 3000);
}

// ========== INIT ==========
initAuthGuard(function(user) {
  loadVerifiedHosts();
});
initCommonUI();
