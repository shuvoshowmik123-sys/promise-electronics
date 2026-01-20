import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function testFCM() {
    console.log('--- FCM Connectivity Test ---');

    // 1. Load Credentials
    // script is in scripts/, so server/ is ../server/
    const serviceAccountPath = join(__dirname, '../server/firebase-service-account.json');
    console.log(`Checking credentials at: ${serviceAccountPath}`);

    if (!existsSync(serviceAccountPath)) {
        console.error('❌ ERROR: firebase-service-account.json not found!');
        process.exit(1);
    }

    try {
        const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
        console.log(`✅ Credentials loaded for project: ${serviceAccount.project_id}`);

        // 2. Initialize App
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log('✅ Firebase Admin Initialized');
        }

        // 3. Test Connection (Dry Run with Dummy Token)
        const dummyToken = 'dummmy_token_example_1234567890';
        console.log('Attempting to send dry-run message to dummy token...');

        try {
            await admin.messaging().send({
                token: dummyToken,
                notification: {
                    title: 'Test Notification',
                    body: 'This is a connectivity test'
                }
            }, true); // true = dryRun

            console.log('❓ Unexpected: Dry run success with dummy token (should usually fail validation)');
        } catch (error) {
            // expected error likely
            if (error.code === 'messaging/registration-token-not-registered' ||
                error.code === 'messaging/invalid-argument') {
                console.log(`✅ SUCCESS: Reached FCM servers!`);
                console.log(`   Server responded with expected error for dummy token: ${error.code}`);
                console.log('   This confirms that authentication is WORKING.');
            } else {
                console.error('❌ ERROR: Unexpected error during send:', error);
                console.log('   (This might indicate an auth issue if code is auth/...)');
            }
        }

    } catch (e) {
        console.error('❌ CRITICAL FAILURE:', e);
        process.exit(1);
    }
}

testFCM();
