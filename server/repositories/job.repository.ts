/**
 * Job Repository
 * 
 * Handles all database operations for job tickets (repair jobs).
 */

import { db, nanoid, eq, desc, like, or, schema, sql, type JobTicket, type InsertJobTicket } from './base.js';
import { executeLegacyQuery, isMissingColumnError, mapLegacyJobTicketRow } from './legacy-schema.js';

const JOB_TICKETS_LEGACY_COLUMNS = [
    'assigned_technician_id',
    'corporate_challan_id',
    'corporate_job_number',
    'corporate_client_id',
    'job_type',
    'charges',
    'warranty_notes',
    'payment_status',
    'payment_id',
    'paid_amount',
    'remaining_amount',
    'paid_at',
    'last_payment_at',
    'billing_status',
    'invoice_printed_at',
    'initial_status',
    'reported_defect',
    'problem_found',
    'corporate_bill_id',
    'invoice_printed_by',
    'invoice_print_count',
    'write_off_reason',
    'write_off_by',
    'write_off_at',
    'assisted_by_ids',
    'assisted_by_names',
    'service_lines',
    'product_lines',
    'warranty_days',
    'grace_period_days',
    'warranty_expiry_date',
    'warranty_terms_accepted',
    'mobile_media',
    'last_mobile_update_at',
    'store_id',
];

function isMissingJobTicketColumn(error: unknown): boolean {
    return isMissingColumnError(error, JOB_TICKETS_LEGACY_COLUMNS);
}

async function loadAllJobTickets(): Promise<JobTicket[]> {
    try {
        return await db.select().from(schema.jobTickets).orderBy(desc(schema.jobTickets.createdAt));
    } catch (error) {
        if (!isMissingJobTicketColumn(error)) {
            throw error;
        }

        console.warn('[LegacySchema][job_tickets] Falling back to raw SELECT * for legacy production schema.', error);
        return executeLegacyQuery(
            sql`SELECT * FROM job_tickets ORDER BY created_at DESC`,
            mapLegacyJobTicketRow,
        );
    }
}

// ============================================
// Job Queries
// ============================================

export async function getAllJobTickets(): Promise<JobTicket[]> {
    return loadAllJobTickets();
}

export async function getJobTicket(id: string): Promise<JobTicket | undefined> {
    const jobs = await loadAllJobTickets();
    return jobs.find((job) => job.id === id);
}

export async function getJobTicketsByTechnician(technicianName: string): Promise<JobTicket[]> {
    const jobs = await loadAllJobTickets();
    return jobs.filter((job) => job.technician === technicianName);
}

export async function getJobTicketsByStatus(status: string): Promise<JobTicket[]> {
    const jobs = await loadAllJobTickets();
    return jobs.filter((job) => job.status === status);
}

export async function getJobTicketsByCustomerPhone(phone: string): Promise<JobTicket[]> {
    // Normalize phone number for matching (last 10 digits)
    const normalizedPhone = phone.replace(/\D/g, '').slice(-10);
    const allJobs = await loadAllJobTickets();
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
    const jobs = await loadAllJobTickets();
    return jobs.filter(j => j.status !== 'Completed' && j.status !== 'Cancelled').length;
}

// ============================================
// Job Mutations
// ============================================

export async function createJobTicket(job: InsertJobTicket): Promise<JobTicket> {
    const [newJob] = await db.insert(schema.jobTickets).values(job).returning();
    return newJob;
}

export async function createJobTicketsBulk(jobs: InsertJobTicket[]): Promise<JobTicket[]> {
    if (jobs.length === 0) return [];

    // Perform bulk insert
    const newJobs = await db.insert(schema.jobTickets).values(jobs).returning();
    return newJobs;
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

export async function getJobTicketsList(page: number = 1, limit: number = 50) {
    const offset = (page - 1) * limit;
    const items = (await loadAllJobTickets()).slice(offset, offset + limit);
    
    return { items, pagination: { total: items.length, page, limit, pages: 1 } };
}

export async function searchJobTickets(query: string): Promise<JobTicket[]> {
    const searchPattern = query.toLowerCase();
    const jobs = await loadAllJobTickets();
    return jobs.filter((job) => {
        const haystacks = [job.id, job.customer, job.device]
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
            .map((value) => value.toLowerCase());
        return haystacks.some((value) => value.includes(searchPattern));
    }).slice(0, 20);
}
