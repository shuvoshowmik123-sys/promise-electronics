import { db } from "../server/db";
import * as schema from "../shared/schema";
import { normalizePhone } from "../server/utils/phone";
import { eq, isNull } from "drizzle-orm";

async function backfillPhones() {
    console.log("Starting phone number normalization backfill...");

    // 1. Backfill Users
    console.log("Backfilling Users...");
    const usersToUpdate = await db.select().from(schema.users).where(isNull(schema.users.phoneNormalized));

    let userCount = 0;
    for (const user of usersToUpdate) {
        if (user.phone) {
            const normalized = normalizePhone(user.phone);
            if (normalized) {
                await db.update(schema.users)
                    .set({ phoneNormalized: normalized })
                    .where(eq(schema.users.id, user.id));
                userCount++;
            }
        }
    }
    console.log(`Updated ${userCount} users.`);

    // 2. Backfill Job Tickets
    console.log("Backfilling Job Tickets...");
    const jobsToUpdate = await db.select().from(schema.jobTickets).where(isNull(schema.jobTickets.customerPhoneNormalized));

    let jobCount = 0;
    for (const job of jobsToUpdate) {
        if (job.customerPhone) {
            const normalized = normalizePhone(job.customerPhone);
            if (normalized) {
                await db.update(schema.jobTickets)
                    .set({ customerPhoneNormalized: normalized })
                    .where(eq(schema.jobTickets.id, job.id));
                jobCount++;
            }
        }
    }
    console.log(`Updated ${jobCount} job tickets.`);

    console.log("Backfill complete.");
    process.exit(0);
}

backfillPhones().catch(err => {
    console.error("Backfill failed:", err);
    process.exit(1);
});
