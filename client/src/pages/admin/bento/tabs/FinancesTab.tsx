
import { motion } from "framer-motion";
import {
    TrendingUp, AlertCircle, ChevronDown, Wallet, ShoppingCart, TrendingDown,
    DollarSign, Clock, Loader2, Smartphone, ArrowRight, CheckCircle2, Inbox
} from "lucide-react";
import { BentoCard, containerVariants, itemVariants, MobileCommandRail, MobileMicroMetricGrid, MobileSegmentTabs } from "../shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { posTransactionsApi, pettyCashApi, dueRecordsApi, refundsApi, settingsApi, manualPaymentsApi, drawerApi } from "@/lib/api";
import { useMemo, useState, useEffect } from "react";
import { SalesTab } from "./FinancesTabSales";
import { PettyCashTab } from "./FinancesTabPettyCash";
import { DuesTab } from "./FinancesTabDues";
import { RefundsTab } from "./FinancesTabRefunds";
import { FinancesTabDrawer } from "./FinancesTabDrawer";
import { ManualPaymentsTab } from "./FinancesTabManualPayments";
import { BlacklistReview } from "./FinancesTabBlacklist";
import { format } from "date-fns";
import { toast } from "sonner";
import { InsertPettyCashRecord, InsertDueRecord } from "@shared/schema";

export default function FinancesTab({ defaultTab }: { defaultTab?: "sales" | "petty-cash" | "dues" | "refunds" | "drawer" | "manual-payments" }) {
    const queryClient = useQueryClient();

    // 4-group layout: Overview · Money In · Money Out · Cash Drawer.
    // Legacy deep-links (sales/petty-cash/dues/refunds/manual-payments/drawer) still work.
    const mapLegacy = (t?: string): "overview" | "money-in" | "money-out" | "drawer" => {
        if (t === "sales" || t === "dues" || t === "manual-payments") return "money-in";
        if (t === "petty-cash" || t === "refunds") return "money-out";
        if (t === "drawer") return "drawer";
        return "overview";
    };
    const [activeFinanceTab, setActiveFinanceTab] = useState<"overview" | "money-in" | "money-out" | "drawer">(mapLegacy(defaultTab));
    const [moneyInView, setMoneyInView] = useState<"payments" | "sales" | "dues">(
        defaultTab === "sales" ? "sales" : defaultTab === "dues" ? "dues" : "payments"
    );
    const [moneyOutView, setMoneyOutView] = useState<"expenses" | "refunds">(
        defaultTab === "refunds" ? "refunds" : "expenses"
    );
    const [kpiOpen, setKpiOpen] = useState(false);
    useEffect(() => {
        if (defaultTab) setActiveFinanceTab(mapLegacy(defaultTab));
    }, [defaultTab]);

    // API queries
    const { data: salesSummary, isLoading: isPosLoading } = useQuery({
        queryKey: ["sales-summary-global"],
        queryFn: () => posTransactionsApi.getSummary(),
    });

    const { data: pettyCashSummary, isLoading: isPettyCashLoading } = useQuery({
        queryKey: ["petty-cash-summary-global"],
        queryFn: () => pettyCashApi.getSummary(),
    });

    const { data: dueSummary, isLoading: isDueRecordsLoading } = useQuery({
        queryKey: ["due-summary-global"],
        queryFn: () => dueRecordsApi.getSummary(),
    });

    const { data: refundsData, isLoading: isRefundsLoading } = useQuery({
        queryKey: ["refunds"],
        queryFn: () => refundsApi.getAll(),
    });

    const { data: settings = [] } = useQuery({
        queryKey: ["settings"],
        queryFn: settingsApi.getAll,
    });

    // For the Overview "Needs attention" panel
    const { data: pendingPaymentsData } = useQuery({
        queryKey: ["manual-payments", "pending", "customer_submission"],
        queryFn: () => manualPaymentsApi.getAll({ status: "pending", source: "customer_submission" }),
    });
    const { data: activeDrawer } = useQuery({
        queryKey: ["activeDrawer"],
        queryFn: drawerApi.getActive,
    });
    const pendingPaymentsCount = Array.isArray(pendingPaymentsData)
        ? pendingPaymentsData.length
        : ((pendingPaymentsData as any)?.items?.length || 0);

    // Helper functions
    const getCurrencySymbol = () => {
        const currencySetting = settings?.find(s => s.key === "currency_symbol");
        return currencySetting?.value || "৳";
    };

    // Mutations
    const createPettyCashMutation = useMutation({
        mutationFn: pettyCashApi.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["pettyCash"] });
            queryClient.invalidateQueries({ queryKey: ["petty-cash-summary-global"] });
            toast.success("Transaction recorded successfully");
        },
        onError: (error: Error) => {
            toast.error(`Failed to record transaction: ${error.message}`);
        },
    });

    const deletePettyCashMutation = useMutation({
        mutationFn: pettyCashApi.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["pettyCash"] });
            queryClient.invalidateQueries({ queryKey: ["petty-cash-summary-global"] });
            toast.success("Transaction deleted successfully");
        },
        onError: (error: Error) => {
            toast.error(`Failed to delete transaction: ${error.message}`);
        },
    });

    const createDueMutation = useMutation({
        mutationFn: dueRecordsApi.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["dueRecords"] });
            queryClient.invalidateQueries({ queryKey: ["due-summary-global"] });
            toast.success("Due record created successfully");
        },
        onError: (error: Error) => {
            toast.error(`Failed to create due record: ${error.message}`);
        },
    });

    const updateDueMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<InsertDueRecord> }) =>
            dueRecordsApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["dueRecords"] });
            queryClient.invalidateQueries({ queryKey: ["due-summary-global"] });
            queryClient.invalidateQueries({ queryKey: ["pos-transactions"] }); // Payment might update sales
            toast.success("Payment recorded successfully");
        },
        onError: (error: Error) => {
            toast.error(`Failed to record payment: ${error.message}`);
        },
    });

    const getCompanyInfo = () => {
        const getSettingValue = (key: string, defaultValue: string) => {
            const setting = settings?.find((s) => s.key === key);
            return setting?.value || defaultValue;
        };
        return {
            name: getSettingValue("site_name", "PROMISE ELECTRONICS"),
            logo: getSettingValue("logo_url", ""),
            address: getSettingValue("company_address", "Dhaka, Bangladesh"),
            phone: getSettingValue("support_phone", "+880 1700-000000"),
            email: getSettingValue("company_email", "support@promise-electronics.com"),
            website: getSettingValue("company_website", "www.promise-electronics.com"),
        };
    };

    const exportToCSV = (data: any[], filename: string, columns: { key: string; label: string }[]) => {
        const headers = columns.map(c => c.label).join(',');
        const rows = data.map(item =>
            columns.map(c => {
                const value = item[c.key];
                const strValue = value != null ? String(value) : '';
                return strValue.includes(',') || strValue.includes('"')
                    ? `"${strValue.replace(/"/g, '""')}"`
                    : strValue;
            }).join(',')
        );
        const csv = [headers, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${data.length} records to CSV`);
    };

    // Computed KPIs
    const totalSales = salesSummary?.totalSales || 0;
    const cashInHand = (pettyCashSummary?.totalIncome || 0) - (pettyCashSummary?.totalExpense || 0);
    const totalDue = dueSummary?.totalDueAmount || 0;

    const totalRefunded = useMemo(() =>
        refundsData?.items?.filter(r => r.status === 'processed').reduce((sum, r) => sum + r.refundAmount, 0) || 0,
        [refundsData]
    );
    const compactMoney = (value: number) => {
        const abs = Math.abs(value);
        if (abs >= 100000) return `${getCurrencySymbol()}${(value / 100000).toFixed(value % 100000 === 0 ? 0 : 1)}L`;
        if (abs >= 1000) return `${getCurrencySymbol()}${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
        return `${getCurrencySymbol()}${value.toLocaleString()}`;
    };

    const isLoading = isPosLoading || isPettyCashLoading || isDueRecordsLoading || isRefundsLoading;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="ml-3 text-muted-foreground">Loading financial data...</p>
            </div>
        );
    }

    return (
        <motion.div
            className="flex flex-col h-full w-full overflow-hidden"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            {/* Mobile sticky header block — KPI strip + command rail + tab switcher all stay at top */}
            <div className="md:hidden flex-none bg-[#f8fafc]/95 backdrop-blur-sm border-b border-slate-100/80 z-30 px-3 space-y-1 pb-1.5">
                {/* KPI strip */}
                <button
                    type="button"
                    onClick={() => setKpiOpen(v => !v)}
                    className="flex w-full items-center justify-between gap-2 -mx-3 px-3 py-2 active:bg-slate-50"
                >
                    <div className="flex items-center gap-3 overflow-hidden text-[11px] font-bold">
                        <span className="text-emerald-700">Sales {compactMoney(totalSales)}</span>
                        <span className="text-amber-700">Due {compactMoney(totalDue)}</span>
                        <span className="text-violet-700">Cash {compactMoney(cashInHand)}</span>
                    </div>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${kpiOpen ? "rotate-180" : ""}`} />
                </button>
                {kpiOpen && (
                    <div className="px-3 pb-2">
                        <MobileMicroMetricGrid
                            items={[
                                { label: "Sales", value: compactMoney(totalSales), meta: `${salesSummary?.count || 0} transactions`, tone: "emerald" },
                                { label: "Cash", value: compactMoney(cashInHand), meta: "In hand", tone: "violet" },
                                { label: "Due", value: compactMoney(totalDue), meta: `${dueSummary?.pendingCount || 0} outstanding`, tone: "amber", onClick: () => { setActiveFinanceTab("money-in"); setMoneyInView("dues"); } },
                                { label: "Refund", value: compactMoney(totalRefunded), meta: `${refundsData?.items?.filter(r => r.status === 'processed').length || 0} processed`, tone: "rose" },
                            ]}
                        />
                    </div>
                )}
                {/* Command rail */}
                <MobileCommandRail
                items={[
                    {
                        key: "verify",
                        title: "Verify",
                        badge: pendingPaymentsCount || null,
                        icon: <Smartphone className="h-3.5 w-3.5" />,
                        tone: pendingPaymentsCount > 0 ? "amber" : "slate",
                        onClick: () => { setActiveFinanceTab("money-in"); setMoneyInView("payments"); },
                    },
                    {
                        key: "dues",
                        title: "Dues",
                        badge: dueSummary?.pendingCount || null,
                        icon: <Clock className="h-3.5 w-3.5" />,
                        tone: (dueSummary?.pendingCount || 0) > 0 ? "rose" : "slate",
                        onClick: () => { setActiveFinanceTab("money-in"); setMoneyInView("dues"); },
                    },
                    {
                        key: "drawer",
                        title: "Drawer",
                        badge: activeDrawer ? "Open" : null,
                        icon: <Wallet className="h-3.5 w-3.5" />,
                        tone: activeDrawer ? "blue" : "slate",
                        onClick: () => setActiveFinanceTab("drawer"),
                    },
                ]}
            />
                {/* Tab switcher — Overview / Money In / Money Out / Drawer */}
                <MobileSegmentTabs
                    value={activeFinanceTab}
                    onChange={setActiveFinanceTab}
                    items={[
                        { value: "overview", label: "Overview", icon: <TrendingUp className="h-4 w-4" /> },
                        { value: "money-in", label: "Money In", icon: <TrendingUp className="h-4 w-4" />, badge: pendingPaymentsCount > 0 ? <span className="rounded-full bg-white/70 px-1.5 text-[10px]">{pendingPaymentsCount}</span> : null },
                        { value: "money-out", label: "Money Out", icon: <TrendingDown className="h-4 w-4" /> },
                        { value: "drawer", label: "Drawer", icon: <Wallet className="h-4 w-4" /> },
                    ]}
                    tone={activeFinanceTab === "money-in" ? "emerald" : activeFinanceTab === "money-out" ? "rose" : activeFinanceTab === "drawer" ? "blue" : "slate"}
                />
                {/* Sub-nav — lives in header so it never scrolls away */}
                {activeFinanceTab === "money-in" && (
                    <MobileSegmentTabs
                        value={moneyInView}
                        onChange={setMoneyInView}
                        tone="emerald"
                        items={[
                            { value: "payments", label: "Payments", badge: pendingPaymentsCount > 0 ? <span className="rounded-full bg-white/70 px-1.5 text-[10px]">{pendingPaymentsCount}</span> : null },
                            { value: "sales", label: "Sales" },
                            { value: "dues", label: "Dues" },
                        ]}
                    />
                )}
                {activeFinanceTab === "money-out" && (
                    <MobileSegmentTabs
                        value={moneyOutView}
                        onChange={setMoneyOutView}
                        tone="rose"
                        items={[
                            { value: "expenses", label: "Expenses" },
                            { value: "refunds", label: "Refunds" },
                        ]}
                    />
                )}
            </div>{/* end mobile header */}

            {/* Scrollable content — fires admin:mobile-chrome, same mechanism as Jobs */}
            <div
                className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-[#f8fafc] md:bg-transparent px-3 pt-0 space-y-2 pb-4 md:px-0 md:pt-0 md:space-y-6"
                onScroll={(e) => {
                    if (window.innerWidth >= 768) return;
                    window.dispatchEvent(new CustomEvent("admin:mobile-chrome", {
                        detail: { hidden: e.currentTarget.scrollTop > 24 },
                    }));
                }}
            >
            <div className="hidden md:grid md:grid-cols-4 gap-4">
                <motion.div variants={itemVariants}>
                    <BentoCard
                        className="h-full min-h-[140px] bg-gradient-to-br from-emerald-500 to-teal-600"
                        variant="vibrant"
                    >
                        <div className="flex flex-col justify-between h-full text-white">
                            <div className="flex items-center justify-between">
                                <span className="text-emerald-100 text-sm font-medium">Total Sales</span>
                                <ShoppingCart className="h-5 w-5 text-emerald-200" />
                            </div>
                            <div>
                                <div className="text-3xl font-bold tracking-tight">
                                    {getCurrencySymbol()}{totalSales.toLocaleString()}
                                </div>
                                <p className="text-emerald-100 text-xs mt-1">{salesSummary?.count || 0} transactions</p>
                            </div>
                        </div>
                    </BentoCard>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <BentoCard
                        className="h-full min-h-[140px] bg-gradient-to-br from-violet-500 to-purple-600"
                        variant="vibrant"
                    >
                        <div className="flex flex-col justify-between h-full text-white">
                            <div className="flex items-center justify-between">
                                <span className="text-violet-100 text-sm font-medium">Cash in Hand</span>
                                <Wallet className="h-5 w-5 text-violet-200" />
                            </div>
                            <div>
                                <div className="text-3xl font-bold tracking-tight">
                                    {getCurrencySymbol()}{cashInHand.toLocaleString()}
                                </div>
                                <p className="text-violet-100 text-xs mt-1">Current balance</p>
                            </div>
                        </div>
                    </BentoCard>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <BentoCard
                        className="h-full min-h-[140px] bg-gradient-to-br from-orange-500 to-red-600"
                        variant="vibrant"
                    >
                        <div className="flex flex-col justify-between h-full text-white">
                            <div className="flex items-center justify-between">
                                <span className="text-orange-100 text-sm font-medium">Total Due</span>
                                <AlertCircle className="h-5 w-5 text-orange-200" />
                            </div>
                            <div>
                                <div className="text-3xl font-bold tracking-tight">
                                    {getCurrencySymbol()}{totalDue.toLocaleString()}
                                </div>
                                <p className="text-orange-100 text-xs mt-1">
                                    {dueSummary?.pendingCount || 0} outstanding
                                </p>
                            </div>
                        </div>
                    </BentoCard>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <BentoCard
                        className="h-full min-h-[140px] bg-gradient-to-br from-rose-500 to-red-600"
                        variant="vibrant"
                    >
                        <div className="flex flex-col justify-between h-full text-white">
                            <div className="flex items-center justify-between">
                                <span className="text-rose-100 text-sm font-medium">Refunded</span>
                                <TrendingDown className="h-5 w-5 text-rose-200" />
                            </div>
                            <div>
                                <div className="text-3xl font-bold tracking-tight">
                                    {getCurrencySymbol()}{totalRefunded.toLocaleString()}
                                </div>
                                <p className="text-rose-100 text-xs mt-1">
                                    {refundsData?.items?.filter(r => r.status === 'processed').length || 0} processed
                                </p>
                            </div>
                        </div>
                    </BentoCard>
                </motion.div>
            </div>

            {/* Sub-Tabs System */}
            <motion.div variants={itemVariants}>
                <Tabs value={activeFinanceTab} onValueChange={(v) => setActiveFinanceTab(v as typeof activeFinanceTab)} className="w-full">
                    <TabsList className="hidden h-12 items-center justify-center rounded-full bg-slate-100 p-1 text-slate-500 w-full sm:w-auto gap-1 flex-wrap sm:flex-nowrap md:inline-flex">
                        <TabsTrigger
                            value="overview"
                            className="rounded-full px-5 py-2 text-sm font-semibold transition-all data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                        >
                            <TrendingUp className="h-4 w-4 mr-2" />
                            Overview
                        </TabsTrigger>
                        <TabsTrigger
                            value="money-in"
                            className="rounded-full px-5 py-2 text-sm font-semibold transition-all data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm"
                        >
                            <TrendingUp className="h-4 w-4 mr-2" />
                            Money In
                        </TabsTrigger>
                        <TabsTrigger
                            value="money-out"
                            className="rounded-full px-5 py-2 text-sm font-semibold transition-all data-[state=active]:bg-white data-[state=active]:text-rose-700 data-[state=active]:shadow-sm"
                        >
                            <TrendingDown className="h-4 w-4 mr-2" />
                            Money Out
                        </TabsTrigger>
                        <TabsTrigger
                            value="drawer"
                            className="rounded-full px-5 py-2 text-sm font-semibold transition-all data-[state=active]:bg-white data-[state=active]:text-sky-700 data-[state=active]:shadow-sm"
                        >
                            <Wallet className="h-4 w-4 mr-2" />
                            Cash Drawer
                        </TabsTrigger>
                    </TabsList>

                    {/* OVERVIEW — what needs you, at a glance */}
                    <TabsContent value="overview" className="mt-3 md:mt-6">
                        <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-xs text-slate-600 md:hidden">
                            <div className="font-black uppercase tracking-wide text-slate-700">Finance queue</div>
                            <div className="mt-1 grid grid-cols-3 gap-1.5 text-center">
                                <div className="rounded-lg bg-amber-50 px-2 py-1 text-amber-700">{pendingPaymentsCount} pay</div>
                                <div className="rounded-lg bg-rose-50 px-2 py-1 text-rose-700">{dueSummary?.pendingCount || 0} due</div>
                                <div className="rounded-lg bg-blue-50 px-2 py-1 text-blue-700">{activeDrawer ? "open" : "closed"}</div>
                            </div>
                        </div>
                        <div className="hidden grid-cols-1 lg:grid-cols-2 gap-4 md:grid">
                            {/* Needs your attention */}
                            <BentoCard className="bg-amber-50/60 border border-amber-100" disableHover>
                                <div className="flex items-center gap-2 mb-3">
                                    <AlertCircle className="h-5 w-5 text-amber-600" />
                                    <h3 className="font-bold text-slate-800">Needs your attention</h3>
                                </div>
                                {(pendingPaymentsCount === 0 && (dueSummary?.pendingCount || 0) === 0 && !activeDrawer) ? (
                                    <div className="flex flex-col items-center justify-center py-8 text-center">
                                        <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2" />
                                        <p className="font-semibold text-slate-700">All clear</p>
                                        <p className="text-sm text-slate-400">Nothing needs you right now.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {pendingPaymentsCount > 0 && (
                                            <button onClick={() => { setActiveFinanceTab("money-in"); setMoneyInView("payments"); }}
                                                className="w-full flex items-center justify-between rounded-xl border border-amber-200 bg-white p-3 text-left hover:bg-amber-50 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <Smartphone className="h-5 w-5 text-amber-600" />
                                                    <div>
                                                        <p className="font-semibold text-slate-800 text-sm">Customer payments to verify</p>
                                                        <p className="text-xs text-slate-500">{pendingPaymentsCount} waiting for you</p>
                                                    </div>
                                                </div>
                                                <ArrowRight className="h-4 w-4 text-slate-400" />
                                            </button>
                                        )}
                                        {(dueSummary?.pendingCount || 0) > 0 && (
                                            <button onClick={() => { setActiveFinanceTab("money-in"); setMoneyInView("dues"); }}
                                                className="w-full flex items-center justify-between rounded-xl border border-orange-200 bg-white p-3 text-left hover:bg-orange-50 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <Clock className="h-5 w-5 text-orange-600" />
                                                    <div>
                                                        <p className="font-semibold text-slate-800 text-sm">Outstanding dues</p>
                                                        <p className="text-xs text-slate-500">{dueSummary?.pendingCount} customers · {getCurrencySymbol()}{totalDue.toLocaleString()}</p>
                                                    </div>
                                                </div>
                                                <ArrowRight className="h-4 w-4 text-slate-400" />
                                            </button>
                                        )}
                                        {activeDrawer && (
                                            <button onClick={() => setActiveFinanceTab("drawer")}
                                                className="w-full flex items-center justify-between rounded-xl border border-sky-200 bg-white p-3 text-left hover:bg-sky-50 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <Wallet className="h-5 w-5 text-sky-600" />
                                                    <div>
                                                        <p className="font-semibold text-slate-800 text-sm">Register is open</p>
                                                        <p className="text-xs text-slate-500">Close &amp; reconcile when the shift ends</p>
                                                    </div>
                                                </div>
                                                <ArrowRight className="h-4 w-4 text-slate-400" />
                                            </button>
                                        )}
                                    </div>
                                )}
                            </BentoCard>

                            {/* Quick navigation */}
                            <BentoCard className="border border-slate-100" disableHover>
                                <div className="flex items-center gap-2 mb-3">
                                    <Inbox className="h-5 w-5 text-slate-500" />
                                    <h3 className="font-bold text-slate-800">Go to</h3>
                                </div>
                                <div className="grid grid-cols-1 gap-2">
                                    <button onClick={() => setActiveFinanceTab("money-in")}
                                        className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-left hover:bg-emerald-50 transition-colors">
                                        <div className="flex items-center gap-3"><TrendingUp className="h-5 w-5 text-emerald-600" /><div><p className="font-semibold text-slate-800 text-sm">Money In</p><p className="text-xs text-slate-500">Payments · Sales · Dues</p></div></div>
                                        <ArrowRight className="h-4 w-4 text-emerald-400" />
                                    </button>
                                    <button onClick={() => setActiveFinanceTab("money-out")}
                                        className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50/60 p-3 text-left hover:bg-rose-50 transition-colors">
                                        <div className="flex items-center gap-3"><TrendingDown className="h-5 w-5 text-rose-600" /><div><p className="font-semibold text-slate-800 text-sm">Money Out</p><p className="text-xs text-slate-500">Expenses · Refunds</p></div></div>
                                        <ArrowRight className="h-4 w-4 text-rose-400" />
                                    </button>
                                    <button onClick={() => setActiveFinanceTab("drawer")}
                                        className="flex items-center justify-between rounded-xl border border-sky-100 bg-sky-50/60 p-3 text-left hover:bg-sky-50 transition-colors">
                                        <div className="flex items-center gap-3"><Wallet className="h-5 w-5 text-sky-600" /><div><p className="font-semibold text-slate-800 text-sm">Cash Drawer</p><p className="text-xs text-slate-500">Open · count · reconcile</p></div></div>
                                        <ArrowRight className="h-4 w-4 text-sky-400" />
                                    </button>
                                </div>
                            </BentoCard>
                        </div>
                    </TabsContent>

                    {/* MONEY IN — Payments · Sales · Dues */}
                    <TabsContent value="money-in" className="space-y-2 md:mt-6 md:space-y-4">
                        <div className="hidden rounded-full bg-emerald-50 p-1 gap-1 md:inline-flex">
                            {(["payments", "sales", "dues"] as const).map((k) => (
                                <button key={k} onClick={() => setMoneyInView(k)}
                                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all capitalize ${moneyInView === k ? "bg-emerald-600 text-white shadow-sm" : "text-emerald-700 hover:bg-emerald-100"}`}>
                                    {k}{k === "payments" && pendingPaymentsCount > 0 ? ` (${pendingPaymentsCount})` : ""}
                                </button>
                            ))}
                        </div>
                        {moneyInView === "payments" && <ManualPaymentsTab getCurrencySymbol={getCurrencySymbol} />}
                        {moneyInView === "sales" && (
                            <SalesTab getCurrencySymbol={getCurrencySymbol} getCompanyInfo={getCompanyInfo} exportToCSV={exportToCSV} />
                        )}
                        {moneyInView === "dues" && (
                            <DuesTab getCurrencySymbol={getCurrencySymbol} createDueMutation={createDueMutation} updateDueMutation={updateDueMutation} exportToCSV={exportToCSV} />
                        )}
                    </TabsContent>

                    {/* MONEY OUT — Expenses · Refunds */}
                    <TabsContent value="money-out" className="space-y-2 md:mt-6 md:space-y-4">
                        <div className="hidden rounded-full bg-rose-50 p-1 gap-1 md:inline-flex">
                            {(["expenses", "refunds"] as const).map((k) => (
                                <button key={k} onClick={() => setMoneyOutView(k)}
                                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all capitalize ${moneyOutView === k ? "bg-rose-600 text-white shadow-sm" : "text-rose-700 hover:bg-rose-100"}`}>
                                    {k}
                                </button>
                            ))}
                        </div>
                        {moneyOutView === "expenses" && (
                            <PettyCashTab getCurrencySymbol={getCurrencySymbol} createPettyCashMutation={createPettyCashMutation} deletePettyCashMutation={deletePettyCashMutation} exportToCSV={exportToCSV} />
                        )}
                        {moneyOutView === "refunds" && (
                            <RefundsTab refundsData={refundsData} isLoading={isRefundsLoading} getCurrencySymbol={getCurrencySymbol} refundsApi={refundsApi} queryClient={queryClient} />
                        )}
                    </TabsContent>

                    {/* CASH DRAWER + end-of-day blacklist review */}
                    <TabsContent value="drawer" className="border-0 p-0 outline-none space-y-2 md:mt-6 md:space-y-6">
                        <FinancesTabDrawer
                            getCurrencySymbol={getCurrencySymbol}
                            exportToCSV={exportToCSV}
                        />
                        <BlacklistReview getCurrencySymbol={getCurrencySymbol} />
                    </TabsContent>
                </Tabs>
            </motion.div>
            </div>{/* end scrollable content */}
        </motion.div>
    );
}
