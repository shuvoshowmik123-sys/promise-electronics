/**
 * Canonical Customer Service (Phase C — credential binding)
 *
 * One canonical customer record per phone.
 * - findByPhone: match on normalized last-10-digits
 * - bindToJob: create/update record on job creation, auto-upgrade online→repeat
 * - recordJobClosed: update stats when job completes
 * - buildContextBlock: AI prompt injection for repeat/reference clients
 */

import { db } from '../db.js';
import { customers } from '../../shared/schema.js';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export function normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '').slice(-10);
}

export async function findCustomerByPhone(phone: string) {
    const norm = normalizePhone(phone);
    if (!norm || norm.length < 7) return null;
    try {
        const rows = await db.select().from(customers)
            .where(sql`right(regexp_replace(${customers.primaryPhone}, '[^0-9]', '', 'g'), 10) = ${norm}`)
            .limit(1);
        return rows[0] ?? null;
    } catch {
        return null;
    }
}

export async function createOrUpdateCustomer(input: {
    primaryPhone?: string | null;
    name?: string | null;
    address?: string | null;
    area?: string | null;
    clientClass?: string;
    isShopName?: boolean;
    notes?: string | null;
}) {
    if (!input.primaryPhone) return null;
    const existing = await findCustomerByPhone(input.primaryPhone);
    if (existing) {
        await db.update(customers).set({
            ...(input.name        ? { name: input.name }              : {}),
            ...(input.address     ? { address: input.address }        : {}),
            ...(input.area        ? { area: input.area }              : {}),
            ...(input.clientClass ? { clientClass: input.clientClass }: {}),
            updatedAt: new Date(),
        }).where(eq(customers.id, existing.id));
        return existing;
    }
    const [created] = await db.insert(customers).values({
        id: `cust_${nanoid(10)}`,
        primaryPhone: input.primaryPhone,
        name: input.name ?? null,
        address: input.address ?? null,
        area: input.area ?? null,
        clientClass: input.clientClass ?? 'online',
        isShopName: input.isShopName ?? false,
        notes: input.notes ?? null,
    }).returning();
    return created;
}

// Called from job creation: binds customer record; upgrades online→repeat automatically
export async function bindCustomerToJob(phone?: string | null, name?: string | null, address?: string | null) {
    if (!phone) return null;
    const customer = await createOrUpdateCustomer({ primaryPhone: phone, name, address });
    if (!customer) return null;
    if (customer.totalJobs >= 1 && customer.clientClass === 'online') {
        await db.update(customers)
            .set({ clientClass: 'repeat', updatedAt: new Date() })
            .where(eq(customers.id, customer.id));
    }
    return customer;
}

// Called when job status → Completed/Delivered: update lifetime stats
export async function recordJobClosed(phone?: string | null, jobTotal: number = 0) {
    if (!phone) return;
    const customer = await findCustomerByPhone(phone);
    if (!customer) return;
    await db.update(customers).set({
        totalJobs:  sql`${customers.totalJobs} + 1`,
        totalSpend: sql`${customers.totalSpend} + ${jobTotal}`,
        lastJobAt:  new Date(),
        updatedAt:  new Date(),
    }).where(eq(customers.id, customer.id));
}

// Returns a short text block for AI system prompt (repeat/reference clients only)
export function buildCustomerContextBlock(customer: NonNullable<Awaited<ReturnType<typeof findCustomerByPhone>>>) {
    const lines = [`KNOWN CUSTOMER: ${customer.name || 'Unknown'}`];
    if (customer.totalJobs > 0) lines.push(`${customer.totalJobs} prior job(s)`);
    if (customer.address)  lines.push(`Address: ${customer.address}${customer.area ? ', ' + customer.area : ''}`);
    if (customer.lastJobAt) lines.push(`Last job: ${new Date(customer.lastJobAt).toDateString()}`);
    if (customer.clientClass === 'reference') lines.push(`Referred customer — handle with care.`);
    if (customer.notes) lines.push(`Note: ${customer.notes}`);
    return lines.join('. ') + '.';
}
