import { db } from "../db.js";
import { count, desc, eq, and, sql, not, inArray, sum, gte, lt, asc, like, lte } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as schema from "../../shared/schema.js";
import { PaginationResult } from "./base.js";
import type {
    CorporateClient,
    InsertCorporateClient,
    JobTicket,
    Challan,
    CorporateMessageThread,
    InsertCorporateMessageThread,
    CorporateMessage,
    InsertCorporateMessage
} from "../../shared/schema.js";
import { normalizePhone } from "../utils/phone.js";

export class CorporateRepository {
    async getAllCorporateClients(): Promise<CorporateClient[]> {
        return db.select().from(schema.corporateClients).orderBy(desc(schema.corporateClients.createdAt));
    }

    async getCorporateClient(id: string): Promise<CorporateClient | undefined> {
        const [client] = await db.select().from(schema.corporateClients).where(eq(schema.corporateClients.id, id));
        return client;
    }

    async createCorporateClient(client: InsertCorporateClient): Promise<CorporateClient> {
        const [created] = await db.insert(schema.corporateClients).values({
            ...client,
            id: nanoid()
        }).returning();
        return created;
    }

    async updateCorporateClient(id: string, updates: Partial<schema.InsertCorporateClient>): Promise<CorporateClient | undefined> {
        const [updated] = await db
            .update(schema.corporateClients)
            .set({ ...updates, updatedAt: new Date() })
            .where(eq(schema.corporateClients.id, id))
            .returning();
        return updated;
    }

    async getCorporateClientBranches(parentId: string): Promise<CorporateClient[]> {
        return db
            .select()
            .from(schema.corporateClients)
            .where(eq(schema.corporateClients.parentClientId, parentId))
            .orderBy(asc(schema.corporateClients.branchName));
    }

    async getJobsByCorporateClient(clientId: string, page: number = 1, limit: number = 50, status?: string): Promise<PaginationResult<JobTicket>> {
        const offset = (page - 1) * limit;

        let conditions = [eq(schema.jobTickets.corporateClientId, clientId)];
        if (status) {
            conditions.push(eq(schema.jobTickets.status, status));
        }

        const [countResult] = await db.select({ count: count() })
            .from(schema.jobTickets)
            .where(and(...conditions));

        const total = Number(countResult?.count || 0);
        const pages = Math.ceil(total / limit);

        const items = await db.select()
            .from(schema.jobTickets)
            .where(and(...conditions))
            .orderBy(desc(schema.jobTickets.createdAt))
            .limit(limit)
            .offset(offset);

        return { items, pagination: { total, page, limit, pages } };
    }

    async getCorporateDashboardStats(clientId: string): Promise<{
        activeJobs: number;
        pendingApprovals: number;
        totalSpentMonth: number;
        recentActivity: any[];
    }> {
        const [activeJobsCount] = await db.select({ count: count() })
            .from(schema.jobTickets)
            .where(and(
                eq(schema.jobTickets.corporateClientId, clientId),
                not(inArray(schema.jobTickets.status, ['Completed', 'Delivered', 'Cancelled', 'Closed']))
            ));

        const [pendingApprovalsCount] = await db.select({ count: count() })
            .from(schema.jobTickets)
            .where(and(
                eq(schema.jobTickets.corporateClientId, clientId),
                eq(schema.jobTickets.status, 'Quote Sent')
            ));

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [spentResult] = await db.select({ total: sum(schema.corporateBills.grandTotal) })
            .from(schema.corporateBills)
            .where(and(
                eq(schema.corporateBills.corporateClientId, clientId),
                gte(schema.corporateBills.createdAt, startOfMonth)
            ));

        const recentActivity = await db.select({
            id: schema.jobTickets.id,
            device: schema.jobTickets.device,
            status: schema.jobTickets.status,
            updatedAt: schema.jobTickets.createdAt
        })
            .from(schema.jobTickets)
            .where(eq(schema.jobTickets.corporateClientId, clientId))
            .orderBy(desc(schema.jobTickets.createdAt))
            .limit(5);

        return {
            activeJobs: Number(activeJobsCount?.count || 0),
            pendingApprovals: Number(pendingApprovalsCount?.count || 0),
            totalSpentMonth: Number(spentResult?.total || 0),
            recentActivity
        };
    }

    async createChallanIn(data: {
        corporateClientId: string;
        items: {
            corporateJobNumber: string;
            deviceModel: string;
            serialNumber: string;
            initialStatus: "OK" | "NG";
            reportedDefect: string;
        }[];
        receivedBy: string;
        receivedAt?: Date;
    }): Promise<{ challanId: string; jobIds: string[] }> {
        const challanId = nanoid();
        const jobIds: string[] = [];
        const now = new Date();

        const client = await this.getCorporateClient(data.corporateClientId);
        if (!client) throw new Error("Client not found");

        const [countRes] = await db.select({ count: count() }).from(schema.corporateChallans);
        const seq = (Number(countRes?.count) || 0) + 1;
        const challanNumber = `${client.shortCode}-C-IN-${seq.toString().padStart(4, '0')}`;

        console.log(`Creating Challan IN: ${challanNumber} with ${data.items.length} items`);

        return await db.transaction(async (tx) => {
            await tx.insert(schema.corporateChallans).values({
                id: challanId,
                challanNumber,
                corporateClientId: data.corporateClientId,
                type: 'incoming',
                items: data.items,
                totalItems: data.items.length,
                receivedDate: data.receivedAt || now,
                status: 'received',
            });

            const jobTicketsToInsert: any[] = [];
            const year = new Date().getFullYear();
            const prefix = `JOB-${year}-`;

            const [lastJob] = await tx
                .select({ id: schema.jobTickets.id })
                .from(schema.jobTickets)
                .where(like(schema.jobTickets.id, `${prefix}%`))
                .orderBy(desc(schema.jobTickets.id))
                .limit(1);

            let maxNumber = 0;
            if (lastJob?.id) {
                const parts = lastJob.id.split('-');
                const seq = parseInt(parts[parts.length - 1], 10);
                if (!isNaN(seq)) {
                    maxNumber = seq;
                }
            }

            for (let i = 0; i < data.items.length; i++) {
                const item = data.items[i];
                const jobId = `${prefix}${String(maxNumber + i + 1).padStart(4, '0')}`;
                jobIds.push(jobId);

                const slaHours = client.defaultSlaHours ?? 72;
                const slaDeadline = new Date(now.getTime() + slaHours * 60 * 60 * 1000);

                jobTicketsToInsert.push({
                    id: jobId,
                    customer: client.companyName,
                    customerPhone: client.contactPhone || "Corporate",
                    customerPhoneNormalized: client.contactPhone ? normalizePhone(client.contactPhone) : null,
                    device: item.deviceModel,
                    tvSerialNumber: item.serialNumber,
                    issue: item.reportedDefect,
                    status: "Pending",
                    priority: "Medium",
                    technician: "Unassigned",
                    createdAt: now,
                    slaDeadline,
                    corporateClientId: data.corporateClientId,
                    corporateChallanId: challanId,
                    corporateJobNumber: item.corporateJobNumber,
                    initialStatus: item.initialStatus,
                    reportedDefect: item.reportedDefect,
                    billingStatus: 'pending'
                });
            }

            if (jobTicketsToInsert.length > 0) {
                await tx.insert(schema.jobTickets).values(jobTicketsToInsert);
            }

            return { challanId, jobIds };
        });
    }

    async createChallanOut(data: {
        corporateClientId: string;
        challanInId?: string;
        jobIds: string[];
        receiverName?: string;
        receiverPhone?: string;
        receiverSignature: string;
    }): Promise<string> {
        const challanOutId = nanoid();
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const endOfDay = new Date(today.setHours(23, 59, 59, 999));

        const todaysChallans = await db.select({ count: count() })
            .from(schema.corporateChallans)
            .where(and(
                eq(schema.corporateChallans.type, 'outgoing'),
                gte(schema.corporateChallans.createdAt, startOfDay),
                lte(schema.corporateChallans.createdAt, endOfDay)
            ));

        const seq = (todaysChallans[0]?.count || 0) + 1;
        const challanOutNumber = `CH-OUT-${dateStr}-${seq.toString().padStart(3, '0')}`;

        await db.transaction(async (tx) => {
            await tx.insert(schema.corporateChallans).values({
                id: challanOutId,
                challanNumber: challanOutNumber,
                corporateClientId: data.corporateClientId,
                type: 'outgoing',
                items: data.jobIds,
                totalItems: data.jobIds.length,
                status: 'delivered',
                returnedDate: new Date(),
                receiverName: data.receiverName,
                receiverPhone: data.receiverPhone,
                receiverSignature: data.receiverSignature
            });

            if (data.jobIds.length > 0) {
                await tx.update(schema.jobTickets)
                    .set({
                        billingStatus: 'delivered',
                        status: 'Delivered',
                        corporateChallanId: data.challanInId || undefined
                    })
                    .where(inArray(schema.jobTickets.id, data.jobIds));
            }
        });

        return challanOutId;
    }

    async getChallanJobs(challanId: string): Promise<JobTicket[]> {
        const [challan] = await db.select().from(schema.corporateChallans).where(eq(schema.corporateChallans.id, challanId));

        if (challan && challan.type === 'outgoing' && Array.isArray(challan.items)) {
            const jobIds = challan.items as string[];
            if (jobIds.length === 0) return [];
            return db.select().from(schema.jobTickets).where(inArray(schema.jobTickets.id, jobIds));
        }

        return db.select().from(schema.jobTickets).where(eq(schema.jobTickets.corporateChallanId, challanId));
    }

    async getCorporateClientChallans(clientId: string, page = 1, limit = 50): Promise<PaginationResult<Challan>> {
        const offset = (page - 1) * limit;

        const [total] = await db.select({ count: count() })
            .from(schema.corporateChallans)
            .where(eq(schema.corporateChallans.corporateClientId, clientId));

        const items = await db.select()
            .from(schema.corporateChallans)
            .where(eq(schema.corporateChallans.corporateClientId, clientId))
            .limit(limit)
            .offset(offset)
            .orderBy(desc(schema.corporateChallans.createdAt));

        return {
            items: items as unknown as Challan[],
            pagination: {
                total: total?.count || 0,
                page,
                limit,
                pages: Math.ceil((total?.count || 0) / limit)
            }
        };
    }

    async updateCorporateJobStatus(jobId: string, status: string): Promise<void> {
        await db.update(schema.jobTickets).set({ status }).where(eq(schema.jobTickets.id, jobId));
    }

    async getCorporateBills(clientId: string): Promise<schema.CorporateBill[]> {
        return db.select().from(schema.corporateBills)
            .where(eq(schema.corporateBills.corporateClientId, clientId))
            .orderBy(desc(schema.corporateBills.createdAt));
    }

    async getCorporateBill(id: string): Promise<schema.CorporateBill | undefined> {
        const [bill] = await db.select().from(schema.corporateBills).where(eq(schema.corporateBills.id, id));
        return bill;
    }

    async generateCorporateBill(data: {
        corporateClientId: string;
        jobIds: string[];
        periodStart: Date;
        periodEnd: Date;
    }): Promise<schema.CorporateBill> {
        const client = await this.getCorporateClient(data.corporateClientId);
        if (!client) throw new Error("Corporate Client not found");

        const jobs = await db.select().from(schema.jobTickets)
            .where(inArray(schema.jobTickets.id, data.jobIds));

        let subtotal = 0;
        const lineItems = [];

        for (const job of jobs) {
            let jobTotal = 0;
            const charges = job.charges as any[];

            if (charges && Array.isArray(charges) && charges.length > 0) {
                jobTotal = charges.reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
            } else {
                jobTotal = job.estimatedCost || 0;
            }

            subtotal += jobTotal;
            lineItems.push({
                jobId: job.id,
                jobNo: job.corporateJobNumber || job.id,
                device: job.device,
                serial: job.tvSerialNumber,
                defect: job.reportedDefect || job.issue,
                amount: jobTotal
            });
        }

        const discount = 0;
        const vat = 0;
        const grandTotal = subtotal - discount + vat;

        const [countRes] = await db.select({ count: count() }).from(schema.corporateBills);
        const seq = (Number(countRes?.count) || 0) + 1;
        const billNumber = `${client.shortCode}-BILL-${seq.toString().padStart(4, '0')}`;
        const billId = nanoid();

        const [bill] = await db.insert(schema.corporateBills).values({
            id: billId,
            billNumber,
            corporateClientId: data.corporateClientId,
            billingPeriodStart: data.periodStart,
            billingPeriodEnd: data.periodEnd,
            lineItems: lineItems,
            subtotal,
            discount,
            vatAmount: vat,
            grandTotal,
            paymentStatus: 'unpaid',
            dueDate: new Date(Date.now() + 30 * 86400000),
        }).returning();

        await db.insert(schema.dueRecords).values({
            id: nanoid(),
            customer: client.companyName,
            amount: grandTotal,
            status: 'Pending',
            invoice: billNumber,
            dueDate: new Date(Date.now() + 30 * 86400000),
        });

        await db.update(schema.jobTickets)
            .set({
                corporateBillId: billId,
                billingStatus: 'billed'
            })
            .where(inArray(schema.jobTickets.id, data.jobIds));

        return bill;
    }

    async getCorporateMessageThreads(clientId: string): Promise<CorporateMessageThread[]> {
        return db.select().from(schema.corporateMessageThreads)
            .where(eq(schema.corporateMessageThreads.corporateClientId, clientId))
            .orderBy(desc(schema.corporateMessageThreads.lastMessageAt));
    }

    async getCorporateMessageThread(id: string): Promise<CorporateMessageThread | undefined> {
        const [thread] = await db.select().from(schema.corporateMessageThreads)
            .where(eq(schema.corporateMessageThreads.id, id));
        return thread;
    }

    async createCorporateMessageThread(thread: InsertCorporateMessageThread): Promise<CorporateMessageThread> {
        const [newThread] = await db.insert(schema.corporateMessageThreads)
            .values({ ...thread, id: nanoid() })
            .returning();
        return newThread;
    }

    async updateCorporateMessageThread(id: string, updates: Partial<CorporateMessageThread>): Promise<CorporateMessageThread | undefined> {
        const [updated] = await db.update(schema.corporateMessageThreads)
            .set({ ...updates, updatedAt: new Date() })
            .where(eq(schema.corporateMessageThreads.id, id))
            .returning();
        return updated;
    }

    async getCorporateMessages(threadId: string, limit: number = 50, before?: Date): Promise<CorporateMessage[]> {
        const conditions = [eq(schema.corporateMessages.threadId, threadId)];

        if (before) {
            conditions.push(lt(schema.corporateMessages.createdAt, before));
        }

        return db.select()
            .from(schema.corporateMessages)
            .where(and(...conditions))
            .orderBy(desc(schema.corporateMessages.createdAt))
            .limit(limit)
            .then(msgs => msgs.reverse());
    }

    async createCorporateMessage(message: InsertCorporateMessage): Promise<CorporateMessage> {
        const [newMessage] = await db.insert(schema.corporateMessages)
            .values({ ...message, id: nanoid() })
            .returning();

        await db.update(schema.corporateMessageThreads)
            .set({ lastMessageAt: new Date() })
            .where(eq(schema.corporateMessageThreads.id, message.threadId));

        return newMessage;
    }

    async markCorporateMessagesAsRead(threadId: string, recipientType: 'corporate' | 'admin'): Promise<void> {
        const senderTypeToMark = recipientType === 'corporate' ? 'admin' : 'corporate';
        await db.update(schema.corporateMessages)
            .set({ isRead: true })
            .where(and(
                eq(schema.corporateMessages.threadId, threadId),
                eq(schema.corporateMessages.senderType, senderTypeToMark),
                eq(schema.corporateMessages.isRead, false)
            ));
    }

    async getUnreadMessageCount(clientId: string, recipientType: 'corporate' | 'admin'): Promise<number> {
        const senderTypeToCount = recipientType === 'corporate' ? 'admin' : 'corporate';

        const [result] = await db.select({ count: count() })
            .from(schema.corporateMessages)
            .innerJoin(schema.corporateMessageThreads, eq(schema.corporateMessages.threadId, schema.corporateMessageThreads.id))
            .where(and(
                eq(schema.corporateMessageThreads.corporateClientId, clientId),
                eq(schema.corporateMessages.senderType, senderTypeToCount),
                eq(schema.corporateMessages.isRead, false)
            ));

        return Number(result?.count || 0);
    }

    async checkCorporateJobExists(clientId: string, corporateJobNumber: string): Promise<boolean> {
        const [job] = await db
            .select({ id: schema.jobTickets.id })
            .from(schema.jobTickets)
            .where(and(
                eq(schema.jobTickets.corporateClientId, clientId),
                eq(schema.jobTickets.corporateJobNumber, corporateJobNumber)
            ))
            .limit(1);
        return !!job;
    }

    async getExistingCorporateJobNumbers(clientId: string, jobNumbers: string[]): Promise<string[]> {
        if (!jobNumbers.length) return [];
        const jobs = await db
            .select({ num: schema.jobTickets.corporateJobNumber })
            .from(schema.jobTickets)
            .where(and(
                eq(schema.jobTickets.corporateClientId, clientId),
                inArray(schema.jobTickets.corporateJobNumber, jobNumbers)
            ));
        return jobs.map(j => j.num!).filter(Boolean);
    }
}

export const corporateRepo = new CorporateRepository();
