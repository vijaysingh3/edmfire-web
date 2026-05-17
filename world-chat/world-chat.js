// ============================================
// EDMFire World Chat - Isolated Page
// All authenticated players chat in one room
// RTDB node: worldChat/messages
// Each message: { username, text, timestamp, uid }
// ============================================

// Height fix for Android WebView — keyboard open/close pe view adjust karo
function setAppHeight() {
  var viewH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.height = viewH + "px";
  document.body.style.height = viewH + "px";
}
setAppHeight();
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", function() {
    setAppHeight();
    // Keyboard open hone pe input field visible rahe
    if (document.activeElement && (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA")) {
      setTimeout(function() {
        document.activeElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  });
} else {
  window.addEventListener("resize", setAppHeight);
}

// ============ STATE ============
var currentUser = null;
var verifiedUid = null;
var currentUsername = "";
var isAuthenticating = false;
var contextMsgKey = null;
var contextMsgText = null;
var lastDateStr = "";
var allMessagesData = {};
var CHAT_REF = "worldChat/messages";

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

console.log("[WC-INIT] World Chat script loaded");

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

  // Get username from Firestore Users collection
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

  // Show bottom bar and start chat
  if (bottomBar) bottomBar.style.display = "flex";
  loadChat();
}

// ============ LOAD CHAT (Realtime Listener) ============
function loadChat() {
  console.log("[WC-CHAT] Loading chat from RTDB:", CHAT_REF);
  var ref = firebase.database().ref(CHAT_REF).orderByChild("timestamp").limitToLast(200);

  ref.on("value", function(snapshot) {
    var data = snapshot.val();
    allMessagesData = data || {};
    renderChat(data);
  }, function(error) {
    console.error("[WC-CHAT] RTDB listener error:", error);
  });
}

// ============ RENDER CHAT ============
function renderChat(data) {
  if (!chatContainer) return;

  // Remove loading indicator
  var loadingEl = document.getElementById("chatLoading");
  if (loadingEl) loadingEl.remove();

  // Clear existing messages
  var msgs = chatContainer.querySelectorAll(".message, .date-separator");
  for (var i = 0; i < msgs.length; i++) msgs[i].remove();

  if (!data) {
    chatContainer.innerHTML += '<div class="chat-empty"><h3>No messages yet</h3><p>Be the first to say hello!</p></div>';
    return;
  }

  // Remove empty state if exists
  var emptyEl = chatContainer.querySelector(".chat-empty");
  if (emptyEl) emptyEl.remove();

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

  var content = "";

  // Username (show for others, or "You" for own)
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

  // Long press for context menu (mobile)
  var pressTimer = null;
  div.addEventListener("contextmenu", function(e) {
    e.preventDefault();
    showContextMenu(e, msgKey, msg.text);
  });
  div.addEventListener("touchstart", function() {
    pressTimer = setTimeout(function() {
      showContextMenu({ clientX: 50, clientY: 100 }, msgKey, msg.text);
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

  msgInput.value = "";
  if (sendBtn) sendBtn.disabled = true;

  try {
    var ref = firebase.database().ref(CHAT_REF);
    var newMsg = {
      uid: verifiedUid,
      username: currentUsername,
      text: text,
      timestamp: Date.now()
    };

    await new Promise(function(resolve) {
      ref.push(newMsg, function(error) {
        if (error) {
          console.error("[WC-SEND] Send error:", error);
          resolve(false);
        } else {
          console.log("[WC-SEND] Message sent");
          resolve(true);
        }
      });
    });
  } catch (error) {
    console.error("[WC-SEND] sendTextMessage error:", error);
  }

  if (sendBtn) sendBtn.disabled = false;
}

// ============ CONTEXT MENU ============
function showContextMenu(e, msgKey, text) {
  contextMsgKey = msgKey;
  contextMsgText = text;
  if (contextMenu) {
    contextMenu.style.display = "block";
    var x = e.clientX || 50;
    var y = e.clientY || 50;
    if (x + 160 > window.innerWidth) x = window.innerWidth - 170;
    if (y + 80 > window.innerHeight) y = window.innerHeight - 90;
    contextMenu.style.left = x + "px";
    contextMenu.style.top = y + "px";
  }
}

function hideContextMenu() {
  if (contextMenu) contextMenu.style.display = "none";
  contextMsgKey = null;
  contextMsgText = null;
}

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

document.addEventListener("click", function(e) {
  if (contextMenu && !contextMenu.contains(e.target)) hideContextMenu();
});

// ============ SEND EVENTS ============
if (sendBtn) {
  sendBtn.addEventListener("click", sendTextMessage);
}
if (msgInput) {
  msgInput.addEventListener("keypress", function(e) {
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
