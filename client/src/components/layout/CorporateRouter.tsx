
import { Switch, Route, useLocation } from "wouter";
import { Suspense, lazy, useEffect } from "react";
import { CorporateLayoutShell } from "./CorporateLayoutShell";
import { useCorporateAuth } from "@/contexts/CorporateAuthContext";
import { useModules } from "@/contexts/ModuleContext";
import { CorporateErrorBoundary } from "@/components/corporate/CorporateErrorBoundary";
import {
    DashboardSkeleton,
    TableSkeleton,
    ChatSkeleton,
    ProfileSkeleton,
    GenericSkeleton,
} from "@/components/corporate/CorporatePageSkeleton";

// Lazy load corporate pages
const CorporateDashboard = lazy(() => import("@/pages/corporate/dashboard"));
const CorporateJobTracker = lazy(() => import("@/pages/corporate/job-tracker"));
const CorporateJobDetails = lazy(() => import("@/pages/corporate/job-details"));
const CorporateServiceRequest = lazy(() => import("@/pages/corporate/service-request"));
const CorporateProfile = lazy(() => import("@/pages/corporate/profile"));
const CorporateLogin = lazy(() => import("@/pages/corporate/login"));
const CorporateNotificationsPage = lazy(() => import("@/pages/corporate/notifications"));
const CorporateMessagesPage = lazy(() => import("@/pages/corporate/messages"));
const CorporateNotFoundPage = lazy(() => import("@/pages/corporate/corporate-not-found"));

// Skeleton mapping for each route
function getSkeletonForRoute(location: string) {
    if (location.includes('/dashboard')) return <DashboardSkeleton />;
    if (location.includes('/jobs')) return <TableSkeleton />;
    if (location.includes('/notifications')) return <TableSkeleton rows={8} />;
    if (location.includes('/messages')) return <ChatSkeleton />;
    if (location.includes('/profile')) return <ProfileSkeleton />;
    if (location.includes('/service-request')) return <GenericSkeleton />;
    return <GenericSkeleton />;
}

function CorporateGuard({ children }: { children: React.ReactNode }) {
    const { user, isLoading } = useCorporateAuth();
    const [location, setLocation] = useLocation();

    useEffect(() => {
        if (!isLoading && !user) {
            setLocation("/corporate/login");
        }
    }, [user, isLoading, setLocation]);

    if (isLoading) {
        return getSkeletonForRoute(location);
    }

    if (!user) {
        return null;
    }

    return <>{children}</>;
}

function CorporateModuleGuard({ module, children }: { module: string, children: React.ReactNode }) {
    const { isEnabled } = useModules();
    if (!isEnabled(module, "corporate")) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] bg-white rounded-xl border border-slate-100 shadow-sm m-6">
                <h1 className="text-2xl font-bold text-slate-800 mb-2">Module Disabled</h1>
                <p className="text-slate-500">This feature is currently disabled for the corporate portal.</p>
            </div>
        );
    }
    return <>{children}</>;
}

export function CorporateRouter() {
    const [location] = useLocation();

    // Login page should not have the shell or guard
    if (location === "/corporate/login") {
        return (
            <Suspense fallback={<GenericSkeleton />}>
                <CorporateLogin />
            </Suspense>
        );
    }

    return (
        <CorporateGuard>
            <CorporateLayoutShell>
                <Suspense key={location} fallback={getSkeletonForRoute(location)}>
                    <Switch>
                        <Route path="/corporate/dashboard">
                            {() => (
                                <CorporateErrorBoundary fallbackTitle="Dashboard Error">
                                    <CorporateModuleGuard module="dashboard">
                                        <CorporateDashboard />
                                    </CorporateModuleGuard>
                                </CorporateErrorBoundary>
                            )}
                        </Route>
                        <Route path="/corporate/jobs" >
                            {() => (
                                <CorporateErrorBoundary fallbackTitle="Job Tracker Error">
                                    <CorporateModuleGuard module="jobs">
                                        <CorporateJobTracker />
                                    </CorporateModuleGuard>
                                </CorporateErrorBoundary>
                            )}
                        </Route>
                        <Route path="/corporate/jobs/:id">
                            {() => (
                                <CorporateErrorBoundary fallbackTitle="Job Details Error">
                                    <CorporateModuleGuard module="jobs">
                                        <CorporateJobDetails />
                                    </CorporateModuleGuard>
                                </CorporateErrorBoundary>
                            )}
                        </Route>
                        <Route path="/corporate/service-request">
                            {() => (
                                <CorporateErrorBoundary fallbackTitle="Service Request Error">
                                    <CorporateModuleGuard module="service_requests">
                                        <CorporateServiceRequest />
                                    </CorporateModuleGuard>
                                </CorporateErrorBoundary>
                            )}
                        </Route>
                        <Route path="/corporate/profile">
                            {() => (
                                <CorporateErrorBoundary fallbackTitle="Profile Error">
                                    <CorporateProfile />
                                </CorporateErrorBoundary>
                            )}
                        </Route>
                        <Route path="/corporate/notifications">
                            {() => (
                                <CorporateErrorBoundary fallbackTitle="Notifications Error">
                                    <CorporateModuleGuard module="notifications">
                                        <CorporateNotificationsPage />
                                    </CorporateModuleGuard>
                                </CorporateErrorBoundary>
                            )}
                        </Route>
                        <Route path="/corporate/messages">
                            {() => (
                                <CorporateErrorBoundary fallbackTitle="Messages Error">
                                    <CorporateModuleGuard module="corporate_messages">
                                        <CorporateMessagesPage />
                                    </CorporateModuleGuard>
                                </CorporateErrorBoundary>
                            )}
                        </Route>

                        {/* Default redirect to dashboard */}
                        <Route path="/corporate" component={CorporateRootRedirect} />
                        {/* Fallback for unknown corporate routes */}
                        <Route>
                            {() => <CorporateNotFoundPage />}
                        </Route>
                    </Switch>
                </Suspense>
            </CorporateLayoutShell>
        </CorporateGuard>
    );
}

function CorporateRootRedirect() {
    const [, setLocation] = useLocation();
    useEffect(() => {
        setLocation("/corporate/dashboard");
    }, [setLocation]);
    return null;
}

