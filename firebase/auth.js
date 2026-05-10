// Firebase Auth helper functions

// current user get karna
function getCurrentUser() {
  return new Promise((resolve, reject) => {
    const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    }, reject);
  });
}

// admin access check karna
// admin UID list - EDMFire admin accounts
// NAYA ADMIN UID YHA ADD KARO (Firebase Console me user banane ke baad jo UID mile)
const ADMIN_UIDS = [
  "UWSPOJ48pnXHAbizdNIHHaMWsRm2"
];

function checkAdminAccess(user) {
  if (!user) return false;
  return ADMIN_UIDS.includes(user.uid);
}

// auth state listener
function onAuthChange(callback) {
  firebase.auth().onAuthStateChanged(callback);
}

// custom token se sign in karna (Android WebView ke liye)
async function signInWithCustomToken(token) {
  try {
    const result = await firebase.auth().signInWithCustomToken(token);
    return { user: result.user, error: null };
  } catch (error) {
    console.error("Custom token sign in error:", error);
    return { user: null, error: error.message };
  }
}

// email/password sign in (admin ke liye) - detailed error return karna
async function signInWithEmail(email, password) {
  try {
    const result = await firebase.auth().signInWithEmailAndPassword(email, password);
    return { user: result.user, error: null };
  } catch (error) {
    let errorMsg = "Login failed";
    switch (error.code) {
      case "auth/user-not-found":
        errorMsg = "No account found with this email";
        break;
      case "auth/wrong-password":
        errorMsg = "Wrong password";
        break;
      case "auth/invalid-email":
        errorMsg = "Invalid email format";
        break;
      case "auth/invalid-credential":
        errorMsg = "Wrong email or password";
        break;
      case "auth/too-many-requests":
        errorMsg = "Too many attempts. Try again later";
        break;
      case "auth/network-request-failed":
        errorMsg = "Network error. Check your connection";
        break;
      default:
        errorMsg = error.message || "Login failed";
    }
    console.error("Email sign in error:", error.code, errorMsg);
    return { user: null, error: errorMsg };
  }
}

// sign out
async function signOutUser() {
  try {
    await firebase.auth().signOut();
    return true;
  } catch (error) {
    console.error("Sign out error:", error);
    return false;
  }
}