import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { encryptionService } from './encryption.service.js';
import { compressionService } from './compression.service.js';
import * as schema from '../../shared/schema.js';
import { log } from '../app.js';
import { BackupService } from './backup.service.js';

interface RestoreResult {
    success: boolean;
    message: string;
    details?: {
        tablesRestored: number;
        totalRecords: number;
        durationMs: number;
    };
}

export class RestorationService {

    /**
     * Validates a backup file and returns its metadata AND schema analysis
     */
    async validateBackup(fileBuffer: Buffer, password: string): Promise<any> {
        try {
            log('[RestorationService] Validating backup...');
            const backupData = await this.decryptAndParse(fileBuffer, password);

            // Basic structure check
            if (!backupData.metadata || !backupData.data) {
                throw new Error('Invalid backup format: missing metadata or data');
            }

            // Schema Analysis
            const analysis = this.analyzeSchema(backupData.data);

            return {
                metadata: backupData.metadata,
                analysis: analysis
            };
        } catch (error: any) {
            log(`[RestorationService] Validation failed: ${error.message}`);
            throw new Error(`Validation failed: ${error.message}`);
        }
    }

    private analyzeSchema(backupData: any) {
        const report: any = {
            tables: [],
            summary: {
                totalTables: 0,
                matched: 0,
                mismatched: 0,
                missingInBackup: 0, // Tables in Schema but not in Backup
                extraInBackup: 0    // Tables in Backup but not in Schema
            }
        };

        // 1. Identify Tables present in Schema
        // We filter out Drizzle relations and other exports, focusing on PgTable instances
        // A simple check is looking for the symbol or properties.
        // But since we can't easily rely on symbols at runtime without imports, 
        // We will drive this by the BACKUP data for now, and check against schema exports.

        const backupTableNames = Object.keys(backupData);

        // 2. Iterate Backup Tables (What we have data for)
        for (const tableName of backupTableNames) {
            const currentTableSchema = (schema as any)[tableName];

            if (!currentTableSchema) {
                // Table exists in backup but NOT in current codebase (Deprecated/Removed feature)
                report.tables.push({
                    name: tableName,
                    status: 'extra',
                    message: 'Table removed from system. Data will be ignored.',
                    details: { missing: [], extra: [], status: 'ignored' }
                });
                report.summary.extraInBackup++;
                continue;
            }

            const rows = backupData[tableName];
            // If empty table, we consider it efficient match or just empty.
            if (!Array.isArray(rows) || rows.length === 0) {
                report.tables.push({
                    name: tableName,
                    status: 'ok',
                    message: 'Table empty in backup.',
                    details: { missing: [], extra: [], status: 'ok' }
                });
                report.summary.matched++;
                continue;
            }

            // 3. Compare Columns
            // Backup Columns: Keys of the first row
            const backupColumns = Object.keys(rows[0]);

            // Schema Columns: Keys of the Drizzle Table Object that look like columns
            // In Drizzle, column definitions are properties of the table object.
            // They are usually objects with a 'name', 'notNull', etc.
            // We ignore standard properties like underscores or functions.
            const schemaColumns = Object.keys(currentTableSchema).filter(key => {
                const val = (currentTableSchema as any)[key];
                // Check if it looks like a column object (has name, matches key or mapped name)
                return typeof val === 'object' && val !== null && 'name' in val;
            });

            // If we can't detect columns (e.g. minification), we fallback to "Assume OK" or strict?
            // Let's assume OK if list is empty to prevent blocking, but warn.
            if (schemaColumns.length === 0) {
                report.tables.push({
                    name: tableName,
                    status: 'warn',
                    message: 'Could not verify schema columns. Proceed with caution.',
                    details: { missing: [], extra: [], status: 'unknown' }
                });
                report.summary.matched++; // counting as matched to pass Validation
                continue;
            }

            // Missing in Backup = In Schema BUT NOT in Backup (New Features) -> Use Default
            const missingInBackup = schemaColumns.filter(col => !backupColumns.includes(col));

            // Extra in Backup = In Backup BUT NOT in Schema (Deprecated Columns) -> Ignore
            const extraInBackup = backupColumns.filter(col => !schemaColumns.includes(col));

            if (missingInBackup.length === 0 && extraInBackup.length === 0) {
                report.tables.push({
                    name: tableName,
                    status: 'ok',
                    message: `${rows.length} records. Perfect match.`,
                    details: { missing: [], extra: [], status: 'match' }
                });
                report.summary.matched++;
            } else {
                let msgParts = [];
                if (missingInBackup.length > 0) msgParts.push(`${missingInBackup.length} new columns (using defaults)`);
                if (extraInBackup.length > 0) msgParts.push(`${extraInBackup.length} old columns (ignored)`);

                report.tables.push({
                    name: tableName,
                    status: 'mismatch', // This will be Yellow/Warning in UI
                    message: msgParts.join(', '),
                    details: { missing: missingInBackup, extra: extraInBackup, status: 'mismatch' }
                });
                report.summary.mismatched++;
            }
        }

        report.summary.totalTables = report.tables.length;
        report.tables.sort((a: any, b: any) => {
            // Sort Error/Mismatch to top
            if (a.status === 'mismatch' && b.status !== 'mismatch') return -1;
            if (b.status === 'mismatch' && a.status !== 'mismatch') return 1;
            return a.name.localeCompare(b.name);
        });

        return report;
    }

    /**
     * Executes the full restore process.
     * WARNING: DESTRUCTIVE OPERATION. Wipes existing data.
     */
    async restoreBackup(fileBuffer: Buffer, password: string): Promise<RestoreResult> {
        const startTime = Date.now();
        log('[RestorationService] Starting restore process...');

        // 1. Decrypt & Parse
        const backup = await this.decryptAndParse(fileBuffer, password);
        const data = backup.data;

        if (!data) {
            throw new Error('Backup contains no data');
        }

        // 2. Transactional Restore
        return await db.transaction(async (tx) => {
            try {
                // A. Disable Foreign Key Checks (Postgres Specific - requires superuser or specific setup)
                // Alternative: Delete in reverse order, Insert in correct order.
                // We will TRY TRUNCATE CASCADE on main tables first.

                log('[RestorationService] Wiping existing data...');

                // We truncate tables that are dependencies first or just use CASCADE
                // Note: Drizzle doesn't have a simple "truncate all", so we do it explicitly.
                // Order matters less for truncate cascade, but good to be thorough.

                const tablesToTruncate = [
                    'corporate_portal_urgencies',
                    'corporate_messages',
                    'corporate_message_threads',
                    'corporate_bills',
                    'corporate_challans',
                    'corporate_clients',
                    'job_tickets',
                    'service_request_events',
                    'pickup_schedules',
                    'service_requests',
                    'attendance_records',
                    'notifications',
                    'user_sessions',
                    'users',
                    'inventory_items',
                    'products',
                    'product_variants',
                    'orders',
                    'order_items',
                    'refunds',
                    'warranty_claims',
                    'pos_transactions',
                    'due_records',
                    'petty_cash_records',
                    'challans',
                    'settings',
                    'service_catalog',
                    'service_categories',
                    'customer_addresses',
                    'approval_requests',
                    'fraud_alerts',
                    'backup_schedules', // Don't wipe backup metadata/logs? Maybe keep logs.
                    // 'backup_metadata', // KEEP THIS! We don't want to lose backup history.
                    // 'backup_audit_logs' // KEEP THIS!
                ];

                // Safe truncation with CASCADE
                for (const tableName of tablesToTruncate) {
                    await tx.execute(sql.raw(`TRUNCATE TABLE "${tableName}" CASCADE`));
                }

                // B. Insert Data (Topological Order)

                log('[RestorationService] Inserting data...');
                let totalRecords = 0;

                // Helper to insert batch
                const insertBatch = async (table: any, rows: any[], name: string) => {
                    if (!rows || rows.length === 0) return;
                    // Split into chunks if too large (Postgres limit ~65535 params)
                    const chunkSize = 1000;
                    for (let i = 0; i < rows.length; i += chunkSize) {
                        const chunk = rows.slice(i, i + chunkSize);
                        // Fix Dates: JSON stringifies dates, we need to ensure Drizzle treats them right.
                        // Drizzle/Postgres usually handles ISO strings fine, but let's be safe if issues arise.
                        await tx.insert(table).values(chunk);
                    }
                    totalRecords += rows.length;
                    log(`[RestorationService] Restored ${rows.length} records to ${name}`);
                };

                // --- Level 0 (Helpers / Independent) ---
                await insertBatch(schema.settings, data.settings, 'settings');
                await insertBatch(schema.serviceCategories, data.serviceCategories, 'serviceCategories');
                await insertBatch(schema.serviceCatalog, data.serviceCatalog, 'serviceCatalog');
                await insertBatch(schema.products, data.products, 'products'); // Independent
                await insertBatch(schema.corporateClients, data.corporateClients, 'corporateClients'); // Independent-ish

                // --- Level 1 (Base Entities) ---
                await insertBatch(schema.users, data.users, 'users'); // Technicians, Customers
                await insertBatch(schema.inventoryItems, data.inventoryItems, 'inventoryItems'); // Depends on Category?

                // --- Level 2 (Direct Dependencies) ---
                await insertBatch(schema.productVariants, data.productVariants, 'productVariants');
                await insertBatch(schema.userSessions, data.userSessions, 'userSessions');
                await insertBatch(schema.attendanceRecords, data.attendanceRecords, 'attendanceRecords');
                await insertBatch(schema.notifications, data.notifications, 'notifications');
                await insertBatch(schema.customerAddresses, data.customerAddresses || [], 'customerAddresses'); // If exists
                await insertBatch(schema.corporateChallans, data.corporateChallans, 'corporateChallans');

                // --- Level 3 (Core Operational) ---
                await insertBatch(schema.jobTickets, data.jobTickets, 'jobTickets');
                await insertBatch(schema.serviceRequests, data.serviceRequests, 'serviceRequests');
                await insertBatch(schema.challans, data.challans, 'challans');

                // --- Level 4 (Operational Children) ---
                await insertBatch(schema.serviceRequestEvents, data.serviceRequestEvents, 'serviceRequestEvents');
                await insertBatch(schema.pickupSchedules, data.pickupSchedules, 'pickupSchedules');
                await insertBatch(schema.corporateBills, data.corporateBills, 'corporateBills');
                await insertBatch(schema.corporateMessageThreads, data.corporateMessageThreads, 'corporateMessageThreads');
                await insertBatch(schema.corporateMessages, data.corporateMessages, 'corporateMessages');
                await insertBatch(schema.corporatePortalUrgencies, data.corporatePortalUrgencies, 'corporatePortalUrgencies');

                // --- Level 5 (Commerce) ---
                await insertBatch(schema.orders, data.orders, 'orders');
                await insertBatch(schema.orderItems, data.orderItems, 'orderItems'); // Depends on Orders & Products
                await insertBatch(schema.posTransactions, data.posTransactions, 'posTransactions');
                await insertBatch(schema.dueRecords, data.dueRecords, 'dueRecords');
                await insertBatch(schema.pettyCashRecords, data.pettyCashRecords, 'pettyCashRecords');

                // --- Level 6 (Post-Sales / Misc) ---
                await insertBatch(schema.refunds, data.refunds, 'refunds');
                await insertBatch(schema.warrantyClaims, data.warrantyClaims, 'warrantyClaims');
                await insertBatch(schema.approvalRequests, data.approvalRequests, 'approvalRequests');
                await insertBatch(schema.fraudAlerts, data.fraudAlerts, 'fraudAlerts');

                // Final Commit is automatic if no error thrown

                log('[RestorationService] Restore completed successfully.');
                return {
                    success: true,
                    message: 'System restored successfully',
                    details: {
                        tablesRestored: Object.keys(data).length,
                        totalRecords,
                        durationMs: Date.now() - startTime
                    }
                };

            } catch (error: any) {
                log(`[RestorationService] Restore Transaction Failed: ${error.message}`);
                tx.rollback(); // Explicit rollback (Drizzle usually handles this but good practice to be aware)
                throw error;
            }
        });

    }

    private async decryptAndParse(fileBuffer: Buffer, password: string): Promise<any> {
        // 1. Parse outer JSON to get encryption envelope
        const fileContent = fileBuffer.toString('utf-8');
        let encryptedData;
        try {
            encryptedData = JSON.parse(fileContent);
        } catch (e) {
            throw new Error('Invalid file format: Not a valid JSON file');
        }

        if (!encryptedData.iv || !encryptedData.content) {
            throw new Error('Invalid or corrupted backup file');
        }

        // 2. Decrypt
        const compressedBuffer = await encryptionService.decrypt(encryptedData, password);

        // 3. Decompress
        const jsonString = await compressionService.decompress(compressedBuffer);

        // 4. Parse inner JSON
        return JSON.parse((jsonString as unknown) as string);
    }
}

export const restorationService = new RestorationService();
