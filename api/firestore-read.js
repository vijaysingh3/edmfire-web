/**
 * Firestore Read API - Vercel Serverless Function
 * =================================================
 * Ye function Firebase Admin SDK se Firestore data read karta hai
 * Admin SDK credentials Vercel env me hain, isliye ye kaam karega
 *
 * Endpoints:
 *   POST /api/firestore-read
 *   Body: { "action": "listCollections" }
 *   Body: { "action": "readCollection", "collection": "users", "limit": 10 }
 *   Body: { "action": "readDocument", "collection": "users", "docId": "abc123" }
 *   Body: { "action": "readRTDB", "path": "helpCenter/users" }
 *   Body: { "action": "listAuthUsers", "limit": 100 }
 *   Body: { "action": "scanAll" }
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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// ===================================================
// ACTION: List all Firestore collections
// ===================================================
async function listCollections() {
  const collections = await admin.firestore().listCollections();
  const result = [];

  for (const col of collections) {
    const countSnapshot = await admin.firestore().collection(col.id).count().get();
    result.push({
      id: col.id,
      documentCount: countSnapshot.data().count,
    });
  }

  return { collections: result, total: result.length };
}

// ===================================================
// ACTION: Read collection documents
// ===================================================
async function readCollection(collection, limit = 50) {
  const snapshot = await admin.firestore().collection(collection).limit(limit).get();

  if (snapshot.empty) {
    return { collection, documents: [], count: 0 };
  }

  const documents = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    // Convert Firestore Timestamps to ISO strings
    const serialized = serializeData(data);
    documents.push({ id: doc.id, data: serialized });
  });

  return { collection, documents, count: documents.length };
}

// ===================================================
// ACTION: Read specific document
// ===================================================
async function readDocument(collection, docId) {
  const doc = await admin.firestore().collection(collection).doc(docId).get();

  if (!doc.exists) {
    return { exists: false, collection, docId };
  }

  return {
    exists: true,
    collection,
    docId,
    data: serializeData(doc.data()),
  };
}

// ===================================================
// ACTION: Read Realtime Database path
// ===================================================
async function readRTDB(path) {
  const ref = admin.database().ref(path || "/");
  const snapshot = await ref.once("value");
  const data = snapshot.val();

  if (data === null) {
    return { path, data: null, exists: false };
  }

  return {
    path,
    data: serializeData(data),
    exists: true,
    type: Array.isArray(data) ? "array" : typeof data,
    keyCount: typeof data === "object" && data !== null ? Object.keys(data).length : 0,
  };
}

// ===================================================
// ACTION: List Auth users
// ===================================================
async function listAuthUsers(limit = 100) {
  const result = await admin.auth().listUsers(Math.min(limit, 1000));
  const users = result.users.map((user) => ({
    uid: user.uid,
    email: user.email || null,
    displayName: user.displayName || null,
    phoneNumber: user.phoneNumber || null,
    emailVerified: user.emailVerified,
    disabled: user.disabled,
    creationTime: user.metadata.creationTime,
    lastSignInTime: user.metadata.lastSignInTime,
    providers: user.providerData.map((p) => p.providerId),
  }));

  return { users, count: users.length, pageToken: result.pageToken || null };
}

// ===================================================
// ACTION: Scan all databases
// ===================================================
async function scanAll() {
  // Firestore
  let firestoreData = {};
  try {
    const collections = await admin.firestore().listCollections();
    for (const col of collections) {
      const countSnapshot = await admin.firestore().collection(col.id).count().get();
      firestoreData[col.id] = { documentCount: countSnapshot.data().count };
    }
  } catch (e) {
    firestoreData = { error: e.message };
  }

  // RTDB
  let rtdbData = {};
  try {
    const snapshot = await admin.database().ref("/").once("value");
    const rootData = snapshot.val();
    if (rootData && typeof rootData === "object") {
      for (const [key, value] of Object.entries(rootData)) {
        const subKeys = typeof value === "object" && value !== null ? Object.keys(value).length : 0;
        rtdbData[key] = { type: typeof value, keyCount: subKeys };
      }
    }
  } catch (e) {
    rtdbData = { error: e.message };
  }

  // Auth
  let authData = {};
  try {
    const result = await admin.auth().listUsers(100);
    authData = { totalUsers: result.users.length };
  } catch (e) {
    authData = { error: e.message };
  }

  return { firestore: firestoreData, realtimeDatabase: rtdbData, auth: authData };
}

// ===================================================
// HELPER: Serialize data for JSON response
// ===================================================
function serializeData(data) {
  if (data === null || data === undefined) return null;
  if (typeof data !== "object") return data;

  if (data && typeof data.toDate === "function") {
    return data.toDate().toISOString();
  }

  if (Array.isArray(data)) {
    return data.map(serializeData);
  }

  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value.toDate === "function") {
      result[key] = value.toDate().toISOString();
    } else if (value && typeof value === "object" && value !== null) {
      result[key] = serializeData(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ===================================================
// MAIN: Vercel Serverless Handler
// ===================================================
module.exports = async (req, res) => {
  setCORS(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // GET request - simple status
  if (req.method === "GET") {
    return res.status(200).json({
      status: "ok",
      service: "EDM Fire - Firestore Reader API",
      actions: ["listCollections", "readCollection", "readDocument", "readRTDB", "listAuthUsers", "scanAll"],
      usage: "POST with { action, collection?, docId?, path?, limit? }",
    });
  }

  const { action, collection, docId, path, limit } = req.body || {};

  try {
    let result;

    switch (action) {
      case "listCollections":
        result = await listCollections();
        break;

      case "readCollection":
        if (!collection) return res.status(400).json({ error: "collection is required" });
        result = await readCollection(collection, parseInt(limit) || 50);
        break;

      case "readDocument":
        if (!collection || !docId) return res.status(400).json({ error: "collection and docId are required" });
        result = await readDocument(collection, docId);
        break;

      case "readRTDB":
        result = await readRTDB(path || "/");
        break;

      case "listAuthUsers":
        result = await listAuthUsers(parseInt(limit) || 100);
        break;

      case "scanAll":
        result = await scanAll();
        break;

      default:
        return res.status(400).json({
          error: "Unknown action",
          validActions: ["listCollections", "readCollection", "readDocument", "readRTDB", "listAuthUsers", "scanAll"],
        });
    }

    return res.status(200).json({ success: true, result });
  } catch (error) {
    console.error("Firestore read error:", error);
    return res.status(500).json({ error: error.message });
  }
};
