import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
    Calculator,
    Calendar,
    CreditCard,
    Database,
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
    Hash,
    ArrowLeft,
    Sparkles
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { searchApi } from "@/lib/api";
import { variants } from "@/lib/motion";
import { HighlightMatch } from "./HighlightMatch";
import { formatDistanceToNow } from "date-fns";
import { StatusBadge } from "./StatusBadge";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import type { UserPermissions } from "@shared/schema";

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
    onNavigate: (tab: string, searchQuery?: string, payload?: SearchNavigationPayload) => void;
}

export interface SearchNavigationPayload {
    targetId?: string;
    clientId?: string;
    searchQuery?: string;
    recordType?: string;
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

function getSmartSearchIntent(query: string) {
    const trimmed = query.trim();
    const digits = trimmed.replace(/\D/g, "");
    const lower = trimmed.toLowerCase();
    return {
        isPhone: digits.length >= 6,
        isInvoice: /^(pos|inv|invoice|bill)[-\s]*/i.test(trimmed),
        isChallan: lower.includes("challan") || /^ch[-\s]?\w+/i.test(trimmed),
        isJob: /^#?\d{5,}$/.test(trimmed) || /^[a-z0-9_-]{8,}$/i.test(trimmed),
        isInventory: lower.includes("board") || lower.includes("remote") || lower.includes("panel") || lower.includes("stock") || lower.includes("part"),
        isFinance: lower.includes("finance") || lower.includes("petty") || lower.includes("due") || lower.includes("refund") || lower.includes("payment") || lower.includes("expense") || lower.includes("bkash") || lower.includes("nagad") || lower.includes("cash") || /^\d+\.?\d*$/.test(trimmed),
        isSettings: /(setting|config|logo|company|site|vat|tax|currency|invoice|notification|permission|user|backup|restore|hero|homepage|cms|about|team|brand|category|service)/i.test(trimmed),
    };
}

interface BestMatchItem {
    id: string;
    type: string;
    primaryText: string;
    secondaryText: string;
    icon: React.ElementType;
    color: string;
    tab: string;
    payload: SearchNavigationPayload;
    searchQuery: string;
    permission: keyof UserPermissions;
    score: number;
    status?: string;
    createdAt?: string;
}

function scoreField(query: string, value: string | null | undefined, weight: number): number {
    if (!value) return 0;
    const q = query.trim().toLowerCase();
    const v = value.toLowerCase();
    if (!q) return 0;
    if (v === q) return weight;
    if (v.startsWith(q)) return Math.round(weight * 0.6);
    if (v.includes(q)) return Math.round(weight * 0.2);
    return 0;
}

function recencyBonus(createdAt: string | null | undefined): number {
    if (!createdAt) return 0;
    const age = Date.now() - new Date(createdAt).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (age < sevenDays) return 5;
    if (age < 30 * 24 * 60 * 60 * 1000) return 2;
    return 0;
}

function computeBestMatches(
    results: any,
    query: string,
    hasPermission: (p: keyof UserPermissions) => boolean,
): BestMatchItem[] {
    if (!query.trim() || !results) return [];
    const q = query.trim();
    const digits = q.replace(/\D/g, "");
    const items: BestMatchItem[] = [];
    const seen = new Set<string>();

    const jobs: any[] = results.jobs || [];
    for (const job of jobs) {
        if (seen.has(job.id)) continue;
        const isCorp = !!job.corporateClientId;
        const perm: keyof UserPermissions = isCorp ? "corporate" : "jobs";
        if (!hasPermission(perm) && !hasPermission("jobs")) continue;
        const primaryId = job.corporateJobNumber || job.ticketNumber || "";
        const shortId = job.id ? `#${job.id.slice(-6).toUpperCase()}` : "";
        let score = scoreField(q, primaryId, 100);
        score += scoreField(q, job.id, 80);
        score += scoreField(q, shortId, 70);
        score += scoreField(q, job.customer, 25);
        score += scoreField(q, job.customerPhone, 30);
        score += scoreField(q, job.device, 20);
        score += scoreField(q, job.issue, 10);
        score += recencyBonus(job.createdAt);
        if (job.priority === "High" || job.priority === "Urgent") score += 3;
        if (score < 20) continue;
        seen.add(job.id);
        items.push({
            id: job.id,
            type: isCorp ? "corporate-job" : "job",
            primaryText: primaryId || shortId,
            secondaryText: [job.corporateCompanyName, job.customer, job.device].filter(Boolean).join(" · "),
            icon: isCorp ? Building2 : Wrench,
            color: isCorp ? "sky" : "blue",
            tab: isCorp ? "b2b" : "jobs",
            payload: { targetId: job.id, clientId: job.corporateClientId, searchQuery: primaryId || job.id },
            searchQuery: primaryId || job.id,
            permission: perm,
            score,
            status: job.status,
            createdAt: job.createdAt,
        });
    }

    const srs: any[] = results.serviceRequests || [];
    for (const sr of srs) {
        if (seen.has(sr.id)) continue;
        if (!hasPermission("serviceRequests")) continue;
        let score = scoreField(q, sr.ticketNumber, 100);
        score += scoreField(q, sr.id, 80);
        score += scoreField(q, sr.reference, 60);
        score += scoreField(q, sr.customerName, 25);
        score += scoreField(q, sr.phone, 30);
        score += scoreField(q, sr.brand, 15);
        score += scoreField(q, sr.modelNumber, 15);
        score += scoreField(q, sr.primaryIssue, 10);
        score += recencyBonus(sr.createdAt);
        if (score < 20) continue;
        seen.add(sr.id);
        items.push({
            id: sr.id,
            type: "service-request",
            primaryText: sr.ticketNumber,
            secondaryText: [sr.customerName, sr.phone, sr.brand, sr.modelNumber].filter(Boolean).join(" · "),
            icon: MessageSquare,
            color: "purple",
            tab: "service-requests",
            payload: { targetId: sr.id, searchQuery: sr.ticketNumber },
            searchQuery: sr.ticketNumber,
            permission: "serviceRequests",
            score,
            status: sr.status,
            createdAt: sr.createdAt,
        });
    }

    const customers: any[] = results.customers || [];
    for (const c of customers) {
        if (seen.has(c.id)) continue;
        if (!hasPermission("users")) continue;
        let score = scoreField(q, c.phone, 100);
        if (digits.length >= 6 && c.phone) {
            const phoneDigits = c.phone.replace(/\D/g, "");
            if (phoneDigits === digits) score += 100;
            else if (phoneDigits.startsWith(digits) || phoneDigits.endsWith(digits)) score += 60;
            else if (phoneDigits.includes(digits)) score += 30;
        }
        score += scoreField(q, c.id, 80);
        score += scoreField(q, c.name, 40);
        score += scoreField(q, c.email, 20);
        score += recencyBonus(c.createdAt);
        if (score < 20) continue;
        seen.add(c.id);
        items.push({
            id: c.id,
            type: "customer",
            primaryText: c.name,
            secondaryText: [c.phone, c.email].filter(Boolean).join(" · "),
            icon: User,
            color: "green",
            tab: "customers",
            payload: { targetId: c.id, searchQuery: c.phone || c.name },
            searchQuery: c.phone || c.name,
            permission: "users",
            score,
            createdAt: c.createdAt,
        });
    }

    const pos: any[] = results.posTransactions || [];
    for (const inv of pos) {
        if (seen.has(inv.id)) continue;
        if (!hasPermission("pos")) continue;
        let score = scoreField(q, inv.invoiceNumber, 100);
        score += scoreField(q, inv.id, 80);
        score += scoreField(q, inv.customer, 25);
        score += scoreField(q, inv.customerPhone, 30);
        score += recencyBonus(inv.createdAt);
        if (score < 20) continue;
        seen.add(inv.id);
        items.push({
            id: inv.id,
            type: "invoice",
            primaryText: inv.invoiceNumber,
            secondaryText: [inv.customer, inv.customerPhone, inv.paymentStatus].filter(Boolean).join(" · "),
            icon: ShoppingCart,
            color: "emerald",
            tab: "pos",
            payload: { targetId: inv.id, searchQuery: inv.invoiceNumber },
            searchQuery: inv.invoiceNumber,
            permission: "pos",
            score,
            status: inv.paymentStatus,
            createdAt: inv.createdAt,
        });
    }

    const inv: any[] = results.inventory || [];
    for (const item of inv) {
        if (seen.has(item.id)) continue;
        if (!hasPermission("inventory")) continue;
        let score = scoreField(q, item.name, 100);
        score += scoreField(q, item.id, 80);
        score += scoreField(q, item.description, 20);
        if (score < 20) continue;
        seen.add(item.id);
        items.push({
            id: item.id,
            type: "inventory",
            primaryText: item.name,
            secondaryText: [item.id, `${item.stock} in stock`].filter(Boolean).join(" · "),
            icon: Package,
            color: "zinc",
            tab: "inventory",
            payload: { targetId: item.id, searchQuery: item.name },
            searchQuery: item.name,
            permission: "inventory",
            score,
        });
    }

    const challans: any[] = results.challans || [];
    for (const ch of challans) {
        if (seen.has(ch.id)) continue;
        if (!hasPermission("challans")) continue;
        const shortId = ch.id ? `#${ch.id.slice(-6).toUpperCase()}` : "";
        let score = scoreField(q, ch.id, 100);
        score += scoreField(q, shortId, 70);
        score += scoreField(q, ch.receiver, 25);
        score += scoreField(q, ch.vehicleNo, 15);
        score += recencyBonus(ch.createdAt);
        if (score < 20) continue;
        seen.add(ch.id);
        items.push({
            id: ch.id,
            type: "challan",
            primaryText: shortId || ch.id,
            secondaryText: [ch.receiver, ch.vehicleNo, ch.type].filter(Boolean).join(" · "),
            icon: ScrollText,
            color: "orange",
            tab: "challans",
            payload: { targetId: ch.id, searchQuery: ch.id },
            searchQuery: ch.id,
            permission: "challans",
            score,
            status: ch.status,
            createdAt: ch.createdAt,
        });
    }

    const financeRecords: any[] = results.finance || [];
    for (const f of financeRecords) {
        if (seen.has(f.id)) continue;
        if (!hasPermission("finance")) continue;
        let score = scoreField(q, f.reference, 100);
        score += scoreField(q, f.id, 80);
        score += scoreField(q, f.customer, 40);
        score += scoreField(q, f.status, 20);
        const amountStr = f.amount ? String(f.amount) : "";
        score += scoreField(q, amountStr, 30);
        score += recencyBonus(f.createdAt);
        if (f.status === "Pending" || f.status === "pending") score += 3;
        if (score < 20) continue;
        seen.add(f.id);
        items.push({
            id: f.id,
            type: f.type,
            primaryText: f.reference || f.id,
            secondaryText: [f.customer, f.status, `৳${f.amount}`].filter(Boolean).join(" · "),
            icon: Banknote,
            color: "emerald",
            tab: "finance",
            payload: { targetId: f.id, searchQuery: f.reference || f.id, recordType: f.type },
            searchQuery: f.reference || f.id,
            permission: "finance",
            score,
            status: f.status,
            createdAt: f.createdAt,
        });
    }

    items.sort((a, b) => b.score - a.score);
    return items.slice(0, 3);
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
    tab: string; query: string; onNavigate: (tab: string, searchQuery?: string, payload?: SearchNavigationPayload) => void; runCommand: Function;
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
    const counts = searchResults?.counts ?? { jobs: 0, customers: 0, serviceRequests: 0, posTransactions: 0, inventory: 0, challans: 0, finance: 0 };

    const totalResults = React.useMemo(() => {
        if (!counts) return 0;
        return (counts.jobs || 0) + (counts.customers || 0) + (counts.serviceRequests || 0) +
            (counts.posTransactions || 0) + (counts.inventory || 0) + (counts.challans || 0) +
            (counts.finance || 0);
    }, [counts]);

    const categoriesHit = React.useMemo(() => {
        if (!counts) return 0;
        return Object.values(counts).filter((v: any) => v > 0).length;
    }, [counts]);

    const smartActions = React.useMemo(() => {
        const q = searchQuery.trim();
        if (!q) return [];
        const intent = getSmartSearchIntent(q);
        const actions: Array<{ key: string; tab: string; label: string; detail: string; icon: React.ElementType; permission: keyof UserPermissions }> = [];

        if (intent.isJob) actions.push({ key: "job", tab: "jobs", label: "Find job ticket", detail: q, icon: ClipboardList, permission: "jobs" });
        if (intent.isPhone) actions.push({ key: "customer", tab: "customers", label: "Find customer by phone", detail: q, icon: Phone, permission: "users" });
        if (intent.isInvoice) actions.push({ key: "pos", tab: "pos", label: "Open invoice/POS search", detail: q, icon: ShoppingCart, permission: "pos" });
        if (intent.isChallan) actions.push({ key: "challan", tab: "challans", label: "Search challans", detail: q, icon: ScrollText, permission: "challans" });
        if (intent.isInventory) actions.push({ key: "inventory", tab: "inventory", label: "Search stock and parts", detail: q, icon: Package, permission: "inventory" });
        if (intent.isFinance) actions.push({ key: "finance", tab: "finance", label: "Search finance records", detail: q, icon: Banknote, permission: "finance" });
        if (intent.isSettings) actions.push({ key: "settings", tab: "settings", label: "Open matching settings", detail: q, icon: Settings, permission: "settings" });

        actions.push({ key: "all-jobs", tab: "jobs", label: "Search in Jobs", detail: q, icon: Wrench, permission: "jobs" });
        actions.push({ key: "all-inventory", tab: "inventory", label: "Search in Inventory", detail: q, icon: Package, permission: "inventory" });
        if (intent.isSettings) actions.push({ key: "all-settings", tab: "settings", label: "Search in Settings", detail: q, icon: Settings, permission: "settings" });
        return actions.filter((action, index, list) => hasPermission(action.permission) && list.findIndex(item => item.key === action.key) === index).slice(0, 4);
    }, [searchQuery, hasPermission]);

    const bestMatches = React.useMemo(
        () => computeBestMatches(searchResults, searchQuery, hasPermission),
        [searchResults, searchQuery, hasPermission],
    );

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
                className="global-search-dialog left-0 top-0 h-[100dvh] max-h-[100dvh] translate-x-0 translate-y-0 overflow-hidden rounded-none border-0 p-0 sm:left-[50%] sm:top-[50%] sm:h-auto sm:max-h-[86vh] sm:max-w-[700px] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:border sm:border-white/20 dark:sm:border-white/10 bg-slate-50/95 dark:bg-slate-950/95 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.3)] sm:rounded-[2rem] supports-[backdrop-filter]:bg-slate-50/80 dark:supports-[backdrop-filter]:bg-slate-950/80 [&>button]:right-6 [&>button]:top-5 [&>button]:hidden sm:[&>button]:flex hover:[&>button]:scale-110 [&>button]:transition-transform [&>button]:w-8 [&>button]:h-8 [&>button]:rounded-full [&>button]:border [&>button]:border-border/40 [&>button]:bg-white dark:[&>button]:bg-zinc-800 hover:[&>button]:bg-muted [&>button_svg]:w-4 [&>button_svg]:h-4 [&>button_svg]:text-muted-foreground hover:[&>button_svg]:text-foreground [&>button]:shadow-sm outline-none"
            >
                <motion.div
                    initial="initial"
                    animate={show ? "animate" : "exit"}
                    variants={variants.modalContent}
                    style={{ willChange: "transform, opacity" }}
                    className="flex h-full min-h-0 flex-col sm:h-auto"
                >
                    <div className="flex items-center gap-3 border-b border-border/10 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:hidden">
                        <button
                            type="button"
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm active:scale-95"
                            onClick={() => setShow?.(false)}
                            aria-label="Back from global search"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                        <div className="min-w-0 flex-1">
                            <div className="text-lg font-black text-slate-950">Smart Search</div>
                            <div className="text-xs font-semibold text-slate-500">Find jobs, customers, invoices, stock.</div>
                        </div>
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                            <Sparkles className="h-5 w-5" />
                        </div>
                    </div>
                    <Command shouldFilter={false} className="flex min-h-0 flex-1 flex-col bg-transparent overflow-hidden outline-none [&_[cmdk-input-wrapper]]:border-b [&_[cmdk-input-wrapper]]:border-border/10 [&_[cmdk-input-wrapper]]:px-4 sm:[&_[cmdk-input-wrapper]]:px-6 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input-wrapper]_svg]:text-primary/70 [&_[cmdk-input]]:h-14 sm:[&_[cmdk-input]]:h-16 [&_[cmdk-input]]:text-base [&_[cmdk-input]]:focus:!ring-0 [&_[cmdk-input]]:focus:!border-transparent [&_[cmdk-input]]:focus:!shadow-none [&_[cmdk-input]]:focus:!outline-none [&_[cmdk-item]]:min-h-12 [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-3 sm:[&_[cmdk-item]]:py-2.5 [&_[cmdk-item]_svg]:h-[18px] [&_[cmdk-item]_svg]:w-[18px] [&_[cmdk-item]]:rounded-2xl sm:[&_[cmdk-item]]:rounded-xl [&_[cmdk-item]]:mx-2 [&_[cmdk-item]]:transition-all [&_[cmdk-item]]:duration-200 [&_[cmdk-item][data-selected=true]]:bg-primary/10 [&_[cmdk-item][data-selected=true]]:text-primary [&_[cmdk-item][data-selected=true]]:scale-[1.01] [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:text-muted-foreground/50 [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:uppercase">
                        <motion.div {...headerMotion}>
                            <CommandInput
                                placeholder="Search job, phone, invoice, stock..."
                                value={searchQuery}
                                onValueChange={setSearchQuery}
                                className="!ring-0 !border-0 !shadow-none !outline-none focus:!ring-0 focus:!border-transparent focus:!shadow-none focus:!outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0 focus-visible:!border-transparent focus-visible:!shadow-none focus-within:!ring-0 focus-within:!border-transparent focus-within:!shadow-none bg-transparent text-foreground placeholder:text-muted-foreground/50 font-semibold pr-3 sm:pr-12"
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

                        <CommandList className="global-search-list max-h-none flex-1 pb-[calc(1rem+env(safe-area-inset-bottom))] px-2 scrollbar-none sm:max-h-[60vh] sm:pb-4">
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

                            {searchQuery && bestMatches.length > 0 && (
                                <CommandGroup heading="Best Match" className="mx-1 mb-2 mt-3 rounded-[1.25rem] border border-amber-200 bg-gradient-to-br from-amber-50/90 to-orange-50/70 pb-1 shadow-sm">
                                    {bestMatches.map((match) => {
                                        const Icon = match.icon;
                                        const colorMap: Record<string, string> = {
                                            blue: "bg-blue-500/10 text-blue-600",
                                            sky: "bg-sky-500/10 text-sky-600",
                                            purple: "bg-purple-500/10 text-purple-600",
                                            green: "bg-green-500/10 text-green-600",
                                            emerald: "bg-emerald-500/10 text-emerald-600",
                                            orange: "bg-orange-500/10 text-orange-600",
                                            zinc: "bg-zinc-500/10 text-zinc-600",
                                        };
                                        const iconBg = colorMap[match.color] ?? colorMap.zinc;
                                        return (
                                            <CommandItem
                                                key={match.id}
                                                value={`${match.type} ${match.primaryText} ${match.secondaryText}`}
                                                onSelect={() => runCommand(() => onNavigate(match.tab, match.searchQuery, match.payload))}
                                                className="group cursor-pointer pr-4"
                                            >
                                                <div className="flex items-center gap-3 w-full">
                                                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${iconBg} group-data-[selected=true]:scale-110 transition-transform`}>
                                                        <Icon className="h-5 w-5" />
                                                    </div>
                                                    <div className="flex flex-col min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="font-black text-[14px] text-foreground font-mono">
                                                                <HighlightMatch text={match.primaryText} query={searchQuery} />
                                                            </span>
                                                            <CategoryBadge label={match.type.replace("-", " ")} color={match.color} />
                                                            {match.status && <StatusBadge status={match.status} className="h-5 text-[10px] px-1.5 py-0" />}
                                                        </div>
                                                        <div className="text-[12px] text-muted-foreground truncate mt-0.5">
                                                            <HighlightMatch text={match.secondaryText} query={searchQuery} />
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                                                        <ChevronRight className="h-4 w-4 text-amber-500" />
                                                        {match.createdAt && (
                                                            <span className="text-[10px] text-muted-foreground/50 hidden sm:block">
                                                                {formatDistanceToNow(new Date(match.createdAt), { addSuffix: true })}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </CommandItem>
                                        );
                                    })}
                                </CommandGroup>
                            )}

                            {searchQuery && smartActions.length > 0 && (
                                <CommandGroup heading="Smart Actions" className="mx-1 mb-2 mt-3 rounded-[1.25rem] border border-blue-100 bg-blue-50/70 pb-1 shadow-sm">
                                    {smartActions.map((action) => {
                                        const Icon = action.icon;
                                        return (
                                            <CommandItem
                                                key={action.key}
                                                value={`${action.label} ${action.detail}`}
                                                onSelect={() => runCommand(() => onNavigate(action.tab, action.detail))}
                                                className="group cursor-pointer"
                                            >
                                                <div className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm group-data-[selected=true]:bg-blue-100">
                                                    <Icon className="h-5 w-5" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-sm font-black text-slate-900">{action.label}</div>
                                                    <div className="truncate text-xs font-semibold text-slate-500">{action.detail}</div>
                                                </div>
                                                <ChevronRight className="h-4 w-4 shrink-0 text-blue-400" />
                                            </CommandItem>
                                        );
                                    })}
                                </CommandGroup>
                            )}

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

                                                {hasPermission('settings') && (
                                                    <CommandGroup heading="Settings Shortcuts" className="bg-white/70 dark:bg-zinc-900/40 rounded-[1.25rem] border border-border/40 shadow-sm overflow-hidden h-fit transition-all hover:border-primary/20 pb-1">
                                                        <CommandItem value="settings company logo profile identity" onSelect={() => runCommand(() => onNavigate('settings', 'company logo'))} className="group cursor-pointer">
                                                            <div className="p-2 rounded-lg bg-blue-500/10 mr-3 group-data-[selected=true]:bg-blue-500/20 transition-colors">
                                                                <Building2 className="text-blue-600 dark:text-blue-400 group-data-[selected=true]:scale-110 transition-transform" />
                                                            </div>
                                                            <span className="font-medium text-[14px]">Company Profile & Logo</span>
                                                        </CommandItem>
                                                        <CommandItem value="settings vat tax currency timezone finance" onSelect={() => runCommand(() => onNavigate('settings', 'vat tax currency'))} className="group cursor-pointer">
                                                            <div className="p-2 rounded-lg bg-emerald-500/10 mr-3 group-data-[selected=true]:bg-emerald-500/20 transition-colors">
                                                                <Calculator className="text-emerald-600 dark:text-emerald-400 group-data-[selected=true]:scale-110 transition-transform" />
                                                            </div>
                                                            <span className="font-medium text-[14px]">VAT, Currency & Timezone</span>
                                                        </CommandItem>
                                                        <CommandItem value="settings pos invoice payment bkash nagad drawer" onSelect={() => runCommand(() => onNavigate('settings', 'pos invoice payment'))} className="group cursor-pointer">
                                                            <div className="p-2 rounded-lg bg-orange-500/10 mr-3 group-data-[selected=true]:bg-orange-500/20 transition-colors">
                                                                <CreditCard className="text-orange-600 dark:text-orange-400 group-data-[selected=true]:scale-110 transition-transform" />
                                                            </div>
                                                            <span className="font-medium text-[14px]">POS, Invoice & Payment</span>
                                                        </CommandItem>
                                                        <CommandItem value="settings notifications sounds reminders alerts" onSelect={() => runCommand(() => onNavigate('settings', 'notification settings'))} className="group cursor-pointer">
                                                            <div className="p-2 rounded-lg bg-sky-500/10 mr-3 group-data-[selected=true]:bg-sky-500/20 transition-colors">
                                                                <MessageSquare className="text-sky-600 dark:text-sky-400 group-data-[selected=true]:scale-110 transition-transform" />
                                                            </div>
                                                            <span className="font-medium text-[14px]">Notification Settings</span>
                                                        </CommandItem>
                                                        <CommandItem value="settings user permissions roles access" onSelect={() => runCommand(() => onNavigate('settings', 'user permissions'))} className="group cursor-pointer">
                                                            <div className="p-2 rounded-lg bg-rose-500/10 mr-3 group-data-[selected=true]:bg-rose-500/20 transition-colors">
                                                                <ShieldAlert className="text-rose-600 dark:text-rose-400 group-data-[selected=true]:scale-110 transition-transform" />
                                                            </div>
                                                            <span className="font-medium text-[14px]">User Permissions</span>
                                                        </CommandItem>
                                                        <CommandItem value="settings backup restore database export import" onSelect={() => runCommand(() => onNavigate('settings', 'backup restore'))} className="group cursor-pointer">
                                                            <div className="p-2 rounded-lg bg-violet-500/10 mr-3 group-data-[selected=true]:bg-violet-500/20 transition-colors">
                                                                <Database className="text-violet-600 dark:text-violet-400 group-data-[selected=true]:scale-110 transition-transform" />
                                                            </div>
                                                            <span className="font-medium text-[14px]">Backup & Restore</span>
                                                        </CommandItem>
                                                    </CommandGroup>
                                                )}
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
                                                            onSelect={() => runCommand(() => onNavigate('b2b', job.corporateJobNumber || job.id, { clientId: job.corporateClientId, targetId: job.id, searchQuery: job.corporateJobNumber || job.id }))}
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
                                                            onSelect={() => runCommand(() => onNavigate('jobs', job.ticketNumber || job.id, { targetId: job.id, searchQuery: job.ticketNumber || job.id }))}
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
                                                        onSelect={() => runCommand(() => onNavigate('service-requests', sr.ticketNumber, { targetId: sr.id, searchQuery: sr.ticketNumber }))}
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
                                                        onSelect={() => runCommand(() => onNavigate('customers', customer.phone || customer.name, { targetId: customer.id, searchQuery: customer.phone || customer.name }))}
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
                                                        onSelect={() => runCommand(() => onNavigate('pos', inv.invoiceNumber, { targetId: inv.id, searchQuery: inv.invoiceNumber }))}
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
                                                        onSelect={() => runCommand(() => onNavigate('inventory', item.name, { targetId: item.id, searchQuery: item.name }))}
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
                                                        onSelect={() => runCommand(() => onNavigate('challans', challan.id, { targetId: challan.id, searchQuery: challan.id }))}
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

                                        {/* ── Finance Records ── */}
                                        {hasPermission('finance') && searchResults.finance.length > 0 && (
                                            <CommandGroup heading="Finance Records" className="mb-1">
                                                {searchResults.finance.map((f) => {
                                                    const typeLabel = f.type === "petty-cash" ? "Petty Cash" : f.type === "due" ? "Due" : f.type === "manual-payment" ? "Payment" : f.type === "refund" ? "Refund" : "Finance";
                                                    return (
                                                        <CommandItem
                                                            key={f.id}
                                                            value={`${f.reference} ${f.customer} ${f.status} ${f.amount}`}
                                                            onSelect={() => runCommand(() => onNavigate('finance', f.reference || f.id, { targetId: f.id, searchQuery: f.reference || f.id, recordType: f.type }))}
                                                            className="group cursor-pointer pr-4"
                                                        >
                                                            <div className="flex items-center justify-between w-full">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <div className="p-1.5 rounded bg-emerald-500/10 shrink-0 group-data-[selected=true]:bg-emerald-500/20">
                                                                        <Banknote className="h-4 w-4 text-emerald-500" />
                                                                    </div>
                                                                    <div className="flex flex-col min-w-0">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <span className="font-semibold text-[13px] font-mono"><HighlightMatch text={f.reference || f.id} query={searchQuery} /></span>
                                                                            <CategoryBadge label={typeLabel} color="emerald" />
                                                                        </div>
                                                                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                                                            <span><HighlightMatch text={f.customer || "—"} query={searchQuery} /></span>
                                                                            {f.amount && <><span className="text-muted-foreground/40">·</span><span className="font-medium text-emerald-600">৳{Number(f.amount).toLocaleString()}</span></>}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                                                    {f.status && <StatusBadge status={f.status} className="h-5 text-[10px] px-1.5 py-0" />}
                                                                    {f.createdAt && <span className="text-[10px] text-muted-foreground/50 hidden sm:block">{formatDistanceToNow(new Date(f.createdAt), { addSuffix: true })}</span>}
                                                                </div>
                                                            </div>
                                                        </CommandItem>
                                                    );
                                                })}
                                                <ViewAllRow
                                                    count={counts.finance ?? 0}
                                                    displayed={searchResults.finance?.length ?? 0}
                                                    label="Finance"
                                                    tab="finance"
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
