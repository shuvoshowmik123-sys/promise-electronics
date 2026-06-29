import { Switch, Route, useLocation, Redirect } from "wouter";
import { Suspense, lazy } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminAIChatLauncher } from "@/components/AdminAIChatLauncher";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { StaffOnboardingGuide } from "@/components/admin/StaffOnboardingGuide";
import { useAdminAuth, getRoleLandingPath } from "@/contexts/AdminAuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Loader2 } from "lucide-react";

// The new unified Admin SPA
const DesignConcept = lazy(() => import("@/pages/admin/design-concept"));

// Admin Login
const AdminLoginPage = lazy(() => import("@/pages/admin/login"));

// Staff Setup (public — no auth required)
const StaffSetupPage = lazy(() => import("@/pages/admin/staff-setup"));

// Standalone Print Views (Not part of the Bento Dashboard Shell)
const CorporateBillPrint = lazy(() => import("@/pages/admin/corporate-bill-print"));

// Account Settings (inside admin shell)
const AccountSettingsPage = lazy(() => import("@/pages/admin/account-settings"));

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
    const { status, user } = useAdminAuth();

    // Public setup page (no auth required — render before auth check)
    if (location.startsWith("/admin/setup/")) {
        return (
            <Suspense fallback={<AdminContentSkeleton />}>
                <Switch>
                    <Route path="/admin/setup/:token" component={StaffSetupPage} />
                </Switch>
            </Suspense>
        );
    }

    // While checking auth, show a spinner (prevents flash-redirect)
    if (status === "pending") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-100">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    // Show login page when unauthenticated
    if (status === "unauthenticated") {
        if (location === "/admin/login") {
            return (
                <Suspense fallback={<AdminContentSkeleton />}>
                    <AdminLoginPage />
                </Suspense>
            );
        }
        return <Redirect to="/admin/login" />;
    }

    // Authenticated user on login page → redirect to role-based landing
    if (location === "/admin/login") {
        return <Redirect to={getRoleLandingPath(user?.role || "")} />;
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

    // Account Settings Route (inside admin layout)
    if (location === "/admin/account") {
        return (
            <AdminLayout>
                <Suspense fallback={<AdminContentSkeleton />}>
                    <AccountSettingsPage />
                </Suspense>
                <AdminAIChatLauncher />
            </AdminLayout>
        );
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
                <StaffOnboardingGuide />
            </>
        );
    }

    // Fallback if somehow reached here without /admin
    return null;
}
