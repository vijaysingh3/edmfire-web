// ============================================
// EDMFire Admin - Login Page Logic
// ============================================

var loginBtn = document.getElementById("loginBtn");
var loginError = document.getElementById("loginError");
var adminEmail = document.getElementById("adminEmail");
var adminPassword = document.getElementById("adminPassword");

// Check if already logged in → redirect to dashboard
onAuthChange(function(user) {
  if (user && checkAdminAccess(user)) {
    window.location.href = "/admin/dashboard/";
  }
});

// Login handler
async function handleLogin() {
  var email = adminEmail.value.trim();
  var password = adminPassword.value;
  if (!email) { loginError.textContent = "Enter your email"; loginError.style.display = "block"; return; }
  if (!password) { loginError.textContent = "Enter your password"; loginError.style.display = "block"; return; }

  loginBtn.textContent = "Signing in...";
  loginBtn.disabled = true;
  loginError.style.display = "none";

  var result = await signInWithEmail(email, password);
  if (result.user) {
    if (checkAdminAccess(result.user)) {
      window.location.href = "/admin/dashboard/";
    } else {
      loginError.textContent = "Access denied - not an admin account";
      loginError.style.display = "block";
      loginBtn.textContent = "Sign In";
      loginBtn.disabled = false;
      signOutUser();
    }
  } else {
    loginError.textContent = result.error || "Invalid credentials";
    loginError.style.display = "block";
    loginBtn.textContent = "Sign In";
    loginBtn.disabled = false;
  }
}

// Event listeners
loginBtn.addEventListener("click", handleLogin);
adminPassword.addEventListener("keypress", function(e) { if (e.key === "Enter") handleLogin(); });
adminEmail.addEventListener("keypress", function(e) { if (e.key === "Enter") adminPassword.focus(); });
