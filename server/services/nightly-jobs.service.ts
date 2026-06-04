/**
 * Nightly Jobs Service
 *
 * Runs two background jobs on an interval (default: every 30min, full run at midnight):
 *   1. SLA breach check — alerts admin on B2B jobs breaching deadline
 *   2. Acceptance ratio update — refreshes staff_presence.acceptance_ratio
 *      for weighted inbox assignment
 *
 * Start via initNightlyJobs() called from server/index.ts
 */

import { db } from '../db.js';
import { staffPresence, jobTickets, users, auditLogs } from '../../shared/schema.js';
import { eq, and, sql, lt } from 'drizzle-orm';
import { brainService } from '../brain/brain.service.js';
import { upsertPresence } from './assignment.service.js';

type SlaState = 'ok' | 'at-risk' | 'breached';
const lastSlaStates = new Map<string, SlaState>();
let lastSlaSummary = '';

// ─── SLA breach check ─────────────────────────────────────────────────────────

export async function checkSlaBreach() {
    const now = new Date();
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;

    try {
        // Find B2B jobs with slaDeadline set and not yet completed/delivered
        const atRisk = await db.select({
            id: jobTickets.id,
            customer: jobTickets.customer,
            device: jobTickets.device,
            corporateClientId: jobTickets.corporateClientId,
            slaDeadline: jobTickets.slaDeadline,
            status: jobTickets.status,
        })
        .from(jobTickets)
        .where(
            and(
                sql`${jobTickets.slaDeadline} IS NOT NULL`,
                sql`${jobTickets.status} NOT IN ('Completed', 'Delivered', 'Cancelled', 'Forfeited')`,
                sql`${jobTickets.clientClass} IN ('b2b_normal', 'b2b_corporate')`,
            )
        );

        let yellowed = 0, redded = 0, changed = 0;
        const currentIds = new Set<string>();
        for (const job of atRisk) {
            if (!job.slaDeadline) continue;
            currentIds.add(job.id);
            const deadline = new Date(job.slaDeadline);
            const remaining = deadline.getTime() - now.getTime();
            let state: SlaState = 'ok';

            if (remaining < 0) {
                state = 'breached';
                redded++;
            } else if (remaining < twoDaysMs) {
                state = 'at-risk';
                yellowed++;
            }

            const previous = lastSlaStates.get(job.id);
            if (previous && previous !== state) changed++;
            lastSlaStates.set(job.id, state);
        }

        for (const jobId of Array.from(lastSlaStates.keys())) {
            if (!currentIds.has(jobId)) lastSlaStates.delete(jobId);
        }

        const summary = `${redded}:${yellowed}`;
        if ((yellowed + redded > 0 || lastSlaSummary !== summary) && (changed > 0 || lastSlaSummary !== summary)) {
            console.log(`[SLA] Sweep: ${redded} breached, ${yellowed} at-risk${changed > 0 ? `, ${changed} changed` : ''}`);
            lastSlaSummary = summary;
        }
    } catch (e: any) {
        console.warn('[SLA] Sweep failed:', e.message?.slice(0, 80));
    }
}

// ─── Acceptance ratio update ──────────────────────────────────────────────────

export async function updateAcceptanceRatios() {
    try {
        // Get all staff (admin users excluding customers)
        const staffRows = await db.select({ id: users.id, name: users.name })
            .from(users)
            .where(sql`${users.role} NOT IN ('Customer')`);

        if (staffRows.length === 0) return;

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        // Count converted jobs per staff in last 30 days
        // A "converted" job = status Completed or Delivered, assigned to that technician
        const completedJobs = await db.select({
            technician: jobTickets.technician,
            assignedTechnicianId: jobTickets.assignedTechnicianId,
        })
        .from(jobTickets)
        .where(
            and(
                sql`${jobTickets.status} IN ('Completed', 'Delivered')`,
                sql`${jobTickets.createdAt} >= ${thirtyDaysAgo}`,
            )
        );

        // Count claimed sessions per staff from brain DB
        const sessionCounts = await brainService.countOpenSessionsByStaff(staffRows.map(s => s.id));
        const sessionMap = new Map(sessionCounts.map(s => [s.staffId, s.count]));

        // Count completed jobs per staff
        const jobCountMap = new Map<string, number>();
        for (const job of completedJobs) {
            const staffId = job.assignedTechnicianId;
            if (staffId) {
                jobCountMap.set(staffId, (jobCountMap.get(staffId) ?? 0) + 1);
            }
        }

        // Update each staff's ratio
        for (const staff of staffRows) {
            const converted = jobCountMap.get(staff.id) ?? 0;
            const claimed = Math.max(sessionMap.get(staff.id) ?? 1, 1); // avoid /0
            const ratio = Math.min(converted / claimed, 1.0); // cap at 1.0

            await db.insert(staffPresence)
                .values({
                    staffId: staff.id,
                    status: 'offline',
                    acceptanceRatio: ratio,
                    openSessionCount: sessionMap.get(staff.id) ?? 0,
                    ratioUpdatedAt: new Date(),
                    lastSeenAt: new Date(),
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: staffPresence.staffId,
                    set: {
                        acceptanceRatio: ratio,
                        openSessionCount: sessionMap.get(staff.id) ?? 0,
                        ratioUpdatedAt: new Date(),
                    },
                });
        }

        console.log(`[Phase I] Acceptance ratios updated for ${staffRows.length} staff`);
    } catch (e: any) {
        console.warn('[Phase I] Ratio update failed:', e.message?.slice(0, 80));
    }
}

// ─── Audit log retention ──────────────────────────────────────────────────────
// Deletes 'info' severity rows older than 180 days. Keeps warnings + critical forever.
// Runs once per 24h. Typical batch: 0-500 rows. ~200ms.

export async function pruneOldAuditLogs() {
    try {
        const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
        const result = await db.delete(auditLogs)
            .where(
                and(
                    eq(auditLogs.severity, 'info'),
                    lt(auditLogs.createdAt, cutoff)
                )
            );
        const deleted = (result as any).rowCount ?? 0;
        if (deleted > 0) console.log(`[NightlyJobs] Pruned ${deleted} old audit_log rows (info, >180d)`);
    } catch (e: any) {
        console.warn('[NightlyJobs] pruneOldAuditLogs failed:', e.message?.slice(0, 80));
    }
}

// ─── Initializer (call from server/index.ts) ──────────────────────────────────

let _started = false;

export function initNightlyJobs() {
    if (_started) return;
    _started = true;

    // SLA check every 30min
    setInterval(checkSlaBreach, 30 * 60 * 1000);

    // Acceptance ratio every 6 hours
    setInterval(updateAcceptanceRatios, 6 * 60 * 60 * 1000);

    // Audit log retention once per 24h (runs at 3 AM effectively — first run 24h after boot)
    setInterval(pruneOldAuditLogs, 24 * 60 * 60 * 1000);

    // Stagger startup tasks so cold-start doesn't spike memory on 512MB free tier.
    // HTTP server must be accepting requests before any heavy DB work begins.
    setTimeout(() => checkSlaBreach().catch(() => {}), 45_000);          // 45s
    setTimeout(() => updateAcceptanceRatios().catch(() => {}), 90_000);  // 90s
    setTimeout(() => pruneOldAuditLogs().catch(() => {}), 120_000);      // 2 min

    console.log('[NightlyJobs] SLA + acceptance ratio jobs scheduled');
}
