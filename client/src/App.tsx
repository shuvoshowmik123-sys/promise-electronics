import { Capacitor } from "@capacitor/core";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CustomerAuthProvider } from "@/contexts/CustomerAuthContext";
import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { AdminSSEProvider } from "@/contexts/AdminSSEContext";
import { CartProvider } from "@/contexts/CartContext";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home";
import ShopPage from "@/pages/shop";
import CartPage from "@/pages/cart";
import CheckoutPage from "@/pages/checkout";
import RepairRequestPage from "@/pages/repair-request";
import ServicesPage from "@/pages/services";
import ServiceDetailsPage from "@/pages/service-details";
import GetQuotePage from "@/pages/get-quote";
import TrackOrderPage from "@/pages/track-order";
import SupportPage from "@/pages/support";
import MyProfilePage from "@/pages/my-profile";
import MyWarrantiesPage from "@/pages/my-warranties";
import LoginPage from "@/pages/login";
import AboutPage from "@/pages/about";
import TrackJobPage from "@/pages/track-job";
import PrivacyPolicyPage from "@/pages/privacy-policy";
import WarrantyPolicyPage from "@/pages/warranty-policy";
import TermsAndConditionsPage from "@/pages/terms-and-conditions";
import AdminLoginPage from "@/pages/admin/login";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminJobsPage from "@/pages/admin/jobs";
import AdminInventoryPage from "@/pages/admin/inventory";
import AdminChallanPage from "@/pages/admin/challan";
import AdminFinancePage from "@/pages/admin/finance";
import TechnicianDashboard from "@/pages/admin/technician-dashboard";
import AdminPOSPage from "@/pages/admin/pos";
import AdminSettingsPage from "@/pages/admin/settings";
import AdminUsersPage from "@/pages/admin/users";
import AdminReportsPage from "@/pages/admin/reports";
import AdminServiceRequestsPage from "@/pages/admin/service-requests";
import StaffAttendanceReport from "@/pages/admin/staff-attendance";
import AdminOrdersPage from "@/pages/admin/orders";
import AdminCustomersPage from "@/pages/admin/customers";
import AdminOverviewPage from "@/pages/admin/overview";
import AdminPickupSchedulePage from "@/pages/admin/pickup-schedule";
import AdminInquiriesPage from "@/pages/admin/inquiries";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";

import WelcomePage from "@/pages/welcome";

function RootRoute() {
  const [, setLocation] = useLocation();

  if (Capacitor.isNativePlatform()) {
    return <WelcomePage />;
  } else {
    // On web, skip welcome screen and go to home
    setTimeout(() => setLocation("/home"), 0);
    return null;
  }
}

function Router() {
  return (
    <Switch>
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
  );
}

import { SplashScreen } from "@capacitor/splash-screen";
import { useEffect } from "react";

function App() {
  useEffect(() => {
    // Hide splash screen after app mounts
    if (Capacitor.isNativePlatform()) {
      SplashScreen.hide();
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <CustomerAuthProvider>
          <AdminAuthProvider>
            <AdminSSEProvider>
              <TooltipProvider>
                <Toaster />
                <SonnerToaster position="top-center" richColors />
                <Router />
                <PWAInstallPrompt />
              </TooltipProvider>
            </AdminSSEProvider>
          </AdminAuthProvider>
        </CustomerAuthProvider>
      </CartProvider>
    </QueryClientProvider>
  );
}

export default App;
