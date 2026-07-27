/**
 * UNIFIED-OPS-01E — explicit attendance capabilities.
 * Do NOT use hasPermission("attendance") prefix for report vs check-in separation.
 */

export type AttendancePermBag = Record<string, boolean | undefined>;

/** Shop-wide Staff Attendance report (not self check-in). */
export function canViewAttendanceReport(
  user: { role?: string | null } | null | undefined,
  permissions: AttendancePermBag,
): boolean {
  if (user?.role === "Super Admin") return true;
  // Exact keys only — attendance.checkIn must not open the report.
  if (permissions["attendance.view"] === true) return true;
  if (permissions["reports.view"] === true) return true;
  if (permissions.reports === true) return true; // legacy reports:true
  if (permissions.attendance === true) return true; // legacy attendance:true → both capabilities
  return false;
}

/** My Shift / self check-in. */
export function canAttendanceCheckIn(
  user: { role?: string | null } | null | undefined,
  permissions: AttendancePermBag,
): boolean {
  if (user?.role === "Super Admin") return true;
  if (permissions["attendance.checkIn"] === true) return true;
  if (permissions.attendance === true) return true; // legacy attendance:true
  return false;
}
