import { useState } from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Search, X, Download, TrendingDown, CheckCircle, XCircle, Loader2, AlertTriangle, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { BentoCard, containerVariants, itemVariants } from "../shared";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

interface RefundsTabProps {
    refundsData: any;
    isLoading: boolean;
    getCurrencySymbol: () => string;
    refundsApi: any;
    queryClient: any;
}

export function RefundsTab({
    refundsData,
    isLoading,
    getCurrencySymbol,
    refundsApi,
    queryClient
}: RefundsTabProps) {
    const { user } = useAdminAuth();
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [isProcessDialogOpen, setIsProcessDialogOpen] = useState(false);
    const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
    const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
    const [selectedRefund, setSelectedRefund] = useState<any>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [rejectionReason, setRejectionReason] = useState("");
    const [refundMethod, setRefundMethod] = useState("cash");

    const refunds = refundsData?.items || [];

    // After a refund is processed it writes a petty-cash Expense + adjusts the
    // active drawer. Invalidate every dependent cache so balances refresh live.
    const invalidateFinanceCaches = () => {
        ['refunds', 'pettyCash', 'pettyCash-paginated', 'pettyCash-summary-today',
         'petty-cash-summary-global', 'drawerHistory', 'drawer-active']
            .forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));
    };

    // Stats
    const totalRefunded = refunds
        .filter((r: any) => r.status === 'processed')
        .reduce((sum: number, r: any) => sum + Number(r.refundAmount), 0);

    const pendingCount = refunds.filter((r: any) => r.status === 'pending').length;
    const approvedCount = refunds.filter((r: any) => r.status === 'approved').length;
    const rejectedCount = refunds.filter((r: any) => r.status === 'rejected').length;

    // Filtering
    const filteredRefunds = refunds.filter((r: any) => {
        const matchesSearch = search === "" ||
            r.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
            r.reason?.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === "all" || r.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    // Step 1 of the approval workflow: approve a pending refund.
    const handleApproveRefund = async (refund: any) => {
        if (!user) return;
        setIsProcessing(true);
        try {
            await refundsApi.approve(refund.id, {
                approvedBy: user.id,
                approvedByName: user.name,
                approvedByRole: user.role,
            });
            queryClient.invalidateQueries({ queryKey: ['refunds'] });
            toast.success('Refund approved — ready to process');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to approve refund');
        } finally {
            setIsProcessing(false);
        }
    };

    // Step 2: process an approved refund (creates the petty-cash Expense).
    const handleProcessRefund = async () => {
        if (!selectedRefund || !user) return;
        setIsProcessing(true);
        try {
            await refundsApi.process(selectedRefund.id, {
                processedBy: user.id,
                processedByName: user.name,
                processedByRole: user.role,
                refundMethod,
            });
            invalidateFinanceCaches();
            toast.success('Refund processed successfully');
            setIsProcessDialogOpen(false);
            setSelectedRefund(null);
            setRefundMethod('cash');
        } catch (error: any) {
            toast.error(error?.message || 'Failed to process refund');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRejectRefund = async () => {
        if (!selectedRefund || !user) return;
        if (!rejectionReason) {
            toast.error('Please provide a rejection reason');
            return;
        }
        setIsProcessing(true);
        try {
            await refundsApi.reject(selectedRefund.id, {
                approvedBy: user.id,
                approvedByName: user.name,
                approvedByRole: user.role,
                rejectionReason,
            });
            queryClient.invalidateQueries({ queryKey: ['refunds'] });
            toast.success('Refund rejected');
            setIsRejectDialogOpen(false);
            setSelectedRefund(null);
            setRejectionReason("");
        } catch (error: any) {
            toast.error(error?.message || 'Failed to reject refund');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="space-y-2 md:space-y-6 pb-4 md:pb-0">
            {/* Stats Row - Bento Style */}
            <motion.div
                className="hidden grid-cols-1 md:grid md:grid-cols-3 gap-4"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                <motion.div variants={itemVariants}>
                    <BentoCard className="h-[120px] bg-gradient-to-br from-orange-500 to-amber-600" variant="vibrant">
                        <div className="flex items-center gap-4 h-full text-white">
                            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
                                <TrendingDown className="h-6 w-6" />
                            </div>
                            <div>
                                <span className="text-sm opacity-80 uppercase tracking-wider block">Total Refunded</span>
                                <div className="text-2xl font-bold mt-1">
                                    {getCurrencySymbol()}{totalRefunded.toLocaleString()}
                                </div>
                            </div>
                        </div>
                    </BentoCard>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <BentoCard className="h-[120px] bg-gradient-to-br from-amber-500 to-yellow-600" variant="vibrant">
                        <div className="flex items-center gap-4 h-full text-white">
                            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
                                <AlertTriangle className="h-6 w-6" />
                            </div>
                            <div>
                                <span className="text-sm opacity-80 uppercase tracking-wider block">Pending / Approved</span>
                                <div className="text-2xl font-bold mt-1">
                                    {pendingCount} / {approvedCount}
                                </div>
                            </div>
                        </div>
                    </BentoCard>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <BentoCard className="h-[120px] bg-gradient-to-br from-red-500 to-rose-600" variant="vibrant">
                        <div className="flex items-center gap-4 h-full text-white">
                            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
                                <XCircle className="h-6 w-6" />
                            </div>
                            <div>
                                <span className="text-sm opacity-80 uppercase tracking-wider block">Rejected</span>
                                <div className="text-2xl font-bold mt-1">
                                    {rejectedCount} Requests
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
                        placeholder="Search refunds..."
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
                        <DialogTitle>Filter refunds</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger><SelectValue placeholder="All Status" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="approved">Approved</SelectItem>
                                <SelectItem value="processed">Processed</SelectItem>
                                <SelectItem value="rejected">Rejected</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button variant="outline" onClick={() => { setSearch(""); setStatusFilter("all"); }} className="w-full">
                            Clear filters
                        </Button>
                        <Button onClick={() => setIsFilterDialogOpen(false)} className="w-full">Apply</Button>
                    </div>
                </DialogContent>
            </Dialog>
            <div className="hidden flex-col sm:flex-row items-center gap-4 bg-white p-4 rounded-3xl border border-slate-200/60 shadow-sm md:flex">
                <div className="relative flex-1 w-full max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by invoice or reason..."
                        className="pl-9"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="All Status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Status</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="processed">Processed</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                        </SelectContent>
                    </Select>
                    {(search || statusFilter !== "all") && (
                        <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
                            <X className="w-4 h-4" />
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            const columns = [
                                { key: 'invoiceNumber', label: 'Invoice' },
                                { key: 'refundAmount', label: 'Amount' },
                                { key: 'reason', label: 'Reason' },
                                { key: 'status', label: 'Status' },
                                { key: 'createdAt', label: 'Date' },
                            ];
                            const csv = [
                                columns.map(c => c.label).join(','),
                                ...filteredRefunds.map((r: any) =>
                                    columns.map(c => r[c.key] || '').join(',')
                                )
                            ].join('\n');
                            const blob = new Blob([csv], { type: 'text/csv' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'refunds_report.csv';
                            a.click();
                        }}
                    >
                        <Download className="w-4 h-4 mr-1" />
                        Export
                    </Button>
                </div>
            </div>

            <div className="space-y-2 pb-4 md:hidden">
                {isLoading ? (
                    <div className="rounded-xl border bg-white p-4 text-center text-sm text-muted-foreground">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </div>
                ) : filteredRefunds.length === 0 ? (
                    <div className="rounded-xl border bg-white p-4 text-center text-sm text-muted-foreground">No refunds found</div>
                ) : filteredRefunds.map((refund: any) => (
                    <div key={refund.id} className="scroll-mb-[calc(8rem+env(safe-area-inset-bottom))] rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <div className="truncate font-mono text-xs font-black text-slate-800">{refund.invoiceNumber}</div>
                                <div className="truncate text-xs text-slate-500">{refund.reason}</div>
                            </div>
                            <div className="text-right">
                                <div className="text-base font-black text-red-600">-{getCurrencySymbol()}{Number(refund.refundAmount).toLocaleString()}</div>
                                <div className="text-[10px] text-slate-500">{refund.createdAt ? format(new Date(refund.createdAt), 'MMM d') : 'No date'}</div>
                            </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                            <Badge variant={refund.status === "processed" ? "default" : refund.status === "rejected" ? "destructive" : "secondary"}>{refund.status}</Badge>
                            {refund.status === 'pending' && (
                                <div className="flex gap-1.5">
                                    <Button size="sm" className="h-7 scroll-mb-[calc(8rem+env(safe-area-inset-bottom))] rounded-lg px-2" disabled={isProcessing} onClick={() => handleApproveRefund(refund)}>Approve</Button>
                                    <Button size="sm" variant="outline" className="h-7 scroll-mb-[calc(8rem+env(safe-area-inset-bottom))] rounded-lg px-2" onClick={() => { setSelectedRefund(refund); setIsRejectDialogOpen(true); }}>Reject</Button>
                                </div>
                            )}
                            {refund.status === 'approved' && (
                                <Button size="sm" className="h-7 scroll-mb-[calc(8rem+env(safe-area-inset-bottom))] rounded-lg bg-emerald-600 px-2 hover:bg-emerald-700" onClick={() => { setSelectedRefund(refund); setRefundMethod('cash'); setIsProcessDialogOpen(true); }}>Process</Button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Table - Bento Style */}
            <div className="hidden bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 md:block">
                <div className="overflow-auto">
                    <Table>
                        <TableHeader className="sticky top-0 bg-slate-50">
                            <TableRow className="border-b border-slate-200">
                                <TableHead className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Invoice</TableHead>
                                <TableHead className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Date</TableHead>
                                <TableHead className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Reason</TableHead>
                                <TableHead className="text-right py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Amount</TableHead>
                                <TableHead className="text-left py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Status</TableHead>
                                <TableHead className="text-right py-3 px-4 text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8">
                                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                                        <p className="mt-2 text-sm text-muted-foreground">Loading refunds...</p>
                                    </TableCell>
                                </TableRow>
                            ) : filteredRefunds.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8">
                                        <TrendingDown className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                                        <p className="text-sm text-muted-foreground">
                                            {refunds.length === 0 ? "No refund requests yet" : "No refunds match your search"}
                                        </p>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredRefunds.map((refund: any) => (
                                    <TableRow key={refund.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                                        <TableCell className="py-4 px-4">
                                            <span className="font-mono text-sm text-slate-700">{refund.invoiceNumber}</span>
                                        </TableCell>
                                        <TableCell className="py-4 px-4">
                                            <span className="text-sm text-slate-600">
                                                {refund.createdAt ? format(new Date(refund.createdAt), 'yyyy-MM-dd') : 'N/A'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-4 px-4">
                                            <div className="max-w-xs truncate text-slate-900">{refund.reason}</div>
                                        </TableCell>
                                        <TableCell className="py-4 px-4 text-right">
                                            <span className="font-bold text-red-600">
                                                -{getCurrencySymbol()}{Number(refund.refundAmount).toLocaleString()}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-4 px-4">
                                            <Badge
                                                variant={
                                                    refund.status === "processed" ? "default" :
                                                        refund.status === "rejected" ? "destructive" : "secondary"
                                                }
                                            >
                                                {refund.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="py-4 px-4 text-right">
                                            {refund.status === 'pending' && (
                                                <div className="flex gap-2 justify-end">
                                                    <Button
                                                        variant="default"
                                                        size="sm"
                                                        disabled={isProcessing}
                                                        onClick={() => handleApproveRefund(refund)}
                                                    >
                                                        <CheckCircle className="h-4 w-4 mr-1" />
                                                        Approve
                                                    </Button>
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        onClick={() => {
                                                            setSelectedRefund(refund);
                                                            setIsRejectDialogOpen(true);
                                                        }}
                                                    >
                                                        <XCircle className="h-4 w-4 mr-1" />
                                                        Reject
                                                    </Button>
                                                </div>
                                            )}
                                            {refund.status === 'approved' && (
                                                <div className="flex gap-2 justify-end">
                                                    <Button
                                                        variant="default"
                                                        size="sm"
                                                        className="bg-emerald-600 hover:bg-emerald-700"
                                                        onClick={() => {
                                                            setSelectedRefund(refund);
                                                            setRefundMethod('cash');
                                                            setIsProcessDialogOpen(true);
                                                        }}
                                                    >
                                                        <CheckCircle className="h-4 w-4 mr-1" />
                                                        Process
                                                    </Button>
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Process Refund Dialog */}
            <Dialog open={isProcessDialogOpen} onOpenChange={setIsProcessDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Process Refund</DialogTitle>
                        <DialogDescription>
                            Confirm that you want to process this refund. This will add an expense entry to Petty Cash.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedRefund && (
                        <div className="space-y-4">
                            <div className="bg-slate-50 p-3 rounded-md space-y-1">
                                <p className="text-xs text-muted-foreground">Invoice Number</p>
                                <p className="font-mono font-medium">{selectedRefund.invoiceNumber}</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-md space-y-1">
                                <p className="text-xs text-muted-foreground">Refund Amount</p>
                                <p className="text-2xl font-bold text-red-600">
                                    {getCurrencySymbol()}{Number(selectedRefund.refundAmount).toLocaleString()}
                                </p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-md space-y-1">
                                <p className="text-xs text-muted-foreground">Reason</p>
                                <p className="text-sm">{selectedRefund.reason}</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="refundMethod">Refund Method</Label>
                                <Select value={refundMethod} onValueChange={setRefundMethod}>
                                    <SelectTrigger id="refundMethod">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="cash">Cash (from drawer)</SelectItem>
                                        <SelectItem value="bank">Bank</SelectItem>
                                        <SelectItem value="bkash">bKash</SelectItem>
                                        <SelectItem value="nagad">Nagad</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    Cash refunds require an open drawer with enough balance.
                                </p>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsProcessDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleProcessRefund} disabled={isProcessing}>
                            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Process Refund
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reject Refund Dialog */}
            <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reject Refund</DialogTitle>
                        <DialogDescription>
                            Please provide a reason for rejecting this refund request.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedRefund && (
                        <div className="space-y-4">
                            <div className="bg-slate-50 p-3 rounded-md space-y-1">
                                <p className="text-xs text-muted-foreground">Invoice Number</p>
                                <p className="font-mono font-medium">{selectedRefund.invoiceNumber}</p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-md space-y-1">
                                <p className="text-xs text-muted-foreground">Amount</p>
                                <p className="font-bold text-lg">{getCurrencySymbol()}{Number(selectedRefund.refundAmount).toLocaleString()}</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="rejectionReason">Rejection Reason</Label>
                                <Textarea
                                    id="rejectionReason"
                                    placeholder="Explain why this refund is being rejected..."
                                    value={rejectionReason}
                                    onChange={(e) => setRejectionReason(e.target.value)}
                                    rows={4}
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleRejectRefund}
                            disabled={isProcessing || !rejectionReason}
                        >
                            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Reject Refund
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
