import { settingsRepo } from '../repositories/index.js';

interface Coordinates {
    latitude: number;
    longitude: number;
}

export interface RouteEstimateResult {
    distanceKm: number;
    durationMinutes: number | null;
    geometry: {
        type: 'LineString';
        coordinates: number[][];
    };
    method: 'road_route' | 'straight_line_fallback';
    provider: 'openrouteservice' | 'osrm' | 'local';
}

const EARTH_RADIUS_KM = 6371;

function calculateDistanceKm(from: Coordinates, to: Coordinates): number {
    const toRadians = (degrees: number) => degrees * Math.PI / 180;
    const latitudeDelta = toRadians(to.latitude - from.latitude);
    const longitudeDelta = toRadians(to.longitude - from.longitude);
    const fromLatitude = toRadians(from.latitude);
    const toLatitude = toRadians(to.latitude);
    const haversine = Math.sin(latitudeDelta / 2) ** 2
        + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

async function getServiceCenterCoordinates(): Promise<Coordinates | null> {
    const [latitudeSetting, longitudeSetting] = await Promise.all([
        settingsRepo.getSetting('service_center_latitude'),
        settingsRepo.getSetting('service_center_longitude'),
    ]);
    const latitude = Number(latitudeSetting?.value);
    const longitude = Number(longitudeSetting?.value);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (latitude < 20 || latitude > 27 || longitude < 87.5 || longitude > 93) return null;
    return { latitude, longitude };
}

function createFallback(origin: Coordinates, destination: Coordinates): RouteEstimateResult {
    const distanceKm = Number(calculateDistanceKm(origin, destination).toFixed(2));
    return {
        distanceKm,
        durationMinutes: Math.max(1, Math.round((distanceKm / 25) * 60)),
        geometry: {
            type: 'LineString',
            coordinates: [
                [origin.longitude, origin.latitude],
                [destination.longitude, destination.latitude],
            ],
        },
        method: 'straight_line_fallback',
        provider: 'local',
    };
}

/** Normalize GeoJSON line coordinates to [lng, lat] pairs. */
function normalizeLineCoordinates(raw: unknown): number[][] | null {
    if (!Array.isArray(raw) || raw.length < 2) return null;

    if (Array.isArray(raw[0]) && Array.isArray((raw[0] as unknown[])[0])) {
        const flattened: number[][] = [];
        for (const segment of raw as unknown[]) {
            if (!Array.isArray(segment)) continue;
            for (const point of segment) {
                if (!Array.isArray(point) || point.length < 2) continue;
                const lng = Number(point[0]);
                const lat = Number(point[1]);
                if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
                if (Math.abs(lng) > 180 || Math.abs(lat) > 90) continue;
                flattened.push([lng, lat]);
            }
        }
        return flattened.length >= 2 ? flattened : null;
    }

    const line: number[][] = [];
    for (const point of raw) {
        if (!Array.isArray(point) || point.length < 2) continue;
        const lng = Number(point[0]);
        const lat = Number(point[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
        if (Math.abs(lng) > 180 || Math.abs(lat) > 90) continue;
        line.push([lng, lat]);
    }
    return line.length >= 2 ? line : null;
}

async function fetchOpenRouteService(
    origin: Coordinates,
    destination: Coordinates,
    apiKey: string,
): Promise<RouteEstimateResult | null> {
    const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
        method: 'POST',
        headers: {
            Accept: 'application/geo+json, application/json',
            Authorization: apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            coordinates: [
                [origin.longitude, origin.latitude],
                [destination.longitude, destination.latitude],
            ],
            geometry_simplify: false,
            instructions: false,
            preference: 'recommended',
        }),
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
        console.log(`[RouteEstimate] OpenRouteService HTTP ${response.status} — trying next provider`);
        return null;
    }

    const payload = await response.json() as {
        features?: Array<{
            geometry?: { type?: string; coordinates?: unknown };
            properties?: { summary?: { distance?: number; duration?: number } };
        }>;
    };
    const feature = payload.features?.[0];
    const geometryType = feature?.geometry?.type;
    const coordinates = normalizeLineCoordinates(feature?.geometry?.coordinates);
    const distance = feature?.properties?.summary?.distance;
    const duration = feature?.properties?.summary?.duration;

    if (
        !coordinates
        || (geometryType !== 'LineString' && geometryType !== 'MultiLineString')
        || typeof distance !== 'number'
        || !Number.isFinite(distance)
        || distance <= 0
        || coordinates.length < 3
    ) {
        console.log('[RouteEstimate] OpenRouteService returned incomplete geometry — trying next provider');
        return null;
    }

    return {
        distanceKm: Number((distance / 1000).toFixed(2)),
        durationMinutes: typeof duration === 'number' ? Math.max(1, Math.round(duration / 60)) : null,
        geometry: { type: 'LineString', coordinates },
        method: 'road_route',
        provider: 'openrouteservice',
    };
}

/**
 * OSRM road routing (GeoJSON LineString along roads).
 * Uses OSRM_URL when set, else the public demo server (same privacy class as ORS: ephemeral request only).
 */
async function fetchOsrmRoadRoute(
    origin: Coordinates,
    destination: Coordinates,
): Promise<RouteEstimateResult | null> {
    const base = (process.env.OSRM_URL || 'https://router.project-osrm.org').replace(/\/$/, '');
    const path = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
    const url = `${base}/route/v1/driving/${path}?overview=full&geometries=geojson&steps=false&annotations=false`;

    const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
        console.log(`[RouteEstimate] OSRM HTTP ${response.status} — using straight-line fallback`);
        return null;
    }

    const payload = await response.json() as {
        code?: string;
        routes?: Array<{
            distance?: number;
            duration?: number;
            geometry?: { type?: string; coordinates?: unknown };
        }>;
    };
    if (payload.code && payload.code !== 'Ok') {
        console.log(`[RouteEstimate] OSRM code ${payload.code} — using straight-line fallback`);
        return null;
    }

    const route = payload.routes?.[0];
    const coordinates = normalizeLineCoordinates(route?.geometry?.coordinates);
    const distance = route?.distance;
    const duration = route?.duration;

    if (
        !coordinates
        || typeof distance !== 'number'
        || !Number.isFinite(distance)
        || distance <= 0
        || coordinates.length < 3
    ) {
        console.log('[RouteEstimate] OSRM incomplete geometry — using straight-line fallback');
        return null;
    }

    return {
        distanceKm: Number((distance / 1000).toFixed(2)),
        durationMinutes: typeof duration === 'number' ? Math.max(1, Math.round(duration / 60)) : null,
        geometry: { type: 'LineString', coordinates },
        method: 'road_route',
        provider: 'osrm',
    };
}

export async function estimateRoute(origin: Coordinates): Promise<RouteEstimateResult | null> {
    const destination = await getServiceCenterCoordinates();
    if (!destination) return null;

    // 1) OpenRouteService when key is configured
    const apiKey = process.env.OPENROUTESERVICE_API_KEY?.trim()
        || process.env.ORS_API_KEY?.trim()
        || process.env.OPEN_ROUTE_SERVICE_KEY?.trim();

    if (apiKey) {
        try {
            const ors = await fetchOpenRouteService(origin, destination, apiKey);
            if (ors) return ors;
        } catch {
            console.log('[RouteEstimate] OpenRouteService request failed — trying OSRM');
        }
    } else {
        console.log('[RouteEstimate] No OPENROUTESERVICE_API_KEY — trying OSRM for road geometry');
    }

    // 2) OSRM road geometry (real roads, not a straight cut)
    try {
        const osrm = await fetchOsrmRoadRoute(origin, destination);
        if (osrm) return osrm;
    } catch {
        console.log('[RouteEstimate] OSRM request failed — straight-line fallback');
    }

    // 3) Privacy-safe straight line only when no road provider works
    return createFallback(origin, destination);
}
