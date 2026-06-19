// ============================================
// EDMFire Support - Firebase Init (shared helpers)
// Same Firebase project — uses /api/firebase-config which already initializes firebase global
// This file just exposes helper functions specific to support page
// ============================================

// Firestore handle — support page needs Firestore (for hosts collection lookup)
function getFirestore() {
  if (!firebase.firestore) {
    console.warn("[SUPPORT] Firestore SDK not loaded");
    return null;
  }
  return firebase.firestore();
}

// RTDB handle
function getRTDB() {
  return firebase.database();
}
