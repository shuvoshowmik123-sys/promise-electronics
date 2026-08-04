/**
 * Regression tests for the crash that took out every service-request drawer.
 *
 * Timeline: a drawer holding a stale snapshot made a successful transfer look
 * like it had done nothing. The fix synced the drawer from the refreshed list —
 * and shipped an infinite render loop (React #185) that crashed the drawer on
 * open, found by production QA within the hour.
 *
 * Two causes. The effect listing its own state as a dependency while setting it
 * is fixed at the call site. The other is here: these fields arrive as `null`
 * from the list endpoint and `undefined` from some card sources, so a `!==`
 * comparison answered "changed" on every render forever.
 *
 * The first test below is the one that would have caught it.
 */
import { describe, expect, it } from "vitest";
import { shouldAdoptRefreshedRequest } from "../client/src/lib/service-request-drawer-sync";

describe("null vs undefined must not read as a change", () => {
    it("does not adopt when a field is null on one side and undefined on the other", () => {
        // The exact shape that looped: list rows carry convertedJobId: null,
        // some card sources omit it entirely.
        expect(
            shouldAdoptRefreshedRequest(
                { stage: "intake", status: "Pending", trackingStatus: "Booked" },
                { stage: "intake", status: "Pending", trackingStatus: "Booked", convertedJobId: null },
            ),
        ).toBe(false);
    });

    it("treats null and undefined as the same absent value in every field", () => {
        const withNulls = { stage: null, status: null, trackingStatus: null, convertedJobId: null };
        const withUndefined = {};
        expect(shouldAdoptRefreshedRequest(withNulls, withUndefined)).toBe(false);
        expect(shouldAdoptRefreshedRequest(withUndefined, withNulls)).toBe(false);
    });

    it("is stable — re-running against its own result never asks to adopt again", () => {
        // A loop needs the answer to stay true. This is that property, directly.
        const current = { stage: "intake", status: "Pending", trackingStatus: null };
        const fresh = { stage: "pickup_scheduled", status: "Pending", trackingStatus: null, convertedJobId: null };

        expect(shouldAdoptRefreshedRequest(current, fresh)).toBe(true);
        // After adopting, the same comparison must settle.
        expect(shouldAdoptRefreshedRequest(fresh, fresh)).toBe(false);
        expect(shouldAdoptRefreshedRequest(fresh, { ...fresh })).toBe(false);
    });
});

describe("real changes are still adopted", () => {
    it("adopts a stage change — the whole point of the sync", () => {
        expect(
            shouldAdoptRefreshedRequest(
                { stage: "intake" },
                { stage: "pickup_scheduled" },
            ),
        ).toBe(true);
    });

    it("adopts a status change", () => {
        expect(shouldAdoptRefreshedRequest({ status: "Pending" }, { status: "Completed" })).toBe(true);
    });

    it("adopts a trackingStatus change", () => {
        expect(
            shouldAdoptRefreshedRequest({ trackingStatus: "Booked" }, { trackingStatus: "Device Collected" }),
        ).toBe(true);
    });

    it("adopts when a request becomes linked to a job", () => {
        expect(
            shouldAdoptRefreshedRequest({ convertedJobId: null }, { convertedJobId: "JOB-1" }),
        ).toBe(true);
    });

    it("ignores a row that differs only by object identity", () => {
        const fields = { stage: "intake", status: "Pending", trackingStatus: "Booked", convertedJobId: null };
        expect(shouldAdoptRefreshedRequest(fields, { ...fields })).toBe(false);
    });
});

describe("missing rows are left alone", () => {
    it("returns false when there is no open drawer", () => {
        expect(shouldAdoptRefreshedRequest(null, { stage: "intake" })).toBe(false);
        expect(shouldAdoptRefreshedRequest(undefined, { stage: "intake" })).toBe(false);
    });

    it("returns false when the row is no longer in the list", () => {
        // e.g. filtered out or on another page — keep showing what we have
        // rather than blanking the drawer.
        expect(shouldAdoptRefreshedRequest({ stage: "intake" }, null)).toBe(false);
        expect(shouldAdoptRefreshedRequest({ stage: "intake" }, undefined)).toBe(false);
    });
});
