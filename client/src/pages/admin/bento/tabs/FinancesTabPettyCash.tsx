import { useState, useEffect } from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Plus, Search, X, Download, TrendingUp, TrendingDown, Wallet, Loader2, Calendar as CalendarIcon, SlidersHorizontal } from "lucide-react";
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
import { pettyCashApi, usersApi } from "@/lib/api";
import { EXPENSE_CATEGORIES, EXPENSE_PURPOSES } from "@shared/expense-tracking";
import { ExpenseLedger } from "./FinancesTabExpenseLedger";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

export function PettyCashTab({
    getCurrencySymbol,
    createPettyCashMutation,
    reversePettyCashMutation,
    exportToCSV,
    initialSearchQuery
}: {
    getCurrencySymbol: () => string;
    createPettyCashMutation: any;
    reversePettyCashMutation: any;
    exportToCSV: (data: any[], filename: string, columns: any[]) => void;
    initialSearchQuery?: string;
}) {
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("all");
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [page, setPage] = useState(1);
    const limit = 25;

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
    const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState<any>(null);

    const [form, setForm] = useState({
        description: "",
        category: "food",
        amount: "",
        type: "Expense",
        // Whose expense this is. Finance staff record on everybody's behalf,
        // so it cannot be inferred from who happens to be logged in.
        spentBy: "",
        purpose: "office",
        // The day the money actually left, which is often not today when a
        // handful of small spends are written up at the end of a shift.
        occurredAt: new Date().toISOString().slice(0, 10),
    });

    const { data: staff = [] } = useQuery({
        queryKey: ["users-for-expense"],
        queryFn: usersApi.getAll,
        staleTime: 5 * 60_000,
    });

    const isIncome = (type: string) => ["Income", "Cash", "Bank", "bKash", "Nagad"].includes(type);

    // Apply initial search query from Smart Search
    useEffect(() => {
        if (initialSearchQuery !== undefined) {
            setSearch(initialSearchQuery);
        }
    }, [initialSearchQuery]);

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

    const resetForm = () => setForm({
        description: "",
        category: "food",
        amount: "",
        type: "Expense",
        spentBy: "",
        purpose: "office",
        occurredAt: new Date().toISOString().slice(0, 10),
    });

    const handleSubmit = () => {
        const person = (staff as any[]).find((u) => u.id === form.spentBy);
        createPettyCashMutation.mutate({
            ...form,
            amount: Number(form.amount) || 0,
            spentBy: form.spentBy || null,
            // Snapshot the name: people leave and get renamed, and a spend from
            // March should still say who it was at the time.
            spentByName: person?.name ?? null,
            occurredAt: form.occurredAt ? new Date(`${form.occurredAt}T12:00:00`).toISOString() : null,
        } as unknown as InsertPettyCashRecord, {
            onSuccess: () => {
                setIsDialogOpen(false);
                resetForm();
            }
        });
    };

    return (
        <div className="space-y-2 md:space-y-6 pb-4 md:pb-0">
            {/* KPI Cards - Bento Style */}
            <motion.div
                className="hidden grid-cols-1 md:grid md:grid-cols-2 gap-4"
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
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 md:hidden">
                <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search expenses..."
                        className="h-9 rounded-lg pl-9 text-sm"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <Button variant="outline" size="sm" className="h-9 rounded-lg px-2" onClick={() => setIsFilterDialogOpen(true)}>
                    <SlidersHorizontal className="h-4 w-4" />
                </Button>
            </div>
            <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
                <DialogContent className="rounded-2xl">
                    <DialogHeader>
                        <DialogTitle>Filter transactions</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Select value={typeFilter} onValueChange={setTypeFilter}>
                            <SelectTrigger><SelectValue placeholder="All Types" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                <SelectItem value="Income">Income</SelectItem>
                                <SelectItem value="Expense">Expense</SelectItem>
                            </SelectContent>
                        </Select>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="h-9 w-full justify-start text-left font-normal">
                                    {dateRange?.from ? (
                                        dateRange.to ? (
                                            <>{format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d")}</>
                                        ) : (
                                            format(dateRange.from, "MMM d")
                                        )
                                    ) : (
                                        <span>Date range</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={1} />
                            </PopoverContent>
                        </Popover>
                        <Button variant="outline" onClick={() => { setSearch(""); setTypeFilter("all"); setDateRange(undefined); setPage(1); }} className="w-full">
                            Clear filters
                        </Button>
                        <Button onClick={() => setIsFilterDialogOpen(false)} className="w-full">Apply</Button>
                    </div>
                </DialogContent>
            </Dialog>
            <div className="hidden flex-col lg:flex-row items-center gap-4 bg-white p-4 rounded-3xl border border-slate-200/60 shadow-sm md:flex">
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

            {/*
              * The rolled-up ledger sits above the flat list on purpose.
              *
              * The list is still here — it is how you search and how a single
              * entry gets opened — but it is not the thing to look at first.
              * What a month cost, and what each person cost, is.
              */}
            <ExpenseLedger
                getCurrencySymbol={getCurrencySymbol}
                reversePettyCashMutation={reversePettyCashMutation}
            />

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
                                {/* Was a free-text box, which is why "tea", "Tea" and
                                    "Snacks" were three different things to a SUM, and
                                    why the shop could never answer what it spends on
                                    what. */}
                                <Label htmlFor="category">Category</Label>
                                <Select value={form.category} onValueChange={(value) => setForm({ ...form, category: value })}>
                                    <SelectTrigger id="category"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {EXPENSE_CATEGORIES.map((c) => (
                                            <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="spentBy">Whose expense</Label>
                                <Select value={form.spentBy || "none"} onValueChange={(value) => setForm({ ...form, spentBy: value === "none" ? "" : value })}>
                                    <SelectTrigger id="spentBy"><SelectValue placeholder="Select a person" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Not attributed to a person</SelectItem>
                                        {(staff as any[]).map((u) => (
                                            <SelectItem key={u.id} value={u.id}>{u.name}{u.role ? ` \u2014 ${u.role}` : ""}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="purpose">Purpose</Label>
                                <Select value={form.purpose} onValueChange={(value) => setForm({ ...form, purpose: value })}>
                                    <SelectTrigger id="purpose"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {EXPENSE_PURPOSES.map((pp) => (
                                            <SelectItem key={pp.id} value={pp.id}>{pp.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-[11px] text-muted-foreground">
                                    {EXPENSE_PURPOSES.find((pp) => pp.id === form.purpose)?.hint}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="occurredAt">Date spent</Label>
                                <Input
                                    id="occurredAt"
                                    type="date"
                                    value={form.occurredAt}
                                    onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    When the money actually left, not when you are typing it in.
                                </p>
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

            <div className="space-y-2 pb-4 md:hidden">
                {isLoading ? (
                    <div className="rounded-xl border bg-white p-4 text-center text-sm text-muted-foreground">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </div>
                ) : transactions.length === 0 ? (
                    <div className="rounded-xl border bg-white p-4 text-center text-sm text-muted-foreground">No transactions found</div>
                ) : transactions.map((record: any) => (
                    <button
                        key={record.id}
                        type="button"
                        onClick={() => {
                            setSelectedTransaction(record);
                            setIsDetailDialogOpen(true);
                        }}
                        className="w-full scroll-mb-[calc(8rem+env(safe-area-inset-bottom))] rounded-xl border border-slate-200 bg-white p-2.5 text-left shadow-sm"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <div className="truncate text-sm font-black text-slate-900">{record.description}</div>
                                <div className="truncate text-xs text-slate-500">{record.category || "Uncategorized"} - {record.createdAt ? format(new Date(record.createdAt), 'MMM d') : 'No date'}</div>
                            </div>
                            <div className={`text-right text-base font-black ${isIncome(record.type) ? "text-green-600" : "text-red-600"}`}>
                                {isIncome(record.type) ? "+" : "-"}{getCurrencySymbol()}{Number(record.amount).toLocaleString()}
                            </div>
                        </div>
                        <div className="mt-1.5">
                            <Badge variant={isIncome(record.type) ? "default" : "destructive"}>{record.type}</Badge>
                        </div>
                    </button>
                ))}
            </div>

            {/* Table - Bento Style */}
            <div className="hidden bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 relative min-h-[400px] md:block">
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
                            {selectedTransaction.spentByName && (
                                <div>
                                    <p className="text-xs text-muted-foreground">Whose expense</p>
                                    <p className="font-medium mt-1">{selectedTransaction.spentByName}</p>
                                </div>
                            )}
                            {/*
                              * Reverse, not delete.
                              *
                              * Deleting removed the row while leaving the register still
                              * expecting less cash, so a mistyped and deleted expense
                              * turned into a surplus at the next blind count on a shift
                              * where nothing had gone wrong. Reversing keeps both rows
                              * and hands the money back.
                              */}
                            {selectedTransaction.reversedAt ? (
                                <p className="mt-4 rounded-md bg-rose-50 p-3 text-sm font-semibold text-rose-700">
                                    Reversed by {selectedTransaction.reversedByName || "someone"}
                                    {selectedTransaction.reversalReason ? ` — ${selectedTransaction.reversalReason}` : ""}
                                </p>
                            ) : (
                                <Button
                                    variant="outline"
                                    className="mt-4 w-full border-rose-200 text-rose-600 hover:bg-rose-50"
                                    disabled={reversePettyCashMutation.isPending}
                                    onClick={() => {
                                        const reason = window.prompt(
                                            "Reverse this entry?\n\nIt stays on the record and a cancelling entry is added. " +
                                            "If it was paid from the register, the amount goes back.\n\n" +
                                            "Reason (required when the entry is not yours):",
                                        );
                                        if (reason === null) return;
                                        reversePettyCashMutation.mutate(
                                            { id: selectedTransaction.id, reason },
                                            { onSuccess: () => setIsDetailDialogOpen(false) },
                                        );
                                    }}
                                >
                                    Reverse Transaction
                                </Button>
                            )}
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
