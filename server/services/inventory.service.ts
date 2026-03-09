/**
 * Inventory Service
 * 
 * Handles complex business logic involving Inventory, Purchase Orders, 
 * Wastage, and Local Purchases.
 */

import { db } from '../db.js';
import * as schema from '../../shared/schema.js';
import { eq, and, desc, gte, lte } from 'drizzle-orm';

import { nanoid } from 'nanoid';

export class InventoryService {
    /**
     * Creates a Purchase Order and its related items
     */
    async createPurchaseOrder(po: schema.InsertPurchaseOrder, items: schema.InsertPurchaseOrderItem[]): Promise<schema.PurchaseOrder> {
        const poId = po.id || `PO-${nanoid(8).toUpperCase()}`;
        const [newPo] = await db.insert(schema.purchaseOrders).values({
            ...po,
            id: poId,
        }).returning();

        if (items.length > 0) {
            const itemsToInsert = items.map(item => ({
                ...item,
                id: item.id || `POI-${nanoid(10)}`,
                purchaseOrderId: poId,
            }));
            await db.insert(schema.purchaseOrderItems).values(itemsToInsert);
        }

        return newPo;
    }

    /**
     * Creates a Local Purchase and appends the charge to a job ticket
     */
    async createLocalPurchase(purchase: schema.InsertLocalPurchase): Promise<schema.LocalPurchase> {
        const purchaseId = `LP-${nanoid(8).toUpperCase()}`;

        // 1. Insert Local Purchase Record
        const [newPurchase] = await db.insert(schema.localPurchases).values({
            ...purchase,
            id: purchaseId,
        }).returning();

        // 2. Fetch linked Job Ticket
        const [job] = await db.select().from(schema.jobTickets).where(eq(schema.jobTickets.id, purchase.jobTicketId));

        // 3. Auto-append to Job Ticket charges
        if (job) {
            const currentCharges = (job.charges as any[]) || [];
            const newCharge = {
                id: nanoid(8),
                description: `Local Purchase: ${purchase.partName} (${purchase.supplierName || 'Unknown Supplier'})`,
                amount: purchase.sellingPrice,
                type: 'part'
            };

            const updatedCharges = [...currentCharges, newCharge];

            await db.update(schema.jobTickets)
                .set({ charges: updatedCharges })
                .where(eq(schema.jobTickets.id, job.id));
        }

        return newPurchase;
    }

    /**
     * Creates a Wastage Log, decrements stock, and updates serial status if applicable.
     */
    async createWastageLog(log: schema.InsertWastageLog & { reportedBy: string; storeId?: string | null }): Promise<schema.WastageLog> {
        const logId = `WS-${nanoid(8).toUpperCase()}`;

        // 1. Insert Wastage Log Record
        const [newLog] = await db.insert(schema.wastageLogs).values({
            ...log,
            id: logId,
        }).returning();

        // 2. Decrement Inventory Stock
        const [item] = await db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, log.inventoryItemId));
        if (item) {
            await db.update(schema.inventoryItems)
                .set({ stock: Math.max(0, item.stock - (log.quantity || 1)) })
                .where(eq(schema.inventoryItems.id, log.inventoryItemId));
        }

        // 3. Mark Serial as Wasted (if applicable)
        if (log.serialId) {
            await db.update(schema.inventorySerials)
                .set({ status: 'Wasted', jobTicketId: log.jobTicketId || null })
                .where(eq(schema.inventorySerials.id, log.serialId));
        }

        return newLog;
    }
}

export const inventoryService = new InventoryService();
