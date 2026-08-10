/**
 * The expense sheet.
 *
 * A spreadsheet is the right shape for this — one row per spend, dates down
 * the side, money down the right — and the wrong feel. So this borrows the
 * shape and drops the chrome: no gridlines boxing every cell, no toolbar, no
 * dialog to change a filter.
 *
 * Three rules hold the design together.
 *
 *   The chips ARE the interface. One tap swaps the whole sheet and the number
 *   at the top. No dropdown, no Apply. Filtering happens in the query, not in
 *   the page, so "Parts" means every part ever and not the parts inside the
 *   rows that happened to be loaded.
 *
 *   Days total themselves. You read the shape of a month without reading a
 *   single row, which is the entire complaint about small entries piling up.
 *
 *   Colour does almost nothing — one dot per category, and nothing else. A
 *   ledger reads as expensive when the numbers are the loudest thing on it,
 *   and every coloured card added is a decibel taken from them.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { Loader2, Package, Undo2 } from "lucide-react";
import { pettyCashApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
    EXPENSE_CATEGORIES,
    categoryDot,
    categoryLabel,
    purposeLabel,
} from "@shared/expense-tracking";

type Props = {
    getCurrencySymbol: () => string;
    reversePettyCashMutation: any;
};

type View = "sheet" | "parts";

const monthLabel = (month: string) => format(parseISO(`${month}-01`), "MMMM yyyy");

/** Money, always the same width, so a big number is visibly big. */
function Amount({ value, symbol, className }: { value: number; symbol: string; className?: string }) {
    return (
        <span className={cn("tabular-nums", className)}>
            {symbol}{Math.round(value).toLocaleString()}
        </span>
    );
}

export function ExpenseSheet({ getCurrencySymbol, reversePettyCashMutation }: Props) {
    const [category, setCategory] = useState<string>("all");
    const [view, setView] = useState<View>("sheet");
    const symbol = getCurrencySymbol();

    const { data: totals } = useQuery({
        queryKey: ["petty-cash-category-totals"],
        queryFn: () => pettyCashApi.getCategoryTotals(),
        staleTime: 30_000,
    });

    const { data: sheet, isLoading } = useQuery({
        queryKey: ["petty-cash-sheet", category],
        queryFn: () => pettyCashApi.getAll({ type: "Expense", category, limit: 200 }),
        staleTime: 15_000,
    });

    const { data: partsMonths = [], isLoading: partsLoading } = useQuery({
        queryKey: ["petty-cash-parts-summary"],
        queryFn: () => pettyCashApi.getPartsSummary(),
        enabled: view === "parts",
        staleTime: 30_000,
    });

    const rows = sheet?.items ?? [];

    /** Group into days, keeping the order the server sent (newest first). */
    const days = useMemo(() => {
        const out: Array<{ day: string; total: number; rows: any[] }> = [];
        for (const row of rows as any[]) {
            const when = row.occurredAt ?? row.createdAt;
            const day = when ? String(when).slice(0, 10) : "unknown";
            const last = out[out.length - 1];
            const bucket = last?.day === day ? last : (out.push({ day, total: 0, rows: [] }), out[out.length - 1]);
            bucket.rows.push(row);
            // A reversed row keeps its place in the day but not its weight.
            if (!row.reversedAt && !row.reversalOf) bucket.total += Number(row.amount) || 0;
        }
        return out;
    }, [rows]);

    const headline = category === "all"
        ? totals?.all.total ?? 0
        : totals?.byCategory[category]?.total ?? 0;

    const reverse = (entry: any) => {
        const reason = window.prompt(
            `Reverse "${entry.description}" (${symbol}${Number(entry.amount).toLocaleString()})?\n\n` +
            `The entry stays on the sheet, struck through, and a cancelling entry is added. ` +
            `If it was paid from the register, the amount goes back.\n\n` +
            `Reason (required when the entry is not yours):`,
        );
        if (reason === null) return;
        reversePettyCashMutation.mutate({ id: entry.id, reason });
    };

    return (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            {/* ── headline + view switch ──────────────────────────────── */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-4 md:px-6">
                <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                        {view === "parts" ? "Parts bought" : category === "all" ? "All expenses" : categoryLabel(category)}
                    </p>
                    <p className="mt-1 text-3xl font-black leading-none text-slate-900">
                        <Amount value={headline} symbol={symbol} />
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-400">
                        {(category === "all" ? totals?.all.count : totals?.byCategory[category]?.count) ?? 0} entries
                    </p>
                </div>
                {/* Two words, one switch. The sheet is the list; parts is the
                    "February: LVDS x10" question, which is a different shape
                    and does not belong as another filter chip. */}
                <div className="flex shrink-0 rounded-xl bg-slate-100 p-1">
                    {(["sheet", "parts"] as View[]).map((v) => (
                        <button
                            key={v}
                            type="button"
                            onClick={() => setView(v)}
                            className={cn(
                                "rounded-lg px-3 py-1.5 text-xs font-black capitalize transition-colors",
                                view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500",
                            )}
                        >
                            {v}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── the chips ───────────────────────────────────────────── */}
            {view === "sheet" && (
                <div className="-mx-px overflow-x-auto border-b border-slate-100 px-4 py-2.5 md:px-6" style={{ scrollbarWidth: "none" }}>
                    <div className="flex min-w-max gap-1.5">
                        {[{ id: "all", label: "All" }, ...EXPENSE_CATEGORIES].map((c) => {
                            const active = category === c.id;
                            const stat = c.id === "all" ? totals?.all : totals?.byCategory[c.id];
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => setCategory(c.id)}
                                    className={cn(
                                        "flex h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-bold transition-colors",
                                        active
                                            ? "border-slate-900 bg-slate-900 text-white"
                                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                                    )}
                                >
                                    {c.id !== "all" && (
                                        <span className={cn("h-1.5 w-1.5 rounded-full", categoryDot(c.id), active && "opacity-90")} />
                                    )}
                                    {c.label}
                                    {/* The count stays on the chip even at zero, so the
                                        row does not reflow as you tap across it. */}
                                    <span className={cn("tabular-nums", active ? "text-white/60" : "text-slate-400")}>
                                        {stat?.count ?? 0}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── the sheet ───────────────────────────────────────────── */}
            {view === "sheet" ? (
                isLoading ? (
                    <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
                ) : days.length === 0 ? (
                    <p className="px-6 py-16 text-center text-sm font-semibold text-slate-400">
                        Nothing recorded {category === "all" ? "yet" : `under ${categoryLabel(category)}`}.
                    </p>
                ) : (
                    <div>
                        {days.map((day) => (
                            <div key={day.day}>
                                {/* The day header carries its own total, so the
                                    shape of a month is readable without opening
                                    a single row. */}
                                <div className="sticky top-0 z-10 flex items-baseline justify-between gap-3 border-y border-slate-100 bg-slate-50/90 px-4 py-1.5 backdrop-blur md:px-6">
                                    <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                                        {day.day === "unknown" ? "No date" : format(parseISO(day.day), "EEE d MMM")}
                                    </span>
                                    <Amount value={day.total} symbol={symbol} className="text-[11px] font-black text-slate-500" />
                                </div>

                                {day.rows.map((row: any) => {
                                    const undone = !!row.reversedAt || !!row.reversalOf;
                                    return (
                                        <div
                                            key={row.id}
                                            className={cn(
                                                "group flex items-center gap-3 border-b border-slate-50 px-4 py-2.5 last:border-0 hover:bg-slate-50/70 md:px-6",
                                                undone && "opacity-50",
                                            )}
                                        >
                                            <span className={cn("h-2 w-2 shrink-0 rounded-full", categoryDot(row.category))} />

                                            <div className="min-w-0 flex-1">
                                                <p className={cn("truncate text-[13px] font-bold text-slate-900", undone && "line-through")}>
                                                    {row.partName || row.description}
                                                    {row.quantity ? <span className="ml-1.5 font-black text-slate-400">×{row.quantity}</span> : null}
                                                </p>
                                                {/* The second line is where everything else
                                                    lives, quiet and one size down: vendor,
                                                    person, purpose. Dense, not shouty. */}
                                                <p className="truncate text-[11px] font-medium text-slate-400">
                                                    {[
                                                        row.partName ? row.description : null,
                                                        row.spentByName,
                                                        row.purpose && row.purpose !== "office" ? purposeLabel(row.purpose) : null,
                                                    ].filter(Boolean).join(" · ") || categoryLabel(row.category)}
                                                </p>
                                            </div>

                                            <Amount
                                                value={Number(row.amount) || 0}
                                                symbol={symbol}
                                                className={cn("w-24 shrink-0 text-right text-[13px] font-black text-slate-900", undone && "line-through")}
                                            />

                                            {/* Hidden until reached for: the action is
                                                rare and does not deserve permanent space. */}
                                            <div className="w-8 shrink-0">
                                                {!undone && (
                                                    <button
                                                        type="button"
                                                        title="Reverse this entry"
                                                        disabled={reversePettyCashMutation.isPending}
                                                        onClick={() => reverse(row)}
                                                        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 focus:opacity-100 group-hover:opacity-100 max-md:opacity-100"
                                                    >
                                                        <Undo2 className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                )
            ) : (
                /* ── parts, by month ──────────────────────────────────── */
                partsLoading ? (
                    <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
                ) : partsMonths.length === 0 ? (
                    <div className="px-6 py-16 text-center">
                        <Package className="mx-auto h-8 w-8 text-slate-200" />
                        <p className="mt-3 text-sm font-semibold text-slate-400">No parts recorded yet.</p>
                        <p className="mt-1 text-[11px] font-medium text-slate-400">
                            Record an expense under Parts with a part name and quantity, and it will be counted here.
                        </p>
                    </div>
                ) : (
                    <div>
                        {partsMonths.map((month) => (
                            <div key={month.month}>
                                <div className="flex items-baseline justify-between gap-3 border-y border-slate-100 bg-slate-50/90 px-4 py-2 md:px-6">
                                    <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                                        {monthLabel(month.month)}
                                    </span>
                                    <Amount value={month.total} symbol={symbol} className="text-[11px] font-black text-slate-500" />
                                </div>
                                {month.parts.map((part) => (
                                    <div key={part.partName} className="flex items-center gap-3 border-b border-slate-50 px-4 py-2.5 last:border-0 md:px-6">
                                        <span className={cn("h-2 w-2 shrink-0 rounded-full", categoryDot("parts"))} />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-[13px] font-bold text-slate-900">
                                                {part.partName}
                                                <span className="ml-1.5 font-black text-slate-400">×{part.quantity}</span>
                                            </p>
                                            <p className="text-[11px] font-medium text-slate-400">
                                                {part.buys} purchase{part.buys === 1 ? "" : "s"}
                                            </p>
                                        </div>
                                        <Amount value={part.total} symbol={symbol} className="w-24 shrink-0 text-right text-[13px] font-black text-slate-900" />
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )
            )}
        </div>
    );
}
