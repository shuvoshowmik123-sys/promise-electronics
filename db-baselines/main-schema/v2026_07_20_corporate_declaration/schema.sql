--
-- PostgreSQL database dump
--


-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA drizzle;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: -
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: -
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: -
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: ai_debug_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_debug_suggestions (
    id integer NOT NULL,
    error text NOT NULL,
    stack_trace text,
    suggestion text,
    status text DEFAULT 'NEEDS_REVIEW'::text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_debug_suggestions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_debug_suggestions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_debug_suggestions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_debug_suggestions_id_seq OWNED BY public.ai_debug_suggestions.id;


--
-- Name: ai_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_insights (
    id integer NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    actionable_step text,
    category text,
    severity text,
    is_read boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_insights_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_insights_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_insights_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_insights_id_seq OWNED BY public.ai_insights.id;


--
-- Name: ai_query_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_query_log (
    id integer NOT NULL,
    user_id text,
    query_type text,
    was_successful boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_query_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ai_query_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_query_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ai_query_log_id_seq OWNED BY public.ai_query_log.id;


--
-- Name: approval_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_requests (
    id text NOT NULL,
    type text NOT NULL,
    requested_by text NOT NULL,
    requested_by_name text,
    job_id text,
    job_number text,
    old_value text,
    new_value text,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by text,
    reviewed_at timestamp without time zone,
    rejection_reason text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: attendance_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_records (
    id text NOT NULL,
    user_id text NOT NULL,
    user_name text NOT NULL,
    user_role text NOT NULL,
    check_in_time timestamp without time zone DEFAULT now() NOT NULL,
    check_out_time timestamp without time zone,
    date text NOT NULL,
    notes text,
    check_in_reference_lat double precision,
    check_in_reference_lng double precision,
    check_in_reference_radius_meters real,
    check_out_reference_lat double precision,
    check_out_reference_lng double precision,
    check_out_reference_radius_meters real
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id text NOT NULL,
    user_id text NOT NULL,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id text NOT NULL,
    details text,
    metadata jsonb,
    changes jsonb,
    severity text DEFAULT 'info'::text,
    store_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: backup_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_audit_logs (
    id text NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
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
);


--
-- Name: backup_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_metadata (
    id text NOT NULL,
    file_name text NOT NULL,
    file_size integer NOT NULL,
    google_drive_file_id text,
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
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by text NOT NULL,
    expires_at timestamp without time zone,
    status text DEFAULT 'active'::text NOT NULL,
    verified boolean DEFAULT false,
    last_verified_at timestamp without time zone,
    storage_provider text DEFAULT 'google_drive'::text NOT NULL,
    storage_object_key text
);


--
-- Name: backup_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backup_schedules (
    id text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    cron_expression text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    retention_days integer NOT NULL,
    notify_on_success boolean DEFAULT true,
    notify_on_failure boolean DEFAULT true,
    last_run timestamp without time zone,
    next_run timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: bonus_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bonus_records (
    id text NOT NULL,
    user_id text NOT NULL,
    user_name text NOT NULL,
    bonus_type text NOT NULL,
    year integer NOT NULL,
    full_bonus_amount real NOT NULL,
    unapproved_absences integer NOT NULL,
    deduction_percent real NOT NULL,
    deduction_amount real NOT NULL,
    final_bonus_amount real NOT NULL,
    status text DEFAULT 'calculated'::text NOT NULL,
    approved_by text,
    paid_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: challans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.challans (
    id text NOT NULL,
    receiver text NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    items integer DEFAULT 1 NOT NULL,
    line_items text,
    receiver_address text,
    receiver_phone text,
    vehicle_no text,
    driver_name text,
    driver_phone text,
    gate_pass_no text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    delivered_at timestamp without time zone,
    notes text,
    created_by_user_id text,
    assigned_driver_id text
);


--
-- Name: corporate_bills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.corporate_bills (
    id text NOT NULL,
    bill_number text,
    corporate_client_id text,
    billing_period_start timestamp without time zone,
    billing_period_end timestamp without time zone,
    line_items jsonb,
    subtotal real NOT NULL,
    discount real DEFAULT 0,
    vat_amount real DEFAULT 0,
    grand_total real NOT NULL,
    payment_status text DEFAULT 'unpaid'::text,
    paid_amount real DEFAULT 0,
    due_date timestamp without time zone,
    paid_date timestamp without time zone,
    due_record_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: corporate_challans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.corporate_challans (
    id text NOT NULL,
    challan_number text,
    type text NOT NULL,
    corporate_client_id text,
    items jsonb,
    total_items integer NOT NULL,
    received_date timestamp without time zone,
    returned_date timestamp without time zone,
    receiver_name text,
    receiver_phone text,
    receiver_signature text,
    status text DEFAULT 'received'::text NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: corporate_clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.corporate_clients (
    id text NOT NULL,
    company_name text NOT NULL,
    short_code text NOT NULL,
    pricing_type text DEFAULT 'standard'::text,
    custom_pricing jsonb,
    discount_percentage real DEFAULT 0,
    billing_cycle text DEFAULT 'monthly'::text,
    payment_terms integer DEFAULT 30,
    default_sla_hours integer DEFAULT 48,
    outstanding_balance real DEFAULT 0,
    parent_client_id text,
    branch_name text,
    contact_person text,
    contact_phone text,
    address text,
    phone text,
    portal_username text,
    portal_password_hash text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone,
    client_type text DEFAULT 'corporate'::text NOT NULL,
    rule_profile jsonb DEFAULT '{}'::jsonb,
    default_batch_clearance_days integer DEFAULT 7 NOT NULL,
    service_warranty_enabled boolean DEFAULT true NOT NULL,
    default_service_warranty_days integer DEFAULT 30 NOT NULL,
    client_class text DEFAULT 'b2b_normal'::text NOT NULL
);


--
-- Name: corporate_message_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.corporate_message_threads (
    id text NOT NULL,
    corporate_client_id text NOT NULL,
    subject text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    last_message_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone
);


--
-- Name: corporate_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.corporate_messages (
    id text NOT NULL,
    thread_id text NOT NULL,
    sender_id text NOT NULL,
    sender_type text NOT NULL,
    message_type text DEFAULT 'text'::text NOT NULL,
    content text,
    attachments jsonb,
    is_read boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: corporate_password_reset_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.corporate_password_reset_requests (
    id text NOT NULL,
    user_id text NOT NULL,
    corporate_client_id text NOT NULL,
    code_hash text,
    status text DEFAULT 'requested'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    requested_ip text,
    issued_by_admin_id text,
    expires_at timestamp without time zone,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone
);


--
-- Name: corporate_portal_urgencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.corporate_portal_urgencies (
    id text NOT NULL,
    corp_client_id text NOT NULL,
    job_id text,
    reason text NOT NULL,
    urgency_level text NOT NULL,
    status text DEFAULT 'pending'::text,
    requested_by text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: corporate_setup_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.corporate_setup_tokens (
    id text NOT NULL,
    user_id text NOT NULL,
    type text DEFAULT 'setup'::text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: customer_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_addresses (
    id text NOT NULL,
    customer_id text NOT NULL,
    label text NOT NULL,
    address text NOT NULL,
    is_default boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: customer_repair_journey_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_repair_journey_events (
    id text NOT NULL,
    journey_id text NOT NULL,
    event_type text NOT NULL,
    title text NOT NULL,
    message text,
    actor_type text DEFAULT 'system'::text NOT NULL,
    actor_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    is_customer_visible boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: customer_repair_journeys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_repair_journeys (
    id text NOT NULL,
    customer_id text,
    service_request_id text,
    quote_request_id text,
    job_ticket_id text,
    current_stage text DEFAULT 'draft'::text NOT NULL,
    current_status text DEFAULT 'active'::text NOT NULL,
    customer_friendly_status text DEFAULT 'We received your request. Our team will review it soon.'::text NOT NULL,
    next_action text,
    next_action_label text,
    next_update_eta timestamp without time zone,
    service_mode text DEFAULT 'quote_only'::text NOT NULL,
    pickup_required boolean DEFAULT false NOT NULL,
    dropoff_required boolean DEFAULT false NOT NULL,
    customer_note text,
    admin_note text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    warranty_claim_id text
);


--
-- Name: customer_repair_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_repair_schedules (
    id text NOT NULL,
    journey_id text NOT NULL,
    schedule_type text NOT NULL,
    requested_date date,
    requested_time_window text,
    confirmed_date date,
    confirmed_time_window text,
    status text DEFAULT 'requested'::text NOT NULL,
    customer_note text,
    admin_note text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    assigned_driver_id text,
    zone text,
    route_order integer,
    customer_confirmed_at timestamp without time zone,
    pickup_schedule_id text
);


--
-- Name: customer_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_reviews (
    id text NOT NULL,
    customer_id text NOT NULL,
    customer_name text NOT NULL,
    rating integer NOT NULL,
    title text,
    content text NOT NULL,
    is_approved boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: deduction_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deduction_proposals (
    id text NOT NULL,
    user_id text NOT NULL,
    payroll_record_id text,
    month text NOT NULL,
    proposal_type text NOT NULL,
    description text NOT NULL,
    calculated_amount real NOT NULL,
    supporting_data_json text,
    status text DEFAULT 'pending'::text NOT NULL,
    approved_amount real,
    admin_notes text,
    decided_by text,
    decided_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: device_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_tokens (
    id text NOT NULL,
    user_id text NOT NULL,
    token text NOT NULL,
    platform text DEFAULT 'android'::text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    last_used_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: diagnosis_training_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diagnosis_training_data (
    id integer NOT NULL,
    job_id text,
    customer_chat_summary text,
    ai_prediction text,
    actual_issue text,
    was_accurate boolean,
    feedback_notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: diagnosis_training_data_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.diagnosis_training_data_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: diagnosis_training_data_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.diagnosis_training_data_id_seq OWNED BY public.diagnosis_training_data.id;


--
-- Name: drawer_day_close_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drawer_day_close_runs (
    id text NOT NULL,
    run_day date NOT NULL,
    idempotency_key text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    claim_owner text,
    claim_token text,
    claim_until timestamp without time zone,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp without time zone,
    next_attempt_at timestamp without time zone,
    last_failure_code text,
    drawer_session_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: drawer_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.drawer_sessions (
    id text NOT NULL,
    opened_by text NOT NULL,
    opened_by_name text NOT NULL,
    opened_at timestamp without time zone DEFAULT now() NOT NULL,
    starting_float real NOT NULL,
    expected_cash real,
    declared_cash real,
    discrepancy real,
    status text DEFAULT 'open'::text NOT NULL,
    closed_by text,
    closed_by_name text,
    closed_at timestamp without time zone,
    notes text,
    store_id text
);


--
-- Name: due_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.due_records (
    id text NOT NULL,
    customer text NOT NULL,
    amount real NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    invoice text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    due_date timestamp without time zone NOT NULL,
    paid_at timestamp without time zone,
    paid_amount real DEFAULT 0,
    source text DEFAULT 'manual'::text,
    customer_phone text,
    device_name text,
    old_reference text,
    note text,
    created_by text
);


--
-- Name: employee_salary_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_salary_assignments (
    id text NOT NULL,
    user_id text NOT NULL,
    employment_profile_id text NOT NULL,
    structure_id text NOT NULL,
    base_amount real NOT NULL,
    hra_amount real,
    medical_amount real,
    conveyance_amount real,
    other_amount real DEFAULT 0,
    income_tax_percent real DEFAULT 0,
    currency text DEFAULT 'BDT'::text NOT NULL,
    effective_from date NOT NULL,
    effective_to date,
    change_reason text DEFAULT 'new_hire'::text NOT NULL,
    approved_by text,
    approved_at timestamp without time zone,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: employment_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employment_profiles (
    id text NOT NULL,
    user_id text NOT NULL,
    employee_code text,
    employment_type text DEFAULT 'full_time'::text NOT NULL,
    payroll_eligible boolean DEFAULT true NOT NULL,
    employment_status text DEFAULT 'active'::text NOT NULL,
    join_date date,
    notice_period_days integer DEFAULT 30,
    resignation_date date,
    last_working_date date,
    separation_reason text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone
);


--
-- Name: final_settlement_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.final_settlement_records (
    id text NOT NULL,
    offboarding_case_id text NOT NULL,
    user_id text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    gross_total real NOT NULL,
    deduction_total real NOT NULL,
    net_total real NOT NULL,
    component_breakdown_json text,
    status text DEFAULT 'draft'::text NOT NULL,
    approved_by text,
    approved_at timestamp without time zone,
    paid_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: fraud_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fraud_alerts (
    id text NOT NULL,
    alert_type text NOT NULL,
    severity text NOT NULL,
    entity_type text,
    entity_id text,
    description text,
    rule_triggered text,
    status text DEFAULT 'open'::text NOT NULL,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    resolved_at timestamp without time zone,
    resolved_by text
);


--
-- Name: fraud_blocklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fraud_blocklist (
    id text NOT NULL,
    type text NOT NULL,
    value text NOT NULL,
    reason text,
    blocked_by text,
    blocked_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone
);


--
-- Name: holiday_calendar; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.holiday_calendar (
    id text NOT NULL,
    year integer NOT NULL,
    date text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    dismissed_reason text,
    forced_reason text,
    modified_by text,
    modified_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: increment_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.increment_suggestions (
    id text NOT NULL,
    user_id text NOT NULL,
    current_assignment_id text NOT NULL,
    current_base_amount real NOT NULL,
    suggested_base_amount real NOT NULL,
    suggested_increase_percent real NOT NULL,
    suggestion_reason text NOT NULL,
    reasoning_json text,
    status text DEFAULT 'pending'::text NOT NULL,
    admin_decision_amount real,
    admin_notes text,
    decided_by text,
    decided_at timestamp without time zone,
    effective_from date,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: inquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inquiries (
    id text NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    reply text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_items (
    id text NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    description text,
    item_type text DEFAULT 'product'::text NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    price real NOT NULL,
    min_price real,
    max_price real,
    status text DEFAULT 'In Stock'::text NOT NULL,
    low_stock_threshold integer DEFAULT 5,
    images text,
    show_on_website boolean DEFAULT false,
    show_on_android_app boolean DEFAULT true,
    show_on_hot_deals boolean DEFAULT false,
    hot_deal_price real,
    icon text,
    estimated_days text,
    display_order integer DEFAULT 0,
    features text,
    is_spare_part boolean DEFAULT false,
    store_id text,
    is_serialized boolean DEFAULT false,
    reorder_quantity integer,
    preferred_supplier text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: inventory_serials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_serials (
    id text NOT NULL,
    inventory_item_id text NOT NULL,
    serial_number text NOT NULL,
    status text DEFAULT 'In Stock'::text NOT NULL,
    job_ticket_id text,
    received_at timestamp without time zone DEFAULT now() NOT NULL,
    consumed_at timestamp without time zone,
    notes text,
    store_id text
);


--
-- Name: job_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_batches (
    id text NOT NULL,
    batch_number text,
    client_class text DEFAULT 'online'::text,
    corporate_client_id text,
    customer_id text,
    intake_date timestamp without time zone DEFAULT now() NOT NULL,
    receiver text,
    notes text,
    total_items integer DEFAULT 0,
    target_clear_date timestamp without time zone,
    cleared_at timestamp without time zone,
    batch_status text DEFAULT 'open'::text NOT NULL,
    extension_count integer DEFAULT 0 NOT NULL,
    corporate_challan_id text,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: job_extension_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_extension_requests (
    id text NOT NULL,
    corporate_client_id text NOT NULL,
    batch_id text,
    job_id text NOT NULL,
    reason text NOT NULL,
    requested_until timestamp without time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_by text,
    response_note text,
    responded_by text,
    responded_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone
);


--
-- Name: job_ng_customer_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_ng_customer_decisions (
    id text NOT NULL,
    job_id text NOT NULL,
    submission_id text NOT NULL,
    decision_type text NOT NULL,
    contact_channel text NOT NULL,
    decision_notes text NOT NULL,
    payload_fingerprint text,
    ng_report_id text NOT NULL,
    ng_report_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    recorded_by_user_id text NOT NULL,
    recorded_by_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    recorded_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT ck_job_ng_customer_decisions_contact_channel CHECK ((contact_channel = ANY (ARRAY['phone'::text, 'in_person'::text, 'message'::text]))),
    CONSTRAINT ck_job_ng_customer_decisions_decision_type CHECK ((decision_type = ANY (ARRAY['decline'::text, 'repair_alternative'::text, 'replacement'::text, 'quote_required'::text])))
);


--
-- Name: job_ng_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_ng_reports (
    id text NOT NULL,
    job_id text NOT NULL,
    submission_id text NOT NULL,
    failed_repair_type text NOT NULL,
    diagnosis text NOT NULL,
    technical_notes text NOT NULL,
    evidence_attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    parts_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_job_status text NOT NULL,
    report_status text DEFAULT 'pending_review'::text NOT NULL,
    reported_by_user_id text NOT NULL,
    reported_by_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    reported_at timestamp without time zone DEFAULT now() NOT NULL,
    reviewed_by_user_id text,
    reviewed_by_snapshot jsonb,
    reviewed_at timestamp without time zone,
    review_notes text,
    revision integer DEFAULT 1 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    source_problem_found text,
    payload_fingerprint text
);


--
-- Name: job_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_tickets (
    id text NOT NULL,
    customer text,
    customer_phone text,
    customer_phone_normalized text,
    customer_address text,
    device text,
    tv_serial_number text,
    issue text,
    status text DEFAULT 'Pending'::text NOT NULL,
    technician text,
    priority text,
    assisted_by text,
    screen_size text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    completed_at timestamp without time zone,
    deadline timestamp without time zone,
    sla_deadline timestamp without time zone,
    notes text,
    ai_diagnosis jsonb,
    estimated_cost real,
    assigned_technician_id text,
    corporate_challan_id text,
    corporate_job_number text,
    corporate_client_id text,
    job_type text DEFAULT 'standard'::text,
    parent_job_id text,
    charges jsonb,
    warranty_notes text,
    payment_status text DEFAULT 'unpaid'::text NOT NULL,
    payment_id text,
    paid_amount real DEFAULT 0,
    remaining_amount real DEFAULT 0,
    paid_at timestamp without time zone,
    last_payment_at timestamp without time zone,
    billing_status text DEFAULT 'pending'::text NOT NULL,
    invoice_printed_at timestamp without time zone,
    initial_status text,
    reported_defect text,
    problem_found text,
    corporate_bill_id text,
    invoice_printed_by text,
    invoice_print_count integer DEFAULT 0,
    write_off_reason text,
    write_off_by text,
    write_off_at timestamp without time zone,
    assisted_by_ids text DEFAULT '[]'::text,
    assisted_by_names text,
    service_lines text,
    product_lines text,
    warranty_days integer DEFAULT 30,
    grace_period_days integer DEFAULT 7,
    warranty_expiry_date timestamp without time zone,
    warranty_terms_accepted boolean DEFAULT false,
    store_id text,
    received_accessories text,
    model_number text,
    serial_number text,
    repair_outcome text,
    closure_reason text,
    inspection_result text DEFAULT 'pending'::text,
    inspection_note text,
    inspected_by text,
    inspected_at timestamp without time zone,
    mobile_media text DEFAULT '[]'::text,
    last_mobile_update_at timestamp without time zone,
    ticket_type text DEFAULT 'full_device'::text NOT NULL,
    panel_items jsonb DEFAULT '[]'::jsonb,
    quantity integer DEFAULT 1,
    abandoned_at timestamp without time zone,
    forfeited_at timestamp without time zone,
    last_sms_sent_at timestamp without time zone,
    client_class text,
    batch_id text,
    batch_target_clear_date timestamp without time zone,
    extension_status text DEFAULT 'none'::text,
    extension_requested_until timestamp without time zone,
    missing_parts jsonb DEFAULT '[]'::jsonb,
    parts_lineitems jsonb DEFAULT '[]'::jsonb,
    source text,
    service_area_id text,
    created_by_user_id text,
    created_by_name text,
    parts_cost real DEFAULT 0,
    labor_cost real DEFAULT 0,
    customer_id text,
    corporate_declaration text
);


--
-- Name: leave_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_applications (
    id text NOT NULL,
    user_id text NOT NULL,
    user_name text NOT NULL,
    user_role text NOT NULL,
    leave_type text NOT NULL,
    start_date text NOT NULL,
    end_date text NOT NULL,
    total_days integer NOT NULL,
    reason text NOT NULL,
    medical_certificate_url text,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by text,
    reviewed_at timestamp without time zone,
    rejection_reason text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: local_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.local_purchases (
    id text NOT NULL,
    job_ticket_id text NOT NULL,
    part_name text NOT NULL,
    supplier_name text,
    cost_price real NOT NULL,
    selling_price real NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    receipt_image_url text,
    purchased_by text NOT NULL,
    status text DEFAULT 'Consumed'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    store_id text
);


--
-- Name: logistics_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logistics_tasks (
    id text NOT NULL,
    task_type text DEFAULT 'pickup'::text NOT NULL,
    source_type text DEFAULT 'service_request'::text NOT NULL,
    service_request_id text,
    job_ticket_id text,
    customer_id text,
    customer_name text DEFAULT ''::text NOT NULL,
    customer_phone text,
    customer_phone_normalized text,
    pickup_address text,
    delivery_address text,
    scheduled_date timestamp without time zone,
    time_window text,
    status text DEFAULT 'pending'::text NOT NULL,
    assigned_driver_id text,
    assigned_driver_name text,
    zone text,
    route_order integer,
    latitude double precision,
    longitude double precision,
    proof_photo_url text,
    signature_url text,
    notes text,
    failure_reason text,
    reschedule_reason text,
    completed_at timestamp without time zone,
    cancelled_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    legacy_pickup_schedule_id text
);


--
-- Name: manual_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manual_payments (
    id text NOT NULL,
    job_ticket_id text,
    service_request_id text,
    due_record_id text,
    customer_name text,
    customer_phone text,
    method text NOT NULL,
    amount real NOT NULL,
    sender_number text,
    transaction_id text,
    proof_url text,
    source text DEFAULT 'admin_manual'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    verified_by text,
    verified_at timestamp without time zone,
    rejected_by text,
    rejected_at timestamp without time zone,
    rejection_reason text,
    applied_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id text NOT NULL,
    user_id text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    type text DEFAULT 'info'::text NOT NULL,
    link text,
    read boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    corporate_client_id text,
    job_id text,
    context_type text DEFAULT 'corporate'::text
);


--
-- Name: offboarding_cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offboarding_cases (
    id text NOT NULL,
    user_id text NOT NULL,
    employment_profile_id text NOT NULL,
    offboarding_type text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    notice_served_days integer DEFAULT 0,
    last_working_date date,
    settlement_due_date date,
    approved_by text,
    approved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone
);


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id text NOT NULL,
    order_id text NOT NULL,
    product_id text NOT NULL,
    product_name text NOT NULL,
    variant_id text,
    variant_name text,
    quantity integer DEFAULT 1 NOT NULL,
    price real NOT NULL,
    total real NOT NULL
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id text NOT NULL,
    order_number text,
    customer_id text NOT NULL,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    customer_address text NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    payment_method text DEFAULT 'COD'::text NOT NULL,
    subtotal real NOT NULL,
    total real NOT NULL,
    decline_reason text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: otp_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otp_codes (
    id text NOT NULL,
    phone text NOT NULL,
    code_hash text NOT NULL,
    purpose text DEFAULT 'request_verification'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    verified_at timestamp without time zone,
    ip_address text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_blacklist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_blacklist (
    id text NOT NULL,
    phone text NOT NULL,
    reason text,
    added_by text,
    added_by_name text,
    service_request_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: payroll_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_records (
    id text NOT NULL,
    user_id text NOT NULL,
    user_name text NOT NULL,
    month text NOT NULL,
    assignment_id text,
    run_type text DEFAULT 'regular'::text NOT NULL,
    calc_snapshot_json text,
    calc_hash text,
    is_locked boolean DEFAULT false NOT NULL,
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
    deduction_approved_at timestamp without time zone,
    total_deductions real NOT NULL,
    net_salary real NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    generated_by text,
    cleared_by text,
    paid_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: petty_cash_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.petty_cash_records (
    id text NOT NULL,
    description text NOT NULL,
    category text NOT NULL,
    amount real NOT NULL,
    type text NOT NULL,
    due_record_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    drawer_session_id text
);


--
-- Name: pickup_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pickup_schedules (
    id text NOT NULL,
    service_request_id text NOT NULL,
    tier text DEFAULT 'Regular'::text NOT NULL,
    tier_cost real DEFAULT 0 NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    scheduled_date timestamp without time zone,
    pickup_address text,
    assigned_staff text,
    pickup_notes text,
    pickup_proof_url text,
    picked_up_at timestamp without time zone,
    delivered_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policies (
    id text NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    is_published boolean DEFAULT true NOT NULL,
    is_published_app boolean DEFAULT true NOT NULL,
    last_updated timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: pos_transaction_area_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_transaction_area_allocations (
    id text NOT NULL,
    transaction_id text NOT NULL,
    job_ticket_id text,
    service_area_id text,
    billed_amount real NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    settlement_kind text DEFAULT 'paid'::text NOT NULL,
    CONSTRAINT pos_transaction_area_allocations_billed_amount_check CHECK ((billed_amount >= (0)::double precision))
);


--
-- Name: pos_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_transactions (
    id text NOT NULL,
    invoice_number text,
    customer text,
    customer_phone text,
    customer_address text,
    items text NOT NULL,
    linked_jobs text,
    subtotal real NOT NULL,
    tax real NOT NULL,
    tax_rate real DEFAULT 5,
    discount real DEFAULT 0,
    total real NOT NULL,
    payment_method text NOT NULL,
    payment_status text DEFAULT 'Paid'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    drawer_session_id text,
    service_area_id text,
    refunded_amount real DEFAULT 0 NOT NULL,
    refund_status text DEFAULT 'none'::text NOT NULL,
    client_request_id text,
    created_by_user_id text,
    idempotency_fingerprint text
);


--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_variants (
    id text NOT NULL,
    product_id text NOT NULL,
    variant_name text NOT NULL,
    price real NOT NULL,
    stock integer DEFAULT 0 NOT NULL,
    sku text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id text NOT NULL,
    name text NOT NULL,
    price text NOT NULL,
    category text NOT NULL,
    image text NOT NULL,
    rating real DEFAULT 0,
    reviews integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: promise_schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promise_schema_migrations (
    id text NOT NULL,
    checksum text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_by text,
    duration_ms integer
);


--
-- Name: promise_test_rollback_marker; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promise_test_rollback_marker (
    id text NOT NULL,
    note text
);


--
-- Name: purchase_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_order_items (
    id text NOT NULL,
    purchase_order_id text NOT NULL,
    inventory_item_id text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price real DEFAULT 0 NOT NULL
);


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id text NOT NULL,
    supplier_name text NOT NULL,
    status text DEFAULT 'Draft'::text NOT NULL,
    total_amount real DEFAULT 0 NOT NULL,
    expected_delivery_date timestamp without time zone,
    notes text,
    store_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: refund_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refund_allocations (
    id text NOT NULL,
    refund_id text NOT NULL,
    transaction_id text NOT NULL,
    job_ticket_id text,
    refund_amount real NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_refund_alloc_amount_pos CHECK ((refund_amount > (0)::double precision))
);


--
-- Name: refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refunds (
    id text NOT NULL,
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
    requested_at timestamp without time zone DEFAULT now() NOT NULL,
    approved_by text,
    approved_by_name text,
    approved_by_role text,
    approved_at timestamp without time zone,
    processed_by text,
    processed_by_name text,
    processed_by_role text,
    processed_at timestamp without time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    rejection_reason text,
    cancellation_reason text,
    notes text,
    petty_cash_record_id text,
    fraud_alert_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    scope text DEFAULT 'invoice'::text NOT NULL,
    target_job_ticket_id text,
    CONSTRAINT chk_refunds_scope CHECK ((scope = ANY (ARRAY['invoice'::text, 'job_allocation'::text]))),
    CONSTRAINT chk_refunds_scope_target CHECK ((((scope = 'invoice'::text) AND (target_job_ticket_id IS NULL)) OR ((scope = 'job_allocation'::text) AND (target_job_ticket_id IS NOT NULL))))
);


--
-- Name: reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminders (
    id text NOT NULL,
    user_id text NOT NULL,
    created_by text NOT NULL,
    title text NOT NULL,
    body text,
    remind_at timestamp without time zone NOT NULL,
    repeat text,
    job_id text,
    is_sent boolean DEFAULT false NOT NULL,
    sent_at timestamp without time zone,
    is_dismissed boolean DEFAULT false NOT NULL,
    dismissed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    claim_owner text,
    claim_token text,
    claim_until timestamp without time zone,
    attempt_count integer DEFAULT 0 NOT NULL,
    delivery_status text DEFAULT 'pending'::text NOT NULL,
    last_attempt_at timestamp without time zone,
    next_attempt_at timestamp without time zone,
    last_failure_code text
);


--
-- Name: retail_quote_admin_acceptances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retail_quote_admin_acceptances (
    id text NOT NULL,
    service_request_id text NOT NULL,
    admin_user_id text NOT NULL,
    admin_name text,
    confirmation_note text NOT NULL,
    accepted_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: rollback_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rollback_requests (
    id integer NOT NULL,
    job_ticket_id text,
    requested_by text NOT NULL,
    reason text NOT NULL,
    target_status text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    resolved_by text,
    store_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: rollback_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rollback_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rollback_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rollback_requests_id_seq OWNED BY public.rollback_requests.id;


--
-- Name: salary_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_components (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    component_type text DEFAULT 'earning'::text NOT NULL,
    calc_mode text DEFAULT 'fixed'::text NOT NULL,
    default_percent real,
    is_proratable boolean DEFAULT true NOT NULL,
    is_taxable boolean DEFAULT true NOT NULL,
    applies_to text DEFAULT 'both'::text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: salary_structure_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_structure_lines (
    id text NOT NULL,
    structure_id text NOT NULL,
    component_id text NOT NULL,
    sequence integer DEFAULT 0 NOT NULL,
    is_mandatory boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: salary_structures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_structures (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone
);


--
-- Name: scheduled_backup_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_backup_runs (
    id text NOT NULL,
    run_day date NOT NULL,
    idempotency_key text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    claim_owner text,
    claim_token text,
    claim_until timestamp without time zone,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp without time zone,
    next_attempt_at timestamp without time zone,
    last_failure_code text,
    backup_metadata_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: scheduler_delivery_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduler_delivery_outbox (
    id text NOT NULL,
    kind text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    idempotency_key text NOT NULL,
    delivery_status text DEFAULT 'pending'::text NOT NULL,
    claim_owner text,
    claim_token text,
    claim_until timestamp without time zone,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp without time zone,
    next_attempt_at timestamp without time zone,
    last_failure_code text,
    sent_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: service_areas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_areas (
    id text NOT NULL,
    city text DEFAULT 'Dhaka'::text NOT NULL,
    area_name text NOT NULL,
    subarea_name text,
    block_or_sector text,
    normalized_key text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    centroid_latitude double precision,
    centroid_longitude double precision,
    boundary_geo_json jsonb,
    geometry_updated_at timestamp without time zone,
    is_public boolean DEFAULT false NOT NULL
);


--
-- Name: service_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_catalog (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    category text NOT NULL,
    min_price real NOT NULL,
    max_price real NOT NULL,
    estimated_days text,
    icon text,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    features text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: service_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_categories (
    id text NOT NULL,
    name text NOT NULL,
    display_order integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: service_request_call_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_request_call_attempts (
    id text NOT NULL,
    service_request_id text NOT NULL,
    staff_id text NOT NULL,
    staff_name text NOT NULL,
    call_type text DEFAULT 'follow_up'::text NOT NULL,
    scheduled_at timestamp without time zone,
    called_at timestamp without time zone,
    outcome text,
    next_action text,
    callback_at timestamp without time zone,
    customer_mood text,
    notes text,
    customer_visible_message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: service_request_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_request_events (
    id text NOT NULL,
    service_request_id text NOT NULL,
    status text NOT NULL,
    message text,
    actor text,
    occurred_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: service_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_requests (
    id text NOT NULL,
    ticket_number text,
    customer_id text,
    brand text NOT NULL,
    screen_size text,
    model_number text,
    primary_issue text NOT NULL,
    symptoms text,
    description text,
    media_urls text,
    customer_name text NOT NULL,
    phone text NOT NULL,
    address text,
    service_preference text,
    status text DEFAULT 'Pending'::text NOT NULL,
    tracking_status text DEFAULT 'Request Received'::text NOT NULL,
    estimated_delivery timestamp without time zone,
    payment_status text DEFAULT 'Due'::text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    expires_at timestamp without time zone,
    converted_job_id text,
    request_intent text,
    service_mode text,
    stage text DEFAULT 'intake'::text,
    is_quote boolean DEFAULT false,
    service_id text,
    quote_status text,
    quote_amount real,
    quote_notes text,
    quoted_at timestamp without time zone,
    quote_expires_at timestamp without time zone,
    accepted_at timestamp without time zone,
    pickup_tier text,
    pickup_cost real,
    total_amount real,
    scheduled_pickup_date timestamp without time zone,
    expected_pickup_date timestamp without time zone,
    expected_return_date timestamp without time zone,
    expected_ready_date timestamp without time zone,
    intake_location jsonb,
    physical_condition text,
    customer_signature_url text,
    proof_of_purchase text,
    warranty_status text,
    agreed_to_pickup boolean DEFAULT false,
    pickup_agreed_at timestamp without time zone,
    store_id text,
    corporate_client_id text,
    corporate_challan_id text,
    admin_interacted boolean DEFAULT false,
    admin_interacted_at timestamp without time zone,
    admin_interacted_by text,
    service_area_id text,
    phone_normalized text,
    intake_source text,
    client_request_id text,
    idempotency_fingerprint text,
    source text
);


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    id text NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: spare_part_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spare_part_orders (
    id text NOT NULL,
    order_id text NOT NULL,
    brand text NOT NULL,
    screen_size text,
    model_number text,
    primary_issue text,
    symptoms text,
    description text,
    images text,
    fulfillment_type text NOT NULL,
    pickup_tier text,
    pickup_address text,
    scheduled_date timestamp without time zone,
    verification_status text DEFAULT 'pending'::text,
    is_compatible boolean,
    quoted_service_charge real,
    quoted_at timestamp without time zone,
    quote_accepted boolean,
    quote_accepted_at timestamp without time zone,
    token_number text,
    token_expires_at timestamp without time zone,
    token_status text DEFAULT 'pending'::text,
    token_redeemed_at timestamp without time zone,
    technician_id text,
    installation_notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: staff_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_invitations (
    id text NOT NULL,
    token_hash text NOT NULL,
    role text NOT NULL,
    permissions text DEFAULT '{}'::text NOT NULL,
    phone text,
    email text,
    note text,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_by text NOT NULL,
    redeemed_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    redeemed_at timestamp without time zone,
    revoked_at timestamp without time zone,
    regenerated_from_id text
);


--
-- Name: staff_reset_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_reset_codes (
    id text NOT NULL,
    user_id text NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    used boolean DEFAULT false NOT NULL,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: staff_salary_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_salary_config (
    id text NOT NULL,
    user_id text NOT NULL,
    basic_salary real NOT NULL,
    house_rent_allowance real,
    medical_allowance real,
    conveyance_allowance real,
    other_allowances real DEFAULT 0,
    income_tax_percent real DEFAULT 0,
    casual_leave_balance integer DEFAULT 10,
    sick_leave_balance integer DEFAULT 14,
    earned_leave_balance real DEFAULT 0,
    last_increment_date timestamp without time zone,
    increment_blocked_reason text,
    effective_from timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone
);


--
-- Name: system_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_modules (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    category text DEFAULT 'general'::text NOT NULL,
    enabled_admin boolean DEFAULT true NOT NULL,
    enabled_customer boolean DEFAULT false NOT NULL,
    enabled_corporate boolean DEFAULT false NOT NULL,
    enabled_technician boolean DEFAULT false NOT NULL,
    is_core boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0,
    icon text,
    dependencies text DEFAULT '[]'::text,
    portal_scope text DEFAULT 'admin'::text,
    offline_capability text DEFAULT 'locked'::text,
    toggled_by text,
    toggled_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: trusted_corporate_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trusted_corporate_devices (
    id text NOT NULL,
    user_id text NOT NULL,
    token_hash text NOT NULL,
    user_agent text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    last_used_at timestamp without time zone DEFAULT now() NOT NULL,
    trusted_until timestamp without time zone NOT NULL,
    revoked_at timestamp without time zone,
    revoked_reason text
);


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    sid text NOT NULL,
    sess jsonb NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    username text,
    name text NOT NULL,
    email text,
    phone text,
    phone_normalized text,
    password text NOT NULL,
    role text DEFAULT 'Customer'::text NOT NULL,
    status text DEFAULT 'Active'::text NOT NULL,
    permissions text DEFAULT '{}'::text NOT NULL,
    skills text,
    seniority_level text DEFAULT 'Junior'::text,
    performance_score real DEFAULT 0,
    joined_at timestamp without time zone DEFAULT now() NOT NULL,
    last_login timestamp without time zone,
    google_sub text,
    store_id text,
    address text,
    profile_image_url text,
    avatar text,
    is_verified boolean DEFAULT false,
    preferences text DEFAULT '{}'::text,
    corporate_client_id text,
    password_changed_at timestamp without time zone,
    firebase_uid text,
    default_work_location_id text
);


--
-- Name: warranty_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warranty_claims (
    id text NOT NULL,
    original_job_id text NOT NULL,
    new_job_id text,
    customer text NOT NULL,
    customer_phone text,
    device text,
    claim_type text NOT NULL,
    claim_reason text NOT NULL,
    warranty_valid boolean NOT NULL,
    warranty_expiry_date timestamp without time zone,
    claimed_by text NOT NULL,
    claimed_by_name text NOT NULL,
    claimed_by_role text NOT NULL,
    claimed_at timestamp without time zone DEFAULT now() NOT NULL,
    approved_by text,
    approved_by_name text,
    approved_by_role text,
    approved_at timestamp without time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    rejection_reason text,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone,
    service_area_id text
);


--
-- Name: wastage_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wastage_logs (
    id text NOT NULL,
    inventory_item_id text NOT NULL,
    serial_id text,
    quantity integer DEFAULT 1 NOT NULL,
    reason text NOT NULL,
    job_ticket_id text,
    financial_loss real,
    reported_by text NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    store_id text
);


--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Name: ai_debug_suggestions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_debug_suggestions ALTER COLUMN id SET DEFAULT nextval('public.ai_debug_suggestions_id_seq'::regclass);


--
-- Name: ai_insights id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_insights ALTER COLUMN id SET DEFAULT nextval('public.ai_insights_id_seq'::regclass);


--
-- Name: ai_query_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_query_log ALTER COLUMN id SET DEFAULT nextval('public.ai_query_log_id_seq'::regclass);


--
-- Name: diagnosis_training_data id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnosis_training_data ALTER COLUMN id SET DEFAULT nextval('public.diagnosis_training_data_id_seq'::regclass);


--
-- Name: rollback_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rollback_requests ALTER COLUMN id SET DEFAULT nextval('public.rollback_requests_id_seq'::regclass);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: ai_debug_suggestions ai_debug_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_debug_suggestions
    ADD CONSTRAINT ai_debug_suggestions_pkey PRIMARY KEY (id);


--
-- Name: ai_insights ai_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_insights
    ADD CONSTRAINT ai_insights_pkey PRIMARY KEY (id);


--
-- Name: ai_query_log ai_query_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_query_log
    ADD CONSTRAINT ai_query_log_pkey PRIMARY KEY (id);


--
-- Name: approval_requests approval_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);


--
-- Name: attendance_records attendance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: backup_audit_logs backup_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_audit_logs
    ADD CONSTRAINT backup_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: backup_metadata backup_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_metadata
    ADD CONSTRAINT backup_metadata_pkey PRIMARY KEY (id);


--
-- Name: backup_schedules backup_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backup_schedules
    ADD CONSTRAINT backup_schedules_pkey PRIMARY KEY (id);


--
-- Name: bonus_records bonus_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bonus_records
    ADD CONSTRAINT bonus_records_pkey PRIMARY KEY (id);


--
-- Name: challans challans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challans
    ADD CONSTRAINT challans_pkey PRIMARY KEY (id);


--
-- Name: corporate_bills corporate_bills_bill_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporate_bills
    ADD CONSTRAINT corporate_bills_bill_number_unique UNIQUE (bill_number);


--
-- Name: corporate_bills corporate_bills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporate_bills
    ADD CONSTRAINT corporate_bills_pkey PRIMARY KEY (id);


--
-- Name: corporate_challans corporate_challans_challan_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporate_challans
    ADD CONSTRAINT corporate_challans_challan_number_unique UNIQUE (challan_number);


--
-- Name: corporate_challans corporate_challans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporate_challans
    ADD CONSTRAINT corporate_challans_pkey PRIMARY KEY (id);


--
-- Name: corporate_clients corporate_clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporate_clients
    ADD CONSTRAINT corporate_clients_pkey PRIMARY KEY (id);


--
-- Name: corporate_clients corporate_clients_portal_username_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporate_clients
    ADD CONSTRAINT corporate_clients_portal_username_unique UNIQUE (portal_username);


--
-- Name: corporate_clients corporate_clients_short_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporate_clients
    ADD CONSTRAINT corporate_clients_short_code_unique UNIQUE (short_code);


--
-- Name: corporate_message_threads corporate_message_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporate_message_threads
    ADD CONSTRAINT corporate_message_threads_pkey PRIMARY KEY (id);


--
-- Name: corporate_messages corporate_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporate_messages
    ADD CONSTRAINT corporate_messages_pkey PRIMARY KEY (id);


--
-- Name: corporate_password_reset_requests corporate_password_reset_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporate_password_reset_requests
    ADD CONSTRAINT corporate_password_reset_requests_pkey PRIMARY KEY (id);


--
-- Name: corporate_portal_urgencies corporate_portal_urgencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporate_portal_urgencies
    ADD CONSTRAINT corporate_portal_urgencies_pkey PRIMARY KEY (id);


--
-- Name: corporate_setup_tokens corporate_setup_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporate_setup_tokens
    ADD CONSTRAINT corporate_setup_tokens_pkey PRIMARY KEY (id);


--
-- Name: corporate_setup_tokens corporate_setup_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporate_setup_tokens
    ADD CONSTRAINT corporate_setup_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: customer_addresses customer_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_addresses
    ADD CONSTRAINT customer_addresses_pkey PRIMARY KEY (id);


--
-- Name: customer_repair_journey_events customer_repair_journey_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_repair_journey_events
    ADD CONSTRAINT customer_repair_journey_events_pkey PRIMARY KEY (id);


--
-- Name: customer_repair_journeys customer_repair_journeys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_repair_journeys
    ADD CONSTRAINT customer_repair_journeys_pkey PRIMARY KEY (id);


--
-- Name: customer_repair_schedules customer_repair_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_repair_schedules
    ADD CONSTRAINT customer_repair_schedules_pkey PRIMARY KEY (id);


--
-- Name: customer_reviews customer_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_reviews
    ADD CONSTRAINT customer_reviews_pkey PRIMARY KEY (id);


--
-- Name: deduction_proposals deduction_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deduction_proposals
    ADD CONSTRAINT deduction_proposals_pkey PRIMARY KEY (id);


--
-- Name: device_tokens device_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT device_tokens_pkey PRIMARY KEY (id);


--
-- Name: device_tokens device_tokens_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_tokens
    ADD CONSTRAINT device_tokens_token_unique UNIQUE (token);


--
-- Name: diagnosis_training_data diagnosis_training_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnosis_training_data
    ADD CONSTRAINT diagnosis_training_data_pkey PRIMARY KEY (id);


--
-- Name: drawer_day_close_runs drawer_day_close_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drawer_day_close_runs
    ADD CONSTRAINT drawer_day_close_runs_pkey PRIMARY KEY (id);


--
-- Name: drawer_sessions drawer_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.drawer_sessions
    ADD CONSTRAINT drawer_sessions_pkey PRIMARY KEY (id);


--
-- Name: due_records due_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.due_records
    ADD CONSTRAINT due_records_pkey PRIMARY KEY (id);


--
-- Name: employee_salary_assignments employee_salary_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_salary_assignments
    ADD CONSTRAINT employee_salary_assignments_pkey PRIMARY KEY (id);


--
-- Name: employment_profiles employment_profiles_employee_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employment_profiles
    ADD CONSTRAINT employment_profiles_employee_code_unique UNIQUE (employee_code);


--
-- Name: employment_profiles employment_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employment_profiles
    ADD CONSTRAINT employment_profiles_pkey PRIMARY KEY (id);


--
-- Name: employment_profiles employment_profiles_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employment_profiles
    ADD CONSTRAINT employment_profiles_user_id_unique UNIQUE (user_id);


--
-- Name: final_settlement_records final_settlement_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.final_settlement_records
    ADD CONSTRAINT final_settlement_records_pkey PRIMARY KEY (id);


--
-- Name: fraud_alerts fraud_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fraud_alerts
    ADD CONSTRAINT fraud_alerts_pkey PRIMARY KEY (id);


--
-- Name: fraud_blocklist fraud_blocklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fraud_blocklist
    ADD CONSTRAINT fraud_blocklist_pkey PRIMARY KEY (id);


--
-- Name: holiday_calendar holiday_calendar_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.holiday_calendar
    ADD CONSTRAINT holiday_calendar_pkey PRIMARY KEY (id);


--
-- Name: increment_suggestions increment_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.increment_suggestions
    ADD CONSTRAINT increment_suggestions_pkey PRIMARY KEY (id);


--
-- Name: inquiries inquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inquiries
    ADD CONSTRAINT inquiries_pkey PRIMARY KEY (id);


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_serials inventory_serials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_serials
    ADD CONSTRAINT inventory_serials_pkey PRIMARY KEY (id);


--
-- Name: job_batches job_batches_batch_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_batches
    ADD CONSTRAINT job_batches_batch_number_key UNIQUE (batch_number);


--
-- Name: job_batches job_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_batches
    ADD CONSTRAINT job_batches_pkey PRIMARY KEY (id);


--
-- Name: job_extension_requests job_extension_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_extension_requests
    ADD CONSTRAINT job_extension_requests_pkey PRIMARY KEY (id);


--
-- Name: job_ng_customer_decisions job_ng_customer_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_ng_customer_decisions
    ADD CONSTRAINT job_ng_customer_decisions_pkey PRIMARY KEY (id);


--
-- Name: job_ng_reports job_ng_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_ng_reports
    ADD CONSTRAINT job_ng_reports_pkey PRIMARY KEY (id);


--
-- Name: job_tickets job_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_tickets
    ADD CONSTRAINT job_tickets_pkey PRIMARY KEY (id);


--
-- Name: leave_applications leave_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_applications
    ADD CONSTRAINT leave_applications_pkey PRIMARY KEY (id);


--
-- Name: local_purchases local_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.local_purchases
    ADD CONSTRAINT local_purchases_pkey PRIMARY KEY (id);


--
-- Name: logistics_tasks logistics_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logistics_tasks
    ADD CONSTRAINT logistics_tasks_pkey PRIMARY KEY (id);


--
-- Name: manual_payments manual_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_payments
    ADD CONSTRAINT manual_payments_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: offboarding_cases offboarding_cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offboarding_cases
    ADD CONSTRAINT offboarding_cases_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_number_unique UNIQUE (order_number);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: otp_codes otp_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_codes
    ADD CONSTRAINT otp_codes_pkey PRIMARY KEY (id);


--
-- Name: payment_blacklist payment_blacklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_blacklist
    ADD CONSTRAINT payment_blacklist_pkey PRIMARY KEY (id);


--
-- Name: payroll_records payroll_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_records
    ADD CONSTRAINT payroll_records_pkey PRIMARY KEY (id);


--
-- Name: petty_cash_records petty_cash_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petty_cash_records
    ADD CONSTRAINT petty_cash_records_pkey PRIMARY KEY (id);


--
-- Name: pickup_schedules pickup_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pickup_schedules
    ADD CONSTRAINT pickup_schedules_pkey PRIMARY KEY (id);


--
-- Name: policies policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policies
    ADD CONSTRAINT policies_pkey PRIMARY KEY (id);


--
-- Name: policies policies_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policies
    ADD CONSTRAINT policies_slug_unique UNIQUE (slug);


--
-- Name: pos_transaction_area_allocations pos_transaction_area_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_transaction_area_allocations
    ADD CONSTRAINT pos_transaction_area_allocations_pkey PRIMARY KEY (id);


--
-- Name: pos_transactions pos_transactions_invoice_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_transactions
    ADD CONSTRAINT pos_transactions_invoice_number_unique UNIQUE (invoice_number);


--
-- Name: pos_transactions pos_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_transactions
    ADD CONSTRAINT pos_transactions_pkey PRIMARY KEY (id);


--
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: promise_schema_migrations promise_schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promise_schema_migrations
    ADD CONSTRAINT promise_schema_migrations_pkey PRIMARY KEY (id);


--
-- Name: promise_test_rollback_marker promise_test_rollback_marker_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promise_test_rollback_marker
    ADD CONSTRAINT promise_test_rollback_marker_pkey PRIMARY KEY (id);


--
-- Name: purchase_order_items purchase_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: refund_allocations refund_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refund_allocations
    ADD CONSTRAINT refund_allocations_pkey PRIMARY KEY (id);


--
-- Name: refunds refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);


--
-- Name: reminders reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);


--
-- Name: retail_quote_admin_acceptances retail_quote_admin_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_quote_admin_acceptances
    ADD CONSTRAINT retail_quote_admin_acceptances_pkey PRIMARY KEY (id);


--
-- Name: rollback_requests rollback_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rollback_requests
    ADD CONSTRAINT rollback_requests_pkey PRIMARY KEY (id);


--
-- Name: salary_components salary_components_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_components
    ADD CONSTRAINT salary_components_code_unique UNIQUE (code);


--
-- Name: salary_components salary_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_components
    ADD CONSTRAINT salary_components_pkey PRIMARY KEY (id);


--
-- Name: salary_structure_lines salary_structure_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_structure_lines
    ADD CONSTRAINT salary_structure_lines_pkey PRIMARY KEY (id);


--
-- Name: salary_structures salary_structures_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_structures
    ADD CONSTRAINT salary_structures_code_unique UNIQUE (code);


--
-- Name: salary_structures salary_structures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_structures
    ADD CONSTRAINT salary_structures_pkey PRIMARY KEY (id);


--
-- Name: scheduled_backup_runs scheduled_backup_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_backup_runs
    ADD CONSTRAINT scheduled_backup_runs_pkey PRIMARY KEY (id);


--
-- Name: scheduler_delivery_outbox scheduler_delivery_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduler_delivery_outbox
    ADD CONSTRAINT scheduler_delivery_outbox_pkey PRIMARY KEY (id);


--
-- Name: service_areas service_areas_normalized_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_areas
    ADD CONSTRAINT service_areas_normalized_key_key UNIQUE (normalized_key);


--
-- Name: service_areas service_areas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_areas
    ADD CONSTRAINT service_areas_pkey PRIMARY KEY (id);


--
-- Name: service_catalog service_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_catalog
    ADD CONSTRAINT service_catalog_pkey PRIMARY KEY (id);


--
-- Name: service_categories service_categories_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_categories
    ADD CONSTRAINT service_categories_name_unique UNIQUE (name);


--
-- Name: service_categories service_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_categories
    ADD CONSTRAINT service_categories_pkey PRIMARY KEY (id);


--
-- Name: service_request_call_attempts service_request_call_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_call_attempts
    ADD CONSTRAINT service_request_call_attempts_pkey PRIMARY KEY (id);


--
-- Name: service_request_events service_request_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_request_events
    ADD CONSTRAINT service_request_events_pkey PRIMARY KEY (id);


--
-- Name: service_requests service_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_pkey PRIMARY KEY (id);


--
-- Name: service_requests service_requests_ticket_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_ticket_number_unique UNIQUE (ticket_number);


--
-- Name: settings settings_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_key_unique UNIQUE (key);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: spare_part_orders spare_part_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spare_part_orders
    ADD CONSTRAINT spare_part_orders_pkey PRIMARY KEY (id);


--
-- Name: spare_part_orders spare_part_orders_token_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spare_part_orders
    ADD CONSTRAINT spare_part_orders_token_number_unique UNIQUE (token_number);


--
-- Name: staff_invitations staff_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_invitations
    ADD CONSTRAINT staff_invitations_pkey PRIMARY KEY (id);


--
-- Name: staff_invitations staff_invitations_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_invitations
    ADD CONSTRAINT staff_invitations_token_hash_key UNIQUE (token_hash);


--
-- Name: staff_reset_codes staff_reset_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_reset_codes
    ADD CONSTRAINT staff_reset_codes_pkey PRIMARY KEY (id);


--
-- Name: staff_salary_config staff_salary_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_salary_config
    ADD CONSTRAINT staff_salary_config_pkey PRIMARY KEY (id);


--
-- Name: staff_salary_config staff_salary_config_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_salary_config
    ADD CONSTRAINT staff_salary_config_user_id_unique UNIQUE (user_id);


--
-- Name: system_modules system_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_modules
    ADD CONSTRAINT system_modules_pkey PRIMARY KEY (id);


--
-- Name: trusted_corporate_devices trusted_corporate_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trusted_corporate_devices
    ADD CONSTRAINT trusted_corporate_devices_pkey PRIMARY KEY (id);


--
-- Name: trusted_corporate_devices trusted_corporate_devices_token_hash_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trusted_corporate_devices
    ADD CONSTRAINT trusted_corporate_devices_token_hash_unique UNIQUE (token_hash);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (sid);


--
-- Name: users users_firebase_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_firebase_uid_key UNIQUE (firebase_uid);


--
-- Name: users users_google_sub_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_google_sub_unique UNIQUE (google_sub);


--
-- Name: users users_phone_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_phone_unique UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: warranty_claims warranty_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT warranty_claims_pkey PRIMARY KEY (id);


--
-- Name: wastage_logs wastage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wastage_logs
    ADD CONSTRAINT wastage_logs_pkey PRIMARY KEY (id);


--
-- Name: idx_approval_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_requests_status ON public.approval_requests USING btree (status);


--
-- Name: idx_approval_requests_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_approval_requests_type ON public.approval_requests USING btree (type);


--
-- Name: idx_assign_effective; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assign_effective ON public.employee_salary_assignments USING btree (user_id, effective_from, effective_to);


--
-- Name: idx_assign_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assign_user ON public.employee_salary_assignments USING btree (user_id);


--
-- Name: idx_attendance_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_user_date ON public.attendance_records USING btree (user_id, date);


--
-- Name: idx_audit_logs_severity_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_severity_created ON public.audit_logs USING btree (severity, created_at);


--
-- Name: idx_bonus_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bonus_type ON public.bonus_records USING btree (bonus_type);


--
-- Name: idx_bonus_user_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bonus_user_year ON public.bonus_records USING btree (user_id, year);


--
-- Name: idx_call_attempts_callback; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_attempts_callback ON public.service_request_call_attempts USING btree (callback_at);


--
-- Name: idx_call_attempts_outcome; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_attempts_outcome ON public.service_request_call_attempts USING btree (outcome);


--
-- Name: idx_call_attempts_sr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_attempts_sr ON public.service_request_call_attempts USING btree (service_request_id);


--
-- Name: idx_challans_assigned_driver_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_challans_assigned_driver_id ON public.challans USING btree (assigned_driver_id);


--
-- Name: idx_challans_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_challans_created_at ON public.challans USING btree (created_at);


--
-- Name: idx_challans_created_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_challans_created_by_user_id ON public.challans USING btree (created_by_user_id);


--
-- Name: idx_challans_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_challans_status ON public.challans USING btree (status);


--
-- Name: idx_challans_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_challans_type ON public.challans USING btree (type);


--
-- Name: idx_corp_setup_tokens_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corp_setup_tokens_hash ON public.corporate_setup_tokens USING btree (token_hash);


--
-- Name: idx_corp_setup_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corp_setup_tokens_user ON public.corporate_setup_tokens USING btree (user_id);


--
-- Name: idx_corporate_bills_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporate_bills_client_id ON public.corporate_bills USING btree (corporate_client_id);


--
-- Name: idx_corporate_bills_payment_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporate_bills_payment_status ON public.corporate_bills USING btree (payment_status);


--
-- Name: idx_corporate_challans_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporate_challans_client_id ON public.corporate_challans USING btree (corporate_client_id);


--
-- Name: idx_corporate_challans_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporate_challans_status ON public.corporate_challans USING btree (status);


--
-- Name: idx_corporate_challans_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporate_challans_type ON public.corporate_challans USING btree (type);


--
-- Name: idx_corporate_messages_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporate_messages_created ON public.corporate_messages USING btree (created_at);


--
-- Name: idx_corporate_messages_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporate_messages_read ON public.corporate_messages USING btree (is_read);


--
-- Name: idx_corporate_messages_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporate_messages_thread ON public.corporate_messages USING btree (thread_id);


--
-- Name: idx_corporate_password_reset_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporate_password_reset_client ON public.corporate_password_reset_requests USING btree (corporate_client_id);


--
-- Name: idx_corporate_password_reset_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporate_password_reset_expires_at ON public.corporate_password_reset_requests USING btree (expires_at);


--
-- Name: idx_corporate_password_reset_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporate_password_reset_status ON public.corporate_password_reset_requests USING btree (status);


--
-- Name: idx_corporate_password_reset_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporate_password_reset_user ON public.corporate_password_reset_requests USING btree (user_id);


--
-- Name: idx_corporate_threads_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporate_threads_client ON public.corporate_message_threads USING btree (corporate_client_id);


--
-- Name: idx_corporate_threads_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_corporate_threads_status ON public.corporate_message_threads USING btree (status);


--
-- Name: idx_crj_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crj_created_at ON public.customer_repair_journeys USING btree (created_at DESC);


--
-- Name: idx_crj_current_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crj_current_stage ON public.customer_repair_journeys USING btree (current_stage);


--
-- Name: idx_crj_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crj_customer_id ON public.customer_repair_journeys USING btree (customer_id);


--
-- Name: idx_crj_job_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crj_job_ticket_id ON public.customer_repair_journeys USING btree (job_ticket_id);


--
-- Name: idx_crj_quote_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crj_quote_request_id ON public.customer_repair_journeys USING btree (quote_request_id);


--
-- Name: idx_crj_service_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crj_service_request_id ON public.customer_repair_journeys USING btree (service_request_id);


--
-- Name: idx_crje_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crje_created_at ON public.customer_repair_journey_events USING btree (created_at DESC);


--
-- Name: idx_crje_journey_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crje_journey_id ON public.customer_repair_journey_events USING btree (journey_id);


--
-- Name: idx_crs_journey_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crs_journey_id ON public.customer_repair_schedules USING btree (journey_id);


--
-- Name: idx_crs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_crs_status ON public.customer_repair_schedules USING btree (status);


--
-- Name: idx_deduct_prop_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deduct_prop_month ON public.deduction_proposals USING btree (month);


--
-- Name: idx_deduct_prop_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deduct_prop_status ON public.deduction_proposals USING btree (status);


--
-- Name: idx_deduct_prop_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deduct_prop_user ON public.deduction_proposals USING btree (user_id);


--
-- Name: idx_drawer_day_close_runs_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_drawer_day_close_runs_due ON public.drawer_day_close_runs USING btree (status, next_attempt_at, claim_until);


--
-- Name: idx_emp_profile_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emp_profile_status ON public.employment_profiles USING btree (employment_status);


--
-- Name: idx_emp_profile_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_emp_profile_user ON public.employment_profiles USING btree (user_id);


--
-- Name: idx_fraud_blocklist_type_value; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fraud_blocklist_type_value ON public.fraud_blocklist USING btree (type, value);


--
-- Name: idx_holiday_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_holiday_status ON public.holiday_calendar USING btree (status);


--
-- Name: idx_holiday_year; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_holiday_year ON public.holiday_calendar USING btree (year);


--
-- Name: idx_holiday_year_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_holiday_year_date ON public.holiday_calendar USING btree (year, date);


--
-- Name: idx_incr_sugg_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incr_sugg_status ON public.increment_suggestions USING btree (status);


--
-- Name: idx_incr_sugg_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_incr_sugg_user ON public.increment_suggestions USING btree (user_id);


--
-- Name: idx_inventory_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_category ON public.inventory_items USING btree (category);


--
-- Name: idx_inventory_show_on_website; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_show_on_website ON public.inventory_items USING btree (show_on_website);


--
-- Name: idx_inventory_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_status ON public.inventory_items USING btree (status);


--
-- Name: idx_job_batches_corporate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_batches_corporate ON public.job_batches USING btree (corporate_client_id);


--
-- Name: idx_job_extension_requests_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_extension_requests_batch ON public.job_extension_requests USING btree (batch_id);


--
-- Name: idx_job_extension_requests_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_extension_requests_client ON public.job_extension_requests USING btree (corporate_client_id);


--
-- Name: idx_job_extension_requests_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_extension_requests_job ON public.job_extension_requests USING btree (job_id);


--
-- Name: idx_job_extension_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_extension_requests_status ON public.job_extension_requests USING btree (status);


--
-- Name: idx_job_ng_customer_decisions_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_ng_customer_decisions_job_id ON public.job_ng_customer_decisions USING btree (job_id);


--
-- Name: idx_job_ng_customer_decisions_recorded_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_ng_customer_decisions_recorded_at ON public.job_ng_customer_decisions USING btree (recorded_at DESC);


--
-- Name: idx_job_ng_customer_decisions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_ng_customer_decisions_type ON public.job_ng_customer_decisions USING btree (decision_type);


--
-- Name: idx_job_ng_reports_job_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_ng_reports_job_id ON public.job_ng_reports USING btree (job_id);


--
-- Name: idx_job_ng_reports_reported_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_ng_reports_reported_at ON public.job_ng_reports USING btree (reported_at DESC);


--
-- Name: idx_job_ng_reports_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_ng_reports_status ON public.job_ng_reports USING btree (report_status);


--
-- Name: idx_job_tickets_assigned_tech; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_tickets_assigned_tech ON public.job_tickets USING btree (assigned_technician_id);


--
-- Name: idx_job_tickets_assigned_technician_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_tickets_assigned_technician_id ON public.job_tickets USING btree (assigned_technician_id);


--
-- Name: idx_job_tickets_corporate_challan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_tickets_corporate_challan_id ON public.job_tickets USING btree (corporate_challan_id);


--
-- Name: idx_job_tickets_corporate_client_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_tickets_corporate_client_id ON public.job_tickets USING btree (corporate_client_id);


--
-- Name: idx_job_tickets_corporate_declaration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_tickets_corporate_declaration ON public.job_tickets USING btree (corporate_declaration);


--
-- Name: idx_job_tickets_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_tickets_created_at ON public.job_tickets USING btree (created_at);


--
-- Name: idx_job_tickets_created_by_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_tickets_created_by_user_id ON public.job_tickets USING btree (created_by_user_id);


--
-- Name: idx_job_tickets_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_tickets_customer ON public.job_tickets USING btree (customer);


--
-- Name: idx_job_tickets_customer_phone_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_tickets_customer_phone_normalized ON public.job_tickets USING btree (customer_phone_normalized);


--
-- Name: idx_job_tickets_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_tickets_model ON public.job_tickets USING btree (model_number);


--
-- Name: idx_job_tickets_payment_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_tickets_payment_status ON public.job_tickets USING btree (payment_status);


--
-- Name: idx_job_tickets_serial; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_tickets_serial ON public.job_tickets USING btree (serial_number);


--
-- Name: idx_job_tickets_service_area_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_tickets_service_area_id ON public.job_tickets USING btree (service_area_id);


--
-- Name: idx_job_tickets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_tickets_status ON public.job_tickets USING btree (status);


--
-- Name: idx_job_tickets_technician; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_tickets_technician ON public.job_tickets USING btree (technician);


--
-- Name: idx_job_tickets_tv_serial_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_job_tickets_tv_serial_number ON public.job_tickets USING btree (tv_serial_number);


--
-- Name: idx_leave_app_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leave_app_dates ON public.leave_applications USING btree (start_date, end_date);


--
-- Name: idx_leave_app_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leave_app_status ON public.leave_applications USING btree (status);


--
-- Name: idx_leave_app_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leave_app_user ON public.leave_applications USING btree (user_id);


--
-- Name: idx_logistics_tasks_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logistics_tasks_date ON public.logistics_tasks USING btree (scheduled_date);


--
-- Name: idx_logistics_tasks_driver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logistics_tasks_driver ON public.logistics_tasks USING btree (assigned_driver_id);


--
-- Name: idx_logistics_tasks_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logistics_tasks_job ON public.logistics_tasks USING btree (job_ticket_id);


--
-- Name: idx_logistics_tasks_legacy_pu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logistics_tasks_legacy_pu ON public.logistics_tasks USING btree (legacy_pickup_schedule_id);


--
-- Name: idx_logistics_tasks_sr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logistics_tasks_sr ON public.logistics_tasks USING btree (service_request_id);


--
-- Name: idx_logistics_tasks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logistics_tasks_status ON public.logistics_tasks USING btree (status);


--
-- Name: idx_logistics_tasks_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logistics_tasks_type ON public.logistics_tasks USING btree (task_type);


--
-- Name: idx_manual_payments_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_manual_payments_created_at ON public.manual_payments USING btree (created_at DESC);


--
-- Name: idx_manual_payments_job_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_manual_payments_job_ticket ON public.manual_payments USING btree (job_ticket_id);


--
-- Name: idx_manual_payments_service_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_manual_payments_service_request ON public.manual_payments USING btree (service_request_id);


--
-- Name: idx_manual_payments_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_manual_payments_source ON public.manual_payments USING btree (source);


--
-- Name: idx_manual_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_manual_payments_status ON public.manual_payments USING btree (status);


--
-- Name: idx_manual_payments_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_manual_payments_transaction ON public.manual_payments USING btree (transaction_id);


--
-- Name: idx_notifications_context_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_context_type ON public.notifications USING btree (context_type);


--
-- Name: idx_notifications_corporate_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_corporate_client ON public.notifications USING btree (corporate_client_id);


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_job ON public.notifications USING btree (job_id);


--
-- Name: idx_notifications_user_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_read ON public.notifications USING btree (user_id, read);


--
-- Name: idx_offboard_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_offboard_user ON public.offboarding_cases USING btree (user_id);


--
-- Name: idx_otp_codes_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_codes_expires_at ON public.otp_codes USING btree (expires_at);


--
-- Name: idx_otp_codes_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_codes_phone ON public.otp_codes USING btree (phone);


--
-- Name: idx_payment_blacklist_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_blacklist_phone ON public.payment_blacklist USING btree (phone);


--
-- Name: idx_payroll_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payroll_month ON public.payroll_records USING btree (month);


--
-- Name: idx_payroll_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payroll_status ON public.payroll_records USING btree (status);


--
-- Name: idx_payroll_user_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payroll_user_month ON public.payroll_records USING btree (user_id, month);


--
-- Name: idx_pos_area_alloc_job_settlement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_area_alloc_job_settlement ON public.pos_transaction_area_allocations USING btree (job_ticket_id, settlement_kind);


--
-- Name: idx_pos_area_alloc_job_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_area_alloc_job_ticket_id ON public.pos_transaction_area_allocations USING btree (job_ticket_id);


--
-- Name: idx_pos_area_alloc_service_area_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_area_alloc_service_area_id ON public.pos_transaction_area_allocations USING btree (service_area_id);


--
-- Name: idx_pos_area_alloc_transaction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_area_alloc_transaction_id ON public.pos_transaction_area_allocations USING btree (transaction_id);


--
-- Name: idx_pos_transactions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_transactions_created_at ON public.pos_transactions USING btree (created_at);


--
-- Name: idx_pos_transactions_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_transactions_phone ON public.pos_transactions USING btree (customer_phone);


--
-- Name: idx_pos_transactions_service_area_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_transactions_service_area_id ON public.pos_transactions USING btree (service_area_id);


--
-- Name: idx_refund_alloc_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refund_alloc_job ON public.refund_allocations USING btree (job_ticket_id);


--
-- Name: idx_refund_alloc_refund; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refund_alloc_refund ON public.refund_allocations USING btree (refund_id);


--
-- Name: idx_refund_alloc_txn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refund_alloc_txn ON public.refund_allocations USING btree (transaction_id);


--
-- Name: idx_refunds_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refunds_created_at ON public.refunds USING btree (created_at);


--
-- Name: idx_refunds_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refunds_phone ON public.refunds USING btree (customer_phone);


--
-- Name: idx_refunds_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refunds_reference ON public.refunds USING btree (reference_id);


--
-- Name: idx_refunds_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refunds_status ON public.refunds USING btree (status);


--
-- Name: idx_refunds_target_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refunds_target_job ON public.refunds USING btree (target_job_ticket_id);


--
-- Name: idx_reminders_delivery_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminders_delivery_due ON public.reminders USING btree (remind_at, delivery_status, next_attempt_at) WHERE ((is_dismissed = false) AND (is_sent = false));


--
-- Name: idx_rqaa_service_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rqaa_service_request_id ON public.retail_quote_admin_acceptances USING btree (service_request_id);


--
-- Name: idx_salary_config_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salary_config_user ON public.staff_salary_config USING btree (user_id);


--
-- Name: idx_scheduled_backup_runs_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduled_backup_runs_due ON public.scheduled_backup_runs USING btree (status, next_attempt_at, claim_until);


--
-- Name: idx_scheduler_outbox_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scheduler_outbox_due ON public.scheduler_delivery_outbox USING btree (delivery_status, next_attempt_at, claim_until);


--
-- Name: idx_service_areas_city_area; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_areas_city_area ON public.service_areas USING btree (city, area_name);


--
-- Name: idx_service_areas_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_areas_is_active ON public.service_areas USING btree (is_active);


--
-- Name: idx_service_areas_is_public; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_areas_is_public ON public.service_areas USING btree (is_public);


--
-- Name: idx_service_requests_admin_interacted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_admin_interacted ON public.service_requests USING btree (admin_interacted);


--
-- Name: idx_service_requests_client_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_client_request_id ON public.service_requests USING btree (client_request_id) WHERE (client_request_id IS NOT NULL);


--
-- Name: idx_service_requests_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_created_at ON public.service_requests USING btree (created_at);


--
-- Name: idx_service_requests_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_customer_id ON public.service_requests USING btree (customer_id);


--
-- Name: idx_service_requests_fingerprint_window; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_fingerprint_window ON public.service_requests USING btree (idempotency_fingerprint, created_at DESC) WHERE (idempotency_fingerprint IS NOT NULL);


--
-- Name: idx_service_requests_idempotency_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_idempotency_created ON public.service_requests USING btree (idempotency_fingerprint, phone_normalized, created_at DESC) WHERE (idempotency_fingerprint IS NOT NULL);


--
-- Name: idx_service_requests_idempotency_fingerprint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_idempotency_fingerprint ON public.service_requests USING btree (idempotency_fingerprint, phone_normalized) WHERE (idempotency_fingerprint IS NOT NULL);


--
-- Name: idx_service_requests_phone_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_phone_normalized ON public.service_requests USING btree (phone_normalized);


--
-- Name: idx_service_requests_service_area_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_service_area_id ON public.service_requests USING btree (service_area_id);


--
-- Name: idx_service_requests_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_stage ON public.service_requests USING btree (stage);


--
-- Name: idx_service_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_status ON public.service_requests USING btree (status);


--
-- Name: idx_service_requests_ticket_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_ticket_number ON public.service_requests USING btree (ticket_number);


--
-- Name: idx_settlement_case; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_settlement_case ON public.final_settlement_records USING btree (offboarding_case_id);


--
-- Name: idx_staff_inv_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_inv_email ON public.staff_invitations USING btree (email);


--
-- Name: idx_staff_inv_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_inv_expires ON public.staff_invitations USING btree (expires_at);


--
-- Name: idx_staff_inv_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_inv_phone ON public.staff_invitations USING btree (phone);


--
-- Name: idx_staff_inv_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_inv_status ON public.staff_invitations USING btree (status);


--
-- Name: idx_staff_inv_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_inv_token ON public.staff_invitations USING btree (token_hash);


--
-- Name: idx_staff_reset_codes_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_reset_codes_expires ON public.staff_reset_codes USING btree (expires_at);


--
-- Name: idx_staff_reset_codes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_reset_codes_user_id ON public.staff_reset_codes USING btree (user_id);


--
-- Name: idx_struct_lines_structure; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_struct_lines_structure ON public.salary_structure_lines USING btree (structure_id);


--
-- Name: idx_trusted_devices_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trusted_devices_token_hash ON public.trusted_corporate_devices USING btree (token_hash);


--
-- Name: idx_trusted_devices_user_valid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trusted_devices_user_valid ON public.trusted_corporate_devices USING btree (user_id, revoked_at, trusted_until);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_firebase_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_firebase_uid ON public.users USING btree (firebase_uid);


--
-- Name: idx_users_google_sub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_google_sub ON public.users USING btree (google_sub);


--
-- Name: idx_users_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_phone ON public.users USING btree (phone);


--
-- Name: idx_users_phone_normalized; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_phone_normalized ON public.users USING btree (phone_normalized);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_warranty_claims_original_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warranty_claims_original_job ON public.warranty_claims USING btree (original_job_id);


--
-- Name: idx_warranty_claims_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warranty_claims_phone ON public.warranty_claims USING btree (customer_phone);


--
-- Name: idx_warranty_claims_service_area_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warranty_claims_service_area_id ON public.warranty_claims USING btree (service_area_id);


--
-- Name: idx_warranty_claims_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_warranty_claims_status ON public.warranty_claims USING btree (status);


--
-- Name: uidx_drawer_day_close_runs_day; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uidx_drawer_day_close_runs_day ON public.drawer_day_close_runs USING btree (run_day);


--
-- Name: uidx_drawer_day_close_runs_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uidx_drawer_day_close_runs_idempotency ON public.drawer_day_close_runs USING btree (idempotency_key);


--
-- Name: uidx_job_ng_customer_decisions_one_per_job; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uidx_job_ng_customer_decisions_one_per_job ON public.job_ng_customer_decisions USING btree (job_id);


--
-- Name: uidx_job_ng_customer_decisions_submission_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uidx_job_ng_customer_decisions_submission_id ON public.job_ng_customer_decisions USING btree (submission_id);


--
-- Name: uidx_job_ng_reports_one_active_per_job; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uidx_job_ng_reports_one_active_per_job ON public.job_ng_reports USING btree (job_id) WHERE (report_status = ANY (ARRAY['pending_review'::text, 'verified'::text]));


--
-- Name: uidx_job_ng_reports_submission_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uidx_job_ng_reports_submission_id ON public.job_ng_reports USING btree (submission_id);


--
-- Name: uidx_pos_txn_client_request_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uidx_pos_txn_client_request_actor ON public.pos_transactions USING btree (created_by_user_id, client_request_id) WHERE ((client_request_id IS NOT NULL) AND (created_by_user_id IS NOT NULL));


--
-- Name: uidx_scheduled_backup_runs_day; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uidx_scheduled_backup_runs_day ON public.scheduled_backup_runs USING btree (run_day);


--
-- Name: uidx_scheduled_backup_runs_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uidx_scheduled_backup_runs_idempotency ON public.scheduled_backup_runs USING btree (idempotency_key);


--
-- Name: uidx_scheduler_outbox_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uidx_scheduler_outbox_idempotency ON public.scheduler_delivery_outbox USING btree (idempotency_key);


--
-- Name: uidx_service_requests_client_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uidx_service_requests_client_request_id ON public.service_requests USING btree (client_request_id, intake_source) WHERE (client_request_id IS NOT NULL);


--
-- Name: uq_pos_area_alloc_transaction_job; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_pos_area_alloc_transaction_job ON public.pos_transaction_area_allocations USING btree (transaction_id, job_ticket_id);


--
-- Name: uq_refund_alloc_job; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_refund_alloc_job ON public.refund_allocations USING btree (refund_id, transaction_id, job_ticket_id) WHERE (job_ticket_id IS NOT NULL);


--
-- Name: uq_refund_alloc_null_job; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_refund_alloc_null_job ON public.refund_allocations USING btree (refund_id, transaction_id) WHERE (job_ticket_id IS NULL);


--
-- Name: ai_query_log ai_query_log_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_query_log
    ADD CONSTRAINT ai_query_log_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: corporate_bills corporate_bills_corporate_client_id_corporate_clients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporate_bills
    ADD CONSTRAINT corporate_bills_corporate_client_id_corporate_clients_id_fk FOREIGN KEY (corporate_client_id) REFERENCES public.corporate_clients(id);


--
-- Name: corporate_challans corporate_challans_corporate_client_id_corporate_clients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporate_challans
    ADD CONSTRAINT corporate_challans_corporate_client_id_corporate_clients_id_fk FOREIGN KEY (corporate_client_id) REFERENCES public.corporate_clients(id);


--
-- Name: corporate_message_threads corporate_message_threads_corporate_client_id_corporate_clients; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporate_message_threads
    ADD CONSTRAINT corporate_message_threads_corporate_client_id_corporate_clients FOREIGN KEY (corporate_client_id) REFERENCES public.corporate_clients(id);


--
-- Name: corporate_messages corporate_messages_thread_id_corporate_message_threads_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporate_messages
    ADD CONSTRAINT corporate_messages_thread_id_corporate_message_threads_id_fk FOREIGN KEY (thread_id) REFERENCES public.corporate_message_threads(id);


--
-- Name: corporate_password_reset_requests corporate_password_reset_requests_corporate_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporate_password_reset_requests
    ADD CONSTRAINT corporate_password_reset_requests_corporate_client_id_fkey FOREIGN KEY (corporate_client_id) REFERENCES public.corporate_clients(id) ON DELETE CASCADE;


--
-- Name: corporate_password_reset_requests corporate_password_reset_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporate_password_reset_requests
    ADD CONSTRAINT corporate_password_reset_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: corporate_portal_urgencies corporate_portal_urgencies_job_id_job_tickets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.corporate_portal_urgencies
    ADD CONSTRAINT corporate_portal_urgencies_job_id_job_tickets_id_fk FOREIGN KEY (job_id) REFERENCES public.job_tickets(id);


--
-- Name: diagnosis_training_data diagnosis_training_data_job_id_job_tickets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnosis_training_data
    ADD CONSTRAINT diagnosis_training_data_job_id_job_tickets_id_fk FOREIGN KEY (job_id) REFERENCES public.job_tickets(id);


--
-- Name: job_ng_customer_decisions fk_job_ng_customer_decisions_ng_report_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_ng_customer_decisions
    ADD CONSTRAINT fk_job_ng_customer_decisions_ng_report_id FOREIGN KEY (ng_report_id) REFERENCES public.job_ng_reports(id) ON DELETE RESTRICT;


--
-- Name: job_tickets fk_job_tickets_service_area_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_tickets
    ADD CONSTRAINT fk_job_tickets_service_area_id FOREIGN KEY (service_area_id) REFERENCES public.service_areas(id) ON DELETE RESTRICT;


--
-- Name: pos_transaction_area_allocations fk_pos_area_alloc_area_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_transaction_area_allocations
    ADD CONSTRAINT fk_pos_area_alloc_area_id FOREIGN KEY (service_area_id) REFERENCES public.service_areas(id) ON DELETE RESTRICT;


--
-- Name: pos_transaction_area_allocations fk_pos_area_alloc_job_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_transaction_area_allocations
    ADD CONSTRAINT fk_pos_area_alloc_job_id FOREIGN KEY (job_ticket_id) REFERENCES public.job_tickets(id) ON DELETE RESTRICT;


--
-- Name: pos_transaction_area_allocations fk_pos_area_alloc_transaction_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_transaction_area_allocations
    ADD CONSTRAINT fk_pos_area_alloc_transaction_id FOREIGN KEY (transaction_id) REFERENCES public.pos_transactions(id) ON DELETE RESTRICT;


--
-- Name: pos_transactions fk_pos_transactions_service_area_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_transactions
    ADD CONSTRAINT fk_pos_transactions_service_area_id FOREIGN KEY (service_area_id) REFERENCES public.service_areas(id) ON DELETE RESTRICT;


--
-- Name: refund_allocations fk_refund_alloc_job; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refund_allocations
    ADD CONSTRAINT fk_refund_alloc_job FOREIGN KEY (job_ticket_id) REFERENCES public.job_tickets(id) ON DELETE RESTRICT;


--
-- Name: refund_allocations fk_refund_alloc_refund; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refund_allocations
    ADD CONSTRAINT fk_refund_alloc_refund FOREIGN KEY (refund_id) REFERENCES public.refunds(id) ON DELETE RESTRICT;


--
-- Name: refund_allocations fk_refund_alloc_txn; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refund_allocations
    ADD CONSTRAINT fk_refund_alloc_txn FOREIGN KEY (transaction_id) REFERENCES public.pos_transactions(id) ON DELETE RESTRICT;


--
-- Name: refunds fk_refunds_target_job; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT fk_refunds_target_job FOREIGN KEY (target_job_ticket_id) REFERENCES public.job_tickets(id) ON DELETE RESTRICT;


--
-- Name: retail_quote_admin_acceptances fk_rqaa_service_request; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retail_quote_admin_acceptances
    ADD CONSTRAINT fk_rqaa_service_request FOREIGN KEY (service_request_id) REFERENCES public.service_requests(id) ON DELETE CASCADE;


--
-- Name: service_requests fk_service_requests_service_area_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT fk_service_requests_service_area_id FOREIGN KEY (service_area_id) REFERENCES public.service_areas(id) ON DELETE RESTRICT;


--
-- Name: warranty_claims fk_warranty_claims_service_area_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warranty_claims
    ADD CONSTRAINT fk_warranty_claims_service_area_id FOREIGN KEY (service_area_id) REFERENCES public.service_areas(id) ON DELETE RESTRICT;


--
-- Name: inventory_serials inventory_serials_inventory_item_id_inventory_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_serials
    ADD CONSTRAINT inventory_serials_inventory_item_id_inventory_items_id_fk FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);


--
-- Name: job_batches job_batches_corporate_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_batches
    ADD CONSTRAINT job_batches_corporate_client_id_fkey FOREIGN KEY (corporate_client_id) REFERENCES public.corporate_clients(id);


--
-- Name: job_extension_requests job_extension_requests_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_extension_requests
    ADD CONSTRAINT job_extension_requests_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.job_batches(id) ON DELETE SET NULL;


--
-- Name: job_extension_requests job_extension_requests_corporate_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_extension_requests
    ADD CONSTRAINT job_extension_requests_corporate_client_id_fkey FOREIGN KEY (corporate_client_id) REFERENCES public.corporate_clients(id) ON DELETE CASCADE;


--
-- Name: job_extension_requests job_extension_requests_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_extension_requests
    ADD CONSTRAINT job_extension_requests_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.job_tickets(id) ON DELETE CASCADE;


--
-- Name: job_ng_reports job_ng_reports_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_ng_reports
    ADD CONSTRAINT job_ng_reports_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.job_tickets(id) ON DELETE RESTRICT;


--
-- Name: notifications notifications_corporate_client_id_corporate_clients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_corporate_client_id_corporate_clients_id_fk FOREIGN KEY (corporate_client_id) REFERENCES public.corporate_clients(id);


--
-- Name: notifications notifications_job_id_job_tickets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_job_id_job_tickets_id_fk FOREIGN KEY (job_id) REFERENCES public.job_tickets(id);


--
-- Name: petty_cash_records petty_cash_records_drawer_session_id_drawer_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.petty_cash_records
    ADD CONSTRAINT petty_cash_records_drawer_session_id_drawer_sessions_id_fk FOREIGN KEY (drawer_session_id) REFERENCES public.drawer_sessions(id);


--
-- Name: pos_transactions pos_transactions_drawer_session_id_drawer_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_transactions
    ADD CONSTRAINT pos_transactions_drawer_session_id_drawer_sessions_id_fk FOREIGN KEY (drawer_session_id) REFERENCES public.drawer_sessions(id);


--
-- Name: purchase_order_items purchase_order_items_inventory_item_id_inventory_items_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_inventory_item_id_inventory_items_id_fk FOREIGN KEY (inventory_item_id) REFERENCES public.inventory_items(id);


--
-- Name: purchase_order_items purchase_order_items_purchase_order_id_purchase_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_purchase_order_id_purchase_orders_id_fk FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: rollback_requests rollback_requests_job_ticket_id_job_tickets_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rollback_requests
    ADD CONSTRAINT rollback_requests_job_ticket_id_job_tickets_id_fk FOREIGN KEY (job_ticket_id) REFERENCES public.job_tickets(id);


--
-- Name: service_requests service_requests_corporate_challan_id_challans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_corporate_challan_id_challans_id_fk FOREIGN KEY (corporate_challan_id) REFERENCES public.challans(id);


--
-- Name: service_requests service_requests_corporate_client_id_corporate_clients_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_corporate_client_id_corporate_clients_id_fk FOREIGN KEY (corporate_client_id) REFERENCES public.corporate_clients(id);


--
-- Name: spare_part_orders spare_part_orders_order_id_orders_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spare_part_orders
    ADD CONSTRAINT spare_part_orders_order_id_orders_id_fk FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- Name: trusted_corporate_devices trusted_corporate_devices_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trusted_corporate_devices
    ADD CONSTRAINT trusted_corporate_devices_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--
