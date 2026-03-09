import { lazy, Suspense } from "react";
import { Switch, Route, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { PublicLayout } from "./PublicLayout";
import { PageSkeleton } from "@/components/PageSkeleton";
import { useModules } from "@/contexts/ModuleContext";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CustomerErrorBoundary } from "@/components/customer/CustomerErrorBoundary";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

// Lazy load web pages
const NotFound = lazy(() => import("@/pages/not-found"));
const HomePage = lazy(() => import("@/pages/home"));
const ShopPage = lazy(() => import("@/pages/shop"));
const CartPage = lazy(() => import("@/pages/cart"));
const CheckoutPage = lazy(() => import("@/pages/checkout"));
const RepairRequestPage = lazy(() => import("@/pages/repair-request"));
const ServicesPage = lazy(() => import("@/pages/services"));
const ServiceDetailsPage = lazy(() => import("@/pages/service-details"));
const GetQuotePage = lazy(() => import("@/pages/get-quote"));
const QuoteApprovalPage = lazy(() => import("@/pages/quote-approval"));
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

function RootRoute() {
    const [, setLocation] = useLocation();
    setTimeout(() => setLocation("/home"), 0);
    return null;
}

function CustomerModuleGuard({ module, children }: { module: string, children: React.ReactNode }) {
    const { isEnabled } = useModules();
    if (!isEnabled(module, "customer")) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 animate-in fade-in duration-500">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6 shadow-neumorph">
                    <AlertCircle className="w-10 h-10 text-slate-400" />
                </div>
                <h2 className="text-3xl font-heading font-bold text-slate-800 mb-2">Feature Coming Soon</h2>
                <p className="text-muted-foreground max-w-md mx-auto mb-8 text-lg">
                    This section ({module.toLowerCase()}) is currently being updated and will be available soon. Please check back later.
                </p>
                <Button onClick={() => window.history.back()} variant="outline" className="shadow-neumorph">
                    Go Back
                </Button>
            </div>
        );
    }
    return <>{children}</>;
}

function CustomerProtectedRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useCustomerAuth();
    const [, setLocation] = useLocation();

    if (isLoading) return <PageSkeleton />;

    if (!isAuthenticated) {
        setTimeout(() => setLocation("/login"), 0);
        return null;
    }

    return <>{children}</>;
}

export function CustomerRouter() {
    const [location] = useLocation();

    return (
        <PublicLayout>
            <AnimatePresence mode="wait">
                <motion.div
                    key={location}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="w-full h-full"
                >
                    <Suspense fallback={<PageSkeleton />}>
                        <ErrorBoundary name="CustomerRouter">
                            <Switch location={location}>
                                <Route path="/" component={RootRoute} />
                                <Route path="/home">
                                    <CustomerErrorBoundary fallbackTitle="Home Error"><HomePage /></CustomerErrorBoundary>
                                </Route>

                                <Route path="/shop">
                                    <CustomerErrorBoundary fallbackTitle="Shop Error">
                                        <CustomerModuleGuard module="customer_shop"><ShopPage /></CustomerModuleGuard>
                                    </CustomerErrorBoundary>
                                </Route>
                                <Route path="/cart">
                                    <CustomerErrorBoundary fallbackTitle="Cart Error">
                                        <CustomerModuleGuard module="customer_shop"><CartPage /></CustomerModuleGuard>
                                    </CustomerErrorBoundary>
                                </Route>
                                <Route path="/checkout">
                                    <CustomerErrorBoundary fallbackTitle="Checkout Error">
                                        <CustomerModuleGuard module="customer_shop"><CheckoutPage /></CustomerModuleGuard>
                                    </CustomerErrorBoundary>
                                </Route>

                                <Route path="/repair">
                                    <CustomerErrorBoundary fallbackTitle="Repair Request Error">
                                        <CustomerModuleGuard module="service_requests"><RepairRequestPage /></CustomerModuleGuard>
                                    </CustomerErrorBoundary>
                                </Route>

                                <Route path="/services">
                                    <CustomerErrorBoundary fallbackTitle="Services Error"><ServicesPage /></CustomerErrorBoundary>
                                </Route>
                                <Route path="/services/:id">
                                    <CustomerErrorBoundary fallbackTitle="Service Details Error"><ServiceDetailsPage /></CustomerErrorBoundary>
                                </Route>
                                <Route path="/get-quote">
                                    <CustomerErrorBoundary fallbackTitle="Quote Request Error"><GetQuotePage /></CustomerErrorBoundary>
                                </Route>
                                <Route path="/quote/:token">
                                    <CustomerErrorBoundary fallbackTitle="Quote Approval Error"><QuoteApprovalPage /></CustomerErrorBoundary>
                                </Route>
                                <Route path="/track-order">
                                    <CustomerErrorBoundary fallbackTitle="Track Order Error"><TrackOrderPage /></CustomerErrorBoundary>
                                </Route>

                                <Route path="/track">
                                    <CustomerErrorBoundary fallbackTitle="Track Job Error">
                                        <CustomerModuleGuard module="customer_track"><TrackJobPage /></CustomerModuleGuard>
                                    </CustomerErrorBoundary>
                                </Route>
                                <Route path="/support">
                                    <CustomerErrorBoundary fallbackTitle="Support Error"><SupportPage /></CustomerErrorBoundary>
                                </Route>
                                <Route path="/my-profile">
                                    <CustomerErrorBoundary fallbackTitle="Profile Error">
                                        <CustomerProtectedRoute><MyProfilePage /></CustomerProtectedRoute>
                                    </CustomerErrorBoundary>
                                </Route>
                                <Route path="/my-warranties">
                                    <CustomerErrorBoundary fallbackTitle="Warranties Error">
                                        <CustomerProtectedRoute><MyWarrantiesPage /></CustomerProtectedRoute>
                                    </CustomerErrorBoundary>
                                </Route>
                                <Route path="/about">
                                    <CustomerErrorBoundary fallbackTitle="About Error"><AboutPage /></CustomerErrorBoundary>
                                </Route>
                                <Route path="/privacy-policy" component={PrivacyPolicyPage} />
                                <Route path="/warranty-policy" component={WarrantyPolicyPage} />
                                <Route path="/terms-and-conditions" component={TermsAndConditionsPage} />
                                <Route path="/login" component={LoginPage} />
                                <Route component={NotFound} />
                            </Switch>
                        </ErrorBoundary>
                    </Suspense>
                </motion.div>
            </AnimatePresence>
        </PublicLayout>
    );
}
