// ============================================
// EDMFire Admin - Application Detail Logic
// ============================================

var detailContent = document.getElementById("detailContent");
var statusBanner = document.getElementById("statusBanner");
var statusText = document.getElementById("statusText");
var detailActions = document.getElementById("detailActions");
var btnApprove = document.getElementById("btnApprove");
var btnReject = document.getElementById("btnReject");

var currentDocId = null;
var currentData = null;

// Get doc ID from URL params
function getDocId() {
  var params = new URLSearchParams(window.location.search);
  return params.get("id");
}

// Load application detail from Firestore
function loadApplicationDetail(docId) {
  if (!firebase.firestore || !docId) {
    showError("Invalid application ID");
    return;
  }

  currentDocId = docId;
  var db = firebase.firestore();

  db.collection("applications").doc(docId).get().then(function(doc) {
    if (!doc.exists) {
      showError("Application not found");
      return;
    }

    currentData = doc.data();
    renderDetail(currentData);
  }).catch(function(error) {
    showError("Error: " + error.message);
  });
}

// Render full detail
function renderDetail(data) {
  var status = (data.status || "pending").toLowerCase();

  // Update status banner
  statusBanner.className = "detail-status-banner " + status;
  statusText.textContent = "Status: " + status.toUpperCase();

  // Show action buttons for pending applications
  if (status === "pending") {
    detailActions.style.display = "flex";
  } else {
    detailActions.style.display = "none";
  }

  // Build sections
  var html = "";

  // === PERSONAL INFO ===
  html += buildSection("Personal Information",
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    buildFields([
      { label: "Full Name", value: data.fullName },
      { label: "Gender", value: data.gender },
      { label: "Age", value: data.age },
      { label: "Mobile", value: data.mobile },
      { label: "WhatsApp", value: data.whatsapp },
      { label: "Email", value: data.gmail },
    ])
  );

  // === LOCATION ===
  html += buildSection("Location",
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    buildFields([
      { label: "State", value: data.state },
      { label: "District", value: data.district },
      { label: "City", value: data.city },
    ])
  );

  // === GAMING INFO ===
  var gameModeLabel = data.gameModes === "br" ? "Battle Royale" : data.gameModes === "cs" ? "Clash Squad" : data.gameModes;
  html += buildSection("Gaming Information",
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="16" cy="10" r="1"/><circle cx="18" cy="12" r="1"/></svg>',
    buildFields([
      { label: "FF Nickname", value: data.ffNickname },
      { label: "Playing Years", value: data.playingYears },
      { label: "Hosted Before", value: data.hostedBefore },
      { label: "Hosting Experience", value: data.hostingExperience },
      { label: "Game Mode", value: gameModeLabel },
      { label: "Current Rank", value: data.currentRank },
    ])
  );

  // === DEVICE INFO ===
  var devicesStr = "";
  if (Array.isArray(data.devices)) {
    devicesStr = data.devices.join(", ");
  } else if (data.devices && typeof data.devices === "object") {
    devicesStr = Object.values(data.devices).join(", ");
  }

  html += buildSection("Device Information",
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    buildFields([
      { label: "Devices", value: devicesStr },
      { label: "Primary Device", value: data.primaryDevice },
      { label: "RAM Size", value: data.ramSize ? data.ramSize + " GB" : "" },
      { label: "Internet Quality", value: data.internetQuality },
      { label: "Can Screen Record", value: data.canScreenRecord },
    ])
  );

  // === ADDITIONAL ===
  html += buildSection("Additional Information",
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    buildFields([
      { label: "Discord / Telegram", value: data.discordTelegram },
      { label: "Why Join", value: data.whyJoin },
      { label: "Applied On", value: formatDate(data.createdAt) },
    ])
  );

  // === IMAGES ===
  if (data.ffScreenshotUrl || data.selfieUrl) {
    html += '<div class="detail-section">';
    html += '<div class="detail-section-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> Uploaded Images</div>';
    html += '<div class="detail-images">';

    if (data.ffScreenshotUrl) {
      html += '<div class="detail-image-card">';
      html += '<div class="detail-image-label">FF Screenshot</div>';
      html += '<img src="' + escapeHtml(data.ffScreenshotUrl) + '" alt="FF Screenshot" onclick="window.open(this.src,\'_blank\')" onerror="this.outerHTML=\'<div style=\\\'padding:30px;text-align:center;color:#3a3d52;font-size:12px;\\\'>Failed to load image</div>\'">';
      html += '</div>';
    }

    if (data.selfieUrl) {
      html += '<div class="detail-image-card">';
      html += '<div class="detail-image-label">Selfie</div>';
      html += '<img src="' + escapeHtml(data.selfieUrl) + '" alt="Selfie" onclick="window.open(this.src,\'_blank\')" onerror="this.outerHTML=\'<div style=\\\'padding:30px;text-align:center;color:#3a3d52;font-size:12px;\\\'>Failed to load image</div>\'">';
      html += '</div>';
    }

    html += '</div></div>';
  }

  detailContent.innerHTML = html;
}

// Helper: Build a section
function buildSection(title, iconSvg, content) {
  return '<div class="detail-section">' +
    '<div class="detail-section-title">' + iconSvg + ' ' + title + '</div>' +
    '<div class="detail-fields">' + content + '</div>' +
  '</div>';
}

// Helper: Build field rows
function buildFields(fields) {
  var html = "";
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    var val = f.value;
    var isEmpty = !val && val !== 0;
    html += '<div class="detail-field">' +
      '<span class="detail-field-label">' + f.label + '</span>' +
      '<span class="detail-field-value' + (isEmpty ? ' empty' : '') + '">' +
        (isEmpty ? 'Not provided' : escapeHtml(String(val))) +
      '</span>' +
    '</div>';
  }
  return html;
}

// Helper: Format date — always IST (Indian Standard Time, UTC+5:30)
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

// Show error
function showError(msg) {
  detailContent.innerHTML =
    '<div class="detail-error">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
      '<h2>' + escapeHtml(msg) + '</h2>' +
      '<a href="/admin/host-applications/" style="color:#7c6cf0;font-size:14px;">Go back to applications</a>' +
    '</div>';
}

// ========== APPROVE / REJECT WITH API ==========
var MANAGE_HOST_API = "/api/manage-host";

// ---------- APPROVE: Open password modal ----------
function openApproveModal() {
  var modal = document.getElementById("approveModal");
  var pwInput = document.getElementById("approvePassword");
  var emailInput = document.getElementById("approveEmail");
  if (!modal) return;
  pwInput.value = "";
  pwInput.style.borderColor = "";
  var errEl = document.getElementById("approvePwError");
  if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }
  // Pre-fill the host's email from application data
  if (emailInput && currentData && currentData.gmail) {
    emailInput.value = currentData.gmail;
  }
  modal.classList.add("active");
  setTimeout(function() { pwInput.focus(); }, 100);
}

function closeApproveModal() {
  var modal = document.getElementById("approveModal");
  if (modal) modal.classList.remove("active");
}

// ---------- REJECT: Open reason modal ----------
function openRejectModal() {
  var modal = document.getElementById("rejectModal");
  var reasonInput = document.getElementById("rejectReason");
  if (!modal) return;
  reasonInput.value = "";
  modal.classList.add("active");
  setTimeout(function() { reasonInput.focus(); }, 100);
}

function closeRejectModal() {
  var modal = document.getElementById("rejectModal");
  if (modal) modal.classList.remove("active");
}

// ---------- APPROVE: Submit to API ----------
function submitApprove() {
  if (!currentDocId || !currentData) return;

  var pwInput = document.getElementById("approvePassword");
  var hostPassword = pwInput.value.trim();

  if (!hostPassword || hostPassword.length < 6) {
    pwInput.style.borderColor = "#ef4444";
    var errEl = document.getElementById("approvePwError");
    errEl.textContent = "Password must be at least 6 characters";
    errEl.style.display = "block";
    return;
  }

  // Get admin email
  var user = firebase.auth().currentUser;
  var adminEmail = user ? user.email : "admin@edmfire.com";

  // Show loading on button
  var submitBtn = document.getElementById("approveSubmitBtn");
  var origText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<div class="detail-loading-spinner" style="width:16px;height:16px;border-width:2px;"></div> Creating Account...';
  submitBtn.disabled = true;
  btnApprove.disabled = true;

  // Call API
  fetch(MANAGE_HOST_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "approveHost",
      applicationId: currentDocId,
      applicationData: currentData,
      adminEmail: adminEmail,
      hostPassword: hostPassword,
    }),
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.success && data.result && data.result.success) {
      // Update UI
      statusBanner.className = "detail-status-banner approved";
      statusText.textContent = "Status: APPROVED";
      detailActions.style.display = "none";
      closeApproveModal();
      showToast("Host approved! Account created successfully.", "success");
    } else {
      var errMsg = (data.result && data.result.message) || data.error || "Unknown error";
      if (data.result && data.result.error === "AUTH_CREATE_FAILED") {
        showToast("Failed to create Auth account: " + errMsg, "error");
      } else {
        showToast("Error: " + errMsg, "error");
      }
    }
  })
  .catch(function(error) {
    showToast("Network error: " + error.message, "error");
  })
  .finally(function() {
    submitBtn.innerHTML = origText;
    submitBtn.disabled = false;
    btnApprove.disabled = false;
  });
}

// ---------- REJECT: Submit to API ----------
function submitReject() {
  if (!currentDocId) return;

  var reasonInput = document.getElementById("rejectReason");
  var rejectReason = reasonInput.value.trim();

  // Get admin email
  var user = firebase.auth().currentUser;
  var adminEmail = user ? user.email : "admin@edmfire.com";

  // Show loading on button
  var submitBtn = document.getElementById("rejectSubmitBtn");
  var origText = submitBtn.innerHTML;
  submitBtn.innerHTML = '<div class="detail-loading-spinner" style="width:16px;height:16px;border-width:2px;"></div> Rejecting...';
  submitBtn.disabled = true;
  btnReject.disabled = true;

  // Call API
  fetch(MANAGE_HOST_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "rejectHost",
      applicationId: currentDocId,
      adminEmail: adminEmail,
      rejectReason: rejectReason || "No reason provided",
    }),
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.success && data.result && data.result.success) {
      // Update UI
      statusBanner.className = "detail-status-banner rejected";
      statusText.textContent = "Status: REJECTED";
      detailActions.style.display = "none";
      closeRejectModal();
      showToast("Application rejected.", "success");
    } else {
      showToast("Error: " + (data.error || "Unknown error"), "error");
    }
  })
  .catch(function(error) {
    showToast("Network error: " + error.message, "error");
  })
  .finally(function() {
    submitBtn.innerHTML = origText;
    submitBtn.disabled = false;
    btnReject.disabled = false;
  });
}

// ---------- Toast notification ----------
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

// ========== EVENT LISTENERS ==========
if (btnApprove) {
  btnApprove.addEventListener("click", function() {
    openApproveModal();
  });
}

if (btnReject) {
  btnReject.addEventListener("click", function() {
    openRejectModal();
  });
}

// ========== INIT ==========
initAuthGuard(function(user) {
  var docId = getDocId();
  if (docId) {
    loadApplicationDetail(docId);
  } else {
    showError("No application ID specified");
  }
});
initCommonUI();
