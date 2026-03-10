/**
 * Production Database Sync Script
 * Applies all missing tables and columns from current schema to the old production database.
 * Uses IF NOT EXISTS / IF NOT EXISTS column guards for safety - will NOT drop or modify existing data.
 */
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const migrations = [
    // ==========================================
    // STEP 1: ALTER existing tables - add missing columns
    // ==========================================

    // users - missing many columns
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_normalized text`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS skills text`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS seniority_level text DEFAULT 'Junior'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS performance_score real DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS store_id text`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS corporate_client_id text`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS default_work_location_id text`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`,
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
    `CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)`,
    `CREATE INDEX IF NOT EXISTS idx_users_phone_normalized ON users(phone_normalized)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL`,

    // job_tickets - missing many columns
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS corporate_challan_id text`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS corporate_client_id text`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS job_type text DEFAULT 'standard'`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS charges jsonb`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS warranty_notes text`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid'`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS payment_id text`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS paid_amount real DEFAULT 0`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS remaining_amount real DEFAULT 0`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS paid_at timestamp`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS last_payment_at timestamp`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'pending'`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS invoice_printed_at timestamp`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS initial_status text`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS reported_defect text`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS problem_found text`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS corporate_bill_id text`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS invoice_printed_by text`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS invoice_print_count integer DEFAULT 0`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS write_off_reason text`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS write_off_by text`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS write_off_at timestamp`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS assisted_by text`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS assisted_by_ids text DEFAULT '[]'`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS assisted_by_names text`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS service_lines text`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS product_lines text`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS warranty_days integer DEFAULT 30`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS grace_period_days integer DEFAULT 7`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS warranty_expiry_date timestamp`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS mobile_media text DEFAULT '[]'`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS last_mobile_update_at timestamp`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS store_id text`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS assigned_technician_id text`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS customer_phone_normalized text`,
    `ALTER TABLE job_tickets ADD COLUMN IF NOT EXISTS sla_deadline timestamp`,
    `CREATE INDEX IF NOT EXISTS idx_job_tickets_status ON job_tickets(status)`,
    `CREATE INDEX IF NOT EXISTS idx_job_tickets_customer ON job_tickets(customer)`,
    `CREATE INDEX IF NOT EXISTS idx_job_tickets_customer_phone_normalized ON job_tickets(customer_phone_normalized)`,
    `CREATE INDEX IF NOT EXISTS idx_job_tickets_technician ON job_tickets(technician)`,
    `CREATE INDEX IF NOT EXISTS idx_job_tickets_created_at ON job_tickets(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_job_tickets_corporate_challan_id ON job_tickets(corporate_challan_id)`,
    `CREATE INDEX IF NOT EXISTS idx_job_tickets_corporate_client_id ON job_tickets(corporate_client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_job_tickets_payment_status ON job_tickets(payment_status)`,

    // inventory_items - missing columns
    `ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS show_on_android_app boolean DEFAULT true`,
    `ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS show_on_hot_deals boolean DEFAULT false`,
    `ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS hot_deal_price real`,
    `ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS is_spare_part boolean DEFAULT false`,
    `ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS is_serialized boolean DEFAULT false`,
    `ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS reorder_quantity integer`,
    `ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS preferred_supplier text`,
    `ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS store_id text`,

    // petty_cash_records - missing drawer_session_id
    `ALTER TABLE petty_cash_records ADD COLUMN IF NOT EXISTS drawer_session_id text`,

    // pos_transactions - missing drawer_session_id
    `ALTER TABLE pos_transactions ADD COLUMN IF NOT EXISTS drawer_session_id text`,

    // attendance_records - missing many GPS columns
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS work_location_id text`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_lat double precision`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_lng double precision`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_lat double precision`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_lng double precision`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_accuracy real`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_accuracy real`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_distance_meters real`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_distance_meters real`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_geofence_status text`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_geofence_status text`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_in_reason text`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS check_out_reason text`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS device_platform text`,
    `ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS device_id text`,
    `CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance_records(user_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_attendance_work_location ON attendance_records(work_location_id)`,

    // service_requests - missing columns
    `ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS intake_location jsonb`,
    `ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS physical_condition text`,
    `ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS customer_signature_url text`,
    `ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS proof_of_purchase text`,
    `ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS warranty_status text`,
    `ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS agreed_to_pickup boolean DEFAULT false`,
    `ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS pickup_agreed_at timestamp`,
    `ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS admin_interacted boolean DEFAULT false`,
    `ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS admin_interacted_at timestamp`,
    `ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS admin_interacted_by text`,
    `ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS store_id text`,
    `ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS corporate_client_id text`,
    `ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS corporate_challan_id text`,
    `CREATE INDEX IF NOT EXISTS idx_service_requests_admin_interacted ON service_requests(admin_interacted)`,
    `CREATE INDEX IF NOT EXISTS idx_service_requests_customer_id ON service_requests(customer_id)`,
    `CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests(status)`,
    `CREATE INDEX IF NOT EXISTS idx_service_requests_stage ON service_requests(stage)`,
    `CREATE INDEX IF NOT EXISTS idx_service_requests_ticket_number ON service_requests(ticket_number)`,
    `CREATE INDEX IF NOT EXISTS idx_service_requests_created_at ON service_requests(created_at)`,

    // notifications - missing columns
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS corporate_client_id text`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS job_id text`,
    `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS context_type text DEFAULT 'corporate'`,

    // pickup_schedules - missing column
    `ALTER TABLE pickup_schedules ADD COLUMN IF NOT EXISTS pickup_proof_url text`,

    // challans - add indexes
    `CREATE INDEX IF NOT EXISTS idx_challans_status ON challans(status)`,
    `CREATE INDEX IF NOT EXISTS idx_challans_type ON challans(type)`,
    `CREATE INDEX IF NOT EXISTS idx_challans_created_at ON challans(created_at)`,

    // ==========================================
    // STEP 2: Create brand new tables (in dependency order)
    // ==========================================

    // work_locations
    `CREATE TABLE IF NOT EXISTS work_locations (
    id text PRIMARY KEY,
    name text NOT NULL,
    store_id text,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    radius_meters integer NOT NULL DEFAULT 150,
    status text NOT NULL DEFAULT 'Active',
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`,
    `CREATE INDEX IF NOT EXISTS idx_work_locations_status ON work_locations(status)`,
    `CREATE INDEX IF NOT EXISTS idx_work_locations_store ON work_locations(store_id)`,

    // system_modules
    `CREATE TABLE IF NOT EXISTS system_modules (
    id text PRIMARY KEY,
    name text NOT NULL,
    description text,
    category text NOT NULL DEFAULT 'general',
    enabled_admin boolean NOT NULL DEFAULT true,
    enabled_customer boolean NOT NULL DEFAULT false,
    enabled_corporate boolean NOT NULL DEFAULT false,
    enabled_technician boolean NOT NULL DEFAULT false,
    is_core boolean NOT NULL DEFAULT false,
    display_order integer DEFAULT 0,
    icon text,
    dependencies text DEFAULT '[]',
    portal_scope text DEFAULT 'admin',
    offline_capability text DEFAULT 'locked',
    toggled_by text,
    toggled_at timestamp DEFAULT now(),
    created_at timestamp NOT NULL DEFAULT now()
  )`,

    // purchase_orders
    `CREATE TABLE IF NOT EXISTS purchase_orders (
    id text PRIMARY KEY,
    supplier_name text NOT NULL,
    status text NOT NULL DEFAULT 'Draft',
    total_amount real NOT NULL DEFAULT 0,
    expected_delivery_date timestamp,
    notes text,
    store_id text,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`,

    // purchase_order_items
    `CREATE TABLE IF NOT EXISTS purchase_order_items (
    id text PRIMARY KEY,
    purchase_order_id text NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    inventory_item_id text NOT NULL,
    quantity integer NOT NULL DEFAULT 1,
    unit_price real NOT NULL DEFAULT 0
  )`,

    // inventory_serials
    `CREATE TABLE IF NOT EXISTS inventory_serials (
    id text PRIMARY KEY,
    inventory_item_id text NOT NULL REFERENCES inventory_items(id),
    serial_number text NOT NULL,
    status text NOT NULL DEFAULT 'In Stock',
    job_ticket_id text,
    received_at timestamp NOT NULL DEFAULT now(),
    consumed_at timestamp,
    notes text,
    store_id text
  )`,

    // wastage_logs
    `CREATE TABLE IF NOT EXISTS wastage_logs (
    id text PRIMARY KEY,
    inventory_item_id text NOT NULL,
    serial_id text,
    quantity integer NOT NULL DEFAULT 1,
    reason text NOT NULL,
    job_ticket_id text,
    financial_loss real,
    reported_by text NOT NULL,
    notes text,
    created_at timestamp NOT NULL DEFAULT now(),
    store_id text
  )`,
    `CREATE INDEX IF NOT EXISTS idx_wastage_logs_created_at ON wastage_logs(created_at)`,

    // local_purchases
    `CREATE TABLE IF NOT EXISTS local_purchases (
    id text PRIMARY KEY,
    job_ticket_id text NOT NULL,
    part_name text NOT NULL,
    supplier_name text,
    cost_price real NOT NULL,
    selling_price real NOT NULL,
    quantity integer NOT NULL DEFAULT 1,
    receipt_image_url text,
    purchased_by text NOT NULL,
    status text NOT NULL DEFAULT 'Consumed',
    created_at timestamp NOT NULL DEFAULT now(),
    store_id text
  )`,

    // approval_requests
    `CREATE TABLE IF NOT EXISTS approval_requests (
    id text PRIMARY KEY,
    type text NOT NULL,
    requested_by text NOT NULL,
    requested_by_name text,
    job_id text,
    job_number text,
    old_value text,
    new_value text,
    status text NOT NULL DEFAULT 'pending',
    reviewed_by text,
    reviewed_at timestamp,
    rejection_reason text,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
    `CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status)`,
    `CREATE INDEX IF NOT EXISTS idx_approval_requests_type ON approval_requests(type)`,

    // drawer_sessions
    `CREATE TABLE IF NOT EXISTS drawer_sessions (
    id text PRIMARY KEY,
    opened_by text NOT NULL,
    opened_by_name text NOT NULL,
    opened_at timestamp NOT NULL DEFAULT now(),
    starting_float real NOT NULL,
    expected_cash real,
    declared_cash real,
    discrepancy real,
    status text NOT NULL DEFAULT 'open',
    closed_by text,
    closed_by_name text,
    closed_at timestamp,
    notes text,
    store_id text
  )`,

    // corporate_clients
    `CREATE TABLE IF NOT EXISTS corporate_clients (
    id text PRIMARY KEY,
    company_name text NOT NULL,
    short_code text NOT NULL UNIQUE,
    pricing_type text DEFAULT 'standard',
    custom_pricing jsonb,
    discount_percentage real DEFAULT 0,
    billing_cycle text DEFAULT 'monthly',
    payment_terms integer DEFAULT 30,
    default_sla_hours integer DEFAULT 48,
    outstanding_balance real DEFAULT 0,
    parent_client_id text,
    branch_name text,
    contact_person text,
    contact_phone text,
    address text,
    phone text,
    portal_username text UNIQUE,
    portal_password_hash text,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp
  )`,

    // trusted_corporate_devices
    `CREATE TABLE IF NOT EXISTS trusted_corporate_devices (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    user_agent text,
    created_at timestamp NOT NULL DEFAULT now(),
    last_used_at timestamp NOT NULL DEFAULT now(),
    trusted_until timestamp NOT NULL,
    revoked_at timestamp,
    revoked_reason text
  )`,
    `CREATE INDEX IF NOT EXISTS idx_trusted_devices_token_hash ON trusted_corporate_devices(token_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_valid ON trusted_corporate_devices(user_id, revoked_at, trusted_until)`,

    // corporate_challans
    `CREATE TABLE IF NOT EXISTS corporate_challans (
    id text PRIMARY KEY,
    challan_number text UNIQUE,
    type text NOT NULL,
    corporate_client_id text REFERENCES corporate_clients(id),
    items jsonb,
    total_items integer NOT NULL,
    received_date timestamp,
    returned_date timestamp,
    receiver_name text,
    receiver_phone text,
    receiver_signature text,
    status text NOT NULL DEFAULT 'received',
    notes text,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
    `CREATE INDEX IF NOT EXISTS idx_corporate_challans_client_id ON corporate_challans(corporate_client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_corporate_challans_type ON corporate_challans(type)`,
    `CREATE INDEX IF NOT EXISTS idx_corporate_challans_status ON corporate_challans(status)`,

    // corporate_bills
    `CREATE TABLE IF NOT EXISTS corporate_bills (
    id text PRIMARY KEY,
    bill_number text UNIQUE,
    corporate_client_id text REFERENCES corporate_clients(id),
    billing_period_start timestamp,
    billing_period_end timestamp,
    line_items jsonb,
    subtotal real NOT NULL,
    discount real DEFAULT 0,
    vat_amount real DEFAULT 0,
    grand_total real NOT NULL,
    payment_status text DEFAULT 'unpaid',
    paid_amount real DEFAULT 0,
    due_date timestamp,
    paid_date timestamp,
    due_record_id text,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
    `CREATE INDEX IF NOT EXISTS idx_corporate_bills_client_id ON corporate_bills(corporate_client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_corporate_bills_payment_status ON corporate_bills(payment_status)`,

    // corporate_portal_urgencies
    `CREATE TABLE IF NOT EXISTS corporate_portal_urgencies (
    id text PRIMARY KEY,
    corp_client_id text NOT NULL,
    job_id text REFERENCES job_tickets(id),
    reason text NOT NULL,
    urgency_level text NOT NULL,
    status text DEFAULT 'pending',
    requested_by text,
    created_at timestamp DEFAULT now()
  )`,

    // fraud_alerts
    `CREATE TABLE IF NOT EXISTS fraud_alerts (
    id text PRIMARY KEY,
    alert_type text NOT NULL,
    severity text NOT NULL,
    entity_type text,
    entity_id text,
    description text,
    rule_triggered text,
    status text NOT NULL DEFAULT 'open',
    metadata jsonb,
    created_at timestamp NOT NULL DEFAULT now(),
    resolved_at timestamp,
    resolved_by text
  )`,

    // ai_insights
    `CREATE TABLE IF NOT EXISTS ai_insights (
    id serial PRIMARY KEY,
    type text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    actionable_step text,
    category text,
    severity text,
    is_read boolean DEFAULT false,
    created_at timestamp NOT NULL DEFAULT now()
  )`,

    // diagnosis_training_data
    `CREATE TABLE IF NOT EXISTS diagnosis_training_data (
    id serial PRIMARY KEY,
    job_id text REFERENCES job_tickets(id),
    customer_chat_summary text,
    ai_prediction text,
    actual_issue text,
    was_accurate boolean,
    feedback_notes text,
    created_at timestamp NOT NULL DEFAULT now()
  )`,

    // ai_debug_suggestions
    `CREATE TABLE IF NOT EXISTS ai_debug_suggestions (
    id serial PRIMARY KEY,
    error text NOT NULL,
    stack_trace text,
    suggestion text,
    status text DEFAULT 'NEEDS_REVIEW',
    created_at timestamp NOT NULL DEFAULT now()
  )`,

    // ai_query_log
    `CREATE TABLE IF NOT EXISTS ai_query_log (
    id serial PRIMARY KEY,
    user_id text REFERENCES users(id),
    query_type text,
    was_successful boolean DEFAULT true,
    created_at timestamp NOT NULL DEFAULT now()
  )`,

    // audit_logs
    `CREATE TABLE IF NOT EXISTS audit_logs (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id text NOT NULL,
    details text,
    metadata jsonb,
    changes jsonb,
    severity text DEFAULT 'info',
    store_id text,
    created_at timestamp NOT NULL DEFAULT now()
  )`,

    // rollback_requests
    `CREATE TABLE IF NOT EXISTS rollback_requests (
    id serial PRIMARY KEY,
    job_ticket_id text REFERENCES job_tickets(id),
    requested_by text NOT NULL,
    reason text NOT NULL,
    target_status text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    resolved_by text,
    store_id text,
    created_at timestamp NOT NULL DEFAULT now()
  )`,

    // otp_codes
    `CREATE TABLE IF NOT EXISTS otp_codes (
    id text PRIMARY KEY,
    phone text NOT NULL,
    code_hash text NOT NULL,
    purpose text NOT NULL DEFAULT 'request_verification',
    attempts integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 3,
    expires_at timestamp NOT NULL,
    verified_at timestamp,
    ip_address text,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
    `CREATE INDEX IF NOT EXISTS idx_otp_codes_phone ON otp_codes(phone)`,
    `CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at ON otp_codes(expires_at)`,

    // fraud_blocklist
    `CREATE TABLE IF NOT EXISTS fraud_blocklist (
    id text PRIMARY KEY,
    type text NOT NULL,
    value text NOT NULL,
    reason text,
    blocked_by text,
    blocked_at timestamp NOT NULL DEFAULT now(),
    expires_at timestamp
  )`,
    `CREATE INDEX IF NOT EXISTS idx_fraud_blocklist_type_value ON fraud_blocklist(type, value)`,

    // warranty_claims
    `CREATE TABLE IF NOT EXISTS warranty_claims (
    id text PRIMARY KEY,
    original_job_id text NOT NULL,
    new_job_id text,
    customer text NOT NULL,
    customer_phone text,
    device text,
    claim_type text NOT NULL,
    claim_reason text NOT NULL,
    warranty_valid boolean NOT NULL,
    warranty_expiry_date timestamp,
    claimed_by text NOT NULL,
    claimed_by_name text NOT NULL,
    claimed_by_role text NOT NULL,
    claimed_at timestamp NOT NULL DEFAULT now(),
    approved_by text,
    approved_by_name text,
    approved_by_role text,
    approved_at timestamp,
    status text NOT NULL DEFAULT 'pending',
    rejection_reason text,
    notes text,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp
  )`,
    `CREATE INDEX IF NOT EXISTS idx_warranty_claims_original_job ON warranty_claims(original_job_id)`,
    `CREATE INDEX IF NOT EXISTS idx_warranty_claims_status ON warranty_claims(status)`,
    `CREATE INDEX IF NOT EXISTS idx_warranty_claims_phone ON warranty_claims(customer_phone)`,

    // refunds
    `CREATE TABLE IF NOT EXISTS refunds (
    id text PRIMARY KEY,
    type text NOT NULL,
    reference_id text NOT NULL,
    reference_invoice text,
    customer text NOT NULL,
    customer_phone text,
    original_amount real NOT NULL,
    refund_amount real NOT NULL,
    refund_method text,
    reason text NOT NULL,
    requested_by text NOT NULL,
    requested_by_name text NOT NULL,
    requested_by_role text NOT NULL,
    requested_at timestamp NOT NULL DEFAULT now(),
    approved_by text,
    approved_by_name text,
    approved_by_role text,
    approved_at timestamp,
    processed_by text,
    processed_by_name text,
    processed_by_role text,
    processed_at timestamp,
    status text NOT NULL DEFAULT 'pending',
    rejection_reason text,
    cancellation_reason text,
    notes text,
    petty_cash_record_id text,
    fraud_alert_id text,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
    `CREATE INDEX IF NOT EXISTS idx_refunds_reference ON refunds(reference_id)`,
    `CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status)`,
    `CREATE INDEX IF NOT EXISTS idx_refunds_phone ON refunds(customer_phone)`,
    `CREATE INDEX IF NOT EXISTS idx_refunds_created_at ON refunds(created_at)`,

    // corporate_message_threads
    `CREATE TABLE IF NOT EXISTS corporate_message_threads (
    id text PRIMARY KEY,
    corporate_client_id text NOT NULL REFERENCES corporate_clients(id),
    subject text NOT NULL,
    status text NOT NULL DEFAULT 'open',
    last_message_at timestamp NOT NULL DEFAULT now(),
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp
  )`,
    `CREATE INDEX IF NOT EXISTS idx_corporate_threads_client ON corporate_message_threads(corporate_client_id)`,
    `CREATE INDEX IF NOT EXISTS idx_corporate_threads_status ON corporate_message_threads(status)`,

    // corporate_messages
    `CREATE TABLE IF NOT EXISTS corporate_messages (
    id text PRIMARY KEY,
    thread_id text NOT NULL REFERENCES corporate_message_threads(id),
    sender_id text NOT NULL,
    sender_type text NOT NULL,
    message_type text NOT NULL DEFAULT 'text',
    content text,
    attachments jsonb,
    is_read boolean DEFAULT false,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
    `CREATE INDEX IF NOT EXISTS idx_corporate_messages_thread ON corporate_messages(thread_id)`,
    `CREATE INDEX IF NOT EXISTS idx_corporate_messages_read ON corporate_messages(is_read)`,
    `CREATE INDEX IF NOT EXISTS idx_corporate_messages_created ON corporate_messages(created_at)`,

    // backup_metadata
    `CREATE TABLE IF NOT EXISTS backup_metadata (
    id text PRIMARY KEY,
    file_name text NOT NULL,
    file_size integer NOT NULL,
    google_drive_file_id text NOT NULL,
    backup_type text NOT NULL,
    schedule_id text,
    description text,
    encryption_version text NOT NULL,
    salt text NOT NULL,
    iv text NOT NULL,
    auth_tag text NOT NULL,
    iterations integer NOT NULL,
    total_records integer NOT NULL,
    tables_included jsonb NOT NULL,
    checksum text NOT NULL,
    system_version text NOT NULL,
    database_version text NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    created_by text NOT NULL,
    expires_at timestamp,
    status text NOT NULL DEFAULT 'active',
    verified boolean DEFAULT false,
    last_verified_at timestamp
  )`,

    // backup_schedules
    `CREATE TABLE IF NOT EXISTS backup_schedules (
    id text PRIMARY KEY,
    name text NOT NULL,
    type text NOT NULL,
    cron_expression text NOT NULL,
    enabled boolean NOT NULL DEFAULT true,
    retention_days integer NOT NULL,
    notify_on_success boolean DEFAULT true,
    notify_on_failure boolean DEFAULT true,
    last_run timestamp,
    next_run timestamp,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`,

    // backup_audit_logs
    `CREATE TABLE IF NOT EXISTS backup_audit_logs (
    id text PRIMARY KEY,
    timestamp timestamp NOT NULL DEFAULT now(),
    user_id text NOT NULL,
    user_name text NOT NULL,
    action text NOT NULL,
    backup_id text,
    backup_name text,
    ip_address text,
    user_agent text,
    success boolean NOT NULL,
    error_message text,
    metadata jsonb
  )`,

    // HR & Payroll Tables
    // staff_salary_config
    `CREATE TABLE IF NOT EXISTS staff_salary_config (
    id text PRIMARY KEY,
    user_id text NOT NULL UNIQUE,
    basic_salary real NOT NULL,
    house_rent_allowance real,
    medical_allowance real,
    conveyance_allowance real,
    other_allowances real DEFAULT 0,
    income_tax_percent real DEFAULT 0,
    casual_leave_balance integer DEFAULT 10,
    sick_leave_balance integer DEFAULT 14,
    earned_leave_balance real DEFAULT 0,
    last_increment_date timestamp,
    increment_blocked_reason text,
    effective_from timestamp NOT NULL DEFAULT now(),
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp
  )`,
    `CREATE INDEX IF NOT EXISTS idx_salary_config_user ON staff_salary_config(user_id)`,

    // leave_applications
    `CREATE TABLE IF NOT EXISTS leave_applications (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    user_name text NOT NULL,
    user_role text NOT NULL,
    leave_type text NOT NULL,
    start_date text NOT NULL,
    end_date text NOT NULL,
    total_days integer NOT NULL,
    reason text NOT NULL,
    medical_certificate_url text,
    status text NOT NULL DEFAULT 'pending',
    reviewed_by text,
    reviewed_at timestamp,
    rejection_reason text,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
    `CREATE INDEX IF NOT EXISTS idx_leave_app_user ON leave_applications(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_leave_app_status ON leave_applications(status)`,
    `CREATE INDEX IF NOT EXISTS idx_leave_app_dates ON leave_applications(start_date, end_date)`,

    // payroll_records
    `CREATE TABLE IF NOT EXISTS payroll_records (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    user_name text NOT NULL,
    month text NOT NULL,
    assignment_id text,
    run_type text NOT NULL DEFAULT 'regular',
    calc_snapshot_json text,
    calc_hash text,
    is_locked boolean NOT NULL DEFAULT false,
    user_role text,
    total_working_days integer NOT NULL,
    days_present integer NOT NULL,
    days_absent integer NOT NULL,
    days_late integer NOT NULL,
    consecutive_late_penalties integer DEFAULT 0,
    approved_leaves integer NOT NULL,
    unapproved_absences integer NOT NULL,
    total_overtime_hours real DEFAULT 0,
    basic_salary real NOT NULL,
    house_rent_allowance real NOT NULL,
    medical_allowance real NOT NULL,
    conveyance_allowance real NOT NULL,
    other_allowances real DEFAULT 0,
    overtime_pay real DEFAULT 0,
    gross_salary real NOT NULL,
    absent_deduction real NOT NULL,
    late_deduction real DEFAULT 0,
    income_tax real DEFAULT 0,
    other_deductions real DEFAULT 0,
    deduction_approved boolean DEFAULT false,
    deduction_approved_by text,
    deduction_approved_at timestamp,
    total_deductions real NOT NULL,
    net_salary real NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    generated_by text,
    cleared_by text,
    paid_at timestamp,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
    `CREATE INDEX IF NOT EXISTS idx_payroll_user_month ON payroll_records(user_id, month)`,
    `CREATE INDEX IF NOT EXISTS idx_payroll_status ON payroll_records(status)`,
    `CREATE INDEX IF NOT EXISTS idx_payroll_month ON payroll_records(month)`,

    // bonus_records
    `CREATE TABLE IF NOT EXISTS bonus_records (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    user_name text NOT NULL,
    bonus_type text NOT NULL,
    year integer NOT NULL,
    full_bonus_amount real NOT NULL,
    unapproved_absences integer NOT NULL,
    deduction_percent real NOT NULL,
    deduction_amount real NOT NULL,
    final_bonus_amount real NOT NULL,
    status text NOT NULL DEFAULT 'calculated',
    approved_by text,
    paid_at timestamp,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
    `CREATE INDEX IF NOT EXISTS idx_bonus_user_year ON bonus_records(user_id, year)`,
    `CREATE INDEX IF NOT EXISTS idx_bonus_type ON bonus_records(bonus_type)`,

    // holiday_calendar
    `CREATE TABLE IF NOT EXISTS holiday_calendar (
    id text PRIMARY KEY,
    year integer NOT NULL,
    date text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    dismissed_reason text,
    forced_reason text,
    modified_by text,
    modified_at timestamp,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
    `CREATE INDEX IF NOT EXISTS idx_holiday_year_date ON holiday_calendar(year, date)`,
    `CREATE INDEX IF NOT EXISTS idx_holiday_year ON holiday_calendar(year)`,
    `CREATE INDEX IF NOT EXISTS idx_holiday_status ON holiday_calendar(status)`,

    // employment_profiles
    `CREATE TABLE IF NOT EXISTS employment_profiles (
    id text PRIMARY KEY,
    user_id text NOT NULL UNIQUE,
    employee_code text UNIQUE,
    employment_type text NOT NULL DEFAULT 'full_time',
    payroll_eligible boolean NOT NULL DEFAULT true,
    employment_status text NOT NULL DEFAULT 'active',
    join_date date,
    notice_period_days integer DEFAULT 30,
    resignation_date date,
    last_working_date date,
    separation_reason text,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp
  )`,
    `CREATE INDEX IF NOT EXISTS idx_emp_profile_user ON employment_profiles(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_emp_profile_status ON employment_profiles(employment_status)`,

    // salary_components
    `CREATE TABLE IF NOT EXISTS salary_components (
    id text PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    component_type text NOT NULL DEFAULT 'earning',
    calc_mode text NOT NULL DEFAULT 'fixed',
    default_percent real,
    is_proratable boolean NOT NULL DEFAULT true,
    is_taxable boolean NOT NULL DEFAULT true,
    applies_to text NOT NULL DEFAULT 'both',
    display_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp NOT NULL DEFAULT now()
  )`,

    // salary_structures
    `CREATE TABLE IF NOT EXISTS salary_structures (
    id text PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp
  )`,

    // salary_structure_lines
    `CREATE TABLE IF NOT EXISTS salary_structure_lines (
    id text PRIMARY KEY,
    structure_id text NOT NULL,
    component_id text NOT NULL,
    sequence integer NOT NULL DEFAULT 0,
    is_mandatory boolean NOT NULL DEFAULT true,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
    `CREATE INDEX IF NOT EXISTS idx_struct_lines_structure ON salary_structure_lines(structure_id)`,

    // employee_salary_assignments
    `CREATE TABLE IF NOT EXISTS employee_salary_assignments (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    employment_profile_id text NOT NULL,
    structure_id text NOT NULL,
    base_amount real NOT NULL,
    hra_amount real,
    medical_amount real,
    conveyance_amount real,
    other_amount real DEFAULT 0,
    income_tax_percent real DEFAULT 0,
    currency text NOT NULL DEFAULT 'BDT',
    effective_from date NOT NULL,
    effective_to date,
    change_reason text NOT NULL DEFAULT 'new_hire',
    approved_by text,
    approved_at timestamp,
    created_by text,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
    `CREATE INDEX IF NOT EXISTS idx_assign_user ON employee_salary_assignments(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_assign_effective ON employee_salary_assignments(user_id, effective_from, effective_to)`,

    // increment_suggestions
    `CREATE TABLE IF NOT EXISTS increment_suggestions (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    current_assignment_id text NOT NULL,
    current_base_amount real NOT NULL,
    suggested_base_amount real NOT NULL,
    suggested_increase_percent real NOT NULL,
    suggestion_reason text NOT NULL,
    reasoning_json text,
    status text NOT NULL DEFAULT 'pending',
    admin_decision_amount real,
    admin_notes text,
    decided_by text,
    decided_at timestamp,
    effective_from date,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
    `CREATE INDEX IF NOT EXISTS idx_incr_sugg_user ON increment_suggestions(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_incr_sugg_status ON increment_suggestions(status)`,

    // deduction_proposals
    `CREATE TABLE IF NOT EXISTS deduction_proposals (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    payroll_record_id text,
    month text NOT NULL,
    proposal_type text NOT NULL,
    description text NOT NULL,
    calculated_amount real NOT NULL,
    supporting_data_json text,
    status text NOT NULL DEFAULT 'pending',
    approved_amount real,
    admin_notes text,
    decided_by text,
    decided_at timestamp,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
    `CREATE INDEX IF NOT EXISTS idx_deduct_prop_user ON deduction_proposals(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_deduct_prop_month ON deduction_proposals(month)`,
    `CREATE INDEX IF NOT EXISTS idx_deduct_prop_status ON deduction_proposals(status)`,

    // offboarding_cases
    `CREATE TABLE IF NOT EXISTS offboarding_cases (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    employment_profile_id text NOT NULL,
    offboarding_type text NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    notice_served_days integer DEFAULT 0,
    last_working_date date,
    settlement_due_date date,
    approved_by text,
    approved_at timestamp,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp
  )`,
    `CREATE INDEX IF NOT EXISTS idx_offboard_user ON offboarding_cases(user_id)`,

    // final_settlement_records
    `CREATE TABLE IF NOT EXISTS final_settlement_records (
    id text PRIMARY KEY,
    offboarding_case_id text NOT NULL,
    user_id text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    gross_total real NOT NULL,
    deduction_total real NOT NULL,
    net_total real NOT NULL,
    component_breakdown_json text,
    status text NOT NULL DEFAULT 'draft',
    approved_by text,
    approved_at timestamp,
    paid_at timestamp,
    created_at timestamp NOT NULL DEFAULT now()
  )`,
    `CREATE INDEX IF NOT EXISTS idx_settlement_case ON final_settlement_records(offboarding_case_id)`,

    // quotations
    `CREATE TABLE IF NOT EXISTS quotations (
    id text PRIMARY KEY,
    quotation_number text UNIQUE NOT NULL,
    customer_id text REFERENCES users(id),
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    customer_email text,
    customer_address text,
    status text NOT NULL DEFAULT 'Draft',
    subtotal real NOT NULL DEFAULT 0,
    discount real NOT NULL DEFAULT 0,
    tax_rate real NOT NULL DEFAULT 0,
    tax real NOT NULL DEFAULT 0,
    total real NOT NULL DEFAULT 0,
    notes text,
    valid_until timestamp,
    created_by text NOT NULL,
    created_by_name text NOT NULL,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  )`,
    `CREATE INDEX IF NOT EXISTS idx_quotations_customer_id ON quotations(customer_id)`,
    `CREATE INDEX IF NOT EXISTS idx_quotations_number ON quotations(quotation_number)`,
    `CREATE INDEX IF NOT EXISTS idx_quotations_created_at ON quotations(created_at)`,

    // quotation_items
    `CREATE TABLE IF NOT EXISTS quotation_items (
    id text PRIMARY KEY,
    quotation_id text NOT NULL REFERENCES quotations(id),
    description text NOT NULL,
    quantity integer NOT NULL DEFAULT 1,
    unit_price real NOT NULL DEFAULT 0,
    total real NOT NULL DEFAULT 0,
    sort_order integer NOT NULL DEFAULT 0
  )`,

    // ==========================================
    // STEP 3: FK references on existing tables (now that dependents exist)
    // ==========================================

    // Update FK on petty_cash_records.drawer_session_id -- add FK constraint
    `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_petty_cash_drawer_session'
      AND table_name = 'petty_cash_records'
    ) THEN
      ALTER TABLE petty_cash_records
        ADD CONSTRAINT fk_petty_cash_drawer_session
        FOREIGN KEY (drawer_session_id) REFERENCES drawer_sessions(id);
    END IF;
  END $$`,

    `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_pos_txn_drawer_session'
      AND table_name = 'pos_transactions'
    ) THEN
      ALTER TABLE pos_transactions
        ADD CONSTRAINT fk_pos_txn_drawer_session
        FOREIGN KEY (drawer_session_id) REFERENCES drawer_sessions(id);
    END IF;
  END $$`,

];

async function runMigrations() {
    const client = await pool.connect();
    console.log('✅ Connected to production database');
    console.log(`🚀 Running ${migrations.length} migration steps...\n`);

    let succeeded = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < migrations.length; i++) {
        const sql = migrations[i].trim();
        const shortSql = sql.substring(0, 80).replace(/\n/g, ' ');
        try {
            await client.query(sql);
            console.log(`  ✓ [${i + 1}/${migrations.length}] ${shortSql}...`);
            succeeded++;
        } catch (err) {
            if (err.message.includes('already exists')) {
                console.log(`  ⚠ [${i + 1}/${migrations.length}] (already exists, skipping) ${shortSql}...`);
                succeeded++;
            } else {
                console.error(`  ✗ [${i + 1}/${migrations.length}] FAILED: ${err.message}`);
                console.error(`    SQL: ${sql.substring(0, 200)}`);
                errors.push({ step: i + 1, error: err.message, sql: shortSql });
                failed++;
            }
        }
    }

    client.release();
    await pool.end();

    console.log(`\n${'='.repeat(60)}`);
    console.log(`MIGRATION COMPLETE:`);
    console.log(`  ✅ Succeeded: ${succeeded}`);
    console.log(`  ❌ Failed: ${failed}`);

    if (errors.length > 0) {
        console.log('\nFAILED STEPS:');
        errors.forEach(e => console.log(`  Step ${e.step}: ${e.error}\n    SQL: ${e.sql}`));
    } else {
        console.log('\n🎉 All migrations applied successfully!');
    }
}

runMigrations().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
