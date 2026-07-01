/**
 * Attendance Routes
 *
 * Handles staff attendance check-in/check-out with GPS geofence enforcement.
 *
 * Env vars (optional):
 *   OFFICE_LAT              - Office latitude  (e.g. 23.8103)
 *   OFFICE_LNG              - Office longitude (e.g. 90.4125)
 *   OFFICE_RADIUS_METERS    - Geofence radius in metres (default: 200)
 *
 * If OFFICE_LAT/LNG are not set, geofence status is stored as "unverified".
 */

import { Router, Request, Response } from 'express';
import { attendanceRepo, userRepo, notificationRepo, db, schema, eq } from '../repositories/index.js';
import { requireAdminAuth, requireAnyPermission } from './middleware/auth.js';

const router = Router();

// ============================================
// Geofence helpers
// ============================================

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
}

function getOfficeConfig(): { lat: number; lng: number; radius: number } | null {
    const lat = parseFloat(process.env.OFFICE_LAT ?? '');
    const lng = parseFloat(process.env.OFFICE_LNG ?? '');
    if (isNaN(lat) || isNaN(lng)) return null;
    const radius = parseFloat(process.env.OFFICE_RADIUS_METERS ?? '200');
    return { lat, lng, radius: isNaN(radius) ? 200 : radius };
}

type GeofenceStatus = 'inside_office' | 'outside_office' | 'unverified';

function calcGeofence(lat: number, lng: number): { status: GeofenceStatus; distanceMeters: number | null } {
    const office = getOfficeConfig();
    if (!office) return { status: 'unverified', distanceMeters: null };
    const dist = Math.round(haversineMeters(lat, lng, office.lat, office.lng));
    return {
        status: dist <= office.radius ? 'inside_office' : 'outside_office',
        distanceMeters: dist,
    };
}

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
    const distKm = (distanceMeters / 1000).toFixed(1);
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
                    message: `${userName} (${userRole}) checked in ${distKm}km away from the office.`,
                    type: 'warning',
                    link: '/admin#attendance',
                    contextType: 'admin',
                }),
            ),
        );
    } catch { /* fire-and-forget — never block check-in */ }
}

// ============================================
// Query routes
// ============================================

router.get(
    '/api/admin/attendance',
    requireAdminAuth,
    requireAnyPermission(['attendance', 'reports']),
    async (req: Request, res: Response) => {
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
    requireAnyPermission(['attendance', 'reports']),
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
    requireAnyPermission(['attendance', 'reports']),
    async (req: Request, res: Response) => {
        try {
            res.json(await attendanceRepo.getAttendanceByUserId(req.params.userId));
        } catch {
            res.status(500).json({ error: 'Failed to fetch attendance records' });
        }
    },
);

router.get('/api/admin/attendance/today', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const record = await attendanceRepo.getTodayAttendanceForUser(req.session.adminUserId!, today);
        res.json(record ?? null);
    } catch {
        res.status(500).json({ error: "Failed to fetch today's attendance" });
    }
});

// ============================================
// Check-in
// ============================================

router.post('/api/admin/attendance/check-in', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.adminUserId!);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const today = new Date().toISOString().split('T')[0];
        const existing = await attendanceRepo.getTodayAttendanceForUser(user.id, today);
        if (existing) return res.status(400).json({ error: 'Already checked in today', record: existing });

        const { notes, lat, lng, accuracy } = req.body;

        const coordError = validateCoords(lat, lng);
        if (coordError) return res.status(400).json({ error: coordError });

        const { status: geofenceStatus, distanceMeters } = calcGeofence(lat, lng);

        const record = await attendanceRepo.createAttendanceRecord({
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            date: today,
            notes: notes || null,
            checkInLat: lat,
            checkInLng: lng,
            checkInAccuracy: typeof accuracy === 'number' ? accuracy : null,
            checkInGeofenceStatus: geofenceStatus,
            checkInDistanceMeters: distanceMeters,
        });

        // Notify Super Admins for non-Driver outside-office check-ins (fire-and-forget)
        if (geofenceStatus === 'outside_office' && user.role !== 'Driver' && distanceMeters !== null) {
            alertSuperAdmins(user.name, user.role, distanceMeters).catch(() => {});
        }

        res.status(201).json(record);
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark attendance' });
    }
});

// ============================================
// Check-out
// ============================================

router.post('/api/admin/attendance/check-out', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const existing = await attendanceRepo.getTodayAttendanceForUser(req.session.adminUserId!, today);

        if (!existing) return res.status(400).json({ error: 'No check-in record found for today' });
        if (existing.checkOutTime) return res.status(400).json({ error: 'Already checked out today' });

        const { lat, lng, accuracy } = req.body;

        const coordError = validateCoords(lat, lng);
        if (coordError) return res.status(400).json({ error: coordError.replace('check-in', 'check-out') });

        const { status: geofenceStatus, distanceMeters } = calcGeofence(lat, lng);

        const updated = await attendanceRepo.updateAttendanceRecord(existing.id, {
            checkOutTime: new Date(),
            checkOutLat: lat,
            checkOutLng: lng,
            checkOutAccuracy: typeof accuracy === 'number' ? accuracy : null,
            checkOutGeofenceStatus: geofenceStatus,
            checkOutDistanceMeters: distanceMeters,
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Failed to mark check-out' });
    }
});

export default router;
