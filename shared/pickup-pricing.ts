/**
 * What collection and return costs, in one place.
 *
 * The shop has stored `pickupTier` on every request for a long time and never
 * attached a price to it: `pickup_schedules.tierCost` takes whatever the caller
 * passes and otherwise defaults to zero. So the portal has been promising "an
 * extra charge applies" while the till has never asked for it.
 *
 * Two numbers make a fare:
 *
 *   area fare  — what it costs to reach this part of the city, drawn as a
 *                circle on the Area Intelligence map. Distance alone is the
 *                wrong model in Dhaka: five kilometres across Gulshan at six
 *                in the evening beats fifteen on a highway, so the fare is set
 *                per place by someone who knows the traffic, not computed.
 *
 *   tier extra — what the customer's choice of timing costs on top. Added, not
 *                multiplied: a base plus an add-on is two numbers staff can
 *                explain at the counter, where three tiers across a dozen
 *                areas would be a table nobody can hold in their head.
 *
 * Nothing is priced until somebody sets it. Every default here is null, and an
 * unpriced area returns `configured: false` so the customer is shown nothing
 * at all rather than a number this file invented.
 */

export const PICKUP_RING_FARES_KEY = "pickup_ring_fares";
export const PICKUP_AREA_FARES_KEY = "pickup_area_fares";
export const PICKUP_TIER_EXTRAS_KEY = "pickup_tier_extras";
export const PICKUP_ANYWHERE_ELSE_KEY = "pickup_anywhere_else";
export const PICKUP_FREE_OVER_KEY = "pickup_free_over";
export const PICKUP_HOLD_DAYS_KEY = "pickup_hold_days";

export const PICKUP_TIERS = ["flexible", "chooseDay", "sameDay"] as const;
export type PickupTier = (typeof PICKUP_TIERS)[number];

/** Added to the area fare. `flexible` is the base and is normally zero. */
export type PickupTierExtras = Record<PickupTier, number>;

export type PickupAreaFare = {
  /** The whole transport cost for this place, before any tier extra. */
  fare: number;
  /** How far the circle reaches, in kilometres. */
  radiusKm: number;
};

/**
 * One band of distance out from the shop, and what collection costs inside it.
 *
 * `radiusKm` is the band's OUTER edge; the inner edge is the previous ring, so
 * the bands nest rather than overlap and every address has exactly one answer.
 *
 * Rings exist because per-area pricing could not cover a city. Each area had to
 * be created and priced by hand, and anything missed fell through to the
 * "anywhere else" fare — the most expensive one — so the failure mode of
 * forgetting a neighbourhood was silently overcharging the customer who lived
 * there. Measured against the shop at Paltan, five rings at 5/10/14/20/30 km
 * reach 99.5% of greater Dhaka, which is five numbers instead of eight hundred.
 */
export type PickupRingFare = {
  /** Outer edge of this band, in kilometres from the shop. */
  radiusKm: number;
  /** What collection costs anywhere inside this band, before any tier extra. */
  fare: number;
  /**
   * The repair bill at which this ring's fare is discounted in full.
   *
   * Per ring rather than one figure for the city, because the two ends of Dhaka
   * are not the same journey. A customer five kilometres away is worth
   * collecting from on a modest repair; thirty kilometres out, the same repair
   * does not cover the driver's day. One shop-wide threshold has to be set for
   * one of those cases and is then wrong for the other.
   *
   * Null means this ring has no discount at all — not that everything qualifies.
   */
  discountOver: number | null;
};

/**
 * The colour of each ring, near to far.
 *
 * Green through red, because the thing being read off the map is how expensive
 * a place is to reach — a ramp that runs cheap-to-dear says that without a
 * legend. Shared between the map and the fare panel so a ring is the same
 * colour in both; a swatch that disagreed with the circle would be worse than
 * no swatch at all.
 *
 * Anything past the fifth ring repeats the last colour rather than wrapping
 * back to green, which would paint the farthest band as the cheapest.
 */
export const PICKUP_RING_COLORS = [
  "#10b981", // emerald — nearest
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#f97316", // orange
  "#ef4444", // red — farthest
] as const;

export function ringColor(index: number): string {
  return PICKUP_RING_COLORS[Math.min(index, PICKUP_RING_COLORS.length - 1)];
}

/** One month, as agreed — how long a decided-against television is kept. */
export const DEFAULT_HOLD_DAYS = 30;

type SettingRow = { key: string; value: string | null };

function readJson<T>(settings: SettingRow[], key: string, fallback: T): T {
  const row = settings.find((s) => s.key === key);
  if (!row?.value) return fallback;
  try {
    const parsed = JSON.parse(row.value);
    return parsed == null ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
}

/**
 * A money value, or null when it has not been set.
 *
 * Null rather than zero on purpose. Zero is a price — it says collection is
 * free — and a malformed setting must never accidentally say that.
 */
function money(n: unknown): number | null {
  if (n === null || n === undefined || n === "") return null;
  const v = Number(n);
  // A negative fare would pay the customer to have their television collected.
  return Number.isFinite(v) && v >= 0 && v <= 100_000 ? Math.round(v) : null;
}

/**
 * Why a fare must be refused when it is saved, not quietly mended when it is read.
 *
 * `money()` above turns anything it dislikes into null, and the tier extras then
 * fall back to zero. Zero is not "unset" — it is a price, and it says collection
 * is free. So typing -25 into the Same-day extra, or clearing the box, produced
 * a cheerful "Fares updated" and a same-day pickup that costs the customer
 * nothing and the shop a driver. The screen said one thing and the till did
 * another, which is the worst way for money to go missing: silently, and with a
 * success message on top.
 *
 * This is the same rule the reader already applies, moved to the moment somebody
 * presses Save, so that what is stored is what was meant.
 */
export type FareValidationError = { key: string; field: string; reason: string };

const FARE_LIMIT = 100_000;

function badMoney(value: unknown, field: string, key: string): FareValidationError | null {
  if (value === null || value === undefined || value === "") {
    return { key, field, reason: "A fare cannot be left blank. Enter 0 if it is genuinely free." };
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return { key, field, reason: "That is not a number." };
  if (n < 0) return { key, field, reason: "A fare cannot be negative — that would pay the customer to have their television collected." };
  if (n > FARE_LIMIT) return { key, field, reason: `A fare above ${FARE_LIMIT} is almost certainly a typing slip.` };
  return null;
}

export const PICKUP_SETTING_KEYS: string[] = [
  PICKUP_RING_FARES_KEY,
  PICKUP_AREA_FARES_KEY,
  PICKUP_TIER_EXTRAS_KEY,
  PICKUP_ANYWHERE_ELSE_KEY,
  PICKUP_FREE_OVER_KEY,
];

/**
 * Check one of the pickup settings before it is written.
 *
 * Returns every problem found rather than the first, so somebody correcting a
 * form is told all of it at once instead of one field per attempt.
 */
export function validatePickupSetting(key: string, rawValue: string | null): FareValidationError[] {
  if (!PICKUP_SETTING_KEYS.includes(key)) return [];

  let parsed: unknown;
  try {
    parsed = rawValue === null || rawValue === "" ? null : JSON.parse(rawValue);
  } catch {
    return [{ key, field: key, reason: "The saved value is not readable." }];
  }

  if (key === PICKUP_TIER_EXTRAS_KEY) {
    const raw = (parsed ?? {}) as Record<string, unknown>;
    return PICKUP_TIERS
      .map((tier) => badMoney(raw[tier], tier, key))
      .filter((e): e is FareValidationError => e !== null);
  }

  if (key === PICKUP_RING_FARES_KEY) {
    if (!Array.isArray(parsed)) {
      return [{ key, field: key, reason: "Rings must be a list." }];
    }
    const errors: FareValidationError[] = [];
    const radii: number[] = [];
    parsed.forEach((entry, i) => {
      const v = (entry ?? {}) as Partial<PickupRingFare>;
      const bad = badMoney(v?.fare, `ring${i + 1}.fare`, key);
      if (bad) errors.push(bad);
      const radius = Number(v?.radiusKm);
      if (!Number.isFinite(radius) || radius <= 0) {
        errors.push({ key, field: `ring${i + 1}.radiusKm`, reason: "A ring needs a distance greater than zero." });
      } else {
        radii.push(radius);
      }
      /**
       * The discount threshold, unlike the fare, may genuinely be left blank —
       * a ring the shop does not want to discount is a real decision. So blank
       * passes and only a typed value is checked.
       *
       * Zero is refused rather than accepted as "always". A threshold of zero
       * discounts every collection in that ring, including the ৳0 one, and it
       * is far more likely to be a slip than a policy. Somebody who really
       * means it can type 1.
       */
      // Unknown, not number: what arrives here is raw JSON from the editor, and
      // an empty box sends "". Typing it as a number would hide that case.
      const threshold: unknown = v?.discountOver;
      if (threshold !== null && threshold !== undefined && threshold !== "") {
        const n = Number(threshold);
        if (!Number.isFinite(n)) {
          errors.push({ key, field: `ring${i + 1}.discountOver`, reason: "That is not a number." });
        } else if (n <= 0) {
          errors.push({ key, field: `ring${i + 1}.discountOver`, reason: "Leave it blank for no discount. Zero would discount every collection in this ring." });
        } else if (n > FARE_LIMIT) {
          errors.push({ key, field: `ring${i + 1}.discountOver`, reason: `A threshold above ${FARE_LIMIT} is almost certainly a typing slip.` });
        }
      }
    });
    // Two rings ending at the same distance make the inner one unreachable, and
    // which fare applied would depend on stored order rather than on the map.
    const duplicate = radii.find((r, i) => radii.indexOf(r) !== i);
    if (duplicate !== undefined) {
      errors.push({ key, field: "radiusKm", reason: `Two rings both end at ${duplicate} km. Each ring needs its own distance.` });
    }
    return errors;
  }

  if (key === PICKUP_AREA_FARES_KEY) {
    const raw = (parsed ?? {}) as Record<string, unknown>;
    const errors: FareValidationError[] = [];
    for (const [areaId, value] of Object.entries(raw)) {
      const v = value as Partial<PickupAreaFare>;
      const bad = badMoney(v?.fare, `${areaId}.fare`, key);
      if (bad) errors.push(bad);
      const radius = Number(v?.radiusKm);
      if (!Number.isFinite(radius) || radius <= 0) {
        errors.push({ key, field: `${areaId}.radiusKm`, reason: "A rated area needs a radius greater than zero." });
      }
    }
    return errors;
  }

  // The single-number settings. Null is allowed: "not set" is a real answer for
  // a free-over threshold or an anywhere-else fare, and is not the same as free.
  if (parsed === null) return [];
  const bad = badMoney(parsed, key, key);
  return bad ? [bad] : [];
}

export function readTierExtras(settings: SettingRow[]): PickupTierExtras {
  const raw = readJson<Partial<Record<PickupTier, unknown>>>(settings, PICKUP_TIER_EXTRAS_KEY, {});
  return {
    flexible: money(raw.flexible) ?? 0,
    chooseDay: money(raw.chooseDay) ?? 0,
    sameDay: money(raw.sameDay) ?? 0,
  };
}

/**
 * Always five bands, never more, never fewer.
 *
 * Fixed rather than a list the shop grows, because the count is a fact about
 * the city rather than a preference: measured from Paltan against 865 places,
 * five bands at these distances reach 99.5% of greater Dhaka, and the gaps
 * between them fall where Dhaka is genuinely thin on the ground — the 12–14km
 * stretch across the cantonment and airport, where a boundary crosses fewest
 * doorsteps and so causes fewest arguments about which fare applies.
 *
 * The radii here are only the starting point; both distance and fare are edited
 * in Area Intelligence. What cannot change is that there are five.
 */
export const PICKUP_RING_COUNT = 5;
export const DEFAULT_RING_RADII_KM = [5, 10, 14, 20, 30] as const;

/**
 * One editable band. `fare` is null until somebody prices it — not zero, which
 * would say collection is free.
 */
export type PickupRingSlot = { radiusKm: number; fare: number | null; discountOver: number | null };

/**
 * The five bands as the editor and the map need them: every slot present,
 * whether priced or not.
 *
 * An unpriced ring still has to be drawn and still has to have a row, otherwise
 * there is nowhere to type the fare in — the reason a ring is missing a price is
 * usually that nobody has got to it yet.
 */
export function readRingSlots(settings: SettingRow[]): PickupRingSlot[] {
  const raw = readJson<unknown>(settings, PICKUP_RING_FARES_KEY, []);
  const stored = Array.isArray(raw) ? raw : [];
  return DEFAULT_RING_RADII_KM.map((fallbackRadius, index) => {
    const v = (stored[index] ?? {}) as Partial<PickupRingFare>;
    const radius = Number(v?.radiusKm);
    return {
      radiusKm: Number.isFinite(radius) && radius > 0 ? radius : fallbackRadius,
      fare: money(v?.fare),
      // Absent in every ring saved before discounts existed, and null is the
      // right reading of that: no threshold was set, so nothing qualifies.
      discountOver: money(v?.discountOver),
    };
  });
}

/**
 * The bands that can actually price a collection, smallest first.
 *
 * Sorted rather than trusted in stored order, because resolution walks outward
 * and takes the first band that contains the address — an unsorted list would
 * quietly charge a far ring's fare to a near address.
 *
 * A band with no fare is dropped rather than mended. An address inside an
 * unpriced ring therefore falls through to the next priced ring outward, which
 * charges more than it should rather than nothing at all: the wrong direction to
 * be wrong in, but the safe one.
 */
export function readRingFares(settings: SettingRow[]): PickupRingFare[] {
  return readRingSlots(settings)
    .filter((slot): slot is PickupRingFare => slot.fare !== null)
    .sort((a, b) => a.radiusKm - b.radiusKm);
}

export function readAreaFares(settings: SettingRow[]): Record<string, PickupAreaFare> {
  const raw = readJson<Record<string, unknown>>(settings, PICKUP_AREA_FARES_KEY, {});
  const out: Record<string, PickupAreaFare> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [areaId, value] of Object.entries(raw)) {
    const v = value as Partial<PickupAreaFare>;
    const fare = money(v?.fare);
    const radius = Number(v?.radiusKm);
    // A circle with no fare, or no radius, is not a rated place.
    if (fare === null || !Number.isFinite(radius) || radius <= 0) continue;
    out[String(areaId)] = { fare, radiusKm: radius };
  }
  return out;
}

export const readAnywhereElseFare = (settings: SettingRow[]): number | null =>
  money(readJson<unknown>(settings, PICKUP_ANYWHERE_ELSE_KEY, null));

export const readFreeOverAmount = (settings: SettingRow[]): number | null =>
  money(readJson<unknown>(settings, PICKUP_FREE_OVER_KEY, null));

export function readHoldDays(settings: SettingRow[]): number {
  const v = money(readJson<unknown>(settings, PICKUP_HOLD_DAYS_KEY, null));
  return v && v > 0 ? v : DEFAULT_HOLD_DAYS;
}

/** Kilometres between two points. Good enough for a city, and no dependency. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type PickupQuote =
  | { configured: false }
  | {
      configured: true;
      /** What to charge, after any discount. Never negative. */
      amount: number;
      /** The full fare before the discount — the line the customer is shown. */
      fare: number;
      /** What comes off it. Always either zero or the whole fare. */
      discount: number;
      /**
       * The bill this collection's fare is discounted over, whether or not it
       * has been reached yet.
       *
       * Carried even when nothing qualifies, because the booking screen has no
       * bill to judge against and still has to tell the customer the promise
       * exists. Null means this address has no discount available at all.
       */
      discountOver: number | null;
      areaFare: number;
      tierExtra: number;
      /** The area whose circle claimed this address, or null for "anywhere else". */
      areaId: string | null;
      /** True when this address fell outside every rated circle. */
      outsideAllAreas: boolean;
      /**
       * @deprecated Read `discount` and `fare`.
       *
       * Kept because the money is identical and removing it would break callers
       * silently. But the word is wrong and must not reach a customer: "waived"
       * and "free" both say the journey had no value, when what happened is
       * that the shop gave away something it could have charged for. The
       * customer is shown the fare, the discount against it, and the total.
       */
      waived: boolean;
      /** @deprecated Read `discountOver`. */
      waivedOver: number | null;
      /** Which rule set the fare, so staff can explain the number. */
      source: "area" | "ring" | "anywhere-else";
      /** Outer edge of the ring that claimed it, when `source` is "ring". */
      ringRadiusKm: number | null;
      /** Straight-line km from the shop, when an origin was supplied. */
      distanceKm: number | null;
    };

/**
 * The fare for one collection.
 *
 * An address is claimed by the SMALLEST circle that contains it. Smallest wins
 * because it is the most specific statement someone made about the map — a
 * tight circle drawn around one neighbourhood is a deliberate act, while a wide
 * one is a general rule. Highest-price-wins was the alternative and was
 * rejected: every overlap silently favouring the shop is the kind of thing that
 * costs trust the day a customer notices.
 *
 * "Contains" is measured against the radius, not by nearest centre. An address
 * three kilometres from a two-kilometre circle is OUTSIDE it — otherwise a
 * twenty-kilometre trip whose nearest circle happened to be Banani would be
 * charged the Banani fare, which is the exact leak this exists to close.
 */
export function quotePickup(opts: {
  tier: PickupTier;
  /** Where the customer is. Without it, only "anywhere else" can apply. */
  point?: { lat: number; lng: number } | null;
  /** Rated circles: area id → centre. Fares come from settings. */
  areaCentres?: Record<string, { lat: number; lng: number }>;
  /** The shop. Rings are measured from here; without it no ring can apply. */
  origin?: { lat: number; lng: number } | null;
  /** Low end of the repair estimate; the waiver never uses the optimistic end. */
  repairEstimate?: number | null;
  settings: SettingRow[];
}): PickupQuote {
  const fares = readAreaFares(opts.settings);
  const rings = readRingFares(opts.settings);
  const extras = readTierExtras(opts.settings);
  const anywhereElse = readAnywhereElseFare(opts.settings);

  let areaId: string | null = null;
  let areaFare: number | null = null;
  let source: "area" | "ring" | "anywhere-else" = "anywhere-else";
  let ringRadiusKm: number | null = null;
  let ringDiscountOver: number | null = null;
  let bestRadius = Infinity;

  /**
   * A hand-priced area beats the ring it sits in.
   *
   * This is where knowledge of the city overrules the geometry. Keraniganj is
   * 4.7km from the shop — the innermost, cheapest ring — but it is across the
   * Buriganga, so the drive costs far more than the distance suggests. Rings
   * make sure nothing is unpriced; overrides make sure distance never gets the
   * last word where it is simply wrong.
   */
  if (opts.point && opts.areaCentres) {
    for (const [id, centre] of Object.entries(opts.areaCentres)) {
      const rated = fares[id];
      if (!rated) continue;
      const d = distanceKm(opts.point, centre);
      if (d <= rated.radiusKm && rated.radiusKm < bestRadius) {
        bestRadius = rated.radiusKm;
        areaId = id;
        areaFare = rated.fare;
        source = "area";
      }
    }
  }

  // The rings, walked outward: the first band that reaches this address owns it.
  let distanceFromShop: number | null = null;
  if (opts.point && opts.origin) {
    distanceFromShop = distanceKm(opts.point, opts.origin);
    if (areaFare === null) {
      for (const ring of rings) {
        if (distanceFromShop <= ring.radiusKm) {
          areaFare = ring.fare;
          ringRadiusKm = ring.radiusKm;
          ringDiscountOver = ring.discountOver;
          source = "ring";
          break;
        }
      }
    }
  }

  const outsideAllAreas = areaFare === null;
  if (outsideAllAreas) {
    areaFare = anywhereElse;
    source = "anywhere-else";
  }

  // Nothing has been priced yet. Say nothing rather than invent a number.
  if (areaFare === null) return { configured: false };

  const tierExtra = extras[opts.tier] ?? 0;
  const fare = areaFare + tierExtra;

  /**
   * Which threshold this address is judged against.
   *
   * The ring's own comes first — that is the whole point of setting it per ring.
   * The shop-wide `pickup_free_over` is the fallback, and covers the two cases a
   * ring cannot: a hand-priced area override, and an address outside every ring
   * paying the anywhere-else fare. Neither has a threshold of its own, and
   * dropping the discount entirely for them would quietly withdraw a promise the
   * shop has been making on the homepage.
   */
  const discountOver = ringDiscountOver ?? readFreeOverAmount(opts.settings);

  /**
   * The estimate, not the final bill.
   *
   * At booking there is no bill — the set has not been opened — so nothing
   * qualifies here and the customer is quoted the full fare. That is deliberate:
   * quoting a discount off an estimate and then charging the fare because the
   * repair came in cheaper is how a price stops being trusted. The discount
   * resolves at the counter, against the real total.
   */
  const estimate = Number(opts.repairEstimate);
  const qualifies =
    discountOver !== null && discountOver > 0 &&
    Number.isFinite(estimate) && estimate >= discountOver;

  // All of it or none of it. No percentages: a part-discount is a number the
  // counter has to explain, and nobody at the counter set it.
  const discount = qualifies ? fare : 0;

  return {
    configured: true,
    amount: fare - discount,
    fare,
    discount,
    discountOver,
    areaFare,
    tierExtra,
    areaId,
    outsideAllAreas,
    waived: qualifies,
    waivedOver: qualifies ? discountOver : null,
    source,
    ringRadiusKm,
    distanceKm: distanceFromShop,
  };
}

/**
 * The cheapest fare anywhere, for "from ৳X" before an address is known.
 *
 * The homepage shows a price with no address at all, so it cannot know the
 * real fare. Showing the minimum with "depends on your area" is honest;
 * showing a specific number that later changes is not.
 */
export function minimumFare(settings: SettingRow[]): number | null {
  const fares = Object.values(readAreaFares(settings)).map((f) => f.fare);
  // Rings count too: with rings configured the innermost is usually the real
  // cheapest, and omitting them would advertise a "from" price higher than
  // what most customers are actually charged.
  for (const ring of readRingFares(settings)) fares.push(ring.fare);
  const anywhereElse = readAnywhereElseFare(settings);
  if (anywhereElse !== null) fares.push(anywhereElse);
  if (fares.length === 0) return null;
  return Math.min(...fares) + (readTierExtras(settings).flexible ?? 0);
}

/** Old rows stored the tier as free text; normalise it back. */
export function toPickupTier(raw: unknown): PickupTier {
  const s = String(raw ?? "").trim().toLowerCase().replace(/[\s_-]/g, "");
  if (s === "sameday" || s === "emergency" || s === "urgent") return "sameDay";
  if (s === "chooseday" || s === "scheduled" || s === "priority") return "chooseDay";
  // Anything unrecognised takes the cheapest. Guessing upward would overcharge
  // somebody over a value we did not understand.
  return "flexible";
}
