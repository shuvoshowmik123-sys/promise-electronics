/**
 * Finding the customer's own address, from the shop's own copy of Dhaka.
 *
 * The address used to be a free-text box that nothing checked. That is a
 * problem twice over: a driver gets an address nobody verified, and the
 * collection fare is decided by which rated circle the address falls inside —
 * so an address with no coordinates quietly falls through to the most
 * expensive "anywhere else" rate. Suggestions fix both, because picking one
 * yields a point on the map as well as a spelling.
 *
 * The suggestions come from `dhaka_places`, not from a geocoding API. Nominatim
 * names autocomplete as a prohibited use, and Photon's public instance asks
 * anyone with real traffic to self-host; one request per keystroke per customer
 * is exactly the traffic they mean. A local table also answers in milliseconds
 * and keeps working when the shop's line does not.
 *
 * Ranking, in order, and why:
 *
 *   1. A name that STARTS with what was typed. Somebody typing "dhan" wants
 *      Dhanmondi, not a road three neighbourhoods away that happens to contain
 *      the letters.
 *   2. Areas before roads. "Dhanmondi" means the neighbourhood; the twelve
 *      roads inside it are a worse answer to the same word.
 *   3. Trigram similarity, which is what survives a typo.
 *
 * Matching is per-column rather than against one concatenated blob. The blob
 * looked simpler and ranked badly: ধানমন্ডি's row begins with Bangla, so a
 * prefix test for "dhanmondi" failed on the neighbourhood and succeeded on
 * "Dhanmondi 9A", putting a side street above the place everyone means.
 */
import { sql } from "drizzle-orm";

import { db } from "../db.js";

export interface DhakaPlaceSuggestion {
    id: string;
    /** What to show in the list: the local name, plus its neighbourhood. */
    label: string;
    /** The other-language name, shown underneath when it differs. */
    secondary: string | null;
    kind: "area" | "road";
    latitude: number;
    longitude: number;
}

/** Below this, results are noise rather than suggestions. */
const SIMILARITY_FLOOR = 0.18;
const MAX_RESULTS = 8;
export const MIN_QUERY_LENGTH = 2;

/**
 * Bangla needs a shorter floor than English.
 *
 * A Bangla place name is often two or three characters ("পল্টন" is five code
 * points but far fewer trigrams than "Paltan"), so the same threshold that is
 * sensible for Latin text hides most of the city from somebody typing Bangla.
 */
function hasBangla(value: string): boolean {
    return /[ঀ-৿]/.test(value);
}

export async function searchDhakaPlaces(rawQuery: string): Promise<DhakaPlaceSuggestion[]> {
    const q = rawQuery.trim().toLowerCase().replace(/\s+/g, " ");
    if (q.length < MIN_QUERY_LENGTH) return [];

    const floor = hasBangla(q) ? 0.1 : SIMILARITY_FLOOR;

    /**
     * Raw SQL rather than the query builder: this leans on pg_trgm's
     * similarity(), which the builder does not express. Every value is still
     * parameterised.
     *
     * Scoring runs over the whole table rather than behind a `search_text % q`
     * gate, because that gate was silently discarding the best answers. The `%`
     * operator compares against the concatenated blob at pg_trgm's own 0.3
     * threshold, and a row holding the same name twice in two scripts dilutes
     * its own score: for the typo "dhanmnodi", ধানমন্ডি scored 0.27 on the blob
     * and was dropped, while scoring 0.43 on its English column. The one
     * neighbourhood the customer meant lost to a side street off it. A filter
     * that disagrees with the ranking beside it will always throw away rows the
     * ranking would have put first.
     *
     * Scanning instead costs ~66ms across 8.5k rows — a table small enough to
     * sit in cache, static between imports, and read behind a debounce.
     */
    const result = await db.execute(sql`
        WITH scored AS (
            SELECT
                id, name, name_bn, name_en, kind, context_name, latitude, longitude,
                GREATEST(
                    similarity(lower(name), ${q}),
                    similarity(lower(COALESCE(name_en, '')), ${q}),
                    similarity(lower(COALESCE(name_bn, '')), ${q})
                ) AS score,
                (
                    lower(name) LIKE ${q + "%"}
                    OR lower(COALESCE(name_en, '')) LIKE ${q + "%"}
                    OR lower(COALESCE(name_bn, '')) LIKE ${q + "%"}
                ) AS starts_with,
                -- Catches queries that span a name and its neighbourhood
                -- ("road 5 gulshan"), which no single column contains.
                (search_text ILIKE ${"%" + q + "%"}) AS blob_match
            FROM dhaka_places
        )
        SELECT * FROM scored
        WHERE starts_with OR blob_match OR score >= ${floor}
        ORDER BY starts_with DESC, (kind = 'area') DESC, score DESC, name ASC
        LIMIT ${MAX_RESULTS}
    `);

    const rows = ((result as any).rows ?? result) as Array<{
        id: string; name: string; name_bn: string | null; name_en: string | null;
        kind: string; context_name: string | null; latitude: number; longitude: number;
    }>;

    return rows.map((row) => {
        // The neighbourhood is part of the label, not a detail: Dhaka has a
        // "Road 5" in Dhanmondi, in Gulshan and in Uttara, and without it the
        // customer is choosing between identical lines.
        const label = row.context_name && row.kind === "road"
            ? `${row.name}, ${row.context_name}`
            : row.name;

        // Show the other language only when it adds something. Most rows carry
        // the same string in both, and repeating it is just noise.
        const alternates = [row.name_en, row.name_bn]
            .filter((value): value is string => Boolean(value) && value !== row.name);

        return {
            id: row.id,
            label,
            secondary: alternates[0] ?? null,
            kind: row.kind === "area" ? "area" : "road",
            latitude: Number(row.latitude),
            longitude: Number(row.longitude),
        };
    });
}
