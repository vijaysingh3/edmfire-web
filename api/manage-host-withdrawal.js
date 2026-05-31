/**
 * Manage Host Withdrawal API - Vercel Serverless Function
 * =======================================================
 * Firestore paths:
 *   hostsWithdrawalRequest/{transactionId}  — Main withdrawal request
 *   hosts/{hostId}/transactionHistory/{tid}  — Host transaction history
 *   hosts/{hostId}/accountBalance/wallet     — Host wallet (walletBalance, totalWithdrawal)
 *
 * Actions:
 *   completeHostWithdrawal - Complete with UTR + notes
 *     - Update hostsWithdrawalRequest → completed
 *     - Update hosts/{hostId}/transactionHistory → completed + utr field
 *     - Update hosts/{hostId}/accountBalance/wallet → add totalWithdrawal field
 *   refundHostWithdrawal   - Refund with notes
 *     - Update hostsWithdrawalRequest → refunded
 *     - Update hosts/{hostId}/transactionHistory → refunded
 *     - Credit back walletBalance in wallet
 *   rejectHostWithdrawal   - Reject with notes
 *     - Update hostsWithdrawalRequest → rejected
 *     - Update hosts/{hostId}/transactionHistory → rejected
 *     - Credit back walletBalance in wallet
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

// Notification & Email config
const NOTIFICATION_URL = process.env.NOTIFICATION_URL || "https://asia-south1-edm-fire-app.cloudfunctions.net/UniversalNotification";
const NOTIFICATION_API_KEY = process.env.NOTIFICATION_API_KEY || "EDM_FIRE_SECRET";
const EMAIL_FUNCTION_URL = process.env.EMAIL_FUNCTION_URL || "https://asia-south1-edm-fire-app.cloudfunctions.net/sendUserEmail";

// CORS
function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ========== PUSH NOTIFICATION ==========
async function sendPushNotification(userId, title, message, type) {
  try {
    console.log("[HOST-NOTIFY] Sending push to hostId:", userId, "title:", title);
    const response = await fetch(NOTIFICATION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": NOTIFICATION_API_KEY,
      },
      body: JSON.stringify({ userId, title, message, type }),
    });
    const text = await response.text();
    console.log("[HOST-NOTIFY] Response:", response.status, text);
  } catch (error) {
    console.error("[HOST-NOTIFY] Failed:", error.message);
  }
}

// ========== EMAIL NOTIFICATION ==========
async function sendEmailNotification(userId, subject, body) {
  try {
    console.log("[HOST-EMAIL] Sending email to hostId:", userId, "subject:", subject);
    const response = await fetch(EMAIL_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, subject, body }),
    });
    const data = await response.json();
    console.log("[HOST-EMAIL] Response:", response.status, JSON.stringify(data));
  } catch (error) {
    console.error("[HOST-EMAIL] Failed:", error.message);
  }
}

// ========== SEND NOTIFICATIONS ==========
function sendHostWithdrawalNotifications(action, hostId, amountInRupees, transactionId, extra) {
  const amountStr = "\u20B9" + amountInRupees.toFixed(2);

  if (action === "completeHostWithdrawal") {
    const utr = extra.utrNumber || "N/A";
    sendPushNotification(
      hostId,
      "Withdrawal Completed \u2705",
      amountStr + " has been transferred to your account. UTR: " + utr,
      "host_withdrawal_completed"
    );
    sendEmailNotification(
      hostId,
      "Withdrawal Completed \u2705",
      "Dear Host,\n\nYour withdrawal of " + amountStr + " has been completed successfully.\n\n" +
      "Transaction ID: " + transactionId + "\n" +
      "Amount: " + amountStr + "\n" +
      "UTR Number: " + utr + "\n" +
      "Status: Completed\n\n" +
      "The amount has been transferred to your bank/UPI account.\n\n" +
      "Regards,\nEDMFire Team"
    );
  }
  else if (action === "refundHostWithdrawal") {
    const reason = extra.notes || "Admin decision";
    sendPushNotification(
      hostId,
      "Withdrawal Refunded \u21A9\uFE0F",
      amountStr + " has been credited back to your wallet. Reason: " + reason,
      "host_withdrawal_refunded"
    );
    sendEmailNotification(
      hostId,
      "Withdrawal Refunded \u21A9\uFE0F",
      "Dear Host,\n\nYour withdrawal of " + amountStr + " has been refunded.\n\n" +
      "Transaction ID: " + transactionId + "\n" +
      "Amount: " + amountStr + "\n" +
      "Reason: " + reason + "\n" +
      "Status: Refunded\n\n" +
      "The amount has been credited back to your wallet balance.\n\n" +
      "Regards,\nEDMFire Team"
    );
  }
  else if (action === "rejectHostWithdrawal") {
    const reason = extra.notes || "Admin decision";
    sendPushNotification(
      hostId,
      "Withdrawal Rejected \u274C",
      amountStr + " withdrawal rejected. Amount credited back to wallet. Reason: " + reason,
      "host_withdrawal_rejected"
    );
    sendEmailNotification(
      hostId,
      "Withdrawal Rejected \u274C",
      "Dear Host,\n\nYour withdrawal of " + amountStr + " has been rejected.\n\n" +
      "Transaction ID: " + transactionId + "\n" +
      "Amount: " + amountStr + "\n" +
      "Reason: " + reason + "\n" +
      "Status: Rejected\n\n" +
      "The amount has been credited back to your wallet balance.\n\n" +
      "Regards,\nEDMFire Team"
    );
  }
}

// ===================================================
// COMPLETE HOST WITHDRAWAL
// - Update hostsWithdrawalRequest → completed + utr + notes + processedAt
// - Update hosts/{hostId}/transactionHistory/{tid} → completed + utr + notes + processedAt
// - Update hosts/{hostId}/accountBalance/wallet → increment totalWithdrawal + update lastUpdated
// ===================================================
async function completeHostWithdrawal(data) {
  const { transactionId, hostId, amount, utrNumber, notes } = data;

  if (!transactionId || !hostId || !utrNumber) {
    return { success: false, error: "MISSING_FIELDS", message: "Transaction ID, Host ID and UTR Number are required" };
  }
  if (amount === undefined || amount === null) {
    return { success: false, error: "MISSING_AMOUNT", message: "Amount is required" };
  }

  const amountInPaisa = parseInt(amount, 10);
  const amountInRupees = amountInPaisa / 100.0;

  try {
    const now = admin.firestore.FieldValue.serverTimestamp();
    const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    // 1. Batch: Update withdrawal request + host transaction history
    const withdrawalRef = firestore.collection("hostsWithdrawalRequest").doc(transactionId);
    const hostTxnRef = firestore
      .collection("hosts").doc(hostId)
      .collection("transactionHistory").doc(transactionId);

    const withdrawalUpdate = {
      status: "completed",
      utrNumber: utrNumber,
      notes: notes ? "UTR: " + utrNumber + " - " + notes : "UTR: " + utrNumber,
      processedAt: now,
    };

    const hostTxnUpdate = {
      status: "completed",
      utr: utrNumber,
      notes: notes ? "UTR: " + utrNumber + " - " + notes : "UTR: " + utrNumber,
      processedAt: now,
    };

    const batch = firestore.batch();
    batch.update(withdrawalRef, withdrawalUpdate);
    batch.update(hostTxnRef, hostTxnUpdate);
    await batch.commit();

    // 2. Update wallet: increment totalWithdrawal + update lastUpdated
    const walletRef = firestore
      .collection("hosts").doc(hostId)
      .collection("accountBalance").doc("wallet");

    await firestore.runTransaction(async (transaction) => {
      const walletDoc = await transaction.get(walletRef);
      const currentTotalWithdrawal = walletDoc.exists ? (walletDoc.data().totalWithdrawal || 0) : 0;
      const newTotalWithdrawal = currentTotalWithdrawal + amountInPaisa;

      transaction.update(walletRef, {
        totalWithdrawal: newTotalWithdrawal,
        lastUpdated: now,
        lastUpdatedIST: nowIST,
      });
    });

    // 3. Notifications (fire and forget)
    sendHostWithdrawalNotifications("completeHostWithdrawal", hostId, amountInRupees, transactionId, { utrNumber });

    return {
      success: true,
      message: "Host withdrawal completed successfully",
      transactionId: transactionId,
      amountInRupees: amountInRupees,
    };
  } catch (error) {
    console.error("Complete host withdrawal error:", error);
    return { success: false, error: "COMPLETE_FAILED", message: "Failed: " + error.message };
  }
}

// ===================================================
// REFUND HOST WITHDRAWAL
// - Update hostsWithdrawalRequest → refunded + notes + processedAt
// - Update hosts/{hostId}/transactionHistory/{tid} → refunded + notes + processedAt
// - Credit back walletBalance in hosts/{hostId}/accountBalance/wallet
// ===================================================
async function refundHostWithdrawal(data) {
  const { transactionId, hostId, amount, notes } = data;

  if (!transactionId || !hostId) {
    return { success: false, error: "MISSING_FIELDS", message: "Transaction ID and Host ID are required" };
  }
  if (amount === undefined || amount === null) {
    return { success: false, error: "MISSING_AMOUNT", message: "Amount is required" };
  }

  const amountInPaisa = parseInt(amount, 10);
  const amountInRupees = amountInPaisa / 100.0;

  try {
    const now = admin.firestore.FieldValue.serverTimestamp();
    const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    // 1. Batch: Update withdrawal request + host transaction history
    const withdrawalRef = firestore.collection("hostsWithdrawalRequest").doc(transactionId);
    const hostTxnRef = firestore
      .collection("hosts").doc(hostId)
      .collection("transactionHistory").doc(transactionId);

    const withdrawalUpdate = {
      status: "refunded",
      notes: notes ? "Refunded - " + notes : "Refunded",
      processedAt: now,
    };

    const hostTxnUpdate = {
      status: "refunded",
      notes: notes ? "Refunded - " + notes : "Refunded",
      processedAt: now,
    };

    const batch = firestore.batch();
    batch.update(withdrawalRef, withdrawalUpdate);
    batch.update(hostTxnRef, hostTxnUpdate);
    await batch.commit();

    // 2. Credit back walletBalance
    const walletRef = firestore
      .collection("hosts").doc(hostId)
      .collection("accountBalance").doc("wallet");

    await firestore.runTransaction(async (transaction) => {
      const walletDoc = await transaction.get(walletRef);
      const currentBalance = walletDoc.exists ? (walletDoc.data().walletBalance || 0) : 0;
      const newBalance = currentBalance + amountInPaisa;

      transaction.update(walletRef, {
        walletBalance: newBalance,
        lastUpdated: now,
        lastUpdatedIST: nowIST,
      });
    });

    // 3. Notifications
    sendHostWithdrawalNotifications("refundHostWithdrawal", hostId, amountInRupees, transactionId, { notes });

    return {
      success: true,
      message: "Host withdrawal refunded successfully",
      transactionId: transactionId,
      amountInRupees: amountInRupees,
    };
  } catch (error) {
    console.error("Refund host withdrawal error:", error);
    return { success: false, error: "REFUND_FAILED", message: "Failed: " + error.message };
  }
}

// ===================================================
// REJECT HOST WITHDRAWAL
// - Update hostsWithdrawalRequest → rejected + notes + processedAt
// - Update hosts/{hostId}/transactionHistory/{tid} → rejected + notes + processedAt
// - Credit back walletBalance in hosts/{hostId}/accountBalance/wallet
// ===================================================
async function rejectHostWithdrawal(data) {
  const { transactionId, hostId, amount, notes } = data;

  if (!transactionId || !hostId) {
    return { success: false, error: "MISSING_FIELDS", message: "Transaction ID and Host ID are required" };
  }
  if (amount === undefined || amount === null) {
    return { success: false, error: "MISSING_AMOUNT", message: "Amount is required" };
  }

  const amountInPaisa = parseInt(amount, 10);
  const amountInRupees = amountInPaisa / 100.0;

  try {
    const now = admin.firestore.FieldValue.serverTimestamp();
    const nowIST = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    // 1. Batch: Update withdrawal request + host transaction history
    const withdrawalRef = firestore.collection("hostsWithdrawalRequest").doc(transactionId);
    const hostTxnRef = firestore
      .collection("hosts").doc(hostId)
      .collection("transactionHistory").doc(transactionId);

    const withdrawalUpdate = {
      status: "rejected",
      notes: notes ? "Rejected - " + notes : "Rejected",
      processedAt: now,
    };

    const hostTxnUpdate = {
      status: "rejected",
      notes: notes ? "Rejected - " + notes : "Rejected",
      processedAt: now,
    };

    const batch = firestore.batch();
    batch.update(withdrawalRef, withdrawalUpdate);
    batch.update(hostTxnRef, hostTxnUpdate);
    await batch.commit();

    // 2. Credit back walletBalance
    const walletRef = firestore
      .collection("hosts").doc(hostId)
      .collection("accountBalance").doc("wallet");

    await firestore.runTransaction(async (transaction) => {
      const walletDoc = await transaction.get(walletRef);
      const currentBalance = walletDoc.exists ? (walletDoc.data().walletBalance || 0) : 0;
      const newBalance = currentBalance + amountInPaisa;

      transaction.update(walletRef, {
        walletBalance: newBalance,
        lastUpdated: now,
        lastUpdatedIST: nowIST,
      });
    });

    // 3. Notifications
    sendHostWithdrawalNotifications("rejectHostWithdrawal", hostId, amountInRupees, transactionId, { notes });

    return {
      success: true,
      message: "Host withdrawal rejected successfully",
      transactionId: transactionId,
      amountInRupees: amountInRupees,
    };
  } catch (error) {
    console.error("Reject host withdrawal error:", error);
    return { success: false, error: "REJECT_FAILED", message: "Failed: " + error.message };
  }
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

  const {
    action,
    transactionId,
    hostId,
    amount,
    utrNumber,
    notes,
  } = req.body || {};

  try {
    let result;

    switch (action) {
      case "completeHostWithdrawal":
        result = await completeHostWithdrawal({ transactionId, hostId, amount, utrNumber, notes });
        break;

      case "refundHostWithdrawal":
        result = await refundHostWithdrawal({ transactionId, hostId, amount, notes });
        break;

      case "rejectHostWithdrawal":
        result = await rejectHostWithdrawal({ transactionId, hostId, amount, notes });
        break;

      default:
        return res.status(400).json({
          error: "Unknown action",
          validActions: ["completeHostWithdrawal", "refundHostWithdrawal", "rejectHostWithdrawal"],
        });
    }

    return res.status(200).json({ success: true, result });
  } catch (error) {
    console.error("Manage host withdrawal error:", error);
    return res.status(500).json({ error: error.message });
  }
};
