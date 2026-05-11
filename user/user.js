// User Chat Page Logic

var currentUser = null;
var verifiedUid = null;
var selectedImageFile = null;
var isAuthenticating = false;
var replyingTo = null;
var contextMsgKey = null;
var contextMsgData = null;
var allMessagesData = {};
var pendingFcmToken = null;

// DOM elements - null check ke saath
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

// Android WebView se auth token receive karna
window.receiveAuthToken = async function(idToken) {
  if (isAuthenticating || currentUser) return;
  isAuthenticating = true;
  if (onlineStatus) { onlineStatus.textContent = "Authenticating..."; onlineStatus.style.color = "#fcd34d"; }

  try {
    var customToken = await exchangeIdTokenForCustomToken(idToken);
    if (customToken) {
      var result = await signInWithCustomToken(customToken);
      if (result && result.user) {
        currentUser = result.user;
        verifiedUid = result.user.uid;
        console.log("Auth success, uid:", verifiedUid);
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
    console.error("Custom token sign in failed");
    if (onlineStatus) { onlineStatus.textContent = "Auth failed"; onlineStatus.style.color = "#fca5a5"; }
  } catch (error) {
    console.error("receiveAuthToken error:", error);
    if (onlineStatus) { onlineStatus.textContent = "Auth error"; onlineStatus.style.color = "#fca5a5"; }
  } finally {
    isAuthenticating = false;
    showLoading(false);
  }
};

// Android se FCM token receive karna
window.receiveFcmToken = function(token) {
  if (!token) return;
  console.log("FCM token received:", token.substring(0, 20) + "...");
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
    console.error("Token exchange failed:", data.error);
    return null;
  } catch (error) {
    console.error("Token exchange API error:", error);
    return null;
  }
}

// app initialize karna
async function initApp() {
  showLoading(true);
  if (onlineStatus) { onlineStatus.textContent = "Connecting..."; onlineStatus.style.color = "#fcd34d"; }

  onAuthChange(function(user) {
    if (user && !currentUser) {
      currentUser = user;
      verifiedUid = user.uid;
      console.log("onAuthChange: uid:", verifiedUid);
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
    console.error("User register check error:", error);
  }
}

// user chat load karna
function loadUserChat() {
  if (!verifiedUid) return;
  loadMessages(verifiedUid, function(data) {
    allMessagesData = data || {};
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

// context menu - null safe
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

// context menu listeners - null check ke saath, crash nahi hoga
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
  if (!msgInput) return;
  var text = msgInput.value.trim();
  console.log("sendTextMessage called, text:", text, "uid:", verifiedUid);

  if (!text) { console.log("No text, returning"); return; }
  if (!verifiedUid) { console.log("No verifiedUid, returning"); return; }

  msgInput.value = "";
  var replyRef = replyingTo;
  replyingTo = null;
  if (replyBar) replyBar.style.display = "none";

  try {
    var success = await sendMessage(verifiedUid, "user", text, "", replyRef);
    console.log("sendMessage result:", success);
  } catch (error) {
    console.error("sendTextMessage error:", error);
  }
}

// image send karna
async function sendImageMessage() {
  if (!selectedImageFile || !verifiedUid) return;
  if (!chatContainer) return;

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
    console.error("sendImageMessage error:", error);
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
if (imgBtn) {
  imgBtn.addEventListener("click", function() { if (imageInput) imageInput.click(); });
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

function formatTime(timestamp) {
  if (!timestamp) return "";
  var date = new Date(timestamp);
  var now = new Date();
  var isToday = date.toDateString() === now.toDateString();
  var h = date.getHours(); var m = date.getMinutes();
  var ampm = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  m = m < 10 ? "0" + m : m;
  if (isToday) return h + ":" + m + " " + ampm;
  return date.getDate() + " " + date.toLocaleString("en", { month: "short" }) + ", " + h + ":" + m + " " + ampm;
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
