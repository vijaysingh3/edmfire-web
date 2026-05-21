// User Chat Page Logic — FAST LOADING VERSION
// Caching system: messages localStorage me cache hote hain
// Auth optimization: agar already logged in toh re-auth nahi karta
// Service Worker: static assets cache for instant page load

// Height fix: 100vh Android WebView me navigation bar include karta hai
// isliye CSS me ab height: 100% use kar rahe hai
// Kotlin me WebView ko navBarHeight ke barabar bottom padding diya hai
// isse body ka 100% = actual visible screen height (nav bar excluded)
// ye setAppHeight() sirf EMERGENCY fallback hai
function setAppHeight() {
  var viewH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  var bodyH = document.body.scrollHeight;
  if (bodyH > viewH + 10) {
    document.body.style.height = viewH + "px";
  }
}
setAppHeight();
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", setAppHeight);
} else {
  window.addEventListener("resize", setAppHeight);
}

var currentUser = null;
var verifiedUid = null;
var selectedImageFile = null;
var isAuthenticating = false;
var replyingTo = null;
var contextMsgKey = null;
var contextMsgData = null;
var allMessagesData = {};
var pendingFcmToken = null;

// ============ CACHE SYSTEM ============
// Messages ko localStorage me cache karte hain — instant UI render
var CACHE_KEY_MSGS = "uc_cache_msgs_";
var CACHE_KEY_UID = "uc_cache_uid";
var CACHE_KEY_TIME = "uc_cache_time";
var CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours cache valid

function saveMessagesToCache(uid, data) {
  try {
    if (!uid || !data) return;
    localStorage.setItem(CACHE_KEY_UID, uid);
    localStorage.setItem(CACHE_KEY_MSGS + uid, JSON.stringify(data));
    localStorage.setItem(CACHE_KEY_TIME, String(Date.now()));
  } catch(e) { console.warn("Cache save error:", e); }
}

function loadMessagesFromCache(uid) {
  try {
    if (!uid) return null;
    var cachedUid = localStorage.getItem(CACHE_KEY_UID);
    if (cachedUid !== uid) return null;
    var cacheTime = parseInt(localStorage.getItem(CACHE_KEY_TIME) || "0");
    if (Date.now() - cacheTime > CACHE_DURATION) return null;
    var cached = localStorage.getItem(CACHE_KEY_MSGS + uid);
    if (cached) return JSON.parse(cached);
  } catch(e) { console.warn("Cache load error:", e); }
  return null;
}

// ============ INSTANT UI FROM CACHE ============
// Page load hote hi cached messages render karo — Firebase se wait nahi karna
function renderCachedMessages() {
  var cachedUid = localStorage.getItem(CACHE_KEY_UID);
  if (!cachedUid) return false;
  var cachedData = loadMessagesFromCache(cachedUid);
  if (!cachedData) return false;

  // Cached messages se UI turant banao
  verifiedUid = cachedUid;
  allMessagesData = cachedData;
  clearChat();
  var keys = Object.keys(cachedData).sort(function(a, b) {
    return (cachedData[a].timestamp || 0) - (cachedData[b].timestamp || 0);
  });
  for (var i = 0; i < keys.length; i++) {
    appendMessage(keys[i], cachedData[keys[i]]);
  }
  scrollToBottom();
  if (onlineStatus) { onlineStatus.textContent = "Connecting..."; onlineStatus.style.color = "#fcd34d"; }
  console.log("[UC-CACHE] Rendered cached messages for:", cachedUid);
  return true;
}

// DOM elements
var chatContainer = document.getElementById("chatContainer");
var msgInput = document.getElementById("msgInput");
var sendBtn = document.getElementById("sendBtn");
var imgBtn = document.getElementById("imgBtn");
var imageInput = document.getElementById("imageInput");
var onlineStatus = document.getElementById("onlineStatus");
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
var ctxReply = document.getElementById("ctxReply");
var ctxCopy = document.getElementById("ctxCopy");
var ctxDelete = document.getElementById("ctxDelete");

// ============ INSTANT CACHE RENDER ============
// Page load pe turant cached messages dikha do
var hasCachedRender = renderCachedMessages();

// Android WebView se auth token receive karna
// OPTIMIZATION: Agar Firebase already authenticated hai toh re-auth skip karo
window.receiveAuthToken = async function(idToken) {
  if (isAuthenticating) return;

  // Check: Kya Firebase pe already same user logged in hai?
  var existingUser = firebase.auth().currentUser;
  if (existingUser && !currentUser) {
    console.log("[UC-AUTH] Already authenticated as:", existingUser.uid, "— skipping re-auth");
    currentUser = existingUser;
    verifiedUid = existingUser.uid;
    if (onlineStatus) { onlineStatus.textContent = "Online"; onlineStatus.style.color = "#86efac"; }
    showLoading(false);
    await ensureUserRegistered();
    loadUserChat();
    resetUnread(verifiedUid);
    markMessagesAsSeen(verifiedUid, "user");
    if (pendingFcmToken) {
      saveFcmToken(verifiedUid, pendingFcmToken);
      pendingFcmToken = null;
    }
    return;
  }

  if (currentUser) return; // already done
  isAuthenticating = true;
  if (onlineStatus) { onlineStatus.textContent = "Authenticating..."; onlineStatus.style.color = "#fcd34d"; }

  try {
    var customToken = await exchangeIdTokenForCustomToken(idToken);
    if (customToken) {
      var result = await signInWithCustomToken(customToken);
      if (result && result.user) {
        currentUser = result.user;
        verifiedUid = result.user.uid;
        console.log("[UC-AUTH] Auth success, uid:", verifiedUid);
        if (onlineStatus) { onlineStatus.textContent = "Online"; onlineStatus.style.color = "#86efac"; }
        await ensureUserRegistered();
        loadUserChat();
        resetUnread(verifiedUid);
        markMessagesAsSeen(verifiedUid, "user");
        if (pendingFcmToken) {
          saveFcmToken(verifiedUid, pendingFcmToken);
          pendingFcmToken = null;
        }
        return;
      }
    }
    console.error("[UC-AUTH] Custom token sign in failed");
    if (onlineStatus) { onlineStatus.textContent = "Auth failed"; onlineStatus.style.color = "#fca5a5"; }
  } catch (error) {
    console.error("[UC-AUTH] receiveAuthToken error:", error);
    if (onlineStatus) { onlineStatus.textContent = "Auth error"; onlineStatus.style.color = "#fca5a5"; }
  } finally {
    isAuthenticating = false;
    showLoading(false);
  }
};

// Android se FCM token receive karna
window.receiveFcmToken = function(token) {
  if (!token) return;
  console.log("[UC-FCM] Token received:", token.substring(0, 20) + "...");
  if (verifiedUid) {
    saveFcmToken(verifiedUid, token);
  } else {
    pendingFcmToken = token;
  }
};

// ID token ko custom token me exchange karna
async function exchangeIdTokenForCustomToken(idToken) {
  try {
    var response = await fetch("/api/custom-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: idToken })
    });
    var data = await response.json();
    if (data.customToken) return data.customToken;
    console.error("[UC-AUTH] Token exchange failed:", data.error);
    return null;
  } catch (error) {
    console.error("[UC-AUTH] Token exchange API error:", error);
    return null;
  }
}

// app initialize karna — OPTIMIZED: check existing auth first
async function initApp() {
  // Agar cache se already render ho chuka hai toh loading mat dikhao
  if (!hasCachedRender) {
    showLoading(true);
  }
  if (onlineStatus) { onlineStatus.textContent = "Connecting..."; onlineStatus.style.color = "#fcd34d"; }

  // Check: Kya Firebase already authenticated hai?
  // Ye fast check hai — network call nahi karta
  var existingUser = firebase.auth().currentUser;
  if (existingUser && !currentUser) {
    console.log("[UC-INIT] Firebase already has user:", existingUser.uid);
    currentUser = existingUser;
    verifiedUid = existingUser.uid;
    if (onlineStatus) { onlineStatus.textContent = "Online"; onlineStatus.style.color = "#86efac"; }
    showLoading(false);
    await ensureUserRegistered();
    loadUserChat();
    resetUnread(verifiedUid);
    markMessagesAsSeen(verifiedUid, "user");
    if (pendingFcmToken) {
      saveFcmToken(verifiedUid, pendingFcmToken);
      pendingFcmToken = null;
    }
    return;
  }

  onAuthChange(function(user) {
    if (user && !currentUser) {
      currentUser = user;
      verifiedUid = user.uid;
      console.log("[UC-INIT] onAuthChange: uid:", verifiedUid);
      if (onlineStatus) { onlineStatus.textContent = "Online"; onlineStatus.style.color = "#86efac"; }
      ensureUserRegistered().then(function() {
        loadUserChat();
        resetUnread(verifiedUid);
        markMessagesAsSeen(verifiedUid, "user");
        if (pendingFcmToken) {
          saveFcmToken(verifiedUid, pendingFcmToken);
          pendingFcmToken = null;
        }
      });
      showLoading(false);
    } else if (!currentUser) {
      if (onlineStatus) { onlineStatus.textContent = "Waiting for auth..."; onlineStatus.style.color = "#fcd34d"; }
      showLoading(false);
    }
  });
}

// user register check karna
async function ensureUserRegistered() {
  if (!verifiedUid) return;
  try {
    var data = await loadUsersOnce();
    if (!data || !data[verifiedUid]) {
      await registerUser(verifiedUid, "User_" + verifiedUid.substring(0, 6));
    }
  } catch (error) {
    console.error("[UC] User register check error:", error);
  }
}

// user chat load karna — OPTIMIZED: cache update in background
function loadUserChat() {
  if (!verifiedUid) return;
  loadMessages(verifiedUid, function(data) {
    allMessagesData = data || {};
    // Cache me save karo — next time instant load hoga
    if (data) {
      saveMessagesToCache(verifiedUid, data);
    }
    clearChat();
    if (data) {
      var keys = Object.keys(data).sort(function(a, b) {
        return (data[a].timestamp || 0) - (data[b].timestamp || 0);
      });
      for (var i = 0; i < keys.length; i++) {
        appendMessage(keys[i], data[keys[i]]);
      }
      scrollToBottom();
    }
    markMessagesAsSeen(verifiedUid, "user");
  });
}

// chat clear karna
function clearChat() {
  if (!chatContainer) return;
  var msgs = chatContainer.querySelectorAll(".message, .date-separator");
  for (var i = 0; i < msgs.length; i++) msgs[i].remove();
}

// message append karna
function appendMessage(msgKey, msg) {
  if (!chatContainer) return;
  var div = document.createElement("div");
  div.className = "message " + (msg.sender === "user" ? "user" : "admin");
  div.setAttribute("data-key", msgKey);

  var content = "";

  if (msg.replyTo && allMessagesData[msg.replyTo]) {
    var orig = allMessagesData[msg.replyTo];
    content += '<div class="msg-reply">' + escapeHtml((orig.text || "📷 Image").substring(0, 60)) + '</div>';
  }

  if (msg.text) {
    content += '<div class="msg-text">' + escapeHtml(msg.text) + "</div>";
  }
  if (msg.imageUrl) {
    content += '<img src="' + msg.imageUrl + '" alt="Image" loading="lazy" onclick="openFullImage(this.src)">';
  }

  var ticks = "";
  if (msg.sender === "user") {
    ticks = msg.seen ? '<span class="msg-ticks read">✓✓</span>' : '<span class="msg-ticks sent">✓</span>';
  }

  content += '<div class="msg-time">' + formatTime(msg.timestamp) + " " + ticks + "</div>";
  div.innerHTML = content;
  chatContainer.appendChild(div);

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

// context menu
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

if (ctxReply) {
  ctxReply.addEventListener("click", function() {
    if (!contextMsgData) return;
    replyingTo = contextMsgKey;
    if (replyName) replyName.textContent = contextMsgData.sender === "user" ? "You" : "Admin";
    if (replyText) replyText.textContent = contextMsgData.text || "📷 Image";
    if (replyBar) replyBar.style.display = "flex";
    if (msgInput) msgInput.focus();
    hideContextMenu();
  });
}

if (ctxCopy) {
  ctxCopy.addEventListener("click", function() {
    if (!contextMsgData || !contextMsgData.text) return;
    if (navigator.clipboard) navigator.clipboard.writeText(contextMsgData.text);
    else {
      var ta = document.createElement("textarea"); ta.value = contextMsgData.text;
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    }
    hideContextMenu();
  });
}

if (ctxDelete) {
  ctxDelete.addEventListener("click", function() {
    if (!contextMsgKey || !verifiedUid) return;
    deleteMessage(verifiedUid, contextMsgKey); hideContextMenu();
  });
}

document.addEventListener("click", function(e) {
  if (contextMenu && !contextMenu.contains(e.target)) hideContextMenu();
});

if (replyClose) {
  replyClose.addEventListener("click", function() {
    replyingTo = null;
    if (replyBar) replyBar.style.display = "none";
  });
}

// message send karna
async function sendTextMessage() {
  var text = msgInput.value.trim();
  if (!text) return;
  if (!verifiedUid) return;

  msgInput.value = "";
  var replyRef = replyingTo;
  replyingTo = null;
  if (replyBar) replyBar.style.display = "none";

  try {
    await sendMessage(verifiedUid, "user", text, "", replyRef);
  } catch (error) {
    console.error("[UC] sendTextMessage error:", error);
  }
}

// image send karna
async function sendImageMessage() {
  if (!selectedImageFile || !verifiedUid) return;

  var fileToUpload = selectedImageFile;
  var replyRef = replyingTo;
  closePreviewModal();
  replyingTo = null;
  if (replyBar) replyBar.style.display = "none";

  var uploadingDiv = document.createElement("div");
  uploadingDiv.className = "message user";
  uploadingDiv.innerHTML = '<div class="msg-text">📷 Sending image...</div>';
  chatContainer.appendChild(uploadingDiv);
  scrollToBottom();

  try {
    var imageUrl = await uploadImage(verifiedUid, fileToUpload);
    uploadingDiv.remove();
    if (imageUrl) {
      await sendMessage(verifiedUid, "user", "", imageUrl, replyRef);
    } else {
      showErrorBubble();
    }
  } catch (error) {
    console.error("[UC] sendImageMessage error:", error);
    uploadingDiv.remove();
    showErrorBubble();
  }
}

function showErrorBubble() {
  if (!chatContainer) return;
  var div = document.createElement("div");
  div.className = "message user";
  div.innerHTML = '<div class="msg-text" style="color:#fca5a5;">❌ Failed</div>';
  chatContainer.appendChild(div);
  scrollToBottom();
}

// image select karna
if (imgBtn) { imgBtn.addEventListener("click", function() { if (imageInput) imageInput.click(); }); }

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

if (cancelPreview) { cancelPreview.addEventListener("click", closePreviewModal); }
if (previewOverlay) { previewOverlay.addEventListener("click", closePreviewModal); }
if (sendPreview) { sendPreview.addEventListener("click", sendImageMessage); }

function closePreviewModal() {
  if (imagePreviewModal) imagePreviewModal.style.display = "none";
  if (previewImage) previewImage.src = "";
  selectedImageFile = null;
}

function openFullImage(src) { window.open(src, "_blank"); }

if (sendBtn) { sendBtn.addEventListener("click", sendTextMessage); }
if (msgInput) {
  msgInput.addEventListener("keypress", function(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendTextMessage(); }
  });
}

function scrollToBottom() {
  if (!chatContainer) return;
  requestAnimationFrame(function() { chatContainer.scrollTop = chatContainer.scrollHeight; });
}

// IST (Indian Standard Time, UTC+5:30) me convert karna
// Har device ki local timezone ignore karke always IST show karega
// Intl.DateTimeFormat use karta hai — har device pe accurate IST
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

function formatTime(timestamp) {
  if (!timestamp) return "";
  var date = new Date(timestamp);
  var p = getISTParts(date);
  var h = parseInt(p.hour); var m = parseInt(p.minute);
  var ampm = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  m = m < 10 ? "0" + m : m;
  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return parseInt(p.day) + " " + months[parseInt(p.month) - 1] + ", " + h + ":" + m + " " + ampm;
}

function escapeHtml(text) {
  var d = document.createElement("div");
  d.appendChild(document.createTextNode(text));
  return d.innerHTML;
}

function showLoading(show) {
  var overlay = document.getElementById("loadingOverlay");
  if (show) {
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "loadingOverlay";
      overlay.className = "loading-overlay";
      overlay.innerHTML = '<div class="loading-spinner"></div>';
      document.body.appendChild(overlay);
    }
  } else {
    if (overlay) overlay.remove();
  }
}

initApp();
