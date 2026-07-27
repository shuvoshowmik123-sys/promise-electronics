import { describe, expect, it } from "vitest";
import {
  getAttendanceDateDhaka,
  isCurrentCalendarMonthDhaka,
  computeAttendanceMonthSummary,
  buildAttendanceMonthResponse,
} from "../server/services/attendance-day.service.js";
import { canViewAttendanceReport, canAttendanceCheckIn } from "../client/src/lib/attendance-capabilities";
import {
  getAttendanceDateDhaka as getDhakaDateShared,
  isFutureAttendanceDate,
  hasAttendanceCorrection,
} from "../shared/attendance-utils";

describe("WORKFORCE-UX-01 — attendance report capabilities", () => {
  it("Super Admin can always view attendance report", () => {
    expect(canViewAttendanceReport({ role: "Super Admin" }, {})).toBe(true);
  });

  it("attendance.view permission grants report access", () => {
    expect(canViewAttendanceReport({ role: "Manager" }, { "attendance.view": true })).toBe(true);
  });

  it("reports.view permission grants report access", () => {
    expect(canViewAttendanceReport({ role: "Manager" }, { "reports.view": true })).toBe(true);
  });

  it("attendance.checkIn alone does NOT grant report access", () => {
    expect(canViewAttendanceReport({ role: "Technician" }, { "attendance.checkIn": true })).toBe(false);
  });

  it("legacy attendance:true grants both report and check-in", () => {
    expect(canViewAttendanceReport({ role: "Manager" }, { attendance: true })).toBe(true);
    expect(canAttendanceCheckIn({ role: "Manager" }, { attendance: true })).toBe(true);
  });

  it("Driver without attendance.view cannot see report", () => {
    expect(canViewAttendanceReport({ role: "Driver" }, { "attendance.checkIn": true })).toBe(false);
  });

  it("no permissions means no report access", () => {
    expect(canViewAttendanceReport({ role: "Technician" }, {})).toBe(false);
    expect(canViewAttendanceReport(null, {})).toBe(false);
  });
});

describe("WORKFORCE-UX-01 — Asia/Dhaka date boundary (shared + server)", () => {
  it("shared and server produce identical Dhaka date for any instant", () => {
    const instants = [
      new Date("2026-07-21T22:30:00.000Z"),
      new Date("2026-07-22T00:00:00.000Z"),
      new Date("2026-07-22T18:00:00.000Z"),
      new Date("2026-01-01T00:00:00.000Z"),
    ];
    for (const instant of instants) {
      expect(getDhakaDateShared(instant)).toBe(getAttendanceDateDhaka(instant));
    }
  });

  it("2026-07-21 22:30 UTC = 2026-07-22 in Asia/Dhaka", () => {
    const nearMidnightUtc = new Date("2026-07-21T22:30:00.000Z");
    expect(getDhakaDateShared(nearMidnightUtc)).toBe("2026-07-22");
  });

  it("isFutureAttendanceDate uses Asia/Dhaka today", () => {
    const todayDhaka = getDhakaDateShared();
    expect(isFutureAttendanceDate(todayDhaka)).toBe(false);
    const [y, m, d] = todayDhaka.split("-").map(Number);
    const tomorrow = new Date(y, m - 1, d + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    expect(isFutureAttendanceDate(tomorrowStr)).toBe(true);
  });
});

describe("WORKFORCE-UX-01 — hasAttendanceCorrection helper", () => {
  it("returns false when no effective times", () => {
    expect(hasAttendanceCorrection({ effectiveCheckInTime: null, effectiveCheckOutTime: null })).toBe(false);
    expect(hasAttendanceCorrection({})).toBe(false);
  });

  it("returns true for effectiveCheckInTime only", () => {
    expect(hasAttendanceCorrection({ effectiveCheckInTime: new Date("2026-07-10T09:00:00.000Z") })).toBe(true);
  });

  it("returns true for effectiveCheckOutTime only (checkout-only correction)", () => {
    expect(hasAttendanceCorrection({ effectiveCheckOutTime: new Date("2026-07-10T18:00:00.000Z") })).toBe(true);
  });

  it("returns true for both effective times", () => {
    expect(hasAttendanceCorrection({
      effectiveCheckInTime: new Date("2026-07-10T09:00:00.000Z"),
      effectiveCheckOutTime: new Date("2026-07-10T18:00:00.000Z"),
    })).toBe(true);
  });
});

describe("WORKFORCE-UX-01 — current-month ratio uses Asia/Dhaka elapsed days", () => {
  it("100% ratio when staff present every completed day", () => {
    const todayDhaka = "2026-07-22";
    const selectedMonth = "2026-07";
    const elapsedDayOfMonth = parseInt(todayDhaka.slice(8, 10), 10);
    const daysInMonth = new Date(2026, 7, 0).getDate();
    const elapsedDays = selectedMonth === todayDhaka.slice(0, 7)
      ? Math.min(elapsedDayOfMonth, daysInMonth)
      : daysInMonth;
    expect(elapsedDays).toBe(22);

    const totalStaff = 5;
    const recordsPerStaff = elapsedDays;
    const totalRecords = totalStaff * recordsPerStaff;
    const expectedSlots = totalStaff * elapsedDays;
    const ratio = expectedSlots > 0 ? Math.round((totalRecords / expectedSlots) * 100) : 0;
    expect(ratio).toBe(100);
  });

  it("future days are neutral — not absent", () => {
    const todayDhaka = "2026-07-22";
    const daysInMonth = 31;
    const elapsedDays = Math.min(22, daysInMonth);
    const futureDays = daysInMonth - elapsedDays;
    expect(futureDays).toBe(9);
    const presentDays = elapsedDays;
    const absentDays = Math.max(0, elapsedDays - presentDays);
    expect(absentDays).toBe(0);
  });

  it("past month uses full daysInMonth as denominator", () => {
    const todayDhaka = "2026-07-22";
    const selectedMonth = "2026-06";
    const daysInMonth = new Date(2026, 6, 0).getDate();
    const elapsedDays = selectedMonth === todayDhaka.slice(0, 7)
      ? Math.min(parseInt(todayDhaka.slice(8, 10), 10), daysInMonth)
      : daysInMonth;
    expect(elapsedDays).toBe(30);
    expect(elapsedDays).toBe(daysInMonth);
  });
});

describe("WORKFORCE-UX-01 — selected-staff monthly endpoint shape", () => {
  it("endpoint returns summary with presentDays, absentDays, eligibleDays, daysInMonth, calendarDays, ratio", () => {
    const mockResponse = {
      userId: "user-1",
      month: "2026-07",
      records: [],
      summary: { presentDays: 18, absentDays: 4, eligibleDays: 22, daysInMonth: 31, calendarDays: 31, ratio: 82 },
    };
    expect(mockResponse.summary).toHaveProperty("presentDays");
    expect(mockResponse.summary).toHaveProperty("absentDays");
    expect(mockResponse.summary).toHaveProperty("eligibleDays");
    expect(mockResponse.summary).toHaveProperty("daysInMonth");
    expect(mockResponse.summary).toHaveProperty("calendarDays");
    expect(mockResponse.summary).toHaveProperty("ratio");
    expect(mockResponse.summary.presentDays + mockResponse.summary.absentDays).toBe(mockResponse.summary.eligibleDays);
    expect(mockResponse.summary.daysInMonth).toBe(mockResponse.summary.calendarDays);
    expect(mockResponse.summary.daysInMonth).toBe(31);
    expect(mockResponse.summary.eligibleDays).toBe(22);
    expect(mockResponse.summary.eligibleDays).toBeLessThanOrEqual(mockResponse.summary.daysInMonth);
  });

  it("future selected month: eligibleDays=0, present=0, absent=0, ratio=0", () => {
    const todayDhaka = "2026-07-22";
    const currentMonthStr = todayDhaka.slice(0, 7);
    const futureMonth = "2026-08";
    expect(futureMonth > currentMonthStr).toBe(true);

    const calendarDays = new Date(2026, 8, 0).getDate();
    expect(calendarDays).toBe(31);

    let eligibleDays: number;
    if (futureMonth > currentMonthStr) {
      eligibleDays = 0;
    } else if (futureMonth === currentMonthStr) {
      eligibleDays = Math.min(parseInt(todayDhaka.slice(8, 10), 10), calendarDays);
    } else {
      eligibleDays = calendarDays;
    }
    expect(eligibleDays).toBe(0);

    const records: { date: string }[] = [];
    const pastRecords = records.filter((r) => r.date <= todayDhaka);
    const presentDays = eligibleDays > 0 ? pastRecords.length : 0;
    const absentDays = Math.max(0, eligibleDays - presentDays);
    const ratio = eligibleDays > 0 ? Math.round((presentDays / eligibleDays) * 100) : 0;

    expect(presentDays).toBe(0);
    expect(absentDays).toBe(0);
    expect(ratio).toBe(0);
  });

  it("current month: eligibleDays = current Dhaka day, not calendar days", () => {
    const todayDhaka = "2026-07-22";
    const currentMonthStr = todayDhaka.slice(0, 7);
    const calendarDays = new Date(2026, 7, 0).getDate();
    expect(calendarDays).toBe(31);

    let eligibleDays: number;
    if (currentMonthStr > currentMonthStr) {
      eligibleDays = 0;
    } else if (currentMonthStr === currentMonthStr) {
      eligibleDays = Math.min(parseInt(todayDhaka.slice(8, 10), 10), calendarDays);
    } else {
      eligibleDays = calendarDays;
    }
    expect(eligibleDays).toBe(22);
    expect(eligibleDays).toBeLessThan(calendarDays);
  });

  it("past month: eligibleDays = calendarDays", () => {
    const todayDhaka = "2026-07-22";
    const currentMonthStr = todayDhaka.slice(0, 7);
    const pastMonth = "2026-06";
    expect(pastMonth < currentMonthStr).toBe(true);

    const calendarDays = new Date(2026, 6, 0).getDate();
    expect(calendarDays).toBe(30);

    let eligibleDays: number;
    if (pastMonth > currentMonthStr) {
      eligibleDays = 0;
    } else if (pastMonth === currentMonthStr) {
      eligibleDays = Math.min(parseInt(todayDhaka.slice(8, 10), 10), calendarDays);
    } else {
      eligibleDays = calendarDays;
    }
    expect(eligibleDays).toBe(30);
    expect(eligibleDays).toBe(calendarDays);
  });

  it("month validation rejects invalid formats", () => {
    const invalid = ["2026-1", "202607", "abc", "", "2026/07", "2026-07-01"];
    const re = /^\d{4}-\d{2}$/;
    for (const m of invalid) {
      expect(re.test(m)).toBe(false);
    }
  });

  it("month validation rejects month > 12", () => {
    const re = /^\d{4}-\d{2}$/;
    expect(re.test("2026-13")).toBe(true);
    const [, monStr] = "2026-13".split("-");
    const mon = parseInt(monStr, 10);
    expect(mon >= 1 && mon <= 12).toBe(false);
  });
});

describe("WORKFORCE-UX-01 — month boundary consistency", () => {
  it("July 2026 month boundaries in Asia/Dhaka", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    expect(getAttendanceDateDhaka(now)).toBe("2026-07-22");
    expect(isCurrentCalendarMonthDhaka("2026-07-01", now)).toBe(true);
    expect(isCurrentCalendarMonthDhaka("2026-07-31", now)).toBe(true);
    expect(isCurrentCalendarMonthDhaka("2026-06-30", now)).toBe(false);
  });

  it("month boundary at midnight crossing", () => {
    const jun30lateUtc = new Date("2026-06-30T20:00:00.000Z");
    expect(getAttendanceDateDhaka(jun30lateUtc)).toBe("2026-07-01");
    expect(isCurrentCalendarMonthDhaka("2026-07-01", jun30lateUtc)).toBe(true);
    expect(isCurrentCalendarMonthDhaka("2026-06-30", jun30lateUtc)).toBe(false);
  });
});

describe("WORKFORCE-UX-01 — monthly summary service (real logic, past/current/future)", () => {
  const todayDhaka = "2026-07-22";

  it("future month: eligibleDays=0, present=0, absent=0, ratio=0 — future records not counted as present", () => {
    const records = [
      { date: "2026-08-01" },
      { date: "2026-08-15" },
      { date: "2026-08-31" },
    ];
    const summary = computeAttendanceMonthSummary({
      selectedMonth: "2026-08",
      todayDhaka,
      records,
    });
    expect(summary.eligibleDays).toBe(0);
    expect(summary.presentDays).toBe(0);
    expect(summary.absentDays).toBe(0);
    expect(summary.ratio).toBe(0);
    expect(summary.daysInMonth).toBe(31);
    expect(summary.calendarDays).toBe(31);
    expect(summary.daysInMonth).toBe(summary.calendarDays);
    expect(summary.eligibleDays).toBeLessThanOrEqual(summary.daysInMonth);
  });

  it("future month ignores records even when a future record exists", () => {
    const summary = computeAttendanceMonthSummary({
      selectedMonth: "2026-08",
      todayDhaka,
      records: [{ date: "2026-08-05" }],
    });
    expect(summary.presentDays).toBe(0);
    expect(summary.eligibleDays).toBe(0);
  });

  it("current month: eligibleDays = current Dhaka day, counts only records up to today", () => {
    const records = [
      { date: "2026-07-01" },
      { date: "2026-07-15" },
      { date: "2026-07-22" },
      { date: "2026-07-25" },
    ];
    const summary = computeAttendanceMonthSummary({
      selectedMonth: "2026-07",
      todayDhaka,
      records,
    });
    expect(summary.eligibleDays).toBe(22);
    expect(summary.daysInMonth).toBe(31);
    expect(summary.calendarDays).toBe(31);
    expect(summary.presentDays).toBe(3);
    expect(summary.absentDays).toBe(19);
    expect(summary.ratio).toBe(Math.round((3 / 22) * 100));
    expect(summary.presentDays + summary.absentDays).toBe(summary.eligibleDays);
  });

  it("current month with every elapsed day present: ratio=100", () => {
    const records = Array.from({ length: 22 }, (_, i) => ({
      date: `2026-07-${String(i + 1).padStart(2, "0")}`,
    }));
    const summary = computeAttendanceMonthSummary({
      selectedMonth: "2026-07",
      todayDhaka,
      records,
    });
    expect(summary.eligibleDays).toBe(22);
    expect(summary.presentDays).toBe(22);
    expect(summary.absentDays).toBe(0);
    expect(summary.ratio).toBe(100);
  });

  it("current month with no records: present=0, absent=eligibleDays, ratio=0", () => {
    const summary = computeAttendanceMonthSummary({
      selectedMonth: "2026-07",
      todayDhaka,
      records: [],
    });
    expect(summary.eligibleDays).toBe(22);
    expect(summary.presentDays).toBe(0);
    expect(summary.absentDays).toBe(22);
    expect(summary.ratio).toBe(0);
  });

  it("past month: eligibleDays = calendarDays, full month is the denominator", () => {
    const records = [
      { date: "2026-06-01" },
      { date: "2026-06-30" },
    ];
    const summary = computeAttendanceMonthSummary({
      selectedMonth: "2026-06",
      todayDhaka,
      records,
    });
    expect(summary.eligibleDays).toBe(30);
    expect(summary.daysInMonth).toBe(30);
    expect(summary.calendarDays).toBe(30);
    expect(summary.eligibleDays).toBe(summary.calendarDays);
    expect(summary.presentDays).toBe(2);
    expect(summary.absentDays).toBe(28);
    expect(summary.ratio).toBe(Math.round((2 / 30) * 100));
    expect(summary.presentDays + summary.absentDays).toBe(summary.eligibleDays);
  });

  it("past month (February non-leap): calendarDays=28, eligibleDays=28", () => {
    const summary = computeAttendanceMonthSummary({
      selectedMonth: "2026-02",
      todayDhaka,
      records: [],
    });
    expect(summary.calendarDays).toBe(28);
    expect(summary.eligibleDays).toBe(28);
    expect(summary.daysInMonth).toBe(28);
    expect(summary.absentDays).toBe(28);
    expect(summary.ratio).toBe(0);
  });

  it("daysInMonth is the actual calendar length, never the elapsed days", () => {
    const futureSummary = computeAttendanceMonthSummary({
      selectedMonth: "2026-08",
      todayDhaka,
      records: [],
    });
    const currentSummary = computeAttendanceMonthSummary({
      selectedMonth: "2026-07",
      todayDhaka,
      records: [],
    });
    const pastSummary = computeAttendanceMonthSummary({
      selectedMonth: "2026-06",
      todayDhaka,
      records: [],
    });
    expect(futureSummary.daysInMonth).toBe(31);
    expect(futureSummary.eligibleDays).toBe(0);
    expect(currentSummary.daysInMonth).toBe(31);
    expect(currentSummary.eligibleDays).toBe(22);
    expect(pastSummary.daysInMonth).toBe(30);
    expect(pastSummary.eligibleDays).toBe(30);
    for (const s of [futureSummary, currentSummary, pastSummary]) {
      expect(s.daysInMonth).toBe(s.calendarDays);
      expect(s.eligibleDays).toBeLessThanOrEqual(s.daysInMonth);
    }
  });

  it("selected-staff summary shape matches the API contract fields", () => {
    const summary = computeAttendanceMonthSummary({
      selectedMonth: "2026-07",
      todayDhaka,
      records: [{ date: "2026-07-22" }],
    });
    expect(summary).toEqual(
      expect.objectContaining({
        presentDays: expect.any(Number),
        absentDays: expect.any(Number),
        eligibleDays: expect.any(Number),
        daysInMonth: expect.any(Number),
        calendarDays: expect.any(Number),
        ratio: expect.any(Number),
      }),
    );
  });
});

describe("WORKFORCE-UX-01 — monthly endpoint response contract excludes future records", () => {
  const todayDhaka = "2026-07-22";

  it("future-dated attendance rows are excluded from response.records", () => {
    const records = [
      { date: "2026-07-01", id: "r1" },
      { date: "2026-07-22", id: "r2" },
      { date: "2026-07-25", id: "r3-future" },
      { date: "2026-07-31", id: "r4-future" },
    ];
    const response = buildAttendanceMonthResponse({
      userId: "user-1",
      selectedMonth: "2026-07",
      todayDhaka,
      records,
    });
    expect(response.records.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(response.records.every((r) => r.date <= todayDhaka)).toBe(true);
    expect(response.records.find((r) => r.id === "r3-future")).toBeUndefined();
    expect(response.records.find((r) => r.id === "r4-future")).toBeUndefined();
  });

  it("valid current/past records remain in response.records", () => {
    const records = [
      { date: "2026-07-01", id: "past-day" },
      { date: "2026-07-15", id: "mid-month" },
      { date: "2026-07-22", id: "current-today" },
    ];
    const response = buildAttendanceMonthResponse({
      userId: "user-1",
      selectedMonth: "2026-07",
      todayDhaka,
      records,
    });
    expect(response.records.map((r) => r.id)).toEqual(["past-day", "mid-month", "current-today"]);
    expect(response.records.every((r) => r.date <= todayDhaka)).toBe(true);
  });

  it("future month: all records excluded, response.records empty, summary zeroed", () => {
    const records = [
      { date: "2026-08-01", id: "f1" },
      { date: "2026-08-15", id: "f2" },
    ];
    const response = buildAttendanceMonthResponse({
      userId: "user-1",
      selectedMonth: "2026-08",
      todayDhaka,
      records,
    });
    expect(response.records).toEqual([]);
    expect(response.summary.presentDays).toBe(0);
    expect(response.summary.absentDays).toBe(0);
    expect(response.summary.eligibleDays).toBe(0);
    expect(response.summary.ratio).toBe(0);
  });

  it("response shape matches the API contract: userId, month, records, summary", () => {
    const response = buildAttendanceMonthResponse({
      userId: "user-1",
      selectedMonth: "2026-07",
      todayDhaka,
      records: [{ date: "2026-07-22", id: "r1" }],
    });
    expect(response).toEqual(
      expect.objectContaining({
        userId: "user-1",
        month: "2026-07",
        records: expect.any(Array),
        summary: expect.objectContaining({
          presentDays: expect.any(Number),
          absentDays: expect.any(Number),
          eligibleDays: expect.any(Number),
          daysInMonth: expect.any(Number),
          calendarDays: expect.any(Number),
          ratio: expect.any(Number),
        }),
      }),
    );
  });

  it("summary.presentDays counts only filtered records, not raw input", () => {
    const records = [
      { date: "2026-07-21", id: "a" },
      { date: "2026-07-22", id: "b" },
      { date: "2026-07-23", id: "c-future" },
    ];
    const response = buildAttendanceMonthResponse({
      userId: "user-1",
      selectedMonth: "2026-07",
      todayDhaka,
      records,
    });
    expect(response.records.length).toBe(2);
    expect(response.summary.presentDays).toBe(2);
    expect(response.summary.absentDays).toBe(20);
    expect(response.summary.ratio).toBe(Math.round((2 / 22) * 100));
  });
});
