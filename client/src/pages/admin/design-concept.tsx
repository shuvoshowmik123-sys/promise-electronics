import { useState, lazy, Suspense, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { variants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { adminNotificationsApi } from "@/lib/api";
import {
    BarChart3, Activity, ShieldAlert, MessageSquare, ClipboardList,
    Truck, ScrollText, ShoppingCart, Monitor, ShoppingBag, Package,
    Banknote, Contact, UserCheck, UserCog, HardHat, Building2,
    FileText, HelpCircle, Settings, Bell, Search, User, Zap,
    PieChart, Users, LineChart, Menu, X, Wrench,
    ShieldCheck, RotateCcw, FileWarning, Brain, WifiOff
} from "lucide-react";

// Contexts
import { RollbackProvider } from "@/contexts/RollbackContext";
import { useModules } from "@/contexts/ModuleContext";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useOffline } from "@/contexts/OfflineContext";

// Shared Components & Utilities
import { OfflineBanner } from "@/components/admin/OfflineBanner";
import { SyncConflictReview } from "@/components/admin/SyncConflictReview";
import { DashboardSkeleton } from "./bento/shared/DashboardSkeleton";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { GlobalSearch } from "./bento/shared/GlobalSearch";
import { NotificationPanel } from "./bento/shared/NotificationPanel";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Lazy-loaded Tabs
const DashboardTab = lazy(() => import("./bento/tabs/DashboardTab"));
const OverviewTab = lazy(() => import("./bento/tabs/OverviewTab"));
const JobTicketsTab = lazy(() => import("./bento/tabs/JobTicketsTab"));
const PickupTab = lazy(() => import("./bento/tabs/PickupTab"));
const ChallanTab = lazy(() => import("./bento/tabs/ChallanTab"));
const ServiceRequestsTab = lazy(() => import("./bento/tabs/ServiceRequestsTab"));

const SystemHealthTab = lazy(() => import("./bento/tabs/SystemHealthTab"));
const FinancesTab = lazy(() => import("./bento/tabs/FinancesTab"));
const InventoryTab = lazy(() => import("./bento/tabs/InventoryTab"));
const UsersTab = lazy(() => import("./bento/tabs/UsersTab"));
const SettingsTab = lazy(() => import("./bento/tabs/SettingsTab"));
const PosTab = lazy(() => import("./bento/tabs/PosTab"));
const OrdersTab = lazy(() => import("./bento/tabs/OrdersTab"));
const PlaceholderTab = lazy(() => import("./bento/tabs/PlaceholderTab"));
const AuditLogsTab = lazy(() => import("./bento/tabs/AuditLogsTab"));
const BrainTab = lazy(() => import("./bento/tabs/BrainTab"));

// New Tabs
const ReportsTab = lazy(() => import("./bento/tabs/ReportsTab"));
const QualityAnalyticsTab = lazy(() => import("./bento/tabs/QualityAnalyticsTab"));
const AttendanceTab = lazy(() => import("./bento/tabs/AttendanceTab"));
const CustomersTab = lazy(() => import("./bento/tabs/CustomersTab"));
const QuotationsTab = lazy(() => import("./bento/tabs/QuotationsTab"));
const InquiriesTab = lazy(() => import("./bento/tabs/InquiriesTab"));
const UnifiedB2BTab = lazy(() => import("./bento/tabs/UnifiedB2BTab"));
const CorporateMessagesAdminTab = lazy(() => import("./bento/tabs/CorporateMessagesTab"));
const PurchasingTab = lazy(() => import("./bento/tabs/PurchasingTab"));
const WarrantyClaimsTab = lazy(() => import("./bento/tabs/WarrantyClaimsTab"));
const WastageTab = lazy(() => import('./bento/tabs/WastageTab'));

// People & Staff Tabs
const SalaryHRTab = lazy(() => import("./bento/tabs/SalaryHRTab"));
const CashierTab = lazy(() => import("./bento/tabs/CashierTab"));
const TechnicianTab = lazy(() => import("./bento/tabs/TechnicianTab"));

export default function DesignConcept() {
    /**
     * Backward-compat: old bookmarks may still reference #corp-repairs.
     * This normalizes them to the current 'b2b' tab identifier.
     * Safe to remove once no legacy URLs are in circulation.
     */
    const normalizeTab = (tab: string) => tab === "corp-repairs" ? "b2b" : tab;
    const isLikelyEntityId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

    const [activeTab, setActiveTab] = useState(() => {
        const hash = window.location.hash.replace("#", "");
        return normalizeTab(hash.split("?")[0] || "dashboard");
    });

    const activeTabRef = useRef(activeTab);
    useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

    const [globalSearchQuery, setGlobalSearchQuery] = useState(() => {
        const hash = window.location.hash.replace("#", "");
        const query = hash.split("?")[1];
        if (query) {
            return new URLSearchParams(query).get("search") || "";
        }
        return "";
    });

    // When deep-linking from System Health, override the job type to fetch all types
    const [jobTypeOverride, setJobTypeOverride] = useState<"all" | "walk-in" | "corporate" | undefined>(undefined);

    useEffect(() => {
        if (activeTab) {
            const currentHash = window.location.hash;
            const hasQuery = currentHash.includes('?');
            if (hasQuery && currentHash.split('?')[0].replace('#', '') === activeTab) {
                // Keep the hash with query intact
            } else {
                window.history.replaceState(null, "", `#${activeTab}`);
            }
        }
    }, [activeTab]);

    useEffect(() => {
        const handleHashChange = () => {
            const rawHash = window.location.hash.replace("#", "");
            const tabName = normalizeTab(rawHash.split("?")[0]);
            const query = rawHash.split("?")[1];

            if (query) {
                const search = new URLSearchParams(query).get("search");
                if (search) setGlobalSearchQuery(search);
            } else {
                setGlobalSearchQuery("");
            }

            if (tabName !== "jobs") {
                setJobTypeOverride(undefined);
            }

            if (tabName && tabName !== activeTabRef.current) {
                setActiveTab(tabName);
            }
        };
        window.addEventListener("hashchange", handleHashChange);
        return () => window.removeEventListener("hashchange", handleHashChange);
    }, []);

    const [selectedCorporateClientId, setSelectedCorporateClientId] = useState<string | null>(null);
    // Thread pre-selection for notification deep-links to corp-msg tab
    const [selectedCorpMsgThreadId, setSelectedCorpMsgThreadId] = useState<string | null>(null);
    const [searchOpen, setSearchOpen] = useState(false);
    const [notificationOpen, setNotificationOpen] = useState(false);

    const { isEnabled } = useModules();
    const { logout, user, hasPermission, status } = useAdminAuth();
    const { isOnline, getTabTier } = useOffline();
    const {
        data: unreadNotificationCountData,
        isError: isNotificationCountError,
    } = useQuery({
        queryKey: ["adminNotificationCount"],
        queryFn: adminNotificationsApi.getUnreadCount,
        enabled: status === "authenticated",
        staleTime: 30_000,
    });

    const unreadNotificationCount = unreadNotificationCountData?.count ?? 0;
    const showNotificationBadge = !isNotificationCountError && unreadNotificationCount > 0;
    const notificationBadgeText = unreadNotificationCount > 99 ? "99+" : String(unreadNotificationCount);

    // Map sidebar item IDs to module IDs
    const TAB_TO_MODULE: Record<string, string | string[]> = {
        'dashboard': 'dashboard',
        'overview': 'dashboard',
        'jobs': 'jobs',
        'service-requests': 'service_requests',
        'pos': 'pos',
        'inventory': 'inventory',
        'customers': 'customers',
        'users': 'users',
        'settings': 'settings',
        'challans': 'challans',
        'finance': ['finance_petty_cash', 'finance_refunds'],
        'b2b': 'corporate',
        'corp-msg': 'corporate',
        'attendance': 'attendance',
        'salary': 'salary_hr',
        'cashier': 'cashier',
        'reports': 'reports',
        'pickup': 'pickup',
        'technician': 'technician_view',
        'orders': 'orders',
        'warranty': 'warranty_claims',
        'purchasing': 'purchasing',
        'wastage': 'wastage',
        'quality': 'quality_analytics',
        'system-health': 'system_health',
        'audit-logs': 'audit_logs',
        'brain': 'ai_brain',
        'refunds': 'finance_refunds',
        'inquiries': 'inquiries',
        'quotations': 'quotations',
        // Some tabs don't have direct 1:1 modules or are strictly UI subsets.
        // We let them pass if no mapping exists, Or map them to the closest parent.
    };

    const TAB_TO_PERMISSION: Record<string, any> = {
        'dashboard': 'dashboard',
        'overview': 'dashboard',
        'jobs': 'jobs',
        'service-requests': 'serviceRequests',
        'pos': 'pos',
        'inventory': 'inventory',
        'customers': 'users',        // viewing customers requires users perm
        'users': 'users',
        'settings': 'settings',
        'challans': 'challans',
        'finance': 'finance',
        'b2b': 'corporate',
        'corp-msg': 'corporate',
        'attendance': 'attendance',
        'salary': 'salary',
        'cashier': 'pos',          // cashier is a POS subset
        'reports': 'reports',
        'pickup': 'jobs',         // pickups are job-adjacent
        'technician': 'technician',
        'orders': 'orders',
        'warranty': 'warrantyClaims',
        'refunds': 'refunds',
        'inquiries': 'inquiries',
        'quotations': 'pos',          // quotations are sales-adjacent
        'purchasing': 'purchasing',
        'wastage': 'wastage',
        'quality': 'quality',
        'system-health': 'systemHealth',
        'audit-logs': 'auditLogs',
        'brain': 'brain',
    };

    const isTabEnabled = (tabId: string) => {
        // Check 1: Is the global module enabled?
        const moduleId = TAB_TO_MODULE[tabId];
        if (moduleId) {
            const moduleEnabled = Array.isArray(moduleId)
                ? moduleId.some((id) => isEnabled(id, "admin"))
                : isEnabled(moduleId, "admin");
            if (!moduleEnabled) return false;
        }

        // Check 2: Does this user have the required permission?
        // Super Admins bypass (handled inside hasPermission)
        const permKey = TAB_TO_PERMISSION[tabId];
        if (!permKey) return true; // No permission mapping -> allow
        if (Array.isArray(permKey)) {
            return permKey.some((k) => hasPermission(k));
        }
        return hasPermission(permKey);
    };

    // Display names for breadcrumb
    const TAB_DISPLAY_NAMES: Record<string, string> = {
        'dashboard': 'Dashboard', 'overview': 'Overview',
        'system-health': 'System Health', 'service-requests': 'Service Requests',
        'jobs': 'Job Tickets', 'pickup': 'Pickups', 'challans': 'Challans',
        'pos': 'Point of Sale', 'orders': 'Orders', 'inventory': 'Inventory',
        'finance': 'Finance', 'b2b': 'B2B Workspace', 'corp-msg': 'Corp. Messages',
        'users': 'User Management', 'settings': 'Settings',
        'reports': 'Reports', 'quality': 'Quality Analytics', 'attendance': 'Staff Attendance',
        'customers': 'Customers', 'inquiries': 'Inquiries', 'quotations': 'Quotations',
        'workflow-demo': 'Workflow Design Demo',
        'salary': 'Salary & HR', 'cashier': 'Cashier Dashboard', 'technician': 'Technician View',
        'purchasing': 'Purchasing (POs)', 'warranty': 'Warranty Claims', 'refunds': 'Refunds', 'wastage': 'Wastage',
        'shipments': 'Shipments', 'procurement': 'Procurement', 'stock-manager': 'Stock Manager',
        'audit-logs': 'Audit Logs', 'brain': 'AI Brain'
    };

    // Sidebar Structure
    const sidebarNavGroups = [
        {
            title: "Overview",
            items: [
                { label: "Dashboard", id: "dashboard", icon: BarChart3, color: "blue", layout: "scroll" },
                { label: "Overview", id: "overview", icon: Activity, color: "indigo", layout: "scroll" },
                { label: "Reports", id: "reports", icon: PieChart, color: "violet", layout: "scroll" },
                { label: "Quality", id: "quality", icon: LineChart, color: "rose", layout: "scroll" },
                { label: "Health", id: "system-health", icon: ShieldAlert, color: "emerald", layout: "scroll" },
            ]
        },
        {
            title: "Operations",
            items: [
                { label: "Requests", id: "service-requests", icon: MessageSquare, color: "orange", layout: "fixed" },
                { label: "Jobs", id: "jobs", icon: ClipboardList, color: "violet", layout: "fixed" },
                { label: "Pickups", id: "pickup", icon: Truck, color: "cyan", layout: "scroll" },
                { label: "Challans", id: "challans", icon: ScrollText, color: "teal", layout: "fixed" },
            ]
        },
        {
            title: "Sales & CRM",
            items: [
                { label: "POS", id: "pos", icon: ShoppingCart, color: "pink", layout: "fixed" },
                { label: "Orders", id: "orders", icon: ShoppingBag, color: "rose", layout: "fixed" },
                { label: "Finance", id: "finance", icon: Banknote, color: "emerald", layout: "scroll" },
                { label: "Quotations", id: "quotations", icon: FileText, color: "blue", layout: "scroll" },
                { label: "Customers", id: "customers", icon: Users, color: "blue", layout: "fixed" },
                { label: "Inquiries", id: "inquiries", icon: HelpCircle, color: "sky", layout: "fixed" },
            ]
        },
        {
            title: "B2B",
            items: [
                { label: "B2B Area", id: "b2b", icon: Building2, color: "sky", layout: "fixed" },
                { label: "Corp. Messages", id: "corp-msg", icon: MessageSquare, color: "indigo", layout: "fixed" }
            ]
        },
        {
            title: "Warehouse",
            items: [
                // { id: 'shipments', label: 'Shipments', icon: Truck },
                // { id: 'procurement', label: 'Procurement', icon: Building2 },
                { label: "Stock Manager", id: "inventory", icon: Package, color: "amber", layout: "scroll" },
                { label: "Purchasing (POs)", id: "purchasing", icon: ShoppingCart, color: "pink", layout: "scroll" },
                { label: "Warranty Claims", id: "warranty", icon: ShieldCheck, color: "green", layout: "fixed" },
                { label: "Refunds", id: "refunds", icon: RotateCcw, color: "rose", layout: "fixed" },
                { label: "Wastage", id: "wastage", icon: FileWarning, color: "orange", layout: "fixed" },
            ]
        },
        {
            title: "People & Staff",
            items: [
                { label: "Users", id: "users", icon: UserCog, color: "indigo", layout: "fixed" },
                { label: "Attendance", id: "attendance", icon: UserCheck, color: "green", layout: "scroll" },
                { label: "Salary & HR", id: "salary", icon: Banknote, color: "emerald", layout: "scroll" },
                { label: "Cashier", id: "cashier", icon: ShoppingCart, color: "blue", layout: "scroll" },
                { label: "Technician", id: "technician", icon: HardHat, color: "orange", layout: "scroll" },
            ]
        },
        {
            title: "System",
            items: [
                { label: "Settings", id: "settings", icon: Settings, color: "slate", layout: "scroll" },
                { label: "Audit Logs", id: "audit-logs", icon: ShieldAlert, color: "rose", layout: "fixed" },
                { label: "AI Brain", id: "brain", icon: Brain, color: "fuchsia", layout: "scroll" },
            ]
        }
    ];

    // Filter sidebar groups based on enabled modules
    const filteredSidebarGroups = sidebarNavGroups.map(group => ({
        ...group,
        items: group.items.filter(item => {
            return isTabEnabled(item.id);
        })
    })).filter(g => g.items.length > 0);

    const mobileNavItems = [
        { label: "Dash", id: "dashboard", icon: BarChart3 },
        { label: "Jobs", id: "jobs", icon: ClipboardList },
        { label: "POS", id: "pos", icon: ShoppingCart },
        { label: "B2B", id: "b2b", icon: Building2 },
        { label: "More", id: "menu", icon: Menu },
    ];

    // Derive isFixed from sidebar config
    const currentTabConfig = filteredSidebarGroups
        .flatMap(g => g.items)
        .find(item => item.id === activeTab);
    const isFixed = currentTabConfig?.layout === 'fixed';

    useEffect(() => {
        if (activeTab !== "b2b" && selectedCorporateClientId) {
            setSelectedCorporateClientId(null);
        }
        if (activeTab !== "corp-msg") {
            setSelectedCorpMsgThreadId(null);
        }
    }, [activeTab, selectedCorporateClientId]);

    return (
        <RollbackProvider>
            <div className="flex h-screen w-full bg-[#f8fafc] overflow-hidden">
                {/* SIDEBAR - Desktop */}
                <aside className={cn(
                    "hidden md:flex flex-col bg-slate-900 shrink-0 z-30 shadow-2xl transition-all duration-300 overflow-y-auto overflow-x-hidden",
                    "md:w-20 lg:w-64"
                )}>
                    <div className="p-4 lg:p-6 border-b border-slate-800/50">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center text-white ring-4 ring-blue-600/20 shadow-lg shadow-blue-500/20 shrink-0">
                                <Zap size={22} className="fill-white" />
                            </div>
                            <div className="hidden lg:block overflow-hidden transition-all duration-300">
                                <h1 className="font-black text-xl text-white tracking-tighter leading-none">PROMISE</h1>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Electronics</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 py-6 px-3 lg:px-4 space-y-8 flex flex-col">
                        <div className="flex-1 overflow-y-auto space-y-8">
                            {status === "pending" ? (
                                <SidebarSkeleton />
                            ) : (
                                <SidebarContent
                                    groups={filteredSidebarGroups}
                                    activeTab={activeTab}
                                    setActiveTab={setActiveTab}
                                    isOnline={isOnline}
                                    getTabTier={getTabTier}
                                />
                            )}
                        </div>

                    </div>
                </aside>

                {/* BOTTOM NAV - Mobile Only */}
                <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-slate-100 flex justify-around items-center h-20 z-50 md:hidden safe-area-pb px-4 shadow-[0_-8px_30px_rgb(0,0,0,0.04)]">
                    {mobileNavItems.filter(item => item.id === 'menu' || isTabEnabled(item.id)).map(item => (
                        item.id === 'menu' ? (
                            <Sheet key={item.id}>
                                <SheetTrigger asChild>
                                    <button
                                        className={cn(
                                            "flex flex-col items-center gap-1.5 px-3 py-2 rounded-2xl transition-all duration-300",
                                            "text-slate-400 hover:text-slate-600"
                                        )}
                                    >
                                        <item.icon size={20} />
                                        <span className="text-[10px] font-bold uppercase tracking-tight">{item.label}</span>
                                    </button>
                                </SheetTrigger>
                                <SheetContent side="left" className="w-[85%] bg-slate-900 border-r-slate-800 text-white p-0 overflow-y-auto">
                                    <div className="p-6 border-b border-slate-800/50 mb-4 flex justify-between items-center">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 bg-blue-600 rounded-xl flex items-center justify-center text-white ring-4 ring-blue-600/20 shadow-lg shadow-blue-500/20 shrink-0">
                                                <Zap size={22} className="fill-white" />
                                            </div>
                                            <div>
                                                <h1 className="font-black text-xl text-white tracking-tighter leading-none">PROMISE</h1>
                                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Electronics</span>
                                            </div>
                                        </div>
                                        <button onClick={() => setNotificationOpen(true)} className="relative text-slate-400 hover:text-white transition-colors">
                                            <Bell size={20} />
                                            {showNotificationBadge && (
                                                <span className="absolute -top-2 -right-2 min-w-[1.1rem] rounded-full border border-slate-900 bg-rose-500 px-1 py-0.5 text-center text-[10px] font-bold leading-none text-white">
                                                    {notificationBadgeText}
                                                </span>
                                            )}
                                        </button>
                                    </div>
                                    <div className="px-4 pb-12 space-y-8">
                                        {status === "pending" ? (
                                            <SidebarSkeleton />
                                        ) : (
                                            <SidebarContent
                                                groups={filteredSidebarGroups}
                                                activeTab={activeTab}
                                                setActiveTab={(tab) => {
                                                    setActiveTab(tab);
                                                }}
                                                isOnline={isOnline}
                                                getTabTier={getTabTier}
                                            />
                                        )}
                                    </div>
                                </SheetContent>
                            </Sheet>
                        ) : (
                            <button
                                key={item.id}
                                onClick={() => setActiveTab(item.id)}
                                className={cn(
                                    "flex flex-col items-center gap-1.5 px-3 py-2 rounded-2xl transition-all duration-300",
                                    activeTab === item.id ? "text-blue-600 bg-blue-50" : "text-slate-400"
                                )}
                            >
                                <item.icon size={20} className={cn(activeTab === item.id && "fill-blue-600/10")} />
                                <span className="text-[10px] font-bold uppercase tracking-tight">{item.label}</span>
                            </button>
                        )
                    ))}
                </nav>

                {/* MAIN CONTENT Area */}
                <div className="flex-1 flex flex-col min-w-0 relative">

                    {/* Floating Mobile Tools (Glass Island) */}
                    <div className="md:hidden absolute top-4 right-4 z-[60] flex items-center gap-3">
                        <button
                            onClick={() => setSearchOpen(true)}
                            className="h-11 w-11 bg-white/70 backdrop-blur-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-full flex items-center justify-center text-slate-700 active:scale-95 transition-all"
                        >
                            <Search size={20} strokeWidth={2.5} />
                        </button>
                        <button
                            onClick={() => setNotificationOpen(true)}
                            className="h-11 w-11 bg-white/70 backdrop-blur-2xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-full flex items-center justify-center text-slate-700 active:scale-95 transition-all relative"
                        >
                            <Bell size={20} strokeWidth={2.5} />
                            {showNotificationBadge && (
                                <span className="absolute -top-1.5 -right-1.5 min-w-[1.2rem] rounded-full border-2 border-white bg-rose-500 px-1 py-0.5 text-center text-[10px] font-bold leading-none text-white shadow-sm">
                                    {notificationBadgeText}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* HEADER - Hidden on mobile, fixed on desktop */}
                    <header className="hidden md:flex h-20 bg-white/80 backdrop-blur-lg border-b border-slate-100 items-center justify-between px-8 shrink-0 z-20 sticky top-0">
                        <div className="flex items-center gap-6">
                            <div
                                onClick={() => setSearchOpen(true)}
                                className="h-9 w-9 md:h-10 md:w-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 cursor-pointer hover:bg-slate-100 transition-colors"
                            >
                                <Search size={18} />
                            </div>
                            <h2 className="text-lg md:text-xl font-bold text-slate-800 capitalize tracking-tight flex items-center">
                                {TAB_DISPLAY_NAMES[activeTab] || activeTab}
                                <span className="hidden sm:inline-block text-slate-300 mx-2">/</span>
                                <span className="hidden sm:inline-block text-slate-400 font-medium tracking-normal text-xs md:text-sm">Admin Concept</span>
                            </h2>
                        </div>

                        <div className="flex items-center gap-2 md:gap-4">
                            <div className="hidden lg:flex items-center px-4 py-2 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black ring-1 ring-emerald-100 uppercase tracking-widest">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-2 animate-pulse" />
                                Live
                            </div>
                            <div
                                onClick={() => setNotificationOpen(true)}
                                className="h-9 w-9 md:h-10 md:w-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-all cursor-pointer relative"
                            >
                                <Bell size={18} />
                                {showNotificationBadge && (
                                    <span className="absolute -top-1.5 -right-1.5 min-w-[1.2rem] rounded-full border-2 border-white bg-rose-500 px-1 py-0.5 text-center text-[10px] font-bold leading-none text-white">
                                        {notificationBadgeText}
                                    </span>
                                )}
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <div className="h-9 w-9 md:h-10 md:w-10 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 cursor-pointer hover:shadow-blue-500/40 transition-shadow">
                                        <User size={18} />
                                    </div>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56 mt-2 rounded-2xl border-slate-100 shadow-xl p-2 z-[100]">
                                    <DropdownMenuLabel className="font-normal p-2">
                                        <div className="flex flex-col space-y-1">
                                            {status === "pending" ? (
                                                <>
                                                    <div className="h-4 w-24 bg-slate-200 animate-pulse rounded"></div>
                                                    <div className="h-3 w-16 bg-slate-100 animate-pulse rounded mt-1"></div>
                                                </>
                                            ) : (
                                                <>
                                                    <p className="text-sm font-bold text-slate-800 leading-none hover:text-[var(--corp-blue)] transition-colors cursor-pointer">{user?.name || user?.username || 'Admin User'}</p>
                                                    <p className="text-xs font-medium text-slate-500 leading-none mt-1">{user?.role || 'Administrator'}</p>
                                                </>
                                            )}
                                        </div>
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator className="bg-slate-100/80 mb-1" />
                                    {user?.role === "Super Admin" && (
                                        <Link href="/admin/workbench">
                                            <DropdownMenuItem className="cursor-pointer focus:bg-slate-50 text-slate-700 font-medium rounded-lg px-3 py-2">
                                                <Settings className="mr-3 h-4 w-4 text-slate-400" />
                                                Workbench
                                            </DropdownMenuItem>
                                        </Link>
                                    )}
                                    <DropdownMenuItem className="cursor-pointer focus:bg-rose-50 text-rose-600 font-medium rounded-lg px-3 py-2 mt-1" onClick={() => logout()}>
                                        <Wrench className="mr-3 h-4 w-4 rotate-90 opacity-70" />
                                        Log out
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </header>

                    <main className={cn("flex-1 bg-slate-50/50 flex flex-col min-h-0", isFixed ? "overflow-hidden" : "overflow-y-auto scroll-smooth")}>
                        <OfflineBanner />
                        <MainContentWrapper isFixed={isFixed}>
                            <AnimatePresence mode="popLayout">
                                <motion.div
                                    key={activeTab}
                                    variants={variants.pageEnter}
                                    initial="initial"
                                    animate="animate"
                                    exit="exit"
                                    className="h-full"
                                >
                                    <Suspense fallback={<DashboardSkeleton />}>
                                        {/* Module & Permission Guard */}
                                        {status === "pending" ? (
                                            <DashboardSkeleton />
                                        ) : TAB_TO_MODULE[activeTab] && !isTabEnabled(activeTab) ? (
                                            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500">
                                                <div className="h-20 w-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                                                    <ShieldAlert size={32} className="text-slate-400" />
                                                </div>
                                                <h2 className="text-2xl font-bold text-slate-700 mb-2">Access Restricted</h2>
                                                <p className="max-w-md mx-auto">
                                                    You do not have permission to view this section, or the <span className="font-semibold text-slate-700">{TAB_DISPLAY_NAMES[activeTab] || activeTab}</span> module is currently disabled.
                                                </p>
                                            </div>
                                        ) : !isOnline && getTabTier(activeTab) === 'locked' ? (
                                            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500">
                                                <div className="h-20 w-20 bg-slate-100 rounded-full flex items-center justify-center mb-6 ring-8 ring-slate-50">
                                                    <WifiOff size={32} className="text-slate-400" />
                                                </div>
                                                <h2 className="text-2xl font-bold text-slate-700 mb-2">Requires Internet</h2>
                                                <p className="max-w-md mx-auto leading-relaxed">
                                                    <span className="font-semibold text-slate-700">{TAB_DISPLAY_NAMES[activeTab] || activeTab}</span> requires an active internet connection to function. It will become available automatically when you're back online.
                                                </p>
                                            </div>
                                        ) : (
                                            <>
                                                {activeTab === 'dashboard' && <DashboardTab onNavigate={(tab: string, searchQuery?: string) => {
                                                    const nextTab = normalizeTab(tab);
                                                    window.location.hash = searchQuery ? `#${nextTab}?search=${encodeURIComponent(searchQuery)}` : `#${nextTab}`;
                                                }} />}

                                                {/* Overview Group */}
                                                {activeTab === 'overview' && <OverviewTab />}
                                                {activeTab === 'reports' && <ReportsTab />}
                                                {activeTab === 'quality' && <QualityAnalyticsTab />}
                                                {activeTab === 'system-health' && <SystemHealthTab onNavigate={(tab: string, searchQuery?: string, clientId?: string) => {
                                                    const nextTab = normalizeTab(tab);
                                                    if (nextTab === 'jobs') setJobTypeOverride('all');
                                                    if (nextTab === 'b2b' && clientId) {
                                                        setSelectedCorporateClientId(clientId);
                                                    }
                                                    window.location.hash = searchQuery ? `#${nextTab}?search=${encodeURIComponent(searchQuery)}` : `#${nextTab}`;
                                                }} />}

                                                {/* Operations Group */}
                                                {activeTab === 'service-requests' && <ServiceRequestsTab initialSearchQuery={globalSearchQuery} onSearchConsumed={() => setGlobalSearchQuery('')} />}

                                                {activeTab === 'jobs' && <JobTicketsTab
                                                    initialSearchQuery={globalSearchQuery}
                                                    onSearchConsumed={() => { setGlobalSearchQuery(''); setJobTypeOverride(undefined); }}
                                                    initialJobType={jobTypeOverride}
                                                />}
                                                {activeTab === 'pickup' && <PickupTab />}
                                                {activeTab === 'challans' && <ChallanTab />}

                                                {/* Sales Group */}
                                                {activeTab === 'pos' && <PosTab />}
                                                {activeTab === 'orders' && <OrdersTab initialSearchQuery={globalSearchQuery} onSearchConsumed={() => setGlobalSearchQuery('')} />}
                                                {activeTab === 'finance' && <FinancesTab defaultTab="sales" />}
                                                {activeTab === 'customers' && <CustomersTab />}
                                                {activeTab === 'quotations' && <QuotationsTab />}
                                                {activeTab === 'inquiries' && <InquiriesTab />}

                                                {/* B2B Group */}
                                                {activeTab === 'b2b' && <UnifiedB2BTab
                                                    initialClientId={selectedCorporateClientId}
                                                    initialSearchQuery={globalSearchQuery}
                                                    onSearchConsumed={() => setGlobalSearchQuery('')}
                                                    onBack={() => setSelectedCorporateClientId(null)}
                                                />}

                                                {/* Corp. Messages (standalone admin chat) */}
                                                {activeTab === 'corp-msg' && <CorporateMessagesAdminTab
                                                    preSelectedThreadId={selectedCorpMsgThreadId ?? undefined}
                                                />}

                                                {/* Warehouse Group */}
                                                {/* {activeTab === 'shipments' && <PlaceholderTab title="Shipments" />} */}
                                                {/* {activeTab === 'procurement' && <PlaceholderTab title="Procurement" />} */}
                                                {activeTab === 'inventory' && <InventoryTab />}
                                                {activeTab === 'purchasing' && <PurchasingTab />}
                                                {activeTab === 'warranty' && <WarrantyClaimsTab />}
                                                {activeTab === 'refunds' && <FinancesTab defaultTab="refunds" />}
                                                {activeTab === 'wastage' && <WastageTab />}

                                                {/* People & Staff Group */}
                                                {activeTab === 'users' && <UsersTab />}
                                                {activeTab === 'attendance' && <AttendanceTab />}
                                                {activeTab === 'salary' && <SalaryHRTab />}
                                                {activeTab === 'cashier' && <CashierTab />}
                                                {activeTab === 'technician' && <TechnicianTab />}

                                                {/* System Group */}
                                                {activeTab === 'settings' && <SettingsTab />}
                                                {activeTab === 'brain' && <BrainTab />}

                                                {/* Fallback */}
                                                {activeTab === 'workflow-demo' && <Suspense fallback={<DashboardSkeleton />}><PlaceholderTab tabName={activeTab} /></Suspense>}
                                                {activeTab === 'audit-logs' && <Suspense fallback={<DashboardSkeleton />}><AuditLogsTab /></Suspense>}

                                                {!['dashboard', 'overview', 'jobs', 'users', 'finance', 'settings', 'system-health', 'pos', 'b2b', 'corp-msg', 'inventory', 'service-requests', 'orders', 'pickup', 'challans', 'reports', 'quality', 'attendance', 'customers', 'quotations', 'inquiries', 'workflow-demo', 'salary', 'cashier', 'technician', 'purchasing', 'warranty', 'refunds', 'wastage', 'shipments', 'procurement', 'stock-manager', 'audit-logs', 'brain'].includes(activeTab) && (
                                                    <Suspense fallback={<DashboardSkeleton />}>
                                                        <PlaceholderTab tabName={activeTab} />
                                                    </Suspense>
                                                )}
                                            </>
                                        )}
                                    </Suspense>
                                </motion.div>
                            </AnimatePresence>
                        </MainContentWrapper>
                    </main>
                </div>

                <GlobalSearch
                    open={searchOpen}
                    onOpenChange={setSearchOpen}
                    onNavigate={(tab, query) => {
                        const nextTab = normalizeTab(tab);
                        if (nextTab === 'b2b' && query) {
                            if (isLikelyEntityId(query)) {
                                setSelectedCorporateClientId(query);
                                window.location.hash = `#b2b`;
                                return;
                            }
                            setSelectedCorporateClientId(null);
                            window.location.hash = `#b2b?search=${encodeURIComponent(query)}`;
                            return;
                        }
                        if (nextTab === 'corp-msg' && query) {
                            setSelectedCorpMsgThreadId(query);
                            window.location.hash = `#corp-msg`;
                            return;
                        }
                        window.location.hash = query ? `#${nextTab}?search=${encodeURIComponent(query)}` : `#${nextTab}`;
                    }}
                />
                <NotificationPanel
                    open={notificationOpen}
                    onOpenChange={setNotificationOpen}
                    onNavigate={(tab, id) => {
                        const nextTab = normalizeTab(tab);
                        if (nextTab === 'corp-msg' && id) {
                            setSelectedCorpMsgThreadId(id);
                            window.location.hash = `#corp-msg`;
                            return;
                        }
                        window.location.hash = id ? `#${nextTab}?search=${encodeURIComponent(id)}` : `#${nextTab}`;
                    }}
                />
                <SyncConflictReview />
            </div>
        </RollbackProvider>
    );
}

// Reusable Layout Wrapper
function MainContentWrapper({ children, isFixed }: { children: React.ReactNode, isFixed: boolean }) {
    if (isFixed) {
        return (
            <div className="h-full pt-20 p-4 md:p-8 md:pt-8 pb-24 md:pb-8 flex flex-col">
                <div className="max-w-[1600px] mx-auto w-full h-full flex flex-col min-h-0">
                    {children}
                </div>
            </div>
        );
    }
    return (
        <div className="min-h-full pt-20 p-4 md:p-8 md:pt-8 pb-32 flex flex-col">
            <div className="max-w-[1600px] mx-auto w-full flex-1">
                {children}
            </div>
        </div>
    );
}

// Extracted Sidebar Content Component
function SidebarContent({ groups, activeTab, setActiveTab, isOnline, getTabTier }: { groups: any[], activeTab: string, setActiveTab: (id: string) => void, isOnline: boolean, getTabTier: (id: string) => string }) {
    const gradients: Record<string, string> = {
        blue: "bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/30",
        indigo: "bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-indigo-500/30",
        emerald: "bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/30",
        orange: "bg-gradient-to-br from-orange-500 to-orange-600 shadow-orange-500/30",
        violet: "bg-gradient-to-br from-violet-500 to-violet-600 shadow-violet-500/30",
        cyan: "bg-gradient-to-br from-cyan-500 to-cyan-600 shadow-cyan-500/30",
        teal: "bg-gradient-to-br from-teal-500 to-teal-600 shadow-teal-500/30",
        pink: "bg-gradient-to-br from-pink-500 to-pink-600 shadow-pink-500/30",
        green: "bg-gradient-to-br from-green-500 to-green-600 shadow-green-500/30",
        rose: "bg-gradient-to-br from-rose-500 to-rose-600 shadow-rose-500/30",
        amber: "bg-gradient-to-br from-amber-500 to-amber-600 shadow-amber-500/30",
        purple: "bg-gradient-to-br from-purple-500 to-purple-600 shadow-purple-500/30",
        sky: "bg-gradient-to-br from-sky-500 to-sky-600 shadow-sky-500/30",
        slate: "bg-gradient-to-br from-slate-500 to-slate-600 shadow-slate-500/30",
        lime: "bg-gradient-to-br from-lime-500 to-lime-600 shadow-lime-500/30",
    };

    return (
        <>
            {groups.map((group, idx) => (
                <div key={idx} className="space-y-2">
                    <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] px-3 mb-4 block">
                        {group.title}
                    </h2>
                    <div className="space-y-1">
                        {group.items.map((item: any) => {
                            const tier = getTabTier(item.id);
                            const isLockedOffline = !isOnline && tier === 'locked';
                            const isReadOnlyOffline = !isOnline && tier === 'read-only';

                            return (
                                <div
                                    key={item.id}
                                    onClick={() => setActiveTab(item.id)}
                                    title={item.label}
                                    className={cn(
                                        "flex items-center gap-3 px-3 lg:px-4 py-3 rounded-xl cursor-pointer transition-all duration-300 group relative overflow-hidden",
                                        activeTab === item.id ? "bg-white/10 text-white shadow-lg ring-1 ring-white/10" : "text-slate-400 hover:bg-white/5 hover:text-white",
                                        isLockedOffline && "opacity-40 grayscale cursor-not-allowed hover:bg-transparent hover:text-slate-400"
                                    )}
                                >
                                    <div className={cn(
                                        "h-9 w-9 lg:h-8 lg:w-8 rounded-lg flex items-center justify-center text-white transition-all duration-300 shrink-0",
                                        activeTab === item.id ? gradients[item.color] : "bg-slate-800 group-hover:bg-slate-700"
                                    )}>
                                        <item.icon size={16} />
                                    </div>
                                    <span className="font-medium text-sm tracking-wide inline-block truncate">
                                        {item.label}
                                    </span>
                                    {activeTab === item.id && (
                                        <motion.div layoutId="active-nav" className="absolute left-0 top-2 bottom-2 w-1.5 bg-blue-500 rounded-r-full" />
                                    )}
                                    {isReadOnlyOffline && <span className="absolute right-2 text-[8px] font-bold text-amber-500 uppercase">Read</span>}
                                    {isLockedOffline && <ShieldAlert size={12} className="absolute right-2 opacity-50" />}
                                </div>
                            )
                        })}
                    </div>
                </div>
            ))}
        </>
    );
}

function SidebarSkeleton() {
    return (
        <div className="space-y-8">
            {[1, 2].map(group => (
                <div key={group} className="space-y-3">
                    <div className="h-3 w-16 bg-slate-800/50 rounded animate-pulse ml-3"></div>
                    <div className="space-y-2">
                        {[1, 2, 3].map(item => (
                            <div key={item} className="flex items-center gap-3 px-3 py-2">
                                <div className="h-8 w-8 rounded-lg bg-slate-800/50 animate-pulse shrink-0"></div>
                                <div className="h-4 w-20 bg-slate-800/30 rounded animate-pulse"></div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
