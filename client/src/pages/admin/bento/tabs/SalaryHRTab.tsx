import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { toast } from "sonner";
import { format } from "date-fns";

import {
    Receipt, Users, CheckCircle, XCircle, Clock, Calendar,
    TrendingUp, Gift, ChevronDown, ChevronUp, Sun, FileText,
    AlertCircle, Wallet, DollarSign, BadgeCheck, Loader2, Undo2, Ban, Trash2,
    LayoutTemplate, ShieldAlert, LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BentoCard } from "../shared/BentoCard";
import { containerVariants, itemVariants, tableRowVariants } from "../shared/animations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RejectLeaveDialog, DismissHolidayDialog, AddHolidayDialog } from "./salary/SalaryHRDialogs";

import { SalaryNatureSubTab } from "./salary/SalaryNatureSubTab";
import { EmployeeCompensationSubTab } from "./salary/EmployeeCompensationSubTab";
import { AdvisoryDashboardSubTab } from "./salary/AdvisoryDashboardSubTab";
import { OffboardingSubTab } from "./salary/OffboardingSubTab";

// ── Helpers ──────────────────────────────────────────────────────────────────
function getInitials(name: string) {
    if (!name) return "??";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

function StatusPill({ status }: { status: string }) {
    const variants: Record<string, string> = {
        draft: "bg-slate-50 text-slate-700 border-slate-200",
        pending_approval: "bg-amber-50 text-amber-700 border-amber-200",
        finalized: "bg-blue-50 text-blue-700 border-blue-200",
        paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
        active: "bg-blue-50 text-blue-700 border-blue-200",
        dismissed: "bg-red-50 text-red-700 border-red-200",
        forced: "bg-orange-50 text-orange-700 border-orange-200",
        calculated: "bg-purple-50 text-purple-700 border-purple-200",
        approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
        pending: "bg-amber-50 text-amber-700 border-amber-200",
        rejected: "bg-rose-50 text-rose-700 border-rose-200",
    };
    return (
        <Badge variant="outline" className={cn("capitalize text-[10px] font-bold tracking-wide", variants[status] || "bg-slate-50 text-slate-600 border-slate-200")}>
            {status.replace(/_/g, " ")}
        </Badge>
    );
}

function formatBDT(amount: number): string {
    return `৳${amount.toLocaleString("en-BD")}`;
}

// ── Mobile Cards ─────────────────────────────────────────────────────────────
function PayrollCard({
    r, isSuperAdmin, approveDeduction, dismissDeduction, finalizePayroll, clearPayroll,
}: {
    r: any; isSuperAdmin: boolean;
    approveDeduction: any; dismissDeduction: any; finalizePayroll: any; clearPayroll: any;
}) {
    const [open, setOpen] = useState(false);
    return (
        <motion.div
            layout
            className="rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm"
        >
            <button
                className="w-full p-4 flex items-center justify-between gap-3 text-left"
                onClick={() => setOpen(v => !v)}
            >
                <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border-2 border-slate-100 shrink-0">
                        <AvatarFallback className="text-xs font-bold bg-slate-50 text-slate-500">{getInitials(r.userName)}</AvatarFallback>
                    </Avatar>
                    <div>
                        <p className="font-bold text-slate-700 text-sm">{r.userName}</p>
                        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{r.userRole || "Staff"}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                        <p className="text-sm font-black text-slate-800">{formatBDT(r.netSalary)}</p>
                        <StatusPill status={r.status} />
                    </div>
                    {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 space-y-3">
                            <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                                <div className="bg-green-50 rounded-xl p-2">
                                    <div className="font-black text-green-700 text-lg">{r.daysPresent}</div>
                                    <div className="text-green-600 font-semibold">Present</div>
                                </div>
                                <div className="bg-rose-50 rounded-xl p-2">
                                    <div className="font-black text-rose-700 text-lg">{r.daysAbsent > 0 ? r.daysAbsent : 0}</div>
                                    <div className="text-rose-600 font-semibold">Absent</div>
                                </div>
                                <div className="bg-amber-50 rounded-xl p-2">
                                    <div className="font-black text-amber-700 text-lg">{r.daysLate > 0 ? r.daysLate : 0}</div>
                                    <div className="text-amber-600 font-semibold">Late</div>
                                </div>
                            </div>
                            <div className="space-y-1.5 text-[11px]">
                                <div className="flex justify-between text-slate-600">
                                    <span>Gross Salary</span><span className="font-bold">{formatBDT(r.grossSalary)}</span>
                                </div>
                                <div className="flex justify-between text-rose-600 border-t border-slate-100 pt-1.5">
                                    <span>Deductions</span><span className="font-bold">-{formatBDT(r.totalDeductions)}</span>
                                </div>
                                {r.totalDeductions > 0 && !r.deductionApproved && (
                                    <div className="text-[10px] text-amber-600 bg-amber-50 p-1.5 rounded text-center font-medium mt-1">
                                        ⚠ Pending Super Admin approval
                                    </div>
                                )}
                                <div className="flex justify-between text-emerald-700 font-black text-sm border-t border-slate-100 pt-1.5">
                                    <span>Net Pay</span><span>{formatBDT(r.netSalary)}</span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 pt-1">
                                {isSuperAdmin && r.totalDeductions > 0 && !r.deductionApproved && (
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="outline" className="flex-1 rounded-xl h-9 text-xs font-bold text-green-600 border-green-200" onClick={() => approveDeduction.mutate(r.id)} disabled={approveDeduction.isPending}>
                                            Approve Deductions
                                        </Button>
                                        <Button size="sm" variant="outline" className="flex-1 rounded-xl h-9 text-xs font-bold text-rose-600 border-rose-200" onClick={() => dismissDeduction.mutate(r.id)} disabled={dismissDeduction.isPending}>
                                            Dismiss Deductions
                                        </Button>
                                    </div>
                                )}
                                {isSuperAdmin && r.status === "draft" && r.deductionApproved && (
                                    <Button size="sm" variant="outline" className="w-full rounded-xl h-9 text-xs font-bold" onClick={() => finalizePayroll.mutate(r.id)} disabled={finalizePayroll.isPending}>
                                        <FileText className="w-3.5 h-3.5 mr-1" /> Finalize Payroll
                                    </Button>
                                )}
                                {(r.status === "finalized" || r.status === "draft") && r.status !== "paid" && (
                                    <Button size="sm" className="w-full rounded-xl h-9 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => clearPayroll.mutate(r.id)} disabled={clearPayroll.isPending}>
                                        <BadgeCheck className="w-3.5 h-3.5 mr-1" /> Mark Paid
                                    </Button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// ── Main Tab ─────────────────────────────────────────────────────────────────
export default function SalaryHRTab() {
    const { user } = useAdminAuth();
    const queryClient = useQueryClient();
    const isSuperAdmin = user?.role === "Super Admin";

    const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), "yyyy-MM"));
    const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());

    // Dialog state
    const [addHolidayOpen, setAddHolidayOpen] = useState(false);
    const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
    const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
    const [dismissDialogOpen, setDismissDialogOpen] = useState(false);
    const [dismissTargetId, setDismissTargetId] = useState<string | null>(null);

    // ── Queries
    const { data: payrollRecords = [], isLoading: payrollLoading } = useQuery({
        queryKey: ["/api/admin/payroll", selectedMonth],
        queryFn: async () => {
            const res = await fetch(`/api/admin/payroll/${selectedMonth}`, { credentials: "include" });
            return res.ok ? res.json() : [];
        },
    });

    const { data: salaryConfigs = [] } = useQuery({
        queryKey: ["/api/admin/payroll/salary-config"],
        queryFn: async () => {
            const res = await fetch("/api/admin/payroll/salary-config", { credentials: "include" });
            return res.ok ? res.json() : [];
        },
    });

    const { data: bonusRecords = [] } = useQuery({
        queryKey: ["/api/admin/payroll/bonus", selectedYear],
        queryFn: async () => {
            const res = await fetch(`/api/admin/payroll/bonus/${selectedYear}`, { credentials: "include" });
            return res.ok ? res.json() : [];
        },
    });

    const { data: holidays = [], isLoading: holidaysLoading } = useQuery({
        queryKey: ["/api/admin/holidays", selectedYear],
        queryFn: async () => {
            const res = await fetch(`/api/admin/holidays/${selectedYear}`, { credentials: "include" });
            return res.ok ? res.json() : [];
        },
    });

    const { data: hrDefaults } = useQuery({
        queryKey: ["/api/admin/payroll/hr-defaults"],
        queryFn: async () => {
            const res = await fetch("/api/admin/payroll/hr-defaults", { credentials: "include" });
            return res.ok ? res.json() : null;
        },
    });

    const { data: leaveApplications = [] } = useQuery({
        queryKey: ["/api/admin/leave/all"],
        queryFn: async () => {
            const res = await fetch("/api/admin/leave/all", { credentials: "include" });
            return res.ok ? res.json() : [];
        },
        enabled: isSuperAdmin,
    });

    const { data: users = [] } = useQuery({
        queryKey: ["/api/admin/users"],
        queryFn: async () => {
            const res = await fetch("/api/admin/users", { credentials: "include" });
            return res.ok ? res.json() : [];
        },
    });

    const employeesPendingCompensation = users.filter((u: any) => u.employmentStatus === 'pending_compensation' && ['Super Admin', 'Manager', 'Cashier', 'Technician'].includes(u.role));

    // ── Mutations
    const generatePayroll = useMutation({
        mutationFn: async (month: string) => (await apiRequest("POST", `/api/admin/payroll/generate/${month}`)).json(),
        onSuccess: (data) => {
            toast.success(`Salary sheet generated. ${data.notifications} notification(s) created.`);
            queryClient.invalidateQueries({ queryKey: ["/api/admin/payroll"] });
        },
        onError: (e: Error) => toast.error(e.message),
    });

    const clearPayroll = useMutation({ mutationFn: async (id: string) => (await apiRequest("PATCH", `/api/admin/payroll/${id}/clear`)).json(), onSuccess: () => { toast.success("Marked as paid"); queryClient.invalidateQueries({ queryKey: ["/api/admin/payroll"] }); } });
    const finalizePayroll = useMutation({ mutationFn: async (id: string) => (await apiRequest("PATCH", `/api/admin/payroll/${id}/finalize`)).json(), onSuccess: () => { toast.success("Payroll finalized"); queryClient.invalidateQueries({ queryKey: ["/api/admin/payroll"] }); } });
    const approveDeduction = useMutation({ mutationFn: async (id: string) => (await apiRequest("PATCH", `/api/admin/payroll/${id}/approve-deduction`)).json(), onSuccess: () => { toast.success("Deductions approved"); queryClient.invalidateQueries({ queryKey: ["/api/admin/payroll"] }); } });
    const dismissDeduction = useMutation({ mutationFn: async (id: string) => (await apiRequest("PATCH", `/api/admin/payroll/${id}/dismiss-deduction`)).json(), onSuccess: () => { toast.success("Deductions dismissed"); queryClient.invalidateQueries({ queryKey: ["/api/admin/payroll"] }); } });

    const approveLeave = useMutation({
        mutationFn: async (id: string) => (await apiRequest("PATCH", `/api/admin/leave/${id}/approve`)).json(),
        onSuccess: () => { toast.success("Leave approved"); queryClient.invalidateQueries({ queryKey: ["/api/admin/leave/all"] }); },
    });

    const rejectLeave = useMutation({
        mutationFn: async ({ id, rejectionReason }: { id: string; rejectionReason: string }) =>
            (await apiRequest("PATCH", `/api/admin/leave/${id}/reject`, { rejectionReason })).json(),
        onSuccess: () => { toast.success("Leave rejected"); queryClient.invalidateQueries({ queryKey: ["/api/admin/leave/all"] }); setRejectDialogOpen(false); setRejectTargetId(null); },
    });

    const dismissHoliday = useMutation({
        mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
            (await apiRequest("PATCH", `/api/admin/holidays/${id}/dismiss`, { reason })).json(),
        onSuccess: () => { toast.success("Holiday dismissed"); queryClient.invalidateQueries({ queryKey: ["/api/admin/holidays"] }); setDismissDialogOpen(false); setDismissTargetId(null); },
    });

    const restoreHoliday = useMutation({
        mutationFn: async (id: string) => (await apiRequest("PATCH", `/api/admin/holidays/${id}/restore`)).json(),
        onSuccess: () => { toast.success("Holiday restored"); queryClient.invalidateQueries({ queryKey: ["/api/admin/holidays"] }); },
    });

    const deleteHoliday = useMutation({
        mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/admin/holidays/${id}`)).json(),
        onSuccess: () => { toast.success("Holiday deleted"); queryClient.invalidateQueries({ queryKey: ["/api/admin/holidays"] }); },
    });

    const seedHolidays = useMutation({
        mutationFn: async (year: number) => (await apiRequest("POST", `/api/admin/holidays/seed/${year}`)).json(),
        onSuccess: (data) => { toast.success(`${data.count} holidays seeded`); queryClient.invalidateQueries({ queryKey: ["/api/admin/holidays"] }); },
        onError: (e: Error) => toast.error(e.message),
    });

    const addHoliday = useMutation({
        mutationFn: async (data: any) => (await apiRequest("POST", "/api/admin/holidays", data)).json(),
        onSuccess: () => { toast.success("Holiday added"); queryClient.invalidateQueries({ queryKey: ["/api/admin/holidays"] }); setAddHolidayOpen(false); },
        onError: () => toast.error("Failed to add holiday"),
    });

    // Stats
    const totalPayroll = payrollRecords.reduce((s: number, r: any) => s + r.netSalary, 0);
    const totalDeductions = payrollRecords.reduce((s: number, r: any) => s + r.totalDeductions, 0);
    const paidCount = payrollRecords.filter((r: any) => r.status === "paid").length;
    const pendingCount = payrollRecords.filter((r: any) => r.status && r.status !== "paid").length;
    const pendingLeaves = leaveApplications.filter((l: any) => l.status === "pending").length;

    // Handlers
    const openRejectDialog = (id: string) => { setRejectTargetId(id); setRejectDialogOpen(true); };
    const openDismissDialog = (id: string) => { setDismissTargetId(id); setDismissDialogOpen(true); };
    const confirmDeleteHoliday = (id: string, name: string) => { if (window.confirm(`Delete "${name}" from the calendar?`)) deleteHoliday.mutate(id); };

    return (
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">
            <RejectLeaveDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen} onConfirm={(reason: string) => rejectTargetId && rejectLeave.mutate({ id: rejectTargetId, rejectionReason: reason })} isPending={rejectLeave.isPending} />
            <DismissHolidayDialog open={dismissDialogOpen} onOpenChange={setDismissDialogOpen} onConfirm={(reason: string) => dismissTargetId && dismissHoliday.mutate({ id: dismissTargetId, reason })} isPending={dismissHoliday.isPending} />
            <AddHolidayDialog open={addHolidayOpen} onOpenChange={setAddHolidayOpen} onConfirm={(data: any) => addHoliday.mutate(data)} isPending={addHoliday.isPending} selectedYear={selectedYear} />

            {/* Header */}
            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-800">Salary & HR</h2>
                    <p className="text-sm text-slate-500">Payroll management, leave tracking and holiday calendar</p>
                </div>
                {isSuperAdmin && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-white shadow-sm px-4 py-2 rounded-xl border border-slate-200 w-fit shrink-0">
                        <Clock className="h-3.5 w-3.5" />
                        {hrDefaults?.shopOpenTime || "10:30"} – {hrDefaults?.shopCloseTime || "20:00"}
                        <span className="text-slate-300">|</span>
                        Grace: {hrDefaults?.graceMinutes || 25}m
                    </div>
                )}
            </motion.div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <motion.div variants={itemVariants}>
                    <BentoCard variant="vibrant" className="bg-gradient-to-br from-green-500 to-emerald-600 shadow-green-500/30 h-[130px]">
                        <div className="flex flex-col justify-between h-full text-white">
                            <div className="flex items-center justify-between">
                                <span className="text-green-100 text-xs font-semibold uppercase tracking-widest">Net Payroll</span>
                                <Wallet className="w-4 h-4 text-green-200" />
                            </div>
                            <div>
                                <div className="text-xl sm:text-2xl font-black tracking-tight">{formatBDT(totalPayroll)}</div>
                                <p className="text-green-100 text-[11px] mt-0.5">{payrollRecords.length} staff on sheet</p>
                            </div>
                        </div>
                    </BentoCard>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <BentoCard variant="vibrant" className="bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/30 h-[130px]">
                        <div className="flex flex-col justify-between h-full text-white">
                            <div className="flex items-center justify-between">
                                <span className="text-amber-100 text-xs font-semibold uppercase tracking-widest">Pending Pay</span>
                                <Clock className="w-4 h-4 text-amber-200" />
                            </div>
                            <div>
                                <div className="text-2xl font-black">{pendingCount} / {paidCount + pendingCount}</div>
                                <p className="text-amber-100 text-[11px] mt-0.5">Awaiting disbursement</p>
                            </div>
                        </div>
                    </BentoCard>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <BentoCard variant="vibrant" className="bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-500/30 h-[130px]">
                        <div className="flex flex-col justify-between h-full text-white">
                            <div className="flex items-center justify-between">
                                <span className="text-rose-100 text-xs font-semibold uppercase tracking-widest">Deductions</span>
                                <TrendingUp className="w-4 h-4 text-rose-200" />
                            </div>
                            <div>
                                <div className="text-2xl font-black">{formatBDT(totalDeductions)}</div>
                                <p className="text-rose-100 text-[11px] mt-0.5">Penalties & Late Fines</p>
                            </div>
                        </div>
                    </BentoCard>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <BentoCard variant="vibrant" className="bg-gradient-to-br from-violet-500 to-purple-600 shadow-violet-500/30 h-[130px]">
                        <div className="flex flex-col justify-between h-full text-white">
                            <div className="flex items-center justify-between">
                                <span className="text-violet-100 text-xs font-semibold uppercase tracking-widest">Leave Requests</span>
                                <AlertCircle className="w-4 h-4 text-violet-200" />
                            </div>
                            <div>
                                <div className="text-2xl font-black">{pendingLeaves}</div>
                                <p className="text-violet-100 text-[11px] mt-0.5">Pending approval</p>
                            </div>
                        </div>
                    </BentoCard>
                </motion.div>
            </div>

            {/* Sub Tabs */}
            <motion.div variants={itemVariants}>
                <Tabs defaultValue="payroll" className="w-full">
                    <TabsList className="inline-flex h-11 items-center justify-start rounded-full bg-slate-100 p-1 text-slate-500 w-auto mb-6 flex-wrap gap-1">
                        {[
                            { value: "payroll", label: "Monthly Sheet", icon: Receipt },
                            { value: "compensation", label: "Compensation", icon: DollarSign },
                            { value: "nature", label: "Salary Nature", icon: LayoutTemplate },
                            { value: "advisory", label: "Advisory", icon: ShieldAlert, adminOnly: true },
                            { value: "offboarding", label: "Offboarding", icon: LogOut },
                            { value: "leave", label: "Leave", icon: Calendar },
                            { value: "bonus", label: "Bonus", icon: Gift },
                            { value: "holidays", label: "Holidays", icon: Sun },
                        ].filter((t: any) => !t.adminOnly || isSuperAdmin).map(({ value, label, icon: Icon }) => (
                            <TabsTrigger
                                key={value}
                                value={value}
                                className="rounded-full px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-all data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm gap-1.5"
                            >
                                <Icon className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">{label}</span>
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {/* ── Monthly Sheet ── */}
                    <TabsContent value="payroll">
                        <BentoCard variant="ghost" className="bg-white border-slate-200 shadow-sm p-0 rounded-[1.5rem] overflow-hidden flex flex-col min-h-[400px]" disableHover>
                            <div className="p-4 sm:p-5 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 rounded-lg bg-green-50 text-green-600">
                                        <Receipt className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-700 leading-tight">Monthly Salary Sheet</h3>
                                        <p className="text-[10px] text-slate-500">{isSuperAdmin ? "Deductions require your approval." : "View-only access."}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="h-9 w-40 sm:flex-none border-slate-200 rounded-xl bg-slate-50 shadow-inner" />
                                    {isSuperAdmin && payrollRecords.length === 0 && (
                                        employeesPendingCompensation.length > 0 ? (
                                            <Button disabled className="h-9 gap-2 shrink-0 rounded-xl shadow-sm bg-amber-100 text-amber-600 border border-amber-200 hover:bg-amber-100">
                                                <AlertCircle className="h-4 w-4" /> Blocked
                                            </Button>
                                        ) : (
                                            <Button onClick={() => generatePayroll.mutate(selectedMonth)} disabled={generatePayroll.isPending} className="h-9 gap-2 shrink-0 rounded-xl shadow-sm bg-slate-800 hover:bg-slate-900 text-white">
                                                {generatePayroll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />} Generate
                                            </Button>
                                        )
                                    )}
                                </div>
                            </div>

                            {employeesPendingCompensation.length > 0 && isSuperAdmin && payrollRecords.length === 0 && (
                                <div className="mx-6 mt-4 p-4 border border-amber-200 bg-amber-50 rounded-xl flex items-start gap-3 relative z-10">
                                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="font-semibold text-amber-800 text-sm">Action Required: Pending Compensation</h4>
                                        <p className="text-sm text-amber-700 mt-1 max-w-2xl">
                                            You cannot generate payroll until all eligible employees have an active salary assignment.
                                            The following employees are pending compensation setup:
                                        </p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {employeesPendingCompensation.map((u: any) => (
                                                <Badge key={u.id} variant="outline" className="bg-white text-amber-700 border-amber-200">
                                                    {u.name}
                                                </Badge>
                                            ))}
                                        </div>
                                        <p className="text-xs mt-3 text-amber-600 font-medium">Head over to the <span className="font-bold underline">Compensation</span> tab to configure their salaries.</p>
                                    </div>
                                </div>
                            )}

                            <div className="flex-1 overflow-hidden flex flex-col relative w-full h-full bg-slate-50/30">
                                {payrollLoading ? (
                                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400">
                                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                        <p className="mt-2 text-sm">Loading payroll records...</p>
                                    </div>
                                ) : payrollRecords.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400">
                                        <div className="p-4 bg-slate-50 rounded-full mb-3"><Receipt className="w-8 h-8 opacity-50" /></div>
                                        <p className="font-medium text-sm">No salary sheet for {selectedMonth}</p>
                                        {isSuperAdmin && <p className="text-[10px] mt-1 opacity-70">Generate payroll to get started</p>}
                                    </div>
                                ) : (
                                    <div className="flex-1 w-full overflow-hidden flex flex-col min-h-0 relative">
                                        {/* Mobile */}
                                        <div className="md:hidden overflow-y-auto w-full p-4 space-y-3 custom-scrollbar relative">
                                            {payrollRecords.map((s: any) => <PayrollCard key={s.id} r={s} isSuperAdmin={isSuperAdmin} approveDeduction={approveDeduction} dismissDeduction={dismissDeduction} finalizePayroll={finalizePayroll} clearPayroll={clearPayroll} />)}
                                        </div>
                                        {/* Desktop */}
                                        <div className="hidden md:flex overflow-x-auto w-full relative custom-scrollbar flex-1 pb-[52px]">
                                            <Table className="w-full h-full mb-[52px]">
                                                <TableHeader className="bg-slate-50/70 sticky top-0 z-10 w-full backdrop-blur-md">
                                                    <TableRow className="border-slate-100 hover:bg-transparent">
                                                        {["Staff", "W. Days", "Present", "Absent", "Late", "Gross", "Deduct.", "Net Pay", "Status", "Actions"].map(h => (
                                                            <TableHead key={h} className="text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap bg-slate-50/70 h-10">{h}</TableHead>
                                                        ))}
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody className="w-full">
                                                    <AnimatePresence>
                                                        {payrollRecords.map((s: any, i: number) => (
                                                            <motion.tr key={s.id} variants={tableRowVariants} initial="hidden" animate="visible" custom={i} className="group hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0 w-full min-w-full">
                                                                <TableCell className="min-w-[12rem]">
                                                                    <div className="flex items-center gap-2.5">
                                                                        <Avatar className="h-8 w-8 border border-slate-100 transition-transform group-hover:scale-110">
                                                                            <AvatarFallback className="text-[10px] font-bold bg-slate-50 text-slate-500">{getInitials(s.userName)}</AvatarFallback>
                                                                        </Avatar>
                                                                        <div>
                                                                            <p className="font-bold text-slate-700 text-sm whitespace-nowrap">{s.userName}</p>
                                                                            <p className="text-[10px] text-slate-400">{s.userRole}</p>
                                                                        </div>
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="text-center font-medium text-slate-600">{s.totalWorkingDays}</TableCell>
                                                                <TableCell className="text-center"><Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px]">{s.daysPresent}d</Badge></TableCell>
                                                                <TableCell className="text-center">{s.daysAbsent > 0 ? <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 text-[10px]">{s.daysAbsent}d</Badge> : <span className="text-slate-300 text-xs">—</span>}</TableCell>
                                                                <TableCell className="text-center text-amber-600 font-medium text-xs">{s.daysLate > 0 ? s.daysLate : "—"}{s.consecutiveLatePenalties > 0 && <span className="ml-1 text-[10px] text-red-500" title="Streak active">⚠</span>}</TableCell>
                                                                <TableCell className="font-mono text-xs text-slate-600 max-w-24 truncate" title={formatBDT(s.grossSalary)}>{formatBDT(s.grossSalary)}</TableCell>
                                                                <TableCell className="font-mono text-xs text-rose-500 max-w-24 truncate min-w-[5rem]">
                                                                    {s.totalDeductions > 0 ? (
                                                                        <span className={!s.deductionApproved ? "text-amber-600" : "text-red-500"} title={!s.deductionApproved ? "Pending Approval" : ""}>
                                                                            -{formatBDT(s.totalDeductions)}
                                                                        </span>
                                                                    ) : <span className="text-slate-300">—</span>}
                                                                </TableCell>
                                                                <TableCell className="font-black text-slate-800 text-sm whitespace-nowrap">{formatBDT(s.netSalary)}</TableCell>
                                                                <TableCell className="pl-0"><StatusPill status={s.status} /></TableCell>
                                                                <TableCell className="text-right">
                                                                    <div className="flex items-center justify-end gap-1 flex-wrap">
                                                                        {isSuperAdmin && s.totalDeductions > 0 && !s.deductionApproved && (
                                                                            <>
                                                                                <Button size="icon" variant="outline" className="h-7 w-7 text-green-600 border-green-200 rounded-lg hover:bg-green-50" onClick={() => approveDeduction.mutate(s.id)} disabled={approveDeduction.isPending} title="Approve Deductions"><CheckCircle className="h-3.5 w-3.5" /></Button>
                                                                                <Button size="icon" variant="outline" className="h-7 w-7 text-red-600 border-red-200 rounded-lg hover:bg-red-50" onClick={() => dismissDeduction.mutate(s.id)} disabled={dismissDeduction.isPending} title="Dismiss Deductions"><XCircle className="h-3.5 w-3.5" /></Button>
                                                                            </>
                                                                        )}
                                                                        {isSuperAdmin && s.status === "draft" && s.deductionApproved && (
                                                                            <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] rounded-lg" onClick={() => finalizePayroll.mutate(s.id)}>Finalize</Button>
                                                                        )}
                                                                        {(s.status === "finalized" || s.status === "draft") && s.status !== "paid" && (
                                                                            <Button size="sm" className="h-7 px-2.5 text-[10px] rounded-lg bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => clearPayroll.mutate(s.id)} disabled={clearPayroll.isPending}>
                                                                                <BadgeCheck className="w-3.5 h-3.5 mr-1" /> Pay
                                                                            </Button>
                                                                        )}
                                                                    </div>
                                                                </TableCell>
                                                            </motion.tr>
                                                        ))}
                                                    </AnimatePresence>
                                                </TableBody>
                                            </Table>
                                            {/* Static Footer inside the container */}
                                            <div className="bg-slate-50/90 backdrop-blur-md border-t border-slate-200 px-6 py-3 grid flex flex-wrap lg:grid-cols-6 gap-2 lg:gap-4 text-[11px] font-bold text-slate-600 absolute bottom-0 left-0 right-0 z-20 w-fit sm:w-full min-w-full">
                                                <div className="col-span-2">Totals ({payrollRecords.length} staff)</div>
                                                <div className="font-mono">{formatBDT(payrollRecords.reduce((s: number, r: any) => s + r.grossSalary, 0))} Gross</div>
                                                <div className="col-span-2 text-rose-500 font-mono">-{formatBDT(totalDeductions)} Deduct.</div>
                                                <div className="text-emerald-700 text-sm font-black whitespace-nowrap text-right pr-6">{formatBDT(totalPayroll)} Net Pay</div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </BentoCard>
                    </TabsContent>

                    {/* ── Employee Compensation ── */}
                    <TabsContent value="compensation">
                        <EmployeeCompensationSubTab />
                    </TabsContent>

                    {/* ── Salary Nature ── */}
                    <TabsContent value="nature">
                        <SalaryNatureSubTab />
                    </TabsContent>

                    {/* ── Advisory Dashboard ── */}
                    {isSuperAdmin && (
                        <TabsContent value="advisory">
                            <AdvisoryDashboardSubTab />
                        </TabsContent>
                    )}

                    {/* ── Offboarding & Settlement ── */}
                    <TabsContent value="offboarding">
                        <OffboardingSubTab />
                    </TabsContent>

                    {/* ── Leave Applications ── */}
                    <TabsContent value="leave">
                        <BentoCard variant="ghost" className="bg-white border-slate-200 shadow-sm p-0 rounded-[1.5rem] overflow-hidden flex flex-col min-h-[400px]" disableHover>
                            <div className="p-4 sm:p-5 border-b border-slate-50 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 rounded-lg bg-violet-50 text-violet-600">
                                        <Calendar className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-700 leading-tight">Leave Applications</h3>
                                        <p className="text-[10px] text-slate-500">{isSuperAdmin ? "Approve or reject staff leave requests" : "View team leaves"}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 overflow-hidden flex flex-col relative bg-slate-50/30">
                                {leaveApplications.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400">
                                        <div className="p-4 bg-slate-50 rounded-full mb-3"><Calendar className="w-8 h-8 opacity-50" /></div>
                                        <p className="font-medium text-sm">No leave applications</p>
                                    </div>
                                ) : (
                                    <div className="flex-1 overflow-auto w-full flex min-h-0 relative">
                                        {/* Mobile */}
                                        <div className="md:hidden w-full p-4 space-y-3 custom-scrollbar">
                                            {leaveApplications.map((l: any) => (
                                                <motion.div key={l.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-slate-100 p-4 bg-white/60 shadow-sm space-y-3 relative overflow-hidden">
                                                    <div className="absolute top-0 left-0 w-1 h-full bg-violet-500/20" />
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <p className="font-bold text-slate-700 text-sm">{l.userName}</p>
                                                            <p className="text-[10px] text-slate-400 font-semibold">{l.leaveType} · {l.totalDays} day{l.totalDays > 1 ? "s" : ""}</p>
                                                        </div>
                                                        <StatusPill status={l.status} />
                                                    </div>
                                                    <p className="text-xs text-slate-500 italic bg-slate-50 p-2 rounded-lg line-clamp-2">"{l.reason}"</p>
                                                    <div className="text-[11px] text-slate-500 font-medium">From: <span className="text-slate-700">{l.startDate}</span> To: <span className="text-slate-700">{l.endDate}</span></div>
                                                    {isSuperAdmin && l.status === "pending" && (
                                                        <div className="flex gap-2 pt-1 border-t border-slate-100">
                                                            <Button size="sm" className="flex-1 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1 mt-2" onClick={() => approveLeave.mutate(l.id)}>
                                                                <CheckCircle className="w-3.5 h-3.5" /> Approve
                                                            </Button>
                                                            <Button size="sm" variant="outline" className="flex-1 h-9 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold gap-1 mt-2" onClick={() => openRejectDialog(l.id)}>
                                                                <XCircle className="w-3.5 h-3.5" /> Reject
                                                            </Button>
                                                        </div>
                                                    )}
                                                </motion.div>
                                            ))}
                                        </div>

                                        {/* Desktop */}
                                        <div className="hidden md:flex overflow-x-auto w-full custom-scrollbar flex-1 pb-4">
                                            <Table className="w-full">
                                                <TableHeader className="bg-slate-50/70 sticky top-0 z-10 backdrop-blur-md">
                                                    <TableRow className="border-slate-100 hover:bg-transparent">
                                                        {["Staff", "Type", "Duration", "Days", "Reason", "Status", isSuperAdmin ? "Actions" : ""].map(h => h ? (
                                                            <TableHead key={h} className="text-[10px] font-black uppercase tracking-widest text-slate-400 h-10">{h}</TableHead>
                                                        ) : <TableHead key="empty" />)}
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    <AnimatePresence>
                                                        {leaveApplications.map((l: any, i: number) => (
                                                            <motion.tr key={l.id} variants={tableRowVariants} initial="hidden" animate="visible" custom={i} className="group hover:bg-slate-50/50 border-b border-slate-50 last:border-0">
                                                                <TableCell>
                                                                    <p className="font-bold text-slate-700 whitespace-nowrap">{l.userName}</p>
                                                                    <p className="text-[10px] text-slate-400">{l.userRole}</p>
                                                                </TableCell>
                                                                <TableCell><Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 text-[10px] whitespace-nowrap capitalize">{l.leaveType}</Badge></TableCell>
                                                                <TableCell className="text-xs text-slate-600 whitespace-nowrap">{l.startDate} <span className="text-slate-300">→</span> {l.endDate}</TableCell>
                                                                <TableCell className="font-bold text-slate-700">{l.totalDays}</TableCell>
                                                                <TableCell className="text-xs text-slate-500 italic max-w-[200px] truncate" title={l.reason}>{l.reason}</TableCell>
                                                                <TableCell><StatusPill status={l.status} /></TableCell>
                                                                <TableCell className="text-right">
                                                                    {isSuperAdmin && l.status === "pending" && (
                                                                        <div className="flex gap-1.5 justify-end">
                                                                            <Button size="sm" className="h-7 px-2.5 text-[10px] rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 gap-1" onClick={() => approveLeave.mutate(l.id)}>
                                                                                <CheckCircle className="w-3 h-3" /> Approve
                                                                            </Button>
                                                                            <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] rounded-lg border-rose-200 text-rose-500 hover:bg-rose-50 gap-1" onClick={() => openRejectDialog(l.id)}>
                                                                                <XCircle className="w-3 h-3" /> Reject
                                                                            </Button>
                                                                        </div>
                                                                    )}
                                                                </TableCell>
                                                            </motion.tr>
                                                        ))}
                                                    </AnimatePresence>
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </BentoCard>
                    </TabsContent>

                    {/* ── Bonus ── */}
                    <TabsContent value="bonus">
                        <BentoCard variant="ghost" className="bg-white border-slate-200 shadow-sm p-0 rounded-[1.5rem] overflow-hidden flex flex-col min-h-[400px]" disableHover>
                            <div className="p-4 sm:p-5 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 rounded-lg bg-amber-50 text-amber-500">
                                        <Gift className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-700 leading-tight">Bonus & Incentives</h3>
                                        <p className="text-[10px] text-slate-500">Yearly bonuses and festival disbursements for {selectedYear}</p>
                                    </div>
                                </div>
                                <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                                    <SelectTrigger className="h-9 w-full sm:w-28 rounded-xl border-slate-200 bg-slate-50"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {[2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex-1 overflow-auto bg-slate-50/30">
                                {bonusRecords.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center p-8 text-slate-400">
                                        <div className="p-4 bg-slate-50 rounded-full mb-3"><Gift className="w-8 h-8 opacity-50" /></div>
                                        <p className="font-medium text-sm">No bonus records for {selectedYear}</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Desktop */}
                                        <div className="hidden md:block overflow-x-auto">
                                            <Table>
                                                <TableHeader className="bg-slate-50/70">
                                                    <TableRow className="border-slate-100 hover:bg-transparent">
                                                        {["Staff", "Type", "Full Bonus", "Absences", "Deduction", "Final", "Status"].map(h => (
                                                            <TableHead key={h} className={`text-[10px] font-black uppercase tracking-widest text-slate-400 ${h === 'Absences' || h === 'Status' ? 'text-center' : ''} ${h.includes('Bonus') || h === 'Deduction' || h === 'Final' ? 'text-right' : ''}`}>{h}</TableHead>
                                                        ))}
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    <AnimatePresence>
                                                        {bonusRecords.map((b: any, i: number) => (
                                                            <motion.tr key={b.id} variants={tableRowVariants} initial="hidden" animate="visible" custom={i} className="group hover:bg-slate-50/50 border-b border-slate-50 last:border-0">
                                                                <TableCell className="font-bold text-slate-700 whitespace-nowrap">{b.userName}</TableCell>
                                                                <TableCell><Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] whitespace-nowrap capitalize">{b.bonusType.replace(/_/g, " ")}</Badge></TableCell>
                                                                <TableCell className="text-right whitespace-nowrap font-mono text-xs">{formatBDT(b.fullBonusAmount)}</TableCell>
                                                                <TableCell className="text-center text-rose-500 font-medium">{b.unapprovedAbsences}</TableCell>
                                                                <TableCell className="text-right text-rose-600 whitespace-nowrap font-mono text-xs">{b.deductionAmount > 0 ? `-${formatBDT(b.deductionAmount)} (${b.deductionPercent}%)` : "—"}</TableCell>
                                                                <TableCell className="font-black text-slate-800 text-right font-mono">{formatBDT(b.finalBonusAmount)}</TableCell>
                                                                <TableCell className="text-center"><StatusPill status={b.status} /></TableCell>
                                                            </motion.tr>
                                                        ))}
                                                    </AnimatePresence>
                                                </TableBody>
                                            </Table>
                                        </div>
                                        {/* Mobile bonus cards */}
                                        <div className="md:hidden p-4 space-y-3 custom-scrollbar">
                                            {bonusRecords.map((b: any, i: number) => (
                                                <motion.div key={b.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                                                    className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-white shadow-sm"
                                                >
                                                    <div className="space-y-1">
                                                        <p className="font-bold text-slate-700 text-sm leading-none">{b.userName}</p>
                                                        <p className="text-[10px] text-slate-400 capitalize">{b.bonusType.replace(/_/g, " ")}</p>
                                                        {b.unapprovedAbsences > 0 && (
                                                            <div className="text-[10px] text-rose-500 font-medium">Absences: {b.unapprovedAbsences} (-{b.deductionPercent}%)</div>
                                                        )}
                                                    </div>
                                                    <div className="text-right space-y-2">
                                                        <p className="font-black text-slate-800 text-sm leading-none">{formatBDT(b.finalBonusAmount)}</p>
                                                        <StatusPill status={b.status} />
                                                    </div>
                                                </motion.div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </BentoCard>
                    </TabsContent>

                    {/* ── Holidays ── */}
                    <TabsContent value="holidays">
                        <div className="flex flex-col sm:flex-row justify-between gap-4 mb-4 items-center">
                            <div className="flex items-center gap-2">
                                <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                                    <SelectTrigger className="h-9 w-28 rounded-xl border-slate-200 bg-white"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {[2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                {isSuperAdmin && holidays.length === 0 && !holidaysLoading && (
                                    <Button variant="outline" className="h-9 gap-2 rounded-xl text-xs" onClick={() => seedHolidays.mutate(selectedYear)} disabled={seedHolidays.isPending}>
                                        {seedHolidays.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sun className="w-4 h-4" />} Seed
                                    </Button>
                                )}
                            </div>
                            {isSuperAdmin && (
                                <Button className="h-9 gap-2 rounded-xl bg-slate-800 text-white shadow-sm w-full sm:w-auto" onClick={() => setAddHolidayOpen(true)}>
                                    <Calendar className="w-4 h-4" /> Add Custom
                                </Button>
                            )}
                        </div>

                        {holidaysLoading ? (
                            <div className="h-40 flex items-center justify-center">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            </div>
                        ) : holidays.length === 0 ? (
                            <div className="h-40 flex flex-col items-center justify-center text-slate-400 bg-white rounded-3xl border border-slate-100 border-dashed">
                                <Sun className="w-8 h-8 opacity-30 mb-2" />
                                <p className="text-sm">No holidays recorded for {selectedYear}</p>
                            </div>
                        ) : (
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
                                {holidays.map((h: any, i: number) => (
                                    <motion.div key={h.id} variants={itemVariants} custom={i} whileHover={{ y: -4 }}>
                                        <BentoCard
                                            variant="glass"
                                            className={cn(
                                                "border-slate-200/60 transition-all",
                                                h.status === "dismissed" ? "opacity-60 grayscale" :
                                                    h.type === "religious" ? "bg-gradient-to-br from-amber-50/80 to-orange-50/60" :
                                                        h.type === "forced" ? "bg-gradient-to-br from-rose-50/80 to-red-50/60" : "bg-gradient-to-br from-blue-50/80 to-indigo-50/60"
                                            )}
                                            disableHover
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div className={cn(
                                                    "p-2 rounded-xl border border-white/40 shadow-sm",
                                                    h.type === "religious" ? "bg-amber-100 text-amber-600" :
                                                        h.type === "forced" ? "bg-rose-100 text-rose-600" : "bg-blue-100 text-blue-600"
                                                )}>
                                                    {h.type === "forced" ? <AlertCircle className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                                                </div>
                                                <div className="flex flex-col gap-1 items-end">
                                                    <Badge variant="outline" className={cn(
                                                        "text-[10px] font-bold uppercase",
                                                        h.type === "religious" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                                            h.type === "forced" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-blue-50 text-blue-700 border-blue-200"
                                                    )}>{h.type}</Badge>
                                                    {h.status !== "active" && <StatusPill status={h.status} />}
                                                </div>
                                            </div>
                                            <h4 className={cn("font-bold text-slate-700 text-sm leading-snug mb-1", h.status === "dismissed" && "line-through text-slate-400")}>{h.name}</h4>
                                            {(h.dismissedReason || h.forcedReason) && (
                                                <p className="text-[10px] text-slate-500 italic mb-2 line-clamp-2 leading-tight">By Admin: {h.dismissedReason || h.forcedReason}</p>
                                            )}
                                            <div className="mt-auto pt-2 text-xs text-slate-500 font-medium flex items-center justify-between border-t border-slate-200/50">
                                                <div className="flex items-center gap-1.5 text-slate-600 font-semibold bg-white/50 px-2 py-1 rounded-lg">
                                                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                                    {new Date(h.date).toLocaleDateString("en-US", { day: "numeric", month: "short", weekday: "short" })}
                                                </div>
                                                {isSuperAdmin && (
                                                    <div className="flex gap-1 z-10 relative">
                                                        {h.status === "active" && (
                                                            <button onClick={() => openDismissDialog(h.id)} className="w-6 h-6 rounded-md flex items-center justify-center text-amber-600 hover:bg-amber-100 transition-colors" title="Dismiss Holiday"><Ban className="w-3.5 h-3.5" /></button>
                                                        )}
                                                        {h.status === "dismissed" && (
                                                            <button onClick={() => restoreHoliday.mutate(h.id)} className="w-6 h-6 rounded-md flex items-center justify-center text-green-600 hover:bg-green-100 transition-colors" title="Restore Holiday"><Undo2 className="w-3.5 h-3.5" /></button>
                                                        )}
                                                        <button onClick={() => confirmDeleteHoliday(h.id, h.name)} className="w-6 h-6 rounded-md flex items-center justify-center text-rose-500 hover:bg-rose-100 transition-colors" title="Delete Holiday"><Trash2 className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                )}
                                            </div>
                                        </BentoCard>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </motion.div>
        </motion.div>
    );
}
