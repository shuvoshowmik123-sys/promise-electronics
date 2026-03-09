
import { db } from "../server/db";
import * as schema from "../shared/schema";
import { eq, ilike, or } from "drizzle-orm";

async function checkShewraparaAndUsers() {
    console.log("Checking 1000FIX - shewrapara...");

    // 1. Find the client
    const clients = await db.select().from(schema.corporateClients)
        .where(ilike(schema.corporateClients.companyName, "%1000FIX - shewrapara%"));

    if (clients.length > 0) {
        const client = clients[0];
        console.log(`Found Client: ${client.companyName} (ID: ${client.id})`);

        // Check jobs
        const jobs = await db.select().from(schema.jobTickets)
            .where(eq(schema.jobTickets.corporateClientId, client.id));

        console.log(`Jobs for shewrapara: ${jobs.length}`);
        jobs.forEach(j => {
            if (j.customer?.includes("VP") || j.customer?.includes("Finance") ||
                j.issueDescription?.includes("VP") || j.issueDescription?.includes("Finance")) {
                console.log(` - MATCH [${j.jobNo}]: ${j.customer} | ${j.issueDescription}`);
            }
        });
    } else {
        console.log("Client '1000FIX - shewrapara' not found.");
    }

    // 2. Search Users
    console.log("Searching Users for 'VP' or 'Finance'...");
    const users = await db.select().from(schema.users)
        .where(or(
            ilike(schema.users.name, "%VP%"),
            ilike(schema.users.name, "%Finance%"),
            ilike(schema.users.role, "%VP%"),
            ilike(schema.users.role, "%Finance%")
        ));

    if (users.length === 0) {
        console.log("No users found with 'VP' or 'Finance'.");
    } else {
        console.log(`Found ${users.length} users:`);
        users.forEach(u => console.log(` - ${u.name} (${u.role})`));
    }
}

checkShewraparaAndUsers().catch(console.error).finally(() => process.exit());
