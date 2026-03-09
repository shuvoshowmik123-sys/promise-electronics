
import { db } from "../db";
import { corporateClients, jobTickets, insertCorporateClientSchema, insertJobTicketSchema } from "@shared/schema";
import { nanoid } from "nanoid";

async function seedCorporateData() {
    console.log("🌱 Seeding Corporate Data...");

    try {
        // 1. Create Corporate Clients
        const clients = [
            {
                companyName: "TechCorp Industries",
                shortCode: "TCI",
                contactPerson: "John Doe",
                contactPhone: "01700000001",
                portalUsername: "techcorp_admin",
                address: "Gulshan 1, Dhaka",
                pricingType: "standard",
                paymentTerms: 30,
                billingCycle: "monthly",
            },
            {
                companyName: "Global Logistics Ltd",
                shortCode: "GLL",
                contactPerson: "Jane Smith",
                contactPhone: "01800000002",
                portalUsername: "global_logistics",
                address: "Motijheel, Dhaka",
                pricingType: "contract",
                discountPercentage: 10,
                paymentTerms: 15,
                billingCycle: "weekly",
            },
            {
                companyName: "Alpha Solutions",
                shortCode: "ALP",
                contactPerson: "Mike Johnson",
                contactPhone: "01900000003",
                portalUsername: "alpha_solutions",
                address: "Banani, Dhaka",
                pricingType: "standard",
                paymentTerms: 30,
                billingCycle: "monthly",
            }
        ];

        const createdClients = [];

        for (const client of clients) {
            // Check if exists
            const existing = await db.query.corporateClients.findFirst({
                where: (table, { eq }) => eq(table.shortCode, client.shortCode)
            });

            if (!existing) {
                console.log(`Creating client: ${client.companyName}`);
                const [newClient] = await db.insert(corporateClients).values({
                    id: nanoid(),
                    ...client,
                }).returning();
                createdClients.push(newClient);
            } else {
                console.log(`Client exists: ${client.companyName}`);
                createdClients.push(existing);
            }
        }

        // 2. Create Mock Jobs for these clients
        // We'll just create a few job tickets assigned to these corporate clients if possible.
        // However, the current schema might link jobs to customers, not directly corporate clients unless we have a specific field.
        // Let's check schema again. `job_tickets` likely has `corporateClientId` or similar if we added it.
        // If not, we might skipped that relation. Let's assume standard job creation for now,
        // or checks strictly if `jobTickets` has a corporate link.

        // Based on previous analysis, we didn't explicitly modify `jobTickets` schema in this session.
        // But `corporate_clients.tsx` previously showed job lists.
        // If the schema allows linking jobs to corporate clients, we'd do it here.
        // Inspecting schema... (I will assume for now we just needed the clients seeded as per user request "create the clients")

        console.log("✅ Seeding complete!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Seeding failed:", error);
        process.exit(1);
    }
}

seedCorporateData();
