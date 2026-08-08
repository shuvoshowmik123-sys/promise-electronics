import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../db.js";

/**
 * The single place stock comes off the shelf for a job.
 *
 * Two paths used to do this independently — the technician saving parts on the
 * job, and the cashier billing a cart — and neither knew the other existed.
 * The same LVDS recorded in both places removed two boards from the count for
 * one board actually fitted. Until now the defence was a rule people had to
 * remember, and the count drifted whenever they did not.
 *
 * Both paths now call claimStockDeduction first. It answers one question —
 * "has this part already come off the shelf for this job?" — and only the
 * caller that gets `true` is allowed to move stock.
 *
 * WHY THE INDEX DOES THE WORK
 *
 * The claim is a single INSERT ... ON CONFLICT DO NOTHING. Two saves racing
 * each other both run it; exactly one creates a row. A SELECT-then-INSERT
 * would let both read "not yet deducted" and both deduct, which is the same
 * bug in a new place.
 */

export type DeductionSource = "job" | "pos";

export interface StockClaim {
    /** True when this caller must now move stock. */
    granted: boolean;
    /**
     * Units to move. Usually the full quantity; on a top-up it is only the
     * increase, because the earlier units already left the shelf.
     */
    quantity: number;
}

/**
 * Claim the right to deduct `quantity` of a part for a job.
 *
 * Returns granted=false when another path already took it. Returns a partial
 * quantity when the recorded amount is being increased — fitting a second
 * capacitor after billing one should remove one more, not two.
 *
 * Reducing a quantity is deliberately NOT handled here. Stock going back on
 * the shelf is a return, and returns belong in the flow that inspects the part
 * rather than in a silent side effect of editing a job.
 */
export async function claimStockDeduction(
    jobTicketId: string,
    inventoryItemId: string,
    quantity: number,
    source: DeductionSource,
    tx?: { execute: (q: any) => Promise<any> },
): Promise<StockClaim> {
    const qty = Math.trunc(Number(quantity));
    if (!jobTicketId || !inventoryItemId || !Number.isFinite(qty) || qty <= 0) {
        return { granted: false, quantity: 0 };
    }
    const runner = tx ?? db;

    const inserted = await runner.execute(sql`
        INSERT INTO job_stock_deductions (id, job_ticket_id, inventory_item_id, quantity, source, created_at)
        VALUES (${randomUUID()}, ${jobTicketId}, ${inventoryItemId}, ${qty}, ${source}, NOW())
        ON CONFLICT (job_ticket_id, inventory_item_id) DO NOTHING
        RETURNING id
    `);
    if ((inserted as any).rowCount > 0) {
        return { granted: true, quantity: qty };
    }

    /**
     * Already claimed. Top up only if this is a genuine increase.
     *
     * The UPDATE is guarded on the stored quantity so two concurrent top-ups
     * cannot both win — the second sees the raised figure and matches nothing.
     */
    const existing = await runner.execute(sql`
        SELECT quantity FROM job_stock_deductions
        WHERE job_ticket_id = ${jobTicketId} AND inventory_item_id = ${inventoryItemId}
    `);
    const already = Number(((existing as any).rows ?? existing)[0]?.quantity ?? 0);
    if (qty <= already) return { granted: false, quantity: 0 };

    const bumped = await runner.execute(sql`
        UPDATE job_stock_deductions
        SET quantity = ${qty}
        WHERE job_ticket_id = ${jobTicketId}
          AND inventory_item_id = ${inventoryItemId}
          AND quantity = ${already}
        RETURNING id
    `);
    if ((bumped as any).rowCount === 0) return { granted: false, quantity: 0 };

    return { granted: true, quantity: qty - already };
}

/**
 * Release a job's claims so the parts can be deducted again.
 *
 * Used when a job's part list is rewritten wholesale and the previous stock
 * movement has already been reversed by the caller. Without this, re-adding a
 * part the technician had removed would be silently refused for the life of
 * the job.
 */
export async function releaseStockDeductions(
    jobTicketId: string,
    tx?: { execute: (q: any) => Promise<any> },
): Promise<void> {
    if (!jobTicketId) return;
    const runner = tx ?? db;
    await runner.execute(sql`
        DELETE FROM job_stock_deductions WHERE job_ticket_id = ${jobTicketId}
    `);
}
