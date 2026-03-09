
import { db } from "../server/db";
import { jobTickets, corporateClients } from "../shared/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

async function seedCorporateJobs() {
    console.log("🌱 Seeding Corporate Jobs...");

    // 1. Fetch Corporate Clients
    const clients = await db.select().from(corporateClients);

    if (clients.length === 0) {
        console.log("❌ No corporate clients found. Please run basic seed first.");
        return;
    }

    console.log(`Checking jobs for ${clients.length} clients...`);

    for (const client of clients) {
        // Check existing jobs
        const existingJobs = await db.select().from(jobTickets).where(eq(jobTickets.corporateClientId, client.id));

        if (existingJobs.length > 0) {
            console.log(`✅ Client ${client.companyName} (${client.shortCode}) already has ${existingJobs.length} jobs.`);
            continue;
        }

        console.log(`Creating dummy jobs for ${client.companyName}...`);

        const statuses = ["Diagnosing", "Pending Parts", "Ready", "Delivered", "In Repair"];
        const devices = ["Samsung 43\" Smart TV", "Sony Bravia 55\"", "LG OLED 65\"", "Walton 32\" Basic", "Philips Monitor"];
        const issues = ["Backlight issue", "No Power", "Sound but no picture", "HDMI port broken", "Software bootloop"];

        const jobsToInsert = [];

        for (let i = 0; i < 5; i++) {
            const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
            const randomDevice = devices[Math.floor(Math.random() * devices.length)];
            const randomIssue = issues[Math.floor(Math.random() * issues.length)];
            const jobNo = `${client.shortCode}-${24001 + i}`;

            jobsToInsert.push({
                id: nanoid(),
                corporateJobNumber: jobNo, // e.g. 1KF-24001
                customer: client.companyName,
                // customerId removed
                customerPhone: client.contactPhone || "0000000000",
                customerAddress: "Corporate Office",
                device: randomDevice,
                tvSerialNumber: `SN-${Math.floor(Math.random() * 100000)}`,
                issue: randomIssue,
                reportedDefect: randomIssue,
                status: randomStatus,
                priority: "Medium",
                technician: "Unassigned",
                notes: "Seeded by script",
                paymentStatus: "paid",
                corporateClientId: client.id, // Explicit link
                createdAt: new Date(),
            });
        }

        // @ts-ignore - bypassing strict type checks for seed script speed
        await db.insert(jobTickets).values(jobsToInsert);
        console.log(`+ Added 5 jobs for ${client.shortCode}`);
    }

    console.log("✅ Corporate Job Seeding Complete.");
    process.exit(0);
}

seedCorporateJobs().catch(console.error);
