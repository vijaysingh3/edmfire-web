// ============================================
// EDMFire World Chat - Room-Based System
// Daily rooms: worldChat/rooms/{timestamp}
// Meta: worldChat/meta/currentRoom
// Each message: { username, text, timestamp, uid, replyTo }
// ============================================

// Height fix for Android WebView — visualViewport se adjust karo
// ADJUST_RESIZE system se handle hota hai, sirf scroll fix chahiye
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", function() {
    // Keyboard open hone pe input field visible rahe
    if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) {
      setTimeout(function() {
        document.activeElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  });
}

// ============ ANDROID KEYBOARD CALLBACKS ============
// Yeh functions Android se call ho sakte hain, ab sirf scroll handle karte hain
window.onKeyboardOpen = function(keypadHeight) {
  console.log("[WC-KB] Keyboard opened");
  setTimeout(function() { scrollToBottom(); }, 150);
};

window.onKeyboardClose = function() {
  console.log("[WC-KB] Keyboard closed");
  setTimeout(function() { scrollToBottom(); }, 100);
};

// ============ STATE ============
var currentUser = null;
var verifiedUid = null;
var currentUsername = "";
var isAuthenticating = false;
var contextMsgKey = null;
var contextMsgText = null;
var contextMsgUid = null;
var lastDateStr = "";
var allMessagesData = {};
var activeRoomId = null;
var chatListenerRef = null;
var metaListenerRef = null;
var COOLDOWN_MS = 5000; // 5 second cooldown
var lastSendTime = 0;
var cooldownTimer = null;
var replyingTo = null; // { key, text, username }
var ROOM_CHECK_INTERVAL = 60000; // Check meta every 60 seconds
var roomCheckTimer = null;

// ============ DOM ============
var chatContainer = document.getElementById("chatContainer");
var msgInput = document.getElementById("msgInput");
var sendBtn = document.getElementById("sendBtn");
var bottomBar = document.getElementById("bottomBar");
var onlineStatus = document.getElementById("onlineStatus");
var onlineCount = document.getElementById("onlineCount");
var onlineCountText = document.getElementById("onlineCountText");
var authError = document.getElementById("authError");
var chatLoading = document.getElementById("chatLoading");
var contextMenu = document.getElementById("contextMenu");
var ctxCopy = document.getElementById("ctxCopy");
var ctxReply = document.getElementById("ctxReply");
var ctxDelete = document.getElementById("ctxDelete");
var replyBar = document.getElementById("replyBar");
var replyBarText = document.getElementById("replyBarText");
var replyBarClose = document.getElementById("replyBarClose");
var cooldownOverlay = document.getElementById("cooldownOverlay");
var cooldownText = document.getElementById("cooldownText");

console.log("[WC-INIT] World Chat script loaded (room-based)");

// ============ ROOM HELPERS ============

function getTodayStart() {
  return Math.floor(Date.now() / 86400000) * 86400000;
}

function getChatRef() {
  if (!activeRoomId) return null;
  return "worldChat/rooms/" + activeRoomId;
}

// ============ ANDROID WEBVIEW AUTH ============
window.receiveAuthToken = async function(idToken) {
  console.log("[WC-AUTH] receiveAuthToken called from Android");
  if (isAuthenticating || currentUser) return;
  isAuthenticating = true;
  setStatus("Authenticating...", "");

  try {
    var customToken = await exchangeIdTokenForCustomToken(idToken);
    if (customToken) {
      var result = await signInWithCustomToken(customToken);
      if (result && result.user) {
        currentUser = result.user;
        verifiedUid = result.user.uid;
        console.log("[WC-AUTH] Auth success, uid:", verifiedUid);
        setStatus("Online", "online");
        await fetchUsernameAndStartChat();
        return;
      }
    }
    console.error("[WC-AUTH] Custom token sign in failed");
    showAuthError();
  } catch (error) {
    console.error("[WC-AUTH] receiveAuthToken error:", error);
    showAuthError();
  } finally {
    isAuthenticating = false;
  }
};

// ============ ID TOKEN → CUSTOM TOKEN ============
async function exchangeIdTokenForCustomToken(idToken) {
  try {
    var response = await fetch("/api/custom-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: idToken })
    });
    var data = await response.json();
    if (data.customToken) return data.customToken;
    console.error("[WC-AUTH] Token exchange failed:", data.error);
    return null;
  } catch (error) {
    console.error("[WC-AUTH] Token exchange API error:", error);
    return null;
  }
}

// ============ AUTO INIT (fallback) ============
async function initApp() {
  console.log("[WC-INIT] initApp called");
  setStatus("Connecting...", "");

  onAuthChange(function(user) {
    if (user && !currentUser) {
      currentUser = user;
      verifiedUid = user.uid;
      console.log("[WC-INIT] onAuthChange: uid:", verifiedUid);
      setStatus("Online", "online");
      fetchUsernameAndStartChat();
    } else if (!currentUser) {
      setStatus("Waiting for auth...", "");
    }
  });
}

// ============ FETCH USERNAME & START ============
async function fetchUsernameAndStartChat() {
  if (!verifiedUid) return;

  try {
    var db = firebase.firestore();
    var userDoc = await db.collection("Users").doc(verifiedUid).get();
    if (userDoc.exists) {
      var data = userDoc.data();
      currentUsername = data.userName || data.username || data.name || ("User_" + verifiedUid.substring(0, 6));
    } else {
      currentUsername = "User_" + verifiedUid.substring(0, 6);
    }
    console.log("[WC-INIT] Username resolved:", currentUsername);
  } catch (error) {
    console.error("[WC-INIT] Firestore username fetch error:", error);
    currentUsername = "User_" + verifiedUid.substring(0, 6);
  }

  if (bottomBar) bottomBar.style.display = "flex";
  initRoomSystem();
}

// ============ ROOM SYSTEM ============

function initRoomSystem() {
  console.log("[WC-ROOM] Initializing room system...");

  // Listen to meta/currentRoom for active room changes
  metaListenerRef = firebase.database().ref("worldChat/meta/currentRoom");

  metaListenerRef.on("value", function(snapshot) {
    var roomId = snapshot.val();
    console.log("[WC-ROOM] Current room from meta:", roomId);

    if (roomId && String(roomId) !== String(activeRoomId)) {
      // Room changed — switch to new room
      activeRoomId = roomId;
      switchToRoom(roomId);
    } else if (!roomId) {
      // No room exists yet — show waiting state
      activeRoomId = null;
      showNoRoomState();
    }
  }, function(error) {
    console.error("[WC-ROOM] Meta listener error:", error);
    // Fallback: try using today's start
    var todayStart = getTodayStart();
    if (!activeRoomId) {
      activeRoomId = todayStart;
      switchToRoom(todayStart);
    }
  });

  // Periodic check: agar admin ne naya room banaya toh auto-switch
  roomCheckTimer = setInterval(function() {
    if (activeRoomId) {
      var todayStart = getTodayStart();
      // Agar aaj ka room nahi hai aur meta me update aaya toh switch ho jayega
      // Ye sirf backup hai
      console.log("[WC-ROOM] Periodic check - activeRoom:", activeRoomId, "todayStart:", todayStart);
    }
  }, ROOM_CHECK_INTERVAL);
}

function switchToRoom(roomId) {
  console.log("[WC-ROOM] Switching to room:", roomId);

  // Detach old listener
  if (chatListenerRef) {
    firebase.database().ref(chatListenerRef).off();
    chatListenerRef = null;
  }

  // Clear chat container
  if (chatContainer) {
    var msgs = chatContainer.querySelectorAll(".message, .date-separator, .chat-empty, .no-room-state");
    for (var i = 0; i < msgs.length; i++) msgs[i].remove();
  }

  allMessagesData = {};
  lastDateStr = "";

  // Show loading
  var loadingEl = document.getElementById("chatLoading");
  if (!loadingEl) {
    var loadDiv = document.createElement("div");
    loadDiv.className = "chat-loading";
    loadDiv.id = "chatLoading";
    loadDiv.innerHTML = '<div class="loading-spinner"></div><span>Loading chat...</span>';
    chatContainer.appendChild(loadDiv);
  }

  var chatRef = "worldChat/rooms/" + roomId;
  chatListenerRef = chatRef;

  // Attach new listener
  var ref = firebase.database().ref(chatRef).orderByChild("timestamp").limitToLast(200);

  ref.on("value", function(snapshot) {
    var data = snapshot.val();
    allMessagesData = data || {};
    renderChat(data);
  }, function(error) {
    console.error("[WC-CHAT] RTDB listener error:", error);
    // Agar permission error ya room not found, show message
    if (chatContainer) {
      var loadEl = document.getElementById("chatLoading");
      if (loadEl) loadEl.remove();
      chatContainer.innerHTML += '<div class="chat-empty"><h3>Room not available</h3><p>Waiting for admin to create a room...</p></div>';
    }
  });

  // Update status
  var dateStr = new Date(parseInt(roomId));
  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  setStatus("Room: " + dateStr.getDate() + " " + months[dateStr.getMonth()] + " " + dateStr.getFullYear(), "online");
}

function showNoRoomState() {
  if (chatContainer) {
    var msgs = chatContainer.querySelectorAll(".message, .date-separator, .chat-empty, .no-room-state");
    for (var i = 0; i < msgs.length; i++) msgs[i].remove();

    var loadEl = document.getElementById("chatLoading");
    if (loadEl) loadEl.remove();

    chatContainer.innerHTML += '<div class="chat-empty no-room-state"><h3>No chat room active</h3><p>Waiting for admin to create a room...</p></div>';
  }
  setStatus("Waiting for room", "");
}

// ============ RENDER CHAT ============
function renderChat(data) {
  if (!chatContainer) return;

  var loadingEl = document.getElementById("chatLoading");
  if (loadingEl) loadingEl.remove();

  var msgs = chatContainer.querySelectorAll(".message, .date-separator, .chat-empty, .no-room-state");
  for (var i = 0; i < msgs.length; i++) msgs[i].remove();

  if (!data) {
    chatContainer.innerHTML += '<div class="chat-empty"><h3>No messages yet</h3><p>Be the first to say hello!</p></div>';
    return;
  }

  var keys = Object.keys(data).sort(function(a, b) {
    return (data[a].timestamp || 0) - (data[b].timestamp || 0);
  });

  lastDateStr = "";

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var msg = data[key];
    appendMessage(key, msg);
  }

  scrollToBottom();
}

// ============ APPEND MESSAGE ============
function appendMessage(msgKey, msg) {
  if (!chatContainer) return;

  // Date separator
  var dateStr = formatDateSeparator(msg.timestamp);
  if (dateStr !== lastDateStr) {
    lastDateStr = dateStr;
    var dateDiv = document.createElement("div");
    dateDiv.className = "date-separator";
    dateDiv.innerHTML = "<span>" + escapeHtml(dateStr) + "</span>";
    chatContainer.appendChild(dateDiv);
  }

  var isOwn = msg.uid === verifiedUid;
  var div = document.createElement("div");
  div.className = "message " + (isOwn ? "own" : "other");
  div.setAttribute("data-key", msgKey);
  div.setAttribute("data-uid", msg.uid || "");

  var content = "";

  // Reply preview (agar reply hai)
  if (msg.replyTo) {
    content += '<div class="msg-reply-preview">' + escapeHtml(msg.replyTo) + '</div>';
  }

  // Username
  if (isOwn) {
    content += '<div class="msg-username">You</div>';
  } else {
    content += '<div class="msg-username">' + escapeHtml(msg.username || "Unknown") + '</div>';
  }

  // Message text
  if (msg.text) {
    content += '<div class="msg-text">' + escapeHtml(msg.text) + '</div>';
  }

  // Timestamp
  content += '<div class="msg-time">' + formatTime(msg.timestamp) + '</div>';

  div.innerHTML = content;
  chatContainer.appendChild(div);

  // Click — context menu show karo (Delete, Copy, Reply)
  div.addEventListener("click", function(e) {
    e.preventDefault();
    showContextMenu(e, msgKey, msg.text, msg.uid, msg.username);
  });

  // Long press bhi kaam kare
  var pressTimer = null;
  div.addEventListener("contextmenu", function(e) {
    e.preventDefault();
    showContextMenu(e, msgKey, msg.text, msg.uid, msg.username);
  });
  div.addEventListener("touchstart", function() {
    pressTimer = setTimeout(function() {
      showContextMenu({ clientX: 50, clientY: 100 }, msgKey, msg.text, msg.uid, msg.username);
    }, 500);
  }, { passive: true });
  div.addEventListener("touchend", function() { clearTimeout(pressTimer); });
  div.addEventListener("touchmove", function() { clearTimeout(pressTimer); });
}

// ============ SEND MESSAGE ============
async function sendTextMessage() {
  var text = msgInput.value.trim();
  console.log("[WC-SEND] sendTextMessage, text:", text);

  if (!text) return;
  if (!verifiedUid) {
    console.log("[WC-SEND] No verifiedUid, returning");
    return;
  }

  // No active room
  var chatRef = getChatRef();
  if (!chatRef) {
    console.log("[WC-SEND] No active room, returning");
    return;
  }

  // 500 character limit
  if (text.length > 500) {
    console.log("[WC-SEND] Text exceeds 500 characters");
    return;
  }

  // Cooldown check
  var now = Date.now();
  var timeSinceLastSend = now - lastSendTime;
  if (timeSinceLastSend < COOLDOWN_MS) {
    startCooldown(COOLDOWN_MS - timeSinceLastSend);
    return;
  }

  // Build message object
  var newMsg = {
    uid: verifiedUid,
    username: currentUsername,
    text: text,
    timestamp: Date.now()
  };

  // Reply add karo agar hai
  if (replyingTo) {
    var replyPreview = replyingTo.username + ": " + (replyingTo.text || "").substring(0, 60);
    newMsg.replyTo = replyPreview;
    cancelReply();
  }

  msgInput.value = "";
  autoResizeInput();
  if (sendBtn) sendBtn.disabled = true;
  lastSendTime = Date.now();

  try {
    var ref = firebase.database().ref(chatRef);
    await new Promise(function(resolve) {
      ref.push(newMsg, function(error) {
        if (error) {
          console.error("[WC-SEND] Send error:", error);
          resolve(false);
        } else {
          console.log("[WC-SEND] Message sent to room:", activeRoomId);
          resolve(true);
        }
      });
    });
  } catch (error) {
    console.error("[WC-SEND] sendTextMessage error:", error);
  }

  // Cooldown start karo
  startCooldown(COOLDOWN_MS);

  if (sendBtn) sendBtn.disabled = false;
}

// ============ COOLDOWN SYSTEM ============
function startCooldown(remainingMs) {
  if (cooldownTimer) clearInterval(cooldownTimer);
  if (sendBtn) sendBtn.disabled = true;
  if (cooldownOverlay) cooldownOverlay.style.display = "block";

  var remaining = Math.ceil(remainingMs / 1000);
  if (cooldownText) cooldownText.textContent = remaining + "s";

  cooldownTimer = setInterval(function() {
    remaining--;
    if (remaining <= 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
      if (cooldownOverlay) cooldownOverlay.style.display = "none";
      if (sendBtn) sendBtn.disabled = false;
    } else {
      if (cooldownText) cooldownText.textContent = remaining + "s";
    }
  }, 1000);
}

// ============ CONTEXT MENU ============
function showContextMenu(e, msgKey, text, uid, username) {
  contextMsgKey = msgKey;
  contextMsgText = text;
  contextMsgUid = uid || "";

  // Delete option — sirf apne messages ke liye
  if (ctxDelete) {
    if (contextMsgUid === verifiedUid) {
      ctxDelete.style.display = "flex";
    } else {
      ctxDelete.style.display = "none";
    }
  }

  if (contextMenu) {
    contextMenu.style.display = "block";
    var x = e.clientX || 50;
    var y = e.clientY || 50;
    if (x + 170 > window.innerWidth) x = window.innerWidth - 180;
    // Delete visible hai ya nahi — height accordingly
    var menuHeight = (contextMsgUid === verifiedUid) ? 140 : 90;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;
    contextMenu.style.left = x + "px";
    contextMenu.style.top = y + "px";
  }
}

function hideContextMenu() {
  if (contextMenu) contextMenu.style.display = "none";
  contextMsgKey = null;
  contextMsgText = null;
  contextMsgUid = null;
}

// Copy
if (ctxCopy) {
  ctxCopy.addEventListener("click", function() {
    if (!contextMsgText) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(contextMsgText);
    } else {
      var ta = document.createElement("textarea");
      ta.value = contextMsgText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    hideContextMenu();
  });
}

// Reply
if (ctxReply) {
  ctxReply.addEventListener("click", function() {
    if (!contextMsgText) return;
    var replyUsername = "Unknown";
    // Username find karo messages data se
    if (allMessagesData[contextMsgKey]) {
      replyUsername = allMessagesData[contextMsgKey].username || "Unknown";
    }
    setReplyingTo(contextMsgKey, contextMsgText, replyUsername);
    hideContextMenu();
    if (msgInput) msgInput.focus();
  });
}

// Delete — sirf apne messages
if (ctxDelete) {
  ctxDelete.addEventListener("click", function() {
    if (!contextMsgKey) return;
    if (contextMsgUid !== verifiedUid) {
      hideContextMenu();
      return;
    }
    // RTDB se delete karo — current room me se
    var chatRef = getChatRef();
    if (!chatRef) {
      hideContextMenu();
      return;
    }
    firebase.database().ref(chatRef + "/" + contextMsgKey).remove(function(error) {
      if (error) {
        console.error("[WC-DEL] Delete error:", error);
      } else {
        console.log("[WC-DEL] Message deleted:", contextMsgKey);
      }
    });
    hideContextMenu();
  });
}

document.addEventListener("click", function(e) {
  if (contextMenu && !contextMenu.contains(e.target)) hideContextMenu();
});

// ============ REPLY SYSTEM ============
function setReplyingTo(key, text, username) {
  replyingTo = { key: key, text: text, username: username };
  if (replyBar && replyBarText) {
    replyBarText.textContent = username + ": " + (text || "").substring(0, 50) + ((text || "").length > 50 ? "..." : "");
    replyBar.style.display = "block";
  }
}

function cancelReply() {
  replyingTo = null;
  if (replyBar) replyBar.style.display = "none";
}

if (replyBarClose) {
  replyBarClose.addEventListener("click", function() {
    cancelReply();
  });
}

// ============ TEXTAREA AUTO-RESIZE ============
function autoResizeInput() {
  if (!msgInput) return;
  msgInput.style.height = "auto";
  var newHeight = Math.min(msgInput.scrollHeight, 100);
  msgInput.style.height = newHeight + "px";
}

// ============ SEND EVENTS ============
if (sendBtn) {
  sendBtn.addEventListener("click", sendTextMessage);
}
if (msgInput) {
  // Auto-resize on input
  msgInput.addEventListener("input", function() {
    autoResizeInput();
    // 500 char limit enforce
    if (msgInput.value.length > 500) {
      msgInput.value = msgInput.value.substring(0, 500);
    }
  });

  // Enter = send, Shift+Enter = new line
  msgInput.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage();
    }
  });

  // Keyboard open hone pe scroll fix
  msgInput.addEventListener("focus", function() {
    setTimeout(function() {
      scrollToBottom();
    }, 300);
  });
}

// ============ HELPERS ============
function scrollToBottom() {
  if (!chatContainer) return;
  requestAnimationFrame(function() { chatContainer.scrollTop = chatContainer.scrollHeight; });
}

function setStatus(text, type) {
  if (!onlineStatus) return;
  onlineStatus.textContent = text;
  onlineStatus.className = "header-status";
  if (type === "online") onlineStatus.classList.add("online");
  else if (type === "error") onlineStatus.classList.add("error");
}

function showAuthError() {
  setStatus("Auth failed", "error");
  if (authError) authError.style.display = "flex";
}

function formatTime(timestamp) {
  if (!timestamp) return "";
  var d = new Date(timestamp);
  var h = d.getHours();
  var m = d.getMinutes();
  var ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  m = m < 10 ? "0" + m : m;
  return h + ":" + m + " " + ampm;
}

function formatDateSeparator(timestamp) {
  if (!timestamp) return "";
  var d = new Date(timestamp);
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var diff = today - msgDate;
  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  if (diff === 0) return "Today";
  if (diff === 86400000) return "Yesterday";
  return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
}

function escapeHtml(text) {
  if (!text) return "";
  var d = document.createElement("div");
  d.appendChild(document.createTextNode(text));
  return d.innerHTML;
}

// ============ INIT ============
initApp();
