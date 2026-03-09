
import { db } from "../server/db";
import * as schema from "../shared/schema";
import { ilike, or, eq } from "drizzle-orm";

async function searchOthers() {
    console.log("Searching Service Requests...");

    // Service Requests don't have corporateClientId directly, they are linked via user or text?
    // Schema check needed. But we search text fields.

    const requests = await db.select().from(schema.serviceRequests);
    console.log(`Total Service Requests: ${requests.length}`);

    const vpRequests = requests.filter(r =>
        (r.description && (r.description.toLowerCase().includes("vp") || r.description.toLowerCase().includes("finance"))) ||
        (r.deviceDetails && JSON.stringify(r.deviceDetails).toLowerCase().includes("vp"))
    );

    if (vpRequests.length > 0) {
        console.log(`Found ${vpRequests.length} Service Requests matching VP/Finance:`);
        vpRequests.forEach(r => console.log(` - [${r.requestNumber}] ${r.status} : ${r.description?.substring(0, 50)}...`));
    } else {
        console.log("No Service Requests found.");
    }

    console.log("Searching Corporate Messages...");
    const messages = await db.select().from(schema.corporateMessages);
    console.log(`Total Messages: ${messages.length}`);

    const vpMessages = messages.filter(m =>
        m.content && (m.content.toLowerCase().includes("vp") || m.content.toLowerCase().includes("finance"))
    );

    if (vpMessages.length > 0) {
        console.log(`Found ${vpMessages.length} Messages matching VP/Finance:`);
        vpMessages.forEach(m => console.log(` - [Thread ${m.threadId}] ${m.senderType}: ${m.content?.substring(0, 50)}...`));
    } else {
        console.log("No Messages found.");
    }
}

searchOthers().catch(console.error).finally(() => process.exit());
