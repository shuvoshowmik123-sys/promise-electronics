import { useState, useEffect } from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Plus, Search, X, Download, FileText, Loader2, AlertCircle, DollarSign, Calendar as CalendarIcon, SlidersHorizontal, Upload, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { InsertDueRecord } from "@shared/schema";
import { BentoCard, containerVariants, itemVariants } from "../shared";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dueRecordsApi, fetchApi } from "@/lib/api";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { toast } from "sonner";

export function DuesTab({
    getCurrencySymbol,
    createDueMutation,
    updateDueMutation,
    exportToCSV,
    initialSearchQuery
}: {
    getCurrencySymbol: () => string;
    createDueMutation: any;
    updateDueMutation: any;
    exportToCSV: (data: any[], filename: string, columns: any[]) => void;
    initialSearchQuery?: string;
}) {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [page, setPage] = useState(1);
    const limit = 25;

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [entryMode, setEntryMode] = useState<"single" | "bulk">("single");
    const [isSettleDialogOpen, setIsSettleDialogOpen] = useState(false);
    const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState<any>(null);
    const [paymentAmount, setPaymentAmount] = useState("");
    const [paymentMethod, setPaymentMethod] = useState("Cash");
    const [bulkText, setBulkText] = useState("");

    const [form, setForm] = useState({
        invoice: "",
        customer: "",
        amount: "",
        dueDate: new Date(),
        phone: "",
        device: "",
        note: "",
    });

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

    // Reset page on filter change
    useEffect(() => {
        setPage(1);
    }, [statusFilter, dateRange]);

    // Fetch Paginated Dues Data
    const { data: duesData, isLoading } = useQuery({
        queryKey: ["dueRecords-paginated", page, limit, debouncedSearch, statusFilter, dateRange?.from, dateRange?.to],
        queryFn: () => dueRecordsApi.getAll({
            page,
            limit,
            search: debouncedSearch || undefined,
            status: statusFilter !== "all" ? statusFilter : undefined,
            from: dateRange?.from?.toISOString(),
            to: dateRange?.to?.toISOString(),
        }),
    });

    // Fetch Dues Summary Data
    const { data: summaryData, isLoading: isSummaryLoading } = useQuery({
        queryKey: ["dueRecords-summary", dateRange?.from, dateRange?.to],
        queryFn: () => dueRecordsApi.getSummary({
            from: dateRange?.from?.toISOString(),
            to: dateRange?.to?.toISOString(),
        }),
    });

    const summary = summaryData || { totalDueAmount: 0, overdueCount: 0, pendingCount: 0 };
    const transactions = duesData?.items || [];
    const pagination = duesData ? {
        page: duesData.pagination.page,
        limit: duesData.pagination.limit,
        total: duesData.pagination.total,
        pages: duesData.pagination.pages
    } : undefined;

    const legacyInvoice = (value: string) => value.trim() || `OPENING-${Date.now().toString().slice(-6)}`;
    const normalizePhone = (value: string) => value.replace(/\D/g, "");
    const parseBulkRows = () => {
        return bulkText
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, index) => {
                const [customer = "", phone = "", amount = "", device = "", dueDate = "", note = "", oldReference = ""] = line.split(",").map((part) => part.trim());
                const invoice = legacyInvoice(oldReference || `OPENING-${index + 1}`);
                const duplicate = transactions.some((record: any) => {
                    const sameInvoice = String(record.invoice || "").toLowerCase() === invoice.toLowerCase();
                    const sameCustomer = String(record.customer || "").toLowerCase() === customer.toLowerCase();
                    const sameAmount = Number(record.amount) === Number(amount);
                    return sameInvoice || (sameCustomer && sameAmount && customer.length > 0);
                });

                return {
                    customer,
                    phone,
                    amount,
                    device,
                    dueDate,
                    note,
                    invoice,
                    duplicate,
                    valid: Boolean(customer && Number(amount) > 0),
                };
            });
    };

    const bulkRows = parseBulkRows();
    const validBulkRows = bulkRows.filter((row) => row.valid && !row.duplicate);
    const invalidBulkRows = bulkRows.filter((row) => !row.valid || row.duplicate);

    const invalidateDueViews = () => {
        queryClient.invalidateQueries({ queryKey: ["dueRecords"] });
        queryClient.invalidateQueries({ queryKey: ["dueRecords-paginated"] });
        queryClient.invalidateQueries({ queryKey: ["dueRecords-summary"] });
        queryClient.invalidateQueries({ queryKey: ["due-summary-global"] });
    };

    const toLegacyPayload = (row: {
        customer: string;
        phone?: string;
        amount: string | number;
        device?: string;
        dueDate?: string;
        note?: string;
        invoice?: string;
    }, source: "opening_balance" | "legacy_import") => ({
        customerName: row.customer,
        customerPhone: normalizePhone(row.phone || ""),
        amount: Number(row.amount),
        deviceName: row.device || "",
        dueDate: row.dueDate || undefined,
        note: row.note || "",
        oldReference: row.invoice || "",
        source,
    });

    const createLegacyDueMutation = useMutation({
        mutationFn: async () => {
            return fetchApi("/admin/finance/legacy-dues", {
                method: "POST",
                body: JSON.stringify(toLegacyPayload({
                    customer: form.customer.trim(),
                    phone: form.phone,
                    amount: form.amount,
                    device: form.device,
                    dueDate: form.dueDate instanceof Date ? form.dueDate.toISOString() : undefined,
                    note: form.note,
                    invoice: legacyInvoice(form.invoice),
                }, "opening_balance")),
            });
        },
        onSuccess: () => {
            invalidateDueViews();
            setIsDialogOpen(false);
            setForm({ invoice: "", customer: "", amount: "", dueDate: new Date(), phone: "", device: "", note: "" });
            toast.success("Opening due saved");
        },
        onError: (error: Error) => {
            toast.error(error.message || "Failed to save opening due");
        },
    });

    const bulkImportMutation = useMutation({
        mutationFn: async () => {
            return fetchApi<{ created: number; skipped: number }>("/admin/finance/legacy-dues/bulk", {
                method: "POST",
                body: JSON.stringify({
                    rows: validBulkRows.map((row) => toLegacyPayload(row, "legacy_import")),
                }),
            });
        },
        onSuccess: (result) => {
            invalidateDueViews();
            setBulkText("");
            setIsDialogOpen(false);
            setEntryMode("single");
            setPage(1);
            toast.success("Imported " + result.created + " legacy due records" + (result.skipped ? ", skipped " + result.skipped : ""));
        },
        onError: (error: Error) => {
            toast.error(error.message || "Failed to import dues");
        },
    });

    const handleSubmit = () => {
        createLegacyDueMutation.mutate();
    };

    const handleSettlePayment = () => {
        if (!selectedRecord) return;
        updateDueMutation.mutate({
            id: selectedRecord.id,
            data: {
                paymentAmount,
                paymentMethod
            }
        }, {
            onSuccess: () => {
                setIsSettleDialogOpen(false);
                setSelectedRecord(null);
                setPaymentAmount("");
            }
        });
    };

    return (
        <div className="space-y-2 md:space-y-6 pb-4 md:pb-0">
            {/* Header Stats - Bento Style */}
            <motion.div
                className="hidden md:block"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                <motion.div variants={itemVariants}>
                    <BentoCard className="h-[140px] bg-gradient-to-br from-orange-500 to-red-600" variant="vibrant">
                        <div className="flex items-center justify-between h-full text-white">
                            <div>
                                <h2 className="text-sm opacity-80 uppercase tracking-wider mb-2">Outstanding Payments</h2>
                                <div className="text-4xl font-bold">
                                    {isSummaryLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : `${getCurrencySymbol()}${Number(summary.totalDueAmount).toLocaleString()}`}
                                </div>
                                <p className="text-xs opacity-80 mt-2">Total amount pending collection</p>
                            </div>
                            <div className="text-right">
                                <div className="bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-lg inline-block">
                                    <AlertCircle className="h-5 w-5 inline mr-1" />
                                    <span className="font-bold">{isSummaryLoading ? "..." : summary.overdueCount}</span>
                                    <span className="text-xs ml-1">Overdue</span>
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
                        placeholder="Search dues..."
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
                        <DialogTitle>Filter dues</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger><SelectValue placeholder="All Status" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="Pending">Pending</SelectItem>
                                <SelectItem value="Overdue">Overdue</SelectItem>
                                <SelectItem value="Paid">Paid</SelectItem>
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
                        <Button variant="outline" onClick={() => { setSearch(""); setStatusFilter("all"); setDateRange(undefined); setPage(1); }} className="w-full">
                            Clear filters
                        </Button>
                        <Button onClick={() => setIsFilterDialogOpen(false)} className="w-full">Apply</Button>
                    </div>
                </DialogContent>
            </Dialog>
            <div className="hidden flex-col xl:flex-row items-center gap-4 bg-white p-4 rounded-3xl border border-slate-200/60 shadow-sm md:flex">
                <div className="relative flex-1 w-full max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by customer or invoice..."
                        className="pl-9"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[130px]">
                            <SelectValue placeholder="All Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="Pending">Pending</SelectItem>
                            <SelectItem value="Overdue">Overdue</SelectItem>
                            <SelectItem value="Paid">Paid</SelectItem>
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
                                    <span>Filter by due date</span>
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

                    {(search || statusFilter !== "all" || dateRange) && (
                        <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); setDateRange(undefined); setPage(1); }}>
                            <X className="w-4 h-4" />
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportToCSV(transactions, 'dues_report', [
                            { key: 'invoice', label: 'Invoice' },
                            { key: 'customer', label: 'Customer' },
                            { key: 'amount', label: 'Amount' },
                            { key: 'paidAmount', label: 'Paid' },
                            { key: 'dueDate', label: 'Due Date' },
                            { key: 'status', label: 'Status' },
                        ])}
                    >
                        <Download className="w-4 h-4 mr-1" />
                        Export
                    </Button>
                </div>
            </div>

            {/* Header & Add Button */}
            <div className="flex flex-col gap-3 rounded-2xl border border-orange-100 bg-orange-50/50 p-3 md:flex-row md:items-center md:justify-between md:bg-transparent md:p-0 md:border-0">
                <div>
                    <h2 className="text-lg font-bold">Due Records</h2>
                    <p className="text-xs text-slate-500">Use opening dues only for old balances before daily software use.</p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm" className="h-11 rounded-xl bg-orange-600 hover:bg-orange-700 md:h-9">
                            <Plus className="w-4 h-4 mr-2" /> Opening Due Entry
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>Opening Due Entry</DialogTitle>
                            <DialogDescription>Add old due balances without creating fake jobs or POS invoices.</DialogDescription>
                        </DialogHeader>
                        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
                            <button
                                type="button"
                                onClick={() => setEntryMode("single")}
                                className={cn("rounded-xl px-3 py-2 text-sm font-bold transition-all", entryMode === "single" ? "bg-white text-orange-700 shadow-sm" : "text-slate-500")}
                            >
                                Single entry
                            </button>
                            <button
                                type="button"
                                onClick={() => setEntryMode("bulk")}
                                className={cn("rounded-xl px-3 py-2 text-sm font-bold transition-all", entryMode === "bulk" ? "bg-white text-orange-700 shadow-sm" : "text-slate-500")}
                            >
                                Bulk paste
                            </button>
                        </div>
                        {entryMode === "single" ? (
                            <div className="space-y-4">
                                <div className="rounded-2xl border border-orange-100 bg-orange-50 p-3 text-sm text-orange-900">
                                    This is for migration only. Future dues should come from job billing/POS automatically.
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="customer">Customer Name</Label>
                                        <Input id="customer" placeholder="Customer name" value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="phone">Phone</Label>
                                        <Input id="phone" inputMode="tel" placeholder="01XXXXXXXXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="amount">Amount ({getCurrencySymbol()})</Label>
                                        <Input id="amount" type="number" placeholder="5000" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="dueDate">Due Date</Label>
                                        <Input id="dueDate" type="date" value={form.dueDate instanceof Date ? form.dueDate.toISOString().split('T')[0] : ""} onChange={(e) => setForm({ ...form, dueDate: new Date(e.target.value) })} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="device">Device / Reference</Label>
                                        <Input id="device" placeholder="Samsung 43 panel" value={form.device} onChange={(e) => setForm({ ...form, device: e.target.value })} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="invoice">Old Reference</Label>
                                        <Input id="invoice" placeholder="Old invoice or notebook ref" value={form.invoice} onChange={(e) => setForm({ ...form, invoice: e.target.value })} />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="note">Note</Label>
                                    <Textarea id="note" placeholder="Opening balance note..." value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="rounded-2xl border border-sky-100 bg-sky-50 p-3 text-sm text-sky-900">
                                    Paste rows as: customer, phone, amount, device, due date, note, old reference
                                </div>
                                <Textarea
                                    value={bulkText}
                                    onChange={(e) => setBulkText(e.target.value)}
                                    className="min-h-40 font-mono text-xs"
                                    placeholder={"Rahim Uddin,01700000000,2500,Samsung 32,2026-06-21,Old due,OLD-001\nKarim Ahmed,01800000000,4200,LG 43,2026-06-21,Panel due,OLD-002"}
                                />
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="rounded-xl bg-emerald-50 p-3 text-center">
                                        <p className="text-xl font-black text-emerald-700">{validBulkRows.length}</p>
                                        <p className="text-[10px] font-bold uppercase text-emerald-600">Ready</p>
                                    </div>
                                    <div className="rounded-xl bg-amber-50 p-3 text-center">
                                        <p className="text-xl font-black text-amber-700">{invalidBulkRows.length}</p>
                                        <p className="text-[10px] font-bold uppercase text-amber-600">Needs check</p>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 p-3 text-center">
                                        <p className="text-xl font-black text-slate-700">{bulkRows.length}</p>
                                        <p className="text-[10px] font-bold uppercase text-slate-500">Rows</p>
                                    </div>
                                </div>
                                {bulkRows.length > 0 && (
                                    <div className="max-h-48 overflow-auto rounded-2xl border border-slate-200">
                                        {bulkRows.map((row, index) => (
                                            <div key={row.invoice + "-" + index} className={cn("grid grid-cols-[1fr_auto] gap-2 border-b border-slate-100 p-3 text-sm last:border-0", (!row.valid || row.duplicate) && "bg-amber-50")}>
                                                <div className="min-w-0">
                                                    <p className="truncate font-bold text-slate-900">{row.customer || "Missing customer"}</p>
                                                    <p className="truncate text-xs text-slate-500">{row.phone || "No phone"} · {row.device || "No device"} · {row.invoice}</p>
                                                </div>
                                                <Badge variant={row.valid && !row.duplicate ? "default" : "secondary"}>
                                                    {row.duplicate ? "Duplicate" : row.valid ? getCurrencySymbol() + Number(row.amount).toLocaleString() : "Invalid"}
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                                Cancel
                            </Button>
                            {entryMode === "single" ? (
                                <Button onClick={handleSubmit} disabled={createDueMutation.isPending || !form.customer || !form.amount}>
                                    {createDueMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <ClipboardList className="mr-2 h-4 w-4" />
                                    Save Opening Due
                                </Button>
                            ) : (
                                <Button onClick={() => bulkImportMutation.mutate()} disabled={bulkImportMutation.isPending || validBulkRows.length === 0}>
                                    {bulkImportMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                                    Import {validBulkRows.length} Rows
                                </Button>
                            )}
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
                    <div className="rounded-xl border bg-white p-4 text-center text-sm text-muted-foreground">No dues found</div>
                ) : transactions.map((record: any) => {
                    const remaining = Number(record.amount) - Number(record.paidAmount || 0);
                    return (
                        <div key={record.id} className="scroll-mb-[calc(8rem+env(safe-area-inset-bottom))] rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="truncate font-mono text-xs font-black text-slate-800">{record.invoice}</div>
                                    <div className="truncate text-xs text-slate-500">{record.customer}</div>
                                </div>
                                <Badge variant={record.status === "Paid" ? "default" : record.status === "Overdue" ? "destructive" : "secondary"}>{record.status}</Badge>
                            </div>
                            <div className="mt-2 flex items-end justify-between gap-2">
                                <div>
                                    <div className="text-[10px] uppercase text-slate-400">Remaining</div>
                                    <div className="text-base font-black text-slate-950">{getCurrencySymbol()}{remaining.toLocaleString()}</div>
                                </div>
                                <div className="text-right text-[11px] text-slate-500">
                                    <div>{record.dueDate ? format(new Date(record.dueDate), 'MMM d') : 'No date'}</div>
                                    <div>Paid {getCurrencySymbol()}{Number(record.paidAmount || 0).toLocaleString()}</div>
                                </div>
                            </div>
                            {record.status !== "Paid" && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="mt-2 h-8 w-full scroll-mb-[calc(8rem+env(safe-area-inset-bottom))] rounded-lg"
                                    onClick={() => {
                                        setSelectedRecord(record);
                                        setPaymentAmount(remaining.toString());
                                        setIsSettleDialogOpen(true);
                                    }}
                                >
                                    Settle
                                </Button>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Table - Bento Style */}
            <div className="hidden bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 relative min-h-[400px] md:block">
                <div className="overflow-auto">
                    <Table>
                        <TableHeader className="sticky top-0 bg-slate-50">
                            <TableRow className="border-b border-slate-200">
                                <TableHead className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Invoice</TableHead>
                                <TableHead className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Customer</TableHead>
                                <TableHead className="text-right py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Amount</TableHead>
                                <TableHead className="text-right py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Paid</TableHead>
                                <TableHead className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Due Date</TableHead>
                                <TableHead className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Status</TableHead>
                                <TableHead className="text-right py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-12">
                                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                                        <p className="mt-2 text-sm text-muted-foreground">Loading due records...</p>
                                    </TableCell>
                                </TableRow>
                            ) : transactions.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-12">
                                        <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                                        <p className="text-sm text-muted-foreground">
                                            No records match your search.
                                        </p>
                                        <Button
                                            variant="outline"
                                            className="mt-4"
                                            onClick={() => setIsDialogOpen(true)}
                                        >
                                            <Plus className="w-4 h-4 mr-2" /> Record Your First Due
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                transactions.map((record: any) => {
                                    const remaining = Number(record.amount) - Number(record.paidAmount || 0);
                                    return (
                                        <TableRow key={record.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                            <TableCell className="py-4 px-4">
                                                <span className="font-mono text-sm text-slate-700">{record.invoice}</span>
                                            </TableCell>
                                            <TableCell className="py-4 px-4">
                                                <div className="font-medium text-slate-900">{record.customer}</div>
                                            </TableCell>
                                            <TableCell className="py-4 px-4 text-right">
                                                <span className="font-bold text-slate-900">{getCurrencySymbol()}{Number(record.amount).toLocaleString()}</span>
                                            </TableCell>
                                            <TableCell className="py-4 px-4 text-right">
                                                <span className="text-sm text-green-600">{getCurrencySymbol()}{Number(record.paidAmount || 0).toLocaleString()}</span>
                                            </TableCell>
                                            <TableCell className="py-4 px-4">
                                                <span className="text-sm text-slate-600">
                                                    {record.dueDate ? format(new Date(record.dueDate), 'yyyy-MM-dd') : 'N/A'}
                                                </span>
                                            </TableCell>
                                            <TableCell className="py-4 px-4">
                                                <Badge
                                                    variant={
                                                        record.status === "Paid" ? "default" :
                                                            record.status === "Overdue" ? "destructive" : "secondary"
                                                    }
                                                >
                                                    {record.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="py-4 px-4 text-right">
                                                {record.status !== "Paid" && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            setSelectedRecord(record);
                                                            setPaymentAmount(remaining.toString());
                                                            setIsSettleDialogOpen(true);
                                                        }}
                                                    >
                                                        <DollarSign className="h-4 w-4 mr-1" />
                                                        Settle
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>

                {pagination && pagination.pages > 1 && (
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

                                {Array.from({ length: Math.min(5, pagination.pages) }).map((_, i) => {
                                    // Logic for showing pages near current page
                                    let pageNum = page;
                                    if (pagination.pages <= 5) {
                                        pageNum = i + 1;
                                    } else if (page <= 3) {
                                        pageNum = i + 1;
                                    } else if (page >= pagination.pages - 2) {
                                        pageNum = pagination.pages - 4 + i;
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
                                        onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                                        className={page === pagination.pages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    </div>
                )}
            </div>

            {/* Settle Payment Dialog */}
            <Dialog open={isSettleDialogOpen} onOpenChange={setIsSettleDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Settle Payment</DialogTitle>
                        <DialogDescription>Record a payment for this due record.</DialogDescription>
                    </DialogHeader>
                    {selectedRecord && (
                        <div className="space-y-4">
                            <div className="bg-slate-50 p-3 rounded-md space-y-1">
                                <p className="text-xs text-muted-foreground">Invoice</p>
                                <p className="font-mono font-medium">{selectedRecord.invoice}</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-md space-y-1">
                                <p className="text-xs text-muted-foreground">Customer</p>
                                <p className="font-medium">{selectedRecord.customer}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-50 p-3 rounded-md space-y-1">
                                    <p className="text-xs text-muted-foreground">Total Amount</p>
                                    <p className="font-bold text-lg">{getCurrencySymbol()}{Number(selectedRecord.amount).toLocaleString()}</p>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-md space-y-1">
                                    <p className="text-xs text-muted-foreground">Already Paid</p>
                                    <p className="font-bold text-lg text-green-600">{getCurrencySymbol()}{Number(selectedRecord.paidAmount || 0).toLocaleString()}</p>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="paymentAmount">Payment Amount ({getCurrencySymbol()})</Label>
                                <Input
                                    id="paymentAmount"
                                    type="number"
                                    value={paymentAmount}
                                    onChange={(e) => setPaymentAmount(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="paymentMethod">Payment Method</Label>
                                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Cash">Cash</SelectItem>
                                        <SelectItem value="Bank">Bank</SelectItem>
                                        <SelectItem value="bKash">bKash</SelectItem>
                                        <SelectItem value="Nagad">Nagad</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsSettleDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSettlePayment}
                            disabled={updateDueMutation.isPending}
                        >
                            {updateDueMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Record Payment
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
