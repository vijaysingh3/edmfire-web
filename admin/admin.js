// Admin Panel Logic

let currentAdmin = null;
let selectedUserUid = null;
let selectedImageFile = null;
let usersData = {};

// DOM elements
const userListEl = document.getElementById("userList");
const messagesContainer = document.getElementById("messagesContainer");
const chatHeaderName = document.getElementById("chatHeaderName");
const chatHeaderStatus = document.getElementById("chatHeaderStatus");
const bottomBar = document.getElementById("bottomBar");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const imgBtn = document.getElementById("imgBtn");
const imageInput = document.getElementById("imageInput");
const searchInput = document.getElementById("searchInput");
const mobileToggle = document.getElementById("mobileToggle");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const imagePreviewModal = document.getElementById("imagePreviewModal");
const previewImage = document.getElementById("previewImage");
const previewOverlay = document.getElementById("previewOverlay");
const cancelPreview = document.getElementById("cancelPreview");
const sendPreview = document.getElementById("sendPreview");

// app initialize karna
async function initApp() {
  showLoading(true);

  onAuthChange(async (user) => {
    if (user) {
      // admin access check karna
      if (!checkAdminAccess(user)) {
        chatHeaderName.textContent = "Access Denied";
        chatHeaderStatus.textContent = "You are not authorized as admin";
        showLoading(false);
        return;
      }

      currentAdmin = user;
      loadUsersList();
      showLoading(false);
    } else {
      // admin login page dikhana
      showAdminLogin();
      showLoading(false);
    }
  });
}

// admin login dikhana
function showAdminLogin() {
  chatHeaderName.textContent = "Admin Login Required";
  chatHeaderStatus.textContent = "Please sign in to continue";

  messagesContainer.innerHTML = `
    <div class="no-chat-state">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      <h3>Admin Access</h3>
      <p>Sign in with your admin credentials</p>
      <div style="margin-top:16px; display:flex; flex-direction:column; gap:10px; width:260px;">
        <input type="email" id="adminEmail" placeholder="Email" style="height:44px; border:1px solid #d1d5db; border-radius:12px; padding:0 14px; font-size:14px; outline:none; font-family:'Poppins',sans-serif;">
        <input type="password" id="adminPassword" placeholder="Password" style="height:44px; border:1px solid #d1d5db; border-radius:12px; padding:0 14px; font-size:14px; outline:none; font-family:'Poppins',sans-serif;">
        <button id="adminLoginBtn" style="height:44px; border:none; border-radius:12px; background:linear-gradient(135deg,#6366f1,#8b5cf6); color:white; font-size:14px; font-weight:500; cursor:pointer; font-family:'Poppins',sans-serif;">Sign In</button>
        <p id="loginError" style="color:#ef4444; font-size:12px; display:none;"></p>
      </div>
    </div>
  `;

  document.getElementById("adminLoginBtn").addEventListener("click", handleAdminLogin);
  document.getElementById("adminPassword").addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleAdminLogin();
  });
}

// admin login handle karna
async function handleAdminLogin() {
  const email = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value;
  const loginError = document.getElementById("loginError");

  if (!email || !password) {
    loginError.textContent = "Please enter email and password";
    loginError.style.display = "block";
    return;
  }

  const user = await signInWithEmail(email, password);
  if (user) {
    if (checkAdminAccess(user)) {
      currentAdmin = user;
      loadUsersList();
    } else {
      loginError.textContent = "Access denied. Not an admin account.";
      loginError.style.display = "block";
      signOutUser();
    }
  } else {
    loginError.textContent = "Invalid email or password";
    loginError.style.display = "block";
  }
}

// users list load karna
function loadUsersList() {
  loadUsers((data) => {
    usersData = data || {};
    renderUserList(usersData);
  });
}

// user list render karna
function renderUserList(data) {
  userListEl.innerHTML = "";

  const uids = Object.keys(data);

  if (uids.length === 0) {
    userListEl.innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" stroke-width="1.5">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
        </svg>
        <p>No users yet</p>
      </div>
    `;
    return;
  }

  // unread count ke hisaab se sort karna
  const sortedUids = uids.sort((a, b) => {
    const unreadA = data[a].unreadMsg || 0;
    const unreadB = data[b].unreadMsg || 0;
    return unreadB - unreadA;
  });

  sortedUids.forEach((uid) => {
    const user = data[uid];
    const div = document.createElement("div");
    div.className = "user-item" + (uid === selectedUserUid ? " active" : "");
    div.setAttribute("data-uid", uid);

    const initial = (user.username || "U").charAt(0).toUpperCase();
    const unread = user.unreadMsg || 0;

    div.innerHTML = `
      <div class="user-item-content">
        <div class="user-avatar">${initial}</div>
        <div class="user-info">
          <div class="user-name">${escapeHtml(user.username || "Unknown")}</div>
          <div class="last-msg">${unread > 0 ? unread + " new message" + (unread > 1 ? "s" : "") : "No new messages"}</div>
        </div>
      </div>
      ${unread > 0 ? '<div class="badge">' + unread + "</div>" : ""}
    `;

    div.addEventListener("click", () => {
      selectUser(uid, user);
    });

    userListEl.appendChild(div);
  });
}

// user select karna
function selectUser(uid, userData) {
  selectedUserUid = uid;

  // UI update karna
  chatHeaderName.textContent = userData.username || "Unknown";
  chatHeaderStatus.textContent = "UID: " + uid.substring(0, 8) + "...";
  bottomBar.style.display = "flex";

  // active state update karna
  document.querySelectorAll(".user-item").forEach((el) => {
    el.classList.remove("active");
    if (el.getAttribute("data-uid") === uid) {
      el.classList.add("active");
    }
  });

  // mobile sidebar close karna
  closeSidebar();

  // unread count zero karna
  resetUnread(uid);

  // messages load karna
  loadSelectedUserChat(uid);
}

// selected user ka chat load karna
function loadSelectedUserChat(uid) {
  // pehle previous listener remove karna
  offMessagesListener(uid);

  // messages container clear karna
  messagesContainer.innerHTML = "";

  // realtime messages load karna
  loadMessages(uid, (data) => {
    messagesContainer.innerHTML = "";
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

// message append karna
function appendMessage(msg) {
  const div = document.createElement("div");
  // admin panel me: user ka message left, admin ka right
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
  messagesContainer.appendChild(div);
}

// text message send karna
async function sendTextMessage() {
  const text = msgInput.value.trim();
  if (!text || !selectedUserUid) return;

  msgInput.value = "";
  await sendMessage(selectedUserUid, "admin", text, "");
}

// image message send karna
async function sendImageMessage() {
  if (!selectedImageFile || !selectedUserUid) return;

  closePreviewModal();

  // uploading indicator
  const uploadingDiv = document.createElement("div");
  uploadingDiv.className = "message admin";
  uploadingDiv.innerHTML = '<div class="msg-text">📷 Sending image...</div>';
  messagesContainer.appendChild(uploadingDiv);
  scrollToBottom();

  const imageUrl = await uploadImage(selectedUserUid, selectedImageFile);
  selectedImageFile = null;

  uploadingDiv.remove();

  if (imageUrl) {
    await sendMessage(selectedUserUid, "admin", "", imageUrl);
  }
}

// image select karna
imgBtn.addEventListener("click", () => {
  imageInput.click();
});

imageInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file || !file.type.startsWith("image/")) return;

  selectedImageFile = file;

  const reader = new FileReader();
  reader.onload = (event) => {
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
msgInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendTextMessage();
  }
});

// search functionality
searchInput.addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase().trim();
  if (!query) {
    renderUserList(usersData);
    return;
  }

  const filtered = {};
  Object.keys(usersData).forEach((uid) => {
    const user = usersData[uid];
    if ((user.username || "").toLowerCase().includes(query)) {
      filtered[uid] = user;
    }
  });
  renderUserList(filtered);
});

// mobile sidebar toggle
mobileToggle.addEventListener("click", () => {
  sidebar.classList.toggle("open");
  sidebarOverlay.classList.toggle("active");
});

sidebarOverlay.addEventListener("click", closeSidebar);

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("active");
}

// auto scroll
function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
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

// HTML escape
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
