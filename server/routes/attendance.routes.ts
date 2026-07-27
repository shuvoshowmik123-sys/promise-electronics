/**
 * Attendance Routes
 *
 * Staff attendance check-in/check-out with canonical work-location geofence.
 * UNIFIED-OPS-01E: attendance.view = shop-wide reports; attendance.checkIn = self Shift APIs.
 * ATTENDANCE-LOCATION-01A: location resolution + accuracy-aware geofence via shared service.
 */

import { Router, Request, Response } from 'express';
import { eq, inArray } from 'drizzle-orm';
import { attendanceRepo, userRepo, notificationRepo } from '../repositories/index.js';
import { db } from '../db.js';
import * as schema from '../../shared/schema.js';
import {
    requireAdminAuth,
    requireGranularPermission,
    requireAnyGranularPermission,
    userHasGranularPermission,
} from './middleware/auth.js';
import {
    buildAttendanceLocationContext,
    evaluateGeofenceForWorkLocation,
    formatDistanceForAlert,
    isConfidentOutsideStatus,
    resolveAttendanceWorkLocation,
    snapshotFieldsFromLocation,
} from '../services/attendance-location.service.js';
import {
    evaluateAttendanceGate,
    getAttendanceDateDhaka,
    buildAttendanceMonthResponse,
} from '../services/attendance-day.service.js';
import { AttendanceDuplicateDayError } from '../repositories/attendance.repository.js';
import { getAttendanceDateDhaka as getDhakaDateShared } from '../../shared/attendance-utils.js';

const router = Router();

const attendanceReportGuard = requireAnyGranularPermission([
    'attendance.view',
    'reports.view',
]);

const attendanceCheckInGuard = requireGranularPermission('attendance.checkIn');

const locationContextGuard = requireAnyGranularPermission([
    'attendance.view',
    'reports.view',
    'attendance.checkIn',
]);

function validateCoords(lat: unknown, lng: unknown): string | null {
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
        return 'Location is required. Enable GPS and try again.';
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return 'Invalid GPS coordinates.';
    }
    return null;
}

async function alertSuperAdmins(userName: string, userRole: string, distanceMeters: number): Promise<void> {
    const distLabel = formatDistanceForAlert(distanceMeters);
    try {
        const superAdmins = await db
            .select()
            .from(schema.users)
            .where(eq(schema.users.role, 'Super Admin'));
        await Promise.allSettled(
            superAdmins.map((admin) =>
                notificationRepo.createNotification({
                    userId: admin.id,
                    title: `Outside check-in: ${userName}`,
                    message: `${userName} (${userRole}) checked in ${distLabel} away from the office.`,
                    type: 'warning',
                    link: 'attendance',
                    contextType: 'admin',
                }),
            ),
        );
    } catch { /* fire-and-forget — never block check-in */ }
}

// ============================================
// Report routes (attendance.view | reports.view)
// ============================================

router.get(
    '/api/admin/attendance',
    requireAdminAuth,
    attendanceReportGuard,
    async (_req: Request, res: Response) => {
        try {
            res.json(await attendanceRepo.getAllAttendanceRecords());
        } catch {
            res.status(500).json({ error: 'Failed to fetch attendance records' });
        }
    },
);

router.get(
    '/api/admin/attendance/date/:date',
    requireAdminAuth,
    attendanceReportGuard,
    async (req: Request, res: Response) => {
        try {
            res.json(await attendanceRepo.getAttendanceByDate(req.params.date));
        } catch {
            res.status(500).json({ error: 'Failed to fetch attendance records' });
        }
    },
);

router.get(
    '/api/admin/attendance/user/:userId',
    requireAdminAuth,
    attendanceReportGuard,
    async (req: Request, res: Response) => {
        try {
            res.json(await attendanceRepo.getAttendanceByUserId(req.params.userId));
        } catch {
            res.status(500).json({ error: 'Failed to fetch attendance records' });
        }
    },
);

router.get(
    '/api/admin/attendance/user/:userId/month',
    requireAdminAuth,
    attendanceReportGuard,
    async (req: Request, res: Response) => {
        try {
            const { userId } = req.params;
            const month = String(req.query.month || '');
            if (!/^\d{4}-\d{2}$/.test(month)) {
                return res.status(400).json({ error: 'month must be YYYY-MM' });
            }
            const [year, mon] = month.split('-').map(Number);
            if (mon < 1 || mon > 12) {
                return res.status(400).json({ error: 'month must be 01-12' });
            }
            const startDate = `${year}-${String(mon).padStart(2, '0')}-01`;
            const lastDay = new Date(year, mon, 0).getDate();
            const endDate = `${year}-${String(mon).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            const records = await attendanceRepo.getAttendanceByUserAndDateRange(userId, startDate, endDate);
            const todayDhaka = getDhakaDateShared();
            res.json(buildAttendanceMonthResponse({ userId, selectedMonth: month, todayDhaka, records }));
        } catch {
            res.status(500).json({ error: 'Failed to fetch monthly attendance' });
        }
    },
);

router.get(
    '/api/admin/attendance/staff',
    requireAdminAuth,
    attendanceReportGuard,
    async (_req: Request, res: Response) => {
        try {
            const staffRoles = ['Technician', 'Cashier', 'Manager', 'Driver'];
            const rows = await db
                .select({
                    id: schema.users.id,
                    name: schema.users.name,
                    username: schema.users.username,
                    role: schema.users.role,
                    status: schema.users.status,
                })
                .from(schema.users)
                .where(inArray(schema.users.role, staffRoles));

            const staff = rows.map((r) => ({
                id: r.id,
                name: r.name,
                username: r.username,
                role: r.role,
                status: r.status,
            }));
            res.json(staff);
        } catch {
            res.status(500).json({ error: 'Failed to fetch attendance staff list' });
        }
    },
);

/**
 * Map-ready location context for a single attendance record.
 * Super Admin / attendance.view / reports.view: any record.
 * attendance.checkIn only: own record.
 */
router.get(
    '/api/admin/attendance/location-context/:recordId',
    requireAdminAuth,
    locationContextGuard,
    async (req: Request, res: Response) => {
        try {
            const requester = (req as Request & { user?: schema.User }).user;
            if (!requester) {
                return res.status(401).json({ error: 'Admin authentication required' });
            }
            const record = await attendanceRepo.getAttendanceById(req.params.recordId);
            if (!record) {
                return res.status(404).json({ error: 'Attendance record not found' });
            }
            const canReport =
                requester.role === 'Super Admin' ||
                userHasGranularPermission(requester, 'attendance.view') ||
                userHasGranularPermission(requester, 'reports.view');
            const canSelf =
                userHasGranularPermission(requester, 'attendance.checkIn') &&
                record.userId === requester.id;
            if (!canReport && !canSelf) {
                return res.status(403).json({ error: 'Access denied' });
            }
            res.json(await buildAttendanceLocationContext(record));
        } catch {
            res.status(500).json({ error: 'Failed to load attendance location context' });
        }
    },
);

// ============================================
// Self Shift routes (attendance.checkIn)
// ============================================

/** UI-safe daily gate status — Asia/Dhaka server date is authoritative. */
router.get(
    '/api/admin/attendance/gate-status',
    requireAdminAuth,
    async (req: Request, res: Response) => {
        try {
            const user = (req as Request & { user?: schema.User }).user;
            if (!user) {
                return res.status(401).json({ error: 'Admin authentication required' });
            }
            const today = getAttendanceDateDhaka();
            const record = await attendanceRepo.getTodayAttendanceForUser(user.id, today);
            const gate = evaluateAttendanceGate({
                role: user.role,
                hasCheckInPermission: userHasGranularPermission(user, "attendance.checkIn"),
                todayRecord: record ?? null,
            });
            res.json({
                ...gate,
                record: record ?? null,
            });
        } catch {
            res.status(500).json({ error: 'Failed to load attendance gate status' });
        }
    },
);

router.get(
    '/api/admin/attendance/today',
    requireAdminAuth,
    attendanceCheckInGuard,
    async (req: Request, res: Response) => {
        try {
            const today = getAttendanceDateDhaka();
            const record = await attendanceRepo.getTodayAttendanceForUser(req.session.adminUserId!, today);
            res.json(record ?? null);
        } catch {
            res.status(500).json({ error: "Failed to fetch today's attendance" });
        }
    },
);

router.get(
    '/api/admin/attendance/my-history',
    requireAdminAuth,
    attendanceCheckInGuard,
    async (req: Request, res: Response) => {
        try {
            const daysRaw = parseInt(String(req.query.days ?? '7'), 10);
            const days = Math.min(Math.max(isNaN(daysRaw) ? 7 : daysRaw, 1), 31);
            const today = getAttendanceDateDhaka();
            const [y, m, d] = today.split('-').map(Number);
            const startUtc = new Date(Date.UTC(y, m - 1, d - (days - 1)));
            const startDate = startUtc.toISOString().slice(0, 10);
            const records = await attendanceRepo.getAttendanceByUserId(req.session.adminUserId!);
            res.json(records.filter((record) => record.date >= startDate).slice(0, days));
        } catch {
            res.status(500).json({ error: 'Failed to fetch shift history' });
        }
    },
);

router.post(
    '/api/admin/attendance/check-in',
    requireAdminAuth,
    attendanceCheckInGuard,
    async (req: Request, res: Response) => {
        try {
            const user = await userRepo.getUser(req.session.adminUserId!);
            if (!user) return res.status(404).json({ error: 'User not found' });

            const today = getAttendanceDateDhaka();
            const existing = await attendanceRepo.getTodayAttendanceForUser(user.id, today);
            if (existing) return res.status(400).json({ error: 'Already checked in today', record: existing });

            const { notes, lat, lng, accuracy } = req.body;

            const coordError = validateCoords(lat, lng);
            if (coordError) return res.status(400).json({ error: coordError });

            const workLocation = await resolveAttendanceWorkLocation(user);
            const geofence = evaluateGeofenceForWorkLocation(workLocation, {
                latitude: lat,
                longitude: lng,
                accuracy,
            });

            const record = await attendanceRepo.createAttendanceRecord({
                userId: user.id,
                userName: user.name,
                userRole: user.role,
                date: today,
                notes: notes || null,
                checkInLat: lat,
                checkInLng: lng,
                checkInAccuracy: typeof accuracy === 'number' ? accuracy : null,
                checkInGeofenceStatus: geofence.status,
                checkInDistanceMeters: geofence.distanceMeters,
                ...snapshotFieldsFromLocation(workLocation, 'checkIn'),
            });

            if (
                isConfidentOutsideStatus(geofence.status) &&
                user.role !== 'Driver' &&
                geofence.distanceMeters !== null
            ) {
                alertSuperAdmins(user.name, user.role, geofence.distanceMeters).catch(() => {});
            }

            res.status(201).json(record);
        } catch (error: unknown) {
            if (error instanceof AttendanceDuplicateDayError) {
                return res.status(409).json({ error: error.message, code: error.code });
            }
            res.status(500).json({ error: 'Failed to mark attendance' });
        }
    },
);

router.post(
    '/api/admin/attendance/check-out',
    requireAdminAuth,
    attendanceCheckInGuard,
    async (req: Request, res: Response) => {
        try {
            const user = await userRepo.getUser(req.session.adminUserId!);
            if (!user) return res.status(404).json({ error: 'User not found' });

            const today = getAttendanceDateDhaka();
            const existing = await attendanceRepo.getTodayAttendanceForUser(user.id, today);

            if (!existing) return res.status(400).json({ error: 'No check-in record found for today' });
            if (existing.checkOutTime) return res.status(400).json({ error: 'Already checked out today' });

            const { lat, lng, accuracy } = req.body;

            const coordError = validateCoords(lat, lng);
            if (coordError) return res.status(400).json({ error: coordError.replace('check-in', 'check-out') });

            const workLocation = await resolveAttendanceWorkLocation(user);
            const geofence = evaluateGeofenceForWorkLocation(workLocation, {
                latitude: lat,
                longitude: lng,
                accuracy,
            });

            const updated = await attendanceRepo.updateAttendanceRecord(existing.id, {
                checkOutTime: new Date(),
                checkOutLat: lat,
                checkOutLng: lng,
                checkOutAccuracy: typeof accuracy === 'number' ? accuracy : null,
                checkOutGeofenceStatus: geofence.status,
                checkOutDistanceMeters: geofence.distanceMeters,
                ...snapshotFieldsFromLocation(workLocation, 'checkOut'),
            });

            res.json(updated);
        } catch {
            res.status(500).json({ error: 'Failed to mark check-out' });
        }
    },
);

// ============================================
// WORKFORCE-UX-01 — attendance corrections (foundation)
// ============================================

const correctionManageGuard = requireGranularPermission("attendance.manageCorrections");

router.post(
    "/api/admin/attendance/corrections",
    requireAdminAuth,
    attendanceCheckInGuard,
    async (req: Request, res: Response) => {
        try {
            const userId = req.session.adminUserId!;
            const { createCorrectionRequest, toCorrectionDto, AttendanceCorrectionError } = await import(
                "../services/attendance-correction.service.js"
            );
            const created = await createCorrectionRequest({
                attendanceRecordId: req.body?.attendanceRecordId,
                requesterUserId: userId,
                proposedCheckInTime: req.body?.proposedCheckInTime,
                proposedCheckOutTime: req.body?.proposedCheckOutTime,
                requestReason: req.body?.requestReason,
            });
            res.status(201).json(toCorrectionDto(created));
        } catch (error: any) {
            if (error?.name === "AttendanceCorrectionError") {
                return res.status(error.status).json({ error: error.message, code: error.code, details: error.details });
            }
            res.status(500).json({ error: "Failed to create correction request" });
        }
    },
);

router.get(
    "/api/admin/attendance/corrections/mine",
    requireAdminAuth,
    attendanceCheckInGuard,
    async (req: Request, res: Response) => {
        try {
            const { listMyCorrections, toCorrectionDto } = await import(
                "../services/attendance-correction.service.js"
            );
            const rows = await listMyCorrections(req.session.adminUserId!);
            res.json({ items: rows.map(toCorrectionDto) });
        } catch {
            res.status(500).json({ error: "Failed to list correction requests" });
        }
    },
);

router.post(
    "/api/admin/attendance/corrections/:id/cancel",
    requireAdminAuth,
    attendanceCheckInGuard,
    async (req: Request, res: Response) => {
        try {
            const { cancelMyCorrection, toCorrectionDto, AttendanceCorrectionError } = await import(
                "../services/attendance-correction.service.js"
            );
            const updated = await cancelMyCorrection(req.params.id, req.session.adminUserId!);
            res.json(toCorrectionDto(updated));
        } catch (error: any) {
            if (error?.name === "AttendanceCorrectionError") {
                return res.status(error.status).json({ error: error.message, code: error.code });
            }
            res.status(500).json({ error: "Failed to cancel correction request" });
        }
    },
);

router.get(
    "/api/admin/attendance/corrections/pending",
    requireAdminAuth,
    correctionManageGuard,
    async (_req: Request, res: Response) => {
        try {
            const { listPendingCorrectionsForManagers, toCorrectionDto } = await import(
                "../services/attendance-correction.service.js"
            );
            const rows = await listPendingCorrectionsForManagers();
            res.json({
                items: rows.map((r) => ({
                    ...toCorrectionDto(r),
                    attendanceDate: r.attendanceDate,
                    userName: r.userName,
                })),
            });
        } catch {
            res.status(500).json({ error: "Failed to list pending corrections" });
        }
    },
);

router.post(
    "/api/admin/attendance/corrections/:id/review",
    requireAdminAuth,
    correctionManageGuard,
    async (req: Request, res: Response) => {
        try {
            const reviewerId = req.session.adminUserId!;
            const { reviewCorrection, toCorrectionDto, AttendanceCorrectionError } = await import(
                "../services/attendance-correction.service.js"
            );
            const updated = await reviewCorrection({
                requestId: req.params.id,
                reviewerUserId: reviewerId,
                decision: req.body?.decision,
                reviewReason: req.body?.reviewReason,
            });
            res.json(toCorrectionDto(updated));
        } catch (error: any) {
            if (error?.name === "AttendanceCorrectionError") {
                return res.status(error.status).json({ error: error.message, code: error.code });
            }
            res.status(500).json({ error: "Failed to review correction request" });
        }
    },
);

export default router;
