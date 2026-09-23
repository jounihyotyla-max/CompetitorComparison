import { getApp, getApps, initializeApp } from "firebase/app";
import { GoogleAuthProvider, getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

// Public web config for the nofence-competitor-compare project (not a secret; access is governed by
// Firebase Auth and the Firestore / Storage rules). `firebase apps:sdkconfig WEB` prints it.
const config = {
  projectId: "nofence-competitor-compare",
  appId: "1:1071406258007:web:2e89d0d8d9623b76f19012",
  storageBucket: "nofence-competitor-compare.firebasestorage.app",
  apiKey: "AIzaSyC7_JghXTVI6NM_rjJI4vYsQBaavdWi6Nk",
  authDomain: "nofence-competitor-compare.firebaseapp.com",
  messagingSenderId: "1071406258007",
};

export const ALLOWED_DOMAIN = "nofence.com";
export const REGION = "europe-west1";

export const app = getApps().length ? getApp() : initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, REGION);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ hd: ALLOWED_DOMAIN, prompt: "select_account" });
