// Firebase config aur initialization
// EDMFire App - Firebase Web SDK Config

const firebaseConfig = {
  apiKey: "AIzaSyASlqa3FmDWzy_Tpo74-HjmXOz_BD5seKI",
  authDomain: "edm-fire-app.firebaseapp.com",
  databaseURL: "https://edm-fire-app-webapp.firebaseio.com",
  projectId: "edm-fire-app",
  storageBucket: "edm-fire-app.firebasestorage.app",
  messagingSenderId: "794576309708",
  appId: "1:794576309708:web:45e9c8a9c43233d98ba169",
  measurementId: "G-ZL4MHPBKEF"
};

// Firebase initialize karna
firebase.initializeApp(firebaseConfig);

// Firebase services
const auth = firebase.auth();
const database = firebase.database();
const storage = firebase.storage();