import { neon } from "@neondatabase/serverless";

export async function migrateCorporateIntakeTables() {
    const url = process.env.DATABASE_URL;
    if (!url) return;

    const sql = neon(url);

    await sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS intake_verification_status TEXT NOT NULL DEFAULT 'not_required'`;
    await sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS intake_verification_note TEXT`;
    await sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS intake_verification_evidence JSONB DEFAULT '[]'::jsonb`;
    await sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS intake_verified_by TEXT`;
    await sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS intake_verified_at TIMESTAMP`;
    await sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS client_acknowledged_by TEXT`;
    await sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS client_acknowledged_at TIMESTAMP`;
    await sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS client_dispute_reason TEXT`;

    await sql`CREATE INDEX IF NOT EXISTS idx_job_tickets_intake_verification_status ON job_tickets (intake_verification_status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_job_tickets_corporate_intake_status ON job_tickets (corporate_client_id, intake_verification_status)`;
}
