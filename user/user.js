// User Chat Page Logic

let currentUser = null;
let verifiedUid = null;
let selectedImageFile = null;
let isAuthenticating = false;

// DOM elements
const chatContainer = document.getElementById("chatContainer");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const imgBtn = document.getElementById("imgBtn");
const imageInput = document.getElementById("imageInput");
const onlineStatus = document.getElementById("onlineStatus");
const typingIndicator = document.getElementById("typingIndicator");
const imagePreviewModal = document.getElementById("imagePreviewModal");
const previewImage = document.getElementById("previewImage");
const previewOverlay = document.getElementById("previewOverlay");
const cancelPreview = document.getElementById("cancelPreview");
const sendPreview = document.getElementById("sendPreview");

// Android WebView se token receive karna
window.receiveAuthToken = async function(idToken) {
  if (isAuthenticating || currentUser) return;
  isAuthenticating = true;

  onlineStatus.textContent = "Authenticating...";
  onlineStatus.style.color = "#fcd34d";

  try {
    const customToken = await exchangeIdTokenForCustomToken(idToken);

    if (customToken) {
      const user = await signInWithCustomToken(customToken);
      if (user) {
        currentUser = user;
        verifiedUid = user.uid;
        onlineStatus.textContent = "Online";
        onlineStatus.style.color = "#86efac";

        await ensureUserRegistered();
        loadUserChat();
        resetUnread(verifiedUid);
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

// ID token ko custom token me exchange karna API se
async function exchangeIdTokenForCustomToken(idToken) {
  try {
    const response = await fetch("/api/custom-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: idToken })
    });
    const data = await response.json();
    if (data.customToken) {
      return data.customToken;
    }
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

  onAuthChange(async (user) => {
    if (user && !currentUser) {
      currentUser = user;
      verifiedUid = user.uid;
      onlineStatus.textContent = "Online";
      onlineStatus.style.color = "#86efac";

      await ensureUserRegistered();
      loadUserChat();
      resetUnread(verifiedUid);
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
  try {
    const data = await loadUsersOnce();
    if (!data || !data[verifiedUid]) {
      const username = "User_" + verifiedUid.substring(0, 6);
      await registerUser(verifiedUid, username);
    }
  } catch (error) {
    console.error("User register check error:", error);
  }
}

// user chat load karna
function loadUserChat() {
  const uid = verifiedUid;

  loadMessages(uid, (data) => {
    clearChat();
    if (data) {
      const keys = Object.keys(data).sort((a, b) => {
        return (data[a].timestamp || 0) - (data[b].timestamp || 0);
      });
      keys.forEach((key) => {
        appendMessage(data[key]);
      });
      scrollToBottom();
    }
  });
}

// chat clear karna
function clearChat() {
  const messages = chatContainer.querySelectorAll(".message, .date-separator");
  messages.forEach((el) => el.remove());
}

// message append karna chat me
function appendMessage(msg) {
  const div = document.createElement("div");
  div.className = "message " + (msg.sender === "user" ? "user" : "admin");

  let content = "";

  if (msg.text) {
    content += '<div class="msg-text">' + escapeHtml(msg.text) + "</div>";
  }

  if (msg.imageUrl) {
    content += '<img src="' + msg.imageUrl + '" alt="Image" loading="lazy" onclick="openFullImage(this.src)">';
  }

  content += '<div class="msg-time">' + formatTime(msg.timestamp) + "</div>";

  div.innerHTML = content;
  chatContainer.appendChild(div);
}

// message send karna
async function sendTextMessage() {
  const text = msgInput.value.trim();
  if (!text || !verifiedUid) return;

  msgInput.value = "";
  await sendMessage(verifiedUid, "user", text, "");
}

// image send karna
async function sendImageMessage() {
  if (!selectedImageFile || !verifiedUid) return;

  // BUG FIX: closePreviewModal() selectedImageFile null kar deta hai
  // isliye pehle file ka reference save kar lena
  var fileToUpload = selectedImageFile;
  closePreviewModal();

  var uploadingDiv = document.createElement("div");
  uploadingDiv.className = "message user";
  uploadingDiv.innerHTML = '<div class="msg-text">📷 Sending image...</div>';
  chatContainer.appendChild(uploadingDiv);
  scrollToBottom();

  try {
    var imageUrl = await uploadImage(verifiedUid, fileToUpload);

    uploadingDiv.remove();

    if (imageUrl) {
      await sendMessage(verifiedUid, "user", "", imageUrl);
    } else {
      console.error("Image upload failed - no URL returned");
      var errorDiv = document.createElement("div");
      errorDiv.className = "message user";
      errorDiv.innerHTML = '<div class="msg-text" style="color:#fca5a5;">❌ Image failed to send</div>';
      chatContainer.appendChild(errorDiv);
      scrollToBottom();
    }
  } catch (error) {
    console.error("sendImageMessage error:", error);
    uploadingDiv.remove();
    var errorDiv = document.createElement("div");
    errorDiv.className = "message user";
    errorDiv.innerHTML = '<div class="msg-text" style="color:#fca5a5;">❌ Image failed to send</div>';
    chatContainer.appendChild(errorDiv);
    scrollToBottom();
  }
}

// image select karna
imgBtn.addEventListener("click", function() {
  imageInput.click();
});

imageInput.addEventListener("change", function(e) {
  var file = e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    return;
  }

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

// full image open karna
function openFullImage(src) {
  window.open(src, "_blank");
}

// send button click
sendBtn.addEventListener("click", sendTextMessage);

// enter key press
msgInput.addEventListener("keypress", function(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendTextMessage();
  }
});

// auto scroll karna
function scrollToBottom() {
  requestAnimationFrame(function() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  });
}

// time format karna
function formatTime(timestamp) {
  if (!timestamp) return "";
  var date = new Date(timestamp);
  var now = new Date();
  var isToday = date.toDateString() === now.toDateString();

  var hours = date.getHours();
  var minutes = date.getMinutes();
  var ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  minutes = minutes < 10 ? "0" + minutes : minutes;

  if (isToday) {
    return hours + ":" + minutes + " " + ampm;
  } else {
    var day = date.getDate();
    var month = date.toLocaleString("en", { month: "short" });
    return day + " " + month + ", " + hours + ":" + minutes + " " + ampm;
  }
}

// HTML escape karna
function escapeHtml(text) {
  var div = document.createElement("div");
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}

// loading dikhana
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

// app start karna
initApp();