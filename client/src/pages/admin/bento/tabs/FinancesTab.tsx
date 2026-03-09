
import { motion } from "framer-motion";
import {
    TrendingUp, AlertCircle, Wallet, ShoppingCart, TrendingDown,
    DollarSign, Clock, Loader2
} from "lucide-react";
import { BentoCard, containerVariants, itemVariants } from "../shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { posTransactionsApi, pettyCashApi, dueRecordsApi, refundsApi, settingsApi } from "@/lib/api";
import { useMemo, useState, useEffect } from "react";
import { SalesTab } from "./FinancesTabSales";
import { PettyCashTab } from "./FinancesTabPettyCash";
import { DuesTab } from "./FinancesTabDues";
import { RefundsTab } from "./FinancesTabRefunds";
import { FinancesTabDrawer } from "./FinancesTabDrawer";
import { format } from "date-fns";
import { toast } from "sonner";
import { InsertPettyCashRecord, InsertDueRecord } from "@shared/schema";

export default function FinancesTab({ defaultTab }: { defaultTab?: "sales" | "petty-cash" | "dues" | "refunds" | "drawer" }) {
    const queryClient = useQueryClient();

    const [activeFinanceTab, setActiveFinanceTab] = useState(defaultTab || "sales");
    useEffect(() => {
        if (defaultTab) setActiveFinanceTab(defaultTab);
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
            className="space-y-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            {/* KPI Header Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                    <TabsList className="inline-flex h-11 items-center justify-center rounded-full bg-slate-100 p-1 text-slate-500 w-auto">
                        <TabsTrigger
                            value="sales"
                            className="rounded-full px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                        >
                            <ShoppingCart className="h-4 w-4 mr-2" />
                            Sales
                        </TabsTrigger>
                        <TabsTrigger
                            value="petty-cash"
                            className="rounded-full px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                        >
                            <Wallet className="h-4 w-4 mr-2" />
                            Petty Cash
                        </TabsTrigger>
                        <TabsTrigger
                            value="dues"
                            className="rounded-full px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                        >
                            <Clock className="h-4 w-4 mr-2" />
                            Dues
                        </TabsTrigger>
                        <TabsTrigger
                            value="refunds"
                            className="rounded-full px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                        >
                            <TrendingDown className="h-4 w-4 mr-2" />
                            Refunds
                        </TabsTrigger>
                        <TabsTrigger
                            value="drawer"
                            className="rounded-full px-4 py-2 text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
                        >
                            <Wallet className="h-4 w-4 mr-2" />
                            Cash Drawer
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="sales" className="mt-6">
                        <SalesTab
                            getCurrencySymbol={getCurrencySymbol}
                            getCompanyInfo={getCompanyInfo}
                            exportToCSV={exportToCSV}
                        />
                    </TabsContent>

                    <TabsContent value="petty-cash" className="mt-6">
                        <PettyCashTab
                            getCurrencySymbol={getCurrencySymbol}
                            createPettyCashMutation={createPettyCashMutation}
                            deletePettyCashMutation={deletePettyCashMutation}
                            exportToCSV={exportToCSV}
                        />
                    </TabsContent>

                    <TabsContent value="dues" className="mt-6">
                        <DuesTab
                            getCurrencySymbol={getCurrencySymbol}
                            createDueMutation={createDueMutation}
                            updateDueMutation={updateDueMutation}
                            exportToCSV={exportToCSV}
                        />
                    </TabsContent>

                    <TabsContent value="refunds" className="mt-6">
                        <RefundsTab
                            refundsData={refundsData}
                            isLoading={isRefundsLoading}
                            getCurrencySymbol={getCurrencySymbol}
                            refundsApi={refundsApi}
                            queryClient={queryClient}
                        />
                    </TabsContent>

                    <TabsContent value="drawer" className="mt-6 border-0 p-0 outline-none">
                        <FinancesTabDrawer
                            getCurrencySymbol={getCurrencySymbol}
                            exportToCSV={exportToCSV}
                        />
                    </TabsContent>
                </Tabs>
            </motion.div>
        </motion.div>
    );
}
