import { auditLogger } from "./utils/auditLogger.js";
import { storage } from "./storage.js";

async function test() {
    console.log("Creating Audit Log...");
    await auditLogger.log({
        userId: "test-user-id",
        action: "TEST_ACTION",
        entity: "TestEntity",
        entityId: "123",
        details: "Testing the audit system",
        oldValue: { status: "A" },
        newValue: { status: "B" },
    });

    console.log("Reading Logs...");
    const logs = await storage.getAuditLogs({ userId: "test-user-id" });
    console.log("Found Logs:", logs.length);
    if (logs.length > 0) {
        console.log("Latest Log:", JSON.stringify(logs[0], null, 2));
    }
    process.exit(0);
}

test().catch(console.error);
