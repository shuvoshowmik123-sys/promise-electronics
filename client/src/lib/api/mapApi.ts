import { fetchApi } from './httpClient';

export interface AreaBoundaryFeature {
    type: 'Feature';
    properties?: Record<string, unknown>;
    geometry: {
        type: 'Polygon' | 'MultiPolygon';
        coordinates: unknown[];
    };
}

export interface ServiceAreaMapItem {
    id: string;
    city: string;
    areaName: string;
    subareaName: string | null;
    blockOrSector: string | null;
    centroidLatitude: number | null;
    centroidLongitude: number | null;
    boundaryGeoJson: AreaBoundaryFeature | null;
    demandLevel: 'new' | 'growing' | 'popular' | 'high demand';
    demandRange?: 'new_service_area' | '5_plus' | '20_plus' | '50_plus';
    serviceAvailable?: boolean;
    /** Admin only — present on /admin/area-map-data */
    isActive?: boolean;
    isPublic?: boolean;
    serviceRequestCount?: number;
    jobCount?: number;
    completedJobCount?: number;
    billedTotal?: number;
    collectedTotal?: number;
    warrantyClaimCount?: number;
}

export interface ServiceAreaRecord extends ServiceAreaMapItem {
    normalizedKey?: string;
    isActive: boolean;
    isPublic: boolean;
    geometryUpdatedAt?: string | null;
    createdAt?: string;
    updatedAt?: string;
}

export interface AreaMapResponse {
    areas: ServiceAreaMapItem[];
    dateRange?: { startDate: string | null; endDate: string | null };
    total?: number;
}

export interface RouteEstimateResponse {
    distanceKm: number;
    durationMinutes: number | null;
    geometry: { type: 'LineString'; coordinates: number[][] };
    method: 'road_route' | 'straight_line_fallback';
    provider: 'openrouteservice' | 'osrm' | 'local';
}

export interface ServiceAreaWritePayload {
    city?: string;
    areaName: string;
    subareaName?: string | null;
    blockOrSector?: string | null;
    centroidLatitude?: number | null;
    centroidLongitude?: number | null;
    boundaryGeoJson?: AreaBoundaryFeature | null;
    isActive?: boolean;
}

export interface ServiceCenterLocationRecord {
    address: string;
    latitude: number | null;
    longitude: number | null;
    googlePlaceId: string;
}

export interface AreaHealthDiagnostics {
    activeAreaCount: number;
    areasMissingGeometry: number;
    retailRequestsWithoutArea: number;
    retailJobsWithoutArea: number;
    retailPosWithoutArea: number;
    warrantyClaimsWithoutArea: number;
    legacyPosPendingAttribution: number;
    missingServiceCenterPin: boolean;
}

export interface MapPlaceSuggestion {
    id: string;
    label: string;
    latitude: number;
    longitude: number;
    type: string;
}

/** One row from the shop's local Dhaka table. */
export interface DhakaPlaceSuggestion {
    id: string;
    /** What to show: the local name, plus its neighbourhood when it is a road. */
    label: string;
    /** The other-language name, shown underneath only when it differs. */
    secondary: string | null;
    kind: 'area' | 'road';
    latitude: number;
    longitude: number;
}

/**
 * A collection fare, or the admission that none has been set.
 *
 * `configured: false` is a real answer and must render as nothing at all —
 * showing ৳0 would tell the customer collection is free.
 */
export type PickupQuoteResponse =
    | { configured: false }
    | {
          configured: true;
          /** What the customer pays. The only figure they are given. */
          amount: number;
          waived: boolean;
          waivedOver: number | null;
      };

/**
 * A service area worked out from an address.
 *
 * `confidence` matters to the UI: 'boundary' and 'circle' are decisions, so the
 * area is stated. 'nearest' is a guess and must be shown as one.
 */
export interface ResolvedServiceArea {
    id: string;
    label: string;
    confidence: 'boundary' | 'circle' | 'nearest';
}

export interface MapBoundaryCandidate {
    id: string;
    label: string;
    latitude: number;
    longitude: number;
    sourceType: 'relation' | 'way';
    sourceId: string;
    geometryType: 'Polygon' | 'MultiPolygon';
    osmType?: 'relation' | 'way';
    osmId?: string;
    category?: string | null;
    type?: string | null;
    addressType?: string | null;
    placeRank?: number | null;
    importance?: number | null;
    displayName?: string;
    boundingBox: {
        west: number;
        south: number;
        east: number;
        north: number;
    };
    vertexCount: number;
    areaSquareKm: number;
    confidence: 'high' | 'review' | 'reject';
    qualityFlags: string[];
    boundaryGeoJson: AreaBoundaryFeature;
}

function buildDateQuery(filters?: { startDate?: string; endDate?: string; areaId?: string }) {
    const params = new URLSearchParams();
    if (filters?.startDate) params.set('startDate', filters.startDate);
    if (filters?.endDate) params.set('endDate', filters.endDate);
    if (filters?.areaId) params.set('areaId', filters.areaId);
    const query = params.toString();
    return query ? `?${query}` : '';
}

/** Publication-sensitive GETs must never reuse browser/HTTP cache after unpublish. */
const publicAreaFetchInit = {
    headers: {
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
    },
    cache: 'no-store' as RequestCache,
};

export const publicAreaMapApi = {
    getMap: () => fetchApi<AreaMapResponse>('/public/area-map', publicAreaFetchInit),
    getList: () =>
        fetchApi<Array<Pick<ServiceAreaMapItem, 'id' | 'city' | 'areaName' | 'subareaName' | 'blockOrSector'>>>(
            '/public/area-list',
            publicAreaFetchInit,
        ),
    getSummary: (id: string) =>
        fetchApi<ServiceAreaMapItem>(
            `/public/area-summary/${encodeURIComponent(id)}`,
            publicAreaFetchInit,
        ),
    estimateRoute: (
        location: { latitude: number; longitude: number },
        options?: { signal?: AbortSignal },
    ) =>
        fetchApi<RouteEstimateResponse>('/public/route-estimate', {
            method: 'POST',
            body: JSON.stringify(location),
            // Customer coords are ephemeral request body only — never HTTP-cache route payloads.
            headers: {
                'Cache-Control': 'no-store',
                Pragma: 'no-cache',
            },
            cache: 'no-store' as RequestCache,
            signal: options?.signal,
        }),
    searchPlaces: (query: string) =>
        fetchApi<{ results: MapPlaceSuggestion[] }>(
            `/public/map-place-search?q=${encodeURIComponent(query)}`,
            publicAreaFetchInit,
        ),
    /**
     * Dhaka areas and roads from the shop's own copy of OpenStreetMap.
     *
     * Separate from `searchPlaces`, which asks Photon and covers the world.
     * This one answers from a local table, so it is fast enough to run per
     * keystroke and understands Bangla spellings of Dhaka's neighbourhoods.
     */
    searchDhakaPlaces: (query: string) =>
        fetchApi<{ results: DhakaPlaceSuggestion[] }>(
            `/public/dhaka-place-search?q=${encodeURIComponent(query)}`,
            publicAreaFetchInit,
        ),
    /** Which service area an address falls in. `area: null` = outside all of them. */
    resolveServiceArea: (payload: { latitude: number; longitude: number }) =>
        fetchApi<{ area: ResolvedServiceArea | null }>('/public/resolve-service-area', {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: {
                'Cache-Control': 'no-store',
                Pragma: 'no-cache',
            },
            cache: 'no-store' as RequestCache,
        }),
    /** What collection costs for one address. POST: coords stay out of the URL. */
    quotePickup: (payload: {
        tier: string;
        latitude?: number | null;
        longitude?: number | null;
        repairEstimate?: number | null;
    }) =>
        fetchApi<PickupQuoteResponse>('/public/pickup-quote', {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: {
                'Cache-Control': 'no-store',
                Pragma: 'no-cache',
            },
            cache: 'no-store' as RequestCache,
        }),
};

export const adminAreaMapApi = {
    getMap: (filters?: { startDate?: string; endDate?: string; areaId?: string }) =>
        fetchApi<AreaMapResponse>(`/admin/area-map-data${buildDateQuery(filters)}`),
    getAreas: () => fetchApi<ServiceAreaRecord[]>('/admin/service-areas'),
    createArea: (payload: ServiceAreaWritePayload) =>
        fetchApi<ServiceAreaRecord>('/admin/service-areas', {
            method: 'POST',
            body: JSON.stringify(payload),
        }),
    updateArea: (id: string, payload: Partial<ServiceAreaWritePayload>) =>
        fetchApi<ServiceAreaRecord>(`/admin/service-areas/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        }),
    deactivateArea: (id: string) =>
        fetchApi<ServiceAreaRecord>(`/admin/service-areas/${encodeURIComponent(id)}/deactivate`, {
            method: 'POST',
        }),
    publishArea: (id: string) =>
        fetchApi<ServiceAreaRecord>(`/admin/service-areas/${encodeURIComponent(id)}/publish`, {
            method: 'POST',
            body: JSON.stringify({ confirm: true }),
        }),
    unpublishArea: (id: string) =>
        fetchApi<ServiceAreaRecord>(`/admin/service-areas/${encodeURIComponent(id)}/unpublish`, {
            method: 'POST',
            body: JSON.stringify({ confirm: true }),
        }),
    getServiceCenter: () => fetchApi<ServiceCenterLocationRecord>('/admin/service-center-location'),
    getHealth: () => fetchApi<AreaHealthDiagnostics>('/admin/area-health'),
    updateServiceCenter: (payload: ServiceCenterLocationRecord) =>
        fetchApi<ServiceCenterLocationRecord>('/admin/service-center-location', {
            method: 'PATCH',
            body: JSON.stringify(payload),
        }),
    searchPlaces: (query: string) =>
        fetchApi<{ results: MapPlaceSuggestion[] }>(
            `/admin/map-place-search?q=${encodeURIComponent(query)}`,
        ),
    searchBoundaries: (query: string) =>
        fetchApi<{ candidates: MapBoundaryCandidate[] }>(
            `/admin/map-boundary-search?q=${encodeURIComponent(query)}`,
        ),
};
