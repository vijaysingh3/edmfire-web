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
// admin UID list yaha define karo
const ADMIN_UIDS = [
  "ADMIN_UID_1",
  "ADMIN_UID_2"
];

function checkAdminAccess(user) {
  if (!user) return false;
  return ADMIN_UIDS.includes(user.uid);
}

// auth state listener
function onAuthChange(callback) {
  firebase.auth().onAuthStateChanged(callback);
}

// anonymous sign in (user ke liye)
async function signInAnonymously() {
  try {
    const result = await firebase.auth().signInAnonymously();
    return result.user;
  } catch (error) {
    console.error("Anonymous sign in error:", error);
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
