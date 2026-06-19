// ============================================
// EDMFire Support - Host Auth & Permission Logic
// Host logs in with Firebase Auth (email/password).
// Then we verify they have a hosts/{hostId} doc with status="verified" AND helperRead="yes".
//
// IMPORTANT: Hosts CANNOT read their own `hosts/{hostId}` doc directly via
// client-side Firestore (security rules only allow admins). So we fetch the
// profile via the server-side /api/helper-profile endpoint (Firebase Admin
// SDK bypasses security rules). The caller's ID token is verified server-side
// to prevent impersonation.
//
// Permission mirror in RTDB at helpCenter/helperAccess/{authUid} is also
// refreshed on each login — the support chats page listens to this path for
// real-time permission updates (instead of failing Firestore onSnapshot).
// ============================================

// ============ FETCH HOST PROFILE VIA SERVER API ============
// Returns: { hostDocId, hostData } or null
async function fetchHostProfile(authUid) {
  if (!authUid) return null;

  try {
    // Get the caller's current ID token (1-hour validity, auto-refreshed by Firebase)
    var user = firebase.auth().currentUser;
    if (!user) return null;
    var idToken = await user.getIdToken(/* forceRefresh */ false);

    var resp = await fetch("/api/helper-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: idToken }),
    });

    if (!resp.ok) {
      return null;
    }

    var data = await resp.json();
    if (!data.success || !data.found) {
      return null;
    }

    return {
      hostDocId: data.hostDocId,
      hostData: data.hostData || {},
    };
  } catch (err) {
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
    hostDocId: profile.hostDocId,
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
