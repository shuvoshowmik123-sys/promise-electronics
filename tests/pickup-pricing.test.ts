/**
 * The portal promises "an extra charge applies" and the till has never asked
 * for it: pickupTier is stored on every request with no money attached, and
 * pickup_schedules.tierCost defaults to zero.
 *
 * This is the calculator every screen will read, so the number on the homepage
 * is the number on the invoice. Two calculators would make the argument at the
 * counter unwinnable.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  quotePickup,
  minimumFare,
  readAreaFares,
  readHoldDays,
  toPickupTier,
  distanceKm,
  DEFAULT_HOLD_DAYS,
} from "../shared/pickup-pricing.js";

const S = (obj: Record<string, unknown>) =>
  Object.entries(obj).map(([key, value]) => ({ key, value: JSON.stringify(value) }));

const BANANI = { lat: 23.7936, lng: 90.4066 };
const NEARBY = { lat: 23.802, lng: 90.4066 };
const FAR = { lat: 23.95, lng: 90.3 };
const CENTRES = { banani: BANANI };

describe("nothing is priced until somebody prices it", () => {
  it("says nothing at all when no fare has been set", () => {
    /**
     * The point of nil defaults: a shop that has not opened the screen must
     * not have invented numbers quietly become its pricing.
     */
    expect(quotePickup({ tier: "flexible", settings: [] })).toEqual({ configured: false });
    expect(minimumFare([])).toBeNull();
  });

  it("treats a malformed, negative or radius-less fare as unset, never as free", () => {
    // Zero is a price — it says collection is free. A broken setting must not
    // be able to say that by accident.
    for (const bad of [
      { fare: -100, radiusKm: 3 },
      { fare: "abc", radiusKm: 3 },
      { fare: 500, radiusKm: 0 },
    ]) {
      const settings = S({ pickup_area_fares: { banani: bad } });
      expect(Object.keys(readAreaFares(settings)), JSON.stringify(bad)).toHaveLength(0);
    }
  });
});

describe("which circle claims an address", () => {
  const settings = S({
    pickup_area_fares: { banani: { fare: 1000, radiusKm: 3 } },
    pickup_anywhere_else: 1800,
  });

  it("charges the area fare inside the circle", () => {
    const q = quotePickup({ tier: "flexible", point: NEARBY, areaCentres: CENTRES, settings });
    expect(q).toMatchObject({ configured: true, amount: 1000, areaId: "banani", outsideAllAreas: false });
  });

  it("charges the anywhere-else fare outside every circle", () => {
    /**
     * Measured against the radius, not by nearest centre. A twenty-kilometre
     * trip whose nearest circle happens to be Banani must not be charged the
     * Banani fare — that is the leak this exists to close.
     */
    const q = quotePickup({ tier: "flexible", point: FAR, areaCentres: CENTRES, settings });
    expect(q).toMatchObject({ configured: true, amount: 1800, areaId: null, outsideAllAreas: true });
  });

  it("lets the smallest circle win an overlap", () => {
    // Most specific wins. Highest-price-wins was rejected: every overlap
    // silently favouring the shop costs trust the day somebody notices.
    const overlapping = S({
      pickup_area_fares: {
        wide: { fare: 1500, radiusKm: 10 },
        tight: { fare: 700, radiusKm: 2 },
      },
    });
    const q = quotePickup({
      tier: "flexible",
      point: NEARBY,
      areaCentres: { wide: BANANI, tight: BANANI },
      settings: overlapping,
    }) as any;
    expect(q.areaId).toBe("tight");
    expect(q.amount).toBe(700);
  });

  it("falls back to anywhere-else when no address is known yet", () => {
    const q = quotePickup({ tier: "flexible", settings });
    expect(q).toMatchObject({ configured: true, amount: 1800, outsideAllAreas: true });
  });
});

describe("the tier is added, never multiplied", () => {
  const settings = S({
    pickup_area_fares: { banani: { fare: 1000, radiusKm: 3 } },
    pickup_tier_extras: { flexible: 0, chooseDay: 300, sameDay: 900 },
  });

  it("adds the extra to the area fare", () => {
    const q = quotePickup({ tier: "sameDay", point: NEARBY, areaCentres: CENTRES, settings }) as any;
    expect(q.amount).toBe(1900); // 1000 + 900, not 1000 multiplied by anything
    expect(q.areaFare).toBe(1000);
    expect(q.tierExtra).toBe(900);
  });

  it("rises with the tier rather than falling with a discount", () => {
    const amt = (tier: any) =>
      (quotePickup({ tier, point: NEARBY, areaCentres: CENTRES, settings }) as any).amount;
    expect(amt("chooseDay")).toBeGreaterThan(amt("flexible"));
    expect(amt("sameDay")).toBeGreaterThan(amt("chooseDay"));
  });
});

describe("free over a threshold", () => {
  const settings = S({
    pickup_area_fares: { banani: { fare: 1000, radiusKm: 3 } },
    pickup_free_over: 3500,
  });

  it("waives the whole fare on a big repair", () => {
    const q = quotePickup({
      tier: "flexible", point: NEARBY, areaCentres: CENTRES, repairEstimate: 4000, settings,
    }) as any;
    expect(q.amount).toBe(0);
    expect(q.waived).toBe(true);
    expect(q.waivedOver).toBe(3500);
  });

  it("uses the low end of the estimate, never the optimistic one", () => {
    // Promising free collection and withdrawing it later is worse than never
    // having offered it.
    const at = (n: number) =>
      (quotePickup({ tier: "flexible", point: NEARBY, areaCentres: CENTRES, repairEstimate: n, settings }) as any).waived;
    expect(at(3499)).toBe(false);
    expect(at(3500)).toBe(true);
  });

  it("does not waive when no threshold has been set", () => {
    const noThreshold = S({ pickup_area_fares: { banani: { fare: 1000, radiusKm: 3 } } });
    const q = quotePickup({
      tier: "flexible", point: NEARBY, areaCentres: CENTRES, repairEstimate: 99999, settings: noThreshold,
    }) as any;
    expect(q.waived).toBe(false);
  });
});

describe("the from-price shown before an address is known", () => {
  it("is the cheapest fare anywhere", () => {
    const settings = S({
      pickup_area_fares: { a: { fare: 900, radiusKm: 3 }, b: { fare: 400, radiusKm: 2 } },
      pickup_anywhere_else: 1800,
    });
    expect(minimumFare(settings)).toBe(400);
  });

  it("counts anywhere-else when it is the cheapest thing set", () => {
    expect(minimumFare(S({ pickup_anywhere_else: 250 }))).toBe(250);
  });
});

describe("odds and ends", () => {
  it("keeps one month as the hold period", () => {
    expect(readHoldDays([])).toBe(DEFAULT_HOLD_DAYS);
    expect(DEFAULT_HOLD_DAYS).toBe(30);
    expect(readHoldDays(S({ pickup_hold_days: 14 }))).toBe(14);
  });

  it("maps the tier words already stored on old rows", () => {
    expect(toPickupTier("Emergency")).toBe("sameDay");
    expect(toPickupTier("Priority")).toBe("chooseDay");
    expect(toPickupTier("Regular")).toBe("flexible");
    // Anything unrecognised takes the cheapest: guessing upward would
    // overcharge somebody over a value we did not understand.
    for (const junk of ["", null, undefined, "banana"]) {
      expect(toPickupTier(junk), String(junk)).toBe("flexible");
    }
  });

  it("measures city distances sensibly", () => {
    expect(distanceKm(BANANI, BANANI)).toBe(0);
    expect(distanceKm(BANANI, NEARBY)).toBeGreaterThan(0.5);
    expect(distanceKm(BANANI, NEARBY)).toBeLessThan(1.5);
  });

  it("allows all five settings keys to be saved", () => {
    // Four keys were added once before and rejected silently because nobody
    // put them in this list.
    const ROUTE = readFileSync(join(process.cwd(), "server/routes/settings.routes.ts"), "utf8");
    for (const key of [
      "pickup_area_fares", "pickup_tier_extras", "pickup_anywhere_else",
      "pickup_free_over", "pickup_hold_days",
    ]) {
      expect(ROUTE, `${key} cannot be saved`).toContain(`'${key}'`);
    }
  });
});
