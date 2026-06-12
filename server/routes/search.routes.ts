import { Router } from 'express';
import { requireAdminAuth } from './middleware/auth.js';
import { db } from '../db.js';
import * as schema from '../../shared/schema.js';
import { ilike, or, and, eq, sql } from 'drizzle-orm';

const router = Router();

router.get('/api/admin/search', requireAdminAuth, async (req, res) => {
    const query = req.query.q as string;

    // Return empty results if query is too short
    if (!query || query.length < 1) {
        return res.json({
            jobs: [],
            customers: [],
            serviceRequests: [],
            posTransactions: [],
            inventory: [],
            challans: [],
            finance: [],
            counts: { jobs: 0, customers: 0, serviceRequests: 0, posTransactions: 0, inventory: 0, challans: 0, finance: 0 }
        });
    }

    try {
        const keywords = query.trim().split(/\s+/).filter(k => k.length > 0);

        const buildSearchCondition = (columns: any[]) => {
            const validColumns = columns.filter(col => col != null);
            if (validColumns.length === 0) return undefined;
            return and(
                ...keywords.map(kw => {
                    const term = `%${kw}%`;
                    return or(...validColumns.map(col => ilike(col, term)));
                })
            );
        };

        // Individual queries with error isolation - each returns data + total count
        let jobs: any[] = [];
        let jobsTotal = 0;
        let customers: any[] = [];
        let customersTotal = 0;
        let serviceRequests: any[] = [];
        let serviceRequestsTotal = 0;
        let posTransactions: any[] = [];
        let posTransactionsTotal = 0;
        let inventory: any[] = [];
        let inventoryTotal = 0;
        let challans: any[] = [];
        let challansTotal = 0;
        let finance: any[] = [];
        let financeTotal = 0;

        const user = req.user as any;
        const isSuperAdmin = user?.role === 'Super Admin';
        const perms: Partial<schema.UserPermissions> = user?.permissions ? (typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions) : {};
        const hasPerm = (p: keyof schema.UserPermissions) => isSuperAdmin || !!perms[p];

        // --- Jobs (with LEFT JOIN to resolve customer name + corporate client name) ---
        if (hasPerm('jobs')) {
            try {
                const jobCondition = buildSearchCondition([
                    schema.jobTickets.id,
                    schema.jobTickets.corporateJobNumber,
                    schema.jobTickets.customerPhone,
                    schema.jobTickets.customer,
                    schema.jobTickets.device,
                    schema.jobTickets.issue
                ]);

                const [jobData, jobCount] = await Promise.all([
                    db.select({
                        id: schema.jobTickets.id,
                        customer: schema.jobTickets.customer,
                        customerPhone: schema.jobTickets.customerPhone,
                        status: schema.jobTickets.status,
                        device: schema.jobTickets.device,
                        issue: schema.jobTickets.issue,
                        screenSize: schema.jobTickets.screenSize,
                        priority: schema.jobTickets.priority,
                        corporateClientId: schema.jobTickets.corporateClientId,
                        corporateJobNumber: schema.jobTickets.corporateJobNumber,
                        technician: schema.jobTickets.technician,
                        createdAt: schema.jobTickets.createdAt,
                        // Resolved customer name via LEFT JOIN with users
                        resolvedCustomerName: schema.users.name,
                        // Corporate client company name via LEFT JOIN
                        corporateCompanyName: schema.corporateClients.companyName,
                    })
                        .from(schema.jobTickets)
                        .leftJoin(schema.users, eq(schema.jobTickets.customer, schema.users.id))
                        .leftJoin(schema.corporateClients, eq(schema.jobTickets.corporateClientId, schema.corporateClients.id))
                        .where(jobCondition)
                        .limit(10),
                    db.select({ count: sql<number>`count(*)` })
                        .from(schema.jobTickets)
                        .where(jobCondition)
                ]);

                jobs = jobData;
                jobsTotal = Number(jobCount[0]?.count ?? 0);
            } catch (e) { console.error("[Search] jobs search crash", e); }
        }

        // --- Customers ---
        if (hasPerm('users')) {
            try {
                const custCondition = buildSearchCondition([
                    schema.users.name,
                    schema.users.phone,
                    schema.users.email
                ]);

                const [custData, custCount] = await Promise.all([
                    db.select({
                        id: schema.users.id,
                        name: schema.users.name,
                        phone: schema.users.phone,
                        role: schema.users.role,
                        email: schema.users.email
                    })
                        .from(schema.users)
                        .where(custCondition)
                        .limit(10),
                    db.select({ count: sql<number>`count(*)` })
                        .from(schema.users)
                        .where(custCondition)
                ]);

                customers = custData;
                customersTotal = Number(custCount[0]?.count ?? 0);
            } catch (e) { console.error("[Search] customers search crash", e); }
        }

        // --- Service Requests ---
        if (hasPerm('serviceRequests')) {
            try {
                const srCondition = buildSearchCondition([
                    schema.serviceRequests.ticketNumber,
                    schema.serviceRequests.id,
                    schema.serviceRequests.customerName,
                    schema.serviceRequests.phone,
                    schema.serviceRequests.brand,
                    schema.serviceRequests.modelNumber,
                    schema.serviceRequests.primaryIssue
                ]);

                const [srData, srCount] = await Promise.all([
                    db.select({
                        id: schema.serviceRequests.id,
                        ticketNumber: schema.serviceRequests.ticketNumber,
                        status: schema.serviceRequests.status,
                        customerName: schema.serviceRequests.customerName,
                        brand: schema.serviceRequests.brand,
                        modelNumber: schema.serviceRequests.modelNumber,
                        primaryIssue: schema.serviceRequests.primaryIssue,
                        phone: schema.serviceRequests.phone,
                        createdAt: schema.serviceRequests.createdAt
                    })
                        .from(schema.serviceRequests)
                        .where(srCondition)
                        .limit(10),
                    db.select({ count: sql<number>`count(*)` })
                        .from(schema.serviceRequests)
                        .where(srCondition)
                ]);

                serviceRequests = srData;
                serviceRequestsTotal = Number(srCount[0]?.count ?? 0);
            } catch (e) { console.error("[Search] service requests search crash", e); }
        }

        // --- POS Transactions ---
        if (hasPerm('pos')) {
            try {
                const posCondition = buildSearchCondition([
                    schema.posTransactions.invoiceNumber,
                    schema.posTransactions.customer,
                    schema.posTransactions.customerPhone
                ]);

                const [posData, posCount] = await Promise.all([
                    db.select({
                        id: schema.posTransactions.id,
                        invoiceNumber: schema.posTransactions.invoiceNumber,
                        customer: schema.posTransactions.customer,
                        customerPhone: schema.posTransactions.customerPhone,
                        paymentStatus: schema.posTransactions.paymentStatus,
                        total: schema.posTransactions.total,
                        createdAt: schema.posTransactions.createdAt
                    })
                        .from(schema.posTransactions)
                        .where(posCondition)
                        .limit(10),
                    db.select({ count: sql<number>`count(*)` })
                        .from(schema.posTransactions)
                        .where(posCondition)
                ]);

                posTransactions = posData;
                posTransactionsTotal = Number(posCount[0]?.count ?? 0);
            } catch (e) { console.error("[Search] POS transactions search crash", e); }
        }

        // --- Inventory ---
        if (hasPerm('inventory')) {
            try {
                const invCondition = buildSearchCondition([
                    schema.inventoryItems.name,
                    schema.inventoryItems.id,
                    schema.inventoryItems.description
                ]);

                const [invData, invCount] = await Promise.all([
                    db.select({
                        id: schema.inventoryItems.id,
                        name: schema.inventoryItems.name,
                        category: schema.inventoryItems.category,
                        stock: schema.inventoryItems.stock,
                        description: schema.inventoryItems.description
                    })
                        .from(schema.inventoryItems)
                        .where(invCondition)
                        .limit(10),
                    db.select({ count: sql<number>`count(*)` })
                        .from(schema.inventoryItems)
                        .where(invCondition)
                ]);

                inventory = invData;
                inventoryTotal = Number(invCount[0]?.count ?? 0);
            } catch (e) { console.error("[Search] inventory search crash", e); }
        }

        // --- Challans ---
        if (hasPerm('challans')) {
            try {
                const challanCondition = buildSearchCondition([
                    schema.challans.id,
                    schema.challans.receiver,
                    schema.challans.receiverPhone
                ]);

                const [challanData, challanCount] = await Promise.all([
                    db.select({
                        id: schema.challans.id,
                        receiver: schema.challans.receiver,
                        status: schema.challans.status,
                        type: schema.challans.type,
                        vehicleNo: schema.challans.vehicleNo,
                        createdAt: schema.challans.createdAt
                    })
                        .from(schema.challans)
                        .where(challanCondition)
                        .limit(10),
                    db.select({ count: sql<number>`count(*)` })
                        .from(schema.challans)
                        .where(challanCondition)
                ]);

                challans = challanData;
                challansTotal = Number(challanCount[0]?.count ?? 0);
            } catch (e) { console.error("[Search] challans search crash", e); }
        }

        // --- Finance (petty cash, dues, manual payments, refunds) ---
        if (hasPerm('finance')) {
            try {
                const financeKeywords = query.trim().split(/\s+/).filter(k => k.length > 0);
                const buildFinanceCondition = (columns: any[], numericColumns: any[] = []) => {
                    const validColumns = columns.filter(col => col != null);
                    const validNumericColumns = numericColumns.filter(col => col != null);
                    if (validColumns.length === 0 && validNumericColumns.length === 0) return undefined;
                    return and(
                        ...financeKeywords.map(kw => {
                            const term = `%${kw}%`;
                            return or(
                                ...validColumns.map(col => ilike(col, term)),
                                ...validNumericColumns.map(col => ilike(sql<string>`cast(${col} as text)`, term))
                            );
                        })
                    );
                };

                const pettyCondition = buildFinanceCondition([
                    schema.pettyCashRecords.description,
                    schema.pettyCashRecords.category,
                    schema.pettyCashRecords.id
                ], [schema.pettyCashRecords.amount]);
                const dueCondition = buildFinanceCondition([
                    schema.dueRecords.customer,
                    schema.dueRecords.invoice,
                    schema.dueRecords.id
                ], [schema.dueRecords.amount]);
                const manualCondition = buildFinanceCondition([
                    schema.manualPayments.customerName,
                    schema.manualPayments.customerPhone,
                    schema.manualPayments.transactionId,
                    schema.manualPayments.id,
                    schema.manualPayments.method,
                    schema.manualPayments.notes,
                ], [schema.manualPayments.amount]);
                const refundCondition = buildFinanceCondition([
                    schema.refunds.customer,
                    schema.refunds.customerPhone,
                    schema.refunds.referenceInvoice,
                    schema.refunds.id,
                    schema.refunds.reason,
                ], [schema.refunds.refundAmount]);

                const [pettyData, dueData, manualData, refundData, pettyCount, dueCount, manualCount, refundCount] = await Promise.all([
                    db.select({
                        id: schema.pettyCashRecords.id,
                        description: schema.pettyCashRecords.description,
                        category: schema.pettyCashRecords.category,
                        amount: schema.pettyCashRecords.amount,
                        type: schema.pettyCashRecords.type,
                        createdAt: schema.pettyCashRecords.createdAt,
                    })
                        .from(schema.pettyCashRecords)
                        .where(pettyCondition)
                        .limit(5),
                    db.select({
                        id: schema.dueRecords.id,
                        customer: schema.dueRecords.customer,
                        amount: schema.dueRecords.amount,
                        status: schema.dueRecords.status,
                        invoice: schema.dueRecords.invoice,
                        createdAt: schema.dueRecords.createdAt,
                    })
                        .from(schema.dueRecords)
                        .where(dueCondition)
                        .limit(5),
                    db.select({
                        id: schema.manualPayments.id,
                        customerName: schema.manualPayments.customerName,
                        customerPhone: schema.manualPayments.customerPhone,
                        amount: schema.manualPayments.amount,
                        method: schema.manualPayments.method,
                        transactionId: schema.manualPayments.transactionId,
                        status: schema.manualPayments.status,
                        createdAt: schema.manualPayments.createdAt,
                    })
                        .from(schema.manualPayments)
                        .where(manualCondition)
                        .limit(5),
                    db.select({
                        id: schema.refunds.id,
                        customer: schema.refunds.customer,
                        customerPhone: schema.refunds.customerPhone,
                        referenceInvoice: schema.refunds.referenceInvoice,
                        refundAmount: schema.refunds.refundAmount,
                        status: schema.refunds.status,
                        reason: schema.refunds.reason,
                        createdAt: schema.refunds.createdAt,
                    })
                        .from(schema.refunds)
                        .where(refundCondition)
                        .limit(5),
                    db.select({ count: sql<number>`count(*)` })
                        .from(schema.pettyCashRecords)
                        .where(pettyCondition),
                    db.select({ count: sql<number>`count(*)` })
                        .from(schema.dueRecords)
                        .where(dueCondition),
                    db.select({ count: sql<number>`count(*)` })
                        .from(schema.manualPayments)
                        .where(manualCondition),
                    db.select({ count: sql<number>`count(*)` })
                        .from(schema.refunds)
                        .where(refundCondition),
                ]);

                const mappedPetty = pettyData.map(r => ({
                    id: r.id,
                    type: 'petty-cash',
                    reference: r.description,
                    customer: r.category,
                    amount: r.amount,
                    status: r.type,
                    createdAt: r.createdAt,
                }));
                const mappedDue = dueData.map(r => ({
                    id: r.id,
                    type: 'due',
                    reference: r.invoice,
                    customer: r.customer,
                    amount: r.amount,
                    status: r.status,
                    createdAt: r.createdAt,
                }));
                const mappedManual = manualData.map(r => ({
                    id: r.id,
                    type: 'manual-payment',
                    reference: r.transactionId,
                    customer: r.customerName,
                    amount: r.amount,
                    status: r.status,
                    createdAt: r.createdAt,
                }));
                const mappedRefund = refundData.map(r => ({
                    id: r.id,
                    type: 'refund',
                    reference: r.referenceInvoice,
                    customer: r.customer,
                    amount: r.refundAmount,
                    status: r.status,
                    createdAt: r.createdAt,
                }));

                finance = [...mappedPetty, ...mappedDue, ...mappedManual, ...mappedRefund];
                financeTotal = Number(pettyCount[0]?.count ?? 0) + Number(dueCount[0]?.count ?? 0) + Number(manualCount[0]?.count ?? 0) + Number(refundCount[0]?.count ?? 0);
            } catch (e) { console.error("[Search] finance search crash", e); }
        }

        res.json({
            jobs,
            customers,
            serviceRequests,
            posTransactions,
            inventory,
            challans,
            finance,
            counts: {
                jobs: jobsTotal,
                customers: customersTotal,
                serviceRequests: serviceRequestsTotal,
                posTransactions: posTransactionsTotal,
                inventory: inventoryTotal,
                challans: challansTotal,
                finance: financeTotal
            }
        });

    } catch (error: any) {
        console.error("[Search] global search crash", error);
        res.status(500).json({ error: 'Global search failed', details: error.message });
    }
});

export default router;
