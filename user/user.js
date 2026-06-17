// User Chat Page Logic — ULTRA FAST VERSION
// Fixed: No double auth, single user check, parallel loading
// Caching: messages localStorage me cache hote hain for instant render

// Height fix: 100vh Android WebView me navigation bar include karta hai
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
var chatInitialized = false; // Prevents double initialization
var replyingTo = null;
var contextMsgKey = null;
var contextMsgData = null;
var allMessagesData = {};
var pendingFcmToken = null;

// ============ CACHE SYSTEM ============
var CACHE_KEY_MSGS = "uc_cache_msgs_";
var CACHE_KEY_UID = "uc_cache_uid";
var CACHE_KEY_TIME = "uc_cache_time";
var CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

function saveMessagesToCache(uid, data) {
  try {
    if (!uid || !data) return;
    localStorage.setItem(CACHE_KEY_UID, uid);
    localStorage.setItem(CACHE_KEY_MSGS + uid, JSON.stringify(data));
    localStorage.setItem(CACHE_KEY_TIME, String(Date.now()));
  } catch(e) {}
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
  } catch(e) {}
  return null;
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
// Page load pe turant cached messages dikha do — koi wait nahi
(function renderCachedMessages() {
  var cachedUid = localStorage.getItem(CACHE_KEY_UID);
  if (!cachedUid) return;
  var cachedData = loadMessagesFromCache(cachedUid);
  if (!cachedData) return;

  verifiedUid = cachedUid;
  allMessagesData = cachedData;
  var keys = Object.keys(cachedData).sort(function(a, b) {
    return (cachedData[a].timestamp || 0) - (cachedData[b].timestamp || 0);
  });
  for (var i = 0; i < keys.length; i++) {
    appendMessage(keys[i], cachedData[keys[i]]);
  }
  scrollToBottom();
  if (onlineStatus) { onlineStatus.textContent = "Connecting..."; onlineStatus.style.color = "#fcd34d"; }
  console.log("[UC-CACHE] Instant render from cache, uid:", cachedUid);
})();

// ============ MAIN AUTH — SINGLE PATH ============
// Android WebView se auth token receive karna
// Ye ONLY auth path hai Android me — initApp() se double auth NAHI hoga
window.receiveAuthToken = async function(idToken) {
  if (chatInitialized) {
    console.log("[UC-AUTH] Already initialized, skipping");
    return;
  }
  if (isAuthenticating) return;
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
        chatInitialized = true;
        if (onlineStatus) { onlineStatus.textContent = "Online"; onlineStatus.style.color = "#86efac"; }
        showLoading(false);
        // Parallel: register check + chat load ek saath
        onAuthComplete();
        return;
      }
    }
    console.error("[UC-AUTH] Sign in failed");
    if (onlineStatus) { onlineStatus.textContent = "Auth failed"; onlineStatus.style.color = "#fca5a5"; }
  } catch (error) {
    console.error("[UC-AUTH] Error:", error);
    if (onlineStatus) { onlineStatus.textContent = "Auth error"; onlineStatus.style.color = "#fca5a5"; }
  } finally {
    isAuthenticating = false;
  }
};

// ============ AUTH COMPLETE — PARALLEL LOADING ============
// ensureUserRegistered + loadUserChat + resetUnread — sab PARALLEL
function onAuthComplete() {
  if (!verifiedUid) return;

  // Chat TURANT load karo — registration ke liye wait mat karo
  loadUserChat();

  // Registration background me check karo
  ensureUserRegistered();

  // Unread reset + mark seen — parallel
  resetUnread(verifiedUid);
  markMessagesAsSeen(verifiedUid, "user");

  // FCM token save karo agar pending hai
  if (pendingFcmToken) {
    saveFcmToken(verifiedUid, pendingFcmToken);
    pendingFcmToken = null;
  }

  // BACKGROUND (non-blocking): Firestore se UserName fetch karke RTDB me save karo
  // Taaki admin panel chat me direct RTDB se username display ho sake
  syncUserNameFromFirestore(verifiedUid);
}

// ============ FIRESTORE USERNAME SYNC (BACKGROUND, NON-BLOCKING) ============
// Ye function Firestore se user ka UserName fetch karke RTDB helpCenter/users/{uid} me save karta hai.
// BACKGROUND me chalta hai — chat load ko block NAHI karta.
// Fail hone par bhi chat normally chalega, sirf username RTDB me save nahi hoga.
function syncUserNameFromFirestore(uid) {
  if (!uid) return;
  try {
    fetch("/api/sync-user-name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid: uid })
    }).then(function(response) {
      if (!response.ok) {
        console.warn("[UC-NAME] API returned non-ok status:", response.status);
        return null;
      }
      return response.json();
    }).then(function(data) {
      if (data && data.success && data.userName) {
        console.log("[UC-NAME] UserName synced from Firestore:", data.userName);
      } else {
        console.log("[UC-NAME] No UserName synced for", uid, "-", (data && data.message) || "no data");
      }
    }).catch(function(err) {
      // Non-blocking failure — chat ko affect nahi karta
      console.warn("[UC-NAME] Sync failed (non-blocking):", err.message);
    });
  } catch (err) {
    console.warn("[UC-NAME] Sync init failed:", err.message);
  }
}

// ============ OPTIMIZED: Single user check (NOT all users) ============
// Pehle: loadUsersOnce() — SAARE users fetch karta tha = SLOW
// Ab: sirf apna user check karta hai = FAST
async function ensureUserRegistered() {
  if (!verifiedUid) return;
  try {
    var snapshot = await firebase.database().ref("helpCenter/users/" + verifiedUid).once("value");
    if (!snapshot.exists()) {
      await registerUser(verifiedUid, "User_" + verifiedUid.substring(0, 6));
    }
  } catch (error) {
    console.error("[UC] User register check error:", error);
  }
}

// Android se FCM token receive karna
window.receiveFcmToken = function(token) {
  if (!token) return;
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

// ============ FALLBACK: Direct browser access (non-Android) ============
// Agar Android ne 3 second tak receiveAuthToken nahi call kiya
// toh onAuthChange se try karo (Firebase persistent auth)
setTimeout(function() {
  if (chatInitialized || isAuthenticating) return;
  console.log("[UC-FALLBACK] Android auth not called, trying Firebase persistent auth");

  onAuthChange(function(user) {
    if (user && !chatInitialized) {
      currentUser = user;
      verifiedUid = user.uid;
      chatInitialized = true;
      if (onlineStatus) { onlineStatus.textContent = "Online"; onlineStatus.style.color = "#86efac"; }
      showLoading(false);
      onAuthComplete();
    } else if (!chatInitialized) {
      if (onlineStatus) { onlineStatus.textContent = "Waiting for auth..."; onlineStatus.style.color = "#fcd34d"; }
      showLoading(false);
    }
  });
}, 3000);

// user chat load karna
function loadUserChat() {
  if (!verifiedUid) return;
  loadMessages(verifiedUid, function(data) {
    allMessagesData = data || {};
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
  if (!text || !verifiedUid) return;

  msgInput.value = "";
  var replyRef = replyingTo;
  replyingTo = null;
  if (replyBar) replyBar.style.display = "none";

  try {
    await sendMessage(verifiedUid, "user", text, "", replyRef);
    // BACKGROUND (non-blocking): admin ko push notification bhejo
    notifyAdminOfUserMessage(verifiedUid, text);
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
      // BACKGROUND (non-blocking): admin ko push notification bhejo
      notifyAdminOfUserMessage(verifiedUid, "📷 Image");
    } else {
      showErrorBubble();
    }
  } catch (error) {
    uploadingDiv.remove();
    showErrorBubble();
  }
}

// ============ ADMIN NOTIFICATION (FIRE-AND-FORGET, NON-BLOCKING) ============
// User message bhejne ke baad ye function admin ko push notification bhejta hai.
// Pure non-blocking hai — chat ko KABHI nahi rokta.
// Fail hone par bhi chat normally chalega, sirf admin ko notification nahi milega.
function notifyAdminOfUserMessage(userUid, body) {
  if (!userUid) return;
  try {
    // User ka display name RTDB se fetch karo (recently synced UserName field)
    // Taaki notification title me real name dikhe instead of "User ABC123"
    firebase.database().ref("helpCenter/users/" + userUid + "/UserName").once("value")
      .then(function(snap) {
        var userName = snap.val() || "";
        var title = userName ? ("New message from " + userName) : "New support message";

        // API call — fire and forget
        fetch("/api/send-notification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: "allAdmins",
            title: title,
            body: body || "New message",
            userUid: userUid,
            senderUid: userUid
          })
        }).then(function(response) {
          if (response.ok) {
            console.log("[UC-ADMIN-NOTIF] Notification sent to admins");
          } else {
            console.warn("[UC-ADMIN-NOTIF] API non-ok status:", response.status);
          }
        }).catch(function(err) {
          console.warn("[UC-ADMIN-NOTIF] Send failed (non-blocking):", err.message);
        });
      })
      .catch(function(err) {
        console.warn("[UC-ADMIN-NOTIF] UserName fetch failed:", err.message);
        // Fallback — bina name ke bhej do
        fetch("/api/send-notification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: "allAdmins",
            title: "New support message",
            body: body || "New message",
            userUid: userUid,
            senderUid: userUid
          })
        }).catch(function() {});
      });
  } catch (err) {
    console.warn("[UC-ADMIN-NOTIF] Init failed:", err.message);
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

// NO initApp() call here — receiveAuthToken is the ONLY auth path
// Fallback: 3-second timeout checks Firebase persistent auth
