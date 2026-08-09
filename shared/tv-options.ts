/**
 * The one place the television brand and size lists are defined.
 *
 * These lists have to agree across every screen that offers them, because the
 * homepage simulator hands its answers to the service request on the URL and
 * the wizard selects by exact string. A size the wizard's list does not
 * contain arrives, matches nothing, and shows as unanswered — the customer is
 * then asked a question they already answered.
 *
 * That had already happened once. The wizard's sizes were a hardcoded array
 * ending "75 inch" while the homepage read Settings and fell back to
 * "75 inch+", so a customer who picked the largest size lost it in the handoff.
 * The lists now share a key and a fallback, so the only way they can disagree
 * is if somebody edits this file.
 */

/** Settings keys. `tv_inches` is the older name for sizes and is still read. */
export const TV_BRANDS_KEY = "tv_brands";
export const TV_SIZES_KEY = "tv_sizes";
export const TV_SIZES_LEGACY_KEY = "tv_inches";

/** Used only when the shop has not set the list in Settings. */
export const DEFAULT_TV_BRANDS = [
  "Sony", "Samsung", "LG", "Walton", "Vision", "Sharp", "Panasonic", "Haier", "Other",
] as const;

/**
 * Stored as "43 inch" rather than `43`, because that is what already sits in
 * Settings and in the service_requests rows written so far. Screens shorten it
 * to 43" for display; the stored value is never abbreviated.
 */
export const DEFAULT_TV_SIZES = [
  "24 inch", "32 inch", "40 inch", "43 inch", "50 inch", "55 inch", "65 inch", "75 inch+",
] as const;

type SettingRow = { key: string; value: string | null };

/**
 * Read a list from Settings, falling back through an older key and then to the
 * shared default. A malformed or empty stored value is treated as absent — an
 * empty picker is worse than a default one.
 */
export function readTvOptionList(
  settings: SettingRow[],
  key: string,
  fallbackKey: string | null,
  defaults: readonly string[],
): string[] {
  for (const k of [key, fallbackKey].filter(Boolean) as string[]) {
    const row = settings.find((s) => s.key === k);
    if (!row?.value) continue;
    try {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[];
    } catch {
      // Stored value is not JSON — fall through to the next source.
    }
  }
  return [...defaults];
}

export const readTvBrands = (settings: SettingRow[]) =>
  readTvOptionList(settings, TV_BRANDS_KEY, null, DEFAULT_TV_BRANDS);

export const readTvSizes = (settings: SettingRow[]) =>
  readTvOptionList(settings, TV_SIZES_KEY, TV_SIZES_LEGACY_KEY, DEFAULT_TV_SIZES);
