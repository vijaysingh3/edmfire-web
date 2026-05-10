// Firebase Auth helper functions

// admin UID list - EDMFire admin accounts
var ADMIN_UIDS = [
  "UWSPOJ48pnXHAbizdNIHHaMWsRm2"
];

function checkAdminAccess(user) {
  if (!user) return false;
  return ADMIN_UIDS.indexOf(user.uid) !== -1;
}

// current user get karna
function getCurrentUser() {
  return new Promise(function(resolve, reject) {
    var unsubscribe = firebase.auth().onAuthStateChanged(function(user) {
      unsubscribe();
      resolve(user);
    }, reject);
  });
}

// auth state listener
function onAuthChange(callback) {
  firebase.auth().onAuthStateChanged(callback);
}

// custom token se sign in karna (Android WebView ke liye)
function signInWithCustomToken(token) {
  return firebase.auth().signInWithCustomToken(token).then(function(result) {
    return { user: result.user, error: null };
  }).catch(function(error) {
    console.error("Custom token sign in error:", error);
    return { user: null, error: error.message };
  });
}

// email/password sign in (admin ke liye)
function signInWithEmail(email, password) {
  return firebase.auth().signInWithEmailAndPassword(email, password).then(function(result) {
    return { user: result.user, error: null };
  }).catch(function(error) {
    var errorMsg = "Login failed";
    if (error.code === "auth/user-not-found") errorMsg = "No account found with this email";
    else if (error.code === "auth/wrong-password") errorMsg = "Wrong password";
    else if (error.code === "auth/invalid-email") errorMsg = "Invalid email format";
    else if (error.code === "auth/invalid-credential") errorMsg = "Wrong email or password";
    else if (error.code === "auth/too-many-requests") errorMsg = "Too many attempts. Try again later";
    else if (error.code === "auth/network-request-failed") errorMsg = "Network error. Check your connection";
    else errorMsg = error.message || "Login failed";
    console.error("Email sign in error:", error.code, errorMsg);
    return { user: null, error: errorMsg };
  });
}

// sign out
function signOutUser() {
  return firebase.auth().signOut().then(function() {
    return true;
  }).catch(function(error) {
    console.error("Sign out error:", error);
    return false;
  });
}