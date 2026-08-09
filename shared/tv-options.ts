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

/**
 * Sizes, always smallest to largest.
 *
 * Settings holds them as a free-form tag list, so their order is whatever
 * order somebody happened to type them in — which is how 24, 32, 39, 42 ends
 * up reading 32, 24, 42, 39 on a picker. Nobody should have to drag tags into
 * order in an admin screen to make a customer-facing control make sense, and
 * anyone adding "86 inch" next year should not have to think about where it
 * goes.
 *
 * Sorting on read rather than on save means it is right on every screen at
 * once, including for values already stored, and it cannot be undone by an
 * edit somewhere else.
 */
export function sortTvSizes(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique = list.filter((raw) => {
    const key = String(raw).trim().toLowerCase().replace(/\s+/g, " ");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.sort((a, b) => {
    const na = Number.parseInt(String(a), 10);
    const nb = Number.parseInt(String(b), 10);
    const aNum = Number.isFinite(na);
    const bNum = Number.isFinite(nb);
    // Anything without a number — "Other" — keeps its place at the end rather
    // than being sorted into the middle of the ladder.
    if (aNum && bNum) return na - nb;
    if (aNum) return -1;
    if (bNum) return 1;
    return 0;
  });
}

export const readTvSizes = (settings: SettingRow[]) =>
  sortTvSizes(readTvOptionList(settings, TV_SIZES_KEY, TV_SIZES_LEGACY_KEY, DEFAULT_TV_SIZES));

/**
 * A screen size as it should be shown to a person.
 *
 * Sizes are stored the way Settings holds them — "55 inch", "75 inch+" — but
 * several screens rendered `${screenSize}"`, which assumed a bare number and
 * produced `55 inch"` and `75 inch+"`. The stray quote only became visible
 * once sizes flowed end to end from the homepage into the ticket.
 *
 * Appends the inch mark only when the value does not already say it, so a
 * bare "55" still reads 55" and a stored "75 inch+" is left alone.
 */
export function formatScreenSize(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return /inch|"|”|′|″/i.test(s) ? s : `${s}"`;
}
