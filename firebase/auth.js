// Firebase Auth helper functions

var ADMIN_UIDS = ["UWSPOJ48pnXHAbizdNIHHaMWsRm2"];

function checkAdminAccess(user) {
  if (!user) return false;
  return ADMIN_UIDS.indexOf(user.uid) !== -1;
}

function getCurrentUser() {
  return new Promise(function(resolve, reject) {
    var unsubscribe = firebase.auth().onAuthStateChanged(function(user) {
      unsubscribe();
      resolve(user);
    }, reject);
  });
}

function onAuthChange(callback) {
  firebase.auth().onAuthStateChanged(callback);
}

function signInWithCustomToken(token) {
  return firebase.auth().signInWithCustomToken(token).then(function(result) {
    return { user: result.user, error: null };
  }).catch(function(error) {
    console.error("Custom token sign in error:", error);
    return { user: null, error: error.message };
  });
}

function signInWithEmail(email, password) {
  return firebase.auth().signInWithEmailAndPassword(email, password).then(function(result) {
    return { user: result.user, error: null };
  }).catch(function(error) {
    var errorMsg = "Login failed";
    if (error.code === "auth/user-not-found") errorMsg = "No account found";
    else if (error.code === "auth/wrong-password") errorMsg = "Wrong password";
    else if (error.code === "auth/invalid-credential") errorMsg = "Wrong email or password";
    else if (error.code === "auth/too-many-requests") errorMsg = "Too many attempts";
    else errorMsg = error.message || "Login failed";
    return { user: null, error: errorMsg };
  });
}

function signOutUser() {
  return firebase.auth().signOut().then(function() { return true; }).catch(function() { return false; });
}