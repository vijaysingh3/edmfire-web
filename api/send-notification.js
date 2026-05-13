const admin = require("firebase-admin");

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
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { uid, title, body } = req.body;
    if (!uid) return res.status(400).json({ error: "UID required" });

    // FCM token RTDB se nikalna
    const snapshot = await admin.database().ref("helpCenter/users/" + uid + "/fcmToken").once("value");
    const fcmToken = snapshot.val();

    if (!fcmToken) {
      return res.status(200).json({ sent: false, reason: "No FCM token" });
    }

    // notification bhejna
    await admin.messaging().send({
      token: fcmToken,
      notification: {
        title: title || "New Message",
        body: body || "You have a new support message",
      },
      data: {
        type: "support_message",
        uid: uid,
      },
      android: {
        notification: {
          channelId: "support_messages",
          clickAction: "HELP_CENTER_ACTIVITY",
        },
      },
    });

    return res.status(200).json({ sent: true });
  } catch (error) {
    console.error("Send notification error:", error);
    return res.status(500).json({ error: error.message });
  }
};