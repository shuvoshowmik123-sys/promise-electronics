import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Switch, Route, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
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

// Admin Pages - Only login page separately, rest handled by AdminRouter
const AdminLoginPage = lazy(() => import("@/pages/admin/login"));
const AdminRouter = lazy(() => import("@/components/layout/AdminRouter").then(m => ({ default: m.AdminRouter })));
import { CorporateRouter } from "@/components/layout/CorporateRouter";
import { TechRouter } from "@/components/layout/TechRouter";
import { CustomerRouter } from "@/components/layout/CustomerRouter";

import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";

import { DaktarVaiChat } from "@/components/DaktarVaiChat";
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

  const isAdminRoute = location.startsWith("/admin") && location !== "/admin/login";
  const isCorporateRoute = location.startsWith("/corporate");
  const isTechRoute = location.startsWith("/tech");

  // For admin routes (except login), render AdminRouter which has its own stable layout
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
        <CorporateRouter />
      </CorporateAuthProvider>
    );
  }

  if (isTechRoute) {
    return (
      <AdminAuthProvider>
        <TechRouter />
      </AdminAuthProvider>
    );
  }

  if (location === "/admin/login") {
    return (
      <Suspense fallback={<PageSkeleton />}>
        <AdminAuthProvider>
          <AdminLoginPage />
        </AdminAuthProvider>
      </Suspense>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--background)]">

      {/* Main Content Area */}
      <CustomerAuthProvider>
        <CartProvider>
          <PushNotificationProvider>
            <AppOpeningProvider>
              <div className="flex-1 relative overflow-hidden flex flex-col">
                {/* <IdleTimeoutProvider timeoutMinutes={10}> */}
                <CustomerRouter />
                {/* </IdleTimeoutProvider> */}
              </div>

              {/* DaktarVai Chatbot - Web Only */}
              <DaktarVaiChat />
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
import { initOTAUpdates, checkForUpdates } from "@/lib/otaUpdates";
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

      // Initialize Google Auth
      GoogleAuth.initialize({
        clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
        scopes: ['profile', 'email'],
        grantOfflineAccess: true,
      });

      // Initialize OTA Updates (non-blocking, fire-and-forget)
      initOTAUpdates()
        .then(() => checkForUpdates())
        .then((update) => {
          if (update) console.log('[App] Update available:', update.version);
        })
        .catch((err) => {
          console.warn('[App] OTA initialization skipped:', err?.message || err);
        });

      // Configure Status Bar
      const configureStatusBar = async () => {
        try {
          // Make status bar transparent and overlay webview for immersive effect
          await StatusBar.setOverlaysWebView({ overlay: true });

          // Set style based on system theme or default to Light
          // You might want to listen to theme changes if your app supports dynamic theming
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
