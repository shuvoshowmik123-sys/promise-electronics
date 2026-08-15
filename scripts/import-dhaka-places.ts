/**
 * Fill `dhaka_places` from OpenStreetMap, once.
 *
 *   npx tsx scripts/import-dhaka-places.ts --dry-run   # count only, writes nothing
 *   npx tsx scripts/import-dhaka-places.ts             # import
 *
 * Reads DATABASE_URL. Safe to re-run: rows are keyed by OSM type+id and
 * updated in place, so a second run refreshes the city rather than doubling it.
 *
 * Why Overpass and not the geocoders the app already talks to: Nominatim's own
 * usage policy sends you here for bulk work ("if you need complete sets of
 * data, get it from the OSM planet or an extract"), and asking a search API for
 * a whole city one query at a time is the behaviour that gets an application
 * banned. Overpass is built to hand over an extract in one request.
 *
 * It is still someone else's donated server. This asks for two extracts, waits
 * between them, identifies itself, and retries slowly rather than hammering —
 * the same courtesy the app expects from its own callers.
 */
import { randomUUID } from "crypto";
import pg from "pg";

/** Dhaka metropolitan area: south, west, north, east. */
const BBOX = "23.66,90.30,23.92,90.52";
const OVERPASS = "https://overpass-api.de/api/interpreter";
const UA = "PromiseElectronics-DhakaPlaceImport/1.0 (one-off city extract)";

const DRY_RUN = process.argv.includes("--dry-run");

type OverpassElement = {
    type: string;
    id: number;
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags?: Record<string, string>;
};

/**
 * Two passes rather than one.
 *
 * Areas and roads are wanted for different reasons and ranked differently, and
 * a single query for both routinely exceeded the public instance's patience.
 */
const QUERIES: Array<{ kind: "area" | "road"; label: string; ql: string }> = [
    {
        kind: "area",
        label: "areas (suburb, quarter, neighbourhood, town)",
        ql: `node["place"~"^(suburb|quarter|neighbourhood|town|village)$"]["name"](${BBOX});`,
    },
    {
        kind: "road",
        label: "named roads",
        ql: `way["highway"~"^(primary|secondary|tertiary|residential|living_street|unclassified)$"]["name"](${BBOX});`,
    },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function overpass(ql: string, attempt = 1): Promise<OverpassElement[]> {
    const query = `[out:json][timeout:300];(${ql});out tags center;`;
    const response = await fetch(OVERPASS, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }).toString(),
    });

    if (response.status === 429 || response.status === 504) {
        // Their servers are shared and free. Back off rather than retry hard.
        if (attempt >= 4) throw new Error(`Overpass busy after ${attempt} attempts (${response.status})`);
        const wait = 30_000 * attempt;
        console.log(`  Overpass busy (${response.status}). Waiting ${wait / 1000}s before retry ${attempt + 1}/4…`);
        await sleep(wait);
        return overpass(ql, attempt + 1);
    }
    if (!response.ok) throw new Error(`Overpass returned ${response.status}`);

    const body = (await response.json()) as { elements?: OverpassElement[] };
    return body.elements ?? [];
}

/** Kilometres between two points. Good enough to name a road's neighbourhood. */
function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLon = ((b.lon - a.lon) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    return 2 * R * Math.asin(Math.sqrt(h));
}

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error("DATABASE_URL is not set.");
        process.exit(1);
    }

    const rows: Array<{
        osmType: string; osmId: string; name: string; nameBn: string | null;
        nameEn: string | null; kind: string; osmValue: string | null;
        lat: number; lon: number;
    }> = [];

    for (const q of QUERIES) {
        console.log(`Fetching ${q.label}…`);
        const elements = await overpass(q.ql);
        console.log(`  ${elements.length} elements`);

        for (const el of elements) {
            const tags = el.tags ?? {};
            const name = tags.name?.trim();
            if (!name) continue;

            const point = el.center ?? (el.lat != null && el.lon != null ? { lat: el.lat, lon: el.lon } : null);
            if (!point) continue;

            rows.push({
                osmType: el.type,
                osmId: String(el.id),
                name,
                nameBn: tags["name:bn"]?.trim() || null,
                // Every sampled Dhaka area carries this, and without it the
                // neighbourhoods are invisible to anyone typing in English.
                nameEn: tags["name:en"]?.trim() || null,
                kind: q.kind,
                osmValue: tags.place ?? tags.highway ?? null,
                lat: point.lat,
                lon: point.lon,
            });
        }
        await sleep(5_000); // between the two extracts
    }

    /**
     * Name each road by the nearest area centre.
     *
     * Dhaka has a "Road 5" in Dhanmondi, another in Gulshan and another in
     * Uttara. Without the neighbourhood beside it the customer is choosing
     * between identical labels, which is exactly the confusion this feature
     * exists to remove.
     */
    const areas = rows.filter((r) => r.kind === "area");
    const withContext = rows.map((row) => {
        if (row.kind === "area") return { ...row, contextName: null as string | null };
        let nearest: string | null = null;
        let best = Infinity;
        for (const area of areas) {
            const d = distanceKm({ lat: row.lat, lon: row.lon }, { lat: area.lat, lon: area.lon });
            if (d < best) { best = d; nearest = area.nameEn || area.name; }
        }
        // Beyond 6km the "nearest" area is a guess, and a wrong neighbourhood
        // is worse than none.
        return { ...row, contextName: best <= 6 ? nearest : null };
    });

    const withBn = withContext.filter((r) => r.nameBn).length;
    console.log("");
    console.log(`Total rows        : ${withContext.length}`);
    console.log(`  areas           : ${areas.length}`);
    console.log(`  roads           : ${withContext.length - areas.length}`);
    console.log(`  with name:bn    : ${withBn} (${Math.round((100 * withBn) / Math.max(1, withContext.length))}%)`);

    if (DRY_RUN) {
        console.log("\n--dry-run: nothing written.");
        console.log("Sample:");
        for (const r of withContext.slice(0, 5)) {
            console.log(`  ${r.name} | bn=${r.nameBn ?? "—"} | ${r.kind} | ${r.contextName ?? "—"}`);
        }
        return;
    }

    /**
     * Managed Postgres (Aiven, Neon) presents a chain Node will not verify
     * without its CA bundle, so a plain `sslmode=require` fails with
     * "self-signed certificate in certificate chain" — after the whole city has
     * already been downloaded, which wastes someone else's Overpass capacity.
     *
     * Keyed off "is this remote" rather than off one spelling of sslmode: the
     * previous test looked for the literal `sslmode=require` and so silently did
     * nothing for `sslmode=no-verify`, `sslmode=prefer`, or no sslmode at all.
     */
    const dbUrl = process.env.DATABASE_URL;
    const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);
    const client = new pg.Client({
        connectionString: dbUrl,
        ssl: isLocalDb ? undefined : { rejectUnauthorized: false },
    });
    await client.connect();

    let written = 0;
    try {
        await client.query("BEGIN");
        for (const r of withContext) {
            // Lowercased so the trigram index matches regardless of case, and
            // both languages plus the neighbourhood live in one column so a
            // single similarity query serves all of them.
            const searchText = [r.name, r.nameBn, r.nameEn, r.contextName]
                .filter(Boolean).join(" ").toLowerCase();

            await client.query(
                `INSERT INTO dhaka_places
                   (id, osm_type, osm_id, name, name_bn, name_en, kind, osm_value, context_name, latitude, longitude, search_text)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                 ON CONFLICT (osm_type, osm_id) DO UPDATE SET
                   name = EXCLUDED.name,
                   name_bn = EXCLUDED.name_bn,
                   name_en = EXCLUDED.name_en,
                   kind = EXCLUDED.kind,
                   osm_value = EXCLUDED.osm_value,
                   context_name = EXCLUDED.context_name,
                   latitude = EXCLUDED.latitude,
                   longitude = EXCLUDED.longitude,
                   search_text = EXCLUDED.search_text,
                   imported_at = now()`,
                [randomUUID(), r.osmType, r.osmId, r.name, r.nameBn, r.nameEn,
                 r.kind, r.osmValue, r.contextName, r.lat, r.lon, searchText],
            );
            written += 1;
        }
        await client.query("COMMIT");
    } catch (e) {
        await client.query("ROLLBACK");
        throw e;
    } finally {
        await client.end();
    }

    console.log(`\nWrote ${written} rows into dhaka_places.`);
}

main().catch((err) => {
    console.error("Import failed:", err?.message || err);
    process.exit(1);
});
