/**
 * Selective removal of QA / test records.
 *
 * Testing against production leaves real rows behind — service requests in the
 * staff queue, customer accounts that can actually log in. This removes them by
 * explicit identifier, never by pattern.
 *
 * Three rules shape everything here:
 *
 * 1. **Explicit targets only.** Callers name exact phone numbers and ticket
 *    numbers. There is no "delete everything matching QA" — a name match would
 *    eventually catch a real customer called something similar.
 *
 * 2. **Refuse rather than orphan.** Plenty of tables carry customer_id or
 *    service_request_id. Rather than guess at a cascade and silently leave
 *    dangling references, anything this module does not know how to clean is a
 *    BLOCKER and the whole delete is refused. A record that has been paid for,
 *    converted to a job, or ordered against is real work, not test junk.
 *
 * 3. **Preview is the same code path as delete.** The preview a Super Admin
 *    approves is produced by the same resolver the deletion uses, so what they
 *    saw is what goes.
 */

import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { normalizePhone } from "../utils/phone.js";

export type CleanupTarget = {
    phones?: string[];
    ticketNumbers?: string[];
    /**
     * Take the jobs with the profile.
     *
     * Off, a customer whose request became a job cannot be removed at all -
     * which is correct for a live shop and useless for clearing demo records,
     * because every realistic test customer has a job behind it.
     *
     * On, the jobs and their operational history go too. Money does not: a job
     * carrying a bill, a payment, a refund or a commission stays a hard blocker
     * whatever this is set to. Those rows are the shop's books, they are read
     * by reports that must still add up next year, and no cleanup tool should
     * be able to quietly change what the business earned.
     */
    includeWork?: boolean;
};

export type CleanupCustomer = {
    userId: string;
    name: string | null;
    phone: string | null;
    role: string | null;
    accountState: string | null;
};

export type CleanupServiceRequest = {
    id: string;
    ticketNumber: string | null;
    phone: string | null;
    customerId: string | null;
    createdAt: string | null;
};

export type CleanupBlocker = {
    kind: string;
    detail: string;
};

export type CleanupPreview = {
    customers: CleanupCustomer[];
    serviceRequests: CleanupServiceRequest[];
    counts: {
        serviceRequests: number;
        serviceRequestEvents: number;
        journeys: number;
        journeyEvents: number;
        inquiries: number;
        resetLinks: number;
        deviceTokens: number;
        customers: number;
        jobs: number;
        jobChildren: number;
        orders: number;
    };
    blockers: CleanupBlocker[];
    safeToDelete: boolean;
};

/**
 * Everything that hangs off a job and is not money.
 *
 * Deleted before the job itself. The financial tables are deliberately absent:
 * bill_line_items, manual_payments, refunds, refund_allocations,
 * commission_payouts, commission_assignments, local_purchases,
 * pending_part_costs and pos_transaction_area_allocations reference jobs too,
 * and if any of them hold a row this whole operation is refused instead. A
 * cleanup that can erase what the shop earned is not a cleanup.
 */
const JOB_CHILD_TABLES = [
    "job_ng_customer_decisions",
    "job_ng_reports",
    "job_extension_requests",
    "job_stock_deductions",
    "corporate_portal_urgencies",
    "diagnosis_training_data",
    "rollback_requests",
    "reminders",
    "quote_logs",
    "warranty_sticker_scans",
    "warranty_stickers",
    "warranty_claims",
    "wastage_logs",
    "approval_requests",
    "notifications",
] as const;

/** Tables whose presence means the books would change. Never deleted. */
const JOB_MONEY_TABLES = [
    "bill_line_items",
    "manual_payments",
    "refunds",
    "refund_allocations",
    "commission_payouts",
    "commission_assignments",
    "local_purchases",
    "pending_part_costs",
    "pos_transaction_area_allocations",
] as const;

function rows<T = any>(result: unknown): T[] {
    return ((result as any)?.rows ?? result ?? []) as T[];
}

/** Empty lists become IN (NULL) — valid SQL matching nothing. */
function idList(ids: string[]) {
    return sql.join((ids.length ? ids : [null]).map((id) => sql`${id}`), sql`, `);
}

/**
 * Resolve the exact rows a cleanup would touch, and everything that makes it
 * unsafe. Read-only.
 */
export async function previewCleanup(target: CleanupTarget): Promise<CleanupPreview> {
    const normalisedPhones = (target.phones ?? [])
        .map((p) => normalizePhone(p))
        .filter((p): p is string => Boolean(p));
    const tickets = (target.ticketNumbers ?? []).map((t) => t.trim()).filter(Boolean);

    const blockers: CleanupBlocker[] = [];

    if (normalisedPhones.length === 0 && tickets.length === 0) {
        return {
            customers: [], serviceRequests: [],
            counts: {
                serviceRequests: 0, serviceRequestEvents: 0, journeys: 0, journeyEvents: 0,
                inquiries: 0, resetLinks: 0, deviceTokens: 0, customers: 0,
                jobs: 0, jobChildren: 0, orders: 0,
            },
            blockers: [{ kind: "no_target", detail: "Give at least one phone number or ticket number." }],
            safeToDelete: false,
        };
    }

    // ── Customers, matched on the indexed normalised column and the raw phone
    // (legacy rows have a null phone_normalized).
    const customers = rows<any>(await db.execute(sql`
        SELECT id, name, phone, role, customer_account_state
        FROM users
        WHERE phone_normalized IN (${idList(normalisedPhones)})
           OR right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10)
               IN (${idList(normalisedPhones)})
    `)).map((r) => ({
        userId: r.id,
        name: r.name ?? null,
        phone: r.phone ?? null,
        role: r.role ?? null,
        accountState: r.customer_account_state ?? null,
    }));

    // Never delete staff. A phone typo that matched a technician must not remove
    // them, so this is a blocker rather than a silent filter.
    for (const c of customers) {
        if (c.role && c.role !== "Customer") {
            blockers.push({
                kind: "not_a_customer",
                detail: `${c.name ?? c.userId} has role "${c.role}". This tool only removes customers.`,
            });
        }
    }

    const customerIds = customers.map((c) => c.userId);

    // ── Service requests: named tickets, plus everything owned by the matched
    // customers or carrying their phone. Deleting a customer while leaving their
    // requests behind is exactly the orphaning this tool exists to avoid.
    const serviceRequests = rows<any>(await db.execute(sql`
        SELECT id, ticket_number, phone, customer_id, converted_job_id, created_at
        FROM service_requests
        WHERE ticket_number IN (${idList(tickets)})
           OR customer_id IN (${idList(customerIds)})
           OR right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10)
               IN (${idList(normalisedPhones)})
    `)).map((r) => ({
        id: r.id,
        ticketNumber: r.ticket_number ?? null,
        phone: r.phone ?? null,
        customerId: r.customer_id ?? null,
        convertedJobId: r.converted_job_id ?? null,
        createdAt: r.created_at ? String(r.created_at) : null,
    }));

    const srIds = serviceRequests.map((s) => s.id);

    /*
     * The jobs this profile owns.
     *
     * Matched two ways because job_tickets has no customer id at all - it keeps
     * the name and phone as text - so a job is only reachable through the
     * normalised phone, or through the request it was converted from. Either
     * alone misses rows: a job raised at the counter has no service request,
     * and a converted request's job may carry a differently formatted number.
     */
    const jobIds = target.includeWork
        ? rows<any>(await db.execute(sql`
            SELECT id FROM job_tickets
            WHERE right(regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g'), 10)
                    IN (${idList(normalisedPhones)})
               OR customer_phone_normalized IN (${idList(normalisedPhones)})
               OR id IN (${idList(serviceRequests.map((r) => r.convertedJobId).filter(Boolean) as string[])})
        `)).map((r) => r.id as string)
        : [];

    // ── Blockers: real work, not test junk.
    for (const sr of serviceRequests) {
        if (sr.convertedJobId && !target.includeWork) {
            blockers.push({
                kind: "converted_to_job",
                detail: `${sr.ticketNumber ?? sr.id} was converted to a job ticket. Close the job first, or tick "include jobs".`,
            });
        }
    }

    /*
     * Money is refused whatever mode this runs in.
     *
     * Checked per table so the message names the one that stopped it - "this
     * job has a bill" and "this job has a commission payout" need different
     * answers from whoever is holding the screen, and a single "it has
     * financial records" tells them nothing about which.
     */
    let jobChildren = 0;
    if (jobIds.length > 0) {
        for (const table of JOB_MONEY_TABLES) {
            const column = table === "local_purchases" ? "job_ticket_id" : "job_id";
            const n = rows<any>(await db.execute(sql`
                SELECT count(*)::int AS n FROM ${sql.identifier(table)}
                WHERE ${sql.identifier(column)} IN (${idList(jobIds)})
            `))[0]?.n ?? 0;
            if (n > 0) {
                blockers.push({
                    kind: "has_money",
                    detail: `${n} row(s) in ${table} belong to these jobs. Refusing — the books are not test data.`,
                });
            }
        }
        for (const table of JOB_CHILD_TABLES) {
            const n = rows<any>(await db.execute(sql`
                SELECT count(*)::int AS n FROM ${sql.identifier(table)}
                WHERE job_id IN (${idList(jobIds)})
            `))[0]?.n ?? 0;
            jobChildren += n;
        }
    }

    const payments = rows<any>(await db.execute(sql`
        SELECT count(*)::int AS n FROM manual_payments
        WHERE service_request_id IN (${idList(srIds)})
    `))[0]?.n ?? 0;
    if (payments > 0) {
        blockers.push({
            kind: "has_payments",
            detail: `${payments} payment record(s) reference these requests. Refusing — payments are never test data.`,
        });
    }

    const orders = rows<any>(await db.execute(sql`
        SELECT count(*)::int AS n FROM orders WHERE customer_id IN (${idList(customerIds)})
    `))[0]?.n ?? 0;
    if (orders > 0) {
        /*
         * A shop order is a sale. It stays refused in both modes - includeWork
         * covers repair work, not the till. If a demo customer has one, the
         * order is the thing to remove first, deliberately, somewhere that
         * records why.
         */
        blockers.push({
            kind: "has_orders",
            detail: `${orders} shop order(s) belong to these customers. Refusing — a sale is not test data.`,
        });
    }

    // ── Dependent row counts, so the approver sees the true blast radius.
    const journeys = rows<any>(await db.execute(sql`
        SELECT id FROM customer_repair_journeys
        WHERE service_request_id IN (${idList(srIds)})
           OR quote_request_id IN (${idList(srIds)})
           OR customer_id IN (${idList(customerIds)})
    `)).map((r) => r.id as string);

    const countOf = async (statement: any) => rows<any>(await db.execute(statement))[0]?.n ?? 0;

    const counts = {
        serviceRequests: serviceRequests.length,
        serviceRequestEvents: await countOf(sql`
            SELECT count(*)::int AS n FROM service_request_events
            WHERE service_request_id IN (${idList(srIds)})`),
        journeys: journeys.length,
        journeyEvents: await countOf(sql`
            SELECT count(*)::int AS n FROM customer_repair_journey_events
            WHERE journey_id IN (${idList(journeys)})`),
        inquiries: await countOf(sql`
            SELECT count(*)::int AS n FROM inquiries
            WHERE right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10)
                IN (${idList(normalisedPhones)})`),
        resetLinks: await countOf(sql`
            SELECT count(*)::int AS n FROM customer_reset_links
            WHERE user_id IN (${idList(customerIds)})`),
        deviceTokens: await countOf(sql`
            SELECT count(*)::int AS n FROM device_tokens
            WHERE user_id IN (${idList(customerIds)})`),
        customers: customers.length,
        jobs: jobIds.length,
        jobChildren,
        orders,
    };

    if (customers.length === 0 && serviceRequests.length === 0) {
        blockers.push({ kind: "no_match", detail: "Nothing matched. Check the phone or ticket number." });
    }

    return {
        customers,
        serviceRequests: serviceRequests.map(({ convertedJobId: _c, ...rest }) => rest),
        counts,
        blockers,
        safeToDelete: blockers.length === 0,
    };
}

export type CleanupResult = {
    deleted: CleanupPreview["counts"];
    customers: CleanupCustomer[];
    serviceRequests: CleanupServiceRequest[];
};

/**
 * Delete exactly what `previewCleanup` resolved, in foreign-key-safe order,
 * inside one transaction. Re-runs the preview first: the caller's approval is
 * only meaningful against the current state, and a blocker that appeared in the
 * meantime must still stop it.
 */
export async function executeCleanup(target: CleanupTarget): Promise<CleanupResult> {
    const preview = await previewCleanup(target);
    if (!preview.safeToDelete) {
        const reasons = preview.blockers.map((b) => b.detail).join(" | ");
        throw new Error(`Refusing to delete: ${reasons}`);
    }

    const customerIds = preview.customers.map((c) => c.userId);
    const srIds = preview.serviceRequests.map((s) => s.id);
    /*
     * Resolved again from the same inputs rather than passed along, so the
     * transaction deletes what the preview counted. If a job appeared between
     * the two calls it is caught by the preview's own re-run at the top of this
     * function, which refuses on any new blocker.
     */
    /*
     * Resolved from the database rather than from the preview it returned.
     *
     * previewCleanup strips convertedJobId off the requests before handing them
     * back - it is internal to the blocker check - so reading it here would
     * silently drop every job that is only reachable through the request it
     * came from, and delete fewer rows than the preview promised. Asking SQL
     * the same question twice is the only way the two agree.
     */
    const execPhones = (target.phones ?? [])
        .map((p) => normalizePhone(p))
        .filter((p): p is string => Boolean(p));
    const jobIds = target.includeWork
        ? rows<any>(await db.execute(sql`
            SELECT id FROM job_tickets
            WHERE right(regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g'), 10)
                    IN (${idList(execPhones)})
               OR customer_phone_normalized IN (${idList(execPhones)})
               OR id IN (
                    SELECT converted_job_id FROM service_requests
                    WHERE id IN (${idList(srIds)}) AND converted_job_id IS NOT NULL
                  )
        `)).map((r) => r.id as string)
        : [];
    const normalisedPhones = (target.phones ?? [])
        .map((p) => normalizePhone(p))
        .filter((p): p is string => Boolean(p));

    await db.transaction(async (tx) => {
        const journeyIds = rows<any>(await tx.execute(sql`
            SELECT id FROM customer_repair_journeys
            WHERE service_request_id IN (${idList(srIds)})
               OR quote_request_id IN (${idList(srIds)})
               OR customer_id IN (${idList(customerIds)})
        `)).map((r) => r.id as string);

        // Children before parents.
        await tx.execute(sql`DELETE FROM customer_repair_journey_events WHERE journey_id IN (${idList(journeyIds)})`);
        await tx.execute(sql`DELETE FROM customer_repair_journeys WHERE id IN (${idList(journeyIds)})`);
        await tx.execute(sql`DELETE FROM service_request_events WHERE service_request_id IN (${idList(srIds)})`);

        /*
         * Jobs and their operational history, before the requests that made
         * them.
         *
         * The preview already refused if any of these jobs carry a bill, a
         * payment, a refund or a commission, so nothing removed here changes
         * what the shop earned. Children first in every case: several of these
         * are declared with onDelete restrict, so the job will not go while a
         * row still points at it - which is the database enforcing exactly the
         * order this loop takes.
         */
        if (jobIds.length > 0) {
            for (const table of JOB_CHILD_TABLES) {
                await tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE job_id IN (${idList(jobIds)})`);
            }
            await tx.execute(sql`UPDATE service_requests SET converted_job_id = NULL WHERE converted_job_id IN (${idList(jobIds)})`);
            await tx.execute(sql`DELETE FROM job_tickets WHERE id IN (${idList(jobIds)})`);
        }

        await tx.execute(sql`DELETE FROM service_requests WHERE id IN (${idList(srIds)})`);
        await tx.execute(sql`DELETE FROM customer_reset_links WHERE user_id IN (${idList(customerIds)})`);
        await tx.execute(sql`DELETE FROM device_tokens WHERE user_id IN (${idList(customerIds)})`);
        await tx.execute(sql`
            DELETE FROM inquiries
            WHERE right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 10)
                IN (${idList(normalisedPhones)})
        `);
        // Customers last, and only ones this tool confirmed are role = 'Customer'.
        await tx.execute(sql`DELETE FROM users WHERE id IN (${idList(customerIds)}) AND role = 'Customer'`);
    });

    return {
        deleted: preview.counts,
        customers: preview.customers,
        serviceRequests: preview.serviceRequests,
    };
}
