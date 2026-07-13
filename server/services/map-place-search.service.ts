/**
 * Admin map place search via Photon (OSM) + boundary candidates via Nominatim.
 * Does not log query text or coordinates. Does not persist results.
 * Never converts a provider bounding box into a polygon.
 */

export interface MapPlaceSuggestion {
    id: string;
    label: string;
    latitude: number;
    longitude: number;
    type: string;
}

export type BoundaryConfidence = 'high' | 'review' | 'reject';

export interface MapBoundaryCandidate {
    id: string;
    label: string;
    latitude: number;
    longitude: number;
    sourceType: 'relation' | 'way';
    sourceId: string;
    geometryType: 'Polygon' | 'MultiPolygon';
    /** Provider metadata retained for admin QA only — strip before public storage if needed */
    osmType: 'relation' | 'way';
    osmId: string;
    category: string | null;
    type: string | null;
    addressType: string | null;
    placeRank: number | null;
    importance: number | null;
    displayName: string;
    boundingBox: {
        west: number;
        south: number;
        east: number;
        north: number;
    };
    vertexCount: number;
    areaSquareKm: number;
    confidence: BoundaryConfidence;
    qualityFlags: string[];
    boundaryGeoJson: {
        type: 'Feature';
        properties: Record<string, unknown>;
        geometry: {
            type: 'Polygon' | 'MultiPolygon';
            coordinates: unknown[];
        };
    };
}

const PHOTON_URL = 'https://photon.komoot.io/api/';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const PROVIDER_TIMEOUT_MS = 4_000;
const RESULT_LIMIT = 5;
const BOUNDARY_RESULT_LIMIT = 6;
const BOUNDARY_CACHE_TTL_MS = 24 * 60 * 60_000;
const BOUNDARY_CACHE_MAX_ENTRIES = 40;
const NOMINATIM_MIN_INTERVAL_MS = 1_100;
const BOUNDARY_PROVIDER_MAX_BYTES = 2 * 1024 * 1024;

// Bangladesh operational bounds (same as service-areas routes)
const BD_LAT_MIN = 20.0;
const BD_LAT_MAX = 27.0;
const BD_LON_MIN = 87.5;
const BD_LON_MAX = 93.0;

// Dhaka bias (not a customer location — city center for ranking only)
const DHAKA_LAT = 23.8103;
const DHAKA_LON = 90.4125;

/** Neighbourhood / thana-scale polygons above this are implausibly large for service areas. */
const MAX_NEIGHBOURHOOD_AREA_KM2 = 25;
/** Soft review threshold for oversized neighbourhoods. */
const REVIEW_NEIGHBOURHOOD_AREA_KM2 = 8;
/** Reject polygons with fewer exterior vertices (closed ring of 5 = 4 corners). */
const MIN_HIGH_CONFIDENCE_VERTICES = 12;
const BOUNDARY_GEOMETRY_MAX_BYTES = 256 * 1024;

const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX_ENTRIES = 80;

interface CacheEntry {
    expiresAt: number;
    results: MapPlaceSuggestion[];
}

const cache = new Map<string, CacheEntry>();
const boundaryCache = new Map<string, { expiresAt: number; results: MapBoundaryCandidate[] }>();
let boundaryRequestQueue: Promise<void> = Promise.resolve();
let lastBoundaryRequestAt = 0;

export function normalizePlaceQuery(raw: string): string {
    return raw.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function pruneCache(): void {
    const now = Date.now();
    for (const [key, entry] of Array.from(cache.entries())) {
        if (entry.expiresAt <= now) cache.delete(key);
    }
    while (cache.size > CACHE_MAX_ENTRIES) {
        const oldest = cache.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        cache.delete(oldest);
    }
}

function pruneBoundaryCache(): void {
    const now = Date.now();
    for (const [key, entry] of Array.from(boundaryCache.entries())) {
        if (entry.expiresAt <= now) boundaryCache.delete(key);
    }
    while (boundaryCache.size > BOUNDARY_CACHE_MAX_ENTRIES) {
        const oldest = boundaryCache.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        boundaryCache.delete(oldest);
    }
}

function inBangladesh(lat: number, lon: number): boolean {
    return (
        Number.isFinite(lat) &&
        Number.isFinite(lon) &&
        lat >= BD_LAT_MIN &&
        lat <= BD_LAT_MAX &&
        lon >= BD_LON_MIN &&
        lon <= BD_LON_MAX
    );
}

function buildLabel(props: Record<string, unknown>): string {
    const parts = [
        props.name,
        props.street,
        props.district,
        props.city,
        props.locality,
        props.county,
        props.state,
        props.country,
    ]
        .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
        .map((p) => p.trim());
    const unique: string[] = [];
    for (const p of parts) {
        if (unique[unique.length - 1]?.toLocaleLowerCase() !== p.toLocaleLowerCase()) {
            unique.push(p);
        }
    }
    return unique.slice(0, 5).join(', ') || 'Unknown place';
}

function normalizeFeatures(payload: unknown): MapPlaceSuggestion[] {
    if (!payload || typeof payload !== 'object') return [];
    const features = (payload as { features?: unknown }).features;
    if (!Array.isArray(features)) return [];

    const out: MapPlaceSuggestion[] = [];
    for (const feature of features) {
        if (!feature || typeof feature !== 'object') continue;
        const f = feature as {
            geometry?: { type?: string; coordinates?: unknown };
            properties?: Record<string, unknown>;
        };
        const coords = f.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) continue;
        const lon = Number(coords[0]);
        const lat = Number(coords[1]);
        if (!inBangladesh(lat, lon)) continue;

        const props = f.properties ?? {};
        const osmType = typeof props.osm_type === 'string' ? props.osm_type : 'n';
        const osmId = props.osm_id != null ? String(props.osm_id) : null;
        const id = osmId ? `${osmType}:${osmId}` : `coord:${lat.toFixed(5)},${lon.toFixed(5)}`;
        const type =
            (typeof props.type === 'string' && props.type) ||
            (typeof props.osm_value === 'string' && props.osm_value) ||
            (typeof props.osm_key === 'string' && props.osm_key) ||
            'place';

        out.push({
            id,
            label: buildLabel(props),
            latitude: lat,
            longitude: lon,
            type,
        });
        if (out.length >= RESULT_LIMIT) break;
    }
    return out;
}

function asLonLat(position: unknown): [number, number] | null {
    if (!Array.isArray(position) || position.length < 2) return null;
    const lon = Number(position[0]);
    const lat = Number(position[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    return [lon, lat];
}

function exteriorRings(geometry: { type: string; coordinates: unknown[] }): number[][][] {
    if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates[0])) {
        return [geometry.coordinates[0] as number[][]];
    }
    if (geometry.type === 'MultiPolygon') {
        return (geometry.coordinates as unknown[][])
            .filter((poly) => Array.isArray(poly) && Array.isArray(poly[0]))
            .map((poly) => poly[0] as number[][]);
    }
    return [];
}

function vertexCountForGeometry(geometry: { type: string; coordinates: unknown[] }): number {
    return exteriorRings(geometry).reduce((sum, ring) => sum + ring.length, 0);
}

/** Equirectangular shoelace area in km² (adequate for BD neighbourhood scale). */
export function estimatePolygonAreaKm2(geometry: { type: string; coordinates: unknown[] }): number {
    let total = 0;
    for (const ring of exteriorRings(geometry)) {
        if (ring.length < 4) continue;
        let lat0 = 0;
        for (const pos of ring) {
            const p = asLonLat(pos);
            if (p) lat0 += p[1];
        }
        lat0 /= ring.length;
        const cos = Math.cos((lat0 * Math.PI) / 180);
        const mPerDeg = 111_320;
        let a = 0;
        for (let i = 0; i < ring.length - 1; i++) {
            const p1 = asLonLat(ring[i]);
            const p2 = asLonLat(ring[i + 1]);
            if (!p1 || !p2) continue;
            const x1 = p1[0] * mPerDeg * cos;
            const y1 = p1[1] * mPerDeg;
            const x2 = p2[0] * mPerDeg * cos;
            const y2 = p2[1] * mPerDeg;
            a += x1 * y2 - x2 * y1;
        }
        total += Math.abs(a) / 2 / 1e6;
    }
    return total;
}

function isAxisAlignedRectangle(ring: unknown[]): boolean {
    const positions = ring
        .map(asLonLat)
        .filter((p): p is [number, number] => p != null);
    if (positions.length !== 5) return false;
    const first = positions[0];
    const last = positions[4];
    if (first[0] !== last[0] || first[1] !== last[1]) return false;
    const longitudes = new Set(positions.map(([lon]) => lon));
    const latitudes = new Set(positions.map(([, lat]) => lat));
    return longitudes.size === 2 && latitudes.size === 2;
}

/** Low-vertex quadrilateral / near-rectangle / skewed rectangle (bbox-like). */
function isLowVertexNearRectangle(ring: unknown[]): boolean {
    const positions = ring
        .map(asLonLat)
        .filter((p): p is [number, number] => p != null);
    // closed ring: 5 positions = 4 unique corners
    if (positions.length < 5 || positions.length > 6) return false;
    const unique = positions.slice(0, -1);
    if (unique.length !== 4) return false;

    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const [lon, lat] of unique) {
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
    }
    const width = maxLon - minLon;
    const height = maxLat - minLat;
    if (width <= 0 || height <= 0) return true;

    // Fraction of vertices near bbox corners (skewed/axis rectangles)
    let nearCorners = 0;
    const corners: [number, number][] = [
        [minLon, minLat],
        [maxLon, minLat],
        [maxLon, maxLat],
        [minLon, maxLat],
    ];
    const tol = Math.max(width, height) * 0.08;
    for (const [lon, lat] of unique) {
        if (corners.some(([cx, cy]) => Math.hypot(lon - cx, lat - cy) <= tol)) {
            nearCorners += 1;
        }
    }
    if (nearCorners >= 3) return true;

    // Area of polygon vs bbox area: near 1.0 ⇒ rectangle-like
    const polyKm2 = estimatePolygonAreaKm2({ type: 'Polygon', coordinates: [unique.concat([unique[0]])] });
    const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const mPerDeg = 111_320;
    const bboxKm2 = (width * mPerDeg * cos * height * mPerDeg) / 1e6;
    if (bboxKm2 > 0 && polyKm2 / bboxKm2 > 0.92) return true;

    return isAxisAlignedRectangle(ring);
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const pi = asLonLat(ring[i]);
        const pj = asLonLat(ring[j]);
        if (!pi || !pj) continue;
        const [xi, yi] = pi;
        const [xj, yj] = pj;
        const intersect =
            yi > lat !== yj > lat &&
            lon < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

function centroidInsidePolygon(
    lon: number,
    lat: number,
    geometry: { type: string; coordinates: unknown[] },
): boolean {
    for (const ring of exteriorRings(geometry)) {
        if (pointInRing(lon, lat, ring as number[][])) return true;
    }
    return false;
}

function allCoordinatesInBangladesh(geometry: { type: string; coordinates: unknown[] }): boolean {
    for (const ring of exteriorRings(geometry)) {
        for (const pos of ring) {
            const p = asLonLat(pos);
            if (!p || !inBangladesh(p[1], p[0])) return false;
        }
    }
    return true;
}

function tokenize(s: string): string[] {
    return s
        .toLocaleLowerCase()
        .replace(/[^a-z0-9\u0980-\u09FF\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 3);
}

function nameMismatchFlags(query: string, displayName: string, type: string | null, addressType: string | null, category: string | null): string[] {
    const flags: string[] = [];
    const qTokens = tokenize(query);
    const nameLower = displayName.toLocaleLowerCase();
    const primary = (displayName.split(',')[0] || '').toLocaleLowerCase();

    const queryHit = qTokens.some((t) => nameLower.includes(t) || primary.includes(t));
    if (!queryHit && qTokens.length > 0) {
        flags.push('strong_name_mismatch');
    }

    const rivalNeighbourhoods = [
        'cantonment', 'gulshan', 'mohakhali', 'baridhara', 'tejjgaon', 'tejturi',
        'uttara', 'mirpur', 'mohammadpur', 'bashundhara',
    ];
    for (const rival of rivalNeighbourhoods) {
        if (primary.includes(rival) && !qTokens.some((t) => t.includes(rival) || rival.includes(t))) {
            // Banani query returning Cantonment etc.
            if (qTokens.some((t) => nameLower.includes(t)) === false || !primary.includes(qTokens[0])) {
                flags.push(`name_suggests_${rival}`);
            }
        }
    }

    const buildingTypes = new Set([
        'building', 'house', 'residential', 'apartments', 'commercial', 'retail',
        'office', 'yes', 'construction',
    ]);
    if (
        (type && buildingTypes.has(type.toLocaleLowerCase()))
        || (addressType && ['building', 'house', 'amenity'].includes(addressType.toLocaleLowerCase()))
        || category === 'building'
    ) {
        flags.push('individual_building_or_amenity');
    }

    const landuseTypes = new Set(['industrial', 'farmland', 'forest', 'meadow', 'quarry', 'military']);
    if (type && landuseTypes.has(type.toLocaleLowerCase())) {
        flags.push('unrelated_landuse');
    }

    return flags;
}

function preferredBoundaryTypes(type: string | null, addressType: string | null, category: string | null): boolean {
    const t = (type || '').toLocaleLowerCase();
    const a = (addressType || '').toLocaleLowerCase();
    const c = (category || '').toLocaleLowerCase();
    const ok = new Set([
        'suburb', 'neighbourhood', 'neighborhood', 'quarter', 'city_district',
        'borough', 'district', 'town', 'village', 'administrative', 'boundary',
        'place', 'residential',
    ]);
    return ok.has(t) || ok.has(a) || c === 'boundary' || c === 'place';
}

export function analyzeBoundaryCandidateQuality(input: {
    query: string;
    displayName: string;
    latitude: number;
    longitude: number;
    category: string | null;
    type: string | null;
    addressType: string | null;
    placeRank: number | null;
    importance: number | null;
    geometryType: string;
    coordinates: unknown[];
}): { vertexCount: number; areaSquareKm: number; confidence: BoundaryConfidence; qualityFlags: string[] } {
    const flags: string[] = [];
    const geometry = { type: input.geometryType, coordinates: input.coordinates };

    if (input.geometryType === 'Point' || input.geometryType === 'LineString' || input.geometryType === 'MultiLineString') {
        return {
            vertexCount: 0,
            areaSquareKm: 0,
            confidence: 'reject',
            qualityFlags: ['unsupported_geometry_type', `type_${input.geometryType}`],
        };
    }

    if (input.geometryType !== 'Polygon' && input.geometryType !== 'MultiPolygon') {
        return {
            vertexCount: 0,
            areaSquareKm: 0,
            confidence: 'reject',
            qualityFlags: ['unsupported_geometry_type'],
        };
    }

    const rings = exteriorRings(geometry);
    if (rings.length === 0) {
        return { vertexCount: 0, areaSquareKm: 0, confidence: 'reject', qualityFlags: ['empty_coordinates'] };
    }

    const vertexCount = vertexCountForGeometry(geometry);
    const areaSquareKm = Number(estimatePolygonAreaKm2(geometry).toFixed(4));
    const serialized = JSON.stringify(geometry);
    if (Buffer.byteLength(serialized, 'utf8') > BOUNDARY_GEOMETRY_MAX_BYTES) {
        flags.push('oversized_geometry_payload');
    }

    if (!allCoordinatesInBangladesh(geometry)) {
        flags.push('coordinates_outside_bangladesh');
    }
    if (!inBangladesh(input.latitude, input.longitude)) {
        flags.push('centroid_outside_bangladesh');
    }
    if (!centroidInsidePolygon(input.longitude, input.latitude, geometry)) {
        flags.push('centroid_outside_polygon');
    }

    for (const ring of rings) {
        if (isAxisAlignedRectangle(ring)) {
            flags.push('bounding_box_rectangle');
        } else if (isLowVertexNearRectangle(ring)) {
            flags.push('low_vertex_near_rectangle');
        }
        if (ring.length <= 5) {
            flags.push('low_vertex_quadrilateral');
        }
    }

    if (vertexCount < MIN_HIGH_CONFIDENCE_VERTICES) {
        flags.push('insufficient_vertex_detail');
    }
    if (areaSquareKm > MAX_NEIGHBOURHOOD_AREA_KM2) {
        flags.push('implausibly_large_neighbourhood');
    } else if (areaSquareKm > REVIEW_NEIGHBOURHOOD_AREA_KM2) {
        flags.push('large_neighbourhood_review');
    }
    if (areaSquareKm < 0.01 && vertexCount > 0) {
        flags.push('implausibly_tiny_area');
    }

    flags.push(...nameMismatchFlags(input.query, input.displayName, input.type, input.addressType, input.category));

    if (!preferredBoundaryTypes(input.type, input.addressType, input.category)) {
        flags.push('non_administrative_place_type');
    }

    // Hard rejects
    const rejectFlags = new Set([
        'unsupported_geometry_type',
        'bounding_box_rectangle',
        'coordinates_outside_bangladesh',
        'centroid_outside_bangladesh',
        'oversized_geometry_payload',
        'implausibly_large_neighbourhood',
        'strong_name_mismatch',
        'individual_building_or_amenity',
        'unrelated_landuse',
        'empty_coordinates',
    ]);
    if (flags.some((f) => rejectFlags.has(f) || f.startsWith('name_suggests_'))) {
        return { vertexCount, areaSquareKm, confidence: 'reject', qualityFlags: Array.from(new Set(flags)) };
    }

    // High confidence: enough detail, not a box, name aligns, admin-ish type
    const reviewFlags = new Set([
        'low_vertex_near_rectangle',
        'low_vertex_quadrilateral',
        'insufficient_vertex_detail',
        'large_neighbourhood_review',
        'centroid_outside_polygon',
        'non_administrative_place_type',
        'implausibly_tiny_area',
    ]);
    if (flags.some((f) => reviewFlags.has(f))) {
        return { vertexCount, areaSquareKm, confidence: 'review', qualityFlags: Array.from(new Set(flags)) };
    }

    if (
        vertexCount >= MIN_HIGH_CONFIDENCE_VERTICES
        && preferredBoundaryTypes(input.type, input.addressType, input.category)
        && areaSquareKm <= REVIEW_NEIGHBOURHOOD_AREA_KM2
    ) {
        return { vertexCount, areaSquareKm, confidence: 'high', qualityFlags: Array.from(new Set(flags)) };
    }

    return { vertexCount, areaSquareKm, confidence: 'review', qualityFlags: Array.from(new Set(flags)) };
}

function normalizeBoundaryCandidates(payload: unknown, query: string): MapBoundaryCandidate[] {
    if (!Array.isArray(payload)) return [];
    const results: MapBoundaryCandidate[] = [];

    for (const item of payload) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const osmType = row.osm_type;
        if (osmType !== 'relation' && osmType !== 'way') {
            // Point/node results cannot supply area outlines — skip (do not invent from bbox)
            continue;
        }
        if (row.osm_id == null || typeof row.display_name !== 'string') continue;

        const lat = Number(row.lat);
        const lon = Number(row.lon);
        if (!inBangladesh(lat, lon)) continue;

        const geojson = row.geojson;
        if (!geojson || typeof geojson !== 'object' || Array.isArray(geojson)) continue;
        const geometry = geojson as { type?: unknown; coordinates?: unknown };
        if (geometry.type === 'Point' || geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
            continue;
        }
        if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') continue;
        if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) continue;

        // Never promote provider boundingbox array into a polygon
        const bounds = row.boundingbox;
        if (!Array.isArray(bounds) || bounds.length !== 4) continue;
        const south = Number(bounds[0]);
        const north = Number(bounds[1]);
        const west = Number(bounds[2]);
        const east = Number(bounds[3]);
        if (!inBangladesh(south, west) || !inBangladesh(north, east)) continue;

        const category = typeof row.category === 'string' ? row.category : (typeof row.class === 'string' ? row.class : null);
        const type = typeof row.type === 'string' ? row.type : null;
        const addressType = typeof row.addresstype === 'string' ? row.addresstype : null;
        const placeRank = row.place_rank != null && Number.isFinite(Number(row.place_rank)) ? Number(row.place_rank) : null;
        const importance = row.importance != null && Number.isFinite(Number(row.importance)) ? Number(row.importance) : null;
        const displayName = row.display_name.trim();
        const sourceId = String(row.osm_id);
        const geometryType = geometry.type as 'Polygon' | 'MultiPolygon';

        const quality = analyzeBoundaryCandidateQuality({
            query,
            displayName,
            latitude: lat,
            longitude: lon,
            category,
            type,
            addressType,
            placeRank,
            importance,
            geometryType,
            coordinates: geometry.coordinates as unknown[],
        });

        // Omit pure rejects from list except name/size issues that admin may want to see as "rejected preview"
        // Spec: return candidates with confidence including reject — still list for transparency
        results.push({
            id: `${osmType}:${sourceId}`,
            label: displayName,
            latitude: lat,
            longitude: lon,
            sourceType: osmType,
            sourceId,
            geometryType,
            osmType,
            osmId: sourceId,
            category,
            type,
            addressType,
            placeRank,
            importance,
            displayName,
            boundingBox: { west, south, east, north },
            vertexCount: quality.vertexCount,
            areaSquareKm: quality.areaSquareKm,
            confidence: quality.confidence,
            qualityFlags: quality.qualityFlags,
            boundaryGeoJson: {
                type: 'Feature',
                properties: {
                    // Admin-only provenance; strip before public customer responses
                    source: 'openstreetmap',
                    sourceType: osmType,
                    sourceId,
                    sourceLabel: displayName,
                    category,
                    type,
                    addressType,
                    placeRank,
                    importance,
                    confidence: quality.confidence,
                    importedAt: new Date().toISOString(),
                },
                geometry: {
                    type: geometryType,
                    coordinates: geometry.coordinates as unknown[],
                },
            },
        });
        if (results.length >= BOUNDARY_RESULT_LIMIT) break;
    }

    // Prefer high, then review, then reject
    const rank = { high: 0, review: 1, reject: 2 };
    results.sort((a, b) => rank[a.confidence] - rank[b.confidence] || b.vertexCount - a.vertexCount);
    return results;
}

async function waitForBoundaryProviderSlot(): Promise<void> {
    const previous = boundaryRequestQueue;
    let release = () => {};
    boundaryRequestQueue = new Promise<void>((resolve) => {
        release = resolve;
    });
    await previous;
    const delay = Math.max(0, NOMINATIM_MIN_INTERVAL_MS - (Date.now() - lastBoundaryRequestAt));
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    lastBoundaryRequestAt = Date.now();
    release();
}

/**
 * Search places via Photon. Throws on provider/network failure (caller maps to 503).
 * Never logs the query or coordinates.
 */
export async function searchMapPlaces(
    normalizedQuery: string,
    options: { cache?: boolean } = {},
): Promise<MapPlaceSuggestion[]> {
    const useCache = options.cache !== false;
    pruneCache();
    const cached = useCache ? cache.get(normalizedQuery) : undefined;
    if (cached && cached.expiresAt > Date.now()) {
        return cached.results;
    }

    const params = new URLSearchParams({
        q: normalizedQuery,
        limit: String(RESULT_LIMIT),
        lat: String(DHAKA_LAT),
        lon: String(DHAKA_LON),
        bbox: `${BD_LON_MIN},${BD_LAT_MIN},${BD_LON_MAX},${BD_LAT_MAX}`,
        lang: 'en',
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
        const response = await fetch(`${PHOTON_URL}?${params.toString()}`, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'User-Agent': 'PromiseElectronics-AdminMapSearch/1.0',
            },
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error('provider_http_error');
        }
        const payload = await response.json();
        const results = normalizeFeatures(payload);
        if (useCache) {
            cache.set(normalizedQuery, {
                expiresAt: Date.now() + CACHE_TTL_MS,
                results,
            });
            pruneCache();
        }
        return results;
    } finally {
        clearTimeout(timer);
    }
}

export async function searchMapBoundaries(normalizedQuery: string): Promise<MapBoundaryCandidate[]> {
    pruneBoundaryCache();
    const cached = boundaryCache.get(normalizedQuery);
    if (cached && cached.expiresAt > Date.now()) return cached.results;

    await waitForBoundaryProviderSlot();
    const params = new URLSearchParams({
        q: `${normalizedQuery}, Bangladesh`,
        format: 'jsonv2',
        polygon_geojson: '1',
        addressdetails: '1',
        countrycodes: 'bd',
        dedupe: '1',
        limit: String(BOUNDARY_RESULT_LIMIT + 2),
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
        const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'Accept-Language': 'en',
                'User-Agent': 'PromiseElectronics-ServiceAreaBoundary/1.0',
            },
            signal: controller.signal,
        });
        if (!response.ok) throw new Error('provider_http_error');
        const responseText = await response.text();
        if (Buffer.byteLength(responseText, 'utf8') > BOUNDARY_PROVIDER_MAX_BYTES) {
            throw new Error('provider_response_too_large');
        }
        const results = normalizeBoundaryCandidates(JSON.parse(responseText), normalizedQuery);
        boundaryCache.set(normalizedQuery, {
            expiresAt: Date.now() + BOUNDARY_CACHE_TTL_MS,
            results,
        });
        pruneBoundaryCache();
        return results;
    } finally {
        clearTimeout(timer);
    }
}

/** Test helper — clears cache (local QA only; not exported via routes). */
export function __clearMapPlaceSearchCacheForTests(): void {
    cache.clear();
    boundaryCache.clear();
}
