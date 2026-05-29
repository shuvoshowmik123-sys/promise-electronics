/**
 * Inbox Auto-Assignment Service (Phase B)
 *
 * Algorithm (deterministic, no AI):
 *   1. Session has owner + owner online? → keep owner.
 *   2. Session has owner but offline >5min? → re-route to next available.
 *   3. No owner + class is repeat/reference + last-known-staff online? → assign to them.
 *   4. Round-robin across online staff, weighted by inverse acceptance ratio.
 *   5. No one online? → return null (caller sends AI holding message).
 *
 * Capacity cap: 10 open sessions per staff (configurable via STAFF_CAPACITY_CAP env).
 */

import { db } from '../db.js';
import { staffPresence, users } from '../../shared/schema.js';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { brainService } from '../brain/brain.service.js';

const CAPACITY_CAP = parseInt(process.env.STAFF_CAPACITY_CAP || '10', 10);
const OFFLINE_GRACE_MS = 5 * 60 * 1000; // 5 minutes

// ─── Presence heartbeat ────────────────────────────────────────────────────────

export async function upsertPresence(
    staffId: string,
    status: 'online' | 'away' | 'offline',
    channels: string[] = []
) {
    await db
        .insert(staffPresence)
        .values({ staffId, status, channels, lastSeenAt: new Date(), updatedAt: new Date() })
        .onConflictDoUpdate({
            target: staffPresence.staffId,
            set: { status, channels, lastSeenAt: new Date(), updatedAt: new Date() },
        });
}

// ─── Get online staff ──────────────────────────────────────────────────────────

async function getOnlineStaff(): Promise<string[]> {
    const rows = await db
        .select({ staffId: staffPresence.staffId, lastSeenAt: staffPresence.lastSeenAt })
        .from(staffPresence)
        .where(eq(staffPresence.status, 'online'));

    const now = Date.now();
    // Treat as offline if heartbeat lapsed >5min (tab closed without explicit offline ping)
    return rows
        .filter(r => now - new Date(r.lastSeenAt).getTime() < OFFLINE_GRACE_MS)
        .map(r => r.staffId);
}

// Count open sessions assigned to each staff in the brain DB
async function getOpenSessionCounts(staffIds: string[]): Promise<Map<string, number>> {
    if (staffIds.length === 0) return new Map();
    // Query brain sessions per owner — brain DB uses a separate neon connection
    // We call brainService.countOpenSessionsByStaff which we'll add inline here
    const counts = new Map<string, number>();
    for (const id of staffIds) counts.set(id, 0); // default 0
    try {
        const rows = await brainService.countOpenSessionsByStaff(staffIds);
        for (const row of rows) counts.set(row.staffId, row.count);
    } catch { /* brain DB may be unavailable; proceed with zeroes */ }
    return counts;
}

// ─── Core assignment function ──────────────────────────────────────────────────

export interface AssignmentResult {
    staffId: string;
    staffName: string;
    reason: 'existing_owner' | 'repeat_history' | 'round_robin' | 'no_staff';
}

export async function assignSession(
    sessionPsid: string,
    clientClass?: string | null
): Promise<AssignmentResult | null> {
    const session = await brainService.getSession(sessionPsid);
    const onlineIds = await getOnlineStaff();

    // 1. Session already has owner
    if (session.claimedByUserId) {
        const ownerOnline = onlineIds.includes(session.claimedByUserId);
        if (ownerOnline) {
            return {
                staffId: session.claimedByUserId,
                staffName: session.claimedByName || session.claimedByUserId,
                reason: 'existing_owner',
            };
        }
        // Owner has been offline >5min — fall through to re-assign
    }

    if (onlineIds.length === 0) return null; // No one available → AI fallback

    // 2. Repeat/reference: prefer last known handler (from conversation history)
    // For now, no canonical customer table yet (Phase C). Skip if class not repeat.
    // (Phase C will add last-known-staff lookup here)

    // 3. Round-robin among online staff under capacity, weighted by acceptance ratio
    const counts = await getOpenSessionCounts(onlineIds);
    const available = onlineIds.filter(id => (counts.get(id) ?? 0) < CAPACITY_CAP);

    if (available.length === 0) return null; // All at capacity → AI fallback

    // Fetch acceptance ratios from staff_presence
    let ratioMap = new Map<string, number>();
    try {
        const rows = await db.select({ staffId: staffPresence.staffId, acceptanceRatio: staffPresence.acceptanceRatio })
            .from(staffPresence)
            .where(inArray(staffPresence.staffId, available));
        for (const r of rows) ratioMap.set(r.staffId, r.acceptanceRatio ?? 0.5);
    } catch { /* fallback: equal weights */ }

    // Score = acceptanceRatio - (openCount * 0.1) — higher ratio, fewer open sessions = preferred
    available.sort((a, b) => {
        const scoreA = (ratioMap.get(a) ?? 0.5) - (counts.get(a) ?? 0) * 0.1;
        const scoreB = (ratioMap.get(b) ?? 0.5) - (counts.get(b) ?? 0) * 0.1;
        return scoreB - scoreA; // descending — best score first
    });
    const pickedId = available[0];

    // Fetch staff name
    const staffRows = await db.select({ name: users.name }).from(users).where(eq(users.id, pickedId)).limit(1);
    const staffName = staffRows[0]?.name ?? pickedId;

    // Claim the session
    await brainService.claimSession(sessionPsid, pickedId, staffName);

    return { staffId: pickedId, staffName, reason: 'round_robin' };
}

// ─── Offline sweep (called by cron or on heartbeat timeout) ──────────────────

export async function sweepOfflineStaff() {
    const now = Date.now();
    const rows = await db
        .select({ staffId: staffPresence.staffId, lastSeenAt: staffPresence.lastSeenAt })
        .from(staffPresence)
        .where(eq(staffPresence.status, 'online'));

    for (const row of rows) {
        const age = now - new Date(row.lastSeenAt).getTime();
        if (age > OFFLINE_GRACE_MS) {
            await upsertPresence(row.staffId, 'offline');
        }
    }
}
