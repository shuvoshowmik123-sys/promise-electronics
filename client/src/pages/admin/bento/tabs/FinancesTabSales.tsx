import { useState, useRef, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Eye, Printer, Search, X, Download, Banknote, CreditCard, Smartphone, Clock, ShoppingCart, Loader2, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DateRange } from "react-day-picker";
import { Invoice } from "@/components/print";
import { BentoCard, containerVariants, itemVariants } from "../shared";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { posTransactionsApi } from "@/lib/api";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";

export function SalesTab({
    getCurrencySymbol,
    getCompanyInfo,
    exportToCSV
}: {
    getCurrencySymbol: () => string;
    getCompanyInfo: () => any;
    exportToCSV: (data: any[], filename: string, columns: any[]) => void;
}) {
    const [salesSearch, setSalesSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [salesPaymentFilter, setSalesPaymentFilter] = useState("all");
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [page, setPage] = useState(1);
    const limit = 25;

    const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false);
    const [selectedSaleTransaction, setSelectedSaleTransaction] = useState<any>(null);
    const invoiceRef = useRef<HTMLDivElement>(null);

    // Debounce search
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(salesSearch);
            setPage(1); // Reset to page 1 on new search
        }, 500);
        return () => clearTimeout(handler);
    }, [salesSearch]);

    // Reset page when filters change
    useEffect(() => {
        setPage(1);
    }, [salesPaymentFilter, dateRange]);

    // Fetch Paginated Sales Data
    const { data: salesData, isLoading: isSalesLoading } = useQuery({
        queryKey: ["pos-transactions-paginated", page, limit, debouncedSearch, salesPaymentFilter, dateRange?.from, dateRange?.to],
        queryFn: () => posTransactionsApi.getAll({
            page,
            limit,
            search: debouncedSearch || undefined,
            paymentMethod: salesPaymentFilter !== "all" ? salesPaymentFilter : undefined,
            from: dateRange?.from?.toISOString(),
            to: dateRange?.to?.toISOString(),
        }),
    });

    // Fetch Summary Data
    const { data: summaryData, isLoading: isSummaryLoading } = useQuery({
        queryKey: ["pos-transactions-summary", dateRange?.from, dateRange?.to],
        queryFn: () => posTransactionsApi.getSummary({
            from: dateRange?.from?.toISOString(),
            to: dateRange?.to?.toISOString(),
        }),
    });

    const transactions = salesData?.items || [];
    const pagination = salesData?.pagination;

    const summary = summaryData || { totalSales: 0, count: 0, byMethod: [] };

    const salesByMethod = useMemo(() => {
        const methodMap: Record<string, number> = { Cash: 0, Bank: 0, bKash: 0, Nagad: 0, Due: 0 };
        if (summary.byMethod) {
            Object.entries(summary.byMethod).forEach(([method, total]) => {
                if (methodMap[method] !== undefined) {
                    methodMap[method] = Number(total);
                }
            });
        }
        return methodMap;
    }, [summary.byMethod]);
    const parseTransactionForPrint = (transaction: any) => {
        let parsedItems = [];
        if (transaction.items) {
            try {
                parsedItems = typeof transaction.items === 'string' ? JSON.parse(transaction.items) : transaction.items;
            } catch {
                parsedItems = [];
            }
        }
        return {
            id: transaction.id,
            invoiceNumber: transaction.invoiceNumber,
            customer: transaction.customer,
            items: parsedItems,
            linkedJobs: [],
            subtotal: transaction.subtotal,
            tax: transaction.tax,
            discount: transaction.discount || "0",
            total: transaction.total,
            paymentMethod: transaction.paymentMethod,
            paymentStatus: transaction.paymentStatus || (transaction.paymentMethod === "Due" ? "Due" : "Paid"),
            createdAt: transaction.createdAt,
        };
    };

    const handlePrintInvoice = () => {
        if (!invoiceRef.current) return;
        const printContent = invoiceRef.current.innerHTML;
        const printWindow = window.open("", "_blank");
        if (printWindow) {
            printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Invoice - ${selectedSaleTransaction?.id}</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { font-family: Arial, sans-serif; }
              @page { size: A4; margin: 10mm; }
              @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
            </style>
          </head>
          <body>
            <div style="padding: 2rem; max-width: 210mm; margin: 0 auto;">
              ${printContent}
            </div>
          </body>
        </html>
      `);
            printWindow.document.close();
            printWindow.print();
        }
    };

    return (
        <div className="space-y-6">
            {/* Payment Methods Grid - Bento Style */}
            <motion.div
                className="grid grid-cols-2 md:grid-cols-5 gap-4"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                <motion.div variants={itemVariants}>
                    <BentoCard className="h-full min-h-[100px] bg-gradient-to-br from-emerald-500 to-green-600" variant="vibrant">
                        <div className="flex flex-col justify-center h-full text-white">
                            <div className="flex items-center gap-2 mb-1">
                                <Banknote className="h-4 w-4" />
                                <span className="text-xs opacity-80 uppercase tracking-wider">Cash</span>
                            </div>
                            <div className="text-xl font-bold">
                                {isSummaryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : `${getCurrencySymbol()}${salesByMethod.Cash.toLocaleString()}`}
                            </div>
                        </div>
                    </BentoCard>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <BentoCard className="h-full min-h-[100px] bg-gradient-to-br from-blue-500 to-indigo-600" variant="vibrant">
                        <div className="flex flex-col justify-center h-full text-white">
                            <div className="flex items-center gap-2 mb-1">
                                <CreditCard className="h-4 w-4" />
                                <span className="text-xs opacity-80 uppercase tracking-wider">Bank</span>
                            </div>
                            <div className="text-xl font-bold">
                                {isSummaryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : `${getCurrencySymbol()}${salesByMethod.Bank.toLocaleString()}`}
                            </div>
                        </div>
                    </BentoCard>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <BentoCard className="h-full min-h-[100px] bg-gradient-to-br from-pink-500 to-rose-600" variant="vibrant">
                        <div className="flex flex-col justify-center h-full text-white">
                            <div className="flex items-center gap-2 mb-1">
                                <Smartphone className="h-4 w-4" />
                                <span className="text-xs opacity-80 uppercase tracking-wider">bKash</span>
                            </div>
                            <div className="text-xl font-bold">
                                {isSummaryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : `${getCurrencySymbol()}${salesByMethod.bKash.toLocaleString()}`}
                            </div>
                        </div>
                    </BentoCard>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <BentoCard className="h-full min-h-[100px] bg-gradient-to-br from-orange-500 to-amber-600" variant="vibrant">
                        <div className="flex flex-col justify-center h-full text-white">
                            <div className="flex items-center gap-2 mb-1">
                                <Smartphone className="h-4 w-4" />
                                <span className="text-xs opacity-80 uppercase tracking-wider">Nagad</span>
                            </div>
                            <div className="text-xl font-bold">
                                {isSummaryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : `${getCurrencySymbol()}${salesByMethod.Nagad.toLocaleString()}`}
                            </div>
                        </div>
                    </BentoCard>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <BentoCard className="h-full min-h-[100px] bg-gradient-to-br from-red-500 to-rose-700" variant="vibrant">
                        <div className="flex flex-col justify-center h-full text-white">
                            <div className="flex items-center gap-2 mb-1">
                                <Clock className="h-4 w-4" />
                                <span className="text-xs opacity-80 uppercase tracking-wider">Due</span>
                            </div>
                            <div className="text-xl font-bold">
                                {isSummaryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : `${getCurrencySymbol()}${salesByMethod.Due.toLocaleString()}`}
                            </div>
                        </div>
                    </BentoCard>
                </motion.div>
            </motion.div>

            {/* Search and Filter Bar */}
            <div className="flex flex-col lg:flex-row items-center gap-4 bg-white p-4 rounded-3xl border border-slate-200/60 shadow-sm">
                <div className="relative flex-1 w-full max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by invoice or customer..."
                        className="pl-9"
                        value={salesSearch}
                        onChange={(e) => setSalesSearch(e.target.value)}
                    />
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                    <Select value={salesPaymentFilter} onValueChange={setSalesPaymentFilter}>
                        <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="All Payments" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Payments</SelectItem>
                            <SelectItem value="Cash">Cash</SelectItem>
                            <SelectItem value="Bank">Bank</SelectItem>
                            <SelectItem value="bKash">bKash</SelectItem>
                            <SelectItem value="Nagad">Nagad</SelectItem>
                            <SelectItem value="Due">Due</SelectItem>
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

                    {(salesSearch || salesPaymentFilter !== "all" || dateRange) && (
                        <Button variant="ghost" size="sm" onClick={() => {
                            setSalesSearch("");
                            setSalesPaymentFilter("all");
                            setDateRange(undefined);
                            setPage(1);
                        }}>
                            <X className="w-4 h-4" />
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportToCSV(transactions, 'sales_report', [
                            { key: 'invoiceNumber', label: 'Invoice' },
                            { key: 'createdAt', label: 'Date' },
                            { key: 'customer', label: 'Customer' },
                            { key: 'paymentMethod', label: 'Payment Method' },
                            { key: 'paymentStatus', label: 'Status' },
                            { key: 'total', label: 'Amount' },
                        ])}
                    >
                        <Download className="w-4 h-4 mr-1" />
                        Export
                    </Button>
                </div>
            </div>

            {/* Sales Table - Bento Style */}
            <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 relative min-h-[400px]">
                <div className="overflow-auto">
                    <Table>
                        <TableHeader className="sticky top-0 bg-slate-50">
                            <TableRow className="border-b border-slate-200">
                                <TableHead className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Invoice</TableHead>
                                <TableHead className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Date</TableHead>
                                <TableHead className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Customer</TableHead>
                                <TableHead className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Payment</TableHead>
                                <TableHead className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Status</TableHead>
                                <TableHead className="text-right py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Amount</TableHead>
                                <TableHead className="text-center py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isSalesLoading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-12">
                                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                                        <p className="mt-2 text-sm text-muted-foreground">Loading sales...</p>
                                    </TableCell>
                                </TableRow>
                            ) : transactions.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-12">
                                        <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                                        <p className="text-sm text-muted-foreground">
                                            No sales match your search or filters.
                                        </p>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                transactions.map((transaction: any) => (
                                    <TableRow key={transaction.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                        <TableCell className="py-4 px-4">
                                            <span className="font-mono text-sm text-slate-700">{transaction.invoiceNumber || transaction.id}</span>
                                        </TableCell>
                                        <TableCell className="py-4 px-4">
                                            <span className="text-sm text-slate-600">
                                                {transaction.createdAt ? format(new Date(transaction.createdAt), 'yyyy-MM-dd HH:mm') : 'N/A'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-4 px-4">
                                            <div className="font-medium text-slate-900">{transaction.customer || 'Walk-in'}</div>
                                        </TableCell>
                                        <TableCell className="py-4 px-4">
                                            <Badge
                                                variant="outline"
                                                className={
                                                    transaction.paymentMethod === "Cash" ? "border-green-500 text-green-600" :
                                                        transaction.paymentMethod === "Bank" ? "border-blue-500 text-blue-600" :
                                                            transaction.paymentMethod === "bKash" ? "border-pink-500 text-pink-600" :
                                                                transaction.paymentMethod === "Nagad" ? "border-orange-500 text-orange-600" :
                                                                    "border-red-500 text-red-600"
                                                }
                                            >
                                                {transaction.paymentMethod}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="py-4 px-4">
                                            <Badge variant={transaction.paymentStatus === "Paid" ? "default" : "destructive"}>
                                                {transaction.paymentStatus === "Paid" ? "Paid" : "Due"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="py-4 px-4 text-right">
                                            <span className="font-bold text-slate-900">{getCurrencySymbol()}{Number(transaction.total).toLocaleString()}</span>
                                        </TableCell>
                                        <TableCell className="py-4 px-4 text-center">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 w-8 p-0"
                                                onClick={() => {
                                                    setSelectedSaleTransaction(parseTransactionForPrint(transaction));
                                                    setIsInvoiceDialogOpen(true);
                                                }}
                                            >
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
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

            {/* Invoice Preview Dialog */}
            <Dialog open={isInvoiceDialogOpen} onOpenChange={setIsInvoiceDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Invoice Preview</DialogTitle>
                    </DialogHeader>
                    {selectedSaleTransaction && (
                        <div ref={invoiceRef}>
                            <Invoice data={selectedSaleTransaction} company={getCompanyInfo()} />
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsInvoiceDialogOpen(false)}>
                            Close
                        </Button>
                        <Button onClick={handlePrintInvoice}>
                            <Printer className="h-4 w-4 mr-2" /> Print
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
