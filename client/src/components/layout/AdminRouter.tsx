import { Switch, Route, useLocation, Redirect } from "wouter";
import { Suspense, lazy } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminAIChatLauncher } from "@/components/AdminAIChatLauncher";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// The new unified Admin SPA
const DesignConcept = lazy(() => import("@/pages/admin/design-concept"));

// Standalone Print Views (Not part of the Bento Dashboard Shell)
const CorporateBillPrint = lazy(() => import("@/pages/admin/corporate-bill-print"));

// Super Admin Workbench (Standalone)
const SuperAdminWorkbench = lazy(() => import("@/pages/admin/workbench"));

// Loading skeleton for admin content - shown during page transitions
function AdminContentSkeleton() {
    return (
        <div className="space-y-6 animate-pulse p-8">
            {/* Stats row skeleton */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="rounded-xl border bg-card p-6 space-y-3">
                        <div className="flex items-center justify-between">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-4 w-4" />
                        </div>
                        <Skeleton className="h-8 w-20" />
                        <Skeleton className="h-3 w-32" />
                    </div>
                ))}
            </div>

            {/* Content area skeleton */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <div className="col-span-4 rounded-xl border bg-card p-6 space-y-4">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-[300px] w-full" />
                </div>
                <div className="col-span-3 rounded-xl border bg-card p-6 space-y-4">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-[300px] w-full" />
                </div>
            </div>
        </div>
    );
}

export function AdminRouter() {
    const [location] = useLocation();
    const { status } = useAdminAuth();

    if (status === "unauthenticated" && location !== "/admin/login") {
        return <Redirect to="/admin/login" />;
    }

    // Standalone Routes
    if (location.includes("/corporate/bills/") && location.includes("/print")) {
        return (
            <Suspense fallback={<AdminContentSkeleton />}>
                <Switch>
                    <Route path="/admin/corporate/bills/:id/print" component={CorporateBillPrint} />
                </Switch>
            </Suspense>
        );
    }

    // Legacy Redirects
    if (location.startsWith("/admin/repairs")) {
        return <Redirect to="/admin#jobs" />;
    }

    // Super Admin Workbench Route
    if (location === "/admin/workbench") {
        return (
            <Suspense fallback={<AdminContentSkeleton />}>
                <SuperAdminWorkbench />
            </Suspense>
        );
    }

    // Capture all other /admin routes and serve the Bento SPA
    if (location.startsWith("/admin")) {
        return (
            <>
                <Suspense fallback={<AdminContentSkeleton />}>
                    <ErrorBoundary name="AdminPanel">
                        <DesignConcept />
                    </ErrorBoundary>
                </Suspense>
                <AdminAIChatLauncher />
            </>
        );
    }

    // Fallback if somehow reached here without /admin
    return null;
}
