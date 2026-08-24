/**
 * Bulk removal of test records, and the bin that makes it reversible.
 *
 * Two layouts rather than one stretched between them. A desktop has room for a
 * type rail beside the list and expects a table, hover, and a keyboard. A phone
 * has a thumb: the rail becomes chips across the top, rows become cards big
 * enough to hit, and the action bar is fixed above the dock.
 *
 * Portalled to the body because a `position: fixed` panel is measured against
 * the nearest transformed ancestor, and the admin shell has several. This is
 * the same escape the statement sheet and the catch-up action bar already use.
 *
 * Two things on screen are load-bearing and neither is decoration:
 *
 * - **Why a row is here.** Nothing marks a record as test, so these are matches
 *   on a name. The person deleting has to see that and judge it, which is why
 *   nothing is ticked for them.
 * - **What else goes.** Twenty-nine of these links have no foreign key behind
 *   them, so one job can take a dozen rows with it. The count sits next to the
 *   button that does it.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Trash2, RotateCcw, X, Lock, AlertTriangle, Loader2, Clock, Eye, ChevronLeft, Search,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { recordBinApi, type BinCandidate, type BinEntry } from "@/lib/api/adminApi";

type Tab = "find" | "bin";

function money(n: number | null): string {
    if (n == null) return "";
    return `৳${Number(n).toLocaleString("en-BD")}`;
}

function shortDate(iso: string | null): string {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function RecordCleanupOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
    const queryClient = useQueryClient();
    const [tab, setTab] = useState<Tab>("find");
    const [activeType, setActiveType] = useState<string>("job");
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [pickedBin, setPickedBin] = useState<Set<string>>(new Set());
    const [confirmWord, setConfirmWord] = useState("");
    const [viewing, setViewing] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [showAll, setShowAll] = useState(false);

    // Escape closes, as it does everywhere else on desktop.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    // The page behind must not scroll while this is over it.
    useEffect(() => {
        if (!open) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = previous; };
    }, [open]);

    const { data: types } = useQuery({
        queryKey: ["recordBinTypes"],
        queryFn: recordBinApi.getTypes,
        enabled: open,
    });

    // Debounced so typing a name does not fire a query per keystroke.
    const [debounced, setDebounced] = useState("");
    useEffect(() => {
        const t = window.setTimeout(() => setDebounced(search), 300);
        return () => window.clearTimeout(t);
    }, [search]);

    const { data: candidateData, isLoading: loadingCandidates } = useQuery({
        queryKey: ["recordBinCandidates", activeType, debounced, showAll],
        queryFn: () => recordBinApi.getCandidates(activeType, { search: debounced, showAll }),
        enabled: open && tab === "find",
    });

    const { data: binData, isLoading: loadingBin } = useQuery({
        queryKey: ["recordBin"],
        queryFn: recordBinApi.getBin,
        enabled: open && tab === "bin",
    });

    const { data: entryDetail } = useQuery({
        queryKey: ["recordBinEntry", viewing],
        queryFn: () => recordBinApi.getEntry(viewing!),
        enabled: Boolean(viewing),
    });

    const candidates = candidateData?.candidates ?? [];
    const deletable = useMemo(() => candidates.filter((c) => !c.blocked), [candidates]);
    const blockedCount = candidates.length - deletable.length;
    const entries = binData?.entries ?? [];
    const activeTypeError = (types?.types ?? []).find((t) => t.key === activeType)?.error ?? null;

    // Switching type starts a fresh selection: carrying ticks across lists you
    // can no longer see is how the wrong thing gets deleted.
    useEffect(() => { setPicked(new Set()); setConfirmWord(""); }, [activeType, debounced, showAll]);

    const linkedTotal = useMemo(
        () => candidates.filter((c) => picked.has(c.id)).reduce((sum, c) => sum + c.linkedCount, 0),
        [candidates, picked],
    );

    const removeMutation = useMutation({
        mutationFn: () => recordBinApi.remove(activeType, Array.from(picked)),
        onSuccess: (res) => {
            toast.success(
                `Removed ${res.deleted.length} record${res.deleted.length === 1 ? "" : "s"}` +
                (res.linkedRowsRemoved ? ` and ${res.linkedRowsRemoved} linked rows` : "") +
                ". Recoverable from the bin for 24 hours.",
            );
            if (res.refused.length > 0) {
                toast.warning(`${res.refused.length} could not be removed: ${res.refused[0].reason}`);
            }
            setPicked(new Set());
            setConfirmWord("");
            queryClient.invalidateQueries({ queryKey: ["recordBinCandidates"] });
            queryClient.invalidateQueries({ queryKey: ["recordBinTypes"] });
            queryClient.invalidateQueries({ queryKey: ["recordBin"] });
        },
        onError: (e: Error) => toast.error(e.message || "Could not remove those records."),
    });

    const restoreMutation = useMutation({
        mutationFn: () => recordBinApi.restore(Array.from(pickedBin)),
        onSuccess: (res) => {
            toast.success(`Restored ${res.restored.length}, ${res.rowsRestored} rows back.`);
            if (res.refused.length > 0) toast.warning(res.refused[0].reason);
            setPickedBin(new Set());
            queryClient.invalidateQueries({ queryKey: ["recordBin"] });
            queryClient.invalidateQueries({ queryKey: ["recordBinCandidates"] });
            queryClient.invalidateQueries({ queryKey: ["recordBinTypes"] });
        },
        onError: (e: Error) => toast.error(e.message || "Could not restore."),
    });

    const purgeMutation = useMutation({
        mutationFn: () => recordBinApi.purge(Array.from(pickedBin)),
        onSuccess: (res) => {
            toast.success(`${res.purged} entr${res.purged === 1 ? "y" : "ies"} permanently removed.`);
            setPickedBin(new Set());
            queryClient.invalidateQueries({ queryKey: ["recordBin"] });
        },
        onError: (e: Error) => toast.error(e.message || "Could not empty the bin."),
    });

    if (!open) return null;

    const toggle = (set: Set<string>, id: string, apply: (s: Set<string>) => void) => {
        const next = new Set(set);
        if (next.has(id)) next.delete(id); else next.add(id);
        apply(next);
    };

    const allDeletablePicked = deletable.length > 0 && deletable.every((c) => picked.has(c.id));

    return createPortal(
        <div className="fixed inset-0 z-[120] flex flex-col bg-slate-900/60 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
            <div
                className={cn(
                    "flex min-h-0 flex-1 flex-col overflow-hidden bg-white",
                    // Phone: a sheet filling the screen. Desktop: a panel with room around it.
                    "mt-12 rounded-t-3xl sm:mt-0 sm:h-[86vh] sm:w-full sm:max-w-6xl sm:flex-none sm:rounded-2xl sm:shadow-2xl",
                )}
            >
                {/* Grab handle reads as "this can be dismissed" on a phone. */}
                <div className="flex justify-center pt-2 sm:hidden">
                    <div className="h-1.5 w-10 rounded-full bg-slate-300" />
                </div>

                <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
                    <div className="min-w-0">
                        <h2 className="truncate text-base font-black text-slate-900 sm:text-lg">
                            {tab === "find" ? "Remove test records" : "Recycle bin"}
                        </h2>
                        <p className="hidden text-xs text-slate-500 sm:block">
                            {tab === "find"
                                ? "Matched by name — check each one before removing it."
                                : `Kept for ${binData?.retentionHours ?? 24} hours, then gone for good.`}
                        </p>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="mr-1 flex rounded-xl bg-slate-100 p-1">
                            {(["find", "bin"] as Tab[]).map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setTab(t)}
                                    className={cn(
                                        "rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
                                        tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500",
                                    )}
                                >
                                    {t === "find" ? "Find" : `Bin${entries.length ? ` ${entries.length}` : ""}`}
                                </button>
                            ))}
                        </div>
                        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                            <X className="h-5 w-5" />
                        </Button>
                    </div>
                </header>

                {tab === "find" ? (
                    <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
                        {/* Desktop: a rail. Phone: chips, because a sidebar on a phone is a scroll trap. */}
                        <nav className="shrink-0 overflow-x-auto border-b border-slate-200 sm:w-56 sm:overflow-y-auto sm:border-b-0 sm:border-r">
                            <div className="flex gap-2 p-3 sm:flex-col sm:gap-1">
                                {(types?.types ?? []).map((t) => (
                                    <button
                                        key={t.key}
                                        onClick={() => setActiveType(t.key)}
                                        className={cn(
                                            "flex shrink-0 items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                                            activeType === t.key
                                                ? "bg-slate-900 text-white sm:bg-slate-100 sm:text-slate-900"
                                                : "bg-slate-100 text-slate-600 sm:bg-transparent",
                                        )}
                                    >
                                        <span className="whitespace-nowrap">{t.label}</span>
                                        <span className="font-mono text-xs opacity-70">
                                            {t.error ? "!" : showAll || debounced ? t.total : t.count}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </nav>

                        <div className="flex min-h-0 flex-1 flex-col">
                            {/*
                              * The keyword is a first guess, not the only door.
                              *
                              * Records made before anyone thought to name them "QA"
                              * are invisible to the pattern, and on a real shop's
                              * data that is most of them. Someone who knows the
                              * record exists has to be able to go and get it.
                              */}
                            <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-2.5 sm:flex-row sm:items-center sm:px-5">
                                <div className="relative flex-1">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                    <Input
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Search by name, phone or id..."
                                        className="h-10 pl-9"
                                    />
                                </div>
                                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-slate-300"
                                        checked={showAll}
                                        onChange={(e) => { setShowAll(e.target.checked); setSearch(""); }}
                                    />
                                    Show every record
                                </label>
                            </div>

                            {(showAll || debounced) && (
                                <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-[11px] font-semibold text-amber-800 sm:px-5">
                                    Showing real records too &mdash; these are not matched as test data. Read each one before you tick it.
                                </p>
                            )}

                            {activeTypeError && (
                                <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-[11px] font-semibold text-red-700 sm:px-5">
                                    This type could not be read here: {activeTypeError}
                                </p>
                            )}

                            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5 sm:px-5">
                                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                                    <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-slate-300"
                                        checked={allDeletablePicked}
                                        onChange={(e) =>
                                            setPicked(e.target.checked ? new Set(deletable.map((c) => c.id)) : new Set())
                                        }
                                    />
                                    Select all {deletable.length}
                                </label>
                                {blockedCount > 0 && (
                                    <span className="flex items-center gap-1 text-xs font-semibold text-amber-700">
                                        <Lock className="h-3.5 w-3.5" /> {blockedCount} protected
                                    </span>
                                )}
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 sm:px-5">
                                {loadingCandidates ? (
                                    <div className="flex h-40 items-center justify-center text-slate-400">
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    </div>
                                ) : candidates.length === 0 ? (
                                    <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-400">
                                        <Trash2 className="h-8 w-8" />
                                        <p className="text-sm font-medium">
                                            {debounced
                                                ? "Nothing matched that search."
                                                : showAll
                                                    ? "There are no records of this type."
                                                    : "Nothing here is named like test data."}
                                        </p>
                                        {!showAll && !debounced && (
                                            <button
                                                onClick={() => setShowAll(true)}
                                                className="text-xs font-bold text-blue-600 underline"
                                            >
                                                Show every record instead
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <ul className="space-y-1.5 sm:space-y-0.5">
                                        {candidates.map((c) => (
                                            <CandidateRow
                                                key={c.id}
                                                candidate={c}
                                                checked={picked.has(c.id)}
                                                onToggle={() => toggle(picked, c.id, setPicked)}
                                            />
                                        ))}
                                    </ul>
                                )}
                            </div>

                            {picked.size > 0 && (
                                <footer className="border-t border-slate-200 bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5 sm:pb-3">
                                    <p className="mb-2 text-xs font-semibold text-slate-600">
                                        {picked.size} selected
                                        {linkedTotal > 0 && (
                                            <span className="text-amber-700"> · also removes {linkedTotal} linked row{linkedTotal === 1 ? "" : "s"}</span>
                                        )}
                                    </p>
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                                        <Input
                                            value={confirmWord}
                                            onChange={(e) => setConfirmWord(e.target.value)}
                                            placeholder="Type DELETE to confirm"
                                            className="h-11 sm:h-10 sm:w-56"
                                        />
                                        <Button
                                            className="h-11 bg-red-600 hover:bg-red-700 sm:h-10"
                                            disabled={confirmWord !== "DELETE" || removeMutation.isPending}
                                            onClick={() => removeMutation.mutate()}
                                        >
                                            {removeMutation.isPending
                                                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Removing…</>
                                                : <><Trash2 className="mr-2 h-4 w-4" /> Delete {picked.size}</>}
                                        </Button>
                                    </div>
                                </footer>
                            )}
                        </div>
                    </div>
                ) : (
                    <BinPane
                        entries={entries}
                        loading={loadingBin}
                        picked={pickedBin}
                        onToggle={(id) => toggle(pickedBin, id, setPickedBin)}
                        onSelectAll={(all) => setPickedBin(all ? new Set(entries.map((e) => e.id)) : new Set())}
                        viewing={viewing}
                        setViewing={setViewing}
                        detail={entryDetail}
                        onRestore={() => restoreMutation.mutate()}
                        onPurge={() => purgeMutation.mutate()}
                        restoring={restoreMutation.isPending}
                        purging={purgeMutation.isPending}
                    />
                )}
            </div>
        </div>,
        document.body,
    );
}

/** One candidate. Blocked rows stay visible and unticked — hiding them hides the reason. */
function CandidateRow({
    candidate, checked, onToggle,
}: { candidate: BinCandidate; checked: boolean; onToggle: () => void }) {
    const blocked = candidate.blocked;
    return (
        <li>
            <label
                className={cn(
                    "flex items-start gap-3 rounded-xl border p-3 transition-colors sm:rounded-lg sm:border-0 sm:border-b sm:border-slate-100 sm:px-2 sm:py-2.5",
                    blocked
                        ? "border-amber-200 bg-amber-50/50 sm:bg-transparent"
                        : "cursor-pointer border-slate-200 hover:bg-slate-50 sm:border-transparent",
                    checked && "border-blue-300 bg-blue-50/60 sm:bg-blue-50/40",
                )}
            >
                <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 sm:h-4 sm:w-4"
                    checked={checked}
                    disabled={blocked}
                    onChange={onToggle}
                />
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-bold text-slate-900">{candidate.title}</p>
                        {candidate.amount != null && (
                            <span className="shrink-0 font-mono text-xs font-semibold text-slate-600">
                                {money(candidate.amount)}
                            </span>
                        )}
                    </div>
                    <p className="truncate text-xs text-slate-500">
                        {[candidate.subtitle, shortDate(candidate.date)].filter(Boolean).join(" · ")}
                    </p>
                    {blocked ? (
                        <p className="mt-1 flex items-start gap-1 text-xs font-semibold text-amber-700">
                            <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                            Cannot delete — {candidate.blockedReason}
                        </p>
                    ) : (
                        <p className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                            <span className={cn(
                                "rounded px-1.5 py-0.5 font-semibold",
                                candidate.reason === "name_match"
                                    ? "bg-slate-100 text-slate-500"
                                    : "bg-amber-100 text-amber-700",
                            )}>
                                {candidate.reason === "name_match"
                                    ? "name looks like test"
                                    : "not matched as test - your judgement"}
                            </span>
                            {candidate.linkedCount > 0 && <span>+{candidate.linkedCount} linked</span>}
                        </p>
                    )}
                </div>
            </label>
        </li>
    );
}

function BinPane({
    entries, loading, picked, onToggle, onSelectAll, viewing, setViewing, detail,
    onRestore, onPurge, restoring, purging,
}: {
    entries: BinEntry[]; loading: boolean; picked: Set<string>;
    onToggle: (id: string) => void; onSelectAll: (all: boolean) => void;
    viewing: string | null; setViewing: (id: string | null) => void;
    detail: { entry: BinEntry; tables: Array<{ table: string; rows: Array<Record<string, unknown>> }> } | undefined;
    onRestore: () => void; onPurge: () => void; restoring: boolean; purging: boolean;
}) {
    // Opening one entry replaces the list rather than sitting beside it, so the
    // same view works on a phone without a second panel to squeeze in.
    if (viewing) {
        return (
            <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
                    <Button variant="ghost" size="sm" onClick={() => setViewing(null)}>
                        <ChevronLeft className="mr-1 h-4 w-4" /> Back
                    </Button>
                    <p className="truncate text-sm font-bold text-slate-900">{detail?.entry.label ?? "…"}</p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                    {!detail ? (
                        <div className="flex h-32 items-center justify-center text-slate-400">
                            <Loader2 className="h-5 w-5 animate-spin" />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {detail.tables.map((t) => (
                                <section key={t.table}>
                                    <h4 className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-500">
                                        {t.table.replace(/_/g, " ")} · {t.rows.length}
                                    </h4>
                                    {t.rows.map((row, i) => (
                                        <div key={i} className="mb-2 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                                            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                                                {Object.entries(row)
                                                    .filter(([, v]) => v !== null && v !== "")
                                                    .slice(0, 24)
                                                    .map(([k, v]) => (
                                                        <div key={k} className="flex gap-2 text-xs">
                                                            <dt className="shrink-0 font-semibold text-slate-500">{k}</dt>
                                                            <dd className="truncate text-slate-800">{String(v)}</dd>
                                                        </div>
                                                    ))}
                                            </dl>
                                        </div>
                                    ))}
                                </section>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const allPicked = entries.length > 0 && entries.every((e) => picked.has(e.id));

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 sm:px-5">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                    <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={allPicked}
                        onChange={(e) => onSelectAll(e.target.checked)}
                    />
                    Select all {entries.length}
                </label>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 sm:px-5">
                {loading ? (
                    <div className="flex h-40 items-center justify-center text-slate-400">
                        <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                ) : entries.length === 0 ? (
                    <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-400">
                        <Trash2 className="h-8 w-8" />
                        <p className="text-sm font-medium">The bin is empty.</p>
                    </div>
                ) : (
                    <ul className="space-y-1.5">
                        {entries.map((e) => {
                            const soon = e.hoursLeft < 6;
                            return (
                                <li key={e.id}>
                                    <div
                                        className={cn(
                                            "flex items-start gap-3 rounded-xl border p-3 sm:rounded-lg",
                                            picked.has(e.id) ? "border-blue-300 bg-blue-50/60" : "border-slate-200",
                                        )}
                                    >
                                        <input
                                            type="checkbox"
                                            className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 sm:h-4 sm:w-4"
                                            checked={picked.has(e.id)}
                                            onChange={() => onToggle(e.id)}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-bold text-slate-900">{e.label}</p>
                                            <p className="text-xs text-slate-500">
                                                {e.rowCount} row{e.rowCount === 1 ? "" : "s"}
                                                {e.deletedByName ? ` · by ${e.deletedByName}` : ""}
                                            </p>
                                            <p className={cn(
                                                "mt-1 flex items-center gap-1 text-[11px] font-semibold",
                                                soon ? "text-red-600" : "text-slate-400",
                                            )}>
                                                {soon && <AlertTriangle className="h-3 w-3" />}
                                                <Clock className="h-3 w-3" />
                                                {e.hoursLeft < 1
                                                    ? `purges in ${Math.round(e.hoursLeft * 60)} min`
                                                    : `purges in ${Math.floor(e.hoursLeft)}h`}
                                            </p>
                                        </div>
                                        <Button variant="ghost" size="sm" onClick={() => setViewing(e.id)}>
                                            <Eye className="mr-1 h-4 w-4" /> View
                                        </Button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {picked.size > 0 && (
                <footer className="flex flex-col gap-2 border-t border-slate-200 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:pb-3">
                    <p className="text-xs font-semibold text-slate-600">{picked.size} selected</p>
                    <div className="flex gap-2">
                        <Button variant="outline" className="h-11 flex-1 sm:h-10 sm:flex-none"
                            disabled={purging} onClick={onPurge}>
                            {purging ? <Loader2 className="h-4 w-4 animate-spin" /> : "Purge now"}
                        </Button>
                        <Button className="h-11 flex-1 bg-emerald-600 hover:bg-emerald-700 sm:h-10 sm:flex-none"
                            disabled={restoring} onClick={onRestore}>
                            {restoring
                                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Restoring…</>
                                : <><RotateCcw className="mr-2 h-4 w-4" /> Restore {picked.size}</>}
                        </Button>
                    </div>
                </footer>
            )}
        </div>
    );
}
