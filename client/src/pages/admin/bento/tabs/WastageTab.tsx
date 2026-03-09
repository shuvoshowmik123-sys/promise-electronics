import { motion } from "framer-motion";
import {
    AlertTriangle, PackageX, FileDown,
    TrendingDown, Loader2, Search, Filter
} from "lucide-react";
import { BentoCard, containerVariants, itemVariants } from "../shared";
import { useQuery } from "@tanstack/react-query";
import { wastageApi, settingsApi } from "@/lib/api";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function WastageTab() {
    const [searchQuery, setSearchQuery] = useState("");
    const [reasonFilter, setReasonFilter] = useState("all");

    const { data: wastageLogs = [], isLoading: isWastageLoading } = useQuery({
        queryKey: ["wastage"],
        queryFn: () => wastageApi.getAll(),
    });

    const { data: settings = [] } = useQuery({
        queryKey: ["settings"],
        queryFn: settingsApi.getAll,
    });

    const getCurrencySymbol = () => {
        const currencySetting = settings?.find(s => s.key === "currency_symbol");
        return currencySetting?.value || "৳";
    };

    const currencySymbol = getCurrencySymbol();

    const filteredLogs = useMemo(() => {
        return wastageLogs.filter(log => {
            const matchesSearch = log.notes?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                log.reason?.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesReason = reasonFilter === "all" || log.reason === reasonFilter;
            return matchesSearch && matchesReason;
        });
    }, [wastageLogs, searchQuery, reasonFilter]);

    // Derived KPIs
    const totalLoss = useMemo(() =>
        wastageLogs.reduce((sum, log) => sum + Number(log.financialLoss || 0), 0),
        [wastageLogs]);

    const totalQuantity = useMemo(() =>
        wastageLogs.reduce((sum, log) => sum + Number(log.quantity || 0), 0),
        [wastageLogs]);

    const uniqueReasons = useMemo(() =>
        Array.from(new Set(wastageLogs.map(log => log.reason).filter(Boolean))),
        [wastageLogs]);

    const exportToCSV = () => {
        if (!filteredLogs.length) {
            toast.error("No data to export");
            return;
        }

        const headers = ["Date", "Item ID", "Quantity", "Reason", "Financial Loss", "Reported By", "Details"];
        const rows = filteredLogs.map(log => [
            format(new Date(log.createdAt), 'yyyy-MM-dd HH:mm'),
            log.inventoryItemId || 'N/A',
            log.quantity,
            log.reason,
            log.financialLoss || 0,
            log.reportedBy || 'System',
            `"${(log.notes || '').replace(/"/g, '""')}"`
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Wastage_Report_${format(new Date(), 'yyyy-MM-dd')}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${filteredLogs.length} records to CSV`);
    };

    if (isWastageLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="ml-3 text-muted-foreground">Loading wastage data...</p>
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
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">Wastage & Defect Tracking</h2>
                    <p className="text-sm text-slate-500">Monitor damaged goods, write-offs, and financial losses.</p>
                </div>
                <Button onClick={exportToCSV} variant="outline" className="shrink-0 bg-white">
                    <FileDown className="h-4 w-4 mr-2" />
                    Export CSV
                </Button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <motion.div variants={itemVariants}>
                    <BentoCard className="h-full bg-gradient-to-br from-red-500 to-rose-600 text-white" variant="vibrant">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-red-100 font-medium">Total Financial Loss</span>
                            <TrendingDown className="h-5 w-5 text-red-200" />
                        </div>
                        <div className="text-3xl font-bold">{currencySymbol}{totalLoss.toLocaleString()}</div>
                        <p className="text-red-100 text-xs mt-1">Accumulated value of lost inventory</p>
                    </BentoCard>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <BentoCard className="h-full bg-gradient-to-br from-orange-500 to-amber-600 text-white" variant="vibrant">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-orange-100 font-medium">Total Items Lost</span>
                            <PackageX className="h-5 w-5 text-orange-200" />
                        </div>
                        <div className="text-3xl font-bold">{totalQuantity}</div>
                        <p className="text-orange-100 text-xs mt-1">Total physical units written off</p>
                    </BentoCard>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <BentoCard className="h-full bg-gradient-to-br from-slate-700 to-slate-900 text-white" variant="vibrant">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-slate-300 font-medium">Wastage Reports</span>
                            <AlertTriangle className="h-5 w-5 text-slate-400" />
                        </div>
                        <div className="text-3xl font-bold">{wastageLogs.length}</div>
                        <p className="text-slate-400 text-xs mt-1">Total logged incidents</p>
                    </BentoCard>
                </motion.div>
            </div>

            {/* Logs Table */}
            <motion.div variants={itemVariants}>
                <BentoCard title="Wastage History">
                    <div className="flex flex-col sm:flex-row gap-4 mb-6 pt-4 border-t border-slate-100">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Search details..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 bg-slate-50/50"
                            />
                        </div>
                        <Select value={reasonFilter} onValueChange={setReasonFilter}>
                            <SelectTrigger className="w-full sm:w-[200px] bg-slate-50/50">
                                <div className="flex items-center">
                                    <Filter className="w-4 h-4 mr-2 opacity-50" />
                                    <SelectValue placeholder="Filter by Reason" />
                                </div>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Reasons</SelectItem>
                                {uniqueReasons.map(reason => (
                                    <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Item / Reason</TableHead>
                                    <TableHead>Quantity</TableHead>
                                    <TableHead>Financial Loss</TableHead>
                                    <TableHead>Reported By</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredLogs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                                            No wastage logs found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredLogs.map((log) => (
                                        <TableRow key={log.id} className="hover:bg-slate-50/50 transition-colors">
                                            <TableCell className="text-sm font-medium text-slate-900">
                                                {format(new Date(log.createdAt), 'MMM d, yyyy')}
                                                <div className="text-xs text-slate-500 font-normal">
                                                    {format(new Date(log.createdAt), 'h:mm a')}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-slate-900">{log.reason}</span>
                                                    <span className="text-xs text-slate-500 truncate max-w-[250px]" title={log.notes || ''}>
                                                        {log.notes || 'No notes provided'}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="inline-flex items-center px-2 py-1 rounded-md bg-orange-50 text-orange-700 text-xs font-semibold">
                                                    {log.quantity} units
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-medium text-red-600">
                                                    {currencySymbol}{Number(log.financialLoss || 0).toLocaleString()}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-sm text-slate-700">
                                                    {log.reportedBy || 'System'}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </BentoCard>
            </motion.div>
        </motion.div>
    );
}
