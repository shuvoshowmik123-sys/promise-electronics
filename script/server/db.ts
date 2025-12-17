import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  // throw new Error("DATABASE_URL environment variable is not set");
  // For SQLite, we can default to a local file if not set, or use the env var as the filename
}

const sqlite = new Database("sqlite.db");
export const db = drizzle(sqlite, { schema });
