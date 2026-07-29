/**
 * PICKUP-MAP-PIN-01 — customer pickup location picker.
 *
 * Fixed centre crosshair with the map moving underneath, rather than a draggable
 * marker: on a phone a dragged marker sits under the user's thumb exactly when
 * they need to see it, and "pan the map" is the interaction people already know
 * from ride-hailing apps.
 *
 * Reverse geocoding fires only on `moveend` (never during the gesture) and is
 * debounced, because all Nominatim traffic shares one ~1 req/sec server gate.
 *
 * maplibre-gl is imported dynamically so its ~1MB never touches first paint.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { Crosshair, Loader2, LocateFixed, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { fetchApi } from "@/lib/api/httpClient";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";
import { toast } from "sonner";

const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const DHAKA: [number, number] = [90.4125, 23.8103];
/** Long enough that a pan-and-adjust gesture makes one request, not five. */
const REVERSE_DEBOUNCE_MS = 700;

export interface PickedPickupLocation {
  latitude: number;
  longitude: number;
  address: string | null;
  source: "map_pin" | "gps";
}

interface PickupLocationPickerProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (location: PickedPickupLocation) => void;
  initialLatitude?: number | null;
  initialLongitude?: number | null;
}

export function PickupLocationPicker({
  open,
  onClose,
  onConfirm,
  initialLatitude,
  initialLongitude,
}: PickupLocationPickerProps) {
  const { t } = useCustomerLanguage();
  // Full-screen picker: lock the page behind so panning the map (or any drag
  // that starts on it) can never scroll the wizard underneath.
  useBodyScrollLock(open);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseSeqRef = useRef(0);
  /**
   * Last coordinate a lookup was scheduled for. MapLibre fires 'moveend'
   * repeatedly with an UNCHANGED center while a vector style's tiles/glyphs are
   * still loading — confirmed by direct console instrumentation: ~5 identical
   * 'moveend' events for the same coordinate with zero user interaction,
   * consuming the shared Nominatim rate-limit budget before the customer even
   * touches the map. This guard skips scheduling when the position hasn't
   * actually moved; real panning always produces a different coordinate.
   */
  const lastRequestedCenterRef = useRef<[number, number] | null>(null);

  const [center, setCenter] = useState<[number, number]>(
    initialLatitude != null && initialLongitude != null
      ? [initialLongitude, initialLatitude]
      : DHAKA,
  );
  const [address, setAddress] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [source, setSource] = useState<"map_pin" | "gps">("map_pin");

  const runReverseGeocode = useCallback(async (lng: number, lat: number) => {
    const seq = ++reverseSeqRef.current;
    setIsLookingUp(true);
    try {
      // Must go through fetchApi(), not a raw fetch(): fetchApi is the only
      // helper that prepends /api. A raw fetch to "/public/..." missed the
      // prefix, fell through to the SPA catch-all, and got back index.html as
      // a 200 — silently and permanently failing every lookup. Caught by
      // checking the actual browser network log during manual QA, not by tsc
      // or the test suite, since the request "succeeded" from fetch's view.
      const data = await fetchApi<{ address: string | null }>(
        `/public/reverse-geocode?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`,
      );
      if (seq !== reverseSeqRef.current) return; // a later pan already superseded this lookup
      setAddress(typeof data.address === "string" ? data.address : null);
    } catch {
      if (seq === reverseSeqRef.current) setAddress(null);
    } finally {
      if (seq === reverseSeqRef.current) setIsLookingUp(false);
    }
  }, []);

  const scheduleReverseGeocode = useCallback(
    (lng: number, lat: number) => {
      const last = lastRequestedCenterRef.current;
      // ~0.00001deg ≈ 1m — MapLibre's internal settle events repeat the exact
      // same float, but comparing with a small tolerance (rather than ===)
      // stays correct if it ever repeats a value after floating-point rounding.
      if (last && Math.abs(last[0] - lng) < 1e-5 && Math.abs(last[1] - lat) < 1e-5) {
        return;
      }
      lastRequestedCenterRef.current = [lng, lat];
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void runReverseGeocode(lng, lat), REVERSE_DEBOUNCE_MS);
    },
    [runReverseGeocode],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let map: MapLibreMap | null = null;
    // Fresh open — a repeat open at the same coordinate must still seed a lookup.
    lastRequestedCenterRef.current = null;

    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled || !containerRef.current) return;
      map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLE_URL,
        center,
        zoom: initialLatitude != null ? 16 : 12,
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

      map.on("load", () => {
        if (!cancelled) setMapReady(true);
      });
      map.on("moveend", () => {
        if (cancelled || !map) return;
        const c = map.getCenter();
        setCenter([c.lng, c.lat]);
        setSource("map_pin");
        scheduleReverseGeocode(c.lng, c.lat);
      });

      // Seed the address for the starting position.
      scheduleReverseGeocode(center[0], center[1]);
    });

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (map) map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // Re-initialising on every centre change would fight the user's panning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error(t("pickupPin.gpsUnavailable"));
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const { latitude, longitude } = position.coords;
        setSource("gps");
        mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 17 });
        // flyTo triggers moveend, which resets source to map_pin; set it after.
        setTimeout(() => setSource("gps"), 0);
      },
      () => {
        setIsLocating(false);
        toast.error(t("pickupPin.gpsDenied"));
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, [t]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-emerald-600" />
          <h2 className="text-base font-bold text-slate-900">{t("pickupPin.title")}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("pickupPin.close")}
          className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex-1">
        <div ref={containerRef} className="absolute inset-0" />

        {/* Fixed centre crosshair — the pin never moves, the map does. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="-translate-y-3">
            <MapPin className="h-10 w-10 text-emerald-600 drop-shadow-lg" strokeWidth={2.5} />
          </div>
        </div>

        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          </div>
        )}

        <Button
          type="button"
          variant="secondary"
          onClick={useMyLocation}
          disabled={isLocating}
          className="absolute left-3 top-3 gap-2 rounded-full bg-white shadow-md"
        >
          {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
          {t("pickupPin.useMyLocation")}
        </Button>
      </div>

      <div className="space-y-3 border-t border-slate-200 p-4">
        <div className="flex items-start gap-2 rounded-2xl bg-slate-50 p-3">
          <Crosshair className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("pickupPin.selectedLocation")}
            </p>
            {isLookingUp ? (
              <p className="mt-0.5 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" /> {t("pickupPin.findingAddress")}
              </p>
            ) : (
              <p className="mt-0.5 break-words text-sm font-medium text-slate-900">
                {address || t("pickupPin.noAddressFound")}
              </p>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-500">{t("pickupPin.editHint")}</p>

        <Button
          type="button"
          className="h-12 w-full rounded-2xl text-base font-bold"
          onClick={() =>
            onConfirm({
              latitude: center[1],
              longitude: center[0],
              address,
              source,
            })
          }
        >
          {t("pickupPin.confirm")}
        </Button>
      </div>
    </div>
  );
}
