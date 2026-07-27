import { db } from "../db.js";
import { eq, sql } from "drizzle-orm";
import * as schema from "../../shared/schema.js";
import { isCorporateLimitedClientType, isNormalCorporateClientType } from "../../shared/constants.js";
import { randomUUID } from "crypto";

const ALLOWED_METHODS = ["cash", "bank", "bkash", "nagad", "cheque", "other"] as const;
type ReceiptMethod = (typeof ALLOWED_METHODS)[number];

export class CorporateAccountReceiptError extends Error {
    constructor(public status: number, public code: string, message: string) {
        super(message);
        this.name = "CorporateAccountReceiptError";
    }
}

export const CORPORATE_LIMITED_ITEMIZED_SETTLEMENT_REQUIRED = "CORPORATE_LIMITED_ITEMIZED_SETTLEMENT_REQUIRED";

export interface RecordReceiptInput {
    corporateClientId: string;
    amount: number;
    method: string;
    reference?: string;
    note?: string;
    idempotencyKey?: string;
    receivedBy?: string;
    receivedByName?: string;
}

export interface AccountBalance {
    corporateClientId: string;
    totalBilled: number;
    totalReceived: number;
    totalDue: number;
    activeBillCount: number;
    receiptCount: number;
}

/**
 * Asserts that a client row (already locked) is a Normal Corporate client.
 * Corporate Ltd. (limited_company) must use the itemized bill/line allocation
 * flow (Ticket 03), not the account-level receipt flow.
 */
function assertNormalCorporateClient(clientRow: { client_type?: string | null }): void {
    if (!isNormalCorporateClientType(clientRow.client_type)) {
        if (isCorporateLimitedClientType(clientRow.client_type)) {
            throw new CorporateAccountReceiptError(
                422,
                CORPORATE_LIMITED_ITEMIZED_SETTLEMENT_REQUIRED,
                "Corporate Ltd. clients use itemized bill/line allocation, not account-level receipts.",
            );
        }
        throw new CorporateAccountReceiptError(
            422,
            "CLIENT_TYPE_NOT_SUPPORTED",
            "Account-level receipts are only available for Normal Corporate clients.",
        );
    }
}

/**
 * Records a Corporate account receipt inside a single transaction.
 *
 * Concurrency protection: SELECT ... FOR UPDATE on the corporate_clients row
 * serializes concurrent receipts for the same client. Two concurrent receipts
 * each recompute the remaining balance under the lock, so neither can exceed
 * the account cap.
 *
 * Idempotency: if idempotencyKey is supplied and a receipt already exists for
 * (corporateClientId, idempotencyKey), the existing receipt is returned instead
 * of double-posting (DB unique index is the last line of defense).
 *
 * Isolation: this service NEVER calls posRepo, financeRepo (due_records),
 * refund, warranty, or job-status code. A receipt settles the company account only.
 *
 * Client-type gate: only Normal Corporate clients (clientType === 'corporate')
 * may record account receipts. Corporate Ltd. (limited_company) is rejected
 * inside the row lock — it must use the itemized allocation flow (Ticket 03).
 */
export class CorporateAccountReceiptService {
    async recordReceipt(input: RecordReceiptInput): Promise<schema.CorporateAccountReceipt> {
        if (!input.corporateClientId) {
            throw new CorporateAccountReceiptError(400, "CLIENT_REQUIRED", "corporateClientId is required");
        }
        if (!Number.isFinite(input.amount) || input.amount <= 0) {
            throw new CorporateAccountReceiptError(400, "INVALID_AMOUNT", "Amount must be positive and finite");
        }
        if (!ALLOWED_METHODS.includes(input.method as ReceiptMethod)) {
            throw new CorporateAccountReceiptError(400, "INVALID_METHOD", `method must be one of ${ALLOWED_METHODS.join(", ")}`);
        }

        return db.transaction(async (tx) => {
            // Lock the client scope so concurrent receipts for the same client serialize.
            const lockResult = await tx.execute(sql`
                SELECT id, company_name, client_type FROM corporate_clients WHERE id = ${input.corporateClientId} FOR UPDATE
            `);
            const clientRow = ((lockResult as any).rows ?? lockResult)[0];
            if (!clientRow) {
                throw new CorporateAccountReceiptError(404, "CLIENT_NOT_FOUND", "Corporate client not found");
            }

            // Client-type gate inside the lock: only Normal Corporate may use account receipts.
            assertNormalCorporateClient(clientRow);

            // Idempotency: return existing receipt for the same (client, key) if present.
            if (input.idempotencyKey) {
                const existing = await tx.select().from(schema.corporateAccountReceipts)
                    .where(
                        sql`${schema.corporateAccountReceipts.corporateClientId} = ${input.corporateClientId}
                           AND ${schema.corporateAccountReceipts.idempotencyKey} = ${input.idempotencyKey}`
                    ).limit(1);
                if (existing.length > 0) {
                    return existing[0] as schema.CorporateAccountReceipt;
                }
            }

            // Compute remaining balance INSIDE the locked transaction.
            const balance = await this.computeBalanceInTx(tx, input.corporateClientId);
            if (input.amount > balance.totalDue) {
                throw new CorporateAccountReceiptError(
                    422,
                    "OVERPAYMENT_REJECTED",
                    `Receipt ৳${input.amount.toFixed(2)} exceeds remaining account balance ৳${balance.totalDue.toFixed(2)}`,
                );
            }

            const id = randomUUID();
            const [receipt] = await tx.insert(schema.corporateAccountReceipts).values({
                id,
                corporateClientId: input.corporateClientId,
                amount: input.amount,
                method: input.method,
                reference: input.reference || null,
                receivedBy: input.receivedBy || null,
                receivedByName: input.receivedByName || null,
                idempotencyKey: input.idempotencyKey || null,
                note: input.note || null,
                receivedAt: new Date(),
            }).returning();

            return receipt as schema.CorporateAccountReceipt;
        });
    }

    /**
     * Balance computed inside the locked tx: active (non-superseded) bill grand_total
     * minus sum of all receipts for the client. A receipt can never exceed this.
     */
    private async computeBalanceInTx(
        tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
        clientId: string,
    ): Promise<{ totalBilled: number; totalReceived: number; totalDue: number }> {
        const billsResult = await tx.execute(sql`
            SELECT COALESCE(SUM(grand_total), 0)::float8 AS total_billed,
                   COUNT(*)::int AS bill_count
            FROM corporate_bills
            WHERE corporate_client_id = ${clientId}
              AND (bill_status IS NULL OR bill_status = 'active')
        `);
        const billRow = ((billsResult as any).rows ?? billsResult)[0] ?? { total_billed: 0 };
        const totalBilled = Number(billRow.total_billed) || 0;

        const receiptsResult = await tx.execute(sql`
            SELECT COALESCE(SUM(amount), 0)::float8 AS total_received,
                   COUNT(*)::int AS receipt_count
            FROM corporate_account_receipts
            WHERE corporate_client_id = ${clientId}
        `);
        const receiptRow = ((receiptsResult as any).rows ?? receiptsResult)[0] ?? { total_received: 0 };
        const totalReceived = Number(receiptRow.total_received) || 0;

        const totalDue = Math.max(0, totalBilled - totalReceived);

        return { totalBilled, totalReceived, totalDue };
    }
}

export const corporateAccountReceiptService = new CorporateAccountReceiptService();
export { ALLOWED_METHODS };
