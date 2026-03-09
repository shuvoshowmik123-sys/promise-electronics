
import { db } from "../server/db";
import * as schema from "../shared/schema";
import { eq, ilike, and, isNull, desc } from "drizzle-orm";

async function check1000FixJobs() {
    console.log("Searching for '1000FIX' client...");

    const clients = await db.select().from(schema.corporateClients)
        .where(ilike(schema.corporateClients.companyName, "%1000FIX%"));

    if (clients.length === 0) {
        console.log("No client found for 1000FIX");
        return;
    }

    const client = clients[0];
    console.log(`Found Client: ${client.companyName} (ID: ${client.id})`);

    // Fetch ALL jobs for this client
    const allJobs = await db.select().from(schema.jobTickets)
        .where(eq(schema.jobTickets.corporateClientId, client.id));

    console.log(`Total Linked Jobs: ${allJobs.length}`);

    // Filter in memory for VP or Finance
    const vpJobs = allJobs.filter(j =>
        (j.customer && (j.customer.includes("VP") || j.customer.includes("Finance"))) ||
        (j.issueDescription && (j.issueDescription.includes("VP") || j.issueDescription.includes("Finance")))
    );

    if (vpJobs.length === 0) {
        console.log("No jobs found with 'VP' or 'Finance' in LINKED jobs.");
        // Try unlinked search in memory if possible, but that requires fetching ALL jobs which is too heavy.
        // Instead we will search unlinked jobs via query with LIKE (not ILIKE if that failed)
    } else {
        console.log(`Found ${vpJobs.length} matches in LINKED jobs:`);
        vpJobs.forEach(j => {
            // Use bracket notation if property access is weird, but it shouldn't be.
            // Print entire object keys if needed
            console.log(`MATCH: JobNo=${j.jobNo || j['job_no']} | Customer=${j.customer} | Status=${j.status}`);
            console.log(`Desc: ${j.issueDescription?.substring(0, 50)}...`);
        });
    }
}

check1000FixJobs().catch(console.error).finally(() => process.exit());
