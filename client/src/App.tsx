import { Capacitor } from "@capacitor/core";
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
import { lazy, Suspense } from "react";

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

// Admin Pages
const AdminLoginPage = lazy(() => import("@/pages/admin/login"));
const AdminDashboard = lazy(() => import("@/pages/admin/dashboard"));
const AdminJobsPage = lazy(() => import("@/pages/admin/jobs"));
const AdminInventoryPage = lazy(() => import("@/pages/admin/inventory"));
const AdminChallanPage = lazy(() => import("@/pages/admin/challan"));
const AdminFinancePage = lazy(() => import("@/pages/admin/finance"));
const TechnicianDashboard = lazy(() => import("@/pages/admin/technician-dashboard"));
const AdminPOSPage = lazy(() => import("@/pages/admin/pos"));
const AdminSettingsPage = lazy(() => import("@/pages/admin/settings"));
const AdminUsersPage = lazy(() => import("@/pages/admin/users"));
const AdminReportsPage = lazy(() => import("@/pages/admin/reports"));
const AdminServiceRequestsPage = lazy(() => import("@/pages/admin/service-requests"));
const StaffAttendanceReport = lazy(() => import("@/pages/admin/staff-attendance"));
const AdminOrdersPage = lazy(() => import("@/pages/admin/orders"));
const AdminCustomersPage = lazy(() => import("@/pages/admin/customers"));
const AdminOverviewPage = lazy(() => import("@/pages/admin/overview"));
const AdminPickupSchedulePage = lazy(() => import("@/pages/admin/pickup-schedule"));
const AdminInquiriesPage = lazy(() => import("@/pages/admin/inquiries"));

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
import BottomNav from "@/native-app/components/BottomNav";

import NativeHeader from "@/native-app/components/NativeHeader";

// Routes that should show the bottom navigation bar
const routesWithBottomNav = [
  "/native/home",
  "/native/shop",
  "/native/bookings",
  "/native/profile",
  "/native/support",
  "/native/addresses",
];

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

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--color-native-bg)]">
      {/* Fixed Header */}
      <NativeHeader />

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={location}
            initial={isNative ? { x: "100%", opacity: 0 } : { opacity: 1 }}
            animate={isNative ? { x: 0, opacity: 1 } : { opacity: 1 }}
            exit={isNative ? { x: "-30%", opacity: 0 } : { opacity: 1 }}
            transition={isNative ? { type: "spring", damping: 25, stiffness: 200 } : { duration: 0 }}
            className="w-full h-full"
          >
            <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
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

                {/* Admin Routes */}
                <Route path="/admin/login" component={AdminLoginPage} />
                <Route path="/admin" component={AdminDashboard} />
                <Route path="/admin/jobs" component={AdminJobsPage} />
                <Route path="/admin/pos" component={AdminPOSPage} />
                <Route path="/admin/inventory" component={AdminInventoryPage} />
                <Route path="/admin/challan" component={AdminChallanPage} />
                <Route path="/admin/finance" component={AdminFinancePage} />
                <Route path="/admin/technician" component={TechnicianDashboard} />
                <Route path="/admin/reports" component={AdminReportsPage} />
                <Route path="/admin/staff-attendance" component={StaffAttendanceReport} />
                <Route path="/admin/users" component={AdminUsersPage} />
                <Route path="/admin/settings" component={AdminSettingsPage} />
                <Route path="/admin/service-requests" component={AdminServiceRequestsPage} />
                <Route path="/admin/orders" component={AdminOrdersPage} />
                <Route path="/admin/customers" component={AdminCustomersPage} />
                <Route path="/admin/overview" component={AdminOverviewPage} />
                <Route path="/admin/pickup-schedule" component={AdminPickupSchedulePage} />
                <Route path="/admin/inquiries" component={AdminInquiriesPage} />

                <Route component={NotFound} />
              </Switch>
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom Nav rendered outside AnimatePresence to stay fixed during transitions */}
      {showBottomNav && <BottomNav />}
    </div>
  );
}

import { SplashScreen } from "@capacitor/splash-screen";
import { GoogleAuth } from "@codetrix-studio/capacitor-google-auth";
import { useEffect } from "react";

import { SpeedInsights } from "@vercel/speed-insights/react";

import { initPushNotifications, onPushNotificationReceived, onPushNotificationAction } from "@/lib/native-features";

function App() {
  useEffect(() => {
    // Hide splash screen after app mounts
    if (Capacitor.isNativePlatform()) {
      SplashScreen.hide();

      // Initialize Google Auth
      GoogleAuth.initialize({
        clientId: '158965145454-4mi8aafaqrm6b2tfkn5qum2epin3lk4j.apps.googleusercontent.com',
        scopes: ['profile', 'email'],
        grantOfflineAccess: true,
      });

      // Initialize Push Notifications
      initPushNotifications().then((token) => {
        if (token) {
          console.log('[PUSH] Device registered with token:', token);
          // TODO: Send this token to your backend to store for sending notifications
        }
      });

      // Handle push notification received (while app is in foreground)
      onPushNotificationReceived((notification) => {
        console.log('[PUSH] Notification received:', notification);
        // The notification sound will play automatically via native Android
      });

      // Handle push notification tapped (when user taps on notification)
      onPushNotificationAction((notification) => {
        console.log('[PUSH] Notification tapped:', notification);
        // Navigate to relevant screen based on notification data
        if (notification.data?.route) {
          window.location.href = notification.data.route as string;
        }
      });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <CustomerAuthProvider>
          <AdminAuthProvider>
            <AdminSSEProvider>
              <NativeThemeProvider>
                <TooltipProvider>
                  <Toaster />
                  <SonnerToaster position="top-center" richColors />
                  <Router />
                  <PWAInstallPrompt />
                  <SpeedInsights />
                </TooltipProvider>
              </NativeThemeProvider>
            </AdminSSEProvider>
          </AdminAuthProvider>
        </CustomerAuthProvider>
      </CartProvider>
    </QueryClientProvider>
  );
}

export default App;
