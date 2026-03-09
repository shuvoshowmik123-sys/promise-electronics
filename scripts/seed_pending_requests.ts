
import { db } from "../server/db";
import { serviceRequests } from "../shared/schema";
import { nanoid } from "nanoid";

async function main() {
    console.log("Seeding pending service requests...");

    const requests = [
        {
            id: nanoid(),
            ticketNumber: `SR-${nanoid().substring(0, 6).toUpperCase()}`,
            brand: "Samsung",
            modelNumber: "UA55TU8000",
            primaryIssue: "No Power",
            customerName: "John Doe",
            phone: "01711000000",
            address: "123 Test St, Dhaka",
            status: "Pending", // Important: Pending status
            stage: "intake",
            requestIntent: "repair",
            serviceMode: "service_center",
            createdAt: new Date(),
        },
        {
            id: nanoid(),
            ticketNumber: `SR-${nanoid().substring(0, 6).toUpperCase()}`,
            brand: "Sony",
            modelNumber: "Bravia X80J",
            primaryIssue: "Screen Flickering",
            customerName: "Jane Smith",
            phone: "01811000000",
            address: "456 Mock Ave, Dhaka",
            status: "Pending",
            stage: "intake",
            requestIntent: "repair",
            serviceMode: "home_pickup",
            pickupTier: "Regular",
            createdAt: new Date(),
        }
    ];

    // @ts-ignore - Ignore type partial mismatch for seeding
    await db.insert(serviceRequests).values(requests);

    console.log("Seeding complete. Added 2 pending requests.");
    process.exit(0);
}

main().catch((err) => {
    console.error("Seeding failed:", err);
    process.exit(1);
});
