import { Route, Switch, useLocation } from "wouter";
import { useEffect } from "react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useModules } from "@/contexts/ModuleContext";
import { TechLayout } from "./TechLayout";
import { TechDashboard } from "@/pages/tech/TechDashboard";
import { Loader2 } from "lucide-react";

function TechModuleGuard({ module, children }: { module: string, children: React.ReactNode }) {
    const { isEnabled } = useModules();
    if (!isEnabled(module, "technician")) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <h1 className="text-2xl font-bold text-slate-800 mb-2">Module Disabled</h1>
                <p className="text-slate-500">This feature is currently disabled for the technician portal.</p>
            </div>
        );
    }
    return <>{children}</>;
}

export function TechRouter() {
    const { user, isLoading } = useAdminAuth();
    const [, setLocation] = useLocation();

    useEffect(() => {
        if (!isLoading && !user) {
            setLocation("/admin/login");
        } else if (!isLoading && user && !['Technician', 'developer', 'Super Admin'].includes(user.role)) {
            // If someone tries to access /tech but they are an admin, bump them to /admin
            setLocation("/admin");
        }
    }, [user, isLoading, setLocation]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!user || !['Technician', 'developer', 'Super Admin'].includes(user.role)) {
        return null; // Will redirect via useEffect
    }

    return (
        <TechLayout>
            <Switch>
                <Route path="/tech">
                    <TechModuleGuard module="technician_view">
                        <TechDashboard />
                    </TechModuleGuard>
                </Route>
                {/* Add more tech-specific routes here as we build them out */}
                <Route>
                    <div className="flex flex-col items-center justify-center min-h-[60vh]">
                        <h1 className="text-2xl font-bold text-slate-800 mb-2">404 - Tech Portal Module Not Found</h1>
                        <p className="text-slate-500">The component you are looking for does not exist in the workbench.</p>
                    </div>
                </Route>
            </Switch>
        </TechLayout>
    );
}
