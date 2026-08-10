/**
 * The expense ledger: rolled up, and attributed.
 *
 * The complaint this answers is that dozens of small spends are unreadable as
 * a flat list — you cannot tell what a month cost, and you certainly cannot
 * tell what any one person cost. So the default is a month, opened into days,
 * opened into entries. Every small record still exists; you simply never have
 * to look at all of them at once.
 *
 * Everything here sits behind the finance permission, like the rest of this
 * tab. The owner's personal spending is in this table.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronRight, Loader2, Undo2, User as UserIcon, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { pettyCashApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { categoryLabel, purposeLabel } from "@shared/expense-tracking";

type Props = {
    getCurrencySymbol: () => string;
    reversePettyCashMutation: any;
};

const monthLabel = (month: string) => format(parseISO(`${month}-01`), "MMMM yyyy");

export function ExpenseLedger({ getCurrencySymbol, reversePettyCashMutation }: Props) {
    const [openMonth, setOpenMonth] = useState<string | null>(null);
    const [openDay, setOpenDay] = useState<string | null>(null);

    const { data: rollup, isLoading } = useQuery({
        queryKey: ["petty-cash-rollup"],
        queryFn: () => pettyCashApi.getRollup(),
        staleTime: 30_000,
    });

    const { data: people = [] } = useQuery({
        queryKey: ["petty-cash-by-person"],
        queryFn: () => pettyCashApi.getByPerson(),
        staleTime: 30_000,
    });

    // The entries for one opened day, fetched only when a day is opened —
    // there is no reason to ship a month of small rows to draw a total.
    const { data: dayEntries, isLoading: dayLoading } = useQuery({
        queryKey: ["pettyCash-day", openDay],
        queryFn: () => pettyCashApi.getAll({
            from: `${openDay}T00:00:00.000Z`,
            to: `${openDay}T23:59:59.999Z`,
            type: "Expense",
            limit: 100,
        }),
        enabled: !!openDay,
    });

    const months = rollup?.months ?? [];
    const busiest = useMemo(() => people.slice(0, 6), [people]);

    const reverse = (entry: any) => {
        // A reason is only demanded for somebody else's entry; the server is
        // the authority on that, so ask and let it decide.
        const reason = window.prompt(
            `Reverse "${entry.description}" (${getCurrencySymbol()}${entry.amount})?\n\n` +
            `The entry is kept and a cancelling entry is added. If this expense was paid from the ` +
            `register, the amount goes back to it.\n\nReason (required when the entry is not yours):`,
        );
        if (reason === null) return;
        reversePettyCashMutation.mutate({ id: entry.id, reason });
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center rounded-3xl border border-slate-200 bg-white py-16">
                <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* ── who spent what ───────────────────────────────────────── */}
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
                <div className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4 text-blue-600" />
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-700">Spending by person</h3>
                </div>
                {people.length === 0 ? (
                    <p className="mt-3 text-xs font-semibold text-slate-400">
                        No attributed expenses yet. Entries recorded from now on will name the person they belong to.
                    </p>
                ) : (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {busiest.map((person) => (
                            <div key={person.spentBy ?? "unattributed"} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
                                <div className="flex items-baseline justify-between gap-2">
                                    <p className="min-w-0 truncate text-sm font-black text-slate-900">{person.spentByName}</p>
                                    <p className="shrink-0 text-sm font-black tabular-nums text-slate-900">
                                        {getCurrencySymbol()}{person.total.toLocaleString()}
                                    </p>
                                </div>
                                <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
                                    {person.count} entr{person.count === 1 ? "y" : "ies"}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {Object.entries(person.byCategory)
                                        .sort((a, b) => b[1] - a[1])
                                        .slice(0, 3)
                                        .map(([category, amount]) => (
                                            <span key={category} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">
                                                {categoryLabel(category)} · {getCurrencySymbol()}{Number(amount).toLocaleString()}
                                            </span>
                                        ))}
                                </div>
                                {/* Complementary spend is somebody's allowance, so it is
                                    worth seeing separately from what they spent for the shop. */}
                                {person.byPurpose.complementary ? (
                                    <p className="mt-2 text-[11px] font-bold text-violet-700">
                                        {getCurrencySymbol()}{Number(person.byPurpose.complementary).toLocaleString()} complementary
                                    </p>
                                ) : null}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── month → day → entries ────────────────────────────────── */}
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Wallet className="h-4 w-4 text-blue-600" />
                        <h3 className="text-sm font-black uppercase tracking-wide text-slate-700">Expenses</h3>
                    </div>
                    <p className="text-sm font-black tabular-nums text-slate-900">
                        {getCurrencySymbol()}{(rollup?.total ?? 0).toLocaleString()}
                    </p>
                </div>

                {months.length === 0 ? (
                    <p className="mt-3 text-xs font-semibold text-slate-400">No expenses recorded.</p>
                ) : (
                    <div className="mt-3 space-y-2">
                        {months.map((month) => {
                            const isOpen = openMonth === month.month;
                            return (
                                <div key={month.month} className="overflow-hidden rounded-2xl border border-slate-200">
                                    <button
                                        type="button"
                                        onClick={() => { setOpenMonth(isOpen ? null : month.month); setOpenDay(null); }}
                                        className="flex w-full items-center gap-2 bg-slate-50 px-4 py-3 text-left active:bg-slate-100"
                                    >
                                        {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                                        <span className="min-w-0 flex-1 truncate text-sm font-black text-slate-900">{monthLabel(month.month)}</span>
                                        <span className="shrink-0 text-[11px] font-semibold text-slate-400">{month.count}</span>
                                        <span className="shrink-0 text-sm font-black tabular-nums text-slate-900">
                                            {getCurrencySymbol()}{month.total.toLocaleString()}
                                        </span>
                                    </button>

                                    {isOpen && (
                                        <div className="divide-y divide-slate-100">
                                            {month.days.map((day) => {
                                                const dayOpen = openDay === day.day;
                                                return (
                                                    <div key={day.day}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setOpenDay(dayOpen ? null : day.day)}
                                                            className="flex w-full items-center gap-2 px-4 py-2.5 pl-9 text-left active:bg-slate-50"
                                                        >
                                                            {dayOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-300" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
                                                            <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-700">
                                                                {format(parseISO(day.day), "EEE d MMM")}
                                                            </span>
                                                            <span className="shrink-0 text-[11px] font-semibold text-slate-400">{day.count}</span>
                                                            <span className="shrink-0 text-[13px] font-black tabular-nums text-slate-800">
                                                                {getCurrencySymbol()}{day.total.toLocaleString()}
                                                            </span>
                                                        </button>

                                                        {dayOpen && (
                                                            <div className="space-y-1.5 bg-slate-50/70 px-4 py-3 pl-9">
                                                                {dayLoading ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                                                                ) : (dayEntries?.items ?? []).length === 0 ? (
                                                                    <p className="text-[11px] font-semibold text-slate-400">Nothing on this day.</p>
                                                                ) : (
                                                                    (dayEntries?.items ?? []).map((entry: any) => {
                                                                        // A reversed entry stays visible, struck
                                                                        // through — the ledger says the spend was
                                                                        // recorded and then withdrawn, which is
                                                                        // what happened.
                                                                        const undone = !!entry.reversedAt || !!entry.reversalOf;
                                                                        return (
                                                                            <div key={entry.id} className={cn("rounded-xl border border-slate-200 bg-white p-2.5", undone && "opacity-60")}>
                                                                                <div className="flex items-start justify-between gap-2">
                                                                                    <div className="min-w-0">
                                                                                        <p className={cn("truncate text-[13px] font-bold text-slate-900", undone && "line-through")}>
                                                                                            {entry.description}
                                                                                        </p>
                                                                                        <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">
                                                                                            {categoryLabel(entry.category)}
                                                                                            {entry.purpose ? ` · ${purposeLabel(entry.purpose)}` : ""}
                                                                                            {entry.spentByName ? ` · ${entry.spentByName}` : ""}
                                                                                        </p>
                                                                                    </div>
                                                                                    <div className="flex shrink-0 items-center gap-2">
                                                                                        <span className={cn("text-[13px] font-black tabular-nums text-slate-900", undone && "line-through")}>
                                                                                            {getCurrencySymbol()}{Number(entry.amount).toLocaleString()}
                                                                                        </span>
                                                                                        {!undone && (
                                                                                            <Button
                                                                                                size="icon"
                                                                                                variant="ghost"
                                                                                                className="h-8 w-8 rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                                                                                title="Reverse this entry"
                                                                                                disabled={reversePettyCashMutation.isPending}
                                                                                                onClick={() => reverse(entry)}
                                                                                            >
                                                                                                <Undo2 className="h-4 w-4" />
                                                                                            </Button>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                                {entry.reversedAt && (
                                                                                    <p className="mt-1.5 text-[11px] font-semibold text-rose-600">
                                                                                        Reversed by {entry.reversedByName || "someone"}
                                                                                        {entry.reversalReason ? ` — ${entry.reversalReason}` : ""}
                                                                                    </p>
                                                                                )}
                                                                                {entry.reversalOf && (
                                                                                    <Badge variant="outline" className="mt-1.5 text-[10px]">Cancels an earlier entry</Badge>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
