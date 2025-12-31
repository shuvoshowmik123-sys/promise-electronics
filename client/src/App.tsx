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
import { AdminSSEProvider } from "@/contexts/AdminSSEContext";
import { CartProvider } from "@/contexts/CartContext";
import { NativeThemeProvider } from "@/contexts/NativeThemeContext";
import { PushNotificationProvider } from "@/contexts/PushNotificationContext";
import { AppOpeningProvider } from "@/contexts/AppOpeningContext";
import { lazy, Suspense, useRef, useEffect } from "react";

// Lazy load web and admin pages
const NotFound = lazy(() => import("@/pages/not-found"));
const HomePage = lazy(() => import("@/pages/home"));
const ShopPage = lazy(() => import("@/pages/shop"));
const CartPage = lazy(() => import("@/pages/cart"));
const CheckoutPage = lazy(() => import("@/pages/checkout"));
const RepairRequestPage = lazy(() => import("@/pages/repair-request"));
const ServicesPage = lazy(() => import("@/pages/services"));
const ServiceDetailsPage = lazy(() => import("@/pages/service-details"));
const GetQuotePage = lazy(() => import("@/pages/get-quote"));
const TrackOrderPage = lazy(() => import("@/pages/track-order"));
const TrackJobPage = lazy(() => import("@/pages/track-job"));
const SupportPage = lazy(() => import("@/pages/support"));
const MyProfilePage = lazy(() => import("@/pages/my-profile"));
const MyWarrantiesPage = lazy(() => import("@/pages/my-warranties"));
const LoginPage = lazy(() => import("@/pages/login"));
const AboutPage = lazy(() => import("@/pages/about"));
const PrivacyPolicyPage = lazy(() => import("@/pages/privacy-policy"));
const WarrantyPolicyPage = lazy(() => import("@/pages/warranty-policy"));
const TermsAndConditionsPage = lazy(() => import("@/pages/terms-and-conditions"));

// Admin Pages - Only login page separately, rest handled by AdminRouter
const AdminLoginPage = lazy(() => import("@/pages/admin/login"));
import { AdminRouter } from "@/components/layout/AdminRouter";

import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";

import Splash from "@/native-app/pages/Splash";
import NativeLogin from "@/native-app/pages/Login";
import NativeRegister from "@/native-app/pages/Register";
import NativeHome from "@/native-app/pages/Home";
import NativeBookings from "@/native-app/pages/Bookings";
import NativeProfile from "@/native-app/pages/Profile";
import NativeShop from "@/native-app/pages/Shop";
import NativeRepairRequest from "@/native-app/pages/RepairRequest";
import NativeSupport from "@/native-app/pages/Support";
import NativeAddresses from "@/native-app/pages/Addresses";
import NativePrivacyPolicy from "@/native-app/pages/PrivacyPolicy";
import NativeSettings from "@/native-app/pages/Settings";
import NativeEditProfile from "@/native-app/pages/EditProfile";
import NativeChangePassword from "@/native-app/pages/ChangePassword";
import NativeAbout from "@/native-app/pages/About";
import NativeTermsAndConditions from "@/native-app/pages/TermsAndConditions";
import NativeOrderHistory from "@/native-app/pages/OrderHistory";
import NativeRepairHistory from "@/native-app/pages/RepairHistory";
import NativeRepairDetails from "@/native-app/pages/RepairDetails";
import NativeWarranties from "@/native-app/pages/Warranties";
import NativeChatTab from "@/native-app/pages/ChatTab";
import NativeCameraLens from "@/native-app/pages/CameraLens";
import BottomNav from "@/native-app/components/BottomNav";

import NativeHeader from "@/native-app/components/NativeHeader";
import { DaktarVaiChat } from "@/components/DaktarVaiChat";
import { PageSkeleton } from "@/components/PageSkeleton";
import { useAndroidBack } from "@/hooks/useAndroidBack";

// Routes that should show the bottom navigation bar
const routesWithBottomNav = [
  "/native/home",
  "/native/shop",
  "/native/bookings",
  "/native/profile",
  "/native/addresses",
];

// Route order for directional animations (lower = left, higher = right)
const ROUTE_ORDER: Record<string, number> = {
  // Bottom nav tabs (main hierarchy)
  '/native/home': 0,
  '/native/shop': 1,
  '/native/bookings': 2,
  '/native/support': 3,
  '/native/profile': 4,
  // Detail pages (inherit from parent + 0.5)
  '/native/repair': 0.5,
  '/native/chat': 0.5,
  '/native/cart': 1.5,
  '/native/checkout': 1.5,
  '/native/repair-history': 2.5,
  '/native/addresses': 3.5,
  '/native/settings': 4.5,
  '/native/orders': 4.5,
  '/native/warranties': 4.5,
  '/native/about': 4.5,
  '/native/privacy-policy': 4.5,
  '/native/terms-and-conditions': 4.5,
};

// Get route order, handling dynamic routes like /native/repair/:id
const getRouteOrder = (path: string): number => {
  // Exact match first
  if (ROUTE_ORDER[path] !== undefined) return ROUTE_ORDER[path];

  // Check for dynamic route prefixes
  if (path.startsWith('/native/repair/')) return 2.5;
  if (path.startsWith('/native/settings/')) return 4.5;

  // Default: not in hierarchy
  return -1;
};

// Calculate animation direction
const getDirection = (from: string, to: string): 'forward' | 'backward' | 'none' => {
  const fromOrder = getRouteOrder(from);
  const toOrder = getRouteOrder(to);

  if (fromOrder === -1 || toOrder === -1) return 'none';
  if (toOrder > fromOrder) return 'forward';
  if (toOrder < fromOrder) return 'backward';
  return 'none';
};

function RootRoute() {
  const [, setLocation] = useLocation();

  if (Capacitor.isNativePlatform()) {
    setTimeout(() => setLocation("/native/splash"), 0);
    return null;
  } else {
    // On web, skip welcome screen and go to home
    setTimeout(() => setLocation("/home"), 0);
    return null;
  }
}

import { App as CapacitorApp, URLOpenListenerEvent } from "@capacitor/app";

function Router() {
  const [location, setLocation] = useLocation();
  const previousLocationRef = useRef<string | null>(null);
  const directionRef = useRef<'forward' | 'backward' | 'none'>('none');

  // Handle Android hardware back button
  useAndroidBack();

  // Calculate direction BEFORE updating the ref
  if (previousLocationRef.current !== null && previousLocationRef.current !== location) {
    directionRef.current = getDirection(previousLocationRef.current, location);
    console.log(`[Navigation] ${previousLocationRef.current} → ${location} = ${directionRef.current}`);
  }

  // Update previous location after calculating direction
  useEffect(() => {
    previousLocationRef.current = location;
  }, [location]);

  const direction = directionRef.current;

  useEffect(() => {
    CapacitorApp.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
      // Handle promise:// scheme
      if (event.url.startsWith('promise://')) {
        const path = event.url.split('promise://')[1];
        if (path) {
          // Check if it's a repair link
          if (path.startsWith('repair/')) {
            // Map promise://repair/123 to /native/repair/123
            setLocation(`/native/${path}`);
          } else {
            // General fallback
            setLocation(`/native/${path}`);
          }
        }
      }
      // Handle web links (if needed in future)
      else if (event.url.includes('.com')) {
        const slug = event.url.split(".com").pop();
        if (slug) setLocation(slug);
      }
    });
  }, [setLocation]);

  useEffect(() => {
    if (location.startsWith("/native")) {
      document.documentElement.classList.add("native-app-mode");
    } else {
      document.documentElement.classList.remove("native-app-mode");
    }
  }, [location]);

  const showBottomNav = routesWithBottomNav.includes(location);

  const isNative = location.startsWith("/native");
  const isAdminRoute = location.startsWith("/admin") && location !== "/admin/login";

  // Skip animation for splash and login screens
  const noAnimationRoutes = ["/native/splash", "/native/login", "/native/register"];
  const shouldAnimate = isNative && !noAnimationRoutes.includes(location);

  // For admin routes (except login), render AdminRouter which has its own stable layout
  if (isAdminRoute) {
    return <AdminRouter />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--color-native-bg)]">
      {/* Fixed Header */}
      <NativeHeader />

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={location}
            initial={shouldAnimate ? {
              x: direction === 'forward' ? '100%' : direction === 'backward' ? '-100%' : 0,
              opacity: direction === 'none' ? 0 : 1,
              scale: direction === 'none' ? 0.96 : 1,
            } : { opacity: 1 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={shouldAnimate ? {
              x: direction === 'forward' ? '-30%' : direction === 'backward' ? '30%' : 0,
              opacity: 0,
              scale: direction === 'none' ? 0.98 : 1,
            } : { opacity: 1 }}
            transition={shouldAnimate ? {
              type: "spring",
              damping: 28,
              stiffness: 300,
              mass: 0.8
            } : { duration: 0 }}
            className="w-full h-full"
          >
            <Suspense fallback={<PageSkeleton />}>
              <Switch location={location}>
                <Route path="/" component={RootRoute} />
                <Route path="/home" component={HomePage} />
                <Route path="/shop" component={ShopPage} />
                <Route path="/cart" component={CartPage} />
                <Route path="/checkout" component={CheckoutPage} />
                <Route path="/repair" component={RepairRequestPage} />
                <Route path="/services" component={ServicesPage} />
                <Route path="/services/:id" component={ServiceDetailsPage} />
                <Route path="/get-quote" component={GetQuotePage} />
                <Route path="/track-order" component={TrackOrderPage} />
                <Route path="/track" component={TrackJobPage} />
                <Route path="/support" component={SupportPage} />
                <Route path="/my-profile" component={MyProfilePage} />
                <Route path="/my-warranties" component={MyWarrantiesPage} />
                <Route path="/about" component={AboutPage} />
                <Route path="/privacy-policy" component={PrivacyPolicyPage} />
                <Route path="/warranty-policy" component={WarrantyPolicyPage} />
                <Route path="/terms-and-conditions" component={TermsAndConditionsPage} />
                <Route path="/login" component={LoginPage} />
                <Route path="/native/splash" component={Splash} />
                <Route path="/native/login" component={NativeLogin} />
                <Route path="/native/register" component={NativeRegister} />
                <Route path="/native/home" component={NativeHome} />
                <Route path="/native/bookings" component={NativeBookings} />
                <Route path="/native/profile" component={NativeProfile} />
                <Route path="/native/shop" component={NativeShop} />
                <Route path="/native/repair" component={NativeRepairRequest} />
                <Route path="/native/support" component={NativeSupport} />
                <Route path="/native/addresses" component={NativeAddresses} />
                <Route path="/native/privacy-policy" component={NativePrivacyPolicy} />
                <Route path="/native/settings" component={NativeSettings} />
                <Route path="/native/settings/edit-profile" component={NativeEditProfile} />
                <Route path="/native/settings/change-password" component={NativeChangePassword} />
                <Route path="/native/about" component={NativeAbout} />
                <Route path="/native/terms-and-conditions" component={NativeTermsAndConditions} />
                <Route path="/native/orders" component={NativeOrderHistory} />
                <Route path="/native/repair-history" component={NativeRepairHistory} />
                <Route path="/native/repair/:id" component={NativeRepairDetails} />
                <Route path="/native/warranties" component={NativeWarranties} />
                <Route path="/native/chat" component={NativeChatTab} />
                <Route path="/native/camera-lens" component={NativeCameraLens} />

                {/* Admin Login - rendered separately without AdminRouter */}
                <Route path="/admin/login" component={AdminLoginPage} />

                <Route component={NotFound} />
              </Switch>
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom Nav rendered outside AnimatePresence to stay fixed during transitions */}
      {showBottomNav && <BottomNav />}

      {/* Daktar Vai Chatbot - Web Only */}
      {!isNative && !isAdminRoute && <DaktarVaiChat />}
    </div>
  );
}

import { SplashScreen } from "@capacitor/splash-screen";
import { GoogleAuth } from "@codetrix-studio/capacitor-google-auth";

import { SpeedInsights } from "@vercel/speed-insights/react";

import { initPushNotifications, onPushNotificationReceived, onPushNotificationAction } from "@/lib/native-features";
import { initOTAUpdates, checkForUpdates } from "@/lib/otaUpdates";
import { initQueryPersistence } from "@/lib/queryClient";

function App() {
  useEffect(() => {
    // Initialize offline persistence for React Query
    initQueryPersistence();

    // Hide splash screen after app mounts
    if (Capacitor.isNativePlatform()) {
      SplashScreen.hide();

      // Initialize Google Auth
      GoogleAuth.initialize({
        clientId: '158965145454-4mi8aafaqrm6b2tfkn5qum2epin3lk4j.apps.googleusercontent.com',
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
      <CartProvider>
        <CustomerAuthProvider>
          <PushNotificationProvider>
            <AdminAuthProvider>
              <AdminSSEProvider>
                <NativeThemeProvider>
                  <AppOpeningProvider>
                    <TooltipProvider>
                      <Toaster />
                      <SonnerToaster position="top-center" richColors />
                      <Router />
                      <PWAInstallPrompt />
                      <SpeedInsights />
                    </TooltipProvider>
                  </AppOpeningProvider>
                </NativeThemeProvider>
              </AdminSSEProvider>
            </AdminAuthProvider>
          </PushNotificationProvider>
        </CustomerAuthProvider>
      </CartProvider>
    </QueryClientProvider>
  );
}

export default App;
