// ============================================
// EDMFire Support - Host Auth & Permission Logic
// Host logs in with Firebase Auth (email/password).
// Then we verify they have a hosts/{hostId} doc with status="verified" AND helperRead="yes".
// Permission mirror in RTDB at helpCenter/helperAccess/{authUid} for fast security rule checks.
// ============================================

// ============ FETCH HOST PROFILE BY AUTH UID ============
// Returns: { hostDocId, hostData } or null
async function fetchHostProfile(authUid) {
  if (!authUid) return null;
  var db = getFirestore();
  if (!db) return null;

  try {
    // hosts collection me authUid field se query
    var q = db.collection("hosts").where("authUid", "==", authUid).limit(1);
    var snap = await q.get();

    if (snap.empty) return null;

    var doc = snap.docs[0];
    return {
      hostDocId: doc.id,
      hostData: doc.data() || {}
    };
  } catch (err) {
    console.error("[SUPPORT-AUTH] fetchHostProfile error:", err);
    return null;
  }
}

// ============ CHECK HELPER PERMISSION ============
// Returns: { allowed: bool, reason?: string, hostData?: {}, hostDocId?: string }
async function checkHelperPermission(user) {
  if (!user) return { allowed: false, reason: "no-user" };

  var profile = await fetchHostProfile(user.uid);
  if (!profile) {
    return { allowed: false, reason: "no-host" };
  }

  var data = profile.hostData;

  // Must be verified
  if (data.status !== "verified") {
    return { allowed: false, reason: "not-verified" };
  }

  // helperRead must be "yes"
  if (data.helperRead !== "yes") {
    return { allowed: false, reason: "no-read" };
  }

  return {
    allowed: true,
    hostData: data,
    hostDocId: profile.hostDocId
  };
}

// ============ GET CURRENT HELPER INFO ============
// Reads from localStorage (set at login time, refreshed by chats page)
function getCurrentHelperInfo() {
  try {
    var raw = localStorage.getItem("edmfire_helper_info");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// ============ CLEAR HELPER INFO ============
function clearHelperInfo() {
  try {
    localStorage.removeItem("edmfire_helper_info");
  } catch (e) {}
}

// ============ HOST LOGOUT ============
function handleHostLogout() {
  clearHelperInfo();
  signOutUser().then(function() {
    window.location.href = "/support/";
  });
}
