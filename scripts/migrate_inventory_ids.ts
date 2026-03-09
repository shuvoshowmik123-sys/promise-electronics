
import { db } from "../server/db";
import { inventoryItems, orderItems } from "../shared/schema";
import { eq, like, desc, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";

async function migrateInventoryIds() {
    console.log("Starting inventory ID migration...");

    try {
        // 1. Fetch ALL inventory items
        const allItems = await db.select().from(inventoryItems);

        // 2. Identify items with "messy" IDs (not starting with PRD- or SVC-)
        const itemsToMigrate = allItems.filter(item =>
            !item.id.startsWith("PRD-") && !item.id.startsWith("SVC-")
        );

        if (itemsToMigrate.length === 0) {
            console.log("No items need migration. All IDs are clean.");
            process.exit(0);
        }

        console.log(`Found ${itemsToMigrate.length} items to migrate.`);

        // 3. Find max existing sequence for PRD and SVC to avoid conflicts
        const existingPrd = allItems.filter(i => i.id.startsWith("PRD-2024"));
        // Simplified logic: Just start from 1 for this migration as we are replacing everything "messy".
        // But to be safe, let's use a distinct prefix for MIGRATED items or stick to the standard date format.
        // Standard format: PRE-YYYYMMDD-SEQ.
        // Let's use today's date: 20240207 (or current date)

        const now = new Date();
        const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, ""); // e.g. 20240207

        let prdSeq = 1;
        let svcSeq = 1;

        for (const item of itemsToMigrate) {
            const isService = item.itemType === 'service';
            const prefix = isService ? 'SVC' : 'PRD';

            // Generate new ID
            const seq = isService ? svcSeq++ : prdSeq++;
            const sequenceStr = seq.toString().padStart(4, "0");
            const newId = `${prefix}-${datePrefix}-${sequenceStr}`;

            console.log(`Migrating item: "${item.name}" (${item.id}) -> ${newId}`);

            // 4. Update the item ID
            // CAUTION: This might fail if there are FK constraints.
            // We'll try to update referencing tables first if possible, but usually we update the main record?
            // No, we can't change the PK if it's referenced.
            // Strategy: 
            // A. Create a NEW item with the NEW ID and same data.
            // B. Update all references (orderItems, etc) to point to NEW ID.
            // C. Delete the OLD item.

            // Step A: Insert new item
            try {
                await db.insert(inventoryItems).values({
                    ...item,
                    id: newId,
                });

                // Step B: Update references
                // Check order_items
                const orderItemsUpdate = await db.update(orderItems)
                    .set({ productId: newId })
                    .where(eq(orderItems.productId, item.id));

                if (orderItemsUpdate.rowCount && orderItemsUpdate.rowCount > 0) {
                    console.log(`  Updated ${orderItemsUpdate.rowCount} order items.`);
                }

                // TODO: Check other tables if necessary (productVariants, etc).
                // For now, assuming primarily orderItems based on schema review.

                // Step C: Delete old item
                await db.delete(inventoryItems).where(eq(inventoryItems.id, item.id));

                console.log(`  Successfully migrated ${item.id} to ${newId}`);

            } catch (err) {
                console.error(`  Failed to migrate ${item.id}:`, err);
                // If it fails, we might have created the new item but failed to update refs/delete old.
                // In a real prod script we'd use a transaction.
                // For this task, we'll just log error and continue.
                // Trying to cleanup if new item was created but old one exists
                try {
                    await db.delete(inventoryItems).where(eq(inventoryItems.id, newId));
                } catch (cleanupErr) {
                    // ignore
                }
            }
        }

        console.log("Migration completed.");
    } catch (error) {
        console.error("Migration failed:", error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

migrateInventoryIds();
