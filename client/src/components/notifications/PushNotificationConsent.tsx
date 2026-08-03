import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, BellOff, BellRing, Info, Loader2, ShieldAlert } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  getNotificationPermission,
  isWebPushConfigured,
  subscribeToPush,
  type PushPortal,
} from "@/lib/web-push";
import {
  detectBrowserFamily,
  isIosUserAgent,
  isStandaloneMode,
  resolvePushConsentUiState,
  type BrowserFamily,
  type PushConsentUiState,
} from "@/lib/push-consent-state";

export type PushConsentPortal = PushPortal;

export interface PushNotificationConsentProps {
  /** Portal-specific benefit line (already translated by caller when needed). */
  benefit: string;
  /** Explicit portal for register endpoint selection (never inferred from URL). */
  portal: PushPortal;
  /**
   * Optional label resolver for customer i18n. When omitted, English fallbacks
   * are used (admin / corporate). Accepts the typed customer `t` helper.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t?: (key: any) => string;
  className?: string;
  /** Compact card chrome for dense admin lists. */
  density?: "comfortable" | "compact";
}

const OPT_OUT_KEY = "pushConsentUserOptOut";

function readOptOut(): boolean {
  try {
    return sessionStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

function writeOptOut(value: boolean) {
  try {
    if (value) sessionStorage.setItem(OPT_OUT_KEY, "1");
    else sessionStorage.removeItem(OPT_OUT_KEY);
  } catch {
    /* ignore */
  }
}

function recoveryCopy(family: BrowserFamily, t?: (key: string) => string): { title: string; body: string } {
  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);
  if (family === "firefox") {
    return {
      title: tr("push.blockedTitle", "Notifications are blocked for this site"),
      body: tr(
        "push.blockedFirefox",
        "To turn them on: open the permissions icon in the address bar, find Notifications, and choose Allow. Then reload this page.",
      ),
    };
  }
  if (family === "safari") {
    return {
      title: tr("push.blockedTitle", "Notifications are blocked for this site"),
      body: tr(
        "push.blockedSafari",
        "To turn them on: open Safari Settings → Websites → Notifications, find this site, and choose Allow. Then reload this page.",
      ),
    };
  }
  if (family === "edge" || family === "chrome") {
    return {
      title: tr("push.blockedTitle", "Notifications are blocked for this site"),
      body: tr(
        "push.blockedChrome",
        "To turn them on: click the lock icon in your address bar, find Notifications, and choose Allow. Then reload this page.",
      ),
    };
  }
  return {
    title: tr("push.blockedTitle", "Notifications are blocked for this site"),
    body: tr(
      "push.blockedGeneric",
      "To turn them on: open this site’s permissions in your browser settings, set Notifications to Allow, then reload this page.",
    ),
  };
}

function statusLabel(state: PushConsentUiState, optedOut: boolean, t?: (key: string) => string): string {
  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);
  if (state === "granted" && !optedOut) return tr("push.statusOn", "Notifications: On");
  if (state === "granted" && optedOut) return tr("push.statusOff", "Notifications: Off");
  if (state === "default") return tr("push.statusOff", "Notifications: Off");
  if (state === "denied") return tr("push.statusBlocked", "Notifications: Blocked in browser");
  if (state === "unsupported") return tr("push.statusUnsupported", "Notifications: Not supported on this device");
  if (state === "ios_install_hint") return tr("push.statusIosInstall", "Notifications: Add to Home Screen first");
  return tr("push.statusOff", "Notifications: Off");
}

/**
 * Shared push consent control for customer / admin / corporate settings.
 * Never auto-subscribes — only react to explicit user gestures.
 */
export function PushNotificationConsent({
  benefit,
  portal,
  t,
  className = "",
  density = "comfortable",
}: PushNotificationConsentProps) {
  const [permission, setPermission] = useState(() =>
    typeof window === "undefined" ? ("unsupported" as const) : getNotificationPermission(),
  );
  const [configured] = useState(() => (typeof window === "undefined" ? false : isWebPushConfigured()));
  const [busy, setBusy] = useState(false);
  const [optedOut, setOptedOut] = useState(() => (typeof window === "undefined" ? false : readOptOut()));
  const [ua] = useState(() => (typeof navigator === "undefined" ? "" : navigator.userAgent));

  const isIos = useMemo(() => isIosUserAgent(ua), [ua]);
  const standalone = useMemo(() => {
    if (typeof window === "undefined") return false;
    const media = window.matchMedia("(display-mode: standalone)").matches;
    const navStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
    return isStandaloneMode({ standaloneMedia: media, navigatorStandalone: navStandalone });
  }, []);

  const uiState = useMemo(
    () =>
      resolvePushConsentUiState({
        configured,
        permission,
        isIos,
        isStandalone: standalone,
      }),
    [configured, permission, isIos, standalone],
  );

  const family = useMemo(() => detectBrowserFamily(ua), [ua]);
  const recovery = useMemo(() => recoveryCopy(family, t), [family, t]);

  const refreshPermission = useCallback(() => {
    setPermission(getNotificationPermission());
  }, []);

  // Re-read when the tab becomes visible (user may have fixed browser settings).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") refreshPermission();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refreshPermission]);

  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);

  const handleEnable = async () => {
    setBusy(true);
    try {
      const result = await subscribeToPush(portal);
      refreshPermission();
      if (result.ok) {
        writeOptOut(false);
        setOptedOut(false);
        toast.success(tr("push.enabledToast", "Notifications turned on"));
        return;
      }
      if (result.reason === "denied") {
        toast.message(tr("push.deniedToast", "Notifications are blocked in your browser settings"));
        return;
      }
      if (result.reason === "dismissed") {
        toast.message(tr("push.dismissedToast", "Notification permission was not granted"));
        return;
      }
      if (result.reason === "unsupported") {
        toast.message(tr("push.unsupportedToast", "Notifications are not supported on this device"));
        return;
      }
      if (result.reason === "unconfigured") {
        toast.message(
          result.detail?.includes("portal")
            ? tr(
                "push.portalUnavailableToast",
                "Push registration is not available for this portal yet.",
              )
            : tr("push.unconfiguredToast", "Push notifications are not configured on this server"),
        );
        return;
      }
      // Registration failed after grant — keep error visible; do not force "On".
      toast.message(
        result.detail
          ? `${tr("push.errorToast", "Could not enable notifications. Please try again.")} (${result.detail})`
          : tr("push.errorToast", "Could not enable notifications. Please try again."),
      );
    } finally {
      setBusy(false);
      refreshPermission();
    }
  };

  const handleToggle = async (next: boolean) => {
    if (busy) return;
    if (next) {
      // User gesture → subscribe (may prompt only when permission is default).
      await handleEnable();
      return;
    }
    // Cannot revoke browser permission from code — local opt-out only.
    writeOptOut(true);
    setOptedOut(true);
    toast.message(tr("push.disabledToast", "Notifications turned off on this device session"));
  };

  if (uiState === "hidden") return null;

  const pad = density === "compact" ? "p-3" : "p-4";
  const switchOn = uiState === "granted" && !optedOut;

  if (uiState === "ios_install_hint") {
    return (
      <div
        className={`rounded-2xl border border-slate-200 bg-slate-50 ${pad} ${className}`}
        data-testid="push-consent-ios-hint"
      >
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm">
            <Info className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-semibold text-slate-900">{statusLabel(uiState, optedOut, t)}</p>
            <p className="text-sm leading-relaxed text-slate-600">
              {tr(
                "push.iosInstall",
                "To get notifications on iPhone, add Promise Electronics to your home screen first: tap Share, then Add to Home Screen.",
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (uiState === "unsupported") {
    return (
      <div
        className={`rounded-2xl border border-slate-100 bg-slate-50/80 ${pad} ${className}`}
        data-testid="push-consent-unsupported"
      >
        <p className="text-sm font-medium text-slate-700">{statusLabel(uiState, optedOut, t)}</p>
        <p className="mt-1 text-xs text-slate-500">
          {tr("push.unsupportedBody", "This browser cannot show push notifications.")}
        </p>
      </div>
    );
  }

  if (uiState === "denied") {
    return (
      <div
        className={`rounded-2xl border border-slate-200 bg-slate-50 ${pad} ${className}`}
        data-testid="push-consent-denied"
      >
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm">
            <ShieldAlert className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-semibold text-slate-900">{statusLabel(uiState, optedOut, t)}</p>
            <p className="text-sm font-medium text-slate-800">{recovery.title}</p>
            <p className="text-sm leading-relaxed text-slate-600">{recovery.body}</p>
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-500">
              <BellOff className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                {family === "firefox"
                  ? tr("push.cueFirefox", "Look for the permissions icon near the address bar")
                  : family === "safari"
                    ? tr("push.cueSafari", "Use Safari Settings → Websites → Notifications")
                    : tr("push.cueChrome", "Look for the lock icon in the address bar")}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              className="mt-1 h-10 rounded-full"
              onClick={() => {
                refreshPermission();
                const next = getNotificationPermission();
                if (next === "granted") {
                  writeOptOut(false);
                  setOptedOut(false);
                  toast.success(tr("push.recheckGranted", "Notifications are allowed — you’re set"));
                } else if (next === "default") {
                  toast.message(tr("push.recheckDefault", "Permission reset — use the toggle to turn notifications on"));
                } else {
                  toast.message(tr("push.recheckStillBlocked", "Still blocked — finish the steps above, then try again"));
                }
              }}
              data-testid="push-consent-recheck"
            >
              {tr("push.recheck", "I've enabled it — check again")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // default | granted
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white ${pad} ${className}`}
      data-testid="push-consent-toggle"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          {switchOn ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{tr("push.title", "Push notifications")}</p>
              <p className="mt-0.5 text-xs font-medium text-slate-500">{statusLabel(uiState, optedOut, t)}</p>
            </div>
            <div className="flex items-center gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden />}
              <Switch
                checked={switchOn}
                disabled={busy}
                onCheckedChange={(v) => void handleToggle(v)}
                aria-label={tr("push.title", "Push notifications")}
                data-testid="push-consent-switch"
              />
            </div>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{benefit}</p>
        </div>
      </div>
    </div>
  );
}
