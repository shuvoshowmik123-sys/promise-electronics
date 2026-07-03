/**
 * Job Repository
 * 
 * Handles all database operations for job tickets (repair jobs).
 */

import { db, nanoid, eq, desc, like, or, inArray, notInArray, count, schema, sql, type JobTicket, type InsertJobTicket } from './base.js';
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

export async function getActiveJobTickets(): Promise<JobTicket[]> {
    try {
        return await db.select().from(schema.jobTickets)
            .where(notInArray(schema.jobTickets.status, ['Completed', 'Cancelled']))
            .orderBy(desc(schema.jobTickets.createdAt));
    } catch (error) {
        if (!isMissingJobTicketColumn(error)) throw error;
        console.warn('[LegacySchema][job_tickets] Falling back to raw SELECT for getActiveJobTickets.', error);
        return executeLegacyQuery(
            sql`SELECT * FROM job_tickets WHERE status NOT IN ('Completed', 'Cancelled') ORDER BY created_at DESC`,
            mapLegacyJobTicketRow,
        );
    }
}

export async function getCompletedJobTickets(limit = 25): Promise<{ jobs: JobTicket[]; total: number }> {
    try {
        const [jobs, [{ total }]] = await Promise.all([
            db.select().from(schema.jobTickets)
                .where(eq(schema.jobTickets.status, 'Completed'))
                .orderBy(desc(schema.jobTickets.completedAt))
                .limit(limit),
            db.select({ total: count() }).from(schema.jobTickets)
                .where(eq(schema.jobTickets.status, 'Completed')),
        ]);
        return { jobs, total: total ?? 0 };
    } catch (error) {
        if (!isMissingJobTicketColumn(error)) throw error;
        console.warn('[LegacySchema][job_tickets] Falling back to raw SELECT for getCompletedJobTickets.', error);
        const [jobs, countResult] = await Promise.all([
            executeLegacyQuery(
                sql`SELECT * FROM job_tickets WHERE status = 'Completed' ORDER BY completed_at DESC NULLS LAST LIMIT ${limit}`,
                mapLegacyJobTicketRow,
            ),
            db.execute(sql`SELECT COUNT(*) AS total FROM job_tickets WHERE status = 'Completed'`),
        ]);
        const rows = (countResult as any)?.rows ?? [];
        const total = parseInt(rows[0]?.total ?? '0', 10);
        return { jobs, total };
    }
}

export function isCorporateJob(job: Pick<JobTicket, "corporateClientId" | "corporateChallanId" | "corporateJobNumber" | "batchId" | "source">): boolean {
    return Boolean(
        job.corporateClientId ||
        job.corporateChallanId ||
        job.corporateJobNumber ||
        job.batchId ||
        job.source === "corporate_portal" ||
        job.source === "challan_in"
    );
}

export function filterJobTicketsByLane(jobs: JobTicket[], type: "all" | "walk-in" | "corporate"): JobTicket[] {
    if (type === "corporate") return jobs.filter(isCorporateJob);
    if (type === "walk-in") return jobs.filter((job) => !isCorporateJob(job));
    return jobs;
}

export async function getJobTicket(id: string): Promise<JobTicket | undefined> {
    // Single-row indexed lookup (id is PK). Previously this loaded ALL job
    // tickets then .find()'d — i.e. a full-table load per call. Keeps the same
    // legacy-schema fallback used by loadAllJobTickets().
    try {
        const rows = await db.select().from(schema.jobTickets).where(eq(schema.jobTickets.id, id)).limit(1);
        return rows[0];
    } catch (error) {
        if (!isMissingJobTicketColumn(error)) throw error;
        console.warn('[LegacySchema][job_tickets] Falling back to raw SELECT for getJobTicket.', error);
        const rows = await executeLegacyQuery(
            sql`SELECT * FROM job_tickets WHERE id = ${id} LIMIT 1`,
            mapLegacyJobTicketRow,
        );
        return rows[0];
    }
}

/**
 * Batch-fetch job tickets by id. Returns a Map keyed by id.
 *
 * Use this instead of calling getJobTicket() in a loop. Single indexed query
 * via inArray (was an N+1 of full-table loads: /api/service-requests loaded
 * ~15k rows to enrich 10 items). Keeps the legacy-schema fallback.
 */
export async function getJobTicketsByIds(ids: string[]): Promise<Map<string, JobTicket>> {
    const map = new Map<string, JobTicket>();
    const wanted = Array.from(new Set(ids.filter(Boolean)));
    if (wanted.length === 0) return map;
    let rows: JobTicket[];
    try {
        rows = await db.select().from(schema.jobTickets).where(inArray(schema.jobTickets.id, wanted));
    } catch (error) {
        if (!isMissingJobTicketColumn(error)) throw error;
        console.warn('[LegacySchema][job_tickets] Falling back to raw SELECT for getJobTicketsByIds.', error);
        rows = await executeLegacyQuery(
            sql`SELECT * FROM job_tickets WHERE id = ANY(${wanted})`,
            mapLegacyJobTicketRow,
        );
    }
    for (const job of rows) map.set(job.id, job);
    return map;
}

export async function getJobTicketsByTechnician(technicianName: string): Promise<JobTicket[]> {
    const jobs = await loadAllJobTickets();
    return jobs.filter((job) => job.technician === technicianName);
}

export async function getJobTicketsByTechnicianUser(
    userId: string,
    technicianName: string | null | undefined,
): Promise<JobTicket[]> {
    const jobs = await loadAllJobTickets();
    return jobs.filter(
        (job) =>
            job.assignedTechnicianId === userId ||
            (technicianName && job.technician === technicianName),
    );
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
