/**
 * WORKFORCE-UX-01 — append-only attendance correction foundation.
 * Raw GPS check-in/out times and coordinates are never overwritten.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../db.js";
import {
  ATTENDANCE_CORRECTION_APPROVED,
  ATTENDANCE_CORRECTION_CANCELLED,
  ATTENDANCE_CORRECTION_PENDING,
  ATTENDANCE_CORRECTION_REJECTED,
  attendanceCorrectionRequests,
  attendanceRecords,
  notifications,
  type AttendanceCorrectionRequest,
  type AttendanceRecord,
} from "../../shared/schema.js";
import {
  assertTimesOnAttendanceDate,
  isCurrentCalendarMonthDhaka,
} from "./attendance-day.service.js";

export class AttendanceCorrectionError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AttendanceCorrectionError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const REASON_MIN = 5;
const REASON_MAX = 500;

/** Effective times for report/history consumers; raw GPS times stay authoritative for live shift. */
export function resolveEffectiveAttendanceTimes(record: {
  checkInTime: Date | string;
  checkOutTime?: Date | string | null;
  effectiveCheckInTime?: Date | string | null;
  effectiveCheckOutTime?: Date | string | null;
}) {
  return {
    checkInTime: record.effectiveCheckInTime ?? record.checkInTime,
    checkOutTime:
      record.effectiveCheckOutTime !== undefined && record.effectiveCheckOutTime !== null
        ? record.effectiveCheckOutTime
        : record.checkOutTime ?? null,
    isCorrected: !!(record.effectiveCheckInTime || record.effectiveCheckOutTime),
  };
}

/** Asia/Dhaka calendar month of `now` — browser TZ never authoritative. */
export function isCurrentCalendarMonth(dateStr: string, now: Date = new Date()): boolean {
  return isCurrentCalendarMonthDhaka(dateStr, now);
}

export function parseProposedTime(raw: unknown, field: string): Date {
  if (raw == null || raw === "") {
    throw new AttendanceCorrectionError(400, "INVALID_TIME", `${field} is required.`);
  }
  const d = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(d.getTime())) {
    throw new AttendanceCorrectionError(400, "INVALID_TIME", `${field} is not a valid timestamp.`);
  }
  return d;
}

export function assertValidTimePair(checkIn: Date, checkOut: Date | null): void {
  if (checkOut && checkOut.getTime() < checkIn.getTime()) {
    throw new AttendanceCorrectionError(
      400,
      "IMPOSSIBLE_TIME",
      "Check-out cannot be before check-in.",
    );
  }
}

function assertReason(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new AttendanceCorrectionError(400, "REASON_REQUIRED", "Request reason is required.");
  }
  const reason = raw.trim();
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    throw new AttendanceCorrectionError(
      400,
      "INVALID_REASON",
      `Reason must be ${REASON_MIN}–${REASON_MAX} characters.`,
    );
  }
  return reason;
}

export function toCorrectionDto(row: AttendanceCorrectionRequest) {
  return {
    id: row.id,
    attendanceRecordId: row.attendanceRecordId,
    requesterUserId: row.requesterUserId,
    status: row.status,
    originalCheckInTime: row.originalCheckInTime,
    originalCheckOutTime: row.originalCheckOutTime,
    proposedCheckInTime: row.proposedCheckInTime,
    proposedCheckOutTime: row.proposedCheckOutTime,
    requestReason: row.requestReason,
    reviewerUserId: row.reviewerUserId,
    reviewedAt: row.reviewedAt,
    reviewReason: row.reviewReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createCorrectionRequest(args: {
  attendanceRecordId: string;
  requesterUserId: string;
  proposedCheckInTime: unknown;
  proposedCheckOutTime?: unknown;
  requestReason: unknown;
  now?: Date;
}): Promise<AttendanceCorrectionRequest> {
  const now = args.now ?? new Date();
  const [record] = await db
    .select()
    .from(attendanceRecords)
    .where(eq(attendanceRecords.id, args.attendanceRecordId))
    .limit(1);
  if (!record) {
    throw new AttendanceCorrectionError(404, "RECORD_NOT_FOUND", "Attendance record not found.");
  }
  if (record.userId !== args.requesterUserId) {
    throw new AttendanceCorrectionError(403, "NOT_OWNER", "You can only request corrections on your own attendance.");
  }
  if (!isCurrentCalendarMonth(record.date, now)) {
    throw new AttendanceCorrectionError(
      400,
      "MONTH_CLOSED",
      "Corrections are only allowed through the end of the attendance calendar month.",
    );
  }

  const proposedIn = parseProposedTime(args.proposedCheckInTime, "proposedCheckInTime");
  let proposedOut: Date | null = null;
  if (args.proposedCheckOutTime !== undefined && args.proposedCheckOutTime !== null && args.proposedCheckOutTime !== "") {
    proposedOut = parseProposedTime(args.proposedCheckOutTime, "proposedCheckOutTime");
  } else if (record.checkOutTime) {
    // If record has checkout, require explicit proposed out or allow null to mean "clear"? Plan: proposed values.
    // Allow null proposed out only when original had no out.
    proposedOut = null;
  }
  // If original has checkout and client omits proposed out, keep requiring explicit pair when both proposed
  if (record.checkOutTime && !proposedOut && args.proposedCheckOutTime === undefined) {
    throw new AttendanceCorrectionError(
      400,
      "CHECKOUT_REQUIRED",
      "proposedCheckOutTime is required when the record has a check-out.",
    );
  }
  assertValidTimePair(proposedIn, proposedOut);
  try {
    assertTimesOnAttendanceDate(record.date, proposedIn, proposedOut);
  } catch (e: any) {
    if (e?.code === "CROSS_DAY_TIME") {
      throw new AttendanceCorrectionError(400, "CROSS_DAY_TIME", e.message);
    }
    throw e;
  }
  const reason = assertReason(args.requestReason);

  try {
    const [created] = await db
      .insert(attendanceCorrectionRequests)
      .values({
        id: randomUUID(),
        attendanceRecordId: record.id,
        requesterUserId: args.requesterUserId,
        status: ATTENDANCE_CORRECTION_PENDING,
        originalCheckInTime: new Date(record.checkInTime),
        originalCheckOutTime: record.checkOutTime ? new Date(record.checkOutTime) : null,
        proposedCheckInTime: proposedIn,
        proposedCheckOutTime: proposedOut,
        requestReason: reason,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return created;
  } catch (e: any) {
    const msg = String(e?.message || e);
    if (msg.includes("uidx_attendance_correction_one_pending") || msg.includes("unique")) {
      throw new AttendanceCorrectionError(
        409,
        "PENDING_EXISTS",
        "A pending correction request already exists for this attendance record.",
      );
    }
    throw e;
  }
}

export async function listMyCorrections(requesterUserId: string): Promise<AttendanceCorrectionRequest[]> {
  return db
    .select()
    .from(attendanceCorrectionRequests)
    .where(eq(attendanceCorrectionRequests.requesterUserId, requesterUserId))
    .orderBy(desc(attendanceCorrectionRequests.createdAt));
}

export async function cancelMyCorrection(
  requestId: string,
  requesterUserId: string,
): Promise<AttendanceCorrectionRequest> {
  return db.transaction(async (tx) => {
    const locked = await tx.execute(sql`
      SELECT id, status, requester_user_id AS "requesterUserId"
      FROM attendance_correction_requests
      WHERE id = ${requestId}
      FOR UPDATE
    `);
    const row = ((locked as any).rows?.[0] ?? (locked as any)[0]) as
      | { id: string; status: string; requesterUserId: string }
      | undefined;
    if (!row) {
      throw new AttendanceCorrectionError(404, "REQUEST_NOT_FOUND", "Correction request not found.");
    }
    if (row.requesterUserId !== requesterUserId) {
      throw new AttendanceCorrectionError(403, "NOT_OWNER", "You can only cancel your own requests.");
    }
    if (row.status !== ATTENDANCE_CORRECTION_PENDING) {
      throw new AttendanceCorrectionError(409, "NOT_PENDING", "Only pending requests can be cancelled.");
    }
    const [updated] = await tx
      .update(attendanceCorrectionRequests)
      .set({
        status: ATTENDANCE_CORRECTION_CANCELLED,
        updatedAt: new Date(),
      })
      .where(eq(attendanceCorrectionRequests.id, requestId))
      .returning();
    return updated;
  });
}

export async function listPendingCorrectionsForManagers(): Promise<
  Array<AttendanceCorrectionRequest & { attendanceDate?: string; userName?: string }>
> {
  const rows = await db
    .select({
      correction: attendanceCorrectionRequests,
      attendanceDate: attendanceRecords.date,
      userName: attendanceRecords.userName,
    })
    .from(attendanceCorrectionRequests)
    .innerJoin(
      attendanceRecords,
      eq(attendanceCorrectionRequests.attendanceRecordId, attendanceRecords.id),
    )
    .where(eq(attendanceCorrectionRequests.status, ATTENDANCE_CORRECTION_PENDING))
    .orderBy(desc(attendanceCorrectionRequests.createdAt));

  return rows.map((r) => ({
    ...r.correction,
    attendanceDate: r.attendanceDate,
    userName: r.userName,
  }));
}

export async function reviewCorrection(args: {
  requestId: string;
  reviewerUserId: string;
  decision: "approve" | "reject";
  reviewReason?: unknown;
}): Promise<AttendanceCorrectionRequest> {
  if (args.decision !== "approve" && args.decision !== "reject") {
    throw new AttendanceCorrectionError(400, "INVALID_DECISION", "decision must be approve or reject.");
  }

  return db.transaction(async (tx) => {
    const locked = await tx.execute(sql`
      SELECT
        id,
        attendance_record_id AS "attendanceRecordId",
        requester_user_id AS "requesterUserId",
        status,
        proposed_check_in_time AS "proposedCheckInTime",
        proposed_check_out_time AS "proposedCheckOutTime",
        request_reason AS "requestReason"
      FROM attendance_correction_requests
      WHERE id = ${args.requestId}
      FOR UPDATE
    `);
    const row = ((locked as any).rows?.[0] ?? (locked as any)[0]) as
      | {
          id: string;
          attendanceRecordId: string;
          requesterUserId: string;
          status: string;
          proposedCheckInTime: Date;
          proposedCheckOutTime: Date | null;
          requestReason: string;
        }
      | undefined;

    if (!row) {
      throw new AttendanceCorrectionError(404, "REQUEST_NOT_FOUND", "Correction request not found.");
    }
    if (row.status !== ATTENDANCE_CORRECTION_PENDING) {
      throw new AttendanceCorrectionError(409, "ALREADY_REVIEWED", "This request was already reviewed.");
    }
    if (row.requesterUserId === args.reviewerUserId) {
      throw new AttendanceCorrectionError(403, "SELF_REVIEW_FORBIDDEN", "You cannot review your own correction request.");
    }

    const now = new Date();
    let reviewReason: string | null = null;
    if (args.decision === "reject") {
      if (typeof args.reviewReason !== "string" || !args.reviewReason.trim()) {
        throw new AttendanceCorrectionError(400, "REVIEW_REASON_REQUIRED", "Rejection reason is required.");
      }
      reviewReason = args.reviewReason.trim().slice(0, REASON_MAX);
    } else if (typeof args.reviewReason === "string" && args.reviewReason.trim()) {
      reviewReason = args.reviewReason.trim().slice(0, REASON_MAX);
    }

    const nextStatus =
      args.decision === "approve" ? ATTENDANCE_CORRECTION_APPROVED : ATTENDANCE_CORRECTION_REJECTED;

    const [updated] = await tx
      .update(attendanceCorrectionRequests)
      .set({
        status: nextStatus,
        reviewerUserId: args.reviewerUserId,
        reviewedAt: now,
        reviewReason,
        updatedAt: now,
      })
      .where(
        and(
          eq(attendanceCorrectionRequests.id, args.requestId),
          eq(attendanceCorrectionRequests.status, ATTENDANCE_CORRECTION_PENDING),
        ),
      )
      .returning();

    if (!updated) {
      throw new AttendanceCorrectionError(409, "ALREADY_REVIEWED", "This request was already reviewed.");
    }

    if (args.decision === "approve") {
      const proposedIn = new Date(row.proposedCheckInTime);
      const proposedOut = row.proposedCheckOutTime ? new Date(row.proposedCheckOutTime) : null;
      assertValidTimePair(proposedIn, proposedOut);

      // Overlay only — never touch raw check_in_time / check_out_time / GPS columns
      await tx
        .update(attendanceRecords)
        .set({
          effectiveCheckInTime: proposedIn,
          effectiveCheckOutTime: proposedOut,
        } as any)
        .where(eq(attendanceRecords.id, row.attendanceRecordId));
    }

    // Notification in same transaction (decision + overlay + notify atomic)
    await tx.insert(notifications).values({
      id: randomUUID(),
      userId: row.requesterUserId,
      title:
        args.decision === "approve"
          ? "Attendance correction approved"
          : "Attendance correction rejected",
      message:
        args.decision === "approve"
          ? "Your attendance correction was approved. Effective times are updated for reports."
          : `Your attendance correction was rejected${reviewReason ? `: ${reviewReason}` : "."}`,
      type: args.decision === "approve" ? "success" : "warning",
      link: "/admin/attendance",
      contextType: "attendance_correction",
      read: false,
    } as any);

    return updated;
  });
}

/** Pure helpers for tests */
export function assertRawEvidencePreserved(
  before: Pick<AttendanceRecord, "checkInTime" | "checkOutTime" | "checkInLat" | "checkInLng">,
  after: Pick<AttendanceRecord, "checkInTime" | "checkOutTime" | "checkInLat" | "checkInLng">,
): boolean {
  return (
    new Date(before.checkInTime).getTime() === new Date(after.checkInTime).getTime() &&
    String(before.checkOutTime ?? "") === String(after.checkOutTime ?? "") &&
    before.checkInLat === after.checkInLat &&
    before.checkInLng === after.checkInLng
  );
}
