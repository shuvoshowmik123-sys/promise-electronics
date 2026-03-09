CREATE TABLE "ai_debug_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"error" text NOT NULL,
	"stack_trace" text,
	"suggestion" text,
	"status" text DEFAULT 'NEEDS_REVIEW',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"actionable_step" text,
	"category" text,
	"severity" text,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_query_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"query_type" text,
	"was_successful" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"requested_by" text NOT NULL,
	"requested_by_name" text,
	"job_id" text,
	"job_number" text,
	"old_value" text,
	"new_value" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"user_role" text NOT NULL,
	"check_in_time" timestamp DEFAULT now() NOT NULL,
	"check_out_time" timestamp,
	"date" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"details" text,
	"metadata" jsonb,
	"changes" jsonb,
	"severity" text DEFAULT 'info',
	"store_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backup_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"action" text NOT NULL,
	"backup_id" text,
	"backup_name" text,
	"ip_address" text,
	"user_agent" text,
	"success" boolean NOT NULL,
	"error_message" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "backup_metadata" (
	"id" text PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"google_drive_file_id" text NOT NULL,
	"backup_type" text NOT NULL,
	"schedule_id" text,
	"description" text,
	"encryption_version" text NOT NULL,
	"salt" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"iterations" integer NOT NULL,
	"total_records" integer NOT NULL,
	"tables_included" jsonb NOT NULL,
	"checksum" text NOT NULL,
	"system_version" text NOT NULL,
	"database_version" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"verified" boolean DEFAULT false,
	"last_verified_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "backup_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"cron_expression" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"retention_days" integer NOT NULL,
	"notify_on_success" boolean DEFAULT true,
	"notify_on_failure" boolean DEFAULT true,
	"last_run" timestamp,
	"next_run" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bonus_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"bonus_type" text NOT NULL,
	"year" integer NOT NULL,
	"full_bonus_amount" real NOT NULL,
	"unapproved_absences" integer NOT NULL,
	"deduction_percent" real NOT NULL,
	"deduction_amount" real NOT NULL,
	"final_bonus_amount" real NOT NULL,
	"status" text DEFAULT 'calculated' NOT NULL,
	"approved_by" text,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challans" (
	"id" text PRIMARY KEY NOT NULL,
	"receiver" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"items" integer DEFAULT 1 NOT NULL,
	"line_items" text,
	"receiver_address" text,
	"receiver_phone" text,
	"vehicle_no" text,
	"driver_name" text,
	"driver_phone" text,
	"gate_pass_no" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"delivered_at" timestamp,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "corporate_bills" (
	"id" text PRIMARY KEY NOT NULL,
	"bill_number" text,
	"corporate_client_id" text,
	"billing_period_start" timestamp,
	"billing_period_end" timestamp,
	"line_items" jsonb,
	"subtotal" real NOT NULL,
	"discount" real DEFAULT 0,
	"vat_amount" real DEFAULT 0,
	"grand_total" real NOT NULL,
	"payment_status" text DEFAULT 'unpaid',
	"paid_amount" real DEFAULT 0,
	"due_date" timestamp,
	"paid_date" timestamp,
	"due_record_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "corporate_bills_bill_number_unique" UNIQUE("bill_number")
);
--> statement-breakpoint
CREATE TABLE "corporate_challans" (
	"id" text PRIMARY KEY NOT NULL,
	"challan_number" text,
	"type" text NOT NULL,
	"corporate_client_id" text,
	"items" jsonb,
	"total_items" integer NOT NULL,
	"received_date" timestamp,
	"returned_date" timestamp,
	"receiver_name" text,
	"receiver_phone" text,
	"receiver_signature" text,
	"status" text DEFAULT 'received' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "corporate_challans_challan_number_unique" UNIQUE("challan_number")
);
--> statement-breakpoint
CREATE TABLE "corporate_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"company_name" text NOT NULL,
	"short_code" text NOT NULL,
	"pricing_type" text DEFAULT 'standard',
	"custom_pricing" jsonb,
	"discount_percentage" real DEFAULT 0,
	"billing_cycle" text DEFAULT 'monthly',
	"payment_terms" integer DEFAULT 30,
	"default_sla_hours" integer DEFAULT 48,
	"outstanding_balance" real DEFAULT 0,
	"parent_client_id" text,
	"branch_name" text,
	"contact_person" text,
	"contact_phone" text,
	"address" text,
	"phone" text,
	"portal_username" text,
	"portal_password_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "corporate_clients_short_code_unique" UNIQUE("short_code"),
	CONSTRAINT "corporate_clients_portal_username_unique" UNIQUE("portal_username")
);
--> statement-breakpoint
CREATE TABLE "corporate_message_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"corporate_client_id" text NOT NULL,
	"subject" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "corporate_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"sender_type" text NOT NULL,
	"message_type" text DEFAULT 'text' NOT NULL,
	"content" text,
	"attachments" jsonb,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corporate_portal_urgencies" (
	"id" text PRIMARY KEY NOT NULL,
	"corp_client_id" text NOT NULL,
	"job_id" text,
	"reason" text NOT NULL,
	"urgency_level" text NOT NULL,
	"status" text DEFAULT 'pending',
	"requested_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"label" text NOT NULL,
	"address" text NOT NULL,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"rating" integer NOT NULL,
	"title" text,
	"content" text NOT NULL,
	"is_approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deduction_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"payroll_record_id" text,
	"month" text NOT NULL,
	"proposal_type" text NOT NULL,
	"description" text NOT NULL,
	"calculated_amount" real NOT NULL,
	"supporting_data_json" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_amount" real,
	"admin_notes" text,
	"decided_by" text,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"platform" text DEFAULT 'android' NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "device_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "diagnosis_training_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" text,
	"customer_chat_summary" text,
	"ai_prediction" text,
	"actual_issue" text,
	"was_accurate" boolean,
	"feedback_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drawer_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"opened_by" text NOT NULL,
	"opened_by_name" text NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"starting_float" real NOT NULL,
	"expected_cash" real,
	"declared_cash" real,
	"discrepancy" real,
	"status" text DEFAULT 'open' NOT NULL,
	"closed_by" text,
	"closed_by_name" text,
	"closed_at" timestamp,
	"notes" text,
	"store_id" text
);
--> statement-breakpoint
CREATE TABLE "due_records" (
	"id" text PRIMARY KEY NOT NULL,
	"customer" text NOT NULL,
	"amount" real NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"invoice" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"due_date" timestamp NOT NULL,
	"paid_at" timestamp,
	"paid_amount" real DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "employee_salary_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"employment_profile_id" text NOT NULL,
	"structure_id" text NOT NULL,
	"base_amount" real NOT NULL,
	"hra_amount" real,
	"medical_amount" real,
	"conveyance_amount" real,
	"other_amount" real DEFAULT 0,
	"income_tax_percent" real DEFAULT 0,
	"currency" text DEFAULT 'BDT' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"change_reason" text DEFAULT 'new_hire' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employment_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"employee_code" text,
	"employment_type" text DEFAULT 'full_time' NOT NULL,
	"payroll_eligible" boolean DEFAULT true NOT NULL,
	"employment_status" text DEFAULT 'active' NOT NULL,
	"join_date" date,
	"notice_period_days" integer DEFAULT 30,
	"resignation_date" date,
	"last_working_date" date,
	"separation_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "employment_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "employment_profiles_employee_code_unique" UNIQUE("employee_code")
);
--> statement-breakpoint
CREATE TABLE "final_settlement_records" (
	"id" text PRIMARY KEY NOT NULL,
	"offboarding_case_id" text NOT NULL,
	"user_id" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"gross_total" real NOT NULL,
	"deduction_total" real NOT NULL,
	"net_total" real NOT NULL,
	"component_breakdown_json" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fraud_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"alert_type" text NOT NULL,
	"severity" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"description" text,
	"rule_triggered" text,
	"status" text DEFAULT 'open' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" text
);
--> statement-breakpoint
CREATE TABLE "fraud_blocklist" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"value" text NOT NULL,
	"reason" text,
	"blocked_by" text,
	"blocked_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "holiday_calendar" (
	"id" text PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"date" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"dismissed_reason" text,
	"forced_reason" text,
	"modified_by" text,
	"modified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "increment_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"current_assignment_id" text NOT NULL,
	"current_base_amount" real NOT NULL,
	"suggested_base_amount" real NOT NULL,
	"suggested_increase_percent" real NOT NULL,
	"suggestion_reason" text NOT NULL,
	"reasoning_json" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_decision_amount" real,
	"admin_notes" text,
	"decided_by" text,
	"decided_at" timestamp,
	"effective_from" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"reply" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"item_type" text DEFAULT 'product' NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"price" real NOT NULL,
	"min_price" real,
	"max_price" real,
	"status" text DEFAULT 'In Stock' NOT NULL,
	"low_stock_threshold" integer DEFAULT 5,
	"images" text,
	"show_on_website" boolean DEFAULT false,
	"show_on_android_app" boolean DEFAULT true,
	"show_on_hot_deals" boolean DEFAULT false,
	"hot_deal_price" real,
	"icon" text,
	"estimated_days" text,
	"display_order" integer DEFAULT 0,
	"features" text,
	"is_spare_part" boolean DEFAULT false,
	"store_id" text,
	"is_serialized" boolean DEFAULT false,
	"reorder_quantity" integer,
	"preferred_supplier" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_serials" (
	"id" text PRIMARY KEY NOT NULL,
	"inventory_item_id" text NOT NULL,
	"serial_number" text NOT NULL,
	"status" text DEFAULT 'In Stock' NOT NULL,
	"job_ticket_id" text,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"consumed_at" timestamp,
	"notes" text,
	"store_id" text
);
--> statement-breakpoint
CREATE TABLE "job_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"customer" text,
	"customer_phone" text,
	"customer_phone_normalized" text,
	"customer_address" text,
	"device" text,
	"tv_serial_number" text,
	"issue" text,
	"status" text DEFAULT 'Pending' NOT NULL,
	"technician" text,
	"priority" text,
	"assisted_by" text,
	"screen_size" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"deadline" timestamp,
	"sla_deadline" timestamp,
	"notes" text,
	"ai_diagnosis" jsonb,
	"estimated_cost" real,
	"assigned_technician_id" text,
	"corporate_challan_id" text,
	"corporate_job_number" text,
	"corporate_client_id" text,
	"job_type" text DEFAULT 'standard',
	"parent_job_id" text,
	"charges" jsonb,
	"warranty_notes" text,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"payment_id" text,
	"paid_amount" real DEFAULT 0,
	"remaining_amount" real DEFAULT 0,
	"paid_at" timestamp,
	"last_payment_at" timestamp,
	"billing_status" text DEFAULT 'pending' NOT NULL,
	"invoice_printed_at" timestamp,
	"initial_status" text,
	"reported_defect" text,
	"problem_found" text,
	"corporate_bill_id" text,
	"invoice_printed_by" text,
	"invoice_print_count" integer DEFAULT 0,
	"write_off_reason" text,
	"write_off_by" text,
	"write_off_at" timestamp,
	"assisted_by_ids" text DEFAULT '[]',
	"assisted_by_names" text,
	"service_lines" text,
	"product_lines" text,
	"warranty_days" integer DEFAULT 30,
	"grace_period_days" integer DEFAULT 7,
	"warranty_expiry_date" timestamp,
	"warranty_terms_accepted" boolean DEFAULT false,
	"store_id" text
);
--> statement-breakpoint
CREATE TABLE "leave_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"user_role" text NOT NULL,
	"leave_type" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"total_days" integer NOT NULL,
	"reason" text NOT NULL,
	"medical_certificate_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"job_ticket_id" text NOT NULL,
	"part_name" text NOT NULL,
	"supplier_name" text,
	"cost_price" real NOT NULL,
	"selling_price" real NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"receipt_image_url" text,
	"purchased_by" text NOT NULL,
	"status" text DEFAULT 'Consumed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"store_id" text
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text DEFAULT 'info' NOT NULL,
	"link" text,
	"read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"corporate_client_id" text,
	"job_id" text,
	"context_type" text DEFAULT 'corporate'
);
--> statement-breakpoint
CREATE TABLE "offboarding_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"employment_profile_id" text NOT NULL,
	"offboarding_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"notice_served_days" integer DEFAULT 0,
	"last_working_date" date,
	"settlement_due_date" date,
	"approved_by" text,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"product_id" text NOT NULL,
	"product_name" text NOT NULL,
	"variant_id" text,
	"variant_name" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"price" real NOT NULL,
	"total" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"order_number" text,
	"customer_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_address" text NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"payment_method" text DEFAULT 'COD' NOT NULL,
	"subtotal" real NOT NULL,
	"total" real NOT NULL,
	"decline_reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"purpose" text DEFAULT 'request_verification' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"verified_at" timestamp,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text NOT NULL,
	"month" text NOT NULL,
	"assignment_id" text,
	"run_type" text DEFAULT 'regular' NOT NULL,
	"calc_snapshot_json" text,
	"calc_hash" text,
	"is_locked" boolean DEFAULT false NOT NULL,
	"user_role" text,
	"total_working_days" integer NOT NULL,
	"days_present" integer NOT NULL,
	"days_absent" integer NOT NULL,
	"days_late" integer NOT NULL,
	"consecutive_late_penalties" integer DEFAULT 0,
	"approved_leaves" integer NOT NULL,
	"unapproved_absences" integer NOT NULL,
	"total_overtime_hours" real DEFAULT 0,
	"basic_salary" real NOT NULL,
	"house_rent_allowance" real NOT NULL,
	"medical_allowance" real NOT NULL,
	"conveyance_allowance" real NOT NULL,
	"other_allowances" real DEFAULT 0,
	"overtime_pay" real DEFAULT 0,
	"gross_salary" real NOT NULL,
	"absent_deduction" real NOT NULL,
	"late_deduction" real DEFAULT 0,
	"income_tax" real DEFAULT 0,
	"other_deductions" real DEFAULT 0,
	"deduction_approved" boolean DEFAULT false,
	"deduction_approved_by" text,
	"deduction_approved_at" timestamp,
	"total_deductions" real NOT NULL,
	"net_salary" real NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"generated_by" text,
	"cleared_by" text,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "petty_cash_records" (
	"id" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"amount" real NOT NULL,
	"type" text NOT NULL,
	"due_record_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"drawer_session_id" text
);
--> statement-breakpoint
CREATE TABLE "pickup_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"service_request_id" text NOT NULL,
	"tier" text DEFAULT 'Regular' NOT NULL,
	"tier_cost" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"scheduled_date" timestamp,
	"pickup_address" text,
	"assigned_staff" text,
	"pickup_notes" text,
	"pickup_proof_url" text,
	"picked_up_at" timestamp,
	"delivered_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"is_published_app" boolean DEFAULT true NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "policies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "pos_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_number" text,
	"customer" text,
	"customer_phone" text,
	"customer_address" text,
	"items" text NOT NULL,
	"linked_jobs" text,
	"subtotal" real NOT NULL,
	"tax" real NOT NULL,
	"tax_rate" real DEFAULT 5,
	"discount" real DEFAULT 0,
	"total" real NOT NULL,
	"payment_method" text NOT NULL,
	"payment_status" text DEFAULT 'Paid' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"drawer_session_id" text,
	CONSTRAINT "pos_transactions_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"variant_name" text NOT NULL,
	"price" real NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"sku" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"price" text NOT NULL,
	"category" text NOT NULL,
	"image" text NOT NULL,
	"rating" real DEFAULT 0,
	"reviews" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"purchase_order_id" text NOT NULL,
	"inventory_item_id" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"supplier_name" text NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"total_amount" real DEFAULT 0 NOT NULL,
	"expected_delivery_date" timestamp,
	"notes" text,
	"store_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"reference_id" text NOT NULL,
	"reference_invoice" text,
	"customer" text NOT NULL,
	"customer_phone" text,
	"original_amount" real NOT NULL,
	"refund_amount" real NOT NULL,
	"refund_method" text,
	"reason" text NOT NULL,
	"requested_by" text NOT NULL,
	"requested_by_name" text NOT NULL,
	"requested_by_role" text NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"approved_by" text,
	"approved_by_name" text,
	"approved_by_role" text,
	"approved_at" timestamp,
	"processed_by" text,
	"processed_by_name" text,
	"processed_by_role" text,
	"processed_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"cancellation_reason" text,
	"notes" text,
	"petty_cash_record_id" text,
	"fraud_alert_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rollback_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_ticket_id" text,
	"requested_by" text NOT NULL,
	"reason" text NOT NULL,
	"target_status" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_by" text,
	"store_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_components" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"component_type" text DEFAULT 'earning' NOT NULL,
	"calc_mode" text DEFAULT 'fixed' NOT NULL,
	"default_percent" real,
	"is_proratable" boolean DEFAULT true NOT NULL,
	"is_taxable" boolean DEFAULT true NOT NULL,
	"applies_to" text DEFAULT 'both' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "salary_components_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "salary_structure_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"structure_id" text NOT NULL,
	"component_id" text NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"is_mandatory" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_structures" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "salary_structures_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "service_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"min_price" real NOT NULL,
	"max_price" real NOT NULL,
	"estimated_days" text,
	"icon" text,
	"is_active" boolean DEFAULT true,
	"display_order" integer DEFAULT 0,
	"features" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "service_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "service_request_events" (
	"id" text PRIMARY KEY NOT NULL,
	"service_request_id" text NOT NULL,
	"status" text NOT NULL,
	"message" text,
	"actor" text,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_number" text,
	"customer_id" text,
	"brand" text NOT NULL,
	"screen_size" text,
	"model_number" text,
	"primary_issue" text NOT NULL,
	"symptoms" text,
	"description" text,
	"media_urls" text,
	"customer_name" text NOT NULL,
	"phone" text NOT NULL,
	"address" text,
	"service_preference" text,
	"status" text DEFAULT 'Pending' NOT NULL,
	"tracking_status" text DEFAULT 'Request Received' NOT NULL,
	"estimated_delivery" timestamp,
	"payment_status" text DEFAULT 'Due',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"converted_job_id" text,
	"request_intent" text,
	"service_mode" text,
	"stage" text DEFAULT 'intake',
	"is_quote" boolean DEFAULT false,
	"service_id" text,
	"quote_status" text,
	"quote_amount" real,
	"quote_notes" text,
	"quoted_at" timestamp,
	"quote_expires_at" timestamp,
	"accepted_at" timestamp,
	"pickup_tier" text,
	"pickup_cost" real,
	"total_amount" real,
	"scheduled_pickup_date" timestamp,
	"expected_pickup_date" timestamp,
	"expected_return_date" timestamp,
	"expected_ready_date" timestamp,
	"intake_location" jsonb,
	"physical_condition" text,
	"customer_signature_url" text,
	"proof_of_purchase" text,
	"warranty_status" text,
	"agreed_to_pickup" boolean DEFAULT false,
	"pickup_agreed_at" timestamp,
	"store_id" text,
	"corporate_client_id" text,
	"corporate_challan_id" text,
	CONSTRAINT "service_requests_ticket_number_unique" UNIQUE("ticket_number")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "spare_part_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"brand" text NOT NULL,
	"screen_size" text,
	"model_number" text,
	"primary_issue" text,
	"symptoms" text,
	"description" text,
	"images" text,
	"fulfillment_type" text NOT NULL,
	"pickup_tier" text,
	"pickup_address" text,
	"scheduled_date" timestamp,
	"verification_status" text DEFAULT 'pending',
	"is_compatible" boolean,
	"quoted_service_charge" real,
	"quoted_at" timestamp,
	"quote_accepted" boolean,
	"quote_accepted_at" timestamp,
	"token_number" text,
	"token_expires_at" timestamp,
	"token_status" text DEFAULT 'pending',
	"token_redeemed_at" timestamp,
	"technician_id" text,
	"installation_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "spare_part_orders_token_number_unique" UNIQUE("token_number")
);
--> statement-breakpoint
CREATE TABLE "staff_salary_config" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"basic_salary" real NOT NULL,
	"house_rent_allowance" real,
	"medical_allowance" real,
	"conveyance_allowance" real,
	"other_allowances" real DEFAULT 0,
	"income_tax_percent" real DEFAULT 0,
	"casual_leave_balance" integer DEFAULT 10,
	"sick_leave_balance" integer DEFAULT 14,
	"earned_leave_balance" real DEFAULT 0,
	"last_increment_date" timestamp,
	"increment_blocked_reason" text,
	"effective_from" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "staff_salary_config_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "system_modules" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'general' NOT NULL,
	"enabled_admin" boolean DEFAULT true NOT NULL,
	"enabled_customer" boolean DEFAULT false NOT NULL,
	"enabled_corporate" boolean DEFAULT false NOT NULL,
	"enabled_technician" boolean DEFAULT false NOT NULL,
	"is_core" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0,
	"icon" text,
	"dependencies" text DEFAULT '[]',
	"portal_scope" text DEFAULT 'admin',
	"offline_capability" text DEFAULT 'locked',
	"toggled_by" text,
	"toggled_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trusted_corporate_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	"trusted_until" timestamp NOT NULL,
	"revoked_at" timestamp,
	"revoked_reason" text,
	CONSTRAINT "trusted_corporate_devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"sid" text PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp (6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"phone_normalized" text,
	"password" text NOT NULL,
	"role" text DEFAULT 'Customer' NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"permissions" text DEFAULT '{}' NOT NULL,
	"skills" text,
	"seniority_level" text DEFAULT 'Junior',
	"performance_score" real DEFAULT 0,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"last_login" timestamp,
	"google_sub" text,
	"store_id" text,
	"address" text,
	"profile_image_url" text,
	"avatar" text,
	"is_verified" boolean DEFAULT false,
	"preferences" text DEFAULT '{}',
	"corporate_client_id" text,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
CREATE TABLE "warranty_claims" (
	"id" text PRIMARY KEY NOT NULL,
	"original_job_id" text NOT NULL,
	"new_job_id" text,
	"customer" text NOT NULL,
	"customer_phone" text,
	"device" text,
	"claim_type" text NOT NULL,
	"claim_reason" text NOT NULL,
	"warranty_valid" boolean NOT NULL,
	"warranty_expiry_date" timestamp,
	"claimed_by" text NOT NULL,
	"claimed_by_name" text NOT NULL,
	"claimed_by_role" text NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	"approved_by" text,
	"approved_by_name" text,
	"approved_by_role" text,
	"approved_at" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "wastage_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"inventory_item_id" text NOT NULL,
	"serial_id" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"reason" text NOT NULL,
	"job_ticket_id" text,
	"financial_loss" real,
	"reported_by" text NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"store_id" text
);
--> statement-breakpoint
ALTER TABLE "ai_query_log" ADD CONSTRAINT "ai_query_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_bills" ADD CONSTRAINT "corporate_bills_corporate_client_id_corporate_clients_id_fk" FOREIGN KEY ("corporate_client_id") REFERENCES "public"."corporate_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_challans" ADD CONSTRAINT "corporate_challans_corporate_client_id_corporate_clients_id_fk" FOREIGN KEY ("corporate_client_id") REFERENCES "public"."corporate_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_message_threads" ADD CONSTRAINT "corporate_message_threads_corporate_client_id_corporate_clients_id_fk" FOREIGN KEY ("corporate_client_id") REFERENCES "public"."corporate_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_messages" ADD CONSTRAINT "corporate_messages_thread_id_corporate_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."corporate_message_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_portal_urgencies" ADD CONSTRAINT "corporate_portal_urgencies_job_id_job_tickets_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnosis_training_data" ADD CONSTRAINT "diagnosis_training_data_job_id_job_tickets_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_serials" ADD CONSTRAINT "inventory_serials_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_corporate_client_id_corporate_clients_id_fk" FOREIGN KEY ("corporate_client_id") REFERENCES "public"."corporate_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_job_id_job_tickets_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petty_cash_records" ADD CONSTRAINT "petty_cash_records_drawer_session_id_drawer_sessions_id_fk" FOREIGN KEY ("drawer_session_id") REFERENCES "public"."drawer_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pos_transactions" ADD CONSTRAINT "pos_transactions_drawer_session_id_drawer_sessions_id_fk" FOREIGN KEY ("drawer_session_id") REFERENCES "public"."drawer_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollback_requests" ADD CONSTRAINT "rollback_requests_job_ticket_id_job_tickets_id_fk" FOREIGN KEY ("job_ticket_id") REFERENCES "public"."job_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_corporate_client_id_corporate_clients_id_fk" FOREIGN KEY ("corporate_client_id") REFERENCES "public"."corporate_clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_corporate_challan_id_challans_id_fk" FOREIGN KEY ("corporate_challan_id") REFERENCES "public"."challans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spare_part_orders" ADD CONSTRAINT "spare_part_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_corporate_devices" ADD CONSTRAINT "trusted_corporate_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_approval_requests_status" ON "approval_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_approval_requests_type" ON "approval_requests" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_attendance_user_date" ON "attendance_records" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "idx_bonus_user_year" ON "bonus_records" USING btree ("user_id","year");--> statement-breakpoint
CREATE INDEX "idx_bonus_type" ON "bonus_records" USING btree ("bonus_type");--> statement-breakpoint
CREATE INDEX "idx_challans_status" ON "challans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_challans_type" ON "challans" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_challans_created_at" ON "challans" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_corporate_bills_client_id" ON "corporate_bills" USING btree ("corporate_client_id");--> statement-breakpoint
CREATE INDEX "idx_corporate_bills_payment_status" ON "corporate_bills" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "idx_corporate_challans_client_id" ON "corporate_challans" USING btree ("corporate_client_id");--> statement-breakpoint
CREATE INDEX "idx_corporate_challans_type" ON "corporate_challans" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_corporate_challans_status" ON "corporate_challans" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_corporate_threads_client" ON "corporate_message_threads" USING btree ("corporate_client_id");--> statement-breakpoint
CREATE INDEX "idx_corporate_threads_status" ON "corporate_message_threads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_corporate_messages_thread" ON "corporate_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "idx_corporate_messages_read" ON "corporate_messages" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "idx_corporate_messages_created" ON "corporate_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_deduct_prop_user" ON "deduction_proposals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_deduct_prop_month" ON "deduction_proposals" USING btree ("month");--> statement-breakpoint
CREATE INDEX "idx_deduct_prop_status" ON "deduction_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_assign_user" ON "employee_salary_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_assign_effective" ON "employee_salary_assignments" USING btree ("user_id","effective_from","effective_to");--> statement-breakpoint
CREATE INDEX "idx_emp_profile_user" ON "employment_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_emp_profile_status" ON "employment_profiles" USING btree ("employment_status");--> statement-breakpoint
CREATE INDEX "idx_settlement_case" ON "final_settlement_records" USING btree ("offboarding_case_id");--> statement-breakpoint
CREATE INDEX "idx_fraud_blocklist_type_value" ON "fraud_blocklist" USING btree ("type","value");--> statement-breakpoint
CREATE INDEX "idx_holiday_year_date" ON "holiday_calendar" USING btree ("year","date");--> statement-breakpoint
CREATE INDEX "idx_holiday_year" ON "holiday_calendar" USING btree ("year");--> statement-breakpoint
CREATE INDEX "idx_holiday_status" ON "holiday_calendar" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_incr_sugg_user" ON "increment_suggestions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_incr_sugg_status" ON "increment_suggestions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_inventory_category" ON "inventory_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_inventory_show_on_website" ON "inventory_items" USING btree ("show_on_website");--> statement-breakpoint
CREATE INDEX "idx_inventory_status" ON "inventory_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_job_tickets_status" ON "job_tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_job_tickets_customer" ON "job_tickets" USING btree ("customer");--> statement-breakpoint
CREATE INDEX "idx_job_tickets_customer_phone_normalized" ON "job_tickets" USING btree ("customer_phone_normalized");--> statement-breakpoint
CREATE INDEX "idx_job_tickets_technician" ON "job_tickets" USING btree ("technician");--> statement-breakpoint
CREATE INDEX "idx_job_tickets_created_at" ON "job_tickets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_job_tickets_corporate_challan_id" ON "job_tickets" USING btree ("corporate_challan_id");--> statement-breakpoint
CREATE INDEX "idx_job_tickets_corporate_client_id" ON "job_tickets" USING btree ("corporate_client_id");--> statement-breakpoint
CREATE INDEX "idx_job_tickets_payment_status" ON "job_tickets" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "idx_leave_app_user" ON "leave_applications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_leave_app_status" ON "leave_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_leave_app_dates" ON "leave_applications" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "idx_notifications_corporate_client" ON "notifications" USING btree ("corporate_client_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_job" ON "notifications" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_context_type" ON "notifications" USING btree ("context_type");--> statement-breakpoint
CREATE INDEX "idx_offboard_user" ON "offboarding_cases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_otp_codes_phone" ON "otp_codes" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "idx_otp_codes_expires_at" ON "otp_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_payroll_user_month" ON "payroll_records" USING btree ("user_id","month");--> statement-breakpoint
CREATE INDEX "idx_payroll_status" ON "payroll_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_payroll_month" ON "payroll_records" USING btree ("month");--> statement-breakpoint
CREATE INDEX "idx_pos_transactions_phone" ON "pos_transactions" USING btree ("customer_phone");--> statement-breakpoint
CREATE INDEX "idx_pos_transactions_created_at" ON "pos_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_refunds_reference" ON "refunds" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "idx_refunds_status" ON "refunds" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_refunds_phone" ON "refunds" USING btree ("customer_phone");--> statement-breakpoint
CREATE INDEX "idx_refunds_created_at" ON "refunds" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_struct_lines_structure" ON "salary_structure_lines" USING btree ("structure_id");--> statement-breakpoint
CREATE INDEX "idx_service_requests_customer_id" ON "service_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_service_requests_status" ON "service_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_service_requests_stage" ON "service_requests" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "idx_service_requests_ticket_number" ON "service_requests" USING btree ("ticket_number");--> statement-breakpoint
CREATE INDEX "idx_service_requests_created_at" ON "service_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_salary_config_user" ON "staff_salary_config" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_trusted_devices_token_hash" ON "trusted_corporate_devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_trusted_devices_user_valid" ON "trusted_corporate_devices" USING btree ("user_id","revoked_at","trusted_until");--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_phone" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "idx_users_phone_normalized" ON "users" USING btree ("phone_normalized");--> statement-breakpoint
CREATE INDEX "idx_users_google_sub" ON "users" USING btree ("google_sub");--> statement-breakpoint
CREATE INDEX "idx_warranty_claims_original_job" ON "warranty_claims" USING btree ("original_job_id");--> statement-breakpoint
CREATE INDEX "idx_warranty_claims_status" ON "warranty_claims" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_warranty_claims_phone" ON "warranty_claims" USING btree ("customer_phone");