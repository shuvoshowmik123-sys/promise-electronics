import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Feature, FeatureCollection, LineString, Point, Polygon, MultiPolygon } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ServiceAreaMapItem } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ringColor } from '@shared/pickup-pricing';

export type AreaMapMetric = 'requests' | 'jobs' | 'completed' | 'completion' | 'revenue' | 'collected' | 'warranty' | 'pickupFare';

interface Coordinates {
    latitude: number;
    longitude: number;
}

interface SearchLocation extends Coordinates {
    label: string;
}

/** Customer immersive camera commands — routed through the coordinator. */
export interface CustomerImmersiveCameraApi {
    focusServiceCenter: (options: {
        latitude: number;
        longitude: number;
        zoom?: number;
        pitch?: number;
        bearing?: number;
        duration: number;
    }) => void;
    resetView: (options: {
        center: [number, number];
        zoom: number;
        pitch?: number;
        bearing?: number;
        duration: number;
    }) => void;
    /** Re-frame a featured/selected area even when selectedAreaId is unchanged (selectedArea priority). */
    focusFeaturedArea: (options: {
        boundaryGeoJson?: ServiceAreaMapItem['boundaryGeoJson'] | null;
        centroidLatitude?: number | null;
        centroidLongitude?: number | null;
        duration: number;
        pitch?: number;
        bearing?: number;
    }) => void;
}

interface AreaMapCanvasProps {
    areas: ServiceAreaMapItem[];
    /**
     * Collection fare per area id, for the 'pickupFare' metric.
     *
     * Fares are not part of the map data — they live under Area Intelligence's
     * own settings — so they arrive alongside rather than on the area itself.
     * An area missing from this map is unrated, which is a state the map has
     * to show rather than treat as zero.
     */
    pickupFares?: Record<string, number>;
    selectedAreaId?: string | null;
    onSelectArea?: (area: ServiceAreaMapItem) => void;
    serviceCenter?: Coordinates | null;
    serviceCenterDraggable?: boolean;
    /**
     * Fare rings to draw around the service centre.
     *
     * Only supplied while the map is showing pickup fares — the rings are a
     * pricing tool, and drawing them over the demand or revenue views would put
     * three large circles on top of the thing being read.
     */
    pickupRings?: Array<{ radiusKm: number; fare: number | null }>;
    currencySymbol?: string;
    onServiceCenterMove?: (coordinates: Coordinates) => void;
    searchLocation?: SearchLocation | null;
    customerLocation?: Coordinates | null;
    customerFocusRequest?: number;
    routeGeometry?: LineString | null;
    /** road_route = solid dual-layer path; straight_line_fallback = dashed approximate line */
    routeMethod?: 'road_route' | 'straight_line_fallback' | null;
    metric?: AreaMapMetric;
    threeDimensional?: boolean;
    presentation?: 'default' | 'customerImmersive';
    interactive?: boolean;
    /**
     * When true, the map never takes one-finger pan/zoom — parent page owns vertical scroll.
     * Disables dragPan/touchZoom/scrollZoom and forces touch-action: pan-y on the canvas.
     * Use only for maps embedded in admin MobileScrollContent. Desktop / editor sheets leave false.
     */
    cooperativeGestures?: boolean;
    showNavigation?: boolean;
    className?: string;
    onMapReady?: (map: MapLibreMap) => void;
    onCustomerCameraReady?: (api: CustomerImmersiveCameraApi) => void;
    onMapClick?: (coordinates: Coordinates) => void;
    fallbackContent?: ReactNode;
    ariaLabel: string;
}

const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const AREA_SOURCE = 'promise-service-areas';
const AREA_FILL = 'promise-service-areas-fill';
const AREA_EXTRUSION = 'promise-service-areas-extrusion';
const AREA_OUTLINE = 'promise-service-areas-outline';
const AREA_SELECTED = 'promise-service-areas-selected';
const AREA_SELECTED_UNDERLAY = 'promise-service-areas-selected-underlay';
const AREA_SELECTED_GLOW = 'promise-service-areas-selected-glow';
const AREA_SELECTED_EXTRUSION = 'promise-service-areas-selected-extrusion';
const AREA_SELECTED_TOP = 'promise-service-areas-selected-top';
const AREA_LABEL_SOURCE = 'promise-service-area-labels';
const RING_SOURCE = 'promise-pickup-rings';
const RING_FILL = 'promise-pickup-rings-fill';
const RING_LINE = 'promise-pickup-rings-line';
const RING_LABEL = 'promise-pickup-rings-label';

/**
 * The fare rings, as circles on the ground.
 *
 * Drawn as many-sided polygons rather than with a circle layer because a
 * `circle` in MapLibre is sized in screen pixels — it would keep its size as
 * you zoom, which is exactly wrong for something that means "five kilometres".
 * These are real distances on the map and grow and shrink with it.
 *
 * The latitude correction matters at Dhaka: a degree of longitude is about 92%
 * of a degree of latitude here, so without it the rings would draw as visible
 * ellipses and a fare boundary would sit in the wrong place east–west.
 */
function buildRingFeatures(
    centre: Coordinates | null | undefined,
    rings: Array<{ radiusKm: number; fare: number | null }>,
    currency: string,
): GeoJSON.FeatureCollection {
    if (!centre || rings.length === 0) return { type: 'FeatureCollection', features: [] };
    const STEPS = 96;
    const kmPerDegLat = 110.574;
    const kmPerDegLon = 111.320 * Math.cos((centre.latitude * Math.PI) / 180);

    // Nearest first, so the colour ramp follows distance rather than the order
    // somebody happened to type the rings in.
    const ordered = [...rings].sort((a, b) => a.radiusKm - b.radiusKm);

    const features = ordered
        // Colour is taken before anything is dropped, so a band keeps its own
        // place in the ramp. Filtering first would slide the next ring up into
        // the missing colour and repaint the map every time a fare was typed.
        .map((ring, index) => ({ ring, color: ringColor(index) }))
        /**
         * A band with no fare is not drawn.
         *
         * An unpriced ring prices nothing — an address inside it falls through
         * to the next priced band outward. Drawing it would claim a coverage and
         * a price that do not exist yet, and the circle is the one thing on this
         * screen that is supposed to mean "this is what we charge here". The row
         * stays in the panel, which is where the fare gets typed in.
         */
        .filter(({ ring }) => ring.fare !== null)
        .map(({ ring, color }) => {
            const ringCoords: [number, number][] = [];
            for (let i = 0; i <= STEPS; i += 1) {
                const angle = (i / STEPS) * 2 * Math.PI;
                ringCoords.push([
                    centre.longitude + (ring.radiusKm / kmPerDegLon) * Math.cos(angle),
                    centre.latitude + (ring.radiusKm / kmPerDegLat) * Math.sin(angle),
                ]);
            }
            return {
                type: 'Feature' as const,
                properties: {
                    label: `${ring.radiusKm} km · ${currency}${ring.fare}`,
                    radiusKm: ring.radiusKm,
                    color,
                },
                geometry: { type: 'Polygon' as const, coordinates: [ringCoords] },
            };
        });

    /**
     * Drawn widest first.
     *
     * The circles are nested discs, not annuli, so paint order is what makes
     * them read as separate bands: the largest goes down first and each smaller
     * one covers its middle, leaving only its own band showing. Reversed, a
     * single big disc would bury every ring inside it.
     */
    return { type: 'FeatureCollection', features: features.reverse() };
}
const AREA_LABELS = 'promise-service-area-labels';
const ROUTE_SOURCE = 'promise-route';
const ROUTE_CASING = 'promise-route-casing';
const ROUTE_LINE = 'promise-route-line';
const ROUTE_FALLBACK_CASING = 'promise-route-fallback-casing';
const ROUTE_FALLBACK_LINE = 'promise-route-fallback-line';

type CameraIntentKind = 'routeFit' | 'customerFocus' | 'selectedArea' | 'searchResult' | 'initial';

const CAMERA_PRIORITY: Record<CameraIntentKind, number> = {
    routeFit: 5,
    customerFocus: 4,
    selectedArea: 3,
    searchResult: 2,
    initial: 1,
};

type CameraIntent =
    | {
          method: 'fitBounds';
          kind: CameraIntentKind;
          bounds: [[number, number], [number, number]];
          padding: number | { top: number; right: number; bottom: number; left: number };
          maxZoom: number;
          duration: number;
          pitch?: number;
          bearing?: number;
      }
    | {
          method: 'flyTo';
          kind: CameraIntentKind;
          center: [number, number];
          zoom: number;
          duration: number;
          pitch?: number;
          bearing?: number;
      }
    | {
          method: 'easeTo';
          kind: CameraIntentKind;
          center?: [number, number];
          zoom?: number;
          pitch?: number;
          bearing?: number;
          duration: number;
      };

function metricValue(area: ServiceAreaMapItem, metric: AreaMapMetric, pickupFares?: Record<string, number>) {
    if (metric === 'pickupFare') return pickupFares?.[area.id] ?? 0;
    if (metric === 'completed') return area.completedJobCount ?? 0;
    if (metric === 'jobs') return area.jobCount ?? 0;
    if (metric === 'revenue') return area.billedTotal ?? 0;
    if (metric === 'collected') return area.collectedTotal ?? 0;
    if (metric === 'warranty') return area.warrantyClaimCount ?? 0;
    if (metric === 'completion') {
        const total = area.serviceRequestCount ?? 0;
        return total > 0 ? ((area.completedJobCount ?? 0) / total) * 100 : 0;
    }
    return area.serviceRequestCount ?? 0;
}

function demandColor(demand: ServiceAreaMapItem['demandLevel']) {
    if (demand === 'high demand') return '#047857';
    if (demand === 'popular') return '#10b981';
    if (demand === 'growing') return '#38bdf8';
    return '#94a3b8';
}

function areaFeatures(
    areas: ServiceAreaMapItem[],
    metric: AreaMapMetric,
    pickupFares?: Record<string, number>,
): FeatureCollection<Polygon | MultiPolygon> {
    const maximum = Math.max(1, ...areas.map((area) => metricValue(area, metric, pickupFares)));
    return {
        type: 'FeatureCollection',
        features: areas.flatMap((area) => {
            if (!area.boundaryGeoJson?.geometry) return [];
            const value = metricValue(area, metric, pickupFares);
            const normalized = Math.sqrt(value / maximum);
            /**
             * On the fare map an unrated area is pink, not pale.
             *
             * A quiet area and an unpriced one look identical on a normal
             * choropleth — both near-zero — and the unpriced one is the
             * expensive mistake: every collection there is quoted at the
             * fallback until somebody notices. Pink is not on the demand scale,
             * so it cannot be mistaken for "a bit of work here".
             */
            const unrated = metric === 'pickupFare' && pickupFares?.[area.id] === undefined;
            return [{
                type: 'Feature',
                id: area.id,
                properties: {
                    id: area.id,
                    color: unrated ? '#ec4899' : demandColor(area.demandLevel),
                    height: 120 + normalized * 2200,
                },
                geometry: area.boundaryGeoJson.geometry as Polygon | MultiPolygon,
            } satisfies Feature<Polygon | MultiPolygon>];
        }),
    };
}

function labelFeatures(areas: ServiceAreaMapItem[]): FeatureCollection<Point> {
    return {
        type: 'FeatureCollection',
        features: areas.flatMap((area) => {
            if (area.centroidLatitude == null || area.centroidLongitude == null) return [];
            return [{
                type: 'Feature',
                properties: {
                    id: area.id,
                    label: area.blockOrSector || area.subareaName || area.areaName,
                },
                geometry: {
                    type: 'Point',
                    coordinates: [area.centroidLongitude, area.centroidLatitude],
                },
            } satisfies Feature<Point>];
        }),
    };
}

function collectGeometryPositions(coordinates: unknown): number[][] {
    const positions: number[][] = [];
    const collect = (value: unknown) => {
        if (!Array.isArray(value)) return;
        if (typeof value[0] === 'number' && typeof value[1] === 'number') {
            positions.push(value as number[]);
            return;
        }
        value.forEach(collect);
    };
    collect(coordinates);
    return positions;
}

function boundsFromPositions(positions: number[][]): [[number, number], [number, number]] | null {
    if (positions.length === 0) return null;
    return [
        [Math.min(...positions.map((position) => position[0])), Math.min(...positions.map((position) => position[1]))],
        [Math.max(...positions.map((position) => position[0])), Math.max(...positions.map((position) => position[1]))],
    ];
}

export function AreaMapCanvas({
    areas,
    selectedAreaId,
    onSelectArea,
    serviceCenter,
    serviceCenterDraggable = false,
    pickupRings,
    currencySymbol = '৳',
    onServiceCenterMove,
    searchLocation,
    customerLocation,
    customerFocusRequest = 0,
    routeGeometry,
    routeMethod = null,
    metric = 'requests',
    pickupFares,
    threeDimensional = false,
    presentation = 'default',
    interactive = true,
    cooperativeGestures = false,
    showNavigation = true,
    className,
    onMapReady,
    onCustomerCameraReady,
    onMapClick,
    fallbackContent,
    ariaLabel,
}: AreaMapCanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<MapLibreMap | null>(null);
    const centerMarkerRef = useRef<MapLibreMarker | null>(null);
    const customerMarkerRef = useRef<MapLibreMarker | null>(null);
    const searchMarkerRef = useRef<MapLibreMarker | null>(null);
    const onSelectRef = useRef(onSelectArea);
    const onMapClickRef = useRef(onMapClick);
    const onMapReadyRef = useRef(onMapReady);
    const onCustomerCameraReadyRef = useRef(onCustomerCameraReady);
    const onServiceCenterMoveRef = useRef(onServiceCenterMove);
    const areasRef = useRef(areas);
    const [mapFailed, setMapFailed] = useState(false);
    /** Bumped when MapLibre finishes load so marker effects re-run if props arrived early. */
    const [mapEpoch, setMapEpoch] = useState(0);
    const features = useMemo(() => areaFeatures(areas, metric, pickupFares), [areas, metric, pickupFares]);
    const labels = useMemo(() => labelFeatures(areas), [areas]);
    const ringFeatures = useMemo(
        () => buildRingFeatures(serviceCenter, pickupRings ?? [], currencySymbol),
        [serviceCenter, pickupRings, currencySymbol],
    );
    const featuresRef = useRef(features);
    const labelsRef = useRef(labels);
    const ringFeaturesRef = useRef(ringFeatures);
    const selectedAreaIdRef = useRef(selectedAreaId);
    const routeGeometryRef = useRef(routeGeometry);
    const routeMethodRef = useRef(routeMethod);
    const threeDimensionalRef = useRef(threeDimensional);
    const presentationRef = useRef(presentation);

    const pendingIntentRef = useRef<CameraIntent | null>(null);
    const activeIntentKindRef = useRef<CameraIntentKind | null>(null);
    const cameraSequenceRef = useRef(0);
    const cameraRafRef = useRef(0);

    function isBlockedByHigherPriority(kind: CameraIntentKind) {
        const active = activeIntentKindRef.current;
        if (active && CAMERA_PRIORITY[active] > CAMERA_PRIORITY[kind]) return true;
        const pending = pendingIntentRef.current;
        if (pending && CAMERA_PRIORITY[pending.kind] > CAMERA_PRIORITY[kind]) return true;
        return false;
    }

    function clampCameraPadding(
        map: MapLibreMap,
        padding: number | { top: number; right: number; bottom: number; left: number },
    ) {
        const width = map.getContainer().clientWidth;
        const height = map.getContainer().clientHeight;
        const minContent = 48;
        if (typeof padding === 'number') {
            const maxPad = Math.max(0, Math.floor(Math.min(width, height) / 2 - minContent / 2));
            return Math.min(padding, maxPad);
        }
        const maxHorizontal = Math.max(0, Math.floor((width - minContent) / 2));
        const maxVertical = Math.max(0, Math.floor((height - minContent) / 2));
        return {
            top: Math.min(padding.top, maxVertical),
            bottom: Math.min(padding.bottom, maxVertical),
            left: Math.min(padding.left, maxHorizontal),
            right: Math.min(padding.right, maxHorizontal),
        };
    }

    function canRunCamera(map: MapLibreMap) {
        if (!map.isStyleLoaded()) return false;
        const container = map.getContainer();
        return container.clientWidth >= 2 && container.clientHeight >= 2;
    }

    function scheduleCamera(intent: CameraIntent) {
        if (presentationRef.current !== 'customerImmersive') return;
        // Active high-priority movement must not be interrupted by lower-priority intents.
        if (isBlockedByHigherPriority(intent.kind)) return;

        const pending = pendingIntentRef.current;
        if (pending && pending.kind === intent.kind && pending.method === 'easeTo' && intent.method === 'easeTo') {
            pendingIntentRef.current = {
                ...pending,
                ...intent,
                center: intent.center ?? pending.center,
                zoom: intent.zoom ?? pending.zoom,
                pitch: intent.pitch ?? pending.pitch,
                bearing: intent.bearing ?? pending.bearing,
            };
        } else {
            pendingIntentRef.current = intent;
        }
        cancelAnimationFrame(cameraRafRef.current);
        cameraRafRef.current = requestAnimationFrame(() => {
            const map = mapRef.current;
            if (!map) return;
            const current = pendingIntentRef.current;
            if (!current) return;
            if (presentationRef.current !== 'customerImmersive') {
                pendingIntentRef.current = null;
                return;
            }
            // Re-check at flush: do not stop/start if a higher-priority intent is mid-flight.
            if (activeIntentKindRef.current && CAMERA_PRIORITY[activeIntentKindRef.current] > CAMERA_PRIORITY[current.kind]) {
                pendingIntentRef.current = null;
                return;
            }
            if (!canRunCamera(map)) {
                // Keep pending and retry next frame once the container/style is ready.
                cameraRafRef.current = requestAnimationFrame(() => {
                    if (pendingIntentRef.current) scheduleCamera(pendingIntentRef.current);
                });
                return;
            }

            pendingIntentRef.current = null;
            // Bump sequence before stop so a stop-induced moveend cannot clear the new active intent.
            const sequence = ++cameraSequenceRef.current;
            activeIntentKindRef.current = current.kind;
            // Equal/higher priority may supersede; lower already returned above.
            if (map.isMoving()) map.stop();
            map.once('moveend', () => {
                if (cameraSequenceRef.current !== sequence) return;
                activeIntentKindRef.current = null;
            });

            try {
                switch (current.method) {
                    case 'fitBounds': {
                        const fitOptions: {
                            padding: number | { top: number; right: number; bottom: number; left: number };
                            maxZoom: number;
                            duration: number;
                            pitch?: number;
                            bearing?: number;
                        } = {
                            padding: clampCameraPadding(map, current.padding),
                            maxZoom: current.maxZoom,
                            duration: current.duration,
                        };
                        if (current.pitch != null) fitOptions.pitch = current.pitch;
                        if (current.bearing != null) fitOptions.bearing = current.bearing;
                        map.fitBounds(current.bounds, fitOptions);
                        break;
                    }
                    case 'flyTo': {
                        const flyOptions: {
                            center: [number, number];
                            zoom: number;
                            duration: number;
                            pitch?: number;
                            bearing?: number;
                        } = {
                            center: current.center,
                            zoom: current.zoom,
                            duration: current.duration,
                        };
                        if (current.pitch != null) flyOptions.pitch = current.pitch;
                        if (current.bearing != null) flyOptions.bearing = current.bearing;
                        map.flyTo(flyOptions);
                        break;
                    }
                    case 'easeTo': {
                        // Never pass center/zoom as undefined — MapLibre pitch eases can null-deref in _calcMatrices.
                        const easeOptions: {
                            duration: number;
                            center?: [number, number];
                            zoom?: number;
                            pitch?: number;
                            bearing?: number;
                        } = { duration: current.duration };
                        if (current.center) easeOptions.center = current.center;
                        if (current.zoom != null) easeOptions.zoom = current.zoom;
                        if (current.pitch != null) easeOptions.pitch = current.pitch;
                        if (current.bearing != null) easeOptions.bearing = current.bearing;
                        map.easeTo(easeOptions);
                        break;
                    }
                }
            } catch {
                if (cameraSequenceRef.current === sequence) activeIntentKindRef.current = null;
                return;
            }
            // Duration 0 / no-op moves may already be idle after the call; moveend still usually fires,
            // but if the map is not moving, clear active immediately so lower intents are not stuck.
            if (!map.isMoving() && cameraSequenceRef.current === sequence) {
                activeIntentKindRef.current = null;
            }
        });
    }

    function cameraFitBounds(
        kind: CameraIntentKind,
        bounds: [[number, number], [number, number]],
        options: { padding: number | { top: number; right: number; bottom: number; left: number }; maxZoom: number; duration: number; pitch?: number; bearing?: number },
    ) {
        if (presentationRef.current === 'customerImmersive') {
            scheduleCamera({ method: 'fitBounds', kind, bounds, ...options });
            return;
        }
        const map = mapRef.current;
        if (!map || !canRunCamera(map)) return;
        const fitOptions: typeof options = {
            ...options,
            padding: clampCameraPadding(map, options.padding),
        };
        map.fitBounds(bounds, fitOptions);
    }

    function cameraFlyTo(
        kind: CameraIntentKind,
        options: { center: [number, number]; zoom: number; duration: number; pitch?: number; bearing?: number },
    ) {
        if (presentationRef.current === 'customerImmersive') {
            scheduleCamera({ method: 'flyTo', kind, ...options });
            return;
        }
        const map = mapRef.current;
        if (!map || !canRunCamera(map)) return;
        const flyOptions: { center: [number, number]; zoom: number; duration: number; pitch?: number; bearing?: number } = {
            center: options.center,
            zoom: options.zoom,
            duration: options.duration,
        };
        if (options.pitch != null) flyOptions.pitch = options.pitch;
        if (options.bearing != null) flyOptions.bearing = options.bearing;
        map.flyTo(flyOptions);
    }

    function cameraEaseTo(
        kind: CameraIntentKind,
        options: { center?: [number, number]; zoom?: number; pitch?: number; bearing?: number; duration: number },
    ) {
        if (presentationRef.current === 'customerImmersive') {
            scheduleCamera({ method: 'easeTo', kind, ...options });
            return;
        }
        const map = mapRef.current;
        if (!map || !canRunCamera(map)) return;
        const easeOptions: { duration: number; center?: [number, number]; zoom?: number; pitch?: number; bearing?: number } = {
            duration: options.duration,
        };
        if (options.center) easeOptions.center = options.center;
        if (options.zoom != null) easeOptions.zoom = options.zoom;
        if (options.pitch != null) easeOptions.pitch = options.pitch;
        if (options.bearing != null) easeOptions.bearing = options.bearing;
        map.easeTo(easeOptions);
    }

    useEffect(() => { onSelectRef.current = onSelectArea; }, [onSelectArea]);
    useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
    useEffect(() => { onMapReadyRef.current = onMapReady; }, [onMapReady]);
    useEffect(() => { onCustomerCameraReadyRef.current = onCustomerCameraReady; }, [onCustomerCameraReady]);
    useEffect(() => { onServiceCenterMoveRef.current = onServiceCenterMove; }, [onServiceCenterMove]);
    useEffect(() => { areasRef.current = areas; }, [areas]);
    useEffect(() => { featuresRef.current = features; }, [features]);
    useEffect(() => { labelsRef.current = labels; }, [labels]);
    useEffect(() => { ringFeaturesRef.current = ringFeatures; }, [ringFeatures]);
    useEffect(() => { selectedAreaIdRef.current = selectedAreaId; }, [selectedAreaId]);
    useEffect(() => { routeGeometryRef.current = routeGeometry; }, [routeGeometry]);
    useEffect(() => { routeMethodRef.current = routeMethod; }, [routeMethod]);
    useEffect(() => { threeDimensionalRef.current = threeDimensional; }, [threeDimensional]);
    useEffect(() => { presentationRef.current = presentation; }, [presentation]);

    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;
        let cancelled = false;
        let ownedMap: MapLibreMap | null = null;
        let removeWheelListener: (() => void) | null = null;
        let mountRafId = 0;
        const mountMap = () => {
            const container = containerRef.current;
            if (cancelled || mapRef.current || !container) return;
            if (container.clientWidth < 2 || container.clientHeight < 2) {
                mountRafId = requestAnimationFrame(mountMap);
                return;
            }
            void import('maplibre-gl').then(({ default: maplibregl }) => {
                const currentContainer = containerRef.current;
                if (cancelled || mapRef.current || !currentContainer) return;
                if (currentContainer.clientWidth < 2 || currentContainer.clientHeight < 2) {
                    mountRafId = requestAnimationFrame(mountMap);
                    return;
                }
            // Interaction profiles — do not mix carelessly:
            // - customerImmersive (homepage): never steal page scroll; Ctrl/Cmd+wheel zooms on desktop only.
            // - cooperativeGestures / page-scroll embed: NO map pan or touch-zoom — parent MobileScrollContent owns one-finger vertical swipe.
            // - default (admin desktop / editor sheets): full map tools — scroll zoom, drag-pan, dbl-click, keyboard, pins.
            const immersive = presentation === 'customerImmersive';
            const immersiveDesktop = immersive && currentContainer.clientWidth >= 768;
            const adminInteractive = !immersive && interactive;
            const pageOwnsScroll = cooperativeGestures === true;
            const mapCanPan = interactive && !pageOwnsScroll;
            const map = new maplibregl.Map({
                container: currentContainer,
                style: MAP_STYLE_URL,
                center: [90.4125, 23.8103],
                zoom: 10.5,
                pitch: threeDimensional ? (immersive ? 42 : 46) : 0,
                bearing: threeDimensional ? (immersive ? -10 : -12) : 0,
                // Not relying on MapLibre cooperative banner — hard-disable pan so one-finger never moves the map.
                cooperativeGestures: false,
                scrollZoom: adminInteractive && mapCanPan,
                attributionControl: false,
                dragPan: mapCanPan,
                keyboard: interactive && mapCanPan,
                doubleClickZoom: interactive && mapCanPan,
                dragRotate: immersiveDesktop || pageOwnsScroll ? false : interactive,
                touchPitch: immersiveDesktop || pageOwnsScroll ? false : interactive,
                touchZoomRotate: mapCanPan,
            });
            ownedMap = map;
            // QA/debug: allow reading getCenter() without a global registry
            (currentContainer as unknown as { __promiseMap?: MapLibreMap }).__promiseMap = map;
            if (immersiveDesktop || pageOwnsScroll) map.touchZoomRotate.disableRotation();
            if (pageOwnsScroll) {
                map.dragPan.disable();
                map.scrollZoom.disable();
                map.boxZoom.disable();
                map.dragRotate.disable();
                map.keyboard.disable();
                map.doubleClickZoom.disable();
                map.touchPitch.disable();
                map.touchZoomRotate.disable();
                // MapLibre sets canvas touch-action:none and may re-enable pointer-events on the canvas.
                // Force the canvas out of the hit path so one-finger pan-y reaches the scroll parent.
                const unlockPageTouch = () => {
                    try {
                        const canvas = map.getCanvas();
                        const canvasContainer = map.getCanvasContainer();
                        canvas.style.pointerEvents = 'none';
                        canvas.style.touchAction = 'pan-y';
                        canvasContainer.style.pointerEvents = 'none';
                        canvasContainer.style.touchAction = 'pan-y';
                        currentContainer.style.pointerEvents = 'auto';
                        currentContainer.style.touchAction = 'pan-y';
                    } catch {
                        /* map may be removing */
                    }
                };
                unlockPageTouch();
                map.on('load', unlockPageTouch);
                map.once('idle', unlockPageTouch);
            }
            // Customer homepage only: Ctrl/Cmd + wheel zooms without trapping normal page scroll.
            if (immersiveDesktop) {
                const canvasContainer = map.getCanvasContainer();
                const handleWheel = (event: WheelEvent) => {
                    if (!event.ctrlKey && !event.metaKey) return;
                    event.preventDefault();
                    const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 0.08 : 0.0025;
                    const delta = Math.max(-1, Math.min(1, -event.deltaY * multiplier));
                    map.zoomTo(Math.max(2, Math.min(20, map.getZoom() + delta)), { duration: 0 });
                };
                canvasContainer.addEventListener('wheel', handleWheel, { passive: false });
                removeWheelListener = () => canvasContainer.removeEventListener('wheel', handleWheel);
            }
            // Admin maps get MapLibre +/- / compass controls (pins + zoom UI). Customer hides these.
            if (showNavigation || adminInteractive) {
                map.addControl(new maplibregl.NavigationControl({
                    showCompass: adminInteractive,
                    visualizePitch: adminInteractive,
                    showZoom: true,
                }), 'top-right');
            }
            // Preview: one compact legal credit only (no MapLibre control + style dual lines, no OpenFreeMap brand).
            // Explore/desktop: standard compact AttributionControl (style credits).
            if (pageOwnsScroll) {
                currentContainer.classList.add('promise-map-preview-compact-attrib');
                const credit = document.createElement('div');
                credit.className = 'promise-map-preview-legal-credit';
                credit.setAttribute('data-map-legal-credit', 'true');
                credit.innerHTML =
                    '© <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a>' +
                    ' · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';
                currentContainer.appendChild(credit);
            } else {
                map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
            }
            map.on('error', () => {
                if (!map.isStyleLoaded()) setMapFailed(true);
            });
                map.once('load', () => {
                if (cancelled) return;
                const initialThreeDimensional = threeDimensionalRef.current;
                const immersive = presentationRef.current === 'customerImmersive';
                map.addSource(AREA_SOURCE, { type: 'geojson', data: featuresRef.current });
                map.addLayer({
                    id: AREA_FILL,
                    type: 'fill',
                    source: AREA_SOURCE,
                        layout: { visibility: immersive || !initialThreeDimensional ? 'visible' : 'none' },
                        paint: {
                            'fill-color': ['get', 'color'],
                            'fill-opacity': immersive ? 0.035 : 0.5,
                    },
                });
                map.addLayer({
                    id: AREA_EXTRUSION,
                    type: 'fill-extrusion',
                    source: AREA_SOURCE,
                    layout: { visibility: !immersive && initialThreeDimensional ? 'visible' : 'none' },
                    paint: {
                        'fill-extrusion-color': ['get', 'color'],
                        'fill-extrusion-height': ['get', 'height'],
                        'fill-extrusion-base': 0,
                        'fill-extrusion-opacity': 0.72,
                    },
                });
                map.addLayer({
                    id: AREA_OUTLINE,
                    type: 'line',
                    source: AREA_SOURCE,
                    paint: immersive
                        ? { 'line-color': '#0f766e', 'line-width': 1, 'line-opacity': 0.14 }
                        : { 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': 0.9 },
                });
                map.addLayer({
                    id: AREA_SELECTED_UNDERLAY,
                    type: 'fill',
                    source: AREA_SOURCE,
                    filter: ['==', ['get', 'id'], selectedAreaIdRef.current ?? ''],
                    layout: { visibility: immersive ? 'visible' : 'none' },
                    paint: { 'fill-color': '#10b981', 'fill-opacity': 0.1 },
                });
                map.addLayer({
                    id: AREA_SELECTED_GLOW,
                    type: 'line',
                    source: AREA_SOURCE,
                    filter: ['==', ['get', 'id'], selectedAreaIdRef.current ?? ''],
                    layout: { visibility: immersive ? 'visible' : 'none' },
                    paint: { 'line-color': '#10b981', 'line-width': 5, 'line-blur': 4, 'line-opacity': 0.18 },
                });
                map.addLayer({
                    id: AREA_SELECTED_EXTRUSION,
                    type: 'fill-extrusion',
                    source: AREA_SOURCE,
                    filter: ['==', ['get', 'id'], selectedAreaIdRef.current ?? ''],
                    layout: { visibility: immersive && initialThreeDimensional ? 'visible' : 'none' },
                    paint: {
                        'fill-extrusion-color': '#059669',
                        'fill-extrusion-height': 18,
                        'fill-extrusion-base': 0,
                        'fill-extrusion-opacity': 0.24,
                        'fill-extrusion-vertical-gradient': true,
                    },
                });
                map.addLayer({
                    id: AREA_SELECTED,
                    type: 'line',
                    source: AREA_SOURCE,
                    filter: ['==', ['get', 'id'], selectedAreaIdRef.current ?? ''],
                    paint: immersive
                        ? { 'line-color': '#047857', 'line-width': 2, 'line-opacity': 0.78 }
                        : { 'line-color': '#0f172a', 'line-width': 4, 'line-opacity': 0.9 },
                });
                map.addLayer({
                    id: AREA_SELECTED_TOP,
                    type: 'line',
                    source: AREA_SOURCE,
                    filter: ['==', ['get', 'id'], selectedAreaIdRef.current ?? ''],
                    layout: { visibility: immersive ? 'visible' : 'none' },
                    paint: { 'line-color': '#d1fae5', 'line-width': 1.5, 'line-opacity': 0.96 },
                });
                map.addSource(AREA_LABEL_SOURCE, { type: 'geojson', data: labelsRef.current });
                map.addLayer({
                    id: AREA_LABELS,
                    type: 'symbol',
                    source: AREA_LABEL_SOURCE,
                    layout: {
                        'text-field': ['get', 'label'],
                        'text-size': 11,
                        'text-font': ['Noto Sans Regular'],
                        'text-allow-overlap': false,
                    },
                    paint: { 'text-color': '#0f172a', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
                });
                // Rings sit above the area fills but below labels and the pin,
                // so they read as an overlay rather than hiding what is under them.
                map.addSource(RING_SOURCE, { type: 'geojson', data: ringFeaturesRef.current });
                // Faint fill: enough to tell one band from the next, light enough
                // that the streets and area names underneath stay readable.
                map.addLayer({
                    id: RING_FILL,
                    type: 'fill',
                    source: RING_SOURCE,
                    paint: {
                        'fill-color': ['get', 'color'],
                        'fill-opacity': 0.1,
                    },
                });
                map.addLayer({
                    id: RING_LINE,
                    type: 'line',
                    source: RING_SOURCE,
                    paint: {
                        'line-color': ['get', 'color'],
                        'line-width': 2.5,
                        'line-opacity': 0.9,
                        'line-dasharray': [2, 1.5],
                    },
                });
                map.addLayer({
                    id: RING_LABEL,
                    type: 'symbol',
                    source: RING_SOURCE,
                    layout: {
                        'text-field': ['get', 'label'],
                        'text-size': 12,
                        'text-font': ['Noto Sans Regular'],
                        // On the line itself, so the fare sits on the boundary it
                        // describes rather than floating in the middle of a band.
                        'symbol-placement': 'line',
                        'text-allow-overlap': false,
                    },
                    paint: { 'text-color': ['get', 'color'] as any, 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
                });
                map.addSource(ROUTE_SOURCE, {
                    type: 'geojson',
                    data: routeGeometryRef.current
                        ? {
                            type: 'Feature',
                            properties: { method: routeMethodRef.current ?? 'road_route' },
                            geometry: routeGeometryRef.current,
                        }
                        : { type: 'FeatureCollection', features: [] },
                });
                // Road route: solid dual-layer (no dasharray — [1,0] can render invisible in MapLibre).
                map.addLayer({
                    id: ROUTE_CASING,
                    type: 'line',
                    source: ROUTE_SOURCE,
                    filter: ['==', ['get', 'method'], 'road_route'],
                    layout: { 'line-cap': 'round', 'line-join': 'round' },
                    paint: {
                        'line-color': '#0f172a',
                        'line-width': 10,
                        'line-opacity': 0.62,
                    },
                });
                map.addLayer({
                    id: ROUTE_LINE,
                    type: 'line',
                    source: ROUTE_SOURCE,
                    filter: ['==', ['get', 'method'], 'road_route'],
                    layout: { 'line-cap': 'round', 'line-join': 'round' },
                    paint: {
                        'line-color': '#2563eb',
                        'line-width': 5.5,
                        'line-opacity': 0.98,
                    },
                });
                // Fallback: dashed approximate line — never styled like a road route.
                map.addLayer({
                    id: ROUTE_FALLBACK_CASING,
                    type: 'line',
                    source: ROUTE_SOURCE,
                    filter: ['==', ['get', 'method'], 'straight_line_fallback'],
                    layout: { 'line-cap': 'round', 'line-join': 'round' },
                    paint: {
                        'line-color': '#475569',
                        'line-width': 7,
                        'line-opacity': 0.45,
                        'line-dasharray': [2, 2],
                    },
                });
                map.addLayer({
                    id: ROUTE_FALLBACK_LINE,
                    type: 'line',
                    source: ROUTE_SOURCE,
                    filter: ['==', ['get', 'method'], 'straight_line_fallback'],
                    layout: { 'line-cap': 'round', 'line-join': 'round' },
                    paint: {
                        'line-color': '#94a3b8',
                        'line-width': 3.5,
                        'line-opacity': 0.95,
                        'line-dasharray': [2, 2],
                    },
                });

                if (interactive) {
                    const selectArea = (event: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
                        const id = event.features?.[0]?.properties?.id;
                        const area = areasRef.current.find((item) => item.id === id);
                        if (area) onSelectRef.current?.(area);
                    };
                    map.on('click', AREA_FILL, selectArea);
                    map.on('click', AREA_EXTRUSION, selectArea);
                    map.on('mouseenter', AREA_FILL, () => { map.getCanvas().style.cursor = 'pointer'; });
                    map.on('mouseleave', AREA_FILL, () => { map.getCanvas().style.cursor = ''; });
                    map.on('click', (event) => {
                        const areaHit = map.queryRenderedFeatures(event.point, { layers: [AREA_FILL, AREA_EXTRUSION] }).length > 0;
                        if (!areaHit) onMapClickRef.current?.({ latitude: event.lngLat.lat, longitude: event.lngLat.lng });
                    });
                }
                    if (immersive) {
                        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                        cameraEaseTo('initial', { zoom: 10.9, duration: reducedMotion ? 0 : 650 });
                        onCustomerCameraReadyRef.current?.({
                            focusServiceCenter: (options) => {
                                cameraEaseTo('initial', {
                                    center: [options.longitude, options.latitude],
                                    zoom: options.zoom ?? 13,
                                    pitch: options.pitch,
                                    bearing: options.bearing,
                                    duration: options.duration,
                                });
                            },
                            resetView: (options) => {
                                cameraEaseTo('initial', {
                                    center: options.center,
                                    zoom: options.zoom,
                                    pitch: options.pitch,
                                    bearing: options.bearing,
                                    duration: options.duration,
                                });
                            },
                            focusFeaturedArea: (options) => {
                                const geometry = options.boundaryGeoJson?.geometry;
                                if (geometry) {
                                    const bounds = boundsFromPositions(collectGeometryPositions(geometry.coordinates));
                                    if (bounds) {
                                        const mobile = map.getContainer().clientWidth < 768;
                                        cameraFitBounds('selectedArea', bounds, {
                                            padding: mobile ? 72 : { top: 96, right: 420, bottom: 96, left: 420 },
                                            maxZoom: 14,
                                            duration: options.duration,
                                            pitch: options.pitch,
                                            bearing: options.bearing,
                                        });
                                        return;
                                    }
                                }
                                if (options.centroidLatitude != null && options.centroidLongitude != null) {
                                    cameraFlyTo('selectedArea', {
                                        center: [options.centroidLongitude, options.centroidLatitude],
                                        zoom: 14,
                                        duration: options.duration,
                                        pitch: options.pitch,
                                        bearing: options.bearing,
                                    });
                                }
                            },
                        });
                    }
                    setMapEpoch((value) => value + 1);
                    onMapReadyRef.current?.(map);
            });
            mapRef.current = map;

            let resizeRafId = 0;
            let resizeTimeoutId = 0;
            let resizePending = false;
            let disposed = false;
            const flushResize = () => {
                resizeTimeoutId = 0;
                if (disposed || mapRef.current !== map || !map.isStyleLoaded()) return;
                const container = containerRef.current;
                if (!container || container.clientWidth < 2 || container.clientHeight < 2) return;
                if (map.isMoving()) {
                    resizeTimeoutId = window.setTimeout(flushResize, 120);
                    return;
                }
                resizePending = false;
                map.resize();
            };
            const requestResize = () => {
                resizePending = true;
                cancelAnimationFrame(resizeRafId);
                window.clearTimeout(resizeTimeoutId);
                resizeRafId = requestAnimationFrame(() => {
                    resizeTimeoutId = window.setTimeout(flushResize, 80);
                });
            };
            const handleResize = () => requestResize();
            const handleMoveEnd = () => {
                if (resizePending) requestResize();
            };
            map.on('moveend', handleMoveEnd);
            const observer = new ResizeObserver(handleResize);
            observer.observe(currentContainer);
            map.once('remove', () => {
                disposed = true;
                observer.disconnect();
                map.off('moveend', handleMoveEnd);
                cancelAnimationFrame(resizeRafId);
                window.clearTimeout(resizeTimeoutId);
            });
            }).catch(() => setMapFailed(true));
        };
        mountMap();

        return () => {
            cancelled = true;
            cancelAnimationFrame(mountRafId);
            cancelAnimationFrame(cameraRafRef.current);
            removeWheelListener?.();
            centerMarkerRef.current?.remove();
            customerMarkerRef.current?.remove();
            searchMarkerRef.current?.remove();
            ownedMap?.stop();
            ownedMap?.remove();
            if (containerRef.current) {
                delete (containerRef.current as unknown as { __promiseMap?: MapLibreMap }).__promiseMap;
            }
            if (mapRef.current === ownedMap) mapRef.current = null;
        };
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        if (!map?.isStyleLoaded()) return;
        (map.getSource(AREA_SOURCE) as GeoJSONSource | undefined)?.setData(features);
        (map.getSource(AREA_LABEL_SOURCE) as GeoJSONSource | undefined)?.setData(labels);
        (map.getSource(RING_SOURCE) as GeoJSONSource | undefined)?.setData(ringFeatures);
        // ringFeatures belongs in here: the fares arrive from their own query,
        // so they routinely change when the areas have not. Without it the rings
        // only redrew when something else happened to move, which made them look
        // intermittent — present after switching metric, gone on a fresh load.
    }, [features, labels, ringFeatures]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map?.isStyleLoaded()) return;
        const immersive = presentation === 'customerImmersive';
        map.setLayoutProperty(AREA_FILL, 'visibility', immersive || !threeDimensional ? 'visible' : 'none');
        map.setPaintProperty(AREA_FILL, 'fill-opacity', immersive ? 0.22 : 0.5);
        map.setLayoutProperty(AREA_EXTRUSION, 'visibility', !immersive && threeDimensional ? 'visible' : 'none');
        map.setLayoutProperty(AREA_SELECTED_UNDERLAY, 'visibility', immersive ? 'visible' : 'none');
        map.setLayoutProperty(AREA_SELECTED_GLOW, 'visibility', immersive ? 'visible' : 'none');
        map.setLayoutProperty(AREA_SELECTED_EXTRUSION, 'visibility', immersive && threeDimensional ? 'visible' : 'none');
        map.setLayoutProperty(AREA_SELECTED_TOP, 'visibility', immersive ? 'visible' : 'none');
        map.setPaintProperty(AREA_OUTLINE, 'line-color', immersive ? '#0f766e' : '#ffffff');
        map.setPaintProperty(AREA_OUTLINE, 'line-width', immersive ? 1 : 1.5);
        map.setPaintProperty(AREA_OUTLINE, 'line-opacity', immersive ? 0.34 : 0.9);
        map.setPaintProperty(AREA_SELECTED, 'line-color', immersive ? '#064e3b' : '#0f172a');
        map.setPaintProperty(AREA_SELECTED, 'line-width', immersive ? 3 : 4);
        const reducedMotion = immersive && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        cameraEaseTo('initial', {
            pitch: threeDimensional ? (immersive ? 42 : 46) : 0,
            bearing: threeDimensional ? (immersive ? -10 : -12) : 0,
            duration: reducedMotion ? 0 : 600,
        });
    }, [presentation, threeDimensional]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map?.isStyleLoaded()) return;
        map.setFilter(AREA_SELECTED, ['==', ['get', 'id'], selectedAreaId ?? '']);
        map.setFilter(AREA_SELECTED_UNDERLAY, ['==', ['get', 'id'], selectedAreaId ?? '']);
        map.setFilter(AREA_SELECTED_GLOW, ['==', ['get', 'id'], selectedAreaId ?? '']);
        map.setFilter(AREA_SELECTED_EXTRUSION, ['==', ['get', 'id'], selectedAreaId ?? '']);
        map.setFilter(AREA_SELECTED_TOP, ['==', ['get', 'id'], selectedAreaId ?? '']);
        const area = areas.find((item) => item.id === selectedAreaId);
        if (!area) return;
        if (area.boundaryGeoJson?.geometry) {
            const bounds = boundsFromPositions(collectGeometryPositions(area.boundaryGeoJson.geometry.coordinates));
            if (bounds) {
                const mobile = map.getContainer().clientWidth < 768;
                const reducedMotion = presentation === 'customerImmersive' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                cameraFitBounds('selectedArea', bounds, {
                    padding: mobile ? 72 : { top: 96, right: 420, bottom: 96, left: 420 },
                    maxZoom: 14,
                    duration: reducedMotion ? 0 : 650,
                    pitch: presentation === 'customerImmersive' && threeDimensional ? 42 : 0,
                    bearing: presentation === 'customerImmersive' && threeDimensional ? -10 : 0,
                });
                return;
            }
        }
        if (area.centroidLatitude != null && area.centroidLongitude != null) {
            const reducedMotion = presentation === 'customerImmersive' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            cameraFlyTo('selectedArea', { center: [area.centroidLongitude, area.centroidLatitude], zoom: 14, duration: reducedMotion ? 0 : 650 });
        }
    }, [areas, presentation, selectedAreaId, threeDimensional]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map?.isStyleLoaded() || mapEpoch === 0) return;
        const data: Feature<LineString> | FeatureCollection = routeGeometry
            ? {
                type: 'Feature',
                properties: { method: routeMethod ?? 'road_route' },
                geometry: routeGeometry,
            }
            : { type: 'FeatureCollection', features: [] };
        const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
        if (!source) return;
        source.setData(data);
        for (const layerId of [ROUTE_CASING, ROUTE_LINE, ROUTE_FALLBACK_CASING, ROUTE_FALLBACK_LINE]) {
            if (map.getLayer(layerId)) map.moveLayer(layerId);
        }
    }, [mapEpoch, routeGeometry, routeMethod]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !serviceCenter || mapEpoch === 0) return;
        void import('maplibre-gl').then(({ default: maplibregl }) => {
            if (mapRef.current !== map) return;
            centerMarkerRef.current?.remove();
            centerMarkerRef.current = new maplibregl.Marker({ color: '#0f6cbd', draggable: serviceCenterDraggable })
                .setLngLat([serviceCenter.longitude, serviceCenter.latitude])
                .addTo(map);
            centerMarkerRef.current.on('dragend', () => {
                const point = centerMarkerRef.current?.getLngLat();
                if (point) onServiceCenterMoveRef.current?.({ latitude: point.lat, longitude: point.lng });
            });
        });
    }, [mapEpoch, serviceCenter, serviceCenterDraggable]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || mapEpoch === 0) return;
        if (!searchLocation) {
            searchMarkerRef.current?.remove();
            searchMarkerRef.current = null;
            return;
        }
        void import('maplibre-gl').then(({ default: maplibregl }) => {
            if (mapRef.current !== map) return;
            searchMarkerRef.current?.remove();
            searchMarkerRef.current = new maplibregl.Marker({ color: '#2563eb' })
                .setLngLat([searchLocation.longitude, searchLocation.latitude])
                .setPopup(new maplibregl.Popup({ closeButton: false, offset: 18 }).setText(searchLocation.label))
                .addTo(map);
            cameraFlyTo('searchResult', { center: [searchLocation.longitude, searchLocation.latitude], zoom: 15, duration: 650 });
        });
    }, [mapEpoch, searchLocation]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || mapEpoch === 0) return;
        if (!customerLocation) {
            customerMarkerRef.current?.remove();
            customerMarkerRef.current = null;
            return;
        }
        void import('maplibre-gl').then(({ default: maplibregl }) => {
            if (mapRef.current !== map) return;
            customerMarkerRef.current?.remove();
            customerMarkerRef.current = new maplibregl.Marker({ color: '#059669' })
                .setLngLat([customerLocation.longitude, customerLocation.latitude])
                .addTo(map);
            const reducedMotion = presentation === 'customerImmersive' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            cameraFlyTo('customerFocus', { center: [customerLocation.longitude, customerLocation.latitude], zoom: 14.5, duration: reducedMotion ? 0 : 550 });
        });
    }, [customerFocusRequest, customerLocation, mapEpoch, presentation]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !routeGeometry || !customerLocation || !serviceCenter) return;
        const positions = [
            ...routeGeometry.coordinates,
            [customerLocation.longitude, customerLocation.latitude],
            [serviceCenter.longitude, serviceCenter.latitude],
        ];
        const bounds: [[number, number], [number, number]] = [
            [Math.min(...positions.map((position) => position[0])), Math.min(...positions.map((position) => position[1]))],
            [Math.max(...positions.map((position) => position[0])), Math.max(...positions.map((position) => position[1]))],
        ];
        const mobile = map.getContainer().clientWidth < 768;
        const reducedMotion = presentation === 'customerImmersive' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        cameraFitBounds('routeFit', bounds, {
            // Mobile bottom sheet + desktop inspector padding so both endpoints stay visible
            padding: mobile
                ? { top: 80, right: 36, bottom: 210, left: 36 }
                : { top: 88, right: 400, bottom: 88, left: 88 },
            maxZoom: 13.5,
            duration: reducedMotion ? 0 : 750,
        });
    }, [customerLocation, mapEpoch, presentation, routeGeometry, serviceCenter]);

    if (mapFailed) {
        return (
            <div className={cn('flex items-center justify-center overflow-y-auto bg-slate-100 p-6 text-center text-sm text-slate-500', className)} role="status">
                {fallbackContent ?? 'The interactive map is unavailable. Use the accessible area list to continue.'}
            </div>
        );
    }

    return (
        <>
            {/* Compact legal attribution only for non-interactive page previews (pageOwnsScroll). */}
            <style>{`
                /* Keep preview out of the touch hit path so parent scroller keeps native pan-y momentum */
                .promise-map-preview-compact-attrib canvas.maplibregl-canvas,
                .promise-map-preview-compact-attrib .maplibregl-canvas-container {
                    pointer-events: none !important;
                    touch-action: pan-y !important;
                }
                /* Hide any residual MapLibre attrib chrome on preview (we use a single custom credit). */
                .promise-map-preview-compact-attrib .maplibregl-ctrl-attrib,
                .promise-map-preview-compact-attrib .maplibregl-ctrl-bottom-right {
                    display: none !important;
                }
                .promise-map-preview-legal-credit {
                    position: absolute;
                    right: 4px;
                    bottom: 3px;
                    z-index: 2;
                    max-width: min(72%, 210px);
                    padding: 1px 5px;
                    border-radius: 4px;
                    background: rgba(255, 255, 255, 0.78);
                    font-size: 9px;
                    line-height: 1.2;
                    color: #334155;
                    pointer-events: none;
                    user-select: none;
                }
                .promise-map-preview-legal-credit a {
                    color: #1e293b;
                    text-decoration: none;
                    pointer-events: auto;
                }
            `}</style>
            <div ref={containerRef} className={cn('h-full w-full bg-slate-100', className)} role="application" aria-label={ariaLabel} />
        </>
    );
}
