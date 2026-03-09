/**
 * Warranty Claims API Routes
 * 
 * Handles warranty claim management with strict audit trail:
 * - List claims (with filters)
 * - Create claim (auto-validates warranty)
 * - Approve/Reject claims (Manager+ only)
 * - Create linked warranty job
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { storage } from '../storage.js';
import { settingsRepo, notificationRepo, systemRepo, userRepo, jobRepo, serviceRequestRepo, warrantyRepo, hrRepo } from '../repositories/index.js';
import { auditLogger } from '../utils/auditLogger.js';
import { nanoid } from 'nanoid';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { requireAdminAuth } from './middleware/auth.js';

const router = Router();

// Secure warranty routes (Admin only)
router.use('/api/warranty-claims', requireAdminAuth);

// Get all warranty claims with optional filters
router.get('/api/warranty-claims', async (req: Request, res: Response) => {
    try {
        const { status, phone, page = '1', limit = '20' } = req.query;
        const claims = await warrantyRepo.getAllWarrantyClaims({
            status: status as string,
            phone: phone as string,
            page: parseInt(page as string),
            limit: parseInt(limit as string),
        });
        res.json(claims);
    } catch (error: any) {
        console.error('[Warranty] Error fetching claims:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get single warranty claim
router.get('/api/warranty-claims/:id', async (req: Request, res: Response) => {
    try {
        const claim = await warrantyRepo.getWarrantyClaim(req.params.id);
        if (!claim) {
            return res.status(404).json({ error: 'Warranty claim not found' });
        }
        res.json(claim);
    } catch (error: any) {
        console.error('[Warranty] Error fetching claim:', error);
        res.status(500).json({ error: error.message });
    }
});

// Search original job for warranty check
router.get('/api/warranty-claims/check/:jobId', async (req: Request, res: Response) => {
    try {
        const job = await jobRepo.getJobTicket(req.params.jobId);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const now = new Date();
        const warrantyValid = job.warrantyExpiryDate ? new Date(job.warrantyExpiryDate) > now : false;

        res.json({
            job,
            warranty: {
                valid: warrantyValid,
                expiryDate: job.warrantyExpiryDate,
                daysRemaining: job.warrantyExpiryDate ? Math.ceil((new Date(job.warrantyExpiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0
            }
        });
    } catch (error: any) {
        console.error('[Warranty] Error checking warranty:', error);
        res.status(500).json({ error: error.message });
    }
});

// ── Phase F: Zero-Abuse Warranty Engine ──────────────────────────────────────
// Check if a device serial number has an active warranty from a prior completed job
router.get('/api/warranty-claims/check-serial/:serial', async (req: Request, res: Response) => {
    try {
        const { serial } = req.params;
        if (!serial || serial.trim().length < 3) {
            return res.json({ hasWarranty: false, jobs: [] });
        }

        const now = new Date().toISOString();

        // Direct SQL query — no storage.getJobTickets bulk method exists
        const rows = await db.execute(sql`
            SELECT id, device, status, tv_serial_number as "tvSerialNumber",
                   warranty_expiry_date as "warrantyExpiryDate", warranty_days as "warrantyDays",
                   updated_at as "updatedAt"
            FROM job_tickets
            WHERE LOWER(TRIM(tv_serial_number)) = LOWER(TRIM(${serial}))
              AND status IN ('Ready', 'Delivered', 'Completed')
              AND warranty_expiry_date IS NOT NULL
              AND warranty_expiry_date > ${now}
            LIMIT 5
        `);

        const jobs = (rows.rows ?? rows) as any[];

        res.json({
            hasWarranty: jobs.length > 0,
            jobs: jobs.map((j: any) => ({
                id: j.id,
                device: j.device,
                status: j.status,
                warrantyExpiryDate: j.warrantyExpiryDate,
                warrantyDays: j.warrantyDays,
                completedAt: j.updatedAt,
            }))
        });
    } catch (error: any) {
        console.error('[Warranty] Error checking serial warranty:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create warranty claim
router.post('/api/warranty-claims', async (req: Request, res: Response) => {
    try {
        const {
            originalJobId,
            claimType,
            claimReason,
            claimedBy,
            claimedByName,
            claimedByRole,
            notes
        } = req.body;

        // Fetch original job
        const job = await jobRepo.getJobTicket(originalJobId);
        if (!job) {
            return res.status(404).json({ error: 'Original job not found' });
        }

        // Auto-compute warranty validity
        const now = new Date();
        let warrantyValid = false;
        let warrantyExpiryDate: Date | null = null;

        if (job.warrantyExpiryDate) {
            // Ensure it's a Date object
            warrantyExpiryDate = new Date(job.warrantyExpiryDate);
            if (warrantyExpiryDate > now) {
                warrantyValid = true;
            }
        }

        // Create the claim
        const claim = await warrantyRepo.createWarrantyClaim({
            originalJobId,
            customer: job.customer || "Unknown",
            customerPhone: job.customerPhone,
            claimType: "general",
            claimReason,
            status: "pending",
            warrantyValid,
            warrantyExpiryDate: warrantyExpiryDate || undefined, // Handle null
            claimedBy: claimedBy || "system",
            claimedByName: claimedByName || "System",
            claimedByRole: claimedByRole || "System",
            claimedAt: new Date(),
            notes
        });

        res.status(201).json(claim);
    } catch (error: any) {
        console.error('[Warranty] Error creating claim:', error);
        res.status(500).json({ error: error.message });
    }
});

// Approve warranty claim
router.patch('/api/warranty-claims/:id/approve', async (req: Request, res: Response) => {
    try {
        const { approvedBy, approvedByName, approvedByRole } = req.body;

        const claim = await warrantyRepo.getWarrantyClaim(req.params.id);
        if (!claim) {
            return res.status(404).json({ error: 'Warranty claim not found' });
        }

        if (claim.status !== 'pending') {
            return res.status(400).json({ error: `Cannot approve claim with status: ${claim.status}` });
        }

        // Check role permission (Manager or Super Admin can approve)
        if (!['Manager', 'Super Admin', 'Admin'].includes(approvedByRole)) {
            return res.status(403).json({ error: 'Only Manager or Admin can approve warranty claims' });
        }

        // If warranty expired, only Super Admin can override
        if (!claim.warrantyValid && approvedByRole !== 'Super Admin') {
            return res.status(403).json({ error: 'Only Super Admin can approve claims with expired warranty' });
        }

        const updated = await storage.updateWarrantyClaim(req.params.id, {
            status: 'approved',
            approvedBy,
            approvedByName,
            approvedByRole,
            approvedAt: new Date(),
        });

        await auditLogger.log({
            userId: approvedBy,
            action: 'APPROVE',
            entity: 'warranty_claim',
            entityId: req.params.id,
            oldValue: { status: claim.status },
            newValue: { status: 'approved', approvedBy, approvedByName },
        });

        res.json(updated);
    } catch (error: any) {
        console.error('[Warranty] Error approving claim:', error);
        res.status(500).json({ error: error.message });
    }
});

// Reject warranty claim
router.patch('/api/warranty-claims/:id/reject', async (req: Request, res: Response) => {
    try {
        const { approvedBy, approvedByName, approvedByRole, rejectionReason } = req.body;

        const claim = await warrantyRepo.getWarrantyClaim(req.params.id);
        if (!claim) {
            return res.status(404).json({ error: 'Warranty claim not found' });
        }

        if (claim.status !== 'pending') {
            return res.status(400).json({ error: `Cannot reject claim with status: ${claim.status}` });
        }

        if (!['Manager', 'Super Admin', 'Admin'].includes(approvedByRole)) {
            return res.status(403).json({ error: 'Only Manager or Admin can reject warranty claims' });
        }

        const updated = await storage.updateWarrantyClaim(req.params.id, {
            status: 'rejected',
            approvedBy,
            approvedByName,
            approvedByRole,
            approvedAt: new Date(),
            rejectionReason,
        });

        await auditLogger.log({
            userId: approvedBy,
            action: 'REJECT',
            entity: 'warranty_claim',
            entityId: req.params.id,
            oldValue: { status: claim.status },
            newValue: { status: 'rejected', rejectionReason },
        });

        res.json(updated);
    } catch (error: any) {
        console.error('[Warranty] Error rejecting claim:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create linked warranty job from approved claim
router.post('/api/warranty-claims/:id/create-job', async (req: Request, res: Response) => {
    try {
        const claim = await warrantyRepo.getWarrantyClaim(req.params.id);
        if (!claim) {
            return res.status(404).json({ error: 'Warranty claim not found' });
        }

        if (claim.status !== 'approved') {
            return res.status(400).json({ error: 'Only approved claims can create warranty jobs' });
        }

        // Get original job to copy details
        const originalJob = await jobRepo.getJobTicket(claim.originalJobId);
        if (!originalJob) {
            return res.status(404).json({ error: 'Original job not found' });
        }

        // Create new warranty job linked to original
        const newJob = await storage.createJobTicket({
            ...originalJob,
            id: undefined, // Let storage generate new ID
            parentJobId: claim.originalJobId, // Link to original job
            jobType: 'warranty_claim',
            status: 'Pending',
            paymentStatus: 'Warranty', // No charge
            problemStatement: `WARRANTY CLAIM: ${claim.claimReason}`,
            notes: `Warranty claim #${claim.id}. Original job: ${claim.originalJobId}`,
            createdAt: undefined,
        } as any);

        // Update claim with new job ID and status
        await storage.updateWarrantyClaim(req.params.id, {
            newJobId: newJob.id,
            status: 'in_repair',
        });

        await auditLogger.log({
            userId: req.body.createdBy || 'system',
            action: 'CREATE_WARRANTY_JOB',
            entity: 'warranty_claim',
            entityId: req.params.id,
            newValue: { newJobId: newJob.id },
        });

        res.status(201).json({ claim: { ...claim, newJobId: newJob.id }, job: newJob });
    } catch (error: any) {
        console.error('[Warranty] Error creating warranty job:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
