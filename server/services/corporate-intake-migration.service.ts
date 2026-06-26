import { db } from "../db.js";
import { sql } from "drizzle-orm";

export async function migrateCorporateIntakeTables() {
    await db.execute(sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS intake_verification_status TEXT NOT NULL DEFAULT 'not_required'`);
    await db.execute(sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS intake_verification_note TEXT`);
    await db.execute(sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS intake_verification_evidence JSONB DEFAULT '[]'::jsonb`);
    await db.execute(sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS intake_verified_by TEXT`);
    await db.execute(sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS intake_verified_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS client_acknowledged_by TEXT`);
    await db.execute(sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS client_acknowledged_at TIMESTAMP`);
    await db.execute(sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS client_dispute_reason TEXT`);

    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_job_tickets_intake_verification_status ON job_tickets (intake_verification_status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_job_tickets_corporate_intake_status ON job_tickets (corporate_client_id, intake_verification_status)`);
}
