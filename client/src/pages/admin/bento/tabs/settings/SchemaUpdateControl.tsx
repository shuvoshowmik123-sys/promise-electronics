import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { schemaUpdateApi, type SchemaUpdateStatus } from "@/lib/api/adminApi";
import { Button } from "@/components/ui/button";

type Props = { variant: "mobile" | "desktop" };

function labelFor(status: SchemaUpdateStatus | undefined): string {
    if (!status) return "Checking";
    if (status.activeRun?.status === "running") return "Applying";
    if (status.activeRun?.status === "pending") return "Pending";
    if (status.ledger.state === "blocked") return "Blocked";
    if (status.ledger.pendingCount > 0) return "Update available";
    return "Up to date";
}

function toneFor(status: SchemaUpdateStatus | undefined): "ok" | "attention" | "neutral" {
    if (!status) return "neutral";
    if (status.activeRun || status.ledger.state === "blocked" || status.ledger.pendingCount > 0) return "attention";
    return "ok";
}

function timeLabel(value: string | null | undefined): string | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

export default function SchemaUpdateControl({ variant }: Props) {
    const status = useQuery({
        queryKey: ["schema-update-status"],
        queryFn: schemaUpdateApi.getStatus,
        staleTime: 15_000,
        retry: 1,
    });
    const data = status.data;
    const active = Boolean(data?.activeRun?.isActive);
    const blocked = data?.ledger.state === "blocked";
    const label = labelFor(data);
    const tone = toneFor(data);
    const statusClass = tone === "ok"
        ? "bg-emerald-50 text-emerald-700"
        : tone === "attention"
            ? "bg-amber-50 text-amber-700"
            : "bg-slate-100 text-slate-600";
    const borderClass = tone === "ok" ? "border-emerald-200" : tone === "attention" ? "border-amber-200" : "border-slate-200";
    const safeMessage = status.isError
        ? "Schema status is unavailable. No schema change was started."
        : data?.safeMessage
            ?? (blocked
                ? "Schema integrity must be reconciled before an update can run."
                : active
                    ? "A separately operated migration process is active."
                    : data?.ledger.pendingCount
                        ? "A reviewed schema update is available for the Windows operator utility."
                        : "The reviewed schema registry is current.");
    const latestTime = timeLabel(data?.activeRun?.requestedAt ?? data?.lastRun?.finishedAt ?? data?.lastRun?.requestedAt);
    const currentSchemaVersion = data?.ledger.mainSchemaVersion ?? "No recorded schema version";
    const lastReleaseVersion = data?.lastRun?.releaseVersion ?? data?.activeRun?.releaseVersion ?? "None";
    const refresh = () => void status.refetch();

    return (
        <div className={`flex items-start gap-3 border-l-2 ${borderClass} ${variant === "mobile" ? "px-4 py-3" : "mt-3 rounded-xl border border-slate-100 border-l-2 bg-slate-50/60 p-3"}`}>
            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${tone === "ok" ? "bg-emerald-100" : tone === "attention" ? "bg-amber-100" : "bg-slate-100"}`}>
                {status.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : blocked ? <ShieldAlert className="h-4 w-4 text-amber-600" /> : tone === "ok" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13px] font-semibold text-slate-900">Schema status</p>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${statusClass}`}>{label}</span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">{safeMessage}</p>
                {data && (
                    <>
                        <p className="mt-1 text-[11px] text-slate-400">Reviewed releases: {data.ledger.appliedCount} applied | {data.ledger.pendingCount} pending{latestTime ? ` | last activity ${latestTime}` : ""}</p>
                        <p className="mt-1 break-words text-[11px] text-slate-400">Current schema: {currentSchemaVersion} | Last run release: {lastReleaseVersion}</p>
                    </>
                )}
            </div>
            <Button type="button" variant="outline" size="sm" className={variant === "mobile" ? "h-10 w-10 shrink-0 p-0" : "h-8 shrink-0"} onClick={refresh} disabled={status.isFetching} aria-label="Refresh schema status">
                {status.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
        </div>
    );
}
