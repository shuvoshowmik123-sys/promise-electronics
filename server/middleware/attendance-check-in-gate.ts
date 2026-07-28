/**
 * WORKFORCE-UX-01 — server-enforced daily attendance gate.
 * After session identity is known; blocks protected staff APIs until check-in.
 * No scheduler. Super Admin exempt.
 * Eligibility: gated role (Technician|Manager|Cashier|Driver) AND effective attendance.checkIn.
 *
 * Attendance DB is consulted only for eligible staff. Super Admin / ungated roles /
 * users without checkIn pass through without attendance repository I/O so a DB
 * failure cannot 503 exempt principals.
 */

import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage.js";
import { attendanceRepo } from "../repositories/index.js";
import { userHasGranularPermission } from "../routes/middleware/auth.js";
import {
  buildCheckInRequiredBody,
  evaluateAttendanceGate,
  getAttendanceDateDhaka,
  isAttendanceGateExemptPath,
  needsAttendanceGateLookup,
} from "../services/attendance-day.service.js";

export async function attendanceCheckInGateMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const adminUserId = req.session?.adminUserId;
    if (!adminUserId) {
      next();
      return;
    }

    const path = req.path || req.url || "";
    if (isAttendanceGateExemptPath(path)) {
      next();
      return;
    }

    // Only gate admin/mobile staff operational APIs
    if (!path.startsWith("/api/admin") && !path.startsWith("/api/mobile")) {
      next();
      return;
    }

    const user =
      (req as Request & { user?: { id: string; role: string; permissions?: string | null } }).user ??
      (await storage.getUser(adminUserId));
    if (!user) {
      next();
      return;
    }

    const hasCheckInPermission = userHasGranularPermission(user, "attendance.checkIn");

    // Exempt before any attendance DB I/O — Super Admin, non-gate roles, no checkIn permission
    if (!needsAttendanceGateLookup({ role: user.role, hasCheckInPermission })) {
      next();
      return;
    }

    // Eligible staff only: fail-closed on attendance lookup errors (503)
    const today = getAttendanceDateDhaka();
    let record: { id: string } | null = null;
    try {
      const row = await attendanceRepo.getTodayAttendanceForUser(user.id, today);
      record = row ?? null;
    } catch (lookupError) {
      console.error(
        "[AttendanceGate] attendance lookup failed for gated user:",
        (lookupError as Error).message,
      );
      res.status(503).json({
        error: "Attendance gate temporarily unavailable",
        code: "ATTENDANCE_GATE_UNAVAILABLE",
      });
      return;
    }

    const status = evaluateAttendanceGate({
      role: user.role,
      hasCheckInPermission,
      todayRecord: record,
    });

    if (status.required) {
      res.status(412).json(buildCheckInRequiredBody(status.date));
      return;
    }

    next();
  } catch (error) {
    console.error("[AttendanceGate] middleware error:", (error as Error).message);
    // Fail-closed only after we could not complete identity/eligibility safely
    res.status(503).json({
      error: "Attendance gate temporarily unavailable",
      code: "ATTENDANCE_GATE_UNAVAILABLE",
    });
  }
}
