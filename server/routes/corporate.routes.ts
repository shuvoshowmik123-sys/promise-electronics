
import { Router } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { Readable } from 'stream';
import { insertCorporateClientSchema } from "@shared/schema";
import bcrypt from "bcryptjs";
import { getDefaultPermissions, requireAdminAuth, requirePermission } from "./middleware/auth.js";
import { db } from "../db.js";
import { corporateService } from "../services/corporate.service.js";
import { inArray } from "drizzle-orm";
import { jobTickets } from "@shared/schema.js";

const router = Router();

// Secure all corporate admin routes using individual route middleware

// ----------------------------------------------------------------------
// Types & Schemas
// ----------------------------------------------------------------------

const createChallanInSchema = z.object({
    corporateClientId: z.string(),
    items: z.array(z.object({
        corporateJobNumber: z.string().min(1),
        deviceModel: z.string().min(1),
        serialNumber: z.string().min(1),
        initialStatus: z.enum(["OK", "NG"]),
        reportedDefect: z.string(),
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
router.post("/clients", requirePermission('corporate'), async (req, res) => {
    try {
        // Extended schema to include optional password
        const schema = insertCorporateClientSchema.extend({
            portalPassword: z.string().optional()
        });

        const data = schema.parse(req.body);
        const { portalPassword, ...clientData } = data;

        // 1. Check if username already exists (if provided)
        if (clientData.portalUsername) {
            const existingUser = await storage.getUserByUsername(clientData.portalUsername);
            if (existingUser) {
                return res.status(400).json({ message: "Portal username already taken by another user." });
            }
        }

        // 2. Create Corporate Client
        const newClient = await storage.createCorporateClient(clientData);

        // 3. Create User if credentials provided
        if (clientData.portalUsername && portalPassword) {
            const hashedPassword = await bcrypt.hash(portalPassword, 10);
            const defaultPermissions = getDefaultPermissions('Corporate');

            await storage.createUser({
                username: clientData.portalUsername,
                password: hashedPassword,
                role: 'Corporate',
                name: clientData.contactPerson || clientData.companyName,
                email: "", // Optional in schema
                permissions: JSON.stringify(defaultPermissions),
                corporateClientId: newClient.id,
                phone: clientData.contactPhone || "",
                isVerified: true,
            });
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
router.patch("/clients/:id", requirePermission('corporate'), async (req, res) => {
    try {
        const client = await storage.updateCorporateClient(req.params.id, req.body);
        res.json(client);
    } catch (error) {
        res.status(500).json({ message: "Failed to update client" });
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
router.post("/challans/in", requirePermission('corporate'), async (req, res) => {
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
router.post("/challans/out", requirePermission('corporate'), async (req, res) => {
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
router.post("/bills/generate", requirePermission('corporate'), async (req, res) => {
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

router.post("/bills/auto-generate", requirePermission('corporate'), async (req, res) => {
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

            // Assuming jobs are resolved/completed near their updated date, or we just bill everything untouched in that month
            const jobDate = new Date(job.createdAt);
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

// Use memory storage for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Column name variations for smart detection
const COLUMN_PATTERNS = {
    corporateJobNumber: ['job no', 'job number', 'job ref', 'reference', 'job id'],
    deviceBrand: ['brand', 'manufacturer', 'make'],
    model: ['model', 'device model', 'product name', 'device', 'detail', 'details', 'description', 'tv', 'item'],
    serialNumber: ['serial', 'serial no', 'serial number', 's/n', 'sn', 'sr. no', 'sr no', 's.n', 'sr.no', 'srno'],
    reportedDefect: ['issue', 'defect', 'problem', 'complaint', 'reported issue'],
    initialStatus: ['status', 'condition', 'state']
};

router.post("/clients/challans/parse-excel", requirePermission('corporate'), upload.single('file'), async (req, res) => {
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

        // Read header row (Assumed row 1)
        const headerRow = worksheet.getRow(1);
        const columnMapping: Record<string, string> = {};

        // Auto-detect columns
        headerRow.eachCell((cell, colNumber) => {
            const headerText = cell.value?.toString().toLowerCase().trim() || '';

            for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
                if (patterns.some(pattern => headerText.includes(pattern))) {
                    columnMapping[colNumber.toString()] = field;
                    break;
                }
            }
        });

        // Parse data rows
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Skip header

            const device: any = {};
            let hasData = false;

            row.eachCell((cell, colNumber) => {
                const field = columnMapping[colNumber.toString()];
                if (field) {
                    device[field] = cell.value?.toString().trim() || '';
                    hasData = true;
                }
            });

            if (!hasData) return;

            // Default initialStatus if not provided
            if (!device.initialStatus) {
                device.initialStatus = 'NG';
            }
            // Normalize status
            if (device.initialStatus.toUpperCase() === 'OK') device.initialStatus = 'OK';
            else device.initialStatus = 'NG';

            rows.push(device);
        });

        res.json({
            devices: rows,
            columnMapping,
            totalRows: rows.length
        });

    } catch (error) {
        console.error("Excel/CSV Parse Error:", error);
        res.status(500).json({
            message: "Failed to parse file",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
});

// DOCX PARSING (Microsoft Word)
import mammoth from 'mammoth';

router.post("/clients/challans/parse-docx", requirePermission('corporate'), upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
    }

    try {
        // Extract text from DOCX
        const result = await mammoth.extractRawText({ buffer: req.file.buffer as Buffer });
        const text = result.value;

        // DOCX extraction often linearizes tables:
        // Header1 \n Header2 \n Header3 \n Row1Col1 \n Row1Col2 \n Row1Col3
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

        // Scan for headers to identify the "Header Block"
        let headerStartIndex = -1;
        let headerEndIndex = -1;
        const columnMapping: Record<string, string> = {};
        let detectedColumnCount = 0;

        // We'll search for a sequence of lines that match our known headers
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].toLowerCase();
            let matchedField = null;

            // Check if this line matches any column pattern
            for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
                if (patterns.some(pattern => line.includes(pattern))) {
                    matchedField = field;
                    break;
                }
            }

            if (matchedField) {
                if (headerStartIndex === -1) headerStartIndex = i;
                // Identify which column index this header corresponds to relative to the start
                columnMapping[(i - headerStartIndex).toString()] = matchedField;
                headerEndIndex = i;
            } else if (headerStartIndex !== -1 && (i - headerEndIndex) > 2) {
                // If we found headers but then hit non-headers for a while, assume header block ended
                break;
            }
        }

        if (Object.keys(columnMapping).length === 0) {
            return res.status(400).json({
                message: "Could not detect any valid column headers (Job No, Model, S/N, etc.)",
                debug: lines.slice(0, 20) // Send back some lines to help debug
            });
        }

        detectedColumnCount = (headerEndIndex - headerStartIndex) + 1;

        // Validate we have enough columns
        if (detectedColumnCount < 2) {
            return res.status(400).json({ message: "Detected headers, but structure is unclear. Found: " + Object.values(columnMapping).join(", ") });
        }

        // Debug logging
        console.log("DOCX Lines (First 50):", lines.slice(0, 50));
        console.log("Column Mapping:", columnMapping);
        console.log("Detected Column Count:", detectedColumnCount);

        const rows: any[] = [];
        // Data starts after the header block
        // We assume the data follows the same linear chunks
        let dataStartIndex = headerEndIndex + 1;

        while (dataStartIndex < lines.length) {
            // Take a chunk of lines equal to column count
            const chunk = lines.slice(dataStartIndex, dataStartIndex + detectedColumnCount);

            // If chunk is partial (end of file?), skip or try partial parse
            if (chunk.length < detectedColumnCount) break;

            const device: any = {};
            let hasData = false;

            chunk.forEach((cellValue, relativeIndex) => {
                const field = columnMapping[relativeIndex.toString()];
                if (field) {
                    device[field] = cellValue;
                    hasData = true;
                }
            });

            if (hasData) {
                // Formatting
                if (!device.initialStatus) device.initialStatus = 'NG';
                if (device.initialStatus.toUpperCase() === 'OK') device.initialStatus = 'OK';
                else device.initialStatus = 'NG';

                rows.push(device);
            }

            dataStartIndex += detectedColumnCount;
        }

        console.log("Parsed Rows:", rows.length);
        if (rows.length > 0) {
            console.log("First Row:", rows[0]);
        }

        res.json({
            devices: rows,
            columnMapping,
            totalRows: rows.length,
            detectedColumnCount
        });

    } catch (error) {
        console.error("DOCX Parse Error:", error);
        res.status(500).json({
            message: "Failed to parse DOCX file",
            error: error instanceof Error ? error.message : "Unknown error"
        });
    }
});
router.patch("/jobs/:id/status", requirePermission('jobs'), async (req, res) => {
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

router.patch("/jobs/bulk-priority", requirePermission('jobs'), async (req, res) => {
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

export default router;
