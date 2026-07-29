import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { createPortal } from "react-dom";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, MultiPolygon, Point, Polygon } from "geojson";
import {
  ArrowLeft,
  ArrowRight,
  CarFront,
  ChevronUp,
  Crosshair,
  ExternalLink,
  Loader2,
  LockKeyhole,
  MapPin,
  Maximize2,
  Minus,
  Navigation,
  RotateCcw,
  Search,
  Truck,
  X,
  Plus,
} from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { AreaMapCanvas, type CustomerImmersiveCameraApi } from "@/components/maps/AreaMapCanvas";
import { MobileBottomSheetDragHandle, MobileBottomSheetFrame } from "@/components/ui/mobile-bottom-sheet";
import { Button } from "@/components/ui/button";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";
import { useCustomerMobileChrome } from "@/contexts/CustomerMobileChromeContext";
import { publicAreaMapApi, type MapPlaceSuggestion, type RouteEstimateResponse, type ServiceAreaMapItem } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ServiceCenterLocation {
  latitude: number;
  longitude: number;
  placeId?: string;
  address?: string;
}

export type PublicSettingsStatus = "loading" | "success" | "error";

interface CustomerDistanceExplorerProps {
  serviceCenter: ServiceCenterLocation | null;
  /**
   * Public settings lifecycle (distinct from missing coordinates).
   * - loading: settings still fetching / retrying
   * - success: settings resolved (center may still be null if unconfigured)
   * - error: settings fetch failed — keep pending route until retry succeeds
   */
  publicSettingsStatus?: PublicSettingsStatus;
  compact?: boolean;
}

interface BrowserLocation {
  latitude: number;
  longitude: number;
}

type LocationState =
  | "idle"
  | "locating"
  | "preparing_route"
  | "settings_error"
  | "routing"
  | "ready"
  | "route_fallback"
  | "route_unavailable"
  | "service_center_missing"
  | "denied"
  | "error";

/** Intent for a single user-triggered route attempt (not re-fired by Strict Mode alone). */
type RouteIntent = "none" | "pending";

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: string }).name;
  return name === "AbortError" || name === "CanceledError";
}

function useCustomerMapMobileMode() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    const viewport = window.visualViewport;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    return width < 768 || (height < 700 && (navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches));
  });

  useEffect(() => {
    const update = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      setIsMobile(width < 768 || (height < 700 && (navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches)));
    };
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("orientationchange", update, { passive: true });
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  return isMobile;
}

function createDirectionsUrl(
  serviceCenter: ServiceCenterLocation,
  origin?: { latitude: number; longitude: number } | null,
) {
  const params = new URLSearchParams({
    api: "1",
    destination: serviceCenter.address?.trim() || `${serviceCenter.latitude},${serviceCenter.longitude}`,
    travelmode: "driving",
    dir_action: "navigate",
  });
  if (origin) {
    params.set("origin", `${origin.latitude},${origin.longitude}`);
  }
  if (serviceCenter.placeId?.trim()) params.set("destination_place_id", serviceCenter.placeId.trim());
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function clientStraightLineFallback(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
): RouteEstimateResponse {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(destination.latitude - origin.latitude);
  const dLng = toRad(destination.longitude - origin.longitude);
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(origin.latitude)) * Math.cos(toRad(destination.latitude)) * Math.sin(dLng / 2) ** 2;
  const distanceKm = Number((6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(2));
  return {
    distanceKm,
    durationMinutes: Math.max(1, Math.round((distanceKm / 25) * 60)),
    geometry: {
      type: "LineString",
      coordinates: [
        [origin.longitude, origin.latitude],
        [destination.longitude, destination.latitude],
      ],
    },
    method: "straight_line_fallback" as const,
    provider: "local" as const,
  };
}

function fullAreaName(area: ServiceAreaMapItem) {
  return [area.blockOrSector, area.subareaName, area.areaName, area.city].filter(Boolean).join(", ");
}

function matchingArea(location: BrowserLocation, areas: ServiceAreaMapItem[]) {
  const point: Feature<Point> = {
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: [location.longitude, location.latitude] },
  };
  return areas.find((area) => {
    if (!area.boundaryGeoJson?.geometry) return false;
    return booleanPointInPolygon(point, area.boundaryGeoJson as Feature<Polygon | MultiPolygon>);
  }) ?? null;
}

function demandRangeKey(range: ServiceAreaMapItem["demandRange"]): "distance.demand50Plus" | "distance.demand20Plus" | "distance.demand5Plus" | "distance.demandNew" {
  if (range === "50_plus") return "distance.demand50Plus";
  if (range === "20_plus") return "distance.demand20Plus";
  if (range === "5_plus") return "distance.demand5Plus";
  return "distance.demandNew";
}

const demandPriority: Record<ServiceAreaMapItem["demandLevel"], number> = {
  "high demand": 4,
  popular: 3,
  growing: 2,
  new: 1,
};

export default function CustomerDistanceExplorer({
  serviceCenter,
  publicSettingsStatus = "success",
}: CustomerDistanceExplorerProps) {
  const { t } = useCustomerLanguage();
  const [, setLocation] = useLocation();
  const sectionRef = useRef<HTMLElement>(null);
  const hasSetInitialCamera = useRef(false);
  /** Monotonic id assigned on user click (before geolocation). */
  const routeRunIdRef = useRef(0);
  /** Prevents React Strict Mode / effect re-entry from starting a second fetch for the same run. */
  const routeFetchStartedForRunRef = useRef(0);
  /** Active estimate AbortController — aborted on supersede or unmount. */
  const routeAbortRef = useRef<AbortController | null>(null);
  const isMobile = useCustomerMapMobileMode();
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [locationState, setLocationState] = useState<LocationState>("idle");
  const [browserLocation, setBrowserLocation] = useState<BrowserLocation | null>(null);
  const [route, setRoute] = useState<RouteEstimateResponse | null>(null);
  /** When set to pending, effect runs estimate once both location + service center are ready. */
  const [routeIntent, setRouteIntent] = useState<RouteIntent>("none");
  const [selectedArea, setSelectedArea] = useState<ServiceAreaMapItem | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  /** After Enter (or idle search), show explicit “can’t find place” without moving the map. */
  const [searchCommittedEmpty, setSearchCommittedEmpty] = useState(false);
  const [customerFocusRequest, setCustomerFocusRequest] = useState(0);
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const [customerCamera, setCustomerCamera] = useState<CustomerImmersiveCameraApi | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  /**
   * The embedded mobile map is intentionally non-interactive (cooperativeGestures
   * disables drag/pinch) so a one-finger touch starting on the map scrolls the
   * page instead of fighting it — that part already worked. But it left the map
   * unable to pan at all, which is its own real problem. Rather than choosing
   * one bug over the other, tapping "expand" opens the SAME map full-screen with
   * gestures fully enabled: there's no competing page scroll once it's the only
   * thing on screen, so full pan/zoom is safe there.
   */
  const [fullMapOpen, setFullMapOpen] = useState(false);
  const { setBottomNavSuppressed } = useCustomerMobileChrome();
  const [showInteractionHint, setShowInteractionHint] = useState(false);

  useEffect(() => {
    setBottomNavSuppressed(sheetOpen || fullMapOpen);
    return () => setBottomNavSuppressed(false);
  }, [setBottomNavSuppressed, sheetOpen, fullMapOpen]);

  const areaQuery = useQuery({
    queryKey: ["public-area-map"],
    queryFn: publicAreaMapApi.getMap,
    // MAP-PUBLIC-LEAK-HOTFIX: never keep unpublished areas in client memory after unpublish
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    enabled: isNearViewport,
  });
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    // Typing again clears the “can’t find” commit state
    setSearchCommittedEmpty(false);
  }, [search]);
  const placeQuery = useQuery({
    queryKey: ["public-map-place-search", debouncedSearch],
    queryFn: () => publicAreaMapApi.searchPlaces(debouncedSearch),
    enabled: debouncedSearch.length >= 3,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const areas = areaQuery.data?.areas ?? [];
  const filteredAreas = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return areas;
    return areas.filter((area) => fullAreaName(area).toLocaleLowerCase().includes(term));
  }, [areas, search]);
  const featuredArea = useMemo(() => {
    const ranked = [...areas].sort((left, right) => demandPriority[right.demandLevel] - demandPriority[left.demandLevel]);
    return ranked.find((area) => area.boundaryGeoJson?.geometry) ?? null;
  }, [areas]);
  const hasRealPolygons = useMemo(
    () => areas.some((area) => Boolean(area.boundaryGeoJson?.geometry)),
    [areas],
  );
  const placeSuggestions = placeQuery.data?.results ?? [];
  const mapDataReady = areaQuery.isSuccess || areaQuery.isError;
  const durationMinutes = route?.durationMinutes != null ? Math.max(1, Math.round(route.durationMinutes)) : null;
  const rawDistanceKm = route && Number.isFinite(route.distanceKm) ? Math.max(0, route.distanceKm) : null;
  const proximityTier: "almost" | "veryClose" | "normal" | null = rawDistanceKm == null
    ? null
    : rawDistanceKm < 0.2
      ? "almost"
      : rawDistanceKm < 1
        ? "veryClose"
        : "normal";
  const distanceDisplay = (() => {
    if (rawDistanceKm == null) return null;
    if (rawDistanceKm < 1) {
      const meters = Math.max(1, Math.round(rawDistanceKm * 1000));
      return { kind: "meters" as const, value: meters.toString() };
    }
    const kmText = rawDistanceKm < 10
      ? (Math.round(rawDistanceKm * 10) / 10).toFixed(1)
      : Math.round(rawDistanceKm).toString();
    // Never display 0.0 km
    if (kmText === "0.0" || kmText === "0") {
      return { kind: "meters" as const, value: "1" };
    }
    return { kind: "km" as const, value: kmText };
  })();
  // settings_error stays clickable so the user can re-trigger; pending auto-continues on settings retry.
  const isCheckingLocation =
    locationState === "locating"
    || locationState === "preparing_route"
    || locationState === "routing";

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    if (node.getBoundingClientRect().top < window.innerHeight + 420) {
      setIsNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: "420px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Abort any in-flight estimate when this component unmounts.
  useEffect(() => {
    return () => {
      routeAbortRef.current?.abort();
      routeAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isMobile || !customerCamera || areaQuery.isLoading || hasSetInitialCamera.current) return;
    if (featuredArea) {
      hasSetInitialCamera.current = true;
      setSelectedArea(featuredArea);
      return;
    }
    if (!areaQuery.isSuccess) return;
    hasSetInitialCamera.current = true;
    if (serviceCenter) {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      customerCamera.focusServiceCenter({
        latitude: serviceCenter.latitude,
        longitude: serviceCenter.longitude,
        zoom: hasRealPolygons ? 13 : 12.2,
        pitch: hasRealPolygons ? 42 : 28,
        bearing: hasRealPolygons ? -10 : 0,
        duration: reducedMotion ? 0 : 550,
      });
    }
  }, [areaQuery.isLoading, areaQuery.isSuccess, customerCamera, featuredArea, hasRealPolygons, isMobile, serviceCenter]);

  useEffect(() => {
    if (isMobile || !mapInstance || !hasRealPolygons) {
      setShowInteractionHint(false);
      return;
    }
    setShowInteractionHint(true);
    const timeout = window.setTimeout(() => setShowInteractionHint(false), 5500);
    return () => window.clearTimeout(timeout);
  }, [hasRealPolygons, isMobile, mapInstance]);

  /**
   * Continue a click-scoped attempt after geolocation/place selection.
   * Does NOT allocate a new run id (that happens on the user click).
   */
  const beginRouteFromLocation = (temporaryLocation: BrowserLocation, runId: number) => {
    if (runId !== routeRunIdRef.current) return;
    setBrowserLocation(temporaryLocation);
    setCustomerFocusRequest((value) => value + 1);
    setSelectedArea(matchingArea(temporaryLocation, areas));
    setRoute(null);
    if (publicSettingsStatus === "loading") {
      setLocationState("preparing_route");
    } else if (publicSettingsStatus === "error") {
      // Keep pending — retry success must auto-continue the same attempt.
      setLocationState("settings_error");
    } else if (!serviceCenter) {
      setLocationState("service_center_missing");
      setRouteIntent("none");
      return;
    } else {
      setLocationState("routing");
    }
    setRouteIntent("pending");
  };

  // Continue / run estimate when customer location is held and settings resolve.
  // Gate with routeFetchStartedForRunRef so Strict Mode remounts do not double-call the API.
  useEffect(() => {
    if (routeIntent !== "pending" || !browserLocation) return;

    if (publicSettingsStatus === "loading") {
      setLocationState("preparing_route");
      return;
    }

    if (publicSettingsStatus === "error") {
      // Transient — do not clear routeIntent; keep pin and wait for retry success.
      setLocationState("settings_error");
      return;
    }

    // success
    if (!serviceCenter) {
      setLocationState("service_center_missing");
      setRouteIntent("none");
      return;
    }

    const runId = routeRunIdRef.current;
    if (routeFetchStartedForRunRef.current === runId) return;
    routeFetchStartedForRunRef.current = runId;

    const origin = browserLocation;
    const destination = serviceCenter;
    const controller = new AbortController();
    routeAbortRef.current = controller;

    setLocationState("routing");

    void (async () => {
      try {
        const estimate = await publicAreaMapApi.estimateRoute(origin, { signal: controller.signal });
        if (runId !== routeRunIdRef.current || controller.signal.aborted) return;
        setRoute(estimate);
        setLocationState(estimate.method === "straight_line_fallback" ? "route_fallback" : "ready");
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error) || runId !== routeRunIdRef.current) {
          // Superseded or aborted — never show fallback/error for this attempt.
          return;
        }
        setRoute(clientStraightLineFallback(origin, {
          latitude: destination.latitude,
          longitude: destination.longitude,
        }));
        setLocationState("route_fallback");
      } finally {
        if (runId === routeRunIdRef.current && !controller.signal.aborted) {
          setRouteIntent("none");
        }
        if (routeAbortRef.current === controller) {
          routeAbortRef.current = null;
        }
      }
    })();
  }, [routeIntent, browserLocation, serviceCenter, publicSettingsStatus]);

  const startNewRouteAttempt = () => {
    const runId = routeRunIdRef.current + 1;
    routeRunIdRef.current = runId;
    routeFetchStartedForRunRef.current = 0;
    routeAbortRef.current?.abort();
    routeAbortRef.current = null;
    setRouteIntent("none");
    setRoute(null);
    return runId;
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationState("error");
      return;
    }
    const runId = startNewRouteAttempt();
    setLocationState("locating");
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (runId !== routeRunIdRef.current) return;
      beginRouteFromLocation({ latitude: coords.latitude, longitude: coords.longitude }, runId);
    }, (error) => {
      if (runId !== routeRunIdRef.current) return;
      setRouteIntent("none");
      setLocationState(error.code === error.PERMISSION_DENIED ? "denied" : "error");
    }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 });
  };

  const chooseArea = (area: ServiceAreaMapItem) => {
    setSearchCommittedEmpty(false);
    setSelectedArea(area);
    setSearch("");
    if (isMobile) setSheetOpen(true);
  };

  const choosePlace = (place: MapPlaceSuggestion) => {
    setSearchCommittedEmpty(false);
    setSelectedArea(null);
    setSearch("");
    const runId = startNewRouteAttempt();
    beginRouteFromLocation({ latitude: place.latitude, longitude: place.longitude }, runId);
  };

  /**
   * Enter:
   * - top service area → select (shows stored border if published geometry exists)
   * - else top place → pin + route only (never invents an area border)
   * - else → “can’t find place”, stay on map (no navigation, no camera jump)
   */
  const commitSearchSelection = () => {
    const term = search.trim();
    if (!term) return;

    const topArea = filteredAreas[0];
    if (topArea) {
      chooseArea(topArea);
      return;
    }
    if (term.length >= 3 && placeQuery.isFetching) return;

    const topPlace = placeSuggestions[0];
    if (topPlace) {
      choosePlace(topPlace);
      return;
    }

    // Misspelled / unknown: keep search open, do not move map or route
    setSearchCommittedEmpty(true);
  };

  const resetView = () => {
    setSearch("");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!isMobile && featuredArea) {
      setSelectedArea(featuredArea);
      // Always re-frame via coordinator (selectedArea priority) — works when already selected after pan.
      customerCamera?.focusFeaturedArea({
        boundaryGeoJson: featuredArea.boundaryGeoJson,
        centroidLatitude: featuredArea.centroidLatitude,
        centroidLongitude: featuredArea.centroidLongitude,
        duration: reducedMotion ? 0 : 650,
        pitch: 42,
        bearing: -10,
      });
      return;
    }
    setSelectedArea(null);
    const center: [number, number] = !isMobile && serviceCenter
      ? [serviceCenter.longitude, serviceCenter.latitude]
      : [90.4125, 23.8103];
    customerCamera?.resetView({
      center,
      zoom: !isMobile && serviceCenter ? 13 : 10.5,
      pitch: isMobile ? 0 : 42,
      bearing: isMobile ? 0 : -10,
      duration: reducedMotion ? 0 : 550,
    });
  };

  const useCurrentLocationOnMap = () => {
    if (browserLocation) {
      setCustomerFocusRequest((value) => value + 1);
      return;
    }
    requestLocation();
  };

  const goToRepair = (serviceMode: "service_center" | "pickup") => {
    const params = new URLSearchParams({ serviceMode });
    if (selectedArea) params.set("serviceAreaId", selectedArea.id);
    setLocation(`/repair?${params.toString()}`);
  };

  const distanceLabel = distanceDisplay
    ? distanceDisplay.kind === "meters"
      ? `${distanceDisplay.value} ${t("distance.metersAway")}`
      : `${distanceDisplay.value} ${t("distance.kilometers")}`
    : null;
  const proximityHeadline = proximityTier === "almost"
    ? t("distance.almostHere")
    : proximityTier === "veryClose"
      ? t("distance.veryClose")
      : null;
  const statusTitle = route && distanceLabel
    ? proximityHeadline
      ? proximityHeadline
      : durationMinutes != null
        ? `${distanceLabel} · ${durationMinutes} ${t("distance.minutesEstimate")}`
        : distanceLabel
    : locationState === "routing"
      ? t("distance.findingRoute")
      : locationState === "preparing_route"
        ? t("distance.preparingRoute")
        : locationState === "settings_error"
          ? t("distance.settingsErrorTitle")
          : locationState === "locating"
            ? t("distance.locating")
            : locationState === "service_center_missing"
              ? t("distance.serviceCenterMissingTitle")
              : locationState === "route_unavailable" || locationState === "route_fallback"
                ? t("distance.locationFound")
                : t("distance.permissionTitle");
  const statusBody = route && distanceLabel
    ? (() => {
      const routeNote = route.method === "straight_line_fallback" || locationState === "route_fallback"
        ? t("distance.fallbackRoute")
        : t("distance.resultLabel");
      if (proximityHeadline) {
        const durationPart = durationMinutes != null && proximityTier !== "almost"
          ? ` · ${durationMinutes} ${t("distance.minutesEstimate")}`
          : "";
        return `${distanceLabel}${durationPart} · ${routeNote}`;
      }
      return routeNote;
    })()
    : locationState === "routing"
      ? t("distance.findingRoute")
      : locationState === "preparing_route"
        ? t("distance.preparingRouteBody")
        : locationState === "settings_error"
          ? t("distance.settingsErrorBody")
          : locationState === "denied"
            ? t("distance.denied")
            : locationState === "error"
              ? t("distance.error")
              : locationState === "service_center_missing"
                ? t("distance.serviceCenterMissingBody")
                : locationState === "route_unavailable"
                  ? t("distance.routeUnavailable")
                  : t("distance.permissionBody");

  const canOpenDirections = Boolean(serviceCenter && browserLocation);
  const mobileMapCtaTitle = route && distanceLabel
    ? statusTitle
    : locationState === "idle"
      ? t("distance.mapCheckDistance")
      : statusTitle;
  const mobileMapCtaBody = route && distanceLabel
    ? t("distance.mapRouteReady")
    : locationState === "idle"
      ? t("distance.mapCheckDistanceHint")
      : statusBody;

  const map = (
    <AreaMapCanvas
      /**
       * Forces a fresh MapLibre instance when switching between the embedded
       * preview and the expanded sheet. AreaMapCanvas builds its map inside a
       * useEffect with an EMPTY dependency array, so gesture options (dragPan,
       * touchZoomRotate, and the pointer-events:none applied for the page-scroll
       * profile) are fixed at construction and never revisited. Without a
       * changing key, React could reuse the instance and the expanded map would
       * stay frozen exactly as it is in the preview.
       */
      key={fullMapOpen ? "map-expanded" : "map-preview"}
      areas={areas}
      selectedAreaId={selectedArea?.id}
      onSelectArea={chooseArea}
      serviceCenter={serviceCenter}
      customerLocation={browserLocation}
      customerFocusRequest={customerFocusRequest}
      routeGeometry={
        locationState === "routing"
        || locationState === "preparing_route"
        || locationState === "settings_error"
        || locationState === "locating"
          ? null
          : (route?.geometry ?? null)
      }
      routeMethod={
        locationState === "routing"
        || locationState === "preparing_route"
        || locationState === "settings_error"
        || locationState === "locating"
          ? null
          : (route?.method ?? null)
      }
      threeDimensional={!isMobile}
      presentation="customerImmersive"
      // Non-interactive (page owns one-finger scroll) in the embedded preview;
      // fully interactive once expanded full-screen, where nothing competes
      // for the gesture.
      cooperativeGestures={isMobile && !fullMapOpen}
      showNavigation={false}
      onMapReady={setMapInstance}
      onCustomerCameraReady={setCustomerCamera}
      fallbackContent={
        <div className="w-full max-w-md rounded-2xl bg-white p-5 text-left shadow-sm">
          <p className="text-sm font-bold text-slate-900">{t("distance.areaListUnavailable")}</p>
          <div className="mt-4 space-y-2">
            {areas.slice(0, 8).map((area) => (
              <button key={area.id} type="button" onClick={() => chooseArea(area)} className="min-h-11 w-full rounded-xl border border-emerald-100 px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-emerald-50">
                {fullAreaName(area)}
              </button>
            ))}
          </div>
        </div>
      }
      className="absolute inset-0"
      ariaLabel={t("distance.mapLabel")}
    />
  );

  const searchControl = (
    <div className={cn("absolute z-30", isMobile ? "left-4 right-4 top-4" : "left-1/2 top-6 w-[min(420px,calc(100%-3rem))] -translate-x-1/2")}>
      <label
        className={cn(
          "customer-map-search-capsule flex h-12 items-center gap-2 rounded-full border border-white/70 bg-white/88 px-4 shadow-[0_12px_34px_rgba(15,23,42,0.16)] backdrop-blur-xl transition-[box-shadow,border-color]",
        )}
        aria-label={t("distance.searchAreas")}
      >
        <Search className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
        <input
          id="customer-area-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            // Wait until place debounce finished when no local area match yet
            if (filteredAreas.length === 0 && search.trim().length >= 3 && placeQuery.isFetching) return;
            commitSearchSelection();
          }}
          placeholder={t("distance.searchHint")}
          autoComplete="off"
          enterKeyHint="search"
          className="customer-map-search-input min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-slate-900 shadow-none ring-0 placeholder:text-slate-400"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Clear search"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </label>
      {search && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-2xl border border-white/80 bg-white/94 p-1.5 shadow-[0_20px_46px_rgba(15,23,42,0.18)] backdrop-blur-xl">
          {filteredAreas.length > 0 && <p className="px-3 pb-1 pt-2 text-[10px] font-black uppercase text-slate-400">{t("distance.serviceAreaResults")}</p>}
          {filteredAreas.slice(0, 4).map((area) => (
            <button key={area.id} type="button" onClick={() => chooseArea(area)} className="flex min-h-12 w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-emerald-50 hover:text-emerald-950">
              <MapPin className="h-4 w-4 shrink-0 text-emerald-700" />
              <span>{fullAreaName(area)}</span>
            </button>
          ))}
          {placeQuery.isFetching && <div className="flex min-h-12 items-center gap-2 px-3 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />{t("distance.searchingPlaces")}</div>}
          {placeSuggestions.length > 0 && <p className="px-3 pb-1 pt-2 text-[10px] font-black uppercase text-slate-400">{t("distance.addressResults")}</p>}
          {placeSuggestions.map((place) => (
            <button key={place.id} type="button" onClick={() => choosePlace(place)} className="flex min-h-12 w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-blue-50 hover:text-slate-950">
              <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <span className="line-clamp-2">{place.label}</span>
            </button>
          ))}
          {!placeQuery.isFetching && filteredAreas.length === 0 && placeSuggestions.length === 0 && (
            (debouncedSearch.length >= 3 || searchCommittedEmpty) ? (
              <p className="px-3 py-4 text-sm text-slate-500" role="status">
                {placeQuery.isError ? t("distance.placeSearchUnavailable") : t("distance.cantFindPlace")}
              </p>
            ) : null
          )}
        </div>
      )}
    </div>
  );

  const mapControls = (
    <div className={cn("absolute z-30 flex flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/88 shadow-[0_12px_34px_rgba(15,23,42,0.16)] backdrop-blur-xl", isMobile ? "right-4 top-20" : "right-7 top-7")}>
      <button type="button" aria-label={t("distance.zoomIn")} onClick={() => mapInstance?.zoomIn()} className="flex h-11 w-11 items-center justify-center text-slate-700 transition-colors hover:bg-emerald-50 hover:text-emerald-700"><Plus className="h-4 w-4" /></button>
      <div className="h-px bg-slate-200/80" />
      <button type="button" aria-label={t("distance.zoomOut")} onClick={() => mapInstance?.zoomOut()} className="flex h-11 w-11 items-center justify-center text-slate-700 transition-colors hover:bg-emerald-50 hover:text-emerald-700"><Minus className="h-4 w-4" /></button>
      <div className="h-px bg-slate-200/80" />
      <button type="button" aria-label="Reset map view" onClick={resetView} className="flex h-11 w-11 items-center justify-center text-slate-700 transition-colors hover:bg-emerald-50 hover:text-emerald-700"><RotateCcw className="h-4 w-4" /></button>
    </div>
  );

  /**
   * Floating action bar for the expanded map sheet.
   *
   * One control at a time, so it never covers the map:
   *  - no location yet  → a single labelled "Check distance" button, so the
   *    purpose of the map is obvious instead of hidden behind a bare crosshair.
   *  - distance known    → the distance itself plus the booking CTA, because
   *    that is the moment the customer is ready to act.
   *
   * Deliberately compact (pointer-events only on the pill, transparent
   * elsewhere) and pinned to the bottom inset so it clears the map attribution.
   */
  const expandedMapActionBar = (
    // bottom-9 clears the OpenFreeMap/OpenStreetMap attribution, which is a
    // licence requirement and must stay legible.
    <div className="pointer-events-none absolute inset-x-3 bottom-9 z-30 flex flex-col items-stretch gap-2">
      {distanceLabel && (
        <div className="pointer-events-auto mx-auto flex items-center gap-2 rounded-full border border-white/80 bg-white/95 px-3.5 py-1.5 shadow-[0_10px_26px_rgba(15,23,42,0.18)] backdrop-blur-xl">
          <Navigation className="h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden />
          <span className="text-xs font-bold text-slate-900">{distanceLabel}</span>
          {canOpenDirections && serviceCenter && browserLocation && (
            <button
              type="button"
              onClick={() => window.open(createDirectionsUrl(serviceCenter, browserLocation), "_blank", "noopener,noreferrer")}
              aria-label={t("distance.liveDirections")}
              title={t("distance.liveDirections")}
              className="-mr-1 flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      )}
      {distanceLabel ? (
        <button
          type="button"
          onClick={() => goToRepair("pickup")}
          className="pointer-events-auto flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 text-sm font-bold text-white shadow-[0_12px_30px_rgba(4,120,87,0.32)] transition-colors hover:bg-emerald-800 active:bg-emerald-900"
        >
          <Truck className="h-4 w-4 shrink-0" aria-hidden />
          {t("distance.requestPickupCta")}
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={requestLocation}
          disabled={isCheckingLocation}
          className="pointer-events-auto flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 text-sm font-bold text-white shadow-[0_12px_30px_rgba(4,120,87,0.32)] transition-colors hover:bg-emerald-800 active:bg-emerald-900 disabled:cursor-wait disabled:bg-emerald-700/70"
        >
          {isCheckingLocation
            ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
            : <Crosshair className="h-4 w-4 shrink-0" aria-hidden />}
          {isCheckingLocation ? t("distance.checking") : t("distance.checkDistanceCta")}
        </button>
      )}
    </div>
  );

  const mobileLocationControls = isMobile ? (
    <div className="absolute bottom-[5.5rem] right-4 z-30 flex flex-col items-end gap-2">
      {canOpenDirections && serviceCenter && browserLocation && (
        <button
          type="button"
          onClick={() => window.open(createDirectionsUrl(serviceCenter, browserLocation), "_blank", "noopener,noreferrer")}
          className="flex h-11 items-center gap-2 rounded-full border border-white/80 bg-white/95 px-3.5 text-xs font-bold text-slate-800 shadow-[0_10px_26px_rgba(15,23,42,0.18)] backdrop-blur-xl transition-colors hover:bg-emerald-50 hover:text-emerald-800"
        >
          <Navigation className="h-4 w-4 text-emerald-700" aria-hidden />
          {t("distance.mapDirections")}
        </button>
      )}
      <button
        type="button"
        onClick={useCurrentLocationOnMap}
        disabled={isCheckingLocation}
        aria-label={browserLocation ? t("distance.recenter") : t("distance.useLocation")}
        title={browserLocation ? t("distance.recenter") : t("distance.useLocation")}
        className="flex h-12 w-12 items-center justify-center rounded-full border border-white/80 bg-white/95 text-emerald-700 shadow-[0_10px_26px_rgba(15,23,42,0.18)] backdrop-blur-xl transition-colors hover:bg-emerald-50 disabled:cursor-wait disabled:text-slate-400"
      >
        {isCheckingLocation ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Crosshair className="h-5 w-5" aria-hidden />}
      </button>
    </div>
  ) : null;

  // Permission status already carries the location-use assurance — do not repeat full privacy at equal weight.
  const showQuietPrivacyFooter =
    locationState !== "idle"
    && locationState !== "locating"
    && locationState !== "denied"
    && locationState !== "error";

  const actionButtons = (mobile = false) => mobile ? (
    <div className="space-y-2.5" role="group" aria-label={t("distance.serviceChoiceLabel")}>
      <button
        type="button"
        onClick={() => goToRepair("pickup")}
        className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-emerald-700 px-4 py-3 text-left text-white shadow-[0_10px_22px_rgba(4,120,87,0.22)] transition-colors hover:bg-emerald-800 active:bg-emerald-900"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15"><Truck className="h-5 w-5" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold leading-snug">{t("distance.pickupDrop")}</span>
          <span className="mt-0.5 block text-xs leading-snug text-emerald-100">{t("distance.startPickup")}</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-emerald-100" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => goToRepair("service_center")}
        className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-emerald-200/90 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-emerald-50 active:bg-emerald-100/80"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><CarFront className="h-5 w-5" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold leading-snug text-slate-900">{t("distance.visitCenter")}</span>
          <span className="mt-0.5 block text-xs leading-snug text-slate-500">{t("distance.planVisit")}</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
      </button>
    </div>
  ) : (
    <div className="grid grid-cols-1 gap-2">
      <button type="button" onClick={() => goToRepair("service_center")} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/70 bg-white/72 px-3 text-sm font-bold text-slate-800 shadow-sm backdrop-blur transition-colors hover:bg-white">
        <CarFront className="h-4 w-4 text-emerald-700" /> {t("distance.visitCenter")}
      </button>
      <button type="button" onClick={() => goToRepair("pickup")} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 text-sm font-bold text-white shadow-[0_10px_24px_rgba(4,120,87,0.28)] transition-colors hover:bg-emerald-800">
        <Truck className="h-4 w-4" /> {t("distance.pickupDrop")}
      </button>
    </div>
  );

  return (
    <section ref={sectionRef} className="relative isolate overflow-hidden bg-[#f7fbf9]" aria-label={t("distance.mapLabel")}>
      {isMobile ? (
        <div className="relative h-[64dvh] min-h-[440px] max-h-[640px] overflow-hidden">
          {/* Full map is expanded elsewhere (portal below) — avoid mounting a second
              live MapLibre instance for the same preview area while it's open. */}
          {fullMapOpen ? (
            <div className="absolute inset-0 bg-slate-100" />
          ) : isNearViewport ? (
            map
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100"><Loader2 className="h-6 w-6 animate-spin text-emerald-700" /></div>
          )}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-[#f7fbf9]/86 via-[#f7fbf9]/22 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-40 bg-gradient-to-t from-[#f7fbf9] via-[#f7fbf9]/34 to-transparent" />
          {!fullMapOpen && searchControl}
          {!fullMapOpen && mapControls}
          {!fullMapOpen && mobileLocationControls}
          {!fullMapOpen && (
            <button
              type="button"
              onClick={() => setFullMapOpen(true)}
              aria-label={t("distance.expandMap")}
              title={t("distance.expandMap")}
              className="absolute left-4 top-20 z-30 flex h-11 items-center gap-2 rounded-full border border-white/70 bg-white/88 px-3.5 text-xs font-bold text-slate-800 shadow-[0_12px_34px_rgba(15,23,42,0.16)] backdrop-blur-xl transition-colors hover:bg-emerald-50 hover:text-emerald-800"
            >
              <Maximize2 className="h-4 w-4 text-emerald-700" aria-hidden />
              {t("distance.expandMap")}
            </button>
          )}
          <div className="absolute inset-x-4 bottom-4 z-30">
            <button type="button" onClick={() => setSheetOpen(true)} className="flex min-h-14 w-full items-center justify-between rounded-2xl border border-white/70 bg-slate-950/86 px-4 text-left text-white shadow-[0_18px_40px_rgba(15,23,42,0.26)] backdrop-blur-xl">
              <span className="min-w-0"><span className="block truncate text-sm font-bold">{mobileMapCtaTitle}</span><span className="mt-0.5 block truncate text-xs text-emerald-200">{mobileMapCtaBody}</span></span>
              <ChevronUp className="ml-3 h-5 w-5 shrink-0 text-emerald-300" />
            </button>
          </div>
          {createPortal(
            <AnimatePresence>
              {sheetOpen && (
                <>
                {/* The modal layer owns the dock and chat while the sheet is open. */}
                <motion.button type="button" aria-label="Close area details" className="fixed inset-0 z-[55] bg-slate-950/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheetOpen(false)} />
                <MobileBottomSheetFrame
                  onClose={() => setSheetOpen(false)}
                  dragHandleOnly
                  className="fixed inset-x-0 bottom-0 z-[60] flex max-h-[min(86dvh,calc(100dvh-1rem),600px)] flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_-16px_44px_rgba(15,23,42,0.20)]"
                >
                  <MobileBottomSheetDragHandle onClose={() => setSheetOpen(false)} />
                  <div className="flex shrink-0 items-center gap-2 px-5 pb-1">
                    <button
                      type="button"
                      onClick={() => setSheetOpen(false)}
                      aria-label={t("distance.backToMap")}
                      title={t("distance.backToMap")}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden />
                    </button>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">{t("distance.eyebrow")}</p>
                  </div>
                  <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pt-0.5">
                    {/* Stage 1 — context + distance / location state */}
                    <h2 className="text-[1.35rem] font-black leading-tight tracking-normal text-slate-950">
                      {selectedArea ? fullAreaName(selectedArea) : t("distance.title")}
                    </h2>
                    <p className="mt-1.5 text-sm leading-snug text-slate-500">
                      {selectedArea ? t(demandRangeKey(selectedArea.demandRange)) : t("distance.subtitle")}
                    </p>

                    <div aria-live="polite" className="mt-4 rounded-2xl border border-emerald-100/90 bg-emerald-50/60 px-3.5 py-3">
                      <div className="flex gap-2.5">
                        <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
                        <div className="min-w-0">
                          <p className="text-sm font-bold leading-snug text-emerald-950 break-words">{statusTitle}</p>
                          <p className="mt-1 text-xs leading-relaxed text-emerald-800/95 break-words">{statusBody}</p>
                        </div>
                      </div>
                    </div>

                    {/* Stage 2 — primary location step, then balanced service choices */}
                    <div className="mt-4 space-y-2">
                      <Button
                        type="button"
                        onClick={requestLocation}
                        disabled={isCheckingLocation}
                        className="h-12 min-h-12 w-full rounded-xl bg-emerald-700 font-bold text-white hover:bg-emerald-800"
                      >
                        {isCheckingLocation ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Crosshair className="mr-2 h-4 w-4" aria-hidden />}
                        {locationState === "ready" || locationState === "route_fallback" || locationState === "route_unavailable" || locationState === "service_center_missing"
                          ? t("distance.checkAgain")
                          : t("distance.useLocation")}
                      </Button>
                      {browserLocation && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setCustomerFocusRequest((value) => value + 1)}
                          className="h-11 min-h-11 w-full rounded-xl border-slate-200"
                        >
                          <Crosshair className="mr-2 h-4 w-4 text-emerald-700" aria-hidden />
                          {t("distance.recenter")}
                        </Button>
                      )}
                    </div>

                    <div className="mt-5 border-t border-slate-100 pt-4">
                      <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                        {t("distance.serviceChoiceLabel")}
                      </p>
                      {actionButtons(true)}
                    </div>

                    {serviceCenter && browserLocation && (
                      <button
                        type="button"
                        onClick={() => window.open(createDirectionsUrl(serviceCenter, browserLocation), "_blank", "noopener,noreferrer")}
                        className="mt-3 flex h-11 min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700"
                      >
                        <ExternalLink className="h-4 w-4 text-emerald-700" aria-hidden />
                        {t("distance.liveDirections")}
                      </button>
                    )}

                    {showQuietPrivacyFooter && (
                      <p className="mt-3 flex items-start gap-1.5 pb-1 text-[10px] leading-snug text-slate-400">
                        <LockKeyhole className="mt-0.5 h-3 w-3 shrink-0 opacity-80" aria-hidden />
                        <span>{t("distance.privacy")}</span>
                      </p>
                    )}
                  </div>
                </MobileBottomSheetFrame>
                </>
              )}
            </AnimatePresence>,
            document.body,
          )}
          {createPortal(
            <AnimatePresence>
              {fullMapOpen && (
                <>
                  {/* Backdrop is decorative for assistive tech: the sheet already
                      exposes a labelled close button and Escape closes it, so a
                      second element with the same accessible name would only add
                      an ambiguous duplicate in the AT tree. */}
                  <motion.div
                    aria-hidden="true"
                    className="fixed inset-0 z-[65] bg-slate-950/30"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setFullMapOpen(false)}
                  />
                  {/* Slides up as a bottom sheet, matching the area-details sheet
                      pattern used elsewhere in this component. Tall enough that
                      the map is genuinely usable, but still a sheet over the page
                      rather than a full-screen takeover. */}
                  <MobileBottomSheetFrame
                    onClose={() => setFullMapOpen(false)}
                    dragHandleOnly
                    className="fixed inset-x-0 bottom-0 z-[70] flex h-[88dvh] max-h-[88dvh] flex-col overflow-hidden rounded-t-[28px] bg-white shadow-[0_-16px_44px_rgba(15,23,42,0.20)]"
                  >
                    <MobileBottomSheetDragHandle onClose={() => setFullMapOpen(false)} />
                    <div className="flex shrink-0 items-center justify-between px-5 pb-2">
                      <p className="text-sm font-bold text-slate-900">{t("distance.exploreMapTitle")}</p>
                      <button
                        type="button"
                        onClick={() => setFullMapOpen(false)}
                        aria-label={t("distance.closeMap")}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="relative min-h-0 flex-1 overflow-hidden">
                      {/* Same map element as the preview, but mounted here with
                          cooperativeGestures disabled so drag/pinch/zoom work —
                          inside the sheet nothing competes for the gesture. */}
                      {map}
                      {searchControl}
                      {mapControls}
                      {/* Recenter-on-me pin. Small circular control on the right so
                          it never overlaps the action bar below. Uses the preview's
                          own handler: locates first time, recenters after. */}
                      <button
                        type="button"
                        onClick={useCurrentLocationOnMap}
                        disabled={isCheckingLocation}
                        aria-label={browserLocation ? t("distance.recenter") : t("distance.useLocation")}
                        title={browserLocation ? t("distance.recenter") : t("distance.useLocation")}
                        className="absolute bottom-[7.5rem] right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-white/80 bg-white/95 text-emerald-700 shadow-[0_10px_26px_rgba(15,23,42,0.18)] backdrop-blur-xl transition-colors hover:bg-emerald-50 disabled:cursor-wait disabled:text-slate-400"
                      >
                        {isCheckingLocation
                          ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                          : <Crosshair className="h-5 w-5" aria-hidden />}
                      </button>
                      {expandedMapActionBar}
                    </div>
                  </MobileBottomSheetFrame>
                </>
              )}
            </AnimatePresence>,
            document.body,
          )}
        </div>
      ) : (
        <div
          className={cn(
            "relative overflow-hidden",
            // Desktop map needs more vertical room so the route and both pins read clearly.
            mapDataReady && !hasRealPolygons
              ? "h-[min(78vh,820px)] min-h-[620px] max-h-[860px]"
              : "h-[min(90vh,960px)] min-h-[760px] max-h-[1040px]",
          )}
          onWheelCapture={() => setShowInteractionHint(false)}
          onPointerDownCapture={() => setShowInteractionHint(false)}
        >
          {isNearViewport ? map : <div className="absolute inset-0 flex items-center justify-center bg-slate-100"><Loader2 className="h-7 w-7 animate-spin text-emerald-700" /></div>}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[40%] bg-[linear-gradient(90deg,rgba(247,251,249,0.48)_0%,rgba(247,251,249,0.24)_48%,rgba(247,251,249,0.08)_76%,rgba(247,251,249,0)_100%)]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-white/72 via-white/18 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-52 bg-gradient-to-t from-white via-white/55 to-transparent" />
          {searchControl}
          {mapControls}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.58, ease: "easeOut" }}
            className={cn(
              "absolute left-[max(2rem,calc((100%-78rem)/2))] z-20 w-[min(470px,38vw)]",
              mapDataReady && !hasRealPolygons ? "top-[18%]" : "top-1/2 -translate-y-1/2",
            )}
          >
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-emerald-700 [text-shadow:0_1px_8px_rgba(255,255,255,1),0_0_24px_rgba(255,255,255,0.9)]">{t("distance.eyebrow")}</p>
            <h2 className={cn(
              "mt-4 font-black leading-[0.96] tracking-normal text-slate-950 [text-shadow:0_2px_12px_rgba(255,255,255,1),0_0_40px_rgba(255,255,255,0.85),0_4px_60px_rgba(255,255,255,0.6)]",
              mapDataReady && !hasRealPolygons ? "text-4xl xl:text-5xl" : "text-5xl xl:text-6xl",
            )}>{t("distance.heroTitle")}</h2>
            <p className="mt-5 max-w-md text-base leading-relaxed text-slate-700 [text-shadow:0_1px_10px_rgba(255,255,255,1),0_0_30px_rgba(255,255,255,0.9)]">
              {mapDataReady && !hasRealPolygons ? t("distance.mapPreviewNote") : t("distance.heroSubtitle")}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button type="button" onClick={requestLocation} disabled={isCheckingLocation} className="h-12 rounded-full bg-emerald-700 px-5 font-bold text-white shadow-[0_12px_28px_rgba(4,120,87,0.25)] hover:bg-emerald-800">
                {isCheckingLocation ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crosshair className="mr-2 h-4 w-4" />}
                {locationState === "ready" || locationState === "route_fallback" || locationState === "route_unavailable" || locationState === "service_center_missing"
                  ? t("distance.checkAgain")
                  : t("distance.useLocation")}
              </Button>
            </div>
          </motion.div>
          <motion.aside
            initial={{ opacity: 0, x: 18 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.58, delay: 0.08, ease: "easeOut" }}
            className={cn(
              "absolute right-[max(2rem,calc((100%-78rem)/2))] z-20 w-[min(320px,26vw)] overflow-hidden rounded-2xl bg-white/84 px-5 py-4 shadow-[0_20px_50px_rgba(15,23,42,0.15)] backdrop-blur-md",
              mapDataReady && !hasRealPolygons ? "bottom-8" : "bottom-10",
            )}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <MapPin className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                {selectedArea ? (
                  <>
                    <p className="text-base font-black leading-tight text-slate-950">{fullAreaName(selectedArea)}</p>
                    <p className="mt-1 text-xs font-semibold text-emerald-800">{t(demandRangeKey(selectedArea.demandRange))}</p>
                  </>
                ) : hasRealPolygons ? (
                  <p className="text-sm font-bold leading-snug text-slate-900">{t("distance.chooseArea")}</p>
                ) : (
                  <>
                    <p className="text-sm font-bold leading-snug text-slate-900">{t("distance.coverageSetupTitle")}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{t("distance.coverageSetupBody")}</p>
                  </>
                )}
              </div>
            </div>
            <div aria-live="polite" className="mt-3 border-t border-slate-900/10 pt-3">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">{t("distance.inspectorStatus")}</p>
              <p className="mt-1 text-sm font-bold leading-snug text-slate-900 break-words">{statusTitle}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 break-words">{statusBody}</p>
            </div>
            {browserLocation && (
              <button type="button" onClick={() => setCustomerFocusRequest((value) => value + 1)} className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-800 hover:text-emerald-950">
                <Crosshair className="h-3.5 w-3.5" />
                {t("distance.recenter")}
              </button>
            )}
            <div className="mt-4">{actionButtons()}</div>
            {serviceCenter && browserLocation && (
              <button type="button" onClick={() => window.open(createDirectionsUrl(serviceCenter, browserLocation), "_blank", "noopener,noreferrer")} className="mt-3 flex h-10 w-full items-center justify-center gap-2 text-xs font-bold text-slate-700 hover:text-emerald-800">
                <ExternalLink className="h-3.5 w-3.5" />
                {t("distance.liveDirections")}
              </button>
            )}
            <p className="mt-3 flex gap-1.5 text-[10px] leading-relaxed text-slate-500">
              <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t("distance.privacy")}
            </p>
          </motion.aside>
          <AnimatePresence>
            {showInteractionHint && hasRealPolygons && (
              <motion.div
                role="status"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="pointer-events-none absolute bottom-6 left-[max(2rem,calc((100%-78rem)/2))] z-20 max-w-[min(360px,calc(100%-24rem))]"
              >
                <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-slate-950/72 py-1.5 pl-3.5 pr-1.5 text-xs font-medium text-white/95 shadow-[0_8px_24px_rgba(15,23,42,0.18)]">
                  <span className="select-none">{t("distance.interactionHint")}</span>
                  <button
                    type="button"
                    aria-label="Dismiss map interaction hint"
                    onClick={() => setShowInteractionHint(false)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
      {areaQuery.isError && <p className="absolute bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800 shadow-sm"><MapPin className="mr-1.5 inline h-3.5 w-3.5" />{t("distance.areaListUnavailable")}</p>}
    </section>
  );
}
