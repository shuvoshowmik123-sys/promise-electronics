import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Check, Loader2, ReceiptText, Store, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchApi } from "@/lib/api";
import { toast } from "sonner";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

/**
 * The buying prices owed from today's counter sales.
 *
 * This is where the 19:00 nudge lands. A reminder that opens a screen which
 * asks nothing is how people learn to ignore reminders, so the one number
 * being chased is the only thing on the row: type it, tap, done.
 *
 * Deliberately shows the SELLING price beside the input. The person settling
 * has to recall what they paid for a part hours earlier, and the price it went
 * out at is the strongest memory cue available — it is usually the number they
 * quoted around.
 *
 * Scope is personal by default. A manager can see everyone's outstanding costs
 * because settling on someone's behalf is a real end-of-shift task, but a
 * cashier sees only their own: what someone else paid a vendor is not their
 * business, and a longer list makes their own work harder to finish.
 */

interface PendingCost {
    id: string;
    posTransactionId: string;
    jobTicketId: string | null;
    partName: string;
    sellingPrice: number;
    quantity: number;
    warrantyDays: number | null;
    billedBy: string;
    billedByName: string;
    createdAt: string;
}

const money = (n: number) => `৳ ${Math.round(Number(n) || 0).toLocaleString()}`;

function CostRow({ row, onSettled }: { row: PendingCost; onSettled: () => void }) {
    const [value, setValue] = useState("");
    const parsed = Number(value);
    const valid = value.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;

    const settle = useMutation({
        mutationFn: () =>
            fetchApi(`/pos/pending-part-costs/${row.id}`, {
                method: "PATCH",
                body: JSON.stringify({ costPrice: Math.round(parsed * 100) / 100 }),
            }),
        onSuccess: () => {
            toast.success(`${row.partName} settled`);
            onSettled();
        },
        onError: (err: any) => {
            // A second settlement is refused rather than overwritten, so a
            // repeated tap on a slow connection lands here harmlessly.
            toast.error(err?.message?.includes("Already") ? "Already settled" : "Could not save the cost");
        },
    });

    const margin = valid ? Number(row.sellingPrice) * (Number(row.quantity) || 1) - parsed : null;

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-slate-950">{row.partName}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-medium text-slate-500">
                        <span className="inline-flex items-center gap-1">
                            <ReceiptText className="h-3 w-3" />
                            {row.posTransactionId.slice(0, 12)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {row.billedByName}
                        </span>
                        <span>{format(new Date(row.createdAt), "d MMM · h:mm a")}</span>
                    </div>
                </div>
                <div className="shrink-0 text-right">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Sold at</p>
                    <p className="text-[13px] font-black tabular-nums text-slate-950">{money(row.sellingPrice)}</p>
                    {row.quantity > 1 && (
                        <p className="text-[10px] font-medium text-slate-500">× {row.quantity}</p>
                    )}
                </div>
            </div>

            <div className="mt-2.5 flex items-center gap-2">
                <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] font-bold text-slate-400">৳</span>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder="What you paid"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-6 pr-2.5 text-[13px] font-bold text-slate-950 placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                </div>
                <button
                    type="button"
                    disabled={!valid || settle.isPending}
                    onClick={() => settle.mutate()}
                    className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-[12px] font-bold text-white shadow-sm active:scale-[0.98] disabled:opacity-40"
                >
                    {settle.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Save
                </button>
            </div>

            {/* Immediate feedback on the number that matters. */}
            {margin !== null && (
                <p className={cn(
                    "mt-1.5 text-[10px] font-bold",
                    margin >= 0 ? "text-emerald-600" : "text-rose-600",
                )}>
                    {margin >= 0 ? `Profit ${money(margin)}` : `Loss ${money(Math.abs(margin))}`}
                </p>
            )}
        </div>
    );
}

export function PendingCostsView() {
    const { user } = useAdminAuth();
    const queryClient = useQueryClient();
    const isManager = ["Super Admin", "Manager"].includes(String(user?.role || ""));
    const [showAll, setShowAll] = useState(false);

    const { data: rows = [], isLoading, refetch } = useQuery({
        queryKey: ["pending-part-costs", showAll],
        queryFn: () => fetchApi<PendingCost[]>(`/pos/pending-part-costs${showAll ? "?all=true" : ""}`),
    });

    const onSettled = () => {
        refetch();
        // The evening nudge counts these, and the drawer view reads the same
        // sales — both go stale the moment one is settled.
        queryClient.invalidateQueries({ queryKey: ["pos-transactions-paginated"] });
    };

    return (
        <div className="space-y-2">
            <div className="flex items-start justify-between gap-2 px-0.5">
                <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Buying price owed</p>
                    <p className="text-[11px] font-medium text-slate-500">
                        Sourced parts billed without a cost. Settle before the shift ends.
                    </p>
                </div>
                {isManager && (
                    <button
                        type="button"
                        onClick={() => setShowAll((v) => !v)}
                        className={cn(
                            "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
                            showAll
                                ? "border-blue-100 bg-blue-50 text-blue-700"
                                : "border-slate-200 bg-white text-slate-500",
                        )}
                    >
                        {showAll ? "Everyone" : "Mine"}
                    </button>
                )}
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                </div>
            ) : rows.length === 0 ? (
                /* Nothing owed is the normal state, and should feel like it. */
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center shadow-sm">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50">
                        <Store className="h-4 w-4 text-emerald-600" />
                    </span>
                    <p className="text-[13px] font-bold text-slate-950">Nothing outstanding</p>
                    <p className="text-[11px] font-medium text-slate-500">
                        Every sourced part billed {showAll ? "" : "by you "}has its buying price recorded.
                    </p>
                </div>
            ) : (
                rows.map((row) => <CostRow key={row.id} row={row} onSettled={onSettled} />)
            )}
        </div>
    );
}
