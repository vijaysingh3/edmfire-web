const admin = require("firebase-admin");

// Firebase Admin SDK initialize karna
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

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // preflight request handle karna
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // sirf POST allow karna
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: "ID token is required" });
    }

    // ID token verify karna
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // custom token create karna same UID ke liye
    const customToken = await admin.auth().createCustomToken(uid);

    return res.status(200).json({ customToken, uid });
  } catch (error) {
    console.error("Custom token error:", error);
    return res.status(401).json({ error: "Invalid token" });
  }
};