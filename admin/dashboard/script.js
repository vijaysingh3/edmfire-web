// ============================================
// EDMFire Admin - Dashboard Home Logic
// ============================================

var statTotalUsers = document.getElementById("statTotalUsers");
var statActiveChats = document.getElementById("statActiveChats");
var statUnreadMsg = document.getElementById("statUnreadMsg");
var statNotifications = document.getElementById("statNotifications");
var statHostApps = document.getElementById("statHostApps");
var activityList = document.getElementById("activityList");
var navChatBadge = document.getElementById("navChatBadge");

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
