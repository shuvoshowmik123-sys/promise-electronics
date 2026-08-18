/**
 * A fare that was refused must not come back as free.
 *
 * The reader in shared/pickup-pricing.ts turns anything it dislikes into null,
 * and the tier extras then fall back to zero. Zero is not "unset" — it is a
 * price, and it says collection costs the customer nothing.
 *
 * QA typed -25 into the Same-day extra and got a cheerful "Fares updated". The
 * value came back as 0. Same for clearing the box. So the most expensive tier
 * the shop sells — a driver crossing Dhaka the same afternoon — silently became
 * free, with a success message on top. The screen said one thing and the till
 * did another, which is the worst way for money to go missing.
 *
 * The rule was always written down in that file's own comments: "A negative
 * fare would pay the customer to have their television collected", and "Zero is
 * a price ... a malformed setting must never accidentally say that." It was
 * enforced on read, where it was too late to tell anybody. It is now enforced
 * on save.
 */
import { describe, expect, it } from "vitest";

import {
    PICKUP_AREA_FARES_KEY,
    PICKUP_ANYWHERE_ELSE_KEY,
    PICKUP_TIER_EXTRAS_KEY,
    PICKUP_RING_FARES_KEY,
    readTierExtras,
    validatePickupSetting,
} from "../shared/pickup-pricing.js";

const tiers = (value: unknown) => JSON.stringify(value);

describe("a fare the shop did not mean is refused when it is saved", () => {
    it("refuses the negative that QA actually typed", () => {
        const errors = validatePickupSetting(
            PICKUP_TIER_EXTRAS_KEY,
            tiers({ flexible: 0, chooseDay: 150, sameDay: -25 }),
        );
        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe("sameDay");
        expect(errors[0].reason).toMatch(/negative/i);
    });

    it("refuses a blank, because blank read back as free", () => {
        const errors = validatePickupSetting(
            PICKUP_TIER_EXTRAS_KEY,
            tiers({ flexible: 0, chooseDay: 150, sameDay: "" }),
        );
        expect(errors).toHaveLength(1);
        expect(errors[0].field).toBe("sameDay");
        expect(errors[0].reason).toMatch(/blank/i);
    });

    it("reports every bad field at once, not one per attempt", () => {
        const errors = validatePickupSetting(
            PICKUP_TIER_EXTRAS_KEY,
            tiers({ flexible: -1, chooseDay: "abc", sameDay: -25 }),
        );
        expect(errors).toHaveLength(3);
        expect(errors.map((e) => e.field).sort()).toEqual(["chooseDay", "flexible", "sameDay"]);
    });

    it("accepts a real set of fares, including a genuine zero", () => {
        // flexible is normally free, and that is a decision, not a mistake.
        expect(validatePickupSetting(
            PICKUP_TIER_EXTRAS_KEY,
            tiers({ flexible: 0, chooseDay: 150, sameDay: 400 }),
        )).toEqual([]);
    });

    it("catches a typing slip that would bankrupt a customer", () => {
        const errors = validatePickupSetting(PICKUP_TIER_EXTRAS_KEY, tiers({ flexible: 0, chooseDay: 0, sameDay: 4000000 }));
        expect(errors[0].reason).toMatch(/typing slip/i);
    });
});

describe("an area is only rated when it has both numbers", () => {
    it("refuses a circle with no radius", () => {
        const errors = validatePickupSetting(
            PICKUP_AREA_FARES_KEY,
            JSON.stringify({ "area-1": { fare: 200, radiusKm: 0 } }),
        );
        expect(errors.some((e) => e.field === "area-1.radiusKm")).toBe(true);
    });

    it("refuses a negative area fare", () => {
        const errors = validatePickupSetting(
            PICKUP_AREA_FARES_KEY,
            JSON.stringify({ "area-1": { fare: -200, radiusKm: 8 } }),
        );
        expect(errors.some((e) => e.field === "area-1.fare")).toBe(true);
    });

    it("accepts the shop's own area as QA entered it", () => {
        expect(validatePickupSetting(
            PICKUP_AREA_FARES_KEY,
            JSON.stringify({ "dhanmondi-a": { fare: 200, radiusKm: 8 } }),
        )).toEqual([]);
    });
});

describe("not set is still allowed to mean not set", () => {
    it("lets the anywhere-else fare be absent", () => {
        // Null here is honest: the shop has not decided. Zero would be a claim
        // that collection from anywhere in the country is free.
        expect(validatePickupSetting(PICKUP_ANYWHERE_ELSE_KEY, null)).toEqual([]);
        expect(validatePickupSetting(PICKUP_ANYWHERE_ELSE_KEY, "null")).toEqual([]);
    });

    it("still refuses a negative one", () => {
        expect(validatePickupSetting(PICKUP_ANYWHERE_ELSE_KEY, "-500")).toHaveLength(1);
    });

    it("ignores settings that are not fares", () => {
        expect(validatePickupSetting("site_name", "Promise Electronics")).toEqual([]);
    });
});

describe("a ring's discount threshold", () => {
    const ring = (discountOver: unknown) =>
        JSON.stringify([{ radiusKm: 5, fare: 150, discountOver }]);

    it("may be left blank, because no discount is a real decision", () => {
        expect(validatePickupSetting(PICKUP_RING_FARES_KEY, ring(null))).toEqual([]);
        expect(validatePickupSetting(PICKUP_RING_FARES_KEY, ring(""))).toEqual([]);
        expect(validatePickupSetting(PICKUP_RING_FARES_KEY, JSON.stringify([{ radiusKm: 5, fare: 150 }]))).toEqual([]);
    });

    it("refuses zero, which would discount every collection in the ring", () => {
        /**
         * Zero reads as "always" and is far more likely to be a slip — a half
         * typed number, a cleared box that snapped back. Somebody who genuinely
         * means every repair qualifies can type 1.
         */
        const errors = validatePickupSetting(PICKUP_RING_FARES_KEY, ring(0));
        expect(errors.some((e) => e.field === "ring1.discountOver")).toBe(true);
    });

    it("refuses a negative one", () => {
        expect(validatePickupSetting(PICKUP_RING_FARES_KEY, ring(-500))).toHaveLength(1);
    });

    it("accepts a real threshold", () => {
        expect(validatePickupSetting(PICKUP_RING_FARES_KEY, ring(3000))).toEqual([]);
    });
});

/**
 * The message has to tell somebody what to fix.
 *
 * QA typed 1.5.5 into a fare and was told "A fare cannot be left blank" —
 * looking at a box that plainly had 1.5.5 in it. The refusal was correct and
 * the explanation was nonsense, which is worse than either alone: the shop
 * worker now distrusts the message AND still does not know what to do.
 *
 * The cause was the editor calling Number() before sending. Number("1.5.5") is
 * NaN, JSON.stringify writes NaN as null, and null means blank. So the one
 * validator never saw what was typed.
 */
describe("a rejected ring says what is actually wrong", () => {
    const rings = (over: Record<string, unknown>) => JSON.stringify([
        { radiusKm: "5", fare: "150", discountOver: null },
        { radiusKm: "10", fare: "250", discountOver: null },
        { ...{ radiusKm: "14", fare: "350", discountOver: null }, ...over },
    ]);
    const reasonFor = (over: Record<string, unknown>, field: string) =>
        validatePickupSetting(PICKUP_RING_FARES_KEY, rings(over))
            .find((e) => e.field === field)?.reason;

    it("calls a malformed fare a malformed number, not a blank one", () => {
        expect(reasonFor({ fare: "1.5.5" }, "ring3.fare")).toBe("That is not a number.");
    });

    it("calls letters in a distance box what they are", () => {
        expect(reasonFor({ radiusKm: "abc" }, "ring3.radiusKm")).toBe("That is not a number.");
    });

    it("still calls a genuinely blank fare blank", () => {
        expect(reasonFor({ fare: "" }, "ring3.fare"))
            .toContain("cannot be left blank");
    });

    it("names BOTH rings when two share a distance", () => {
        // "Two rings both end at 10 km" is true and useless on a five-row form.
        const errors = validatePickupSetting(PICKUP_RING_FARES_KEY, rings({ radiusKm: "10" }));
        const clash = errors.find((e) => e.reason.includes("both end at"));
        expect(clash?.reason).toBe("Ring 2 and ring 3 both end at 10 km. Each ring needs its own distance.");
        // And it must be attributed to a ring, so the form can mark the row.
        expect(clash?.field).toBe("ring3.radiusKm");
    });

    it("accepts the numbers the editor sends as text", () => {
        // The editor now posts raw strings; valid ones must still pass.
        expect(validatePickupSetting(PICKUP_RING_FARES_KEY, rings({}))).toEqual([]);
    });
});

describe("the reader is why this matters", () => {
    it("would have turned the refused value into free", () => {
        /**
         * This is the behaviour being defended against, asserted so nobody
         * removes the validation thinking the reader is safe. It is safe from
         * crashing; it is not safe from lying.
         */
        const extras = readTierExtras([
            { key: PICKUP_TIER_EXTRAS_KEY, value: tiers({ flexible: 0, chooseDay: 150, sameDay: -25 }) },
        ]);
        expect(extras.sameDay).toBe(0);
    });
});
