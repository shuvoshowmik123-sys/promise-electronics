/**
 * One customer's dated statement, opened by tapping their tile.
 *
 * Written for a manager who is on the phone right now with somebody saying "we
 * do not owe that, not on that date". The old answer was the Finance dues list
 * — every customer in the shop, no dates worth quoting — so the argument went
 * to whoever sounded more certain.
 *
 * The sentence comes first, already assembled, because a manager mid-conversation
 * cannot read a table and compose a reply at the same time. He reads the line
 * out. The dated rows underneath are the proof, in the order things happened,
 * which is the order a customer disputes them in.
 */
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Loader2, Phone, X } from "lucide-react";
import { fetchApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DebtorTile } from "./CustomerDebtCard";

interface StatementLine {
    date: string;
    description: string;
    charged: number;
    paid: number;
    balance: number;
    reference: string | null;
    fromPaper?: boolean;
}

interface CustomerStatement {
    kind: "retail" | "corporate";
    name: string;
    phone: string | null;
    address: string | null;
    totalCharged: number;
    totalPaid: number;
    balance: number;
    lines: StatementLine[];
    spokenSummary: string;
}

const day = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function CustomerStatementSheet({
    debtor, onClose, currency = "৳",
}: {
    debtor: DebtorTile | null;
    onClose: () => void;
    currency?: string;
}) {
    const { data, isLoading, isError } = useQuery({
        queryKey: ["statement", debtor?.kind, debtor?.id],
        queryFn: () => fetchApi<CustomerStatement>(
            `/admin/receivables/${debtor!.kind}/${encodeURIComponent(debtor!.id)}/statement`),
        enabled: !!debtor,
    });

    if (!debtor) return null;
    const money = (n: number) => `${currency} ${n.toLocaleString()}`;

    /**
     * Rendered into document.body, not where it is written.
     *
     * position:fixed is measured against the nearest ancestor that has a
     * transform — and this sheet is written inside MobileScrollContent, under a
     * motion.div that animates one. On desktop that put the overlay at y:-885,
     * entirely above the viewport: the tap worked, the request returned data,
     * and the screen appeared to do nothing at all.
     */
    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />

            {/*
             * Full height on a phone, because a statement is the whole point of
             * opening this and a half sheet would put the oldest lines — the
             * ones being argued about — permanently below the fold.
             */}
            <div className="relative flex h-[92vh] w-full flex-col rounded-t-3xl bg-white sm:h-[80vh] sm:max-w-lg sm:rounded-3xl">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
                    <div className="min-w-0">
                        <h2 className="truncate text-lg font-black text-slate-900">{data?.name ?? debtor.name}</h2>
                        <p className="truncate text-xs text-slate-500">
                            {data?.phone ?? debtor.phone ?? (debtor.kind === "corporate" ? "Company account" : "")}
                            {data?.address ? ` · ${data.address}` : ""}
                        </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        {/*
                         * Calling is the next thing that happens after reading
                         * this, so it is one tap away rather than a number to
                         * copy out by hand.
                         */}
                        {(data?.phone ?? debtor.phone) && (
                            <a href={`tel:${data?.phone ?? debtor.phone}`}
                                className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                                <Phone className="h-5 w-5" />
                            </a>
                        )}
                        <button type="button" onClick={onClose}
                            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50">
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex flex-1 items-center justify-center text-slate-400">
                        <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                ) : isError || !data ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                        <AlertCircle className="h-6 w-6 text-slate-300" />
                        <p className="text-sm font-semibold text-slate-700">No billing history</p>
                        <p className="max-w-xs text-xs text-slate-500">
                            Nothing has been billed to this customer yet.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* The line to read down the phone. */}
                        <div className={cn(
                            "m-4 rounded-2xl p-4",
                            data.balance > 0.009 ? "bg-rose-50" : "bg-emerald-50",
                        )}>
                            <p className={cn("text-sm font-semibold leading-relaxed",
                                data.balance > 0.009 ? "text-rose-900" : "text-emerald-900")}>
                                {data.spokenSummary}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-medium text-slate-600">
                                <span>Billed {money(data.totalCharged)}</span>
                                <span>Paid {money(data.totalPaid)}</span>
                                <span className={cn("font-bold",
                                    data.balance > 0.009 ? "text-rose-700" : "text-emerald-700")}>
                                    Owes {money(data.balance)}
                                </span>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 pb-8">
                            <div className="mb-2 flex items-center justify-between px-1">
                                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                                    Every charge and payment
                                </h3>
                                <span className="text-[11px] text-slate-400">{data.lines.length} entries</span>
                            </div>

                            <div className="space-y-1.5">
                                {data.lines.map((l, i) => (
                                    <div key={`${l.date}-${i}`}
                                        className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3">
                                        <div className="w-16 shrink-0">
                                            <div className="text-[11px] font-bold text-slate-700">{day(l.date)}</div>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-semibold text-slate-800">
                                                {l.description}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                                {l.reference && <span className="truncate font-mono">{l.reference}</span>}
                                                {l.fromPaper && (
                                                    <span className="rounded bg-amber-100 px-1 font-bold text-amber-700">
                                                        from paper
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            {l.charged > 0 ? (
                                                <div className="font-mono text-sm font-bold text-slate-800">
                                                    +{l.charged.toLocaleString()}
                                                </div>
                                            ) : (
                                                <div className="font-mono text-sm font-bold text-emerald-600">
                                                    −{l.paid.toLocaleString()}
                                                </div>
                                            )}
                                            {/*
                                             * The balance after each line is the column that
                                             * actually settles a dispute: it shows what was
                                             * outstanding on that date, not just today.
                                             */}
                                            <div className="text-[10px] text-slate-400">
                                                bal {l.balance.toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>,
        document.body,
    );
}
