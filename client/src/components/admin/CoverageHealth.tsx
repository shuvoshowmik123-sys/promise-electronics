import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, AlertTriangle, Users, Loader2, XCircle } from "lucide-react";
import { permissionsApi } from "@/lib/api/adminApi";
import { cn } from "@/lib/utils";

const PERM_LABELS: Record<string, string> = {
    "serviceRequests.reply": "Reply to service requests",
    "serviceRequests.quote": "Send repair quotes",
    "jobs.assignTechnician": "Assign technicians",
    "jobs.reportOutcome": "Report repair outcomes",
    "pickup.assignDriver": "Assign drivers",
    "pickup.reschedule": "Reschedule pickups",
    "pos.processPayment": "Process payments",
    "corporateMessages.reply": "Reply to corporate messages",
    "repairJourney.customerUpdate": "Send customer updates",
    "users.inviteStaff": "Invite new staff",
};

export function CoverageHealth() {
    const { data, isLoading } = useQuery({
        queryKey: ["permCoverage"],
        queryFn: permissionsApi.getCoverage,
        staleTime: 30000,
    });

    if (isLoading) return <div className="flex items-center gap-2 py-3 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading coverage...</div>;
    if (!data) return null;

    const { healthPercentage, missing, singlePerson, covered, deprecatedUsers } = data;
    const barColor = healthPercentage >= 80 ? "bg-emerald-500" : healthPercentage >= 50 ? "bg-amber-500" : "bg-rose-500";

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-blue-600" />
                    <span className="text-xs font-black uppercase tracking-wider text-slate-400">Coverage Health</span>
                </div>
                <span className={cn("text-lg font-black", healthPercentage >= 80 ? "text-emerald-600" : healthPercentage >= 50 ? "text-amber-600" : "text-rose-600")}>{healthPercentage}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${healthPercentage}%` }} />
            </div>
            <div className="space-y-1.5">
                {missing.length > 0 && missing.map(p => (
                    <div key={p} className="flex items-start gap-2 text-xs">
                        <XCircle className="h-3.5 w-3.5 text-rose-500 shrink-0 mt-0.5" />
                        <span className="text-rose-700">{PERM_LABELS[p] || p} — <span className="font-bold">no one assigned</span></span>
                    </div>
                ))}
                {singlePerson.length > 0 && singlePerson.map(p => (
                    <div key={p} className="flex items-start gap-2 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                        <span className="text-amber-700">{PERM_LABELS[p] || p} — <span className="font-bold">only 1 person</span></span>
                    </div>
                ))}
                {missing.length === 0 && singlePerson.length === 0 && (
                    <div className="flex items-center gap-2 text-xs text-emerald-600">
                        <ShieldCheck className="h-3.5 w-3.5" /> All critical actions covered by 2+ staff.
                    </div>
                )}
                {deprecatedUsers.length > 0 && (
                    <div className="flex items-start gap-2 text-xs mt-2 pt-2 border-t border-slate-100">
                        <Users className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span className="text-slate-500">{deprecatedUsers.length} user{deprecatedUsers.length > 1 ? "s" : ""} on legacy broad permissions</span>
                    </div>
                )}
            </div>
        </div>
    );
}
