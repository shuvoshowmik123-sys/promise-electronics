/**
 * What the shop earned, and which items earned it.
 *
 * The screen's job is not to show a profit figure — it is to stop that figure
 * being misread. Profit is calculated only over stock whose cost was recorded,
 * so early on it may describe a third of what was sold. A confident number over
 * partial data is worse than no number, because nobody questions a total that
 * looks finished. Coverage is therefore given the same weight as the profit
 * itself rather than tucked into a footnote.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertCircle, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { profitReportApi } from "@/lib/api";
import { BentoCard, containerVariants, itemVariants } from "../shared";
import { cn } from "@/lib/utils";

type PeriodKey = "today" | "week" | "month" | "quarter";

const PERIODS: Array<{ key: PeriodKey; label: string; days: number }> = [
    { key: "today", label: "Today", days: 0 },
    { key: "week", label: "7 days", days: 6 },
    { key: "month", label: "30 days", days: 29 },
    { key: "quarter", label: "90 days", days: 89 },
];

/** Local dates, not UTC — a shop's day ends at its own midnight. */
function windowFor(days: number): { from: string; to: string } {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days);
    const iso = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { from: iso(start), to: iso(today) };
}

export function ProfitTab({ getCurrencySymbol }: { getCurrencySymbol: () => string }) {
    const [period, setPeriod] = useState<PeriodKey>("month");
    const days = PERIODS.find((p) => p.key === period)?.days ?? 29;
    const range = useMemo(() => windowFor(days), [days]);
    const money = (n: number) => `${getCurrencySymbol()} ${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

    const { data: summary, isLoading, isError } = useQuery({
        queryKey: ["profit-summary", range.from, range.to],
        queryFn: () => profitReportApi.summary(range.from, range.to),
    });
    const { data: itemData } = useQuery({
        queryKey: ["profit-items", range.from, range.to],
        queryFn: () => profitReportApi.items(range.from, range.to, 10),
    });

    const items = itemData?.items ?? [];
    const coverage = summary?.coveragePercent ?? 0;
    const profitIsLoss = (summary?.profit ?? 0) < 0;

    return (
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
            {/* Period picker — a scrolling row on a phone, a plain row above it. */}
            <motion.div variants={itemVariants}>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 md:overflow-visible">
                    {PERIODS.map((p) => (
                        <button
                            key={p.key}
                            onClick={() => setPeriod(p.key)}
                            className={cn(
                                // h-11 keeps every option above the 44px a thumb needs.
                                "h-11 shrink-0 rounded-full px-5 text-sm font-semibold transition-all",
                                period === p.key
                                    ? "bg-slate-900 text-white shadow-sm"
                                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                            )}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </motion.div>

            {isLoading ? (
                <div className="flex items-center justify-center py-16 text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                </div>
            ) : isError ? (
                /*
                 * A failed request must say so rather than falling back to
                 * zeros. QA saw ৳0 across every card while the endpoint was
                 * answering 500, and the page looked entirely coherent — a
                 * quiet month rather than a broken report. Zero is a real
                 * number here, so it can never double as an error state.
                 */
                <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-rose-100 bg-rose-50/60 py-12 text-center">
                    <AlertCircle className="h-6 w-6 text-rose-500" />
                    <p className="text-sm font-semibold text-rose-900">Could not calculate profit</p>
                    <p className="max-w-xs text-xs text-rose-700/80">
                        The figures below would be wrong, so nothing is shown. Try another period, or
                        tell whoever looks after the system.
                    </p>
                </div>
            ) : (
                <>
                    <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <BentoCard className="bg-white" disableHover>
                            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Sold</div>
                            <div className="mt-1 text-2xl font-black text-slate-900">{money(summary?.revenue ?? 0)}</div>
                            <div className="mt-1 text-[11px] text-slate-500">{summary?.transactions ?? 0} sales</div>
                        </BentoCard>

                        <BentoCard className={cn("border", profitIsLoss ? "bg-rose-50/70 border-rose-100" : "bg-emerald-50/70 border-emerald-100")} disableHover>
                            <div className={cn("text-[10px] font-black uppercase tracking-wider", profitIsLoss ? "text-rose-500" : "text-emerald-600")}>
                                {profitIsLoss ? "Loss" : "Profit"}
                            </div>
                            <div className={cn("mt-1 text-2xl font-black", profitIsLoss ? "text-rose-700" : "text-emerald-700")}>
                                {money(summary?.profit ?? 0)}
                            </div>
                            <div className={cn("mt-1 flex items-center gap-1 text-[11px]", profitIsLoss ? "text-rose-600" : "text-emerald-600")}>
                                {profitIsLoss ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                                {summary?.marginPercent ?? 0}% margin
                            </div>
                        </BentoCard>

                        <BentoCard className="bg-white" disableHover>
                            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Stock cost</div>
                            <div className="mt-1 text-2xl font-black text-slate-900">{money(summary?.cost ?? 0)}</div>
                            <div className="mt-1 text-[11px] text-slate-500">what you paid</div>
                        </BentoCard>

                        {/*
                          * Coverage sits beside the money, not under it. At 31% the
                          * profit above describes under a third of the period, and a
                          * reader who misses that will plan against a number that was
                          * never claiming to be complete.
                          */}
                        <BentoCard className={cn("border", coverage >= 80 ? "bg-white" : "bg-amber-50/70 border-amber-100")} disableHover>
                            <div className={cn("text-[10px] font-black uppercase tracking-wider", coverage >= 80 ? "text-slate-400" : "text-amber-600")}>
                                Based on
                            </div>
                            <div className={cn("mt-1 text-2xl font-black", coverage >= 80 ? "text-slate-900" : "text-amber-700")}>
                                {coverage}%
                            </div>
                            <div className={cn("mt-1 text-[11px]", coverage >= 80 ? "text-slate-500" : "text-amber-700")}>
                                of what you sold
                            </div>
                        </BentoCard>
                    </motion.div>

                    {(summary?.unknownCostLines ?? 0) > 0 && (
                        <motion.div variants={itemVariants}>
                            <div className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
                                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                                <div className="text-sm text-amber-900">
                                    <span className="font-semibold">
                                        {money(summary?.unknownCostRevenue ?? 0)} of sales has no cost recorded.
                                    </span>{" "}
                                    <span className="text-amber-800/90">
                                        The profit above leaves it out rather than treating it as free. Enter a cost
                                        when that stock next arrives and this figure fixes itself.
                                    </span>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/*
                      * Repairs and retail, side by side.
                      *
                      * They are different businesses and one blended percentage
                      * hides both. Retail margin is the gap between a part's
                      * shelf price and its cost. Repair margin is what was
                      * billed minus the parts consumed — BEFORE wages, because a
                      * technician is salaried rather than paid per job, so
                      * charging their time here would double-count it against
                      * the wage bill. The caption says so; without it this reads
                      * as money in your pocket.
                      */}
                    <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <BentoCard className="bg-white" disableHover>
                            <div className="flex items-baseline justify-between">
                                <h3 className="text-sm font-black text-slate-900">Repairs</h3>
                                <span className="text-[11px] text-slate-400">{summary?.repairs.jobs ?? 0} jobs</span>
                            </div>
                            <div className="mt-2 flex items-baseline gap-2">
                                <span className={cn("text-xl font-black", (summary?.repairs.profit ?? 0) < 0 ? "text-rose-600" : "text-emerald-600")}>
                                    {money(summary?.repairs.profit ?? 0)}
                                </span>
                                <span className="text-[11px] font-semibold text-slate-400">
                                    {summary?.repairs.marginPercent ?? 0}%
                                </span>
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500">
                                {money(summary?.repairs.revenue ?? 0)} billed · {money(summary?.repairs.cost ?? 0)} parts
                            </div>
                            <div className="mt-2 text-[10px] text-slate-400">Before wages — staff time is not counted here</div>
                        </BentoCard>

                        <BentoCard className="bg-white" disableHover>
                            <div className="flex items-baseline justify-between">
                                <h3 className="text-sm font-black text-slate-900">Retail</h3>
                                <span className="text-[11px] text-slate-400">over the counter</span>
                            </div>
                            <div className="mt-2 flex items-baseline gap-2">
                                <span className={cn("text-xl font-black", (summary?.retail.profit ?? 0) < 0 ? "text-rose-600" : "text-emerald-600")}>
                                    {money(summary?.retail.profit ?? 0)}
                                </span>
                                <span className="text-[11px] font-semibold text-slate-400">
                                    {summary?.retail.marginPercent ?? 0}%
                                </span>
                            </div>
                            <div className="mt-1 text-[11px] text-slate-500">
                                {money(summary?.retail.revenue ?? 0)} sold · {money(summary?.retail.cost ?? 0)} cost
                            </div>
                            <div className="mt-2 text-[10px] text-slate-400">Parts and products sold directly</div>
                        </BentoCard>
                    </motion.div>

                    <motion.div variants={itemVariants}>
                        <BentoCard className="bg-white" disableHover>
                            <div className="mb-3">
                                <h3 className="text-base font-black text-slate-900">What earns the most</h3>
                                <p className="text-xs text-slate-500">
                                    Ranked by profit, not by how many you sold.
                                </p>
                            </div>

                            {items.length === 0 ? (
                                <p className="py-8 text-center text-sm text-slate-400">No sales in this period.</p>
                            ) : (
                                <div className="space-y-2">
                                    {items.map((item) => (
                                        <div
                                            key={item.itemId}
                                            className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3"
                                        >
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-bold text-slate-800">{item.name}</div>
                                                <div className="text-[11px] text-slate-500">
                                                    {item.quantitySold} sold · {money(item.revenue)}
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                {item.profit == null ? (
                                                    // Amber, and never a zero: an unrecorded cost is a gap to
                                                    // fill, and a 0 here would read as a break-even seller.
                                                    <div className="text-[11px] font-bold text-amber-600">No cost yet</div>
                                                ) : (
                                                    <>
                                                        <div className={cn("text-sm font-black", item.profit < 0 ? "text-rose-600" : "text-emerald-600")}>
                                                            {item.profit < 0 ? "−" : ""}{money(item.profit)}
                                                        </div>
                                                        <div className="text-[10px] font-semibold text-slate-400">
                                                            {item.marginPercent}%
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </BentoCard>
                    </motion.div>
                </>
            )}
        </motion.div>
    );
}
