/**
 * Job Repository
 * 
 * Handles all database operations for job tickets (repair jobs).
 */

import { db, nanoid, eq, desc, like, schema, type JobTicket, type InsertJobTicket } from './base.js';

// ============================================
// Job Queries
// ============================================

export async function getAllJobTickets(): Promise<JobTicket[]> {
    return db.select().from(schema.jobTickets).orderBy(desc(schema.jobTickets.createdAt));
}

export async function getJobTicket(id: string): Promise<JobTicket | undefined> {
    const [job] = await db.select().from(schema.jobTickets).where(eq(schema.jobTickets.id, id));
    return job;
}

export async function getJobTicketsByTechnician(technicianName: string): Promise<JobTicket[]> {
    return db.select().from(schema.jobTickets)
        .where(eq(schema.jobTickets.technician, technicianName))
        .orderBy(desc(schema.jobTickets.createdAt));
}

export async function getJobTicketsByStatus(status: string): Promise<JobTicket[]> {
    return db.select().from(schema.jobTickets)
        .where(eq(schema.jobTickets.status, status))
        .orderBy(desc(schema.jobTickets.createdAt));
}

export async function getJobTicketsByCustomerPhone(phone: string): Promise<JobTicket[]> {
    // Normalize phone number for matching (last 10 digits)
    const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
    const allJobs = await db.select().from(schema.jobTickets).orderBy(desc(schema.jobTickets.createdAt));
    return allJobs.filter(job => {
        if (!job.customerPhone) return false;
        const jobPhone = job.customerPhone.replace(/\D/g, '').slice(-10);
        return jobPhone === normalizedPhone;
    });
}

/**
 * Get the next job number in format JOB-YYYY-XXXX
 */
export async function getNextJobNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `JOB-${year}-`;

    const [lastJob] = await db
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

    const nextNumber = maxNumber + 1;
    return `${prefix}${String(nextNumber).padStart(4, '0')}`;
}

/**
 * Get active jobs count (not completed or cancelled)
 */
export async function getActiveJobsCount(): Promise<number> {
    const jobs = await db.select().from(schema.jobTickets);
    return jobs.filter(j => j.status !== 'Completed' && j.status !== 'Cancelled').length;
}

// ============================================
// Job Mutations
// ============================================

export async function createJobTicket(job: InsertJobTicket): Promise<JobTicket> {
    const [newJob] = await db.insert(schema.jobTickets).values(job).returning();
    return newJob;
}

export async function updateJobTicket(id: string, updates: Partial<InsertJobTicket>): Promise<JobTicket | undefined> {
    const [updated] = await db
        .update(schema.jobTickets)
        .set(updates)
        .where(eq(schema.jobTickets.id, id))
        .returning();
    return updated;
}

export async function deleteJobTicket(id: string): Promise<boolean> {
    const result = await db.delete(schema.jobTickets).where(eq(schema.jobTickets.id, id));
    return (result.rowCount ?? 0) > 0;
}

/**
 * Complete a job and set completion timestamp
 */
export async function completeJobTicket(id: string): Promise<JobTicket | undefined> {
    return updateJobTicket(id, {
        status: 'Completed',
        completedAt: new Date(),
    } as any);
}

/**
 * Assign a technician to a job
 */
export async function assignTechnician(id: string, technicianName: string): Promise<JobTicket | undefined> {
    return updateJobTicket(id, { technician: technicianName });
}
