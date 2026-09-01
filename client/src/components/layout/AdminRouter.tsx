import { Switch, Route, useLocation, Redirect } from "wouter";
import { Suspense, lazy } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminAIChatLauncher } from "@/components/AdminAIChatLauncher";
import { StaffOnboardingGuide } from "@/components/admin/StaffOnboardingGuide";
import { useAdminAuth, getRoleLandingPath } from "@/contexts/AdminAuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Loader2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";

// The new unified Admin SPA
const DesignConcept = lazy(() => import("@/pages/admin/design-concept"));

// Admin Login
const AdminLoginPage = lazy(() => import("@/pages/admin/login"));
const AdminResetPasswordPage = lazy(() => import("@/pages/admin/reset-password"));

// Staff Setup (public — no auth required)
const StaffSetupPage = lazy(() => import("@/pages/admin/staff-setup"));

// Where the Android app is handed out (public — see below)
const GetAppPage = lazy(() => import("@/pages/admin/get-app"));

// Versions, update state, and a manual check — see about-app.tsx
const AboutAppPage = lazy(() => import("@/pages/admin/about-app"));

// TEMPORARY: push connection test bench. Delete with server/routes/push-test.routes.ts.
const PushTestPage = lazy(() => import("@/pages/admin/push-test"));

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

    /**
     * The app download page, open to anyone holding the link.
     *
     * Checked before the auth gate on purpose. A new member of staff installs
     * the app before they have an account to sign in with, so putting this
     * behind the login makes it a door that only opens from inside. Nothing on
     * it is private — the build is a public release and the page names no
     * customer, job or figure.
     */
    if (location.startsWith("/admin/get-app")) {
        return (
            <Suspense fallback={<AdminContentSkeleton />}>
                <GetAppPage />
            </Suspense>
        );
    }

    /**
     * About the app: which version is installed, which is published, and
     * whether an update is waiting.
     *
     * The installed app only. Every number on it — the APK version, the web
     * bundle running inside it, whether an update is staged for next launch —
     * describes something a browser does not have. A browser fetches the newest
     * build every time it loads a page; there is no version to be behind on and
     * nothing to check, so the screen would be four rows of "latest" and a
     * button that does nothing.
     *
     * The route is guarded, not just the menu entry. Hiding a link is not the
     * same as the page not existing: this URL is bookmarkable, and it is also
     * where the app's own update banner points.
     *
     * Reachable while signed out, like get-app — someone whose app is
     * misbehaving needs to read its version, and failing to sign in is one of
     * the ways an app misbehaves.
     */
    if (location.startsWith("/admin/about-app")) {
        if (!Capacitor.isNativePlatform()) return <Redirect to="/admin" />;
        return (
            <Suspense fallback={<AdminContentSkeleton />}>
                <AboutAppPage />
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

    // Reset links work while signed OUT — that is the point of them. Checked
    // before the auth gate, or the person holding a valid link is bounced to
    // the login page they cannot get past.
    if (location.startsWith("/admin/reset-password")) {
        return (
            <Suspense fallback={<AdminContentSkeleton />}>
                <AdminResetPasswordPage />
            </Suspense>
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
        return <Redirect to="/admin/jobs" />;
    }

    // /admin/account is a canonical workspace path (design-concept account tab).
    // Do not redirect to hash — ROUTING-01A path parser reads it.

    /**
     * TEMPORARY: the push connection test bench.
     *
     * Standalone rather than a tab in the panel so that removing it later is
     * deleting a file and a route, with nothing left behind in the shell's
     * navigation. Super admin is enforced on the server as well; the check in
     * the page only decides what is drawn.
     */
    if (location.startsWith("/admin/push-test")) {
        return (
            <Suspense fallback={<AdminContentSkeleton />}>
                <PushTestPage />
            </Suspense>
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
