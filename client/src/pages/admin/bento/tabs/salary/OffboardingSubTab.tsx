import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { BentoCard } from "../../shared/BentoCard";
import { LogOut, Search, Plus, Loader2, ArrowRight, CheckCircle2, Calculator, Check, CheckCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatusBadge } from "../../shared/StatusBadge";

export function OffboardingSubTab() {
    const { toast } = useToast();
    const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

    // Fetch offboarding cases
    const { data: cases, isLoading } = useQuery<any[]>({
        queryKey: ['/api/admin/hr/offboarding'],
    });

    const activeCases = cases?.filter(c => c.status !== 'closed') || [];
    const closedCases = cases?.filter(c => c.status === 'closed') || [];

    const selectedCase = cases?.find(c => c.id === selectedCaseId);

    const approveSettlementMutation = useMutation({
        mutationFn: async ({ id, status }: any) => {
            const res = await apiRequest("PATCH", `/api/admin/hr/offboarding/${id}/pay`, { status });
            return await res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/api/admin/hr/offboarding'] });
            toast({ title: "Settlement marked as paid successfully." });
        }
    });

    return (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full h-[600px]">
            {/* ── Case List (Left Panel) ── */}
            <BentoCard variant="ghost" className="md:col-span-4 bg-white border border-slate-200 shadow-sm p-0 flex flex-col h-full rounded-[1.5rem] overflow-hidden" disableHover>
                <div className="p-4 border-b border-slate-50 shrink-0 flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-slate-700 leading-tight">Offboarding Cases</h3>
                        <p className="text-[10px] text-slate-500">Resignations & Terminations</p>
                    </div>
                    <Button size="icon" className="h-8 w-8 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-full shrink-0">
                        <Plus className="w-4 h-4" />
                    </Button>
                </div>

                <ScrollArea className="flex-1 bg-slate-50/50">
                    {isLoading ? (
                        <div className="flex items-center justify-center p-8">
                            <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
                        </div>
                    ) : cases?.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-sm">
                            No offboarding cases found.
                        </div>
                    ) : (
                        <div className="p-2 space-y-1 block">
                            {cases?.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => setSelectedCaseId(c.id)}
                                    className={`w-full text-left p-3 rounded-xl transition-all duration-200 flex flex-col gap-2 group ${selectedCaseId === c.id ? 'bg-orange-50 border border-orange-100' : 'hover:bg-white border border-transparent'}`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold ${selectedCaseId === c.id ? 'bg-orange-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                                {c.user?.name?.charAt(0).toUpperCase() || '?'}
                                            </div>
                                            <p className={`text-sm font-semibold truncate ${selectedCaseId === c.id ? 'text-orange-900' : 'text-slate-700'}`}>
                                                {c.user?.name || `User: ${c.userId}`}
                                            </p>
                                        </div>
                                        {selectedCaseId === c.id && <ArrowRight className="w-4 h-4 text-orange-500 shrink-0" />}
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <Badge variant="outline" className={`text-[9px] uppercase font-bold tracking-wider rounded border-0 px-1.5 py-0 ${c.offboardingType === 'resignation' ? 'bg-blue-50 text-blue-600' : 'bg-rose-50 text-rose-600'}`}>
                                            {c.offboardingType}
                                        </Badge>
                                        <StatusBadge status={c.status === 'draft' ? "Pending Settlement" : c.status === 'paid' ? "Paid & Closed" : c.status} />
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </BentoCard>

            {/* ── Case Details & Settlement (Right Panel) ── */}
            <BentoCard variant="ghost" className="md:col-span-8 bg-white border border-slate-200 shadow-sm p-0 flex flex-col h-full rounded-[1.5rem] overflow-hidden" disableHover>
                {selectedCaseId && selectedCase ? (
                    <div className="flex flex-col h-full">
                        {/* Header */}
                        <div className="p-5 border-b border-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 bg-orange-50/30">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="font-bold text-slate-800 text-lg">{selectedCase.user?.name || `User ID: ${selectedCase.userId}`}</h3>
                                    <StatusBadge status={selectedCase.status === 'draft' ? "Pending Settlement" : selectedCase.status === 'paid' ? "Paid & Closed" : selectedCase.status} />
                                </div>
                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                    <LogOut className="w-3.5 h-3.5" />
                                    Type: <span className="font-medium capitalize">{selectedCase.offboardingType}</span>
                                </p>
                            </div>
                        </div>

                        {/* Content */}
                        <ScrollArea className="flex-1 p-6 bg-slate-50/30">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                {/* Details Card */}
                                <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
                                    <h4 className="font-semibold text-slate-700 mb-4 flex items-center gap-1.5">
                                        <FileText className="w-4 h-4 text-slate-400" />
                                        Case Details
                                    </h4>
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-500">Notice Served:</span>
                                            <span className="font-medium text-slate-700">{selectedCase.noticeServedDays} Days</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-500">Last Working Date:</span>
                                            <span className="font-medium text-slate-700">{selectedCase.lastWorkingDate ? format(new Date(selectedCase.lastWorkingDate), 'PP') : 'N/A'}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-slate-500">Settlement Due:</span>
                                            <span className="font-medium text-slate-700">{selectedCase.settlementDueDate ? format(new Date(selectedCase.settlementDueDate), 'PP') : 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Settlement Actions */}
                                <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex flex-col justify-center">
                                    {selectedCase.status === 'draft' ? (
                                        <div className="text-center">
                                            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-3 border border-slate-100">
                                                <Calculator className="w-6 h-6 text-slate-400" />
                                            </div>
                                            <p className="text-sm font-medium text-slate-700 mb-3">Final settlement not generated yet</p>
                                            <Button size="sm" className="bg-slate-800 hover:bg-slate-900 text-white rounded-xl">
                                                Generate Preview
                                            </Button>
                                        </div>
                                    ) : selectedCase.status === 'approved' ? (
                                        <div className="text-center">
                                            <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center mx-auto mb-3 border border-orange-100">
                                                <Calculator className="w-6 h-6 text-orange-500" />
                                            </div>
                                            <p className="text-sm font-medium text-slate-700 mb-1">Settlement Approved</p>
                                            <p className="text-xs text-slate-500 mb-4">Awaiting final disbursement</p>
                                            <Button
                                                size="sm"
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
                                                onClick={() => approveSettlementMutation.mutate({ id: selectedCase.id, status: 'paid' })}
                                            >
                                                <Check className="w-4 h-4 mr-1.5" />
                                                Mark as Paid & Close
                                            </Button>
                                        </div>
                                    ) : selectedCase.status === 'paid' ? (
                                        <div className="text-center">
                                            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3 border border-emerald-100">
                                                <CheckCircle className="w-6 h-6 text-emerald-500" />
                                            </div>
                                            <p className="text-sm font-bold text-emerald-700 mb-1">Settlement Paid</p>
                                            <p className="text-xs text-slate-500">Lifecycle completed successfully.</p>
                                        </div>
                                    ) : null}
                                </div>
                            </div>

                            {/* Hypothetical Settlement View */}
                            {(selectedCase.status === 'approved' || selectedCase.status === 'paid') && (
                                <div className="bg-slate-800 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden">
                                    <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/5 rounded-full blur-2xl pointer-events-none" />
                                    <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-2xl pointer-events-none" />

                                    <h4 className="font-bold text-lg mb-4 flex items-center gap-2">
                                        Settlement Summary
                                    </h4>
                                    <div className="grid grid-cols-3 gap-6 mb-6">
                                        <div>
                                            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Gross Final</p>
                                            <p className="text-xl font-medium">৳0</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-rose-400 uppercase tracking-widest font-bold mb-1">Deductions</p>
                                            <p className="text-xl font-medium text-rose-300">-৳0</p>
                                        </div>
                                        <div className="bg-white/10 p-3 rounded-xl border border-white/20">
                                            <p className="text-[10px] text-emerald-300 uppercase tracking-widest font-bold mb-1">Net Payable</p>
                                            <p className="text-2xl font-bold text-emerald-400">৳0</p>
                                        </div>
                                    </div>
                                    <div className="opacity-60 text-xs italic">Full component breakdown available in generated PDF.</div>
                                </div>
                            )}
                        </ScrollArea>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500 h-full bg-slate-50/50">
                        <div className="w-16 h-16 rounded-full bg-orange-50 flex items-center justify-center mb-4 border-4 border-white shadow-sm">
                            <LogOut className="w-6 h-6 text-orange-400" />
                        </div>
                        <p className="text-base font-semibold text-slate-700 mb-1">Select a case</p>
                        <p className="text-sm text-slate-400 max-w-[250px]">Choose an offboarding case from the list to view settlement details and take actions.</p>
                    </div>
                )}
            </BentoCard>
        </div>
    );
}
