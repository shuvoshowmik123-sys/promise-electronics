import { describe, expect, it } from "vitest";

import {
    findDroppedBaselinePermissions,
    getNewStaffPermissionMap,
    resolveGranularPermission,
} from "../shared/permission-catalog";

/**
 * The silent baseline revocation.
 *
 * Stored permissions REPLACE the role preset — getEffectivePermissionsForUser
 * returns the parsed column whole whenever it has any keys, and only falls back
 * to the preset when it is empty. So editing a user to ADD permissions also
 * removes every preset key the editor did not resubmit, and nothing says so.
 *
 * That is not hypothetical. A production Driver held eight permissions —
 * viewAssigned, viewAll, reschedule, routePlan, attendance, notifications, and
 * two serviceRequests keys — but not `pickup.confirmHandover`. They could open
 * their route and reschedule it, and could not complete the handover the job
 * consists of. The failure appeared as "Access denied" at a customer's door,
 * long after the save that caused it.
 *
 * These tests pin the detector that now refuses such a save.
 */

/** The exact permission set found on the affected Driver account. */
const BROKEN_DRIVER_SET: Record<string, boolean> = {
    "pickup.viewAssigned": true,
    "pickup.viewAll": true,
    "pickup.reschedule": true,
    "pickup.routePlan": true,
    "attendance.checkIn": true,
    "notifications.view": true,
    "serviceRequests.view": true,
    "serviceRequests.reply": true,
};

describe("findDroppedBaselinePermissions", () => {
    it("catches the real Driver set that lost pickup.confirmHandover", () => {
        const dropped = findDroppedBaselinePermissions("Driver", BROKEN_DRIVER_SET);
        expect(dropped).toContain("pickup.confirmHandover");
    });

    it("the dropped permission is exactly what the custody route demands", () => {
        // The route guards on ['pickup.confirmHandover',
        // 'serviceRequests.confirmCounterCustody']. This set satisfies neither,
        // which is why sending a handover code returned 403.
        expect(resolveGranularPermission(BROKEN_DRIVER_SET, "pickup.confirmHandover")).toBe(false);
        expect(resolveGranularPermission(BROKEN_DRIVER_SET, "serviceRequests.confirmCounterCustody")).toBe(false);
    });

    it("reports nothing for a freshly created user of each role", () => {
        // Creation seeds from the same preset, so a new account must never trip
        // the guard. If this fails, onboarding itself is producing broken staff.
        for (const role of ["Driver", "Technician", "Cashier", "Manager"]) {
            const fresh = getNewStaffPermissionMap(role);
            expect(findDroppedBaselinePermissions(role, fresh), `${role} preset`).toEqual([]);
        }
    });

    it("accepts a superset — adding permissions is not a removal", () => {
        const widened = { ...getNewStaffPermissionMap("Driver"), "pickup.routePlan": true };
        expect(findDroppedBaselinePermissions("Driver", widened)).toEqual([]);
    });

    it("treats a legacy coarse key as covering its granular expansion", () => {
        // `pickup` genuinely grants pickup.confirmHandover through
        // resolveGranularPermission, so holding it is not a drop.
        const legacy = { pickup: true, "attendance.checkIn": true, "notifications.view": true };
        expect(findDroppedBaselinePermissions("Driver", legacy)).toEqual([]);
    });

    it("never blocks a Super Admin", () => {
        expect(findDroppedBaselinePermissions("Super Admin", {})).toEqual([]);
    });

    it("returns nothing for a role with no preset", () => {
        expect(findDroppedBaselinePermissions("NoSuchRole", { anything: true })).toEqual([]);
    });

    it("NEGATIVE CONTROL: an empty set drops the entire baseline", () => {
        // Proves the detector is load-bearing rather than always returning [].
        const dropped = findDroppedBaselinePermissions("Driver", { "some.unrelated.key": true });
        expect(dropped.length).toBeGreaterThan(0);
        expect(dropped).toContain("pickup.confirmHandover");
        expect(dropped).toContain("pickup.viewAssigned");
    });
});
