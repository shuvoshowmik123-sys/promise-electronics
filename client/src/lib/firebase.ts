import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * Firebase powers ONE optional feature: Google sign-in. It must never be able to
 * take down the whole customer portal.
 *
 * Previously this module ran `initializeApp` + `getAuth` at import time. When
 * VITE_FIREBASE_API_KEY is missing from the build environment (it is not declared
 * in render.yaml), `getAuth()` throws `auth/invalid-api-key` while the module is
 * still being imported. CustomerAuthContext imports this file, so the throw
 * propagated through the provider and killed app bootstrap entirely — every
 * customer route rendered "Error loading app", Track Order included.
 *
 * Now initialization is lazy and failure is contained: a missing or invalid key
 * disables Google sign-in and nothing else. Browsing, tracking, booking and
 * phone/password login keep working.
 */
export const isFirebaseConfigured: boolean = Boolean(
    firebaseConfig.apiKey && firebaseConfig.appId && firebaseConfig.projectId,
);

let cachedAuth: Auth | null = null;
let initializationAttempted = false;

/**
 * Firebase Auth instance, or null when Firebase is unconfigured or failed to
 * initialize. Callers MUST handle null rather than assume it is available.
 */
export function getFirebaseAuth(): Auth | null {
    if (initializationAttempted) return cachedAuth;
    initializationAttempted = true;

    if (!isFirebaseConfigured) {
        console.warn(
            "[Firebase] Not configured (missing VITE_FIREBASE_* build variables) — Google Sign-In is disabled.",
        );
        return null;
    }

    try {
        const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;
        cachedAuth = getAuth(app);
        return cachedAuth;
    } catch (error) {
        // Never rethrow — an invalid key must not break the portal.
        console.warn("[Firebase] Initialization failed — Google Sign-In is disabled.", error);
        cachedAuth = null;
        return null;
    }
}
