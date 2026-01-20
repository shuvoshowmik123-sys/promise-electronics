/**
 * Job Tickets Routes
 * 
 * Handles job ticket CRUD operations and tracking.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage.js';
import { insertJobTicketSchema } from '../../shared/schema.js';

import { notifyAdminUpdate } from './middleware/sse-broker.js';
import { auditLogger } from '../utils/auditLogger.js';

const router = Router();

// ============================================
// Job Tickets API
// ============================================

/**
 * GET /api/job-tickets - Get all job tickets
 */
router.get('/api/job-tickets', async (req: Request, res: Response) => {
    try {
        // Access Control: Filter jobs for Technicians
        const userId = req.session?.adminUserId;
        if (userId) {
            const user = await storage.getUser(userId);
            if (user && user.role === 'Technician') {
                const allJobs = await storage.getAllJobTickets();
                // Filter: Only jobs assigned to this technician (by Name)
                const myJobs = allJobs.filter(j => j.technician === user.name);
                return res.json(myJobs);
            }
        }

        // Managers/Admins view all
        const jobs = await storage.getAllJobTickets();
        res.json(jobs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch job tickets' });
    }
});

/**
 * GET /api/job-tickets/next-number - Get next auto-generated job number
 */
router.get('/api/job-tickets/next-number', async (req: Request, res: Response) => {
    try {
        const nextNumber = await storage.getNextJobNumber();
        res.json({ nextNumber });
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate job number' });
    }
});

/**
 * GET /api/job-tickets/:id - Get job ticket by ID
 */
router.get('/api/job-tickets/:id', async (req: Request, res: Response) => {
    try {
        const job = await storage.getJobTicket(req.params.id);
        if (!job) {
            return res.status(404).json({ error: 'Job ticket not found' });
        }
        res.json(job);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch job ticket' });
    }
});

/**
 * POST /api/job-tickets - Create new job ticket
 */
router.post('/api/job-tickets', async (req: Request, res: Response) => {
    try {
        // Auto-generate job ID if not provided
        let jobData = { ...req.body };
        if (!jobData.id) {
            jobData.id = await storage.getNextJobNumber();
        }

        // Convert deadline string to Date if present
        if (jobData.deadline && typeof jobData.deadline === 'string') {
            jobData.deadline = new Date(jobData.deadline);
        }

        const validated = insertJobTicketSchema.parse(jobData);
        const job = await storage.createJobTicket(validated);

        // Notify all admins about new job ticket
        notifyAdminUpdate({
            type: 'job_ticket_created',
            data: job,
            createdAt: new Date().toISOString()
        });

        // Audit Log
        await auditLogger.log({
            userId: req.session?.adminUserId || 'system',
            action: 'CREATE_JOB',
            entity: 'JobTicket',
            entityId: job.id,
            details: `Created new job ticket ${job.id}`,
            newValue: job,
            req: req
        });

        res.status(201).json(job);
    } catch (error: any) {
        console.error('Job ticket validation error:', error.message);
        res.status(400).json({ error: 'Invalid job ticket data', details: error.message });
    }
});

/**
 * PATCH /api/job-tickets/:id - Update job ticket
 */
router.patch('/api/job-tickets/:id', async (req: Request, res: Response) => {
    try {
        let updateData = { ...req.body };

        // Convert all date string fields to Date objects
        const dateFields = ['deadline', 'createdAt', 'completedAt', 'serviceExpiryDate', 'partsExpiryDate'];
        for (const field of dateFields) {
            if (updateData[field] && typeof updateData[field] === 'string') {
                updateData[field] = new Date(updateData[field]);
            }
        }



        const existingJob = await storage.getJobTicket(req.params.id);

        const job = await storage.updateJobTicket(req.params.id, updateData);
        if (!job) {
            return res.status(404).json({ error: 'Job ticket not found' });
        }

        // Audit Log
        if (existingJob) {
            await auditLogger.log({
                userId: req.session?.adminUserId || 'system',
                action: 'UPDATE_JOB',
                entity: 'JobTicket',
                entityId: job.id,
                details: `Updated job ticket ${job.id}`,
                oldValue: existingJob,
                newValue: job,
                req: req
            });
        }

        // Notify all admins about job ticket update
        notifyAdminUpdate({
            type: 'job_ticket_updated',
            data: job,
            updatedAt: new Date().toISOString()
        });

        res.json(job);
    } catch (error: any) {
        console.error('Failed to update job ticket:', error.message, error);
        res.status(500).json({ error: 'Failed to update job ticket', details: error.message });
    }
});

/**
 * DELETE /api/job-tickets/:id - Delete job ticket
 */
router.delete('/api/job-tickets/:id', async (req: Request, res: Response) => {
    try {
        const jobId = req.params.id;
        const success = await storage.deleteJobTicket(jobId);
        if (!success) {
            return res.status(404).json({ error: 'Job ticket not found' });
        }

        // Notify all admins about job ticket deletion
        notifyAdminUpdate({
            type: 'job_ticket_deleted',
            id: jobId,
            deletedAt: new Date().toISOString()
        });

        // Audit Log
        await auditLogger.log({
            userId: req.session?.adminUserId || 'system',
            action: 'DELETE_JOB',
            entity: 'JobTicket',
            entityId: jobId,
            details: `Deleted job ticket ${jobId}`,
            oldValue: { id: jobId }, // Minimal info since deleted
            req: req
        });

        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete job ticket' });
    }
});

/**
 * GET /api/job-tickets/track/:id - Public job tracking (for QR code scanning)
 */
router.get('/api/job-tickets/track/:id', async (req: Request, res: Response) => {
    try {
        const job = await storage.getJobTicket(req.params.id);
        if (!job) {
            return res.status(404).json({ error: 'Job ticket not found' });
        }

        // Return limited public info for security
        res.json({
            id: job.id,
            device: job.device,
            screenSize: job.screenSize,
            status: job.status,
            createdAt: job.createdAt,
            completedAt: job.completedAt,
            estimatedCost: job.estimatedCost,
            deadline: job.deadline,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch job tracking info' });
    }
});

export default router;
