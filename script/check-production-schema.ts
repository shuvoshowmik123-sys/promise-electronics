import { sql } from "drizzle-orm";
import { db, pool } from "../server/db.js";

const EXPECTED_COLUMNS: Record<string, string[]> = {
    users: [
        "id",
        "username",
        "name",
        "email",
        "phone",
        "phone_normalized",
        "password",
        "role",
        "status",
        "permissions",
        "skills",
        "seniority_level",
        "performance_score",
        "joined_at",
        "last_login",
        "google_sub",
        "store_id",
        "address",
        "profile_image_url",
        "avatar",
        "is_verified",
        "preferences",
        "corporate_client_id",
        "default_work_location_id",
    ],
    job_tickets: [
        "id",
        "customer",
        "customer_phone",
        "customer_phone_normalized",
        "customer_address",
        "device",
        "tv_serial_number",
        "issue",
        "status",
        "technician",
        "priority",
        "assisted_by",
        "screen_size",
        "created_at",
        "completed_at",
        "deadline",
        "sla_deadline",
        "notes",
        "received_accessories",
        "ai_diagnosis",
        "estimated_cost",
        "assigned_technician_id",
        "corporate_challan_id",
        "corporate_job_number",
        "corporate_client_id",
        "job_type",
        "parent_job_id",
        "charges",
        "warranty_notes",
        "payment_status",
        "payment_id",
        "paid_amount",
        "remaining_amount",
        "paid_at",
        "last_payment_at",
        "billing_status",
        "invoice_printed_at",
        "initial_status",
        "reported_defect",
        "problem_found",
        "corporate_bill_id",
        "invoice_printed_by",
        "invoice_print_count",
        "write_off_reason",
        "write_off_by",
        "write_off_at",
        "assisted_by_ids",
        "assisted_by_names",
        "service_lines",
        "product_lines",
        "warranty_days",
        "grace_period_days",
        "warranty_expiry_date",
        "warranty_terms_accepted",
        "mobile_media",
        "last_mobile_update_at",
        "store_id",
    ],
    service_requests: [
        "id",
        "ticket_number",
        "customer_id",
        "brand",
        "screen_size",
        "model_number",
        "primary_issue",
        "symptoms",
        "description",
        "media_urls",
        "customer_name",
        "phone",
        "address",
        "service_preference",
        "status",
        "tracking_status",
        "estimated_delivery",
        "payment_status",
        "created_at",
        "expires_at",
        "converted_job_id",
        "request_intent",
        "service_mode",
        "stage",
        "is_quote",
        "service_id",
        "quote_status",
        "quote_amount",
        "quote_notes",
        "quoted_at",
        "quote_expires_at",
        "accepted_at",
        "pickup_tier",
        "pickup_cost",
        "total_amount",
        "scheduled_pickup_date",
        "expected_pickup_date",
        "expected_return_date",
        "expected_ready_date",
        "intake_location",
        "physical_condition",
        "customer_signature_url",
        "proof_of_purchase",
        "warranty_status",
        "agreed_to_pickup",
        "pickup_agreed_at",
        "admin_interacted",
        "admin_interacted_at",
        "admin_interacted_by",
        "store_id",
        "corporate_client_id",
        "corporate_challan_id",
    ],
    notifications: [
        "id",
        "user_id",
        "title",
        "message",
        "type",
        "link",
        "read",
        "created_at",
        "corporate_client_id",
        "job_id",
        "context_type",
    ],
};

async function main() {
    const tableNames = Object.keys(EXPECTED_COLUMNS);
    const result = await db.execute(sql`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN (${sql.join(tableNames.map((tableName) => sql`${tableName}`), sql`, `)})
    `);

    const rows = ((result as any)?.rows ?? []) as Array<{ table_name: string; column_name: string }>;
    const columnsByTable = new Map<string, Set<string>>();

    rows.forEach((row) => {
        if (!columnsByTable.has(row.table_name)) {
            columnsByTable.set(row.table_name, new Set<string>());
        }
        columnsByTable.get(row.table_name)!.add(row.column_name);
    });

    let hasMissingColumns = false;

    for (const [tableName, expectedColumns] of Object.entries(EXPECTED_COLUMNS)) {
        const presentColumns = columnsByTable.get(tableName) ?? new Set<string>();
        const missingColumns = expectedColumns.filter((columnName) => !presentColumns.has(columnName));

        if (missingColumns.length > 0) {
            hasMissingColumns = true;
            console.error(`[SchemaCheck] ${tableName} is missing columns: ${missingColumns.join(", ")}`);
        } else {
            console.log(`[SchemaCheck] ${tableName} is compatible.`);
        }
    }

    if (hasMissingColumns) {
        process.exitCode = 1;
    } else {
        console.log("[SchemaCheck] Production schema is compatible with the current admin surfaces.");
    }
}

main()
    .catch((error) => {
        console.error("[SchemaCheck] Failed to inspect production schema.", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await pool.end();
    });
