import { describe, expect, it } from "vitest";
import {
    createAdminMobileChromeScrollState,
    syncAdminMobileChromeScroll,
    updateAdminMobileChromeScroll,
} from "../client/src/lib/admin-mobile-chrome.js";

function scrollSequence(values: number[]) {
    return values.reduce(
        (state, scrollTop) => updateAdminMobileChromeScroll(state, scrollTop),
        createAdminMobileChromeScrollState(),
    );
}

describe("admin mobile chrome scroll state", () => {
    it("hides both chrome regions after sustained downward travel", () => {
        const state = scrollSequence([6, 13, 20, 27]);
        expect(state.hidden).toBe(true);
    });

    it("does not hide from small movement that has not crossed the travel threshold", () => {
        let state = syncAdminMobileChromeScroll(
            createAdminMobileChromeScrollState(false, 0),
            20,
        );
        state = updateAdminMobileChromeScroll(state, 24);
        state = updateAdminMobileChromeScroll(state, 27);
        expect(state.hidden).toBe(false);
    });

    it("reveals after sustained upward travel", () => {
        let state = createAdminMobileChromeScrollState(true, 90);
        state = updateAdminMobileChromeScroll(state, 84);
        state = updateAdminMobileChromeScroll(state, 77);
        expect(state.hidden).toBe(true);
        state = updateAdminMobileChromeScroll(state, 76);
        expect(state.hidden).toBe(false);
    });

    it("resets accumulated travel when direction reverses", () => {
        let state = createAdminMobileChromeScrollState(false, 30);
        state = updateAdminMobileChromeScroll(state, 40);
        state = updateAdminMobileChromeScroll(state, 36);
        state = updateAdminMobileChromeScroll(state, 44);
        expect(state.hidden).toBe(false);
        expect(state.directionalTravel).toBe(8);
    });

    it("does not flap on alternating touch-scroll deltas", () => {
        let state = createAdminMobileChromeScrollState(true, 80);
        const visibility: boolean[] = [];
        for (const scrollTop of [79, 80, 78, 79, 77, 78, 76, 77, 75, 76]) {
            state = updateAdminMobileChromeScroll(state, scrollTop);
            visibility.push(state.hidden);
        }
        expect(new Set(visibility)).toEqual(new Set([true]));
    });

    it("reveals immediately near the top", () => {
        const state = updateAdminMobileChromeScroll(
            createAdminMobileChromeScrollState(true, 40),
            12,
            "up",
        );
        expect(state.hidden).toBe(false);
    });

    it("touch synchronization preserves visible chrome below the old threshold", () => {
        const state = syncAdminMobileChromeScroll(
            createAdminMobileChromeScrollState(false, 0),
            120,
        );
        expect(state.hidden).toBe(false);
        expect(state.directionalTravel).toBe(0);
    });

    it("touch synchronization preserves hidden chrome away from the top", () => {
        const state = syncAdminMobileChromeScroll(
            createAdminMobileChromeScrollState(true, 80),
            81,
        );
        expect(state.hidden).toBe(true);
    });

    it("touch synchronization does not reinterpret a layout clamp as a reveal", () => {
        const state = syncAdminMobileChromeScroll(
            createAdminMobileChromeScrollState(true, 80),
            0,
        );
        expect(state.hidden).toBe(true);
    });

    it("ignores an upward scrollTop clamp during a downward touch gesture", () => {
        const state = updateAdminMobileChromeScroll(
            createAdminMobileChromeScrollState(true, 62),
            2,
            "down",
        );
        expect(state.hidden).toBe(true);
        expect(state.scrollTop).toBe(2);
    });

    it("reveals from a clamped scroll position when the customer gestures upward", () => {
        const state = updateAdminMobileChromeScroll(
            createAdminMobileChromeScrollState(true, 2),
            0,
            "up",
        );
        expect(state.hidden).toBe(false);
    });
});
