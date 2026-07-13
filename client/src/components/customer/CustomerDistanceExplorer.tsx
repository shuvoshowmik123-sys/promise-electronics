import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, MultiPolygon, Point, Polygon } from "geojson";
import {
  ArrowRight,
  CarFront,
  ChevronUp,
  Crosshair,
  ExternalLink,
  Loader2,
  LockKeyhole,
  MapPin,
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
import { MobileBottomSheetFrame, MobileBottomSheetHandle } from "@/components/ui/mobile-bottom-sheet";
import { Button } from "@/components/ui/button";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";
import { publicAreaMapApi, type MapPlaceSuggestion, type RouteEstimateResponse, type ServiceAreaMapItem } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ServiceCenterLocation {
  latitude: number;
  longitude: number;
  placeId?: string;
  address?: string;
}

interface CustomerDistanceExplorerProps {
  serviceCenter: ServiceCenterLocation | null;
  compact?: boolean;
}

interface BrowserLocation {
  latitude: number;
  longitude: number;
}

type LocationState = "idle" | "locating" | "routing" | "ready" | "route_unavailable" | "denied" | "error";

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

export default function CustomerDistanceExplorer({ serviceCenter }: CustomerDistanceExplorerProps) {
  const { t } = useCustomerLanguage();
  const [, setLocation] = useLocation();
  const sectionRef = useRef<HTMLElement>(null);
  const hasSetInitialCamera = useRef(false);
  const isMobile = useCustomerMapMobileMode();
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [locationState, setLocationState] = useState<LocationState>("idle");
  const [browserLocation, setBrowserLocation] = useState<BrowserLocation | null>(null);
  const [route, setRoute] = useState<RouteEstimateResponse | null>(null);
  const [selectedArea, setSelectedArea] = useState<ServiceAreaMapItem | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  /** After Enter (or idle search), show explicit “can’t find place” without moving the map. */
  const [searchCommittedEmpty, setSearchCommittedEmpty] = useState(false);
  const [customerFocusRequest, setCustomerFocusRequest] = useState(0);
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const [customerCamera, setCustomerCamera] = useState<CustomerImmersiveCameraApi | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showInteractionHint, setShowInteractionHint] = useState(false);

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
  const isCheckingLocation = locationState === "locating" || locationState === "routing";

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

  const routeFromLocation = async (temporaryLocation: BrowserLocation) => {
    setBrowserLocation(temporaryLocation);
    setCustomerFocusRequest((value) => value + 1);
    setSelectedArea(matchingArea(temporaryLocation, areas));
    setRoute(null);
    setLocationState("routing");
    try {
      const estimate = await publicAreaMapApi.estimateRoute(temporaryLocation);
      setRoute(estimate);
      setLocationState("ready");
    } catch {
      if (serviceCenter?.latitude != null && serviceCenter?.longitude != null) {
        setRoute(clientStraightLineFallback(temporaryLocation, {
          latitude: serviceCenter.latitude,
          longitude: serviceCenter.longitude,
        }));
      } else {
        setRoute(null);
      }
      setLocationState("route_unavailable");
    }
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationState("error");
      return;
    }
    setLocationState("locating");
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const temporaryLocation = { latitude: coords.latitude, longitude: coords.longitude };
      await routeFromLocation(temporaryLocation);
    }, (error) => {
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
    void routeFromLocation({ latitude: place.latitude, longitude: place.longitude });
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
      : locationState === "locating"
        ? t("distance.locating")
        : locationState === "route_unavailable"
          ? t("distance.locationFound")
          : t("distance.permissionTitle");
  const statusBody = route && distanceLabel
    ? (() => {
      const routeNote = route.method === "straight_line_fallback"
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
      : locationState === "denied"
        ? t("distance.denied")
        : locationState === "error"
          ? t("distance.error")
          : locationState === "route_unavailable"
            ? t("distance.routeUnavailable")
            : t("distance.permissionBody");

  const map = (
    <AreaMapCanvas
      areas={areas}
      selectedAreaId={selectedArea?.id}
      onSelectArea={chooseArea}
      serviceCenter={serviceCenter}
      customerLocation={browserLocation}
      customerFocusRequest={customerFocusRequest}
      routeGeometry={locationState === "routing" ? null : (route?.geometry ?? null)}
      routeMethod={locationState === "routing" ? null : (route?.method ?? null)}
      threeDimensional={!isMobile}
      presentation="customerImmersive"
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

  const actionButtons = (mobile = false) => (
    <div className={cn("grid gap-2", mobile ? "grid-cols-2" : "grid-cols-1")}>
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
        <div className="relative h-[72dvh] min-h-[510px] max-h-[720px] overflow-hidden">
          {isNearViewport ? map : <div className="absolute inset-0 flex items-center justify-center bg-slate-100"><Loader2 className="h-6 w-6 animate-spin text-emerald-700" /></div>}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-[#f7fbf9]/86 via-[#f7fbf9]/22 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-40 bg-gradient-to-t from-[#f7fbf9] via-[#f7fbf9]/34 to-transparent" />
          {searchControl}
          {mapControls}
          <div className="absolute inset-x-4 bottom-4 z-30">
            <button type="button" onClick={() => setSheetOpen(true)} className="flex min-h-14 w-full items-center justify-between rounded-2xl border border-white/70 bg-slate-950/86 px-4 text-left text-white shadow-[0_18px_40px_rgba(15,23,42,0.26)] backdrop-blur-xl">
              <span className="min-w-0"><span className="block truncate text-sm font-bold">{selectedArea ? fullAreaName(selectedArea) : t("distance.chooseArea")}</span><span className="mt-0.5 block text-xs text-emerald-200">{selectedArea ? t(demandRangeKey(selectedArea.demandRange)) : t("distance.eyebrow")}</span></span>
              <ChevronUp className="ml-3 h-5 w-5 shrink-0 text-emerald-300" />
            </button>
          </div>
          <AnimatePresence>
            {sheetOpen && (
              <>
                <motion.button type="button" aria-label="Close area details" className="absolute inset-0 z-40 bg-slate-950/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSheetOpen(false)} />
                <MobileBottomSheetFrame onClose={() => setSheetOpen(false)} className="absolute inset-x-0 bottom-0 z-50 max-h-[78%] rounded-t-[28px] bg-white shadow-[0_-18px_50px_rgba(15,23,42,0.22)]">
                  <MobileBottomSheetHandle />
                  <div className="max-h-[calc(78dvh-3rem)] overflow-y-auto px-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">{t("distance.eyebrow")}</p>
                    <h2 className="mt-2 text-2xl font-black tracking-normal text-slate-950">{selectedArea ? fullAreaName(selectedArea) : t("distance.title")}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">{selectedArea ? t(demandRangeKey(selectedArea.demandRange)) : t("distance.subtitle")}</p>
                    <div aria-live="polite" className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                      <div className="flex gap-3"><Navigation className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><div className="min-w-0"><p className="text-sm font-bold leading-snug text-emerald-950 break-words">{statusTitle}</p><p className="mt-1 text-xs leading-relaxed text-emerald-800 break-words">{statusBody}</p></div></div>
                    </div>
                    <Button type="button" onClick={requestLocation} disabled={isCheckingLocation} className="mt-4 h-12 w-full rounded-xl bg-emerald-700 font-bold text-white hover:bg-emerald-800">
                      {isCheckingLocation ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crosshair className="mr-2 h-4 w-4" />}
                      {locationState === "ready" || locationState === "route_unavailable" ? t("distance.checkAgain") : t("distance.useLocation")}
                    </Button>
                    {browserLocation && <Button type="button" variant="outline" onClick={() => setCustomerFocusRequest((value) => value + 1)} className="mt-2 h-11 w-full rounded-xl"><Crosshair className="mr-2 h-4 w-4 text-emerald-700" />{t("distance.recenter")}</Button>}
                    <div className="mt-4">{actionButtons(true)}</div>
                    {serviceCenter && browserLocation && <button type="button" onClick={() => window.open(createDirectionsUrl(serviceCenter, browserLocation), "_blank", "noopener,noreferrer")} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700"><ExternalLink className="h-4 w-4 text-emerald-700" />{t("distance.liveDirections")}</button>}
                    <p className="mt-4 flex gap-2 text-[11px] leading-relaxed text-slate-400"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t("distance.privacy")}</p>
                  </div>
                </MobileBottomSheetFrame>
              </>
            )}
          </AnimatePresence>
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
                {locationState === "ready" || locationState === "route_unavailable" ? t("distance.checkAgain") : t("distance.useLocation")}
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
