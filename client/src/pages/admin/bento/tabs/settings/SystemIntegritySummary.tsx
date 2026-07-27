import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Database, Loader2, RefreshCw, ShieldCheck, TimerReset } from "lucide-react";
import { adminSystemStatusApi, type SchedulerQueueCounts } from "@/lib/api/adminApi";
import { Button } from "@/components/ui/button";
import { BentoCard } from "../../shared/BentoCard";
import SystemIncidentsPanel from "./SystemIncidentsPanel";
import SchemaUpdateControl from "./SchemaUpdateControl";

type Props = {
    variant: "mobile" | "desktop";
};

type StatusTone = "healthy" | "attention" | "unavailable" | "checking";

type SchedulerSource = {
    label: string;
    counts: SchedulerQueueCounts;
};

function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
    const colorClass = tone === "healthy"
        ? "bg-emerald-50 text-emerald-700"
        : tone === "unavailable"
            ? "bg-slate-100 text-slate-600"
            : tone === "checking"
                ? "bg-slate-100 text-slate-600"
                : "bg-amber-50 text-amber-700";

    return (
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${colorClass}`}>
            {label}
        </span>
    );
}

function schedulerSourceSummary(counts: SchedulerQueueCounts): string {
    if (Object.values(counts).some((value) => value === null)) return "Status unavailable";

    const needsAttention = (counts.failed ?? 0) + (counts.expiredLease ?? 0);
    if (needsAttention > 0) return `${needsAttention} need attention`;
    if ((counts.retrying ?? 0) > 0) return `${counts.retrying} retrying`;
    if ((counts.active ?? 0) > 0) return `${counts.active} in progress`;
    if ((counts.pending ?? 0) > 0) return `${counts.pending} waiting`;
    return "Up to date";
}

function schedulerSourceTone(counts: SchedulerQueueCounts): StatusTone {
    if (Object.values(counts).some((value) => value === null)) return "unavailable";
    if ((counts.failed ?? 0) > 0 || (counts.expiredLease ?? 0) > 0 || (counts.retrying ?? 0) > 0) return "attention";
    return "healthy";
}

export default function SystemIntegritySummary({ variant }: Props) {
    const status = useQuery({
        queryKey: ["admin-system-status"],
        queryFn: adminSystemStatusApi.get,
        staleTime: 60_000,
        retry: 1,
    });

    const data = status.data;
    const lineageHealthy = data?.journeyLineage.status === "healthy";
    const lineageUnavailable = data?.journeyLineage.status === "unavailable";
    const scheduler = data?.schedulerIntegrity;
    const schedulerUnavailable = status.isError || scheduler?.status === "unavailable";
    const schedulerAttention = scheduler?.status === "attention";
    const ledgerLabel = !data ? "Checking" : data.ledgerHealthy ? "Verified" : "Needs review";
    const ledgerTone: StatusTone = !data ? "checking" : data.ledgerHealthy ? "healthy" : "attention";
    const lineageLabel = !data ? "Checking" : lineageUnavailable ? "Unavailable" : lineageHealthy ? "Healthy" : "Needs review";
    const lineageTone: StatusTone = !data ? "checking" : lineageUnavailable ? "unavailable" : lineageHealthy ? "healthy" : "attention";
    const schedulerLabel = status.isError ? "Unavailable" : !data ? "Checking" : schedulerUnavailable ? "Unavailable" : schedulerAttention ? "Needs attention" : "Working normally";
    const schedulerTone: StatusTone = status.isError ? "unavailable" : !data ? "checking" : schedulerUnavailable ? "unavailable" : schedulerAttention ? "attention" : "healthy";
    const schedulerDescription = status.isError || schedulerUnavailable
            ? "Scheduled work could not be checked."
            : !data
                ? "Checking scheduled work"
                : schedulerAttention
                ? "Some scheduled work needs review"
                : "Reminders, messages, backup, and day-end are up to date";
    const schedulerSources: SchedulerSource[] = scheduler
        ? [
            { label: "Reminders", counts: scheduler.reminders },
            { label: "Customer messages", counts: scheduler.smsOutbox },
            { label: "Daily backup", counts: scheduler.scheduledBackups },
            { label: "Day-end close", counts: scheduler.drawerDayClose },
        ]
        : [];

    const refresh = () => void status.refetch();

    const mobileRows = (
        <>
            <div className="flex items-center gap-3 px-4 py-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${data?.ledgerHealthy ? "bg-emerald-100" : "bg-amber-100"}`}>
                    {status.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : data?.ledgerHealthy ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-slate-900">Schema ledger</p>
                    <p className="text-[11px] text-slate-500">{data ? `${data.appliedCount} of ${data.registryCount} releases recorded` : "Checking release records"}</p>
                </div>
                <StatusBadge tone={ledgerTone} label={ledgerLabel} />
            </div>
            <SchemaUpdateControl variant="mobile" />
            <div className="flex items-center gap-3 px-4 py-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${lineageHealthy ? "bg-emerald-100" : "bg-amber-100"}`}>
                    {status.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : lineageHealthy ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Database className="h-4 w-4 text-amber-600" />}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-slate-900">Journey links</p>
                    <p className="text-[11px] text-slate-500">{lineageUnavailable ? "Could not check data links" : data ? `${data.journeyLineage.coalesceMissingParentCount ?? 0} records need review` : "Checking data links"}</p>
                </div>
                <StatusBadge tone={lineageTone} label={lineageLabel} />
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${schedulerTone === "healthy" ? "bg-emerald-100" : schedulerTone === "unavailable" || schedulerTone === "checking" ? "bg-slate-100" : "bg-amber-100"}`}>
                    {status.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : schedulerTone === "healthy" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : schedulerTone === "unavailable" ? <Database className="h-4 w-4 text-slate-500" /> : <TimerReset className="h-4 w-4 text-amber-600" />}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-slate-900">Scheduled work</p>
                    <p className="text-[11px] text-slate-500">{schedulerDescription}</p>
                </div>
                <StatusBadge tone={schedulerTone} label={schedulerLabel} />
            </div>
            {status.isError && <p className="px-4 pb-3 text-[11px] font-medium text-amber-700">System status could not be refreshed.</p>}
            <SystemIncidentsPanel variant="mobile" />
        </>
    );

    if (variant === "mobile") return mobileRows;

    return (
        <BentoCard title="System Integrity" icon={<ShieldCheck className="h-5 w-5 text-blue-600" />} variant="glass">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-sm font-semibold text-slate-800">Release and data health</p>
                    <p className="mt-1 text-xs text-slate-500">Read-only status from the protected system check.</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" onClick={refresh} disabled={status.isFetching}>
                    {status.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    <span className="ml-1.5">Refresh</span>
                </Button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="border-l-2 border-slate-200 pl-3">
                    <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-600">Schema ledger</p><StatusBadge tone={ledgerTone} label={ledgerLabel} /></div>
                    <p className="mt-2 text-sm font-bold text-slate-900">{data ? `${data.appliedCount} / ${data.registryCount}` : "Checking"}</p>
                    <p className="mt-1 text-xs text-slate-500">{data?.registryHeadVersion ?? "No release version available"}</p>
                </div>
                <div className={`border-l-2 pl-3 ${lineageHealthy ? "border-emerald-300" : "border-amber-300"}`}>
                    <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-600">Journey links</p><StatusBadge tone={lineageTone} label={lineageLabel} /></div>
                    <p className="mt-2 text-sm font-bold text-slate-900">{lineageUnavailable ? "Check unavailable" : data ? `${data.journeyLineage.coalesceMissingParentCount ?? 0} need review` : "Checking"}</p>
                    <p className="mt-1 text-xs text-slate-500">{lineageUnavailable ? "No data result available" : `${data?.journeyLineage.totalJourneys ?? 0} journeys checked`}</p>
                </div>
                <div className={`sm:col-span-2 border-l-2 pl-3 ${schedulerTone === "healthy" ? "border-emerald-300" : schedulerTone === "unavailable" || schedulerTone === "checking" ? "border-slate-300" : "border-amber-300"}`}>
                    <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-600">Scheduled work</p><StatusBadge tone={schedulerTone} label={schedulerLabel} /></div>
                    <p className="mt-2 text-sm font-bold text-slate-900">{schedulerDescription}</p>
                    {schedulerSources.length > 0 && (
                        <div className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                            {schedulerSources.map((source) => (
                                <div key={source.label} className="flex items-center justify-between gap-3 text-xs">
                                    <span className="min-w-0 font-medium text-slate-600">{source.label}</span>
                                    <span className={schedulerSourceTone(source.counts) === "healthy" ? "shrink-0 text-emerald-700" : schedulerSourceTone(source.counts) === "unavailable" ? "shrink-0 text-slate-600" : "shrink-0 text-amber-700"}>{schedulerSourceSummary(source.counts)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <SchemaUpdateControl variant="desktop" />
            {status.isError && <p className="mt-3 text-xs font-medium text-amber-700">System status could not be refreshed.</p>}
            <SystemIncidentsPanel variant="desktop" />
        </BentoCard>
    );
}
