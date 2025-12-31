/**
 * Order Repository
 * 
 * Handles E-commerce orders and product variants.
 */

import { db, nanoid, eq, desc, schema, type Order, type InsertOrder, type OrderItem, type InsertOrderItem, type ProductVariant, type InsertProductVariant } from './base.js';

// ============================================
// Order Queries
// ============================================

export async function getAllOrders(): Promise<Order[]> {
    return db.select().from(schema.orders).orderBy(desc(schema.orders.createdAt));
}

export async function getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
    return order;
}

export async function getOrderByOrderNumber(orderNumber: string): Promise<Order | undefined> {
    const [order] = await db.select().from(schema.orders)
        .where(eq(schema.orders.orderNumber, orderNumber));
    return order;
}

export async function getOrdersByCustomerId(customerId: string): Promise<Order[]> {
    return db.select().from(schema.orders)
        .where(eq(schema.orders.customerId, customerId))
        .orderBy(desc(schema.orders.createdAt));
}

export async function getOrderItems(orderId: string): Promise<OrderItem[]> {
    return db.select().from(schema.orderItems)
        .where(eq(schema.orderItems.orderId, orderId));
}

/**
 * Get next order number in format ORD-YYYYMMDD-XXXX
 */
async function getNextOrderNumber(): Promise<string> {
    const now = new Date();
    const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, "");

    const allOrders = await db.select({ orderNumber: schema.orders.orderNumber }).from(schema.orders);
    const todayOrders = allOrders.filter(o => o.orderNumber?.startsWith(`ORD-${datePrefix}`));

    const sequence = (todayOrders.length + 1).toString().padStart(4, "0");
    return `ORD-${datePrefix}-${sequence}`;
}

// ============================================
// Order Mutations
// ============================================

export async function createOrder(order: InsertOrder, items: InsertOrderItem[]): Promise<Order> {
    const orderNumber = await getNextOrderNumber();
    const orderId = nanoid();

    // Create order
    const [newOrder] = await db.insert(schema.orders)
        .values({ ...order, id: orderId, orderNumber })
        .returning();

    // Create order items
    for (const item of items) {
        await db.insert(schema.orderItems)
            .values({ ...item, id: nanoid(), orderId });
    }

    return newOrder;
}

export async function updateOrder(id: string, updates: Partial<InsertOrder>): Promise<Order | undefined> {
    const [updated] = await db
        .update(schema.orders)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.orders.id, id))
        .returning();
    return updated;
}

export async function updateOrderStatus(id: string, status: string, declineReason?: string): Promise<Order | undefined> {
    const updates: any = { status, updatedAt: new Date() };
    if (declineReason) {
        updates.declineReason = declineReason;
    }

    const [updated] = await db
        .update(schema.orders)
        .set(updates)
        .where(eq(schema.orders.id, id))
        .returning();
    return updated;
}

export async function deleteOrder(id: string): Promise<boolean> {
    // First delete order items
    await db.delete(schema.orderItems).where(eq(schema.orderItems.orderId, id));

    // Then delete order
    const result = await db.delete(schema.orders).where(eq(schema.orders.id, id));
    return (result.rowCount ?? 0) > 0;
}

// ============================================
// Product Variants
// ============================================

export async function getProductVariants(productId: string): Promise<ProductVariant[]> {
    return db.select().from(schema.productVariants)
        .where(eq(schema.productVariants.productId, productId));
}

export async function getProductVariant(id: string): Promise<ProductVariant | undefined> {
    const [variant] = await db.select().from(schema.productVariants)
        .where(eq(schema.productVariants.id, id));
    return variant;
}

export async function createProductVariant(variant: InsertProductVariant): Promise<ProductVariant> {
    const [newVariant] = await db.insert(schema.productVariants)
        .values({ ...variant, id: nanoid() })
        .returning();
    return newVariant;
}

export async function updateProductVariant(id: string, updates: Partial<InsertProductVariant>): Promise<ProductVariant | undefined> {
    const [updated] = await db
        .update(schema.productVariants)
        .set(updates)
        .where(eq(schema.productVariants.id, id))
        .returning();
    return updated;
}

export async function deleteProductVariant(id: string): Promise<boolean> {
    const result = await db.delete(schema.productVariants).where(eq(schema.productVariants.id, id));
    return (result.rowCount ?? 0) > 0;
}

export async function deleteProductVariantsByProductId(productId: string): Promise<boolean> {
    const result = await db.delete(schema.productVariants)
        .where(eq(schema.productVariants.productId, productId));
    return (result.rowCount ?? 0) > 0;
}
