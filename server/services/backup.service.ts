import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { createHash } from 'crypto';
import { encryptionService } from './encryption.service.js';
import { compressionService } from './compression.service.js';
import { storageService } from './storage.service.js';
import { backupMetadata, backupAuditLogs } from '../../shared/schema.js';
import * as schema from '../../shared/schema.js';
import { nanoid } from 'nanoid';
import { log } from '../app.js';

const BACKUP_PREFIX = 'backups/application/v1';

function buildObjectKey(fileName: string): string {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${BACKUP_PREFIX}/${yyyy}/${mm}/${fileName}`;
}

export class BackupService {

    async createBackup(password: string, userId: string, userName: string, backupType: 'manual' | 'scheduled' = 'manual', description?: string) {
        const startTime = Date.now();
        const backupId = nanoid();

        try {
            log(`[BackupService] Starting ${backupType} backup...`);

            const backupData = await db.transaction(async (tx) => {
                await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`);

                const users = await tx.query.users.findMany();
                const userSessions = await tx.query.userSessions.findMany();

                const jobTickets = await tx.query.jobTickets.findMany();
                const serviceRequests = await tx.query.serviceRequests.findMany();
                const serviceRequestEvents = await tx.query.serviceRequestEvents.findMany();

                const inventoryItems = await tx.query.inventoryItems.findMany();
                const products = await tx.query.products.findMany();
                const productVariants = await tx.query.productVariants.findMany();

                const posTransactions = await tx.query.posTransactions.findMany();

                const orders = await tx.query.orders.findMany();
                const orderItems = await tx.query.orderItems.findMany();
                const refunds = await tx.query.refunds.findMany();
                const warrantyClaims = await tx.query.warrantyClaims.findMany();
                const customerAddresses = await tx.query.customerAddresses.findMany();

                const pettyCashRecords = await tx.query.pettyCashRecords.findMany();
                const dueRecords = await tx.query.dueRecords.findMany();
                const challans = await tx.query.challans.findMany();

                const settings = await tx.query.settings.findMany();
                const serviceCatalog = await tx.query.serviceCatalog.findMany();
                const serviceCategories = await tx.query.serviceCategories.findMany();

                const corporateClients = await tx.query.corporateClients.findMany();
                const corporateChallans = await tx.query.corporateChallans.findMany();
                const corporateBills = await tx.query.corporateBills.findMany();
                const corporateMessageThreads = await tx.query.corporateMessageThreads.findMany();
                const corporateMessages = await tx.query.corporateMessages.findMany();
                const corporatePortalUrgencies = await tx.query.corporatePortalUrgencies.findMany();

                const approvalRequests = await tx.query.approvalRequests.findMany();
                const fraudAlerts = await tx.query.fraudAlerts.findMany();
                const pickupSchedules = await tx.query.pickupSchedules.findMany();
                const attendanceRecords = await tx.query.attendanceRecords.findMany();
                const notifications = await tx.query.notifications.findMany();

                const teamChannels = await tx.query.teamChannels.findMany();
                const teamMessages = await tx.query.teamMessages.findMany();
                const reminders = await tx.query.reminders.findMany();

                const commissionRules = await tx.query.commissionRules.findMany();
                const commissionAssignments = await tx.query.commissionAssignments.findMany();
                const commissionPayouts = await tx.query.commissionPayouts.findMany();

                return {
                    metadata: {
                        version: '1.0',
                        timestamp: new Date().toISOString(),
                        systemVersion: '1.0.0',
                        databaseVersion: 'PostgreSQL 15',
                        counts: {
                            users: users.length,
                            jobTickets: jobTickets.length,
                            orders: orders.length,
                        }
                    },
                    data: {
                        users,
                        userSessions,
                        jobTickets,
                        serviceRequests,
                        serviceRequestEvents,
                        inventoryItems,
                        products,
                        productVariants,
                        posTransactions,
                        orders,
                        orderItems,
                        refunds,
                        warrantyClaims,
                        customerAddresses,
                        pettyCashRecords,
                        dueRecords,
                        challans,
                        settings,
                        serviceCatalog,
                        serviceCategories,
                        corporateClients,
                        corporateChallans,
                        corporateBills,
                        corporateMessageThreads,
                        corporateMessages,
                        corporatePortalUrgencies,
                        approvalRequests,
                        fraudAlerts,
                        pickupSchedules,
                        attendanceRecords,
                        notifications,
                        teamChannels,
                        teamMessages,
                        reminders,
                        commissionRules,
                        commissionAssignments,
                        commissionPayouts,
                    }
                };
            });

            log(`[BackupService] Data fetched. Users: ${backupData.data.users.length}, Jobs: ${backupData.data.jobTickets.length}`);

            const jsonString = JSON.stringify(backupData);
            const compressedBuffer = await compressionService.compress(jsonString);
            log(`[BackupService] Compressed. Size: ${(compressedBuffer.length / 1024 / 1024).toFixed(2)} MB`);

            const encryptedData = await encryptionService.encrypt(compressedBuffer, password);
            const fileContent = JSON.stringify(encryptedData);
            const fileBuffer = Buffer.from(fileContent);
            log(`[BackupService] Encrypted.`);

            const checksum = createHash('sha256').update(fileBuffer).digest('hex');

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `backup_${timestamp}_${backupType}_${nanoid(6)}.enc`;
            const objectKey = buildObjectKey(fileName);

            const r2Key = await storageService.uploadFile(objectKey, fileBuffer, 'application/octet-stream');
            log(`[BackupService] Uploaded to R2. Key prefix: ${BACKUP_PREFIX}`);

            const totalRecords = Object.values(backupData.data).reduce((acc, arr: any[]) => acc + arr.length, 0);
            const tablesIncluded = Object.keys(backupData.data);

            const metadata = await db.insert(backupMetadata).values({
                id: backupId,
                fileName,
                fileSize: fileBuffer.length,
                googleDriveFileId: null,
                storageProvider: 'r2',
                storageObjectKey: r2Key,
                backupType,
                description,

                encryptionVersion: encryptedData.version,
                salt: encryptedData.salt,
                iv: encryptedData.iv,
                authTag: encryptedData.authTag,
                iterations: 100000,

                totalRecords,
                tablesIncluded: tablesIncluded,
                checksum,

                systemVersion: '1.0.0',
                databaseVersion: 'Unknown',

                createdAt: new Date(),
                createdBy: userId,
                status: 'active',
                verified: false
            }).returning();

            await db.insert(backupAuditLogs).values({
                id: nanoid(),
                timestamp: new Date(),
                userId,
                userName,
                action: 'create_backup',
                backupId,
                backupName: fileName,
                success: true,
                metadata: {
                    fileSize: fileBuffer.length,
                    duration: Date.now() - startTime
                }
            });

            return metadata[0];

        } catch (error: any) {
            log(`[BackupService] Failed: ${error.message}`);

            await db.insert(backupAuditLogs).values({
                id: nanoid(),
                timestamp: new Date(),
                userId,
                userName,
                action: 'create_backup',
                success: false,
                errorMessage: error.message
            });

            throw error;
        }
    }
}

export const backupService = new BackupService();
