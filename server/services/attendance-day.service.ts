/**
 * WORKFORCE-UX-01 — Asia/Dhaka attendance day + daily check-in gate helpers.
 * Browser/phone time is never authoritative for the gate date.
 */

export const ATTENDANCE_TZ = "Asia/Dhaka";
export const ATTENDANCE_CHECK_IN_REQUIRED = "ATTENDANCE_CHECK_IN_REQUIRED" as const;

/** Roles subject to the daily check-in gate (Super Admin is explicitly exempt). */
export const ATTENDANCE_GATE_ROLES = [
  "Technician",
  "Manager",
  "Cashier",
  "Driver",
] as const;

export type AttendanceGateRole = (typeof ATTENDANCE_GATE_ROLES)[number];

export function isAttendanceGateRole(role: string | null | undefined): boolean {
  return !!role && (ATTENDANCE_GATE_ROLES as readonly string[]).includes(role);
}

/** Calendar date YYYY-MM-DD in Asia/Dhaka for an instant. */
export function getAttendanceDateDhaka(instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ATTENDANCE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

/** YYYY-MM of an attendance date string (YYYY-MM-DD). */
export function attendanceYearMonth(dateStr: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  return dateStr.slice(0, 7);
}

/** True when dateStr falls in the Asia/Dhaka calendar month of `now`. */
export function isCurrentCalendarMonthDhaka(dateStr: string, now: Date = new Date()): boolean {
  const ym = attendanceYearMonth(dateStr);
  if (!ym) return false;
  return ym === attendanceYearMonth(getAttendanceDateDhaka(now));
}

/**
 * Proposed correction times must stay on the attendance record's calendar date (Asia/Dhaka).
 * Rejects cross-day moves and fabricated future/other-day timestamps.
 */
export function assertTimesOnAttendanceDate(
  attendanceDate: string,
  checkIn: Date,
  checkOut: Date | null,
): void {
  const inDay = getAttendanceDateDhaka(checkIn);
  if (inDay !== attendanceDate) {
    throw Object.assign(new Error("Proposed check-in must stay on the attendance calendar date."), {
      name: "AttendanceDayError",
      status: 400,
      code: "CROSS_DAY_TIME",
    });
  }
  if (checkOut) {
    const outDay = getAttendanceDateDhaka(checkOut);
    if (outDay !== attendanceDate) {
      throw Object.assign(new Error("Proposed check-out must stay on the attendance calendar date."), {
        name: "AttendanceDayError",
        status: 400,
        code: "CROSS_DAY_TIME",
      });
    }
  }
}

export type GateStatusReason =
  | "super_admin_exempt"
  | "role_not_gated"
  | "check_in_permission_absent"
  | "checked_in"
  | "check_in_required";

export interface AttendanceGateStatus {
  date: string;
  timezone: typeof ATTENDANCE_TZ;
  required: boolean;
  checkedIn: boolean;
  exempt: boolean;
  reason: GateStatusReason;
  recordId: string | null;
}

/**
 * True only when the daily gate may block the user — requires an attendance DB lookup.
 * Super Admin, non-gate roles, and users without attendance.checkIn must not hit attendance tables.
 */
export function needsAttendanceGateLookup(args: {
  role: string;
  hasCheckInPermission: boolean;
}): boolean {
  if (args.role === "Super Admin") return false;
  if (!isAttendanceGateRole(args.role)) return false;
  if (!args.hasCheckInPermission) return false;
  return true;
}

/**
 * Daily gate applies only when BOTH:
 * - role is Technician | Manager | Cashier | Driver
 * - effective attendance.checkIn permission is present
 * Super Admin is always exempt. A gated-role user without checkIn must not be locked
 * (they cannot complete check-in and would otherwise be permanently blocked).
 */
export function evaluateAttendanceGate(args: {
  role: string;
  /** Effective attendance.checkIn (via userHasGranularPermission / getEffectivePermissionsForUser). */
  hasCheckInPermission: boolean;
  todayRecord: { id: string } | null | undefined;
  now?: Date;
}): AttendanceGateStatus {
  const date = getAttendanceDateDhaka(args.now ?? new Date());
  const checkedIn = !!args.todayRecord;

  if (args.role === "Super Admin") {
    return {
      date,
      timezone: ATTENDANCE_TZ,
      required: false,
      checkedIn,
      exempt: true,
      reason: "super_admin_exempt",
      recordId: args.todayRecord?.id ?? null,
    };
  }

  if (!isAttendanceGateRole(args.role)) {
    return {
      date,
      timezone: ATTENDANCE_TZ,
      required: false,
      checkedIn,
      exempt: true,
      reason: "role_not_gated",
      recordId: args.todayRecord?.id ?? null,
    };
  }

  // Gated operational role without checkIn capability: do not enforce daily gate
  if (!args.hasCheckInPermission) {
    return {
      date,
      timezone: ATTENDANCE_TZ,
      required: false,
      checkedIn,
      exempt: true,
      reason: "check_in_permission_absent",
      recordId: args.todayRecord?.id ?? null,
    };
  }

  if (checkedIn) {
    return {
      date,
      timezone: ATTENDANCE_TZ,
      required: false,
      checkedIn: true,
      exempt: false,
      reason: "checked_in",
      recordId: args.todayRecord!.id,
    };
  }

  return {
    date,
    timezone: ATTENDANCE_TZ,
    required: true,
    checkedIn: false,
    exempt: false,
    reason: "check_in_required",
    recordId: null,
  };
}

/** Paths that must remain reachable without today's check-in (auth, status, check-in flow, mobile bootstrap). */
export function isAttendanceGateExemptPath(pathname: string): boolean {
  const p = pathname.split("?")[0] || "";
  if (
    p === "/api/admin/login" ||
    p === "/api/admin/logout" ||
    p === "/api/admin/me" ||
    p === "/api/admin/csrf-token" ||
    p === "/api/admin/pin/set" ||
    p === "/api/admin/pin/verify" ||
    p === "/api/admin/attendance/gate-status" ||
    p === "/api/admin/attendance/today" ||
    p === "/api/admin/attendance/check-in" ||
    p === "/api/admin/attendance/check-out" ||
    p === "/api/mobile/bootstrap"
  ) {
    return true;
  }
  if (p.startsWith("/api/mobile/attendance")) return true;
  if (p.startsWith("/api/admin/firebase")) return true;
  if (p.startsWith("/api/firebase")) return true;
  // Minimal notification bootstrap for shell (read-only list/unread)
  if (p === "/api/admin/notifications" || p === "/api/admin/notifications/unread") return true;
  return false;
}

export function buildCheckInRequiredBody(date: string) {
  return {
    error: "You haven't checked in today. Give attendance before continuing.",
    code: ATTENDANCE_CHECK_IN_REQUIRED,
    date,
    timezone: ATTENDANCE_TZ,
  };
}

export interface AttendanceMonthSummaryResult {
  presentDays: number;
  absentDays: number;
  eligibleDays: number;
  daysInMonth: number;
  calendarDays: number;
  ratio: number;
}

/**
 * WORKFORCE-UX-01 — monthly attendance summary for a selected staff member.
 * `eligibleDays` is the elapsed-day denominator (past = full month, current =
 * current Dhaka day, future = 0). `daysInMonth`/`calendarDays` are the actual
 * calendar length and stay separate from elapsed days. Future records are
 * never counted as present.
 */
export function computeAttendanceMonthSummary(args: {
  selectedMonth: string;
  todayDhaka: string;
  records: readonly { date: string }[];
}): AttendanceMonthSummaryResult {
  const { selectedMonth, todayDhaka, records } = args;
  const [year, mon] = selectedMonth.split("-").map(Number);
  const calendarDays = new Date(year, mon, 0).getDate();
  const currentMonthStr = todayDhaka.slice(0, 7);
  let eligibleDays: number;
  if (selectedMonth > currentMonthStr) {
    eligibleDays = 0;
  } else if (selectedMonth === currentMonthStr) {
    eligibleDays = Math.min(parseInt(todayDhaka.slice(8, 10), 10), calendarDays);
  } else {
    eligibleDays = calendarDays;
  }
  const pastRecords = records.filter((r) => r.date <= todayDhaka);
  const presentDays = eligibleDays > 0 ? pastRecords.length : 0;
  const absentDays = Math.max(0, eligibleDays - presentDays);
  const ratio = eligibleDays > 0 ? Math.round((presentDays / eligibleDays) * 100) : 0;
  return {
    presentDays,
    absentDays,
    eligibleDays,
    daysInMonth: calendarDays,
    calendarDays,
    ratio,
  };
}

export interface AttendanceMonthResponseResult<R> {
  userId: string;
  month: string;
  records: R[];
  summary: AttendanceMonthSummaryResult;
}

/**
 * WORKFORCE-UX-01 — builds the full `GET /api/admin/attendance/user/:userId/month`
 * response body. A future-dated attendance row is filtered out of `records` so
 * it never appears in the API response and never renders as Present in the
 * calendar. The same filtered set feeds `computeAttendanceMonthSummary`.
 */
export function buildAttendanceMonthResponse<R extends { date: string }>(args: {
  userId: string;
  selectedMonth: string;
  todayDhaka: string;
  records: readonly R[];
}): AttendanceMonthResponseResult<R> {
  const { userId, selectedMonth, todayDhaka, records } = args;
  const responseRecords = records.filter((record) => record.date <= todayDhaka);
  const summary = computeAttendanceMonthSummary({ selectedMonth, todayDhaka, records: responseRecords });
  return { userId, month: selectedMonth, records: responseRecords, summary };
}
