
import { db } from "../server/db";
import * as schema from "../shared/schema";

async function listClients() {
    const clients = await db.select().from(schema.corporateClients);
    console.log(`Total Clients: ${clients.length}`);
    clients.forEach(c => console.log(` - ${c.companyName} (ID: ${c.id})`));
}

listClients().catch(console.error).finally(() => process.exit());
