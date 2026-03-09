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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { Printer, Loader2, ArrowUpRight, ArrowDownLeft, Search, Filter, Layers, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { CorporateClient } from "@shared/schema";
import { ChallanOutPrint, type ChallanOutData } from "@/components/print/ChallanOutPrint";
import { ChallanDetailsSheet } from "./ChallanDetailsSheet";
import { cn } from "@/lib/utils";

interface ChallanHistoryTableProps {
    client: CorporateClient;
}

export function ChallanHistoryTable({ client }: ChallanHistoryTableProps) {
    const [page, setPage] = useState(1);
    const [limit] = useState(20);
    const [searchTerm, setSearchTerm] = useState("");
    const [typeFilter, setTypeFilter] = useState<"all" | "incoming" | "outgoing">("all");
    const [selectedChallan, setSelectedChallan] = useState<any | null>(null);

    // Print State
    const [printData, setPrintData] = useState<ChallanOutData | null>(null);
    const [isPrinting, setIsPrinting] = useState(false);

    // Fetch Challans
    const { data, isLoading } = useQuery({
        queryKey: ["corporate-challans", client.id, page, limit],
        queryFn: () => corporateApi.getCorporateClientChallans(client.id, page, limit),
    });

    // Handle Reprint
    const handleReprint = async (challan: any) => {
        setIsPrinting(true);
        try {
            if (challan.type === 'outgoing') {
                // Fetch details
                const jobs = await corporateApi.getChallanJobs(challan.id);

                const pData: ChallanOutData = {
                    id: challan.id,
                    date: new Date(challan.createdAt),
                    clientName: client.companyName,
                    clientAddress: client.address || "Address not available",
                    clientPhone: client.phone || client.contactPhone || undefined,
                    receiverName: challan.receiverName || "",
                    receiverPhone: challan.receiverPhone || "",
                    items: jobs.map((j: any) => ({
                        id: j.id,
                        jobNo: j.corporateJobNumber || j.id,
                        brand: j.device.split(' ')[0] || "Unknown",
                        model: j.device,
                        serial: j.tvSerialNumber || "",
                        problem: j.reportedDefect || "",
                        status: j.status
                    }))
                };
                setPrintData(pData);
                // Trigger print
                setTimeout(() => window.print(), 500);
            } else {
                alert("Reprinting Challan IN is not yet implemented in this view.");
            }
        } catch (error) {
            console.error("Failed to prepare reprint:", error);
        } finally {
            setIsPrinting(false);
        }
    };

    const handlePrintClick = (e: React.MouseEvent, challan: any) => {
        e.stopPropagation();
        handleReprint(challan);
    };

    const filteredItems = data?.items.filter(item => {
        const matchesSearch = item.challanNumber.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = typeFilter === 'all' || item.type === typeFilter;
        return matchesSearch && matchesType;
    }) || [];

    const totalPages = data?.pagination.pages || 1;

    return (
        <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200/60 shadow-sm overflow-hidden min-h-0 relative">
            <div className="hidden print:block">
                {printData && <ChallanOutPrint data={printData} />}
            </div>

            {/* Toolbar */}
            <div className="p-4 border-b flex flex-col sm:flex-row gap-4 justify-between items-start md:items-center bg-white z-10 w-full shrink-0">
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                            placeholder="Search Challan Number..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
                        <SelectTrigger className="w-[160px] h-9 rounded-xl border-slate-200 text-slate-600">
                            <Filter className="w-4 h-4 mr-2" />
                            <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="incoming">Incoming (IN)</SelectItem>
                            <SelectItem value="outgoing">Outgoing (OUT)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-auto custom-scrollbar relative bg-slate-50/30">
                <Table className="relative w-full">
                    <TableHeader className="bg-slate-50/80 text-xs uppercase text-slate-500 font-bold tracking-wider border-b sticky top-0 z-10 backdrop-blur-xl">
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="px-6 py-4">Date</TableHead>
                            <TableHead className="px-6 py-4">Challan No</TableHead>
                            <TableHead className="px-6 py-4">Type</TableHead>
                            <TableHead className="px-6 py-4">Items</TableHead>
                            <TableHead className="px-6 py-4">Receiver / By</TableHead>
                            <TableHead className="px-6 py-4 text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-slate-100/50">
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-48 text-center text-slate-400">
                                    <div className="flex flex-col items-center justify-center">
                                        <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
                                        <p>Loading challan history...</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : filteredItems.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-48 text-center text-slate-400">
                                    <div className="flex flex-col items-center justify-center">
                                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                            <Layers className="w-8 h-8 text-slate-300" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-800 mb-1">No challans found</h3>
                                        <p className="text-sm">We couldn't find any matching challans.</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredItems.map((challan) => (
                                <TableRow
                                    key={challan.id}
                                    className="hover:bg-blue-50/50 transition-colors cursor-pointer group"
                                    onClick={() => setSelectedChallan(challan)}
                                >
                                    <TableCell className="px-6 py-4 text-slate-600">
                                        {format(new Date(challan.createdAt), "dd MMM yyyy")}
                                    </TableCell>
                                    <TableCell className="px-6 py-4 font-mono font-medium text-slate-700">
                                        {challan.challanNumber}
                                    </TableCell>
                                    <TableCell className="px-6 py-4">
                                        <Badge variant="outline" className={cn(
                                            "uppercase text-[10px] tracking-wider font-semibold border",
                                            challan.type === "incoming"
                                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                        )}>
                                            {challan.type === "incoming" ? <ArrowDownLeft className="h-3 w-3 mr-1" /> : <ArrowUpRight className="h-3 w-3 mr-1" />}
                                            {challan.type === "incoming" ? "IN" : "OUT"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="px-6 py-4 text-slate-600">
                                        {challan.totalItems || 0}
                                    </TableCell>
                                    <TableCell className="px-6 py-4 text-slate-600">
                                        {challan.type === 'outgoing'
                                            ? (challan.receiverName || "-")
                                            : (challan.receivedBy || "-")}
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
                                                onClick={(e) => handlePrintClick(e, challan)}
                                                disabled={isPrinting || challan.type === 'incoming'}
                                            >
                                                {isPrinting && printData?.id === challan.id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Printer className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination Footer */}
            {totalPages > 0 && (
                <div className="flex items-center justify-between border-t border-slate-200 bg-white p-4 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]">
                    <span className="text-sm font-medium text-slate-500">
                        Showing {(page - 1) * limit + 1} to {Math.min(page * limit, data?.pagination.total || 0)} of {data?.pagination.total || 0} challans
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

            {/* Details Slide Panel */}
            <ChallanDetailsSheet
                challan={selectedChallan}
                client={client}
                onClose={() => setSelectedChallan(null)}
                onReprint={handleReprint}
                isPrinting={isPrinting}
            />
        </div>
    );
}
