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
    estimateRoute: (location: { latitude: number; longitude: number }) =>
        fetchApi<RouteEstimateResponse>('/public/route-estimate', {
            method: 'POST',
            body: JSON.stringify(location),
            // Customer coords are ephemeral request body only — never HTTP-cache route payloads.
            headers: {
                'Cache-Control': 'no-store',
                Pragma: 'no-cache',
            },
            cache: 'no-store' as RequestCache,
        }),
    searchPlaces: (query: string) =>
        fetchApi<{ results: MapPlaceSuggestion[] }>(
            `/public/map-place-search?q=${encodeURIComponent(query)}`,
            publicAreaFetchInit,
        ),
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
