import { db, sql, type JobTicket, type Notification, type ServiceRequest } from "./base.js";

type LegacyRow = Record<string, any>;

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error ?? "");
}

export function isMissingColumnError(error: unknown, columnNames: string[]): boolean {
    const message = getErrorMessage(error);
    return message.includes("does not exist") && columnNames.some((columnName) => message.includes(columnName));
}

function toDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    const parsed = new Date(value as string);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toNumber(value: unknown, fallback = 0): number {
    if (value === null || value === undefined || value === "") return fallback;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? fallback : parsed;
}

function toBoolean(value: unknown, fallback = false): boolean {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "t", "1", "yes"].includes(normalized)) return true;
        if (["false", "f", "0", "no"].includes(normalized)) return false;
    }
    return fallback;
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
    if (value === null || value === undefined || value === "") return fallback;
    if (typeof value === "object") return value as T;
    if (typeof value !== "string") return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

function rowsFromResult(result: unknown): LegacyRow[] {
    const rows = (result as { rows?: unknown[] } | null | undefined)?.rows;
    return Array.isArray(rows) ? (rows as LegacyRow[]) : [];
}

export async function executeLegacyQuery<T>(
    query: ReturnType<typeof sql>,
    mapRow: (row: LegacyRow) => T,
): Promise<T[]> {
    const result = await db.execute(query);
    return rowsFromResult(result).map(mapRow);
}

export function mapLegacyJobTicketRow(row: LegacyRow): JobTicket {
    return {
        id: String(row.id ?? ""),
        customer: row.customer ?? null,
        customerPhone: row.customer_phone ?? row.customerPhone ?? null,
        customerPhoneNormalized: row.customer_phone_normalized ?? row.customerPhoneNormalized ?? null,
        customerAddress: row.customer_address ?? row.customerAddress ?? null,
        device: row.device ?? null,
        tvSerialNumber: row.tv_serial_number ?? row.tvSerialNumber ?? null,
        issue: row.issue ?? null,
        status: row.status ?? "Pending",
        technician: row.technician ?? null,
        priority: row.priority ?? null,
        assistedBy: row.assisted_by ?? row.assistedBy ?? null,
        screenSize: row.screen_size ?? row.screenSize ?? null,
        createdAt: toDate(row.created_at ?? row.createdAt) ?? new Date(),
        completedAt: toDate(row.completed_at ?? row.completedAt),
        deadline: toDate(row.deadline),
        slaDeadline: toDate(row.sla_deadline ?? row.slaDeadline),
        notes: row.notes ?? null,
        receivedAccessories: row.received_accessories ?? row.receivedAccessories ?? null,
        aiDiagnosis: parseJsonValue(row.ai_diagnosis ?? row.aiDiagnosis, null),
        estimatedCost: toNumber(row.estimated_cost ?? row.estimatedCost, 0),
        assignedTechnicianId: row.assigned_technician_id ?? row.assignedTechnicianId ?? null,
        corporateChallanId: row.corporate_challan_id ?? row.corporateChallanId ?? null,
        corporateJobNumber: row.corporate_job_number ?? row.corporateJobNumber ?? null,
        corporateClientId: row.corporate_client_id ?? row.corporateClientId ?? null,
        jobType: row.job_type ?? row.jobType ?? "standard",
        parentJobId: row.parent_job_id ?? row.parentJobId ?? null,
        charges: parseJsonValue(row.charges, null),
        warrantyNotes: row.warranty_notes ?? row.warrantyNotes ?? null,
        paymentStatus: row.payment_status ?? row.paymentStatus ?? "unpaid",
        paymentId: row.payment_id ?? row.paymentId ?? null,
        paidAmount: toNumber(row.paid_amount ?? row.paidAmount, 0),
        remainingAmount: toNumber(row.remaining_amount ?? row.remainingAmount, 0),
        paidAt: toDate(row.paid_at ?? row.paidAt),
        lastPaymentAt: toDate(row.last_payment_at ?? row.lastPaymentAt),
        billingStatus: row.billing_status ?? row.billingStatus ?? "pending",
        invoicePrintedAt: toDate(row.invoice_printed_at ?? row.invoicePrintedAt),
        initialStatus: row.initial_status ?? row.initialStatus ?? null,
        reportedDefect: row.reported_defect ?? row.reportedDefect ?? null,
        problemFound: row.problem_found ?? row.problemFound ?? null,
        corporateBillId: row.corporate_bill_id ?? row.corporateBillId ?? null,
        invoicePrintedBy: row.invoice_printed_by ?? row.invoicePrintedBy ?? null,
        invoicePrintCount: toNumber(row.invoice_print_count ?? row.invoicePrintCount, 0),
        writeOffReason: row.write_off_reason ?? row.writeOffReason ?? null,
        writeOffBy: row.write_off_by ?? row.writeOffBy ?? null,
        writeOffAt: toDate(row.write_off_at ?? row.writeOffAt),
        assistedByIds: row.assisted_by_ids ?? row.assistedByIds ?? "[]",
        assistedByNames: row.assisted_by_names ?? row.assistedByNames ?? null,
        serviceLines: row.service_lines ?? row.serviceLines ?? null,
        productLines: row.product_lines ?? row.productLines ?? null,
        warrantyDays: toNumber(row.warranty_days ?? row.warrantyDays, 30),
        gracePeriodDays: toNumber(row.grace_period_days ?? row.gracePeriodDays, 7),
        warrantyExpiryDate: toDate(row.warranty_expiry_date ?? row.warrantyExpiryDate),
        warrantyTermsAccepted: toBoolean(row.warranty_terms_accepted ?? row.warrantyTermsAccepted, false),
        mobileMedia: row.mobile_media ?? row.mobileMedia ?? "[]",
        lastMobileUpdateAt: toDate(row.last_mobile_update_at ?? row.lastMobileUpdateAt),
        storeId: row.store_id ?? row.storeId ?? null,
    } as JobTicket;
}

export function mapLegacyServiceRequestRow(row: LegacyRow): ServiceRequest {
    return {
        id: String(row.id ?? ""),
        ticketNumber: row.ticket_number ?? row.ticketNumber ?? null,
        customerId: row.customer_id ?? row.customerId ?? null,
        brand: row.brand ?? "",
        screenSize: row.screen_size ?? row.screenSize ?? null,
        modelNumber: row.model_number ?? row.modelNumber ?? null,
        primaryIssue: row.primary_issue ?? row.primaryIssue ?? "",
        symptoms: row.symptoms ?? null,
        description: row.description ?? null,
        mediaUrls: row.media_urls ?? row.mediaUrls ?? null,
        customerName: row.customer_name ?? row.customerName ?? "",
        phone: row.phone ?? "",
        address: row.address ?? null,
        servicePreference: row.service_preference ?? row.servicePreference ?? null,
        status: row.status ?? "Pending",
        trackingStatus: row.tracking_status ?? row.trackingStatus ?? "Request Received",
        estimatedDelivery: toDate(row.estimated_delivery ?? row.estimatedDelivery),
        paymentStatus: row.payment_status ?? row.paymentStatus ?? "Due",
        createdAt: toDate(row.created_at ?? row.createdAt) ?? new Date(),
        expiresAt: toDate(row.expires_at ?? row.expiresAt),
        convertedJobId: row.converted_job_id ?? row.convertedJobId ?? null,
        requestIntent: row.request_intent ?? row.requestIntent ?? null,
        serviceMode: row.service_mode ?? row.serviceMode ?? null,
        stage: row.stage ?? "intake",
        isQuote: toBoolean(row.is_quote ?? row.isQuote, false),
        serviceId: row.service_id ?? row.serviceId ?? null,
        quoteStatus: row.quote_status ?? row.quoteStatus ?? null,
        quoteAmount: row.quote_amount === null || row.quoteAmount === null
            ? null
            : toNumber(row.quote_amount ?? row.quoteAmount, 0),
        quoteNotes: row.quote_notes ?? row.quoteNotes ?? null,
        quotedAt: toDate(row.quoted_at ?? row.quotedAt),
        quoteExpiresAt: toDate(row.quote_expires_at ?? row.quoteExpiresAt),
        acceptedAt: toDate(row.accepted_at ?? row.acceptedAt),
        pickupTier: row.pickup_tier ?? row.pickupTier ?? null,
        pickupCost: row.pickup_cost === null || row.pickupCost === null
            ? null
            : toNumber(row.pickup_cost ?? row.pickupCost, 0),
        totalAmount: row.total_amount === null || row.totalAmount === null
            ? null
            : toNumber(row.total_amount ?? row.totalAmount, 0),
        scheduledPickupDate: toDate(row.scheduled_pickup_date ?? row.scheduledPickupDate),
        expectedPickupDate: toDate(row.expected_pickup_date ?? row.expectedPickupDate),
        expectedReturnDate: toDate(row.expected_return_date ?? row.expectedReturnDate),
        expectedReadyDate: toDate(row.expected_ready_date ?? row.expectedReadyDate),
        intakeLocation: parseJsonValue(row.intake_location ?? row.intakeLocation, null),
        physicalCondition: row.physical_condition ?? row.physicalCondition ?? null,
        customerSignatureUrl: row.customer_signature_url ?? row.customerSignatureUrl ?? null,
        proofOfPurchase: row.proof_of_purchase ?? row.proofOfPurchase ?? null,
        warrantyStatus: row.warranty_status ?? row.warrantyStatus ?? null,
        agreedToPickup: toBoolean(row.agreed_to_pickup ?? row.agreedToPickup, false),
        pickupAgreedAt: toDate(row.pickup_agreed_at ?? row.pickupAgreedAt),
        adminInteracted: toBoolean(row.admin_interacted ?? row.adminInteracted, false),
        adminInteractedAt: toDate(row.admin_interacted_at ?? row.adminInteractedAt),
        adminInteractedBy: row.admin_interacted_by ?? row.adminInteractedBy ?? null,
        storeId: row.store_id ?? row.storeId ?? null,
        corporateClientId: row.corporate_client_id ?? row.corporateClientId ?? null,
        corporateChallanId: row.corporate_challan_id ?? row.corporateChallanId ?? null,
    } as ServiceRequest;
}

export function mapLegacyNotificationRow(row: LegacyRow): Notification {
    return {
        id: String(row.id ?? ""),
        userId: row.user_id ?? row.userId ?? "",
        title: row.title ?? "",
        message: row.message ?? "",
        type: row.type ?? "info",
        link: row.link ?? null,
        read: toBoolean(row.read, false),
        createdAt: toDate(row.created_at ?? row.createdAt) ?? new Date(),
        corporateClientId: row.corporate_client_id ?? row.corporateClientId ?? null,
        jobId: row.job_id ?? row.jobId ?? null,
        contextType: row.context_type ?? row.contextType ?? "corporate",
    } as Notification;
}
