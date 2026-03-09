
import { storage } from "../server/storage";
import { db } from "../server/db";
import { eq } from "drizzle-orm";
import { serviceRequests } from "../shared/schema";

async function main() {
    console.log("Verifying Backend Logic...");

    // Test 1: proper filtering
    console.log("\nTesting getAllServiceRequests filtering...");
    const pendingRequests = await storage.getAllServiceRequests({ status: 'Pending' });
    console.log(`Found ${pendingRequests.length} pending requests.`);

    if (pendingRequests.length === 0) {
        console.warn("No pending requests found. Seeding didn't work or filter failed.");
        process.exit(1);
    }

    const targetRequest = pendingRequests[0];
    console.log(`Selected Request: ${targetRequest.id} (${targetRequest.ticketNumber})`);

    // Test 2: Verify and Convert
    console.log("\nTesting verifyAndConvertServiceRequest...");

    try {
        const result = await storage.verifyAndConvertServiceRequest(
            targetRequest.id,
            "Test Manager",
            "Verified via script. Issue confirmed.",
            "High"
        );

        console.log("Conversion Successful!");
        console.log(`Job Ticket ID: ${result.jobTicket.id}`);
        console.log(`Service Request Status: ${result.serviceRequest.status}`);
        console.log(`Linked Job ID: ${result.serviceRequest.convertedJobId}`);

        if (result.serviceRequest.status !== 'Converted') {
            throw new Error("Status was not updated to Converted");
        }
        if (!result.serviceRequest.convertedJobId) {
            throw new Error("convertedJobId was not set");
        }

    } catch (error) {
        console.error("Verification logic failed:", error);
        process.exit(1);
    }

    console.log("\nBackend Logic Verification Passed!");
    process.exit(0);
}

main().catch(console.error);
