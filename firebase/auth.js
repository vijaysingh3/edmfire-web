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

// custom token se sign in karna (Android WebView se token aayega)
async function signInWithCustomToken(token) {
  try {
    const result = await firebase.auth().signInWithCustomToken(token);
    return result.user;
  } catch (error) {
    console.error("Custom token sign in error:", error);
    return null;
  }
}

// email/password sign in (admin ke liye)
async function signInWithEmail(email, password) {
  try {
    const result = await firebase.auth().signInWithEmailAndPassword(email, password);
    return result.user;
  } catch (error) {
    console.error("Email sign in error:", error);
    return null;
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