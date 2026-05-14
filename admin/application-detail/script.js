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
var currentHostData = null; // Host data from hosts collection (for approved apps)
var MANAGE_HOST_API = "/api/manage-host";

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
  currentHostData = null;
  var db = firebase.firestore();

  db.collection("applications").doc(docId).get().then(function(doc) {
    if (!doc.exists) {
      showError("Application not found");
      return;
    }

    currentData = doc.data();

    // If approved, also fetch host data from hosts collection
    var status = (currentData.status || "pending").toLowerCase();
    if (status === "approved" && currentData.hostUid) {
      fetchHostData(currentData.hostUid, function(hostData) {
        currentHostData = hostData;
        renderDetail(currentData);
      }, function() {
        // If host fetch fails, still render without password
        renderDetail(currentData);
      });
    } else {
      renderDetail(currentData);
    }
  }).catch(function(error) {
    showError("Error: " + error.message);
  });
}

// Fetch host data from hosts collection
function fetchHostData(hostUid, onSuccess, onError) {
  var db = firebase.firestore();
  db.collection("hosts").doc(hostUid).get().then(function(doc) {
    if (doc.exists) {
      onSuccess(doc.data());
    } else {
      if (onError) onError();
    }
  }).catch(function(error) {
    console.error("Fetch host data error:", error);
    if (onError) onError();
  });
}

// Render full detail
function renderDetail(data) {
  var status = (data.status || "pending").toLowerCase();

  // Update status banner
  statusBanner.className = "detail-status-banner " + status;
  statusText.textContent = "Status: " + status.toUpperCase();

  // Show action buttons only for pending applications
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

  // === SHOW REJECT REASON IF REJECTED ===
  if (status === "rejected" && data.rejectReason) {
    html += buildSection("Rejection Details",
      '<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      buildFields([
        { label: "Reject Reason", value: data.rejectReason },
        { label: "Rejected By", value: data.rejectedBy },
        { label: "Rejected On", value: formatDate(data.rejectedAt) },
      ])
    );
  }

  // === SHOW APPROVAL INFO IF APPROVED ===
  if (status === "approved") {
    var passwordHtml = "";
    if (currentHostData && currentHostData.password) {
      passwordHtml =
        '<div class="detail-field">' +
          '<span class="detail-field-label">Host Password</span>' +
          '<div class="detail-password-wrap">' +
            '<span class="detail-password-masked" id="hostPasswordValue">' + escapeHtml(currentHostData.password) + '</span>' +
            '<button class="detail-password-eye" id="detailPasswordEye" title="Show/Hide password">' +
              '<svg class="eye-open" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
              '<svg class="eye-closed" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>' +
            '</button>' +
            '<button class="detail-password-copy" id="detailPasswordCopy" title="Copy password">' +
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>';
    }

    html += buildSection("Approval Details",
      '<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      buildFields([
        { label: "Approved By", value: data.approvedBy },
        { label: "Approved On", value: formatDate(data.approvedAt) },
        { label: "Host Account UID", value: data.hostUid },
      ]) + passwordHtml
    );
  }

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

  // Bind password eye toggle and copy events for approved apps
  bindPasswordEvents();
}

// Bind password visibility toggle and copy events
function bindPasswordEvents() {
  // Eye toggle for host password in detail view
  var detailEye = document.getElementById("detailPasswordEye");
  var passwordSpan = document.getElementById("hostPasswordValue");
  if (detailEye && passwordSpan) {
    // Start with masked password
    var actualPassword = passwordSpan.textContent;
    passwordSpan.textContent = "\u2022".repeat(actualPassword.length);
    passwordSpan.setAttribute("data-password", actualPassword);
    passwordSpan.setAttribute("data-visible", "false");

    detailEye.addEventListener("click", function() {
      var isVisible = passwordSpan.getAttribute("data-visible") === "true";
      var eyeOpen = detailEye.querySelector(".eye-open");
      var eyeClosed = detailEye.querySelector(".eye-closed");

      if (isVisible) {
        // Hide password
        passwordSpan.textContent = "\u2022".repeat(actualPassword.length);
        passwordSpan.setAttribute("data-visible", "false");
        eyeOpen.style.display = "block";
        eyeClosed.style.display = "none";
      } else {
        // Show password
        passwordSpan.textContent = actualPassword;
        passwordSpan.setAttribute("data-visible", "true");
        eyeOpen.style.display = "none";
        eyeClosed.style.display = "block";
      }
    });
  }

  // Copy button for host password
  var detailCopy = document.getElementById("detailPasswordCopy");
  if (detailCopy && passwordSpan) {
    detailCopy.addEventListener("click", function() {
      var pw = passwordSpan.getAttribute("data-password");
      if (pw && navigator.clipboard) {
        navigator.clipboard.writeText(pw).then(function() {
          showToast("Password copied!", "success");
          detailCopy.classList.add("copied");
          setTimeout(function() { detailCopy.classList.remove("copied"); }, 1500);
        }).catch(function() {
          showToast("Failed to copy password", "error");
        });
      } else if (pw) {
        // Fallback for older browsers
        var textarea = document.createElement("textarea");
        textarea.value = pw;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        showToast("Password copied!", "success");
      }
    });
  }
}

// ===================================================
// CUSTOM DIALOG SYSTEM
// ===================================================

// Remove any existing dialog
function closeDialog() {
  var existing = document.getElementById("appDialog");
  if (existing) existing.remove();
  var overlay = document.getElementById("dialogOverlay");
  if (overlay) overlay.remove();
}

// Show confirmation dialog for Approve (with password input)
function showApproveConfirm(callback) {
  closeDialog();

  var overlay = document.createElement("div");
  overlay.id = "dialogOverlay";
  overlay.className = "dialog-overlay";

  var dialog = document.createElement("div");
  dialog.id = "appDialog";
  dialog.className = "dialog-box";
  dialog.innerHTML =
    '<div class="dialog-icon dialog-icon-approve">' +
      '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' +
    '</div>' +
    '<div class="dialog-title">Approve Application?</div>' +
    '<div class="dialog-message">This will create a new host account for <strong>' + escapeHtml(currentData.gmail || "this user") + '</strong> and store their data in the hosts collection.</div>' +
    '<div class="dialog-password-field">' +
      '<label class="dialog-password-label" for="hostPasswordInput">Set Host Account Password</label>' +
      '<div class="dialog-password-input-wrap">' +
        '<input type="password" class="dialog-password-input" id="hostPasswordInput" placeholder="Enter password (min 6 chars)" minlength="6" autocomplete="new-password">' +
        '<button type="button" class="dialog-password-eye" id="dialogPasswordEye" title="Toggle visibility">' +
          '<svg class="eye-open" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
          '<svg class="eye-closed" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>' +
        '</button>' +
      '</div>' +
      '<div class="dialog-password-hint" id="dialogPasswordHint"></div>' +
    '</div>' +
    '<div class="dialog-buttons">' +
      '<button class="dialog-btn dialog-btn-cancel" id="dialogCancel">No, Go Back</button>' +
      '<button class="dialog-btn dialog-btn-confirm dialog-btn-green" id="dialogConfirm">Yes, Approve</button>' +
    '</div>';

  document.body.appendChild(overlay);
  document.body.appendChild(dialog);

  var passwordInput = document.getElementById("hostPasswordInput");
  var eyeBtn = document.getElementById("dialogPasswordEye");
  var eyeOpen = eyeBtn.querySelector(".eye-open");
  var eyeClosed = eyeBtn.querySelector(".eye-closed");
  var passwordHint = document.getElementById("dialogPasswordHint");

  // Toggle password visibility
  eyeBtn.addEventListener("click", function() {
    if (passwordInput.type === "password") {
      passwordInput.type = "text";
      eyeOpen.style.display = "none";
      eyeClosed.style.display = "block";
    } else {
      passwordInput.type = "password";
      eyeOpen.style.display = "block";
      eyeClosed.style.display = "none";
    }
  });

  passwordInput.focus();

  document.getElementById("dialogCancel").addEventListener("click", function() {
    closeDialog();
  });

  document.getElementById("dialogConfirm").addEventListener("click", function() {
    var password = passwordInput.value.trim();
    if (!password || password.length < 6) {
      passwordInput.style.borderColor = "#ef4444";
      passwordHint.textContent = "Password must be at least 6 characters";
      passwordHint.style.color = "#ef4444";
      passwordInput.focus();
      return;
    }
    closeDialog();
    callback(password);
  });

  overlay.addEventListener("click", function() {
    closeDialog();
  });
}

// Show reject reason dialog
function showRejectDialog(callback) {
  closeDialog();

  var overlay = document.createElement("div");
  overlay.id = "dialogOverlay";
  overlay.className = "dialog-overlay";

  var dialog = document.createElement("div");
  dialog.id = "appDialog";
  dialog.className = "dialog-box";
  dialog.innerHTML =
    '<div class="dialog-icon dialog-icon-reject">' +
      '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
    '</div>' +
    '<div class="dialog-title">Reject Application</div>' +
    '<div class="dialog-message">Please provide a reason for rejecting this application:</div>' +
    '<textarea class="dialog-textarea" id="rejectReasonInput" placeholder="Enter reject reason..." rows="3"></textarea>' +
    '<div class="dialog-buttons">' +
      '<button class="dialog-btn dialog-btn-cancel" id="dialogCancel">Cancel</button>' +
      '<button class="dialog-btn dialog-btn-confirm dialog-btn-red" id="dialogConfirm">Reject</button>' +
    '</div>';

  document.body.appendChild(overlay);
  document.body.appendChild(dialog);

  var textarea = document.getElementById("rejectReasonInput");
  textarea.focus();

  document.getElementById("dialogCancel").addEventListener("click", function() {
    closeDialog();
  });

  document.getElementById("dialogConfirm").addEventListener("click", function() {
    var reason = textarea.value.trim();
    if (!reason) {
      textarea.style.borderColor = "#ef4444";
      textarea.setAttribute("placeholder", "Please enter a reason...");
      textarea.focus();
      return;
    }
    closeDialog();
    callback(reason);
  });

  overlay.addEventListener("click", function() {
    closeDialog();
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

  // Auto remove after 4 seconds
  setTimeout(function() {
    if (toast.parentNode) {
      toast.classList.add("toast-fade");
      setTimeout(function() { if (toast.parentNode) toast.remove(); }, 400);
    }
  }, 4000);
}

// ===================================================
// APPROVE LOGIC
// ===================================================
function handleApprove() {
  if (!currentDocId || !currentData) return;

  // Step 1: Show confirmation dialog with password input
  showApproveConfirm(function(hostPassword) {
    // Step 2: Disable button and show loading
    btnApprove.disabled = true;
    btnReject.disabled = true;
    btnApprove.innerHTML = '<div class="detail-loading-spinner" style="width:16px;height:16px;border-width:2px;"></div> Checking email...';

    // Step 3: First check if email already exists in Auth
    fetch(MANAGE_HOST_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "checkEmail",
        applicationData: currentData,
      }),
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data.success) {
        throw new Error(data.error || "Check email failed");
      }

      var emailExists = data.result.exists;

      if (emailExists) {
        // Email already registered - show toast error and go back
        showToast("This email is already registered! Cannot create duplicate account.", "error");
        btnApprove.disabled = false;
        btnReject.disabled = false;
        btnApprove.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Approve';
        return;
      }

      // Step 4: Email not registered, proceed to approve with password
      btnApprove.innerHTML = '<div class="detail-loading-spinner" style="width:16px;height:16px;border-width:2px;"></div> Creating host account...';

      var adminEmail = currentAdmin ? currentAdmin.email : "admin@edmfire.com";

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
        if (!data.success && data.result) {
          // Check for specific error
          if (data.result.error === "EMAIL_ALREADY_REGISTERED") {
            showToast("This email is already registered in Auth!", "error");
            btnApprove.disabled = false;
            btnReject.disabled = false;
            btnApprove.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Approve';
            return;
          }
          if (data.result.error === "INVALID_PASSWORD") {
            showToast(data.result.message || "Invalid password", "error");
            btnApprove.disabled = false;
            btnReject.disabled = false;
            btnApprove.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Approve';
            return;
          }
          throw new Error(data.result.message || data.error || "Approve failed");
        }

        // Success!
        showToast("Host approved and account created successfully!", "success");

        // Update UI
        statusBanner.className = "detail-status-banner approved";
        statusText.textContent = "Status: APPROVED";
        detailActions.style.display = "none";

        // Reload detail to show approval info
        setTimeout(function() {
          loadApplicationDetail(currentDocId);
        }, 1500);
      })
      .catch(function(error) {
        showToast("Error: " + error.message, "error");
        btnApprove.disabled = false;
        btnReject.disabled = false;
        btnApprove.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Approve';
      });
    })
    .catch(function(error) {
      showToast("Error: " + error.message, "error");
      btnApprove.disabled = false;
      btnReject.disabled = false;
      btnApprove.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Approve';
    });
  });
}

// ===================================================
// REJECT LOGIC
// ===================================================
function handleReject() {
  if (!currentDocId) return;

  // Step 1: Show reject reason dialog
  showRejectDialog(function(reason) {
    // Step 2: Disable buttons and show loading
    btnApprove.disabled = true;
    btnReject.disabled = true;
    btnReject.innerHTML = '<div class="detail-loading-spinner" style="width:16px;height:16px;border-width:2px;"></div> Rejecting...';

    var adminEmail = currentAdmin ? currentAdmin.email : "admin@edmfire.com";

    // Step 3: Call API to reject
    fetch(MANAGE_HOST_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "rejectHost",
        applicationId: currentDocId,
        rejectReason: reason,
        adminEmail: adminEmail,
      }),
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data.success) {
        throw new Error(data.error || "Reject failed");
      }

      // Success!
      showToast("Application rejected successfully", "success");

      // Update UI
      statusBanner.className = "detail-status-banner rejected";
      statusText.textContent = "Status: REJECTED";
      detailActions.style.display = "none";

      // Reload detail to show rejection info
      setTimeout(function() {
        loadApplicationDetail(currentDocId);
      }, 1500);
    })
    .catch(function(error) {
      showToast("Error: " + error.message, "error");
      btnApprove.disabled = false;
      btnReject.disabled = false;
      btnReject.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Reject';
    });
  });
}

// ===================================================
// HELPERS
// ===================================================
function buildSection(title, iconSvg, content) {
  return '<div class="detail-section">' +
    '<div class="detail-section-title">' + iconSvg + ' ' + title + '</div>' +
    '<div class="detail-fields">' + content + '</div>' +
  '</div>';
}

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

function formatDate(ts) {
  if (!ts) return "";
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

function showError(msg) {
  detailContent.innerHTML =
    '<div class="detail-error">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
      '<h2>' + escapeHtml(msg) + '</h2>' +
      '<a href="/admin/host-applications/" style="color:#7c6cf0;font-size:14px;">Go back to applications</a>' +
    '</div>';
}

// ===================================================
// EVENT LISTENERS
// ===================================================
if (btnApprove) {
  btnApprove.addEventListener("click", handleApprove);
}

if (btnReject) {
  btnReject.addEventListener("click", handleReject);
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
