
import { config } from 'dotenv';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Load env
config({ path: join(process.cwd(), '.env') });

async function runTest() {
    console.log("=== Testing Google Auth Configuration ===");
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (clientId) console.log("✅ GOOGLE_CLIENT_ID is set.");
    else console.error("❌ GOOGLE_CLIENT_ID is MISSING.");

    if (clientSecret) console.log("✅ GOOGLE_CLIENT_SECRET is set.");
    else console.error("❌ GOOGLE_CLIENT_SECRET is MISSING.");

    console.log("\n=== Testing Firebase/Push Configuration ===");
    const serviceAccountPath = join(process.cwd(), 'server', 'firebase-service-account.json');

    if (existsSync(serviceAccountPath)) {
        console.log("✅ firebase-service-account.json exists.");
        try {
            JSON.parse(readFileSync(serviceAccountPath, 'utf-8'));
            console.log("✅ firebase-service-account.json is valid JSON.");
        } catch (e) {
            console.error("❌ firebase-service-account.json is INVALID JSON.");
        }
    } else {
        console.error("❌ firebase-service-account.json is MISSING at " + serviceAccountPath);
    }

    try {
        console.log("\n=== Attempting to Import Push Service ===");
        // We import dynamically to avoid crashing if dependencies are missing during top-level import
        const { pushService } = await import('../server/pushService.ts');
        console.log("✅ Push Service imported successfully.");

        console.log("\n=== Checking Notification Triggers in Codebase (Static Analysis) ===");
        console.log("ℹ️  To fix Post Notifications, we need to ensure 'pushService.notifyOrderStatusChange' is called in job routes.");

    } catch (e) {
        console.error("❌ Failed to import Push Service:", e);
    }
}

runTest().catch(console.error);
