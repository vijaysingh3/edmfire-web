// ============================================
// EDMFire Admin - Support Chats Logic (Improved)
// - Better username fallbacks (Firestore UserName → RTDB username → UID prefix)
// - Sort by last message timestamp (most recent at top)
// - Show last message preview + time ago in conversation bar
// - Stable rendering (no auto-switch on high traffic)
// - Debounced user list updates
// ============================================

var selectedUserUid = null;
var selectedImageFile = null;
var usersData = {};
var replyingTo = null;
var contextMsgKey = null;
var contextMsgData = null;
var allMessagesData = {};
var isMobile = window.innerWidth <= 768;

// Firestore UserName cache: uid -> UserName
var firestoreUserNames = {};

// Last message cache: uid -> { text, timestamp, sender }
var lastMessageCache = {};

// Track if admin manually selected a user — we never auto-switch
var userManuallySelected = false;

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

function toggleChatSidebar() {
  if (!chatSidebar) return;
  if (isMobile) {
    hideMobileChatSidebar();
  } else {
    chatSidebar.classList.toggle("collapsed");
    localStorage.setItem("edmfireChatSidebarCollapsed", chatSidebar.classList.contains("collapsed"));
  }
}

function showMobileChatSidebar() {
  if (!chatSidebar) return;
  chatSidebar.classList.remove("mobile-hidden");
  if (chatSidebarOverlay) chatSidebarOverlay.classList.add("active");
}

function hideMobileChatSidebar() {
  if (!chatSidebar) return;
  chatSidebar.classList.add("mobile-hidden");
  if (chatSidebarOverlay) chatSidebarOverlay.classList.remove("active");
}

function initChatSidebarState() {
  if (!chatSidebar) return;
  isMobile = window.innerWidth <= 768;

  if (isMobile) {
    chatSidebar.classList.remove("collapsed");
    if (!selectedUserUid) {
      chatSidebar.classList.remove("mobile-hidden");
    } else {
      chatSidebar.classList.add("mobile-hidden");
    }
    if (chatSidebarOverlay) chatSidebarOverlay.classList.remove("active");
  } else {
    chatSidebar.classList.remove("mobile-hidden");
    if (chatSidebarOverlay) chatSidebarOverlay.classList.remove("active");
    if (localStorage.getItem("edmfireChatSidebarCollapsed") === "true") {
      chatSidebar.classList.add("collapsed");
    } else {
      chatSidebar.classList.remove("collapsed");
    }
  }
}

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

if (chatSidebarOverlay) {
  chatSidebarOverlay.addEventListener("click", function() {
    hideMobileChatSidebar();
  });
}

// ========== RESIZE ==========
var chatPrevWidth = window.innerWidth;

window.addEventListener("resize", function() {
  var currentWidth = window.innerWidth;
  var wasMobile = isMobile;
  isMobile = currentWidth <= 768;

  if (wasMobile !== isMobile) {
    initChatSidebarState();
  }

  chatPrevWidth = currentWidth;
});

// ========== FIRESTORE USERNAME ENRICHMENT ==========
// Fetch UserName from Firestore Users/{uid} for each RTDB helpCenter user
function enrichUserNamesFromFirestore(uids) {
  if (!firebase.firestore || !uids || uids.length === 0) return;

  var db = firebase.firestore();
  var promises = [];

  for (var i = 0; i < uids.length; i++) {
    (function(uid) {
      // Skip if already cached
      if (firestoreUserNames[uid] !== undefined) return;

      promises.push(
        db.collection("Users").doc(uid).get().then(function(doc) {
          if (doc.exists) {
            var d = doc.data();
            // Try multiple field name variants for UserName
            var userName = d.UserName || d.username || d.name || d.displayName || d.Name;
            if (userName) {
              firestoreUserNames[uid] = userName;
              // Also cache email and inGameUID for tooltip
              if (d.email) firestoreUserNames[uid + "__email"] = d.email;
              if (d.InGameUID || d.inGameUID) {
                firestoreUserNames[uid + "__inGameUID"] = d.InGameUID || d.inGameUID;
              }
            } else {
              firestoreUserNames[uid] = null;
            }
          } else {
            firestoreUserNames[uid] = null;
          }
        }).catch(function(err) {
          console.warn("[CHAT] Firestore UserName fetch error for", uid, err.message);
          firestoreUserNames[uid] = null;
        })
      );
    })(uids[i]);
  }

  if (promises.length > 0) {
    Promise.all(promises).then(function() {
      renderUserList(usersData);
      if (selectedUserUid && firestoreUserNames[selectedUserUid]) {
        chatHeaderName.textContent = firestoreUserNames[selectedUserUid];
      }
    });
  }
}

// Get the best display name for a user — with much better fallbacks
function getDisplayName(uid, rtdbUser) {
  // 1. Firestore UserName (best)
  if (firestoreUserNames[uid]) {
    return firestoreUserNames[uid];
  }
  // 2. RTDB username (only if not "Unknown" and not "User_XXX" pattern)
  if (rtdbUser && rtdbUser.username && rtdbUser.username !== "Unknown" && rtdbUser.username.indexOf("User_") !== 0) {
    return rtdbUser.username;
  }
  // 3. RTDB userId
  if (rtdbUser && rtdbUser.userId && rtdbUser.userId !== uid) {
    return rtdbUser.userId;
  }
  // 4. Fallback: "User <first 8 chars of UID>" — much better than "Unknown"
  if (uid && uid.length > 0) {
    return "User " + uid.substring(0, 8);
  }
  return "Unknown";
}

// Get user email for tooltip/info
function getUserEmail(uid) {
  return firestoreUserNames[uid + "__email"] || "";
}

// Get user InGameUID for tooltip
function getUserInGameUID(uid) {
  var v = firestoreUserNames[uid + "__inGameUID"];
  return v ? String(v) : "";
}

// ========== FETCH LAST MESSAGE FOR EACH USER ==========
// Fetches the last message for a user from helpCenter/chats/{uid}
// Uses limitToLast(1) for efficiency
function fetchLastMessagesForUsers(uids) {
  if (!uids || uids.length === 0) return Promise.resolve();

  var rtdb = firebase.database();
  var promises = [];

  for (var i = 0; i < uids.length; i++) {
    (function(uid) {
      promises.push(
        rtdb.ref("helpCenter/chats/" + uid).limitToLast(1).once("value").then(function(snapshot) {
          if (snapshot.exists()) {
            snapshot.forEach(function(child) {
              var msg = child.val();
              lastMessageCache[uid] = {
                text: msg.text || (msg.imageUrl ? "📷 Image" : ""),
                timestamp: msg.timestamp || 0,
                sender: msg.sender || "user"
              };
            });
          } else {
            // No messages — set timestamp to 0 so it goes to bottom
            if (!lastMessageCache[uid]) {
              lastMessageCache[uid] = { text: "", timestamp: 0, sender: "user" };
            }
          }
        }).catch(function(err) {
          console.warn("[CHAT] Last message fetch error for", uid, err.message);
        })
      );
    })(uids[i]);
  }

  return Promise.all(promises).then(function() {
    renderUserList(usersData);
  });
}

// ========== TIME AGO FORMATTER ==========
function formatTimeAgo(timestamp) {
  if (!timestamp || timestamp === 0) return "";

  var now = Date.now();
  var diff = now - timestamp;
  var seconds = Math.floor(diff / 1000);
  var minutes = Math.floor(seconds / 60);
  var hours = Math.floor(minutes / 60);
  var days = Math.floor(hours / 24);

  if (seconds < 60) return "now";
  if (minutes < 60) return minutes + "m";
  if (hours < 24) return hours + "h";
  if (days < 7) return days + "d";

  // For older, show date
  var d = new Date(timestamp);
  return d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
}

// ========== LOAD USERS ==========
// Debounce user list rendering to avoid flicker during high traffic
var userRenderTimer = null;
function debouncedRenderUserList() {
  if (userRenderTimer) clearTimeout(userRenderTimer);
  userRenderTimer = setTimeout(function() {
    renderUserList(usersData);
  }, 150);
}

function loadUsersList() {
  loadUsers(function(data) {
    usersData = data || {};
    console.log("[CHAT] Users data updated. Total users:", Object.keys(usersData).length);

    // CRITICAL: Do NOT change selectedUserUid here.
    // Only re-render the list. The selected chat stays as-is.
    renderUserList(usersData);

    // Enrich with Firestore UserNames (only for UIDs not yet cached)
    var uids = Object.keys(usersData);
    var uncachedUids = uids.filter(function(uid) {
      return firestoreUserNames[uid] === undefined;
    });
    if (uncachedUids.length > 0) {
      enrichUserNamesFromFirestore(uncachedUids);
    }

    // Fetch last messages for users we don't have cached yet
    var uncachedLastMsgUids = uids.filter(function(uid) {
      return lastMessageCache[uid] === undefined;
    });
    if (uncachedLastMsgUids.length > 0) {
      fetchLastMessagesForUsers(uncachedLastMsgUids);
    } else {
      // All cached — just re-render with proper sort
      renderUserList(usersData);
    }
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

  // Sort by last message timestamp DESCENDING (most recent at top)
  // Users with no messages go to the bottom
  var sorted = uids.sort(function(a, b) {
    var tsA = lastMessageCache[a] ? (lastMessageCache[a].timestamp || 0) : 0;
    var tsB = lastMessageCache[b] ? (lastMessageCache[b].timestamp || 0) : 0;
    return tsB - tsA;
  });

  for (var i = 0; i < sorted.length; i++) {
    (function(uid) {
      var user = data[uid];
      var displayName = getDisplayName(uid, user);
      var initial = displayName.charAt(0).toUpperCase();
      var unread = user.unreadMsg || 0;

      // Get last message info
      var lastMsg = lastMessageCache[uid];
      var lastMsgText = lastMsg && lastMsg.text ? lastMsg.text : (unread > 0 ? unread + " new message(s)" : "No messages yet");
      var lastMsgTime = lastMsg && lastMsg.timestamp ? formatTimeAgo(lastMsg.timestamp) : "";

      // Prefix last message with sender indicator
      var lastMsgDisplay = lastMsgText;
      if (lastMsg && lastMsg.sender === "admin") {
        lastMsgDisplay = "You: " + lastMsgText;
      }

      // Build tooltip with email and inGameUID if available
      var email = getUserEmail(uid);
      var inGameUID = getUserInGameUID(uid);
      var tooltipParts = ["UID: " + uid];
      if (email) tooltipParts.push("Email: " + email);
      if (inGameUID) tooltipParts.push("InGameUID: " + inGameUID);
      var tooltip = tooltipParts.join(" | ");

      var div = document.createElement("div");
      div.className = "user-item" + (uid === selectedUserUid ? " active" : "");
      div.setAttribute("data-uid", uid);
      div.setAttribute("title", tooltip);

      div.innerHTML =
        '<div class="user-item-content">' +
          '<div class="user-avatar">' + escapeHtml(initial) + '</div>' +
          '<div class="user-info">' +
            '<div class="user-name">' + escapeHtml(displayName) + '</div>' +
            '<div class="last-msg">' +
              '<span class="last-msg-text">' + escapeHtml(lastMsgDisplay) + '</span>' +
              (lastMsgTime ? '<span class="last-msg-time">' + escapeHtml(lastMsgTime) + '</span>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        (unread > 0 ? '<div class="badge">' + unread + '</div>' : '');

      div.addEventListener("click", function() { selectUser(uid, user); });
      userList.appendChild(div);
    })(sorted[i]);
  }
}

function selectUser(uid, userData) {
  console.log("[CHAT] Admin manually selected user:", uid);
  selectedUserUid = uid;
  userManuallySelected = true;

  var displayName = getDisplayName(uid, userData);
  chatHeaderName.textContent = displayName;

  // Build status line with email + inGameUID if available
  var email = getUserEmail(uid);
  var inGameUID = getUserInGameUID(uid);
  var statusParts = [];
  if (inGameUID) statusParts.push("GameUID: " + inGameUID);
  if (email) statusParts.push(email);
  if (statusParts.length === 0) statusParts.push(uid);

  chatHeaderStatus.innerHTML = '<span class="chat-uid-text" title="Click to copy UID" onclick="copyUserId(\'' + escapeHtml(uid) + '\')">' + escapeHtml(statusParts.join(" | ")) + '</span> <button class="chat-uid-copy-btn" onclick="copyUserId(\'' + escapeHtml(uid) + '\')" title="Copy User ID"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>';
  chatInputBar.style.display = "flex";

  // Update active state
  var items = document.querySelectorAll(".user-item");
  for (var i = 0; i < items.length; i++) {
    items[i].classList.remove("active");
    if (items[i].getAttribute("data-uid") === uid) items[i].classList.add("active");
  }

  if (isMobile) {
    hideMobileChatSidebar();
  }

  resetUnread(uid);
  markMessagesAsSeen(uid, "admin");
  loadSelectedUserChat(uid);
}

// ========== COPY USER ID ==========
function copyUserId(uid) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(uid).then(function() {
      showChatToast("User ID copied!");
    }).catch(function() {
      fallbackCopy(uid);
    });
  } else {
    fallbackCopy(uid);
  }
}

function fallbackCopy(text) {
  var ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    showChatToast("User ID copied!");
  } catch (e) {
    showChatToast("Copy failed");
  }
  document.body.removeChild(ta);
}

function showChatToast(message) {
  var existing = document.getElementById("chatToast");
  if (existing) existing.remove();

  var toast = document.createElement("div");
  toast.id = "chatToast";
  toast.className = "chat-toast-notification";
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(function() {
    toast.classList.add("chat-toast-fade");
    setTimeout(function() { if (toast.parentNode) toast.remove(); }, 400);
  }, 2000);
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

      // Update last message cache for this user
      if (keys.length > 0) {
        var lastKey = keys[keys.length - 1];
        var lastMsg = data[lastKey];
        lastMessageCache[uid] = {
          text: lastMsg.text || (lastMsg.imageUrl ? "📷 Image" : ""),
          timestamp: lastMsg.timestamp || 0,
          sender: lastMsg.sender || "user"
        };
        renderUserList(usersData);
      }
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

async function sendTextMessage() {
  var text = msgInput.value.trim();
  if (!text || !selectedUserUid) return;
  msgInput.value = "";
  var replyRef = replyingTo; replyingTo = null; replyBar.style.display = "none";
  await sendMessage(selectedUserUid, "admin", text, "", replyRef);
  sendPushNotification(selectedUserUid, text);

  // Update last message cache immediately
  lastMessageCache[selectedUserUid] = {
    text: text,
    timestamp: Date.now(),
    sender: "admin"
  };
  renderUserList(usersData);
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

      lastMessageCache[selectedUserUid] = {
        text: "📷 Image",
        timestamp: Date.now(),
        sender: "admin"
      };
      renderUserList(usersData);
    } else { uploadingDiv.remove(); showErrorBubble(); }
  } catch (error) { uploadingDiv.remove(); showErrorBubble(); }
}

function showErrorBubble() {
  var div = document.createElement("div"); div.className = "message admin";
  div.innerHTML = '<div class="msg-text" style="color:#f87171;">❌ Image failed</div>';
  messagesContainer.appendChild(div); scrollToBottom();
}

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
  for (var i = 0; i < keys.length; i++) {
    var uid = keys[i];
    var displayName = getDisplayName(uid, usersData[uid]);
    var email = getUserEmail(uid);
    var inGameUID = getUserInGameUID(uid);
    if (displayName.toLowerCase().indexOf(q) !== -1 ||
        uid.toLowerCase().indexOf(q) !== -1 ||
        (email && email.toLowerCase().indexOf(q) !== -1) ||
        (inGameUID && inGameUID.toLowerCase().indexOf(q) !== -1)) {
      filtered[uid] = usersData[uid];
    }
  }
  renderUserList(filtered);
});

function scrollToBottom() {
  if (messagesContainer) requestAnimationFrame(function() { messagesContainer.scrollTop = messagesContainer.scrollHeight; });
}

// ========== INIT ==========
initAuthGuard(function(user) {
  loadUsersList();
});
initCommonUI();
initChatSidebarState();
