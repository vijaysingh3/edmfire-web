// ============================================
// EDMFire Admin - Support Chats Logic
// With sidebar toggle + mobile WhatsApp pattern
// Smart auto-close system
// ============================================

var selectedUserUid = null;
var selectedImageFile = null;
var usersData = {};
var replyingTo = null;
var contextMsgKey = null;
var contextMsgData = null;
var allMessagesData = {};
var isMobile = window.innerWidth <= 768;

// Chat DOM elements
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

// Chat sidebar elements
var chatSidebar = document.getElementById("chatSidebar");
var chatSidebarToggle = document.getElementById("chatSidebarToggle");
var chatBackBtn = document.getElementById("chatBackBtn");
var chatSidebarOpenBtn = document.getElementById("chatSidebarOpenBtn");
var chatSidebarOverlay = document.getElementById("chatSidebarOverlay");

// ========== CHAT SIDEBAR TOGGLE ==========

// Desktop: toggle collapse
function toggleChatSidebar() {
  if (!chatSidebar) return;
  if (isMobile) {
    // On mobile, this button hides the sidebar
    hideMobileChatSidebar();
  } else {
    // On desktop, toggle collapse
    chatSidebar.classList.toggle("collapsed");
    localStorage.setItem("edmfireChatSidebarCollapsed", chatSidebar.classList.contains("collapsed"));
  }
}

// Mobile: show user list
function showMobileChatSidebar() {
  if (!chatSidebar) return;
  chatSidebar.classList.remove("mobile-hidden");
  if (chatSidebarOverlay) chatSidebarOverlay.classList.add("active");
}

// Mobile: hide user list (show chat)
function hideMobileChatSidebar() {
  if (!chatSidebar) return;
  chatSidebar.classList.add("mobile-hidden");
  if (chatSidebarOverlay) chatSidebarOverlay.classList.remove("active");
}

// Initialize chat sidebar state based on screen size
function initChatSidebarState() {
  if (!chatSidebar) return;
  isMobile = window.innerWidth <= 768;

  if (isMobile) {
    // Mobile: reset collapsed, show sidebar initially (no chat selected yet)
    chatSidebar.classList.remove("collapsed");
    if (!selectedUserUid) {
      // No chat selected: show user list
      chatSidebar.classList.remove("mobile-hidden");
    } else {
      // Chat selected: hide user list, show chat
      chatSidebar.classList.add("mobile-hidden");
    }
    // Remove overlay on init
    if (chatSidebarOverlay) chatSidebarOverlay.classList.remove("active");
  } else {
    // Desktop: reset mobile-hidden, restore collapsed state from localStorage
    chatSidebar.classList.remove("mobile-hidden");
    if (chatSidebarOverlay) chatSidebarOverlay.classList.remove("active");
    if (localStorage.getItem("edmfireChatSidebarCollapsed") === "true") {
      chatSidebar.classList.add("collapsed");
    } else {
      chatSidebar.classList.remove("collapsed");
    }
  }
}

// Event listeners for toggle buttons
if (chatSidebarToggle) {
  chatSidebarToggle.addEventListener("click", toggleChatSidebar);
}

if (chatSidebarOpenBtn) {
  chatSidebarOpenBtn.addEventListener("click", function() {
    if (isMobile) {
      showMobileChatSidebar();
    } else {
      chatSidebar.classList.remove("collapsed");
      localStorage.setItem("edmfireChatSidebarCollapsed", "false");
    }
  });
}

if (chatBackBtn) {
  chatBackBtn.addEventListener("click", function() {
    showMobileChatSidebar();
  });
}

// Chat sidebar overlay click to close
if (chatSidebarOverlay) {
  chatSidebarOverlay.addEventListener("click", function() {
    hideMobileChatSidebar();
  });
}

// ========== SMART AUTO-CLOSE ON RESIZE ==========
var chatPrevWidth = window.innerWidth;

window.addEventListener("resize", function() {
  var currentWidth = window.innerWidth;
  var wasMobile = isMobile;
  isMobile = currentWidth <= 768;

  // When switching between mobile and desktop, reinitialize
  if (wasMobile !== isMobile) {
    initChatSidebarState();
  }

  chatPrevWidth = currentWidth;
});

// ========== LOAD USERS ==========
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

  // Mobile: auto-hide user list after selecting a chat (smart auto-close)
  if (isMobile) {
    hideMobileChatSidebar();
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
  div.innerHTML = '<div class="msg-text" style="color:#f87171;">❌ Image failed</div>';
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

// Scroll utility
function scrollToBottom() {
  if (messagesContainer) requestAnimationFrame(function() { messagesContainer.scrollTop = messagesContainer.scrollHeight; });
}

// ========== INIT ==========
initAuthGuard(function(user) {
  loadUsersList();
});
initCommonUI();
initChatSidebarState();
