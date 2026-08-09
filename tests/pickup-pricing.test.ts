/**
 * The shop has stored a pickup tier on every request for a long time and never
 * attached a price to it. The portal promises "an extra charge applies" and the
 * till has never asked for it.
 *
 * This is the calculator every screen will read, so the number on the homepage
 * is the number on the invoice. If those two disagree, the argument at the
 * counter is unwinnable.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  quotePickup,
  readTierPrices,
  readZoneBands,
  readFreeOverAmount,
  readHoldDays,
  toPickupTier,
  DEFAULT_TIER_PRICES,
  DEFAULT_FREE_OVER,
  DEFAULT_HOLD_DAYS,
} from "../shared/pickup-pricing.js";

const S = (obj: Record<string, unknown>) =>
  Object.entries(obj).map(([key, value]) => ({ key, value: JSON.stringify(value) }));

describe("what the customer pays", () => {
  it("charges the tier when nothing else applies", () => {
    const q = quotePickup({ tier: "flexible", settings: [] });
    expect(q.amount).toBe(DEFAULT_TIER_PRICES.flexible);
    expect(q.waived).toBe(false);
  });

  it("goes up with the tier, not down with a discount", () => {
    const flexible = quotePickup({ tier: "flexible", settings: [] }).amount;
    const chooseDay = quotePickup({ tier: "chooseDay", settings: [] }).amount;
    const sameDay = quotePickup({ tier: "sameDay", settings: [] }).amount;
    expect(chooseDay).toBeGreaterThan(flexible);
    expect(sameDay).toBeGreaterThan(chooseDay);
  });

  it("adds the zone rather than multiplying it", () => {
    /**
     * Three tiers times four zones is twelve numbers nobody can hold in their
     * head or change safely. A base plus an add-on is two, and staff can
     * explain either at the counter.
     */
    const settings = S({
      pickup_tier_prices: { flexible: 300, chooseDay: 600, sameDay: 1200 },
      pickup_zone_bands: [{ label: "Outer Dhaka", areaIds: ["area-far"], extra: 250 }],
    });
    const q = quotePickup({ tier: "chooseDay", serviceAreaId: "area-far", settings });
    expect(q.amount).toBe(850);        // 600 + 250, not 600 * something
    expect(q.tierAmount).toBe(600);
    expect(q.zoneAmount).toBe(250);
    expect(q.zoneLabel).toBe("Outer Dhaka");
  });

  it("charges no extra for an area in no band", () => {
    const settings = S({ pickup_zone_bands: [{ label: "Far", areaIds: ["x"], extra: 500 }] });
    const q = quotePickup({ tier: "flexible", serviceAreaId: "somewhere-else", settings });
    expect(q.zoneAmount).toBe(0);
    expect(q.zoneLabel).toBeNull();
  });

  it("waives it on a big repair, and says what waived it", () => {
    // Turns the fee from a barrier into a reason to go ahead, and the jobs that
    // cost most to collect are the ones worth collecting.
    const settings = S({ pickup_free_over: 3000 });
    const q = quotePickup({ tier: "sameDay", repairEstimate: 4200, settings });
    expect(q.amount).toBe(0);
    expect(q.waived).toBe(true);
    expect(q.waivedOver).toBe(3000);
  });

  it("waives on the low end of the range, never the optimistic one", () => {
    /**
     * Waiving on the top of the range would promise free collection on a repair
     * that then comes in under the threshold. Taking it back afterwards is
     * worse than never having offered.
     */
    const settings = S({ pickup_free_over: 3000 });
    expect(quotePickup({ tier: "flexible", repairEstimate: 2999, settings }).waived).toBe(false);
    expect(quotePickup({ tier: "flexible", repairEstimate: 3000, settings }).waived).toBe(true);
  });
});

describe("bad settings must never make collection free", () => {
  it("falls back to real prices when the value is unusable", () => {
    for (const bad of ["", "not json", "{}", "null"]) {
      const q = quotePickup({ tier: "flexible", settings: [{ key: "pickup_tier_prices", value: bad }] });
      expect(q.amount, bad).toBe(DEFAULT_TIER_PRICES.flexible);
    }
  });

  it("ignores a negative or absurd stored price", () => {
    // A stored -500 would otherwise pay the customer to have the TV collected.
    const settings = S({ pickup_tier_prices: { flexible: -500, chooseDay: 999999999, sameDay: 1200 } });
    const prices = readTierPrices(settings);
    expect(prices.flexible).toBe(DEFAULT_TIER_PRICES.flexible);
    expect(prices.chooseDay).toBe(DEFAULT_TIER_PRICES.chooseDay);
    expect(prices.sameDay).toBe(1200);
  });

  it("drops a zone band with no areas in it", () => {
    const settings = S({ pickup_zone_bands: [{ label: "Empty", areaIds: [], extra: 500 }] });
    expect(readZoneBands(settings)).toEqual([]);
  });

  it("keeps the defaults for the threshold and the hold period", () => {
    expect(readFreeOverAmount([])).toBe(DEFAULT_FREE_OVER);
    expect(readHoldDays([])).toBe(DEFAULT_HOLD_DAYS);
    expect(DEFAULT_HOLD_DAYS).toBe(30); // one month, as agreed
  });
});

describe("reading a tier that was stored as free text", () => {
  it("maps the old words onto the three tiers", () => {
    expect(toPickupTier("Emergency")).toBe("sameDay");
    expect(toPickupTier("Priority")).toBe("chooseDay");
    expect(toPickupTier("Regular")).toBe("flexible");
    expect(toPickupTier("same day")).toBe("sameDay");
  });

  it("treats anything unrecognised as the cheapest, never the dearest", () => {
    // Guessing upward would overcharge somebody on a value we did not
    // understand; guessing downward only ever costs us.
    for (const junk of ["", null, undefined, "banana"]) {
      expect(toPickupTier(junk), String(junk)).toBe("flexible");
    }
  });
});

describe("the settings keys are actually saveable", () => {
  it("all four are allowed by the settings route", () => {
    // Four keys were added to Settings once before and rejected silently
    // because nobody added them to this list.
    const ROUTE = readFileSync(join(process.cwd(), "server/routes/settings.routes.ts"), "utf8");
    for (const key of ["pickup_tier_prices", "pickup_zone_bands", "pickup_free_over", "pickup_hold_days"]) {
      expect(ROUTE, `${key} cannot be saved`).toContain(`'${key}'`);
    }
  });
});
