export const ATTENDANCE_TZ_SHARED = "Asia/Dhaka";

export function getAttendanceDateDhaka(instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ATTENDANCE_TZ_SHARED,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export function isFutureAttendanceDate(dateStr: string): boolean {
  return dateStr > getAttendanceDateDhaka();
}

export function hasAttendanceCorrection(record: {
  effectiveCheckInTime?: Date | string | null;
  effectiveCheckOutTime?: Date | string | null;
}): boolean {
  return !!(record.effectiveCheckInTime || record.effectiveCheckOutTime);
}
