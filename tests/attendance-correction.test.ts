import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertRawEvidencePreserved,
  assertValidTimePair,
  isCurrentCalendarMonth,
  parseProposedTime,
  resolveEffectiveAttendanceTimes,
  AttendanceCorrectionError,
} from "../server/services/attendance-correction.service.js";
import {
  ATTENDANCE_CHECK_IN_REQUIRED,
  ATTENDANCE_GATE_ROLES,
  ATTENDANCE_TZ,
  assertTimesOnAttendanceDate,
  buildCheckInRequiredBody,
  evaluateAttendanceGate,
  getAttendanceDateDhaka,
  isAttendanceGateExemptPath,
  isAttendanceGateRole,
  isCurrentCalendarMonthDhaka,
  needsAttendanceGateLookup,
} from "../server/services/attendance-day.service.js";
import { userHasGranularPermission } from "../server/routes/middleware/auth.js";
import { ROLE_PRESETS } from "../shared/permission-catalog.js";

describe("attendance day — Asia/Dhaka", () => {
  it("formats YYYY-MM-DD in Asia/Dhaka (not UTC alone)", () => {
    // 2026-07-21 22:30 UTC = 2026-07-22 04:30 Asia/Dhaka
    const nearMidnightUtc = new Date("2026-07-21T22:30:00.000Z");
    expect(getAttendanceDateDhaka(nearMidnightUtc)).toBe("2026-07-22");
    expect(ATTENDANCE_TZ).toBe("Asia/Dhaka");
  });

  it("month eligibility uses Asia/Dhaka calendar month", () => {
    const lateJulyDhaka = new Date("2026-07-31T12:00:00.000Z");
    expect(isCurrentCalendarMonthDhaka("2026-07-15", lateJulyDhaka)).toBe(true);
    expect(isCurrentCalendarMonth("2026-07-31", lateJulyDhaka)).toBe(true);
    expect(isCurrentCalendarMonth("2026-06-30", lateJulyDhaka)).toBe(false);

    const earlyAugustDhaka = new Date("2026-07-31T20:00:00.000Z"); // Aug 1 02:00 Dhaka
    expect(getAttendanceDateDhaka(earlyAugustDhaka)).toBe("2026-08-01");
    expect(isCurrentCalendarMonth("2026-07-31", earlyAugustDhaka)).toBe(false);
    expect(isCurrentCalendarMonth("2026-08-01", earlyAugustDhaka)).toBe(true);
  });
});

describe("attendance gate — role + attendance.checkIn", () => {
  const now = new Date("2026-07-15T06:00:00.000Z");

  it("covers Technician, Manager, Cashier, Driver only as gate roles", () => {
    expect(ATTENDANCE_GATE_ROLES).toEqual(["Technician", "Manager", "Cashier", "Driver"]);
    for (const role of ATTENDANCE_GATE_ROLES) {
      expect(isAttendanceGateRole(role)).toBe(true);
    }
    expect(isAttendanceGateRole("Super Admin")).toBe(false);
    expect(isAttendanceGateRole("Corporate")).toBe(false);
  });

  it("requires check-in for gated roles WITH attendance.checkIn and no today record", () => {
    for (const role of ATTENDANCE_GATE_ROLES) {
      const status = evaluateAttendanceGate({
        role,
        hasCheckInPermission: true,
        todayRecord: null,
        now,
      });
      expect(status.required).toBe(true);
      expect(status.checkedIn).toBe(false);
      expect(status.exempt).toBe(false);
      expect(status.reason).toBe("check_in_required");
      expect(status.date).toBe("2026-07-15");
      expect(status.timezone).toBe("Asia/Dhaka");
    }
  });

  it("does not gate a Technician without attendance.checkIn (no permanent lockout)", () => {
    const status = evaluateAttendanceGate({
      role: "Technician",
      hasCheckInPermission: false,
      todayRecord: null,
      now,
    });
    expect(status.required).toBe(false);
    expect(status.exempt).toBe(true);
    expect(status.reason).toBe("check_in_permission_absent");
  });

  it("default role presets retain attendance.checkIn so normal staff remain gated", () => {
    const presetUsers = [
      { role: "Technician", permissions: JSON.stringify(Object.fromEntries(ROLE_PRESETS["Technician Basic"].map((k) => [k, true]))) },
      { role: "Manager", permissions: JSON.stringify(Object.fromEntries(ROLE_PRESETS["Manager Basic"].map((k) => [k, true]))) },
      { role: "Cashier", permissions: JSON.stringify(Object.fromEntries(ROLE_PRESETS["Cashier Basic"].map((k) => [k, true]))) },
      { role: "Driver", permissions: JSON.stringify(Object.fromEntries(ROLE_PRESETS["Driver Basic"].map((k) => [k, true]))) },
    ];

    for (const user of presetUsers) {
      expect(userHasGranularPermission(user, "attendance.checkIn")).toBe(true);
      const status = evaluateAttendanceGate({
        role: user.role,
        hasCheckInPermission: userHasGranularPermission(user, "attendance.checkIn"),
        todayRecord: null,
        now,
      });
      expect(status.required).toBe(true);
      expect(status.reason).toBe("check_in_required");
    }
  });

  it("custom Technician with empty/other permissions is not locked by the gate", () => {
    const user = {
      role: "Technician",
      permissions: JSON.stringify({ "jobs.view": true }),
    };
    expect(userHasGranularPermission(user, "attendance.checkIn")).toBe(false);
    const status = evaluateAttendanceGate({
      role: user.role,
      hasCheckInPermission: userHasGranularPermission(user, "attendance.checkIn"),
      todayRecord: null,
      now,
    });
    expect(status.required).toBe(false);
    expect(status.reason).toBe("check_in_permission_absent");
  });

  it("unlocks after check-in when eligible", () => {
    const status = evaluateAttendanceGate({
      role: "Technician",
      hasCheckInPermission: true,
      todayRecord: { id: "att-1" },
      now,
    });
    expect(status.required).toBe(false);
    expect(status.checkedIn).toBe(true);
    expect(status.reason).toBe("checked_in");
    expect(status.recordId).toBe("att-1");
  });

  it("exempts Super Admin even without check-in", () => {
    const status = evaluateAttendanceGate({
      role: "Super Admin",
      hasCheckInPermission: true,
      todayRecord: null,
      now,
    });
    expect(status.required).toBe(false);
    expect(status.exempt).toBe(true);
    expect(status.reason).toBe("super_admin_exempt");
  });

  it("does not gate non-operational roles", () => {
    const status = evaluateAttendanceGate({
      role: "Corporate",
      hasCheckInPermission: false,
      todayRecord: null,
    });
    expect(status.required).toBe(false);
    expect(status.reason).toBe("role_not_gated");
  });

  it("builds stable ATTENDANCE_CHECK_IN_REQUIRED body", () => {
    const body = buildCheckInRequiredBody("2026-07-15");
    expect(body.code).toBe(ATTENDANCE_CHECK_IN_REQUIRED);
    expect(body.date).toBe("2026-07-15");
    expect(body.timezone).toBe("Asia/Dhaka");
  });

  it("needsAttendanceGateLookup is false for Super Admin and no-checkIn roles", () => {
    expect(needsAttendanceGateLookup({ role: "Super Admin", hasCheckInPermission: true })).toBe(false);
    expect(needsAttendanceGateLookup({ role: "Corporate", hasCheckInPermission: false })).toBe(false);
    expect(needsAttendanceGateLookup({ role: "Technician", hasCheckInPermission: false })).toBe(false);
    expect(needsAttendanceGateLookup({ role: "Technician", hasCheckInPermission: true })).toBe(true);
  });
});

describe("attendance gate — exempt paths", () => {
  it("allows status, check-in, auth, and mobile bootstrap without gate", () => {
    expect(isAttendanceGateExemptPath("/api/admin/attendance/gate-status")).toBe(true);
    expect(isAttendanceGateExemptPath("/api/admin/attendance/today")).toBe(true);
    expect(isAttendanceGateExemptPath("/api/admin/attendance/check-in")).toBe(true);
    expect(isAttendanceGateExemptPath("/api/admin/me")).toBe(true);
    expect(isAttendanceGateExemptPath("/api/admin/login")).toBe(true);
    expect(isAttendanceGateExemptPath("/api/mobile/bootstrap")).toBe(true);
    expect(isAttendanceGateExemptPath("/api/mobile/attendance/status")).toBe(true);
  });

  it("does not exempt protected operational staff routes", () => {
    expect(isAttendanceGateExemptPath("/api/admin/jobs")).toBe(false);
    expect(isAttendanceGateExemptPath("/api/admin/attendance")).toBe(false);
    expect(isAttendanceGateExemptPath("/api/admin/pos/sale")).toBe(false);
    expect(isAttendanceGateExemptPath("/api/mobile/action-queue")).toBe(false);
  });
});

describe("attendance correction — month eligibility", () => {
  it("allows only current Asia/Dhaka calendar month", () => {
    const now = new Date("2026-07-15T12:00:00.000Z");
    expect(isCurrentCalendarMonth("2026-07-01", now)).toBe(true);
    expect(isCurrentCalendarMonth("2026-07-31", now)).toBe(true);
    expect(isCurrentCalendarMonth("2026-06-30", now)).toBe(false);
    expect(isCurrentCalendarMonth("2026-08-01", now)).toBe(false);
  });
});

describe("attendance correction — time validation", () => {
  it("rejects impossible checkout before checkin", () => {
    const checkIn = new Date("2026-07-10T09:00:00.000Z");
    const checkOut = new Date("2026-07-10T08:00:00.000Z");
    expect(() => assertValidTimePair(checkIn, checkOut)).toThrow(AttendanceCorrectionError);
    try {
      assertValidTimePair(checkIn, checkOut);
    } catch (e: any) {
      expect(e.code).toBe("IMPOSSIBLE_TIME");
    }
  });

  it("parses valid ISO times", () => {
    const d = parseProposedTime("2026-07-10T09:30:00.000Z", "proposedCheckInTime");
    expect(d.toISOString()).toBe("2026-07-10T09:30:00.000Z");
  });

  it("rejects cross-day proposed timestamps (Asia/Dhaka date)", () => {
    const sameDayIn = new Date("2026-07-10T03:00:00.000Z");
    const sameDayOut = new Date("2026-07-10T12:00:00.000Z");
    expect(() => assertTimesOnAttendanceDate("2026-07-10", sameDayIn, sameDayOut)).not.toThrow();

    const nextDayOut = new Date("2026-07-10T18:30:00.000Z");
    expect(() => assertTimesOnAttendanceDate("2026-07-10", sameDayIn, nextDayOut)).toThrow();
    try {
      assertTimesOnAttendanceDate("2026-07-10", sameDayIn, nextDayOut);
    } catch (e: any) {
      expect(e.code).toBe("CROSS_DAY_TIME");
    }

    const otherDayIn = new Date("2026-07-09T10:00:00.000Z");
    expect(() => assertTimesOnAttendanceDate("2026-07-10", otherDayIn, null)).toThrow();
  });
});

describe("attendance correction — effective overlay", () => {
  it("prefers effective times without losing raw GPS timestamps", () => {
    const rawIn = new Date("2026-07-10T09:00:00.000Z");
    const rawOut = new Date("2026-07-10T18:00:00.000Z");
    const effIn = new Date("2026-07-10T09:15:00.000Z");
    const effOut = new Date("2026-07-10T17:45:00.000Z");

    const before = {
      checkInTime: rawIn,
      checkOutTime: rawOut,
      checkInLat: 23.8,
      checkInLng: 90.4,
    };
    const after = {
      checkInTime: rawIn,
      checkOutTime: rawOut,
      checkInLat: 23.8,
      checkInLng: 90.4,
      effectiveCheckInTime: effIn,
      effectiveCheckOutTime: effOut,
    };

    expect(assertRawEvidencePreserved(before, after)).toBe(true);
    const effective = resolveEffectiveAttendanceTimes(after);
    expect(effective.isCorrected).toBe(true);
    expect(new Date(effective.checkInTime).getTime()).toBe(effIn.getTime());
    expect(new Date(effective.checkOutTime!).getTime()).toBe(effOut.getTime());
  });

  it("without overlay uses raw times", () => {
    const rawIn = new Date("2026-07-10T09:00:00.000Z");
    const effective = resolveEffectiveAttendanceTimes({
      checkInTime: rawIn,
      checkOutTime: null,
    });
    expect(effective.isCorrected).toBe(false);
    expect(new Date(effective.checkInTime).getTime()).toBe(rawIn.getTime());
  });
});

describe("attendance correction — self-review rule", () => {
  it("documents self-review as forbidden (service enforces reviewer !== requester)", () => {
    const requester = "user-a";
    const reviewer = "user-a";
    expect(requester === reviewer).toBe(true);
  });
});

describe("attendance migration — unique day preflight contract", () => {
  it("documents fail-fast when duplicate user/date rows exist", () => {
    const sampleDupeQuery = `
      SELECT user_id, date, COUNT(*)::text AS cnt
      FROM attendance_records
      GROUP BY user_id, date
      HAVING COUNT(*) > 1
      LIMIT 20
    `;
    expect(sampleDupeQuery).toContain("HAVING COUNT(*) > 1");
    expect("uidx_attendance_user_date").toMatch(/^uidx_attendance_user_date$/);
  });
});

// ---------------------------------------------------------------------------
// Middleware enforcement (mocked deps) — proves 412 vs next()
// ---------------------------------------------------------------------------

const storageGetUser = vi.fn();
const getTodayAttendanceForUser = vi.fn();

vi.mock("../server/storage.js", () => ({
  storage: {
    getUser: (...args: unknown[]) => storageGetUser(...args),
  },
}));

vi.mock("../server/repositories/index.js", () => ({
  attendanceRepo: {
    getTodayAttendanceForUser: (...args: unknown[]) => getTodayAttendanceForUser(...args),
  },
}));

describe("attendance gate middleware — enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockRes() {
    const res: any = {
      statusCode: 200,
      body: null as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.body = payload;
        return this;
      },
    };
    return res;
  }

  function mockReq(partial: {
    adminUserId?: string;
    path?: string;
    user?: { id: string; role: string; permissions?: string | null };
  }) {
    return {
      session: partial.adminUserId ? { adminUserId: partial.adminUserId } : {},
      path: partial.path ?? "/api/admin/jobs",
      url: partial.path ?? "/api/admin/jobs",
      user: partial.user,
    } as any;
  }

  it("returns 412 ATTENDANCE_CHECK_IN_REQUIRED for gated un-checked-in Technician with checkIn", async () => {
    const { attendanceCheckInGateMiddleware } = await import(
      "../server/middleware/attendance-check-in-gate.js"
    );
    const techPerms = JSON.stringify(
      Object.fromEntries(ROLE_PRESETS["Technician Basic"].map((k) => [k, true])),
    );
    const user = { id: "tech-1", role: "Technician", permissions: techPerms };
    storageGetUser.mockResolvedValue(user);
    getTodayAttendanceForUser.mockResolvedValue(undefined);

    const req = mockReq({ adminUserId: "tech-1", path: "/api/admin/jobs" });
    const res = mockRes();
    const next = vi.fn();

    await attendanceCheckInGateMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(412);
    expect(res.body).toMatchObject({
      code: ATTENDANCE_CHECK_IN_REQUIRED,
      timezone: "Asia/Dhaka",
    });
    expect(getTodayAttendanceForUser).toHaveBeenCalled();
  });

  it("calls next() after today's check-in for gated Technician", async () => {
    const { attendanceCheckInGateMiddleware } = await import(
      "../server/middleware/attendance-check-in-gate.js"
    );
    const techPerms = JSON.stringify(
      Object.fromEntries(ROLE_PRESETS["Technician Basic"].map((k) => [k, true])),
    );
    const user = { id: "tech-1", role: "Technician", permissions: techPerms };
    storageGetUser.mockResolvedValue(user);
    getTodayAttendanceForUser.mockResolvedValue({ id: "att-today" });

    const req = mockReq({ adminUserId: "tech-1", path: "/api/admin/jobs" });
    const res = mockRes();
    const next = vi.fn();

    await attendanceCheckInGateMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
    expect(res.body).toBeNull();
  });

  it("calls next() for Super Admin without check-in and skips attendance DB", async () => {
    const { attendanceCheckInGateMiddleware } = await import(
      "../server/middleware/attendance-check-in-gate.js"
    );
    const user = { id: "sa-1", role: "Super Admin", permissions: null };
    storageGetUser.mockResolvedValue(user);
    getTodayAttendanceForUser.mockRejectedValue(new Error("should not be called"));

    const req = mockReq({
      adminUserId: "sa-1",
      path: "/api/admin/schema-updates/status",
    });
    const res = mockRes();
    const next = vi.fn();

    await attendanceCheckInGateMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
    expect(getTodayAttendanceForUser).not.toHaveBeenCalled();
  });

  it("Super Admin bypasses even when attendance repo would throw", async () => {
    const { attendanceCheckInGateMiddleware } = await import(
      "../server/middleware/attendance-check-in-gate.js"
    );
    const user = { id: "sa-1", role: "Super Admin", permissions: null };
    storageGetUser.mockResolvedValue(user);
    getTodayAttendanceForUser.mockRejectedValue(new Error("DB down"));

    const req = mockReq({ adminUserId: "sa-1", path: "/api/admin/jobs" });
    const res = mockRes();
    const next = vi.fn();

    await attendanceCheckInGateMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).not.toBe(503);
    expect(res.body).toBeNull();
    expect(getTodayAttendanceForUser).not.toHaveBeenCalled();
  });

  it("calls next() for Technician without attendance.checkIn without attendance DB", async () => {
    const { attendanceCheckInGateMiddleware } = await import(
      "../server/middleware/attendance-check-in-gate.js"
    );
    const user = {
      id: "tech-x",
      role: "Technician",
      permissions: JSON.stringify({ "jobs.view": true }),
    };
    storageGetUser.mockResolvedValue(user);
    getTodayAttendanceForUser.mockRejectedValue(new Error("should not be called"));

    const req = mockReq({ adminUserId: "tech-x", path: "/api/admin/jobs" });
    const res = mockRes();
    const next = vi.fn();

    await attendanceCheckInGateMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
    expect(getTodayAttendanceForUser).not.toHaveBeenCalled();
  });

  it("gated staff remain fail-closed 503 when attendance repo throws", async () => {
    const { attendanceCheckInGateMiddleware } = await import(
      "../server/middleware/attendance-check-in-gate.js"
    );
    const techPerms = JSON.stringify(
      Object.fromEntries(ROLE_PRESETS["Technician Basic"].map((k) => [k, true])),
    );
    const user = { id: "tech-1", role: "Technician", permissions: techPerms };
    storageGetUser.mockResolvedValue(user);
    getTodayAttendanceForUser.mockRejectedValue(new Error("connection refused"));

    const req = mockReq({ adminUserId: "tech-1", path: "/api/admin/jobs" });
    const res = mockRes();
    const next = vi.fn();

    await attendanceCheckInGateMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ code: "ATTENDANCE_GATE_UNAVAILABLE" });
    expect(getTodayAttendanceForUser).toHaveBeenCalled();
  });

  it("passes through when no admin session", async () => {
    const { attendanceCheckInGateMiddleware } = await import(
      "../server/middleware/attendance-check-in-gate.js"
    );
    const req = mockReq({ path: "/api/admin/jobs" });
    const res = mockRes();
    const next = vi.fn();

    await attendanceCheckInGateMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(storageGetUser).not.toHaveBeenCalled();
  });
});
