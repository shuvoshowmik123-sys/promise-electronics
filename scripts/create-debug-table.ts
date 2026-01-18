
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function createDebugTable() {
    console.log("Creating ai_debug_suggestions table...");

    await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "ai_debug_suggestions" (
      "id" serial PRIMARY KEY NOT NULL,
      "error" text NOT NULL,
      "stack_trace" text,
      "suggestion" text,
      "status" text DEFAULT 'NEEDS_REVIEW',
      "created_at" timestamp DEFAULT now() NOT NULL
    );
  `);

    console.log("Table created successfully!");
    process.exit(0);
}

createDebugTable().catch((err) => {
    console.error("Error creating table:", err);
    process.exit(1);
});
