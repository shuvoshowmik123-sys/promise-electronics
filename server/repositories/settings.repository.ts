/**
 * Settings Repository
 * 
 * Handles all database operations for:
 * - System settings
 * - Policies (privacy, warranty, terms)
 * - Service catalog
 * - Service categories
 */

import { db, nanoid, eq, desc, asc, schema, type Setting, type InsertSetting, type Policy, type ServiceCatalog, type InsertServiceCatalog } from './base.js';
import type { ServiceCategory, InsertServiceCategory } from '../../shared/schema.js';

// ============================================
// Settings Operations
// ============================================

export async function getAllSettings(): Promise<Setting[]> {
    return db.select().from(schema.settings);
}

export async function getSetting(key: string): Promise<Setting | undefined> {
    const [setting] = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
    return setting;
}

export async function upsertSetting(setting: InsertSetting): Promise<Setting> {
    const [upserted] = await db
        .insert(schema.settings)
        .values({ ...setting, id: nanoid() })
        .onConflictDoUpdate({
            target: schema.settings.key,
            set: { value: setting.value, updatedAt: new Date() },
        })
        .returning();
    return upserted;
}

// ============================================
// Policy Operations
// ============================================

export async function getAllPolicies(): Promise<Policy[]> {
    return db.select().from(schema.policies).orderBy(schema.policies.slug);
}

export async function getPolicyBySlug(slug: string): Promise<Policy | undefined> {
    const [policy] = await db.select().from(schema.policies).where(eq(schema.policies.slug, slug));
    return policy;
}

export async function upsertPolicy(policy: { slug: string; title: string; content: string; isPublished?: boolean }): Promise<Policy> {
    const existing = await getPolicyBySlug(policy.slug);

    if (existing) {
        const [updated] = await db
            .update(schema.policies)
            .set({
                title: policy.title,
                content: policy.content,
                isPublished: policy.isPublished ?? true,
                lastUpdated: new Date(),
            })
            .where(eq(schema.policies.slug, policy.slug))
            .returning();
        return updated;
    }

    const [newPolicy] = await db.insert(schema.policies)
        .values({
            id: nanoid(),
            slug: policy.slug,
            title: policy.title,
            content: policy.content,
            isPublished: policy.isPublished ?? true,
        })
        .returning();
    return newPolicy;
}

export async function deletePolicy(slug: string): Promise<boolean> {
    const result = await db.delete(schema.policies).where(eq(schema.policies.slug, slug));
    return (result.rowCount ?? 0) > 0;
}

// ============================================
// Service Catalog Operations
// ============================================

export async function getAllServiceCatalog(): Promise<ServiceCatalog[]> {
    return db.select().from(schema.serviceCatalog).orderBy(asc(schema.serviceCatalog.displayOrder));
}

export async function getActiveServiceCatalog(): Promise<ServiceCatalog[]> {
    return db.select().from(schema.serviceCatalog)
        .where(eq(schema.serviceCatalog.isActive, true))
        .orderBy(asc(schema.serviceCatalog.displayOrder));
}

export async function getServiceCatalogItem(id: string): Promise<ServiceCatalog | undefined> {
    const [item] = await db.select().from(schema.serviceCatalog).where(eq(schema.serviceCatalog.id, id));
    return item;
}

export async function createServiceCatalogItem(item: InsertServiceCatalog): Promise<ServiceCatalog> {
    const [newItem] = await db.insert(schema.serviceCatalog)
        .values({ ...item, id: nanoid() })
        .returning();
    return newItem;
}

export async function updateServiceCatalogItem(id: string, updates: Partial<InsertServiceCatalog>): Promise<ServiceCatalog | undefined> {
    const [updated] = await db
        .update(schema.serviceCatalog)
        .set(updates)
        .where(eq(schema.serviceCatalog.id, id))
        .returning();
    return updated;
}

export async function deleteServiceCatalogItem(id: string): Promise<boolean> {
    const result = await db.delete(schema.serviceCatalog).where(eq(schema.serviceCatalog.id, id));
    return (result.rowCount ?? 0) > 0;
}

// ============================================
// Service Categories Operations
// ============================================

export async function getAllServiceCategories(): Promise<ServiceCategory[]> {
    return db.select().from(schema.serviceCategories).orderBy(asc(schema.serviceCategories.displayOrder));
}

export async function getServiceCategory(id: string): Promise<ServiceCategory | undefined> {
    const [category] = await db.select().from(schema.serviceCategories).where(eq(schema.serviceCategories.id, id));
    return category;
}

export async function createServiceCategory(category: InsertServiceCategory): Promise<ServiceCategory> {
    const [newCategory] = await db.insert(schema.serviceCategories)
        .values({ ...category, id: nanoid() })
        .returning();
    return newCategory;
}

export async function updateServiceCategory(id: string, updates: Partial<InsertServiceCategory>): Promise<ServiceCategory | undefined> {
    const [updated] = await db
        .update(schema.serviceCategories)
        .set(updates)
        .where(eq(schema.serviceCategories.id, id))
        .returning();
    return updated;
}

export async function deleteServiceCategory(id: string): Promise<boolean> {
    const result = await db.delete(schema.serviceCategories).where(eq(schema.serviceCategories.id, id));
    return (result.rowCount ?? 0) > 0;
}
