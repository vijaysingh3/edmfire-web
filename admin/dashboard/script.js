// ============================================
// EDMFire Admin - Dashboard Home Logic
// ============================================

var statTotalUsers = document.getElementById("statTotalUsers");
var statActiveChats = document.getElementById("statActiveChats");
var statUnreadMsg = document.getElementById("statUnreadMsg");
var statNotifications = document.getElementById("statNotifications");
var statHostApps = document.getElementById("statHostApps");
var statWithdrawals = document.getElementById("statWithdrawals");
var activityList = document.getElementById("activityList");
var navChatBadge = document.getElementById("navChatBadge");

// Financial overview elements
var financeTotalDeposit = document.getElementById("financeTotalDeposit");
var financeTotalWithdrawal = document.getElementById("financeTotalWithdrawal");
var financeNetWorth = document.getElementById("financeNetWorth");
var financeDepositTxns = document.getElementById("financeDepositTxns");
var financeWithdrawalTxns = document.getElementById("financeWithdrawalTxns");
var financeDepositLast = document.getElementById("financeDepositLast");
var financeWithdrawalLast = document.getElementById("financeWithdrawalLast");

// ========== PAYMENT SYSTEM HELPERS ==========
function paisaToRupees(paisa) {
  if (paisa === null || paisa === undefined) return 0;
  return paisa / 100.0;
}

function formatRupees(paisa) {
  var rupees = paisaToRupees(paisa);
  if (rupees % 1 === 0) {
    return "₹" + Math.round(rupees).toLocaleString("en-IN");
  }
  var formatted = rupees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return "₹" + formatted;
}

function formatTimestampShort(ts) {
  if (!ts) return "--";
  var dateObj;
  if (typeof ts.toDate === "function") {
    dateObj = ts.toDate();
  } else if (ts && ts.seconds) {
    dateObj = new Date(ts.seconds * 1000);
  } else if (typeof ts === "number") {
    dateObj = new Date(ts);
  } else {
    dateObj = new Date(ts);
  }
  if (isNaN(dateObj.getTime())) return "--";
  var p = getISTParts(dateObj);
  var h = parseInt(p.hour); var m = parseInt(p.minute);
  var ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  m = m < 10 ? "0" + m : m;
  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return parseInt(p.day) + " " + months[parseInt(p.month) - 1] + ", " + h + ":" + m + " " + ap;
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

// ========== LOAD FINANCIAL OVERVIEW ==========
function loadFinancialOverview() {
  if (!firebase.firestore) return;
  var db = firebase.firestore();

  // Load TotalDeposit/Amount
  db.collection("TotalDeposit").doc("Amount").get().then(function(doc) {
    if (doc.exists) {
      var data = doc.data();
      var totalPaisa = data.total || 0;
      var totalRupees = paisaToRupees(totalPaisa);
      var currency = data.currency || "INR";

      if (financeTotalDeposit) {
        financeTotalDeposit.innerHTML = '<span class="finance-amount">' + formatRupees(totalPaisa) + '</span> <span class="finance-currency">' + escapeHtml(currency) + '</span>';
      }
      if (financeDepositTxns) financeDepositTxns.textContent = data.totalTransactions || 0;
      if (financeDepositLast) financeDepositLast.textContent = formatTimestampShort(data.lastUpdated);

      // Calculate Net Worth after both deposit & withdrawal are loaded
      updateNetWorth(totalPaisa);
    }
  }).catch(function(err) {
    console.error("TotalDeposit fetch error:", err);
    if (financeTotalDeposit) {
      financeTotalDeposit.innerHTML = '<span class="finance-amount" style="color:#ef4444;">Error</span>';
    }
  });

  // Load TotalWithdrawal/Amount
  db.collection("TotalWithdrawal").doc("Amount").get().then(function(doc) {
    if (doc.exists) {
      var data = doc.data();
      var totalPaisa = data.total || 0;
      var currency = data.currency || "INR";

      if (financeTotalWithdrawal) {
        financeTotalWithdrawal.innerHTML = '<span class="finance-amount">' + formatRupees(totalPaisa) + '</span> <span class="finance-currency">' + escapeHtml(currency) + '</span>';
      }
      if (financeWithdrawalTxns) financeWithdrawalTxns.textContent = data.totalTransactions || 0;
      if (financeWithdrawalLast) financeWithdrawalLast.textContent = formatTimestampShort(data.lastUpdated);

      // Store withdrawal total for Net Worth calc
      window._withdrawalTotalPaisa = totalPaisa;
      updateNetWorth(window._depositTotalPaisa || 0);
    }
  }).catch(function(err) {
    console.error("TotalWithdrawal fetch error:", err);
    if (financeTotalWithdrawal) {
      financeTotalWithdrawal.innerHTML = '<span class="finance-amount" style="color:#ef4444;">Error</span>';
    }
  });
}

function updateNetWorth(depositPaisa) {
  window._depositTotalPaisa = depositPaisa;
  var withdrawalPaisa = window._withdrawalTotalPaisa || 0;
  var netPaisa = depositPaisa - withdrawalPaisa;

  if (financeNetWorth) {
    var isPositive = netPaisa >= 0;
    var sign = isPositive ? "" : "-";
    var absNetPaisa = Math.abs(netPaisa);
    var netRupees = paisaToRupees(absNetPaisa);

    var formatted;
    if (netRupees % 1 === 0) {
      formatted = Math.round(netRupees).toLocaleString("en-IN");
    } else {
      formatted = netRupees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    financeNetWorth.innerHTML = '<span class="finance-amount">' + sign + "₹" + formatted + '</span> <span class="finance-currency">INR</span>';
    financeNetWorth.querySelector(".finance-amount").style.color = isPositive ? "#10b981" : "#ef4444";
  }
}

// ========== LOAD DASHBOARD STATS ==========
function loadDashboardStats() {
  loadUsers(function(data) {
    var usersData = data || {};
    var uids = Object.keys(usersData);
    var totalUsers = uids.length;
    var totalUnread = 0;
    var activeChats = 0;

    for (var i = 0; i < uids.length; i++) {
      var unread = usersData[uids[i]].unreadMsg || 0;
      totalUnread += unread;
      if (unread > 0) activeChats++;
    }

    if (statTotalUsers) statTotalUsers.textContent = totalUsers;
    if (statActiveChats) statActiveChats.textContent = activeChats;
    if (statUnreadMsg) statUnreadMsg.textContent = totalUnread;

    // Update chat badge in sidebar nav
    if (navChatBadge) {
      if (totalUnread > 0) {
        navChatBadge.textContent = totalUnread > 99 ? "99+" : totalUnread;
        navChatBadge.style.display = "flex";
      } else {
        navChatBadge.style.display = "none";
      }
    }

    // Recent activity
    renderActivity(uids, usersData);
  });

  // Load host applications count from Firestore
  loadHostAppsCount();

  // Load withdrawal requests count from Firestore
  loadWithdrawalCount();

  // Load financial overview
  loadFinancialOverview();
}

function loadHostAppsCount() {
  if (!firebase.firestore) return;
  var db = firebase.firestore();
  db.collection("applications").where("status", "==", "pending").get().then(function(snapshot) {
    var count = snapshot.size;
    if (statHostApps) statHostApps.textContent = count;
  }).catch(function(err) {
    console.error("Host apps count error:", err);
    // Fallback: total count
    db.collection("applications").get().then(function(snapshot) {
      if (statHostApps) statHostApps.textContent = snapshot.size;
    }).catch(function() {});
  });
}

function loadWithdrawalCount() {
  if (!firebase.firestore) return;
  var db = firebase.firestore();
  db.collection("WithdrawalRequests").where("status", "==", "pending").get().then(function(snapshot) {
    var count = snapshot.size;
    if (statWithdrawals) statWithdrawals.textContent = count;
  }).catch(function(err) {
    console.error("Withdrawal count error:", err);
  });
}

function renderActivity(uids, data) {
  if (!activityList) return;
  if (uids.length === 0) {
    activityList.innerHTML = '<div class="empty-placeholder">No users yet</div>';
    return;
  }

  var sorted = uids.sort(function(a, b) {
    return (data[b].unreadMsg || 0) - (data[a].unreadMsg || 0);
  });

  var html = "";
  var count = Math.min(sorted.length, 10);
  for (var i = 0; i < count; i++) {
    var uid = sorted[i];
    var user = data[uid];
    var initial = (user.username || "U").charAt(0).toUpperCase();
    var unread = user.unreadMsg || 0;

    html += '<div class="activity-item">' +
      '<div class="activity-avatar">' + initial + '</div>' +
      '<div class="activity-info">' +
        '<div class="activity-name">' + escapeHtml(user.username || "Unknown") + '</div>' +
        '<div class="activity-detail">' + (unread > 0 ? unread + ' unread message' + (unread > 1 ? 's' : '') : 'No new messages') + '</div>' +
      '</div>' +
    '</div>';
  }
  activityList.innerHTML = html;
}

// ========== INIT ==========
initAuthGuard(function(user) {
  loadDashboardStats();
});
initCommonUI();
