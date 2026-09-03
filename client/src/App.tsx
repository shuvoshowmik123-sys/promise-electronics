import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CustomerAuthProvider } from "@/contexts/CustomerAuthContext";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { CorporateAuthProvider } from "@/contexts/CorporateAuthContext";
import { AdminSSEProvider } from "@/contexts/AdminSSEContext";
import { OfflineProvider } from "@/contexts/OfflineContext";
import { CartProvider } from "@/contexts/CartContext";
import { PushNotificationProvider } from "@/contexts/PushNotificationContext";
import { AppOpeningProvider } from "@/contexts/AppOpeningContext";
import { ModuleProvider } from "@/contexts/ModuleContext";
import { IdleTimeoutProvider } from "@/components/auth/IdleTimeoutProvider";
import { lazy, Suspense, useEffect } from "react";

const AdminRouter = lazy(() => import("@/components/layout/AdminRouter").then(m => ({ default: m.AdminRouter })));
const CorporateRouter = lazy(() => import("@/components/layout/CorporateRouter").then(m => ({ default: m.CorporateRouter })));
const TechRouter = lazy(() => import("@/components/layout/TechRouter").then(m => ({ default: m.TechRouter })));
const CustomerRouter = lazy(() => import("@/components/layout/CustomerRouter").then(m => ({ default: m.CustomerRouter })));

import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";

import { PageSkeleton } from "@/components/PageSkeleton";
import { useAndroidBack } from "@/hooks/useAndroidBack";

import { App as CapacitorApp, URLOpenListenerEvent } from "@capacitor/app";

function Router() {
  const [location, setLocation] = useLocation();

  // Handle Android hardware back button
  useAndroidBack();

  useEffect(() => {
    CapacitorApp.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
      // Handle promise:// scheme
      if (event.url.startsWith('promise://')) {
        const path = event.url.split('promise://')[1];
        if (path) {
          // General fallback
          setLocation(`/${path}`);
        }
      }
      // Handle web links (if needed in future)
      else if (event.url.includes('.com')) {
        const slug = event.url.split(".com").pop();
        if (slug) setLocation(slug);
      }
    });
  }, [setLocation]);

  const isAdminRoute = location.startsWith("/admin");
  const isCorporateRoute = location.startsWith("/corporate");
  const isTechRoute = location.startsWith("/tech");

  /*
   * The staff app is the admin portal and nothing else.
   *
   * Routing here is a fall-through: /admin, /corporate and /tech are matched by
   * prefix and EVERY other path renders the customer portal. On the web that is
   * correct - one deployment serves all three audiences at one domain. Inside
   * the APK it is not: the same bundle ships every portal, so any navigation
   * that leaves /admin - a hardware back press at the dashboard, a stray link,
   * a redirect after a failed auth check - drops a staff member into the
   * customer shop front, still holding a staff session.
   *
   * So on native, anything that is not a staff route is sent back to the admin
   * portal instead of rendering. Redirect rather than a blank screen, because
   * the destination is never a mystery here: there is exactly one thing this
   * app is for.
   *
   * Note this makes those portals unreachable, not absent. Their chunks are
   * still inside the APK and are simply never loaded. Keeping them out of the
   * build altogether is a separate change to how the bundle is split.
   */
  const isStaffRoute = isAdminRoute || isTechRoute;
  useEffect(() => {
    if (Capacitor.isNativePlatform() && !isStaffRoute) {
      setLocation("/admin", { replace: true });
    }
  }, [isStaffRoute, setLocation]);

  if (Capacitor.isNativePlatform() && !isStaffRoute) {
    return <PageSkeleton />;
  }

  // All /admin/* routes (including /admin/login) share one AdminAuthProvider
  if (isAdminRoute) {
    return (
      <AdminAuthProvider>
        <AdminSSEProvider>
          <OfflineProvider>
            <AdminRouter />
          </OfflineProvider>
        </AdminSSEProvider>
      </AdminAuthProvider>
    );
  }

  if (isCorporateRoute) {
    return (
      <CorporateAuthProvider>
        <Suspense fallback={<PageSkeleton />}>
          <CorporateRouter />
        </Suspense>
      </CorporateAuthProvider>
    );
  }

  if (isTechRoute) {
    return (
      <AdminAuthProvider>
        <Suspense fallback={<PageSkeleton />}>
          <TechRouter />
        </Suspense>
      </AdminAuthProvider>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--background)]">
      <CustomerAuthProvider>
        <CartProvider>
          <PushNotificationProvider>
            <AppOpeningProvider>
              <div className="flex-1 relative overflow-hidden flex flex-col">
                <Suspense fallback={<PageSkeleton />}>
                  <CustomerRouter />
                </Suspense>
              </div>
            </AppOpeningProvider>
          </PushNotificationProvider>
        </CartProvider>
      </CustomerAuthProvider>
    </div>
  );
}

import { SplashScreen } from "@capacitor/splash-screen";
import { GoogleAuth } from "@codetrix-studio/capacitor-google-auth";

import { SpeedInsights } from "@vercel/speed-insights/react";

import { initPushNotifications, onPushNotificationReceived, onPushNotificationAction } from "@/lib/native-features";
import { initOTAUpdates } from "@/lib/otaUpdates";
import { checkForWebBundleUpdate } from "@/lib/ota-self-hosted";
import { initQueryPersistence } from "@/lib/queryClient";
import { registerServiceWorker } from "@/lib/sw-register";

function App() {
  useEffect(() => {
    // Initialize offline persistence for React Query
    initQueryPersistence();

    // Register Service Worker for offline fallback (web only)
    if (!Capacitor.isNativePlatform()) {
      registerServiceWorker();
    }
    if (Capacitor.isNativePlatform()) {
      SplashScreen.hide();

      /**
       * Tell the updater we booted before doing anything else.
       *
       * capacitor-updater treats an app that never reports ready as a failed
       * update and reloads it. Anything above this line that throws therefore
       * does not just fail — it restarts the app, hits the same line, and
       * restarts again. The first release did exactly that: GoogleAuth was
       * initialised first, with an empty clientId because VITE_GOOGLE_CLIENT_ID
       * was not set at build time, and threw before the ready signal was ever
       * sent. The app relaunched forever and the screen never appeared.
       *
       * So this goes first, and everything optional goes after it and is
       * wrapped. One unconfigured plugin should cost its own feature, not the
       * whole app.
       */
      /*
       * initOTAUpdates first, because it is what calls notifyAppReady() — the
       * signal that says this bundle started successfully. Without it, a bundle
       * staged by the check below would be rolled back on the launch after
       * next, and the update would appear to install and then undo itself.
       */
      initOTAUpdates()
        .then(() => checkForWebBundleUpdate())
        .catch((err) => {
          console.warn('[App] OTA initialization skipped:', err?.message || err);
        });

      // Optional: only works once VITE_GOOGLE_CLIENT_ID is set at build time.
      try {
        const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
        if (googleClientId) {
          GoogleAuth.initialize({
            clientId: googleClientId,
            scopes: ['profile', 'email'],
            grantOfflineAccess: true,
          });
        } else {
          console.warn('[App] Google sign-in not configured; skipping.');
        }
      } catch (err) {
        console.warn('[App] Google sign-in unavailable:', (err as Error)?.message || err);
      }

      // Configure Status Bar
      /**
       * A plain white bar with dark icons, not an overlay.
       *
       * Overlaying suits a full-bleed photo or a map. The admin panel is a
       * white sheet with a header at the top, and with overlay on, that header
       * slid underneath the clock and the strip rendered as whatever was behind
       * it — which read as a black band across the top of a white app.
       *
       * So the status bar gets its own space and is painted the same white as
       * the panel. Style.Light means dark icons FOR a light background, which
       * is the opposite of how it sounds and easy to set backwards.
       */
      const configureStatusBar = async () => {
        try {
          await StatusBar.setOverlaysWebView({ overlay: false });
          await StatusBar.setBackgroundColor({ color: "#ffffff" });
          await StatusBar.setStyle({ style: Style.Light });
        } catch (err) {
          console.warn("StatusBar config failed", err);
        }
      };

      configureStatusBar();
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ModuleProvider>
        <TooltipProvider>
          <Toaster />
          <SonnerToaster position="top-center" richColors />
          <Router />
          <PWAInstallPrompt />
          <SpeedInsights />
        </TooltipProvider>
      </ModuleProvider>
    </QueryClientProvider>
  );
}

export default App;
