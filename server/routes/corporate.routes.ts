
import { Router } from "express";
import { storage } from "../storage.js";
import { z } from "zod";
import { Readable } from 'stream';
import { insertCorporateClientSchema } from "../../shared/schema.js";
import bcrypt from "bcryptjs";
import { getDefaultPermissions, requireAdminAuth, requirePermission } from "./middleware/auth.js";
import { db } from "../db.js";
import { corporateService } from "../services/corporate.service.js";
import { and, desc, inArray, eq, sql } from "drizzle-orm";
import { jobTickets, corporateBills, billLineItems, billEditLog, billingProfiles, jobBatches, jobExtensionRequests } from "../../shared/schema.js";
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
    challanInId: z.string().optional(), // Optional now, as we might not link to IN directly for numbering
    corporateClientId: z.string(), // We need client ID if not linking to IN
    jobIds: z.array(z.string()),
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
router.get("/clients", requireAdminAuth, requirePermission('corporate'), async (req, res) => {
    try {
        const clients = await storage.getAllCorporateClients();
        res.json(clients);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch corporate clients" });
    }
});

// 0.2. Get Single Corporate Client
router.get("/clients/:id", requireAdminAuth, requirePermission('corporate'), async (req, res) => {
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
router.post("/clients", requireAdminAuth, requirePermission('corporate'), async (req, res) => {
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
router.get("/challans/:id/jobs", requireAdminAuth, requirePermission('corporate'), async (req, res) => {
    try {
        const jobs = await storage.getChallanJobs(req.params.id);
        res.json(jobs);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch challan jobs" });
    }
});

// 1.5. Get All Jobs for a Corporate Client (for selection)
router.get("/clients/:id/jobs", requireAdminAuth, requirePermission('corporate'), async (req, res) => {
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
router.get("/clients/:id/branches", requireAdminAuth, requirePermission('corporate'), async (req, res) => {
    try {
        const branches = await storage.getCorporateClientBranches(req.params.id);
        res.json(branches);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch branches" });
    }
});

// 1.5.2 Update Corporate Client
router.patch("/clients/:id", requireAdminAuth, requirePermission('corporate'), async (req, res) => {
    try {
        const client = await storage.updateCorporateClient(req.params.id, req.body);
        res.json(client);
    } catch (error) {
        res.status(500).json({ message: "Failed to update client" });
    }
});

router.get("/clients/:id/rules", requireAdminAuth, requirePermission('corporate'), async (req, res) => {
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

router.patch("/clients/:id/rules", requireAdminAuth, requirePermission('corporate'), async (req, res) => {
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

router.get("/clients/:id/batches", requireAdminAuth, requirePermission('corporate'), async (req, res) => {
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

router.get("/clients/:id/extension-requests", requireAdminAuth, requirePermission('corporate'), async (req, res) => {
    try {
        const requests = await db.select().from(jobExtensionRequests)
            .where(eq(jobExtensionRequests.corporateClientId, req.params.id))
            .orderBy(desc(jobExtensionRequests.createdAt));
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch extension requests" });
    }
});

router.post("/batches/:batchId/extension-requests", requireAdminAuth, requirePermission('corporate'), async (req, res) => {
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

router.patch("/extension-requests/:id", requireAdminAuth, requirePermission('corporate'), async (req, res) => {
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
router.get("/clients/:id/challans", requireAdminAuth, requirePermission('corporate'), async (req, res) => {
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
router.post("/challans/in", requireAdminAuth, requirePermission('corporate'), async (req, res) => {
    try {
        const data = createChallanInSchema.parse(req.body);
        const result = await corporateService.createChallanIn(data);
        res.status(201).json(result);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: "Invalid input", errors: error.errors });
        } else {
            res.status(500).json({ message: (error as Error).message });
        }
    }
});

// 3. Create Challan OUT (Bulk Check-out)
router.post("/challans/out", requireAdminAuth, requirePermission('corporate'), async (req, res) => {
    try {
        const data = createChallanOutSchema.parse(req.body);
        const challanOutId = await corporateService.createChallanOut(data);
        res.status(201).json({ challanOutId });
    } catch (error) {
        res.status(500).json({ message: (error as Error).message });
    }
});

// Get Client Bills
router.get("/clients/:id/bills", requireAdminAuth, requirePermission('corporate'), async (req, res) => {
    try {
        const bills = await storage.getCorporateBills(req.params.id);
        res.json(bills);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// Get Single Bill
router.get("/bills/:id", requireAdminAuth, requirePermission('corporate'), async (req, res) => {
    try {
        const bill = await storage.getCorporateBill(req.params.id);
        if (!bill) return res.status(404).json({ error: "Bill not found" });
        res.json(bill);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// 4. Generate Corporate Master Bill (Manual selection)
router.post("/bills/generate", requireAdminAuth, requirePermission('corporate'), async (req, res) => {
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

router.post("/bills/auto-generate", requireAdminAuth, requirePermission('corporate'), async (req, res) => {
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
const upload = multer({ storage: multer.memoryStorage() });

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
        const device: any = {};
        const rawRow: Record<string, string> = {};
        let hasData = false;

        row.forEach((cellValue, index) => {
            const value = String(cellValue || '').trim();
            const header = headers[index] || `Column ${index + 1}`;
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

router.post("/clients/challans/parse-excel", requireAdminAuth, requirePermission('corporate'), upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
    }

    try {
        const workbook = new ExcelJS.Workbook();

        // Check if it's CSV or XLSX
        const fileName = req.file.originalname.toLowerCase();

        if (fileName.endsWith('.csv')) {
            // Parse CSV using ExcelJS csv parser
            const stream = new Readable();
            stream.push(req.file.buffer);
            stream.push(null);
            await workbook.csv.read(stream);
        } else {
            // Parse XLSX
            const buffer = req.file.buffer;
            await workbook.xlsx.load(buffer as any);
        }

        const worksheet = workbook.worksheets[0]; // First sheet
        const rows: any[] = [];
        const rawRows: Record<string, string>[] = [];
        const headers: string[] = [];

        // Read header row (Assumed row 1)
        const headerRow = worksheet.getRow(1);
        const columnMapping: Record<string, string> = {};
        const headerByColumn: Record<number, string> = {};

        // Auto-detect columns
        headerRow.eachCell((cell, colNumber) => {
            const originalHeader = cell.value?.toString().trim() || `Column ${colNumber}`;
            const headerText = originalHeader.toLowerCase();
            headers.push(originalHeader);
            headerByColumn[colNumber] = originalHeader;

            for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
                if (patterns.some(pattern => matchesColumnPattern(headerText, pattern))) {
                    columnMapping[colNumber.toString()] = field;
                    break;
                }
            }
        });

        // Parse data rows
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Skip header

            const device: any = {};
            const rawRow: Record<string, string> = {};
            let hasData = false;

            row.eachCell((cell, colNumber) => {
                const header = headerByColumn[colNumber] || `Column ${colNumber}`;
                const value = cell.value?.toString().trim() || '';
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
        console.error("[CorporateRoutes] Excel/CSV parse error:", error);
        res.status(500).json({
            message: "Failed to parse file",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
});

// DOCX PARSING (Microsoft Word)
import mammoth from 'mammoth';

router.post("/clients/challans/parse-docx", requireAdminAuth, requirePermission('corporate'), upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
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
        console.error("[CorporateRoutes] DOCX parse error:", error);
        res.status(500).json({
            message: "Failed to parse DOCX file",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
});

router.post("/clients/challans/parse-pptx", requireAdminAuth, requirePermission('corporate'), upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
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
        console.error("[CorporateRoutes] PPTX parse error:", error);
        res.status(500).json({
            message: "Failed to parse PPTX file",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
});
router.patch("/jobs/:id/status", requireAdminAuth, requirePermission('jobs'), async (req, res) => {
    try {
        const { status } = req.body;
        if (!status) return res.status(400).json({ message: "Status required" });

        await storage.updateCorporateJobStatus(req.params.id, status);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ message: "Failed to update status" });
    }
});

// 6. Bulk Update Priority
const bulkPrioritySchema = z.object({
    jobIds: z.array(z.string()).min(1),
    priority: z.enum(["Low", "Medium", "High", "Critical"]).nullable(),
});

router.patch("/jobs/bulk-priority", requireAdminAuth, requirePermission('jobs'), async (req, res) => {
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

router.get("/billing-profile/:clientId", requirePermission('corporate'), async (req, res) => {
    try {
        const rows = await db.select().from(billingProfiles)
            .where(eq(billingProfiles.corporateClientId, req.params.clientId)).limit(1);
        if (!rows[0]) return res.status(404).json({ message: "Billing profile not found" });
        res.json(rows[0]);
    } catch { res.status(500).json({ message: "Failed to fetch billing profile" }); }
});

router.patch("/billing-profile/:clientId", requireAdminAuth, requirePermission('corporate'), async (req, res) => {
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

router.post("/bills/:billId/scatter", requireAdminAuth, requirePermission('corporate'), async (req: any, res) => {
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

router.post("/quote-logs", requireAdminAuth, requirePermission('corporate'), async (req: any, res) => {
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

router.get("/quote-logs/:clientId", requirePermission('corporate'), async (req, res) => {
    try {
        const rows = await db.select().from(quoteLogs)
            .where(eq(quoteLogs.corporateClientId, req.params.clientId))
            .orderBy(quoteLogs.calledAt);
        res.json(rows);
    } catch { res.status(500).json({ message: "Failed to fetch quote logs" }); }
});

export default router;
