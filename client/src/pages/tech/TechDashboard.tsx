import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Wrench,
    Package,
    CheckCircle2,
    Camera,
    Clock,
    AlertTriangle,
    RotateCcw,
    Search
} from "lucide-react";
import { format } from "date-fns";
import { BentoCard } from "../admin/bento/shared";
import { Button } from "@/components/ui/button";
import { fetchApi } from "@/lib/api";
import { getSafeJobDisplayRef } from "@shared/job-display-utils";
import { TechJobDrawer } from "./TechJobDrawer";
import { ScannerWidget } from "@/components/tech/ScannerWidget";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const inspectionOptions = [
    { value: "ok", label: "OK", icon: CheckCircle2, className: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
    { value: "ng", label: "NG", icon: AlertTriangle, className: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" },
    { value: "rework", label: "Rework", icon: RotateCcw, className: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100" },
] as const;

export function TechDashboard() {
    const [selectedJob, setSelectedJob] = useState<any | null>(null);
    const [isScanning, setIsScanning] = useState(false);
    const [search, setSearch] = useState("");
    const [statusMode, setStatusMode] = useState<"active" | "waiting" | "all" | "done">("active");
    const [inspectionFilter, setInspectionFilter] = useState<"pending" | "ng" | "rework" | "ok" | "all">("pending");
    const [visibleCount, setVisibleCount] = useState(24);
    const queryClient = useQueryClient();

    // Uses the dedicated workbench endpoint so technicians only see assigned work.
    const { data: queuePayload } = useQuery({
        queryKey: ['technician-jobs'],
        queryFn: async () => {
            return fetchApi<{
                items: any[];
                workNow?: any[];
                waiting?: any[];
                kpis?: { workNow: number; waiting: number; clarificationNeeded: number };
                total: number;
            }>('/technician/workbench/jobs');
        },
        refetchInterval: 30000,
    });
    const jobs = queuePayload?.items || [];

    const inspectionMutation = useMutation({
        mutationFn: async ({ job, result }: { job: any; result: "ok" | "ng" | "rework" }) => {
            const stamp = new Date().toLocaleString();
            const label = result.toUpperCase();
            const priorNote = job.inspectionNote || "";
            const nextNote = "[Inspection: " + label + "] " + stamp + (priorNote ? "\n" + priorNote : "");
            const oldResult = job.inspectionResult || "pending";
            return fetchApi('/technician/workbench/jobs/' + encodeURIComponent(job.id) + '/inspection', {
                method: "PATCH",
                body: JSON.stringify({
                    inspectionResult: result,
                    inspectionNote: nextNote,
                    reason: oldResult !== "pending" && oldResult !== result ? "Quick workbench correction" : undefined,
                }),
            });
        },
        onSuccess: (_, vars) => {
            queryClient.invalidateQueries({ queryKey: ["technician-jobs"] });
            queryClient.invalidateQueries({ queryKey: ["tech-active-jobs"] });
            toast.success("Marked " + vars.result.toUpperCase());
        },
        onError: (err: any) => {
            toast.error(err.message || "Failed to save inspection");
        },
    });

    // TECHNICIAN-FLOW-01B: work-now vs waiting (generic stickers only)
    const myActiveJobs = queuePayload?.kpis?.workNow
        ?? jobs.filter((j: any) => j.queueKind === "work_now" || j.status === "In Progress" || j.status === "Pending").length;
    const waitingCount = queuePayload?.kpis?.waiting
        ?? jobs.filter((j: any) => j.queueKind === "waiting").length;
    const completedToday = jobs.filter((j: any) =>
        j.status === "Completed" && j.completedAt && new Date(j.completedAt).toDateString() === new Date().toDateString()
    ).length;
    const inspectionCounts = jobs.reduce((acc: Record<string, number>, job: any) => {
        const result = job.inspectionResult || "pending";
        acc[result] = (acc[result] || 0) + 1;
        return acc;
    }, { pending: 0, ok: 0, ng: 0, rework: 0 });

    const filteredJobs = jobs
        .filter((j: any) => {
            if (statusMode === "active") return j.queueKind === "work_now" || (!j.queueKind && (j.status === "In Progress" || j.status === "Pending" || j.status === "Diagnosing" || j.status === "On Workbench" || j.status === "Testing"));
            if (statusMode === "waiting") return j.queueKind === "waiting" || j.status === "Pending Parts" || j.status === "Waiting on Parts" || j.status === "Awaiting Quote Approval" || j.status === "Awaiting Customer Decision" || j.status === "NG Review Pending";
            if (statusMode === "done") return j.status === "Completed" || j.status === "Delivered";
            return true;
        })
        .filter((j: any) => {
            if (inspectionFilter === "all") return true;
            return (j.inspectionResult || "pending") === inspectionFilter;
        })
        .filter((j: any) => {
            const q = search.trim().toLowerCase();
            if (!q) return true;
            return [j.id, j.ticketNumber, j.corporateJobNumber, j.device, j.issue, j.customer, j.customerName, j.status, j.waitingLabel, j.escalationReason]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(q));
        });
    const visibleJobs = filteredJobs.slice(0, visibleCount);

    const outlineClass = (job: any) => {
        const band = job.escalationOutline || "normal";
        if (band === "alarm") return "border-4 border-red-600 shadow-red-200 shadow-md";
        if (band === "red") return "border-2 border-red-500";
        if (band === "orange") return "border-2 border-orange-500";
        if (band === "amber") return "border-2 border-amber-400";
        if (job.queueKind === "waiting") return "border border-violet-200";
        return "border border-slate-200";
    };

    useEffect(() => {
        setVisibleCount(24);
    }, [search, statusMode, inspectionFilter]);

    const handleScanResult = (result: string) => {
        setIsScanning(false);
        // Clean up the URL if they scanned a full QR link instead of just an ID
        const jobId = result.split('/').pop()?.trim() || result.trim();

        const matchedJob = jobs.find((j: any) => j.id === jobId || j.corporateJobNumber === jobId);

        if (matchedJob) {
            setSelectedJob(matchedJob);
            toast.success("Job Ticket Found!");
        } else {
            toast.error("Ticket not found in your active queue.");
        }
    };

    return (
        <div className="min-h-screen space-y-4 bg-slate-50 p-3 md:space-y-6 md:bg-transparent md:p-0">
            {/* Header Area */}
            <div className="rounded-[2rem] bg-slate-950 p-5 text-white shadow-xl shadow-slate-200 md:flex md:items-center md:justify-between md:gap-4">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Technician floor</p>
                    <h1 className="mt-2 text-3xl font-black tracking-tight">Quick Workbench</h1>
                    <p className="mt-1 text-sm text-slate-300">
                        {myActiveJobs} active jobs. Tap OK, NG, or Rework without opening the full admin flow.
                    </p>
                </div>

                {/* The prominent Scanner CTA for Phase 3.2 */}
                <Button
                    size="lg"
                    className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg w-full md:w-auto"
                    onClick={() => setIsScanning(true)}
                >
                    <Camera className="w-5 h-5 mr-2" />
                    Scan Ticket / Part
                </Button>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search job, device, customer..."
                        className="h-11 rounded-2xl border-slate-200 bg-slate-50 pl-9"
                    />
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 rounded-2xl bg-slate-100 p-1">
                    {(["active", "waiting", "all", "done"] as const).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => setStatusMode(mode)}
                            className={cn("rounded-xl px-2 py-2 text-[11px] font-black capitalize transition-all", statusMode === mode ? "bg-white text-blue-700 shadow-sm" : "text-slate-500")}
                        >
                            {mode}
                        </button>
                    ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
                    {([
                        ["pending", "Pending", inspectionCounts.pending || 0],
                        ["ng", "NG", inspectionCounts.ng || 0],
                        ["rework", "Rework", inspectionCounts.rework || 0],
                        ["ok", "OK", inspectionCounts.ok || 0],
                        ["all", "All", jobs.length],
                    ] as const).map(([mode, label, count]) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => setInspectionFilter(mode)}
                            className={cn(
                                "rounded-2xl border px-3 py-3 text-left transition-all active:scale-[0.98]",
                                inspectionFilter === mode ? "border-blue-200 bg-blue-50 text-blue-700 shadow-sm" : "border-slate-100 bg-white text-slate-600"
                            )}
                        >
                            <span className="block text-xs font-black uppercase tracking-wide">{label}</span>
                            <span className="text-lg font-black">{count}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Primary Metrics Layer */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <BentoCard
                    title="Active Repairs"
                    icon={<Wrench className="w-5 h-5" />}
                    variant="vibrant"
                    className="bg-gradient-to-br from-blue-500 to-cyan-600"
                >
                    <div className="mt-4 flex flex-col justify-end h-full">
                        <h2 className="text-4xl font-bold mb-1">{myActiveJobs}</h2>
                        <p className="text-sm opacity-80">Jobs assigned to you</p>
                    </div>
                </BentoCard>
                <BentoCard
                    title="Waiting"
                    icon={<Package className="w-5 h-5" />}
                    variant="vibrant"
                    className="bg-gradient-to-br from-orange-500 to-amber-600"
                >
                    <div className="mt-4 flex flex-col justify-end h-full">
                        <h2 className="text-4xl font-bold mb-1">{waitingCount}</h2>
                        <p className="text-sm opacity-80">Blocked — not overdue</p>
                    </div>
                </BentoCard>
                <BentoCard
                    title="Completed Today"
                    icon={<CheckCircle2 className="w-5 h-5" />}
                    variant="vibrant"
                    className="bg-gradient-to-br from-emerald-500 to-teal-600"
                >
                    <div className="mt-4 flex flex-col justify-end h-full">
                        <h2 className="text-4xl font-bold mb-1">{completedToday}</h2>
                        <p className="text-sm opacity-80">Invoices finalized</p>
                    </div>
                </BentoCard>
            </div>

            {/* Active Jobs Pipeline */}
            <div className="mt-8 flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-semibold">Immediate Priority</h2>
                    <p className="text-xs text-slate-500">Showing {Math.min(visibleCount, filteredJobs.length)} of {filteredJobs.length} matched jobs</p>
                </div>
                {inspectionFilter !== "pending" && (
                    <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setInspectionFilter("pending")}>
                        Pending first
                    </Button>
                )}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {visibleJobs.map((job: any) => (
                    <BentoCard key={job.id} className={cn("hover:border-blue-200 transition-colors shadow-sm", outlineClass(job))}>
                        <div className="flex justify-between items-start mb-3">
                            <span className="text-xs font-mono font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
                                #{getSafeJobDisplayRef(job)}
                            </span>
                            <div className="flex flex-col items-end gap-1">
                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${job.priority === 'High' || job.priority === 'Urgent' || job.priority === 'Critical'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-slate-100 text-slate-700'
                                    }`}>
                                    {job.priority || 'Normal'}
                                </span>
                                {job.waitingLabel && (
                                    <span className="text-[10px] font-bold uppercase tracking-wide rounded-full bg-violet-100 px-2 py-0.5 text-violet-800">
                                        {job.waitingLabel}
                                    </span>
                                )}
                                {job.clarificationNeeded && (
                                    <span className="text-[10px] font-black uppercase tracking-wide rounded-full bg-red-600 px-2 py-0.5 text-white">
                                        Clarification needed
                                    </span>
                                )}
                            </div>
                        </div>

                        <h3 className="font-medium text-slate-900 truncate mb-1">{job.device}</h3>
                        <p className="text-sm text-slate-500 line-clamp-2 mb-1 h-10">{job.issue}</p>
                        {job.escalationReason && (
                            <p className="mb-3 text-xs font-semibold text-slate-600">{job.escalationReason}</p>
                        )}

                        <div className="mb-3 grid grid-cols-3 gap-2">
                            {inspectionOptions.map((option) => {
                                const Icon = option.icon;
                                const active = job.inspectionResult === option.value;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        disabled={inspectionMutation.isPending}
                                        onClick={() => inspectionMutation.mutate({ job, result: option.value })}
                                        className={cn("flex h-11 items-center justify-center gap-1 rounded-xl border text-xs font-black transition-all active:scale-[0.98]", option.className, active && "ring-2 ring-offset-1")}
                                    >
                                        <Icon className="h-3.5 w-3.5" />
                                        {option.label}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex items-center text-xs text-slate-500 mt-auto pt-3 border-t border-slate-100">
                            <Clock className="w-3.5 h-3.5 mr-1" />
                            {format(new Date(job.createdAt), "MMM d, h:mm a")}
                            <Button size="sm" variant="ghost" className="ml-auto h-8 rounded-lg px-2 text-xs" onClick={() => setSelectedJob(job)}>
                                Details
                            </Button>
                        </div>
                    </BentoCard>
                ))}
                {filteredJobs.length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-400 opacity-50" />
                        <p>Queue is empty! Great job.</p>
                    </div>
                )}
            </div>
            {visibleCount < filteredJobs.length && (
                <Button
                    variant="outline"
                    className="h-12 w-full rounded-2xl border-slate-200 bg-white"
                    onClick={() => setVisibleCount((count) => count + 24)}
                >
                    Load 24 more
                </Button>
            )}

            {/* Mobile-Friendly Detail Drawer */}
            <TechJobDrawer
                job={selectedJob}
                open={!!selectedJob}
                onOpenChange={(open) => !open && setSelectedJob(null)}
            />

            {/* Hardware-Accelerated Scanner Overlay */}
            {isScanning && (
                <ScannerWidget
                    onScan={handleScanResult}
                    onClose={() => setIsScanning(false)}
                />
            )}
        </div>
    );
}
