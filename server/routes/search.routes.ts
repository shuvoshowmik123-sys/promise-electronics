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
            counts: { jobs: 0, customers: 0, serviceRequests: 0, posTransactions: 0, inventory: 0, challans: 0 }
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
            } catch (e: any) { console.error("Search crash [jobs]:", e.message, e.stack); }
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
            } catch (e: any) { console.error("Search crash [customers]:", e.message); }
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
            } catch (e: any) { console.error("Search crash [serviceRequests]:", e.message); }
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
            } catch (e: any) { console.error("Search crash [posTransactions]:", e.message); }
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
            } catch (e: any) { console.error("Search crash [inventory]:", e.message); }
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
            } catch (e: any) { console.error("Search crash [challans]:", e.message); }
        }

        res.json({
            jobs,
            customers,
            serviceRequests,
            posTransactions,
            inventory,
            challans,
            counts: {
                jobs: jobsTotal,
                customers: customersTotal,
                serviceRequests: serviceRequestsTotal,
                posTransactions: posTransactionsTotal,
                inventory: inventoryTotal,
                challans: challansTotal
            }
        });

    } catch (error: any) {
        console.error("Global search crash:", error);
        res.status(500).json({ error: 'Global search failed', details: error.message });
    }
});

export default router;
