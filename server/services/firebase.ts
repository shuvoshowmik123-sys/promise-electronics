
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Render Secret File path takes priority over local dev path
const RENDER_SECRET_PATH = '/etc/secrets/firebase-service-account.json';
const LOCAL_PATH = join(process.cwd(), 'server', 'firebase-service-account.json');
const serviceAccountPath = existsSync(RENDER_SECRET_PATH) ? RENDER_SECRET_PATH : LOCAL_PATH;

if (!admin.apps.length) {
    try {
        if (existsSync(serviceAccountPath)) {
            const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
            console.log('[Firebase] Admin SDK initialized successfully');
        } else {
            console.warn('[Firebase] Service account file not found — Firebase auth disabled');
        }
    } catch (error) {
        console.error('[Firebase] Failed to initialize Admin SDK:', error);
    }
}

export const firebaseAdmin = admin;

export async function verifyFirebaseToken(idToken: string) {
    const decoded = await admin.auth().verifyIdToken(idToken);
    return {
        uid: decoded.uid,
        email: decoded.email ?? null,
        name: decoded.name ?? null,
        picture: decoded.picture ?? null,
    };
}
