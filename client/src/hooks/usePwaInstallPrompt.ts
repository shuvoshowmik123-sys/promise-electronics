import { useState, useEffect, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Portal = "customer" | "admin" | "corporate";

const DISMISS_DAYS = 7;

function getDismissKey(portal: Portal): string {
  return `pwa-install-dismissed-${portal}`;
}

function isRecentlyDismissed(portal: Portal): boolean {
  const val = localStorage.getItem(getDismissKey(portal))
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

export function usePwaInstallPrompt(portal: Portal) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canShow, setCanShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (isRecentlyDismissed(portal)) return;

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
  }, [portal]);

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
    localStorage.setItem(getDismissKey(portal), Date.now().toString());
  }, [portal]);

  return { canShow, isIOS, install, dismiss, hasNativePrompt: !!deferredPrompt };
}
