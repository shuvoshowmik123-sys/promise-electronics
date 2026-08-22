/**
 * Job Repository
 * 
 * Handles all database operations for job tickets (repair jobs).
 */

import { db, nanoid, eq, desc, asc, like, or, and, inArray, notInArray, count, isNull, isNotNull, schema, sql, type JobTicket, type InsertJobTicket, type PaginationResult } from './base.js';
import { executeLegacyQuery, isMissingColumnError, mapLegacyJobTicketRow } from './legacy-schema.js';

const JOB_TICKETS_LEGACY_COLUMNS = [
    'assigned_technician_id',
    'created_by_user_id',
    'created_by_name',
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

/** SERVICE-INTAKE-RELIABILITY-01E — SQL-bounded job list for admin/mobile queues. */
const JOB_LIST_MAX_LIMIT = 100;
const JOB_SORT_ALLOWLIST = {
    createdAt: schema.jobTickets.createdAt,
    status: schema.jobTickets.status,
    id: schema.jobTickets.id,
} as const;

const JOB_PRIORITY_ALLOWLIST = new Set(["Low", "Medium", "High", "Critical", "Urgent"]);

export type JobTicketListQuery = {
    page?: number;
    limit?: number;
    type?: "all" | "walk-in" | "corporate";
    status?: string;
    /** Multiple statuses (group filter), preferred over single status when set. */
    statuses?: string[];
    search?: string;
    /** Allowlisted priority value; ignored if not in allowlist. */
    priority?: string;
    /** Technician display name, or "Unassigned" for null/empty/Unassigned. */
    technician?: string;
    sort?: keyof typeof JOB_SORT_ALLOWLIST;
    order?: "asc" | "desc";
    /** When set, restrict to jobs visible to this technician (assigned / created / name match). */
    technicianScope?: { userId: string; technicianName?: string | null };
};

function corporateLaneSql() {
    return or(
        isNotNull(schema.jobTickets.corporateClientId),
        isNotNull(schema.jobTickets.corporateChallanId),
        isNotNull(schema.jobTickets.corporateJobNumber),
        isNotNull(schema.jobTickets.batchId),
        eq(schema.jobTickets.source, "corporate_portal"),
        eq(schema.jobTickets.source, "challan_in"),
    )!;
}

function walkInLaneSql() {
    return and(
        isNull(schema.jobTickets.corporateClientId),
        isNull(schema.jobTickets.corporateChallanId),
        isNull(schema.jobTickets.corporateJobNumber),
        isNull(schema.jobTickets.batchId),
        sql`(${schema.jobTickets.source} IS NULL OR ${schema.jobTickets.source} NOT IN ('corporate_portal', 'challan_in'))`,
    )!;
}

/**
 * Everything that narrows a job list except the status itself.
 *
 * Shared so the group counts are drawn through exactly the same lane, search
 * and technician rules as the list they label. `includeStatuses` is the one
 * difference: the counts query groups BY status, so it must not filter ON it.
 */
function buildJobConditions(query: JobTicketListQuery, includeStatuses: boolean) {
    const conditions = [];
    const lane = query.type ?? "walk-in";
    if (lane === "corporate") conditions.push(corporateLaneSql());
    else if (lane === "walk-in") conditions.push(walkInLaneSql());

    if (includeStatuses) {
        if (query.statuses && query.statuses.length > 0) {
            const cleaned = query.statuses.map((s) => s.trim()).filter(Boolean).slice(0, 24);
            if (cleaned.length > 0) conditions.push(inArray(schema.jobTickets.status, cleaned));
        } else if (query.status?.trim()) {
            conditions.push(eq(schema.jobTickets.status, query.status.trim()));
        }
    }

    if (query.technicianScope?.userId) {
        const name = query.technicianScope.technicianName?.trim();
        const techParts = [
            eq(schema.jobTickets.assignedTechnicianId, query.technicianScope.userId),
            eq(schema.jobTickets.createdByUserId, query.technicianScope.userId),
        ];
        if (name) techParts.push(eq(schema.jobTickets.technician, name));
        conditions.push(or(...techParts)!);
    }

    const priority = query.priority?.trim();
    if (priority && JOB_PRIORITY_ALLOWLIST.has(priority)) {
        conditions.push(eq(schema.jobTickets.priority, priority));
    }

    const technicianFilter = query.technician?.trim();
    if (technicianFilter) {
        if (technicianFilter === "Unassigned") {
            conditions.push(
                or(
                    isNull(schema.jobTickets.technician),
                    eq(schema.jobTickets.technician, ""),
                    eq(schema.jobTickets.technician, "Unassigned"),
                )!,
            );
        } else {
            // Cap length; match exact technician display name (same as prior client filter).
            const techName = technicianFilter.slice(0, 120);
            conditions.push(eq(schema.jobTickets.technician, techName));
        }
    }

    const search = query.search?.trim();
    if (search) {
        // position() is literal (not LIKE) — keep underscores used in ticket/customer needles.
        const needle = search.replace(/[\\]/g, "").toLowerCase().slice(0, 80);
        if (needle.length > 0) {
            conditions.push(
                or(
                    sql`position(${needle} in lower(coalesce(${schema.jobTickets.id}, ''))) > 0`,
                    sql`position(${needle} in lower(coalesce(${schema.jobTickets.customer}, ''))) > 0`,
                    sql`position(${needle} in lower(coalesce(${schema.jobTickets.device}, ''))) > 0`,
                    sql`position(${needle} in lower(coalesce(${schema.jobTickets.customerPhone}, ''))) > 0`,
                )!,
            );
        }
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
}

/**
 * How many jobs sit in each status, for the group chips above the list.
 *
 * The chips used to count the rows already on screen. Only the open group had
 * a real number behind it; every other chip counted matching statuses within
 * the current page of twenty, so a list opened on New showed "Delivered 0"
 * however much finished work existed, and "All" repeated the New total. QA-31
 * read that as catch-up jobs missing from Jobs entirely — the jobs were there,
 * the chips were not counting them.
 */
export async function getJobStatusCounts(
    query: JobTicketListQuery = {},
): Promise<{ byStatus: Record<string, number>; total: number }> {
    const where = buildJobConditions(query, false);
    const rows = await db
        .select({ status: schema.jobTickets.status, count: sql<number>`count(*)::int` })
        .from(schema.jobTickets)
        .where(where)
        .groupBy(schema.jobTickets.status);

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
        const n = Number(row.count ?? 0);
        if (row.status) byStatus[row.status] = n;
        total += n;
    }
    return { byStatus, total };
}

export async function listJobTicketsPaginated(
    query: JobTicketListQuery = {},
): Promise<PaginationResult<JobTicket>> {
    const page = Number.isFinite(query.page) && (query.page as number) > 0 ? Math.floor(query.page as number) : 1;
    const rawLimit = Number.isFinite(query.limit) && (query.limit as number) > 0 ? Math.floor(query.limit as number) : 50;
    const limit = Math.min(JOB_LIST_MAX_LIMIT, Math.max(1, rawLimit));
    const offset = (page - 1) * limit;

    const where = buildJobConditions(query, true);
    const sortKey = query.sort && JOB_SORT_ALLOWLIST[query.sort] ? query.sort : "createdAt";
    const sortCol = JOB_SORT_ALLOWLIST[sortKey];
    const orderDesc = (query.order ?? "desc") !== "asc";
    const orderBy = orderDesc
        ? [desc(sortCol), desc(schema.jobTickets.id)]
        : [asc(sortCol), asc(schema.jobTickets.id)];

    try {
        const [items, countRows] = await Promise.all([
            db.select().from(schema.jobTickets).where(where).orderBy(...orderBy).limit(limit).offset(offset),
            db.select({ total: count() }).from(schema.jobTickets).where(where),
        ]);
        const total = Number(countRows[0]?.total ?? 0);
        return {
            items,
            pagination: {
                total,
                page,
                limit,
                pages: Math.max(1, Math.ceil(total / limit) || 1),
            },
        };
    } catch (error) {
        // HOTFIX-1: never load-all on list path.
        if (isMissingJobTicketColumn(error)) {
            const err = new Error(
                "Job list is temporarily unavailable due to schema drift. Run MAIN migrations.",
            ) as Error & { code?: string; statusCode?: number };
            err.code = "JOB_LIST_UNAVAILABLE";
            err.statusCode = 503;
            throw err;
        }
        throw error;
    }
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

/** Assigned to me OR created by me (intake visibility without ownership). */
export async function getJobTicketsVisibleToTechnician(
    userId: string,
    technicianName: string | null | undefined,
): Promise<JobTicket[]> {
    const jobs = await loadAllJobTickets();
    return jobs.filter(
        (job) =>
            job.assignedTechnicianId === userId ||
            job.createdByUserId === userId ||
            (technicianName && job.technician === technicianName),
    );
}

export function isJobAssignedToUser(
    job: JobTicket,
    userId: string,
    technicianName?: string | null,
): boolean {
    return (
        job.assignedTechnicianId === userId ||
        (!!technicianName && job.technician === technicianName && job.technician !== "Unassigned")
    );
}

export function isJobCreatedByUser(job: JobTicket, userId: string): boolean {
    return job.createdByUserId === userId;
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
 * CANONICAL JOB-ID ALLOCATOR
 * Allocation and insert MUST share one Drizzle transaction.
 * - pg_advisory_xact_lock keyed on the job-ID year — serialized across concurrent requests
 * - numeric MAX(CAST(SUBSTRING(id FROM ...) AS INTEGER)) — never lexical ORDER BY id
 * - supports rollover JOB-YYYY-9999 -> JOB-YYYY-10000 (no padStart cap)
 * - allocates N contiguous IDs
 * - caller is responsible for the insert; roll-back releases both lock and IDs
 */
const JOB_ID_PUBLIC_FORMAT_WIDTH = 4;
const MAX_JOB_IDS_PER_ALLOCATION = 10_000;

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function jobIdKey(year: number): string {
    return `job_seq_${year}`;
}

function buildJobId(year: number, suffix: number): string {
    return `JOB-${year}-${formatJobIdSuffix(suffix)}`;
}

function formatJobIdSuffix(suffix: number): string {
    const s = String(suffix);
    if (s.length <= JOB_ID_PUBLIC_FORMAT_WIDTH) return s.padStart(JOB_ID_PUBLIC_FORMAT_WIDTH, '0');
    return s;
}

async function acquireJobIdLock(tx: DbTransaction, year: number): Promise<void> {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${jobIdKey(year)}))`);
}

/**
 * Max numeric suffix among IDs matching exactly JOB-YYYY-<digits>.
 * Legacy / non-numeric IDs (e.g. JOB-2026-TEST) are ignored — never cast.
 */
async function currentMaxSuffix(tx: DbTransaction, year: number): Promise<number> {
    const pattern = `^JOB-${year}-[0-9]+$`;
    const prefix = `JOB-${year}-`;
    const prefixLen = prefix.length;
    const res = await tx.execute(sql`
        SELECT COALESCE(MAX(
            CAST(SUBSTRING(id FROM ${prefixLen + 1}::int) AS INTEGER)
        ), 0) AS max_suffix
        FROM job_tickets
        WHERE id ~ ${pattern}
    `);
    const rows = (res as any).rows ?? res;
    const v = Array.isArray(rows) && rows[0] ? Number(rows[0].max_suffix) : 0;
    return Number.isFinite(v) ? v : 0;
}

/** Preview-only max suffix (no lock, no reservation). Same numeric filter as allocator. */
async function peekMaxNumericSuffix(year: number): Promise<number> {
    const pattern = `^JOB-${year}-[0-9]+$`;
    const prefix = `JOB-${year}-`;
    const prefixLen = prefix.length;
    const res = await db.execute(sql`
        SELECT COALESCE(MAX(
            CAST(SUBSTRING(id FROM ${prefixLen + 1}::int) AS INTEGER)
        ), 0) AS max_suffix
        FROM job_tickets
        WHERE id ~ ${pattern}
    `);
    const rows = (res as any).rows ?? res;
    const v = Array.isArray(rows) && rows[0] ? Number(rows[0].max_suffix) : 0;
    return Number.isFinite(v) ? v : 0;
}

/**
 * Allocate N contiguous job IDs inside a Drizzle transaction.
 * MUST be called from the same tx that performs the INSERT.
 * Returns an array of generated ID strings in ascending order.
 */
export async function allocateJobIdsInTx(
    tx: DbTransaction,
    count: number,
    year: number = new Date().getFullYear()
): Promise<string[]> {
    if (!Number.isInteger(count) || count < 1) {
        throw new Error('allocateJobIdsInTx: count must be a positive integer');
    }
    if (count > MAX_JOB_IDS_PER_ALLOCATION) {
        throw new Error(`allocateJobIdsInTx: count ${count} exceeds per-call max ${MAX_JOB_IDS_PER_ALLOCATION}`);
    }

    await acquireJobIdLock(tx, year);
    const maxSuffix = await currentMaxSuffix(tx, year);

    const ids: string[] = [];
    for (let i = 1; i <= count; i++) {
        ids.push(buildJobId(year, maxSuffix + i));
    }
    return ids;
}

/**
 * Allocate a single job ID inside a Drizzle transaction.
 * Convenience wrapper around allocateJobIdsInTx(count=1).
 */
export async function allocateJobIdInTx(
    tx: DbTransaction,
    year: number = new Date().getFullYear()
): Promise<string> {
    const [id] = await allocateJobIdsInTx(tx, 1, year);
    return id;
}

/**
 * Preview helper for GET /api/job-tickets/next-number.
 * Returns the calculated next JOB-YYYY-NNNN display value from current numeric max.
 * NOT reserved — concurrent creates may skip or re-use this preview.
 * MUST never be used as write authority; insert uses allocateJobIdInTx only.
 */
export async function getNextJobNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const maxSuffix = await peekMaxNumericSuffix(year);
    return buildJobId(year, maxSuffix + 1);
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

/**
 * Insert a single job with a server-allocated ID.
 * Any caller-supplied `id` is ignored — job_tickets.id is never client-chosen.
 * Trusted internal creators that already hold allocateJobIdInTx results insert
 * via their own transactions (job.service, retail-quote.service, corporate.service,
 * corporate.repository) — they do not call this helper with a pre-set id.
 * Active createJobTicket callers (jobs.routes, warranty, corporate-portal) never
 * need a supplied id after HOTFIX-02.
 */
export async function createJobTicket(
    job: InsertJobTicket | (Omit<InsertJobTicket, 'id'> & { id?: string })
): Promise<JobTicket> {
    const { id: _ignored, ...rest } = job as InsertJobTicket & { id?: string };
    return await db.transaction(async (tx) => {
        const id = await allocateJobIdInTx(tx);
        const seeded = {
            ...rest,
            id,
            // TECHNICIAN-FLOW-01B: continuous active-work clock starts at intake
            activeWorkStartedAt: (rest as any).activeWorkStartedAt ?? new Date(),
        } as InsertJobTicket;
        const [newJob] = await tx
            .insert(schema.jobTickets)
            .values(seeded)
            .returning();
        return newJob;
    });
}

/**
 * Insert N jobs with server-allocated contiguous IDs.
 * Caller-supplied `id` values are always stripped — bulk/public upload paths
 * cannot inject job_tickets.id. Allocation and insert share one transaction
 * with the per-year advisory lock.
 */
export async function createJobTicketsBulk(
    jobs: Array<InsertJobTicket | (Omit<InsertJobTicket, 'id'> & { id?: string })>
): Promise<JobTicket[]> {
    if (jobs.length === 0) return [];

    return await db.transaction(async (tx) => {
        const year = new Date().getFullYear();
        const allocatedIds = await allocateJobIdsInTx(tx, jobs.length, year);
        const jobsWithIds = jobs.map((job, i) => {
            const { id: _ignored, ...rest } = job as InsertJobTicket & { id?: string };
            return {
                ...rest,
                id: allocatedIds[i],
                // Follow DB default; explicit seed when driver omits defaults
                activeWorkStartedAt: (rest as any).activeWorkStartedAt ?? new Date(),
            } as InsertJobTicket;
        });

        const newJobs = await tx.insert(schema.jobTickets).values(jobsWithIds).returning();
        return newJobs;
    });
}

export async function updateJobTicket(id: string, updates: Partial<InsertJobTicket>): Promise<JobTicket | undefined> {
    // Ordinary mutation surface: lock current NG workflow state under row lock.
    // job-ng-report.service uses its own tx.update and does not call this helper for NG transitions.
    const { assertOrdinaryJobMutationAllowed } = await import('../services/job-ng-protected.js');

    return await db.transaction(async (tx) => {
        const lock = await tx.execute(sql`SELECT id, status FROM job_tickets WHERE id = ${id} FOR UPDATE`);
        const row = ((lock as any).rows ?? lock)[0] as { id: string; status: string } | undefined;
        if (!row) return undefined;

        assertOrdinaryJobMutationAllowed(row.status, updates as Record<string, unknown>);

        const [updated] = await tx
            .update(schema.jobTickets)
            .set(updates)
            .where(eq(schema.jobTickets.id, id))
            .returning();
        return updated;
    });
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
    return listJobTicketsPaginated({ page, limit, type: "all" });
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

/**
 * How busy each technician is, for the screen that spreads work between them.
 *
 * This was declared on the storage interface and implemented nowhere, so the
 * endpoint behind the bulk-assign screen threw on every request — the one
 * screen whose entire purpose is showing who is already loaded before you hand
 * out more work.
 *
 * Counted from job_tickets.technician, which holds a NAME rather than an id,
 * because that is what the assignment writes. Both are returned so the caller
 * can match on either: names get edited, and a technician renamed mid-week
 * would otherwise silently show zero jobs and be handed everything.
 *
 * "Active" means not in a terminal state — the same list the technician queue
 * uses, so the two screens cannot disagree about who is busy.
 */
export async function getTechnicianWorkload(): Promise<Array<{
    technicianId: string;
    technicianName: string;
    activeJobs: number;
    completedToday: number;
}>> {
    const rows = await db.execute(sql`
        SELECT j.technician                                   AS "technicianName",
               MAX(u.id)                                      AS "technicianId",
               COUNT(*) FILTER (
                   WHERE j.status NOT IN (
                       'Completed', 'Delivered', 'Cancelled', 'Abandoned',
                       'Forfeited', 'Closed', 'Not OK'
                   )
               )::int                                         AS "activeJobs",
               COUNT(*) FILTER (
                   WHERE j.status IN ('Completed', 'Delivered')
                     AND j.completed_at >= date_trunc('day', now())
               )::int                                         AS "completedToday"
        FROM job_tickets j
        LEFT JOIN users u ON u.name = j.technician
        WHERE j.technician IS NOT NULL AND j.technician <> ''
        GROUP BY j.technician
    `);

    return ((rows as any).rows ?? rows).map((row: any) => ({
        technicianId: row.technicianId ?? '',
        technicianName: row.technicianName ?? '',
        activeJobs: Number(row.activeJobs) || 0,
        completedToday: Number(row.completedToday) || 0,
    }));
}
