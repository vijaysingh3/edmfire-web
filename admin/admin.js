// Admin Panel Logic

var currentAdmin = null;
var selectedUserUid = null;
var selectedImageFile = null;
var usersData = {};
var replyingTo = null;
var contextMsgKey = null;
var contextMsgData = null;
var allMessagesData = {};

// DOM elements
var userListEl = document.getElementById("userList");
var messagesContainer = document.getElementById("messagesContainer");
var chatHeaderName = document.getElementById("chatHeaderName");
var chatHeaderStatus = document.getElementById("chatHeaderStatus");
var bottomBar = document.getElementById("bottomBar");
var msgInput = document.getElementById("msgInput");
var sendBtn = document.getElementById("sendBtn");
var imgBtn = document.getElementById("imgBtn");
var imageInput = document.getElementById("imageInput");
var searchInput = document.getElementById("searchInput");
var mobileToggle = document.getElementById("mobileToggle");
var sidebar = document.getElementById("sidebar");
var sidebarOverlay = document.getElementById("sidebarOverlay");
var imagePreviewModal = document.getElementById("imagePreviewModal");
var previewImage = document.getElementById("previewImage");
var previewOverlay = document.getElementById("previewOverlay");
var cancelPreview = document.getElementById("cancelPreview");
var sendPreview = document.getElementById("sendPreview");
var replyBar = document.getElementById("replyBar");
var replyName = document.getElementById("replyName");
var replyText = document.getElementById("replyText");
var replyClose = document.getElementById("replyClose");
var contextMenu = document.getElementById("contextMenu");

// init
async function initApp() {
  showLoading(true);
  onAuthChange(function(user) {
    if (user) {
      if (!checkAdminAccess(user)) {
        chatHeaderName.textContent = "Access Denied";
        chatHeaderStatus.textContent = "UID: " + user.uid + " not authorized";
        messagesContainer.innerHTML = '<div class="no-chat-state"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg><h3 style="color:#ef4444">Access Denied</h3><p>UID (' + user.uid + ') not admin</p><button onclick="signOutUser().then(function(){location.reload()})" style="margin-top:12px;padding:10px 24px;border:none;border-radius:12px;background:#ef4444;color:white;cursor:pointer;font-family:Poppins,sans-serif;">Sign Out</button></div>';
        showLoading(false); return;
      }
      currentAdmin = user;
      chatHeaderName.textContent = "Admin Panel";
      chatHeaderStatus.textContent = "Logged in: " + (user.email || user.uid);
      loadUsersList();
      showLoading(false);
    } else {
      showAdminLogin();
      showLoading(false);
    }
  });
}

function showAdminLogin() {
  chatHeaderName.textContent = "Admin Login";
  chatHeaderStatus.textContent = "Sign in to manage chats";
  messagesContainer.innerHTML = '<div class="no-chat-state"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><h3>Admin Access</h3><p>Sign in with admin credentials</p><div style="margin-top:20px;display:flex;flex-direction:column;gap:12px;width:280px;"><input type="email" id="adminEmail" placeholder="Email" style="height:48px;border:2px solid #e5e7eb;border-radius:12px;padding:0 16px;font-size:14px;outline:none;font-family:Poppins,sans-serif;"><input type="password" id="adminPassword" placeholder="Password" style="height:48px;border:2px solid #e5e7eb;border-radius:12px;padding:0 16px;font-size:14px;outline:none;font-family:Poppins,sans-serif;"><button id="adminLoginBtn" style="height:48px;border:none;border-radius:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;font-size:15px;font-weight:500;cursor:pointer;font-family:Poppins,sans-serif;">Sign In</button><p id="loginError" style="color:#ef4444;font-size:12px;display:none;text-align:center;"></p></div></div>';
  document.getElementById("adminLoginBtn").addEventListener("click", handleAdminLogin);
  document.getElementById("adminPassword").addEventListener("keypress", function(e) { if (e.key === "Enter") handleAdminLogin(); });
  document.getElementById("adminEmail").addEventListener("keypress", function(e) { if (e.key === "Enter") document.getElementById("adminPassword").focus(); });
}

async function handleAdminLogin() {
  var email = document.getElementById("adminEmail").value.trim();
  var password = document.getElementById("adminPassword").value;
  var loginError = document.getElementById("loginError");
  var loginBtn = document.getElementById("adminLoginBtn");
  if (!email) { loginError.textContent = "Enter email"; loginError.style.display = "block"; return; }
  if (!password) { loginError.textContent = "Enter password"; loginError.style.display = "block"; return; }
  loginBtn.textContent = "Signing in..."; loginBtn.style.opacity = "0.7"; loginBtn.disabled = true; loginError.style.display = "none";
  var result = await signInWithEmail(email, password);
  if (result.user) {
    if (checkAdminAccess(result.user)) {
      currentAdmin = result.user;
      chatHeaderName.textContent = "Admin Panel";
      chatHeaderStatus.textContent = "Logged in: " + (result.user.email || result.user.uid);
      loadUsersList();
    } else {
      loginError.textContent = "Access denied"; loginError.style.display = "block";
      loginBtn.textContent = "Sign In"; loginBtn.style.opacity = "1"; loginBtn.disabled = false;
      signOutUser();
    }
  } else {
    loginError.textContent = result.error || "Invalid credentials"; loginError.style.display = "block";
    loginBtn.textContent = "Sign In"; loginBtn.style.opacity = "1"; loginBtn.disabled = false;
  }
}

function loadUsersList() {
  loadUsers(function(data) { usersData = data || {}; renderUserList(usersData); });
}

function renderUserList(data) {
  userListEl.innerHTML = "";
  var uids = Object.keys(data);
  if (uids.length === 0) { userListEl.innerHTML = '<div class="empty-state"><p>No users yet</p></div>'; return; }
  var sorted = uids.sort(function(a, b) { return (data[b].unreadMsg || 0) - (data[a].unreadMsg || 0); });
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
      userListEl.appendChild(div);
    })(sorted[i]);
  }
}

function selectUser(uid, userData) {
  selectedUserUid = uid;
  chatHeaderName.textContent = userData.username || "Unknown";
  chatHeaderStatus.textContent = "UID: " + uid.substring(0, 8) + "...";
  bottomBar.style.display = "flex";
  var items = document.querySelectorAll(".user-item");
  for (var i = 0; i < items.length; i++) { items[i].classList.remove("active"); if (items[i].getAttribute("data-uid") === uid) items[i].classList.add("active"); }
  closeSidebar(); resetUnread(uid); markMessagesAsSeen(uid, "admin"); loadSelectedUserChat(uid);
}

function loadSelectedUserChat(uid) {
  offMessagesListener(uid); messagesContainer.innerHTML = "";
  loadMessages(uid, function(data) {
    allMessagesData = data || {}; messagesContainer.innerHTML = "";
    if (data) {
      var keys = Object.keys(data).sort(function(a, b) { return (data[a].timestamp || 0) - (data[b].timestamp || 0); });
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
  div.innerHTML = content; messagesContainer.appendChild(div);

  div.addEventListener("contextmenu", function(e) { e.preventDefault(); showCtx(e, msgKey, msg); });
  var pt = null;
  div.addEventListener("touchstart", function() { pt = setTimeout(function() { var t = { clientX: 0, clientY: 0 }; showCtx(t, msgKey, msg); }, 500); }, { passive: true });
  div.addEventListener("touchend", function() { clearTimeout(pt); });
  div.addEventListener("touchmove", function() { clearTimeout(pt); });
}

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

document.addEventListener("click", function(e) { if (!contextMenu.contains(e.target)) hideCtx(); });
replyClose.addEventListener("click", function() { replyingTo = null; replyBar.style.display = "none"; });

async function sendTextMessage() {
  var text = msgInput.value.trim();
  if (!text || !selectedUserUid) return;
  msgInput.value = "";
  var replyRef = replyingTo; replyingTo = null; replyBar.style.display = "none";
  await sendMessage(selectedUserUid, "admin", text, "", replyRef);
  sendPushNotification(selectedUserUid, text);
}

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

// FCM push notification bhejna
function sendPushNotification(uid, body) {
  fetch("/api/send-notification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uid: uid, title: "Support Message", body: body })
  }).catch(function(err) { console.error("Push error:", err); });
}

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

sendBtn.addEventListener("click", sendTextMessage);
msgInput.addEventListener("keypress", function(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendTextMessage(); } });

searchInput.addEventListener("input", function(e) {
  var q = e.target.value.toLowerCase().trim();
  if (!q) { renderUserList(usersData); return; }
  var filtered = {}; var keys = Object.keys(usersData);
  for (var i = 0; i < keys.length; i++) { var u = usersData[keys[i]]; if ((u.username || "").toLowerCase().indexOf(q) !== -1) filtered[keys[i]] = u; }
  renderUserList(filtered);
});

mobileToggle.addEventListener("click", function() { sidebar.classList.toggle("open"); sidebarOverlay.classList.toggle("active"); });
sidebarOverlay.addEventListener("click", closeSidebar);
function closeSidebar() { sidebar.classList.remove("open"); sidebarOverlay.classList.remove("active"); }

function scrollToBottom() { requestAnimationFrame(function() { messagesContainer.scrollTop = messagesContainer.scrollHeight; }); }

function formatTime(ts) {
  if (!ts) return "";
  var d = new Date(ts); var now = new Date(); var today = d.toDateString() === now.toDateString();
  var h = d.getHours(); var m = d.getMinutes(); var ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; m = m < 10 ? "0" + m : m;
  if (today) return h + ":" + m + " " + ap;
  return d.getDate() + " " + d.toLocaleString("en", { month: "short" }) + ", " + h + ":" + m + " " + ap;
}

function escapeHtml(t) { var d = document.createElement("div"); d.appendChild(document.createTextNode(t)); return d.innerHTML; }

function showLoading(show) {
  var o = document.getElementById("loadingOverlay");
  if (show) { if (!o) { o = document.createElement("div"); o.id = "loadingOverlay"; o.className = "loading-overlay"; o.innerHTML = '<div class="loading-spinner"></div>'; document.body.appendChild(o); } }
  else { if (o) o.remove(); }
}

initApp();