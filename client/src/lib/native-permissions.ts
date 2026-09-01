/**
 * Makes the browser APIs the admin panel already uses work inside the app.
 *
 * The staff app is the real admin panel running in a WebView, so its code asks
 * for things the browser way — navigator.geolocation for the GPS check-in and
 * the pickup map, getUserMedia for the QR scanner. In a browser the page asks
 * and the user answers. In a WebView there is a second gate: Android must have
 * granted the app itself the permission first, and if it has not, the request
 * is refused with no prompt and no error worth reading.
 *
 * That is why the app "never asked for anything". Nothing was broken in the
 * page; the app had never been given the permission to pass on.
 *
 * Two things are needed and both live here:
 *
 * 1. The permission is declared in AndroidManifest.xml — without that, asking
 *    is refused instantly and silently.
 * 2. The native permission is requested at the moment the feature is used,
 *    which is what Android expects and what puts the dialog in front of someone
 *    who understands why it appeared.
 *
 * Nothing is asked on launch. A permission sheet before anyone has seen the app
 * is the one most reliably denied.
 */

import { Capacitor } from "@capacitor/core";
import { Geolocation, type Position } from "@capacitor/geolocation";

/**
 * Route navigator.geolocation through the native plugin.
 *
 * A shim rather than a rewrite of the five call sites. They are ordinary web
 * code that works correctly in a browser, and they should keep working there;
 * making each one branch on the platform would be five chances to get it wrong
 * and five places to update.
 *
 * The plugin is what actually raises Android's location dialog. Left alone, the
 * WebView's own geolocation request is refused because the app holds no
 * location permission, and the caller sees a generic PERMISSION_DENIED it can
 * do nothing about.
 */
function installGeolocationShim(): void {
    if (!Capacitor.isNativePlatform()) return;
    if (!("geolocation" in navigator)) return;

    /**
     * The plugin's Position, in the shape web callers already handle.
     *
     * Not interchangeable types: the plugin marks altitude and the rest
     * optional where the browser marks them nullable, so the fields are copied
     * across with a null for anything absent rather than passed through.
     */
    const toBrowserPosition = (p: Position): GeolocationPosition => ({
        coords: {
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            accuracy: p.coords.accuracy,
            altitude: p.coords.altitude ?? null,
            altitudeAccuracy: p.coords.altitudeAccuracy ?? null,
            heading: p.coords.heading ?? null,
            speed: p.coords.speed ?? null,
            toJSON() { return this; },
        },
        timestamp: p.timestamp,
        toJSON() { return this; },
    }) as GeolocationPosition;

    /** The shape callers already handle: a GeolocationPositionError-like object. */
    const toBrowserError = (err: unknown): GeolocationPositionError => {
        const message = (err as Error)?.message ?? "Location unavailable";
        /**
         * Location switched off is not permission refused.
         *
         * They arrive here as plain sentences from the plugin and the callers
         * branch on the code alone, so mapping "location disabled" onto
         * PERMISSION_DENIED tells someone to grant a permission they have
         * already granted. It is POSITION_UNAVAILABLE: the app may ask, the
         * phone simply has no fix to give until location is turned on.
         */
        const servicesOff = /disabled|location services|not enabled|turned off/i.test(message);
        const denied = !servicesOff && /denied|permission/i.test(message);
        return {
            code: denied ? 1 : 2, // PERMISSION_DENIED : POSITION_UNAVAILABLE
            message,
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
        } as GeolocationPositionError;
    };

    /**
     * Whether we may read a position at all, and how precisely.
     *
     * Android 12 and up splits the location dialog in two: Precise and
     * Approximate. Tapping Approximate grants ACCESS_COARSE_LOCATION and
     * leaves ACCESS_FINE_LOCATION refused, so the plugin reports
     * `location: "denied"` with `coarseLocation: "granted"` — a grant that
     * reads as a refusal to anything checking only the first field.
     *
     * This is what blocked staff from checking in. They allowed location, the
     * app decided they had not, and the message told them to grant a
     * permission they had already given — with no way forward, because Android
     * does not ask twice.
     *
     * Approximate is good enough for what it is used for here. The attendance
     * geofence is accuracy-aware and subtracts the reported accuracy before
     * judging, so a coarse fix comes out as "uncertain" and never as a
     * confident "outside the office" — nobody is wrongly recorded off-site by
     * being taken at their word.
     */
    const ensureLocationAccess = async (): Promise<"fine" | "coarse" | null> => {
        const read = (s: { location: string; coarseLocation: string }) =>
            s.location === "granted" ? "fine" as const
            : s.coarseLocation === "granted" ? "coarse" as const
            : null;

        const current = read(await Geolocation.checkPermissions());
        if (current) return current;

        // checkPermissions never prompts, so this is the only thing that can.
        return read(await Geolocation.requestPermissions());
    };

    const getCurrentPosition: typeof navigator.geolocation.getCurrentPosition =
        (success, error, options) => {
            (async () => {
                try {
                    const access = await ensureLocationAccess();
                    if (!access) {
                        error?.(toBrowserError(new Error("Location permission denied")));
                        return;
                    }
                    const pos = await Geolocation.getCurrentPosition({
                        /**
                         * Asking for high accuracy on a coarse-only grant is
                         * asking for something Android has been told not to
                         * give, and it answers with a failure rather than the
                         * approximate fix it does have.
                         */
                        enableHighAccuracy: access === "fine" ? (options?.enableHighAccuracy ?? true) : false,
                        timeout: options?.timeout ?? 15000,
                        maximumAge: options?.maximumAge ?? 0,
                    });
                    success(toBrowserPosition(pos));
                } catch (err) {
                    error?.(toBrowserError(err));
                }
            })();
        };

    /** Browser watch ids are numbers; the plugin's are strings. This maps one to the other. */
    const watchHandles = new Map<number, () => void>();

    const watchPosition: typeof navigator.geolocation.watchPosition = (success, error, options) => {
        let cleared = false;
        let nativeId: string | null = null;

        (async () => {
            try {
                const access = await ensureLocationAccess();
                if (!access) {
                    error?.(toBrowserError(new Error("Location permission denied")));
                    return;
                }
                const id = await Geolocation.watchPosition(
                    {
                        enableHighAccuracy: access === "fine" ? (options?.enableHighAccuracy ?? true) : false,
                        timeout: options?.timeout ?? 15000,
                    },
                    (pos, err) => {
                        if (cleared) return;
                        if (err || !pos) { error?.(toBrowserError(err)); return; }
                        success(toBrowserPosition(pos));
                    },
                );
                // clearWatch may have run while the permission dialog was open.
                if (cleared) { Geolocation.clearWatch({ id }).catch(() => {}); return; }
                nativeId = id;
            } catch (err) {
                error?.(toBrowserError(err));
            }
        })();

        // Callers expect a number, so hand back a handle they can pass to
        // clearWatch and keep the real id beside it.
        const handle = Math.floor(Math.random() * 1_000_000);
        watchHandles.set(handle, () => {
            cleared = true;
            if (nativeId) Geolocation.clearWatch({ id: nativeId }).catch(() => {});
        });
        return handle;
    };

    const clearWatch: typeof navigator.geolocation.clearWatch = (id) => {
        const stop = watchHandles.get(id);
        if (stop) { stop(); watchHandles.delete(id); }
    };

    Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: { getCurrentPosition, watchPosition, clearWatch },
    });
}

/**
 * Ask for the camera before something calls getUserMedia.
 *
 * The QR scanner opens a camera stream the browser way. Inside the app that is
 * refused unless Android has already granted CAMERA to the app, and the refusal
 * arrives as a NotAllowedError that reads like the user declined — when in fact
 * nobody was ever asked.
 *
 * Returns true on the web without doing anything: there the browser's own
 * prompt is the right one and appears when the stream is requested.
 */
export async function ensureCameraPermission(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return true;
    try {
        const { Camera } = await import("@capacitor/camera");
        const status = await Camera.checkPermissions();
        if (status.camera === "granted") return true;
        const asked = await Camera.requestPermissions({ permissions: ["camera"] });
        return asked.camera === "granted";
    } catch (err) {
        console.warn("[Permissions] camera request failed:", (err as Error)?.message || err);
        return false;
    }
}

/** Called once at startup. Installs shims only; asks for nothing. */
export function installNativePermissionBridges(): void {
    try {
        installGeolocationShim();
    } catch (err) {
        console.warn("[Permissions] geolocation shim failed:", (err as Error)?.message || err);
    }
}
