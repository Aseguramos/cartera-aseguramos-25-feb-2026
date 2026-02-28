import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
 apiKey: "AIzaSyBQfjkHAmxP0pwxKFdqoKnDld5UqC1kymU",
  authDomain: "cartera-aseguradoras.firebaseapp.com",
  projectId: "cartera-aseguradoras",
  storageBucket: "cartera-aseguradoras.firebasestorage.app",
  messagingSenderId: "659340338485",
  appId: "1:659340338485:web:2f4d8969abf50d959dd87c"
};

const app = initializeApp(firebaseConfig);


console.log("🔥 FIREBASE PROJECT:", app.options.projectId);
console.log("🔥 AUTH DOMAIN:", app.options.authDomain);

export const auth = getAuth(app);   // 👈 SIMPLE Y CORRECTO
export const db = getFirestore(app);