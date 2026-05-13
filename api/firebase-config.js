module.exports = (req, res) => {
  // Firebase config Vercel env vars se nikalna
  const firebaseConfig = {
    apiKey: process.env.FB_API_KEY,
    authDomain: process.env.FB_AUTH_DOMAIN,
    databaseURL: process.env.FB_DATABASE_URL,
    projectId: process.env.FB_PROJECT_ID,
    storageBucket: process.env.FB_STORAGE_BUCKET,
    messagingSenderId: process.env.FB_MESSAGING_SENDER_ID,
    appId: process.env.FB_APP_ID,
    measurementId: process.env.FB_MEASUREMENT_ID
  };

  // JS script ke roop me return karna
  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Cache-Control", "public, max-age=3600");

  const js = `
// Firebase config - Vercel env vars se fetch hua
const firebaseConfig = ${JSON.stringify(firebaseConfig)};

// Firebase initialize karna
firebase.initializeApp(firebaseConfig);

// Firebase services
const auth = firebase.auth();
const database = firebase.database();
const storage = firebase.storage();
`;

  res.status(200).send(js);
};