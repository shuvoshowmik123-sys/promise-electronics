/**
 * Inventory Repository
 * 
 * Handles all database operations for inventory items and products.
 */

import { db, nanoid, eq, desc, and, schema, type InventoryItem, type InsertInventoryItem, type Product, type InsertProduct } from './base.js';

// ============================================
// Inventory Queries
// ============================================

export async function getAllInventoryItems(): Promise<InventoryItem[]> {
    return db.select().from(schema.inventoryItems).orderBy(schema.inventoryItems.name);
}

export async function getInventoryItem(id: string): Promise<InventoryItem | undefined> {
    const [item] = await db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, id));
    return item;
}

export async function getWebsiteInventoryItems(): Promise<InventoryItem[]> {
    return db.select().from(schema.inventoryItems)
        .where(eq(schema.inventoryItems.showOnWebsite, true))
        .orderBy(schema.inventoryItems.name);
}

/**
 * Get services from inventory (items with itemType = 'service')
 */
export async function getServicesFromInventory(): Promise<InventoryItem[]> {
    return db.select().from(schema.inventoryItems)
        .where(eq(schema.inventoryItems.itemType, 'service'))
        .orderBy(schema.inventoryItems.displayOrder);
}

/**
 * Get active services visible on website
 */
export async function getActiveServicesFromInventory(): Promise<InventoryItem[]> {
    return db.select().from(schema.inventoryItems)
        .where(and(
            eq(schema.inventoryItems.itemType, 'service'),
            eq(schema.inventoryItems.showOnWebsite, true)
        ))
        .orderBy(schema.inventoryItems.displayOrder);
}

/**
 * Get items with low stock
 */
export async function getLowStockItems(): Promise<InventoryItem[]> {
    return db.select().from(schema.inventoryItems)
        .where(eq(schema.inventoryItems.status, 'Low Stock'))
        .orderBy(schema.inventoryItems.stock);
}

/**
 * Get inventory items visible on Android app (products only)
 */
export async function getInventoryItemsForAndroidApp(): Promise<InventoryItem[]> {
    return db.select().from(schema.inventoryItems)
        .where(and(
            eq(schema.inventoryItems.itemType, 'product'),
            eq(schema.inventoryItems.showOnAndroidApp, true)
        ))
        .orderBy(schema.inventoryItems.name);
}

// ============================================
// Inventory Mutations
// ============================================

export async function createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem> {
    const [newItem] = await db.insert(schema.inventoryItems)
        .values({ ...item, id: item.id || nanoid() })
        .returning();
    return newItem;
}

export async function updateInventoryItem(id: string, updates: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined> {
    const [updated] = await db
        .update(schema.inventoryItems)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.inventoryItems.id, id))
        .returning();
    return updated;
}

export async function deleteInventoryItem(id: string): Promise<boolean> {
    const result = await db.delete(schema.inventoryItems).where(eq(schema.inventoryItems.id, id));
    return (result.rowCount ?? 0) > 0;
}

/**
 * Update stock quantity with automatic status update
 */
export async function updateInventoryStock(id: string, quantityChange: number): Promise<InventoryItem | undefined> {
    const item = await getInventoryItem(id);
    if (!item) return undefined;

    const newStock = Math.max(0, item.stock + quantityChange);
    let status: "In Stock" | "Low Stock" | "Out of Stock" = "In Stock";

    if (newStock === 0) {
        status = "Out of Stock";
    } else if (newStock <= (item.lowStockThreshold || 5)) {
        status = "Low Stock";
    }

    return updateInventoryItem(id, { stock: newStock, status });
}

/**
 * Bulk import inventory items
 */
export async function bulkImportInventory(items: Partial<InsertInventoryItem>[]): Promise<InventoryItem[]> {
    const results: InventoryItem[] = [];

    for (const item of items) {
        if (!item.name || !item.category || item.price === undefined) continue;

        const newItem = await createInventoryItem({
            ...item,
            name: item.name,
            category: item.category,
            price: item.price,
        } as InsertInventoryItem);

        results.push(newItem);
    }

    return results;
}

// ============================================
// Products (Legacy - may be merged with inventory)
// ============================================

export async function getAllProducts(): Promise<Product[]> {
    return db.select().from(schema.products).orderBy(desc(schema.products.createdAt));
}

export async function getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(schema.products).where(eq(schema.products.id, id));
    return product;
}

export async function createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db.insert(schema.products)
        .values({ ...product, id: nanoid() })
        .returning();
    return newProduct;
}

export async function updateProduct(id: string, updates: Partial<InsertProduct>): Promise<Product | undefined> {
    const [updated] = await db
        .update(schema.products)
        .set(updates)
        .where(eq(schema.products.id, id))
        .returning();
    return updated;
}

export async function deleteProduct(id: string): Promise<boolean> {
    const result = await db.delete(schema.products).where(eq(schema.products.id, id));
    return (result.rowCount ?? 0) > 0;
}
