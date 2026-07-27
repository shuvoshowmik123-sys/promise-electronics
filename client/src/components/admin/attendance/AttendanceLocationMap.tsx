import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Feature, Polygon } from "geojson";
import type { Map as MapLibreMap, Marker as MapLibreMarker, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Info, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const STYLE_LOAD_TIMEOUT_MS = 12_000;
/** Compact credit strip duration after mapReady (01D). */
const ATTRIBUTION_INTRO_MS = 5_000;
/** Ignore absurd radii when fitting camera (still draw smaller cap for geometry). */
const FIT_RADIUS_CAP_METERS = 2_000;

const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";
const OPENMAPTILES_URL = "https://openmaptiles.org/";

const GEOFENCE_SOURCE = "att-geofence";
const GEOFENCE_FILL = "att-geofence-fill";
const GEOFENCE_LINE = "att-geofence-line";
const ACCURACY_SOURCE = "att-accuracy";
const ACCURACY_FILL = "att-accuracy-fill";
const ACCURACY_LINE = "att-accuracy-line";
const CONNECTOR_SOURCE = "att-connector";
const CONNECTOR_LINE = "att-connector-line";

export type AttendanceMapPoint = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
};

/** Selected attendance event for employee marker styling. */
export type AttendanceEmployeeEventKind = "checkIn" | "checkOut";

export type AttendanceLocationMapProps = {
  office: AttendanceMapPoint | null;
  employee: AttendanceMapPoint | null;
  employeeEvent?: AttendanceEmployeeEventKind;
  /** Geofence radius metres around office. */
  radiusMeters: number | null;
  className?: string;
  /** Accessible summary when map cannot render. */
  fallbackSummary?: string;
};

function isValidRadius(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function circlePolygon(
  lng: number,
  lat: number,
  radiusMeters: number,
  steps = 64,
): Feature<Polygon> {
  const coords: [number, number][] = [];
  const earth = 6371000;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const d = radiusMeters / earth;
  for (let i = 0; i <= steps; i++) {
    const brng = (i / steps) * 2 * Math.PI;
    const lat2 = Math.asin(
      Math.sin(latRad) * Math.cos(d) + Math.cos(latRad) * Math.sin(d) * Math.cos(brng),
    );
    const lng2 =
      lngRad +
      Math.atan2(
        Math.sin(brng) * Math.sin(d) * Math.cos(latRad),
        Math.cos(d) - Math.sin(latRad) * Math.sin(lat2),
      );
    coords.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}

function makeMarkerEl(kind: "office" | "checkIn" | "checkOut"): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "att-loc-marker";
  const colors =
    kind === "office"
      ? { bg: "#0f766e", ring: "#99f6e4" }
      : kind === "checkIn"
        ? { bg: "#2563eb", ring: "#bfdbfe" }
        : { bg: "#c2410c", ring: "#fed7aa" };
  el.innerHTML = `<div style="
    width:28px;height:28px;border-radius:9999px;
    background:${colors.bg};border:3px solid #fff;
    box-shadow:0 0 0 3px ${colors.ring},0 4px 12px rgba(15,23,42,.25);
  "></div>`;
  el.setAttribute("aria-hidden", "true");
  return el;
}

function collectFitPositions(input: {
  office: AttendanceMapPoint | null;
  employee: AttendanceMapPoint | null;
  radiusMeters: number | null;
}): [number, number][] {
  const positions: [number, number][] = [];
  const { office, employee, radiusMeters } = input;

  if (office) {
    positions.push([office.longitude, office.latitude]);
    if (isValidRadius(radiusMeters)) {
      const r = Math.min(radiusMeters, FIT_RADIUS_CAP_METERS);
      const ring = circlePolygon(office.longitude, office.latitude, r).geometry.coordinates[0];
      for (const c of ring) positions.push([c[0], c[1]]);
    }
  }

  if (employee) {
    positions.push([employee.longitude, employee.latitude]);
    if (isValidRadius(employee.accuracyMeters)) {
      const r = Math.min(employee.accuracyMeters, FIT_RADIUS_CAP_METERS);
      const ring = circlePolygon(employee.longitude, employee.latitude, r).geometry.coordinates[0];
      for (const c of ring) positions.push([c[0], c[1]]);
    }
  }

  return positions;
}

/**
 * Attendance-only MapLibre viewer. No service areas, customers, or AI analytics.
 * Lifecycle: dispose is idempotent; fatal fallback always disposes first.
 */
export function AttendanceLocationMap({
  office,
  employee,
  employeeEvent = "checkIn",
  radiusMeters,
  className,
  fallbackSummary,
}: AttendanceLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const officeMarkerRef = useRef<MapLibreMarker | null>(null);
  const employeeMarkerRef = useRef<MapLibreMarker | null>(null);
  const styleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorHandlerRef = useRef<((e: unknown) => void) | null>(null);
  const loadHandlerRef = useRef<(() => void) | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeRafRef = useRef(0);
  const resizeTimeoutRef = useRef(0);
  const deferredResizeTimeoutsRef = useRef<number[]>([]);
  const resizePendingRef = useRef(false);
  const moveendHandlerRef = useRef<(() => void) | null>(null);
  const interactionCollapseHandlerRef = useRef<(() => void) | null>(null);
  const attributionIntroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creditInfoBtnRef = useRef<HTMLButtonElement | null>(null);
  const creditPopoverRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  const [mapFailed, setMapFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  /** Compact text strip after ready; collapses to info icon. */
  const [creditIntro, setCreditIntro] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const creditsTitleId = useId();

  const clearStyleTimeout = useCallback(() => {
    if (styleTimeoutRef.current != null) {
      clearTimeout(styleTimeoutRef.current);
      styleTimeoutRef.current = null;
    }
  }, []);

  const clearAttributionIntroTimer = useCallback(() => {
    if (attributionIntroTimerRef.current != null) {
      clearTimeout(attributionIntroTimerRef.current);
      attributionIntroTimerRef.current = null;
    }
  }, []);

  const clearResizeWatch = useCallback(() => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    if (resizeRafRef.current) {
      cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = 0;
    }
    if (resizeTimeoutRef.current) {
      window.clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = 0;
    }
    for (const id of deferredResizeTimeoutsRef.current) {
      window.clearTimeout(id);
    }
    deferredResizeTimeoutsRef.current = [];
    resizePendingRef.current = false;
  }, []);

  /** Idempotent disposal — safe to call multiple times. */
  const disposeMap = useCallback(() => {
    clearStyleTimeout();
    clearResizeWatch();
    clearAttributionIntroTimer();
    officeMarkerRef.current?.remove();
    officeMarkerRef.current = null;
    employeeMarkerRef.current?.remove();
    employeeMarkerRef.current = null;

    const map = mapRef.current;
    if (map) {
      try {
        if (errorHandlerRef.current) map.off("error", errorHandlerRef.current);
        if (loadHandlerRef.current) map.off("load", loadHandlerRef.current);
        if (moveendHandlerRef.current) map.off("moveend", moveendHandlerRef.current);
        if (interactionCollapseHandlerRef.current) {
          const h = interactionCollapseHandlerRef.current;
          map.off("dragstart", h);
          map.off("boxzoomstart", h);
          try {
            const canvas = map.getCanvas();
            canvas.removeEventListener("wheel", h);
            canvas.removeEventListener("touchstart", h);
          } catch {
            /* canvas gone */
          }
        }
      } catch {
        /* map may already be torn down */
      }
      try {
        map.remove();
      } catch {
        /* ignore double-remove */
      }
    }
    mapRef.current = null;
    errorHandlerRef.current = null;
    loadHandlerRef.current = null;
    moveendHandlerRef.current = null;
    interactionCollapseHandlerRef.current = null;
    if (mountedRef.current) {
      setMapReady(false);
      setCreditIntro(false);
      setCreditsOpen(false);
    }
  }, [clearStyleTimeout, clearResizeWatch, clearAttributionIntroTimer]);

  const failFatally = useCallback(() => {
    disposeMap();
    if (mountedRef.current) setMapFailed(true);
  }, [disposeMap]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      disposeMap();
    };
  }, [disposeMap]);

  // Mount map once when we have geometry and have not fatally failed.
  useEffect(() => {
    if (mapFailed) return;
    if (!office && !employee) return;
    if (mapRef.current) return;

    let cancelled = false;
    let raf = 0;

    const mount = () => {
      const container = containerRef.current;
      if (cancelled || !mountedRef.current || mapRef.current || !container) return;
      if (container.clientWidth < 2 || container.clientHeight < 2) {
        raf = requestAnimationFrame(mount);
        return;
      }

      void import("maplibre-gl")
        .then(({ default: maplibregl }) => {
          if (cancelled || !mountedRef.current || mapRef.current) return;
          const el = containerRef.current;
          if (!el || el.clientWidth < 2 || el.clientHeight < 2) {
            raf = requestAnimationFrame(mount);
            return;
          }

          try {
            const center: [number, number] = office
              ? [office.longitude, office.latitude]
              : employee
                ? [employee.longitude, employee.latitude]
                : [90.4125, 23.8103];

            const map = new maplibregl.Map({
              container: el,
              style: MAP_STYLE_URL,
              center,
              zoom: 15,
              attributionControl: false,
              scrollZoom: true,
              dragPan: true,
              keyboard: true,
              doubleClickZoom: true,
              dragRotate: false,
              touchPitch: false,
            });
            mapRef.current = map;

            // Dialog/sheet open animates layout. Without resize, WebGL paints a blank canvas
            // while tiles/markers still load (MAP-BLANK from ATTENDANCE-LOCATION-01C).
            const flushResize = () => {
              resizeTimeoutRef.current = 0;
              if (cancelled || !mountedRef.current || mapRef.current !== map) return;
              const container = containerRef.current;
              if (!container || container.clientWidth < 2 || container.clientHeight < 2) return;
              if (map.isMoving()) {
                resizeTimeoutRef.current = window.setTimeout(flushResize, 120);
                return;
              }
              resizePendingRef.current = false;
              try {
                map.resize();
                map.triggerRepaint();
              } catch {
                /* map may be disposed mid-frame */
              }
            };
            const requestResize = () => {
              resizePendingRef.current = true;
              if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
              if (resizeTimeoutRef.current) window.clearTimeout(resizeTimeoutRef.current);
              resizeRafRef.current = requestAnimationFrame(() => {
                resizeTimeoutRef.current = window.setTimeout(flushResize, 80);
              });
            };
            clearResizeWatch();
            const observer = new ResizeObserver(() => requestResize());
            observer.observe(el);
            resizeObserverRef.current = observer;
            // Named handler so dispose can detach (anonymous moveend leaked listeners).
            const onMoveEnd = () => {
              if (resizePendingRef.current) requestResize();
            };
            moveendHandlerRef.current = onMoveEnd;
            map.on("moveend", onMoveEnd);
            // Immediate + deferred resize for Radix dialog / sheet transitions.
            // Track every timeout so dispose cancels them (no post-unmount resize).
            requestResize();
            for (const ms of [0, 200, 450, 800]) {
              const id = window.setTimeout(requestResize, ms);
              deferredResizeTimeoutsRef.current.push(id);
            }

            map.addControl(
              new maplibregl.NavigationControl({ showCompass: false, showZoom: true }),
              "top-right",
            );
            // 01D: no MapLibre AttributionControl — React-owned compact credits (OMT + OSM).
            // attributionControl remains false on Map constructor above.

            const onError = (ev: unknown) => {
              // Post-load tile/source glitches: keep map. Pre-load style/WebGL failures: fatal.
              if (cancelled || !mountedRef.current) return;
              if (map.isStyleLoaded()) return;
              const err = ev as { error?: { status?: number; message?: string }; message?: string };
              const msg = String(err?.error?.message ?? err?.message ?? "");
              // Network tile 404s during style bootstrap can be noisy — only fail if style never loads (timeout).
              if (/Failed to initialize WebGL|webgl/i.test(msg)) {
                failFatally();
              }
            };
            errorHandlerRef.current = onError;
            map.on("error", onError);

            const onLoad = () => {
              if (cancelled || !mountedRef.current) return;
              clearStyleTimeout();
              try {
                // Resize after style so pixel buffer matches sheet/dialog final size.
                // Do not force canvas CSS size — MapLibre owns the buffer.
                map.resize();
                map.triggerRepaint();
                map.once("idle", () => {
                  if (cancelled || !mountedRef.current || mapRef.current !== map) return;
                  try {
                    map.resize();
                    map.triggerRepaint();
                  } catch {
                    /* disposed */
                  }
                });
                if (!map.getSource(GEOFENCE_SOURCE)) {
                  map.addSource(GEOFENCE_SOURCE, {
                    type: "geojson",
                    data: { type: "FeatureCollection", features: [] },
                  });
                  map.addLayer({
                    id: GEOFENCE_FILL,
                    type: "fill",
                    source: GEOFENCE_SOURCE,
                    paint: { "fill-color": "#0d9488", "fill-opacity": 0.12 },
                  });
                  map.addLayer({
                    id: GEOFENCE_LINE,
                    type: "line",
                    source: GEOFENCE_SOURCE,
                    paint: { "line-color": "#0f766e", "line-width": 2, "line-opacity": 0.85 },
                  });
                }
                if (!map.getSource(ACCURACY_SOURCE)) {
                  map.addSource(ACCURACY_SOURCE, {
                    type: "geojson",
                    data: { type: "FeatureCollection", features: [] },
                  });
                  map.addLayer({
                    id: ACCURACY_FILL,
                    type: "fill",
                    source: ACCURACY_SOURCE,
                    paint: { "fill-color": "#3b82f6", "fill-opacity": 0.1 },
                  });
                  map.addLayer({
                    id: ACCURACY_LINE,
                    type: "line",
                    source: ACCURACY_SOURCE,
                    paint: {
                      "line-color": "#2563eb",
                      "line-width": 1.5,
                      "line-dasharray": [2, 2],
                      "line-opacity": 0.8,
                    },
                  });
                }
                if (!map.getSource(CONNECTOR_SOURCE)) {
                  map.addSource(CONNECTOR_SOURCE, {
                    type: "geojson",
                    data: { type: "FeatureCollection", features: [] },
                  });
                  map.addLayer({
                    id: CONNECTOR_LINE,
                    type: "line",
                    source: CONNECTOR_SOURCE,
                    paint: {
                      "line-color": "#64748b",
                      "line-width": 2,
                      "line-opacity": 0.7,
                      "line-dasharray": [1.5, 1.5],
                    },
                  });
                }
                if (mountedRef.current) setMapReady(true);
                requestResize();
              } catch {
                failFatally();
              }
            };
            loadHandlerRef.current = onLoad;
            map.once("load", onLoad);

            clearStyleTimeout();
            styleTimeoutRef.current = setTimeout(() => {
              if (cancelled || !mountedRef.current) return;
              if (!map.isStyleLoaded()) {
                failFatally();
              }
            }, STYLE_LOAD_TIMEOUT_MS);
          } catch {
            failFatally();
          }
        })
        .catch(() => {
          if (!cancelled && mountedRef.current) failFatally();
        });
    };

    raf = requestAnimationFrame(mount);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      // Dispose only if this effect is tearing down the active map lifecycle.
      // Do not set mapFailed here (unmount / remount without geometry).
      disposeMap();
    };
    // Intentionally mount once per failed/reset cycle when geometry exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- office/employee presence only for initial center
  }, [mapFailed, Boolean(office || employee), disposeMap, failFatally, clearStyleTimeout]);

  // Sync sources, markers, camera when data changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || mapFailed) return;
    let cancelled = false;

    void import("maplibre-gl")
      .then(({ default: maplibregl }) => {
        if (cancelled || !mountedRef.current || mapRef.current !== map) return;

        const geofenceSrc = map.getSource(GEOFENCE_SOURCE) as GeoJSONSource | undefined;
        if (geofenceSrc) {
          if (office && isValidRadius(radiusMeters)) {
            geofenceSrc.setData({
              type: "FeatureCollection",
              features: [circlePolygon(office.longitude, office.latitude, radiusMeters)],
            });
          } else {
            geofenceSrc.setData({ type: "FeatureCollection", features: [] });
          }
        }

        const accSrc = map.getSource(ACCURACY_SOURCE) as GeoJSONSource | undefined;
        if (accSrc) {
          if (employee && isValidRadius(employee.accuracyMeters)) {
            accSrc.setData({
              type: "FeatureCollection",
              features: [
                circlePolygon(employee.longitude, employee.latitude, employee.accuracyMeters),
              ],
            });
          } else {
            accSrc.setData({ type: "FeatureCollection", features: [] });
          }
        }

        const connSrc = map.getSource(CONNECTOR_SOURCE) as GeoJSONSource | undefined;
        if (connSrc) {
          if (office && employee) {
            connSrc.setData({
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: {},
                  geometry: {
                    type: "LineString",
                    coordinates: [
                      [office.longitude, office.latitude],
                      [employee.longitude, employee.latitude],
                    ],
                  },
                },
              ],
            });
          } else {
            connSrc.setData({ type: "FeatureCollection", features: [] });
          }
        }

        officeMarkerRef.current?.remove();
        officeMarkerRef.current = null;
        if (office) {
          officeMarkerRef.current = new maplibregl.Marker({ element: makeMarkerEl("office") })
            .setLngLat([office.longitude, office.latitude])
            .addTo(map);
        }

        employeeMarkerRef.current?.remove();
        employeeMarkerRef.current = null;
        if (employee) {
          const kind: "checkIn" | "checkOut" =
            employeeEvent === "checkOut" ? "checkOut" : "checkIn";
          employeeMarkerRef.current = new maplibregl.Marker({
            element: makeMarkerEl(kind),
          })
            .setLngLat([employee.longitude, employee.latitude])
            .addTo(map);
        }

        try {
          map.resize();
        } catch {
          /* ignore */
        }

        const positions = collectFitPositions({ office, employee, radiusMeters });
        if (positions.length === 0) return;

        if (positions.length === 1) {
          map.easeTo({ center: positions[0], zoom: 16, duration: 400 });
          return;
        }

        const lngs = positions.map((p) => p[0]);
        const lats = positions.map((p) => p[1]);
        map.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          { padding: 56, maxZoom: 17, duration: 450 },
        );
      })
      .catch(() => {
        /* marker refresh import failure is nonfatal if map already loaded */
      });

    return () => {
      cancelled = true;
    };
  }, [office, employee, employeeEvent, radiusMeters, mapReady, mapFailed]);

  // 01D — compact attribution intro after mapReady only.
  useEffect(() => {
    if (!mapReady || mapFailed) {
      clearAttributionIntroTimer();
      setCreditIntro(false);
      setCreditsOpen(false);
      return;
    }
    setCreditIntro(true);
    setCreditsOpen(false);
    clearAttributionIntroTimer();
    attributionIntroTimerRef.current = setTimeout(() => {
      attributionIntroTimerRef.current = null;
      if (mountedRef.current) setCreditIntro(false);
    }, ATTRIBUTION_INTRO_MS);
    return () => {
      clearAttributionIntroTimer();
    };
  }, [mapReady, mapFailed, clearAttributionIntroTimer]);

  // Collapse intro on first *user* pan/zoom only — not programmatic fitBounds/easeTo.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || mapFailed) return;
    const collapse = () => {
      clearAttributionIntroTimer();
      if (mountedRef.current) setCreditIntro(false);
    };
    interactionCollapseHandlerRef.current = collapse;
    const canvas = map.getCanvas();
    map.on("dragstart", collapse);
    map.on("boxzoomstart", collapse);
    canvas.addEventListener("wheel", collapse, { passive: true });
    canvas.addEventListener("touchstart", collapse, { passive: true });
    return () => {
      try {
        map.off("dragstart", collapse);
        map.off("boxzoomstart", collapse);
        canvas.removeEventListener("wheel", collapse);
        canvas.removeEventListener("touchstart", collapse);
      } catch {
        /* disposed */
      }
      if (interactionCollapseHandlerRef.current === collapse) {
        interactionCollapseHandlerRef.current = null;
      }
    };
  }, [mapReady, mapFailed, clearAttributionIntroTimer]);

  // Credits popover: Escape + outside click; restore focus to info button.
  useEffect(() => {
    if (!creditsOpen) return;
    const restoreInfoFocus = () => {
      // Parent dialog may also listen for Escape; restore after React commit.
      window.setTimeout(() => creditInfoBtnRef.current?.focus(), 50);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setCreditsOpen(false);
        restoreInfoFocus();
      }
    };
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (creditPopoverRef.current?.contains(t)) return;
      if (creditInfoBtnRef.current?.contains(t)) return;
      setCreditsOpen(false);
      restoreInfoFocus();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onPointer, true);
    document.addEventListener("touchstart", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onPointer, true);
      document.removeEventListener("touchstart", onPointer, true);
    };
  }, [creditsOpen]);

  if (mapFailed) {
    return (
      <div
        className={cn(
          "flex h-full min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-center",
          className,
        )}
        role="status"
      >
        <MapPin className="h-6 w-6 text-slate-400" />
        <p className="text-sm font-bold text-slate-700">Map could not load</p>
        <p className="text-xs text-slate-500 max-w-sm">
          {fallbackSummary ||
            "Map rendering failed. Status and distance details remain available above."}
        </p>
      </div>
    );
  }

  if (!office && !employee) {
    return (
      <div
        className={cn(
          "flex h-full min-h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 text-center",
          className,
        )}
      >
        <MapPin className="h-6 w-6 text-slate-300" />
        <p className="text-sm font-bold text-slate-600">No map positions available</p>
        <p className="text-xs text-slate-500">{fallbackSummary}</p>
      </div>
    );
  }

  const staffLegend =
    employeeEvent === "checkOut" ? "Check-out" : "Check-in";
  const staffLegendTone =
    employeeEvent === "checkOut"
      ? "text-orange-900 ring-orange-100"
      : "text-blue-800 ring-blue-100";

  return (
    <div
      className={cn(
        "relative h-full min-h-[220px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100",
        className,
      )}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 h-full w-full [&_.maplibregl-map]:h-full [&_.maplibregl-map]:w-full"
        aria-label="Attendance location map"
      />
      {!mapReady && (
        <div className="pointer-events-none absolute inset-0 z-[1] animate-pulse bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200" />
      )}
      <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex flex-wrap gap-1.5">
        <span className="rounded-md bg-white/90 px-1.5 py-0.5 text-[9px] font-bold text-teal-800 shadow-sm ring-1 ring-teal-100">
          Office
        </span>
        <span
          className={cn(
            "rounded-md bg-white/90 px-1.5 py-0.5 text-[9px] font-bold shadow-sm ring-1",
            staffLegendTone,
          )}
        >
          {staffLegend}
        </span>
      </div>

      {/* 01D — React-owned map credits (OMT + OSM). No OpenFreeMap branding. Hidden on mapFailed. */}
      {mapReady && (
        <div className="absolute bottom-2 right-2 z-20 flex max-w-[min(100%,14rem)] flex-col items-end gap-1">
          {creditIntro ? (
            <p
              className="pointer-events-none rounded bg-white/85 px-1.5 py-0.5 text-[9px] font-medium leading-snug text-slate-600"
              aria-live="polite"
            >
              © OpenMapTiles · © OpenStreetMap contributors
            </p>
          ) : (
            <div className="relative">
              <button
                ref={creditInfoBtnRef}
                type="button"
                aria-label="Map data credits"
                aria-expanded={creditsOpen}
                aria-controls={creditsOpen ? creditsTitleId : undefined}
                onClick={() => setCreditsOpen((o) => !o)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-600 ring-1 ring-slate-200/80 transition-colors hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              >
                <Info className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              </button>
              {creditsOpen && (
                <div
                  ref={creditPopoverRef}
                  id={creditsTitleId}
                  role="dialog"
                  aria-label="Map data credits"
                  className="absolute bottom-9 right-0 w-[min(16rem,calc(100vw-2rem))] rounded-lg bg-white/95 p-2.5 text-left shadow-md ring-1 ring-slate-200/90"
                >
                  <ul className="space-y-1.5 text-[11px] leading-snug text-slate-700">
                    <li>
                      <a
                        href={OPENMAPTILES_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-teal-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded-sm"
                      >
                        Map tiles and design © OpenMapTiles
                      </a>
                    </li>
                    <li>
                      <a
                        href={OSM_COPYRIGHT_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-teal-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded-sm"
                      >
                        Map data © OpenStreetMap contributors
                      </a>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
