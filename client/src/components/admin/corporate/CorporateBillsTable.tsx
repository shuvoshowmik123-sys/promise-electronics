import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { corporateApi } from "@/lib/api";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { FileText, Printer, Loader2, Plus, Filter, Search, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { BillDetailsSheet } from "./BillDetailsSheet";

interface CorporateBillsTableProps {
    clientId: string;
}

export function CorporateBillsTable({ clientId }: CorporateBillsTableProps) {
    const [page, setPage] = useState(1);
    const [limit] = useState(20);
    const [selectedBillId, setSelectedBillId] = useState<string | null>(null);

    const { data: bills, isLoading } = useQuery({
        queryKey: ["corporateBills", clientId],
        queryFn: () => corporateApi.getBills(clientId),
    });

    const handlePrint = (e: React.MouseEvent, billId: string) => {
        e.stopPropagation();
        window.open(`/admin/corporate/bills/${billId}/print`, '_blank');
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                <p>Loading billing records...</p>
            </div>
        );
    }

    if (!bills || bills.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <FileText className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1">No bills generated yet</h3>
                <p className="text-sm">Invoices for this client will appear here once generated.</p>
            </div>
        );
    }

    // Manual client-side pagination since API doesn't seem to paginate bills uniformly right now based on our audit
    const totalPages = Math.ceil(bills.length / limit);
    const paginatedBills = bills.slice((page - 1) * limit, page * limit);

    return (
        <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden min-h-0 relative">
            {/* Toolbar */}
            <div className="p-4 border-b flex flex-col sm:flex-row gap-4 justify-between items-start md:items-center bg-white z-10 w-full shrink-0">
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                            placeholder="Search invoices..."
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-9 gap-2 rounded-xl text-slate-600 border-slate-200">
                        <Filter className="w-4 h-4" /> Filter
                    </Button>
                </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-auto custom-scrollbar relative bg-slate-50/30">
                <Table className="relative w-full">
                    <TableHeader className="bg-slate-50/80 text-xs uppercase text-slate-500 font-bold tracking-wider border-b sticky top-0 z-10 backdrop-blur-xl">
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="px-6 py-4">Bill / Invoice #</TableHead>
                            <TableHead className="px-6 py-4">Date</TableHead>
                            <TableHead className="px-6 py-4">Billing Period</TableHead>
                            <TableHead className="px-6 py-4 text-right">Total Amount</TableHead>
                            <TableHead className="px-6 py-4">Status</TableHead>
                            <TableHead className="px-6 py-4 text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-slate-100/50">
                        {paginatedBills.map((bill: any) => (
                            <TableRow
                                key={bill.id}
                                className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                onClick={() => setSelectedBillId(bill.id)}
                            >
                                <TableCell className="px-6 py-4 font-mono font-medium text-slate-700">{bill.billNumber}</TableCell>
                                <TableCell className="px-6 py-4 text-slate-600">{format(new Date(bill.createdAt), "dd MMM yyyy")}</TableCell>
                                <TableCell className="px-6 py-4 text-sm text-slate-500">
                                    {format(new Date(bill.billingPeriodStart), "MMM d")} - {format(new Date(bill.billingPeriodEnd), "MMM d, yyyy")}
                                </TableCell>
                                <TableCell className="px-6 py-4 text-right font-bold tabular-nums text-slate-800">
                                    ৳ {bill.grandTotal?.toFixed(2)}
                                </TableCell>
                                <TableCell className="px-6 py-4">
                                    <Badge variant={bill.paymentStatus === 'paid' ? "default" : "outline"} className={cn(
                                        "uppercase text-[10px] tracking-wider font-semibold",
                                        bill.paymentStatus === 'paid' ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-amber-50 text-amber-600 border-amber-200"
                                    )}>
                                        {bill.paymentStatus}
                                    </Badge>
                                </TableCell>
                                <TableCell className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg">
                                            <Eye className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-slate-500 bg-slate-100 hover:bg-slate-200 hover:text-slate-800 rounded-lg"
                                            onClick={(e) => handlePrint(e, bill.id)}
                                        >
                                            <Printer className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination Footer */}
            {totalPages > 0 && (
                <div className="flex items-center justify-between border-t border-slate-200 bg-white p-4 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]">
                    <span className="text-sm font-medium text-slate-500">
                        Showing {(page - 1) * limit + 1} to {Math.min(page * limit, bills.length)} of {bills.length} bills
                    </span>
                    <div className="flex items-center gap-1 sm:gap-2">
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="gap-1 h-8 px-2 sm:px-3 rounded-lg border-slate-200">
                            <ChevronLeft className="w-4 h-4" /> <span className="hidden sm:inline">Prev</span>
                        </Button>
                        <div className="hidden sm:flex items-center gap-1">
                            {Array.from({ length: totalPages }).map((_, i) => {
                                if (totalPages > 7) {
                                    if (i !== 0 && i !== totalPages - 1 && Math.abs(i + 1 - page) > 1) {
                                        if (i === 1 || i === totalPages - 2) return <span key={i} className="px-1 text-slate-400">...</span>;
                                        return null;
                                    }
                                }
                                return (
                                    <Button
                                        key={i} variant={page === i + 1 ? "default" : "ghost"} size="sm"
                                        onClick={() => setPage(i + 1)}
                                        className={`h-8 w-8 p-0 rounded-lg ${page === i + 1 ? 'bg-blue-600 text-white font-bold shadow-sm shadow-blue-500/20' : 'text-slate-600 hover:bg-slate-100'}`}
                                    >
                                        {i + 1}
                                    </Button>
                                )
                            })}
                        </div>
                        <div className="sm:hidden flex items-center px-3 font-medium text-sm text-slate-700">
                            {page} / {totalPages}
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="gap-1 h-8 px-2 sm:px-3 rounded-lg border-slate-200">
                            <span className="hidden sm:inline">Next</span> <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Slide Panel for Bill Details */}
            <BillDetailsSheet billId={selectedBillId} onClose={() => setSelectedBillId(null)} />
        </div>
    );
}
