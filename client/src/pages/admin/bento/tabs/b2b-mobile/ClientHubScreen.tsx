import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { subMonths } from "date-fns";
import {
    ArrowLeft,
    FileText,
    Phone,
    User,
    MapPin,
    CreditCard,
    Briefcase,
    AlertTriangle,
    CheckCircle2,
    ArrowUpRight,
    Clock,
} from "lucide-react";
import { corporateApi } from "@/lib/api";
import { StatusBadge } from "../../shared";

const CLOSED_JOB_STATUSES = ["Delivered", "Completed", "Cancelled", "Abandoned", "Forfeited"];

interface ClientHubScreenProps {
    clientId: string;
    onBack: () => void;
    onOpenWorkspace: () => void;
}

export default function ClientHubScreen({ clientId, onBack, onOpenWorkspace }: ClientHubScreenProps) {
    const [statementMessage, setStatementMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const clientQuery = useQuery({
        queryKey: ["corporate-clients", clientId],
        queryFn: () => corporateApi.getOne(clientId),
    });

    const jobsQuery = useQuery({
        queryKey: ["corporate-clients", clientId, "jobs", "hub"],
        queryFn: () => corporateApi.getClientJobs(clientId, 1, 100),
    });

    const billsQuery = useQuery({
        queryKey: ["corporate-clients", clientId, "bills"],
        queryFn: () => corporateApi.getBills(clientId),
    });

    const statementMutation = useMutation({
        mutationFn: () => {
            const lastMonth = subMonths(new Date(), 1);
            return corporateApi.autoGenerateStatement({
                corporateClientId: clientId,
                year: lastMonth.getFullYear(),
                month: lastMonth.getMonth() + 1,
            });
        },
        onSuccess: () => {
            setStatementMessage({ type: "success", text: "Statement generated for last month." });
            setTimeout(() => setStatementMessage(null), 4000);
        },
        onError: (error: any) => {
            setStatementMessage({ type: "error", text: error?.message || "Couldn't generate statement. Try again." });
        },
    });

    const client = clientQuery.data;
    const jobs = jobsQuery.data?.jobs ?? [];
    const bills = billsQuery.data ?? [];

    const totalJobs = jobsQuery.data?.pagination?.total ?? jobs.length;
    const openRepairs = jobs.filter((j: any) => !CLOSED_JOB_STATUSES.includes(j.status)).length;
    const pendingInvoices = bills.filter((b: any) => b.paymentStatus !== "paid").length;
    const outstandingBalance = client?.outstandingBalance ?? 0;

    const recentActivity = [...jobs]
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);

    const isPremium = client?.clientClass === "b2b_corporate";

    if (clientQuery.isLoading) {
        return (
            <div className="flex h-full flex-col bg-slate-50">
                <HubHeader title="Loading..." onBack={onBack} />
                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                    <div className="h-40 animate-pulse rounded-2xl bg-white border border-slate-100" />
                    <div className="h-24 animate-pulse rounded-2xl bg-white border border-slate-100" />
                    <div className="grid grid-cols-2 gap-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-20 animate-pulse rounded-2xl bg-white border border-slate-100" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (clientQuery.isError || !client) {
        return (
            <div className="flex h-full flex-col bg-slate-50">
                <HubHeader title="Client" onBack={onBack} />
                <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                    <AlertTriangle className="text-rose-500" size={28} />
                    <p className="text-sm font-medium text-rose-700">Couldn't load this client.</p>
                    <button
                        onClick={() => clientQuery.refetch()}
                        className="rounded-full bg-rose-600 px-4 py-1.5 text-xs font-bold text-white transition active:scale-95"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col bg-slate-50">
            <HubHeader title={client.companyName} onBack={onBack} />

            <div className="flex-1 space-y-4 overflow-y-auto p-4 pb-8">
                {/* Client Info Card */}
                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                                {client.shortCode}
                            </span>
                            {isPremium && (
                                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-600">
                                    Premium Account
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="mt-4 space-y-2.5 text-sm">
                        <InfoRow icon={User} label={client.contactPerson || "No contact set"} />
                        <InfoRow icon={Phone} label={client.contactPhone || client.phone || "No phone on file"} />
                        {client.address && <InfoRow icon={MapPin} label={client.address} />}
                        <InfoRow icon={CreditCard} label={`Outstanding: BDT ${outstandingBalance.toLocaleString()}`} />
                        <InfoRow icon={Briefcase} label={`Billing: ${client.billingCycle || "monthly"}`} />
                    </div>
                </div>

                {/* Generate Statement */}
                <div>
                    <button
                        onClick={() => statementMutation.mutate()}
                        disabled={statementMutation.isPending}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3 text-sm font-bold text-white shadow-sm transition active:scale-[0.99] disabled:opacity-60"
                    >
                        <FileText size={16} />
                        {statementMutation.isPending ? "Generating..." : "Generate Statement"}
                    </button>

                    {statementMessage && (
                        <div
                            className={`mt-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium ${
                                statementMessage.type === "success"
                                    ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                                    : "border-rose-100 bg-rose-50 text-rose-700"
                            }`}
                        >
                            {statementMessage.type === "success" ? (
                                <CheckCircle2 size={14} />
                            ) : (
                                <AlertTriangle size={14} />
                            )}
                            {statementMessage.text}
                        </div>
                    )}
                </div>

                {/* Open Workspace */}
                <button
                    onClick={onOpenWorkspace}
                    className="flex w-full items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3.5 text-sm font-bold text-emerald-700 transition active:scale-[0.99]"
                >
                    Open Corporate Workspace
                    <ArrowUpRight size={16} />
                </button>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Total Jobs (YTD)" value={totalJobs} loading={jobsQuery.isLoading} />
                    <StatCard label="Open Repairs" value={openRepairs} loading={jobsQuery.isLoading} />
                    <StatCard label="Pending Invoices" value={pendingInvoices} loading={billsQuery.isLoading} />
                    <StatCard label="Outstanding" value={`BDT ${outstandingBalance.toLocaleString()}`} loading={false} />
                </div>

                {/* Recent Activity */}
                <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <h2 className="text-sm font-bold text-slate-800">Recent Activity</h2>
                    {jobsQuery.isLoading ? (
                        <div className="mt-3 space-y-2">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100" />
                            ))}
                        </div>
                    ) : recentActivity.length === 0 ? (
                        <p className="mt-3 text-sm text-slate-400">No activity recorded yet.</p>
                    ) : (
                        <ul className="mt-3 space-y-3">
                            {recentActivity.map((job: any) => (
                                <li key={job.id} className="flex items-start gap-3">
                                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                        <Clock size={13} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-slate-700">
                                            {job.device || job.corporateJobNumber || "Job"}
                                        </p>
                                        <p className="text-xs text-slate-400">
                                            {new Date(job.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <StatusBadge status={job.status} className="shrink-0 text-[10px] px-2 py-0.5" />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}

function HubHeader({ title, onBack }: { title: string; onBack: () => void }) {
    return (
        <header
            className="flex shrink-0 items-center gap-3 border-b border-slate-100 bg-white px-4 pb-3"
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
        >
            <button
                onClick={onBack}
                aria-label="Back to client list"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition active:scale-95"
            >
                <ArrowLeft size={18} />
            </button>
            <h1 className="truncate text-base font-bold text-slate-800">{title}</h1>
        </header>
    );
}

function InfoRow({ icon: Icon, label }: { icon: typeof User; label: string }) {
    return (
        <div className="flex items-center gap-2.5 text-slate-600">
            <Icon size={15} className="shrink-0 text-slate-400" />
            <span className="truncate">{label}</span>
        </div>
    );
}

function StatCard({ label, value, loading }: { label: string; value: string | number; loading: boolean }) {
    return (
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
            {loading ? (
                <div className="mt-2 h-6 w-12 animate-pulse rounded bg-slate-100" />
            ) : (
                <p className="mt-1 text-xl font-black text-slate-800">{value}</p>
            )}
        </div>
    );
}
