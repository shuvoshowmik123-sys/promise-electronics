import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    ArrowLeft,
    X,
    Search,
    ChevronDown,
    Wrench,
    Truck,
    Receipt,
    AlertTriangle,
    Inbox,
} from "lucide-react";
import { corporateApi } from "@/lib/api";
import { StatusBadge } from "../../shared";

interface ClientWorkspaceScreenProps {
    clientId: string;
    companyName: string;
    onBack: () => void;
    onExit: () => void;
}

type SectionKey = "repairs" | "challans" | "statements";

export default function ClientWorkspaceScreen({ clientId, companyName, onBack, onExit }: ClientWorkspaceScreenProps) {
    const [search, setSearch] = useState("");
    const [openSection, setOpenSection] = useState<SectionKey>("repairs");

    const jobsQuery = useQuery({
        queryKey: ["corporate-clients", clientId, "jobs", "workspace"],
        queryFn: () => corporateApi.getClientJobs(clientId, 1, 100),
    });

    const challansQuery = useQuery({
        queryKey: ["corporate-clients", clientId, "challans", "workspace"],
        queryFn: () => corporateApi.getCorporateClientChallans(clientId, 1, 50),
    });

    const billsQuery = useQuery({
        queryKey: ["corporate-clients", clientId, "bills", "workspace"],
        queryFn: () => corporateApi.getBills(clientId),
    });

    const term = search.trim().toLowerCase();

    const jobs = useMemo(() => {
        const list = jobsQuery.data?.jobs ?? [];
        if (!term) return list;
        return list.filter((j: any) =>
            j.device?.toLowerCase().includes(term) ||
            j.corporateJobNumber?.toLowerCase().includes(term) ||
            j.tvSerialNumber?.toLowerCase().includes(term) ||
            j.status?.toLowerCase().includes(term)
        );
    }, [jobsQuery.data, term]);

    const challans = useMemo(() => {
        const list = challansQuery.data?.items ?? [];
        if (!term) return list;
        return list.filter((c: any) =>
            c.challanNumber?.toLowerCase().includes(term) ||
            c.status?.toLowerCase().includes(term)
        );
    }, [challansQuery.data, term]);

    const bills = useMemo(() => {
        const list = billsQuery.data ?? [];
        if (!term) return list;
        return list.filter((b: any) =>
            b.billNumber?.toLowerCase().includes(term) ||
            b.paymentStatus?.toLowerCase().includes(term)
        );
    }, [billsQuery.data, term]);

    const toggleSection = (key: SectionKey) => {
        setOpenSection((prev) => (prev === key ? ("" as SectionKey) : key));
    };

    return (
        <div className="flex h-full flex-col bg-slate-50">
            {/* Header */}
            <header
                className="flex shrink-0 items-center gap-3 bg-emerald-600 px-4 pb-4 text-white"
                style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
            >
                <button
                    onClick={onBack}
                    aria-label="Back to client overview"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 transition active:scale-95"
                >
                    <ArrowLeft size={18} />
                </button>
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-100">Corporate Portal</p>
                    <h1 className="truncate text-base font-bold">{companyName}</h1>
                </div>
                <button
                    onClick={onExit}
                    aria-label="Exit B2B mode"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 transition active:scale-95"
                >
                    <X size={18} />
                </button>
            </header>

            {/* Search */}
            <div className="shrink-0 px-4 py-3">
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search tickets, challans, statements..."
                        className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                </div>
            </div>

            {/* Sections */}
            <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-8">
                <WorkspaceSection
                    icon={Wrench}
                    title="Repair Jobs"
                    count={jobs.length}
                    open={openSection === "repairs"}
                    onToggle={() => toggleSection("repairs")}
                    loading={jobsQuery.isLoading}
                    error={jobsQuery.isError}
                    onRetry={() => jobsQuery.refetch()}
                    emptyLabel={term ? "No repair jobs match your search." : "No repair jobs for this client yet."}
                >
                    {jobs.map((job: any) => (
                        <li key={job.id} className="flex items-start justify-between gap-3 border-t border-slate-100 py-3 first:border-t-0">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-700">
                                    {job.corporateJobNumber || job.device || "Repair Ticket"}
                                </p>
                                <p className="truncate text-xs text-slate-400">
                                    {job.device || "Unknown device"} · {job.technician || "Unassigned"}
                                </p>
                                <p className="text-xs text-slate-400">{new Date(job.createdAt).toLocaleDateString()}</p>
                            </div>
                            <StatusBadge status={job.status} className="shrink-0 text-[10px] px-2 py-0.5" />
                        </li>
                    ))}
                </WorkspaceSection>

                <WorkspaceSection
                    icon={Truck}
                    title="Challans"
                    count={challans.length}
                    open={openSection === "challans"}
                    onToggle={() => toggleSection("challans")}
                    loading={challansQuery.isLoading}
                    error={challansQuery.isError}
                    onRetry={() => challansQuery.refetch()}
                    emptyLabel={term ? "No challans match your search." : "No challans recorded for this client yet."}
                >
                    {challans.map((challan: any) => (
                        <li key={challan.id} className="flex items-start justify-between gap-3 border-t border-slate-100 py-3 first:border-t-0">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-700">{challan.challanNumber}</p>
                                <p className="text-xs text-slate-400">
                                    {challan.totalItems} item{challan.totalItems === 1 ? "" : "s"} ·{" "}
                                    {challan.type === "incoming" ? "Incoming" : "Outgoing"}
                                </p>
                                {challan.receivedDate && (
                                    <p className="text-xs text-slate-400">{new Date(challan.receivedDate).toLocaleDateString()}</p>
                                )}
                            </div>
                            <StatusBadge status={formatChallanStatus(challan.status)} className="shrink-0 text-[10px] px-2 py-0.5" />
                        </li>
                    ))}
                </WorkspaceSection>

                <WorkspaceSection
                    icon={Receipt}
                    title="Statements"
                    count={bills.length}
                    open={openSection === "statements"}
                    onToggle={() => toggleSection("statements")}
                    loading={billsQuery.isLoading}
                    error={billsQuery.isError}
                    onRetry={() => billsQuery.refetch()}
                    emptyLabel={term ? "No statements match your search." : "No statements generated for this client yet."}
                >
                    {bills.map((bill: any) => (
                        <li key={bill.id} className="flex items-start justify-between gap-3 border-t border-slate-100 py-3 first:border-t-0">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-700">{bill.billNumber}</p>
                                <p className="text-xs text-slate-400">
                                    BDT {Number(bill.grandTotal ?? 0).toLocaleString()}
                                    {bill.dueDate && ` · Due ${new Date(bill.dueDate).toLocaleDateString()}`}
                                </p>
                            </div>
                            <StatusBadge status={formatBillStatus(bill.paymentStatus)} className="shrink-0 text-[10px] px-2 py-0.5" />
                        </li>
                    ))}
                </WorkspaceSection>
            </div>
        </div>
    );
}

function formatChallanStatus(status?: string) {
    if (!status) return "Received";
    return status
        .split("_")
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" ");
}

function formatBillStatus(status?: string) {
    if (!status) return "Pending";
    if (status === "unpaid") return "Pending";
    return status.charAt(0).toUpperCase() + status.slice(1);
}

interface WorkspaceSectionProps {
    icon: typeof Wrench;
    title: string;
    count: number;
    open: boolean;
    onToggle: () => void;
    loading: boolean;
    error: boolean;
    onRetry: () => void;
    emptyLabel: string;
    children: React.ReactNode;
}

function WorkspaceSection({ icon: Icon, title, count, open, onToggle, loading, error, onRetry, emptyLabel, children }: WorkspaceSectionProps) {
    const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <button
                onClick={onToggle}
                className="flex w-full items-center justify-between px-4 py-3.5 text-left transition active:bg-slate-50"
            >
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                        <Icon size={15} />
                    </div>
                    <span className="text-sm font-bold text-slate-800">{title}</span>
                    {!loading && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{count}</span>
                    )}
                </div>
                <ChevronDown size={18} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
                <div className="border-t border-slate-100 px-4 pb-2">
                    {loading && (
                        <div className="space-y-2 py-3">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100" />
                            ))}
                        </div>
                    )}

                    {!loading && error && (
                        <div className="flex flex-col items-center gap-2 py-6 text-center">
                            <AlertTriangle className="text-rose-500" size={20} />
                            <p className="text-xs font-medium text-rose-700">Couldn't load this section.</p>
                            <button onClick={onRetry} className="rounded-full bg-rose-600 px-3 py-1 text-[11px] font-bold text-white transition active:scale-95">
                                Retry
                            </button>
                        </div>
                    )}

                    {!loading && !error && !hasChildren && (
                        <div className="flex flex-col items-center gap-2 py-6 text-center text-slate-400">
                            <Inbox size={20} />
                            <p className="text-xs font-medium">{emptyLabel}</p>
                        </div>
                    )}

                    {!loading && !error && hasChildren && <ul>{children}</ul>}
                </div>
            )}
        </div>
    );
}
