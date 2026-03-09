import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
    Calculator,
    Calendar,
    CreditCard,
    Settings,
    Smile,
    User,
    Search,
    FileText,
    Truck,
    ShoppingBag,
    BarChart3,
    Activity,
    ShieldAlert,
    MessageSquare,
    ClipboardList,
    ScrollText,
    ShoppingCart,
    Package,
    Banknote,
    Users,
    HelpCircle,
    Building2,
    Wrench,
    UserCog,
    UserCheck,
    Command as CommandIcon,
    ChevronRight,
    Tv,
    Phone,
    Hash
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { searchApi } from "@/lib/api";
import { variants } from "@/lib/motion";
import { HighlightMatch } from "./HighlightMatch";
import { formatDistanceToNow } from "date-fns";
import { StatusBadge } from "./StatusBadge";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
} from "@/components/ui/command";

interface GlobalSearchProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onNavigate: (tab: string, searchQuery?: string) => void;
}

// Nanoid pattern: 20+ alphanumeric chars with possible - or _
const NANOID_PATTERN = /^[a-zA-Z0-9_-]{20,}$/;

function resolveCustomerDisplay(job: any): string {
    const resolved = job.resolvedCustomerName;
    const raw = job.customer;
    if (resolved) return resolved;
    if (!raw) return "Walk-in Customer";
    if (NANOID_PATTERN.test(raw)) return "Walk-in Customer";
    return raw;
}

function getJobDisplayId(job: any): { label: string; isHumanReadable: boolean } {
    if (job.corporateJobNumber) {
        return { label: job.corporateJobNumber, isHumanReadable: true };
    }
    // For walk-in jobs, use last 6 of ID formatted as ticket-style
    const shortId = job.id ? `#${job.id.slice(-6).toUpperCase()}` : "#UNKNOWN";
    return { label: shortId, isHumanReadable: false };
}

// Category pill badge component
function CategoryBadge({ label, color }: { label: string; color: string }) {
    const colorMap: Record<string, string> = {
        blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800",
        sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border border-sky-200 dark:border-sky-800",
        purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800",
        green: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border border-green-200 dark:border-green-800",
        emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800",
        orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-200 dark:border-orange-800",
        zinc: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700",
    };
    return (
        <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full ${colorMap[color] ?? colorMap.zinc}`}>
            {label}
        </span>
    );
}

// "View all X results" footer row
function ViewAllRow({ count, displayed, label, tab, query, onNavigate, runCommand }: {
    count: number; displayed: number; label: string;
    tab: string; query: string; onNavigate: Function; runCommand: Function;
}) {
    if (count <= displayed) return null;
    const remaining = count - displayed;
    return (
        <CommandItem
            onSelect={() => runCommand(() => onNavigate(tab, query))}
            className="group cursor-pointer justify-between bg-muted/30 border border-border/30 rounded-xl mx-2 mb-1 mt-0.5 px-3 py-2 text-[12px] text-muted-foreground hover:text-primary hover:bg-primary/5 hover:border-primary/20 transition-all"
        >
            <span>View all <strong className="text-foreground">{count}</strong> results in {label}</span>
            <ChevronRight className="h-3 w-3 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
        </CommandItem>
    );
}

export function GlobalSearch({ open: externalOpen, onOpenChange, onNavigate }: GlobalSearchProps) {
    const [open, setOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");
    const prefersReducedMotion = useReducedMotion();
    const { hasPermission } = useAdminAuth();

    // Handle internal state if not controlled
    const isControlled = externalOpen !== undefined;
    const show = isControlled ? externalOpen : open;
    const setShow = isControlled ? onOpenChange : setOpen;

    const { data: searchResults, isLoading } = useQuery({
        queryKey: ["global-search", searchQuery],
        queryFn: () => searchApi.global(searchQuery),
        enabled: searchQuery.length >= 1,
        staleTime: 1000 * 30, // 30 seconds
    });

    const corporateJobs = searchResults?.jobs?.filter((j: any) => j.corporateClientId) || [];
    const walkInJobs = searchResults?.jobs?.filter((j: any) => !j.corporateClientId) || [];
    const counts = searchResults?.counts ?? { jobs: 0, customers: 0, serviceRequests: 0, posTransactions: 0, inventory: 0, challans: 0 };

    const totalResults = React.useMemo(() => {
        if (!counts) return 0;
        return (counts.jobs || 0) + (counts.customers || 0) + (counts.serviceRequests || 0) +
            (counts.posTransactions || 0) + (counts.inventory || 0) + (counts.challans || 0);
    }, [counts]);

    const categoriesHit = React.useMemo(() => {
        if (!counts) return 0;
        return Object.values(counts).filter((v: any) => v > 0).length;
    }, [counts]);

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setShow?.(!show);
            }
        };

        document.addEventListener("keydown", down);
        return () => document.removeEventListener("keydown", down);
    }, [setShow]);

    const runCommand = React.useCallback((command: () => unknown) => {
        setShow?.(false);
        command();
    }, [setShow]);

    const blockMotion = prefersReducedMotion
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.1 } }
        : {
            initial: { opacity: 0, y: 8 },
            animate: { opacity: 1, y: 0 },
            exit: { opacity: 0, y: -6 },
            transition: { duration: 0.16, ease: "easeOut" as const }
        };

    const headerMotion = prefersReducedMotion
        ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.08 } }
        : {
            initial: { opacity: 0, y: 4 },
            animate: { opacity: 1, y: 0 },
            transition: { duration: 0.14, delay: 0.03, ease: "easeOut" as const }
        };


    return (
        <Dialog open={show} onOpenChange={setShow}>
            <DialogContent
                overlayClassName="global-search-overlay"
                className="global-search-dialog overflow-hidden p-0 sm:max-w-[700px] border-white/20 dark:border-white/10 bg-slate-50/95 dark:bg-slate-950/95 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] sm:rounded-[2rem] supports-[backdrop-filter]:bg-slate-50/80 dark:supports-[backdrop-filter]:bg-slate-950/80 [&>button]:right-6 [&>button]:top-5 hover:[&>button]:scale-110 [&>button]:transition-transform [&>button]:w-8 [&>button]:h-8 [&>button]:rounded-full [&>button]:border [&>button]:border-border/40 [&>button]:bg-white dark:[&>button]:bg-zinc-800 hover:[&>button]:bg-muted [&>button_svg]:w-4 [&>button_svg]:h-4 [&>button_svg]:text-muted-foreground hover:[&>button_svg]:text-foreground [&>button]:shadow-sm outline-none"
            >
                <motion.div
                    initial="initial"
                    animate={show ? "animate" : "exit"}
                    variants={variants.modalContent}
                    style={{ willChange: "transform, opacity" }}
                >
                    <Command shouldFilter={false} className="bg-transparent overflow-hidden outline-none [&_[cmdk-input-wrapper]]:border-b [&_[cmdk-input-wrapper]]:border-border/10 [&_[cmdk-input-wrapper]]:px-6 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input-wrapper]_svg]:text-primary/70 [&_[cmdk-input]]:h-16 [&_[cmdk-input]]:text-base [&_[cmdk-input]]:focus:!ring-0 [&_[cmdk-input]]:focus:!border-transparent [&_[cmdk-input]]:focus:!shadow-none [&_[cmdk-input]]:focus:!outline-none [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:h-[18px] [&_[cmdk-item]_svg]:w-[18px] [&_[cmdk-item]]:rounded-xl [&_[cmdk-item]]:mx-2 [&_[cmdk-item]]:transition-all [&_[cmdk-item]]:duration-200 [&_[cmdk-item][data-selected=true]]:bg-primary/10 [&_[cmdk-item][data-selected=true]]:text-primary [&_[cmdk-item][data-selected=true]]:scale-[1.01] [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:text-muted-foreground/50 [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:uppercase">
                        <motion.div {...headerMotion}>
                            <CommandInput
                                placeholder="Search anything (Jobs, Customers, Settings)..."
                                value={searchQuery}
                                onValueChange={setSearchQuery}
                                className="!ring-0 !border-0 !shadow-none !outline-none focus:!ring-0 focus:!border-transparent focus:!shadow-none focus:!outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0 focus-visible:!border-transparent focus-visible:!shadow-none focus-within:!ring-0 focus-within:!border-transparent focus-within:!shadow-none bg-transparent text-foreground placeholder:text-muted-foreground/50 font-medium pr-12"
                            />
                        </motion.div>

                        {/* Result count summary bar */}
                        <AnimatePresence initial={false}>
                            {searchQuery && searchResults && totalResults > 0 && (
                                <motion.div {...blockMotion} className="flex items-center justify-between px-6 py-2 border-b border-border/10 bg-primary/5">
                                    <span className="text-[11px] text-muted-foreground">
                                        {isLoading ? "Searching..." : (
                                            <><strong className="text-foreground">{totalResults}</strong> result{totalResults !== 1 ? 's' : ''} across <strong className="text-foreground">{categoriesHit}</strong> categor{categoriesHit !== 1 ? 'ies' : 'y'}</>
                                        )}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground/50 hidden sm:block">
                                        ↑↓ Navigate · ↵ Open · Esc Close
                                    </span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <CommandList className="global-search-list max-h-[60vh] pb-4 px-2 scrollbar-none">
                            <CommandEmpty className="py-20 text-center">
                                <div className="flex flex-col items-center justify-center space-y-4">
                                    <div className="p-4 bg-muted/40 rounded-full">
                                        <Search className="h-8 w-8 text-muted-foreground/40" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-lg font-medium text-foreground">{isLoading ? "Searching..." : "No matching results found"}</p>
                                        {!isLoading && <p className="text-sm text-muted-foreground/60">Try searching for a job ticket, customer name, or action.</p>}
                                    </div>
                                </div>
                            </CommandEmpty>

                            <AnimatePresence mode="wait" initial={false}>
                                {!searchQuery && (
                                    <motion.div key="global-search-idle" {...blockMotion}>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
                                            {/* Left Column Bento Cards */}
                                            <div className="space-y-4">
                                                <CommandGroup heading="Suggestions" className="bg-white/70 dark:bg-zinc-900/40 rounded-[1.25rem] border border-border/40 shadow-sm overflow-hidden h-fit transition-all hover:border-primary/20 pb-1">
                                                    {hasPermission('dashboard') && (
                                                        <CommandItem value="dashboard overview home" onSelect={() => runCommand(() => onNavigate('dashboard'))} className="group cursor-pointer">
                                                            <div className="p-2 rounded-lg bg-blue-500/10 mr-3 group-data-[selected=true]:bg-blue-500/20 transition-colors">
                                                                <BarChart3 className="text-blue-600 dark:text-blue-400 group-data-[selected=true]:scale-110 transition-transform" />
                                                            </div>
                                                            <span className="font-medium text-[14px]">Dashboard Overview</span>
                                                        </CommandItem>
                                                    )}
                                                    {hasPermission('jobs') && (
                                                        <CommandItem value="jobs job tickets repairs" onSelect={() => runCommand(() => onNavigate('jobs'))} className="group cursor-pointer">
                                                            <div className="p-2 rounded-lg bg-indigo-500/10 mr-3 group-data-[selected=true]:bg-indigo-500/20 transition-colors">
                                                                <ClipboardList className="text-indigo-600 dark:text-indigo-400 group-data-[selected=true]:scale-110 transition-transform" />
                                                            </div>
                                                            <span className="font-medium text-[14px]">Active Job Tickets</span>
                                                        </CommandItem>
                                                    )}
                                                    {hasPermission('pos') && (
                                                        <CommandItem value="pos point of sale invoice" onSelect={() => runCommand(() => onNavigate('pos'))} className="group cursor-pointer">
                                                            <div className="p-2 rounded-lg bg-emerald-500/10 mr-3 group-data-[selected=true]:bg-emerald-500/20 transition-colors">
                                                                <ShoppingCart className="text-emerald-600 dark:text-emerald-400 group-data-[selected=true]:scale-110 transition-transform" />
                                                            </div>
                                                            <span className="font-medium text-[14px]">Point of Sale (POS)</span>
                                                        </CommandItem>
                                                    )}
                                                </CommandGroup>

                                                <CommandGroup heading="Sales & Inventory" className="bg-white/70 dark:bg-zinc-900/40 rounded-[1.25rem] border border-border/40 shadow-sm overflow-hidden h-fit transition-all hover:border-primary/20 pb-1">
                                                    {hasPermission('inventory') && (
                                                        <CommandItem onSelect={() => runCommand(() => onNavigate('inventory'))} className="group cursor-pointer">
                                                            <div className="p-2 rounded-lg bg-purple-500/10 mr-3 group-data-[selected=true]:bg-purple-500/20 transition-colors">
                                                                <Package className="text-purple-600 dark:text-purple-400 group-data-[selected=true]:scale-110 transition-transform" />
                                                            </div>
                                                            <span className="font-medium text-[14px]">Parts & Inventory</span>
                                                        </CommandItem>
                                                    )}
                                                    {hasPermission('finance') && (
                                                        <CommandItem onSelect={() => runCommand(() => onNavigate('finance'))} className="group cursor-pointer">
                                                            <div className="p-2 rounded-lg bg-green-500/10 mr-3 group-data-[selected=true]:bg-green-500/20 transition-colors">
                                                                <Banknote className="text-green-600 dark:text-green-400 group-data-[selected=true]:scale-110 transition-transform" />
                                                            </div>
                                                            <span className="font-medium text-[14px]">Finance & Accounting</span>
                                                        </CommandItem>
                                                    )}
                                                    {hasPermission('users') && (
                                                        <CommandItem onSelect={() => runCommand(() => onNavigate('customers'))} className="group cursor-pointer">
                                                            <div className="p-2 rounded-lg bg-pink-500/10 mr-3 group-data-[selected=true]:bg-pink-500/20 transition-colors">
                                                                <Users className="text-pink-600 dark:text-pink-400 group-data-[selected=true]:scale-110 transition-transform" />
                                                            </div>
                                                            <span className="font-medium text-[14px]">Customer Directory</span>
                                                        </CommandItem>
                                                    )}
                                                </CommandGroup>
                                            </div>

                                            {/* Right Column Bento Cards */}
                                            <div className="space-y-4">
                                                <CommandGroup heading="Operations" className="bg-white/70 dark:bg-zinc-900/40 rounded-[1.25rem] border border-border/40 shadow-sm overflow-hidden h-fit transition-all hover:border-primary/20 pb-1">
                                                    {hasPermission('serviceRequests') && (
                                                        <CommandItem value="service requests" onSelect={() => runCommand(() => onNavigate('service-requests'))} className="group cursor-pointer">
                                                            <div className="p-2 rounded-lg bg-sky-500/10 mr-3 group-data-[selected=true]:bg-sky-500/20 transition-colors">
                                                                <MessageSquare className="text-sky-600 dark:text-sky-400 group-data-[selected=true]:scale-110 transition-transform" />
                                                            </div>
                                                            <span className="font-medium text-[14px]">Service Requests</span>
                                                        </CommandItem>
                                                    )}
                                                    {hasPermission('jobs') && (
                                                        <CommandItem onSelect={() => runCommand(() => onNavigate('pickup'))} className="group cursor-pointer">
                                                            <div className="p-2 rounded-lg bg-amber-500/10 mr-3 group-data-[selected=true]:bg-amber-500/20 transition-colors">
                                                                <Truck className="text-amber-600 dark:text-amber-400 group-data-[selected=true]:scale-110 transition-transform" />
                                                            </div>
                                                            <span className="font-medium text-[14px]">Delivery & Pickups</span>
                                                        </CommandItem>
                                                    )}
                                                    {hasPermission('challans') && (
                                                        <CommandItem onSelect={() => runCommand(() => onNavigate('challans'))} className="group cursor-pointer">
                                                            <div className="p-2 rounded-lg bg-orange-500/10 mr-3 group-data-[selected=true]:bg-orange-500/20 transition-colors">
                                                                <ScrollText className="text-orange-600 dark:text-orange-400 group-data-[selected=true]:scale-110 transition-transform" />
                                                            </div>
                                                            <span className="font-medium text-[14px]">Challans History</span>
                                                        </CommandItem>
                                                    )}
                                                </CommandGroup>

                                                <CommandGroup heading="System Admin" className="bg-white/70 dark:bg-zinc-900/40 rounded-[1.25rem] border border-border/40 shadow-sm overflow-hidden h-fit transition-all hover:border-primary/20 pb-1">
                                                    {hasPermission('users') && (
                                                        <CommandItem onSelect={() => runCommand(() => onNavigate('users'))} className="group cursor-pointer flex justify-between">
                                                            <div className="flex items-center">
                                                                <div className="p-2 rounded-lg bg-slate-500/10 mr-3 group-data-[selected=true]:bg-slate-500/20 transition-colors">
                                                                    <User className="text-slate-600 dark:text-slate-400 group-data-[selected=true]:scale-110 transition-transform" />
                                                                </div>
                                                                <span className="font-medium text-[14px]">User Management</span>
                                                            </div>
                                                            <CommandShortcut className="flex items-center gap-1 border border-border bg-background/50 px-2 py-0.5 rounded shadow-sm text-muted-foreground/70"><CommandIcon className="h-3 w-3" /> P</CommandShortcut>
                                                        </CommandItem>
                                                    )}
                                                    {hasPermission('settings') && (
                                                        <CommandItem value="settings configuration admin" onSelect={() => runCommand(() => onNavigate('settings'))} className="group cursor-pointer flex justify-between">
                                                            <div className="flex items-center">
                                                                <div className="p-2 rounded-lg bg-slate-500/10 mr-3 group-data-[selected=true]:bg-slate-500/20 transition-colors">
                                                                    <Settings className="text-slate-600 dark:text-slate-400 group-data-[selected=true]:scale-110 transition-transform" />
                                                                </div>
                                                                <span className="font-medium text-[14px]">System Settings</span>
                                                            </div>
                                                            <CommandShortcut className="flex items-center gap-1 border border-border bg-background/50 px-2 py-0.5 rounded shadow-sm text-muted-foreground/70"><CommandIcon className="h-3 w-3" /> S</CommandShortcut>
                                                        </CommandItem>
                                                    )}
                                                </CommandGroup>
                                            </div>
                                        </div>

                                        {/* Quick Actions Footer Bento */}
                                        <CommandGroup heading="Quick Actions" className="bg-primary/5 dark:bg-primary/10 rounded-[1.25rem] border border-primary/20 shadow-sm overflow-hidden mt-4 mx-1.5 mb-2 transition-all hover:border-primary/30 pb-1 flex flex-col justify-center">
                                            {hasPermission('jobs') && (
                                                <CommandItem onSelect={() => runCommand(() => onNavigate('jobs', 'Samsung'))} className="group cursor-pointer px-4">
                                                    <div className="p-2 rounded-lg bg-primary/20 mr-3 group-data-[selected=true]:bg-primary/30 transition-colors">
                                                        <Search className="text-primary group-data-[selected=true]:scale-110 transition-transform" />
                                                    </div>
                                                    <span className="font-medium text-[14px] text-primary/80 group-data-[selected=true]:text-primary">Find all active Jobs matching "Samsung"</span>
                                                </CommandItem>
                                            )}
                                            {hasPermission('orders') && (
                                                <CommandItem onSelect={() => runCommand(() => onNavigate('orders', 'Pending'))} className="group cursor-pointer px-4 mt-0">
                                                    <div className="p-2 rounded-lg bg-primary/20 mr-3 group-data-[selected=true]:bg-primary/30 transition-colors">
                                                        <ShoppingBag className="text-primary group-data-[selected=true]:scale-110 transition-transform" />
                                                    </div>
                                                    <span className="font-medium text-[14px] text-primary/80 group-data-[selected=true]:text-primary">Review all Pending Orders</span>
                                                </CommandItem>
                                            )}
                                        </CommandGroup>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            {/* ===================== SEARCH RESULTS ===================== */}
                            <AnimatePresence mode="wait" initial={false}>
                                {searchQuery && searchResults && (
                                    <motion.div key="global-search-results" {...blockMotion} className="pt-2 space-y-1">

                                        {/* ── Corporate B2B Jobs ── */}
                                        {(hasPermission('jobs') || hasPermission('corporate')) && corporateJobs.length > 0 && (
                                            <CommandGroup heading="Corporate B2B Jobs" className="mb-1">
                                                {corporateJobs.map((job) => {
                                                    const displayId = getJobDisplayId(job);
                                                    const customerName = resolveCustomerDisplay(job);
                                                    return (
                                                        <CommandItem
                                                            key={job.id}
                                                            value={`${job.corporateJobNumber || job.id} ${job.customer} ${job.device || ''} ${job.issue || ''}`}
                                                            onSelect={() => runCommand(() => onNavigate('b2b', job.corporateClientId || job.id))}
                                                            className="group cursor-pointer pr-4"
                                                        >
                                                            <div className="flex flex-col gap-1 w-full">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        <div className="p-1.5 rounded bg-sky-500/10 shrink-0 group-data-[selected=true]:bg-sky-500/20">
                                                                            <Building2 className="h-4 w-4 text-sky-500" />
                                                                        </div>
                                                                        <div className="flex flex-col min-w-0">
                                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                                <span className="font-semibold text-[13px] text-foreground font-mono">
                                                                                    <HighlightMatch text={displayId.label} query={searchQuery} />
                                                                                </span>
                                                                                <CategoryBadge label="Corporate" color="sky" />
                                                                                {job.priority && job.priority !== "Medium" && (
                                                                                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${job.priority === "High" || job.priority === "Urgent" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-muted text-muted-foreground"}`}>
                                                                                        {job.priority}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
                                                                                {job.corporateCompanyName && (
                                                                                    <span className="font-medium text-foreground/70 truncate"><HighlightMatch text={job.corporateCompanyName} query={searchQuery} /></span>
                                                                                )}
                                                                                <span className="text-muted-foreground/40 mx-0.5">·</span>
                                                                                <span className="truncate"><HighlightMatch text={customerName} query={searchQuery} /></span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 shrink-0 ml-2">
                                                                        {job.status && <StatusBadge status={job.status} className="h-5 text-[10px] px-1.5 py-0" />}
                                                                        {job.createdAt && <span className="text-[10px] text-muted-foreground/50 hidden sm:block">{formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}</span>}
                                                                    </div>
                                                                </div>
                                                                {(job.device || job.issue || job.technician || job.screenSize) && (
                                                                    <div className="text-[11px] text-muted-foreground ml-9 flex gap-2 items-center flex-wrap">
                                                                        {job.technician && job.technician !== "Unassigned" && (
                                                                            <div className="flex items-center gap-1">
                                                                                <UserCog className="h-3 w-3" />
                                                                                <span>{job.technician}</span>
                                                                            </div>
                                                                        )}
                                                                        {job.device && (
                                                                            <div className="flex items-center gap-1 line-clamp-1">
                                                                                <Tv className="h-3 w-3 shrink-0" />
                                                                                <HighlightMatch text={job.device} query={searchQuery} />
                                                                                {job.screenSize && <span className="text-muted-foreground/60">({job.screenSize})</span>}
                                                                            </div>
                                                                        )}
                                                                        {job.issue && <div className="line-clamp-1 border-l border-border/40 pl-2 opacity-70"><HighlightMatch text={job.issue} query={searchQuery} /></div>}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </CommandItem>
                                                    );
                                                })}
                                                <ViewAllRow
                                                    count={counts.jobs ?? 0}
                                                    displayed={searchResults.jobs?.length ?? 0}
                                                    label="Jobs Tab"
                                                    tab="b2b"
                                                    query={searchQuery}
                                                    onNavigate={onNavigate}
                                                    runCommand={runCommand}
                                                />
                                            </CommandGroup>
                                        )}

                                        {/* ── Walk-in Jobs ── */}
                                        {hasPermission('jobs') && walkInJobs.length > 0 && (
                                            <CommandGroup heading="Walk-in Jobs" className="mb-1">
                                                {walkInJobs.map((job) => {
                                                    const displayId = getJobDisplayId(job);
                                                    const customerName = resolveCustomerDisplay(job);
                                                    return (
                                                        <CommandItem
                                                            key={job.id}
                                                            value={`${job.id} ${job.customer} ${job.customerPhone || ''} ${job.device || ''} ${job.issue || ''}`}
                                                            onSelect={() => runCommand(() => onNavigate('jobs', job.ticketNumber || job.id))}
                                                            className="group cursor-pointer pr-4"
                                                        >
                                                            <div className="flex flex-col gap-1 w-full">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                        <div className="p-1.5 rounded bg-blue-500/10 shrink-0 group-data-[selected=true]:bg-blue-500/20">
                                                                            <Wrench className="h-4 w-4 text-blue-500" />
                                                                        </div>
                                                                        <div className="flex flex-col min-w-0">
                                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                                <span className="font-semibold text-[13px] text-foreground font-mono">
                                                                                    <HighlightMatch text={displayId.label} query={searchQuery} />
                                                                                </span>
                                                                                <CategoryBadge label="Jobs Tab" color="blue" />
                                                                                {job.priority && job.priority !== "Medium" && (
                                                                                    <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${job.priority === "High" || job.priority === "Urgent" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-muted text-muted-foreground"}`}>
                                                                                        {job.priority}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <span className="text-[12px] text-foreground/70 font-medium">
                                                                                <HighlightMatch text={customerName} query={searchQuery} />
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 shrink-0 ml-2">
                                                                        {job.status && <StatusBadge status={job.status} className="h-5 text-[10px] px-1.5 py-0" />}
                                                                        {job.createdAt && <span className="text-[10px] text-muted-foreground/50 hidden sm:block">{formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}</span>}
                                                                    </div>
                                                                </div>
                                                                {(job.device || job.issue || job.technician || job.customerPhone) && (
                                                                    <div className="text-[11px] text-muted-foreground ml-9 flex gap-2 items-center flex-wrap">
                                                                        {job.customerPhone && (
                                                                            <div className="flex items-center gap-1 text-muted-foreground/60">
                                                                                <Phone className="h-3 w-3 shrink-0" />
                                                                                <HighlightMatch text={job.customerPhone} query={searchQuery} />
                                                                            </div>
                                                                        )}
                                                                        {job.technician && job.technician !== "Unassigned" && (
                                                                            <div className="flex items-center gap-1 border-l border-border/40 pl-2">
                                                                                <UserCog className="h-3 w-3" />
                                                                                <span>{job.technician}</span>
                                                                            </div>
                                                                        )}
                                                                        {job.device && (
                                                                            <div className="flex items-center gap-1 border-l border-border/40 pl-2 line-clamp-1">
                                                                                <Tv className="h-3 w-3 shrink-0" />
                                                                                <HighlightMatch text={job.device} query={searchQuery} />
                                                                                {job.screenSize && <span className="text-muted-foreground/60">({job.screenSize})</span>}
                                                                            </div>
                                                                        )}
                                                                        {job.issue && <div className="line-clamp-1 border-l border-border/40 pl-2 opacity-70"><HighlightMatch text={job.issue} query={searchQuery} /></div>}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </CommandItem>
                                                    );
                                                })}
                                                <ViewAllRow
                                                    count={counts.jobs ?? 0}
                                                    displayed={searchResults.jobs?.length ?? 0}
                                                    label="Jobs Tab"
                                                    tab="jobs"
                                                    query={searchQuery}
                                                    onNavigate={onNavigate}
                                                    runCommand={runCommand}
                                                />
                                            </CommandGroup>
                                        )}

                                        {/* ── Service Requests ── */}
                                        {hasPermission('serviceRequests') && searchResults.serviceRequests.length > 0 && (
                                            <CommandGroup heading="Service Requests" className="mb-1">
                                                {searchResults.serviceRequests.map((sr) => (
                                                    <CommandItem
                                                        key={sr.id}
                                                        value={`${sr.ticketNumber} ${sr.customerName} ${sr.brand || ''} ${sr.modelNumber || ''} ${sr.primaryIssue || ''}`}
                                                        onSelect={() => runCommand(() => onNavigate('service-requests', sr.ticketNumber))}
                                                        className="group cursor-pointer pr-4"
                                                    >
                                                        <div className="flex flex-col gap-1 w-full">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <div className="p-1.5 rounded bg-purple-500/10 shrink-0 group-data-[selected=true]:bg-purple-500/20">
                                                                        <MessageSquare className="h-4 w-4 text-purple-500" />
                                                                    </div>
                                                                    <div className="flex flex-col min-w-0">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <span className="font-semibold text-[13px] font-mono"><HighlightMatch text={sr.ticketNumber} query={searchQuery} /></span>
                                                                            <CategoryBadge label="Service Request" color="purple" />
                                                                        </div>
                                                                        <div className="flex items-center gap-1 text-[12px] text-foreground/70">
                                                                            <span className="font-medium"><HighlightMatch text={sr.customerName} query={searchQuery} /></span>
                                                                            {sr.phone && <><span className="text-muted-foreground/40">·</span><span className="text-muted-foreground/60 flex items-center gap-0.5"><Phone className="h-3 w-3" /><HighlightMatch text={sr.phone} query={searchQuery} /></span></>}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                                                    {sr.status && <StatusBadge status={sr.status} className="h-5 text-[10px] px-1.5 py-0" />}
                                                                    {sr.createdAt && <span className="text-[10px] text-muted-foreground/50 hidden sm:block">{formatDistanceToNow(new Date(sr.createdAt), { addSuffix: true })}</span>}
                                                                </div>
                                                            </div>
                                                            {(sr.brand || sr.modelNumber || sr.primaryIssue) && (
                                                                <div className="text-[11px] text-muted-foreground ml-9 flex gap-2 items-center flex-wrap">
                                                                    {sr.brand && <span className="font-medium"><HighlightMatch text={sr.brand} query={searchQuery} /></span>}
                                                                    {sr.modelNumber && <div className="line-clamp-1 border-l border-border/40 pl-2"><HighlightMatch text={sr.modelNumber} query={searchQuery} /></div>}
                                                                    {sr.primaryIssue && <div className="line-clamp-1 border-l border-border/40 pl-2 opacity-70"><HighlightMatch text={sr.primaryIssue} query={searchQuery} /></div>}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </CommandItem>
                                                ))}
                                                <ViewAllRow
                                                    count={counts.serviceRequests ?? 0}
                                                    displayed={searchResults.serviceRequests?.length ?? 0}
                                                    label="Service Requests"
                                                    tab="service-requests"
                                                    query={searchQuery}
                                                    onNavigate={onNavigate}
                                                    runCommand={runCommand}
                                                />
                                            </CommandGroup>
                                        )}

                                        {/* ── Customers & Users ── */}
                                        {hasPermission('users') && searchResults.customers.length > 0 && (
                                            <CommandGroup heading="Customers & Users" className="mb-1">
                                                {searchResults.customers.map((customer) => (
                                                    <CommandItem
                                                        key={customer.id}
                                                        value={`${customer.name} ${customer.phone} ${customer.email || ''}`}
                                                        onSelect={() => runCommand(() => onNavigate('customers', customer.phone))}
                                                        className="group cursor-pointer pr-4"
                                                    >
                                                        <div className="flex items-center justify-between w-full">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <div className="p-1.5 rounded bg-green-500/10 shrink-0 group-data-[selected=true]:bg-green-500/20">
                                                                    <User className="h-4 w-4 text-green-500" />
                                                                </div>
                                                                <div className="flex flex-col min-w-0">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="font-semibold text-[13px]"><HighlightMatch text={customer.name} query={searchQuery} /></span>
                                                                        <CategoryBadge label={customer.role === "admin" || customer.role === "Super Admin" ? "Admin" : "Customer"} color="green" />
                                                                    </div>
                                                                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                                                        <Phone className="h-3 w-3 shrink-0" />
                                                                        <HighlightMatch text={customer.phone} query={searchQuery} />
                                                                        {customer.email && <><span className="text-muted-foreground/40 mx-0.5">·</span><span className="truncate opacity-70">{customer.email}</span></>}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0 ml-2">
                                                                {customer.createdAt && <span className="text-[10px] text-muted-foreground/50 hidden sm:block">{formatDistanceToNow(new Date(customer.createdAt), { addSuffix: true })}</span>}
                                                            </div>
                                                        </div>
                                                    </CommandItem>
                                                ))}
                                                <ViewAllRow
                                                    count={counts.customers ?? 0}
                                                    displayed={searchResults.customers?.length ?? 0}
                                                    label="Customers"
                                                    tab="customers"
                                                    query={searchQuery}
                                                    onNavigate={onNavigate}
                                                    runCommand={runCommand}
                                                />
                                            </CommandGroup>
                                        )}

                                        {/* ── POS / Invoices ── */}
                                        {hasPermission('pos') && searchResults.posTransactions.length > 0 && (
                                            <CommandGroup heading="Invoices & POS" className="mb-1">
                                                {searchResults.posTransactions.map((inv) => (
                                                    <CommandItem
                                                        key={inv.id}
                                                        value={`${inv.invoiceNumber} ${inv.customer} ${inv.customerPhone || ''}`}
                                                        onSelect={() => runCommand(() => onNavigate('pos', inv.invoiceNumber))}
                                                        className="group cursor-pointer pr-4"
                                                    >
                                                        <div className="flex items-center justify-between w-full">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <div className="p-1.5 rounded bg-emerald-500/10 shrink-0 group-data-[selected=true]:bg-emerald-500/20">
                                                                    <ShoppingCart className="h-4 w-4 text-emerald-500" />
                                                                </div>
                                                                <div className="flex flex-col min-w-0">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="font-semibold text-[13px] font-mono"><HighlightMatch text={inv.invoiceNumber} query={searchQuery} /></span>
                                                                        <CategoryBadge label="Invoice" color="emerald" />
                                                                    </div>
                                                                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                                                        <span><HighlightMatch text={inv.customer} query={searchQuery} /></span>
                                                                        {inv.customerPhone && <><span className="text-muted-foreground/40">·</span><span className="flex items-center gap-0.5"><Phone className="h-3 w-3" /><HighlightMatch text={inv.customerPhone} query={searchQuery} /></span></>}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0 ml-2">
                                                                {inv.paymentStatus && <StatusBadge status={inv.paymentStatus} className="h-5 text-[10px] px-1.5 py-0" />}
                                                                {inv.createdAt && <span className="text-[10px] text-muted-foreground/50 hidden sm:block">{formatDistanceToNow(new Date(inv.createdAt), { addSuffix: true })}</span>}
                                                            </div>
                                                        </div>
                                                    </CommandItem>
                                                ))}
                                                <ViewAllRow
                                                    count={counts.posTransactions ?? 0}
                                                    displayed={searchResults.posTransactions?.length ?? 0}
                                                    label="POS"
                                                    tab="pos"
                                                    query={searchQuery}
                                                    onNavigate={onNavigate}
                                                    runCommand={runCommand}
                                                />
                                            </CommandGroup>
                                        )}

                                        {/* ── Inventory ── */}
                                        {hasPermission('inventory') && searchResults.inventory.length > 0 && (
                                            <CommandGroup heading="Inventory Items" className="mb-1">
                                                {searchResults.inventory.map((item) => (
                                                    <CommandItem
                                                        key={item.id}
                                                        value={`${item.name} ${item.id} ${item.description || ''}`}
                                                        onSelect={() => runCommand(() => onNavigate('inventory', item.name))}
                                                        className="group cursor-pointer"
                                                    >
                                                        <div className="flex flex-col gap-1 w-full">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <div className="p-1.5 rounded bg-zinc-500/10 shrink-0 group-data-[selected=true]:bg-zinc-500/20">
                                                                        <Package className="h-4 w-4 text-zinc-500" />
                                                                    </div>
                                                                    <div className="flex flex-col min-w-0">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <span className="font-semibold text-[13px]"><HighlightMatch text={item.name} query={searchQuery} /></span>
                                                                            <CategoryBadge label="Inventory" color="zinc" />
                                                                        </div>
                                                                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                                                            <Hash className="h-3 w-3 shrink-0" />
                                                                            <span className="font-mono opacity-70">{item.id}</span>
                                                                            <span className="text-muted-foreground/40 mx-0.5">·</span>
                                                                            <span className={`font-medium ${item.stock <= 0 ? "text-red-500" : item.stock <= 5 ? "text-amber-500" : "text-green-600"}`}>
                                                                                {item.stock} in stock
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {item.description && (
                                                                <div className="text-[11px] text-muted-foreground ml-9 line-clamp-1 opacity-70">
                                                                    <HighlightMatch text={item.description} query={searchQuery} />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </CommandItem>
                                                ))}
                                                <ViewAllRow
                                                    count={counts.inventory ?? 0}
                                                    displayed={searchResults.inventory?.length ?? 0}
                                                    label="Inventory"
                                                    tab="inventory"
                                                    query={searchQuery}
                                                    onNavigate={onNavigate}
                                                    runCommand={runCommand}
                                                />
                                            </CommandGroup>
                                        )}

                                        {/* ── Challans ── */}
                                        {hasPermission('challans') && searchResults.challans.length > 0 && (
                                            <CommandGroup heading="Delivery Challans" className="mb-1">
                                                {searchResults.challans.map((challan) => (
                                                    <CommandItem
                                                        key={challan.id}
                                                        value={`${challan.id} ${challan.receiver} ${challan.vehicleNo || ''}`}
                                                        onSelect={() => runCommand(() => onNavigate('challans', challan.id))}
                                                        className="group cursor-pointer pr-4"
                                                    >
                                                        <div className="flex flex-col gap-1 w-full">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <div className="p-1.5 rounded bg-orange-500/10 shrink-0 group-data-[selected=true]:bg-orange-500/20">
                                                                        <ScrollText className="h-4 w-4 text-orange-500" />
                                                                    </div>
                                                                    <div className="flex flex-col min-w-0">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <span className="font-semibold text-[13px] font-mono"><HighlightMatch text={`#${challan.id.slice(-6).toUpperCase()}`} query={searchQuery} /></span>
                                                                            <CategoryBadge label="Challan" color="orange" />
                                                                            {challan.type && <span className="text-[9px] font-bold uppercase tracking-wider bg-muted px-1.5 py-0.5 rounded-full">{challan.type}</span>}
                                                                        </div>
                                                                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                                                                            <HighlightMatch text={challan.receiver} query={searchQuery} />
                                                                            {challan.vehicleNo && <><span className="text-muted-foreground/40">·</span><span className="flex items-center gap-0.5"><Truck className="h-3 w-3" />{challan.vehicleNo}</span></>}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                                                    {challan.status && <StatusBadge status={challan.status} className="h-5 text-[10px] px-1.5 py-0" />}
                                                                    {challan.createdAt && <span className="text-[10px] text-muted-foreground/50 hidden sm:block">{formatDistanceToNow(new Date(challan.createdAt), { addSuffix: true })}</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </CommandItem>
                                                ))}
                                                <ViewAllRow
                                                    count={counts.challans ?? 0}
                                                    displayed={searchResults.challans?.length ?? 0}
                                                    label="Challans"
                                                    tab="challans"
                                                    query={searchQuery}
                                                    onNavigate={onNavigate}
                                                    runCommand={runCommand}
                                                />
                                            </CommandGroup>
                                        )}

                                        {/* No results at all */}
                                        {totalResults === 0 && !isLoading && searchQuery.length >= 1 && (
                                            <motion.div {...blockMotion} className="py-12 text-center">
                                                <div className="flex flex-col items-center gap-3">
                                                    <div className="p-4 bg-muted/40 rounded-full">
                                                        <Search className="h-7 w-7 text-muted-foreground/40" />
                                                    </div>
                                                    <div>
                                                        <p className="text-[15px] font-medium text-foreground">No results for "{searchQuery}"</p>
                                                        <p className="text-[12px] text-muted-foreground/60 mt-1">Try a different job number, customer name, or device model.</p>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Keyboard shortcut hint bar if no search */}
                            {!searchQuery && (
                                <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground/40 pb-2 pt-4">
                                    <span className="flex items-center gap-1"><kbd className="border border-border/50 bg-muted px-1.5 py-0.5 rounded text-[9px] font-mono">↑↓</kbd> Navigate</span>
                                    <span className="flex items-center gap-1"><kbd className="border border-border/50 bg-muted px-1.5 py-0.5 rounded text-[9px] font-mono">↵</kbd> Select</span>
                                    <span className="flex items-center gap-1"><kbd className="border border-border/50 bg-muted px-1.5 py-0.5 rounded text-[9px] font-mono">Esc</kbd> Close</span>
                                    <span className="flex items-center gap-1"><kbd className="border border-border/50 bg-muted px-1.5 py-0.5 rounded text-[9px] font-mono">⌘K</kbd> Toggle</span>
                                </div>
                            )}
                        </CommandList>
                    </Command>
                </motion.div>
            </DialogContent>
        </Dialog>
    );
}
