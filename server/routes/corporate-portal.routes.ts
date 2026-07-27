import { Router, Request, Response, NextFunction } from "express";
import { storage } from "../storage.js";
import { z } from "zod";
import { requireCorporateAuth } from "./middleware/auth.js";
import multer from 'multer';
import ExcelJS from 'exceljs';
import csvParser from 'csv-parser';
import * as streamModule from 'stream';
import { InsertJobTicket } from '../../shared/schema.js';
import { notifyAdminUpdate } from './middleware/sse-broker.js';
import { db } from '../db.js';
import { corporateClients, jobExtensionRequests, jobTickets } from '../../shared/schema.js';
import { and, desc, eq } from 'drizzle-orm';
import { jobRepo } from '../repositories/index.js';

const PORTAL_MAX_WORKSHEETS = 5;
const PORTAL_MAX_ROWS = 5000;
const PORTAL_MAX_COLUMNS = 50;
const PORTAL_MAX_CELL_TEXT = 10000;

const DANGEROUS_HEADERS = new Set(['__proto__', 'prototype', 'constructor', 'proto']);

const PORTAL_HEADER_ALIASES: Record<string, string[]> = {
    corporateJobNumber: ['corporatejobnumber', 'job no', 'job number', 'job #', 'job id', 'corporate job', 'ref', 'reference', 'ref no', 'ticket id', 'ticket no', 'jobnum', 'jobnumber'],
    deviceBrand: ['devicebrand', 'brand', 'make', 'manufacturer', 'device brand', 'brand name', 'oem'],
    model: ['model', 'model name', 'model number', 'model no', 'device model', 'product', 'device', 'unit type', 'item'],
    serialNumber: ['serialnumber', 'serial', 'serial no', 'serial #', 's/n', 'sn', 'serial number', 'imei', 'service tag', 'tag', 'mn', 'machine no'],
    reportedDefect: ['reporteddefect', 'defect', 'issue', 'problem', 'fault', 'reported issue', 'complaint', 'description', 'defect description', 'symptom', 'error'],
    initialStatus: ['initialstatus', 'status', 'initial status', 'condition', 'ok/ng', 'ok ng', 'check status', 'state'],
    physicalCondition: ['physicalcondition', 'physical', 'physical state', 'body condition', 'cosmetic', 'appearance', 'damage'],
    accessories: ['accessories', 'accessory', 'included accessories', 'items', 'included items', 'parts', 'cable', 'remotes', 'box'],
    notes: ['notes', 'note', 'remarks', 'comment', 'comments', 'additional info', 'memo'],
    priority: ['priority', 'urgency', 'priority level', 'urgency level'],
};

const PORTAL_ALLOWED_FIELDS = new Set(Object.keys(PORTAL_HEADER_ALIASES));

function normalizeHeaderText(text: string): string {
    return text.toLowerCase().replace(/[\s\-_]+/g, ' ').trim();
}

function checkDangerousHeader(header: string): boolean {
    const normalized = header.toLowerCase().replace(/[^a-z0-9]+/g, '');
    return DANGEROUS_HEADERS.has(normalized);
}

function mapPortalHeader(header: string): string | null {
    const normalized = normalizeHeaderText(header);
    if (!normalized) return null;
    for (const [field, aliases] of Object.entries(PORTAL_HEADER_ALIASES)) {
        if (field === normalized.replace(/\s+/g, '') || aliases.includes(normalized)) {
            return field;
        }
    }
    return null;
}

async function parseXlsxWithExcelJS(buffer: Buffer): Promise<Record<string, string>[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    if (workbook.worksheets.length > PORTAL_MAX_WORKSHEETS) {
        throw new Error('Too many worksheets');
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) return [];

    const rows: Record<string, string>[] = [];
    const headerRow = worksheet.getRow(1);
    const columnMapping: Record<number, string> = {};
    let columnCount = 0;

    headerRow.eachCell((cell, colNumber) => {
        const headerText = cell.value?.toString().trim() || '';
        if (checkDangerousHeader(headerText)) {
            throw new Error('Dangerous header detected');
        }
        const mappedField = mapPortalHeader(headerText);
        if (mappedField) {
            columnMapping[colNumber] = mappedField;
        }
        columnCount = Math.max(columnCount, colNumber);
    });

    if (columnCount > PORTAL_MAX_COLUMNS) {
        throw new Error('Too many columns');
    }

    const rowCount = worksheet.rowCount;
    if (rowCount > PORTAL_MAX_ROWS) {
        throw new Error('Too many rows');
    }

    for (let rowNumber = 2; rowNumber <= rowCount; rowNumber++) {
        const row = worksheet.getRow(rowNumber);
        const rowData: Record<string, string> = Object.create(null);
        let hasData = false;

        for (const [colNumberStr, field] of Object.entries(columnMapping)) {
            const colNumber = Number(colNumberStr);
            const cell = row.getCell(colNumber);
            const cellValue = cell.value?.toString().trim() || '';
            if (cellValue.length > PORTAL_MAX_CELL_TEXT) {
                throw new Error('Cell text exceeds maximum length');
            }
            if (cellValue) {
                rowData[field] = cellValue;
                hasData = true;
            }
        }

        if (hasData) {
            rows.push(rowData);
        }
    }

    return rows;
}

async function parseCsvWithLimits(buffer: Buffer): Promise<Record<string, string>[]> {
    const rows: Record<string, string>[] = [];
    const stream = streamModule.Readable.from(buffer);
    let headers: string[] | null = null;
    let rowCount = 0;

    return new Promise((resolve, reject) => {
        stream
            .pipe(csvParser())
            .on('headers', (headerList: string[]) => {
                for (const h of headerList) {
                    if (checkDangerousHeader(h)) {
                        reject(new Error('Dangerous header detected'));
                        stream.destroy();
                        return;
                    }
                }
                if (headerList.length > PORTAL_MAX_COLUMNS) {
                    reject(new Error('Too many columns'));
                    stream.destroy();
                    return;
                }
                headers = headerList;
            })
            .on('data', (row: Record<string, string>) => {
                rowCount++;
                if (rowCount > PORTAL_MAX_ROWS) {
                    reject(new Error('Too many rows'));
                    stream.destroy();
                    return;
                }
                const safeRow: Record<string, string> = Object.create(null);
                for (const [key, value] of Object.entries(row)) {
                    if (typeof value === 'string' && value.length > PORTAL_MAX_CELL_TEXT) {
                        reject(new Error('Cell text exceeds maximum length'));
                        stream.destroy();
                        return;
                    }
                    safeRow[key] = value;
                }
                rows.push(safeRow);
            })
            .on('end', () => resolve(rows))
            .on('error', (err: Error) => reject(err));
    });
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 10, parts: 10 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel' || file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
            cb(null, true);
        } else {
            cb(null, false);
        }
    }
});

function safePortalUpload(req: Request, res: Response, next: NextFunction) {
    upload.single('file')(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(413).json({ error: 'Uploaded file is too large.' });
                }
                if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
                    return res.status(400).json({ error: 'Too many files uploaded.' });
                }
                if (err.code === 'LIMIT_FIELD_COUNT' || err.code === 'LIMIT_FIELD_KEY' || err.code === 'LIMIT_FIELD_VALUE' || err.code === 'LIMIT_PART_COUNT') {
                    return res.status(400).json({ error: 'Multipart payload exceeds limits.' });
                }
                return res.status(400).json({ error: 'Invalid upload payload.' });
            }
            return next(err);
        }
        if (!req.file || req.file.size === 0) {
            return res.status(400).json({ error: 'No file uploaded or file is empty.' });
        }
        next();
    });
}

const router = Router();

// Apply centralized middleware to all routes in this router
router.use(requireCorporateAuth);

// Helper to get typed user from request
const getCorpUser = (req: Request) => (req as any).user;

// Bulk Service Request Schema (matching challan)
const bulkRowSchema = z.object({
    corporateJobNumber: z.string().min(1),
    deviceBrand: z.string().min(1),
    model: z.string().min(1),
    serialNumber: z.string().min(1),
    reportedDefect: z.string().min(1),
    initialStatus: z.enum(["OK", "NG"]).optional(),
    physicalCondition: z.string().optional(),
    accessories: z.string().optional(),
    notes: z.string().optional(),
    priority: z.enum(["Low", "Medium", "High", "Critical"]).optional().nullable(),
});

const extensionResponseSchema = z.object({
    status: z.enum(["accepted", "rejected"]),
    responseNote: z.string().optional(),
});


// ----------------------------------------------------------------------
// Dashboard
// ----------------------------------------------------------------------

router.get("/dashboard", async (req: Request, res: Response) => {
    try {
        const user = req.user as any;
        const stats = await storage.getCorporateDashboardStats(user.corporateClientId);
        res.json(stats);
    } catch (error) {
        console.error("Corporate Dashboard Error:", error);
        res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
});

// ----------------------------------------------------------------------
// Jobs / Repair Requests
// ----------------------------------------------------------------------

router.get("/jobs", async (req: Request, res: Response) => {
    try {
        const user = req.user as any;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const status = req.query.status as string | undefined;

        const result = await storage.getJobsByCorporateClient(user.corporateClientId, page, limit, status);
        res.json(result);
    } catch (error) {
        console.error("Corporate Jobs Error:", error);
        res.status(500).json({ message: "Failed to fetch jobs" });
    }
});

router.get("/jobs/:id", async (req: Request, res: Response) => {
    try {
        const user = req.user as any;
        // Verify the job belongs to this corporate client!
        const job = await storage.getJobTicket(req.params.id);

        if (!job) {
            return res.status(404).json({ message: "Job not found" });
        }

        if (job.corporateClientId !== user.corporateClientId) {
            return res.status(403).json({ message: "Forbidden: Verification failed" });
        }

        res.json(job);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch job details" });
    }
});

router.get("/extension-requests", async (req: Request, res: Response) => {
    try {
        const user = req.user as any;
        const requests = await db.select().from(jobExtensionRequests)
            .where(eq(jobExtensionRequests.corporateClientId, user.corporateClientId))
            .orderBy(desc(jobExtensionRequests.createdAt));
        res.json(requests);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch extension requests" });
    }
});

router.patch("/extension-requests/:id/respond", async (req: Request, res: Response) => {
    try {
        const user = req.user as any;
        const data = extensionResponseSchema.parse(req.body);
        const [existing] = await db.select().from(jobExtensionRequests)
            .where(and(
                eq(jobExtensionRequests.id, req.params.id),
                eq(jobExtensionRequests.corporateClientId, user.corporateClientId)
            ))
            .limit(1);

        if (!existing) return res.status(404).json({ message: "Extension request not found" });
        if (existing.status !== "pending") return res.status(400).json({ message: "Extension request already answered" });

        const [updated] = await db.update(jobExtensionRequests)
            .set({
                status: data.status,
                responseNote: data.responseNote,
                respondedBy: user.name || "Corporate Portal",
                respondedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(jobExtensionRequests.id, req.params.id))
            .returning();

        await db.update(jobTickets)
            .set(data.status === "accepted"
                ? { extensionStatus: "accepted", batchTargetClearDate: existing.requestedUntil, deadline: existing.requestedUntil, slaDeadline: existing.requestedUntil }
                : { extensionStatus: "rejected", status: "Action Needed" })
            .where(eq(jobTickets.id, existing.jobId));

        res.json(updated);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: "Invalid extension response", details: error.errors });
        } else {
            res.status(500).json({ message: "Failed to respond to extension request" });
        }
    }
});

// ----------------------------------------------------------------------
// Service Requests (Simple for now)
// ----------------------------------------------------------------------

const createServiceRequestSchema = z.object({
    deviceModel: z.string().min(1, "Device model required"),
    serialNumber: z.string().min(1, "Serial number required"),
    description: z.string().min(1, "Description of issue required"),
    priority: z.enum(["Low", "Medium", "High", "Critical"]).optional().default("Medium"),
});

router.post("/service-requests", async (req: Request, res: Response) => {
    try {
        const user = req.user as any;
        const data = createServiceRequestSchema.parse(req.body);

        // Resolve corporate client tier for clientClass tagging
        let clientClass = 'b2b_normal';
        if (user.corporateClientId) {
            const [corpRow] = await db.select({ clientClass: corporateClients.clientClass })
                .from(corporateClients).where(eq(corporateClients.id, user.corporateClientId)).limit(1);
            if (corpRow?.clientClass) clientClass = corpRow.clientClass;
        }

        const newJob = await jobRepo.createJobTicket({
            customer: user.name,
            customerPhone: user.phone || "",
            device: data.deviceModel,
            tvSerialNumber: data.serialNumber,
            issue: data.description,
            priority: data.priority,
            status: "Pending",
            corporateClientId: user.corporateClientId,
            clientClass,
            source: 'corporate_portal',
        } as any);

        res.status(201).json(newJob);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: "Invalid input", details: error.errors });
        } else {
            console.error("Create Service Request Error:", error);
            res.status(500).json({ message: "Failed to create service request" });
        }
    }
});

// Bulk service requests from CSV/XLSX
router.post('/service-requests/bulk', safePortalUpload, async (req: Request, res: Response) => {
    try {
        const user = getCorpUser(req);
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const fileName = req.file.originalname.toLowerCase();
        const isCsv = fileName.endsWith('.csv');
        const isXlsx = fileName.endsWith('.xlsx');
        const mimetype = req.file.mimetype;

        if (!isCsv && !isXlsx) {
            return res.status(400).json({ error: 'Unsupported file format. Please use CSV or XLSX.' });
        }

        if (isCsv && mimetype !== 'text/csv' && mimetype !== 'application/vnd.ms-excel' && mimetype !== 'application/octet-stream') {
            return res.status(400).json({ error: 'File extension does not match content type.' });
        }

        if (isXlsx && mimetype !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' && mimetype !== 'application/octet-stream') {
            return res.status(400).json({ error: 'File extension does not match content type.' });
        }

        const rows: any[] = [];

        if (isCsv) {
            try {
                const csvRows = await parseCsvWithLimits(req.file.buffer);
                rows.push(...csvRows);
            } catch (parseError) {
                const msg = (parseError as Error).message;
                if (msg === 'Dangerous header detected') {
                    return res.status(400).json({ error: 'File contains a dangerous header name (__proto__, prototype, or constructor).' });
                }
                if (msg === 'Too many rows') {
                    return res.status(400).json({ error: `Spreadsheet exceeds the maximum of ${PORTAL_MAX_ROWS} rows.` });
                }
                if (msg === 'Too many columns') {
                    return res.status(400).json({ error: `Spreadsheet exceeds the maximum of ${PORTAL_MAX_COLUMNS} columns.` });
                }
                if (msg === 'Cell text exceeds maximum length') {
                    return res.status(400).json({ error: `Cell text exceeds the maximum of ${PORTAL_MAX_CELL_TEXT} characters.` });
                }
                return res.status(400).json({ error: 'Failed to parse CSV file. Please check the file format.' });
            }
        } else {
            if (req.file.buffer.length < 4 || req.file.buffer[0] !== 0x50 || req.file.buffer[1] !== 0x4B) {
                return res.status(400).json({ error: 'Invalid XLSX file. The file is not a valid spreadsheet.' });
            }
            try {
                const xlsxRows = await parseXlsxWithExcelJS(req.file.buffer);
                rows.push(...xlsxRows);
            } catch (parseError) {
                const msg = (parseError as Error).message;
                if (msg === 'Dangerous header detected') {
                    return res.status(400).json({ error: 'File contains a dangerous header name (__proto__, prototype, or constructor).' });
                }
                if (msg === 'Too many worksheets') {
                    return res.status(400).json({ error: `Spreadsheet exceeds the maximum of ${PORTAL_MAX_WORKSHEETS} worksheets.` });
                }
                if (msg === 'Too many rows') {
                    return res.status(400).json({ error: `Spreadsheet exceeds the maximum of ${PORTAL_MAX_ROWS} rows.` });
                }
                if (msg === 'Too many columns') {
                    return res.status(400).json({ error: `Spreadsheet exceeds the maximum of ${PORTAL_MAX_COLUMNS} columns.` });
                }
                if (msg === 'Cell text exceeds maximum length') {
                    return res.status(400).json({ error: `Cell text exceeds the maximum of ${PORTAL_MAX_CELL_TEXT} characters.` });
                }
                return res.status(400).json({ error: 'Failed to parse XLSX file. Please check the file format.' });
            }
        }

        const results = { success: 0, failed: 0, errors: [] as string[], createdJobs: [] as string[] };
        const validJobs: InsertJobTicket[] = [];
        const seenJobNumbers = new Set<string>();

        for (const row of rows) {
            try {
                const validatedRow = bulkRowSchema.parse(row);

                if (seenJobNumbers.has(validatedRow.corporateJobNumber)) {
                    throw new Error(`Duplicate job number ${validatedRow.corporateJobNumber} within this batch`);
                }
                seenJobNumbers.add(validatedRow.corporateJobNumber);

                if (await storage.checkCorporateJobExists(user.corporateClientId, validatedRow.corporateJobNumber)) {
                    throw new Error(`Job Number ${validatedRow.corporateJobNumber} already exists`);
                }

                const jobTicket: Partial<InsertJobTicket> = {
                    corporateJobNumber: validatedRow.corporateJobNumber,
                    customer: user.name,
                    device: `${validatedRow.deviceBrand} ${validatedRow.model}`,
                    tvSerialNumber: validatedRow.serialNumber,
                    issue: validatedRow.reportedDefect,
                    status: 'Pending' as const,
                    priority: validatedRow.priority || null,
                    corporateClientId: user.corporateClientId,
                    notes: [validatedRow.notes, validatedRow.physicalCondition, validatedRow.accessories].filter(Boolean).join('; '),
                    reportedDefect: validatedRow.reportedDefect,
                    initialStatus: validatedRow.initialStatus as any,
                };

                validJobs.push(jobTicket as InsertJobTicket);

                if (validatedRow.priority === 'High' || validatedRow.priority === 'Critical') {
                    notifyAdminUpdate({
                        type: 'NEW_CORPORATE_JOB_URGENT',
                        message: `Urgent B2B Job: ${validatedRow.corporateJobNumber} (${validatedRow.priority})`,
                        timestamp: new Date().toISOString()
                    });
                }

            } catch (err: any) {
                results.failed++;
                results.errors.push(`Row ${rows.indexOf(row) + 1}: ${err.message}`);
            }
        }

        if (validJobs.length > 0) {
            const created = await storage.createJobTicketsBulk(validJobs);
            results.createdJobs = created.map(j => j.id);
            results.success = created.length;
        }

        res.json(results);
    } catch (error) {
        console.error('[CorporatePortal] Bulk upload failed:', (error as Error).message);
        res.status(500).json({ error: 'Processing failed' });
    }
});
// Check for existing job numbers in bulk
router.post('/service-requests/batch-check', async (req: Request, res: Response) => {
    try {
        const user = getCorpUser(req);
        const { jobNumbers } = req.body;

        if (!Array.isArray(jobNumbers)) {
            return res.status(400).json({ error: 'jobNumbers must be an array' });
        }

        const existing = await storage.getExistingCorporateJobNumbers(user.corporateClientId, jobNumbers);
        res.json({ existing });
    } catch (error: any) {
        console.error('Batch check error:', error);
        res.status(500).json({ error: 'Check failed' });
    }
});

// Bulk service requests from JSON (already parsed and mapped by client)
router.post('/service-requests/bulk-json', async (req: Request, res: Response) => {
    try {
        const user = getCorpUser(req);
        const { rows } = req.body;

        if (!rows || !Array.isArray(rows)) {
            return res.status(400).json({ error: 'Invalid input: rows array is required' });
        }

        if (rows.length > PORTAL_MAX_ROWS) {
            return res.status(400).json({ error: `Batch exceeds the maximum of ${PORTAL_MAX_ROWS} rows.` });
        }

        for (const row of rows) {
            if (row && typeof row === 'object') {
                const keys = Object.keys(row);
                if (keys.length > PORTAL_MAX_COLUMNS) {
                    return res.status(400).json({ error: `Row exceeds the maximum of ${PORTAL_MAX_COLUMNS} columns.` });
                }
                for (const key of keys) {
                    const normalized = String(key).toLowerCase().replace(/[^a-z0-9]+/g, '');
                    if (normalized === 'proto' || normalized === 'prototype' || normalized === 'constructor') {
                        return res.status(400).json({ error: 'File contains a dangerous header name (__proto__, prototype, or constructor).' });
                    }
                }
                for (const [key, value] of Object.entries(row)) {
                    if (typeof value === 'string' && value.length > PORTAL_MAX_CELL_TEXT) {
                        return res.status(400).json({ error: `Field "${key}" exceeds the maximum of ${PORTAL_MAX_CELL_TEXT} characters.` });
                    }
                }
            }
        }

        const results = { success: 0, failed: 0, errors: [] as string[], createdJobs: [] as string[] };
        const validJobs: InsertJobTicket[] = [];
        const seenJobNumbers = new Set<string>();

        for (const row of rows) {
            try {
                const validatedRow = bulkRowSchema.parse(row);

                if (seenJobNumbers.has(validatedRow.corporateJobNumber)) {
                    throw new Error(`Duplicate job number ${validatedRow.corporateJobNumber} within this batch`);
                }
                seenJobNumbers.add(validatedRow.corporateJobNumber);

                if (await storage.checkCorporateJobExists(user.corporateClientId, validatedRow.corporateJobNumber)) {
                    throw new Error(`Job Number ${validatedRow.corporateJobNumber} already exists`);
                }

                const jobTicket: Partial<InsertJobTicket> = {
                    corporateJobNumber: validatedRow.corporateJobNumber,
                    customer: user.name,
                    device: `${validatedRow.deviceBrand} ${validatedRow.model}`,
                    tvSerialNumber: validatedRow.serialNumber,
                    issue: validatedRow.reportedDefect,
                    status: 'Pending' as const,
                    priority: validatedRow.priority || null,
                    corporateClientId: user.corporateClientId,
                    notes: [validatedRow.notes, validatedRow.physicalCondition, validatedRow.accessories].filter(Boolean).join('; '),
                    reportedDefect: validatedRow.reportedDefect,
                    initialStatus: validatedRow.initialStatus as any, // Cast as verified by schema
                };

                validJobs.push(jobTicket as InsertJobTicket);

                if (validatedRow.priority === 'High' || validatedRow.priority === 'Critical') {
                    notifyAdminUpdate({
                        type: 'NEW_CORPORATE_JOB_URGENT',
                        message: `Urgent B2B Job: ${validatedRow.corporateJobNumber} (${validatedRow.priority})`,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (err: any) {
                results.failed++;
                results.errors.push(`Row ${rows.indexOf(row) + 1}: ${err.message}`);
            }
        }

        if (validJobs.length > 0) {
            const created = await storage.createJobTicketsBulk(validJobs);
            results.createdJobs = created.map(j => j.id);
            results.success = created.length;
        }

        res.json(results);
    } catch (error) {
        console.error('[CorporatePortal] Bulk JSON upload failed:', (error as Error).message);
        res.status(500).json({ error: 'Processing failed' });
    }
});

// ----------------------------------------------------------------------
// Profile Management
// ----------------------------------------------------------------------

const updateProfileSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters").optional(),
    email: z.string().email("Invalid email address").optional(),
    preferences: z.object({
        notificationSound: z.string().optional(),
    }).optional(),
});

router.patch("/profile", async (req: Request, res: Response) => {
    try {
        const user = req.user as any;
        const data = updateProfileSchema.parse(req.body);

        const updateData: any = {};
        if (data.name) updateData.name = data.name;
        if (data.email) updateData.email = data.email;

        let newPrefs = undefined;
        if (data.preferences) {
            // Merge with existing preferences
            let currentPrefs = {};
            try {
                currentPrefs = JSON.parse(user.preferences || "{}");
            } catch (e) {
                // Ignore parse error, start fresh
            }
            newPrefs = { ...currentPrefs, ...data.preferences };
            updateData.preferences = JSON.stringify(newPrefs);
        }

        if (Object.keys(updateData).length > 0) {
            await storage.updateUser(user.id, updateData);
        }

        res.json({ success: true, preferences: newPrefs, name: data.name, email: data.email });

    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: "Invalid input", details: error.errors });
        } else {
            console.error("Update Profile Error:", error);
            res.status(500).json({ message: "Failed to update profile" });
        }
    }
});

export default router;
