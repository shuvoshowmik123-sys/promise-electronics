/**
 * Everybody who owes the shop money, in one place.
 *
 * The question a manager gets asked is "how much is still out there", and until
 * now it could only be answered for half the shop: walk-in debt sat in the dues
 * list, company debt in unpaid corporate bills, on different screens using
 * different words. Adding them up meant a notebook.
 *
 * So the total is the first thing on the screen, and it covers both kinds. Under
 * it, one tile per customer rather than one row per invoice — a person with four
 * unpaid jobs is one debtor owing one amount, not four lines to add by eye.
 * Biggest debt first, because that is who gets phoned first.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertCircle, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { BentoCard, containerVariants, itemVariants } from "../shared";
import { CustomerDebtGrid, type DebtorTile } from "@/components/admin/CustomerDebtCard";
import { CustomerStatementSheet } from "@/components/admin/CustomerStatementSheet";
import { fetchApi } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Receivables {
    totalOwed: number;
    debtorCount: number;
    retailOwed: number;
    corporateOwed: number;
    debtors: DebtorTile[];
}

type Filter = "all" | "retail" | "corporate";

const FILTERS: Array<{ key: Filter; label: string }> = [
    { key: "all", label: "Everyone" },
    { key: "retail", label: "People" },
    { key: "corporate", label: "Companies" },
];

export function ReceivablesTab({ getCurrencySymbol }: { getCurrencySymbol: () => string }) {
    const [filter, setFilter] = useState<Filter>("all");
    /** The tile that was tapped; its statement opens over the grid. */
    const [open, setOpen] = useState<DebtorTile | null>(null);
    const [q, setQ] = useState("");
    const currency = getCurrencySymbol();
    const money = (n: number) => `${currency} ${n.toLocaleString()}`;

    const { data, isLoading, isError } = useQuery({
        queryKey: ["receivables"],
        queryFn: () => fetchApi<Receivables>("/admin/receivables"),
    });

    const shown = useMemo(() => {
        let list = data?.debtors ?? [];
        if (filter !== "all") list = list.filter((d) => d.kind === filter);
        const needle = q.trim().toLowerCase();
        if (needle) {
            list = list.filter((d) =>
                d.name.toLowerCase().includes(needle) || (d.phone ?? "").includes(needle));
        }
        return list;
    }, [data, filter, q]);

    /** What the visible tiles add up to — a filtered view must total itself. */
    const shownOwed = useMemo(
        () => Math.round(shown.reduce((s, d) => s + d.owed, 0) * 100) / 100,
        [shown],
    );

    if (isError) {
        return (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-rose-100 bg-rose-50/60 py-12 text-center">
                <AlertCircle className="h-6 w-6 text-rose-500" />
                <p className="text-sm font-semibold text-rose-900">Could not total what is owed</p>
                <p className="max-w-xs text-xs text-rose-700/80">
                    Showing nothing rather than a figure that would be wrong.
                </p>
            </div>
        );
    }

    return (
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
            {/*
             * The headline number. It is the reason this screen exists, so it is
             * the size it is — a manager should be able to read it aloud from
             * across the room without opening anything.
             */}
            <motion.div variants={itemVariants}>
                <div className="rounded-2xl bg-slate-900 p-5 text-white">
                    <div className="text-[11px] uppercase tracking-wider text-white/60">Still to collect</div>
                    <div className="mt-1 font-mono text-4xl font-black">
                        {isLoading ? "…" : money(data?.totalOwed ?? 0)}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/70">
                        <span>{data?.debtorCount ?? 0} customers</span>
                        <span>People {money(data?.retailOwed ?? 0)}</span>
                        <span>Companies {money(data?.corporateOwed ?? 0)}</span>
                    </div>
                </div>
            </motion.div>

            <motion.div variants={itemVariants} className="flex flex-col gap-3 sm:flex-row">
                <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
                    {FILTERS.map((f) => (
                        <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                            className={cn(
                                // h-11: these get tapped with a thumb.
                                "h-11 shrink-0 rounded-full px-5 text-sm font-semibold transition-all",
                                filter === f.key
                                    ? "bg-slate-900 text-white"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                            )}>
                            {f.label}
                        </button>
                    ))}
                </div>
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input className="h-11 rounded-xl bg-white pl-9" value={q}
                        placeholder="Find a customer or company"
                        onChange={(e) => setQ(e.target.value)} />
                </div>
            </motion.div>

            <motion.div variants={itemVariants}>
                <BentoCard className="bg-white" disableHover>
                    <div className="mb-3 flex items-baseline justify-between">
                        <h3 className="text-sm font-black text-slate-900">Who owes the most</h3>
                        {/*
                         * A filtered view must total itself, or the headline above
                         * silently describes a different set of people than the
                         * tiles below it.
                         */}
                        <span className="text-xs text-slate-500">
                            {shown.length} shown · {money(shownOwed)}
                        </span>
                    </div>

                    {isLoading ? (
                        <div className="flex items-center justify-center py-12 text-slate-400">
                            <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                    ) : (
                        <CustomerDebtGrid
                            debtors={shown}
                            currency={currency}
                            onOpen={setOpen}
                            emptyText={q ? "Nobody matches that." : "Nobody owes anything."}
                        />
                    )}
                </BentoCard>
            </motion.div>

            <CustomerStatementSheet debtor={open} onClose={() => setOpen(null)} currency={currency} />
        </motion.div>
    );
}
