/**
 * Pickup Repository
 *
 * Database operations for pickup & delivery schedules (pickup_schedules table).
 * Backs the Pickup & Delivery admin tab and the custody handover flow.
 */

import { db, nanoid, eq, desc, schema, type PickupSchedule, type InsertPickupSchedule } from './base.js';

const { pickupSchedules } = schema;

export async function createPickupSchedule(scheduleInput: InsertPickupSchedule): Promise<PickupSchedule> {
    const id = `PU-${nanoid(10)}`;
    const [created] = await db
        .insert(pickupSchedules)
        .values({ ...scheduleInput, id } as typeof pickupSchedules.$inferInsert)
        .returning();
    return created;
}

export async function getAllPickupSchedules(): Promise<PickupSchedule[]> {
    return db.select().from(pickupSchedules).orderBy(desc(pickupSchedules.createdAt));
}

export async function getPickupSchedule(id: string): Promise<PickupSchedule | undefined> {
    const [row] = await db.select().from(pickupSchedules).where(eq(pickupSchedules.id, id));
    return row;
}

export async function getPickupScheduleByServiceRequestId(serviceRequestId: string): Promise<PickupSchedule | undefined> {
    const [row] = await db
        .select()
        .from(pickupSchedules)
        .where(eq(pickupSchedules.serviceRequestId, serviceRequestId));
    return row;
}

export async function updatePickupSchedule(id: string, updates: Partial<InsertPickupSchedule>): Promise<PickupSchedule | undefined> {
    const [updated] = await db
        .update(pickupSchedules)
        .set(updates as any)
        .where(eq(pickupSchedules.id, id))
        .returning();
    return updated;
}

export async function getPendingPickupSchedules(): Promise<PickupSchedule[]> {
    return db
        .select()
        .from(pickupSchedules)
        .where(eq(pickupSchedules.status, 'Pending'))
        .orderBy(desc(pickupSchedules.createdAt));
}

export async function getPickupSchedulesByStatus(status: string): Promise<PickupSchedule[]> {
    return db
        .select()
        .from(pickupSchedules)
        .where(eq(pickupSchedules.status, status))
        .orderBy(desc(pickupSchedules.createdAt));
}
