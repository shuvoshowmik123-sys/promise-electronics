
import { db } from "../server/db";
import { jobTickets } from "../shared/schema";
import { isNull, count } from "drizzle-orm";

async function checkData() {
    console.log("Checking for missing corporateJobNumbers...");
    const result = await db.select({ count: count() })
        .from(jobTickets)
        .where(isNull(jobTickets.corporateJobNumber));

    console.log(`Found ${result[0].count} jobs with missing corporateJobNumber.`);

    if (result[0].count > 0) {
        console.log("Attempting to list first 5 IDs:");
        const badRows = await db.query.jobTickets.findMany({
            where: isNull(jobTickets.corporateJobNumber),
            limit: 5,
            columns: { id: true, createdAt: true }
        });
        console.log(badRows);
    } else {
        console.log("Data integrity looks good!");
    }
    process.exit(0);
}

checkData().catch(console.error);
