
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function loadServiceAccount(): object | null {
    // Priority 1: base64 env var (Vercel / any platform)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
        try {
            const json = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8');
            return JSON.parse(json);
        } catch {
            console.error('[Firebase] Failed to decode FIREBASE_SERVICE_ACCOUNT_BASE64');
            return null;
        }
    }
    // Priority 2: Render Secret File
    const RENDER_PATH = '/etc/secrets/firebase-service-account.json';
    if (existsSync(RENDER_PATH)) return JSON.parse(readFileSync(RENDER_PATH, 'utf-8'));
    // Priority 3: local dev file
    const LOCAL_PATH = join(process.cwd(), 'server', 'firebase-service-account.json');
    if (existsSync(LOCAL_PATH)) return JSON.parse(readFileSync(LOCAL_PATH, 'utf-8'));
    return null;
}

if (!admin.apps.length) {
    try {
        const serviceAccount = loadServiceAccount();
        if (serviceAccount) {
            admin.initializeApp({ credential: admin.credential.cert(serviceAccount as any) });
            console.log('[Firebase] Admin SDK initialized successfully');
        } else {
            console.warn('[Firebase] No service account found — Firebase auth disabled');
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
