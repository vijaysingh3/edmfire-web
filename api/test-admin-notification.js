/**
 * Test Admin Notification API
 * ============================
 * Admin browser me direct URL khol ke test kar sakta hai:
 *   https://your-domain.com/api/test-admin-notification
 *
 * Ye endpoint:
 *   1. RTDB me kaun se admins registered hain, list karta hai
 *   2. Har admin ko ek test notification bhejta hai
 *   3. Detailed result return karta hai (success/failure per token)
 *
 * Browser me khole to GET request — result JSON dikhega
 */

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

function buildAbsoluteUrl(req, path) {
  var proto = req.headers["x-forwarded-proto"] || (req.connection && req.connection.encrypted ? "https" : "http");
  var host = req.headers["x-forwarded-host"] || req.headers["host"] || "edmfire.in";
  return proto + "://" + host + path;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  // GET = run test, POST = run test with custom body
  try {
    var customTitle = "Test Notification from EDMFire";
    var customBody = "Yeh ek test notification hai. Agar ye dikh raha hai to FCM kaam kar raha hai!";
    var customUid = "";

    if (req.method === "POST" && req.body) {
      if (req.body.title) customTitle = req.body.title;
      if (req.body.body) customBody = req.body.body;
      if (req.body.uid) customUid = req.body.uid;
    }

    // 1. RTDB se saare admins fetch karo
    var adminsSnapshot = await admin.database().ref("helpCenter/admins").once("value");
    var adminsData = adminsSnapshot.val();

    if (!adminsData) {
      return res.status(200).json({
        success: false,
        message: "RTDB helpCenter/admins me koi admin registered nahi hai",
        steps: [
          "1. Admin panel pe login karo (https://your-domain.com/admin/)",
          "2. Browser se notification permission allow karo",
          "3. Check karo ki /admin/common/nav.js me initAdminFCM() chal raha hai (console logs)",
          "4. Vercel env var FB_VAPID_KEY set hai ya nahi check karo",
          "5. Firebase Console me Web Push certificate generate hai ya nahi check karo"
        ]
      });
    }

    // 2. Admin list prepare karo
    var adminList = [];
    for (const [adminUid, adminInfo] of Object.entries(adminsData)) {
      adminList.push({
        uid: adminUid,
        email: adminInfo.email || "",
        hasFcmToken: !!(adminInfo.fcmToken && typeof adminInfo.fcmToken === "string"),
        fcmTokenPreview: adminInfo.fcmToken ? (adminInfo.fcmToken.substring(0, 30) + "...") : null,
        lastActive: adminInfo.lastActive || null,
        lastTokenUpdate: adminInfo.lastTokenUpdate || null
      });
    }

    // 3. Sirf un admins ko bhejo jinka FCM token hai
    var sendableAdmins = adminList.filter(function(a) { return a.hasFcmToken; });

    if (sendableAdmins.length === 0) {
      return res.status(200).json({
        success: false,
        message: "Admins registered hain par kisi ka FCM token nahi hai",
        admins: adminList,
        fix: "Admin browser me wapas login karo — nav.js ka initAdminFCM() fir se chalna chahiye"
      });
    }

    // 4. Build click URL (absolute)
    var clickUrl = customUid ? "/admin/chats/?uid=" + customUid : "/admin/chats/";
    var absoluteLink = buildAbsoluteUrl(req, clickUrl);

    // 5. Send test notification to each admin individually
    var results = [];
    for (var i = 0; i < sendableAdmins.length; i++) {
      var adminUser = sendableAdmins[i];
      // Get fresh token from RTDB (since preview is truncated)
      var tokenSnapshot = await admin.database().ref("helpCenter/admins/" + adminUser.uid + "/fcmToken").once("value");
      var token = tokenSnapshot.val();

      if (!token) {
        results.push({
          adminUid: adminUser.uid,
          email: adminUser.email,
          success: false,
          error: "Token not found in fresh fetch"
        });
        continue;
      }

      var message = {
        token: token,
        notification: {
          title: customTitle,
          body: customBody
        },
        data: {
          type: "test_notification",
          title: customTitle,
          body: customBody,
          timestamp: String(Date.now())
        },
        webpush: {
          notification: {
            title: customTitle,
            body: customBody,
            tag: "edmfire-admin-test",
            requireInteraction: true  // Test notification ko lamba rakho taaki miss na ho
          },
          fcmOptions: {
            link: absoluteLink
          }
        }
      };

      try {
        var messageId = await admin.messaging().send(message);
        results.push({
          adminUid: adminUser.uid,
          email: adminUser.email,
          success: true,
          messageId: messageId,
          tokenPreview: token.substring(0, 30) + "..."
        });
        console.log("[TEST-NOTIF] SUCCESS for", adminUser.email, "messageId:", messageId);
      } catch (err) {
        results.push({
          adminUid: adminUser.uid,
          email: adminUser.email,
          success: false,
          error: err.message,
          errorCode: err.code || "unknown",
          tokenPreview: token.substring(0, 30) + "..."
        });
        console.error("[TEST-NOTIF] FAILED for", adminUser.email, ":", err.message);
      }
    }

    var successCount = results.filter(function(r) { return r.success; }).length;
    var failureCount = results.length - successCount;

    return res.status(200).json({
      success: successCount > 0,
      message: successCount > 0
        ? "Test notification bhej diya! Check karo browser me notification aaya ya nahi."
        : "Sab admins ko bhejne me failure. Detailed error neeche dekho.",
      summary: {
        totalAdmins: adminList.length,
        sendableAdmins: sendableAdmins.length,
        successCount: successCount,
        failureCount: failureCount
      },
      clickUrl: absoluteLink,
      admins: adminList,
      sendResults: results,
      troubleshooting: failureCount > 0 ? [
        "1. Check karo Vercel env var FB_VAPID_KEY set hai (Firebase Console se VAPID key)",
        "2. Admin browser me notification permission 'Allow' hai (browser settings me check karo)",
        "3. Service Worker registered hai ya nahi check karo (DevTools → Application → Service Workers)",
        "4. Browser refresh karke wapas login karo — token refresh ho jayega",
        "5. Agar error 'Requested entity not found' hai — token expired hai, admin logout+login karo",
        "6. Agar error 'registration-token-not-registered' — token revoked hai, browser me site data clear karo + wapas login",
        "7. Console logs check karo admin panel me ([ADMIN-FCM] messages)"
      ] : null
    });
  } catch (error) {
    console.error("[TEST-NOTIF] FATAL error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
};
