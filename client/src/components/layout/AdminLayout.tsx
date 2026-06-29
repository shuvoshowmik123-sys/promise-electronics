import { Link, useLocation } from "wouter";
import { adminNavGroups } from "@/lib/app-config";
import { LogOut, UserCog, Menu, Loader2 } from "lucide-react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useEffect } from "react";
import { toast } from "sonner";
import { CommandPalette } from "@/components/admin/shared/CommandPalette";
import { ReminderBell } from "@/components/admin/ReminderBell";
import { TeamChatPanel } from "@/components/admin/TeamChatPanel";
import { AdminPwaInstallPrompt } from "@/components/admin/AdminPwaInstallPrompt";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading, logout, hasPermission } = useAdminAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/admin/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  // Staff presence heartbeat (Phase B) — ping every 30s while tab focused
  useEffect(() => {
    if (!isAuthenticated) return;

    const ping = () => {
      if (document.visibilityState === 'visible') {
        fetch('/api/users/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ channels: ['messenger', 'whatsapp'] }),
        }).catch(() => {});
      }
    };

    ping(); // immediate ping on mount
    const interval = setInterval(ping, 30_000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') ping();
      else {
        // Tab hidden → mark away
        fetch('/api/users/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ channels: [], status: 'away' }),
        }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      // Mark offline on unmount (logout / navigation away from admin)
      fetch('/api/users/presence', { method: 'DELETE', credentials: 'include' }).catch(() => {});
    };
  }, [isAuthenticated]);

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

  // Check permission for a single item
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
      "/admin/system-health": "systemHealth",
      "/admin/inquiries": "inquiries",
      "/admin/corporate": "corporate",
      "/admin/technician": "technician",
    };
    const permission = permissionMap[href];
    if (!permission) return true;
    return hasPermission(permission as any);
  };

  // Filter groups based on permissions
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
      <div className="flex min-h-screen w-full bg-slate-50/50 dark:bg-slate-900/50">
        <Sidebar>
          <SidebarContent className="bg-sidebar text-sidebar-foreground">
            <div className="p-6 flex items-center gap-3">
              <img src="/logo.png" alt="Promise Electronics" className="h-10 w-10 object-contain rounded-md" />
              <h2 className="text-xl font-heading font-bold text-sidebar-primary-foreground leading-none">PROMISE<br /><span className="text-sm font-semibold tracking-widest uppercase text-sidebar-primary">ADMIN</span></h2>
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
            <div className="mt-auto p-4 border-t border-sidebar-border space-y-2">
              <Link href="/admin/account" className="flex items-center gap-3 rounded-md p-2 -mx-2 hover:bg-sidebar-accent cursor-pointer transition-colors">
                <Avatar>
                  <AvatarFallback>{user ? getInitials(user.name) : "AD"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{user?.name || "Admin User"}</p>
                  <p className="text-xs text-muted-foreground">{user?.role || "User"}</p>
                </div>
              </Link>
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
          <header className="h-14 border-b bg-background px-5 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <h1 className="text-lg font-semibold capitalize">
                {location.split("/").pop() || "Dashboard"}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <ReminderBell />
              <Link href="/admin/account">
                <Button variant="ghost" size="icon" title="My Account">
                  <UserCog className="h-5 w-5" />
                </Button>
              </Link>
            </div>
          </header>
          <main className="flex-1 p-5 overflow-auto">
            {children}
          </main>
        </div>
        <CommandPalette />
        <TeamChatPanel />
        <AdminPwaInstallPrompt />
      </div>
    </SidebarProvider>
  );
}
