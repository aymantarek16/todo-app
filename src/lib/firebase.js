// lib/firebase.js
import { initializeApp, getApps, getApp  } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDZJKGZnDyL7cEbpF7lYTNCjyZEUrwEy24",
  authDomain: "todo-next-js-16.firebaseapp.com",
  projectId: "todo-next-js-16",
  storageBucket: "todo-next-js-16.firebasestorage.app",
  messagingSenderId: "968455250822",
  appId: "1:968455250822:web:e616bf5a8a843e305c4207",
  measurementId: "G-2Y7EVGE7RK"
};


const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);
export { auth, db, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, doc, getDoc, setDoc };
