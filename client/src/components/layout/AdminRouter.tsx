import { Switch, Route, useLocation } from "wouter";
import { Suspense, lazy, memo } from "react";
import { AdminLayoutShell } from "./AdminLayoutShell";
import { Skeleton } from "@/components/ui/skeleton";

// Lazy load admin page CONTENTS (not full pages with layout)
// These components will render without AdminLayout wrapper
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

// Loading skeleton for admin content - shown during page transitions
function AdminContentSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
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

// Memoized shell to prevent re-renders
const StableAdminShell = memo(function StableAdminShell({ children }: { children: React.ReactNode }) {
    return <AdminLayoutShell>{children}</AdminLayoutShell>;
});

export function AdminRouter() {
    const [location] = useLocation();

    return (
        <StableAdminShell>
            <Suspense key={location} fallback={<AdminContentSkeleton />}>
                <Switch>
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
                </Switch>
            </Suspense>
        </StableAdminShell>
    );
}
