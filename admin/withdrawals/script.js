// ============================================
// EDMFire Admin - Withdrawal Requests Logic
// Console debug logging enabled
// ============================================

var wdList = document.getElementById("wdList");
var wdSearchInput = document.getElementById("wdSearchInput");
var wdSearchClear = document.getElementById("wdSearchClear");
var wdResultsCount = document.getElementById("wdResultsCount");
var MANAGE_WITHDRAWAL_API = "/api/manage-withdrawal";

var allWithdrawals = [];
var filteredWithdrawals = [];
var currentFilter = "pending";
var searchQuery = "";
var processingItems = {};
var searchTimeout = null;

console.log("[WD-INIT] Script loaded. DOM elements ready:", {
  wdList: !!wdList,
  wdSearchInput: !!wdSearchInput,
  wdSearchClear: !!wdSearchClear,
  wdResultsCount: !!wdResultsCount
});

// ============ LOAD WITHDRAWAL REQUESTS ============
function loadWithdrawals() {
  console.log("[WD-LOAD] loadWithdrawals() called");

  if (!firebase.firestore) {
    console.error("[WD-LOAD] ERROR: firebase.firestore is not available!");
    wdList.innerHTML = '<div class="wd-empty"><p>Firestore not available</p></div>';
    return;
  }

  var db = firebase.firestore();
  console.log("[WD-LOAD] Firestore instance created");

  // Real-time listener on WithdrawalRequests
  console.log("[WD-LOAD] Setting up onSnapshot listener on WithdrawalRequests...");
  db.collection("WithdrawalRequests")
    .orderBy("createdAt", "desc")
    .onSnapshot(function(snapshot) {
      console.log("[WD-LOAD] onSnapshot fired. Docs count:", snapshot.size);
      allWithdrawals = [];
      var counts = { pending: 0, completed: 0, refunded: 0, rejected: 0 };

      snapshot.forEach(function(doc) {
        var data = doc.data();
        var w = parseWithdrawalDoc(doc.id, data);
        allWithdrawals.push(w);

        var status = (w.status || "pending").toLowerCase();
        if (counts[status] !== undefined) counts[status]++;
      });

      console.log("[WD-LOAD] Parsed withdrawals:", allWithdrawals.length, "Counts:", JSON.stringify(counts));

      // Update stats
      updateStats(counts, allWithdrawals.length);

      // Update nav badge
      var badge = document.getElementById("navWithdrawalBadge");
      if (badge) {
        if (counts.pending > 0) {
          badge.textContent = counts.pending;
          badge.style.display = "flex";
        } else {
          badge.style.display = "none";
        }
      }

      applyFilterAndSearch();
    }, function(error) {
      console.error("[WD-LOAD] onSnapshot ERROR:", error);
      wdList.innerHTML =
        '<div class="wd-empty">' +
          '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
          '<h2>Error Loading</h2>' +
          '<p>' + escapeHtml(error.message) + '</p>' +
        '</div>';
    });
}

// ============ PARSE WITHDRAWAL DOCUMENT ============
function parseWithdrawalDoc(docId, data) {
  var amount = data.amount || 0;
  var bankAddress = data.bankAddress || "N/A";
  var status = data.status || "pending";
  var transactionId = data.transactionId || docId;
  var userId = data.userId || "";
  var userName = data.userName || "Unknown User";
  var userEmail = data.userEmail || "";
  var notes = data.notes || "";
  var utrNumber = data.utrNumber || "";
  var inGameUID = data.inGameUID || 0;
  var inGameLevel = data.inGameLevel || 0;
  var totalPlayed = data.TotalPlayed || 0;
  var readableTimestamp = data.readableTimestamp || "";

  // Parse createdAt
  var createdAtStr = "";
  if (data.createdAt) {
    if (typeof data.createdAt.toDate === "function") {
      createdAtStr = formatDate(data.createdAt.toDate());
    } else if (data.createdAt.seconds) {
      createdAtStr = formatDate(new Date(data.createdAt.seconds * 1000));
    }
  }
  if (!createdAtStr && readableTimestamp) {
    createdAtStr = readableTimestamp;
  }

  // Parse userData sub-map
  var ud = data.userData || {};
  var userData = {
    inGameUID: ud.inGameUID || 0,
    level: ud.level || 0,
    totalPlayed: ud.totalPlayed || 0,
    winningCoinsAfter: ud.winningCoinsAfter || 0,
    winningCoinsBefore: ud.winningCoinsBefore || 0,
    withdrawalCount: ud.withdrawalCount || 0,
  };

  return {
    id: docId,
    amount: amount,
    bankAddress: bankAddress,
    status: status,
    transactionId: transactionId,
    userId: userId,
    userName: userName,
    userEmail: userEmail,
    notes: notes,
    utrNumber: utrNumber,
    inGameUID: inGameUID,
    inGameLevel: inGameLevel,
    totalPlayed: totalPlayed,
    readableTimestamp: readableTimestamp || createdAtStr,
    createdAtStr: createdAtStr,
    userData: userData,
  };
}

// ============ FORMAT AMOUNT (PAISA → RUPEES) ============
function formatAmount(amountInPaisa) {
  var rupees = amountInPaisa / 100.0;
  if (rupees % 1 === 0) {
    return "\u20B9" + rupees.toFixed(0);
  }
  return "\u20B9" + rupees.toFixed(2);
}

// ============ DETECT PAYMENT METHOD ============
function getPaymentMethod(bankAddress) {
  if (!bankAddress) return "Unknown";
  if (bankAddress.indexOf("@") !== -1 || bankAddress.toLowerCase().indexOf("upi") === 0) {
    return "UPI";
  }
  return "Bank Transfer";
}

// ============ UPDATE STATS ============
function updateStats(counts, total) {
  console.log("[WD-STATS] Updating stats - Total:", total, "Counts:", JSON.stringify(counts));
  document.getElementById("wdTotalCount").textContent = total;
  document.getElementById("wdPendingCount").textContent = counts.pending;
  document.getElementById("wdCompletedCount").textContent = counts.completed;
  document.getElementById("wdRefundedCount").textContent = counts.refunded;
  document.getElementById("wdRejectedCount").textContent = counts.rejected;
}

// ============ FILTER + SEARCH ============
function applyFilterAndSearch() {
  console.log("[WD-FILTER] applyFilterAndSearch() - filter:", currentFilter, "search:", searchQuery);
  filteredWithdrawals = allWithdrawals.filter(function(w) {
    // Filter by status
    if (currentFilter !== "all" && w.status.toLowerCase() !== currentFilter) {
      return false;
    }
    // Search
    if (searchQuery) {
      var q = searchQuery.toLowerCase();
      var emailMatch = (w.userEmail || "").toLowerCase().indexOf(q) !== -1;
      var userIdMatch = (w.userId || "").toLowerCase().indexOf(q) !== -1;
      var nameMatch = (w.userName || "").toLowerCase().indexOf(q) !== -1;
      if (!emailMatch && !userIdMatch && !nameMatch) return false;
    }
    return true;
  });

  console.log("[WD-FILTER] Filtered results:", filteredWithdrawals.length);
  updateResultsCount();
  renderWithdrawalCards();
}

function updateResultsCount() {
  var size = filteredWithdrawals.length;
  var text;
  if (!searchQuery && currentFilter === "all") {
    text = size + " total requests";
  } else if (!searchQuery) {
    text = size + " " + currentFilter + " requests";
  } else if (size === 0) {
    text = "No matching requests found";
  } else if (size === 1) {
    text = "1 matching request found";
  } else {
    text = size + " matching requests found";
  }
  wdResultsCount.textContent = text;
}

// ============ RENDER CARDS ============
function renderWithdrawalCards() {
  console.log("[WD-RENDER] renderWithdrawalCards() - count:", filteredWithdrawals.length);

  if (filteredWithdrawals.length === 0) {
    var emptyMsg = searchQuery ? "No results found" : "No " + currentFilter + " requests";
    wdList.innerHTML =
      '<div class="wd-empty">' +
        '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3a3d52" stroke-width="1"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>' +
        '<h2>' + emptyMsg + '</h2>' +
        '<p>Withdrawal requests will appear here</p>' +
      '</div>';
    return;
  }

  var html = "";
  filteredWithdrawals.forEach(function(w) {
    var isProcessing = !!processingItems[w.transactionId];
    var progress = processingItems[w.transactionId] || 0;
    var paymentMethod = getPaymentMethod(w.bankAddress);
    var status = (w.status || "pending").toLowerCase();

    html += '<div class="wd-card' + (isProcessing ? ' processing' : '') + '" data-tid="' + escapeHtml(w.transactionId) + '">';

    // Progress bar (only shown when processing)
    html += '<div class="wd-card-progress">';
    html += '<div class="wd-progress-bar"><div class="wd-progress-fill" style="width:' + progress + '%"></div></div>';
    html += '<span class="wd-progress-text">' + progress + '%</span>';
    html += '</div>';

    // Top: Name + Amount
    html += '<div class="wd-card-top">';
    html += '<span class="wd-card-name">' + escapeHtml(w.userName || "Unknown User") + '</span>';
    html += '<span class="wd-card-amount">' + formatAmount(w.amount) + '</span>';
    html += '</div>';

    // User ID
    var shortUserId = w.userId ? w.userId.substring(0, 10) + "..." : "-";
    html += '<div class="wd-card-userid">User ID: ' + escapeHtml(shortUserId) + '</div>';

    // Game UID
    if (w.inGameUID) {
      html += '<div class="wd-card-gameuid">UID: ' + escapeHtml(String(w.inGameUID)) + '</div>';
    }

    // Payment row with copy
    html += '<div class="wd-card-payment-row">';
    html += '<span class="wd-card-payment">' + escapeHtml(w.bankAddress) + '</span>';
    html += '<button class="wd-card-copy-btn" data-copy="' + escapeHtml(w.bankAddress) + '" title="Copy payment details">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    html += ' Copy</button>';
    html += '</div>';

    // Payment method
    html += '<div class="wd-card-payment-method">Via: ' + escapeHtml(paymentMethod) + '</div>';

    // Bottom: Status + Timestamp
    html += '<div class="wd-card-bottom">';
    html += '<span class="wd-card-status ' + status + '">' + status.toUpperCase() + '</span>';
    html += '<span class="wd-card-timestamp">' + escapeHtml(w.readableTimestamp || w.createdAtStr || "-") + '</span>';
    html += '</div>';

    // Action buttons (only for pending & not processing)
    if (status === "pending" && !isProcessing) {
      html += '<div class="wd-card-actions">';
      html += '<button class="wd-btn wd-btn-complete" data-action="complete" data-tid="' + escapeHtml(w.transactionId) + '">Complete</button>';
      html += '<button class="wd-btn wd-btn-refund" data-action="refund" data-tid="' + escapeHtml(w.transactionId) + '">Refund</button>';
      html += '<button class="wd-btn wd-btn-reject" data-action="reject" data-tid="' + escapeHtml(w.transactionId) + '">Reject</button>';
      html += '</div>';
    }

    // View details
    html += '<button class="wd-card-view-btn" data-action="view" data-tid="' + escapeHtml(w.transactionId) + '">View Details</button>';

    html += '</div>';
  });

  wdList.innerHTML = html;
  console.log("[WD-RENDER] Cards rendered. Binding events...");
  bindCardEvents();
}

// ============ BIND CARD EVENTS ============
function bindCardEvents() {
  // Copy buttons
  var copyBtns = document.querySelectorAll(".wd-card-copy-btn");
  console.log("[WD-BIND] Copy buttons found:", copyBtns.length);
  copyBtns.forEach(function(btn) {
    btn.addEventListener("click", function() {
      var text = btn.getAttribute("data-copy");
      console.log("[WD-COPY] Copy clicked:", text);
      if (text && navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() {
          btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied';
          btn.classList.add("copied");
          setTimeout(function() {
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy';
            btn.classList.remove("copied");
          }, 2000);
        });
      } else if (text) {
        var ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        showToast("Copied!", "success");
      }
    });
  });

  // Action buttons
  var actionBtns = document.querySelectorAll(".wd-btn[data-action]");
  console.log("[WD-BIND] Action buttons found:", actionBtns.length);
  actionBtns.forEach(function(btn) {
    btn.addEventListener("click", function(e) {
      var action = btn.getAttribute("data-action");
      var tid = btn.getAttribute("data-tid");
      console.log("[WD-ACTION] Button clicked - action:", action, "tid:", tid);
      var w = findWithdrawal(tid);
      if (!w) {
        console.error("[WD-ACTION] Withdrawal not found for tid:", tid);
        return;
      }

      if (action === "complete") {
        console.log("[WD-ACTION] Opening Complete dialog for:", w.userName);
        showCompleteDialog(w);
      }
      else if (action === "refund") {
        console.log("[WD-ACTION] Opening Refund dialog for:", w.userName);
        showRefundDialog(w);
      }
      else if (action === "reject") {
        console.log("[WD-ACTION] Opening Reject dialog for:", w.userName);
        showRejectDialog(w);
      }
    });
  });

  // View details buttons
  var viewBtns = document.querySelectorAll(".wd-card-view-btn");
  console.log("[WD-BIND] View buttons found:", viewBtns.length);
  viewBtns.forEach(function(btn) {
    btn.addEventListener("click", function() {
      var tid = btn.getAttribute("data-tid");
      console.log("[WD-VIEW] View Details clicked for tid:", tid);
      var w = findWithdrawal(tid);
      if (w) {
        showDetailsDialog(w);
      } else {
        console.error("[WD-VIEW] Withdrawal not found for tid:", tid);
      }
    });
  });

  console.log("[WD-BIND] All card events bound successfully");
}

// ============ FIND WITHDRAWAL ============
function findWithdrawal(transactionId) {
  for (var i = 0; i < allWithdrawals.length; i++) {
    if (allWithdrawals[i].transactionId === transactionId) {
      return allWithdrawals[i];
    }
  }
  return null;
}

// ============ DIALOG SYSTEM ============
function closeDialog() {
  console.log("[WD-DIALOG] closeDialog() called");
  var overlay = document.getElementById("dialogOverlay");
  if (overlay) overlay.remove();
}

function createDialog(iconHtml, iconClass, title, message, content, buttons) {
  console.log("[WD-DIALOG] createDialog() - title:", title);
  closeDialog();

  var overlay = document.createElement("div");
  overlay.id = "dialogOverlay";
  overlay.className = "dialog-overlay";

  var dialog = document.createElement("div");
  dialog.id = "appDialog";
  dialog.className = "dialog-box";

  var html = "";
  if (iconHtml) {
    html += '<div class="dialog-icon ' + iconClass + '">' + iconHtml + '</div>';
  }
  html += '<div class="dialog-title">' + title + '</div>';
  if (message) {
    html += '<div class="dialog-message">' + message + '</div>';
  }
  html += content;
  html += '<div class="dialog-buttons">' + buttons + '</div>';

  dialog.innerHTML = html;

  // Dialog INSIDE overlay so flex centering works
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  console.log("[WD-DIALOG] Dialog created INSIDE overlay. Visible:", dialog.offsetParent !== null, "Rect:", JSON.stringify(dialog.getBoundingClientRect()));

  // Close on overlay background click (not on dialog itself)
  overlay.addEventListener("click", function(e) {
    if (e.target === overlay) {
      console.log("[WD-DIALOG] Overlay background clicked - closing dialog");
      closeDialog();
    }
  });
  return dialog;
}

// ============ VIEW DETAILS DIALOG ============
function showDetailsDialog(w) {
  console.log("[WD-DETAILS] showDetailsDialog() for:", w.transactionId);
  var amountDisplay = formatAmount(w.amount);
  var paymentMethod = getPaymentMethod(w.bankAddress);
  var wBefore = formatAmount(w.userData.winningCoinsBefore);
  var wAfter = formatAmount(w.userData.winningCoinsAfter);

  var content =
    '<div class="dialog-details">' +
      '<div class="dialog-detail-section">User Info</div>' +
      detailRow("User Name", w.userName) +
      detailRow("User ID", w.userId) +
      detailRow("Email", w.userEmail || "-") +
      '<div class="dialog-detail-section">Game Details</div>' +
      detailRow("In-Game UID", w.inGameUID || "-") +
      detailRow("In-Game Level", w.inGameLevel || "-") +
      detailRow("Total Played", w.totalPlayed || "-") +
      '<div class="dialog-detail-section">Withdrawal Details</div>' +
      detailRow("Amount", amountDisplay) +
      detailRow("Payment Method", paymentMethod) +
      detailRow("Bank/UPI", w.bankAddress) +
      detailRow("Status", w.status.toUpperCase()) +
      detailRow("Transaction ID", w.transactionId) +
      detailRow("Date", w.readableTimestamp || w.createdAtStr || "-") +
      '<div class="dialog-detail-section">Balance Details</div>' +
      detailRow("Withdrawal Count", w.userData.withdrawalCount || "0") +
      detailRow("Coins Before", wBefore) +
      detailRow("Coins After", wAfter);

  if (w.notes) {
    content += '<div class="dialog-detail-section">Notes</div>' + detailRow("Notes", w.notes);
  }
  if (w.utrNumber) {
    content += '<div class="dialog-detail-section">UTR Details</div>' + detailRow("UTR Number", w.utrNumber);
  }

  content += '</div>';

  createDialog(
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    "dialog-icon-blue",
    "Withdrawal Details",
    "",
    content,
    '<button class="dialog-btn dialog-btn-cancel" id="dialogCancel">Close</button>'
  );

  var cancelBtn = document.getElementById("dialogCancel");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", closeDialog);
  }
}

function detailRow(label, value) {
  return '<div class="dialog-detail-row"><span class="dialog-detail-label">' + escapeHtml(String(label)) + '</span><span class="dialog-detail-value">' + escapeHtml(String(value || "-")) + '</span></div>';
}

// ============ COMPLETE DIALOG ============
function showCompleteDialog(w) {
  console.log("[WD-COMPLETE] showCompleteDialog() for:", w.transactionId, "amount:", w.amount);
  var amountDisplay = formatAmount(w.amount);

  var content =
    '<div class="dialog-field">' +
      '<label class="dialog-field-label" for="dialogUtrInput">UTR Number *</label>' +
      '<input type="text" class="dialog-field-input" id="dialogUtrInput" placeholder="Enter UTR number">' +
      '<div class="dialog-field-hint" id="dialogUtrHint">UTR Number is required</div>' +
    '</div>' +
    '<div class="dialog-field">' +
      '<label class="dialog-field-label" for="dialogNotesInput">Description (optional)</label>' +
      '<textarea class="dialog-field-input" id="dialogNotesInput" placeholder="Optional - auto-filled with timestamp if left empty"></textarea>' +
    '</div>';

  createDialog(
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    "dialog-icon-green",
    "Complete Withdrawal",
    "Mark this withdrawal as completed. Amount: <strong>" + amountDisplay + "</strong> for <strong>" + escapeHtml(w.userName) + "</strong>",
    content,
    '<button class="dialog-btn dialog-btn-cancel" id="dialogCancel">Cancel</button>' +
    '<button class="dialog-btn dialog-btn-confirm dialog-btn-green" id="dialogConfirm">Complete</button>'
  );

  var cancelBtn = document.getElementById("dialogCancel");
  var confirmBtn = document.getElementById("dialogConfirm");
  console.log("[WD-COMPLETE] Dialog buttons bound - Cancel:", !!cancelBtn, "Confirm:", !!confirmBtn);

  if (cancelBtn) {
    cancelBtn.addEventListener("click", function() {
      console.log("[WD-COMPLETE] Cancel clicked");
      closeDialog();
    });
  }
  if (confirmBtn) {
    confirmBtn.addEventListener("click", function() {
      console.log("[WD-COMPLETE] Confirm clicked");
      var utr = document.getElementById("dialogUtrInput");
      var notes = document.getElementById("dialogNotesInput");
      var utrVal = utr ? utr.value.trim() : "";
      var notesVal = notes ? notes.value.trim() : "";

      // Only UTR is required
      if (!utrVal) {
        var utrHint = document.getElementById("dialogUtrHint");
        if (utrHint) utrHint.style.display = "block";
        if (utr) utr.style.borderColor = "#ef4444";
        console.log("[WD-COMPLETE] Validation failed - empty UTR");
        return;
      }

      // If notes empty, auto-fill with current timestamp
      if (!notesVal) {
        var now = new Date();
        var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        var h = now.getHours();
        var m = now.getMinutes();
        var ampm = h >= 12 ? "PM" : "AM";
        h = h % 12 || 12;
        notesVal = "Completed on " + now.getDate() + " " + months[now.getMonth()] + " " + now.getFullYear() + " at " + h + ":" + (m < 10 ? "0" : "") + m + " " + ampm;
        console.log("[WD-COMPLETE] Notes empty, auto-filled with timestamp:", notesVal);
      }

      console.log("[WD-COMPLETE] Validation passed. Calling processAction...");
      closeDialog();
      processAction("completeWithdrawal", w, { utrNumber: utrVal, notes: notesVal });
    });
  }
}

// ============ REFUND DIALOG ============
function showRefundDialog(w) {
  console.log("[WD-REFUND] showRefundDialog() for:", w.transactionId, "amount:", w.amount);
  var amountDisplay = formatAmount(w.amount);

  var content =
    '<div class="dialog-field">' +
      '<label class="dialog-field-label" for="dialogNotesInput">Reason for Refund *</label>' +
      '<textarea class="dialog-field-input" id="dialogNotesInput" placeholder="Enter refund reason (e.g. Payment failed, wrong UPI)"></textarea>' +
      '<div class="dialog-field-hint" id="dialogNotesHint">Reason is required</div>' +
    '</div>';

  createDialog(
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 12 14 1 4"/><path d="M1 4h22v16H1z"/></svg>',
    "dialog-icon-orange",
    "Refund Withdrawal",
    "Refund <strong>" + amountDisplay + "</strong> to <strong>" + escapeHtml(w.userName) + "</strong>. WinningCoins will be credited back.",
    content,
    '<button class="dialog-btn dialog-btn-cancel" id="dialogCancel">Cancel</button>' +
    '<button class="dialog-btn dialog-btn-confirm dialog-btn-orange" id="dialogConfirm">Refund</button>'
  );

  var cancelBtn = document.getElementById("dialogCancel");
  var confirmBtn = document.getElementById("dialogConfirm");
  console.log("[WD-REFUND] Dialog buttons bound - Cancel:", !!cancelBtn, "Confirm:", !!confirmBtn);

  if (cancelBtn) {
    cancelBtn.addEventListener("click", function() {
      console.log("[WD-REFUND] Cancel clicked");
      closeDialog();
    });
  }
  if (confirmBtn) {
    confirmBtn.addEventListener("click", function() {
      console.log("[WD-REFUND] Confirm clicked");
      var notes = document.getElementById("dialogNotesInput");
      var notesVal = notes ? notes.value.trim() : "";
      if (!notesVal) {
        var notesHint = document.getElementById("dialogNotesHint");
        if (notesHint) notesHint.style.display = "block";
        if (notes) notes.style.borderColor = "#ef4444";
        console.log("[WD-REFUND] Validation failed - empty notes");
        return;
      }
      console.log("[WD-REFUND] Validation passed. Calling processAction...");
      closeDialog();
      processAction("refundWithdrawal", w, { notes: notesVal });
    });
  }
}

// ============ REJECT DIALOG ============
function showRejectDialog(w) {
  console.log("[WD-REJECT] showRejectDialog() for:", w.transactionId, "amount:", w.amount);
  var amountDisplay = formatAmount(w.amount);

  var content =
    '<div class="dialog-field">' +
      '<label class="dialog-field-label" for="dialogNotesInput">Reason for Rejection *</label>' +
      '<textarea class="dialog-field-input" id="dialogNotesInput" placeholder="Enter rejection reason (e.g. Invalid details, suspicious activity)"></textarea>' +
      '<div class="dialog-field-hint" id="dialogNotesHint">Reason is required</div>' +
    '</div>';

  createDialog(
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    "dialog-icon-red",
    "Reject Withdrawal",
    "Reject <strong>" + amountDisplay + "</strong> for <strong>" + escapeHtml(w.userName) + "</strong>. WinningCoins will be credited back.",
    content,
    '<button class="dialog-btn dialog-btn-cancel" id="dialogCancel">Cancel</button>' +
    '<button class="dialog-btn dialog-btn-confirm dialog-btn-red" id="dialogConfirm">Reject</button>'
  );

  var cancelBtn = document.getElementById("dialogCancel");
  var confirmBtn = document.getElementById("dialogConfirm");
  console.log("[WD-REJECT] Dialog buttons bound - Cancel:", !!cancelBtn, "Confirm:", !!confirmBtn);

  if (cancelBtn) {
    cancelBtn.addEventListener("click", function() {
      console.log("[WD-REJECT] Cancel clicked");
      closeDialog();
    });
  }
  if (confirmBtn) {
    confirmBtn.addEventListener("click", function() {
      console.log("[WD-REJECT] Confirm clicked");
      var notes = document.getElementById("dialogNotesInput");
      var notesVal = notes ? notes.value.trim() : "";
      if (!notesVal) {
        var notesHint = document.getElementById("dialogNotesHint");
        if (notesHint) notesHint.style.display = "block";
        if (notes) notes.style.borderColor = "#ef4444";
        console.log("[WD-REJECT] Validation failed - empty notes");
        return;
      }
      console.log("[WD-REJECT] Validation passed. Calling processAction...");
      closeDialog();
      processAction("rejectWithdrawal", w, { notes: notesVal });
    });
  }
}

// ============ PROCESS ACTION (API CALL) ============
function processAction(action, w, extra) {
  var tid = w.transactionId;
  console.log("[WD-PROCESS] processAction() - action:", action, "tid:", tid, "userId:", w.userId, "amount:", w.amount);

  processingItems[tid] = 0;
  renderWithdrawalCards();

  // Simulate progress
  simulateProgress(tid);

  var adminEmail = (typeof currentAdmin !== "undefined" && currentAdmin) ? currentAdmin.email : "admin@edmfire.com";

  var body = {
    action: action,
    transactionId: tid,
    userId: w.userId,
    amount: w.amount,
    adminEmail: adminEmail,
  };

  if (extra.utrNumber) body.utrNumber = extra.utrNumber;
  if (extra.notes) body.notes = extra.notes;

  console.log("[WD-PROCESS] Sending API request to:", MANAGE_WITHDRAWAL_API, "Body:", JSON.stringify(body));

  fetch(MANAGE_WITHDRAWAL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  .then(function(res) {
    console.log("[WD-PROCESS] API response status:", res.status);
    return res.json();
  })
  .then(function(data) {
    console.log("[WD-PROCESS] API response data:", JSON.stringify(data));
    delete processingItems[tid];
    renderWithdrawalCards();

    if (data.success && data.result && data.result.success) {
      if (action === "completeWithdrawal") {
        showToast("Withdrawal completed! UTR: " + (extra.utrNumber || ""), "success");
      } else if (action === "refundWithdrawal") {
        showToast("Refunded " + formatAmount(w.amount) + " to " + w.userName, "success");
      } else if (action === "rejectWithdrawal") {
        showToast("Rejected withdrawal for " + w.userName, "success");
      }
    } else {
      var errMsg = "Action failed";
      if (data.result && data.result.message) errMsg = data.result.message;
      else if (data.error) errMsg = data.error;
      console.error("[WD-PROCESS] Action failed:", errMsg);
      showToast(errMsg, "error");
    }
  })
  .catch(function(error) {
    console.error("[WD-PROCESS] Fetch error:", error.message);
    delete processingItems[tid];
    renderWithdrawalCards();
    showToast("Error: " + error.message, "error");
  });
}

// ============ SIMULATE PROGRESS ============
function simulateProgress(tid) {
  var progress = 0;
  var interval = setInterval(function() {
    if (!processingItems[tid]) {
      clearInterval(interval);
      return;
    }
    progress += 8;
    if (progress > 90) progress = 90;
    processingItems[tid] = progress;

    // Update progress bar in DOM
    var card = document.querySelector('.wd-card[data-tid="' + tid + '"]');
    if (card) {
      var fill = card.querySelector(".wd-progress-fill");
      var text = card.querySelector(".wd-progress-text");
      if (fill) fill.style.width = progress + "%";
      if (text) text.textContent = progress + "%";
    }
  }, 150);
}

// ============ SEARCH ============
wdSearchInput.addEventListener("input", function() {
  var val = wdSearchInput.value.trim();
  wdSearchClear.style.display = val ? "flex" : "none";

  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(function() {
    console.log("[WD-SEARCH] Search query changed:", val);
    searchQuery = val;
    applyFilterAndSearch();
  }, 300);
});

wdSearchClear.addEventListener("click", function() {
  console.log("[WD-SEARCH] Search cleared");
  wdSearchInput.value = "";
  wdSearchClear.style.display = "none";
  searchQuery = "";
  applyFilterAndSearch();
});

// ============ FILTER TABS ============
var filterTabs = document.querySelectorAll(".wd-filter-tab");
console.log("[WD-FILTER] Filter tabs found:", filterTabs.length);
filterTabs.forEach(function(tab) {
  tab.addEventListener("click", function() {
    filterTabs.forEach(function(t) { t.classList.remove("active"); });
    tab.classList.add("active");
    currentFilter = tab.getAttribute("data-filter");
    console.log("[WD-FILTER] Filter changed to:", currentFilter);
    applyFilterAndSearch();
  });
});

// ============ TOAST ============
function showToast(message, type) {
  console.log("[WD-TOAST]", type || "info", ":", message);
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

// ============ HELPERS ============
function toIST(date) {
  var istOffset = 5.5 * 60 * 60000;
  return new Date(date.getTime() + (date.getTimezoneOffset() * 60000) + istOffset);
}

function formatDate(d) {
  if (!d) return "-";
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d.getTime())) return "-";
  d = toIST(d);
  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  var hours = d.getUTCHours();
  var mins = d.getUTCMinutes();
  return d.getUTCDate() + " " + months[d.getUTCMonth()] + " " + d.getUTCFullYear() + ", " +
    (hours % 12 || 12) + ":" + (mins < 10 ? "0" : "") + mins + " " + (hours >= 12 ? "PM" : "AM");
}

function escapeHtml(str) {
  if (!str) return "";
  var div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ============ INIT ============
console.log("[WD-INIT] Starting initAuthGuard...");
initAuthGuard(function(user) {
  console.log("[WD-INIT] Auth guard passed. User:", user ? user.email : "null");
  console.log("[WD-INIT] Firebase services check - auth:", !!firebase.auth, "firestore:", !!firebase.firestore, "database:", !!firebase.database, "storage:", !!firebase.storage);
  loadWithdrawals();
});
initCommonUI();
console.log("[WD-INIT] initCommonUI() called. Setup complete.");
