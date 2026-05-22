/**
 * Manage Withdrawal API - Vercel Serverless Function
 * ==============================================
 * Actions:
 *   completeWithdrawal - Complete with UTR + notes (batch: WithdrawalRequests + User TransactionHistory + TotalWithdrawal)
 *   refundWithdrawal   - Refund with notes (batch: WithdrawalRequests + User TransactionHistory + User WinningCoins refund)
 *   rejectWithdrawal   - Reject with notes (batch: WithdrawalRequests + User TransactionHistory + User WinningCoins refund)
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

// CORS
function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ===================================================
// COMPLETE WITHDRAWAL
// - Update WithdrawalRequests doc status → completed
// - Update User TransactionHistory doc status → completed
// - Update TotalWithdrawal total (add amount)
// - Notes = "UTR: {utrNumber} - {notes}"
// ===================================================
async function completeWithdrawal(data) {
  const { transactionId, userId, amount, utrNumber, notes, adminEmail } = data;

  if (!transactionId || !userId || !utrNumber || !notes) {
    return {
      success: false,
      error: "MISSING_FIELDS",
      message: "Transaction ID, User ID, UTR Number and Notes are required",
    };
  }

  if (amount === undefined || amount === null) {
    return {
      success: false,
      error: "MISSING_AMOUNT",
      message: "Amount is required for TotalWithdrawal update",
    };
  }

  const amountInPaisa = parseInt(amount, 10);
  const amountInRupees = amountInPaisa / 100.0;

  try {
    const userTransactionRef = firestore
      .collection("Users")
      .doc(userId)
      .collection("TransactionHistory")
      .doc(transactionId);

    const withdrawalRef = firestore
      .collection("WithdrawalRequests")
      .doc(transactionId);

    const transactionUpdate = {
      status: "completed",
      notes: "UTR: " + utrNumber + " - " + notes,
      utrNumber: utrNumber,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const withdrawalUpdate = {
      status: "completed",
      notes: "UTR: " + utrNumber + " - " + notes,
      utrNumber: utrNumber,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Batch: Update WithdrawalRequests + User TransactionHistory
    const batch = firestore.batch();
    batch.update(userTransactionRef, transactionUpdate);
    batch.update(withdrawalRef, withdrawalUpdate);
    await batch.commit();

    // Update TotalWithdrawal (separate transaction)
    const totalWithdrawalRef = firestore.collection("TotalWithdrawal").doc("Amount");
    await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(totalWithdrawalRef);
      const currentTotal = snapshot.exists ? (snapshot.data().total || 0) : 0;
      const newTotal = currentTotal + amountInRupees;

      transaction.set(totalWithdrawalRef, {
        total: newTotal,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        lastTransactionAmount: amountInRupees,
        currency: "INR",
      });
    });

    return {
      success: true,
      message: "Withdrawal completed successfully",
      transactionId: transactionId,
      amountInRupees: amountInRupees,
    };
  } catch (error) {
    console.error("Complete withdrawal error:", error);
    return {
      success: false,
      error: "COMPLETE_FAILED",
      message: "Failed to complete withdrawal: " + error.message,
    };
  }
}

// ===================================================
// REFUND WITHDRAWAL
// - Update WithdrawalRequests doc status → refunded
// - Update User TransactionHistory doc status → refunded
// - Refund WinningCoins to user (increment by amount)
// - Notes = "Refunded - {notes}"
// ===================================================
async function refundWithdrawal(data) {
  const { transactionId, userId, amount, notes, adminEmail } = data;

  if (!transactionId || !userId || !notes) {
    return {
      success: false,
      error: "MISSING_FIELDS",
      message: "Transaction ID, User ID and Notes are required",
    };
  }

  const amountInPaisa = parseInt(amount, 10);

  try {
    const userRef = firestore.collection("Users").doc(userId);
    const userTransactionRef = firestore
      .collection("Users")
      .doc(userId)
      .collection("TransactionHistory")
      .doc(transactionId);

    const withdrawalRef = firestore
      .collection("WithdrawalRequests")
      .doc(transactionId);

    const transactionUpdate = {
      status: "refunded",
      notes: "Refunded - " + notes,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const withdrawalUpdate = {
      status: "refunded",
      notes: "Refunded - " + notes,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Batch: Refund WinningCoins + Update TransactionHistory + Update WithdrawalRequests
    const batch = firestore.batch();
    batch.update(userRef, {
      WinningCoins: admin.firestore.FieldValue.increment(amountInPaisa),
    });
    batch.update(userTransactionRef, transactionUpdate);
    batch.update(withdrawalRef, withdrawalUpdate);
    await batch.commit();

    // Get updated user balance
    const updatedUserDoc = await userRef.get();
    const newWinningCoins = updatedUserDoc.exists
      ? updatedUserDoc.data().WinningCoins || 0
      : 0;

    return {
      success: true,
      message: "Withdrawal refunded successfully",
      transactionId: transactionId,
      newWinningCoins: newWinningCoins,
      newWinningCoinsRupees: newWinningCoins / 100.0,
    };
  } catch (error) {
    console.error("Refund withdrawal error:", error);
    return {
      success: false,
      error: "REFUND_FAILED",
      message: "Failed to refund withdrawal: " + error.message,
    };
  }
}

// ===================================================
// REJECT WITHDRAWAL
// - Update WithdrawalRequests doc status → rejected
// - Update User TransactionHistory doc status → rejected
// - Refund WinningCoins to user (increment by amount) — same as refund
// - Notes = "Rejected - {notes}"
// ===================================================
async function rejectWithdrawal(data) {
  const { transactionId, userId, amount, notes, adminEmail } = data;

  if (!transactionId || !userId || !notes) {
    return {
      success: false,
      error: "MISSING_FIELDS",
      message: "Transaction ID, User ID and Notes are required",
    };
  }

  const amountInPaisa = parseInt(amount, 10);

  try {
    const userRef = firestore.collection("Users").doc(userId);
    const userTransactionRef = firestore
      .collection("Users")
      .doc(userId)
      .collection("TransactionHistory")
      .doc(transactionId);

    const withdrawalRef = firestore
      .collection("WithdrawalRequests")
      .doc(transactionId);

    const transactionUpdate = {
      status: "rejected",
      notes: "Rejected - " + notes,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const withdrawalUpdate = {
      status: "rejected",
      notes: "Rejected - " + notes,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Batch: Refund WinningCoins + Update TransactionHistory + Update WithdrawalRequests
    const batch = firestore.batch();
    batch.update(userRef, {
      WinningCoins: admin.firestore.FieldValue.increment(amountInPaisa),
    });
    batch.update(userTransactionRef, transactionUpdate);
    batch.update(withdrawalRef, withdrawalUpdate);
    await batch.commit();

    // Get updated user balance
    const updatedUserDoc = await userRef.get();
    const newWinningCoins = updatedUserDoc.exists
      ? updatedUserDoc.data().WinningCoins || 0
      : 0;

    return {
      success: true,
      message: "Withdrawal rejected successfully",
      transactionId: transactionId,
      newWinningCoins: newWinningCoins,
      newWinningCoinsRupees: newWinningCoins / 100.0,
    };
  } catch (error) {
    console.error("Reject withdrawal error:", error);
    return {
      success: false,
      error: "REJECT_FAILED",
      message: "Failed to reject withdrawal: " + error.message,
    };
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
    userId,
    amount,
    utrNumber,
    notes,
    adminEmail,
  } = req.body || {};

  try {
    let result;

    switch (action) {
      case "completeWithdrawal":
        result = await completeWithdrawal({
          transactionId,
          userId,
          amount,
          utrNumber,
          notes,
          adminEmail,
        });
        break;

      case "refundWithdrawal":
        result = await refundWithdrawal({
          transactionId,
          userId,
          amount,
          notes,
          adminEmail,
        });
        break;

      case "rejectWithdrawal":
        result = await rejectWithdrawal({
          transactionId,
          userId,
          amount,
          notes,
          adminEmail,
        });
        break;

      default:
        return res.status(400).json({
          error: "Unknown action",
          validActions: [
            "completeWithdrawal",
            "refundWithdrawal",
            "rejectWithdrawal",
          ],
        });
    }

    return res.status(200).json({ success: true, result });
  } catch (error) {
    console.error("Manage withdrawal error:", error);
    return res.status(500).json({ error: error.message });
  }
};
