import { db } from "./db.js";
import { users } from "@shared/schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

const DEFAULT_SUPER_ADMIN = {
  username: "admin",
  name: "Super Administrator",
  email: "admin@promise-electronics.com",
  password: "admin123", // Default password - should be changed after first login
  role: "Super Admin" as const,
  status: "Active",
  permissions: JSON.stringify({
    dashboard: true,
    jobs: true,
    inventory: true,
    pos: true,
    challans: true,
    finance: true,
    attendance: true,
    reports: true,
    serviceRequests: true,
    users: true,
    settings: true,
    canCreate: true,
    canEdit: true,
    canDelete: true,
    canExport: true,
  }),
};

export async function seedSuperAdmin() {
  try {
    // Check if any super admin exists
    const [existingAdmin] = await db
      .select()
      .from(users)
      .where(eq(users.role, "Super Admin"));

    if (existingAdmin) {
      console.log("Super Admin already exists, skipping seed.");
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(DEFAULT_SUPER_ADMIN.password, 12);

    // Create super admin
    const [admin] = await db
      .insert(users)
      .values({
        ...DEFAULT_SUPER_ADMIN,
        id: nanoid(),
        password: hashedPassword,
      })
      .returning();

    console.log("Super Admin created successfully!");
    console.log("Username:", DEFAULT_SUPER_ADMIN.username);
    console.log("IMPORTANT: Please change the default password after first login.");

    return admin;
  } catch (error) {
    console.error("Error seeding super admin:", error);
  }
}
