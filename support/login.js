// ============================================
// EDMFire Support - Login Page Logic
// Host login with gmail + password
// 1 baar login → Firebase persistent session → next visit auto-redirect
// ============================================

var loginBtn = document.getElementById("loginBtn");
var loginError = document.getElementById("loginError");
var helperEmail = document.getElementById("helperEmail");
var helperPassword = document.getElementById("helperPassword");

// ============ AUTO REDIRECT IF ALREADY LOGGED IN ============
// Firebase Auth persists session — agar host pehle se logged in hai
// aur uska helperRead="yes" hai, toh direct /support/chats/ bhej do
onAuthChange(function(user) {
  if (!user) {
    hideLoading();
    return;
  }
  // User hai — check karo helper permission
  checkHelperPermission(user).then(function(result) {
    if (result.allowed) {
      // Save helper info in localStorage for quick UI access
      try {
        localStorage.setItem("edmfire_helper_info", JSON.stringify({
          uid: user.uid,
          email: result.hostData.gmail || user.email || "",
          name: result.hostData.fullName || "Helper",
          helperRead: result.hostData.helperRead,
          helperWrite: result.hostData.helperWrite,
          hostDocId: result.hostDocId
        }));
      } catch (e) {}
      window.location.href = "/support/chats/";
    } else {
      // Not allowed — sign out & show error
      hideLoading();
      if (result.reason === "no-host") {
        loginError.textContent = "No host account found for this email";
      } else if (result.reason === "not-verified") {
        loginError.textContent = "Your host account is not verified yet";
      } else if (result.reason === "no-read") {
        loginError.textContent = "You do not have helper access. Contact admin.";
      } else {
        loginError.textContent = "Access denied: " + (result.reason || "unknown");
      }
      loginError.style.display = "block";
      signOutUser();
    }
  }).catch(function(err) {
    hideLoading();
  });
});

// ============ LOGIN HANDLER ============
async function handleLogin() {
  var email = helperEmail.value.trim();
  var password = helperPassword.value;
  if (!email) { loginError.textContent = "Enter your gmail"; loginError.style.display = "block"; return; }
  if (!password) { loginError.textContent = "Enter your password"; loginError.style.display = "block"; return; }

  loginBtn.textContent = "Signing in...";
  loginBtn.disabled = true;
  loginError.style.display = "none";
  showLoading();

  var result = await signInWithEmail(email, password);
  if (result.user) {
    // onAuthChange (above) will fire and handle the rest
    // It will redirect to chats if permission OK
  } else {
    hideLoading();
    loginError.textContent = result.error || "Invalid credentials";
    loginError.style.display = "block";
    loginBtn.textContent = "Sign In as Helper";
    loginBtn.disabled = false;
  }
}

// Event listeners
loginBtn.addEventListener("click", handleLogin);
helperPassword.addEventListener("keypress", function(e) { if (e.key === "Enter") handleLogin(); });
helperEmail.addEventListener("keypress", function(e) { if (e.key === "Enter") helperPassword.focus(); });

// ============ REGISTER SERVICE WORKER ============
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/support/sw.js').then(function(reg) {
      // SW registered
    }).catch(function(err) {
      // SW registration failed — non-fatal
    });
  });
}

// ============ LOADING OVERLAY ============
function showLoading() {
  var overlay = document.getElementById("loadingOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "loadingOverlay";
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,17,23,0.7);display:flex;align-items:center;justify-content:center;z-index:99999;";
    overlay.innerHTML = '<div style="width:40px;height:40px;border:3px solid #2a2d42;border-top:3px solid #10b981;border-radius:50%;animation:spin 0.8s linear infinite;"></div>';
    document.body.appendChild(overlay);
    // Inject spin keyframes if not present
    if (!document.getElementById("spinKeyframes")) {
      var style = document.createElement("style");
      style.id = "spinKeyframes";
      style.textContent = "@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}";
      document.head.appendChild(style);
    }
  }
  overlay.style.display = "flex";
}

function hideLoading() {
  var overlay = document.getElementById("loadingOverlay");
  if (overlay) overlay.style.display = "none";
  loginBtn.textContent = "Sign In as Helper";
  loginBtn.disabled = false;
}
