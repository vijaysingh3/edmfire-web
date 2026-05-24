// ============================================
// EDMFire Admin - User Detail Logic
// ============================================

var fieldsContent = document.getElementById("fieldsContent");
var subcollectionList = document.getElementById("subcollectionList");
var uidBannerValue = document.getElementById("uidBannerValue");
var btnEdit = document.getElementById("btnEdit");
var btnSave = document.getElementById("btnSave");
var btnCancel = document.getElementById("btnCancel");

var currentUid = null;
var currentData = null;
var originalData = null;
var isEditMode = false;

// Fields that should not be editable
var READ_ONLY_FIELDS = ["createdAt", "JoinedAt", "deviceId", "fcmToken", "fcmTokenUpdatedAt", "lastLogin", "lastLoginDate", "lastLoginTime", "lastUpdated", "loginCount"];

// Payment system: Database stores PAISA (Integer), UI shows RUPEES/Coins (with decimal)
var COIN_FIELDS = ["TopUpCoins", "MyReferralBonus", "bonusCoins", "totalCoins"];

// SubCollections
var SUBCOLLECTIONS = ["JoinedMatches", "TransactionHistory"];

// SubCollection display config
var SUBCOLLECTION_CONFIG = {
  "JoinedMatches": {
    label: "Joined Matches",
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="16" cy="10" r="1"/><circle cx="18" cy="12" r="1"/></svg>',
    color: "#7c6cf0",
    desc: "Tournaments the user has joined"
  },
  "TransactionHistory": {
    label: "Transaction History",
    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
    color: "#10b981",
    desc: "Deposits, withdrawals, winnings, refunds & bonuses"
  }
};

// Get UID from URL params
function getUid() {
  var params = new URLSearchParams(window.location.search);
  return params.get("uid");
}

// Get active tab from URL
function getInitialTab() {
  var params = new URLSearchParams(window.location.search);
  return params.get("tab") || "fields";
}

// ========== LOAD USER DATA ==========
function loadUserData(uid) {
  if (!firebase.firestore || !uid) {
    showError("Invalid user UID");
    return;
  }

  currentUid = uid;
  uidBannerValue.textContent = uid;

  var db = firebase.firestore();
  db.collection("Users").doc(uid).get().then(function(doc) {
    if (!doc.exists) {
      showError("User not found");
      return;
    }

    currentData = doc.data();
    originalData = JSON.parse(JSON.stringify(currentData)); // deep copy
    renderFields(currentData);

    // If initial tab is subcollections, switch
    if (getInitialTab() === "subcollections") {
      switchTab("subcollections");
    }
  }).catch(function(error) {
    showError("Error: " + error.message);
  });
}

// ========== RENDER FIELDS ==========
function renderFields(data) {
  var html = '<div class="fields-section">';

  // Sort fields: important ones first
  var fieldOrder = [
    "UserName", "email", "InGameUID", "AccountStatus", "KYCStatus",
    "Level", "TopUpCoins", "MyReferralCode", "MyReferralBonus", "ReferedBy",
    "freeFireVerified", "deviceId", "unreadNotificationCount",
    "JoinedAt", "createdAt", "lastLogin", "lastLoginDate", "lastLoginTime",
    "lastUpdated", "fcmToken", "fcmTokenUpdatedAt", "loginCount",
    "BannedReason", "BannedPeriod"
  ];

  // Get all keys from data
  var allKeys = Object.keys(data);

  // Add any keys not in fieldOrder
  for (var i = 0; i < allKeys.length; i++) {
    if (fieldOrder.indexOf(allKeys[i]) === -1) {
      fieldOrder.push(allKeys[i]);
    }
  }

  // Render each field
  for (var j = 0; j < fieldOrder.length; j++) {
    var key = fieldOrder[j];
    if (!(key in data)) continue;

    var value = data[key];
    var isReadOnly = READ_ONLY_FIELDS.indexOf(key) !== -1;
    var displayValue = formatFieldValue(value, key);
    var inputType = getInputType(value);

    html += '<div class="field-row" data-key="' + escapeHtml(key) + '">';
    html += '<div class="field-label">' + escapeHtml(key) + '</div>';

    if (isEditMode && !isReadOnly) {
      // Editable field
      if (typeof value === "boolean") {
        html += '<div class="field-edit">';
        html += '<select class="field-input field-select" data-key="' + escapeHtml(key) + '">';
        html += '<option value="true"' + (value ? ' selected' : '') + '>true</option>';
        html += '<option value="false"' + (!value ? ' selected' : '') + '>false</option>';
        html += '</select>';
        html += '</div>';
      } else {
        html += '<div class="field-edit">';
        html += '<input type="' + inputType + '" class="field-input" data-key="' + escapeHtml(key) + '" value="' + escapeHtml(String(value === null || value === undefined ? "" : value)) + '">';
        html += '</div>';
      }
    } else {
      // Display mode
      html += '<div class="field-value' + (isReadOnly ? ' readonly' : '') + '">';
      html += displayValue;
      if (isReadOnly) html += ' <span class="readonly-badge">read-only</span>';
      html += '</div>';
    }

    html += '</div>';
  }

  html += '</div>';
  fieldsContent.innerHTML = html;
}

// ========== FORMAT FIELD VALUE ==========
// Payment system: paisa to rupees for coin fields
function paisaToRupees(paisa) {
  if (paisa === null || paisa === undefined) return 0;
  return paisa / 100.0;
}

function formatCoins(paisa) {
  var rupees = paisaToRupees(paisa);
  if (rupees % 1 === 0) {
    return Math.round(rupees) + " Coins";
  }
  var formatted = rupees.toFixed(2).replace(/\.?0+$/, "");
  return formatted + " Coins";
}

function formatFieldValue(value, key) {
  if (value === null || value === undefined) {
    return '<span class="null-value">null</span>';
  }
  // Payment system: Show Coins for coin fields
  if (key && COIN_FIELDS.indexOf(key) !== -1 && typeof value === "number") {
    return '<span class="coins-value">' + escapeHtml(formatCoins(value)) + '</span>';
  }
  if (typeof value === "boolean") {
    return value ? '<span class="bool-true">true</span>' : '<span class="bool-false">false</span>';
  }
  if (typeof value === "object" && typeof value.toDate === "function") {
    // Firestore Timestamp
    return '<span class="timestamp-value">' + escapeHtml(formatDate(value)) + '</span>';
  }
  if (typeof value === "object" && value.seconds) {
    // Firestore Timestamp object
    return '<span class="timestamp-value">' + escapeHtml(formatDate(new Date(value.seconds * 1000))) + '</span>';
  }
  if (Array.isArray(value)) {
    return escapeHtml(JSON.stringify(value));
  }
  if (typeof value === "object") {
    return escapeHtml(JSON.stringify(value));
  }
  return escapeHtml(String(value));
}

// ========== GET INPUT TYPE ==========
function getInputType(value) {
  if (typeof value === "number") return "number";
  return "text";
}

// ========== EDIT MODE ==========
function toggleEditMode() {
  isEditMode = true;
  btnEdit.style.display = "none";
  btnSave.style.display = "flex";
  btnCancel.style.display = "flex";
  renderFields(currentData);
}

function cancelEdit() {
  isEditMode = false;
  btnEdit.style.display = "flex";
  btnSave.style.display = "none";
  btnCancel.style.display = "none";
  // Restore original data
  currentData = JSON.parse(JSON.stringify(originalData));
  renderFields(currentData);
}

// ========== SAVE CHANGES ==========
function saveChanges() {
  if (!currentUid || !firebase.firestore) return;

  // Collect all edited values
  var inputs = document.querySelectorAll(".field-input, .field-select");
  var updates = {};
  var hasChanges = false;

  for (var i = 0; i < inputs.length; i++) {
    var input = inputs[i];
    var key = input.getAttribute("data-key");
    var newValue = input.value;
    var originalValue = originalData[key];

    // Parse value based on original type
    var parsedValue;
    if (typeof originalValue === "number") {
      parsedValue = Number(newValue);
      if (isNaN(parsedValue)) parsedValue = 0;
    } else if (typeof originalValue === "boolean") {
      parsedValue = newValue === "true";
    } else if (originalValue === null || originalValue === undefined) {
      if (newValue === "") {
        parsedValue = null;
      } else if (!isNaN(Number(newValue))) {
        parsedValue = Number(newValue);
      } else {
        parsedValue = newValue;
      }
    } else {
      parsedValue = newValue;
    }

    // Check if value changed
    if (JSON.stringify(parsedValue) !== JSON.stringify(originalValue)) {
      updates[key] = parsedValue;
      hasChanges = true;
    }
  }

  if (!hasChanges) {
    showToast("No changes to save", "info");
    cancelEdit();
    return;
  }

  // Show loading on save button
  var origText = btnSave.innerHTML;
  btnSave.innerHTML = '<div class="detail-loading-spinner" style="width:16px;height:16px;border-width:2px;"></div> Saving...';
  btnSave.disabled = true;

  var db = firebase.firestore();
  updates.lastUpdated = firebase.firestore.FieldValue.serverTimestamp();

  db.collection("Users").doc(currentUid).update(updates).then(function() {
    // Update local data
    for (var key in updates) {
      currentData[key] = updates[key];
    }
    originalData = JSON.parse(JSON.stringify(currentData));

    isEditMode = false;
    btnEdit.style.display = "flex";
    btnSave.style.display = "none";
    btnCancel.style.display = "none";
    btnSave.innerHTML = origText;
    btnSave.disabled = false;

    renderFields(currentData);
    showToast("Changes saved successfully!", "success");
  }).catch(function(error) {
    showToast("Save error: " + error.message, "error");
    btnSave.innerHTML = origText;
    btnSave.disabled = false;
  });
}

// ========== TABS ==========
function switchTab(tab) {
  var tabFields = document.getElementById("tabFields");
  var tabSubcollections = document.getElementById("tabSubcollections");

  if (tab === "fields") {
    tabFields.classList.add("active");
    tabSubcollections.classList.remove("active");
    fieldsContent.style.display = "block";
    subcollectionList.style.display = "none";
  } else {
    tabFields.classList.remove("active");
    tabSubcollections.classList.add("active");
    fieldsContent.style.display = "none";
    subcollectionList.style.display = "block";

    if (subcollectionList.children.length === 0) {
      loadSubCollections();
    }
  }
}

// ========== SUBCOLLECTIONS ==========
function loadSubCollections() {
  if (!currentUid || !firebase.firestore) return;

  subcollectionList.innerHTML =
    '<div class="detail-loading">' +
      '<div class="detail-loading-spinner"></div>' +
      '<span>Loading subcollections...</span>' +
    '</div>';

  var db = firebase.firestore();
  var countPromises = [];

  // Fetch counts for each subcollection
  for (var i = 0; i < SUBCOLLECTIONS.length; i++) {
    (function(name) {
      countPromises.push(
        db.collection("Users").doc(currentUid).collection(name).get().then(function(snapshot) {
          return { name: name, count: snapshot.size };
        }).catch(function(err) {
          return { name: name, count: 0, error: err.message };
        })
      );
    })(SUBCOLLECTIONS[i]);
  }

  Promise.all(countPromises).then(function(results) {
    var countMap = {};
    for (var r = 0; r < results.length; r++) {
      countMap[results[r].name] = results[r].count;
    }
    renderSubCollectionButtons(countMap);
  });
}

function renderSubCollectionButtons(countMap) {
  var html = '<div class="subcollection-buttons">';

  for (var i = 0; i < SUBCOLLECTIONS.length; i++) {
    var name = SUBCOLLECTIONS[i];
    var config = SUBCOLLECTION_CONFIG[name];
    var count = countMap[name] || 0;

    html += '<a class="subcollection-btn" href="/admin/subcollection-detail/?uid=' + encodeURIComponent(currentUid) + '&collection=' + encodeURIComponent(name) + '">';
    html += '<div class="subcollection-btn-icon" style="background:' + config.color + '15;color:' + config.color + ';">';
    html += config.icon;
    html += '</div>';
    html += '<div class="subcollection-btn-info">';
    html += '<div class="subcollection-btn-title">' + escapeHtml(config.label) + '</div>';
    html += '<div class="subcollection-btn-desc">' + escapeHtml(config.desc) + '</div>';
    html += '</div>';
    html += '<div class="subcollection-btn-count">';
    html += '<span class="count-number">' + count + '</span>';
    html += '<span class="count-label">items</span>';
    html += '</div>';
    html += '<svg class="subcollection-btn-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>';
    html += '</a>';
  }

  html += '</div>';
  subcollectionList.innerHTML = html;
}

// ========== FORMAT DATE (IST) ==========
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

function formatDate(ts) {
  if (!ts) return "";
  var dateObj;
  if (ts && typeof ts.toDate === "function") {
    dateObj = ts.toDate();
  } else if (typeof ts === "number") {
    dateObj = new Date(ts);
  } else {
    dateObj = new Date(ts);
  }
  if (isNaN(dateObj.getTime())) return String(ts);
  var p = getISTParts(dateObj);
  var h = parseInt(p.hour); var m = parseInt(p.minute);
  var ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  m = m < 10 ? "0" + m : m;
  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return parseInt(p.day) + " " + months[parseInt(p.month) - 1] + " " + p.year + ", " + h + ":" + m + " " + ap;
}

// ========== TOAST ==========
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

// ========== SHOW ERROR ==========
function showError(msg) {
  fieldsContent.innerHTML =
    '<div class="detail-error">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
      '<h2>' + escapeHtml(msg) + '</h2>' +
      '<a href="/admin/users/" style="color:#7c6cf0;font-size:14px;">Go back to Users</a>' +
    '</div>';
}

// ========== INIT ==========
initAuthGuard(function(user) {
  var uid = getUid();
  if (uid) {
    loadUserData(uid);
  } else {
    showError("No user UID specified");
  }
});
initCommonUI();
