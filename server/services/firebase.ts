
import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Initialize Firebase Admin SDK
const serviceAccountPath = join(process.cwd(), 'server', 'firebase-service-account.json');

if (!admin.apps.length) {
    try {
        if (existsSync(serviceAccountPath)) {
            const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
            console.log('[Firebase] Admin SDK initialized successfully');
        } else {
            console.warn('[Firebase] Service account file not found at:', serviceAccountPath);
        }
    } catch (error) {
        console.error('[Firebase] Failed to initialize Admin SDK:', error);
    }
}

export const firebaseAdmin = admin;
