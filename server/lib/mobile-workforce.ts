import type { AttendanceRecord, JobTicket, WorkLocation } from '../../shared/schema.js';
import {
    evaluateGeofenceForWorkLocation,
    haversineMeters,
    isConfidentOutsideStatus,
    type CanonicalGeofenceStatus,
    type GeofenceEvaluation as SharedGeofenceEvaluation,
} from '../services/attendance-location.service.js';

export type GeofenceInput = {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
};

/** Mobile-facing geofence shape (canonical statuses). */
export type GeofenceEvaluation = {
    status: CanonicalGeofenceStatus;
    distanceMeters: number;
    radiusMeters: number;
    accuracy: number | null;
};

export function calculateDistanceMeters(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number
): number {
    return Math.round(haversineMeters(fromLat, fromLng, toLat, toLng));
}

export function evaluateGeofence(
    location: WorkLocation,
    input: GeofenceInput
): GeofenceEvaluation {
    const result: SharedGeofenceEvaluation = evaluateGeofenceForWorkLocation(location, {
        latitude: input.latitude,
        longitude: input.longitude,
        accuracy: input.accuracy,
    });
    return {
        status: result.status,
        distanceMeters: result.distanceMeters ?? 0,
        radiusMeters: result.radiusMeters ?? location.radiusMeters,
        accuracy: result.accuracyMeters,
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
        const liveOutside = isConfidentOutsideStatus(geofence?.status);
        return {
            label: 'Checked Out',
            variant: liveOutside ? 'warning' : 'neutral',
            message: liveOutside
                ? `You are outside ${location.name}. Attendance will be flagged.`
                : geofence?.status === 'accuracy_uncertain'
                    ? `GPS accuracy is uncertain relative to ${location.name}.`
                    : `You are within ${location.name}.`,
        };
    }

    if (!record.checkOutTime) {
        const offsite =
            isConfidentOutsideStatus(record.checkInGeofenceStatus) ||
            isConfidentOutsideStatus(geofence?.status);
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

/** Canonical JOB_STATUSES only (JOB-CUSTOMER-WORKFLOW-01A). Legacy aliases normalized before check. */
export const MOBILE_JOB_TRANSITIONS: Record<string, string[]> = {
    Pending: ['In Progress', 'Waiting on Parts'],
    Diagnosing: ['In Progress', 'Waiting on Parts'],
    'In Progress': ['Waiting on Parts', 'Testing', 'On Workbench'],
    'On Workbench': ['Waiting on Parts', 'Testing', 'In Progress'],
    'Pending Parts': ['In Progress'],
    'Waiting on Parts': ['In Progress'],
    Testing: ['Ready', 'In Progress'],
    Ready: ['Completed', 'Delivered'],
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
