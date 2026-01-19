import { Link, useLocation } from "wouter";
import { adminNavGroups } from "@/lib/mock-data";
import { LogOut, Bell, Settings, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useEffect } from "react";
import { toast } from "sonner";

/**
 * AdminLayoutShell - A stable shell component that wraps admin pages.
 * The sidebar and header never re-render when switching between admin pages.
 * Only the children (content area) changes.
 */
export function AdminLayoutShell({ children }: { children: React.ReactNode }) {
    const [location, setLocation] = useLocation();
    const { user, isAuthenticated, isLoading, logout, hasPermission } = useAdminAuth();

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            setLocation("/admin/login");
        }
    }, [isLoading, isAuthenticated, setLocation]);

    const handleLogout = async () => {
        await logout();
        toast.success("Logged out successfully");
        setLocation("/admin/login");
    };

    const getInitials = (name: string) => {
        return name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
    };

    const checkPermission = (href: string) => {
        const permissionMap: Record<string, string> = {
            "/admin": "dashboard",
            "/admin/overview": "jobs",
            "/admin/jobs": "jobs",
            "/admin/inventory": "inventory",
            "/admin/pos": "pos",
            "/admin/challan": "challans",
            "/admin/finance": "finance",
            "/admin/reports": "reports",
            "/admin/staff-attendance": "attendance",
            "/admin/users": "users",
            "/admin/settings": "settings",
            "/admin/service-requests": "serviceRequests",
            "/admin/pickup-schedule": "serviceRequests",
            "/admin/orders": "orders",
            "/admin/customers": "users",
        };
        const permission = permissionMap[href];
        if (!permission) return true;
        return hasPermission(permission as any);
    };

    const filteredNavGroups = adminNavGroups.map(group => ({
        ...group,
        items: group.items.filter(item => checkPermission(item.href))
    })).filter(group => group.items.length > 0);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-100">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return null;
    }

    return (
        <SidebarProvider>
            <div className="flex min-h-screen w-full bg-slate-50/50">
                <Sidebar>
                    <SidebarContent className="bg-sidebar text-sidebar-foreground">
                        <div className="p-6">
                            <h2 className="text-xl font-heading font-bold text-sidebar-primary-foreground">PROMISE<br /><span className="text-sidebar-primary">ADMIN</span></h2>
                        </div>
                        {filteredNavGroups.map((group) => (
                            <SidebarGroup key={group.title}>
                                <SidebarGroupLabel className="text-sidebar-foreground/70 font-medium px-2 py-1 text-xs uppercase tracking-wider">
                                    {group.title}
                                </SidebarGroupLabel>
                                <SidebarGroupContent>
                                    <SidebarMenu>
                                        {group.items.map((item) => (
                                            <SidebarMenuItem key={item.href}>
                                                <SidebarMenuButton
                                                    asChild
                                                    isActive={location === item.href}
                                                    className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground"
                                                >
                                                    <Link href={item.href}>
                                                        <item.icon className="h-4 w-4" />
                                                        <span>{item.label}</span>
                                                    </Link>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        ))}
                                    </SidebarMenu>
                                </SidebarGroupContent>
                            </SidebarGroup>
                        ))}
                        <div className="mt-auto p-4 border-t border-sidebar-border">
                            <div className="flex items-center gap-3 mb-4">
                                <Avatar>
                                    <AvatarFallback>{user ? getInitials(user.name) : "AD"}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="text-sm font-medium">{user?.name || "Admin User"}</p>
                                    <p className="text-xs text-muted-foreground">{user?.role || "User"}</p>
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                className="w-full justify-start bg-sidebar-accent/10 border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                onClick={handleLogout}
                                data-testid="button-admin-logout"
                            >
                                <LogOut className="mr-2 h-4 w-4" /> Sign Out
                            </Button>
                        </div>
                    </SidebarContent>
                </Sidebar>

                <div className="flex-1 flex flex-col">
                    <header className="h-16 border-b bg-background px-6 flex items-center justify-between sticky top-0 z-10">
                        <div className="flex items-center gap-4">
                            <SidebarTrigger />
                            <h1 className="text-lg font-semibold capitalize">
                                {location.split("/").pop() || "Dashboard"}
                            </h1>
                        </div>
                        <div className="flex items-center gap-4">
                            <Button variant="ghost" size="icon">
                                <Bell className="h-5 w-5" />
                            </Button>
                            <Button variant="ghost" size="icon">
                                <Settings className="h-5 w-5" />
                            </Button>
                        </div>
                    </header>
                    <main className="flex-1 p-6 overflow-auto">
                        {children}
                    </main>
                </div>
            </div>
        </SidebarProvider>
    );
}
