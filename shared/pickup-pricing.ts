/**
 * What collection and return costs, in one place.
 *
 * The shop has stored `pickupTier` on every request for a long time and never
 * attached a price to it: `pickup_schedules.tierCost` takes whatever the caller
 * passes and otherwise defaults to zero. So the customer portal has been
 * promising "an extra charge applies" while the till has never asked for it.
 *
 * Everything here is read from Settings rather than compiled in, and every
 * screen that shows a pickup price reads it through this file. If the homepage
 * quotes one number and the invoice another, the argument at the counter is
 * unwinnable — so there is exactly one calculator.
 */

export const PICKUP_TIER_PRICES_KEY = "pickup_tier_prices";
export const PICKUP_ZONE_BANDS_KEY = "pickup_zone_bands";
export const PICKUP_FREE_OVER_KEY = "pickup_free_over";
export const PICKUP_HOLD_DAYS_KEY = "pickup_hold_days";

/**
 * The three tiers, in the order a customer should meet them.
 *
 * Priced as a base plus add-ons rather than a discount off the top. "Flexible,
 * or 50% more to choose your day" and "600, or 50% off if we choose" are the
 * same money and land completely differently: the first reads as a fair base
 * with optional upgrades, the second as a fine for being particular.
 */
export const PICKUP_TIERS = ["flexible", "chooseDay", "sameDay"] as const;
export type PickupTier = (typeof PICKUP_TIERS)[number];

export type PickupTierPrices = Record<PickupTier, number>;

export type PickupZoneBand = {
  label: string;
  /** Service area ids that fall in this band. */
  areaIds: string[];
  /** Added to the tier price. Additive, never multiplied — see below. */
  extra: number;
};

/**
 * Deliberately conservative defaults.
 *
 * These are what a shop sees before anyone opens Settings, so they must be
 * plausible rather than free. A default of zero would quietly ship the exact
 * bug this file exists to fix.
 */
export const DEFAULT_TIER_PRICES: PickupTierPrices = {
  flexible: 300,
  chooseDay: 600,
  sameDay: 1200,
};

export const DEFAULT_FREE_OVER = 3000;
export const DEFAULT_HOLD_DAYS = 30;

type SettingRow = { key: string; value: string | null };

function readJson<T>(settings: SettingRow[], key: string, fallback: T): T {
  const row = settings.find((s) => s.key === key);
  if (!row?.value) return fallback;
  try {
    const parsed = JSON.parse(row.value);
    return parsed == null ? fallback : (parsed as T);
  } catch {
    // A malformed setting must not make pickup free. Fall back to the default,
    // which is a real price.
    return fallback;
  }
}

const money = (n: unknown, fallback: number): number => {
  const v = Number(n);
  // Negative or absurd values are treated as unset: a stored -500 would
  // otherwise pay the customer to have their television collected.
  return Number.isFinite(v) && v >= 0 && v <= 100_000 ? Math.round(v) : fallback;
};

export function readTierPrices(settings: SettingRow[]): PickupTierPrices {
  const raw = readJson<Partial<PickupTierPrices>>(settings, PICKUP_TIER_PRICES_KEY, {});
  return {
    flexible: money(raw.flexible, DEFAULT_TIER_PRICES.flexible),
    chooseDay: money(raw.chooseDay, DEFAULT_TIER_PRICES.chooseDay),
    sameDay: money(raw.sameDay, DEFAULT_TIER_PRICES.sameDay),
  };
}

export function readZoneBands(settings: SettingRow[]): PickupZoneBand[] {
  const raw = readJson<unknown[]>(settings, PICKUP_ZONE_BANDS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b) => {
      const band = b as Partial<PickupZoneBand>;
      return {
        label: String(band?.label ?? "").trim() || "Zone",
        areaIds: Array.isArray(band?.areaIds) ? band!.areaIds!.map(String) : [],
        extra: money(band?.extra, 0),
      };
    })
    .filter((b) => b.areaIds.length > 0);
}

export const readFreeOverAmount = (settings: SettingRow[]): number =>
  money(readJson<number>(settings, PICKUP_FREE_OVER_KEY, DEFAULT_FREE_OVER), DEFAULT_FREE_OVER);

export const readHoldDays = (settings: SettingRow[]): number =>
  money(readJson<number>(settings, PICKUP_HOLD_DAYS_KEY, DEFAULT_HOLD_DAYS), DEFAULT_HOLD_DAYS);

export type PickupQuote = {
  /** What to charge, after any waiver. */
  amount: number;
  /** Tier price before the zone was added, for showing the breakdown. */
  tierAmount: number;
  /** Extra for the distance band, 0 when the area is unknown or central. */
  zoneAmount: number;
  zoneLabel: string | null;
  /** True when the repair is large enough that collection is on us. */
  waived: boolean;
  /** The threshold that waived it, for the sentence shown to the customer. */
  waivedOver: number | null;
};

/**
 * What this customer pays to have their television collected and returned.
 *
 * Zone is ADDED to the tier, never multiplied. Three tiers times four zones as
 * a multiplication table is twelve numbers nobody can hold in their head or
 * change safely; a base plus an add-on is two numbers, and staff can explain
 * either of them at the counter.
 *
 * `repairEstimate` is the low end of the range the customer was shown. Waiving
 * on the optimistic end would promise free collection on a repair that then
 * comes in under the threshold, and taking it back later is worse than never
 * having offered.
 */
export function quotePickup(opts: {
  tier: PickupTier;
  serviceAreaId?: string | null;
  repairEstimate?: number | null;
  settings: SettingRow[];
}): PickupQuote {
  const prices = readTierPrices(opts.settings);
  const bands = readZoneBands(opts.settings);
  const freeOver = readFreeOverAmount(opts.settings);

  const tierAmount = prices[opts.tier] ?? prices.flexible;
  const band = opts.serviceAreaId
    ? bands.find((b) => b.areaIds.includes(String(opts.serviceAreaId)))
    : undefined;
  const zoneAmount = band?.extra ?? 0;

  const estimate = Number(opts.repairEstimate);
  const waived = freeOver > 0 && Number.isFinite(estimate) && estimate >= freeOver;

  return {
    amount: waived ? 0 : tierAmount + zoneAmount,
    tierAmount,
    zoneAmount,
    zoneLabel: band?.label ?? null,
    waived,
    waivedOver: waived ? freeOver : null,
  };
}

/** Settings stores the tier as free text on the request; normalise it back. */
export function toPickupTier(raw: unknown): PickupTier {
  const s = String(raw ?? "").trim().toLowerCase().replace(/[\s_-]/g, "");
  if (s === "sameday" || s === "emergency" || s === "urgent") return "sameDay";
  if (s === "chooseday" || s === "scheduled" || s === "priority") return "chooseDay";
  return "flexible";
}
