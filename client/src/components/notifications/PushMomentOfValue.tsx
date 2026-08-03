import { useCallback, useMemo, useState } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  getNotificationPermission,
  isWebPushConfigured,
  subscribeToPush,
  type PushPortal,
} from "@/lib/web-push";
import {
  isIosUserAgent,
  isStandaloneMode,
  PUSH_VALUE_PROMPT_DISMISSED_KEY,
  shouldShowPushValuePrompt,
} from "@/lib/push-consent-state";

export interface PushMomentOfValueProps {
  // Accepts typed customer `t` (keyof translations) without forcing casts at call sites.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t?: (key: any) => string;
  className?: string;
  /** Customer repair flow only — defaults to customer. */
  portal?: PushPortal;
}

/**
 * Inline (non-modal) invitation after a successful repair submission.
 * Only when permission is still "default". Never auto-prompts.
 */
export function PushMomentOfValue({ t, className = "", portal = "customer" }: PushMomentOfValueProps) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(PUSH_VALUE_PROMPT_DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState(() =>
    typeof window === "undefined" ? ("unsupported" as const) : getNotificationPermission(),
  );

  const configured = typeof window !== "undefined" && isWebPushConfigured();
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIos = isIosUserAgent(ua);
  const standalone =
    typeof window !== "undefined" &&
    isStandaloneMode({
      standaloneMedia: window.matchMedia("(display-mode: standalone)").matches,
      navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
    });

  const visible = useMemo(
    () =>
      shouldShowPushValuePrompt({
        permission,
        configured,
        dismissedThisSession: dismissed,
        isIos,
        isStandalone: standalone,
      }),
    [permission, configured, dismissed, isIos, standalone],
  );

  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      sessionStorage.setItem(PUSH_VALUE_PROMPT_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const result = await subscribeToPush(portal);
      setPermission(getNotificationPermission());
      if (result.ok) {
        toast.success(tr("push.enabledToast", "Notifications turned on"));
        dismiss();
        return;
      }
      if (result.reason === "denied") {
        toast.message(tr("push.deniedToast", "Notifications are blocked in your browser settings"));
        dismiss();
        return;
      }
      if (result.reason === "dismissed") {
        toast.message(tr("push.dismissedToast", "Notification permission was not granted"));
        return;
      }
      toast.message(
        result.detail
          ? `${tr("push.errorToast", "Could not enable notifications. Please try again.")} (${result.detail})`
          : tr("push.errorToast", "Could not enable notifications. Please try again."),
      );
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <div
      className={`rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4 text-left shadow-sm ${className}`}
      data-testid="push-moment-of-value"
      role="region"
      aria-label={tr("push.valueTitle", "Want updates on this repair?")}
    >
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm">
          <Bell className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">
              {tr("push.valueTitle", "Want updates on this repair? Turn on notifications.")}
            </p>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-slate-600"
              aria-label={tr("common.close", "Close")}
              data-testid="push-moment-dismiss-icon"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            {tr("push.valueBody", "Get notified when your repair status changes.")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="h-9 rounded-full bg-emerald-600 px-4 font-semibold hover:bg-emerald-700"
              disabled={busy}
              onClick={() => void enable()}
              data-testid="push-moment-enable"
            >
              {tr("push.valueEnable", "Enable")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-9 rounded-full px-4 font-semibold text-slate-600"
              disabled={busy}
              onClick={dismiss}
              data-testid="push-moment-not-now"
            >
              {tr("push.valueNotNow", "Not now")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
