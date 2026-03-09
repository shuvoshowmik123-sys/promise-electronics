
import { db } from "../server/db";
import * as schema from "../shared/schema";
import { eq } from "drizzle-orm";

async function list1000FixCustomers() {
    const clientId = "wypkUqy_Q8sFLAcCf38os"; // 1000FIX ID

    const jobs = await db.select().from(schema.jobTickets)
        .where(eq(schema.jobTickets.corporateClientId, clientId));

    const customers = new Set(jobs.map(j => j.customer));

    console.log(`Found ${jobs.length} jobs with ${customers.size} unique customer names.`);
    console.log(Array.from(customers).sort().join("\n"));
}

list1000FixCustomers().catch(console.error).finally(() => process.exit());
