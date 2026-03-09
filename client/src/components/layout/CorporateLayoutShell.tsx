import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useCorporateAuth } from "@/contexts/CorporateAuthContext";
import { motion } from "framer-motion";
import {
    LayoutDashboard,
    ClipboardList,
    User,
    LogOut,
    Menu,
    Bell,
    Building2,
    Loader2,
    Wrench,
    MessageSquare,
    Search,
    ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { CorporateNotificationsBell } from "@/components/corporate/CorporateNotificationsBell";
import { CorporateBrandingHeader } from "@/components/corporate/CorporateBrandingHeader";


export function CorporateLayoutShell({ children }: { children: React.ReactNode }) {
    const [location, setLocation] = useLocation();
    const { user, logout, isAuthenticated, isLoading } = useCorporateAuth();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            setLocation("/corporate/login");
        }
    }, [isLoading, isAuthenticated, setLocation]);

    // UX: Prevent non-corporate users from accessing this portal
    useEffect(() => {
        if (user && user.role !== 'Corporate') {
            if (['Super Admin', 'Manager', 'Technician', 'Cashier'].includes(user.role)) {
                const timer = setTimeout(() => setLocation("/admin"), 1500);
                return () => clearTimeout(timer);
            }
        }
    }, [user, setLocation]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-white">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--corp-blue)]" />
            </div>
        );
    }

    if (!isAuthenticated) return null;

    if (user && user.role !== 'Corporate') {
        return (
            <div className="flex flex-col items-center justify-center h-screen space-y-4 bg-slate-50">
                <Loader2 className="w-8 h-8 animate-spin text-destructive" />
                <p className="text-muted-foreground">Access Denied. Redirecting...</p>
            </div>
        );
    }

    const navItems = [
        { label: "Dashboard", icon: LayoutDashboard, href: "/corporate/dashboard" },
        { label: "Job Tracker", icon: ClipboardList, href: "/corporate/jobs" },
        { label: "Request Service", icon: Wrench, href: "/corporate/service-request" },
        { label: "Messages", icon: MessageSquare, href: "/corporate/messages" },
        { label: "My Profile", icon: User, href: "/corporate/profile" },
    ];

    const SidebarContent = () => (
        <div className="flex flex-col h-full bg-white border-r border-slate-100 shadow-sm relative overflow-hidden">
            {/* Glossy Header Effect */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[var(--corp-blue)] to-cyan-400"></div>

            {/* Branding Header */}
            <CorporateBrandingHeader size="compact" />

            <nav className="flex-1 px-4 space-y-2 mt-4">
                {navItems.map((item) => {
                    const isActive = location === item.href;
                    return (
                        <Link key={item.href} href={item.href}>
                            <div
                                className={`
                                    group relative flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 cursor-pointer text-sm font-medium
                                    ${isActive
                                        ? "text-white"
                                        : "text-slate-500 hover:bg-slate-50 hover:text-[var(--corp-blue)] hover:translate-x-1"
                                    }
                                    corp-btn-glow
                                `}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="corporate-sidebar-indicator"
                                        className="absolute inset-0 bg-[var(--corp-blue)] rounded-xl shadow-md shadow-blue-200"
                                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                                    />
                                )}
                                <item.icon className={`relative z-10 w-5 h-5 transition-transform duration-300 ${isActive ? "scale-110" : "group-hover:scale-110"}`} />
                                <span className="relative z-10">{item.label}</span>
                                {isActive && (
                                    <div className="relative z-10 ml-auto w-1.5 h-1.5 rounded-full bg-white opacity-50 animate-pulse"></div>
                                )}
                            </div>
                        </Link>
                    )
                })}
            </nav>

            <div className="p-4 m-4 rounded-2xl bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--corp-blue)] flex items-center justify-center text-white font-bold text-xs ring-2 ring-blue-100">
                        ?
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-slate-800">Need Help?</p>
                        <p className="text-[10px] text-slate-500">Contact Support</p>
                    </div>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-8 corp-btn-glow"
                    onClick={() => setLocation("/corporate/messages")}
                >
                    Open Ticket
                </Button>
            </div>
        </div>
    );

    return (
        <div className="flex h-screen bg-[var(--corp-bg-subtle)] text-slate-800 font-sans">
            {/* Desktop Sidebar */}
            <div className="hidden md:flex w-72 flex-col fixed inset-y-0 z-50 transition-all duration-300">
                <SidebarContent />
            </div>

            {/* Mobile Header */}
            <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-md z-40 flex items-center justify-between px-4 border-b border-slate-100 shadow-sm">
                <div className="font-bold flex items-center gap-2 text-slate-800">
                    <Building2 className="h-6 w-6 text-[var(--corp-blue)]" />
                    <span>Promise Corporate Portal</span>
                </div>
                <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" className="corp-btn-glow">
                            <Menu className="h-6 w-6 text-slate-600" />
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="p-0 border-r-0 w-72">
                        <SidebarContent />
                    </SheetContent>
                </Sheet>
            </div>

            {/* Main Content Wrapper */}
            <main className="flex-1 md:ml-72 pt-16 md:pt-0 overflow-auto h-screen transition-all">
                {/* Desktop Top Header */}
                <header className="hidden md:flex sticky top-0 z-30 h-18 bg-white/80 backdrop-blur-md border-b border-slate-100 px-8 items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                        <div className="relative w-full max-w-md hidden lg:block">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Search your jobs..."
                                className="pl-10 bg-slate-50 border-transparent focus:bg-white focus:border-[var(--corp-blue)] transition-all duration-300 rounded-full h-10 w-full"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <CorporateNotificationsBell />

                        <div className="h-6 w-px bg-slate-200"></div>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="flex items-center gap-3 px-2 hover:bg-slate-50 rounded-full corp-btn-glow">
                                    <div className="text-right hidden xl:block">
                                        <p className="text-sm font-semibold text-slate-700 leading-none">{user?.name}</p>
                                        <p className="text-xs text-slate-500 mt-1">{user?.username}</p>
                                    </div>
                                    <Avatar className="h-9 w-9 ring-2 ring-[var(--corp-blue)] ring-offset-2">
                                        <AvatarImage src="" />
                                        <AvatarFallback className="bg-gradient-to-br from-[var(--corp-blue)] to-cyan-500 text-white font-medium">
                                            {user?.name?.[0]}
                                        </AvatarFallback>
                                    </Avatar>
                                    <ChevronDown className="h-4 w-4 text-slate-400" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 mt-2">
                                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="cursor-pointer" onClick={() => setLocation("/corporate/profile")}>
                                    <User className="mr-2 h-4 w-4" /> Profile
                                </DropdownMenuItem>
                                <DropdownMenuItem className="cursor-pointer" onClick={() => setLocation("/corporate/notifications")}>
                                    <Bell className="mr-2 h-4 w-4" /> Notifications
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="cursor-pointer text-red-600 focus:text-red-600" onClick={() => logout()}>
                                    <LogOut className="mr-2 h-4 w-4" /> Log out
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </header>

                <div className="p-4 md:p-8 max-w-7xl mx-auto animate-slide-up">
                    {children}
                </div>
                {/* Floating Chat Button used to be here */}
            </main>
        </div>
    );
}
