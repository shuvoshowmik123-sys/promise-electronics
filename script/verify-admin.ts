
import { db } from "../server/db";
import { users } from "../shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function verifyAdmin() {
    const username = "admin";
    const passwordToCheck = "admin123";

    console.log(`Verifying admin user: ${username}`);

    try {
        const user = await db.query.users.findFirst({
            where: eq(users.username, username),
        });

        if (!user) {
            console.log("❌ User 'admin' NOT FOUND in the database.");
        } else {
            console.log("✅ User 'admin' FOUND.");
            console.log("ID:", user.id);
            console.log("Role:", user.role);
            console.log("Status:", user.status);
            console.log("Password Hash:", user.password);

            const isMatch = await bcrypt.compare(passwordToCheck, user.password);
            if (isMatch) {
                console.log("✅ Password 'admin123' MATCHES the hash.");
            } else {
                console.log("❌ Password 'admin123' DOES NOT MATCH the hash.");
            }
        }
    } catch (error) {
        console.error("Error verifying admin user:", error);
    }
    process.exit(0);
}

verifyAdmin();
