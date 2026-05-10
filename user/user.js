// User Chat Page Logic

let currentUser = null;
let selectedImageFile = null;

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

// app initialize karna
async function initApp() {
  showLoading(true);

  // auth state check karna
  onAuthChange(async (user) => {
    if (user) {
      currentUser = user;
      onlineStatus.textContent = "Online";
      onlineStatus.style.color = "#86efac";

      // user register karna agar naya hai
      await ensureUserRegistered();

      // messages load karna
      loadUserChat();

      // unread count zero karna
      resetUnread(currentUser.uid);

      showLoading(false);
    } else {
      // anonymous sign in karna
      const newUser = await signInAnonymously();
      if (newUser) {
        currentUser = newUser;
        await ensureUserRegistered();
        loadUserChat();
        showLoading(false);
      } else {
        onlineStatus.textContent = "Connection failed";
        onlineStatus.style.color = "#fca5a5";
        showLoading(false);
      }
    }
  });
}

// user register check karna
async function ensureUserRegistered() {
  try {
    const data = await loadUsersOnce();
    if (!data || !data[currentUser.uid]) {
      // naya user hai, register karna
      const username = "User_" + currentUser.uid.substring(0, 6);
      await registerUser(currentUser.uid, username);
    }
  } catch (error) {
    console.error("User register check error:", error);
  }
}

// user chat load karna
function loadUserChat() {
  const uid = currentUser.uid;

  // pehle existing messages load karna
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
  if (!text || !currentUser) return;

  msgInput.value = "";
  await sendMessage(currentUser.uid, "user", text, "");
}

// image send karna
async function sendImageMessage() {
  if (!selectedImageFile || !currentUser) return;

  closePreviewModal();

  // uploading indicator dikhana
  const uploadingDiv = document.createElement("div");
  uploadingDiv.className = "message user";
  uploadingDiv.innerHTML = '<div class="msg-text">📷 Sending image...</div>';
  chatContainer.appendChild(uploadingDiv);
  scrollToBottom();

  const imageUrl = await uploadImage(currentUser.uid, selectedImageFile);
  selectedImageFile = null;

  // uploading indicator hataana
  uploadingDiv.remove();

  if (imageUrl) {
    await sendMessage(currentUser.uid, "user", "", imageUrl);
  }
}

// image select karna
imgBtn.addEventListener("click", () => {
  imageInput.click();
});

imageInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // sirf image files
  if (!file.type.startsWith("image/")) {
    return;
  }

  selectedImageFile = file;

  // preview dikhana
  const reader = new FileReader();
  reader.onload = (event) => {
    previewImage.src = event.target.result;
    imagePreviewModal.style.display = "flex";
  };
  reader.readAsDataURL(file);

  // input reset karna
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
msgInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendTextMessage();
  }
});

// auto scroll karna
function scrollToBottom() {
  requestAnimationFrame(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  });
}

// time format karna
function formatTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  let hours = date.getHours();
  let minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  minutes = minutes < 10 ? "0" + minutes : minutes;

  if (isToday) {
    return hours + ":" + minutes + " " + ampm;
  } else {
    const day = date.getDate();
    const month = date.toLocaleString("en", { month: "short" });
    return day + " " + month + ", " + hours + ":" + minutes + " " + ampm;
  }
}

// HTML escape karna
function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// loading dikhana
function showLoading(show) {
  let overlay = document.getElementById("loadingOverlay");
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
