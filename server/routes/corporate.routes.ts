
import { Router, Request, Response, NextFunction } from "express";
import { storage } from "../storage.js";
import { z } from "zod";
import { Readable } from 'stream';
import { insertCorporateClientSchema } from "../../shared/schema.js";
import bcrypt from "bcryptjs";
import {
    getDefaultPermissions,
    requireAdminAuth,
    requirePermission,
    requireGranularPermission,
    requireAnyGranularPermission,
} from "./middleware/auth.js";

/** Read-only corporate workspace/client data (not billing, not mutations). */
const corpRead = requireAnyGranularPermission(["corporate.view", "corporate.workspace"]);
/** Client create/update/rules mutations. */
const corpManageClients = requireGranularPermission("corporate.manageClients");
/** Corporate challan IN/OUT + import/parse. */
const corpChallansOperate = requireGranularPermission("corporate.challansOperate");
/** Corporate challan list/detail reads for workspace or ops challan workers. */
const corpChallanRead = requireAnyGranularPermission([
    "corporate.view",
    "corporate.workspace",
    "corporate.challansOperate",
]);
const corpBillsView = requireGranularPermission("corporate.bills.view");
const corpBillsCreate = requireGranularPermission("corporate.bills.create");
const corpBillsConfigureTemplates = requireGranularPermission("corporate.bills.configureTemplates");
const corpBillsRecordPayment = requireGranularPermission("corporate.bills.recordPayment");
import { db } from "../db.js";
import { corporateService } from "../services/corporate.service.js";
import {
    corporateAccountReceiptService,
    CorporateAccountReceiptError,
    ALLOWED_METHODS,
} from "../services/corporate-account-receipt.service.js";
import {
    corporateAccountReceiptRepo,
    AccountBalanceDomainError,
} from "../repositories/corporate-account-receipt.repository.js";
import {
    corporateLtdBillingRepo,
    CorporateLtdBillingError,
    ALL_COLUMN_KEYS,
} from "../repositories/corporate-ltd-billing.repository.js";
import { auditLogger } from "../utils/auditLogger.js";
import { and, desc, inArray, eq, sql } from "drizzle-orm";
import { jobTickets, corporateBills, billLineItems, billEditLog, billingProfiles, jobBatches, jobExtensionRequests } from "../../shared/schema.js";
import { getSafeJobDisplayRef } from "../../shared/job-display-utils.js";
import { nanoid } from "nanoid";

const router = Router();

// Secure all corporate admin routes using individual route middleware

// ----------------------------------------------------------------------
// Types & Schemas
// ----------------------------------------------------------------------

const createChallanInSchema = z.object({
    corporateClientId: z.string(),
    workType: z.enum(["full_tv", "panel", "panel_batch", "board", "parts", "parts_sale", "crr"]).optional(),
    items: z.array(z.object({
        corporateJobNumber: z.string().min(1),
        deviceModel: z.string().min(1),
        serialNumber: z.string().min(1),
        initialStatus: z.enum(["OK", "NG"]),
        status: z.enum(["Received", "Pending", "Declared OK", "Declared NG"]).optional(),
        reportedDefect: z.string(),
        workType: z.enum(["full_tv", "panel", "panel_batch", "board", "parts", "parts_sale", "crr"]).optional(),
        ticketType: z.enum(["full_device", "panel_only", "motherboard_only", "parts_only"]).optional(),
        jobType: z.enum(["standard", "warranty_claim"]).optional(),
        parentJobId: z.string().optional(),
        crrReviewStatus: z.enum(["new_job", "crr", "ignore", "super_admin_review"]).optional(),
        crrReason: z.string().optional(),
    })),
    receivedBy: z.string().default("System"),
    receivedAt: z.coerce.date().optional(), // Date received, defaults to now if handled by storage
});

const createChallanOutSchema = z.object({
    challanInId: z.string().optional(),
    corporateClientId: z.string().min(1),
    jobIds: z.array(z.string()).min(1).max(100),
    receiverName: z.string().optional(),
    receiverPhone: z.string().optional(),
    receiverSignature: z.string().optional().default(""),
});

const generateBillSchema = z.object({
    corporateClientId: z.string(),
    jobIds: z.array(z.string()),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
});

const clientRulesSchema = z.object({
    clientType: z.enum(["limited_company", "corporate", "regular", "panel_batch", "parts_buyer", "service_online_partner"]),
    ruleProfile: z.record(z.any()).default({}),
    defaultBatchClearanceDays: z.number().int().min(1).max(90).default(7),
    serviceWarrantyEnabled: z.boolean().default(true),
    defaultServiceWarrantyDays: z.number().int().min(0).max(365).default(30),
    clientClass: z.string().optional(),
    paymentTerms: z.number().int().min(0).max(365).optional(),
    billingCycle: z.string().optional(),
});

const extensionRequestSchema = z.object({
    jobId: z.string().min(1),
    reason: z.string().min(3),
    requestedUntil: z.coerce.date(),
});

const extensionDecisionSchema = z.object({
    status: z.enum(["accepted", "rejected", "cancelled"]),
    responseNote: z.string().optional(),
});

const normalizeBangladeshPhone = (value?: string | null) => {
    if (!value) return "";
    const digits = value.replace(/\D/g, "").replace(/^880/, "").replace(/^0+/, "").slice(0, 10);
    return digits ? `+880${digits}` : "";
};

// ----------------------------------------------------------------------
// Routes
// ----------------------------------------------------------------------

// 0. Get All Corporate Clients (Management List)
router.get("/clients", requireAdminAuth, corpRead, async (req, res) => {
    try {
        const clients = await storage.getAllCorporateClients();
        res.json(clients);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch corporate clients" });
    }
});

// 0.2. Get Single Corporate Client
router.get("/clients/:id", requireAdminAuth, corpRead, async (req, res) => {
    try {
        const client = await storage.getCorporateClient(req.params.id);
        if (!client) {
            return res.status(404).json({ message: "Corporate client not found" });
        }
        res.json(client);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch corporate client" });
    }
});

// 0.5. Create New Corporate Client
// 0.5. Create New Corporate Client
router.post("/clients", requireAdminAuth, corpManageClients, async (req, res) => {
    try {
        // Extended schema to include optional password
        const schema = insertCorporateClientSchema.extend({
            portalPassword: z.string().optional(),
            portalUsers: z.array(z.object({
                name: z.string().optional(),
                username: z.string().min(1),
                password: z.string().min(1),
                email: z.string().optional(),
                phone: z.string().optional(),
            })).optional(),
        });

        const data = schema.parse(req.body);
        const { portalPassword, portalUsers, ...clientData } = data;
        const preparedPortalUsers = (portalUsers?.length ? portalUsers : clientData.portalUsername && portalPassword ? [{
            name: clientData.contactPerson || clientData.companyName,
            username: clientData.portalUsername,
            password: portalPassword,
        }] : []).filter((user) => user.username && user.password);

        clientData.contactPhone = normalizeBangladeshPhone(clientData.contactPhone);
        clientData.phone = normalizeBangladeshPhone(clientData.phone);
        if (preparedPortalUsers[0]) {
            clientData.portalUsername = preparedPortalUsers[0].username;
        }

        // 1. Check if username already exists (if provided)
        for (const portalUser of preparedPortalUsers) {
            const existingUser = await storage.getUserByUsername(portalUser.username);
            if (existingUser) {
                return res.status(400).json({ message: `Portal username "${portalUser.username}" is already taken by another user.` });
            }
        }

        // 2. Create Corporate Client
        const newClient = await storage.createCorporateClient(clientData);

        try {
            await storage.ensureBillingProfile(newClient.id);
        } catch {
            console.warn(`[CorporateRoutes] billing profile ensure failed for client ${newClient.id}`);
        }

        // 3. Create Users if credentials provided
        for (const portalUser of preparedPortalUsers) {
            const hashedPassword = await bcrypt.hash(portalUser.password, 10);
            const defaultPermissions = getDefaultPermissions('Corporate');

            await storage.createUser({
                username: portalUser.username,
                password: hashedPassword,
                role: 'Corporate',
                name: portalUser.name || clientData.contactPerson || clientData.companyName,
                email: portalUser.email || "",
                permissions: JSON.stringify(defaultPermissions),
                corporateClientId: newClient.id,
                phone: normalizeBangladeshPhone(portalUser.phone),
                isVerified: true,
            } as any);
        }

        res.status(201).json(newClient);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: "Invalid input", errors: error.errors });
        } else {
            console.error("Error creating corporate client:", error);
            res.status(500).json({ message: "Failed to create client" });
        }
    }
});

// 1. Get Challan Jobs (For Smart Table)
router.get("/challans/:id/jobs", requireAdminAuth, corpChallanRead, async (req, res) => {
    try {
        const jobs = await storage.getChallanJobs(req.params.id);
        res.json(jobs);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch challan jobs" });
    }
});

// 1.5. Get All Jobs for a Corporate Client (for selection)
router.get("/clients/:id/jobs", requireAdminAuth, requireAnyGranularPermission([
    "corporate.view", "corporate.workspace", "corporate.jobsOperate",
]), async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;

        const result = await storage.getJobsByCorporateClient(req.params.id, page, limit);
        res.json({
            jobs: result.items,
            pagination: result.pagination
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch client jobs" });
    }
});

// 1.5.1 Get Client Branches
router.get("/clients/:id/branches", requireAdminAuth, corpRead, async (req, res) => {
    try {
        const branches = await storage.getCorporateClientBranches(req.params.id);
        res.json(branches);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch branches" });
    }
});

// 1.5.2 Update Corporate Client
router.patch("/clients/:id", requireAdminAuth, corpManageClients, async (req, res) => {
    try {
        const client = await storage.updateCorporateClient(req.params.id, req.body);
        res.json(client);
    } catch (error) {
        res.status(500).json({ message: "Failed to update client" });
    }
});

router.get("/clients/:id/rules", requireAdminAuth, corpRead, async (req, res) => {
    try {
        const client = await storage.getCorporateClient(req.params.id);
        if (!client) return res.status(404).json({ message: "Corporate client not found" });

        res.json({
            clientType: (client as any).clientType || "corporate",
            ruleProfile: (client as any).ruleProfile || {},
            defaultBatchClearanceDays: (client as any).defaultBatchClearanceDays || 7,
            serviceWarrantyEnabled: (client as any).serviceWarrantyEnabled !== false,
            defaultServiceWarrantyDays: (client as any).defaultServiceWarrantyDays || 30,
            clientClass: client.clientClass,
            paymentTerms: client.paymentTerms,
            billingCycle: client.billingCycle,
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch client rules" });
    }
});

router.patch("/clients/:id/rules", requireAdminAuth, corpManageClients, async (req, res) => {
    try {
        const data = clientRulesSchema.parse(req.body);
        const updated = await storage.updateCorporateClient(req.params.id, data as any);
        res.json(updated);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: "Invalid rules", errors: error.errors });
        } else {
            res.status(500).json({ message: "Failed to update client rules" });
        }
    }
});

router.get("/clients/:id/batches", requireAdminAuth, corpRead, async (req, res) => {
    try {
        const batches = await db.select().from(jobBatches)
            .where(eq(jobBatches.corporateClientId, req.params.id))
            .orderBy(desc(jobBatches.createdAt));

        const jobsResult = await storage.getJobsByCorporateClient(req.params.id, 1, 1000);
        const jobs = Array.isArray(jobsResult) ? jobsResult : jobsResult.items;
        const extensions = await db.select().from(jobExtensionRequests)
            .where(eq(jobExtensionRequests.corporateClientId, req.params.id))
            .orderBy(desc(jobExtensionRequests.createdAt));

        const enriched = batches.map((batch) => {
            const batchJobs = jobs.filter((job: any) => job.batchId === batch.id);
            const pendingExtensions = extensions.filter((request) => request.batchId === batch.id && request.status === "pending").length;
            const cleared = batchJobs.filter((job: any) => ["Ready", "Delivered", "Completed", "Closed"].includes(job.status)).length;
            return {
                ...batch,
                clearedItems: cleared,
                pendingItems: Math.max(batchJobs.length - cleared, 0),
                extensionPendingCount: pendingExtensions,
                isDueSoon: batch.targetClearDate ? new Date(batch.targetClearDate).getTime() - Date.now() <= 48 * 60 * 60 * 1000 : false,
                isOverdue: batch.targetClearDate ? new Date(batch.targetClearDate) < new Date() && cleared < batchJobs.length : false,
            };
        });

        res.json(enriched);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch client batches" });
    }
});

router.get("/clients/:id/extension-requests", requireAdminAuth, corpRead, async (req, res) => {
    try {
        const requests = await db.select().from(jobExtensionRequests)
            .where(eq(jobExtensionRequests.corporateClientId, req.params.id))
            .orderBy(desc(jobExtensionRequests.createdAt));
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch extension requests" });
    }
});

router.post("/batches/:batchId/extension-requests", requireAdminAuth, corpManageClients, async (req, res) => {
    try {
        const data = extensionRequestSchema.parse(req.body);
        const [batch] = await db.select().from(jobBatches).where(eq(jobBatches.id, req.params.batchId)).limit(1);
        if (!batch?.corporateClientId) return res.status(404).json({ message: "Batch not found" });

        const job = await storage.getJobTicket(data.jobId);
        if (!job || job.corporateClientId !== batch.corporateClientId || job.batchId !== batch.id) {
            return res.status(400).json({ message: "Job does not belong to this batch" });
        }

        const [created] = await db.insert(jobExtensionRequests).values({
            id: nanoid(),
            corporateClientId: batch.corporateClientId,
            batchId: batch.id,
            jobId: data.jobId,
            reason: data.reason,
            requestedUntil: data.requestedUntil,
            requestedBy: (req as any).user?.name || (req as any).user?.username || "Admin",
        }).returning();

        await db.update(jobTickets)
            .set({ extensionStatus: "pending", extensionRequestedUntil: data.requestedUntil })
            .where(eq(jobTickets.id, data.jobId));

        await db.update(jobBatches)
            .set({ extensionCount: sql`${jobBatches.extensionCount} + 1` })
            .where(eq(jobBatches.id, batch.id));

        res.status(201).json(created);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: "Invalid extension request", errors: error.errors });
        } else {
            res.status(500).json({ message: "Failed to create extension request" });
        }
    }
});

router.patch("/extension-requests/:id", requireAdminAuth, corpManageClients, async (req, res) => {
    try {
        const data = extensionDecisionSchema.parse(req.body);
        const [existing] = await db.select().from(jobExtensionRequests).where(eq(jobExtensionRequests.id, req.params.id)).limit(1);
        if (!existing) return res.status(404).json({ message: "Extension request not found" });

        const [updated] = await db.update(jobExtensionRequests)
            .set({
                status: data.status,
                responseNote: data.responseNote,
                respondedBy: (req as any).user?.name || (req as any).user?.username || "Admin",
                respondedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(jobExtensionRequests.id, req.params.id))
            .returning();

        await db.update(jobTickets)
            .set(data.status === "accepted"
                ? { extensionStatus: "accepted", batchTargetClearDate: existing.requestedUntil, deadline: existing.requestedUntil, slaDeadline: existing.requestedUntil }
                : { extensionStatus: data.status === "rejected" ? "rejected" : "cancelled" })
            .where(eq(jobTickets.id, existing.jobId));

        res.json(updated);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: "Invalid extension decision", errors: error.errors });
        } else {
            res.status(500).json({ message: "Failed to update extension request" });
        }
    }
});

// 1.6. Get Corporate Client Challans (History)
router.get("/clients/:id/challans", requireAdminAuth, corpChallanRead, async (req, res) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;

        const result = await storage.getCorporateClientChallans(req.params.id, page, limit);
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch challan history" });
    }
});

// 2. Create Challan IN (Bulk Check-in)
router.post("/challans/in", requireAdminAuth, corpChallansOperate, async (req, res) => {
    try {
        const data = createChallanInSchema.parse(req.body);
        const result = await corporateService.createChallanIn(data);
        res.status(201).json(result);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: "Invalid input", errors: error.errors });
        } else {
            console.error("[CorporateRoutes] challan IN failed");
            res.status(500).json({ message: "Failed to create challan IN" });
        }
    }
});

// 3. Create Challan OUT — atomic handover (CORPORATE-JOB-STATUS-01B)
router.post("/challans/out", requireAdminAuth, corpChallansOperate, async (req, res) => {
    try {
        const data = createChallanOutSchema.parse(req.body);
        const challanOutId = await corporateService.createChallanOut(data);
        res.status(201).json({ challanOutId });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ message: "Invalid input", code: "HANDOVER_INVALID_INPUT" });
        }
        if (error?.name === "CorporateHandoverError" || error?.code?.startsWith?.("HANDOVER_")) {
            return res.status(error.status || 400).json({
                message: error.message || "Handover rejected",
                code: error.code || "HANDOVER_REJECTED",
            });
        }
        // CORPORATE-JOB-STATUS-01B-HOTFIX-1-QA-CLOSE — stable safe log only (no raw error object/message fallback).
        console.error("[CorporateRoutes] challan OUT failed");
        res.status(500).json({ message: "Failed to create challan OUT" });
    }
});

// Get Client Bills
router.get("/clients/:id/bills", requireAdminAuth, corpBillsView, async (req, res) => {
    try {
        const bills = await storage.getCorporateBills(req.params.id);
        res.json(bills);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// Get Single Bill
router.get("/bills/:id", requireAdminAuth, corpBillsView, async (req, res) => {
    try {
        const bill = await storage.getCorporateBill(req.params.id);
        if (!bill) return res.status(404).json({ error: "Bill not found" });
        res.json(bill);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// GET /api/corporate/bills/:id/details — bill + normalized issued lines (itemized snapshot)
router.get("/bills/:id/details", requireAdminAuth, corpBillsView, async (req, res) => {
    try {
        const result = await corporateLtdBillingRepo.getBillWithLines(req.params.id);
        if (!result) return res.status(404).json({ error: "Bill not found" });
        res.json(result);
    } catch (error) {
        if (error instanceof CorporateLtdBillingError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error("[CorporateRoutes] bill details failed");
        res.status(500).json({ error: "Failed to fetch bill details" });
    }
});

// ── FINANCE-AFTERCARE-01.2: Corporate account balance + receipts ──────────────
// Normal Corporate payments settle the COMPANY ACCOUNT (not an invoice/bill/line).
// Isolated from POS, generic Due, refunds, warranty, jobs, and repair status.

// GET /api/corporate/clients/:id/account-balance — staff finance view
// Returns total billed (active bills), total received (account receipts), total due.
// Rejects Corporate Ltd. (limited_company) with 422 — it must use the itemized flow (Ticket 03).
router.get("/clients/:id/account-balance", requireAdminAuth, corpBillsView, async (req, res) => {
    try {
        await corporateAccountReceiptRepo.assertNormalCorporateClient(req.params.id);
        const balance = await corporateAccountReceiptRepo.getAccountBalance(req.params.id);
        res.json(balance);
    } catch (error) {
        if (error instanceof AccountBalanceDomainError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error("[CorporateRoutes] account-balance failed");
        res.status(500).json({ error: "Failed to fetch account balance" });
    }
});

// GET /api/corporate/clients/:id/account-receipts — list account receipts
router.get("/clients/:id/account-receipts", requireAdminAuth, corpBillsView, async (req, res) => {
    try {
        await corporateAccountReceiptRepo.assertNormalCorporateClient(req.params.id);
        const limit = parseInt(req.query.limit as string) || 100;
        const receipts = await corporateAccountReceiptRepo.listReceipts(req.params.id, Math.min(limit, 500));
        res.json(receipts);
    } catch (error) {
        if (error instanceof AccountBalanceDomainError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error("[CorporateRoutes] account-receipts list failed");
        res.status(500).json({ error: "Failed to fetch account receipts" });
    }
});

const recordAccountReceiptSchema = z.object({
    amount: z.number().positive().finite(),
    method: z.enum([...ALLOWED_METHODS] as [string, ...string[]]),
    reference: z.string().max(200).optional(),
    note: z.string().max(2000).optional(),
    idempotencyKey: z.string().max(200).optional(),
});

// POST /api/corporate/clients/:id/account-receipts — record an account receipt
// Rejects Corporate Ltd. inside the service transaction (FOR UPDATE lock) with 422.
router.post("/clients/:id/account-receipts", requireAdminAuth, corpBillsRecordPayment, async (req, res) => {
    try {
        const validated = recordAccountReceiptSchema.parse(req.body);
        const adminUser = (req as any).user;
        const receipt = await corporateAccountReceiptService.recordReceipt({
            corporateClientId: req.params.id,
            amount: validated.amount,
            method: validated.method,
            reference: validated.reference,
            note: validated.note,
            idempotencyKey: validated.idempotencyKey,
            receivedBy: adminUser?.id,
            receivedByName: adminUser?.name || adminUser?.username || undefined,
        });

        auditLogger.log({
            userId: adminUser?.id || "system",
            action: "CORPORATE_ACCOUNT_RECEIPT",
            entity: "CorporateAccountReceipt",
            entityId: receipt.id,
            details: `Account receipt ৳${validated.amount} (${validated.method}) for client ${req.params.id}`,
            newValue: { amount: validated.amount, method: validated.method, clientId: req.params.id },
            req,
        }).catch(() => {});

        res.status(201).json(receipt);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: "Invalid receipt data", details: error.errors });
        }
        if (error instanceof CorporateAccountReceiptError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        if (error && typeof error === "object" && "code" in error && (error as any).code === "23505") {
            return res.status(409).json({ error: "Duplicate receipt — idempotency key already used for this client", code: "IDEMPOTENCY_CONFLICT" });
        }
        console.error("[CorporateRoutes] account-receipt record failed");
        res.status(500).json({ error: "Failed to record account receipt" });
    }
});

// GET /api/corporate/legacy-bill-due-classifications — legacy link report (review-needed visible)
router.get("/legacy-bill-due-classifications", requireAdminAuth, corpBillsView, async (_req, res) => {
    try {
        const links = await corporateAccountReceiptRepo.listLegacyClassifications();
        res.json(links);
    } catch (error) {
        console.error("[CorporateRoutes] legacy classification list failed");
        res.status(500).json({ error: "Failed to fetch legacy classifications" });
    }
});

// ── FINANCE-AFTERCARE-01.3: Corporate Ltd. itemized billing ────────────────────
// Corporate Ltd. (clientType === 'limited_company') uses one saved billing preset
// per client, itemized issued bill lines + immutable layout/recipient snapshot, and
// bill/line receipt allocations. Isolated from POS, generic Due, normal Corporate
// account receipts, refunds, warranty, and jobs. Server enforces every UI boundary.

const billingPresetSchema = z.object({
    recipientPolicy: z.enum(["company_only", "attention_person"]),
    enabledColumns: z.array(z.enum([...ALL_COLUMN_KEYS] as [string, ...string[]])),
    attentionName: z.string().max(200).optional().nullable(),
    attentionContact: z.string().max(200).optional().nullable(),
    billingAddress: z.string().max(500).optional().nullable(),
});

// GET /api/corporate/clients/:id/billing-preset — read the saved preset (billers read it to apply)
router.get("/clients/:id/billing-preset", requireAdminAuth, corpBillsView, async (req, res) => {
    try {
        const preset = await corporateLtdBillingRepo.getBillingPreset(req.params.id);
        res.json(preset);
    } catch (error) {
        if (error instanceof CorporateLtdBillingError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error("[CorporateRoutes] billing-preset get failed");
        res.status(500).json({ error: "Failed to fetch billing preset" });
    }
});

// PUT /api/corporate/clients/:id/billing-preset — configure the one saved preset.
// Gated by corporate.bills.configureTemplates (Manager + Super Admin by default).
// Server rejects non-Corporate-Ltd. clients. Edits affect future bills only.
router.put("/clients/:id/billing-preset", requireAdminAuth, corpBillsConfigureTemplates, async (req, res) => {
    try {
        const data = billingPresetSchema.parse(req.body);
        const adminUser = (req as any).user;
        const preset = await corporateLtdBillingRepo.setBillingPreset(
            req.params.id,
            {
                recipientPolicy: data.recipientPolicy,
                enabledColumns: data.enabledColumns,
                attentionName: data.attentionName ?? null,
                attentionContact: data.attentionContact ?? null,
                billingAddress: data.billingAddress ?? null,
            },
            adminUser?.id || "system",
        );
        auditLogger.log({
            userId: adminUser?.id || "system",
            action: "CORPORATE_LTD_PRESET_UPDATE",
            entity: "CorporateClient",
            entityId: req.params.id,
            details: `Billing preset updated (recipient=${data.recipientPolicy}, cols=${data.enabledColumns.length})`,
            newValue: { recipientPolicy: data.recipientPolicy, enabledColumns: data.enabledColumns },
            req,
        }).catch(() => {});
        res.json(preset);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: "Invalid preset data", details: error.errors });
        }
        if (error instanceof CorporateLtdBillingError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error("[CorporateRoutes] billing-preset update failed");
        res.status(500).json({ error: "Failed to update billing preset" });
    }
});

// GET /api/corporate/clients/:id/eligible-jobs — eligible unbilled jobs for itemized billing
router.get("/clients/:id/eligible-jobs", requireAdminAuth, corpBillsCreate, async (req, res) => {
    try {
        const jobs = await corporateLtdBillingRepo.listEligibleJobs(req.params.id);
        const safe = jobs.map((j) => ({
            id: j.id,
            clientJobNumber: j.corporateJobNumber,
            promiseJobNumber: getSafeJobDisplayRef(j),
            device: j.device,
            tvSerialNumber: j.tvSerialNumber,
            modelNumber: j.modelNumber,
            screenSize: j.screenSize,
            reportedDefect: j.reportedDefect,
            estimatedCost: Number(j.estimatedCost) || 0,
            charges: Array.isArray(j.charges) ? j.charges : [],
        }));
        res.json(safe);
    } catch (error) {
        if (error instanceof CorporateLtdBillingError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error("[CorporateRoutes] eligible-jobs failed");
        res.status(500).json({ error: "Failed to fetch eligible jobs" });
    }
});

const previewBillSchema = z.object({
    jobIds: z.array(z.string().min(1)).min(1).max(500),
});

// POST /api/corporate/clients/:id/bills/preview — read-only preview applying the saved preset
router.post("/clients/:id/bills/preview", requireAdminAuth, corpBillsCreate, async (req, res) => {
    try {
        const { jobIds } = previewBillSchema.parse(req.body);
        const preset = await corporateLtdBillingRepo.getBillingPreset(req.params.id);
        const jobs = await corporateLtdBillingRepo.listEligibleJobs(req.params.id);
        const selected = jobs.filter((j) => jobIds.includes(j.id));
        const preview = corporateLtdBillingRepo.buildPreview(preset, selected);
        res.json(preview);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: "Invalid preview data", details: error.errors });
        }
        if (error instanceof CorporateLtdBillingError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error("[CorporateRoutes] bill preview failed");
        res.status(500).json({ error: "Failed to build bill preview" });
    }
});

const issueBillSchema = z.object({
    jobIds: z.array(z.string().min(1)).min(1).max(500),
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
});

// POST /api/corporate/clients/:id/bills/issue — issue an itemized bill with immutable snapshot
router.post("/clients/:id/bills/issue", requireAdminAuth, corpBillsCreate, async (req, res) => {
    try {
        const data = issueBillSchema.parse(req.body);
        const adminUser = (req as any).user;
        const result = await corporateLtdBillingRepo.issueBill(
            req.params.id,
            data.jobIds,
            data.periodStart,
            data.periodEnd,
            adminUser?.id || "system",
        );
        auditLogger.log({
            userId: adminUser?.id || "system",
            action: "CORPORATE_LTD_BILL_ISSUED",
            entity: "CorporateBill",
            entityId: result.bill.id,
            details: `Itemized bill ${result.bill.billNumber} issued (${result.lines.length} lines, ৳${result.bill.grandTotal})`,
            req,
        }).catch(() => {});
        res.status(201).json(result);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: "Invalid issue data", details: error.errors });
        }
        if (error instanceof CorporateLtdBillingError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error("[CorporateRoutes] bill issue failed");
        res.status(500).json({ error: "Failed to issue bill" });
    }
});

// GET /api/corporate/bills/:id/balance — bill + line balances for a Corporate Ltd. bill
router.get("/bills/:id/balance", requireAdminAuth, corpBillsView, async (req, res) => {
    try {
        const balance = await corporateLtdBillingRepo.getBillBalance(req.params.id);
        res.json(balance);
    } catch (error) {
        if (error instanceof CorporateLtdBillingError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        console.error("[CorporateRoutes] bill balance failed");
        res.status(500).json({ error: "Failed to fetch bill balance" });
    }
});

const recordLtdReceiptSchema = z.object({
    amount: z.number().positive().finite(),
    method: z.enum([...ALLOWED_METHODS] as [string, ...string[]]),
    reference: z.string().max(200).optional(),
    note: z.string().max(2000).optional(),
    idempotencyKey: z.string().max(200).optional(),
    allocations: z.array(z.object({
        billLineItemId: z.string().optional().nullable(),
        amount: z.number().positive().finite(),
    })).optional(),
});

// POST /api/corporate/bills/:id/receipts — record a Corporate Ltd. bill receipt + optional allocations
router.post("/bills/:id/receipts", requireAdminAuth, corpBillsRecordPayment, async (req, res) => {
    try {
        const validated = recordLtdReceiptSchema.parse(req.body);
        const adminUser = (req as any).user;
        // Resolve the bill's client from the path (server re-verifies ownership inside the lock).
        const billWithLines = await corporateLtdBillingRepo.getBillWithLines(req.params.id);
        if (!billWithLines) {
            return res.status(404).json({ error: "Bill not found" });
        }
        const result = await corporateLtdBillingRepo.recordReceiptAndAllocations({
            corporateClientId: billWithLines.bill.corporateClientId || "",
            billId: req.params.id,
            amount: validated.amount,
            method: validated.method,
            reference: validated.reference,
            note: validated.note,
            idempotencyKey: validated.idempotencyKey,
            receivedBy: adminUser?.id,
            receivedByName: adminUser?.name || adminUser?.username || undefined,
            allocations: validated.allocations,
        });
        auditLogger.log({
            userId: adminUser?.id || "system",
            action: "CORPORATE_LTD_RECEIPT",
            entity: "CorporateLtdReceipt",
            entityId: result.receipt.id,
            details: `Itemized receipt ৳${validated.amount} (${validated.method}) for bill ${req.params.id}`,
            newValue: { amount: validated.amount, method: validated.method, allocations: result.allocations.length },
            req,
        }).catch(() => {});
        res.status(201).json(result);
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: "Invalid receipt data", details: error.errors });
        }
        if (error instanceof CorporateLtdBillingError) {
            return res.status(error.status).json({ error: error.message, code: error.code });
        }
        if (error && typeof error === "object" && "code" in error && (error as any).code === "23505") {
            return res.status(409).json({ error: "Duplicate receipt — idempotency key already used for this bill", code: "IDEMPOTENCY_CONFLICT" });
        }
        console.error("[CorporateRoutes] ltd receipt record failed");
        res.status(500).json({ error: "Failed to record itemized receipt" });
    }
});

// 4. Generate Corporate Master Bill (Manual selection)
router.post("/bills/generate", requireAdminAuth, corpBillsCreate, async (req, res) => {
    try {
        const data = generateBillSchema.parse(req.body);
        const bill = await storage.generateCorporateBill(data);
        res.status(201).json(bill);
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
});

// 4.5 Auto-Generate Consolidated Monthly Statement
const autoGenerateStatementSchema = z.object({
    corporateClientId: z.string(),
    year: z.number().int().min(2020),
    month: z.number().int().min(1).max(12),
});

router.post("/bills/auto-generate", requireAdminAuth, corpBillsCreate, async (req, res) => {
    try {
        const data = autoGenerateStatementSchema.parse(req.body);

        // Calculate start and end of the specified month
        const periodStart = new Date(data.year, data.month - 1, 1);
        const periodEnd = new Date(data.year, data.month, 0, 23, 59, 59, 999);

        // Fetch all jobs for this client
        const allJobs = await storage.getJobsByCorporateClient(data.corporateClientId, 1, 1000); // Need a high limit or a dedicated fetch

        // Defensive: handle both PaginationResult and raw array
        const jobsList = Array.isArray(allJobs) ? allJobs : allJobs.items;

        // Filter for completed/delivered jobs within the date range that aren't already billed
        const unbilledCompletedJobs = jobsList.filter(job => {
            const isCompletedStatus = job.status === 'Completed' || job.status === 'Delivered';
            const isUnbilled = job.billingStatus !== 'billed' && job.billingStatus !== 'invoiced';

            // Bill by COMPLETION date, not creation date. Keying on createdAt meant a
            // job created in one month but completed the next was billed in neither
            // run → permanent revenue leak. Fall back to updatedAt/createdAt only if
            // completedAt is missing.
            const completionSource = (job as any).completedAt || (job as any).updatedAt || job.createdAt;
            const jobDate = new Date(completionSource);
            const isInPeriod = jobDate >= periodStart && jobDate <= periodEnd;

            return isCompletedStatus && isUnbilled && isInPeriod;
        });

        if (unbilledCompletedJobs.length === 0) {
            return res.status(400).json({ message: "No unbilled, completed jobs found for this period." });
        }

        const jobIds = unbilledCompletedJobs.map(j => j.id);

        // Run through standard bill generator
        const bill = await storage.generateCorporateBill({
            corporateClientId: data.corporateClientId,
            jobIds,
            periodStart,
            periodEnd
        });

        res.status(201).json(bill);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: "Invalid input", errors: error.errors });
        } else {
            console.error(error);
            res.status(500).json({ message: (error as Error).message });
        }
    }
});

// 5. Update Single Corporate Job Status (Inline Edit)// ----------------------------------------------------------------------
// EXCEL PARSING (No AI Dependency)
// ----------------------------------------------------------------------
import ExcelJS from 'exceljs';
import multer from 'multer';
import JSZip from 'jszip';

// Use memory storage for file uploads
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 10, parts: 10 } });

// Safe upload wrapper to translate Multer errors into JSON responses
function safeUpload(req: Request, res: Response, next: NextFunction) {
    upload.single('file')(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(413).json({ error: 'Uploaded file is too large.' });
                }
                return res.status(400).json({ error: 'Invalid upload payload.' });
            }
            return next(err);
        }
        next();
    });
}

const PARSE_MAX_WORKSHEETS = 5;
const PARSE_MAX_ROWS = 5000;
const PARSE_MAX_COLUMNS = 50;
const PARSE_MAX_CELL_TEXT = 10000;

function isValidZipBuffer(buffer: Buffer): boolean {
    return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4B;
}

const DANGEROUS_HEADER_NAMES = new Set(['__proto__', 'prototype', 'constructor', 'proto']);

// Column name variations for smart detection
const COLUMN_PATTERNS = {
    corporateJobNumber: ['job no', 'job number', 'job ref', 'reference', 'job id', 'ticket no', 'ticket id', 'ref no'],
    deviceBrand: ['brand', 'manufacturer', 'make', 'brand name', 'oem'],
    model: ['model', 'model no', 'model number', 'tv model', 'device model', 'product name', 'device', 'detail', 'details', 'description', 'tv', 'item'],
    serialNumber: ['serial', 'serial no', 'serial number', 's/n', 'sn', 'sr. no', 'sr no', 's.n', 'sr.no', 'srno'],
    reportedDefect: ['issue', 'defect', 'problem', 'complaint', 'reported issue', 'fault', 'symptom'],
    initialStatus: ['condition', 'state'],
    status: ['status', 'work status', 'job status'],
    customerName: ['customer', 'customer name', 'end customer', 'client customer'],
    externalJobRef: ['external ref', 'client ref', 'tracking no'],
    challanNumber: ['challan', 'challan no', 'challan number', 'dc no'],
    itemType: ['item type', 'type', 'goods type', 'work type'],
    batchNumber: ['batch', 'batch no', 'batch number', 'lot no'],
    receivedDate: ['date', 'receive date', 'received date', 'intake date']
};

const normalizeImportedStatus = (value?: string) => {
    const text = (value || '').toLowerCase().trim();
    if (!text) return { initialStatus: 'NG' as const, status: 'Received' as const };
    if (['ok', 'okay', 'declared ok', 'done', 'ready'].includes(text)) return { initialStatus: 'OK' as const, status: 'Declared OK' as const };
    if (['ng', 'not good', 'not ok', 'declared ng', 'declared not ok', 'bad'].includes(text)) return { initialStatus: 'NG' as const, status: 'Declared NG' as const };
    if (['pending', 'hold', 'waiting'].includes(text)) return { initialStatus: 'NG' as const, status: 'Pending' as const };
    if (['new', 'received', 'not started', 'untouched', 'not touched'].includes(text)) return { initialStatus: 'NG' as const, status: 'Received' as const };
    return { initialStatus: 'NG' as const, status: 'Received' as const };
};

const normalizeColumnText = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const matchesColumnPattern = (headerText: string, pattern: string) => {
    const header = normalizeColumnText(headerText);
    const normalizedPattern = normalizeColumnText(pattern);

    if (!normalizedPattern) return false;
    if (normalizedPattern.length <= 2) {
        return header === normalizedPattern || (header.length <= 5 && header.split(' ').includes(normalizedPattern));
    }

    return header.includes(normalizedPattern);
};

const buildTableImportResult = (tableRows: string[][]) => {
    const headers = (tableRows[0] || []).map((header, index) => header.trim() || `Column ${index + 1}`);
    const columnMapping: Record<string, string> = {};

    headers.forEach((originalHeader, index) => {
        const normalizedHeader = originalHeader.toLowerCase().replace(/[^a-z0-9]+/g, '');
        if (DANGEROUS_HEADER_NAMES.has(normalizedHeader)) {
            throw new Error('DANGEROUS_HEADER');
        }
        for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
            if (patterns.some(pattern => matchesColumnPattern(originalHeader, pattern))) {
                columnMapping[index.toString()] = field;
                break;
            }
        }
    });

    const rows: any[] = [];
    const rawRows: Record<string, string>[] = [];

    for (const row of tableRows.slice(1)) {
        const device: any = Object.create(null);
        const rawRow: Record<string, string> = Object.create(null);
        let hasData = false;

        row.forEach((cellValue, index) => {
            const value = String(cellValue || '').trim();
            const header = headers[index] || `Column ${index + 1}`;
            const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]+/g, '');
            if (DANGEROUS_HEADER_NAMES.has(normalizedHeader)) {
                throw new Error('DANGEROUS_HEADER');
            }
            rawRow[header] = value;
            if (value) hasData = true;

            const field = columnMapping[index.toString()];
            if (field) device[field] = value;
        });

        if (!hasData) continue;

        const normalizedStatus = normalizeImportedStatus(device.status || device.initialStatus);
        device.initialStatus = normalizedStatus.initialStatus;
        device.status = normalizedStatus.status;
        rows.push(device);
        rawRows.push(rawRow);
    }

    return {
        devices: rows,
        headers,
        rawRows,
        columnMapping,
        totalRows: rows.length,
    };
};

const parseLinearOfficeRows = (lines: string[]) => {
    let headerStartIndex = -1;
    let headerEndIndex = -1;
    const columnMapping: Record<string, string> = {};

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        let matchedField = null;

        for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
            if (patterns.some(pattern => matchesColumnPattern(line, pattern))) {
                matchedField = field;
                break;
            }
        }

        if (matchedField) {
            if (headerStartIndex === -1) headerStartIndex = i;
            columnMapping[(i - headerStartIndex).toString()] = matchedField;
            headerEndIndex = i;
        } else if (headerStartIndex !== -1 && (i - headerEndIndex) > 2) {
            break;
        }
    }

    if (Object.keys(columnMapping).length === 0) {
        return {
            error: "Could not detect any valid column headers (Job No, Model, S/N, etc.)",
            debug: lines.slice(0, 20),
        };
    }

    const detectedColumnCount = (headerEndIndex - headerStartIndex) + 1;

    if (detectedColumnCount < 2) {
        return {
            error: "Detected headers, but structure is unclear. Found: " + Object.values(columnMapping).join(", "),
            debug: lines.slice(0, 20),
        };
    }

    const headers = lines.slice(headerStartIndex, headerEndIndex + 1);
    const rows: any[] = [];
    const rawRows: Record<string, string>[] = [];
    let dataStartIndex = headerEndIndex + 1;

    while (dataStartIndex < lines.length) {
        const chunk = lines.slice(dataStartIndex, dataStartIndex + detectedColumnCount);
        if (chunk.length < detectedColumnCount) break;

        const device: any = {};
        const rawRow: Record<string, string> = {};
        let hasData = false;

        chunk.forEach((cellValue, relativeIndex) => {
            rawRow[headers[relativeIndex] || `Column ${relativeIndex + 1}`] = cellValue;

            const field = columnMapping[relativeIndex.toString()];
            if (field) {
                device[field] = cellValue;
                hasData = true;
            }
        });

        if (hasData) {
            const normalizedStatus = normalizeImportedStatus(device.status || device.initialStatus);
            device.initialStatus = normalizedStatus.initialStatus;
            device.status = normalizedStatus.status;

            rows.push(device);
            rawRows.push(rawRow);
        }

        dataStartIndex += detectedColumnCount;
    }

    return {
        data: {
            devices: rows,
            headers,
            rawRows,
            columnMapping,
            totalRows: rows.length,
            detectedColumnCount,
        },
    };
};

const decodeXmlText = (value: string) =>
    value
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'");

const extractTagText = (xml: string, tagName: string) =>
    Array.from(xml.matchAll(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'g')))
        .map(match => decodeXmlText(match[1]).trim())
        .filter(Boolean)
        .join(' ');

const extractDocxTableRows = async (buffer: Buffer) => {
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file('word/document.xml')?.async('text');
    if (!documentXml) return [];

    for (const tableMatch of Array.from(documentXml.matchAll(/<w:tbl[\s\S]*?<\/w:tbl>/g))) {
        const tableXml = tableMatch[0];
        const rows = Array.from(tableXml.matchAll(/<w:tr[\s\S]*?<\/w:tr>/g))
            .map(rowMatch => Array.from(rowMatch[0].matchAll(/<w:tc[\s\S]*?<\/w:tc>/g))
                .map(cellMatch => extractTagText(cellMatch[0], 'w:t')));

        if (rows.length >= 2 && rows[0].length >= 2) return rows;
    }

    return [];
};

const extractPptxTableRows = async (buffer: Buffer) => {
    const zip = await JSZip.loadAsync(buffer);
    const slideFiles = Object.values(zip.files)
        .filter(file => /^ppt\/slides\/slide\d+\.xml$/.test(file.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    for (const file of slideFiles) {
        const xml = await file.async('text');
        for (const tableMatch of Array.from(xml.matchAll(/<a:tbl[\s\S]*?<\/a:tbl>/g))) {
            const rows = Array.from(tableMatch[0].matchAll(/<a:tr[\s\S]*?<\/a:tr>/g))
                .map(rowMatch => Array.from(rowMatch[0].matchAll(/<a:tc[\s\S]*?<\/a:tc>/g))
                    .map(cellMatch => extractTagText(cellMatch[0], 'a:t')));

            if (rows.length >= 2 && rows[0].length >= 2) return rows;
        }
    }

    return [];
};

router.post("/clients/challans/parse-excel", requireAdminAuth, corpChallansOperate, safeUpload, async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
    }

    try {
        const workbook = new ExcelJS.Workbook();
        const fileName = req.file.originalname.toLowerCase();
        const buffer = req.file.buffer;

        if (fileName.endsWith('.csv')) {
            if (buffer.length === 0) {
                return res.status(400).json({ error: 'File is empty.' });
            }
            const stream = new Readable();
            stream.push(buffer);
            stream.push(null);
            await workbook.csv.read(stream);
        } else {
            if (!isValidZipBuffer(buffer)) {
                return res.status(400).json({ error: 'Invalid XLSX file. The file is not a valid spreadsheet.' });
            }
            try {
                await workbook.xlsx.load(buffer as any);
            } catch {
                return res.status(400).json({ error: 'Invalid XLSX file. Could not read the spreadsheet structure.' });
            }
        }

        if (workbook.worksheets.length > PARSE_MAX_WORKSHEETS) {
            return res.status(400).json({ error: `Spreadsheet has too many worksheets. Maximum allowed: ${PARSE_MAX_WORKSHEETS}.` });
        }

        const worksheet = workbook.worksheets[0];
        if (!worksheet) {
            return res.status(400).json({ error: 'No worksheets found in the file.' });
        }

        if (worksheet.rowCount > PARSE_MAX_ROWS) {
            return res.status(400).json({ error: `Spreadsheet has too many rows. Maximum allowed: ${PARSE_MAX_ROWS}.` });
        }

        const rows: any[] = [];
        const rawRows: Record<string, string>[] = [];
        const headers: string[] = [];

        const headerRow = worksheet.getRow(1);
        const columnMapping: Record<string, string> = {};
        const headerByColumn: Record<number, string> = {};
        let maxColNumber = 0;

        headerRow.eachCell((cell, colNumber) => {
            const originalHeader = cell.value?.toString().trim() || `Column ${colNumber}`;
            const headerText = originalHeader.toLowerCase();
            const normalizedKey = headerText.replace(/[^a-z0-9]+/g, '');

            if (DANGEROUS_HEADER_NAMES.has(normalizedKey)) {
                throw new Error('DANGEROUS_HEADER');
            }

            headers.push(originalHeader);
            headerByColumn[colNumber] = originalHeader;
            maxColNumber = Math.max(maxColNumber, colNumber);

            for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
                if (patterns.some(pattern => matchesColumnPattern(headerText, pattern))) {
                    columnMapping[colNumber.toString()] = field;
                    break;
                }
            }
        });

        if (maxColNumber > PARSE_MAX_COLUMNS) {
            return res.status(400).json({ error: `Spreadsheet has too many columns. Maximum allowed: ${PARSE_MAX_COLUMNS}.` });
        }

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;

            const device: any = {};
            const rawRow: Record<string, string> = {};
            let hasData = false;

            row.eachCell((cell, colNumber) => {
                const header = headerByColumn[colNumber] || `Column ${colNumber}`;
                const value = cell.value?.toString().trim() || '';
                if (value.length > PARSE_MAX_CELL_TEXT) {
                    throw new Error('CELL_TEXT_TOO_LONG');
                }
                rawRow[header] = value;
                if (value) hasData = true;

                const field = columnMapping[colNumber.toString()];
                if (field) {
                    device[field] = value;
                }
            });

            if (!hasData) return;

            const normalizedStatus = normalizeImportedStatus(device.status || device.initialStatus);
            device.initialStatus = normalizedStatus.initialStatus;
            device.status = normalizedStatus.status;

            rows.push(device);
            rawRows.push(rawRow);
        });

        res.json({
            devices: rows,
            headers,
            rawRows,
            columnMapping,
            totalRows: rows.length
        });

    } catch (error) {
        if (error instanceof Error && error.message === 'CELL_TEXT_TOO_LONG') {
            return res.status(400).json({ error: `Cell text exceeds maximum length of ${PARSE_MAX_CELL_TEXT} characters.` });
        }
        if (error instanceof Error && error.message === 'DANGEROUS_HEADER') {
            return res.status(400).json({ error: 'File contains a dangerous header name (__proto__, prototype, or constructor).' });
        }
        console.error("[CorporateRoutes] Excel/CSV parse failed:", (error as Error).message);
        res.status(400).json({ error: 'Failed to parse file. Please check the file format and content.' });
    }
});

// DOCX PARSING (Microsoft Word)
import mammoth from 'mammoth';

router.post("/clients/challans/parse-docx", requireAdminAuth, corpChallansOperate, safeUpload, async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
    }

    if (!isValidZipBuffer(req.file.buffer)) {
        return res.status(400).json({ error: 'Invalid DOCX file. The file is not a valid Word document.' });
    }

    try {
        const tableRows = await extractDocxTableRows(req.file.buffer as Buffer);
        if (tableRows.length > 0) {
            return res.json(buildTableImportResult(tableRows));
        }

        const result = await mammoth.extractRawText({ buffer: req.file.buffer as Buffer });
        const text = result.value;
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const parsed = parseLinearOfficeRows(lines);

        if (parsed.error) {
            return res.status(400).json({
                message: parsed.error,
                debug: parsed.debug,
            });
        }

        res.json(parsed.data);

    } catch (error) {
        if (error instanceof Error && error.message === 'DANGEROUS_HEADER') {
            return res.status(400).json({ error: 'File contains a dangerous header name (__proto__, prototype, or constructor).' });
        }
        console.error("[CorporateRoutes] DOCX parse failed:", (error as Error).message);
        res.status(400).json({ error: 'Failed to parse DOCX file. Please check the file format.' });
    }
});

router.post("/clients/challans/parse-pptx", requireAdminAuth, corpChallansOperate, safeUpload, async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
    }

    if (!isValidZipBuffer(req.file.buffer)) {
        return res.status(400).json({ error: 'Invalid PPTX file. The file is not a valid PowerPoint document.' });
    }

    try {
        const tableRows = await extractPptxTableRows(req.file.buffer as Buffer);
        if (tableRows.length > 0) {
            return res.json(buildTableImportResult(tableRows));
        }

        const zip = await JSZip.loadAsync(req.file.buffer as Buffer);
        const slideFiles = Object.values(zip.files)
            .filter(file => /^ppt\/slides\/slide\d+\.xml$/.test(file.name))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        const lines: string[] = [];

        for (const file of slideFiles) {
            const xml = await file.async('text');
            for (const match of Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g))) {
                const text = decodeXmlText(match[1]).trim();
                if (text) lines.push(text);
            }
        }

        const parsed = parseLinearOfficeRows(lines);

        if (parsed.error) {
            return res.status(400).json({
                message: parsed.error,
                debug: parsed.debug,
            });
        }

        res.json(parsed.data);
    } catch (error) {
        if (error instanceof Error && error.message === 'DANGEROUS_HEADER') {
            return res.status(400).json({ error: 'File contains a dangerous header name (__proto__, prototype, or constructor).' });
        }
        console.error("[CorporateRoutes] PPTX parse failed:", (error as Error).message);
        res.status(400).json({ error: 'Failed to parse PPTX file. Please check the file format.' });
    }
});
router.patch("/jobs/:id/status", requireAdminAuth, requireGranularPermission('jobs.advanceStatus'), async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ message: "Status required", code: "CORPORATE_DECLARATION_ONLY" });

        await storage.updateCorporateJobStatus(req.params.id, status);

        try {
            const { auditLogger } = await import("../utils/auditLogger.js");
            await auditLogger.log({
                userId: (req as any).session?.adminUserId || (req as any).user?.id || "system",
                action: "CORPORATE_DECLARATION_SET",
                entity: "JobTicket",
                entityId: req.params.id,
                details: `Corporate intake declaration updated via legacy status endpoint`,
                newValue: { declarationInput: String(status).slice(0, 40) },
                req,
            });
        } catch {
            /* audit best-effort */
        }

        res.json({ success: true });
    } catch (error: any) {
        if (
            error?.code === "CORPORATE_READY_REQUIRES_TESTING" ||
            error?.code === "CORPORATE_JOB_REQUIRED" ||
            error?.code === "CORPORATE_DECLARATION_ONLY" ||
            error?.code === "JOB_NOT_FOUND" ||
            error?.name === "CorporateDeclarationError"
        ) {
            return res.status(error.status || 409).json({
                message: error.message || "Corporate declaration update rejected",
                code: error.code || "CORPORATE_DECLARATION_ERROR",
            });
        }
        if (error?.name === "ProtectedJobFieldError" || error?.code === "PROTECTED_JOB_FIELD") {
            return res.status(400).json({ message: error.message, code: "PROTECTED_JOB_FIELD" });
        }
        if (error?.name === "NgWorkflowLockedError" || error?.code === "NG_WORKFLOW_LOCKED") {
            return res.status(409).json({ message: error.message, code: "NG_WORKFLOW_LOCKED" });
        }
        console.error("[CorporateRoutes] Declaration update failed:", error?.message || error);
        res.status(500).json({ message: "Failed to update corporate declaration" });
    }
});

// 6. Bulk Update Priority
const bulkPrioritySchema = z.object({
    jobIds: z.array(z.string()).min(1),
    priority: z.enum(["Low", "Medium", "High", "Critical"]).nullable(),
});

router.patch("/jobs/bulk-priority", requireAdminAuth, requireGranularPermission('jobs.edit'), async (req, res) => {
    try {
        const data = bulkPrioritySchema.parse(req.body);

        await db.update(jobTickets)
            .set({ priority: data.priority })
            .where(inArray(jobTickets.id, data.jobIds));

        res.json({ success: true, updatedCount: data.jobIds.length });
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: "Invalid input", errors: error.errors });
        } else {
            console.error("Bulk priority update failed:", error);
            res.status(500).json({ message: "Failed to update bulk priorities" });
        }
    }
});

// ── Phase G: Billing profile read/update ─────────────────────────────────────

router.get("/billing-profile/:clientId", requireAdminAuth, corpBillsConfigureTemplates, async (req, res) => {
    try {
        const profile = await storage.ensureBillingProfile(req.params.clientId);
        if (!profile) return res.status(404).json({ message: "Corporate client not found" });
        res.json(profile);
    } catch { res.status(500).json({ message: "Failed to fetch billing profile" }); }
});

router.patch("/billing-profile/:clientId", requireAdminAuth, corpBillsConfigureTemplates, async (req, res) => {
    try {
        const allowed = [
            'tier', 'scatterBillingEnabled', 'scatterBillingMode', 'requiresSerialMatch',
            'requiresModelMatch', 'suppliesSparePartsToUs', 'sparePartHandling',
            'acceptanceCriteria', 'invoiceCriteriaJson', 'slaDays', 'slaBreachAction',
            'quoteChannel', 'defaultAmountRangeMin', 'defaultAmountRangeMax',
        ] as const;
        const update: Record<string, any> = { updatedAt: new Date() };
        for (const key of allowed) {
            if (req.body[key] !== undefined) update[key] = req.body[key];
        }
        await db.update(billingProfiles).set(update)
            .where(eq(billingProfiles.corporateClientId, req.params.clientId));
        res.json({ success: true });
    } catch { res.status(500).json({ message: "Failed to update billing profile" }); }
});

// ── Phase G: Scatter billing (reactive mode) ──────────────────────────────────
// POST /api/corporate/bills/:billId/scatter
// Body: { splits: [{ newBillId?: string, lineItemIndices: number[] }] }
//       lineItemIndices = indices into the bill's line_items JSONB array
// Creates N new bills, moves indicated line items, marks original superseded.

const scatterSchema = z.object({
    splits: z.array(z.object({
        lineItemIndices: z.array(z.number().int().min(0)),
        periodStart: z.string().optional(),
        periodEnd: z.string().optional(),
    })).min(2, "Need at least 2 splits"),
    reason: z.string().optional(),
});

router.post("/bills/:billId/scatter", requireAdminAuth, corpBillsCreate, async (req: any, res) => {
    try {
        const staffId = req.admin?.id || req.session?.adminUserId || 'admin';
        const { splits, reason } = scatterSchema.parse(req.body);

        const [original] = await db.select().from(corporateBills)
            .where(eq(corporateBills.id, req.params.billId)).limit(1);
        if (!original) return res.status(404).json({ message: "Bill not found" });
        if ((original as any).billStatus === 'superseded') {
            return res.status(400).json({ message: "Bill already superseded" });
        }

        const lineItems: any[] = Array.isArray((original as any).lineItems) ? (original as any).lineItems : [];
        const newBillIds: string[] = [];

        await db.transaction(async (tx) => {
            for (const split of splits) {
                const splitItems = split.lineItemIndices.map(i => lineItems[i]).filter(Boolean);
                if (splitItems.length === 0) continue;

                const splitTotal = splitItems.reduce((s: number, item: any) => s + (item.amount ?? item.grand_total ?? 0), 0);
                const newBillId = `BILL-SPLIT-${nanoid(8).toUpperCase()}`;
                const newBillNumber = `${original.billNumber}-S${newBillIds.length + 1}`;

                await tx.insert(corporateBills).values({
                    id: newBillId,
                    billNumber: newBillNumber,
                    corporateClientId: original.corporateClientId,
                    lineItems: splitItems,
                    subtotal: splitTotal,
                    grandTotal: splitTotal,
                    paymentStatus: 'unpaid',
                    billStatus: 'active',
                    createdBy: staffId,
                    createdAt: new Date(),
                } as any);
                newBillIds.push(newBillId);
            }

            // Mark original superseded
            await tx.update(corporateBills)
                .set({
                    billStatus: 'superseded',
                    supersededByBillIds: newBillIds,
                    supersededAt: new Date(),
                    supersededByUserId: staffId,
                    supersededReason: reason ?? 'Customer-requested scatter',
                    updatedAt: new Date(),
                } as any)
                .where(eq(corporateBills.id, req.params.billId));

            // Audit log
            await tx.insert(billEditLog).values({
                id: `bel_${nanoid(10)}`,
                billId: req.params.billId,
                action: 'scatter',
                beforeJson: { billStatus: 'active', billNumber: original.billNumber },
                afterJson: { billStatus: 'superseded', replacedBy: newBillIds },
                performedBy: staffId,
                reason: reason ?? 'Customer-requested scatter',
            });
        });

        res.json({ success: true, originalBillId: req.params.billId, newBillIds });
    } catch (error: any) {
        if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: error.errors });
        console.error("[Scatter] Failed:", error);
        res.status(500).json({ message: "Scatter operation failed" });
    }
});

// ── Phase G: Quote log ────────────────────────────────────────────────────────

const quoteLogSchema = z.object({
    corporateClientId: z.string(),
    jobId: z.string().optional(),
    callerName: z.string(),
    callerPhone: z.string().optional(),
    approvedByName: z.string().optional(),
    verbalAmount: z.number().optional(),
    notes: z.string().optional(),
    calledAt: z.string().optional(),
});

import { quoteLogs } from "../../shared/schema.js";

router.post("/quote-logs", requireAdminAuth, corpManageClients, async (req: any, res) => {
    try {
        const data = quoteLogSchema.parse(req.body);
        const staffId = req.admin?.id || req.session?.adminUserId || 'admin';
        const staffName = req.admin?.name || req.session?.adminUser?.name || staffId;

        const [log] = await db.insert(quoteLogs).values({
            id: `ql_${nanoid(10)}`,
            ...data,
            calledAt: data.calledAt ? new Date(data.calledAt) : new Date(),
            loggedBy: staffName,
        } as any).returning();

        res.status(201).json(log);
    } catch (error: any) {
        if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid input", errors: error.errors });
        res.status(500).json({ message: "Failed to log quote" });
    }
});

router.get("/quote-logs/:clientId", requireAdminAuth, corpRead, async (req, res) => {
    try {
        const rows = await db.select().from(quoteLogs)
            .where(eq(quoteLogs.corporateClientId, req.params.clientId))
            .orderBy(quoteLogs.calledAt);
        res.json(rows);
    } catch { res.status(500).json({ message: "Failed to fetch quote logs" }); }
});

export default router;
