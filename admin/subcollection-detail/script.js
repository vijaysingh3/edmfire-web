// ============================================
// EDMFire Admin - SubCollection Detail Logic
// ============================================

var pageTitle = document.getElementById("pageTitle");
var mobileTitle = document.getElementById("mobileTitle");
var backBtn = document.getElementById("backBtn");
var infoUid = document.getElementById("infoUid");
var infoCollection = document.getElementById("infoCollection");
var infoCount = document.getElementById("infoCount");
var itemsList = document.getElementById("itemsList");

var currentUid = null;
var currentCollection = null;

// ========== PAYMENT SYSTEM ==========
// Database stores PAISA (Integer), UI shows RUPEES/Coins (with decimal)
// Formula: rupees = paisa / 100.0

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

function formatCoinsShort(paisa) {
  var rupees = paisaToRupees(paisa);
  if (rupees % 1 === 0) {
    return Math.round(rupees) + "";
  }
  return rupees.toFixed(2).replace(/\.?0+$/, "");
}

// ========== URL PARAMS ==========
function getParams() {
  var params = new URLSearchParams(window.location.search);
  return {
    uid: params.get("uid"),
    collection: params.get("collection"), // "JoinedMatches" or "TransactionHistory"
  };
}

// ========== LOAD DATA ==========
function loadSubCollection() {
  var p = getParams();
  if (!p.uid || !p.collection) {
    showError("Missing parameters (uid or collection)");
    return;
  }

  currentUid = p.uid;
  currentCollection = p.collection;

  // Update header
  var collectionLabel = currentCollection === "JoinedMatches" ? "Joined Matches" : "Transaction History";
  pageTitle.textContent = collectionLabel;
  if (mobileTitle) mobileTitle.textContent = collectionLabel;
  infoUid.textContent = currentUid;
  infoCollection.textContent = currentCollection;

  // Update back button to go to user-detail
  backBtn.href = "/admin/user-detail/?uid=" + encodeURIComponent(currentUid) + "&tab=subcollections";

  // Load from Firestore
  var db = firebase.firestore();
  db.collection("Users").doc(currentUid).collection(currentCollection).get().then(function(snapshot) {
    infoCount.textContent = snapshot.size;

    if (snapshot.empty) {
      itemsList.innerHTML =
        '<div class="items-empty">' +
          '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3a3d52" stroke-width="1"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>' +
          '<p>No items in ' + escapeHtml(collectionLabel) + '</p>' +
        '</div>';
      return;
    }

    var items = [];
    snapshot.forEach(function(doc) {
      items.push({ id: doc.id, data: doc.data() });
    });

    // Sort: newest first (by timestamp field or processedAt)
    items.sort(function(a, b) {
      var ta = getTimestamp(a.data);
      var tb = getTimestamp(b.data);
      return tb - ta;
    });

    if (currentCollection === "JoinedMatches") {
      renderJoinedMatches(items);
    } else if (currentCollection === "TransactionHistory") {
      renderTransactionHistory(items);
    }
  }).catch(function(err) {
    showError("Error loading: " + err.message);
  });
}

// Get timestamp value for sorting
function getTimestamp(data) {
  // Try processedAt first (Firestore Timestamp)
  if (data.processedAt && typeof data.processedAt.toDate === "function") {
    return data.processedAt.toDate().getTime();
  }
  if (data.processedAt && data.processedAt.seconds) {
    return data.processedAt.seconds * 1000;
  }
  // Try joinTime
  if (data.joinTime && typeof data.joinTime.toDate === "function") {
    return data.joinTime.toDate().getTime();
  }
  if (data.joinTime && data.joinTime.seconds) {
    return data.joinTime.seconds * 1000;
  }
  // Try timestamp as string
  if (data.timestamp && typeof data.timestamp === "string") {
    return new Date(data.timestamp).getTime();
  }
  // Try timestamp as Firestore Timestamp
  if (data.timestamp && typeof data.timestamp.toDate === "function") {
    return data.timestamp.toDate().getTime();
  }
  if (data.timestamp && data.timestamp.seconds) {
    return data.timestamp.seconds * 1000;
  }
  return 0;
}

// ========== RENDER JOINED MATCHES ==========
function renderJoinedMatches(items) {
  var html = "";

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var data = item.data;
    var docId = escapeHtml(item.id);
    var tournamentId = escapeHtml(data.tournamentId || item.id);
    var tournamentType = escapeHtml(data.tournamentType || "-");
    var status = data.status || "joined";
    var statusClass = status === "joined" ? "joined" : status === "completed" ? "completed" : "left";
    var entryFee = data.entryFee !== undefined ? data.entryFee : null;
    var slotNumber = data.slotNumber || "-";
    var referralBonusUsed = data.referralBonusUsed || 0;
    var joinTime = data.joinTime || data.timestamp || null;

    html += '<div class="item-card">';
    html += '<div class="item-card-top">';
    html += '<div class="item-card-icon match-icon">';
    html += '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="16" cy="10" r="1"/><circle cx="18" cy="12" r="1"/></svg>';
    html += '</div>';
    html += '<div class="item-card-info">';
    html += '<div class="item-card-title">' + tournamentId + '</div>';
    html += '<div class="item-card-subtitle">' + tournamentType + '</div>';
    html += '</div>';
    html += '<span class="item-status ' + statusClass + '">' + escapeHtml(status) + '</span>';
    html += '</div>';

    html += '<div class="item-card-fields">';

    // Entry Fee - Payment System (paisa to rupees)
    if (entryFee !== null) {
      html += buildField("Entry Fee", formatCoins(entryFee), "coins");
    }

    // Slot Number
    html += buildField("Slot", slotNumber, "");

    // Referral Bonus Used - Payment System
    if (referralBonusUsed > 0) {
      html += buildField("Referral Bonus Used", formatCoins(referralBonusUsed), "coins");
    }

    // Join Time
    html += buildField("Join Time", formatTimestamp(joinTime), "time");

    // Transaction ID
    if (data.transactionId) {
      html += buildField("Transaction ID", data.transactionId, "mono");
    }

    // Doc ID
    html += buildField("Document ID", item.id, "mono");

    html += '</div>';
    html += '</div>';
  }

  itemsList.innerHTML = html;
}

// ========== RENDER TRANSACTION HISTORY ==========
function renderTransactionHistory(items) {
  var html = "";

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var data = item.data;
    var docId = escapeHtml(item.id);
    var transactionType = data.transactionType || "Unknown";
    var typeClass = getTransactionTypeClass(transactionType);
    var amount = data.amount || 0;
    var timestamp = data.timestamp || data.processedAt || null;
    var status = data.paymentStatus || data.status || "-";

    html += '<div class="item-card">';
    html += '<div class="item-card-top">';
    html += '<div class="item-card-icon ' + typeClass + '-icon">';
    html += getTransactionTypeIcon(transactionType);
    html += '</div>';
    html += '<div class="item-card-info">';
    html += '<div class="item-card-title">' + escapeHtml(transactionType) + '</div>';
    html += '<div class="item-card-subtitle">' + escapeHtml(data.transactionId || docId) + '</div>';
    html += '</div>';
    html += '<div class="item-amount ' + typeClass + '">' + formatCoinsShort(amount) + '</div>';
    html += '</div>';

    html += '<div class="item-card-fields">';

    // Amount - Payment System (paisa to rupees)
    html += buildField("Amount", formatCoins(amount), "coins");

    // Status
    var statusLabel = data.paymentStatus || data.status || "-";
    var statusFieldClass = statusLabel === "completed" ? "success" : statusLabel === "pending" ? "warning" : statusLabel === "rejected" ? "error" : "";
    html += buildField("Status", statusLabel, statusFieldClass);

    // Timestamp
    html += buildField("Time", formatTimestamp(timestamp), "time");

    // Description
    if (data.description) {
      html += buildField("Description", data.description, "");
    }

    // Type-specific fields based on actual database structure

    // Deposit: utr, amount, bonusCoins, totalCoins, transactionId, payerName, payerHandle
    if (transactionType === "Deposit") {
      if (data.utr) html += buildField("UTR", data.utr, "mono");
      if (data.bonusCoins !== undefined && data.bonusCoins !== null) html += buildField("Bonus Coins", formatCoins(data.bonusCoins), "coins");
      if (data.totalCoins !== undefined && data.totalCoins !== null) html += buildField("Total Coins", formatCoins(data.totalCoins), "coins");
      if (data.payerName) html += buildField("Payer Name", data.payerName, "");
      if (data.payerHandle) html += buildField("Payer Handle", data.payerHandle, "");
    }

    // Tournament Joining: tournamentId, tournamentType, slotNumber, referralBonusUsed
    if (transactionType === "Tournament Joining") {
      if (data.tournamentId) html += buildField("Tournament ID", data.tournamentId, "mono");
      if (data.tournamentType) html += buildField("Tournament Type", data.tournamentType, "");
      if (data.slotNumber !== undefined && data.slotNumber !== null) html += buildField("Slot", data.slotNumber, "");
      if (data.referralBonusUsed !== undefined && data.referralBonusUsed !== null) html += buildField("Referral Bonus Used", formatCoins(data.referralBonusUsed), "coins");
    }

    // Tournament Winnings: tournamentId, tournamentType, rank, result
    if (transactionType === "Tournament Winnings") {
      if (data.tournamentId) html += buildField("Tournament ID", data.tournamentId, "mono");
      if (data.tournamentType) html += buildField("Tournament Type", data.tournamentType, "");
      if (data.rank !== undefined && data.rank !== null) html += buildField("Rank", data.rank, "");
      if (data.result) html += buildField("Result", data.result, "");
    }

    // Tournament Refund: tournamentId, refundPercent
    if (transactionType === "Tournament Refund") {
      if (data.tournamentId) html += buildField("Tournament ID", data.tournamentId, "mono");
      if (data.refundPercent !== undefined && data.refundPercent !== null) html += buildField("Refund %", data.refundPercent + "%", "");
    }

    // Referral Bonus: referredUser, referredBy
    if (transactionType === "Referral Bonus") {
      if (data.referredUser) html += buildField("Referred User", data.referredUser, "");
      if (data.referredBy) html += buildField("Referred By", data.referredBy, "");
    }

    // Signup Bonus: only standard fields (transactionId, amount, timestamp, description)
    if (transactionType === "Signup Bonus") {
      // Only has standard fields already shown above
    }

    // Withdrawal Request: paymentMethod, bankAddress, notes
    if (transactionType === "Withdrawal Request") {
      if (data.paymentMethod) html += buildField("Payment Method", data.paymentMethod, "");
      if (data.bankAddress) html += buildField("Bank/UPID", data.bankAddress, "mono");
      if (data.notes) html += buildField("Notes", data.notes, "");
    }

    // Processed At (if different from main timestamp)
    if (data.processedAt) {
      html += buildField("Processed At", formatTimestamp(data.processedAt), "time");
    }

    html += '</div>';
    html += '</div>';
  }

  itemsList.innerHTML = html;
}

// ========== HELPERS ==========
function getTransactionTypeClass(type) {
  switch (type) {
    case "Deposit": return "deposit";
    case "Tournament Joining": return "joining";
    case "Tournament Winnings": return "winning";
    case "Tournament Refund": return "refund";
    case "Withdrawal Request": return "withdrawal";
    case "Referral Bonus": return "bonus";
    case "Signup Bonus": return "bonus";
    default: return "other";
  }
}

function getTransactionTypeIcon(type) {
  switch (type) {
    case "Deposit":
      return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
    case "Tournament Joining":
      return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/></svg>';
    case "Tournament Winnings":
      return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    case "Tournament Refund":
      return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
    case "Withdrawal Request":
      return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>';
    case "Referral Bonus":
    case "Signup Bonus":
      return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
    default:
      return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  }
}

function buildField(label, value, typeClass) {
  return '<div class="item-field">' +
    '<span class="item-field-label">' + escapeHtml(label) + '</span>' +
    '<span class="item-field-value ' + typeClass + '">' + (typeof value === "string" ? value : escapeHtml(String(value))) + '</span>' +
  '</div>';
}

function formatTimestamp(ts) {
  if (!ts) return "-";
  var dateObj;
  if (typeof ts === "string") {
    dateObj = new Date(ts);
  } else if (typeof ts.toDate === "function") {
    dateObj = ts.toDate();
  } else if (ts && ts.seconds) {
    dateObj = new Date(ts.seconds * 1000);
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

function showError(msg) {
  itemsList.innerHTML =
    '<div class="detail-error">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
      '<h2>' + escapeHtml(msg) + '</h2>' +
      '<a href="/admin/users/" style="color:#7c6cf0;font-size:14px;">Go back to Users</a>' +
    '</div>';
}

// ========== INIT ==========
initAuthGuard(function(user) {
  loadSubCollection();
});
initCommonUI();
