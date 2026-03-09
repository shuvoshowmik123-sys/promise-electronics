
import { db } from "../server/db";
import * as schema from "../shared/schema";
import { like, or, desc } from "drizzle-orm";

async function findVpJob() {
    console.log("Searching GLOBAL matching jobs...");

    // Use 'like' which is standard. 
    // We search for %VP% or %Finance% in customer field
    const request = await db.select().from(schema.jobTickets)
        .where(or(
            like(schema.jobTickets.customer, "%VP%"),
            like(schema.jobTickets.customer, "%Finance%"),
            like(schema.jobTickets.issueDescription, "%VP%"),
            like(schema.jobTickets.issueDescription, "%Finance%")
        ))
        .orderBy(desc(schema.jobTickets.createdAt))
        .limit(20);

    console.log(`Found ${request.length} potential matches.`);

    request.forEach(j => {
        console.log(`[${j.jobNo}] Customer: ${j.customer}`);
        console.log(`   - ID: ${j.id}`);
        console.log(`   - Linked Client: ${j.corporateClientId}`);
        console.log(`   - Desc: ${j.issueDescription?.substring(0, 100)}`);
        console.log("---");
    });
}

findVpJob().catch(console.error).finally(() => process.exit());
