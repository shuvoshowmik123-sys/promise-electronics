import type { AttendanceRecord, JobTicket, WorkLocation } from '../../shared/schema.js';

export type GeofenceInput = {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
};

export type GeofenceEvaluation = {
    status: 'inside' | 'outside';
    distanceMeters: number;
    radiusMeters: number;
    accuracy: number | null;
};

const EARTH_RADIUS_METERS = 6371000;

export function calculateDistanceMeters(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number
): number {
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const dLat = toRadians(toLat - fromLat);
    const dLng = toRadians(toLng - fromLng);
    const lat1 = toRadians(fromLat);
    const lat2 = toRadians(toLat);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(EARTH_RADIUS_METERS * c);
}

export function evaluateGeofence(
    location: WorkLocation,
    input: GeofenceInput
): GeofenceEvaluation {
    const distanceMeters = calculateDistanceMeters(
        location.latitude,
        location.longitude,
        input.latitude,
        input.longitude
    );

    return {
        status: distanceMeters <= location.radiusMeters ? 'inside' : 'outside',
        distanceMeters,
        radiusMeters: location.radiusMeters,
        accuracy: input.accuracy ?? null,
    };
}

export function buildWorkStatusBanner(
    record: AttendanceRecord | null,
    location: WorkLocation | null,
    geofence: GeofenceEvaluation | null
): {
    label: 'Checked Out' | 'Checked In On-site' | 'Checked In Off-site' | 'Location Not Assigned';
    variant: 'neutral' | 'success' | 'warning';
    message: string;
} {
    if (!location) {
        return {
            label: 'Location Not Assigned',
            variant: 'warning',
            message: 'Your account is not assigned to a work location yet.',
        };
    }

    if (!record) {
        return {
            label: 'Checked Out',
            variant: geofence?.status === 'outside' ? 'warning' : 'neutral',
            message: geofence?.status === 'outside'
                ? `You are outside ${location.name}. Attendance will be flagged.`
                : `You are within ${location.name}.`,
        };
    }

    if (!record.checkOutTime) {
        const offsite = record.checkInGeofenceStatus === 'outside' || geofence?.status === 'outside';
        return {
            label: offsite ? 'Checked In Off-site' : 'Checked In On-site',
            variant: offsite ? 'warning' : 'success',
            message: offsite
                ? `You are checked in outside ${location.name}.`
                : `You are currently checked in at ${location.name}.`,
        };
    }

    return {
        label: 'Checked Out',
        variant: 'neutral',
        message: `Your last attendance record for ${location.name} is complete.`,
    };
}

export const MOBILE_JOB_TRANSITIONS: Record<string, string[]> = {
    Pending: ['In Progress', 'Parts Pending'],
    Assigned: ['In Progress', 'Parts Pending'],
    Approved: ['In Progress', 'Parts Pending'],
    'In Progress': ['Parts Pending', 'Ready for Delivery', 'Completed'],
    'Parts Pending': ['In Progress'],
    'Ready for Delivery': ['Completed', 'Delivered'],
    Completed: ['Delivered'],
};

export function canAdvanceMobileJob(currentStatus: string, nextStatus: string): boolean {
    const allowedNext = MOBILE_JOB_TRANSITIONS[currentStatus] || [];
    return allowedNext.includes(nextStatus);
}

export function sortMobileJobs(jobs: JobTicket[]): JobTicket[] {
    const priorityRank: Record<string, number> = {
        Urgent: 0,
        High: 1,
        Medium: 2,
        Low: 3,
    };

    return [...jobs].sort((left, right) => {
        const leftPriority = priorityRank[left.priority || 'Low'] ?? 99;
        const rightPriority = priorityRank[right.priority || 'Low'] ?? 99;
        if (leftPriority !== rightPriority) {
            return leftPriority - rightPriority;
        }
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
}
