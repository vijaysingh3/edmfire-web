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

// SubCollections
var SUBCOLLECTIONS = ["JoinedMatches", "Notifications", "TransactionHistory"];

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
    var displayValue = formatFieldValue(value);
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
function formatFieldValue(value) {
  if (value === null || value === undefined) {
    return '<span class="null-value">null</span>';
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

  var html = "";

  for (var i = 0; i < SUBCOLLECTIONS.length; i++) {
    var subName = SUBCOLLECTIONS[i];
    html += buildSubCollectionCard(subName);
  }

  subcollectionList.innerHTML = html;

  // Load each subcollection data
  for (var j = 0; j < SUBCOLLECTIONS.length; j++) {
    loadSubCollectionData(SUBCOLLECTIONS[j]);
  }
}

function buildSubCollectionCard(name) {
  return '<div class="subcollection-card" id="subcard_' + name + '">' +
    '<div class="subcollection-header" onclick="toggleSubCollection(\'' + name + '\')">' +
      '<div class="subcollection-title">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c6cf0" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
        escapeHtml(name) +
      '</div>' +
      '<div class="subcollection-toggle">' +
        '<span class="subcollection-count" id="subcount_' + name + '">0</span>' +
        '<svg class="toggle-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>' +
      '</div>' +
    '</div>' +
    '<div class="subcollection-body" id="subbody_' + name + '" style="display:none;">' +
      '<div class="detail-loading"><div class="detail-loading-spinner"></div><span>Loading...</span></div>' +
    '</div>' +
  '</div>';
}

function toggleSubCollection(name) {
  var body = document.getElementById("subbody_" + name);
  var card = document.getElementById("subcard_" + name);

  if (body.style.display === "none") {
    body.style.display = "block";
    card.classList.add("expanded");
  } else {
    body.style.display = "none";
    card.classList.remove("expanded");
  }
}

function loadSubCollectionData(name) {
  var db = firebase.firestore();
  var countEl = document.getElementById("subcount_" + name);
  var bodyEl = document.getElementById("subbody_" + name);

  db.collection("Users").doc(currentUid).collection(name).get().then(function(snapshot) {
    var count = snapshot.size;
    if (countEl) countEl.textContent = count;

    if (snapshot.empty) {
      bodyEl.innerHTML = '<div class="subcollection-empty">No documents in ' + escapeHtml(name) + '</div>';
      return;
    }

    var html = "";
    var docCount = 0;
    var MAX_DOCS = 50;

    snapshot.forEach(function(doc) {
      if (docCount >= MAX_DOCS) return;
      docCount++;

      var data = doc.data();
      var docId = doc.id;
      var fields = Object.keys(data);

      html += '<div class="subcollection-doc">';
      html += '<div class="subcollection-doc-id">ID: ' + escapeHtml(docId) + '</div>';
      html += '<div class="subcollection-doc-fields">';

      for (var i = 0; i < fields.length; i++) {
        var key = fields[i];
        var value = data[key];
        html += '<div class="subcollection-doc-field">';
        html += '<span class="subcollection-doc-key">' + escapeHtml(key) + '</span>';
        html += '<span class="subcollection-doc-value">' + formatFieldValue(value) + '</span>';
        html += '</div>';
      }

      html += '</div></div>';
    });

    if (snapshot.size > MAX_DOCS) {
      html += '<div class="subcollection-more">Showing ' + MAX_DOCS + ' of ' + snapshot.size + ' documents</div>';
    }

    bodyEl.innerHTML = html;
  }).catch(function(err) {
    bodyEl.innerHTML = '<div class="subcollection-error">Error loading: ' + escapeHtml(err.message) + '</div>';
  });
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
