/**
 * Mobile Workforce Routes
 *
 * Compact APIs for the new workforce Flutter app:
 * attendance, assigned jobs, notifications, and Super Admin alerts.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db.js';
import * as schema from '../../shared/schema.js';
import {
    attendanceRepo,
    jobRepo,
    notificationRepo,
    orderRepo,
    serviceRequestRepo,
    userRepo,
    workLocationRepo,
} from '../repositories/index.js';
import { pushService } from '../pushService.js';
import { requireAdminAuth } from './middleware/auth.js';
import {
    buildWorkStatusBanner,
    canAdvanceMobileJob,
    evaluateGeofence,
    sortMobileJobs,
} from '../lib/mobile-workforce.js';
import { jobService } from '../services/job.service.js';

const router = Router();

const locationPayloadSchema = z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(500).optional(),
    timestamp: z.string().datetime().optional(),
});

const attendancePayloadSchema = locationPayloadSchema.extend({
    notes: z.string().max(1000).optional(),
    reason: z.string().max(500).optional(),
    devicePlatform: z.string().max(50).optional(),
    deviceId: z.string().max(255).optional(),
});

const mobileJobStatusSchema = z.object({
    status: z.string().min(1),
    note: z.string().max(1000).optional(),
});

const mobileJobNoteSchema = z.object({
    note: z.string().min(1).max(1000),
});

const mobileJobMediaSchema = z.object({
    mediaUrl: z.string().url(),
    mediaType: z.enum(['image', 'video', 'file']).default('image'),
    caption: z.string().max(500).optional(),
});

const deviceTokenSchema = z.object({
    token: z.string().min(10),
    platform: z.string().default('android'),
});

const mobileServiceRequestListQuerySchema = z.object({
    stage: z.string().min(1).optional(),
    quoteStatus: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const mobileQuickServiceRequestSchema = z.object({
    customerName: z.string().min(1).max(255),
    phone: z.string().min(6).max(50),
    brand: z.string().min(1).max(255),
    primaryIssue: z.string().min(1).max(500),
    requestIntent: z.enum(['quote', 'repair']).default('repair'),
    serviceMode: z.enum(['pickup', 'service_center']).default('service_center'),
    notes: z.string().max(1000).optional(),
});

const mobileServiceRequestAdvanceSchema = z.object({
    nextStage: z.string().min(1),
    note: z.string().max(1000).optional(),
});

function parseJsonArray<T>(value: string | null | undefined, fallback: T[]): T[] {
    if (!value) {
        return fallback;
    }

    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

function appendTimelineEntry(existing: string | null | undefined, entry: string): string {
    return [existing?.trim(), entry].filter(Boolean).join('\n\n');
}

function isMissingSchemaDependency(error: unknown): boolean {
    const pgError = error as { code?: string; message?: string } | undefined;
    if (pgError?.code === '42P01' || pgError?.code === '42703') {
        return true;
    }

    const message = String(pgError?.message ?? '');
    return message.includes('does not exist');
}

async function withSchemaFallback<T>(
    label: string,
    task: () => Promise<T>,
    fallback: T,
): Promise<T> {
    try {
        return await task();
    } catch (error) {
        if (isMissingSchemaDependency(error)) {
            console.warn(`[Mobile Bootstrap] ${label} unavailable, using fallback:`, (error as any)?.message ?? error);
            return fallback;
        }
        throw error;
    }
}

async function resolveAssignedWorkLocation(user: schema.User): Promise<schema.WorkLocation | null> {
    try {
        if (user.defaultWorkLocationId) {
            const direct = await workLocationRepo.getWorkLocation(user.defaultWorkLocationId);
            if (direct) {
                return direct;
            }
        }

        const activeLocations = await workLocationRepo.getActiveWorkLocations();

        if (user.storeId) {
            const storeLocation = activeLocations.find((location) => location.storeId === user.storeId);
            if (storeLocation) {
                return storeLocation;
            }
        }

        return activeLocations.length === 1 ? activeLocations[0] : null;
    } catch (error) {
        if (isMissingSchemaDependency(error)) {
            console.warn('[Mobile Bootstrap] Work location schema unavailable, continuing without location.');
            return null;
        }
        throw error;
    }
}

function validateFreshLocation(payload: z.infer<typeof locationPayloadSchema>): string | null {
    if (!payload.timestamp) {
        return null;
    }

    const submittedAt = new Date(payload.timestamp);
    if (Number.isNaN(submittedAt.getTime())) {
        return 'Invalid GPS timestamp.';
    }

    const ageMs = Date.now() - submittedAt.getTime();
    if (ageMs > 5 * 60 * 1000) {
        return 'GPS location is stale. Refresh your location and try again.';
    }

    return null;
}

function getCurrentUser(req: Request): schema.User {
    return (req as Request & { user: schema.User }).user;
}

function requireAnyRole(user: schema.User, roles: string[], res: Response): boolean {
    if (roles.includes(user.role)) {
        return true;
    }

    res.status(403).json({ error: 'You do not have access to this mobile feature' });
    return false;
}

function normalizePhone(value: string | null | undefined): string {
    if (!value) {
        return '';
    }

    let digits = value.replace(/\D/g, '');
    if (digits.startsWith('880')) {
        digits = digits.slice(3);
    }
    if (digits.startsWith('0')) {
        digits = digits.slice(1);
    }
    return digits.slice(-10);
}

function buildNotificationDeepLinkTarget(notification: schema.Notification): string {
    if (notification.jobId) {
        return `/jobs/${notification.jobId}`;
    }

    const fullText = `${notification.title} ${notification.message}`.toLowerCase();

    if (fullText.includes('attendance') || fullText.includes('off-site') || fullText.includes('exception')) {
        return '/workforce/attendance';
    }

    if (fullText.includes('approval')) {
        return '/approvals';
    }

    if (notification.link?.includes('/admin#attendance')) {
        return '/workforce/attendance';
    }

    return '/alerts';
}

function getJobQueueCategory(job: schema.JobTicket): 'urgent' | 'in_progress' | 'parts_pending' | 'ready' | 'queue' {
    if (job.status === 'Ready' || job.status === 'Ready for Delivery') {
        return 'ready';
    }

    if (job.status === 'Parts Pending') {
        return 'parts_pending';
    }

    if (job.status === 'In Progress') {
        return 'in_progress';
    }

    if (job.priority === 'Urgent' || job.priority === 'High') {
        return 'urgent';
    }

    return 'queue';
}

function buildHomeActions(params: {
    user: schema.User;
    hasLocation: boolean;
    todayRecord: schema.AttendanceRecord | null;
    visibleJobs: schema.JobTicket[];
    unreadNotifications: schema.Notification[];
    activeApprovals: number;
}) {
    const { user, hasLocation, todayRecord, visibleJobs, unreadNotifications, activeApprovals } = params;
    const hasUnreadAlerts = unreadNotifications.length > 0;
    const needsCheckIn = hasLocation && (!todayRecord || Boolean(todayRecord.checkOutTime));

    let primaryActionKey: 'check_in' | 'open_alerts' | 'review_approvals' | 'none' = 'none';
    let primaryActionLabel = 'No action required';

    if (needsCheckIn) {
        primaryActionKey = 'check_in';
        primaryActionLabel = 'Check in';
    } else if (user.role === 'Super Admin' && activeApprovals > 0) {
        primaryActionKey = 'review_approvals';
        primaryActionLabel = 'Review approvals';
    } else if (hasUnreadAlerts) {
        primaryActionKey = 'open_alerts';
        primaryActionLabel = 'Open alerts';
    }

    let firstActionKey: 'review_approvals' | 'open_job' | 'open_alerts' | 'none' = 'none';
    let firstActionLabel = 'No action required';

    if (user.role === 'Super Admin' && activeApprovals > 0) {
        firstActionKey = 'review_approvals';
        firstActionLabel = 'Review approvals';
    } else if (visibleJobs.length > 0) {
        firstActionKey = 'open_job';
        firstActionLabel = 'Open next job';
    } else if (hasUnreadAlerts) {
        firstActionKey = 'open_alerts';
        firstActionLabel = 'Open alerts';
    }

    return {
        primaryActionKey,
        primaryActionLabel,
        firstActionKey,
        firstActionLabel,
    };
}

async function notifySuperAdminsAboutOffsiteAttendance(params: {
    actor: schema.User;
    workLocation: schema.WorkLocation;
    action: 'check-in' | 'check-out';
    distanceMeters: number;
    reason: string;
}) {
    const superAdmins = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.role, 'Super Admin'));

    const message = `${params.actor.name} ${params.action} outside ${params.workLocation.name} (${params.distanceMeters}m). Reason: ${params.reason}`;

    await Promise.allSettled(superAdmins.map(async (admin) => {
        await notificationRepo.createNotification({
            userId: admin.id,
            title: `Off-site attendance: ${params.actor.name}`,
            message,
            type: 'warning',
            link: `/admin#attendance?userId=${params.actor.id}`,
            contextType: 'admin',
        });

        await pushService.sendToUser(admin.id, {
            title: `Off-site attendance: ${params.actor.name}`,
            body: message,
            data: {
                type: 'attendance_exception',
                userId: params.actor.id,
                action: params.action,
            },
        });
    }));
}

function mapMobileModules(user: schema.User) {
    const isTechnician = user.role === 'Technician';
    const isSuperAdmin = user.role === 'Super Admin';

    return {
        attendance: true,
        jobs: isTechnician || isSuperAdmin,
        notifications: true,
        superAdmin: isSuperAdmin,
    };
}

function getMobileVisibleJobs(user: schema.User, allJobs: schema.JobTicket[]) {
    if (user.role === 'Technician') {
        return allJobs.filter((job) =>
            job.assignedTechnicianId === user.id || job.technician === user.name
        );
    }

    if (user.role === 'Super Admin') {
        return allJobs.filter((job) => job.status !== 'Completed' && job.status !== 'Delivered').slice(0, 50);
    }

    return [] as schema.JobTicket[];
}

function buildAttendanceTimeline(record: schema.AttendanceRecord | null, location: schema.WorkLocation | null) {
    if (!record) {
        return [];
    }

    const timeline = [
        {
            label: 'Check-in captured',
            value: record.checkInTime?.toISOString() ?? null,
            detail: record.checkInGeofenceStatus === 'outside'
                ? `Outside ${location?.name || 'assigned branch'}`
                : `Inside ${location?.name || 'assigned branch'}`,
            tone: record.checkInGeofenceStatus === 'outside' ? 'warning' : 'success',
        },
    ];

    if (record.checkOutTime) {
        timeline.push({
            label: 'Check-out captured',
            value: record.checkOutTime.toISOString(),
            detail: record.checkOutGeofenceStatus === 'outside'
                ? `Outside ${location?.name || 'assigned branch'}`
                : `Inside ${location?.name || 'assigned branch'}`,
            tone: record.checkOutGeofenceStatus === 'outside' ? 'warning' : 'success',
        });
    }

    return timeline;
}

function summarizeJob(job: schema.JobTicket) {
    return {
        id: job.id,
        device: job.device,
        customer: job.customer,
        status: job.status,
        priority: job.priority || 'Medium',
        queueCategory: getJobQueueCategory(job),
        nextAction:
            job.status === 'Ready' ? 'Approve release' :
            job.status === 'Parts Pending' ? 'Add note' :
            job.status === 'Completed' ? 'View proof' :
            'Open job',
        deadlineLabel: job.deadline?.toISOString() || job.slaDeadline?.toISOString() || null,
    };
}

function summarizeServiceRequest(request: schema.ServiceRequest) {
    return {
        id: request.id,
        ticketNumber: request.ticketNumber,
        customerName: request.customerName,
        phone: request.phone,
        brand: request.brand,
        primaryIssue: request.primaryIssue,
        stage: request.stage,
        status: request.status,
        quoteStatus: request.quoteStatus,
        requestIntent: request.requestIntent,
        serviceMode: request.serviceMode,
        createdAt: request.createdAt.toISOString(),
    };
}

function summarizeNotification(notification: schema.Notification) {
    const isUrgent = notification.type === 'warning' || /urgent|off-site|exception/i.test(notification.title);
    const needsAction = /approval|action|pending/i.test(notification.title + ' ' + notification.message);

    return {
        ...notification,
        category: isUrgent ? 'urgent' : needsAction ? 'action' : 'update',
        priority: isUrgent ? 'high' : needsAction ? 'medium' : 'normal',
        deepLinkTarget: buildNotificationDeepLinkTarget(notification),
    };
}

router.get('/api/mobile/bootstrap', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const user = getCurrentUser(req);
        const [location, todayRecord, unreadNotifications, allJobs] = await Promise.all([
            withSchemaFallback(
                'work locations',
                () => resolveAssignedWorkLocation(user),
                null,
            ),
            withSchemaFallback(
                'attendance records',
                () => attendanceRepo.getTodayAttendanceForUser(user.id, new Date().toISOString().split('T')[0]),
                null,
            ),
            withSchemaFallback(
                'notifications',
                () => notificationRepo.getUnreadNotifications(user.id),
                [] as schema.Notification[],
            ),
            withSchemaFallback(
                'job tickets',
                () => jobRepo.getAllJobTickets(),
                [] as schema.JobTicket[],
            ),
        ]);

        const banner = buildWorkStatusBanner(todayRecord ?? null, location, null);
        const visibleJobs = getMobileVisibleJobs(user, allJobs);
        const activeApprovals = user.role === 'Super Admin'
            ? unreadNotifications.filter((notification) => /approval|exception/i.test(notification.title + ' ' + notification.message)).length
            : 0;
        const homeActions = buildHomeActions({
            user,
            hasLocation: Boolean(location),
            todayRecord: todayRecord ?? null,
            visibleJobs,
            unreadNotifications,
            activeApprovals,
        });

        res.json({
            user: {
                id: user.id,
                name: user.name,
                role: user.role,
                email: user.email,
                phone: user.phone,
            },
            assignedWorkLocation: location,
            modules: mapMobileModules(user),
            attendance: todayRecord,
            workStatus: banner,
            unreadCounts: {
                notifications: unreadNotifications.length,
            },
            branch: location ? {
                id: location.id,
                name: location.name,
                radiusMeters: location.radiusMeters,
            } : null,
            homeSummary: {
                primaryAction: homeActions.primaryActionLabel,
                primaryActionKey: homeActions.primaryActionKey,
                primaryActionLabel: homeActions.primaryActionLabel,
                firstActionKey: homeActions.firstActionKey,
                firstActionLabel: homeActions.firstActionLabel,
                counters: {
                    jobs: visibleJobs.length,
                    urgentJobs: visibleJobs.filter((job) => job.priority === 'Urgent').length,
                    approvals: activeApprovals,
                },
                firstJob: visibleJobs[0] ? summarizeJob(visibleJobs[0]) : null,
            },
        });
    } catch (error) {
        console.error('Failed to load mobile bootstrap:', error);
        res.status(500).json({ error: 'Failed to load mobile bootstrap' });
    }
});

router.get('/api/mobile/attendance/status', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const user = getCurrentUser(req);
        const location = await resolveAssignedWorkLocation(user);
        const today = new Date().toISOString().split('T')[0];
        const record = await attendanceRepo.getTodayAttendanceForUser(user.id, today);

        let geofence = null;
        const latitude = req.query.latitude ? Number(req.query.latitude) : null;
        const longitude = req.query.longitude ? Number(req.query.longitude) : null;
        const accuracy = req.query.accuracy ? Number(req.query.accuracy) : null;

        if (location && latitude !== null && longitude !== null) {
            geofence = evaluateGeofence(location, {
                latitude,
                longitude,
                accuracy,
            });
        }

        const banner = buildWorkStatusBanner(record ?? null, location, geofence);

        res.json({
            assignedWorkLocation: location,
            branchName: location?.name || null,
            todayRecord: record ?? null,
            geofence,
            workStatus: banner,
            requiresAssignment: !location,
            reasonRequired: geofence?.status === 'outside' || false,
            distanceMeters: geofence?.distanceMeters ?? record?.checkInDistanceMeters ?? 0,
            todayTimeline: buildAttendanceTimeline(record ?? null, location),
        });
    } catch (error) {
        console.error('Failed to load mobile attendance status:', error);
        res.status(500).json({ error: 'Failed to load mobile attendance status' });
    }
});

router.post('/api/mobile/attendance/check-in', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const payload = attendancePayloadSchema.safeParse(req.body);
        if (!payload.success) {
            return res.status(400).json({ error: payload.error.issues[0]?.message || 'Invalid attendance payload' });
        }

        const freshnessError = validateFreshLocation(payload.data);
        if (freshnessError) {
            return res.status(400).json({ error: freshnessError });
        }

        const user = getCurrentUser(req);
        const workLocation = await resolveAssignedWorkLocation(user);
        if (!workLocation) {
            return res.status(400).json({ error: 'No work location assigned for this user' });
        }

        const today = new Date().toISOString().split('T')[0];
        const existing = await attendanceRepo.getTodayAttendanceForUser(user.id, today);
        if (existing) {
            return res.status(400).json({ error: 'Already checked in today', record: existing });
        }

        const geofence = evaluateGeofence(workLocation, payload.data);
        if (geofence.status === 'outside' && !payload.data.reason?.trim()) {
            return res.status(400).json({ error: 'Reason is required for off-site attendance' });
        }

        const record = await attendanceRepo.createAttendanceRecord({
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            workLocationId: workLocation.id,
            checkInLat: payload.data.latitude,
            checkInLng: payload.data.longitude,
            checkInAccuracy: payload.data.accuracy ?? null,
            checkInDistanceMeters: geofence.distanceMeters,
            checkInGeofenceStatus: geofence.status,
            checkInReason: payload.data.reason?.trim() || null,
            devicePlatform: payload.data.devicePlatform || 'android',
            deviceId: payload.data.deviceId || null,
            date: today,
            notes: payload.data.notes?.trim() || null,
        });

        if (geofence.status === 'outside') {
            await notifySuperAdminsAboutOffsiteAttendance({
                actor: user,
                workLocation,
                action: 'check-in',
                distanceMeters: geofence.distanceMeters,
                reason: payload.data.reason!.trim(),
            });
        }

        res.status(201).json({
            record,
            geofence,
            assignedWorkLocation: workLocation,
            workStatus: buildWorkStatusBanner(record, workLocation, geofence),
        });
    } catch (error) {
        console.error('Failed to check in from mobile:', error);
        res.status(500).json({ error: 'Failed to check in' });
    }
});

router.post('/api/mobile/attendance/check-out', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const payload = attendancePayloadSchema.safeParse(req.body);
        if (!payload.success) {
            return res.status(400).json({ error: payload.error.issues[0]?.message || 'Invalid attendance payload' });
        }

        const freshnessError = validateFreshLocation(payload.data);
        if (freshnessError) {
            return res.status(400).json({ error: freshnessError });
        }

        const user = getCurrentUser(req);
        const workLocation = await resolveAssignedWorkLocation(user);
        if (!workLocation) {
            return res.status(400).json({ error: 'No work location assigned for this user' });
        }

        const today = new Date().toISOString().split('T')[0];
        const existing = await attendanceRepo.getTodayAttendanceForUser(user.id, today);

        if (!existing) {
            return res.status(400).json({ error: 'No check-in record found for today' });
        }

        if (existing.checkOutTime) {
            return res.status(400).json({ error: 'Already checked out today' });
        }

        const geofence = evaluateGeofence(workLocation, payload.data);
        if (geofence.status === 'outside' && !payload.data.reason?.trim()) {
            return res.status(400).json({ error: 'Reason is required for off-site attendance' });
        }

        const updated = await attendanceRepo.updateAttendanceRecord(existing.id, {
            checkOutTime: new Date(),
            checkOutLat: payload.data.latitude,
            checkOutLng: payload.data.longitude,
            checkOutAccuracy: payload.data.accuracy ?? null,
            checkOutDistanceMeters: geofence.distanceMeters,
            checkOutGeofenceStatus: geofence.status,
            checkOutReason: payload.data.reason?.trim() || null,
            devicePlatform: payload.data.devicePlatform || existing.devicePlatform || 'android',
            deviceId: payload.data.deviceId || existing.deviceId || null,
            notes: payload.data.notes?.trim()
                ? appendTimelineEntry(existing.notes, `[Check-out note] ${payload.data.notes.trim()}`)
                : existing.notes,
        });

        if (geofence.status === 'outside') {
            await notifySuperAdminsAboutOffsiteAttendance({
                actor: user,
                workLocation,
                action: 'check-out',
                distanceMeters: geofence.distanceMeters,
                reason: payload.data.reason!.trim(),
            });
        }

        res.json({
            record: updated,
            geofence,
            assignedWorkLocation: workLocation,
            workStatus: buildWorkStatusBanner(updated ?? null, workLocation, geofence),
        });
    } catch (error) {
        console.error('Failed to check out from mobile:', error);
        res.status(500).json({ error: 'Failed to check out' });
    }
});

router.get('/api/mobile/action-queue', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const user = getCurrentUser(req);
        if (!requireAnyRole(user, ['Super Admin'], res)) {
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        const [serviceRequests, orders, attendanceRecords, workLocations] = await Promise.all([
            serviceRequestRepo.getAllServiceRequests(),
            orderRepo.getAllOrders(),
            attendanceRepo.getAttendanceByDate(today),
            workLocationRepo.getAllWorkLocations(),
        ]);

        const locationMap = new Map(workLocations.map((location) => [location.id, location]));

        const serviceRequestItems = serviceRequests
            .filter((request) => request.stage === 'intake' || request.quoteStatus === 'Pending')
            .map((request) => ({
                type: 'service_request' as const,
                id: request.id,
                title: `${request.brand} - ${request.primaryIssue}`,
                subtitle: `${request.customerName} - ${request.phone}`,
                timestamp: request.createdAt.toISOString(),
                urgency: request.quoteStatus === 'Pending' ? 'high' as const : 'normal' as const,
                deepLinkTarget: `/approvals/service-request/${request.id}`,
                actions: ['view', 'advance'],
            }));

        const pendingOrders = orders.filter((order) => order.status === 'Pending');
        const orderItemsByOrderId = new Map<string, Awaited<ReturnType<typeof orderRepo.getOrderItems>>>();
        await Promise.all(pendingOrders.map(async (order) => {
            orderItemsByOrderId.set(order.id, await orderRepo.getOrderItems(order.id));
        }));

        const orderQueueItems = pendingOrders.map((order) => {
            const items = orderItemsByOrderId.get(order.id) || [];
            return {
                type: 'order' as const,
                id: order.id,
                title: order.orderNumber ? `Order ${order.orderNumber}` : `Order ${order.id}`,
                subtitle: `${items.length} items - BDT ${Number(order.total || 0).toFixed(2)}`,
                timestamp: order.createdAt.toISOString(),
                urgency: 'normal' as const,
                deepLinkTarget: `/approvals/order/${order.id}`,
                actions: ['accept', 'decline', 'view'],
            };
        });

        const attendanceExceptions = attendanceRecords
            .filter((record) => record.checkInGeofenceStatus === 'outside' || record.checkOutGeofenceStatus === 'outside')
            .map((record) => {
                const distanceMeters = Math.round(
                    record.checkOutGeofenceStatus === 'outside'
                        ? Number(record.checkOutDistanceMeters || 0)
                        : Number(record.checkInDistanceMeters || 0)
                );
                const reason = record.checkOutGeofenceStatus === 'outside'
                    ? record.checkOutReason
                    : record.checkInReason;
                const timestamp = record.checkOutGeofenceStatus === 'outside' && record.checkOutTime
                    ? record.checkOutTime.toISOString()
                    : record.checkInTime.toISOString();
                const workLocation = record.workLocationId ? locationMap.get(record.workLocationId) : undefined;

                return {
                    type: 'attendance_exception' as const,
                    id: record.id,
                    title: `${record.userName} off-site attendance`,
                    subtitle: `${distanceMeters}m from ${workLocation?.name || 'assigned branch'} - ${reason || 'No reason provided'}`,
                    timestamp,
                    urgency: 'high' as const,
                    deepLinkTarget: `/workforce/attendance/${record.userId}`,
                    actions: ['acknowledge', 'view'],
                };
            });

        const items = [...serviceRequestItems, ...orderQueueItems, ...attendanceExceptions]
            .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());

        res.json({
            items,
            counts: {
                serviceRequests: serviceRequestItems.length,
                orders: orderQueueItems.length,
                attendanceExceptions: attendanceExceptions.length,
                total: items.length,
            },
        });
    } catch (error) {
        console.error('Failed to load mobile action queue:', error);
        res.status(500).json({ error: 'Failed to load mobile action queue' });
    }
});

router.get('/api/mobile/service-requests', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const user = getCurrentUser(req);
        if (!requireAnyRole(user, ['Super Admin', 'Manager'], res)) {
            return;
        }

        const query = mobileServiceRequestListQuerySchema.safeParse(req.query);
        if (!query.success) {
            return res.status(400).json({ error: query.error.issues[0]?.message || 'Invalid service request query' });
        }

        let items = await serviceRequestRepo.getAllServiceRequests();

        if (query.data.stage) {
            items = items.filter((request) => request.stage === query.data.stage);
        }

        if (query.data.quoteStatus) {
            items = items.filter((request) => request.quoteStatus === query.data.quoteStatus);
        }

        const total = items.length;

        res.json({
            items: items.slice(0, query.data.limit).map(summarizeServiceRequest),
            total,
        });
    } catch (error) {
        console.error('Failed to load mobile service requests:', error);
        res.status(500).json({ error: 'Failed to load mobile service requests' });
    }
});

router.post('/api/mobile/service-requests/quick', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const user = getCurrentUser(req);
        if (!requireAnyRole(user, ['Super Admin', 'Manager'], res)) {
            return;
        }

        const payload = mobileQuickServiceRequestSchema.safeParse(req.body);
        if (!payload.success) {
            return res.status(400).json({ error: payload.error.issues[0]?.message || 'Invalid quick service request payload' });
        }

        const servicePreference = payload.data.serviceMode === 'pickup' ? 'home_pickup' : 'service_center';
        const created = await serviceRequestRepo.createServiceRequest({
            customerName: payload.data.customerName.trim(),
            phone: payload.data.phone.trim(),
            brand: payload.data.brand.trim(),
            primaryIssue: payload.data.primaryIssue.trim(),
            requestIntent: payload.data.requestIntent,
            serviceMode: payload.data.serviceMode,
            servicePreference,
            description: payload.data.notes?.trim() || undefined,
            status: 'Pending',
        } as any);

        const existingCustomer = await userRepo.getUserByPhoneNormalized(payload.data.phone.trim());
        if (existingCustomer) {
            await serviceRequestRepo.linkServiceRequestToCustomer(created.id, existingCustomer.id);
        }

        res.status(201).json(summarizeServiceRequest(created));
    } catch (error) {
        console.error('Failed to create mobile quick service request:', error);
        res.status(500).json({ error: 'Failed to create service request' });
    }
});

router.post('/api/mobile/service-requests/:id/advance', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const user = getCurrentUser(req);
        if (!requireAnyRole(user, ['Super Admin', 'Manager'], res)) {
            return;
        }

        const payload = mobileServiceRequestAdvanceSchema.safeParse(req.body);
        if (!payload.success) {
            return res.status(400).json({ error: payload.error.issues[0]?.message || 'Invalid service request advance payload' });
        }

        const result = await jobService.transitionStage(
            req.params.id,
            payload.data.nextStage,
            user.name
        );

        if (payload.data.note?.trim()) {
            await serviceRequestRepo.createServiceRequestEvent({
                serviceRequestId: req.params.id,
                status: 'Internal Note',
                message: payload.data.note.trim(),
                actor: user.name,
            });
        }

        res.json({
            serviceRequest: summarizeServiceRequest(result.serviceRequest),
            advancedTo: payload.data.nextStage,
        });
    } catch (error: any) {
        console.error('Failed to advance mobile service request:', error);
        res.status(400).json({ error: error.message || 'Failed to advance service request' });
    }
});

router.get('/api/mobile/lookup', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const rawQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        if (!rawQuery) {
            return res.status(400).json({ error: 'Query is required' });
        }

        const normalizedQuery = normalizePhone(rawQuery);
        const queryLower = rawQuery.toLowerCase();
        const phoneLike = rawQuery.startsWith('01') || rawQuery.startsWith('+880') || normalizedQuery.length >= 10;
        const serviceTicketLike = queryLower.startsWith('srv-') || queryLower.startsWith('sr-');

        const [jobs, serviceRequests] = await Promise.all([
            jobRepo.getAllJobTickets(),
            serviceRequestRepo.getAllServiceRequests(),
        ]);

        const results: Array<Record<string, unknown>> = [];

        if (phoneLike) {
            for (const job of jobs) {
                if (normalizePhone(job.customerPhone) === normalizedQuery) {
                    results.push({
                        type: 'job',
                        id: job.id,
                        title: `${job.device || 'Device'} - ${job.issue || 'Issue not provided'}`,
                        customer: job.customer,
                        phone: job.customerPhone,
                        status: job.status,
                        createdAt: job.createdAt.toISOString(),
                        deepLinkTarget: `/jobs/${job.id}`,
                    });
                }
            }

            for (const request of serviceRequests) {
                if (normalizePhone(request.phone) === normalizedQuery) {
                    results.push({
                        type: 'service_request',
                        id: request.id,
                        ticketNumber: request.ticketNumber,
                        title: `${request.brand} - ${request.primaryIssue}`,
                        customer: request.customerName,
                        phone: request.phone,
                        status: request.stage || request.status,
                        createdAt: request.createdAt.toISOString(),
                        deepLinkTarget: `/service-requests/${request.id}`,
                    });
                }
            }
        } else if (serviceTicketLike) {
            for (const request of serviceRequests) {
                if ((request.ticketNumber || '').toLowerCase().includes(queryLower)) {
                    results.push({
                        type: 'service_request',
                        id: request.id,
                        ticketNumber: request.ticketNumber,
                        title: `${request.brand} - ${request.primaryIssue}`,
                        customer: request.customerName,
                        phone: request.phone,
                        status: request.stage || request.status,
                        createdAt: request.createdAt.toISOString(),
                        deepLinkTarget: `/service-requests/${request.id}`,
                    });
                }
            }
        } else {
            for (const job of jobs) {
                const customerName = (job.customer || '').toLowerCase();
                if (job.id.toLowerCase().includes(queryLower) || customerName.includes(queryLower)) {
                    results.push({
                        type: 'job',
                        id: job.id,
                        title: `${job.device || 'Device'} - ${job.issue || 'Issue not provided'}`,
                        customer: job.customer,
                        phone: job.customerPhone,
                        status: job.status,
                        createdAt: job.createdAt.toISOString(),
                        deepLinkTarget: `/jobs/${job.id}`,
                    });
                }
            }

            for (const request of serviceRequests) {
                if ((request.customerName || '').toLowerCase().includes(queryLower)) {
                    results.push({
                        type: 'service_request',
                        id: request.id,
                        ticketNumber: request.ticketNumber,
                        title: `${request.brand} - ${request.primaryIssue}`,
                        customer: request.customerName,
                        phone: request.phone,
                        status: request.stage || request.status,
                        createdAt: request.createdAt.toISOString(),
                        deepLinkTarget: `/service-requests/${request.id}`,
                    });
                }
            }
        }

        const dedupedResults = Array.from(
            new Map(results.map((result) => [`${result.type}:${result.id}`, result])).values()
        )
            .sort((left, right) => new Date(String(right.createdAt)).getTime() - new Date(String(left.createdAt)).getTime())
            .slice(0, 10);

        res.json({ results: dedupedResults });
    } catch (error) {
        console.error('Failed to perform mobile lookup:', error);
        res.status(500).json({ error: 'Failed to perform lookup' });
    }
});

router.get('/api/mobile/jobs', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const user = getCurrentUser(req);
        const allJobs = await jobRepo.getAllJobTickets();
        const jobs = sortMobileJobs(getMobileVisibleJobs(user, allJobs));

        res.json({
            items: jobs.map(summarizeJob),
            summaryCounts: {
                total: jobs.length,
                urgent: jobs.filter((job) => job.priority === 'Urgent').length,
                inProgress: jobs.filter((job) => job.status === 'In Progress').length,
                partsPending: jobs.filter((job) => job.status === 'Parts Pending').length,
                ready: jobs.filter((job) => job.status === 'Ready').length,
            },
        });
    } catch (error) {
        console.error('Failed to load mobile jobs:', error);
        res.status(500).json({ error: 'Failed to load mobile jobs' });
    }
});

router.get('/api/mobile/jobs/:id', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const user = getCurrentUser(req);
        const job = await jobRepo.getJobTicket(req.params.id);

        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const canView = user.role === 'Super Admin' ||
            user.role === 'Manager' ||
            job.assignedTechnicianId === user.id ||
            job.technician === user.name;

        if (!canView) {
            return res.status(403).json({ error: 'You do not have access to this job' });
        }

        res.json({
            ...job,
            mobileMedia: parseJsonArray(job.mobileMedia, []),
        });
    } catch (error) {
        console.error('Failed to load mobile job detail:', error);
        res.status(500).json({ error: 'Failed to load mobile job detail' });
    }
});

router.post('/api/mobile/jobs/:id/status', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const payload = mobileJobStatusSchema.safeParse(req.body);
        if (!payload.success) {
            return res.status(400).json({ error: payload.error.issues[0]?.message || 'Invalid job status payload' });
        }

        const user = getCurrentUser(req);
        const job = await jobRepo.getJobTicket(req.params.id);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const canManage = user.role === 'Super Admin' ||
            job.assignedTechnicianId === user.id ||
            job.technician === user.name;

        if (!canManage) {
            return res.status(403).json({ error: 'You do not have access to update this job' });
        }

        if (user.role !== 'Super Admin' && !canAdvanceMobileJob(job.status, payload.data.status)) {
            return res.status(400).json({ error: `Mobile update from ${job.status} to ${payload.data.status} is not allowed` });
        }

        const timelineEntry = `[${new Date().toISOString()}] ${user.name} updated status to ${payload.data.status}${payload.data.note ? `: ${payload.data.note}` : ''}`;
        const updatedJob = await jobRepo.updateJobTicket(job.id, {
            status: payload.data.status,
            notes: appendTimelineEntry(job.notes, timelineEntry),
            lastMobileUpdateAt: new Date(),
        });

        res.json(updatedJob);
    } catch (error) {
        console.error('Failed to update mobile job status:', error);
        res.status(500).json({ error: 'Failed to update job status' });
    }
});

router.post('/api/mobile/jobs/:id/note', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const payload = mobileJobNoteSchema.safeParse(req.body);
        if (!payload.success) {
            return res.status(400).json({ error: payload.error.issues[0]?.message || 'Invalid note payload' });
        }

        const user = getCurrentUser(req);
        const job = await jobRepo.getJobTicket(req.params.id);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const canManage = user.role === 'Super Admin' ||
            job.assignedTechnicianId === user.id ||
            job.technician === user.name;

        if (!canManage) {
            return res.status(403).json({ error: 'You do not have access to update this job' });
        }

        const noteEntry = `[${new Date().toISOString()}] ${user.name}: ${payload.data.note}`;
        const updatedJob = await jobRepo.updateJobTicket(job.id, {
            notes: appendTimelineEntry(job.notes, noteEntry),
            lastMobileUpdateAt: new Date(),
        });

        res.json(updatedJob);
    } catch (error) {
        console.error('Failed to add mobile job note:', error);
        res.status(500).json({ error: 'Failed to add job note' });
    }
});

router.post('/api/mobile/jobs/:id/media', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const payload = mobileJobMediaSchema.safeParse(req.body);
        if (!payload.success) {
            return res.status(400).json({ error: payload.error.issues[0]?.message || 'Invalid media payload' });
        }

        const user = getCurrentUser(req);
        const job = await jobRepo.getJobTicket(req.params.id);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const canManage = user.role === 'Super Admin' ||
            job.assignedTechnicianId === user.id ||
            job.technician === user.name;

        if (!canManage) {
            return res.status(403).json({ error: 'You do not have access to update this job' });
        }

        const mediaEntries = parseJsonArray<Record<string, unknown>>(job.mobileMedia, []);
        mediaEntries.push({
            id: nanoid(),
            url: payload.data.mediaUrl,
            type: payload.data.mediaType,
            caption: payload.data.caption || null,
            createdAt: new Date().toISOString(),
            createdById: user.id,
            createdByName: user.name,
        });

        const updatedJob = await jobRepo.updateJobTicket(job.id, {
            mobileMedia: JSON.stringify(mediaEntries),
            lastMobileUpdateAt: new Date(),
        });

        res.json({
            ...updatedJob,
            mobileMedia: mediaEntries,
        });
    } catch (error) {
        console.error('Failed to attach mobile media:', error);
        res.status(500).json({ error: 'Failed to attach job media' });
    }
});

router.get('/api/mobile/notifications', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const user = getCurrentUser(req);
        const notifications = await notificationRepo.getNotifications(user.id);
        const summarized = notifications.map(summarizeNotification);
        res.json({
            items: summarized,
            unreadCount: summarized.filter((item) => !item.read).length,
        });
    } catch (error) {
        console.error('Failed to load mobile notifications:', error);
        res.status(500).json({ error: 'Failed to load notifications' });
    }
});

router.post('/api/mobile/notifications/:id/read', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const user = getCurrentUser(req);
        const notification = await notificationRepo.getNotification(req.params.id);
        if (!notification || notification.userId !== user.id) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        const updated = await notificationRepo.markNotificationAsRead(notification.id);
        res.json(updated);
    } catch (error) {
        console.error('Failed to mark mobile notification as read:', error);
        res.status(500).json({ error: 'Failed to update notification' });
    }
});

router.post('/api/mobile/device-token', requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const payload = deviceTokenSchema.safeParse(req.body);
        if (!payload.success) {
            return res.status(400).json({ error: payload.error.issues[0]?.message || 'Invalid device token payload' });
        }

        const user = getCurrentUser(req);
        await pushService.registerDeviceToken(user.id, payload.data.token, payload.data.platform);

        res.status(201).json({ success: true });
    } catch (error) {
        console.error('Failed to register mobile device token:', error);
        res.status(500).json({ error: 'Failed to register device token' });
    }
});

export default router;
