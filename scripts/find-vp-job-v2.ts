
import { db } from "../server/db";
import * as schema from "../shared/schema";
import { desc, count } from "drizzle-orm";

async function findVpJob() {
    console.log("Counting total matching jobs...");

    const [countRes] = await db.select({ value: count() }).from(schema.jobTickets);
    console.log(`Total Job Tickets in DB: ${countRes.value}`);

    const limit = 2000;
    console.log(`Fetching last ${limit} jobs...`);

    const allJobs = await db.select().from(schema.jobTickets)
        .orderBy(desc(schema.jobTickets.createdAt))
        .limit(limit);

    console.log(`Loaded ${allJobs.length} jobs. Searching...`);

    const matches = allJobs.filter(j =>
        (j.customer && (j.customer.toLowerCase().includes("vp") || j.customer.toLowerCase().includes("finance"))) ||
        (j.issueDescription && (j.issueDescription.toLowerCase().includes("vp") || j.issueDescription.toLowerCase().includes("finance")))
    );

    if (matches.length === 0) {
        console.log("No matches found in the last 2000 jobs.");
    } else {
        console.log(`Found ${matches.length} matches:`);
        matches.forEach(j => {
            console.log(`MATCH: [${j.jobNo}] Customer: ${j.customer} | ID: ${j.id}`);
            console.log(`   - Linked Client: ${j.corporateClientId}`);
            console.log(`   - Desc: ${j.issueDescription?.substring(0, 100).replace(/\n/g, ' ')}`);
            console.log("---");
        });
    }
}

findVpJob().catch(console.error).finally(() => process.exit());
