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

// In-memory debounce: same senderUid ke notifications ko 3 sec window me merge karte hain
// Taaki agar user rapid messages bheje toh admin ko spam na mile
const NOTIF_DEBOUNCE_MS = 3000;
const debounceMap = new Map(); // key: senderUid → { lastSent: timestamp }

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { uid, title, body, target, userUid, senderUid } = req.body;

    // target: "user" (default, existing behavior) | "admin" (single admin) | "allAdmins" (broadcast)
    const notifTarget = target || "user";

    // ============ DEBOUNCE CHECK (admin notifications only) ============
    // Agar senderUid diya gaya hai aur admin ko bhej rahe hain, toh 3 sec debounce lagao
    // Same user ka next notification 3 sec baad hi jayega
    if (notifTarget === "allAdmins" || notifTarget === "admin") {
      const debounceKey = senderUid || userUid || uid || "anonymous";
      const now = Date.now();
      const last = debounceMap.get(debounceKey);
      if (last && (now - last) < NOTIF_DEBOUNCE_MS) {
        return res.status(200).json({
          sent: false,
          reason: "Debounced — too soon after last notification",
          retryAfter: NOTIF_DEBOUNCE_MS - (now - last)
        });
      }
      debounceMap.set(debounceKey, now);
    }

    // ============ BUILD NOTIFICATION PAYLOAD ============
    const notifTitle = title || "New Message";
    const notifBody = body || "You have a new support message";

    // Data payload — for click action handling on client side
    const dataPayload = {
      type: "support_message",
      title: notifTitle,
      body: notifBody,
    };
    if (uid) dataPayload.uid = uid;
    if (userUid) dataPayload.userUid = userUid;
    if (senderUid) dataPayload.senderUid = senderUid;

    const androidConfig = {
      notification: {
        channelId: "support_messages",
        clickAction: "HELP_CENTER_ACTIVITY",
      },
    };

    // ============ TARGET: USER (existing behavior) ============
    if (notifTarget === "user") {
      if (!uid) return res.status(400).json({ error: "uid is required for target=user" });

      const snapshot = await admin.database().ref("helpCenter/users/" + uid + "/fcmToken").once("value");
      const fcmToken = snapshot.val();

      if (!fcmToken) {
        return res.status(200).json({ sent: false, reason: "No FCM token for user" });
      }

      await admin.messaging().send({
        token: fcmToken,
        notification: { title: notifTitle, body: notifBody },
        data: dataPayload,
        android: androidConfig,
      });

      return res.status(200).json({ sent: true, target: "user", uid: uid });
    }

    // ============ TARGET: ALL ADMINS (broadcast — preferred) ============
    if (notifTarget === "allAdmins") {
      const adminsSnapshot = await admin.database().ref("helpCenter/admins").once("value");
      const adminsData = adminsSnapshot.val();

      if (!adminsData) {
        return res.status(200).json({ sent: false, reason: "No admins registered" });
      }

      // Collect all valid FCM tokens
      const tokens = [];
      const adminUids = [];
      for (const [adminUid, adminInfo] of Object.entries(adminsData)) {
        if (adminInfo && adminInfo.fcmToken && typeof adminInfo.fcmToken === "string") {
          tokens.push(adminInfo.fcmToken);
          adminUids.push(adminUid);
        }
      }

      if (tokens.length === 0) {
        return res.status(200).json({ sent: false, reason: "No admin FCM tokens registered" });
      }

      // Use multicast for efficiency (single API call for up to 500 tokens)
      const multicastMessage = {
        tokens: tokens,
        notification: { title: notifTitle, body: notifBody },
        data: dataPayload,
        android: androidConfig,
        webpush: {
          notification: {
            title: notifTitle,
            body: notifBody,
            icon: "/admin/icon-192.png",
            badge: "/admin/badge-72.png",
            tag: "edmfire-admin-chat",
            requireInteraction: false,
            click_action: "/admin/chats/" + (userUid ? "?uid=" + userUid : ""),
          },
          fcmOptions: {
            link: "/admin/chats/" + (userUid ? "?uid=" + userUid : ""),
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(multicastMessage);

      return res.status(200).json({
        sent: true,
        target: "allAdmins",
        successCount: response.successCount,
        failureCount: response.failureCount,
        totalAdmins: tokens.length,
      });
    }

    // ============ TARGET: SINGLE ADMIN (legacy/single) ============
    if (notifTarget === "admin") {
      if (!uid) return res.status(400).json({ error: "uid (admin uid) is required for target=admin" });

      const snapshot = await admin.database().ref("helpCenter/admins/" + uid + "/fcmToken").once("value");
      const fcmToken = snapshot.val();

      if (!fcmToken) {
        return res.status(200).json({ sent: false, reason: "No FCM token for admin" });
      }

      await admin.messaging().send({
        token: fcmToken,
        notification: { title: notifTitle, body: notifBody },
        data: dataPayload,
        android: androidConfig,
        webpush: {
          notification: {
            title: notifTitle,
            body: notifBody,
            icon: "/admin/icon-192.png",
            badge: "/admin/badge-72.png",
            tag: "edmfire-admin-chat",
            requireInteraction: false,
            click_action: "/admin/chats/" + (userUid ? "?uid=" + userUid : ""),
          },
          fcmOptions: {
            link: "/admin/chats/" + (userUid ? "?uid=" + userUid : ""),
          },
        },
      });

      return res.status(200).json({ sent: true, target: "admin", uid: uid });
    }

    return res.status(400).json({ error: "Invalid target. Must be 'user', 'admin', or 'allAdmins'" });
  } catch (error) {
    console.error("Send notification error:", error);
    return res.status(500).json({ error: error.message });
  }
};
