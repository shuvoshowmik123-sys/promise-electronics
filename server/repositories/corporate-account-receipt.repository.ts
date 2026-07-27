import { db } from "../db.js";
import { eq, desc, and, sql, sum } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as schema from "../../shared/schema.js";
import type { CorporateAccountReceipt } from "../../shared/schema.js";
import { isCorporateLimitedClientType, isNormalCorporateClientType } from "../../shared/constants.js";

export class AccountBalanceDomainError extends Error {
    constructor(public status: number, public code: string, message: string) {
        super(message);
        this.name = "AccountBalanceDomainError";
    }
}

export class CorporateAccountReceiptRepository {
    /**
     * Loads a client and validates it is a Normal Corporate client.
     * Corporate Ltd. (limited_company) is rejected — it must use the itemized
     * allocation flow (Ticket 03). Missing client returns 404.
     */
    async assertNormalCorporateClient(clientId: string): Promise<{ id: string; clientType: string }> {
        const [client] = await db.select({
            id: schema.corporateClients.id,
            clientType: schema.corporateClients.clientType,
        }).from(schema.corporateClients)
            .where(eq(schema.corporateClients.id, clientId));
        if (!client) {
            throw new AccountBalanceDomainError(404, "CLIENT_NOT_FOUND", "Corporate client not found");
        }
        if (isCorporateLimitedClientType(client.clientType)) {
            throw new AccountBalanceDomainError(
                422,
                "CORPORATE_LIMITED_ITEMIZED_SETTLEMENT_REQUIRED",
                "Corporate Ltd. clients use itemized bill/line allocation, not account-level settlement.",
            );
        }
        if (!isNormalCorporateClientType(client.clientType)) {
            throw new AccountBalanceDomainError(
                422,
                "CLIENT_TYPE_NOT_SUPPORTED",
                "Account-level settlement is only available for Normal Corporate clients.",
            );
        }
        return client;
    }

    async listReceipts(clientId: string, limit = 100): Promise<CorporateAccountReceipt[]> {
        return db.select().from(schema.corporateAccountReceipts)
            .where(eq(schema.corporateAccountReceipts.corporateClientId, clientId))
            .orderBy(desc(schema.corporateAccountReceipts.receivedAt))
            .limit(limit);
    }

    async getReceipt(id: string): Promise<CorporateAccountReceipt | undefined> {
        const [row] = await db.select().from(schema.corporateAccountReceipts)
            .where(eq(schema.corporateAccountReceipts.id, id));
        return row;
    }

    /**
     * Read-only account balance projection (NOT transaction-safe — use the service
     * for receipt recording which locks the client scope). Returns total billed
     * from active (non-superseded) bills, total received from receipts, and due.
     * Caller must assert Normal Corporate client type first.
     */
    async getAccountBalance(clientId: string): Promise<{
        corporateClientId: string;
        totalBilled: number;
        totalReceived: number;
        totalDue: number;
        activeBillCount: number;
        receiptCount: number;
    }> {
        const bills = await db.select({
            grandTotal: schema.corporateBills.grandTotal,
            billStatus: schema.corporateBills.billStatus,
        }).from(schema.corporateBills)
            .where(eq(schema.corporateBills.corporateClientId, clientId));

        let totalBilled = 0;
        let activeBillCount = 0;
        for (const b of bills) {
            if (b.billStatus === "superseded") continue;
            totalBilled += Number(b.grandTotal) || 0;
            activeBillCount++;
        }

        const receipts = await db.select({
            amount: schema.corporateAccountReceipts.amount,
        }).from(schema.corporateAccountReceipts)
            .where(eq(schema.corporateAccountReceipts.corporateClientId, clientId));

        let totalReceived = 0;
        for (const r of receipts) {
            totalReceived += Number(r.amount) || 0;
        }

        const totalDue = Math.max(0, totalBilled - totalReceived);

        return {
            corporateClientId: clientId,
            totalBilled,
            totalReceived,
            totalDue,
            activeBillCount,
            receiptCount: receipts.length,
        };
    }

    async listLegacyClassifications(): Promise<schema.CorporateBillDueLink[]> {
        return db.select().from(schema.corporateBillDueLinks)
            .orderBy(desc(schema.corporateBillDueLinks.classifiedAt));
    }
}

export const corporateAccountReceiptRepo = new CorporateAccountReceiptRepository();
