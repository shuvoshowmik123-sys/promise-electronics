import "dotenv/config";
import { db } from "../server/db";
import { customerAddresses } from "../shared/schema";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";

async function main() {
    console.log("Testing customer_addresses table...");
    try {
        const testId = nanoid();
        const testCustomerId = "test-customer-id";

        console.log("Attempting to insert a test address...");
        const result = await db.insert(customerAddresses).values({
            id: testId,
            customerId: testCustomerId,
            label: "Test Home",
            address: "123 Test St",
            isDefault: false,
        }).returning();

        console.log("Insert successful:", result);

        console.log("Attempting to delete the test address...");
        await db.delete(customerAddresses).where(eq(customerAddresses.id, testId));
        console.log("Delete successful.");

    } catch (error) {
        console.error("Error accessing customer_addresses table:", error);
    }
    process.exit(0);
}

main();
