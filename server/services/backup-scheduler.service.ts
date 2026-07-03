/**
 * Backup Scheduler (Phase 5)
 *
 * Runs a full encrypted backup daily at 02:00 server time.
 * Requires env vars:
 *   BACKUP_ENCRYPTION_PASSWORD — minimum 16 chars (set on Render)
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
 *   GOOGLE_DRIVE_BACKUP_FOLDER_ID
 *
 * Skips silently if BACKUP_ENCRYPTION_PASSWORD is not set.
 * Logs to console; sends FCM push to admins on failure.
 */
import { backupService } from "./backup.service.js";
import { sendPushToAllAdmins } from "./fcm.service.js";
import { isDbReady } from "./db-readiness.js";

const SYSTEM_USER_ID = "system";
const SYSTEM_USER_NAME = "Scheduled Backup";
const TARGET_HOUR = 2; // 2 AM server time
const CHECK_INTERVAL_MS = 10 * 60 * 1000; // check every 10 minutes

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let lastBackupDate: string | null = null; // "YYYY-MM-DD"

export function startBackupScheduler(): void {
    const password = process.env.BACKUP_ENCRYPTION_PASSWORD;
    if (!password) {
        console.log("[Backup Scheduler] BACKUP_ENCRYPTION_PASSWORD not set — scheduled backups disabled");
        return;
    }
    if (password.length < 16) {
        console.warn("[Backup Scheduler] BACKUP_ENCRYPTION_PASSWORD too short (min 16 chars) — disabled");
        return;
    }
    if (schedulerTimer) return;

    console.log("[Backup Scheduler] Started — will run at 02:00 daily");
    schedulerTimer = setInterval(() => runIfDue(password), CHECK_INTERVAL_MS);
    // Check immediately on start (in case server restarted after 2 AM)
    runIfDue(password).catch(e => console.error("[Backup Scheduler] Startup check error:", e));
}

export function stopBackupScheduler(): void {
    if (schedulerTimer) {
        clearInterval(schedulerTimer);
        schedulerTimer = null;
    }
}

async function runIfDue(password: string): Promise<void> {
    if (!isDbReady()) {
        console.log('[Backup Scheduler] Skipping — DB not ready');
        return;
    }
    const now = new Date();
    const today = now.toISOString().slice(0, 10); // "YYYY-MM-DD"

    // Only run once per day, at or after 02:00
    if (now.getHours() < TARGET_HOUR) return;
    if (lastBackupDate === today) return;

    lastBackupDate = today; // mark before running to prevent double-trigger
    console.log(`[Backup Scheduler] Starting daily backup for ${today}...`);

    try {
        await backupService.createBackup(
            password,
            SYSTEM_USER_ID,
            SYSTEM_USER_NAME,
            "scheduled",
            `Daily automated backup — ${today}`
        );
        console.log(`[Backup Scheduler] Daily backup completed for ${today}`);
    } catch (err: any) {
        console.error(`[Backup Scheduler] Daily backup FAILED for ${today}:`, err.message);
        // Alert admins via FCM
        sendPushToAllAdmins({
            title: "Daily Backup Failed",
            body: `Automated backup for ${today} failed: ${err.message?.slice(0, 100)}`,
            data: { type: "backup_failure", date: today },
        }).catch(() => {});
        // Reset so it retries next cycle
        lastBackupDate = null;
    }
}
