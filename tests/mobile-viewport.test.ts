/**
 * Rotating a phone must not hand the user the desktop layout.
 *
 * Reported by the shop owner: turning a phone sideways swapped the customer
 * portal to the desktop view. Detection was `window.innerWidth < 768` and
 * nothing more, so a landscape phone at 844–932px wide read as a desktop. The
 * device had not changed — only its orientation.
 *
 * These pin both halves: a rotated phone stays mobile, and a genuinely small
 * desktop window does not get dragged onto the mobile layout with it.
 */
import { describe, expect, it } from "vitest";
import { detectIsMobileViewport } from "../client/src/lib/mobile-viewport";

const phone = (width: number, height: number) => ({ width, height, coarsePointer: true });
const desktop = (width: number, height: number) => ({ width, height, coarsePointer: false });

describe("a phone stays mobile through rotation", () => {
    it("iPhone 15 portrait", () => {
        expect(detectIsMobileViewport(phone(390, 844))).toBe(true);
    });

    it("iPhone 15 landscape — the reported bug", () => {
        // 844 > 768, which is exactly what defeated the width-only check.
        expect(detectIsMobileViewport(phone(844, 390))).toBe(true);
    });

    it("iPhone 15 Pro Max landscape", () => {
        expect(detectIsMobileViewport(phone(932, 430))).toBe(true);
    });

    it("a small Android landscape", () => {
        expect(detectIsMobileViewport(phone(740, 360))).toBe(true);
    });
});

describe("desktops keep the desktop layout", () => {
    it("a normal desktop window", () => {
        expect(detectIsMobileViewport(desktop(1440, 900))).toBe(false);
    });

    it("a short but wide desktop window — no touch, so not a phone", () => {
        // The height rule must not drag a squashed browser window onto the
        // mobile layout; pointer type is what separates them.
        expect(detectIsMobileViewport(desktop(1200, 420))).toBe(false);
    });

    it("a tablet in landscape is tall enough to stay desktop", () => {
        expect(detectIsMobileViewport(phone(1024, 768))).toBe(false);
    });
});

describe("narrow viewports are mobile regardless of pointer", () => {
    it("a narrow desktop window still gets the mobile layout", () => {
        // Unchanged from the original behaviour, and deliberate: at this width
        // the desktop layout does not fit either.
        expect(detectIsMobileViewport(desktop(500, 900))).toBe(true);
    });

    it("the breakpoint itself is exclusive", () => {
        expect(detectIsMobileViewport(desktop(767, 900))).toBe(true);
        expect(detectIsMobileViewport(desktop(768, 900))).toBe(false);
    });
});
