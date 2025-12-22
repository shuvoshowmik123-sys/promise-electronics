
import { db } from "../server/db";
import { users } from "../shared/schema";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

async function createAdmin() {
    const username = "admin";
    const password = "admin123";
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log(`Creating/Updating admin user: ${username}`);

    try {
        const existingUser = await db.query.users.findFirst({
            where: eq(users.username, username),
        });

        if (existingUser) {
            console.log("Admin user already exists. Updating password...");
            await db.update(users)
                .set({ password: hashedPassword, role: "Super Admin" })
                .where(eq(users.username, username));
            console.log("Admin password updated successfully!");
        } else {
            await db.insert(users).values({
                id: nanoid(),
                username,
                password: hashedPassword,
                name: "Super Admin",
                role: "Super Admin",
                status: "Active",
                permissions: JSON.stringify({}),
            });
            console.log("Admin user created successfully!");
        }
        console.log(`Username: ${username}`);
        console.log(`Password: ${password}`);
    } catch (error) {
        console.error("Error creating/updating admin user:", error);
    }
    process.exit(0);
}

createAdmin();
