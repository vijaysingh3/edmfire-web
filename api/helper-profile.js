/**
 * Helper Profile API - Vercel Serverless Function
 * =================================================
 * Problem:
 *   Support page (logged-in host) tries to query `hosts` collection from
 *   the client. But Firestore security rules only allow ADMIN to read
 *   `hosts` — hosts themselves cannot read their own profile directly,
 *   so the support page throws "Missing or insufficient permissions".
 *
 * Solution:
 *   This server-side endpoint uses Firebase Admin SDK (which bypasses
 *   Firestore security rules) to fetch the host's own profile.
 *   Caller must send their Firebase ID token — we verify it server-side
 *   so an attacker cannot query another user's host profile.
 *
 * Endpoint:
 *   POST /api/helper-profile
 *   Body: { "idToken": "<firebase-id-token>" }
 *
 * Response (host found):
 *   { success: true, found: true, hostDocId: "...", hostData: { fullName, gmail, status, helperRead, helperWrite, authUid } }
 *
 * Response (no host doc):
 *   { success: true, found: false }
 *
 * Side-effect:
 *   Mirrors helperRead / helperWrite to RTDB helpCenter/helperAccess/{authUid}
 *   so the support page's real-time RTDB listener has fresh permission data.
 */

const admin = require("firebase-admin");

// Firebase Admin SDK initialize
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

// CORS headers
function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async (req, res) => {
  setCORS(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { idToken } = req.body || {};

    if (!idToken || typeof idToken !== "string" || idToken.length < 50) {
      return res.status(400).json({ error: "Missing or invalid idToken" });
    }

    // 1. Verify the caller's ID token — proves they are genuinely signed in
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (verifyErr) {
      console.warn("[HELPER-PROFILE] Token verification failed:", verifyErr.message);
      return res.status(401).json({ error: "Invalid or expired token", code: "auth-invalid-token" });
    }

    const authUid = decoded.uid;
    console.log("[HELPER-PROFILE] Verified caller uid:", authUid);

    // 2. Fetch host doc by authUid (Admin SDK bypasses Firestore rules)
    const snap = await admin
      .firestore()
      .collection("hosts")
      .where("authUid", "==", authUid)
      .limit(1)
      .get();

    if (snap.empty) {
      console.log("[HELPER-PROFILE] No host doc for uid:", authUid);
      return res.status(200).json({ success: true, found: false });
    }

    const doc = snap.docs[0];
    const data = doc.data() || {};

    // 3. Mirror permissions to RTDB helpCenter/helperAccess/{authUid}
    //    so the support page's RTDB listener (which replaced the failing
    //    Firestore onSnapshot listener) has fresh permission data.
    try {
      await admin.database().ref("helpCenter/helperAccess/" + authUid).set({
        helperRead: data.helperRead === "yes" ? "yes" : "no",
        helperWrite: data.helperWrite === "yes" ? "yes" : "no",
        hostDocId: doc.id,
        fullName: data.fullName || "",
        gmail: data.gmail || "",
        status: data.status || "",
        lastUpdated: Date.now(),
        lastLogin: Date.now(),
      });
    } catch (mirrorErr) {
      console.warn("[HELPER-PROFILE] RTDB mirror error (non-fatal):", mirrorErr.message);
      // Non-fatal — Firestore is source of truth, RTDB is just for fast checks
    }

    // 4. Return host profile (only fields the support page needs — never password etc.)
    return res.status(200).json({
      success: true,
      found: true,
      hostDocId: doc.id,
      hostData: {
        fullName: data.fullName || "",
        gmail: data.gmail || "",
        authUid: data.authUid || authUid,
        mobile: data.mobile || "",
        state: data.state || "",
        status: data.status || "",
        helperRead: data.helperRead === "yes" ? "yes" : "no",
        helperWrite: data.helperWrite === "yes" ? "yes" : "no",
      },
    });
  } catch (error) {
    console.error("[HELPER-PROFILE] Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
};
