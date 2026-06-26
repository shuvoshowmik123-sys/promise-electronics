import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function migrateCallAttempts() {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS service_request_call_attempts (
        id TEXT PRIMARY KEY,
        service_request_id TEXT NOT NULL,
        staff_id TEXT NOT NULL,
        staff_name TEXT NOT NULL,
        call_type TEXT NOT NULL DEFAULT 'follow_up',
        scheduled_at TIMESTAMP,
        called_at TIMESTAMP,
        outcome TEXT,
        next_action TEXT,
        callback_at TIMESTAMP,
        customer_mood TEXT,
        notes TEXT,
        customer_visible_message TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);

    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_call_attempts_sr ON service_request_call_attempts (service_request_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_call_attempts_callback ON service_request_call_attempts (callback_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_call_attempts_outcome ON service_request_call_attempts (outcome)`);
}

export interface CallAttempt {
    id: string;
    serviceRequestId: string;
    staffId: string;
    staffName: string;
    callType: string;
    scheduledAt: string | null;
    calledAt: string | null;
    outcome: string | null;
    nextAction: string | null;
    callbackAt: string | null;
    customerMood: string | null;
    notes: string | null;
    customerVisibleMessage: string | null;
    createdAt: string;
    updatedAt: string;
}

function rowToCallAttempt(row: any): CallAttempt {
    return {
        id: row.id,
        serviceRequestId: row.service_request_id,
        staffId: row.staff_id,
        staffName: row.staff_name,
        callType: row.call_type,
        scheduledAt: row.scheduled_at,
        calledAt: row.called_at,
        outcome: row.outcome,
        nextAction: row.next_action,
        callbackAt: row.callback_at,
        customerMood: row.customer_mood,
        notes: row.notes,
        customerVisibleMessage: row.customer_visible_message,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function getCallAttempts(serviceRequestId: string): Promise<CallAttempt[]> {
    const rows = await db.execute(sql`
        SELECT * FROM service_request_call_attempts
        WHERE service_request_id = ${serviceRequestId}
        ORDER BY created_at DESC
    `);
    return (rows.rows as any[]).map(rowToCallAttempt);
}

export async function getCallAttempt(id: string, serviceRequestId: string): Promise<CallAttempt | null> {
    const rows = await db.execute(sql`
        SELECT * FROM service_request_call_attempts
        WHERE id = ${id} AND service_request_id = ${serviceRequestId}
        LIMIT 1
    `);
    return rows.rows[0] ? rowToCallAttempt(rows.rows[0]) : null;
}

export async function createCallAttempt(data: {
    serviceRequestId: string;
    staffId: string;
    staffName: string;
    callType: string;
    scheduledAt?: string;
    calledAt?: string;
    outcome?: string;
    nextAction?: string;
    callbackAt?: string;
    customerMood?: string;
    notes?: string;
    customerVisibleMessage?: string;
}): Promise<CallAttempt> {
    const id = randomUUID();
    await db.execute(sql`
        INSERT INTO service_request_call_attempts (id, service_request_id, staff_id, staff_name, call_type, scheduled_at, called_at, outcome, next_action, callback_at, customer_mood, notes, customer_visible_message)
        VALUES (${id}, ${data.serviceRequestId}, ${data.staffId}, ${data.staffName}, ${data.callType},
                ${data.scheduledAt ?? null}, ${data.calledAt ?? null}, ${data.outcome ?? null},
                ${data.nextAction ?? null}, ${data.callbackAt ?? null}, ${data.customerMood ?? null},
                ${data.notes ?? null}, ${data.customerVisibleMessage ?? null})
    `);
    const result = await getCallAttempt(id, data.serviceRequestId);
    return result!;
}

export async function updateCallAttempt(id: string, serviceRequestId: string, updates: {
    calledAt?: string;
    outcome?: string;
    nextAction?: string;
    callbackAt?: string;
    customerMood?: string;
    notes?: string;
    customerVisibleMessage?: string;
}): Promise<CallAttempt | null> {
    const chunks = [sql`updated_at = NOW()`];

    if (updates.calledAt !== undefined) chunks.push(sql`called_at = ${updates.calledAt}`);
    if (updates.outcome !== undefined) chunks.push(sql`outcome = ${updates.outcome}`);
    if (updates.nextAction !== undefined) chunks.push(sql`next_action = ${updates.nextAction}`);
    if (updates.callbackAt !== undefined) chunks.push(sql`callback_at = ${updates.callbackAt}`);
    if (updates.customerMood !== undefined) chunks.push(sql`customer_mood = ${updates.customerMood}`);
    if (updates.notes !== undefined) chunks.push(sql`notes = ${updates.notes}`);
    if (updates.customerVisibleMessage !== undefined) chunks.push(sql`customer_visible_message = ${updates.customerVisibleMessage}`);

    await db.execute(sql`
        UPDATE service_request_call_attempts
        SET ${sql.join(chunks, sql`, `)}
        WHERE id = ${id} AND service_request_id = ${serviceRequestId}
    `);

    return getCallAttempt(id, serviceRequestId);
}

export interface CallSummary {
    callAttemptCount: number;
    lastCallOutcome: string | null;
    nextCallbackAt: string | null;
    noAnswerStreak: number;
}

export async function getCallSummary(serviceRequestId: string): Promise<CallSummary> {
    const rows = await db.execute(sql`
        SELECT outcome, callback_at, called_at FROM service_request_call_attempts
        WHERE service_request_id = ${serviceRequestId}
        ORDER BY created_at DESC
    `);

    const attempts = rows.rows as any[];
    if (attempts.length === 0) {
        return { callAttemptCount: 0, lastCallOutcome: null, nextCallbackAt: null, noAnswerStreak: 0 };
    }

    let noAnswerStreak = 0;
    for (const a of attempts) {
        if (a.outcome === 'no_answer' || a.outcome === 'phone_off') noAnswerStreak++;
        else break;
    }

    const pendingCallback = attempts.find((a: any) => a.callback_at && new Date(a.callback_at) > new Date());

    return {
        callAttemptCount: attempts.length,
        lastCallOutcome: attempts[0].outcome,
        nextCallbackAt: pendingCallback?.callback_at ?? null,
        noAnswerStreak,
    };
}

export type IntakeLane = 'new_intake' | 'needs_call' | 'needs_reply' | 'quote_sent' | 'schedule_needed' | 'waiting_customer' | 'ready_to_receive' | 'converted_to_job' | 'rejected_closed';

export function deriveIntakeLane(sr: {
    status: string;
    stage: string | null;
    convertedJobId: string | null;
    quoteStatus: string | null;
    isQuote: boolean | null;
    adminInteracted: boolean | null;
}, callSummary: CallSummary): IntakeLane {
    const stage = sr.stage ?? 'intake';
    if (sr.convertedJobId) return 'converted_to_job';

    const closedStatuses = ['Cancelled', 'Declined', 'Closed', 'Unrepairable'];
    if (closedStatuses.includes(sr.status)) return 'rejected_closed';

    const readyStages = ['picked_up', 'device_received'];
    if (readyStages.includes(stage)) return 'ready_to_receive';

    if (sr.quoteStatus === 'Quoted') return 'quote_sent';

    const scheduleStages = ['pickup_scheduled', 'awaiting_dropoff'];
    if (scheduleStages.includes(stage)) return 'schedule_needed';

    if (callSummary.noAnswerStreak >= 3) return 'waiting_customer';
    if (callSummary.nextCallbackAt) return 'needs_call';
    if (callSummary.lastCallOutcome === 'callback_requested') return 'needs_call';
    if (callSummary.lastCallOutcome === 'asked_for_time') return 'waiting_customer';

    if (sr.quoteStatus === 'Pending' && sr.isQuote) return 'needs_reply';

    if (!sr.adminInteracted && sr.status === 'Pending') return 'new_intake';

    if (sr.status === 'Pending' || sr.status === 'Under Review') return 'needs_reply';

    return 'new_intake';
}

export interface IntakeSummaryItem {
    serviceRequestId: string;
    lane: IntakeLane;
    callSummary: CallSummary;
    needsStaffAction: boolean;
}

const ACTION_LANES: IntakeLane[] = ['new_intake', 'needs_call', 'needs_reply', 'schedule_needed'];

export async function getIntakeSummaryBulk(serviceRequests: {
    id: string;
    status: string;
    stage: string | null;
    convertedJobId: string | null;
    quoteStatus: string | null;
    isQuote: boolean | null;
    adminInteracted: boolean | null;
}[]): Promise<IntakeSummaryItem[]> {
    if (serviceRequests.length === 0) return [];

    const rows = await db.execute(sql`
        SELECT service_request_id, outcome, callback_at, created_at
        FROM service_request_call_attempts
        ORDER BY created_at DESC
    `);

    const attemptsBySr = new Map<string, any[]>();
    for (const row of rows.rows as any[]) {
        const srId = row.service_request_id;
        if (!attemptsBySr.has(srId)) attemptsBySr.set(srId, []);
        attemptsBySr.get(srId)!.push(row);
    }

    return serviceRequests.map(sr => {
        const attempts = attemptsBySr.get(sr.id) || [];
        let noAnswerStreak = 0;
        for (const a of attempts) {
            if (a.outcome === 'no_answer' || a.outcome === 'phone_off') noAnswerStreak++;
            else break;
        }
        const pendingCallback = attempts.find((a: any) => a.callback_at && new Date(a.callback_at) > new Date());
        const callSummary: CallSummary = {
            callAttemptCount: attempts.length,
            lastCallOutcome: attempts[0]?.outcome ?? null,
            nextCallbackAt: pendingCallback?.callback_at ?? null,
            noAnswerStreak,
        };
        const lane = deriveIntakeLane(sr, callSummary);
        return { serviceRequestId: sr.id, lane, callSummary, needsStaffAction: ACTION_LANES.includes(lane) };
    });
}
