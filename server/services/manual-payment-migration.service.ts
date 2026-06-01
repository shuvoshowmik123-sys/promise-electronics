import { neon } from "@neondatabase/serverless";

export async function migrateManualPaymentTables() {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL not configured");

    const sql = neon(url);
    await sql`CREATE TABLE IF NOT EXISTS manual_payments (
        id TEXT PRIMARY KEY,
        job_ticket_id TEXT,
        service_request_id TEXT,
        due_record_id TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        method TEXT NOT NULL,
        amount REAL NOT NULL,
        sender_number TEXT,
        transaction_id TEXT,
        proof_url TEXT,
        source TEXT NOT NULL DEFAULT 'admin_manual',
        status TEXT NOT NULL DEFAULT 'pending',
        notes TEXT,
        verified_by TEXT,
        verified_at TIMESTAMP,
        rejected_by TEXT,
        rejected_at TIMESTAMP,
        rejection_reason TEXT,
        applied_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`;
    await sql`ALTER TABLE manual_payments ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'admin_manual'`;
    await sql`CREATE INDEX IF NOT EXISTS idx_manual_payments_status ON manual_payments (status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_manual_payments_source ON manual_payments (source)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_manual_payments_job_ticket ON manual_payments (job_ticket_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_manual_payments_service_request ON manual_payments (service_request_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_manual_payments_transaction ON manual_payments (transaction_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_manual_payments_created_at ON manual_payments (created_at DESC)`;
}
