/**
 * What customers asked for that the shop does not stock.
 *
 * The shop's hardest question is what to import before spending money on it,
 * and the honest answer has always been a guess. This screen answers it from
 * evidence: seventeen people asking for the same 43-inch Samsung panel is not
 * a guess.
 *
 * Two levels, deliberately. The board shows demand — what to buy. Opening a
 * group shows people — who to ring. Those are two different jobs done by two
 * different people, and mixing them into one list serves neither.
 *
 * Nothing here messages a customer. Staff read the numbers and call them.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    ArrowLeft, Flame, Loader2, Phone, TrendingUp, PackageSearch, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchApi } from "@/lib/api/httpClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type DemandGroup = {
    brand: string;
    screenSize: string;
    partName: string;
    requests: number;
    waiting: number;
    lastRequestedAt: string;
    firstRequestedAt: string;
};

type PartRequest = {
    id: string;
    brand: string;
    screenSize: string;
    partName: string;
    modelNumber: string | null;
    panelModel: string | null;
    note: string | null;
    customerName: string | null;
    phone: string;
    whatsapp: string | null;
    status: string;
    staffNote: string | null;
    createdAt: string;
};

const RANGES = [
    { days: 7, label: "7 days" },
    { days: 30, label: "30 days" },
    { days: 90, label: "90 days" },
];

const STATUS_LABEL: Record<string, string> = {
    new: "Not called yet",
    contacted: "Called",
    sourcing: "Bringing it in",
    fulfilled: "Sold",
    closed: "Closed",
};

export function PartDemandBoard({ className }: { className?: string }) {
    const [days, setDays] = useState(30);
    const [open, setOpen] = useState<DemandGroup | null>(null);
    const queryClient = useQueryClient();

    const demand = useQuery({
        queryKey: ["part-demand", days],
        queryFn: () => fetchApi<{ groups: DemandGroup[] }>(`/admin/part-requests/demand?days=${days}`),
    });

    const groupKey = open
        ? `brand=${encodeURIComponent(open.brand)}&screenSize=${encodeURIComponent(open.screenSize)}&partName=${encodeURIComponent(open.partName)}`
        : null;

    const people = useQuery({
        queryKey: ["part-requests", groupKey],
        queryFn: () => fetchApi<{ requests: PartRequest[] }>(`/admin/part-requests?${groupKey}`),
        enabled: !!groupKey,
    });

    const setStatus = useMutation({
        mutationFn: ({ id, status }: { id: string; status: string }) =>
            fetchApi(`/admin/part-requests/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ status }),
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["part-requests", groupKey] });
            queryClient.invalidateQueries({ queryKey: ["part-demand", days] });
            toast.success("Updated");
        },
        onError: (e: any) => toast.error(e?.message || "Could not update"),
    });

    const groups = demand.data?.groups ?? [];
    const totalRequests = groups.reduce((sum, g) => sum + g.requests, 0);

    // ── One group: the people to ring ────────────────────────────────────
    if (open) {
        const rows = people.data?.requests ?? [];
        return (
            <div className={cn("space-y-3", className)}>
                <button
                    onClick={() => setOpen(null)}
                    className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900"
                >
                    <ArrowLeft className="h-4 w-4" /> Back to demand
                </button>

                <div className="rounded-2xl border border-orange-100 bg-orange-50/50 p-4">
                    <p className="text-sm font-black text-slate-900">
                        {open.brand} · {open.screenSize}&quot; · {open.partName}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-orange-700">
                        {open.requests} {open.requests === 1 ? "person wants" : "people want"} this
                        {open.waiting > 0 && ` · ${open.waiting} not called yet`}
                    </p>
                </div>

                {people.isLoading && (
                    <p className="py-6 text-center text-xs font-semibold text-slate-400">Loading…</p>
                )}

                <div className="space-y-2">
                    {rows.map((r) => (
                        <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-black text-slate-900">
                                        {r.customerName || "Customer"}
                                    </p>
                                    {/* A tel: link, because this screen exists to start a
                                        phone call and a number you must retype is friction
                                        at the exact moment the work happens. */}
                                    <a
                                        href={`tel:${r.phone}`}
                                        className="mt-0.5 flex items-center gap-1.5 text-xs font-bold text-blue-600"
                                    >
                                        <Phone className="h-3.5 w-3.5" /> {r.phone}
                                    </a>
                                </div>
                                <button
                                    onClick={() => {
                                        navigator.clipboard?.writeText(r.phone)
                                            .then(() => toast.success("Number copied"))
                                            .catch(() => toast.error("Could not copy"));
                                    }}
                                    className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-50"
                                    title="Copy number"
                                >
                                    <Copy className="h-4 w-4" />
                                </button>
                            </div>

                            {(r.modelNumber || r.panelModel || r.note) && (
                                <div className="mt-2 space-y-0.5 rounded-lg bg-slate-50 px-2 py-1.5">
                                    {r.modelNumber && (
                                        <p className="text-[11px] font-semibold text-slate-600">
                                            Model: {r.modelNumber}
                                        </p>
                                    )}
                                    {r.panelModel && (
                                        <p className="text-[11px] font-semibold text-slate-600">
                                            Panel: {r.panelModel}
                                        </p>
                                    )}
                                    {r.note && (
                                        <p className="text-[11px] text-slate-500">{r.note}</p>
                                    )}
                                </div>
                            )}

                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                                    <button
                                        key={value}
                                        disabled={setStatus.isPending}
                                        onClick={() => setStatus.mutate({ id: r.id, status: value })}
                                        className={cn(
                                            "rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors",
                                            r.status === value
                                                ? "bg-slate-900 text-white"
                                                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                                        )}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ── The board: what to buy ───────────────────────────────────────────
    return (
        <div className={cn("space-y-3", className)}>
            <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-orange-600" />
                <p className="text-[11px] font-black uppercase tracking-wide text-orange-600">
                    Most wanted parts
                </p>
            </div>
            <p className="text-[11px] leading-snug text-slate-500">
                Parts customers asked for that we did not have. The top of this list is
                what to bring in next.
            </p>

            <div className="flex gap-1.5">
                {RANGES.map((r) => (
                    <button
                        key={r.days}
                        onClick={() => setDays(r.days)}
                        className={cn(
                            "flex-1 rounded-lg px-3 py-2 text-[11px] font-bold transition-colors",
                            days === r.days
                                ? "bg-slate-900 text-white"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                        )}
                    >
                        {r.label}
                    </button>
                ))}
            </div>

            {demand.isLoading && (
                <p className="flex items-center justify-center gap-2 py-8 text-xs font-semibold text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading demand…
                </p>
            )}

            {demand.isError && (
                <p className="py-8 text-center text-xs font-semibold text-red-600">
                    Could not load the demand list.
                </p>
            )}

            {!demand.isLoading && !demand.isError && groups.length === 0 && (
                /* Empty means nobody has asked yet — not that the screen is
                   broken. Said plainly, with what has to happen first. */
                <div className="rounded-xl bg-slate-50 px-4 py-8 text-center">
                    <PackageSearch className="mx-auto h-8 w-8 text-slate-300" />
                    <p className="mt-2 text-xs font-bold text-slate-600">No requests yet</p>
                    <p className="mt-1 text-[11px] leading-snug text-slate-500">
                        This fills up when customers ask for parts through the website.
                        Add your parts list in Settings first, or nothing can be chosen.
                    </p>
                </div>
            )}

            {groups.length > 0 && (
                <p className="text-[11px] font-semibold text-slate-500">
                    {totalRequests} {totalRequests === 1 ? "request" : "requests"} across{" "}
                    {groups.length} {groups.length === 1 ? "part" : "parts"}
                </p>
            )}

            <div className="space-y-2">
                {groups.map((g, index) => {
                    /* The top three carry a flame. Not decoration — a buying list
                       is read in a hurry, and the eye needs somewhere to land. */
                    const isTop = index < 3 && g.requests > 1;
                    return (
                        <button
                            key={`${g.brand}-${g.screenSize}-${g.partName}`}
                            onClick={() => setOpen(g)}
                            className={cn(
                                "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                                isTop
                                    ? "border-orange-200 bg-orange-50/60 hover:bg-orange-50"
                                    : "border-slate-200 bg-white hover:bg-slate-50",
                            )}
                        >
                            <span
                                className={cn(
                                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-black",
                                    isTop ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-500",
                                )}
                            >
                                {index + 1}
                            </span>

                            <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-black text-slate-900">
                                    {g.brand} · {g.screenSize}&quot; · {g.partName}
                                </p>
                                <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                                    {g.waiting > 0
                                        ? `${g.waiting} still to call`
                                        : "everyone called"}
                                </p>
                            </div>

                            <div className="shrink-0 text-right">
                                <p className={cn(
                                    "flex items-center justify-end gap-1 text-base font-black",
                                    isTop ? "text-orange-600" : "text-slate-900",
                                )}>
                                    {isTop && <Flame className="h-3.5 w-3.5" />}
                                    {g.requests}
                                </p>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                    {g.requests === 1 ? "request" : "requests"}
                                </p>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
