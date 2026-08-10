/**
 * Who spent what.
 *
 * The month-by-day view lives in the expense sheet next door; this is the other
 * half of the question and the one a list can never answer by scrolling — what
 * each person costs, and on what. Complementary spend is called out separately
 * because it is somebody's allowance rather than a cost of the shop.
 *
 * Behind the finance permission, like the rest of this tab. The owner's
 * personal spending is in this table.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { User as UserIcon } from "lucide-react";
import { pettyCashApi } from "@/lib/api";
import { categoryLabel } from "@shared/expense-tracking";

type Props = {
    getCurrencySymbol: () => string;
};

export function ExpenseLedger({ getCurrencySymbol }: Props) {
    const { data: people = [] } = useQuery({
        queryKey: ["petty-cash-by-person"],
        queryFn: () => pettyCashApi.getByPerson(),
        staleTime: 30_000,
    });

    const busiest = useMemo(() => people.slice(0, 6), [people]);

    return (
        <>
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
        </>
    );
}
