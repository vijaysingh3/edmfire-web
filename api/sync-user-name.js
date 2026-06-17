/**
 * Sync User Name API - Vercel Serverless Function
 * =================================================
 * Ye function:
 *   1. Firestore se user ka UserName fetch karta hai (Users/{uid})
 *   2. Use RTDB helpCenter/users/{uid} me save karta hai (UserName + username dono)
 *
 * Purpose:
 *   User-side chat load hone par ye API background me call hoti hai.
 *   UserName RTDB me store ho jata hai, jisse admin panel chat me
 *   direct RTDB se username display ho sake — bina Firestore fetch ke.
 *
 * Endpoint:
 *   POST /api/sync-user-name
 *   Body: { "uid": "<firebase-uid>" }
 *   Response: { success: true, userName: "Rajesh Kumar" }
 *             { success: true, userName: null, message: "No Firestore document" }
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
    const { uid } = req.body || {};

    if (!uid || typeof uid !== "string" || uid.length < 10) {
      return res.status(400).json({ error: "Valid uid is required" });
    }

    console.log("[SYNC-NAME] Fetching UserName from Firestore for uid:", uid);

    // 1. Firestore se user document fetch karo
    const doc = await admin.firestore().collection("Users").doc(uid).get();

    if (!doc.exists) {
      console.log("[SYNC-NAME] No Firestore document found for uid:", uid);
      return res.status(200).json({
        success: true,
        userName: null,
        message: "No Firestore document found",
      });
    }

    const data = doc.data();

    // 2. Multiple field name variants try karo (Firestore convention capital UserName)
    const userName =
      data.UserName ||
      data.username ||
      data.name ||
      data.displayName ||
      data.Name ||
      data.fullName ||
      "";

    if (!userName || typeof userName !== "string") {
      console.log("[SYNC-NAME] No UserName field found in Firestore doc for uid:", uid);
      return res.status(200).json({
        success: true,
        userName: null,
        message: "No UserName field in Firestore document",
      });
    }

    console.log("[SYNC-NAME] Found UserName:", userName, "for uid:", uid);

    // 3. RTDB helpCenter/users/{uid} me save karo
    // Dono variants save karte hain:
    //   - UserName (capital, Firestore convention — user expectation)
    //   - username (lowercase, backwards compat with existing admin code)
    const updates = {
      UserName: userName,
      username: userName,
    };

    await admin.database().ref("helpCenter/users/" + uid).update(updates);

    console.log("[SYNC-NAME] Successfully saved UserName to RTDB for uid:", uid);

    return res.status(200).json({
      success: true,
      userName: userName,
    });
  } catch (error) {
    console.error("[SYNC-NAME] Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
};
