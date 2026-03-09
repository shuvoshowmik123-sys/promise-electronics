import { useState } from "react";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Search, X, Download, TrendingDown, CheckCircle, XCircle, Loader2, AlertTriangle } from "lucide-react";
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
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [isProcessDialogOpen, setIsProcessDialogOpen] = useState(false);
    const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
    const [selectedRefund, setSelectedRefund] = useState<any>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [rejectionReason, setRejectionReason] = useState("");

    const refunds = refundsData?.items || [];

    // Stats
    const totalRefunded = refunds
        .filter((r: any) => r.status === 'processed')
        .reduce((sum: number, r: any) => sum + Number(r.amount), 0);

    const pendingCount = refunds.filter((r: any) => r.status === 'pending').length;
    const rejectedCount = refunds.filter((r: any) => r.status === 'rejected').length;

    // Filtering
    const filteredRefunds = refunds.filter((r: any) => {
        const matchesSearch = search === "" ||
            r.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
            r.reason?.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === "all" || r.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const handleProcessRefund = async () => {
        if (!selectedRefund) return;
        setIsProcessing(true);
        try {
            await refundsApi.processRefund(selectedRefund.id);
            queryClient.invalidateQueries({ queryKey: ['refunds'] });
            queryClient.invalidateQueries({ queryKey: ['petty-cash'] });
            toast.success('Refund processed successfully');
            setIsProcessDialogOpen(false);
            setSelectedRefund(null);
        } catch (error: any) {
            toast.error(error?.message || 'Failed to process refund');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRejectRefund = async () => {
        if (!selectedRefund || !rejectionReason) {
            toast.error('Please provide a rejection reason');
            return;
        }
        setIsProcessing(true);
        try {
            await refundsApi.rejectRefund(selectedRefund.id, rejectionReason);
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
        <div className="space-y-6">
            {/* Stats Row - Bento Style */}
            <motion.div
                className="grid grid-cols-1 md:grid-cols-3 gap-4"
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
                                <span className="text-sm opacity-80 uppercase tracking-wider block">Pending Review</span>
                                <div className="text-2xl font-bold mt-1">
                                    {pendingCount} Requests
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
            <div className="flex flex-col sm:flex-row items-center gap-4 bg-white p-4 rounded-3xl border border-slate-200/60 shadow-sm">
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
                                { key: 'amount', label: 'Amount' },
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

            {/* Table - Bento Style */}
            <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6">
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
                                                -{getCurrencySymbol()}{Number(refund.amount).toLocaleString()}
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
                                                        onClick={() => {
                                                            setSelectedRefund(refund);
                                                            setIsProcessDialogOpen(true);
                                                        }}
                                                    >
                                                        <CheckCircle className="h-4 w-4 mr-1" />
                                                        Process
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
                                    {getCurrencySymbol()}{Number(selectedRefund.amount).toLocaleString()}
                                </p>
                            </div>
                            <div className="bg-slate-50 p-3 rounded-md space-y-1">
                                <p className="text-xs text-muted-foreground">Reason</p>
                                <p className="text-sm">{selectedRefund.reason}</p>
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
                                <p className="font-bold text-lg">{getCurrencySymbol()}{Number(selectedRefund.amount).toLocaleString()}</p>
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
