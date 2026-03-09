
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { corporateClients, users } from "../shared/schema";
import { eq } from "drizzle-orm";
import 'dotenv/config';

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set.");
}

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

async function main() {
    console.log("Checking Corporate Clients...");
    try {
        const clients = await db.select().from(corporateClients).limit(5);
        console.log("Found", clients.length, "clients.");
        if (clients.length > 0) {
            console.log("First client:", clients[0]);
        } else {
            console.log("No corporate clients found. Please create one.");
        }

        console.log("\nChecking Corporate Users...");
        console.log("\nSyncing Corporate Users...");

        // Fetch all corporate clients
        const allClients = await db.select().from(corporateClients);
        console.log(`Found ${allClients.length} corporate clients.`);

        for (const client of allClients) {
            if (!client.portalUsername) {
                console.log(`Skipping client ${client.companyName} (No portal username set)`);
                continue;
            }

            // Check if user exists for this client
            const existingUser = await db.select().from(users).where(eq(users.corporateClientId, client.id));

            if (existingUser.length === 0) {
                console.log(`Creating user for client: ${client.companyName} (${client.portalUsername})`);

                // Use existing hash or default 'password123' if hash is missing/invalid format (though schema says portalPasswordHash is text)
                // If portalPasswordHash is empty, generate a default one
                let passwordHash = client.portalPasswordHash;
                if (!passwordHash) {
                    const bcrypt = await import("bcryptjs");
                    passwordHash = await bcrypt.hash("password123", 10);
                    console.log(`  > No password hash found, using default 'password123'`);
                }

                try {
                    await db.insert(users).values({
                        id: `corp-user-${client.id}`, // Deterministic ID or nanoid
                        username: client.portalUsername,
                        name: client.contactPerson || client.companyName,
                        email: `corp-${client.shortCode}@example.com`, // Dummy email
                        password: passwordHash,
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
                    console.log(`  > ✅ Created user: ${client.portalUsername}`);
                } catch (e: any) {
                    console.error(`  > ❌ Failed to create user: ${e.message}`);
                }
            } else {
                console.log(`User already exists for client: ${client.companyName}`);
            }
        }
    } catch (err) {
        console.error("Error executing query:", err);
    } finally {
        await pool.end();
    }
}

main();
