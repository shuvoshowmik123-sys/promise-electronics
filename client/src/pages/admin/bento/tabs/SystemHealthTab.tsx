import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, isBefore } from "date-fns";
import {
    AlertCircle, CheckCircle, Activity, ShieldAlert, ChevronRight, Info, Wrench, Calendar, ArrowRight
} from "lucide-react";
import { BentoCard, DashboardSkeleton } from "../shared";
import { jobTicketsApi, serviceRequestsApi, inventoryApi } from "@/lib/api";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SystemHealthTabProps {
    onNavigate?: (tab: string, searchQuery?: string, clientId?: string) => void;
}

export default function SystemHealthTab({ onNavigate }: SystemHealthTabProps) {
    const [selectedIssue, setSelectedIssue] = useState<any | null>(null);

    // Aggregated Health Check Query
    const { data: healthData, isLoading } = useQuery({
        queryKey: ["systemHealthAggregated"],
        queryFn: async () => {
            const [jobs, requests, inventory] = await Promise.all([
                jobTicketsApi.getAll(),
                serviceRequestsApi.getAll(),
                inventoryApi.getAll()
            ]);

            const issues: any[] = [];
            let resolvedCount = 0; // Mock count of resolved issues for demo

            // 1. Check for Overdue Jobs (Pending > 7 days)
            const overdueDate = subDays(new Date(), 7);
            jobs.items.forEach((job: any) => {
                if (job.status === 'Pending' && isBefore(new Date(job.createdAt), overdueDate)) {
                    const isCorporate = !!job.corporateClientId || !!job.corporateChallanId;

                    // For corporate jobs: always use corporateJobNumber as the searchable identifier.
                    // For walk-in jobs: use the JOB-XXXX id, or customer name as last resort.
                    const displayId = isCorporate
                        ? (job.corporateJobNumber || job.id)
                        : (job.id?.startsWith('JOB-') ? job.id : (job.customer || job.id));

                    issues.push({
                        id: `job-${job.id}`,
                        referenceId: displayId,
                        // searchKey is what gets put in the destination tab's search bar.
                        // For corporate jobs this MUST match job.corporateJobNumber.
                        searchKey: displayId,
                        type: isCorporate ? 'OVERDUE_CORP_JOB' : 'OVERDUE_JOB',
                        clientId: job.corporateClientId,
                        severity: 'High',
                        message: isCorporate
                            ? `Corporate Job #${displayId} — Pending for more than 7 days.`
                            : `${displayId} — Pending for more than 7 days.`,
                        createdAt: job.createdAt,
                        suggestion: {
                            cause: "Technician assignment delayed or parts unavailable.",
                            fix: "Assign priority or check parts status."
                        }
                    });
                }
                if (job.status === 'Completed') resolvedCount++;
            });

            // 2. Check for Pending Service Requests
            requests.items.forEach(req => {
                if (req.status === 'New') {
                    // req.ticketNumber is a real DB field (e.g., SRV-240213-001)
                    const displayId = req.ticketNumber || req.id;
                    issues.push({
                        id: `req-${req.id}`,
                        referenceId: displayId,
                        searchKey: displayId,
                        type: 'NEW_REQUEST',
                        severity: 'Medium',
                        message: `Service Request ${displayId} — Pending review.`,
                        createdAt: req.createdAt,
                        suggestion: {
                            cause: "New incoming customer request.",
                            fix: "Review details and convert to Job Ticket."
                        }
                    });
                }
            });

            // 3. Check for Critical Low Stock
            inventory.forEach((item: any) => {
                if (item.stock === 0) {
                    issues.push({
                        id: `inv-${item.id}`,
                        referenceId: item.name,
                        type: 'OUT_OF_STOCK',
                        severity: 'Critical',
                        message: `Item '${item.name}' is out of stock.`,
                        createdAt: new Date(), // Real-time
                        suggestion: {
                            cause: "High demand or missed restock.",
                            fix: "Order immediately to prevent service delays."
                        }
                    });
                }
            });

            return {
                issues,
                resolvedCount, // using completed jobs as a proxy for 'system health resolution' activity
                totalJobs: jobs.items.length
            };
        }
    });

    if (isLoading) return <DashboardSkeleton />;

    const issues = healthData?.issues || [];
    const resolvedCount = healthData?.resolvedCount || 0;

    // Mock "AI Accuracy" - could be based on successful completions vs rework
    const aiAccuracy = 94;

    const handleNavigateToIssue = (issue: any) => {
        if (!onNavigate) return;

        setSelectedIssue(null);
        // Small delay to let the dialog close smoothly before rapid tab switch
        setTimeout(() => {
            // Use searchKey (the value the search bar can match against)
            const key = issue.searchKey || issue.referenceId;
            switch (issue.type) {
                case 'OVERDUE_JOB':
                    onNavigate('jobs', key);
                    break;
                case 'OVERDUE_CORP_JOB':
                    onNavigate('b2b', key, issue.clientId);
                    break;
                case 'NEW_REQUEST':
                    onNavigate('service-requests', key);
                    break;
                case 'OUT_OF_STOCK':
                    onNavigate('inventory', key);
                    break;
            }
        }, 150);
    };

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <BentoCard className="h-[200px] bg-gradient-to-br from-orange-500 to-red-600" title="System Alerts" icon={<AlertCircle size={24} className="text-white" />} variant="vibrant">
                    <div className="text-3xl font-black tracking-tighter text-white drop-shadow-md font-mono mt-4">{issues.length}</div>
                    <div className="text-white/80 text-sm mt-2">Active Issues</div>
                </BentoCard>
                <BentoCard className="h-[200px] bg-gradient-to-br from-emerald-500 to-green-600" title="System Efficiency" icon={<CheckCircle size={24} className="text-white" />} variant="vibrant">
                    <div className="text-3xl font-black tracking-tighter text-white drop-shadow-md font-mono mt-4">{resolvedCount}</div>
                    <div className="text-white/80 text-sm mt-2">Processed Tasks</div>
                </BentoCard>
                <BentoCard className="h-[200px] bg-gradient-to-br from-blue-500 to-cyan-600" title="Health Score" icon={<Activity size={24} className="text-white" />} variant="vibrant">
                    <div className="text-3xl font-black tracking-tighter text-white drop-shadow-md font-mono mt-4">{aiAccuracy}%</div>
                    <div className="text-white/80 text-sm mt-2">Operational Health</div>
                </BentoCard>

                <BentoCard className="col-span-1 md:col-span-3 min-h-[500px]" title="Active System Diagnostics" icon={<ShieldAlert size={24} className="text-slate-400" />} variant="glass" disableHover>
                    <div className="space-y-4 overflow-y-auto max-h-[600px] p-2">
                        {issues.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
                                <CheckCircle className="w-12 h-12 text-emerald-500 mb-4" />
                                <h3 className="text-lg font-medium text-slate-700">All Systems Operational</h3>
                                <p className="text-slate-400">No critical issues detected across logs, jobs, or inventory.</p>
                            </div>
                        ) : issues.map((issue: any) => (
                            <div
                                key={issue.id}
                                className="p-4 bg-white/50 rounded-2xl border border-orange-200/50 shadow-sm hover:shadow-md transition-all cursor-pointer group relative overflow-hidden"
                                onClick={() => setSelectedIssue(issue)}
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent translate-x-[-100%] group-hover:animate-[shimmer_1.5s_infinite]" />
                                <div className="flex justify-between items-start mb-2 relative">
                                    <div className="font-mono text-xs text-orange-600 bg-orange-100/50 px-2 py-1 rounded-md border border-orange-200">
                                        {format(new Date(issue.createdAt), 'PPpp')}
                                    </div>
                                    <span className={cn(
                                        "text-xs font-bold text-white px-2 py-1 rounded-full",
                                        issue.severity === 'Critical' ? "bg-red-600" :
                                            issue.severity === 'High' ? "bg-orange-500" : "bg-blue-500"
                                    )}>
                                        {issue.severity}
                                    </span>
                                </div>
                                <div className="font-medium text-slate-800 break-all relative pr-6">
                                    {issue.message}
                                    <ChevronRight className="w-5 h-5 text-slate-300 absolute right-0 top-1/2 -translate-y-1/2 group-hover:text-primary transition-colors delay-75" />
                                </div>
                                <div className="mt-3 grid md:grid-cols-2 gap-3 relative">
                                    <div className="bg-slate-50/80 p-3 rounded-xl text-xs border border-slate-100">
                                        <span className="font-bold text-slate-500 block mb-1 flex items-center gap-1"><Info className="w-3 h-3" /> PROBABLE CAUSE</span>
                                        {issue.suggestion.cause}
                                    </div>
                                    <div className="bg-blue-50/80 p-3 rounded-xl text-xs border border-blue-100 text-slate-600">
                                        <span className="font-bold text-blue-500 block mb-1 flex items-center gap-1"><Wrench className="w-3 h-3" /> RECOMMENDED ACTION</span>
                                        {issue.suggestion.fix}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </BentoCard>
            </div>

            <Dialog open={!!selectedIssue} onOpenChange={(open) => !open && setSelectedIssue(null)}>
                <DialogContent className="sm:max-w-md md:max-w-lg p-0 overflow-hidden border-none shadow-2xl rounded-3xl">
                    {selectedIssue && (
                        <div className="flex flex-col h-full bg-slate-50">
                            {/* Header */}
                            <div className={cn(
                                "p-6 text-white relative overflow-hidden",
                                selectedIssue.severity === 'Critical' ? "bg-gradient-to-br from-red-600 to-rose-700" :
                                    selectedIssue.severity === 'High' ? "bg-gradient-to-br from-orange-500 to-red-600" :
                                        "bg-gradient-to-br from-blue-500 to-indigo-600"
                            )}>
                                <div className="absolute top-0 right-0 p-8 opacity-10">
                                    <ShieldAlert className="w-32 h-32" />
                                </div>
                                <div className="relative z-10 flex items-start justify-between">
                                    <div>
                                        <Badge variant="outline" className="text-white border-white/30 bg-white/10 mb-3 backdrop-blur-sm">
                                            {selectedIssue.type.replace('_', ' ')}
                                        </Badge>
                                        <h2 className="text-2xl font-bold font-heading mb-1">{selectedIssue.referenceId}</h2>
                                        <p className="text-white/80 text-sm flex items-center gap-1">
                                            <Calendar className="w-4 h-4" />
                                            Detected: {format(new Date(selectedIssue.createdAt), 'PPpp')}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="p-6 space-y-6">
                                <div>
                                    <h3 className="font-semibold text-slate-800 mb-2">Issue Description</h3>
                                    <p className="text-slate-600 text-sm leading-relaxed p-4 bg-white rounded-xl shadow-sm border border-slate-100">
                                        {selectedIssue.message}
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center">
                                                <Info className="w-3 h-3 text-orange-600" />
                                            </div>
                                            Diagnosis
                                        </h3>
                                        <div className="p-4 bg-orange-50 rounded-xl text-sm text-orange-800 border border-orange-100/50 h-full">
                                            {selectedIssue.suggestion.cause}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                                                <Wrench className="w-3 h-3 text-blue-600" />
                                            </div>
                                            Required Action
                                        </h3>
                                        <div className="p-4 bg-blue-50 rounded-xl text-sm text-blue-800 border border-blue-100/50 h-full">
                                            {selectedIssue.suggestion.fix}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="p-4 bg-slate-100 border-t border-slate-200 flex justify-end gap-3 rounded-b-3xl">
                                <Button variant="outline" onClick={() => setSelectedIssue(null)}>
                                    Discard
                                </Button>
                                <Button
                                    className={cn(
                                        "shadow-md gap-2 font-semibold",
                                        selectedIssue.severity === 'Critical' ? "bg-red-600 hover:bg-red-700" :
                                            selectedIssue.severity === 'High' ? "bg-orange-600 hover:bg-orange-700" :
                                                "bg-blue-600 hover:bg-blue-700"
                                    )}
                                    onClick={() => handleNavigateToIssue(selectedIssue)}
                                >
                                    Review in {
                                        selectedIssue.type === 'OVERDUE_JOB' ? 'Jobs' :
                                            selectedIssue.type === 'OVERDUE_CORP_JOB' ? 'Corporate Repairs' :
                                                selectedIssue.type === 'NEW_REQUEST' ? 'Requests' : 'Inventory'
                                    }
                                    <ArrowRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
