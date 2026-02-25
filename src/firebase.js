// src/firebase.js

import { initializeApp } from "firebase/app";
import { initializeAuth, browserLocalPersistence } from "firebase/auth";
import { initializeFirestore, persistentLocalCache } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBQFjkHAmxP0pwxKFdqoKnD1d5UqC1kymU",
  authDomain: "cartera-aseguradoras.firebaseapp.com",
  projectId: "cartera-aseguradoras",
  storageBucket: "cartera-aseguradoras.appspot.com",
  messagingSenderId: "659340338485",
  appId: "1:659340338485:web:2f4d8969abf50d959dd87c"
};

const app = initializeApp(firebaseConfig);

// 🔥 AUTH OFFLINE REAL
const auth = initializeAuth(app, {
  persistence: browserLocalPersistence
});

// 🔥 FIRESTORE OFFLINE REAL
import { getFirestore } from "firebase/firestore";

const db = getFirestore(app);

export { auth, db };