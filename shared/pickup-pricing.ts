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

export function readTierExtras(settings: SettingRow[]): PickupTierExtras {
  const raw = readJson<Partial<Record<PickupTier, unknown>>>(settings, PICKUP_TIER_EXTRAS_KEY, {});
  return {
    flexible: money(raw.flexible) ?? 0,
    chooseDay: money(raw.chooseDay) ?? 0,
    sameDay: money(raw.sameDay) ?? 0,
  };
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
      /** What to charge, after any waiver. */
      amount: number;
      areaFare: number;
      tierExtra: number;
      /** The area whose circle claimed this address, or null for "anywhere else". */
      areaId: string | null;
      /** True when this address fell outside every rated circle. */
      outsideAllAreas: boolean;
      waived: boolean;
      waivedOver: number | null;
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
  /** Low end of the repair estimate; the waiver never uses the optimistic end. */
  repairEstimate?: number | null;
  settings: SettingRow[];
}): PickupQuote {
  const fares = readAreaFares(opts.settings);
  const extras = readTierExtras(opts.settings);
  const anywhereElse = readAnywhereElseFare(opts.settings);

  let areaId: string | null = null;
  let areaFare: number | null = null;
  let bestRadius = Infinity;

  if (opts.point && opts.areaCentres) {
    for (const [id, centre] of Object.entries(opts.areaCentres)) {
      const rated = fares[id];
      if (!rated) continue;
      const d = distanceKm(opts.point, centre);
      if (d <= rated.radiusKm && rated.radiusKm < bestRadius) {
        bestRadius = rated.radiusKm;
        areaId = id;
        areaFare = rated.fare;
      }
    }
  }

  const outsideAllAreas = areaFare === null;
  if (outsideAllAreas) areaFare = anywhereElse;

  // Nothing has been priced yet. Say nothing rather than invent a number.
  if (areaFare === null) return { configured: false };

  const tierExtra = extras[opts.tier] ?? 0;
  const freeOver = readFreeOverAmount(opts.settings);
  const estimate = Number(opts.repairEstimate);
  const waived = freeOver !== null && freeOver > 0 && Number.isFinite(estimate) && estimate >= freeOver;

  return {
    configured: true,
    amount: waived ? 0 : areaFare + tierExtra,
    areaFare,
    tierExtra,
    areaId,
    outsideAllAreas,
    waived,
    waivedOver: waived ? freeOver : null,
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
