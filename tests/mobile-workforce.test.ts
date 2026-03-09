import { describe, expect, it } from 'vitest';

import {
    buildWorkStatusBanner,
    calculateDistanceMeters,
    canAdvanceMobileJob,
    evaluateGeofence,
} from '../server/lib/mobile-workforce.js';

describe('mobile workforce helpers', () => {
    const workLocation = {
        id: 'loc-1',
        name: 'Dhaka Service Hub',
        storeId: null,
        latitude: 23.8103,
        longitude: 90.4125,
        radiusMeters: 150,
        status: 'Active',
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    it('calculates distance between two points in meters', () => {
        const distance = calculateDistanceMeters(23.8103, 90.4125, 23.8113, 90.4125);
        expect(distance).toBeGreaterThan(100);
        expect(distance).toBeLessThan(120);
    });

    it('evaluates geofence status correctly', () => {
        const inside = evaluateGeofence(workLocation, {
            latitude: 23.8104,
            longitude: 90.4125,
            accuracy: 15,
        });
        const outside = evaluateGeofence(workLocation, {
            latitude: 23.8145,
            longitude: 90.4125,
            accuracy: 10,
        });

        expect(inside.status).toBe('inside');
        expect(outside.status).toBe('outside');
        expect(outside.distanceMeters).toBeGreaterThan(workLocation.radiusMeters);
    });

    it('only allows defined mobile job transitions', () => {
        expect(canAdvanceMobileJob('Pending', 'In Progress')).toBe(true);
        expect(canAdvanceMobileJob('In Progress', 'Ready for Delivery')).toBe(true);
        expect(canAdvanceMobileJob('Completed', 'In Progress')).toBe(false);
    });

    it('builds an off-site status banner when an employee is checked in outside the branch', () => {
        const banner = buildWorkStatusBanner(
            {
                id: 'attendance-1',
                userId: 'user-1',
                userName: 'Farid',
                userRole: 'Technician',
                workLocationId: workLocation.id,
                checkInTime: new Date(),
                checkOutTime: null,
                checkInLat: 23.8145,
                checkInLng: 90.4125,
                checkOutLat: null,
                checkOutLng: null,
                checkInAccuracy: 10,
                checkOutAccuracy: null,
                checkInDistanceMeters: 460,
                checkOutDistanceMeters: null,
                checkInGeofenceStatus: 'outside',
                checkOutGeofenceStatus: null,
                checkInReason: 'On-site client visit',
                checkOutReason: null,
                devicePlatform: 'android',
                deviceId: 'device-1',
                date: '2026-03-06',
                notes: null,
            },
            workLocation,
            {
                status: 'outside',
                distanceMeters: 460,
                radiusMeters: 150,
                accuracy: 10,
            }
        );

        expect(banner.label).toBe('Checked In Off-site');
        expect(banner.variant).toBe('warning');
    });
});
