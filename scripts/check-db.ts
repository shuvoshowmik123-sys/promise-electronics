import { db } from "../server/db";
import { systemModules } from "../shared/schema";
import { eq } from "drizzle-orm";

async function checkModules() {
    try {
        console.log("Checking modules in DB...");
        const modules = await db.select().from(systemModules);
        console.log(`Found ${modules.length} modules.`);

        // Print the first one to see all fields
        if (modules.length > 0) {
            console.log("Sample module keys:", Object.keys(modules[0]));

            // Check specific portal scopes
            const posMod = modules.find(m => m.id === "jobs");
            console.log("JOBS module:", posMod ? {
                id: posMod.id,
                portalScope: posMod.portalScope,
                enabledAdmin: posMod.enabledAdmin
            } : "Not found");
        }

        process.exit(0);
    } catch (e) {
        console.error("DB Error:", e);
        process.exit(1);
    }
}

checkModules();
