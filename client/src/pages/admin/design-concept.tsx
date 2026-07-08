import { useState, lazy, Suspense, useEffect, useRef, useCallback, type CSSProperties, type UIEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { variants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { adminNotificationsApi } from "@/lib/api";
import {
    BarChart3, Activity, ShieldAlert, MessageSquare, ClipboardList,
    Truck, ScrollText, ShoppingCart, ShoppingBag, Package,
    Banknote, UserCheck, UserCog, HardHat, Building2,
    FileText, HelpCircle, Settings, Bell, Search, User, Zap,
    PieChart, Users, LineChart, Menu, LogOut,
    ShieldCheck, RotateCcw, FileWarning, Brain, WifiOff, Wrench
} from "lucide-react";

// Contexts
import { RollbackProvider } from "@/contexts/RollbackContext";
import { useModules } from "@/contexts/ModuleContext";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import type { UserPermissions } from "@shared/schema";
import { useOffline } from "@/contexts/OfflineContext";

// Shared Components & Utilities
import { OfflineBanner } from "@/components/admin/OfflineBanner";
import { QRScanButton } from "@/components/admin/QRScanButton";
import { SyncConflictReview } from "@/components/admin/SyncConflictReview";
import { ReminderBell } from "@/components/admin/ReminderBell";
import { TeamChatPanel } from "@/components/admin/TeamChatPanel";
import { DatabaseSyncStatus } from "@/components/admin/DatabaseSyncStatus";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { DashboardSkeleton } from "./bento/shared/DashboardSkeleton";
import { MobileMoreMenu } from "./bento/shared/MobileMoreMenu";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { GlobalSearch, type SearchNavigationPayload } from "./bento/shared/GlobalSearch";
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
const CustomerRepairJourneysTab = lazy(() => import("./bento/tabs/CustomerRepairJourneysTab"));

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

// Account Settings (not in sidebar nav — accessed via More menu / user dropdown)
const AccountSettingsPage = lazy(() => import("@/pages/admin/account-settings"));
const ShiftTab = lazy(() => import("./bento/tabs/ShiftTab"));

// Tab chunk preloaders — warming these during idle (and on nav hover/touch)
// removes the lazy-chunk download wait on first tab switch, so switching feels
// instant. import() is module-cached, so calling it again is a no-op once loaded.
const TAB_PRELOADERS: Record<string, () => Promise<unknown>> = {
    jobs: () => import("./bento/tabs/JobTicketsTab"),
    pos: () => import("./bento/tabs/PosTab"),
    finance: () => import("./bento/tabs/FinancesTab"),
};

const ADMIN_SIDEBAR_NAV_GROUPS: SidebarGroup[] = [
    {
        title: "Overview",
        items: [
            { label: "Dashboard", id: "dashboard", icon: BarChart3, color: "blue", layout: "fixed" },
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
            { label: "Repair Journeys", id: "repair-journeys", icon: Wrench, color: "emerald", layout: "fixed" },
            { label: "Jobs", id: "jobs", icon: ClipboardList, color: "violet", layout: "fixed" },
            { label: "Pickups", id: "pickup", icon: Truck, color: "cyan", layout: "fixed" },
            { label: "Challans", id: "challans", icon: ScrollText, color: "teal", layout: "fixed" },
        ]
    },
    {
        title: "Sales & CRM",
        items: [
            { label: "POS", id: "pos", icon: ShoppingCart, color: "pink", layout: "fixed" },
            { label: "Orders", id: "orders", icon: ShoppingBag, color: "rose", layout: "fixed" },
            { label: "Finance", id: "finance", icon: Banknote, color: "emerald", layout: "fixed" },
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
            { label: "Stock Manager", id: "inventory", icon: Package, color: "amber", layout: "fixed" },
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
            { label: "System Settings", id: "settings", icon: Settings, color: "slate", layout: "fixed" },
            { label: "Audit Logs", id: "audit-logs", icon: ShieldAlert, color: "rose", layout: "fixed" },
            { label: "AI Brain", id: "brain", icon: Brain, color: "fuchsia", layout: "scroll" },
        ]
    }
];

const getAdminTabLayout = (tabId: string) =>
    ADMIN_SIDEBAR_NAV_GROUPS.flatMap((group) => group.items).find((item) => item.id === tabId)?.layout || "scroll";

/** Warm a single tab's chunk (call on nav hover/touchstart). */
export function preloadTab(id: string) {
    TAB_PRELOADERS[id]?.();
}

export default function DesignConcept() {
    /**
     * Backward-compat: old bookmarks may still reference #corp-repairs.
     * This normalizes them to the current 'b2b' tab identifier.
     * Safe to remove once no legacy URLs are in circulation.
     */
    const normalizeTab = (tab: string) => tab === "corp-repairs" ? "b2b" : tab;
    const isLikelyEntityId = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    const buildHash = (tab: string, searchQuery?: string, payload?: SearchNavigationPayload) => {
        const params = new URLSearchParams();
        const resolvedSearch = payload?.searchQuery || searchQuery;
        if (resolvedSearch) params.set("search", resolvedSearch);
        if (payload?.targetId) params.set("target", payload.targetId);
        if (payload?.clientId) params.set("client", payload.clientId);
        if (payload?.recordType) params.set("type", payload.recordType);
        const query = params.toString();
        return query ? `#${tab}?${query}` : `#${tab}`;
    };

    const [activeTab, setActiveTab] = useState(() => {
        const hash = window.location.hash.replace("#", "");
        return normalizeTab(hash.split("?")[0] || "dashboard");
    });

    const activeTabRef = useRef(activeTab);
    useEffect(() => {
        activeTabRef.current = activeTab;
        if (window.innerWidth < 768) {
            window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: false } }));
        }
    }, [activeTab]);
    const isFixed = getAdminTabLayout(activeTab) === "fixed";

    // Warm the most-used tab chunks during idle (after first paint) so the first
    // switch to Jobs/POS/Finance/etc has no lazy-chunk download wait.
    useEffect(() => {
        const warm = () => Object.values(TAB_PRELOADERS).forEach((load) => { void load(); });
        const ric = (window as any).requestIdleCallback;
        if (ric) {
            const id = ric(warm, { timeout: 6000 });
            return () => (window as any).cancelIdleCallback?.(id);
        }
        const t = setTimeout(warm, 4000);
        return () => clearTimeout(t);
    }, []);

    // Pull-to-refresh for mobile scrollable tabs
    const handlePullRefresh = useCallback(async () => {
        window.dispatchEvent(new CustomEvent("admin:pull-refresh", { detail: { tab: activeTabRef.current } }));
    }, []);
    const { containerRef: pullContainerRef, pullDistance, isRefreshing, triggered } = usePullToRefresh({
        onRefresh: handlePullRefresh,
        disabled: isFixed,
    });

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

            const params = query ? new URLSearchParams(query) : null;

            if (params) {
                const search = params.get("search");
                if (search) setGlobalSearchQuery(search);
            } else {
                setGlobalSearchQuery("");
            }

            setSelectedCorporateClientId(tabName === "b2b" ? params?.get("client") || null : null);
            setSelectedCorporateJobId(tabName === "b2b" ? params?.get("target") || null : null);
            setSelectedInventoryItemId(tabName === "inventory" ? params?.get("target") || null : null);
            setSelectedChallanId(tabName === "challans" ? params?.get("target") || null : null);
            // New target parsing for Smart Search deep-linking
            setSelectedJobId(tabName === "jobs" ? params?.get("target") || null : null);
            setSelectedServiceRequestId(tabName === "service-requests" ? params?.get("target") || null : null);
            setSelectedCustomerId(tabName === "customers" ? params?.get("target") || null : null);
            setSelectedPosTransactionId(tabName === "pos" ? params?.get("target") || null : null);
            setSelectedFinanceRecordId(tabName === "finance" ? params?.get("target") || null : null);
            setSelectedFinanceRecordType(tabName === "finance" ? params?.get("type") || null : null);

            if (tabName !== "jobs") {
                setJobTypeOverride(undefined);
            }

            if (tabName && tabName !== activeTabRef.current) {
                setActiveTab(tabName);
            }
        };
        handleHashChange();
        window.addEventListener("hashchange", handleHashChange);
        return () => window.removeEventListener("hashchange", handleHashChange);
    }, []);

    const [selectedCorporateClientId, setSelectedCorporateClientId] = useState<string | null>(null);
    const [selectedCorporateJobId, setSelectedCorporateJobId] = useState<string | null>(null);
    const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<string | null>(null);
    const [selectedChallanId, setSelectedChallanId] = useState<string | null>(null);
    // New target selections for Smart Search deep-linking
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [selectedServiceRequestId, setSelectedServiceRequestId] = useState<string | null>(null);
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [selectedPosTransactionId, setSelectedPosTransactionId] = useState<string | null>(null);
    const [selectedFinanceRecordId, setSelectedFinanceRecordId] = useState<string | null>(null);
    const [selectedFinanceRecordType, setSelectedFinanceRecordType] = useState<string | null>(null);
    // Thread pre-selection for notification deep-links to corp-msg tab
    const [selectedCorpMsgThreadId, setSelectedCorpMsgThreadId] = useState<string | null>(null);
    const [searchOpen, setSearchOpen] = useState(false);
    const [notificationOpen, setNotificationOpen] = useState(false);
    const [mobileChromeHidden, setMobileChromeHidden] = useState(false);
    const [visitedTabs, setVisitedTabs] = useState<string[]>(() => [activeTab]);
    const mobileChromeScrollTopRef = useRef(0);
    const mobileChromeHiddenRef = useRef(false);
    const mobileChromeLockedRef = useRef(false);
    const mobileScrollTickingRef = useRef(false);

    const { isEnabled, isLoading: modulesLoading } = useModules();
    const { logout, user, hasPermission, status } = useAdminAuth();
    const [moreOpen, setMoreOpen] = useState(false);
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
        'repair-journeys': 'service_requests',
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
        'shift': 'attendance',
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

    const TAB_TO_PERMISSION: Record<string, string | string[]> = {
        'dashboard': 'dashboard',
        'overview': 'dashboard',
        'jobs': 'jobs',
        'service-requests': 'serviceRequests',
        'repair-journeys': ['repairJourney', 'serviceRequests'], // repairJourney.* = catalog module; serviceRequests = legacy
        'pos': 'pos',
        'inventory': 'inventory',
        'customers': ['customers', 'users'], // customers.* = catalog module; users = legacy fallback
        'users': 'users',
        'settings': 'settings',
        'challans': 'challans',
        'finance': 'finance',
        'b2b': 'corporate',
        'corp-msg': ['corporateMessages', 'corporate'], // corporateMessages.* = catalog module; corporate = legacy B2B fallback
        'attendance': 'attendance',
        // 'shift' intentionally omitted: shift tab is universal check-in for all staff;
        // gated only by the 'attendance' module in TAB_TO_MODULE, not by a permission key.
        'salary': 'salary',
        'cashier': 'pos',          // cashier is a POS subset
        'reports': 'reports',
        'pickup': ['pickup', 'jobs'], // driver (pickup) or job-staff (jobs) can view
        'technician': 'technician',
        'orders': 'orders',
        'warranty': ['warranty', 'warrantyClaims'], // warranty.* = catalog module; warrantyClaims = legacy key name
        'refunds': ['pos', 'finance', 'refunds'],   // pos.refund = granular key; finance staff audit refunds; refunds = legacy
        'inquiries': 'inquiries',
        'quotations': 'pos',          // quotations are sales-adjacent
        'purchasing': 'purchasing',
        'wastage': 'wastage',
        'quality': 'quality',
        'system-health': ['settings', 'systemHealth'], // settings.manage = only granular key for system health
        'audit-logs': ['settings', 'auditLogs'],       // settings.manage = only granular key for audit logs
        'brain': ['aiBrain', 'brain'], // aiBrain.* = catalog module; brain = legacy key name
    };

    const isTabEnabled = (tabId: string) => {
        // Check 1: Is the global module enabled?
        const moduleId = TAB_TO_MODULE[tabId];
        if (moduleId) {
            const portal = tabId === "technician" && user?.role === "Technician" ? "technician" : "admin";
            const moduleEnabled = Array.isArray(moduleId)
                ? moduleId.some((id) => isEnabled(id, portal))
                : isEnabled(moduleId, portal);
            if (!moduleEnabled) return false;
        }

        // Check 2: Does this user have the required permission?
        // Super Admins bypass (handled inside hasPermission)
        const permKey = TAB_TO_PERMISSION[tabId];
        if (!permKey) return true; // No permission mapping -> allow
        if (Array.isArray(permKey)) {
            return permKey.some((k) => hasPermission(k as keyof UserPermissions));
        }
        return hasPermission(permKey as keyof UserPermissions);
    };

    // Display names for breadcrumb
    const TAB_DISPLAY_NAMES: Record<string, string> = {
        'dashboard': 'Dashboard', 'overview': 'Overview',
        'system-health': 'System Health', 'service-requests': 'Service Requests', 'repair-journeys': 'Repair Journeys',
        'jobs': 'Job Tickets', 'pickup': 'Pickups', 'challans': 'Challans',
        'pos': 'Point of Sale', 'orders': 'Orders', 'inventory': 'Inventory',
        'finance': 'Finance', 'b2b': 'B2B Workspace', 'corp-msg': 'Corp. Messages',
        'users': 'User Management', 'settings': 'System Settings',
        'reports': 'Reports', 'quality': 'Quality Analytics', 'attendance': 'Staff Attendance', 'shift': 'My Shift',
        'customers': 'Customers', 'inquiries': 'Inquiries', 'quotations': 'Quotations',
        'workflow-demo': 'Workflow Design Demo',
        'salary': 'Salary & HR', 'cashier': 'Cashier Dashboard', 'technician': 'Technician View',
        'purchasing': 'Purchasing (POs)', 'warranty': 'Warranty Claims', 'refunds': 'Refunds', 'wastage': 'Wastage',
        'shipments': 'Shipments', 'procurement': 'Procurement', 'stock-manager': 'Stock Manager',
        'audit-logs': 'Audit Logs', 'brain': 'AI Brain',
        'account': 'My Account'
    };

    const sidebarNavGroups = ADMIN_SIDEBAR_NAV_GROUPS;

    // Filter sidebar groups based on enabled modules
    const filteredSidebarGroups = sidebarNavGroups.map(group => ({
        ...group,
        items: group.items.filter(item => {
            return isTabEnabled(item.id);
        })
    })).filter(g => g.items.length > 0);

    const mobileNavItems = (() => {
        if (user?.role === "Technician") {
            return [
                { label: "Work", id: "technician", icon: HardHat },
                { label: "Jobs", id: "jobs", icon: ClipboardList },
                { label: "Shift", id: "shift", icon: UserCheck },
                { label: "More", id: "menu", icon: Menu },
            ];
        }
        if (user?.role === "Driver") {
            return [
                { label: "Pickups", id: "pickup", icon: Truck },
                { label: "Shift", id: "shift", icon: UserCheck },
                { label: "More", id: "menu", icon: Menu },
            ];
        }
        if (user?.role === "Cashier") {
            return [
                { label: "POS", id: "pos", icon: ShoppingCart },
                { label: "Stock", id: "inventory", icon: Package },
                { label: "Shift", id: "shift", icon: UserCheck },
                { label: "More", id: "menu", icon: Menu },
            ];
        }
        return [
            { label: "Jobs", id: "jobs", icon: ClipboardList },
            { label: "POS", id: "pos", icon: ShoppingCart },
            { label: "Shift", id: "shift", icon: UserCheck },
            { label: "Finance", id: "finance", icon: Banknote },
            { label: "More", id: "menu", icon: Menu },
        ];
    })();
    const mobileDockItemIds = mobileNavItems.filter((item) => item.id !== "menu").map((item) => item.id);

    useEffect(() => {
        setVisitedTabs((tabs) => {
            if (tabs.includes(activeTab)) return tabs;
            return [...tabs, activeTab].slice(-8);
        });
    }, [activeTab]);

    useEffect(() => {
        if (activeTab !== "b2b" && selectedCorporateClientId) {
            setSelectedCorporateClientId(null);
        }
        if (activeTab !== "corp-msg") {
            setSelectedCorpMsgThreadId(null);
        }
        if (activeTab !== "finance" && (selectedFinanceRecordId || selectedFinanceRecordType)) {
            setSelectedFinanceRecordId(null);
            setSelectedFinanceRecordType(null);
        }
        mobileChromeScrollTopRef.current = 0;
        mobileChromeHiddenRef.current = false;
        mobileChromeLockedRef.current = false;
        setMobileChromeHidden(false);
    }, [activeTab, selectedCorporateClientId, selectedFinanceRecordId, selectedFinanceRecordType]);

    useEffect(() => {
        const handleMobileChrome = (event: Event) => {
            const detail = (event as CustomEvent<{ hidden?: boolean; scrollTop?: number; syncOnly?: boolean }>).detail;
            if (typeof detail?.scrollTop === "number") {
                if (mobileChromeLockedRef.current) return;
                const prev = mobileChromeScrollTopRef.current;
                const cur = detail.scrollTop;
                if (detail.syncOnly) {
                    mobileChromeScrollTopRef.current = cur;
                    const shouldHide = cur > 24;
                    if (mobileChromeHiddenRef.current !== shouldHide) {
                        mobileChromeHiddenRef.current = shouldHide;
                        setMobileChromeHidden(shouldHide);
                    }
                    return;
                }
                const delta = cur - prev;
                // Ignore momentum micro-jitter (iOS rubber-band, sub-pixel settle).
                if (Math.abs(delta) < 6) {
                    mobileChromeScrollTopRef.current = cur;
                    const shouldHide = cur > 24 ? true : cur < 16 ? false : mobileChromeHiddenRef.current;
                    if (mobileChromeHiddenRef.current !== shouldHide) {
                        mobileChromeHiddenRef.current = shouldHide;
                        setMobileChromeHidden(shouldHide);
                    }
                    return;
                }
                mobileChromeScrollTopRef.current = cur;

                // Hysteresis: hide after the list is meaningfully scrolled, reveal on upward motion.
                let shouldHide = mobileChromeHiddenRef.current;
                if (delta < 0) shouldHide = false;
                else if (cur > 24) shouldHide = true;
                if (cur < 16) shouldHide = false;

                if (mobileChromeHiddenRef.current === shouldHide) return;
                mobileChromeHiddenRef.current = shouldHide;
                setMobileChromeHidden(shouldHide);
                return;
            }
            const hidden = Boolean(detail?.hidden);
            mobileChromeHiddenRef.current = hidden;
            setMobileChromeHidden(hidden);
            if (hidden) {
                mobileChromeLockedRef.current = true;
            } else {
                mobileChromeScrollTopRef.current = 0;
                // Keep locked briefly so scroll-driven re-hide doesn't fire
                // in the same frame as the restore dispatch.
                setTimeout(() => { mobileChromeLockedRef.current = false; }, 350);
            }
        };
        window.addEventListener("admin:mobile-chrome", handleMobileChrome);
        return () => window.removeEventListener("admin:mobile-chrome", handleMobileChrome);
    }, []);

    const handleMainMobileScroll = (event: UIEvent<HTMLElement>) => {
        if (window.innerWidth >= 768 || mobileScrollTickingRef.current) return;
        const el = event.currentTarget;
        mobileScrollTickingRef.current = true;
        requestAnimationFrame(() => {
            mobileScrollTickingRef.current = false;
            window.dispatchEvent(new CustomEvent("admin:mobile-chrome", {
                detail: { scrollTop: el.scrollTop },
            }));
        });
    };

    return (
        <RollbackProvider>
            <div className="flex h-screen w-full bg-[#f8fafc] overflow-hidden select-none">
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

                {/* Floating Bottom Dock - Mobile Only */}
                <nav
                    className={cn(
                        "fixed left-4 right-4 bottom-[calc(env(safe-area-inset-bottom)+10px)] z-50 md:hidden",
                        "h-14 rounded-[1.65rem] border border-slate-200/80 bg-white/88 px-2 shadow-[0_12px_36px_rgba(15,23,42,0.18)] backdrop-blur-2xl",
                        "flex items-center justify-around transition-[transform,opacity,border-color,box-shadow] duration-200 ease-out",
                        mobileChromeHidden && "translate-y-20 opacity-0 pointer-events-none border-transparent shadow-none"
                    )}
                >
                    {mobileNavItems.filter(item => item.id === 'menu' || status === 'pending' || modulesLoading || isTabEnabled(item.id)).map(item => (
                        item.id === 'menu' ? (
                            <Sheet key={item.id} open={moreOpen} onOpenChange={setMoreOpen}>
                                <SheetTrigger asChild>
                                    <button
                                        className={cn(
                                            "flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 transition-all duration-200 active:scale-95",
                                            moreOpen ? "text-blue-700" : "text-slate-400"
                                        )}
                                    >
                                        <span className={cn(
                                            "flex h-8 w-8 items-center justify-center rounded-full transition-all",
                                            moreOpen && "h-9 w-9 bg-blue-600 text-white shadow-md shadow-blue-500/25"
                                        )}>
                                            <item.icon size={17} strokeWidth={2.4} />
                                        </span>
                                        <span className="text-[9px] font-black uppercase leading-none tracking-tight">{item.label}</span>
                                    </button>
                                </SheetTrigger>
                                <SheetContent
                                    side="bottom"
                                    onOpenAutoFocus={(event) => event.preventDefault()}
                                    className="h-[92dvh] w-full bg-[#f8fafc] border-0 p-0 rounded-t-3xl overflow-hidden [&>button]:hidden"
                                >
                                    <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                                    <SheetDescription className="sr-only">Browse and navigate to admin modules</SheetDescription>
                                    {status === "pending" ? (
                                        <div className="p-6"><SidebarSkeleton /></div>
                                    ) : (
                                        <MobileMoreMenu
                                            groups={filteredSidebarGroups}
                                            user={user}
                                            isOnline={isOnline}
                                            dockItemIds={mobileDockItemIds}
                                            onSelect={(tab) => { setActiveTab(tab); setMoreOpen(false); }}
                                            onLogout={() => { setMoreOpen(false); logout(); }}
                                        />
                                    )}
                                </SheetContent>
                            </Sheet>
                        ) : (
                            <button
                                key={item.id}
                                onClick={() => setActiveTab(item.id)}
                                onPointerEnter={() => preloadTab(item.id)}
                                onTouchStart={() => preloadTab(item.id)}
                                className={cn(
                                    "flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 transition-all duration-200 active:scale-95",
                                    activeTab === item.id ? "text-blue-700" : "text-slate-400"
                                )}
                            >
                                <span className={cn(
                                    "flex h-8 w-8 items-center justify-center rounded-full transition-all",
                                    activeTab === item.id && "h-9 w-9 bg-blue-600 text-white shadow-md shadow-blue-500/25"
                                )}>
                                    <item.icon size={17} strokeWidth={2.4} className={cn(activeTab === item.id && "fill-white/10")} />
                                </span>
                                <span className={cn(
                                    "text-[9px] font-black uppercase leading-none tracking-tight",
                                    activeTab === item.id ? "text-blue-700" : "text-slate-400"
                                )}>{item.label}</span>
                            </button>
                        )
                    ))}
                </nav>

                {/* MAIN CONTENT Area */}
                <div className="flex-1 flex flex-col min-w-0 relative">

                    {/* Floating Mobile Tools (Glass Island) */}
                    <div
                        className={cn(
                            "md:hidden absolute top-4 right-4 z-[60] flex items-center gap-3 transition-[transform,opacity] duration-200 ease-out",
                            (mobileChromeHidden || notificationOpen || searchOpen) && "-translate-y-20 opacity-0 pointer-events-none"
                        )}
                    >
                        <QRScanButton onJobFound={(jobId) => {
                            setActiveTab("jobs");
                            setGlobalSearchQuery(jobId);
                            window.location.hash = `#jobs?search=${encodeURIComponent(jobId)}`;
                        }} />
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
                    <header className="hidden md:flex h-14 bg-white/80 backdrop-blur-lg border-b border-slate-100 items-center justify-between px-5 lg:px-6 shrink-0 z-20 sticky top-0">
                        <div className="flex items-center gap-4">
                            <div
                                onClick={() => setSearchOpen(true)}
                                className="h-9 w-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 cursor-pointer hover:bg-slate-100 transition-colors"
                            >
                                <Search size={18} />
                            </div>
                            <h2 className="text-lg font-bold text-slate-800 capitalize tracking-tight flex items-center">
                                {TAB_DISPLAY_NAMES[activeTab] || activeTab}
                            </h2>
                        </div>

                        <div className="flex items-center gap-2">
                            <div className="hidden lg:flex items-center px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black ring-1 ring-emerald-100 uppercase tracking-widest">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-2 animate-pulse" />
                                Live
                            </div>
                            <ReminderBell />
                            <div
                                onClick={() => setNotificationOpen(true)}
                                className="h-9 w-9 rounded-xl bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-all cursor-pointer relative"
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
                                    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 cursor-pointer hover:shadow-blue-500/40 transition-shadow">
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
                                                    <p className="text-sm font-bold text-slate-800 leading-none cursor-pointer">{user?.name || user?.username || 'Admin User'}</p>
                                                    <p className="text-xs font-medium text-slate-500 leading-none mt-1">{user?.role || 'Administrator'}</p>
                                                </>
                                            )}
                                        </div>
                                    </DropdownMenuLabel>
                                    <DropdownMenuSeparator className="bg-slate-100/80 mb-1" />
                                    <DropdownMenuItem
                                        className="cursor-pointer focus:bg-slate-50 text-slate-700 font-medium rounded-lg px-3 py-2"
                                        onClick={() => { window.location.hash = "#account"; }}
                                    >
                                        <User className="mr-3 h-4 w-4 text-slate-400" />
                                        My Account
                                    </DropdownMenuItem>
                                    {user?.role === "Super Admin" && (
                                        <Link href="/admin/workbench">
                                            <DropdownMenuItem className="cursor-pointer focus:bg-slate-50 text-slate-700 font-medium rounded-lg px-3 py-2">
                                                <Settings className="mr-3 h-4 w-4 text-slate-400" />
                                                Workbench
                                            </DropdownMenuItem>
                                        </Link>
                                    )}
                                    <DropdownMenuItem className="cursor-pointer focus:bg-rose-50 text-rose-600 font-medium rounded-lg px-3 py-2 mt-1" onClick={() => logout()}>
                                        <LogOut className="mr-3 h-4 w-4 opacity-70" />
                                        Log out
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </header>

                    <main
                        ref={pullContainerRef}
                        className={cn("flex-1 bg-slate-50/50 flex flex-col min-h-0", isFixed ? "overflow-hidden" : "overflow-y-auto scroll-smooth")}
                        onScroll={handleMainMobileScroll}
                    >
                        {/* Pull-to-refresh indicator (mobile only) */}
                        {pullDistance > 0 && !isFixed && (
                            <div
                                className="md:hidden flex items-center justify-center shrink-0 transition-all"
                                style={{ height: Math.min(pullDistance * 0.5, 48) }}
                            >
                                <div
                                    className={cn(
                                        "h-7 w-7 rounded-full border-2 border-blue-500 flex items-center justify-center transition-all",
                                        isRefreshing ? "animate-spin" : ""
                                    )}
                                    style={{ opacity: triggered ? 1 : pullDistance / 70 }}
                                >
                                    <div className={cn("h-3 w-3 rounded-full", triggered ? "bg-blue-500" : "bg-blue-300")} />
                                </div>
                            </div>
                        )}
                        <OfflineBanner />
                        <DatabaseSyncStatus enabled={status === "authenticated"} />
                        <MainContentWrapper isFixed={isFixed} activeTab={activeTab} mobileChromeHidden={mobileChromeHidden}>
                            {visitedTabs.map((tabId) => (
                                <motion.div
                                    key={tabId}
                                    variants={variants.pageEnter}
                                    initial="initial"
                                    animate="animate"
                                    className={cn("h-full", tabId !== activeTab && "hidden")}
                                >
                                    <Suspense fallback={tabId === activeTab ? <DashboardSkeleton /> : null}>
                                        {/* Module & Permission Guard */}
                                        {status === "pending" ? (
                                            <DashboardSkeleton />
                                        ) : modulesLoading && !!TAB_TO_MODULE[tabId] ? (
                                            <DashboardSkeleton />
                                        ) : TAB_TO_MODULE[tabId] && !isTabEnabled(tabId) ? (
                                            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500">
                                                <div className="h-20 w-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                                                    <ShieldAlert size={32} className="text-slate-400" />
                                                </div>
                                                <h2 className="text-2xl font-bold text-slate-700 mb-2">Access Restricted</h2>
                                                <p className="max-w-md mx-auto">
                                                    You do not have permission to view this section, or the <span className="font-semibold text-slate-700">{TAB_DISPLAY_NAMES[tabId] || tabId}</span> module is currently disabled.
                                                </p>
                                            </div>
                                        ) : !isOnline && getTabTier(tabId) === 'locked' ? (
                                            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500">
                                                <div className="h-20 w-20 bg-slate-100 rounded-full flex items-center justify-center mb-6 ring-8 ring-slate-50">
                                                    <WifiOff size={32} className="text-slate-400" />
                                                </div>
                                                <h2 className="text-2xl font-bold text-slate-700 mb-2">Requires Internet</h2>
                                                <p className="max-w-md mx-auto leading-relaxed">
                                                    <span className="font-semibold text-slate-700">{TAB_DISPLAY_NAMES[tabId] || tabId}</span> requires an active internet connection to function. It will become available automatically when you're back online.
                                                </p>
                                            </div>
                                        ) : (
                                            <>
                                                {tabId === 'dashboard' && <DashboardTab onNavigate={(tab: string, searchQuery?: string) => {
                                                    const nextTab = normalizeTab(tab);
                                                    window.location.hash = searchQuery ? `#${nextTab}?search=${encodeURIComponent(searchQuery)}` : `#${nextTab}`;
                                                }} />}

                                                {/* Overview Group */}
                                                {tabId === 'overview' && <OverviewTab />}
                                                {tabId === 'reports' && <ReportsTab />}
                                                {tabId === 'quality' && <QualityAnalyticsTab />}
                                                {tabId === 'system-health' && <SystemHealthTab onNavigate={(tab: string, searchQuery?: string, clientId?: string) => {
                                                    const nextTab = normalizeTab(tab);
                                                    if (nextTab === 'jobs') setJobTypeOverride('all');
                                                    if (nextTab === 'b2b' && clientId) {
                                                        setSelectedCorporateClientId(clientId);
                                                    }
                                                    window.location.hash = searchQuery ? `#${nextTab}?search=${encodeURIComponent(searchQuery)}` : `#${nextTab}`;
                                                }} />}

                                                {/* Operations Group */}
                                                {tabId === 'service-requests' && <ServiceRequestsTab
                                                    initialSearchQuery={globalSearchQuery}
                                                    initialRequestId={selectedServiceRequestId ?? undefined}
                                                    onSearchConsumed={() => setGlobalSearchQuery('')}
                                                />}
                                                {tabId === 'repair-journeys' && <CustomerRepairJourneysTab />}

                                                {tabId === 'jobs' && <JobTicketsTab
                                                    initialSearchQuery={globalSearchQuery}
                                                    initialJobId={selectedJobId ?? undefined}
                                                    onSearchConsumed={() => { setGlobalSearchQuery(''); setJobTypeOverride(undefined); }}
                                                    initialJobType={jobTypeOverride}
                                                />}
                                                {tabId === 'pickup' && <PickupTab />}
                                                {tabId === 'challans' && <ChallanTab
                                                    initialSearchQuery={globalSearchQuery}
                                                    initialChallanId={selectedChallanId ?? undefined}
                                                    onSearchConsumed={() => setGlobalSearchQuery('')}
                                                />}

                                                {/* Sales Group */}
                                                {tabId === 'pos' && <PosTab
                                                    initialSearchQuery={globalSearchQuery}
                                                    initialTransactionId={selectedPosTransactionId ?? undefined}
                                                    onSearchConsumed={() => setGlobalSearchQuery('')}
                                                />}
                                                {tabId === 'orders' && <OrdersTab initialSearchQuery={globalSearchQuery} onSearchConsumed={() => setGlobalSearchQuery('')} />}
                                                {tabId === 'finance' && <FinancesTab
                                                    defaultTab="sales"
                                                    initialSearchQuery={globalSearchQuery}
                                                    initialRecordId={selectedFinanceRecordId ?? undefined}
                                                    initialRecordType={selectedFinanceRecordType ?? undefined}
                                                    onSearchConsumed={() => setGlobalSearchQuery('')}
                                                />}
                                                {tabId === 'customers' && <CustomersTab
                                                    initialSearchQuery={globalSearchQuery}
                                                    initialCustomerId={selectedCustomerId ?? undefined}
                                                    onSearchConsumed={() => setGlobalSearchQuery('')}
                                                />}
                                                {tabId === 'quotations' && <QuotationsTab />}
                                                {tabId === 'inquiries' && <InquiriesTab />}

                                                {/* B2B Group */}
                                                {tabId === 'b2b' && <UnifiedB2BTab
                                                    initialClientId={selectedCorporateClientId}
                                                    initialJobId={selectedCorporateJobId}
                                                    initialSearchQuery={globalSearchQuery}
                                                    onSearchConsumed={() => setGlobalSearchQuery('')}
                                                    onBack={() => setSelectedCorporateClientId(null)}
                                                />}

                                                {/* Corp. Messages (standalone admin chat) */}
                                                {tabId === 'corp-msg' && <CorporateMessagesAdminTab
                                                    preSelectedThreadId={selectedCorpMsgThreadId ?? undefined}
                                                />}

                                                {/* Warehouse Group */}
                                                {/* {activeTab === 'shipments' && <PlaceholderTab title="Shipments" />} */}
                                                {/* {activeTab === 'procurement' && <PlaceholderTab title="Procurement" />} */}
                                                {tabId === 'inventory' && <InventoryTab
                                                    initialSearchQuery={globalSearchQuery}
                                                    initialItemId={selectedInventoryItemId ?? undefined}
                                                    onSearchConsumed={() => setGlobalSearchQuery('')}
                                                />}
                                                {tabId === 'purchasing' && <PurchasingTab />}
                                                {tabId === 'warranty' && <WarrantyClaimsTab />}
                                                {tabId === 'refunds' && <FinancesTab defaultTab="refunds" />}
                                                {tabId === 'wastage' && <WastageTab />}

                                                {/* People & Staff Group */}
                                                {tabId === 'users' && <UsersTab />}
                                                {tabId === 'attendance' && <AttendanceTab />}
                                                {tabId === 'shift' && <ShiftTab />}
                                                {tabId === 'salary' && <SalaryHRTab />}
                                                {tabId === 'cashier' && <CashierTab />}
                                                {tabId === 'technician' && <TechnicianTab />}

                                                {/* System Group */}
                                                {tabId === 'settings' && <SettingsTab
                                                    initialSearchQuery={globalSearchQuery}
                                                    onSearchConsumed={() => setGlobalSearchQuery('')}
                                                />}
                                                {tabId === 'brain' && <BrainTab />}

                                                {/* Account Settings */}
                                                {tabId === 'account' && <AccountSettingsPage />}

                                                {/* Fallback */}
                                                {tabId === 'workflow-demo' && <Suspense fallback={<DashboardSkeleton />}><PlaceholderTab tabName={tabId} /></Suspense>}
                                                {tabId === 'audit-logs' && <Suspense fallback={<DashboardSkeleton />}><AuditLogsTab /></Suspense>}

                                                {!['dashboard', 'overview', 'jobs', 'users', 'finance', 'settings', 'system-health', 'pos', 'b2b', 'corp-msg', 'inventory', 'service-requests', 'repair-journeys', 'orders', 'pickup', 'challans', 'reports', 'quality', 'attendance', 'shift', 'customers', 'quotations', 'inquiries', 'workflow-demo', 'salary', 'cashier', 'technician', 'purchasing', 'warranty', 'refunds', 'wastage', 'shipments', 'procurement', 'stock-manager', 'audit-logs', 'brain', 'account'].includes(tabId) && (
                                                    <Suspense fallback={<DashboardSkeleton />}>
                                                        <PlaceholderTab tabName={tabId} />
                                                    </Suspense>
                                                )}
                                            </>
                                        )}
                                    </Suspense>
                                </motion.div>
                            ))}
                        </MainContentWrapper>
                    </main>
                </div>

                <GlobalSearch
                    open={searchOpen}
                    onOpenChange={setSearchOpen}
                    onNavigate={(tab, query, payload) => {
                        const nextTab = normalizeTab(tab);
                        if (nextTab === 'b2b') {
                            setSelectedCorporateClientId(payload?.clientId || (query && isLikelyEntityId(query) ? query : null));
                            setSelectedCorporateJobId(payload?.targetId || null);
                            window.location.hash = buildHash("b2b", query, payload);
                            return;
                        }
                        if (nextTab === 'corp-msg' && query) {
                            setSelectedCorpMsgThreadId(query);
                            window.location.hash = `#corp-msg`;
                            return;
                        }
                        if (nextTab === "inventory") setSelectedInventoryItemId(payload?.targetId || null);
                        if (nextTab === "challans") setSelectedChallanId(payload?.targetId || null);
                        if (nextTab === "jobs") setSelectedJobId(payload?.targetId || null);
                        if (nextTab === "service-requests") setSelectedServiceRequestId(payload?.targetId || null);
                        if (nextTab === "customers") setSelectedCustomerId(payload?.targetId || null);
                        if (nextTab === "pos") setSelectedPosTransactionId(payload?.targetId || null);
                        if (nextTab === "finance") {
                            setSelectedFinanceRecordId(payload?.targetId || null);
                            setSelectedFinanceRecordType(payload?.recordType || null);
                        }
                        window.location.hash = buildHash(nextTab, query, payload);
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
                <TeamChatPanel />
            </div>
        </RollbackProvider>
    );
}

// Reusable Layout Wrapper
function MainContentWrapper({ children, isFixed, activeTab, mobileChromeHidden }: { children: React.ReactNode, isFixed: boolean, activeTab: string, mobileChromeHidden: boolean }) {
    const mobileChromeOffset = mobileChromeHidden ? "-translate-y-16" : "translate-y-0";
    const mobileHeight = mobileChromeHidden ? "h-[calc(100%+4rem)]" : "h-full";
    const mobileShellStyle = {
        "--admin-mobile-bottom-clearance": "calc(5.5rem + env(safe-area-inset-bottom))",
    } as CSSProperties;

    if (isFixed) {
        return (
            <div className="h-full pt-16 md:pt-5 px-0 md:px-5 pb-0 md:pb-5 flex flex-col bg-[#f8fafc] md:overflow-y-auto" style={mobileShellStyle}>
                <div
                    className={cn("max-w-[1600px] mx-auto w-full md:h-full shrink-0 flex flex-col min-h-0 transition-transform duration-200 ease-out will-change-transform md:translate-y-0", mobileHeight, mobileChromeOffset)}
                >
                    {children}
                </div>
            </div>
        );
    }
    return (
        <div className="min-h-full pt-16 md:pt-5 px-0 md:px-5 pb-0 md:pb-5 flex flex-col bg-[#f8fafc]" style={mobileShellStyle}>
            <div
                className={cn("max-w-[1600px] mx-auto w-full flex-1 shrink-0 transition-transform duration-200 ease-out will-change-transform md:translate-y-0", mobileChromeHidden && "min-h-[calc(100%+4rem)]", mobileChromeOffset)}
            >
                {children}
            </div>
        </div>
    );
}

interface SidebarItem {
    label: string;
    id: string;
    icon: React.FC<{ size?: number; className?: string }>;
    color: string;
    layout: string;
}

interface SidebarGroup {
    title: string;
    items: SidebarItem[];
}

// Extracted Sidebar Content Component
function SidebarContent({ groups, activeTab, setActiveTab, isOnline, getTabTier }: { groups: SidebarGroup[], activeTab: string, setActiveTab: (id: string) => void, isOnline: boolean, getTabTier: (id: string) => string }) {
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
                    <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] px-3 mb-4 hidden lg:block">
                        {group.title}
                    </h2>
                    <div className="space-y-1">
                        {group.items.map((item: SidebarItem) => {
                            const tier = getTabTier(item.id);
                            const isLockedOffline = !isOnline && tier === 'locked';
                            const isReadOnlyOffline = !isOnline && tier === 'read-only';

                            return (
                                <div
                                    key={item.id}
                                    onClick={() => setActiveTab(item.id)}
                                    onMouseEnter={() => preloadTab(item.id)}
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
                                    <span className="font-medium text-sm tracking-wide hidden lg:inline-block truncate">
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
