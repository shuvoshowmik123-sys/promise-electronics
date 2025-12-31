/**
 * Customer Repository
 * 
 * Handles customer-specific operations:
 * - Customer addresses
 * - Customer reviews
 * - Inquiries
 */

import { db, nanoid, eq, desc, and, sql, schema, type CustomerAddress, type InsertCustomerAddress, type CustomerReview, type InsertCustomerReview, type Inquiry, type InsertInquiry } from './base.js';

// ============================================
// Customer Addresses
// ============================================

export async function getCustomerAddresses(customerId: string): Promise<CustomerAddress[]> {
    return db.select().from(schema.customerAddresses)
        .where(eq(schema.customerAddresses.customerId, customerId))
        .orderBy(desc(schema.customerAddresses.isDefault), desc(schema.customerAddresses.createdAt));
}

export async function getCustomerAddress(id: string): Promise<CustomerAddress | undefined> {
    const [address] = await db.select().from(schema.customerAddresses)
        .where(eq(schema.customerAddresses.id, id));
    return address;
}

export async function createCustomerAddress(address: InsertCustomerAddress): Promise<CustomerAddress> {
    // If setting as default, unset other defaults for this customer
    if (address.isDefault) {
        await db.update(schema.customerAddresses)
            .set({ isDefault: false })
            .where(eq(schema.customerAddresses.customerId, address.customerId));
    }

    const [newAddress] = await db.insert(schema.customerAddresses)
        .values({ ...address, id: nanoid() })
        .returning();
    return newAddress;
}

export async function updateCustomerAddress(
    id: string,
    customerId: string,
    updates: Partial<InsertCustomerAddress>
): Promise<CustomerAddress | undefined> {
    // If setting as default, unset other defaults for this customer
    if (updates.isDefault) {
        await db.update(schema.customerAddresses)
            .set({ isDefault: false })
            .where(and(
                eq(schema.customerAddresses.customerId, customerId),
                sql`${schema.customerAddresses.id} != ${id}`
            ));
    }

    const [updated] = await db
        .update(schema.customerAddresses)
        .set(updates)
        .where(and(
            eq(schema.customerAddresses.id, id),
            eq(schema.customerAddresses.customerId, customerId)
        ))
        .returning();
    return updated;
}

export async function deleteCustomerAddress(id: string, customerId: string): Promise<boolean> {
    const result = await db.delete(schema.customerAddresses)
        .where(and(
            eq(schema.customerAddresses.id, id),
            eq(schema.customerAddresses.customerId, customerId)
        ));
    return (result.rowCount ?? 0) > 0;
}

// ============================================
// Customer Reviews
// ============================================

export async function getAllReviews(): Promise<CustomerReview[]> {
    return db.select().from(schema.customerReviews).orderBy(desc(schema.customerReviews.createdAt));
}

export async function getApprovedReviews(): Promise<CustomerReview[]> {
    return db.select().from(schema.customerReviews)
        .where(eq(schema.customerReviews.isApproved, true))
        .orderBy(desc(schema.customerReviews.createdAt));
}

export async function getCustomerReview(id: string): Promise<CustomerReview | undefined> {
    const [review] = await db.select().from(schema.customerReviews)
        .where(eq(schema.customerReviews.id, id));
    return review;
}

export async function createCustomerReview(review: InsertCustomerReview): Promise<CustomerReview> {
    const [newReview] = await db.insert(schema.customerReviews)
        .values({ ...review, id: nanoid() })
        .returning();
    return newReview;
}

export async function updateReviewApproval(id: string, isApproved: boolean): Promise<CustomerReview | undefined> {
    const [updated] = await db
        .update(schema.customerReviews)
        .set({ isApproved })
        .where(eq(schema.customerReviews.id, id))
        .returning();
    return updated;
}

export async function deleteCustomerReview(id: string): Promise<boolean> {
    const result = await db.delete(schema.customerReviews).where(eq(schema.customerReviews.id, id));
    return (result.rowCount ?? 0) > 0;
}

// ============================================
// Inquiries (Website Contact Form)
// ============================================

export async function getAllInquiries(): Promise<Inquiry[]> {
    return db.select().from(schema.inquiries).orderBy(desc(schema.inquiries.createdAt));
}

export async function getInquiry(id: string): Promise<Inquiry | undefined> {
    const [inquiry] = await db.select().from(schema.inquiries)
        .where(eq(schema.inquiries.id, id));
    return inquiry;
}

export async function createInquiry(inquiry: InsertInquiry): Promise<Inquiry> {
    const [newInquiry] = await db.insert(schema.inquiries)
        .values({ ...inquiry, id: nanoid() })
        .returning();
    return newInquiry;
}

export async function updateInquiryStatus(
    id: string,
    status: "Pending" | "Read" | "Replied"
): Promise<Inquiry | undefined> {
    const [updated] = await db
        .update(schema.inquiries)
        .set({ status })
        .where(eq(schema.inquiries.id, id))
        .returning();
    return updated;
}

export async function deleteInquiry(id: string): Promise<boolean> {
    const result = await db.delete(schema.inquiries).where(eq(schema.inquiries.id, id));
    return (result.rowCount ?? 0) > 0;
}
