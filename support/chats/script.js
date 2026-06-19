// ============================================
// EDMFire Support - Helper Chat Logic
// - Reads users + messages from SAME RTDB paths as admin
//   helpCenter/users/{uid}  and  helpCenter/chats/{uid}
// - Helper messages include helperUid + helperName + helperEmail (PINNED)
// - Respects helperWrite permission: if "no", input disabled
// - Helper name fetched from hosts/{hostId}/fullName (already loaded by auth guard)
// ============================================

var selectedUserUid = null;
var selectedImageFile = null;
var usersData = {};
var replyingTo = null;
var contextMsgKey = null;
var contextMsgData = null;
var allMessagesData = {};
var isMobile = window.innerWidth <= 768;

// Last message cache: uid -> { text, timestamp, sender }
var lastMessageCache = {};

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
var readonlyBanner = document.getElementById("readonlyBanner");

// Sidebar elements
var chatSidebar = document.getElementById("chatSidebar");
var chatSidebarToggle = document.getElementById("chatSidebarToggle");
var chatBackBtn = document.getElementById("chatBackBtn");
var chatSidebarOpenBtn = document.getElementById("chatSidebarOpenBtn");
var sidebarOverlay = document.getElementById("sidebarOverlay");
var hamburgerBtn = document.getElementById("hamburgerBtn");
var sidebarLogoutBtn = document.getElementById("sidebarLogoutBtn");
var mobileLogoutBtn = document.getElementById("mobileLogoutBtn");
var helperPermBadge = document.getElementById("helperPermBadge");

// ========== HELPERS ==========

function canWrite() {
  return currentHostData && currentHostData.helperWrite === "yes";
}

function getHelperName() {
  if (!currentHostData) return "Helper";
  return currentHostData.fullName || "Helper";
}

function getHelperEmail() {
  if (!currentHostData) return "";
  return currentHostData.gmail || (currentHelper && currentHelper.email) || "";
}

function getHelperUid() {
  return currentHelper ? currentHelper.uid : "";
}

// ========== SIDEBAR TOGGLE ==========

function toggleSidebar() {
  if (isMobile) {
    if (chatSidebar.classList.contains("mobile-hidden")) {
      chatSidebar.classList.remove("mobile-hidden");
      sidebarOverlay.classList.add("active");
    } else {
      chatSidebar.classList.add("mobile-hidden");
      sidebarOverlay.classList.remove("active");
    }
  } else {
    chatSidebar.classList.toggle("collapsed");
  }
}

if (chatSidebarToggle) chatSidebarToggle.addEventListener("click", toggleSidebar);
if (hamburgerBtn) hamburgerBtn.addEventListener("click", toggleSidebar);
if (chatSidebarOpenBtn) chatSidebarOpenBtn.addEventListener("click", toggleSidebar);
if (sidebarOverlay) sidebarOverlay.addEventListener("click", function() {
  chatSidebar.classList.add("mobile-hidden");
  sidebarOverlay.classList.remove("active");
});
if (chatBackBtn) chatBackBtn.addEventListener("click", function() {
  chatSidebar.classList.remove("mobile-hidden");
  sidebarOverlay.classList.remove("active");
});

// ========== LOGOUT ==========
if (sidebarLogoutBtn) sidebarLogoutBtn.addEventListener("click", handleHostLogout);
if (mobileLogoutBtn) mobileLogoutBtn.addEventListener("click", handleHostLogout);

// ========== INIT AFTER AUTH GUARD ==========
initSupportAuthGuard(function(user, hostData, hostDocId) {
  // Auth guard has already verified permission & set globals
  console.log("[SUPPORT-CHAT] Authenticated as helper:", getHelperName(), "write:", canWrite());

  // Update permission badge
  if (helperPermBadge) {
    if (canWrite()) {
      helperPermBadge.textContent = "Read + Write";
      helperPermBadge.style.color = "#10b981";
    } else {
      helperPermBadge.textContent = "Read only";
      helperPermBadge.style.color = "#fbbf24";
    }
  }

  // Start loading users
  loadUsersList();

  // Listen for real-time permission changes (admin might revoke access)
  listenForPermissionChanges();

  // Check URL for ?uid= deep-link
  var urlParams = new URLSearchParams(window.location.search);
  var deepLinkUid = urlParams.get("uid");
  if (deepLinkUid) {
    setTimeout(function() { selectUser(deepLinkUid); }, 800);
  }
});

// ========== LISTEN FOR PERMISSION CHANGES ==========
// If admin revokes helperRead or helperWrite while helper is online,
// we reflect that immediately (or sign out if helperRead revoked).
//
// IMPORTANT: We listen on RTDB helpCenter/helperAccess/{authUid} (NOT Firestore),
// because Firestore security rules don't allow hosts to read their own
// hosts/{docId} doc directly. The RTDB mirror is updated by the admin
// Helper Manager page (and also refreshed server-side by /api/helper-profile
// on every login).
function listenForPermissionChanges() {
  if (!currentHelper) return;

  var rtdbPath = "helpCenter/helperAccess/" + currentHelper.uid;
  try {
    firebase.database().ref(rtdbPath).on("value", function(snap) {
      var perm = snap.val();
      if (!perm) {
        // Path doesn't exist yet — admin hasn't toggled permissions via
        // Helper Manager, or the mirror write failed. Don't sign out
        // (initial state from /api/helper-profile is authoritative here).
        console.warn("[SUPPORT-PERM] No RTDB mirror yet — skipping update");
        return;
      }

      var newRead = perm.helperRead === "yes";
      var newWrite = perm.helperWrite === "yes";

      // If read revoked → sign out
      if (!newRead) {
        alert("Your helper access has been revoked by admin. You will be signed out.");
        handleHostLogout();
        return;
      }

      // Update host data with latest permissions (preserve name/email from API)
      if (currentHostData) {
        var oldWrite = currentHostData.helperWrite;
        currentHostData.helperRead = "yes";
        currentHostData.helperWrite = newWrite ? "yes" : "no";

        // If write permission changed → update UI
        if (oldWrite !== currentHostData.helperWrite) {
          updateWritePermissionUI();
        }
      }
    }, function(err) {
      console.warn("[SUPPORT-PERM] Listener error:", err);
    });
  } catch (e) {
    console.warn("[SUPPORT-PERM] Could not start listener:", e);
  }
}

function updateWritePermissionUI() {
  if (helperPermBadge) {
    if (canWrite()) {
      helperPermBadge.textContent = "Read + Write";
      helperPermBadge.style.color = "#10b981";
    } else {
      helperPermBadge.textContent = "Read only";
      helperPermBadge.style.color = "#fbbf24";
    }
  }
  applyWritePermissionToUI();
}

function applyWritePermissionToUI() {
  if (canWrite()) {
    if (chatInputBar) chatInputBar.style.display = "flex";
    if (readonlyBanner) readonlyBanner.style.display = "none";
    if (msgInput) msgInput.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    if (imgBtn) imgBtn.disabled = false;
  } else {
    if (chatInputBar) chatInputBar.style.display = "none";
    if (readonlyBanner) readonlyBanner.style.display = "flex";
    if (msgInput) msgInput.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    if (imgBtn) imgBtn.disabled = true;
  }
}

// ========== LOAD USERS LIST ==========
function loadUsersList() {
  firebase.database().ref("helpCenter/users").on("value", function(snapshot) {
    usersData = snapshot.val() || {};
    renderUserList();
  }, function(err) {
    console.error("[SUPPORT] loadUsersList error:", err);
    if (userList) userList.innerHTML = '<div class="empty-placeholder">Error loading users</div>';
  });
}

function renderUserList() {
  if (!userList) return;
  var uids = Object.keys(usersData || {});
  if (uids.length === 0) {
    userList.innerHTML = '<div class="empty-placeholder">No users yet</div>';
    return;
  }

  // Build list with last message info
  var items = [];
  for (var i = 0; i < uids.length; i++) {
    var uid = uids[i];
    var u = usersData[uid] || {};
    var name = u.UserName || u.username || ("User " + uid.substring(0, 6));
    var last = lastMessageCache[uid] || {};
    items.push({
      uid: uid,
      name: name,
      lastText: last.text || "",
      lastTime: last.timestamp || u.lastActive || 0,
      unread: u.unreadMsg || 0
    });
  }

  // Sort by last message time DESC
  items.sort(function(a, b) { return b.lastTime - a.lastTime; });

  // Filter by search query
  var query = (searchInput && searchInput.value || "").toLowerCase().trim();
  if (query) {
    items = items.filter(function(it) {
      return it.name.toLowerCase().indexOf(query) !== -1
        || it.uid.toLowerCase().indexOf(query) !== -1;
    });
  }

  // Render
  var html = "";
  for (var j = 0; j < items.length; j++) {
    var it = items[j];
    var active = (it.uid === selectedUserUid) ? " active" : "";
    var avatar = escapeHtml((it.name || "U").charAt(0).toUpperCase());
    var lastMsgPreview = it.lastText ? escapeHtml(it.lastText.substring(0, 40)) : "Tap to start chat";
    var timeAgo = it.lastTime ? formatTimeAgo(it.lastTime) : "";
    var unreadHtml = it.unread > 0
      ? '<span class="unread-badge">' + it.unread + '</span>'
      : '';

    html += '<div class="user-item' + active + '" data-uid="' + escapeHtml(it.uid) + '">'
      + '<div class="user-avatar">' + avatar + '</div>'
      + '<div class="user-content">'
        + '<div class="user-top-row">'
          + '<span class="user-name">' + escapeHtml(it.name) + '</span>'
          + '<span class="user-time">' + escapeHtml(timeAgo) + '</span>'
        + '</div>'
        + '<div class="user-bottom-row">'
          + '<span class="user-last-msg">' + lastMsgPreview + '</span>'
          + unreadHtml
        + '</div>'
      + '</div>'
    + '</div>';
  }

  userList.innerHTML = html || '<div class="empty-placeholder">No users match</div>';

  // Attach click handlers
  var userItems = userList.querySelectorAll(".user-item");
  for (var k = 0; k < userItems.length; k++) {
    userItems[k].addEventListener("click", function() {
      var uid = this.getAttribute("data-uid");
      selectUser(uid);
    });
  }
}

// Search input
if (searchInput) {
  searchInput.addEventListener("input", renderUserList);
}

// ========== SELECT USER ==========
function selectUser(uid) {
  if (!uid) return;
  selectedUserUid = uid;

  // Update header
  var u = usersData[uid] || {};
  var name = u.UserName || u.username || ("User " + uid.substring(0, 6));
  if (chatHeaderName) chatHeaderName.textContent = name;
  if (chatHeaderStatus) chatHeaderStatus.textContent = " Viewing conversation";

  // Show input bar (if write permission)
  applyWritePermissionToUI();

  // Highlight in sidebar
  var items = userList.querySelectorAll(".user-item");
  for (var i = 0; i < items.length; i++) {
    if (items[i].getAttribute("data-uid") === uid) {
      items[i].classList.add("active");
    } else {
      items[i].classList.remove("active");
    }
  }

  // On mobile — hide sidebar, show chat
  if (isMobile) {
    chatSidebar.classList.add("mobile-hidden");
    if (sidebarOverlay) sidebarOverlay.classList.remove("active");
  }

  // Load messages
  loadMessagesForUser(uid);

  // Reset unread count
  firebase.database().ref("helpCenter/users/" + uid + "/unreadMsg").set(0);
  markMessagesAsSeen(uid, "helper");
}

// ========== LOAD MESSAGES ==========
function loadMessagesForUser(uid) {
  // Clear current
  if (messagesContainer) {
    messagesContainer.innerHTML = "";
  }
  allMessagesData = {};

  firebase.database().ref("helpCenter/chats/" + uid).on("value", function(snapshot) {
    var data = snapshot.val() || {};
    allMessagesData = data;
    renderMessages(data);
    updateLastMessageCache(uid, data);
    renderUserList(); // refresh sidebar preview
  }, function(err) {
    console.error("[SUPPORT] loadMessagesForUser error:", err);
  });
}

function updateLastMessageCache(uid, data) {
  if (!data) return;
  var keys = Object.keys(data);
  if (keys.length === 0) {
    delete lastMessageCache[uid];
    return;
  }
  // Find latest
  var latest = null;
  for (var i = 0; i < keys.length; i++) {
    var m = data[keys[i]];
    if (!latest || (m.timestamp || 0) > latest.timestamp) {
      latest = m;
    }
  }
  if (latest) {
    var preview = latest.text || (latest.imageUrl ? "📷 Image" : "");
    lastMessageCache[uid] = {
      text: preview,
      timestamp: latest.timestamp || 0,
      sender: latest.sender
    };
  }
}

function renderMessages(data) {
  if (!messagesContainer) return;
  messagesContainer.innerHTML = "";

  if (!data || Object.keys(data).length === 0) {
    messagesContainer.innerHTML = '<div class="no-chat-state" style="margin:auto;"><p>No messages yet. Be the first to help!</p></div>';
    return;
  }

  var keys = Object.keys(data).sort(function(a, b) {
    return (data[a].timestamp || 0) - (data[b].timestamp || 0);
  });
  for (var i = 0; i < keys.length; i++) {
    appendMessage(keys[i], data[keys[i]]);
  }
  scrollToBottom();
}

function appendMessage(msgKey, msg) {
  if (!messagesContainer) return;
  var div = document.createElement("div");

  // Determine class — helper & admin both on right side
  var cls = "message ";
  if (msg.sender === "user") {
    cls += "user";
  } else if (msg.sender === "helper") {
    cls += "helper";
  } else if (msg.sender === "admin") {
    cls += "admin";
  } else {
    cls += "user";
  }
  div.className = cls;
  div.setAttribute("data-key", msgKey);

  var content = "";

  // Reply preview
  if (msg.replyTo && allMessagesData[msg.replyTo]) {
    var orig = allMessagesData[msg.replyTo];
    var origText = orig.text || "📷 Image";
    content += '<div class="msg-reply">' + escapeHtml(origText.substring(0, 60)) + '</div>';
  }

  // Helper name PIN (only for helper-sent messages, shows to everyone EXCEPT the sender themselves)
  // But since this is helper's own page, we won't show their own name in their own bubble
  // However, for OTHER helpers' messages, we should show the name
  // Logic: show helperName if msg.sender==="helper" AND msg.helperUid !== currentHelper.uid
  if (msg.sender === "helper" && msg.helperUid && msg.helperUid !== getHelperUid()) {
    var helperName = msg.helperName || "Helper";
    content += '<div class="msg-helper-name">' + escapeHtml(helperName) + '</div>';
  }

  // For admin messages, show "Admin" label (small)
  if (msg.sender === "admin") {
    content += '<div class="msg-helper-name" style="color:rgba(255,255,255,0.9);">Admin</div>';
  }

  if (msg.text) {
    content += '<div class="msg-text">' + escapeHtml(msg.text) + "</div>";
  }
  if (msg.imageUrl) {
    content += '<img src="' + escapeHtml(msg.imageUrl) + '" alt="Image" loading="lazy" onclick="openFullImage(this.src)">';
  }

  content += '<div class="msg-time">' + formatTime(msg.timestamp) + "</div>";
  div.innerHTML = content;
  messagesContainer.appendChild(div);

  // Context menu for reply/copy
  div.addEventListener("contextmenu", function(e) {
    e.preventDefault();
    showContextMenu(e, msgKey, msg);
  });
  var pressTimer = null;
  div.addEventListener("touchstart", function() {
    pressTimer = setTimeout(function() {
      var touch = { clientX: 50, clientY: 50 };
      showContextMenu(touch, msgKey, msg);
    }, 500);
  }, { passive: true });
  div.addEventListener("touchend", function() { clearTimeout(pressTimer); });
  div.addEventListener("touchmove", function() { clearTimeout(pressTimer); });
}

// ========== CONTEXT MENU ==========
function showContextMenu(e, msgKey, msg) {
  contextMsgKey = msgKey; contextMsgData = msg;
  if (contextMenu) {
    contextMenu.style.display = "block";
    var x = e.clientX || 50; var y = e.clientY || 50;
    if (x + 160 > window.innerWidth) x = window.innerWidth - 170;
    if (y + 130 > window.innerHeight) y = window.innerHeight - 140;
    contextMenu.style.left = x + "px"; contextMenu.style.top = y + "px";
  }
}

function hideContextMenu() {
  if (contextMenu) { contextMenu.style.display = "none"; }
  contextMsgKey = null; contextMsgData = null;
}

document.addEventListener("click", function(e) {
  if (contextMenu && !contextMenu.contains(e.target)) hideContextMenu();
});

// Reply
if (document.getElementById("ctxReply")) {
  document.getElementById("ctxReply").addEventListener("click", function() {
    if (!contextMsgData) return;
    replyingTo = contextMsgKey;
    if (replyName) {
      replyName.textContent = contextMsgData.sender === "user"
        ? "User"
        : (contextMsgData.helperName || "Helper");
    }
    if (replyText) replyText.textContent = contextMsgData.text || "📷 Image";
    if (replyBar) replyBar.style.display = "flex";
    if (msgInput) msgInput.focus();
    hideContextMenu();
  });
}

// Copy
if (document.getElementById("ctxCopy")) {
  document.getElementById("ctxCopy").addEventListener("click", function() {
    if (!contextMsgData || !contextMsgData.text) return;
    if (navigator.clipboard) navigator.clipboard.writeText(contextMsgData.text);
    else {
      var ta = document.createElement("textarea");
      ta.value = contextMsgData.text;
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    hideContextMenu();
  });
}

// Reply close
if (replyClose) {
  replyClose.addEventListener("click", function() {
    replyingTo = null;
    if (replyBar) replyBar.style.display = "none";
  });
}

// ========== SEND MESSAGE (HELPER) ==========
// Helper message includes helperUid, helperName, helperEmail PINNED
async function sendHelperTextMessage() {
  if (!canWrite()) {
    alert("You do not have write permission");
    return;
  }
  var text = msgInput.value.trim();
  if (!text || !selectedUserUid) return;

  msgInput.value = "";
  var replyRef = replyingTo;
  replyingTo = null;
  if (replyBar) replyBar.style.display = "none";

  try {
    await sendHelperMessage(selectedUserUid, text, "", replyRef);
    // Notify user (background, non-blocking)
    notifyUserOfHelperMessage(selectedUserUid, text);
  } catch (error) {
    console.error("[SUPPORT] sendHelperTextMessage error:", error);
    showErrorBubble("Failed to send");
  }
}

async function sendHelperImageMessage() {
  if (!canWrite()) {
    alert("You do not have write permission");
    return;
  }
  if (!selectedImageFile || !selectedUserUid) return;

  var fileToUpload = selectedImageFile;
  var replyRef = replyingTo;
  closePreviewModal();
  replyingTo = null;
  if (replyBar) replyBar.style.display = "none";

  var uploadingDiv = document.createElement("div");
  uploadingDiv.className = "message helper";
  uploadingDiv.innerHTML = '<div class="msg-text">📷 Sending image...</div>';
  messagesContainer.appendChild(uploadingDiv);
  scrollToBottom();

  try {
    var imageUrl = await uploadImage(selectedUserUid, fileToUpload);
    uploadingDiv.remove();
    if (imageUrl) {
      await sendHelperMessage(selectedUserUid, "", imageUrl, replyRef);
      notifyUserOfHelperMessage(selectedUserUid, "📷 Image");
    } else {
      showErrorBubble("Image upload failed");
    }
  } catch (error) {
    uploadingDiv.remove();
    showErrorBubble("Failed to send image");
  }
}

// Send helper message with pinned identity
function sendHelperMessage(userUid, text, imageUrl, replyTo) {
  return new Promise(function(resolve) {
    var ref = firebase.database().ref("helpCenter/chats/" + userUid);
    var newMsg = {
      sender: "helper",
      text: text || "",
      imageUrl: imageUrl || "",
      seen: false,
      timestamp: Date.now(),
      helperUid: getHelperUid(),
      helperName: getHelperName(),
      helperEmail: getHelperEmail()
    };
    if (replyTo) newMsg.replyTo = replyTo;

    ref.push(newMsg, function(error) {
      if (error) {
        console.error("[SUPPORT] Send message error:", error);
        resolve(false);
      } else {
        console.log("[SUPPORT] Helper message sent");
        resolve(true);
      }
    });
  });
}

// Notify user of helper reply (FCM)
function notifyUserOfHelperMessage(userUid, body) {
  if (!userUid) return;
  try {
    fetch("/api/send-notification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: "user",
        title: "Reply from " + getHelperName(),
        body: body || "New support reply",
        userUid: userUid,
        senderUid: getHelperUid(),
        senderName: getHelperName()
      })
    }).catch(function(err) {
      console.warn("[SUPPORT] Notify user failed (non-blocking):", err);
    });
  } catch (e) {
    console.warn("[SUPPORT] Notify init failed:", e);
  }
}

function showErrorBubble(msg) {
  if (!messagesContainer) return;
  var div = document.createElement("div");
  div.className = "message helper";
  div.innerHTML = '<div class="msg-text" style="color:#fca5a5;">❌ ' + escapeHtml(msg || "Failed") + '</div>';
  messagesContainer.appendChild(div);
  scrollToBottom();
}

// ========== EVENT LISTENERS ==========
if (sendBtn) sendBtn.addEventListener("click", sendHelperTextMessage);
if (msgInput) {
  msgInput.addEventListener("keypress", function(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendHelperTextMessage();
    }
  });
}

if (imgBtn) {
  imgBtn.addEventListener("click", function() {
    if (!canWrite()) return;
    if (imageInput) imageInput.click();
  });
}

if (imageInput) {
  imageInput.addEventListener("change", function(e) {
    var file = e.target.files[0];
    if (!file || !file.type.startsWith("image/")) return;
    selectedImageFile = file;
    var reader = new FileReader();
    reader.onload = function(event) {
      if (previewImage) previewImage.src = event.target.result;
      if (imagePreviewModal) imagePreviewModal.style.display = "flex";
    };
    reader.readAsDataURL(file);
    imageInput.value = "";
  });
}

if (cancelPreview) cancelPreview.addEventListener("click", closePreviewModal);
if (previewOverlay) previewOverlay.addEventListener("click", closePreviewModal);
if (sendPreview) sendPreview.addEventListener("click", sendHelperImageMessage);

function closePreviewModal() {
  if (imagePreviewModal) imagePreviewModal.style.display = "none";
  if (previewImage) previewImage.src = "";
  selectedImageFile = null;
}

function openFullImage(src) { window.open(src, "_blank"); }

function scrollToBottom() {
  if (!messagesContainer) return;
  requestAnimationFrame(function() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });
}

// Resize handler
window.addEventListener("resize", function() {
  isMobile = window.innerWidth <= 768;
});
