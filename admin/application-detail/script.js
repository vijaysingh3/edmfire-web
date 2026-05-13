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

// Helper: Format date
function formatDate(ts) {
  if (!ts) return "";
  var d;
  if (ts && typeof ts.toDate === "function") {
    d = ts.toDate();
  } else if (typeof ts === "number") {
    d = new Date(ts);
  } else {
    d = new Date(ts);
  }
  if (isNaN(d.getTime())) return String(ts);
  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear() + ", " +
    (d.getHours() % 12 || 12) + ":" + (d.getMinutes() < 10 ? "0" : "") + d.getMinutes() +
    " " + (d.getHours() >= 12 ? "PM" : "AM");
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

// ========== APPROVE / REJECT ==========
function updateApplicationStatus(newStatus) {
  if (!currentDocId || !firebase.firestore) return;

  var db = firebase.firestore();
  var btn = newStatus === "approved" ? btnApprove : btnReject;
  var origText = btn.innerHTML;

  btn.innerHTML = '<div class="detail-loading-spinner" style="width:16px;height:16px;border-width:2px;"></div> Updating...';
  btn.disabled = true;

  db.collection("applications").doc(currentDocId).update({
    status: newStatus,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(function() {
    // Update UI
    statusBanner.className = "detail-status-banner " + newStatus;
    statusText.textContent = "Status: " + newStatus.toUpperCase();
    detailActions.style.display = "none";
    btn.innerHTML = origText;
    btn.disabled = false;
  }).catch(function(error) {
    alert("Error: " + error.message);
    btn.innerHTML = origText;
    btn.disabled = false;
  });
}

// ========== EVENT LISTENERS ==========
if (btnApprove) {
  btnApprove.addEventListener("click", function() {
    if (confirm("Approve this application?")) {
      updateApplicationStatus("approved");
    }
  });
}

if (btnReject) {
  btnReject.addEventListener("click", function() {
    if (confirm("Reject this application?")) {
      updateApplicationStatus("rejected");
    }
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
