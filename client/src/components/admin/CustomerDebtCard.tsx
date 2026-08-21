/**
 * One customer as a square tile, used everywhere customers are shown.
 *
 * Deliberately one component rather than a nice card per screen. Customers
 * appear in Catch-Up, in Finance and in the Customers tab, and three separately
 * designed versions would drift until the same person looked like three
 * different records. The only thing that changes between screens is the order
 * they are laid out in — most recently touched in Catch-Up, largest debt first
 * in Finance — which is the caller's business, not the tile's.
 *
 * A tile shows what somebody chasing money needs at a glance: who, how much,
 * and across how many jobs. Everything else waits until it is tapped.
 */
import { Building2, User } from "lucide-react";
import { cn } from "@/lib/utils";

export type DebtorKind = "retail" | "corporate";

export interface DebtorTile {
    kind: DebtorKind;
    id: string;
    name: string;
    phone?: string | null;
    clientClass?: string | null;
    clientType?: string | null;
    owed: number;
    openCount: number;
    lastActivity?: string | null;
    /** Days the oldest unpaid item has been waiting. */
    oldestUnpaidDays?: number;
}

/**
 * How old a debt is, in the terms a shop thinks in.
 *
 * Amount alone told a manager nothing about urgency: 5,000 owed since Tuesday
 * and 5,000 owed since March looked identical, and the second is the one that
 * needs a call today. Colour carries the age so a tile says which without being
 * opened.
 *
 * The bands are the shop's own rhythm, not arbitrary: a fortnight is normal
 * credit, a month is late, past two months somebody has stopped answering.
 */
export type DebtAge = "fresh" | "due" | "late" | "stale";

export function debtAge(days: number | undefined): DebtAge {
    const d = days ?? 0;
    if (d >= 60) return "stale";
    if (d >= 30) return "late";
    if (d >= 14) return "due";
    return "fresh";
}

const AGE_STYLE: Record<DebtAge, { tile: string; text: string; chip: string; label: (d: number) => string }> = {
    fresh: {
        tile: "border-slate-200 bg-white hover:border-slate-300",
        text: "text-slate-900", chip: "bg-slate-100 text-slate-500",
        label: (d) => (d <= 1 ? "today" : `${d} days`),
    },
    due: {
        tile: "border-amber-200 bg-amber-50/60 hover:border-amber-300",
        text: "text-amber-800", chip: "bg-amber-100 text-amber-700",
        label: (d) => `${d} days`,
    },
    late: {
        tile: "border-rose-200 bg-rose-50/70 hover:border-rose-300",
        text: "text-rose-800", chip: "bg-rose-100 text-rose-700",
        label: (d) => `${d} days late`,
    },
    stale: {
        // Deliberately the loudest thing on the screen. Two months of silence
        // is not a slow payer, it is a debt somebody has stopped chasing.
        tile: "border-rose-400 bg-rose-100/80 hover:border-rose-500",
        text: "text-rose-900", chip: "bg-rose-600 text-white",
        label: (d) => `${Math.floor(d / 30)} months`,
    },
};

/** Two letters, so a tile reads as a person even before the name is scanned. */
function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** The shop's own words for the four kinds, not the database's. */
function typeLabel(d: DebtorTile): string {
    if (d.kind === "retail") return "Person";
    if (d.clientType === "limited_company") return "Corporate Ltd";
    if (d.clientClass === "b2b_corporate") return "Corporate";
    return "Business";
}

export function CustomerDebtCard({
    debtor, onOpen, currency = "৳",
}: {
    debtor: DebtorTile;
    onOpen?: (d: DebtorTile) => void;
    currency?: string;
}) {
    const owes = debtor.owed > 0.009;
    const isCompany = debtor.kind === "corporate";
    const age = debtAge(debtor.oldestUnpaidDays);
    const style = AGE_STYLE[age];

    return (
        <button
            type="button"
            onClick={() => onOpen?.(debtor)}
            className={cn(
                // aspect-square is the whole point: a grid of equal tiles scans
                // far faster than rows of text, and two or three fit a phone.
                "group flex aspect-square w-full flex-col justify-between rounded-2xl border p-4 text-left",
                "transition-all active:scale-[0.98]",
                owes ? style.tile : "border-emerald-100 bg-emerald-50/40 hover:border-emerald-200",
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <div className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-black",
                    isCompany ? "bg-indigo-100 text-indigo-700" : "bg-slate-900 text-white",
                )}>
                    {initials(debtor.name)}
                </div>
                {isCompany
                    ? <Building2 className="h-4 w-4 shrink-0 text-indigo-400" />
                    : <User className="h-4 w-4 shrink-0 text-slate-300" />}
            </div>

            <div className="min-w-0">
                <div className="truncate text-sm font-bold leading-tight text-slate-900">{debtor.name}</div>
                <div className="mt-0.5 truncate text-[11px] text-slate-500">
                    {typeLabel(debtor)}
                    {debtor.phone ? ` · ${debtor.phone}` : ""}
                </div>
            </div>

            <div>
                {owes ? (
                    <>
                        <div className={cn("font-mono text-lg font-black leading-none", style.text)}>
                            {currency} {debtor.owed.toLocaleString()}
                        </div>
                        <div className="mt-1 flex items-center gap-1">
                            {/*
                              * The age chip, not just the amount. It is what turns
                              * a list of numbers into a list of decisions.
                              */}
                            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", style.chip)}>
                                {style.label(debtor.oldestUnpaidDays ?? 0)}
                            </span>
                            <span className="text-[10px] font-semibold text-slate-400">
                                {debtor.openCount} open
                            </span>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="font-mono text-lg font-black leading-none text-emerald-600">
                            {currency} 0
                        </div>
                        <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                            settled
                        </div>
                    </>
                )}
            </div>
        </button>
    );
}

/**
 * The grid the tiles live in.
 *
 * Two across on a phone and three on a tablet, which is what makes the square
 * shape worth having — a list of the same information takes four times the
 * scrolling to reach the same customer.
 */
export function CustomerDebtGrid({
    debtors, onOpen, currency, emptyText = "Nobody owes anything.",
}: {
    debtors: DebtorTile[];
    onOpen?: (d: DebtorTile) => void;
    currency?: string;
    emptyText?: string;
}) {
    if (!debtors.length) {
        return <p className="py-8 text-center text-sm text-slate-400">{emptyText}</p>;
    }
    return (
        // Two on a phone, three above it, and no more: four across made the
        // tiles small enough that the amount stopped being the thing you see.
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {debtors.map((d) => (
                <CustomerDebtCard key={`${d.kind}-${d.id}`} debtor={d} onOpen={onOpen} currency={currency} />
            ))}
        </div>
    );
}
