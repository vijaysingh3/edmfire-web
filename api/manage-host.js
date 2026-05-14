/**
 * Manage Host API - Vercel Serverless Function
 * ==============================================
 * Actions:
 *   checkEmail  - Check if email exists in Firebase Auth
 *   approveHost - Create Auth account + store in hosts collection + update application
 *   rejectHost  - Update application status to rejected + store reject reason
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

const firestore = admin.firestore();
const auth = admin.auth();

// CORS
function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ===================================================
// CHECK EMAIL: Check if email exists in Firebase Auth
// ===================================================
async function checkEmail(email) {
  try {
    const userRecord = await auth.getUserByEmail(email);
    return { exists: true, uid: userRecord.uid, email: userRecord.email };
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      return { exists: false, uid: null, email: email };
    }
    throw error;
  }
}

// ===================================================
// APPROVE HOST: Create Auth + store in hosts + update application
// ===================================================
async function approveHost(data) {
  const { applicationId, applicationData, adminEmail, hostPassword } = data;

  if (!applicationId || !applicationData || !adminEmail) {
    throw new Error("Missing required fields: applicationId, applicationData, adminEmail");
  }

  if (!hostPassword || hostPassword.length < 6) {
    return {
      success: false,
      error: "INVALID_PASSWORD",
      message: "Password is required and must be at least 6 characters",
    };
  }

  const gmail = applicationData.gmail;
  if (!gmail) {
    throw new Error("Application does not have an email address");
  }

  // Step 1: Check if email already exists in Auth
  const emailCheck = await checkEmail(gmail);
  if (emailCheck.exists) {
    return {
      success: false,
      error: "EMAIL_ALREADY_REGISTERED",
      message: "This email is already registered in Firebase Auth. Cannot create duplicate account.",
    };
  }

  // Step 2: Create new Auth account with admin-provided password
  let newUser;
  try {
    newUser = await auth.createUser({
      email: gmail,
      password: hostPassword,
      displayName: applicationData.fullName || "Host",
      emailVerified: true,
    });
  } catch (createError) {
    return {
      success: false,
      error: "AUTH_CREATE_FAILED",
      message: "Failed to create Auth account: " + createError.message,
    };
  }

  // Step 3: Store all application data in "hosts" collection with verified status
  const hostData = {
    // Personal Info
    fullName: applicationData.fullName || "",
    gender: applicationData.gender || "",
    age: applicationData.age || 0,
    mobile: applicationData.mobile || "",
    whatsapp: applicationData.whatsapp || "",
    gmail: gmail,

    // Location
    state: applicationData.state || "",
    district: applicationData.district || "",
    city: applicationData.city || "",

    // Gaming Info
    ffNickname: applicationData.ffNickname || "",
    playingYears: applicationData.playingYears || "",
    hostedBefore: applicationData.hostedBefore || "",
    hostingExperience: applicationData.hostingExperience || "",
    gameModes: applicationData.gameModes || "",
    currentRank: applicationData.currentRank || "",

    // Device Info
    devices: applicationData.devices || [],
    primaryDevice: applicationData.primaryDevice || "",
    ramSize: applicationData.ramSize || "",
    internetQuality: applicationData.internetQuality || "",
    canScreenRecord: applicationData.canScreenRecord || "",

    // Additional
    discordTelegram: applicationData.discordTelegram || "",
    whyJoin: applicationData.whyJoin || "",
    ffScreenshotUrl: applicationData.ffScreenshotUrl || "",
    selfieUrl: applicationData.selfieUrl || "",

    // Host Account Password (admin-set, for admin panel reference)
    password: hostPassword,

    // Verification Info
    status: "verified",
    verifiedBy: adminEmail,
    verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    authUid: newUser.uid,
    originalApplicationId: applicationId,

    // Meta
    createdAt: applicationData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
  };

  await firestore.collection("hosts").doc(newUser.uid).set(hostData);

  // Step 4: Update original application status to "approved"
  await firestore.collection("applications").doc(applicationId).update({
    status: "approved",
    approvedBy: adminEmail,
    approvedAt: admin.firestore.FieldValue.serverTimestamp(),
    hostUid: newUser.uid,
  });

  return {
    success: true,
    message: "Host approved and account created successfully",
    hostUid: newUser.uid,
    hostEmail: gmail,
  };
}

// ===================================================
// REJECT HOST: Update application status + store reason
// ===================================================
async function rejectHost(data) {
  const { applicationId, rejectReason, adminEmail } = data;

  if (!applicationId) {
    throw new Error("Missing required field: applicationId");
  }

  const updateData = {
    status: "rejected",
    rejectedBy: adminEmail || "admin",
    rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
    rejectReason: rejectReason || "No reason provided",
  };

  await firestore.collection("applications").doc(applicationId).update(updateData);

  return {
    success: true,
    message: "Application rejected successfully",
  };
}

// ===================================================
// MAIN: Vercel Serverless Handler
// ===================================================
module.exports = async (req, res) => {
  setCORS(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, applicationId, applicationData, adminEmail, rejectReason, hostPassword } = req.body || {};

  try {
    let result;

    switch (action) {
      case "checkEmail":
        if (!applicationData || !applicationData.gmail) {
          return res.status(400).json({ error: "Email is required" });
        }
        result = await checkEmail(applicationData.gmail);
        break;

      case "approveHost":
        result = await approveHost({ applicationId, applicationData, adminEmail, hostPassword });
        break;

      case "rejectHost":
        result = await rejectHost({ applicationId, rejectReason, adminEmail });
        break;

      default:
        return res.status(400).json({
          error: "Unknown action",
          validActions: ["checkEmail", "approveHost", "rejectHost"],
        });
    }

    return res.status(200).json({ success: true, result });
  } catch (error) {
    console.error("Manage host error:", error);
    return res.status(500).json({ error: error.message });
  }
};
