import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
    ShoppingCart, DollarSign, CreditCard,
    TrendingUp, Clock, Receipt,
    ArrowUpRight, Zap, BarChart3, ShieldCheck,
    MoreVertical, FileWarning, Ban, Printer, Eye, Package
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useLocation } from "wouter";

import { adminOrdersApi, jobTicketsApi, drawerApi } from "@/lib/api";
import { type JobTicket, type DrawerSession } from "@shared/schema";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { BentoCard, containerVariants, itemVariants, tableRowVariants } from "../shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-BD', {
        style: 'currency',
        currency: 'BDT',
        minimumFractionDigits: 0
    }).format(amount);
};

function PaymentBreakdown({ jobs }: { jobs: JobTicket[] }) {
    // We will organize by billingStatus or paymentStatus
    const paid = jobs.filter(j => j.paymentStatus === 'paid').reduce((acc, j) => acc + (j.paidAmount || 0), 0);
    const partial = jobs.filter(j => j.paymentStatus === 'partial').reduce((acc, j) => acc + (j.paidAmount || 0), 0);
    const unpaid = jobs.filter(j => j.paymentStatus === 'unpaid').reduce((acc, j) => acc + (j.estimatedCost || 0), 0);

    const total = paid + partial + unpaid || 1; // Prevent division by zero

    const segments = [
        { label: "Paid", value: paid, color: "bg-emerald-500", pct: Math.round((paid / total) * 100) },
        { label: "Partial", value: partial, color: "bg-blue-500", pct: Math.round((partial / total) * 100) },
        { label: "Unpaid", value: unpaid, color: "bg-rose-500", pct: Math.round((unpaid / total) * 100) },
    ];
    return (
        <div className="space-y-3">
            <div className="h-3 rounded-full overflow-hidden flex gap-0.5">
                {segments.map(s => (
                    <motion.div key={s.label} className={cn("h-full rounded-full", s.color)}
                        initial={{ width: 0 }} animate={{ width: `${s.pct}%` }}
                        transition={{ duration: 0.8, delay: 0.3 }}
                    />
                ))}
            </div>
            <div className="flex items-center justify-between">
                {segments.map(s => (
                    <div key={s.label} className="flex items-center gap-1.5 text-xs">
                        <div className={cn("w-2.5 h-2.5 rounded-full", s.color)} />
                        <span className="text-slate-500">{s.label}</span>
                        <span className="font-bold text-slate-700">{s.pct}%</span>
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
                {segments.map(s => (
                    <div key={s.label} className="text-center p-2 rounded-xl bg-slate-50 border border-slate-100">
                        <div className="text-sm font-black text-slate-800">৳{(s.value / 1000).toFixed(1)}K</div>
                        <div className="text-[10px] text-slate-400 font-semibold">{s.label}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function CashierTab() {
    const [location, navigate] = useLocation();
    const { user } = useAdminAuth();
    const queryClient = useQueryClient();
    const [activeFilter, setActiveFilter] = useState("all");

    // Blind Drop state
    const [blindDropOpen, setBlindDropOpen] = useState(false);
    const [blindDropStep, setBlindDropStep] = useState<1 | 2>(1);
    const [countedCash, setCountedCash] = useState("");
    const [discrepancyReason, setDiscrepancyReason] = useState("");
    const [dropResult, setDropResult] = useState<DrawerSession | null>(null);

    // Fetch jobs ready for billing
    const { data: readyJobs = [], isLoading } = useQuery({
        queryKey: ["cashier-jobs"],
        queryFn: jobTicketsApi.getReadyForBilling,
        refetchInterval: 10000 // Refresh every 10s
    });

    // Fetch active drawer session for Blind Drop
    const { data: activeDrawer } = useQuery({
        queryKey: ["drawer-active"],
        queryFn: drawerApi.getActive,
        refetchInterval: 30000,
    });

    const filteredJobs = activeFilter === "all"
        ? readyJobs
        : readyJobs.filter((job) => {
            if (activeFilter === "paid") return job.paymentStatus === "paid";
            if (activeFilter === "unpaid") return job.paymentStatus === "unpaid";
            if (activeFilter === "partial") return job.paymentStatus === "partial";
            return true;
        });

    const generateInvoiceMutation = useMutation({
        mutationFn: (jobId: string) => jobTicketsApi.generateInvoice(jobId),
        onSuccess: (data) => {
            toast.success("Invoice generated successfully");
            queryClient.invalidateQueries({ queryKey: ["cashier-jobs"] });
        },
        onError: (error: any) => {
            toast.error(error.message || "Failed to generate invoice");
        }
    });

    const [selectedJob, setSelectedJob] = useState<JobTicket | null>(null);
    const [markIncompleteOpen, setMarkIncompleteOpen] = useState(false);
    const [writeOffOpen, setWriteOffOpen] = useState(false);
    const [exceptionReason, setExceptionReason] = useState("");

    const markIncompleteMutation = useMutation({
        mutationFn: ({ id, reason }: { id: string, reason: string }) => jobTicketsApi.markIncomplete(id, reason),
        onSuccess: () => {
            toast.success("Job marked as payment incomplete");
            queryClient.invalidateQueries({ queryKey: ["cashier-jobs"] });
            setMarkIncompleteOpen(false);
            setExceptionReason("");
            setSelectedJob(null);
        },
        onError: (error: any) => toast.error(error.message)
    });

    const writeOffMutation = useMutation({
        mutationFn: ({ id, reason }: { id: string, reason: string }) => jobTicketsApi.writeOff(id, reason),
        onSuccess: () => {
            toast.success("Job written off successfully");
            queryClient.invalidateQueries({ queryKey: ["cashier-jobs"] });
            setWriteOffOpen(false);
            setExceptionReason("");
            setSelectedJob(null);
        },
        onError: (error: any) => toast.error(error.message)
    });

    // Blind Drop mutation — sends declaredCash to server, gets back expected + discrepancy
    const blindDropMutation = useMutation({
        mutationFn: (declaredCash: number) => {
            if (!activeDrawer?.id) throw new Error("No active drawer session found. Please open a drawer first.");
            return drawerApi.drop(activeDrawer.id, declaredCash);
        },
        onSuccess: (data) => {
            setDropResult(data);
            setBlindDropStep(2);
        },
        onError: (error: any) => toast.error(error.message || "Failed to process blind drop"),
    });

    // Reconcile (close) mutation — officially closes the shift
    const reconcileMutation = useMutation({
        mutationFn: (notes?: string) => {
            if (!activeDrawer?.id) throw new Error("No active drawer session.");
            return drawerApi.reconcile(activeDrawer.id, {
                status: "reconciled",
                notes,
                closedBy: user?.id ?? "",
                closedByName: user?.name ?? "Unknown",
            });
        },
        onSuccess: () => {
            toast.success("Shift closed and reconciled successfully!");
            queryClient.invalidateQueries({ queryKey: ["drawer-active"] });
            queryClient.invalidateQueries({ queryKey: ["cashier-jobs"] });
            setBlindDropOpen(false);
            setBlindDropStep(1);
            setCountedCash("");
            setDiscrepancyReason("");
            setDropResult(null);
        },
        onError: (error: any) => toast.error(error.message || "Failed to close shift"),
    });

    const handleProceedToPayment = (job: JobTicket) => {
        navigate('/admin/pos', {
            state: {
                linkedJobId: job.id,
                customerName: job.customer,
                customerPhone: job.customerPhone,
                prefilledAmount: job.remainingAmount || job.estimatedCost,
                description: `Repair: ${job.device} (${job.issue})`
            }
        });
    };

    const handlePrintInvoice = (jobId: string) => {
        generateInvoiceMutation.mutate(jobId);
    };

    // Calculate Dashboard KPIs
    const totalDue = readyJobs.reduce((acc, job) => acc + (job.remainingAmount ?? job.estimatedCost ?? 0), 0);
    const totalJobs = readyJobs.length;
    const pendingInvoices = readyJobs.filter(j => j.billingStatus === 'pending').length;
    const unpaidJobsCount = readyJobs.filter(j => j.paymentStatus === 'unpaid' || j.paymentStatus === 'partial').length;

    return (
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-2xl font-bold tracking-tight text-slate-800">Cashier Dashboard</h2>
                        <span className="flex items-center gap-1 bg-emerald-50 text-emerald-600 text-[10px] font-black px-2 py-1 rounded-full border border-emerald-100 uppercase tracking-widest">
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> Live Queue
                        </span>
                    </div>
                    <p className="text-sm text-slate-500">Manage billings and generate invoices for completed jobs</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" className="rounded-xl h-10 gap-2 text-sm font-bold border-slate-200" onClick={() => queryClient.invalidateQueries({ queryKey: ["cashier-jobs"] })}>
                        <Receipt className="w-4 h-4" /> Refresh List
                    </Button>
                    <Button
                        className="rounded-xl h-10 gap-2 bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20 shadow-lg text-sm font-bold"
                        onClick={() => { setBlindDropOpen(true); setBlindDropStep(1); setCountedCash(""); setDiscrepancyReason(""); setDropResult(null); }}
                        disabled={!activeDrawer}
                        title={!activeDrawer ? "No active drawer session — open a drawer first" : "Close shift with blind count"}
                    >
                        <ShieldCheck className="w-4 h-4" /> End Shift
                    </Button>
                </div>
            </motion.div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: "Total Receivables", value: formatCurrency(totalDue), sub: `${unpaidJobsCount} await payment`, from: "from-blue-500", to: "to-indigo-600", shadow: "shadow-blue-500/30", icon: ShoppingCart },
                    { label: "Total Jobs", value: totalJobs, sub: "Ready for billing", from: "from-emerald-500", to: "to-teal-600", shadow: "shadow-emerald-500/30", icon: DollarSign },
                    { label: "Pending Invoices", value: pendingInvoices, sub: "Action required", from: "from-violet-500", to: "to-purple-600", shadow: "shadow-violet-500/30", icon: CreditCard },
                    { label: "Unpaid Jobs", value: unpaidJobsCount, sub: "Partial or completely unpaid", from: "from-amber-500", to: "to-orange-600", shadow: "shadow-amber-500/30", icon: TrendingUp },
                ].map(({ label, value, sub, from, to, shadow, icon: Icon }) => (
                    <motion.div key={label} variants={itemVariants}>
                        <BentoCard variant="vibrant" className={`bg-gradient-to-br ${from} ${to} ${shadow} h-[130px]`}>
                            <div className="flex flex-col justify-between h-full text-white">
                                <div className="flex items-center justify-between">
                                    <span className="text-white/70 text-xs font-semibold uppercase tracking-widest">{label}</span>
                                    <Icon className="w-4 h-4 text-white/60" />
                                </div>
                                <div>
                                    <div className="text-2xl font-black">{value}</div>
                                    <p className="text-white/70 text-[11px] mt-0.5">{sub}</p>
                                </div>
                            </div>
                        </BentoCard>
                    </motion.div>
                ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-5">
                <motion.div variants={itemVariants} className="lg:col-span-3">
                    <BentoCard variant="ghost" className="bg-white border-slate-200 shadow-sm rounded-[1.5rem] p-0 overflow-hidden h-full" disableHover>
                        <div className="p-4 sm:p-5 border-b border-slate-50">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-blue-500" />
                                    <h3 className="font-bold text-slate-700 text-sm">Billing Queue</h3>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {["all", "unpaid", "partial", "paid"].map(f => (
                                    <button key={f} onClick={() => setActiveFilter(f)}
                                        className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all capitalize",
                                            activeFilter === f ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                                        )}>{f}</button>
                                ))}
                            </div>
                        </div>
                        <ScrollArea className="h-[320px]">
                            {isLoading ? (
                                <div className="p-8 text-center text-sm text-muted-foreground animate-pulse">Loading jobs...</div>
                            ) : filteredJobs.length === 0 ? (
                                <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center">
                                    <Receipt className="h-8 w-8 text-slate-300 mb-2" />
                                    No jobs match the current filter.
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-50">
                                    <AnimatePresence>
                                        {filteredJobs.map((job, i) => (
                                            <motion.div key={job.id} variants={tableRowVariants} initial="hidden" animate="visible" exit={{ opacity: 0, x: -10 }} custom={i}
                                                className="flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-5 py-3.5 hover:bg-slate-50/60 transition-colors group gap-3">
                                                <div className="flex items-center gap-3">
                                                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
                                                        job.paymentStatus === "paid" ? "bg-emerald-50 text-emerald-500" :
                                                            job.paymentStatus === "partial" ? "bg-amber-50 text-amber-500" : "bg-rose-50 text-rose-500")}>
                                                        <Receipt className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-sm font-bold text-slate-800">{job.id}</p>
                                                            <Badge variant="outline" className={cn("text-[9px] h-4 tracking-wider uppercase",
                                                                job.paymentStatus === 'paid' ? "text-emerald-600 border-emerald-200 bg-emerald-50" :
                                                                    job.paymentStatus === 'partial' ? "text-amber-600 border-amber-200 bg-amber-50" : "text-rose-600 border-rose-200 bg-rose-50"
                                                            )}>
                                                                {job.paymentStatus}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-xs text-slate-500 truncate max-w-[200px]">{job.customer}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                                                    <div className="text-right mr-2 hidden sm:block">
                                                        <p className="font-black text-sm text-slate-800">
                                                            {formatCurrency(job.remainingAmount ?? job.estimatedCost ?? 0)}
                                                        </p>
                                                        {job.paymentStatus === 'partial' && (
                                                            <p className="text-[10px] text-slate-500 font-medium">remaining</p>
                                                        )}
                                                    </div>

                                                    {/* Actions Dropdown */}
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-600">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-48">
                                                            <DropdownMenuLabel className="text-xs font-semibold text-slate-500 uppercase">Actions</DropdownMenuLabel>
                                                            {job.paymentStatus === 'paid' ? (
                                                                <DropdownMenuItem onClick={() => handlePrintInvoice(job.id)}>
                                                                    <Printer className="mr-2 h-4 w-4" /> Generate Invoice
                                                                </DropdownMenuItem>
                                                            ) : (
                                                                <DropdownMenuItem onClick={() => handleProceedToPayment(job)}>
                                                                    <Eye className="mr-2 h-4 w-4" /> View & Pay
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem onClick={() => { setSelectedJob(job); setMarkIncompleteOpen(true); }} className="text-amber-600">
                                                                <FileWarning className="mr-2 h-4 w-4" /> Mark Incomplete
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => { setSelectedJob(job); setWriteOffOpen(true); }} className="text-rose-600">
                                                                <Ban className="mr-2 h-4 w-4" /> Write-off (Bad Debt)
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            )}
                        </ScrollArea>
                    </BentoCard>
                </motion.div>

                <motion.div variants={itemVariants} className="lg:col-span-2 flex flex-col gap-5">
                    <BentoCard variant="glass" className="border-slate-200/60 bg-white" disableHover>
                        <div className="flex items-center gap-2 mb-5">
                            <BarChart3 className="w-4 h-4 text-violet-500" />
                            <h3 className="font-bold text-slate-700 text-sm">Payment Status Layout</h3>
                        </div>
                        {readyJobs && <PaymentBreakdown jobs={readyJobs} />}
                    </BentoCard>
                    <BentoCard variant="ghost" className="bg-white border-slate-200 shadow-sm" disableHover>
                        <h3 className="font-bold text-slate-700 text-sm mb-4 flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-500" /> Quick Actions
                        </h3>
                        <div className="grid grid-cols-2 gap-2.5">
                            {[
                                { label: "New Sale", icon: ShoppingCart, onClick: () => navigate('/admin/pos'), cls: "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20 shadow-sm" },
                                { label: "Return", icon: TrendingUp, onClick: () => { }, cls: "bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200" },
                                { label: "Inventory", icon: Package, onClick: () => window.location.hash = "#inventory", cls: "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200" },
                                { label: "Print Receipt", icon: Receipt, onClick: () => { }, cls: "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200" },
                            ].map(({ label, icon: Icon, onClick, cls }) => (
                                <Button key={label} onClick={onClick} className={cn("h-11 rounded-2xl text-xs font-bold flex-col gap-1", cls)}>
                                    <Icon className="w-4 h-4" /> {label}
                                </Button>
                            ))}
                        </div>
                    </BentoCard>
                </motion.div>
            </div>

            {/* Exceptions Modals */}
            <Dialog open={markIncompleteOpen} onOpenChange={setMarkIncompleteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Mark Payment Incomplete</DialogTitle>
                        <DialogDescription>
                            Flag job <strong className="text-slate-900">{selectedJob?.id}</strong> as having incomplete payment issues. This highlights it for review but does not close the bill.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-4">
                        <Label>Reason / Notes</Label>
                        <Textarea
                            placeholder="Enter details about why payment is incomplete..."
                            value={exceptionReason}
                            onChange={(e) => setExceptionReason(e.target.value)}
                            className="bg-white"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setMarkIncompleteOpen(false)}>Cancel</Button>
                        <Button
                            variant="default"
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                            onClick={() => {
                                if (selectedJob) markIncompleteMutation.mutate({ id: selectedJob.id, reason: exceptionReason });
                            }}
                            disabled={!exceptionReason.trim() || markIncompleteMutation.isPending}
                        >
                            {markIncompleteMutation.isPending ? "Processing..." : "Confirm Status"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={writeOffOpen} onOpenChange={setWriteOffOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Write Off Job (Bad Debt)</DialogTitle>
                        <DialogDescription className="text-red-600">
                            Warning: This action is irreversible. The remaining balance for <strong className="font-bold">{selectedJob?.id}</strong> will be written off and the job closed completely.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-4">
                        <Label>Reason for Write Off</Label>
                        <Textarea
                            placeholder="Enter strict reason for writing off this debt..."
                            value={exceptionReason}
                            onChange={(e) => setExceptionReason(e.target.value)}
                            className="bg-white"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setWriteOffOpen(false)}>Cancel</Button>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                if (selectedJob) writeOffMutation.mutate({ id: selectedJob.id, reason: exceptionReason });
                            }}
                            disabled={!exceptionReason.trim() || writeOffMutation.isPending}
                        >
                            {writeOffMutation.isPending ? "Processing..." : "Confirm Write Off"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ════════════════════════════════════════════
                BLIND DROP DIALOG — End of Shift Cash Count
                ════════════════════════════════════════════ */}
            <Dialog open={blindDropOpen} onOpenChange={(open) => { if (!blindDropMutation.isPending && !reconcileMutation.isPending) setBlindDropOpen(open); }}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-rose-500" />
                            {blindDropStep === 1 ? "End of Shift — Blind Count" : "Shift Reconciliation"}
                        </DialogTitle>
                        <DialogDescription>
                            {blindDropStep === 1
                                ? "Count your physical cash and enter the total below. Do not check the system first."
                                : "Compare your count with system records to close the shift."}
                        </DialogDescription>
                    </DialogHeader>

                    {blindDropStep === 1 ? (
                        <div className="space-y-4 py-2">
                            <div className="bg-slate-50 rounded-2xl p-5 text-center border border-slate-100">
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3">Cash You Have Counted</p>
                                <div className="flex items-center justify-center gap-2">
                                    <span className="text-3xl font-black text-slate-400">৳</span>
                                    <Input
                                        type="number"
                                        placeholder="0"
                                        value={countedCash}
                                        onChange={e => setCountedCash(e.target.value)}
                                        className="text-3xl font-black text-slate-800 border-0 bg-transparent p-0 focus-visible:ring-0 w-40 text-center"
                                        autoFocus
                                        min="0"
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="ghost" onClick={() => setBlindDropOpen(false)}>Cancel</Button>
                                <Button
                                    className="bg-rose-500 hover:bg-rose-600 text-white"
                                    disabled={!countedCash || Number(countedCash) < 0 || blindDropMutation.isPending}
                                    onClick={() => blindDropMutation.mutate(Number(countedCash))}
                                >
                                    {blindDropMutation.isPending ? "Calculating..." : "Reveal Expected →"}
                                </Button>
                            </DialogFooter>
                        </div>
                    ) : dropResult ? (
                        <div className="space-y-4 py-2">
                            {(() => {
                                const counted = dropResult.declaredCash ?? 0;
                                const expected = dropResult.expectedCash ?? 0;
                                const diff = counted - expected;
                                const isMatch = Math.abs(diff) < 1;
                                const isShortage = diff < -1;
                                return (
                                    <>
                                        <div className={`rounded-2xl p-4 border ${isMatch ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'
                                            }`}>
                                            <div className="grid grid-cols-2 gap-4 text-center">
                                                <div>
                                                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">You Counted</p>
                                                    <p className="text-2xl font-black text-slate-800">৳{counted.toLocaleString()}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">System Expected</p>
                                                    <p className="text-2xl font-black text-slate-800">৳{expected.toLocaleString()}</p>
                                                </div>
                                            </div>
                                            <div className={`mt-3 pt-3 border-t text-center text-sm font-black ${isMatch ? 'text-emerald-700 border-emerald-100' :
                                                    isShortage ? 'text-rose-700 border-rose-100' : 'text-amber-700 border-amber-100'
                                                }`}>
                                                {isMatch
                                                    ? "✅ Cash balanced — no discrepancy!"
                                                    : isShortage
                                                        ? `🔴 Shortage: ৳${Math.abs(diff).toLocaleString()} missing`
                                                        : `🟡 Surplus: ৳${Math.abs(diff).toLocaleString()} extra`}
                                            </div>
                                        </div>

                                        {!isMatch && (
                                            <div className="space-y-1.5">
                                                <Label className="text-xs font-bold text-slate-700">
                                                    Reason for discrepancy <span className="text-rose-500">*</span>
                                                </Label>
                                                <Textarea
                                                    placeholder={isShortage
                                                        ? "e.g., gave change for ৳500 note but logged as ৳100..."
                                                        : "e.g., found uncounted starting float from yesterday..."}
                                                    value={discrepancyReason}
                                                    onChange={e => setDiscrepancyReason(e.target.value)}
                                                    className="resize-none"
                                                    rows={3}
                                                />
                                                <p className="text-[10px] text-slate-400">This will be reviewed by the manager and attached to the audit log.</p>
                                            </div>
                                        )}

                                        <DialogFooter>
                                            <Button variant="ghost" onClick={() => setBlindDropStep(1)}>← Re-count</Button>
                                            <Button
                                                className={isMatch
                                                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                                    : "bg-rose-600 hover:bg-rose-700 text-white"}
                                                disabled={(!isMatch && !discrepancyReason.trim()) || reconcileMutation.isPending}
                                                onClick={() => reconcileMutation.mutate(discrepancyReason || undefined)}
                                            >
                                                {reconcileMutation.isPending
                                                    ? "Closing Shift..."
                                                    : isMatch
                                                        ? "✅ Close Shift"
                                                        : "Report & Close Shift"}
                                            </Button>
                                        </DialogFooter>
                                    </>
                                );
                            })()}
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>

        </motion.div>
    );
}
