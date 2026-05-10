// User Chat Page Logic

var currentUser = null;
var verifiedUid = null;
var selectedImageFile = null;
var isAuthenticating = false;
var replyingTo = null;
var contextMsgKey = null;
var contextMsgData = null;
var allMessagesData = {};

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

// Android WebView se auth token receive karna
window.receiveAuthToken = async function(idToken) {
  if (isAuthenticating || currentUser) return;
  isAuthenticating = true;
  onlineStatus.textContent = "Authenticating...";
  onlineStatus.style.color = "#fcd34d";

  try {
    var customToken = await exchangeIdTokenForCustomToken(idToken);
    if (customToken) {
      var result = await signInWithCustomToken(customToken);
      if (result && result.user) {
        currentUser = result.user;
        verifiedUid = result.user.uid;
        onlineStatus.textContent = "Online";
        onlineStatus.style.color = "#86efac";
        await ensureUserRegistered();
        loadUserChat();
        resetUnread(verifiedUid);
        markMessagesAsSeen(verifiedUid, "user");
        return;
      }
    }
    console.error("Custom token sign in failed");
    onlineStatus.textContent = "Auth failed";
    onlineStatus.style.color = "#fca5a5";
  } catch (error) {
    console.error("receiveAuthToken error:", error);
    onlineStatus.textContent = "Auth error";
    onlineStatus.style.color = "#fca5a5";
  } finally {
    isAuthenticating = false;
    showLoading(false);
  }
};

// Android se FCM token receive karna
window.receiveFcmToken = function(token) {
  if (!verifiedUid || !token) return;
  saveFcmToken(verifiedUid, token);
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
  onlineStatus.textContent = "Connecting...";
  onlineStatus.style.color = "#fcd34d";

  onAuthChange(function(user) {
    if (user && !currentUser) {
      currentUser = user;
      verifiedUid = user.uid;
      onlineStatus.textContent = "Online";
      onlineStatus.style.color = "#86efac";
      ensureUserRegistered().then(function() {
        loadUserChat();
        resetUnread(verifiedUid);
        markMessagesAsSeen(verifiedUid, "user");
      });
      showLoading(false);
    } else if (!currentUser) {
      onlineStatus.textContent = "Waiting for auth...";
      onlineStatus.style.color = "#fcd34d";
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
    // mark admin messages as seen
    markMessagesAsSeen(verifiedUid, "user");
  });
}

// chat clear karna
function clearChat() {
  var msgs = chatContainer.querySelectorAll(".message, .date-separator");
  for (var i = 0; i < msgs.length; i++) msgs[i].remove();
}

// message append karna
function appendMessage(msgKey, msg) {
  var div = document.createElement("div");
  div.className = "message " + (msg.sender === "user" ? "user" : "admin");
  div.setAttribute("data-key", msgKey);

  var content = "";

  // reply quote
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

  // time + seen ticks
  var ticks = "";
  if (msg.sender === "user") {
    ticks = msg.seen ? '<span class="msg-ticks read">✓✓</span>' : '<span class="msg-ticks sent">✓</span>';
  }

  content += '<div class="msg-time">' + formatTime(msg.timestamp) + " " + ticks + "</div>";

  div.innerHTML = content;
  chatContainer.appendChild(div);

  // context menu on long press / right click
  div.addEventListener("contextmenu", function(e) {
    e.preventDefault();
    showContextMenu(e, msgKey, msg);
  });

  // long press for mobile
  var pressTimer = null;
  div.addEventListener("touchstart", function(e) {
    pressTimer = setTimeout(function() {
      e.preventDefault();
      showContextMenu(e.touches[0], msgKey, msg);
    }, 500);
  }, { passive: false });
  div.addEventListener("touchend", function() { clearTimeout(pressTimer); });
  div.addEventListener("touchmove", function() { clearTimeout(pressTimer); });
}

// context menu dikhana
function showContextMenu(e, msgKey, msg) {
  contextMsgKey = msgKey;
  contextMsgData = msg;
  contextMenu.style.display = "block";

  var x = e.clientX || e.pageX;
  var y = e.clientY || e.pageY;

  // adjust position to stay in viewport
  var menuW = 160;
  var menuH = 130;
  if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 10;
  if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 10;

  contextMenu.style.left = x + "px";
  contextMenu.style.top = y + "px";
}

// hide context menu
function hideContextMenu() {
  contextMenu.style.display = "none";
  contextMsgKey = null;
  contextMsgData = null;
}

// context menu actions
document.getElementById("ctxReply").addEventListener("click", function() {
  if (!contextMsgData) return;
  replyingTo = contextMsgKey;
  replyName.textContent = contextMsgData.sender === "user" ? "You" : "Admin";
  replyText.textContent = contextMsgData.text || "📷 Image";
  replyBar.style.display = "flex";
  msgInput.focus();
  hideContextMenu();
});

document.getElementById("ctxCopy").addEventListener("click", function() {
  if (!contextMsgData || !contextMsgData.text) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(contextMsgData.text);
  } else {
    var ta = document.createElement("textarea");
    ta.value = contextMsgData.text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
  hideContextMenu();
});

document.getElementById("ctxDelete").addEventListener("click", function() {
  if (!contextMsgKey || !verifiedUid) return;
  deleteMessage(verifiedUid, contextMsgKey);
  hideContextMenu();
});

// tap anywhere to close context menu
document.addEventListener("click", function(e) {
  if (!contextMenu.contains(e.target)) hideContextMenu();
});

// reply close
replyClose.addEventListener("click", function() {
  replyingTo = null;
  replyBar.style.display = "none";
});

// message send karna
async function sendTextMessage() {
  var text = msgInput.value.trim();
  if (!text || !verifiedUid) return;

  msgInput.value = "";
  var replyRef = replyingTo;
  replyingTo = null;
  replyBar.style.display = "none";

  await sendMessage(verifiedUid, "user", text, "", replyRef);
}

// image send karna
async function sendImageMessage() {
  if (!selectedImageFile || !verifiedUid) return;

  var fileToUpload = selectedImageFile;
  var replyRef = replyingTo;
  closePreviewModal();
  replyingTo = null;
  replyBar.style.display = "none";

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
  var div = document.createElement("div");
  div.className = "message user";
  div.innerHTML = '<div class="msg-text" style="color:#fca5a5;">❌ Image failed</div>';
  chatContainer.appendChild(div);
  scrollToBottom();
}

// image select karna
imgBtn.addEventListener("click", function() { imageInput.click(); });

imageInput.addEventListener("change", function(e) {
  var file = e.target.files[0];
  if (!file || !file.type.startsWith("image/")) return;
  selectedImageFile = file;
  var reader = new FileReader();
  reader.onload = function(event) {
    previewImage.src = event.target.result;
    imagePreviewModal.style.display = "flex";
  };
  reader.readAsDataURL(file);
  imageInput.value = "";
});

// preview modal controls
cancelPreview.addEventListener("click", closePreviewModal);
previewOverlay.addEventListener("click", closePreviewModal);
sendPreview.addEventListener("click", sendImageMessage);

function closePreviewModal() {
  imagePreviewModal.style.display = "none";
  previewImage.src = "";
  selectedImageFile = null;
}

function openFullImage(src) { window.open(src, "_blank"); }

// send button + enter key
sendBtn.addEventListener("click", sendTextMessage);
msgInput.addEventListener("keypress", function(e) {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendTextMessage(); }
});

// auto scroll
function scrollToBottom() {
  requestAnimationFrame(function() { chatContainer.scrollTop = chatContainer.scrollHeight; });
}

// time format
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

// HTML escape
function escapeHtml(text) {
  var d = document.createElement("div");
  d.appendChild(document.createTextNode(text));
  return d.innerHTML;
}

// loading
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