import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { BentoCard } from "../../shared/BentoCard";
import { ShieldAlert, TrendingUp, AlertTriangle, CheckCircle, XCircle, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export function AdvisoryDashboardSubTab() {
    const { toast } = useToast();

    // Fetch Increment Suggestions
    const { data: increments, isLoading: isLoadingIncrements } = useQuery<any[]>({
        queryKey: ['/api/admin/hr/increment-suggestions'],
    });

    // Fetch Deduction Proposals
    const { data: deductions, isLoading: isLoadingDeductions } = useQuery<any[]>({
        queryKey: ['/api/admin/payroll/deduction-proposals'],
    });

    const pendingIncrements = increments?.filter(i => i.status === 'pending') || [];
    const pendingDeductions = deductions?.filter(d => d.status === 'pending') || [];

    const resolveIncrementMutation = useMutation({
        mutationFn: async ({ id, status, adminDecisionAmount, adminNotes }: any) => {
            const res = await apiRequest("PATCH", `/api/admin/hr/increment-suggestions/${id}`, { status, adminDecisionAmount, adminNotes });
            return await res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/api/admin/hr/increment-suggestions'] });
            toast({ title: "Increment suggestion resolved successfully." });
        }
    });

    const resolveDeductionMutation = useMutation({
        mutationFn: async ({ id, status, approvedAmount, adminNotes }: any) => {
            const res = await apiRequest("PATCH", `/api/admin/payroll/deduction-proposals/${id}`, { status, approvedAmount, adminNotes });
            return await res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/api/admin/payroll/deduction-proposals'] });
            toast({ title: "Deduction proposal resolved successfully." });
        }
    });

    return (
        <div className="flex flex-col gap-6 w-full">
            {/* ── Header ── */}
            <BentoCard variant="ghost" className="bg-indigo-600 border-0 shadow-sm p-6 sm:p-8 rounded-[1.5rem] overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-2 rounded-xl bg-white/20 text-white backdrop-blur-sm">
                                <ShieldAlert className="w-6 h-6" />
                            </div>
                            <h2 className="text-2xl font-bold text-white tracking-tight">Advisory Dashboard</h2>
                        </div>
                        <p className="text-indigo-100 max-w-xl text-sm leading-relaxed">
                            Super Admin Exclusive Area. Review system-generated increment suggestions and deduction proposals.
                            Your decisions will directly impact the next payroll generation.
                        </p>
                    </div>
                    <div className="flex items-center gap-3 bg-white/10 p-3 rounded-2xl backdrop-blur-sm">
                        <div className="text-center px-4 border-r border-white/20">
                            <p className="text-3xl font-black text-white">{pendingIncrements.length}</p>
                            <p className="text-[10px] text-indigo-200 uppercase tracking-widest font-bold">Increments</p>
                        </div>
                        <div className="text-center px-4">
                            <p className="text-3xl font-black text-white">{pendingDeductions.length}</p>
                            <p className="text-[10px] text-indigo-200 uppercase tracking-widest font-bold">Deductions</p>
                        </div>
                    </div>
                </div>
            </BentoCard>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
                {/* ── Increment Suggestions ── */}
                <BentoCard variant="ghost" className="bg-white border border-slate-200 shadow-sm p-0 rounded-[1.5rem] overflow-hidden flex flex-col min-h-[400px]" disableHover>
                    <div className="p-4 sm:p-5 border-b border-slate-50 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                                <TrendingUp className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-700 leading-tight">Increment Suggestions</h3>
                                <p className="text-[10px] text-slate-500">Based on tenure and performance</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 p-4 sm:p-5 overflow-auto bg-slate-50/50">
                        {isLoadingIncrements ? (
                            <div className="flex items-center justify-center h-40">
                                <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
                            </div>
                        ) : pendingIncrements.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 text-center">
                                <CheckCircle className="w-10 h-10 text-emerald-200 mb-3" />
                                <p className="text-sm font-semibold text-slate-600">All caught up!</p>
                                <p className="text-xs text-slate-400 mt-1">No pending increment suggestions.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {pendingIncrements.map((inc) => (
                                    <div key={inc.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm relative overflow-hidden group">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-0 text-[10px] px-2 mb-2 rounded-md">
                                                    {inc.suggestionReason.replace(/_/g, ' ')}
                                                </Badge>
                                                <h4 className="font-bold text-slate-800 text-base">{inc.user?.name || `User ID: ${inc.userId}`}</h4>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xl font-bold text-emerald-600">+{inc.suggestedIncreasePercent}%</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-xl mb-4 border border-slate-100">
                                            <div className="flex-1">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Current Base</p>
                                                <p className="text-sm font-semibold text-slate-700">৳{inc.currentBaseAmount?.toLocaleString()}</p>
                                            </div>
                                            <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                                            <div className="flex-1 text-right">
                                                <p className="text-[10px] font-bold text-emerald-500/70 uppercase tracking-widest mb-1">Suggested Base</p>
                                                <p className="text-lg font-bold text-emerald-600">৳{inc.suggestedBaseAmount?.toLocaleString()}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                                            <Button
                                                size="sm"
                                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-9"
                                                onClick={() => resolveIncrementMutation.mutate({ id: inc.id, status: 'approved' })}
                                            >
                                                Approve
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="flex-1 border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl h-9"
                                                onClick={() => resolveIncrementMutation.mutate({ id: inc.id, status: 'dismissed', adminNotes: 'Dismissed by Super Admin' })}
                                            >
                                                Dismiss
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </BentoCard>

                {/* ── Deduction Proposals ── */}
                <BentoCard variant="ghost" className="bg-white border border-slate-200 shadow-sm p-0 rounded-[1.5rem] overflow-hidden flex flex-col min-h-[400px]" disableHover>
                    <div className="p-4 sm:p-5 border-b border-slate-50 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-2">
                            <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
                                <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-700 leading-tight">Deduction Proposals</h3>
                                <p className="text-[10px] text-slate-500">Based on attendance & performance</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 p-4 sm:p-5 overflow-auto bg-slate-50/50">
                        {isLoadingDeductions ? (
                            <div className="flex items-center justify-center h-40">
                                <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
                            </div>
                        ) : pendingDeductions.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 text-center">
                                <CheckCircle className="w-10 h-10 text-emerald-200 mb-3" />
                                <p className="text-sm font-semibold text-slate-600">All caught up!</p>
                                <p className="text-xs text-slate-400 mt-1">No pending deduction proposals.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {pendingDeductions.map((deduct) => (
                                    <div key={deduct.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm relative overflow-hidden group">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-rose-500" />
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100 border-0 text-[10px] px-2 mb-2 rounded-md uppercase font-bold tracking-wider">
                                                    {deduct.proposalType.replace(/_/g, ' ')}
                                                </Badge>
                                                <h4 className="font-bold text-slate-800 text-base">{deduct.user?.name || `User ID: ${deduct.userId}`}</h4>
                                                <p className="text-xs text-slate-500 mt-1">{deduct.description}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Calculated</p>
                                                <p className="text-xl font-bold text-rose-600">৳{deduct.calculatedAmount?.toLocaleString()}</p>
                                                <p className="text-[10px] text-slate-400 font-mono mt-1">{deduct.month}</p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                                            <Button
                                                size="sm"
                                                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white rounded-xl h-9"
                                                onClick={() => resolveDeductionMutation.mutate({ id: deduct.id, status: 'approved' })}
                                            >
                                                Approve
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="flex-1 border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl h-9"
                                                onClick={() => resolveDeductionMutation.mutate({ id: deduct.id, status: 'dismissed', adminNotes: 'Dismissed by Super Admin' })}
                                            >
                                                Dismiss
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </BentoCard>
            </div>
        </div>
    );
}
