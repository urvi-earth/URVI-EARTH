import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    sendEmailVerification,
    sendPasswordResetEmail,
    reload
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
    getDatabase,
    ref,
    set,
    get,
    child,
    push,
    update,
    remove,
    onValue
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDJVT-ak_1wua9ovC88GHhOV9ID8Di_ORQ",
  authDomain: "urvi-6f497.firebaseapp.com",
  databaseURL: "https://urvi-6f497-default-rtdb.firebaseio.com",
  projectId: "urvi-6f497",
  storageBucket: "urvi-6f497.firebasestorage.app",
  messagingSenderId: "263980979024",
  appId: "1:263980979024:web:34ed6b50b488de2f489255",
  measurementId: "G-EK04QJL73E"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();

// Master Admin Check & Helper
export function isAdminUser(user, uid = "", name = "") {
    if (!user && !uid && !name) return false;
    const cleanUid = String(uid || (user ? user.user_id || user.userId : "")).toLowerCase().replace(/[^a-z0-9.]/g, "");
    const cleanName = String(name || (user ? user.firstName || user.name : "")).toLowerCase().replace(/[^a-z0-9.]/g, "");
    const role = String(user ? (user.role || user.userType || user.user_type || "") : "").toLowerCase();

    return cleanUid.includes("urvi.earth") ||
           cleanUid.includes("urviearth") ||
           cleanName.includes("urviearth") ||
           role === "admin";
}

// Seed Master Admin Record if missing
export async function seedMasterAdmin() {
    try {
        const adminSnap = await get(child(ref(db), "users/urvi.earth"));
        if (!adminSnap.exists()) {
            const masterAdmin = {
                user_id: "urvi.earth",
                firstName: "URVI",
                lastName: "Earth Admin",
                email: "urvi.earth@urvi.org",
                mobile: "9999999999",
                userType: "admin",
                role: "admin",
                status: "active",
                isVerified: true,
                bio: "Root Master Administrator for URVI Platform",
                profilePic: "default",
                points: 9999,
                contributions: 999,
                trees_planted: 500,
                createdAt: new Date().toISOString()
            };
            await set(ref(db, "users/urvi.earth"), masterAdmin);
        }
    } catch (e) {
        console.warn("Master admin seed check:", e);
    }
}
seedMasterAdmin();

export {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    sendEmailVerification,
    sendPasswordResetEmail,
    reload,
    ref,
    set,
    get,
    child,
    push,
    update,
    remove,
    onValue
};