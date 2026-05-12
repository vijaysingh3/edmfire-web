// ============================================
// EDMFire Admin Dashboard - Production JS
// ============================================

var currentAdmin = null;
var selectedUserUid = null;
var selectedImageFile = null;
var usersData = {};
var replyingTo = null;
var contextMsgKey = null;
var contextMsgData = null;
var allMessagesData = {};
var currentPage = "home";

// ========== DOM ELEMENTS ==========
var loginScreen = document.getElementById("loginScreen");
var dashboard = document.getElementById("dashboard");
var loginBtn = document.getElementById("loginBtn");
var loginError = document.getElementById("loginError");
var adminEmail = document.getElementById("adminEmail");
var adminPassword = document.getElementById("adminPassword");

// Sidebar
var hamburgerBtn = document.getElementById("hamburgerBtn");
var sidebar = document.getElementById("sidebar");
var sidebarOverlay = document.getElementById("sidebarOverlay");
var sidebarLogoutBtn = document.getElementById("sidebarLogoutBtn");
var mobileLogoutBtn = document.getElementById("mobileLogoutBtn");
var navItems = document.querySelectorAll(".nav-item");

// Dashboard stats
var statTotalUsers = document.getElementById("statTotalUsers");
var statActiveChats = document.getElementById("statActiveChats");
var statUnreadMsg = document.getElementById("statUnreadMsg");
var statNotifications = document.getElementById("statNotifications");
var activityList = document.getElementById("activityList");
var navChatBadge = document.getElementById("navChatBadge");

// Chat elements
var userList = document.getElementById("userList");
var searchInput = document.getElementById("searchInput");
var messagesContainer = document.getElementById("messagesContainer");
var chatHeaderName = document.getElementById("chatHeaderName");
var chatHeaderStatus = document.getElementById("chatHeaderStatus");
var chatInputBar = document.getElementById("chatInputBar");
var msgInput = document.getElementById("msgInput");
var sendBtn = document.getElementById("sendBtn");
var imgBtn = document.getElementById("imgBtn");
var imageInput = document.getElementById("imageInput");
var replyBar = document.getElementById("replyBar");
var replyName = document.getElementById("replyName");
var replyText = document.getElementById("replyText");
var replyClose = document.getElementById("replyClose");
var contextMenu = document.getElementById("contextMenu");
var imagePreviewModal = document.getElementById("imagePreviewModal");
var previewImage = document.getElementById("previewImage");
var previewOverlay = document.getElementById("previewOverlay");
var cancelPreview = document.getElementById("cancelPreview");
var sendPreview = document.getElementById("sendPreview");

// ========== APP INIT ==========
async function initApp() {
  showLoading(true);
  onAuthChange(function(user) {
    if (user) {
      if (!checkAdminAccess(user)) {
        showLoading(false);
        showAccessDenied();
        return;
      }
      currentAdmin = user;
      enterDashboard();
    } else {
      showLoading(false);
      showLogin();
    }
  });
}

// ========== LOGIN ==========
function showLogin() {
  loginScreen.style.display = "flex";
  dashboard.style.display = "none";
}

function showAccessDenied() {
  loginScreen.style.display = "none";
  dashboard.style.display = "flex";
  document.querySelector(".main-content").innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;height:100%;flex-direction:column;gap:16px;color:#ef4444;text-align:center;padding:40px;">' +
    '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
    '<h2 style="font-size:20px;">Access Denied</h2>' +
    '<p style="font-size:14px;color:#6b7280;">UID (' + (currentAdmin ? currentAdmin.uid : '') + ') is not authorized as admin</p>' +
    '<button onclick="handleLogout()" style="padding:10px 28px;border:none;border-radius:10px;background:#ef4444;color:white;font-size:14px;cursor:pointer;font-family:Poppins,sans-serif;">Sign Out</button>' +
    '</div>';
}

async function handleLogin() {
  var email = adminEmail.value.trim();
  var password = adminPassword.value;
  if (!email) { loginError.textContent = "Enter your email"; loginError.style.display = "block"; return; }
  if (!password) { loginError.textContent = "Enter your password"; loginError.style.display = "block"; return; }

  loginBtn.textContent = "Signing in...";
  loginBtn.disabled = true;
  loginError.style.display = "none";

  var result = await signInWithEmail(email, password);
  if (result.user) {
    if (checkAdminAccess(result.user)) {
      currentAdmin = result.user;
      enterDashboard();
    } else {
      loginError.textContent = "Access denied - not an admin account";
      loginError.style.display = "block";
      loginBtn.textContent = "Sign In";
      loginBtn.disabled = false;
      signOutUser();
    }
  } else {
    loginError.textContent = result.error || "Invalid credentials";
    loginError.style.display = "block";
    loginBtn.textContent = "Sign In";
    loginBtn.disabled = false;
  }
}

function enterDashboard() {
  showLoading(false);
  loginScreen.style.display = "none";
  dashboard.style.display = "flex";

  // Update sidebar user info
  var nameEl = document.getElementById("sidebarUserName");
  var emailEl = document.getElementById("sidebarUserEmail");
  var avatarEl = document.getElementById("sidebarUserAvatar");
  if (nameEl) nameEl.textContent = "Admin";
  if (emailEl) emailEl.textContent = currentAdmin.email || currentAdmin.uid;
  if (avatarEl) avatarEl.textContent = (currentAdmin.email || "A").charAt(0).toUpperCase();

  // Load dashboard stats
  loadDashboardStats();
  // Load users for chat
  loadUsersList();
}

function handleLogout() {
  signOutUser().then(function() {
    loginScreen.style.display = "flex";
    dashboard.style.display = "none";
    adminEmail.value = "";
    adminPassword.value = "";
    loginBtn.textContent = "Sign In";
    loginBtn.disabled = false;
    loginError.style.display = "none";
    currentAdmin = null;
  });
}

// Login event listeners
loginBtn.addEventListener("click", handleLogin);
adminPassword.addEventListener("keypress", function(e) { if (e.key === "Enter") handleLogin(); });
adminEmail.addEventListener("keypress", function(e) { if (e.key === "Enter") adminPassword.focus(); });
if (sidebarLogoutBtn) sidebarLogoutBtn.addEventListener("click", handleLogout);
if (mobileLogoutBtn) mobileLogoutBtn.addEventListener("click", handleLogout);

// ========== SIDEBAR NAVIGATION ==========
hamburgerBtn.addEventListener("click", function() {
  sidebar.classList.toggle("open");
  sidebarOverlay.classList.toggle("active");
});
sidebarOverlay.addEventListener("click", function() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("active");
});

navItems.forEach(function(item) {
  item.addEventListener("click", function() {
    var page = item.getAttribute("data-page");
    navigateTo(page);
  });
});

function navigateTo(page) {
  currentPage = page;

  // Update nav active state
  navItems.forEach(function(item) {
    item.classList.remove("active");
    if (item.getAttribute("data-page") === page) item.classList.add("active");
  });

  // Show/hide pages
  var pages = document.querySelectorAll(".page");
  pages.forEach(function(p) { p.classList.remove("active"); });

  var pageMap = {
    "home": "pageHome",
    "chats": "pageChats",
    "players": "pagePlayers",
    "wallet": "pageWallet",
    "notifications": "pageNotifications",
    "settings": "pageSettings"
  };

  var targetPage = document.getElementById(pageMap[page]);
  if (targetPage) targetPage.classList.add("active");

  // Close mobile sidebar
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("active");
}

// ========== DASHBOARD STATS ==========
function loadDashboardStats() {
  loadUsers(function(data) {
    usersData = data || {};
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

// ========== SUPPORT CHAT ==========
function loadUsersList() {
  loadUsers(function(data) {
    usersData = data || {};
    renderUserList(usersData);
  });
}

function renderUserList(data) {
  if (!userList) return;
  userList.innerHTML = "";
  var uids = Object.keys(data);
  if (uids.length === 0) {
    userList.innerHTML = '<div class="empty-placeholder">No users yet</div>';
    return;
  }

  var sorted = uids.sort(function(a, b) {
    return (data[b].unreadMsg || 0) - (data[a].unreadMsg || 0);
  });

  for (var i = 0; i < sorted.length; i++) {
    (function(uid) {
      var user = data[uid];
      var div = document.createElement("div");
      div.className = "user-item" + (uid === selectedUserUid ? " active" : "");
      div.setAttribute("data-uid", uid);
      var initial = (user.username || "U").charAt(0).toUpperCase();
      var unread = user.unreadMsg || 0;
      div.innerHTML = '<div class="user-item-content"><div class="user-avatar">' + initial + '</div><div class="user-info"><div class="user-name">' + escapeHtml(user.username || "Unknown") + '</div><div class="last-msg">' + (unread > 0 ? unread + " new" : "No new messages") + '</div></div></div>' + (unread > 0 ? '<div class="badge">' + unread + "</div>" : "");
      div.addEventListener("click", function() { selectUser(uid, user); });
      userList.appendChild(div);
    })(sorted[i]);
  }
}

function selectUser(uid, userData) {
  selectedUserUid = uid;
  chatHeaderName.textContent = userData.username || "Unknown";
  chatHeaderStatus.textContent = "UID: " + uid.substring(0, 8) + "...";
  chatInputBar.style.display = "flex";

  // Update active state
  var items = document.querySelectorAll(".user-item");
  for (var i = 0; i < items.length; i++) {
    items[i].classList.remove("active");
    if (items[i].getAttribute("data-uid") === uid) items[i].classList.add("active");
  }

  resetUnread(uid);
  markMessagesAsSeen(uid, "admin");
  loadSelectedUserChat(uid);
}

function loadSelectedUserChat(uid) {
  offMessagesListener(uid);
  messagesContainer.innerHTML = "";
  loadMessages(uid, function(data) {
    allMessagesData = data || {};
    messagesContainer.innerHTML = "";
    if (data) {
      var keys = Object.keys(data).sort(function(a, b) {
        return (data[a].timestamp || 0) - (data[b].timestamp || 0);
      });
      for (var i = 0; i < keys.length; i++) appendMessage(keys[i], data[keys[i]]);
      scrollToBottom();
    }
    markMessagesAsSeen(uid, "admin");
  });
}

function appendMessage(msgKey, msg) {
  var div = document.createElement("div");
  div.className = "message " + (msg.sender === "user" ? "user" : "admin");
  div.setAttribute("data-key", msgKey);

  var content = "";
  if (msg.replyTo && allMessagesData[msg.replyTo]) {
    var orig = allMessagesData[msg.replyTo];
    content += '<div class="msg-reply">' + escapeHtml((orig.text || "📷 Image").substring(0, 60)) + '</div>';
  }
  if (msg.text) content += '<div class="msg-text">' + escapeHtml(msg.text) + "</div>";
  if (msg.imageUrl) content += '<img src="' + msg.imageUrl + '" alt="Image" loading="lazy" onclick="openFullImage(this.src)">';

  var ticks = "";
  if (msg.sender === "admin") {
    ticks = msg.seen ? '<span class="msg-ticks read">✓✓</span>' : '<span class="msg-ticks sent">✓</span>';
  }
  content += '<div class="msg-time">' + formatTime(msg.timestamp) + " " + ticks + "</div>";
  div.innerHTML = content;
  messagesContainer.appendChild(div);

  div.addEventListener("contextmenu", function(e) { e.preventDefault(); showCtx(e, msgKey, msg); });
  var pt = null;
  div.addEventListener("touchstart", function() { pt = setTimeout(function() { var t = { clientX: 0, clientY: 0 }; showCtx(t, msgKey, msg); }, 500); }, { passive: true });
  div.addEventListener("touchend", function() { clearTimeout(pt); });
  div.addEventListener("touchmove", function() { clearTimeout(pt); });
}

// Context menu
function showCtx(e, msgKey, msg) {
  contextMsgKey = msgKey; contextMsgData = msg;
  contextMenu.style.display = "block";
  var x = e.clientX || 50; var y = e.clientY || 50;
  if (x + 160 > window.innerWidth) x = window.innerWidth - 170;
  if (y + 130 > window.innerHeight) y = window.innerHeight - 140;
  contextMenu.style.left = x + "px"; contextMenu.style.top = y + "px";
}

function hideCtx() { contextMenu.style.display = "none"; contextMsgKey = null; contextMsgData = null; }

document.getElementById("ctxReply").addEventListener("click", function() {
  if (!contextMsgData) return;
  replyingTo = contextMsgKey;
  replyName.textContent = contextMsgData.sender === "admin" ? "You" : "User";
  replyText.textContent = contextMsgData.text || "📷 Image";
  replyBar.style.display = "flex"; msgInput.focus(); hideCtx();
});

document.getElementById("ctxCopy").addEventListener("click", function() {
  if (!contextMsgData || !contextMsgData.text) return;
  if (navigator.clipboard) navigator.clipboard.writeText(contextMsgData.text);
  hideCtx();
});

document.getElementById("ctxDelete").addEventListener("click", function() {
  if (!contextMsgKey || !selectedUserUid) return;
  deleteMessage(selectedUserUid, contextMsgKey); hideCtx();
});

document.addEventListener("click", function(e) {
  if (contextMenu && !contextMenu.contains(e.target)) hideCtx();
});

if (replyClose) replyClose.addEventListener("click", function() { replyingTo = null; replyBar.style.display = "none"; });

// Send text message
async function sendTextMessage() {
  var text = msgInput.value.trim();
  if (!text || !selectedUserUid) return;
  msgInput.value = "";
  var replyRef = replyingTo; replyingTo = null; replyBar.style.display = "none";
  await sendMessage(selectedUserUid, "admin", text, "", replyRef);
  sendPushNotification(selectedUserUid, text);
}

// Send image message
async function sendImageMessage() {
  if (!selectedImageFile || !selectedUserUid) return;
  var fileToUpload = selectedImageFile; var replyRef = replyingTo;
  closePreviewModal(); replyingTo = null; replyBar.style.display = "none";
  var uploadingDiv = document.createElement("div");
  uploadingDiv.className = "message admin";
  uploadingDiv.innerHTML = '<div class="msg-text">📷 Sending image...</div>';
  messagesContainer.appendChild(uploadingDiv); scrollToBottom();
  try {
    var imageUrl = await uploadImage(selectedUserUid, fileToUpload);
    uploadingDiv.remove();
    if (imageUrl) {
      await sendMessage(selectedUserUid, "admin", "", imageUrl, replyRef);
      sendPushNotification(selectedUserUid, "📷 Image");
    } else { uploadingDiv.remove(); showErrorBubble(); }
  } catch (error) { uploadingDiv.remove(); showErrorBubble(); }
}

function showErrorBubble() {
  var div = document.createElement("div"); div.className = "message admin";
  div.innerHTML = '<div class="msg-text" style="color:#fca5a5;">❌ Image failed</div>';
  messagesContainer.appendChild(div); scrollToBottom();
}

// FCM push notification
function sendPushNotification(uid, body) {
  fetch("/api/send-notification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid: uid, title: "Support Message", body: body })
  }).catch(function(err) { console.error("Push error:", err); });
}

// Image picker
imgBtn.addEventListener("click", function() { imageInput.click(); });
imageInput.addEventListener("change", function(e) {
  var file = e.target.files[0]; if (!file || !file.type.startsWith("image/")) return;
  selectedImageFile = file;
  var reader = new FileReader();
  reader.onload = function(ev) { previewImage.src = ev.target.result; imagePreviewModal.style.display = "flex"; };
  reader.readAsDataURL(file); imageInput.value = "";
});

cancelPreview.addEventListener("click", closePreviewModal);
previewOverlay.addEventListener("click", closePreviewModal);
sendPreview.addEventListener("click", sendImageMessage);

function closePreviewModal() { imagePreviewModal.style.display = "none"; previewImage.src = ""; selectedImageFile = null; }
function openFullImage(src) { window.open(src, "_blank"); }

// Chat input
sendBtn.addEventListener("click", sendTextMessage);
msgInput.addEventListener("keypress", function(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendTextMessage(); } });

// Search
searchInput.addEventListener("input", function(e) {
  var q = e.target.value.toLowerCase().trim();
  if (!q) { renderUserList(usersData); return; }
  var filtered = {}; var keys = Object.keys(usersData);
  for (var i = 0; i < keys.length; i++) { var u = usersData[keys[i]]; if ((u.username || "").toLowerCase().indexOf(q) !== -1) filtered[keys[i]] = u; }
  renderUserList(filtered);
});

// ========== UTILITIES ==========
function scrollToBottom() {
  if (messagesContainer) requestAnimationFrame(function() { messagesContainer.scrollTop = messagesContainer.scrollHeight; });
}

function formatTime(ts) {
  if (!ts) return "";
  var d = new Date(ts); var now = new Date(); var today = d.toDateString() === now.toDateString();
  var h = d.getHours(); var m = d.getMinutes(); var ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; m = m < 10 ? "0" + m : m;
  if (today) return h + ":" + m + " " + ap;
  return d.getDate() + " " + d.toLocaleString("en", { month: "short" }) + ", " + h + ":" + m + " " + ap;
}

function escapeHtml(t) { var d = document.createElement("div"); d.appendChild(document.createTextNode(t)); return d.innerHTML; }

function showLoading(show) {
  var overlay = document.getElementById("loadingOverlay");
  if (show) { if (overlay) overlay.style.display = "flex"; }
  else { if (overlay) overlay.style.display = "none"; }
}

// ========== START ==========
initApp();
