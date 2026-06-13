// ============================================
// EDMFire Admin - Host Withdrawal Requests Logic
// Firestore: hostsWithdrawalRequest collection
// Enriched with host data from hosts/{hostId}
// ============================================

var wdList = document.getElementById("wdList");
var wdSearchInput = document.getElementById("wdSearchInput");
var wdSearchClear = document.getElementById("wdSearchClear");
var wdResultsCount = document.getElementById("wdResultsCount");
var MANAGE_HOST_WD_API = "/api/manage-host-withdrawal";

var allWithdrawals = [];
var filteredWithdrawals = [];
var currentFilter = "pending";
var searchQuery = "";
var processingItems = {};
var searchTimeout = null;

// Host name cache: hostId -> { fullName, gmail }
var hostCache = {};

console.log("[HOST-WD-INIT] Script loaded.");

// ============ LOAD HOST WITHDRAWAL REQUESTS ============
function loadWithdrawals() {
  console.log("[HOST-WD-LOAD] loadWithdrawals() called");

  if (!firebase.firestore) {
    console.error("[HOST-WD-LOAD] ERROR: firebase.firestore not available!");
    wdList.innerHTML = '<div class="wd-empty"><p>Firestore not available</p></div>';
    return;
  }

  var db = firebase.firestore();

  // Real-time listener on hostsWithdrawalRequest
  db.collection("hostsWithdrawalRequest")
    .orderBy("requestedAt", "desc")
    .onSnapshot(function(snapshot) {
      console.log("[HOST-WD-LOAD] onSnapshot fired. Docs:", snapshot.size);
      allWithdrawals = [];
      var counts = { pending: 0, completed: 0, refunded: 0, rejected: 0 };
      var hostIdsToFetch = [];

      snapshot.forEach(function(doc) {
        var data = doc.data();
        var w = parseWithdrawalDoc(doc.id, data);
        allWithdrawals.push(w);

        var status = (w.status || "pending").toLowerCase();
        if (counts[status] !== undefined) counts[status]++;

        // Track which hosts need enrichment
        if (w.hostId && !hostCache[w.hostId]) {
          hostIdsToFetch.push(w.hostId);
        }
      });

      console.log("[HOST-WD-LOAD] Parsed:", allWithdrawals.length, "Counts:", JSON.stringify(counts));

      updateStats(counts, allWithdrawals.length);

      // Update nav badge
      var badge = document.getElementById("navHostWDBadge");
      if (badge) {
        if (counts.pending > 0) {
          badge.textContent = counts.pending;
          badge.style.display = "flex";
        } else {
          badge.style.display = "none";
        }
      }

      // Enrich with host data
      if (hostIdsToFetch.length > 0) {
        enrichHostData(hostIdsToFetch, function() {
          applyFilterAndSearch();
        });
      } else {
        applyFilterAndSearch();
      }
    }, function(error) {
      console.error("[HOST-WD-LOAD] onSnapshot ERROR:", error);
      wdList.innerHTML =
        '<div class="wd-empty">' +
          '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
          '<h2>Error Loading</h2>' +
          '<p>' + escapeHtml(error.message) + '</p>' +
        '</div>';
    });
}

// ============ ENRICH WITH HOST DATA ============
function enrichHostData(hostIds, callback) {
  console.log("[HOST-WD-ENRICH] Fetching host data for:", hostIds.length, "hosts");
  var db = firebase.firestore();
  var fetched = 0;
  var total = hostIds.length;

  if (total === 0) {
    if (callback) callback();
    return;
  }

  hostIds.forEach(function(hostId) {
    db.collection("hosts").doc(hostId).get().then(function(doc) {
      if (doc.exists) {
        var data = doc.data();
        hostCache[hostId] = {
          fullName: data.fullName || "Unknown Host",
          gmail: data.gmail || "",
          ffNickname: data.ffNickname || "",
          mobile: data.mobile || "",
        };
      } else {
        hostCache[hostId] = { fullName: "Unknown Host", gmail: "", ffNickname: "", mobile: "" };
      }
      fetched++;
      if (fetched === total && callback) callback();
    }).catch(function(err) {
      console.error("[HOST-WD-ENRICH] Error fetching host:", hostId, err);
      hostCache[hostId] = { fullName: "Unknown Host", gmail: "", ffNickname: "", mobile: "" };
      fetched++;
      if (fetched === total && callback) callback();
    });
  });
}

// ============ PARSE HOST WITHDRAWAL DOCUMENT ============
function parseWithdrawalDoc(docId, data) {
  var amount = data.amount || 0;
  var bankDetail = data.bankDetail || "N/A";
  var status = data.status || "pending";
  var transactionId = data.transactionId || docId;
  var hostId = data.hostId || "";
  var notes = data.notes || "";
  var utrNumber = data.utrNumber || "";
  var walletBalanceAfter = data.walletBalanceAfter || 0;
  var walletBalanceBefore = data.walletBalanceBefore || 0;

  // Parse requestedAt (Firestore timestamp)
  var createdAtStr = "";
  if (data.requestedAt) {
    if (typeof data.requestedAt.toDate === "function") {
      createdAtStr = formatDate(data.requestedAt.toDate());
    } else if (data.requestedAt.seconds) {
      createdAtStr = formatDate(new Date(data.requestedAt.seconds * 1000));
    }
  }

  // Use requestedAtIST as fallback
  var readableTimestamp = data.requestedAtIST || data.timestamp || createdAtStr;

  // Get host name from cache if available
  var hostName = "Unknown Host";
  var hostEmail = "";
  if (hostId && hostCache[hostId]) {
    hostName = hostCache[hostId].fullName;
    hostEmail = hostCache[hostId].gmail;
  }

  return {
    id: docId,
    amount: amount,
    bankDetail: bankDetail,
    status: status,
    transactionId: transactionId,
    hostId: hostId,
    hostName: hostName,
    hostEmail: hostEmail,
    notes: notes,
    utrNumber: utrNumber,
    walletBalanceAfter: walletBalanceAfter,
    walletBalanceBefore: walletBalanceBefore,
    readableTimestamp: readableTimestamp,
    createdAtStr: createdAtStr,
  };
}

// ============ FORMAT AMOUNT (PAISA -> RUPEES) ============
function formatAmount(amountInPaisa) {
  var rupees = amountInPaisa / 100.0;
  if (rupees % 1 === 0) {
    return "\u20B9" + rupees.toFixed(0);
  }
  return "\u20B9" + rupees.toFixed(2);
}

// ============ DETECT PAYMENT METHOD ============
function getPaymentMethod(bankDetail) {
  if (!bankDetail) return "Unknown";
  if (bankDetail.indexOf("@") !== -1 || bankDetail.toLowerCase().indexOf("upi") === 0) {
    return "UPI";
  }
  return "Bank Transfer";
}

// ============ UPDATE STATS ============
function updateStats(counts, total) {
  document.getElementById("wdTotalCount").textContent = total;
  document.getElementById("wdPendingCount").textContent = counts.pending;
  document.getElementById("wdCompletedCount").textContent = counts.completed;
  document.getElementById("wdRefundedCount").textContent = counts.refunded;
  document.getElementById("wdRejectedCount").textContent = counts.rejected;
}

// ============ FILTER + SEARCH ============
function applyFilterAndSearch() {
  filteredWithdrawals = allWithdrawals.filter(function(w) {
    // Filter by status
    if (currentFilter !== "all" && w.status.toLowerCase() !== currentFilter) {
      return false;
    }
    // Search
    if (searchQuery) {
      var q = searchQuery.toLowerCase();
      var nameMatch = (w.hostName || "").toLowerCase().indexOf(q) !== -1;
      var idMatch = (w.hostId || "").toLowerCase().indexOf(q) !== -1;
      var bankMatch = (w.bankDetail || "").toLowerCase().indexOf(q) !== -1;
      var emailMatch = (w.hostEmail || "").toLowerCase().indexOf(q) !== -1;
      if (!nameMatch && !idMatch && !bankMatch && !emailMatch) return false;
    }
    return true;
  });

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
  if (filteredWithdrawals.length === 0) {
    var emptyMsg = searchQuery ? "No results found" : "No " + currentFilter + " requests";
    wdList.innerHTML =
      '<div class="wd-empty">' +
        '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3a3d52" stroke-width="1"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>' +
        '<h2>' + emptyMsg + '</h2>' +
        '<p>Host withdrawal requests will appear here</p>' +
      '</div>';
    return;
  }

  var html = "";
  filteredWithdrawals.forEach(function(w) {
    var isProcessing = !!processingItems[w.transactionId];
    var progress = processingItems[w.transactionId] || 0;
    var paymentMethod = getPaymentMethod(w.bankDetail);
    var status = (w.status || "pending").toLowerCase();

    // Refresh host name from cache (may have been enriched after initial parse)
    if (w.hostId && hostCache[w.hostId]) {
      w.hostName = hostCache[w.hostId].fullName;
      w.hostEmail = hostCache[w.hostId].gmail;
    }

    html += '<div class="wd-card' + (isProcessing ? ' processing' : '') + '" data-tid="' + escapeHtml(w.transactionId) + '">';

    // Progress bar
    html += '<div class="wd-card-progress">';
    html += '<div class="wd-progress-bar"><div class="wd-progress-fill" style="width:' + progress + '%"></div></div>';
    html += '<span class="wd-progress-text">' + progress + '%</span>';
    html += '</div>';

    // Top: Host Name + Amount
    html += '<div class="wd-card-top">';
    html += '<span class="wd-card-name">' + escapeHtml(w.hostName || "Unknown Host") + '</span>';
    html += '<span class="wd-card-amount">' + formatAmount(w.amount) + '</span>';
    html += '</div>';

    // Host ID
    var shortHostId = w.hostId ? w.hostId.substring(0, 10) + "..." : "-";
    html += '<div class="wd-card-userid">Host ID: ' + escapeHtml(shortHostId) + '</div>';

    // Payment row with copy
    html += '<div class="wd-card-payment-row">';
    html += '<span class="wd-card-payment">' + escapeHtml(w.bankDetail) + '</span>';
    html += '<button class="wd-card-copy-btn" data-copy="' + escapeHtml(w.bankDetail) + '" title="Copy payment details">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    html += ' Copy</button>';
    html += '</div>';

    // Payment method
    html += '<div class="wd-card-payment-method">Via: ' + escapeHtml(paymentMethod) + '</div>';

    // Bottom: Status + Timestamp
    html += '<div class="wd-card-bottom">';
    html += '<span class="wd-card-status ' + status + '">' + status.toUpperCase() + '</span>';
    html += '<span class="wd-card-timestamp">' + escapeHtml(w.readableTimestamp || "-") + '</span>';
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
  bindCardEvents();
}

// ============ BIND CARD EVENTS ============
function bindCardEvents() {
  // Copy buttons
  var copyBtns = document.querySelectorAll(".wd-card-copy-btn");
  copyBtns.forEach(function(btn) {
    btn.addEventListener("click", function() {
      var text = btn.getAttribute("data-copy");
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
  actionBtns.forEach(function(btn) {
    btn.addEventListener("click", function() {
      var action = btn.getAttribute("data-action");
      var tid = btn.getAttribute("data-tid");
      var w = findWithdrawal(tid);
      if (!w) return;

      if (action === "complete") showCompleteDialog(w);
      else if (action === "refund") showRefundDialog(w);
      else if (action === "reject") showRejectDialog(w);
    });
  });

  // View details buttons
  var viewBtns = document.querySelectorAll(".wd-card-view-btn");
  viewBtns.forEach(function(btn) {
    btn.addEventListener("click", function() {
      var tid = btn.getAttribute("data-tid");
      var w = findWithdrawal(tid);
      if (w) showDetailsDialog(w);
    });
  });
}

// ============ FIND WITHDRAWAL ============
function findWithdrawal(transactionId) {
  for (var i = 0; i < allWithdrawals.length; i++) {
    if (allWithdrawals[i].transactionId === transactionId) return allWithdrawals[i];
  }
  return null;
}

// ============ DIALOG SYSTEM ============
function closeDialog() {
  var overlay = document.getElementById("dialogOverlay");
  if (overlay) overlay.remove();
}

function createDialog(iconHtml, iconClass, title, message, content, buttons) {
  closeDialog();

  var overlay = document.createElement("div");
  overlay.id = "dialogOverlay";
  overlay.className = "dialog-overlay";

  var dialog = document.createElement("div");
  dialog.id = "appDialog";
  dialog.className = "dialog-box";

  var html = "";
  if (iconHtml) html += '<div class="dialog-icon ' + iconClass + '">' + iconHtml + '</div>';
  html += '<div class="dialog-title">' + title + '</div>';
  if (message) html += '<div class="dialog-message">' + message + '</div>';
  html += content;
  html += '<div class="dialog-buttons">' + buttons + '</div>';

  dialog.innerHTML = html;
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  overlay.addEventListener("click", function(e) {
    if (e.target === overlay) closeDialog();
  });
  return dialog;
}

// ============ VIEW DETAILS DIALOG ============
function showDetailsDialog(w) {
  var amountDisplay = formatAmount(w.amount);
  var paymentMethod = getPaymentMethod(w.bankDetail);
  var wBefore = formatAmount(w.walletBalanceBefore);
  var wAfter = formatAmount(w.walletBalanceAfter);

  var content =
    '<div class="dialog-details">' +
      '<div class="dialog-detail-section">Host Info</div>' +
      detailRow("Host Name", w.hostName) +
      detailRow("Host ID", w.hostId) +
      detailRow("Email", w.hostEmail || "-") +
      '<div class="dialog-detail-section">Withdrawal Details</div>' +
      detailRow("Amount", amountDisplay) +
      detailRow("Payment Method", paymentMethod) +
      detailRow("Bank/UPI", w.bankDetail) +
      detailRow("Status", w.status.toUpperCase()) +
      detailRow("Transaction ID", w.transactionId) +
      detailRow("Date", w.readableTimestamp || "-") +
      '<div class="dialog-detail-section">Wallet Details</div>' +
      detailRow("Balance Before", wBefore) +
      detailRow("Balance After", wAfter) +
      detailRow("Deducted", formatAmount(w.walletBalanceBefore - w.walletBalanceAfter));

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
    "Host Withdrawal Details",
    "",
    content,
    '<button class="dialog-btn dialog-btn-cancel" id="dialogCancel">Close</button>'
  );

  var cancelBtn = document.getElementById("dialogCancel");
  if (cancelBtn) cancelBtn.addEventListener("click", closeDialog);
}

function detailRow(label, value) {
  return '<div class="dialog-detail-row"><span class="dialog-detail-label">' + escapeHtml(String(label)) + '</span><span class="dialog-detail-value">' + escapeHtml(String(value || "-")) + '</span></div>';
}

// ============ COMPLETE DIALOG ============
function showCompleteDialog(w) {
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
    "Complete Host Withdrawal",
    "Mark this withdrawal as completed. Amount: <strong>" + amountDisplay + "</strong> for <strong>" + escapeHtml(w.hostName) + "</strong>",
    content,
    '<button class="dialog-btn dialog-btn-cancel" id="dialogCancel">Cancel</button>' +
    '<button class="dialog-btn dialog-btn-confirm dialog-btn-green" id="dialogConfirm">Complete</button>'
  );

  var cancelBtn = document.getElementById("dialogCancel");
  var confirmBtn = document.getElementById("dialogConfirm");

  if (cancelBtn) cancelBtn.addEventListener("click", closeDialog);
  if (confirmBtn) {
    confirmBtn.addEventListener("click", function() {
      var utr = document.getElementById("dialogUtrInput");
      var notes = document.getElementById("dialogNotesInput");
      var utrVal = utr ? utr.value.trim() : "";
      var notesVal = notes ? notes.value.trim() : "";

      if (!utrVal) {
        var utrHint = document.getElementById("dialogUtrHint");
        if (utrHint) utrHint.style.display = "block";
        if (utr) utr.style.borderColor = "#ef4444";
        return;
      }

      if (!notesVal) {
        var now = new Date();
        var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        var h = now.getHours();
        var m = now.getMinutes();
        var ampm = h >= 12 ? "PM" : "AM";
        h = h % 12 || 12;
        notesVal = "Completed on " + now.getDate() + " " + months[now.getMonth()] + " " + now.getFullYear() + " at " + h + ":" + (m < 10 ? "0" : "") + m + " " + ampm;
      }

      closeDialog();
      processAction("completeHostWithdrawal", w, { utrNumber: utrVal, notes: notesVal });
    });
  }
}

// ============ REFUND DIALOG ============
function showRefundDialog(w) {
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
    "Refund Host Withdrawal",
    "Refund <strong>" + amountDisplay + "</strong> to <strong>" + escapeHtml(w.hostName) + "</strong>. Wallet balance will be credited back.",
    content,
    '<button class="dialog-btn dialog-btn-cancel" id="dialogCancel">Cancel</button>' +
    '<button class="dialog-btn dialog-btn-confirm dialog-btn-orange" id="dialogConfirm">Refund</button>'
  );

  var cancelBtn = document.getElementById("dialogCancel");
  var confirmBtn = document.getElementById("dialogConfirm");

  if (cancelBtn) cancelBtn.addEventListener("click", closeDialog);
  if (confirmBtn) {
    confirmBtn.addEventListener("click", function() {
      var notes = document.getElementById("dialogNotesInput");
      var notesVal = notes ? notes.value.trim() : "";
      if (!notesVal) {
        var notesHint = document.getElementById("dialogNotesHint");
        if (notesHint) notesHint.style.display = "block";
        if (notes) notes.style.borderColor = "#ef4444";
        return;
      }
      closeDialog();
      processAction("refundHostWithdrawal", w, { notes: notesVal });
    });
  }
}

// ============ REJECT DIALOG ============
function showRejectDialog(w) {
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
    "Reject Host Withdrawal",
    "Reject <strong>" + amountDisplay + "</strong> for <strong>" + escapeHtml(w.hostName) + "</strong>. Wallet balance will be credited back.",
    content,
    '<button class="dialog-btn dialog-btn-cancel" id="dialogCancel">Cancel</button>' +
    '<button class="dialog-btn dialog-btn-confirm dialog-btn-red" id="dialogConfirm">Reject</button>'
  );

  var cancelBtn = document.getElementById("dialogCancel");
  var confirmBtn = document.getElementById("dialogConfirm");

  if (cancelBtn) cancelBtn.addEventListener("click", closeDialog);
  if (confirmBtn) {
    confirmBtn.addEventListener("click", function() {
      var notes = document.getElementById("dialogNotesInput");
      var notesVal = notes ? notes.value.trim() : "";
      if (!notesVal) {
        var notesHint = document.getElementById("dialogNotesHint");
        if (notesHint) notesHint.style.display = "block";
        if (notes) notes.style.borderColor = "#ef4444";
        return;
      }
      closeDialog();
      processAction("rejectHostWithdrawal", w, { notes: notesVal });
    });
  }
}

// ============ PROCESS ACTION (API CALL) ============
function processAction(action, w, extra) {
  var tid = w.transactionId;
  console.log("[HOST-WD-PROCESS] action:", action, "tid:", tid, "hostId:", w.hostId, "amount:", w.amount);

  processingItems[tid] = 0;
  renderWithdrawalCards();
  simulateProgress(tid);

  var body = {
    action: action,
    transactionId: tid,
    hostId: w.hostId,
    amount: w.amount,
  };

  if (extra.utrNumber) body.utrNumber = extra.utrNumber;
  if (extra.notes) body.notes = extra.notes;

  fetch(MANAGE_HOST_WD_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    console.log("[HOST-WD-PROCESS] API response:", JSON.stringify(data));
    delete processingItems[tid];
    renderWithdrawalCards();

    if (data.success && data.result && data.result.success) {
      if (action === "completeHostWithdrawal") {
        showToast("Host withdrawal completed! UTR: " + (extra.utrNumber || ""), "success");
      } else if (action === "refundHostWithdrawal") {
        showToast("Refunded " + formatAmount(w.amount) + " to " + w.hostName, "success");
      } else if (action === "rejectHostWithdrawal") {
        showToast("Rejected withdrawal for " + w.hostName, "success");
      }
    } else {
      var errMsg = "Action failed";
      if (data.result && data.result.message) errMsg = data.result.message;
      else if (data.error) errMsg = data.error;
      showToast(errMsg, "error");
    }
  })
  .catch(function(error) {
    console.error("[HOST-WD-PROCESS] Fetch error:", error.message);
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
    searchQuery = val;
    applyFilterAndSearch();
  }, 300);
});

wdSearchClear.addEventListener("click", function() {
  wdSearchInput.value = "";
  wdSearchClear.style.display = "none";
  searchQuery = "";
  applyFilterAndSearch();
});

// ============ FILTER TABS ============
var filterTabs = document.querySelectorAll(".wd-filter-tab");
filterTabs.forEach(function(tab) {
  tab.addEventListener("click", function() {
    filterTabs.forEach(function(t) { t.classList.remove("active"); });
    tab.classList.add("active");
    currentFilter = tab.getAttribute("data-filter");
    applyFilterAndSearch();
  });
});

// ============ TOAST ============
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
initAuthGuard(function(user) {
  console.log("[HOST-WD-INIT] Auth guard passed. User:", user ? user.email : "null");
  loadWithdrawals();
});
initCommonUI();
