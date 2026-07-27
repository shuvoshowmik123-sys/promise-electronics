/**
 * TECHNICIAN-FLOW-01B — explainable active/blocked queue, continuous active age, 7-day alert.
 * No supplier/part/price detail in technician-facing DTOs.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../db.js";
import { jobTickets, notifications, users } from "../../shared/schema.js";
import { isNgProtectedStatus } from "./job-ng-protected.js";

export const STATUS_AWAITING_QUOTE_APPROVAL = "Awaiting Quote Approval" as const;

export const BLOCKED_WORK_STATUSES = [
  "Pending Parts",
  "Waiting on Parts",
  STATUS_AWAITING_QUOTE_APPROVAL,
  "Awaiting Customer Decision",
  "NG Review Pending",
] as const;

export const TERMINAL_WORK_STATUSES = [
  "Completed",
  "Delivered",
  "Cancelled",
  "Abandoned",
  "Forfeited",
  "Closed",
  "Not OK",
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type WaitingSticker =
  | "waiting_for_parts"
  | "customer_decision_needed"
  | "ng_replacement_decision"
  | "ng_review_in_progress";

export type EscalationBand = 0 | 1 | 2 | 3 | 4;

export type SafeTechnicianQueueJob = {
  id: string;
  customer: string | null;
  customerPhone: string | null;
  device: string | null;
  issue: string | null;
  status: string;
  priority: string | null;
  technician: string | null;
  assignedTechnicianId: string | null;
  inspectionResult: string | null;
  inspectionNote: string | null;
  inspectedBy: string | null;
  inspectedAt: Date | string | null;
  initialStatus: string | null;
  problemFound: string | null;
  reportedDefect: string | null;
  corporateClientId: string | null;
  batchId: string | null;
  ticketType: string | null;
  createdAt: Date | string | null;
  queueKind: "work_now" | "waiting" | "other";
  waitingSticker: WaitingSticker | null;
  waitingLabel: string | null;
  activeWorkAgeDays: number | null;
  escalationBand: EscalationBand;
  escalationOutline: "normal" | "amber" | "orange" | "red" | "alarm";
  escalationReason: string | null;
  clarificationNeeded: boolean;
};

const WAITING_LABELS: Record<WaitingSticker, string> = {
  waiting_for_parts: "Waiting for parts",
  customer_decision_needed: "Customer decision needed",
  ng_replacement_decision: "NG / replacement decision",
  ng_review_in_progress: "NG review in progress",
};

export function isBlockedWorkStatus(status: string | null | undefined): boolean {
  return !!status && (BLOCKED_WORK_STATUSES as readonly string[]).includes(status);
}

export function isTerminalWorkStatus(status: string | null | undefined): boolean {
  return !!status && (TERMINAL_WORK_STATUSES as readonly string[]).includes(status);
}

export function isWorkableStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return !isBlockedWorkStatus(status) && !isTerminalWorkStatus(status);
}

export function waitingStickerForStatus(status: string): WaitingSticker | null {
  if (status === "Pending Parts" || status === "Waiting on Parts") return "waiting_for_parts";
  if (status === STATUS_AWAITING_QUOTE_APPROVAL) return "customer_decision_needed";
  if (status === "Awaiting Customer Decision") return "ng_replacement_decision";
  if (status === "NG Review Pending") return "ng_review_in_progress";
  return null;
}

export function computeActiveWorkAgeDays(
  status: string,
  activeWorkStartedAt: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!isWorkableStatus(status)) return null;
  if (!activeWorkStartedAt) return 0;
  const start = new Date(activeWorkStartedAt).getTime();
  if (!Number.isFinite(start)) return 0;
  const days = Math.floor((now.getTime() - start) / MS_PER_DAY);
  return Math.max(0, days);
}

export function escalationBandForAge(ageDays: number | null): EscalationBand {
  if (ageDays == null) return 0;
  if (ageDays >= 7) return 4;
  if (ageDays === 6) return 3;
  if (ageDays === 5) return 2;
  if (ageDays === 4) return 1;
  return 0;
}

export function outlineForBand(band: EscalationBand): SafeTechnicianQueueJob["escalationOutline"] {
  if (band >= 4) return "alarm";
  if (band === 3) return "red";
  if (band === 2) return "orange";
  if (band === 1) return "amber";
  return "normal";
}

function priorityRank(priority: string | null | undefined): number {
  const p = (priority || "").toLowerCase();
  if (p === "critical") return 4;
  if (p === "high") return 3;
  if (p === "medium") return 2;
  if (p === "low") return 1;
  return 0;
}

export function compareWorkNowJobs(
  a: {
    id: string;
    priority?: string | null;
    activeWorkAgeDays?: number | null;
    escalationBand?: EscalationBand;
  },
  b: {
    id: string;
    priority?: string | null;
    activeWorkAgeDays?: number | null;
    escalationBand?: EscalationBand;
  },
): number {
  const bandA = a.escalationBand ?? escalationBandForAge(a.activeWorkAgeDays ?? null);
  const bandB = b.escalationBand ?? escalationBandForAge(b.activeWorkAgeDays ?? null);
  if (bandA !== bandB) return bandB - bandA;
  const pr = priorityRank(b.priority) - priorityRank(a.priority);
  if (pr !== 0) return pr;
  const ageA = a.activeWorkAgeDays ?? 0;
  const ageB = b.activeWorkAgeDays ?? 0;
  if (ageA !== ageB) return ageB - ageA;
  return String(a.id).localeCompare(String(b.id));
}

/**
 * Timer patch when status changes.
 * Resume after blocked → reset start + clear alert guard.
 * Entering workable from terminal/null with no start → seed start.
 * Blocked/terminal → no age clock change (frozen).
 */
export function activeWorkTimerPatch(
  fromStatus: string,
  toStatus: string,
  now: Date = new Date(),
): { activeWorkStartedAt?: Date | null; activeWorkAlertSentAt?: Date | null } {
  const fromBlocked = isBlockedWorkStatus(fromStatus);
  const toWorkable = isWorkableStatus(toStatus);
  const toBlocked = isBlockedWorkStatus(toStatus);
  const toTerminal = isTerminalWorkStatus(toStatus);

  if (toWorkable && fromBlocked) {
    return { activeWorkStartedAt: now, activeWorkAlertSentAt: null };
  }
  if (toWorkable && isTerminalWorkStatus(fromStatus)) {
    return { activeWorkStartedAt: now, activeWorkAlertSentAt: null };
  }
  if (toBlocked || toTerminal) {
    return {};
  }
  return {};
}

export function toSafeTechnicianQueueJob(
  job: any,
  opts: { includeCustomerPhone: boolean; now?: Date },
): SafeTechnicianQueueJob {
  const status = String(job.status || "");
  const sticker = waitingStickerForStatus(status);
  const age = computeActiveWorkAgeDays(status, job.activeWorkStartedAt, opts.now);
  const band = isWorkableStatus(status) ? escalationBandForAge(age) : 0;
  const outline = isWorkableStatus(status) ? outlineForBand(band) : "normal";
  const priority = job.priority || null;
  let queueKind: SafeTechnicianQueueJob["queueKind"] = "other";
  if (isWorkableStatus(status)) queueKind = "work_now";
  else if (sticker) queueKind = "waiting";

  let escalationReason: string | null = null;
  if (queueKind === "work_now") {
    const pri = priority || "Normal";
    const ageLabel = age == null ? "active 0 days" : `active ${age} day${age === 1 ? "" : "s"}`;
    escalationReason = `${pri} priority · ${ageLabel}`;
    if (band >= 4) escalationReason += " · Clarification needed";
  } else if (sticker) {
    escalationReason = WAITING_LABELS[sticker];
  }

  return {
    id: job.id,
    customer: job.customer ?? null,
    customerPhone: opts.includeCustomerPhone ? job.customerPhone ?? null : null,
    device: job.device ?? null,
    issue: job.issue ?? null,
    status,
    priority,
    technician: job.technician ?? null,
    assignedTechnicianId: job.assignedTechnicianId ?? null,
    inspectionResult: job.inspectionResult || "pending",
    inspectionNote: job.inspectionNote || null,
    inspectedBy: job.inspectedBy || null,
    inspectedAt: job.inspectedAt || null,
    initialStatus: job.initialStatus || null,
    problemFound: job.problemFound || null,
    reportedDefect: job.reportedDefect || null,
    corporateClientId: job.corporateClientId || null,
    batchId: job.batchId || null,
    ticketType: job.ticketType || "full_device",
    createdAt: job.createdAt ?? null,
    queueKind,
    waitingSticker: sticker,
    waitingLabel: sticker ? WAITING_LABELS[sticker] : null,
    activeWorkAgeDays: age,
    escalationBand: band,
    escalationOutline: outline,
    escalationReason,
    clarificationNeeded: band >= 4,
  };
}

export function buildTechnicianQueueResponse(
  jobs: any[],
  opts: { includeCustomerPhone: boolean; now?: Date },
) {
  const mapped = jobs.map((j) => toSafeTechnicianQueueJob(j, opts));
  const workNow = mapped
    .filter((j) => j.queueKind === "work_now")
    .sort(compareWorkNowJobs);
  const waiting = mapped
    .filter((j) => j.queueKind === "waiting")
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const other = mapped.filter((j) => j.queueKind === "other");

  return {
    items: [...workNow, ...waiting, ...other],
    workNow,
    waiting,
    kpis: {
      workNow: workNow.length,
      waiting: waiting.length,
      clarificationNeeded: workNow.filter((j) => j.clarificationNeeded).length,
    },
    total: mapped.length,
  };
}

/** Assert DTO has no detailed hold/parts leakage fields. */
export function assertNoHoldDetailLeak(dto: Record<string, unknown>): string[] {
  const forbidden = [
    "supplier",
    "partName",
    "part_name",
    "eta",
    "orderId",
    "order_id",
    "import",
    "cost",
    "quotePrice",
    "estimatedCost",
    "partsLineitems",
  ];
  return forbidden.filter((k) => k in dto && dto[k] != null);
}

/**
 * Pure CAS for tests: only the first claim against a null sentinel wins.
 * Mirrors DB: claim only when active_work_alert_sent_at IS NULL.
 */
export function casClaimActiveWorkAlert(
  previousSentAt: Date | string | null | undefined,
  nextSentAt: Date,
): { claimed: boolean; sentAt: Date | string | null } {
  if (previousSentAt != null) {
    return { claimed: false, sentAt: previousSentAt };
  }
  return { claimed: true, sentAt: nextSentAt };
}

type ClaimedAlertJob = {
  id: string;
  status: string;
  assignedTechnicianId: string | null;
  device: string | null;
  activeWorkStartedAt: Date | string | null;
};

/**
 * Exactly-once per job: FOR UPDATE SKIP LOCKED, eligibility under lock,
 * then notifications + sent mark in the same transaction (all-or-nothing).
 */
export async function claimAndNotifyActiveWorkAlertInTx(
  tx: any,
  jobId: string,
  now: Date,
): Promise<"notified" | "skipped"> {
  const locked = await tx.execute(sql`
    SELECT
      id,
      status,
      assigned_technician_id AS "assignedTechnicianId",
      device,
      active_work_started_at AS "activeWorkStartedAt",
      active_work_alert_sent_at AS "activeWorkAlertSentAt"
    FROM job_tickets
    WHERE id = ${jobId}
      AND active_work_alert_sent_at IS NULL
    FOR UPDATE SKIP LOCKED
  `);
  const row = ((locked as any).rows?.[0] ?? (locked as any)[0]) as
    | (ClaimedAlertJob & { activeWorkAlertSentAt: Date | string | null })
    | undefined;
  if (!row) return "skipped";

  const cas = casClaimActiveWorkAlert(row.activeWorkAlertSentAt, now);
  if (!cas.claimed) return "skipped";
  if (!isWorkableStatus(row.status)) return "skipped";
  const age = computeActiveWorkAgeDays(row.status, row.activeWorkStartedAt, now);
  if (age == null || age < 7) return "skipped";

  const title = "Job needs clarification";
  const baseMessage = `Job ${row.id} has been in continuous active work for ${age} days (${row.device || "device"}).`;

  const recipientIds: string[] = [];
  if (row.assignedTechnicianId) {
    recipientIds.push(row.assignedTechnicianId);
  } else {
    const managers = await tx
      .select({ id: users.id })
      .from(users)
      .where(inArray(users.role, ["Manager", "Super Admin"]));
    for (const m of managers) recipientIds.push(m.id);
  }
  if (recipientIds.length === 0) return "skipped";

  // Mark claim first under the same row lock, still inside the tx.
  // Concurrent workers that SKIP LOCKED or see non-null sent_at skip entirely.
  const updated = await tx
    .update(jobTickets)
    .set({ activeWorkAlertSentAt: now } as any)
    .where(and(eq(jobTickets.id, row.id), isNull(jobTickets.activeWorkAlertSentAt)))
    .returning({ id: jobTickets.id });
  if (!updated?.length) return "skipped";

  for (const userId of recipientIds) {
    await tx.insert(notifications).values({
      id: randomUUID(),
      userId,
      title,
      message: row.assignedTechnicianId ? baseMessage : `Unassigned ${baseMessage}`,
      type: "warning",
      link: row.assignedTechnicianId ? "/admin/workbench" : "/admin",
      jobId: row.id,
      contextType: "job_active_work",
      read: false,
    } as any);
  }

  return "notified";
}

export async function sweepActiveWorkAlerts(now: Date = new Date()): Promise<{
  notified: number;
  scanned: number;
}> {
  // Soft candidate scan (no lock). Each job is claimed transactionally below.
  const candidates = await db
    .select({
      id: jobTickets.id,
      status: jobTickets.status,
      activeWorkStartedAt: jobTickets.activeWorkStartedAt,
      activeWorkAlertSentAt: jobTickets.activeWorkAlertSentAt,
    })
    .from(jobTickets)
    .where(
      and(
        isNull(jobTickets.activeWorkAlertSentAt),
        sql`${jobTickets.activeWorkStartedAt} IS NOT NULL`,
      ),
    );

  let notified = 0;
  let scanned = 0;
  for (const job of candidates) {
    scanned++;
    if (!isWorkableStatus(job.status)) continue;
    const age = computeActiveWorkAgeDays(job.status, job.activeWorkStartedAt, now);
    if (age == null || age < 7) continue;

    const outcome = await db.transaction(async (tx) =>
      claimAndNotifyActiveWorkAlertInTx(tx, job.id, now),
    );
    if (outcome === "notified") notified++;
  }

  return { notified, scanned };
}

export function assertNotNgHoldTarget(status: string): void {
  if (isNgProtectedStatus(status) && status !== STATUS_AWAITING_QUOTE_APPROVAL) {
    // NG statuses remain protected elsewhere
  }
  if (status === "Awaiting Customer Decision" || status === "NG Review Pending") {
    throw Object.assign(new Error("Cannot use NG decision statuses for generic holds"), {
      status: 409,
      code: "NG_HOLD_FORBIDDEN",
    });
  }
}

/** True only if a job may enter generic Awaiting Quote Approval hold from this status. */
export function canEnterGenericWorkHoldFrom(status: string | null | undefined): boolean {
  return isWorkableStatus(status);
}
