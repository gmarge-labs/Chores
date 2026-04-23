import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAUgQvOlBPe9QOsUx6v8A7-ssfF8fPt2Wc",
  authDomain: "choreheroes-dev.firebaseapp.com",
  projectId: "choreheroes-dev",
  storageBucket: "choreheroes-dev.firebasestorage.app",
  messagingSenderId: "473312342352",
  appId: "1:473312342352:web:e8e39e117896c2b4a2bc55"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
