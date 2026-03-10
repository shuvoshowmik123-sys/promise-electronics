import { defineConfig } from "drizzle-kit";

export default defineConfig({
    out: "./migrations-brain",
    schema: "./server/brain/schema.ts",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.BRAIN_DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/brain",
    },
    strict: true,   // Enables strict schema validation
    verbose: true,  // Better error reporting
});
