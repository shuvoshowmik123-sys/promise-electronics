import { neon } from "@neondatabase/serverless";

export async function migrateB2BRuleProfileTables() {
    const url = process.env.DATABASE_URL;
    if (!url) return;

    const sql = neon(url);

    await sql`ALTER TABLE corporate_clients ADD COLUMN IF NOT EXISTS client_type TEXT NOT NULL DEFAULT 'corporate'`;
    await sql`ALTER TABLE corporate_clients ADD COLUMN IF NOT EXISTS rule_profile JSONB DEFAULT '{}'::jsonb`;
    await sql`ALTER TABLE corporate_clients ADD COLUMN IF NOT EXISTS default_batch_clearance_days INTEGER NOT NULL DEFAULT 7`;
    await sql`ALTER TABLE corporate_clients ADD COLUMN IF NOT EXISTS service_warranty_enabled BOOLEAN NOT NULL DEFAULT TRUE`;
    await sql`ALTER TABLE corporate_clients ADD COLUMN IF NOT EXISTS default_service_warranty_days INTEGER NOT NULL DEFAULT 30`;

    await sql`ALTER TABLE job_batches ADD COLUMN IF NOT EXISTS target_clear_date TIMESTAMP`;
    await sql`ALTER TABLE job_batches ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMP`;
    await sql`ALTER TABLE job_batches ADD COLUMN IF NOT EXISTS batch_status TEXT NOT NULL DEFAULT 'open'`;
    await sql`ALTER TABLE job_batches ADD COLUMN IF NOT EXISTS extension_count INTEGER NOT NULL DEFAULT 0`;
    await sql`ALTER TABLE job_batches ADD COLUMN IF NOT EXISTS corporate_challan_id TEXT`;

    await sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS batch_target_clear_date TIMESTAMP`;
    await sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS extension_status TEXT DEFAULT 'none'`;
    await sql`ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS extension_requested_until TIMESTAMP`;

    await sql`CREATE TABLE IF NOT EXISTS job_extension_requests (
        id TEXT PRIMARY KEY,
        corporate_client_id TEXT NOT NULL REFERENCES corporate_clients(id) ON DELETE CASCADE,
        batch_id TEXT REFERENCES job_batches(id) ON DELETE SET NULL,
        job_id TEXT NOT NULL REFERENCES job_tickets(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        requested_until TIMESTAMP NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        requested_by TEXT,
        response_note TEXT,
        responded_by TEXT,
        responded_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP
    )`;

    await sql`CREATE INDEX IF NOT EXISTS idx_job_extension_requests_client ON job_extension_requests (corporate_client_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_job_extension_requests_batch ON job_extension_requests (batch_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_job_extension_requests_job ON job_extension_requests (job_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_job_extension_requests_status ON job_extension_requests (status)`;

    await sql`CREATE TABLE IF NOT EXISTS corporate_password_reset_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        corporate_client_id TEXT NOT NULL REFERENCES corporate_clients(id) ON DELETE CASCADE,
        code_hash TEXT,
        status TEXT NOT NULL DEFAULT 'requested',
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        requested_ip TEXT,
        issued_by_admin_id TEXT,
        expires_at TIMESTAMP,
        used_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP
    )`;

    await sql`CREATE INDEX IF NOT EXISTS idx_corporate_password_reset_user ON corporate_password_reset_requests (user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_corporate_password_reset_client ON corporate_password_reset_requests (corporate_client_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_corporate_password_reset_status ON corporate_password_reset_requests (status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_corporate_password_reset_expires_at ON corporate_password_reset_requests (expires_at)`;
}
