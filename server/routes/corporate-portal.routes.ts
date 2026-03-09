import { Router, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { requireCorporateAuth } from "./middleware/auth";
import multer from 'multer';
import XLSX from 'xlsx';
import csvParser from 'csv-parser';
import * as streamModule from 'stream';
import { InsertJobTicket } from '../../shared/schema.js';
import { notifyAdminUpdate } from './middleware/sse-broker.js';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel' || file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
            cb(null, true);
        } else {
            cb(null, false);
        }
    }
});

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

        const newJob = await storage.createJobTicket({
            customer: user.name,
            customerPhone: user.phone || "",
            device: data.deviceModel,
            tvSerialNumber: data.serialNumber,
            issue: data.description,
            priority: data.priority,
            status: "Pending",
            corporateClientId: user.corporateClientId,
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
router.post('/service-requests/bulk', upload.single('file'), async (req: Request, res: Response) => {
    try {
        const user = getCorpUser(req);
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const rows: any[] = [];
        const mimetype = req.file.mimetype;

        if (mimetype === 'text/csv' || mimetype === 'application/vnd.ms-excel') {
            // CSV parsing
            const stream = streamModule.Readable.from(req.file.buffer);
            await new Promise((resolve, reject) => {
                stream
                    .pipe(csvParser())
                    .on('data', (row: Record<string, string>) => rows.push(row))
                    .on('end', resolve)
                    .on('error', reject);
            });
        } else if (mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
            // XLSX parsing
            const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            rows.push(...XLSX.utils.sheet_to_json(worksheet));
        } else {
            return res.status(400).json({ error: 'Unsupported file type' });
        }

        const results = { success: 0, failed: 0, errors: [] as string[], createdJobs: [] as string[] };
        const validJobs: InsertJobTicket[] = [];

        for (const row of rows) {
            try {
                const validatedRow = bulkRowSchema.parse(row);

                // Check for duplicate job number
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
    } catch (error: any) {
        console.error('Bulk upload error:', error);
        res.status(500).json({ error: 'Processing failed', details: error.message });
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

        const results = { success: 0, failed: 0, errors: [] as string[], createdJobs: [] as string[] };
        const validJobs: InsertJobTicket[] = [];

        for (const row of rows) {
            try {
                const validatedRow = bulkRowSchema.parse(row);

                // Check for duplicate job number
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
    } catch (error: any) {
        console.error('Bulk JSON upload error:', error);
        res.status(500).json({ error: 'Processing failed', details: error.message });
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
