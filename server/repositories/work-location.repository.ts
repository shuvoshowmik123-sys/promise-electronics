/**
 * Work Location Repository
 *
 * Handles database operations for branch and geofence-aware work locations.
 */

import {
    db,
    nanoid,
    eq,
    desc,
    schema,
    type WorkLocation,
    type InsertWorkLocation,
} from './base.js';

export async function getAllWorkLocations(): Promise<WorkLocation[]> {
    return db
        .select()
        .from(schema.workLocations)
        .orderBy(desc(schema.workLocations.updatedAt));
}

export async function getActiveWorkLocations(): Promise<WorkLocation[]> {
    return db
        .select()
        .from(schema.workLocations)
        .where(eq(schema.workLocations.status, 'Active'))
        .orderBy(desc(schema.workLocations.updatedAt));
}

export async function getWorkLocation(id: string): Promise<WorkLocation | undefined> {
    const [location] = await db
        .select()
        .from(schema.workLocations)
        .where(eq(schema.workLocations.id, id));
    return location;
}

export async function createWorkLocation(location: InsertWorkLocation): Promise<WorkLocation> {
    const [created] = await db
        .insert(schema.workLocations)
        .values({
            ...location,
            id: nanoid(),
            updatedAt: new Date(),
        })
        .returning();
    return created;
}

export async function updateWorkLocation(
    id: string,
    updates: Partial<InsertWorkLocation>
): Promise<WorkLocation | undefined> {
    const [updated] = await db
        .update(schema.workLocations)
        .set({
            ...updates,
            updatedAt: new Date(),
        })
        .where(eq(schema.workLocations.id, id))
        .returning();
    return updated;
}
