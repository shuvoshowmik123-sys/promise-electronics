
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { corporateClients, users } from "../shared/schema";
import { eq, ilike } from "drizzle-orm";
import bcrypt from "bcryptjs";
import 'dotenv/config';

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set.");
}

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

async function main() {
    console.log("Updating 1000Fix credentials...");

    // 1. Find the client
    const clients = await db.select().from(corporateClients).where(ilike(corporateClients.companyName, "%1000Fix%"));

    if (clients.length === 0) {
        console.error("1000Fix client not found in database.");
        return;
    }

    const client = clients[0];
    const username = "1000fix_admin";
    const password = "password123";

    console.log(`Found client: ${client.companyName} (ID: ${client.id})`);

    // 2. Update client with username if missing
    if (!client.portalUsername) {
        await db.update(corporateClients)
            .set({ portalUsername: username })
            .where(eq(corporateClients.id, client.id));
        console.log(`Updated client with username: ${username}`);
    } else {
        console.log(`Client already has username: ${client.portalUsername}`);
    }

    // 3. Create User account
    const existingUser = await db.select().from(users).where(eq(users.corporateClientId, client.id));

    if (existingUser.length === 0) {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.insert(users).values({
            id: `corp-user-${client.id}`,
            username: client.portalUsername || username,
            name: client.contactPerson || client.companyName,
            email: `corp-${client.shortCode || '1000F'}@example.com`,
            password: hashedPassword,
            role: "Corporate",
            corporateClientId: client.id,
            permissions: JSON.stringify({
                dashboard: true,
                jobs: true,
                finance: true,
                serviceRequests: true,
                reports: true,
                settings: true,
                inquiries: true,
                canCreate: true,
                canEdit: true,
                canExport: true,
                view_financials: true,
            }),
            isVerified: true
        } as any);
        console.log(`✅ Created user account for ${client.companyName}`);
    } else {
        console.log(`User account already exists for ${client.companyName}`);
    }

    await pool.end();
    console.log("\nDone!");
}

main().catch(console.error);
