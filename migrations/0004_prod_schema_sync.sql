-- Migration: Sync production-critical admin schema additions
-- Purpose: Bring partially migrated production databases forward without destructive changes.

-- Users
ALTER TABLE users ADD COLUMN IF NOT EXISTS store_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences TEXT DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS corporate_client_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_work_location_id TEXT;

CREATE INDEX IF NOT EXISTS idx_users_store_id ON users(store_id);
CREATE INDEX IF NOT EXISTS idx_users_corporate_client_id ON users(corporate_client_id);

-- Job tickets
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS assigned_technician_id TEXT;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS corporate_challan_id TEXT;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS corporate_job_number TEXT;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS corporate_client_id TEXT;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS job_type TEXT DEFAULT 'standard';
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS parent_job_id TEXT;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS charges JSONB;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS warranty_notes TEXT;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid';
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS payment_id TEXT;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS paid_amount REAL DEFAULT 0;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS remaining_amount REAL DEFAULT 0;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMP;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS invoice_printed_at TIMESTAMP;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS initial_status TEXT;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS reported_defect TEXT;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS problem_found TEXT;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS corporate_bill_id TEXT;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS invoice_printed_by TEXT;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS invoice_print_count INTEGER DEFAULT 0;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS write_off_reason TEXT;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS write_off_by TEXT;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS write_off_at TIMESTAMP;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS assisted_by_ids TEXT DEFAULT '[]';
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS assisted_by_names TEXT;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS service_lines TEXT;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS product_lines TEXT;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS warranty_days INTEGER DEFAULT 30;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS grace_period_days INTEGER DEFAULT 7;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS warranty_expiry_date TIMESTAMP;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS warranty_terms_accepted BOOLEAN DEFAULT FALSE;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS mobile_media TEXT DEFAULT '[]';
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS last_mobile_update_at TIMESTAMP;
ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS store_id TEXT;

CREATE INDEX IF NOT EXISTS idx_job_tickets_customer_phone_normalized ON job_tickets(customer_phone_normalized);
CREATE INDEX IF NOT EXISTS idx_job_tickets_corporate_challan_id ON job_tickets(corporate_challan_id);
CREATE INDEX IF NOT EXISTS idx_job_tickets_corporate_client_id ON job_tickets(corporate_client_id);
CREATE INDEX IF NOT EXISTS idx_job_tickets_payment_status ON job_tickets(payment_status);
CREATE INDEX IF NOT EXISTS idx_job_tickets_status_deadline ON job_tickets(status, deadline);
CREATE INDEX IF NOT EXISTS idx_job_tickets_status_created_at ON job_tickets(status, created_at);
CREATE INDEX IF NOT EXISTS idx_job_tickets_store_id ON job_tickets(store_id);

-- Service requests
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS tracking_status TEXT NOT NULL DEFAULT 'Request Received';
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS request_intent TEXT;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS service_mode TEXT;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'intake';
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS is_quote BOOLEAN DEFAULT FALSE;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS service_id TEXT;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS quote_status TEXT;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS quote_amount REAL;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS quote_notes TEXT;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS quoted_at TIMESTAMP;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS quote_expires_at TIMESTAMP;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS pickup_tier TEXT;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS pickup_cost REAL;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS total_amount REAL;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS scheduled_pickup_date TIMESTAMP;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS expected_pickup_date TIMESTAMP;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS expected_return_date TIMESTAMP;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS expected_ready_date TIMESTAMP;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS intake_location JSONB;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS physical_condition TEXT;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS customer_signature_url TEXT;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS proof_of_purchase TEXT;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS warranty_status TEXT;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS agreed_to_pickup BOOLEAN DEFAULT FALSE;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS pickup_agreed_at TIMESTAMP;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS admin_interacted BOOLEAN DEFAULT FALSE;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS admin_interacted_at TIMESTAMP;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS admin_interacted_by TEXT;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS store_id TEXT;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS corporate_client_id TEXT;
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS corporate_challan_id TEXT;

CREATE INDEX IF NOT EXISTS idx_service_requests_stage ON service_requests(stage);
CREATE INDEX IF NOT EXISTS idx_service_requests_admin_interacted ON service_requests(admin_interacted);
CREATE INDEX IF NOT EXISTS idx_service_requests_store_id ON service_requests(store_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_corporate_client_id ON service_requests(corporate_client_id);

-- Notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS corporate_client_id TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS context_type TEXT DEFAULT 'corporate';

CREATE INDEX IF NOT EXISTS idx_notifications_corporate_client ON notifications(corporate_client_id);
CREATE INDEX IF NOT EXISTS idx_notifications_job ON notifications(job_id);
CREATE INDEX IF NOT EXISTS idx_notifications_context_type ON notifications(context_type);
