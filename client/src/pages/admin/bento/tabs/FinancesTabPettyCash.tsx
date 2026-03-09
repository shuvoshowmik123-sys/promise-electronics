import { useState, useEffect } from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Plus, Search, X, Download, TrendingUp, TrendingDown, Wallet, Loader2, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { InsertPettyCashRecord } from "@shared/schema";
import { BentoCard, containerVariants, itemVariants } from "../shared";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { pettyCashApi } from "@/lib/api";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

export function PettyCashTab({
    getCurrencySymbol,
    createPettyCashMutation,
    deletePettyCashMutation,
    exportToCSV
}: {
    getCurrencySymbol: () => string;
    createPettyCashMutation: any;
    deletePettyCashMutation: any;
    exportToCSV: (data: any[], filename: string, columns: any[]) => void;
}) {
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [page, setPage] = useState(1);
    const limit = 25;

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState<any>(null);

    const [form, setForm] = useState({
        description: "",
        category: "",
        amount: "",
        type: "Income",
    });

    const isIncome = (type: string) => ["Income", "Cash", "Bank", "bKash", "Nagad"].includes(type);

    // Debounce search
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 500);
        return () => clearTimeout(handler);
    }, [search]);

    // Reset page when filters change
    useEffect(() => {
        setPage(1);
    }, [typeFilter, dateRange]);

    // Fetch Paginated Data
    const { data: pettyCashData, isLoading } = useQuery({
        queryKey: ["pettyCash-paginated", page, limit, debouncedSearch, typeFilter, dateRange?.from, dateRange?.to],
        queryFn: () => pettyCashApi.getAll({
            page,
            limit,
            search: debouncedSearch || undefined,
            type: typeFilter !== "all" ? typeFilter : undefined,
            from: dateRange?.from?.toISOString(),
            to: dateRange?.to?.toISOString(),
        }),
    });

    // We only need today's summary for the top cards.
    // If we wanted overall summary, we wouldn't constrain with `today`.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tonight = new Date(today);
    tonight.setHours(23, 59, 59, 999);

    const { data: todaySummaryData, isLoading: isSummaryLoading } = useQuery({
        queryKey: ["pettyCash-summary-today"],
        queryFn: () => pettyCashApi.getSummary({
            from: today.toISOString(),
            to: tonight.toISOString()
        }),
    });

    const todaySummary = todaySummaryData as any || { totalIncome: 0, totalExpense: 0 };
    const transactions = pettyCashData?.items || [];
    const pagination = pettyCashData ? {
        page: pettyCashData.pagination.page,
        limit: pettyCashData.pagination.limit,
        total: pettyCashData.pagination.total,
        totalPages: pettyCashData.pagination.pages
    } : undefined;

    const handleSubmit = () => {
        createPettyCashMutation.mutate({
            ...form,
            amount: Number(form.amount) || 0
        } as InsertPettyCashRecord, {
            onSuccess: () => {
                setIsDialogOpen(false);
                setForm({ description: "", category: "", amount: "", type: "Income" });
            }
        });
    };

    return (
        <div className="space-y-6">
            {/* KPI Cards - Bento Style */}
            <motion.div
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                <motion.div variants={itemVariants}>
                    <BentoCard className="h-[120px] bg-gradient-to-br from-emerald-500 to-green-600" variant="vibrant">
                        <div className="flex items-center gap-4 h-full text-white">
                            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
                                <TrendingUp className="h-6 w-6" />
                            </div>
                            <div>
                                <span className="text-sm opacity-80 uppercase tracking-wider block">Today's Income</span>
                                <div className="text-2xl font-bold mt-1">
                                    {isSummaryLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : `+${getCurrencySymbol()}${todaySummary.totalIncome.toLocaleString()}`}
                                </div>
                            </div>
                        </div>
                    </BentoCard>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <BentoCard className="h-[120px] bg-gradient-to-br from-rose-500 to-red-600" variant="vibrant">
                        <div className="flex items-center gap-4 h-full text-white">
                            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
                                <TrendingDown className="h-6 w-6" />
                            </div>
                            <div>
                                <span className="text-sm opacity-80 uppercase tracking-wider block">Today's Expense</span>
                                <div className="text-2xl font-bold mt-1">
                                    {isSummaryLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : `-${getCurrencySymbol()}${todaySummary.totalExpense.toLocaleString()}`}
                                </div>
                            </div>
                        </div>
                    </BentoCard>
                </motion.div>
            </motion.div>

            {/* Toolbar */}
            <div className="flex flex-col lg:flex-row items-center gap-4 bg-white p-4 rounded-3xl border border-slate-200/60 shadow-sm">
                <div className="relative flex-1 w-full max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by description or category..."
                        className="pl-9"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger className="w-[130px]">
                            <SelectValue placeholder="All Types" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="Income">Income</SelectItem>
                            <SelectItem value="Expense">Expense</SelectItem>
                        </SelectContent>
                    </Select>

                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                id="date"
                                variant={"outline"}
                                className={cn(
                                    "w-[240px] justify-start text-left font-normal",
                                    !dateRange && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from ? (
                                    dateRange.to ? (
                                        <>
                                            {format(dateRange.from, "LLL dd, y")} -{" "}
                                            {format(dateRange.to, "LLL dd, y")}
                                        </>
                                    ) : (
                                        format(dateRange.from, "LLL dd, y")
                                    )
                                ) : (
                                    <span>Pick a date range</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={dateRange?.from}
                                selected={dateRange}
                                onSelect={setDateRange}
                                numberOfMonths={2}
                            />
                        </PopoverContent>
                    </Popover>

                    {(search || typeFilter !== "all" || dateRange) && (
                        <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setTypeFilter("all"); setDateRange(undefined); setPage(1); }}>
                            <X className="w-4 h-4" />
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportToCSV(transactions, 'petty_cash_report', [
                            { key: 'createdAt', label: 'Date' },
                            { key: 'type', label: 'Type' },
                            { key: 'description', label: 'Description' },
                            { key: 'category', label: 'Category' },
                            { key: 'amount', label: 'Amount' },
                        ])}
                    >
                        <Download className="w-4 h-4 mr-1" />
                        Export
                    </Button>
                </div>
            </div>

            {/* Header & Add Button */}
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold">Transaction History</h2>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm">
                            <Plus className="w-4 h-4 mr-2" /> Add Transaction
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add Transaction</DialogTitle>
                            <DialogDescription>Record a new income or expense.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="type">Type</Label>
                                <Select
                                    value={form.type}
                                    onValueChange={(value) => setForm({ ...form, type: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Income">Income</SelectItem>
                                        <SelectItem value="Expense">Expense</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Input
                                    id="description"
                                    placeholder="Service Charge - Job #8892"
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="category">Category</Label>
                                <Input
                                    id="category"
                                    placeholder="Service / Food / Transport"
                                    value={form.category}
                                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="amount">Amount ({getCurrencySymbol()})</Label>
                                <Input
                                    id="amount"
                                    type="number"
                                    placeholder="1500"
                                    value={form.amount}
                                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={createPettyCashMutation.isPending}
                            >
                                {createPettyCashMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Add Transaction
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Table - Bento Style */}
            <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 relative min-h-[400px]">
                <div className="overflow-auto">
                    <Table>
                        <TableHeader className="sticky top-0 bg-slate-50">
                            <TableRow className="border-b border-slate-200">
                                <TableHead className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Date</TableHead>
                                <TableHead className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Description</TableHead>
                                <TableHead className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Category</TableHead>
                                <TableHead className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Type</TableHead>
                                <TableHead className="text-right py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Amount</TableHead>
                                <TableHead className="text-right py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12">
                                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                                        <p className="mt-2 text-sm text-muted-foreground">Loading transactions...</p>
                                    </TableCell>
                                </TableRow>
                            ) : transactions.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-12">
                                        <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                                        <p className="text-sm text-muted-foreground">
                                            No transactions match your search.
                                        </p>
                                        <Button
                                            variant="outline"
                                            className="mt-4"
                                            onClick={() => setIsDialogOpen(true)}
                                        >
                                            <Plus className="w-4 h-4 mr-2" /> Add Your First Transaction
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                transactions.map((record: any) => (
                                    <TableRow key={record.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                        <TableCell className="py-4 px-4">
                                            <span className="text-sm text-slate-600">
                                                {record.createdAt ? format(new Date(record.createdAt), 'yyyy-MM-dd') : 'N/A'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-4 px-4">
                                            <div className="font-medium text-slate-900">{record.description}</div>
                                        </TableCell>
                                        <TableCell className="py-4 px-4">
                                            <span className="text-sm text-slate-600">{record.category}</span>
                                        </TableCell>
                                        <TableCell className="py-4 px-4">
                                            <Badge variant={isIncome(record.type) ? "default" : "destructive"}>
                                                {record.type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className={`py-4 px-4 text-right font-bold ${isIncome(record.type) ? "text-green-600" : "text-red-600"}`}>
                                            {isIncome(record.type) ? "+" : "-"}{getCurrencySymbol()}{Number(record.amount).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="py-4 px-4 text-right">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8"
                                                onClick={() => {
                                                    setSelectedTransaction(record);
                                                    setIsDetailDialogOpen(true);
                                                }}
                                            >
                                                View Details
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>

                {pagination && pagination.totalPages > 1 && (
                    <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                        <div className="text-sm text-slate-500">
                            Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} entries
                        </div>
                        <Pagination className="w-auto mx-0">
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                    />
                                </PaginationItem>

                                {Array.from({ length: Math.min(5, pagination.totalPages) }).map((_, i) => {
                                    // Logic for showing pages near current page
                                    let pageNum = page;
                                    if (pagination.totalPages <= 5) {
                                        pageNum = i + 1;
                                    } else if (page <= 3) {
                                        pageNum = i + 1;
                                    } else if (page >= pagination.totalPages - 2) {
                                        pageNum = pagination.totalPages - 4 + i;
                                    } else {
                                        pageNum = page - 2 + i;
                                    }

                                    return (
                                        <PaginationItem key={pageNum}>
                                            <PaginationLink
                                                isActive={page === pageNum}
                                                onClick={() => setPage(pageNum)}
                                                className="cursor-pointer"
                                            >
                                                {pageNum}
                                            </PaginationLink>
                                        </PaginationItem>
                                    );
                                })}

                                <PaginationItem>
                                    <PaginationNext
                                        onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                                        className={page === pagination.totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    </div>
                )}
            </div>

            {/* Details Dialog */}
            <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Transaction Details</DialogTitle>
                    </DialogHeader>
                    {selectedTransaction && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-muted-foreground">Type</p>
                                    <Badge variant={selectedTransaction.type === "Income" ? "default" : "destructive"} className="mt-1">
                                        {selectedTransaction.type}
                                    </Badge>
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground">Date</p>
                                    <p className="font-medium mt-1">{selectedTransaction.createdAt ? format(new Date(selectedTransaction.createdAt), 'yyyy-MM-dd HH:mm') : 'N/A'}</p>
                                </div>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Description</p>
                                <p className="font-medium mt-1">{selectedTransaction.description}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Category</p>
                                <p className="font-medium mt-1">{selectedTransaction.category}</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-md">
                                <p className="text-xs text-muted-foreground">Amount</p>
                                <p className={`text-2xl font-bold mt-1 ${selectedTransaction.type === "Income" ? "text-green-600" : "text-red-600"}`}>
                                    {selectedTransaction.type === "Income" ? "+" : "-"}{getCurrencySymbol()}{Number(selectedTransaction.amount).toLocaleString()}
                                </p>
                            </div>
                            <Button
                                variant="destructive"
                                className="w-full mt-4"
                                onClick={() => {
                                    if (confirm("Are you sure you want to delete this transaction?")) {
                                        deletePettyCashMutation.mutate(selectedTransaction.id, {
                                            onSuccess: () => setIsDetailDialogOpen(false)
                                        });
                                    }
                                }}
                            >
                                Delete Transaction
                            </Button>
                        </div>
                    )}
                    <DialogFooter>
                        <Button onClick={() => setIsDetailDialogOpen(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
