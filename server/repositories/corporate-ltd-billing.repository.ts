import { db } from "../db.js";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as schema from "../../shared/schema.js";
import type {
    CorporateBill,
    BillLineItem,
    CorporateLtdReceipt,
    CorporateLtdReceiptAllocation,
    CorporateClient,
} from "../../shared/schema.js";
import { isCorporateLimitedClientType } from "../../shared/constants.js";
import { getSafeJobDisplayRef } from "../../shared/job-display-utils.js";

export class CorporateLtdBillingError extends Error {
    constructor(public status: number, public code: string, message: string) {
        super(message);
        this.name = "CorporateLtdBillingError";
    }
}

export const CORPORATE_LTD_REQUIRED = "CORPORATE_LTD_REQUIRED";
export const NORMAL_CORPORATE_USES_ACCOUNT_SETTLEMENT = "NORMAL_CORPORATE_USES_ACCOUNT_SETTLEMENT";
export const ITEMIZED_BILL_REQUIRED = "ITEMIZED_BILL_REQUIRED";

export interface BillingPreset {
    recipientPolicy: "company_only" | "attention_person";
    enabledColumns: string[];
    attentionName?: string | null;
    attentionContact?: string | null;
    billingAddress?: string | null;
    updatedAt?: string | null;
    updatedBy?: string | null;
}

export const ALL_COLUMN_KEYS = [
    "clientJobNumber",
    "promiseJobNumber",
    "tvSerial",
    "brandModel",
    "tvSize",
    "service",
    "amount",
] as const;
export type ColumnKey = (typeof ALL_COLUMN_KEYS)[number];

function isPresetShape(v: unknown): v is BillingPreset {
    if (!v || typeof v !== "object") return false;
    const p = v as Record<string, unknown>;
    if (p.recipientPolicy !== "company_only" && p.recipientPolicy !== "attention_person") return false;
    if (!Array.isArray(p.enabledColumns)) return false;
    return true;
}

function normalizePreset(raw: unknown): BillingPreset {
    if (!isPresetShape(raw)) {
        return { recipientPolicy: "company_only", enabledColumns: [...ALL_COLUMN_KEYS] };
    }
    const enabled = (raw.enabledColumns as string[]).filter((c) =>
        (ALL_COLUMN_KEYS as readonly string[]).includes(c),
    );
    return {
        recipientPolicy: raw.recipientPolicy,
        enabledColumns: enabled.length > 0 ? enabled : [...ALL_COLUMN_KEYS],
        attentionName: (raw as any).attentionName ?? null,
        attentionContact: (raw as any).attentionContact ?? null,
        billingAddress: (raw as any).billingAddress ?? null,
        updatedAt: (raw as any).updatedAt ?? null,
        updatedBy: (raw as any).updatedBy ?? null,
    };
}

interface JobLite {
    id: string;
    corporateJobNumber: string | null;
    device: string | null;
    tvSerialNumber: string | null;
    modelNumber: string | null;
    screenSize: string | null;
    reportedDefect: string | null;
    issue: string | null;
    estimatedCost: number | null;
    charges: unknown;
    billingStatus: string | null;
    corporateBillId: string | null;
    corporateClientId: string | null;
}

interface NormalizedLine {
    jobTicketId: string;
    clientJobNumber: string;
    promiseJobNumber: string;
    tvSerial: string;
    brandModel: string;
    tvSize: string;
    serviceDescription: string;
    amount: number;
}

function jobAmount(job: JobLite): number {
    const charges = job.charges as any[];
    if (Array.isArray(charges) && charges.length > 0) {
        return charges.reduce((acc, c) => acc + (Number(c?.amount) || 0), 0);
    }
    return Number(job.estimatedCost) || 0;
}

function normalizeLine(job: JobLite): NormalizedLine {
    const brandModel = [job.device, job.modelNumber].filter(Boolean).join(" ").trim();
    const serviceDescription = job.reportedDefect || job.issue || "Repair Service";
    return {
        jobTicketId: job.id,
        clientJobNumber: job.corporateJobNumber || "",
        promiseJobNumber: getSafeJobDisplayRef(job),
        tvSerial: job.tvSerialNumber || "",
        brandModel: brandModel || "",
        tvSize: job.screenSize || "",
        serviceDescription,
        amount: jobAmount(job),
    };
}

export class CorporateLtdBillingRepository {
    async getClient(clientId: string): Promise<CorporateClient | undefined> {
        const [row] = await db.select().from(schema.corporateClients)
            .where(eq(schema.corporateClients.id, clientId));
        return row;
    }

    async getBillingPreset(clientId: string): Promise<BillingPreset> {
        const client = await this.getClient(clientId);
        if (!client) {
            throw new CorporateLtdBillingError(404, "CLIENT_NOT_FOUND", "Corporate client not found");
        }
        if (!isCorporateLimitedClientType(client.clientType)) {
            throw new CorporateLtdBillingError(
                422,
                CORPORATE_LTD_REQUIRED,
                "Billing presets are only available for Corporate Ltd. clients.",
            );
        }
        const ruleProfile = (client.ruleProfile as Record<string, unknown> | null) ?? {};
        return normalizePreset(ruleProfile.billingPreset);
    }

    async setBillingPreset(
        clientId: string,
        preset: BillingPreset,
        actorId: string,
    ): Promise<BillingPreset> {
        const client = await this.getClient(clientId);
        if (!client) {
            throw new CorporateLtdBillingError(404, "CLIENT_NOT_FOUND", "Corporate client not found");
        }
        if (!isCorporateLimitedClientType(client.clientType)) {
            throw new CorporateLtdBillingError(
                422,
                CORPORATE_LTD_REQUIRED,
                "Billing presets are only available for Corporate Ltd. clients.",
            );
        }
        const ruleProfile = (client.ruleProfile as Record<string, unknown> | null) ?? {};
        const stamped: BillingPreset = {
            ...preset,
            updatedAt: new Date().toISOString(),
            updatedBy: actorId,
        };
        const nextRuleProfile = { ...ruleProfile, billingPreset: stamped };
        await db.update(schema.corporateClients)
            .set({ ruleProfile: nextRuleProfile as any, updatedAt: new Date() })
            .where(eq(schema.corporateClients.id, clientId));
        return stamped;
    }

    async listEligibleJobs(clientId: string): Promise<JobLite[]> {
        const client = await this.getClient(clientId);
        if (!client) {
            throw new CorporateLtdBillingError(404, "CLIENT_NOT_FOUND", "Corporate client not found");
        }
        if (!isCorporateLimitedClientType(client.clientType)) {
            throw new CorporateLtdBillingError(
                422,
                CORPORATE_LTD_REQUIRED,
                "Itemized billing is only available for Corporate Ltd. clients.",
            );
        }
        const rows = await db.select().from(schema.jobTickets)
            .where(eq(schema.jobTickets.corporateClientId, clientId));
        return rows
            .filter((j) => j.billingStatus !== "billed" && !j.corporateBillId)
            .map((j) => j as unknown as JobLite);
    }

    buildPreview(preset: BillingPreset, jobs: JobLite[]): {
        lines: NormalizedLine[];
        subtotal: number;
        preset: BillingPreset;
    } {
        const lines = jobs.map(normalizeLine);
        const subtotal = lines.reduce((acc, l) => acc + l.amount, 0);
        return { lines, subtotal, preset };
    }

    async issueBill(
        clientId: string,
        jobIds: string[],
        periodStart: Date,
        periodEnd: Date,
        actorId: string,
    ): Promise<{ bill: CorporateBill; lines: BillLineItem[] }> {
        if (!jobIds.length) {
            throw new CorporateLtdBillingError(400, "EMPTY_SELECTION", "At least one job must be selected.");
        }
        const uniqueIds = Array.from(new Set(jobIds));
        if (uniqueIds.length !== jobIds.length) {
            throw new CorporateLtdBillingError(400, "DUPLICATE_JOB_IDS", "Duplicate job IDs are not allowed.");
        }

        const client = await this.getClient(clientId);
        if (!client) {
            throw new CorporateLtdBillingError(404, "CLIENT_NOT_FOUND", "Corporate client not found");
        }
        if (!isCorporateLimitedClientType(client.clientType)) {
            throw new CorporateLtdBillingError(
                422,
                CORPORATE_LTD_REQUIRED,
                "Itemized billing is only available for Corporate Ltd. clients.",
            );
        }

        const preset = await this.getBillingPreset(clientId);

        const layoutSnapshot = {
            enabledColumns: preset.enabledColumns,
            recipientPolicy: preset.recipientPolicy,
        };
        const recipientSnapshot = {
            companyName: client.companyName,
            contactPerson: preset.recipientPolicy === "attention_person" ? (preset.attentionName || client.contactPerson || null) : null,
            contactPhone: preset.recipientPolicy === "attention_person" ? (preset.attentionContact || client.contactPhone || null) : null,
            billingAddress: preset.recipientPolicy === "attention_person" ? (preset.billingAddress || client.address || null) : null,
        };

        return db.transaction(async (tx) => {
            const clientLock = await tx.execute(sql`
                SELECT id FROM corporate_clients WHERE id = ${clientId} FOR UPDATE
            `);
            if ((((clientLock as any).rows ?? clientLock) as any[]).length === 0) {
                throw new CorporateLtdBillingError(404, "CLIENT_NOT_FOUND", "Corporate client not found");
            }

            const clientBills = await tx.execute(sql`
                SELECT bill_number FROM corporate_bills
                WHERE corporate_client_id = ${clientId}
            `);
            let maxSeq = 0;
            for (const b of ((clientBills as any).rows ?? clientBills) as any[]) {
                const m = (b.bill_number as string)?.match(/-BILL-(\d+)$/);
                if (m) {
                    const n = parseInt(m[1], 10);
                    if (!isNaN(n) && n > maxSeq) maxSeq = n;
                }
            }
            const seq = maxSeq + 1;
            const billNumber = `${client.shortCode}-BILL-${seq.toString().padStart(4, "0")}`;
            const billId = randomUUID();

            const lockedJobsResult = await tx.select({
                id: schema.jobTickets.id,
                corporateClientId: schema.jobTickets.corporateClientId,
                corporateJobNumber: schema.jobTickets.corporateJobNumber,
                device: schema.jobTickets.device,
                tvSerialNumber: schema.jobTickets.tvSerialNumber,
                modelNumber: schema.jobTickets.modelNumber,
                screenSize: schema.jobTickets.screenSize,
                reportedDefect: schema.jobTickets.reportedDefect,
                issue: schema.jobTickets.issue,
                estimatedCost: schema.jobTickets.estimatedCost,
                charges: schema.jobTickets.charges,
                billingStatus: schema.jobTickets.billingStatus,
                corporateBillId: schema.jobTickets.corporateBillId,
            })
                .from(schema.jobTickets)
                .where(inArray(schema.jobTickets.id, uniqueIds))
                .for("update");
            const lockedRows = lockedJobsResult as JobLite[];

            if (lockedRows.length !== uniqueIds.length) {
                const foundIds = new Set(lockedRows.map((j) => j.id));
                const missing = uniqueIds.filter((id) => !foundIds.has(id));
                throw new CorporateLtdBillingError(
                    404,
                    "JOB_NOT_FOUND",
                    `Jobs not found: ${missing.join(", ")}`,
                );
            }

            const invalidJobs: string[] = [];
            for (const row of lockedRows) {
                if (row.corporateClientId !== clientId) {
                    invalidJobs.push(`${row.id} (wrong client)`);
                } else if (row.billingStatus === "billed" || row.corporateBillId) {
                    invalidJobs.push(`${row.id} (already billed)`);
                }
            }
            if (invalidJobs.length > 0) {
                throw new CorporateLtdBillingError(
                    409,
                    "JOBS_NOT_ELIGIBLE",
                    `Jobs are not eligible for billing: ${invalidJobs.join("; ")}`,
                );
            }

            const normalized = lockedRows.map(normalizeLine);
            const subtotal = normalized.reduce((acc, l) => acc + l.amount, 0);
            const grandTotal = subtotal;

            const [bill] = await tx.insert(schema.corporateBills).values({
                id: billId,
                billNumber,
                corporateClientId: clientId,
                billingPeriodStart: periodStart,
                billingPeriodEnd: periodEnd,
                lineItems: normalized.map((l) => ({
                    jobId: l.jobTicketId,
                    jobNo: l.promiseJobNumber,
                    device: l.brandModel,
                    serial: l.tvSerial,
                    defect: l.serviceDescription,
                    amount: l.amount,
                })),
                subtotal,
                discount: 0,
                vatAmount: 0,
                grandTotal,
                paymentStatus: "unpaid",
                dueDate: new Date(Date.now() + 30 * 86400000),
                itemizedMode: true,
                layoutSnapshot,
                recipientSnapshot,
                clientTypeSnapshot: client.clientType,
                issuedAt: new Date(),
                createdBy: actorId,
            }).returning();

            const lineRows = await Promise.all(normalized.map(async (l) => {
                const [row] = await tx.insert(schema.billLineItems).values({
                    id: randomUUID(),
                    billId: billId,
                    jobTicketId: l.jobTicketId,
                    deviceSerial: l.tvSerial,
                    deviceModel: l.brandModel,
                    chargeDescription: l.serviceDescription,
                    amount: l.amount,
                    clientJobNumber: l.clientJobNumber,
                    promiseJobNumber: l.promiseJobNumber,
                    tvSerial: l.tvSerial,
                    brandModel: l.brandModel,
                    tvSize: l.tvSize,
                    serviceDescription: l.serviceDescription,
                }).returning();
                return row;
            }));

            await tx.update(schema.jobTickets)
                .set({ corporateBillId: billId, billingStatus: "billed" })
                .where(inArray(schema.jobTickets.id, uniqueIds));

            return { bill: bill as CorporateBill, lines: lineRows as BillLineItem[] };
        });
    }

    async getBillWithLines(billId: string): Promise<{
        bill: CorporateBill;
        lines: BillLineItem[];
    } | null> {
        const [bill] = await db.select().from(schema.corporateBills)
            .where(eq(schema.corporateBills.id, billId));
        if (!bill) return null;
        if (!bill.itemizedMode) {
            throw new CorporateLtdBillingError(
                422,
                ITEMIZED_BILL_REQUIRED,
                "Bill details require an itemized Corporate Ltd. bill. Use the account-level view for legacy bills.",
            );
        }
        const lines = await db.select().from(schema.billLineItems)
            .where(eq(schema.billLineItems.billId, billId))
            .orderBy(schema.billLineItems.createdAt);
        return { bill, lines };
    }

    /**
     * Bill-level balance: grand_total minus sum of Corporate Ltd. receipts for the bill.
     * Computed inside the caller's locked transaction for receipt safety.
     */
    async computeBillBalanceInTx(
        tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
        billId: string,
    ): Promise<{ totalBilled: number; totalReceived: number; totalDue: number }> {
        const billsRes = await tx.execute(sql`
            SELECT grand_total FROM corporate_bills WHERE id = ${billId}
        `);
        const billRow = ((billsRes as any).rows ?? billsRes)[0];
        if (!billRow) {
            throw new CorporateLtdBillingError(404, "BILL_NOT_FOUND", "Bill not found");
        }
        const totalBilled = Number(billRow.grand_total) || 0;
        const receiptsRes = await tx.execute(sql`
            SELECT COALESCE(SUM(amount), 0)::float8 AS total_received
            FROM corporate_ltd_receipts WHERE bill_id = ${billId}
        `);
        const receiptRow = ((receiptsRes as any).rows ?? receiptsRes)[0] ?? { total_received: 0 };
        const totalReceived = Number(receiptRow.total_received) || 0;
        const totalDue = Math.max(0, totalBilled - totalReceived);
        return { totalBilled, totalReceived, totalDue };
    }

    async computeLineBalanceInTx(
        tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
        billLineItemId: string,
    ): Promise<{ lineAmount: number; totalReceived: number; totalDue: number }> {
        const lineRes = await tx.execute(sql`
            SELECT amount FROM bill_line_items WHERE id = ${billLineItemId} FOR UPDATE
        `);
        const lineRow = ((lineRes as any).rows ?? lineRes)[0];
        if (!lineRow) {
            throw new CorporateLtdBillingError(404, "LINE_NOT_FOUND", "Bill line not found");
        }
        const lineAmount = Number(lineRow.amount) || 0;
        const allocRes = await tx.execute(sql`
            SELECT COALESCE(SUM(amount), 0)::float8 AS total_received
            FROM corporate_ltd_receipt_allocations WHERE bill_line_item_id = ${billLineItemId}
        `);
        const allocRow = ((allocRes as any).rows ?? allocRes)[0] ?? { total_received: 0 };
        const totalReceived = Number(allocRow.total_received) || 0;
        const totalDue = Math.max(0, lineAmount - totalReceived);
        return { lineAmount, totalReceived, totalDue };
    }

    async recordReceiptAndAllocations(input: {
        corporateClientId: string;
        billId: string;
        amount: number;
        method: string;
        reference?: string;
        note?: string;
        idempotencyKey?: string;
        receivedBy?: string;
        receivedByName?: string;
        allocations?: Array<{ billLineItemId?: string | null; amount: number }>;
    }): Promise<{ receipt: CorporateLtdReceipt; allocations: CorporateLtdReceiptAllocation[] }> {
        return db.transaction(async (tx) => {
            const lockRes = await tx.execute(sql`
                SELECT id, client_type FROM corporate_clients WHERE id = ${input.corporateClientId} FOR UPDATE
            `);
            const clientRow = ((lockRes as any).rows ?? lockRes)[0];
            if (!clientRow) {
                throw new CorporateLtdBillingError(404, "CLIENT_NOT_FOUND", "Corporate client not found");
            }
            if (!isCorporateLimitedClientType(clientRow.client_type)) {
                throw new CorporateLtdBillingError(
                    422,
                    CORPORATE_LTD_REQUIRED,
                    "Itemized receipts are only available for Corporate Ltd. clients.",
                );
            }

            const billLockRes = await tx.execute(sql`
                SELECT id, corporate_client_id, grand_total, itemized_mode FROM corporate_bills WHERE id = ${input.billId} FOR UPDATE
            `);
            const billRow = ((billLockRes as any).rows ?? billLockRes)[0];
            if (!billRow) {
                throw new CorporateLtdBillingError(404, "BILL_NOT_FOUND", "Bill not found");
            }
            if (billRow.corporate_client_id !== input.corporateClientId) {
                throw new CorporateLtdBillingError(
                    403,
                    "CROSS_CLIENT_REJECTED",
                    "Bill does not belong to this client.",
                );
            }
            if (!billRow.itemized_mode) {
                throw new CorporateLtdBillingError(
                    422,
                    ITEMIZED_BILL_REQUIRED,
                    "Receipt recording requires an itemized Corporate Ltd. bill. Use the account-level settlement flow for legacy bills.",
                );
            }

            if (input.idempotencyKey) {
                const existing = await tx.select().from(schema.corporateLtdReceipts)
                    .where(
                        and(
                            eq(schema.corporateLtdReceipts.billId, input.billId),
                            eq(schema.corporateLtdReceipts.idempotencyKey, input.idempotencyKey),
                        ),
                    ).limit(1);
                if (existing.length > 0) {
                    const existingReceipt = existing[0] as CorporateLtdReceipt;
                    const allocs = await tx.select().from(schema.corporateLtdReceiptAllocations)
                        .where(eq(schema.corporateLtdReceiptAllocations.receiptId, existingReceipt.id));
                    return { receipt: existingReceipt, allocations: allocs as CorporateLtdReceiptAllocation[] };
                }
            }

            const billBalance = await this.computeBillBalanceInTx(tx, input.billId);
            if (input.amount > billBalance.totalDue) {
                throw new CorporateLtdBillingError(
                    422,
                    "OVERPAYMENT_REJECTED",
                    `Receipt ৳${input.amount.toFixed(2)} exceeds remaining bill balance ৳${billBalance.totalDue.toFixed(2)}`,
                );
            }

            const allocations = input.allocations ?? [];
            if (allocations.length > 0) {
                const allocSum = allocations.reduce((acc, a) => acc + a.amount, 0);
                if (Math.abs(allocSum - input.amount) > 0.01) {
                    throw new CorporateLtdBillingError(
                        400,
                        "ALLOCATION_MISMATCH",
                        "Allocation total must equal the receipt amount.",
                    );
                }
                for (const a of allocations) {
                    if (!Number.isFinite(a.amount) || a.amount <= 0) {
                        throw new CorporateLtdBillingError(400, "INVALID_ALLOCATION", "Allocation amount must be positive");
                    }
                    if (a.billLineItemId) {
                        const lineLockRes = await tx.execute(sql`
                            SELECT bli.id, bli.bill_id, b.corporate_client_id
                            FROM bill_line_items bli
                            JOIN corporate_bills b ON b.id = bli.bill_id
                            WHERE bli.id = ${a.billLineItemId} FOR UPDATE
                        `);
                        const lineRow = ((lineLockRes as any).rows ?? lineLockRes)[0];
                        if (!lineRow) {
                            throw new CorporateLtdBillingError(404, "LINE_NOT_FOUND", "Bill line not found");
                        }
                        if (lineRow.bill_id !== input.billId) {
                            throw new CorporateLtdBillingError(
                                403,
                                "CROSS_BILL_LINE_REJECTED",
                                "Allocation line does not belong to this bill.",
                            );
                        }
                        if (lineRow.corporate_client_id !== input.corporateClientId) {
                            throw new CorporateLtdBillingError(
                                403,
                                "CROSS_CLIENT_REJECTED",
                                "Allocation line does not belong to this client.",
                            );
                        }
                        const lineBalance = await this.computeLineBalanceInTx(tx, a.billLineItemId);
                        if (a.amount > lineBalance.totalDue) {
                            throw new CorporateLtdBillingError(
                                422,
                                "LINE_OVERALLOCATION_REJECTED",
                                `Allocation ৳${a.amount.toFixed(2)} exceeds line balance ৳${lineBalance.totalDue.toFixed(2)}`,
                            );
                        }
                    }
                }
            }

            const receiptId = randomUUID();
            const [receipt] = await tx.insert(schema.corporateLtdReceipts).values({
                id: receiptId,
                corporateClientId: input.corporateClientId,
                billId: input.billId,
                amount: input.amount,
                method: input.method,
                reference: input.reference || null,
                receivedBy: input.receivedBy || null,
                receivedByName: input.receivedByName || null,
                idempotencyKey: input.idempotencyKey || null,
                note: input.note || null,
                receivedAt: new Date(),
            }).returning();

            const allocRows: CorporateLtdReceiptAllocation[] = [];
            for (const a of allocations) {
                const [row] = await tx.insert(schema.corporateLtdReceiptAllocations).values({
                    id: randomUUID(),
                    receiptId: receiptId,
                    corporateClientId: input.corporateClientId,
                    billId: input.billId,
                    billLineItemId: a.billLineItemId || null,
                    amount: a.amount,
                }).returning();
                allocRows.push(row as CorporateLtdReceiptAllocation);
            }

            return { receipt: receipt as CorporateLtdReceipt, allocations: allocRows };
        });
    }

    async getBillBalance(billId: string): Promise<{
        billId: string;
        totalBilled: number;
        totalReceived: number;
        totalDue: number;
        paymentStatus: string;
    }> {
        return db.transaction(async (tx) => {
            const b = await this.computeBillBalanceInTx(tx, billId);
            const [bill] = await tx.select({ paymentStatus: schema.corporateBills.paymentStatus, itemizedMode: schema.corporateBills.itemizedMode })
                .from(schema.corporateBills)
                .where(eq(schema.corporateBills.id, billId));
            if (bill && !bill.itemizedMode) {
                throw new CorporateLtdBillingError(
                    422,
                    ITEMIZED_BILL_REQUIRED,
                    "Bill balance requires an itemized Corporate Ltd. bill. Use the account-level balance for legacy bills.",
                );
            }
            return {
                billId,
                totalBilled: b.totalBilled,
                totalReceived: b.totalReceived,
                totalDue: b.totalDue,
                paymentStatus: bill?.paymentStatus ?? "unpaid",
            };
        });
    }

    async listReceipts(billId: string): Promise<CorporateLtdReceipt[]> {
        return db.select().from(schema.corporateLtdReceipts)
            .where(eq(schema.corporateLtdReceipts.billId, billId))
            .orderBy(desc(schema.corporateLtdReceipts.receivedAt));
    }

    async listAllocations(receiptId: string): Promise<CorporateLtdReceiptAllocation[]> {
        return db.select().from(schema.corporateLtdReceiptAllocations)
            .where(eq(schema.corporateLtdReceiptAllocations.receiptId, receiptId));
    }
}

export const corporateLtdBillingRepo = new CorporateLtdBillingRepository();
export { normalizePreset };
