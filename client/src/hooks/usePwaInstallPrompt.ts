import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Portal = "customer" | "admin" | "corporate";

const DISMISS_DAYS = 7;

/**
 * Scoped to the person, not just the browser.
 *
 * The key was per portal, so the first staff member to dismiss it silenced it
 * for everyone who used that phone afterwards — and "shown once at first login"
 * has to mean each person's first login, not the device's. A shared counter
 * phone is the normal case here, not the exception.
 *
 * Falls back to the portal-only key when nobody is signed in yet, which keeps
 * the pre-login behaviour and the old key working for anyone mid-window.
 */
function getDismissKey(portal: Portal, scopeId?: string): string {
  return scopeId
    ? `pwa-install-dismissed-${portal}:${scopeId}`
    : `pwa-install-dismissed-${portal}`;
}

function isRecentlyDismissed(portal: Portal, scopeId?: string): boolean {
  const val = localStorage.getItem(getDismissKey(portal, scopeId))
    || (portal === "customer" ? localStorage.getItem("pwa-install-dismissed") : null);
  if (!val) return false;
  const days = (Date.now() - parseInt(val)) / (1000 * 60 * 60 * 24);
  return days < DISMISS_DAYS;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

function isIOSDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

export function usePwaInstallPrompt(portal: Portal, scopeId?: string) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canShow, setCanShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  /**
   * Whether this banner has been sent away, independently of whether it could
   * otherwise be shown.
   *
   * canShow was carrying two meanings at once: "the browser has offered an
   * install" and "the person has not refused". That worked while the only way
   * to show the banner was the browser event, and broke the moment a second
   * path existed — the Android APK offer does not wait for that event, so it
   * bypassed canShow, and with it the dismissal. The X and Later did set the
   * flag; the banner simply was not consulting it, and reappeared on every
   * render. Nothing would close it.
   *
   * Read from storage on the first render rather than in an effect, so a return
   * visit inside the seven days does not flash the banner before hiding it.
   */
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return isRecentlyDismissed(portal, scopeId);
    } catch {
      return false;
    }
  });

  /**
   * Re-read when the person changes.
   *
   * The initial value is computed once, and on first render nobody is signed in
   * yet — so without this the answer for "has this user dismissed it" would stay
   * whatever it was for "has anyone". Someone signing in would inherit a
   * colleague's dismissal, or their own would fail to apply.
   */
  useEffect(() => {
    try {
      setDismissed(isRecentlyDismissed(portal, scopeId));
    } catch {
      setDismissed(false);
    }
  }, [portal, scopeId]);

  useEffect(() => {
    if (isStandalone()) return;
    if (isRecentlyDismissed(portal, scopeId)) return;

    const ios = isIOSDevice();
    setIsIOS(ios);

    if (ios) {
      const timer = setTimeout(() => setCanShow(true), 3000);
      return () => clearTimeout(timer);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setCanShow(true), 3000);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [portal, scopeId]);

  const install = useCallback(async () => {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === "accepted") {
      setCanShow(false);
      return true;
    }
    return false;
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    setCanShow(false);
    setDismissed(true);
    try {
      localStorage.setItem(getDismissKey(portal, scopeId), Date.now().toString());
    } catch {
      // Private mode or blocked storage: the banner still goes for this
      // session, it simply returns on the next visit. Better than throwing out
      // of a click handler and leaving it on screen.
    }
  }, [portal, scopeId]);

  return { canShow, isIOS, install, dismiss, dismissed, hasNativePrompt: !!deferredPrompt };
}
