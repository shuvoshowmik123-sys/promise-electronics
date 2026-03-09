import { useState, useEffect } from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Plus, Search, X, Download, FileText, Loader2, AlertCircle, DollarSign, Calendar as CalendarIcon } from "lucide-react";
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
import { InsertDueRecord } from "@shared/schema";
import { BentoCard, containerVariants, itemVariants } from "../shared";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { dueRecordsApi } from "@/lib/api";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

export function DuesTab({
    getCurrencySymbol,
    createDueMutation,
    updateDueMutation,
    exportToCSV
}: {
    getCurrencySymbol: () => string;
    createDueMutation: any;
    updateDueMutation: any;
    exportToCSV: (data: any[], filename: string, columns: any[]) => void;
}) {
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [page, setPage] = useState(1);
    const limit = 25;

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSettleDialogOpen, setIsSettleDialogOpen] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState<any>(null);
    const [paymentAmount, setPaymentAmount] = useState("");
    const [paymentMethod, setPaymentMethod] = useState("Cash");

    const [form, setForm] = useState({
        invoice: "",
        customer: "",
        amount: "",
        dueDate: new Date(),
    });

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

    const handleSubmit = () => {
        createDueMutation.mutate({
            ...form,
            amount: Number(form.amount) || 0
        } as InsertDueRecord, {
            onSuccess: () => {
                setIsDialogOpen(false);
                setForm({ invoice: "", customer: "", amount: "", dueDate: new Date() });
            }
        });
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
        <div className="space-y-6">
            {/* Header Stats - Bento Style */}
            <motion.div
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
            <div className="flex flex-col xl:flex-row items-center gap-4 bg-white p-4 rounded-3xl border border-slate-200/60 shadow-sm">
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
            <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold">Due Records</h2>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button size="sm">
                            <Plus className="w-4 h-4 mr-2" /> Record New Due
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Record New Due</DialogTitle>
                            <DialogDescription>Add a new outstanding payment record.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="invoice">Invoice Number</Label>
                                <Input
                                    id="invoice"
                                    placeholder="INV-2025-001"
                                    value={form.invoice}
                                    onChange={(e) => setForm({ ...form, invoice: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="customer">Customer Name</Label>
                                <Input
                                    id="customer"
                                    placeholder="John Doe"
                                    value={form.customer}
                                    onChange={(e) => setForm({ ...form, customer: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="amount">Amount ({getCurrencySymbol()})</Label>
                                <Input
                                    id="amount"
                                    type="number"
                                    placeholder="5000"
                                    value={form.amount}
                                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="dueDate">Due Date</Label>
                                <Input
                                    id="dueDate"
                                    type="date"
                                    value={form.dueDate instanceof Date ? form.dueDate.toISOString().split('T')[0] : ""}
                                    onChange={(e) => setForm({ ...form, dueDate: new Date(e.target.value) })}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={createDueMutation.isPending}
                            >
                                {createDueMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Record Due
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
