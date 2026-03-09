
import { db } from "../server/db";
import { jobTickets } from "../shared/schema";
import { isNull, desc, asc, not, eq } from "drizzle-orm";

async function restoreData() {
    console.log("Starting Data Restoration...");

    // 1. Find the current max corporateJobNumber to initialize sequence
    // We look for patterns like "JOB-2026-XXXX"
    const existingJobs = await db.select({ num: jobTickets.corporateJobNumber })
        .from(jobTickets)
        .where(not(isNull(jobTickets.corporateJobNumber)));

    let maxSeq = 0;
    const currentYear = new Date().getFullYear();
    const prefix = `JOB-${currentYear}-`;

    existingJobs.forEach(j => {
        if (j.num && j.num.startsWith(prefix)) {
            const seq = parseInt(j.num.split('-')[2]);
            if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
        }
    });

    console.log(`Current Max Sequence for ${currentYear}: ${maxSeq}`);

    // 2. Fetch jobs with missing numbers, older first
    const missingJobs = await db.query.jobTickets.findMany({
        where: isNull(jobTickets.corporateJobNumber),
        orderBy: [asc(jobTickets.createdAt)]
    });

    console.log(`Found ${missingJobs.length} jobs to restore.`);

    let restoredCount = 0;

    for (const job of missingJobs) {
        let newNumber = "";

        // Strategy A: If ID is already in format, use it
        if (job.id.startsWith("JOB-")) {
            newNumber = job.id;
        }
        // Strategy B: Generate new sequence
        else {
            maxSeq++;
            newNumber = `${prefix}${maxSeq.toString().padStart(4, '0')}`;
        }

        console.log(`Restoring ${job.id} -> ${newNumber}`);

        await db.update(jobTickets)
            .set({ corporateJobNumber: newNumber })
            .where(eq(jobTickets.id, job.id));

        restoredCount++;
    }

    console.log(`Successfully restored ${restoredCount} jobs.`);
    process.exit(0);
}

restoreData().catch(console.error);
