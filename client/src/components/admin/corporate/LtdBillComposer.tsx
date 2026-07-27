import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, FileText, Eye, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { corporateApi } from "@/lib/api";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { hasGranularPermission } from "@/lib/permissions";
import { toast } from "sonner";

interface Props {
    clientId: string;
    clientType?: string | null;
    onIssued?: (billId: string) => void;
}

const COLUMN_LABELS: Record<string, string> = {
    clientJobNumber: "Client Job No.",
    promiseJobNumber: "Promise Job No.",
    tvSerial: "TV Serial",
    brandModel: "Brand / Model",
    tvSize: "TV Size",
    service: "Service",
    amount: "Amount",
};

type Step = "select" | "preview";

export function LtdBillComposer({ clientId, clientType, onIssued }: Props) {
    const { user, permissions } = useAdminAuth();
    const queryClient = useQueryClient();
    const isLtd = clientType === "limited_company";
    const canCreate = hasGranularPermission(user?.role, permissions, "corporate.bills.create");

    const [step, setStep] = useState<Step>("select");
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const jobsQuery = useQuery({
        queryKey: ["ltdEligibleJobs", clientId],
        queryFn: () => corporateApi.getEligibleJobs(clientId),
        enabled: !!clientId && isLtd && canCreate,
    });

    const previewQuery = useQuery({
        queryKey: ["ltdBillPreview", clientId, Array.from(selected).sort()],
        queryFn: () => corporateApi.previewLtdBill(clientId, { jobIds: Array.from(selected) }),
        enabled: step === "preview" && selected.size > 0,
    });

    const issueMutation = useMutation({
        mutationFn: () => {
            const now = new Date();
            const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const periodEnd = now;
            return corporateApi.issueLtdBill(clientId, {
                jobIds: Array.from(selected),
                periodStart,
                periodEnd,
            });
        },
        onSuccess: (data) => {
            toast.success(`Bill issued: ${data.bill?.billNumber} — snapshot saved.`);
            queryClient.invalidateQueries({ queryKey: ["ltdEligibleJobs", clientId] });
            queryClient.invalidateQueries({ queryKey: ["corporateBills", clientId] });
            queryClient.invalidateQueries({ queryKey: ["corporate-clients", clientId, "bills"] });
            setSelected(new Set());
            setStep("select");
            onIssued?.(data.bill?.id);
        },
        onError: (err: Error) => toast.error(`Issue failed: ${err.message}`),
    });

    const jobs = jobsQuery.data ?? [];

    const toggleJob = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    if (!isLtd || !canCreate) return null;

    return (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100 bg-slate-50/60">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                </div>
                <div>
                    <h3 className="font-bold text-slate-800">Issue Corporate Ltd. Bill</h3>
                    <p className="text-xs text-slate-500">Select eligible jobs. The saved preset applies automatically — no layout editor here.</p>
                </div>
            </div>

            {step === "select" && (
                <div className="p-4 sm:p-5">
                    {jobsQuery.isLoading ? (
                        <div className="flex items-center justify-center p-8 text-slate-400">
                            <Loader2 className="w-5 h-5 animate-spin" />
                        </div>
                    ) : jobs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
                            <CheckCircle2 className="w-8 h-8 text-emerald-300 mb-2" />
                            <p className="text-sm">No eligible unbilled jobs for this client.</p>
                        </div>
                    ) : (
                        <>
                            <div className="max-h-72 overflow-auto rounded-xl border border-slate-100 divide-y divide-slate-100">
                                {jobs.map((job) => (
                                    <label
                                        key={job.id}
                                        className="flex items-start gap-3 px-3 py-3 cursor-pointer hover:bg-slate-50"
                                    >
                                        <Checkbox
                                            checked={selected.has(job.id)}
                                            onCheckedChange={() => toggleJob(job.id)}
                                            className="mt-0.5"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                                <span className="font-semibold text-sm text-slate-800">{job.promiseJobNumber}</span>
                                                {job.clientJobNumber && (
                                                    <span className="text-xs text-slate-500">· {job.clientJobNumber}</span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-500 truncate">
                                                {[
                                                    [job.device, job.modelNumber].filter(Boolean).join(" "),
                                                    job.tvSerialNumber,
                                                    job.screenSize,
                                                ].filter(Boolean).join(" · ") || job.reportedDefect || "Repair"}
                                            </div>
                                        </div>
                                        <div className="text-sm font-semibold tabular-nums text-slate-700 shrink-0">
                                            ৳ {(job.estimatedCost || 0).toFixed(2)}
                                        </div>
                                    </label>
                                ))}
                            </div>
                            <div className="mt-4 flex items-center justify-between gap-3">
                                <span className="text-xs text-slate-500">
                                    {selected.size} job{selected.size === 1 ? "" : "s"} selected
                                </span>
                                <Button
                                    onClick={() => setStep("preview")}
                                    disabled={selected.size === 0}
                                    className="gap-2 rounded-xl"
                                >
                                    <Eye className="w-4 h-4" /> Read-only preview
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {step === "preview" && (
                <div className="p-4 sm:p-5">
                    {previewQuery.isLoading ? (
                        <div className="flex items-center justify-center p-8 text-slate-400">
                            <Loader2 className="w-5 h-5 animate-spin" />
                        </div>
                    ) : previewQuery.data ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                Read-only preview. The saved preset applies automatically. Issuing saves an immutable snapshot.
                            </div>

                            <div className="rounded-xl border border-slate-100 overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                                        <tr>
                                            {previewQuery.data.preset.enabledColumns.map((col: string) => (
                                                <th key={col} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                                                    {COLUMN_LABELS[col] || col}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {previewQuery.data.lines.map((line: any, i: number) => (
                                            <tr key={i} className="hover:bg-slate-50/50">
                                                {previewQuery.data.preset.enabledColumns.map((col: string) => (
                                                    <td key={col} className="px-3 py-2 text-slate-700">
                                                        {col === "amount"
                                                            ? `৳ ${Number(line.amount || 0).toFixed(2)}`
                                                            : (line as any)[col] || "—"}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="flex items-center justify-between rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                                <span className="text-sm text-slate-500">Subtotal</span>
                                <span className="font-bold tabular-nums text-slate-800">৳ {previewQuery.data.subtotal.toFixed(2)}</span>
                            </div>

                            <div className="flex items-center justify-between gap-3">
                                <Button variant="outline" onClick={() => setStep("select")} className="rounded-xl">
                                    Back
                                </Button>
                                <Button
                                    onClick={() => issueMutation.mutate()}
                                    disabled={issueMutation.isPending}
                                    className="gap-2 rounded-xl"
                                >
                                    {issueMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                    Issue bill
                                </Button>
                            </div>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}
