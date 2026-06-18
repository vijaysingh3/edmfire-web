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
const NOTIF_DEBOUNCE_MS = 3000;
const debounceMap = new Map();

// Helper: Build absolute URL from request + relative path
// FCM webpush.fcmOptions.link ko ABSOLUTE URL chahiye — relative nahi chalta
function buildAbsoluteUrl(req, path) {
  // Vercel pe x-forwarded-proto aur x-forwarded-host set hote hain
  var proto = req.headers["x-forwarded-proto"] || (req.connection && req.connection.encrypted ? "https" : "http");
  var host = req.headers["x-forwarded-host"] || req.headers["host"] || "edmfire.in";
  return proto + "://" + host + path;
}

// Helper: send to single FCM token with proper webpush payload
// Returns { success, error, token }
async function sendToToken(token, notifTitle, notifBody, dataPayload, clickUrl) {
  var absoluteLink = "";
  try {
    absoluteLink = buildAbsoluteUrl({}, clickUrl);
  } catch (e) {
    absoluteLink = clickUrl;
  }

  // SIMPLIFIED + VALID Webpush payload
  // NOTE: webpush.notification me click_action INVALID hai — use fcmOptions.link
  // NOTE: icon paths sirf unhi files ke liye use karo jo actually exist karti hain
  var message = {
    token: token,
    notification: {
      title: notifTitle,
      body: notifBody
    },
    data: dataPayload,
    webpush: {
      notification: {
        title: notifTitle,
        body: notifBody,
        tag: "edmfire-admin-chat",
        requireInteraction: false,
        // NOTE: icon deliberately omitted — agar file exist nahi karti toh
        // kuch browsers (especially Chrome on some setups) silently fail karte hain
        // Chrome default FCM icon use karega
      },
      fcmOptions: {
        link: absoluteLink
      }
    }
  };

  try {
    var messageId = await admin.messaging().send(message);
    return { success: true, messageId: messageId, token: token.substring(0, 20) + "..." };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      errorCode: err.code || "unknown",
      token: token.substring(0, 20) + "..."
    };
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { uid, title, body, target, userUid, senderUid } = req.body || {};

    const notifTarget = target || "user";
    const notifTitle = title || "New Message";
    const notifBody = body || "You have a new support message";

    console.log("[NOTIF] Request received:", {
      target: notifTarget,
      uid: uid,
      userUid: userUid,
      senderUid: senderUid,
      title: notifTitle,
      body: notifBody
    });

    // Build data payload — saari values STRING honi chahiye (FCM requirement)
    var dataPayload = {
      type: "support_message",
      title: String(notifTitle),
      body: String(notifBody)
    };
    if (uid) dataPayload.uid = String(uid);
    if (userUid) dataPayload.userUid = String(userUid);
    if (senderUid) dataPayload.senderUid = String(senderUid);

    // ============ DEBOUNCE CHECK (admin notifications only) ============
    if (notifTarget === "allAdmins" || notifTarget === "admin") {
      const debounceKey = senderUid || userUid || uid || "anonymous";
      const now = Date.now();
      const last = debounceMap.get(debounceKey);
      if (last && (now - last) < NOTIF_DEBOUNCE_MS) {
        console.log("[NOTIF] Debounced — too soon for", debounceKey);
        return res.status(200).json({
          sent: false,
          reason: "Debounced — too soon after last notification",
          retryAfter: NOTIF_DEBOUNCE_MS - (now - last)
        });
      }
      debounceMap.set(debounceKey, now);
    }

    // ============ TARGET: USER (existing behavior) ============
    if (notifTarget === "user") {
      if (!uid) return res.status(400).json({ error: "uid is required for target=user" });

      const snapshot = await admin.database().ref("helpCenter/users/" + uid + "/fcmToken").once("value");
      const fcmToken = snapshot.val();

      if (!fcmToken) {
        console.log("[NOTIF] No FCM token for user:", uid);
        return res.status(200).json({ sent: false, reason: "No FCM token for user" });
      }

      console.log("[NOTIF] Sending to user:", uid, "token:", fcmToken.substring(0, 20) + "...");
      var userResult = await sendToToken(fcmToken, notifTitle, notifBody, dataPayload, "/user/");

      console.log("[NOTIF] User send result:", userResult);
      return res.status(200).json({
        sent: userResult.success,
        target: "user",
        uid: uid,
        result: userResult
      });
    }

    // ============ TARGET: ALL ADMINS (broadcast) ============
    if (notifTarget === "allAdmins") {
      const adminsSnapshot = await admin.database().ref("helpCenter/admins").once("value");
      const adminsData = adminsSnapshot.val();

      console.log("[NOTIF] Admins in RTDB:", adminsData ? Object.keys(adminsData).length : 0, "admins");

      if (!adminsData) {
        return res.status(200).json({ sent: false, reason: "No admins registered in RTDB" });
      }

      // Collect admin info
      var adminList = [];
      for (const [adminUid, adminInfo] of Object.entries(adminsData)) {
        if (adminInfo && adminInfo.fcmToken && typeof adminInfo.fcmToken === "string") {
          adminList.push({
            uid: adminUid,
            email: adminInfo.email || "",
            token: adminInfo.fcmToken
          });
        }
      }

      console.log("[NOTIF] Admins with valid FCM tokens:", adminList.length);

      if (adminList.length === 0) {
        return res.status(200).json({ sent: false, reason: "No admin FCM tokens registered" });
      }

      // Build click URL for deep-link
      var clickUrl = "/admin/chats/" + (userUid ? "?uid=" + userUid : "");

      // Send to each admin INDIVIDUALLY (more reliable than multicast, works with all SDK versions)
      var sendPromises = adminList.map(function(admin) {
        return sendToToken(admin.token, notifTitle, notifBody, dataPayload, clickUrl).then(function(result) {
          return Object.assign({ adminUid: admin.uid, adminEmail: admin.email }, result);
        });
      });

      var results = await Promise.all(sendPromises);

      var successCount = results.filter(function(r) { return r.success; }).length;
      var failureCount = results.length - successCount;

      console.log("[NOTIF] Admin broadcast results:", {
        total: results.length,
        success: successCount,
        failure: failureCount,
        details: results
      });

      return res.status(200).json({
        sent: successCount > 0,
        target: "allAdmins",
        successCount: successCount,
        failureCount: failureCount,
        totalAdmins: results.length,
        results: results
      });
    }

    // ============ TARGET: SINGLE ADMIN ============
    if (notifTarget === "admin") {
      if (!uid) return res.status(400).json({ error: "uid (admin uid) is required for target=admin" });

      const snapshot = await admin.database().ref("helpCenter/admins/" + uid + "/fcmToken").once("value");
      const fcmToken = snapshot.val();

      if (!fcmToken) {
        return res.status(200).json({ sent: false, reason: "No FCM token for admin" });
      }

      var adminClickUrl = "/admin/chats/" + (userUid ? "?uid=" + userUid : "");
      var singleResult = await sendToToken(fcmToken, notifTitle, notifBody, dataPayload, adminClickUrl);

      return res.status(200).json({
        sent: singleResult.success,
        target: "admin",
        uid: uid,
        result: singleResult
      });
    }

    return res.status(400).json({ error: "Invalid target. Must be 'user', 'admin', or 'allAdmins'" });
  } catch (error) {
    console.error("[NOTIF] Send notification FATAL error:", error);
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
};
