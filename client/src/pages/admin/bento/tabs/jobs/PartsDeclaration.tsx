import { useEffect, useMemo, useRef, useState } from "react";
import {
    AlertCircle, Check, Minus, Package, PackagePlus, Plus, Search, Store, Trash2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatModelNumber } from "@shared/part-types";

/**
 * Declaring which parts a repair actually consumed.
 *
 * Technicians recorded parts as prose in a notes box — "changed the panel and a
 * couple of caps" — so nothing was countable and stock drifted permanently.
 * Corporate jobs had a structured editor; ordinary walk-in repairs, which are
 * most of the volume, had none. This is that missing editor, and it is where
 * the nightly nudge sends people.
 *
 * WHY OUT-OF-STOCK PARTS STAY SELECTABLE
 *
 * The catalogue says zero, the part is in the technician's hand, and the repair
 * is already done. Refusing the entry would not un-fit the part; it would only
 * mean the truth never gets recorded and the count stays wrong. Stock is dimmed
 * and labelled, never blocked — this screen records what happened, it does not
 * authorise it.
 *
 * WHY "NOTHING WAS USED" IS A BUTTON
 *
 * Most repairs consume nothing worth counting. Without an explicit way to say
 * so, the honest answer and the unanswered one look identical, and a nudge
 * cannot tell who still owes a declaration. Saying nothing is a real answer and
 * has to be recordable in one tap, or people invent a part to make the prompt
 * go away.
 *
 * Persistence belongs to the parent. This never calls an API, so it can be
 * mounted from a sheet, a dialog, or a page without carrying assumptions about
 * where the job came from.
 */

export interface ProductLineItem {
    id: string;
    /** "" for a part sourced outside the catalogue. */
    inventoryItemId: string;
    name: string;
    /**
     * Copied onto the line, not looked up later.
     *
     * The catalogue row can be renamed, re-modelled or deleted years before
     * anyone asks what was fitted to this television, and a warranty claim
     * answered with a blank — or worse, with a corrected model number — is no
     * answer. The line keeps what was true on the day.
     */
    modelNumber?: string;
    partType?: string;
    quantity: number;
    unitPrice: number;
    isSerialized?: boolean;
    serialNumbers?: string[];
    source?: "inventory" | "outsourced";
    purchaseNote?: string;
}

export interface PartsDeclarationInventoryItem {
    id: string;
    name: string;
    category?: string;
    /** Which part this actually is. Panels are not interchangeable by size. */
    modelNumber?: string;
    /** Panel, Motherboard, Android voice-control motherboard, … */
    partType?: string;
    price: number | string;
    stock?: number;
    isSerialized?: boolean;
}

export interface PartsDeclarationProps {
    jobId: string;
    jobLabel: string;
    initialLines: ProductLineItem[];
    inventory: PartsDeclarationInventoryItem[];
    isSaving: boolean;
    onSave: (lines: ProductLineItem[]) => void;
    onCancel: () => void;
    /**
     * An extra action for the footer, e.g. a Manager completing without
     * declaring.
     *
     * Taken as a prop rather than rendered beside this component, because this
     * component is h-full: a sibling after it is pushed past the bottom of the
     * dialog, leaving a band of dead white space and an action nobody can reach
     * without scrolling a screen that does not scroll.
     */
    footerAction?: React.ReactNode;
}

type Tone = "emerald" | "blue" | "amber" | "rose" | "violet" | "slate";

const toneClasses: Record<Tone, string> = {
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    rose: "border-rose-100 bg-rose-50 text-rose-700",
    violet: "border-violet-100 bg-violet-50 text-violet-700",
    slate: "border-slate-100 bg-slate-50 text-slate-700",
};

const LABEL = "text-[11px] font-bold uppercase tracking-wide text-slate-500 md:text-[10px]";
const INPUT =
    "h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-[13px] font-bold text-slate-950 placeholder:font-medium placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20";

function newId(): string {
    // randomUUID is unavailable on http:// origins in some browsers, and this
    // id only has to be unique within one unsaved list.
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `line-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const money = (n: number): string => `৳ ${Math.round(n).toLocaleString()}`;

function stockTone(stock: number | undefined): { tone: Tone; label: string } | null {
    if (stock === undefined) return null;
    if (stock <= 0) return { tone: "rose", label: "Out" };
    if (stock <= 5) return { tone: "amber", label: `Low · ${stock}` };
    return { tone: "emerald", label: `${stock} in stock` };
}

/**
 * Serial inputs track quantity, but existing entries are preserved when the
 * count changes — retyping four serials because a fifth was added is exactly
 * the friction that makes people abandon the form.
 */
function resizeSerials(existing: string[] | undefined, quantity: number): string[] {
    const next = (existing ?? []).slice(0, quantity);
    while (next.length < quantity) next.push("");
    return next;
}

function lineIsIncomplete(line: ProductLineItem): boolean {
    if (!line.isSerialized) return false;
    const serials = line.serialNumbers ?? [];
    return serials.length !== line.quantity || serials.some((s) => !s.trim());
}

export function PartsDeclaration({
    jobLabel,
    initialLines,
    inventory,
    isSaving,
    onSave,
    onCancel,
    footerAction,
}: PartsDeclarationProps) {
    const [lines, setLines] = useState<ProductLineItem[]>(initialLines);
    const [query, setQuery] = useState("");
    const [sourcedOpen, setSourcedOpen] = useState(false);

    /**
     * Take the tab dock off screen while this is open.
     *
     * It used to be dodged instead — seven rem of dead padding under the action
     * bar so the Save button cleared a dock floating above the dialog. On a
     * phone that is a sixth of the screen spent on empty space, in the one
     * place that needs every row it can show.
     *
     * The shell already listens for this; the attendance viewer and the mobile
     * primitives use the same event. Restored on unmount so closing the dialog
     * cannot leave the dock hidden.
     */
    useEffect(() => {
        window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: true } }));
        return () => {
            window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: false } }));
        };
    }, []);
    const [sourcedName, setSourcedName] = useState("");
    const [sourcedPrice, setSourcedPrice] = useState("");
    const [sourcedNote, setSourcedNote] = useState("");
    const [showErrors, setShowErrors] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);

    const trimmedQuery = query.trim();
    const loweredQuery = trimmedQuery.toLowerCase();

    const results = useMemo(() => {
        if (!loweredQuery) return inventory.slice(0, 40);
        return inventory.filter(
            (item) =>
                item.name.toLowerCase().includes(loweredQuery) ||
                (item.category ?? "").toLowerCase().includes(loweredQuery) ||
                // A technician searches by what is printed on the old board.
                (item.modelNumber ?? "").toLowerCase().includes(loweredQuery) ||
                (item.partType ?? "").toLowerCase().includes(loweredQuery),
        );
    }, [inventory, loweredQuery]);

    const total = useMemo(
        () => lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0),
        [lines],
    );

    const incompleteCount = lines.filter(lineIsIncomplete).length;

    const addFromInventory = (item: PartsDeclarationInventoryItem) => {
        setLines((prev) => {
            const existing = prev.find((l) => l.inventoryItemId === item.id && !l.isSerialized);
            if (existing) {
                return prev.map((l) =>
                    l.id === existing.id ? { ...l, quantity: l.quantity + 1 } : l,
                );
            }
            return [...prev, {
                id: newId(),
                inventoryItemId: item.id,
                name: item.name,
                // Snapshotted onto the line, for the reason on the field itself.
                modelNumber: item.modelNumber,
                partType: item.partType,
                quantity: 1,
                unitPrice: Number(item.price) || 0,
                isSerialized: item.isSerialized ?? false,
                serialNumbers: item.isSerialized ? [""] : undefined,
                source: "inventory",
            }];
        });
        setQuery("");
        searchRef.current?.focus();
    };

    const addSourced = () => {
        const name = sourcedName.trim();
        const price = Number(sourcedPrice);
        if (!name || !Number.isFinite(price) || price < 0) return;
        setLines((prev) => [...prev, {
            id: newId(),
            inventoryItemId: "",
            name,
            quantity: 1,
            unitPrice: price,
            source: "outsourced",
            purchaseNote: sourcedNote.trim() || undefined,
        }]);
        setSourcedOpen(false);
        setSourcedName("");
        setSourcedPrice("");
        setSourcedNote("");
        setQuery("");
        searchRef.current?.focus();
    };

    const setQuantity = (lineId: string, quantity: number) => {
        setLines((prev) => {
            if (quantity <= 0) return prev.filter((l) => l.id !== lineId);
            return prev.map((l) =>
                l.id === lineId
                    ? {
                        ...l,
                        quantity,
                        serialNumbers: l.isSerialized
                            ? resizeSerials(l.serialNumbers, quantity)
                            : l.serialNumbers,
                    }
                    : l,
            );
        });
    };

    const setSerial = (lineId: string, index: number, value: string) => {
        setLines((prev) => prev.map((l) => {
            if (l.id !== lineId) return l;
            const serials = resizeSerials(l.serialNumbers, l.quantity);
            serials[index] = value;
            return { ...l, serialNumbers: serials };
        }));
    };

    const attemptSave = () => {
        if (incompleteCount > 0) {
            setShowErrors(true);
            return;
        }
        onSave(lines);
    };

    const openSourcedForm = () => {
        setSourcedName(trimmedQuery);
        setSourcedPrice("");
        setSourcedNote("");
        setSourcedOpen(true);
    };

    // ── Catalogue result row ──────────────────────────────────────────────
    const ResultRow = ({ item }: { item: PartsDeclarationInventoryItem }) => {
        const badge = stockTone(item.stock);
        const isOut = (item.stock ?? 1) <= 0;
        return (
            <button
                type="button"
                onClick={() => addFromInventory(item)}
                className={cn(
                    "flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left shadow-sm active:scale-[0.98] md:px-3 md:py-2.5 md:hover:border-blue-300",
                    isOut && "opacity-60",
                )}
            >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                    <Package className="h-4 w-4 text-slate-300" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold text-slate-950 md:text-[13px]">{item.name}</span>
                    {/*
                      * The model is what tells two boards apart, so it sits
                      * under the name rather than behind a tap. The type is
                      * shown beside it because "Panel" and "T-CON board" can
                      * carry model numbers that look alike at a glance.
                      */}
                    {(item.modelNumber || item.partType || item.category) && (
                        <span className="block truncate text-[12px] font-medium text-slate-500 md:text-[10px]">
                            {item.modelNumber && (
                                <span className="font-bold text-slate-600">
                                    {formatModelNumber(item.modelNumber)}
                                </span>
                            )}
                            {item.modelNumber && (item.partType || item.category) && " · "}
                            {item.partType || item.category}
                        </span>
                    )}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[15px] font-black tabular-nums text-slate-950 md:text-[13px]">
                        {money(Number(item.price) || 0)}
                    </span>
                    {badge && (
                        <span className={cn(
                            "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide md:text-[10px] md:text-[9px]",
                            toneClasses[badge.tone],
                        )}>
                            {badge.label}
                        </span>
                    )}
                </span>
            </button>
        );
    };

    // ── A declared line ───────────────────────────────────────────────────
    const LineRow = ({ line }: { line: ProductLineItem }) => {
        const incomplete = showErrors && lineIsIncomplete(line);
        return (
            <div className={cn(
                "rounded-xl border bg-white p-3 shadow-sm md:p-2.5",
                incomplete ? "border-rose-200" : "border-slate-200",
            )}>
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold text-slate-950 md:text-[13px]">{line.name}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="text-[12px] font-medium text-slate-500 tabular-nums md:text-[10px]">
                                {money(line.unitPrice)} each
                            </span>
                            {line.source === "outsourced" && (
                                <span className={cn(
                                    "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide md:text-[10px] md:text-[9px]",
                                    toneClasses.violet,
                                )}>
                                    <Store className="h-3 w-3" />
                                    Sourced
                                </span>
                            )}
                        </div>
                    </div>
                    <span className="shrink-0 text-[15px] font-black tabular-nums text-slate-950 md:text-[13px]">
                        {money(line.quantity * line.unitPrice)}
                    </span>
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            aria-label="Decrease quantity"
                            onClick={() => setQuantity(line.id, line.quantity - 1)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 active:scale-95"
                        >
                            <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-9 text-center text-[15px] font-black tabular-nums text-slate-950 md:text-[13px]">
                            {line.quantity}
                        </span>
                        <button
                            type="button"
                            aria-label="Increase quantity"
                            onClick={() => setQuantity(line.id, line.quantity + 1)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white active:scale-95"
                        >
                            <Plus className="h-4 w-4" />
                        </button>
                    </div>
                    <button
                        type="button"
                        aria-label={`Remove ${line.name}`}
                        onClick={() => setQuantity(line.id, 0)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 active:scale-95"
                    >
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>

                {line.isSerialized && (
                    <div className="mt-2 space-y-1.5">
                        <span className={LABEL}>Serial numbers</span>
                        {resizeSerials(line.serialNumbers, line.quantity).map((serial, index) => (
                            <input
                                key={`${line.id}-serial-${index}`}
                                type="text"
                                value={serial}
                                onChange={(e) => setSerial(line.id, index, e.target.value)}
                                placeholder={`Unit ${index + 1} serial`}
                                className={cn(INPUT, showErrors && !serial.trim() && "border-rose-300")}
                            />
                        ))}
                        {incomplete && (
                            <p className="flex items-center gap-1 text-[12px] font-bold text-rose-600 md:text-[10px]">
                                <AlertCircle className="h-3.5 w-3.5" />
                                Every unit needs a serial before this can be saved.
                            </p>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        /**
         * min-w-0 and overflow-hidden repeat down this whole chain on purpose.
         *
         * Every flex item defaults to min-width:auto, so a single unbreakable
         * part name propagates its full intrinsic width up through EVERY
         * ancestor. Clearing it on the catalogue column alone is not enough —
         * the parent row simply grows instead and pushes the declared list and
         * the Save button off canvas, where the dialog clips them and no
         * scrollbar appears to get them back. QA measured the Save button at
         * x=3640 in a 1440px viewport, unreachable by mouse or wheel.
         */
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[#f8fafc]">
            {/* Header */}
            <div className="flex-none border-b border-slate-100/80 bg-[#f8fafc] px-3 pb-2 pt-2 md:px-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className={LABEL}>Parts used</p>
                        <p className="truncate text-sm font-black text-slate-950 md:text-base">{jobLabel}</p>
                    </div>
                    <button
                        type="button"
                        aria-label="Close"
                        onClick={onCancel}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 active:scale-95"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Body: one column on mobile, two from md */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row md:gap-4 md:p-4">
                {/*
                  * Catalogue. min-w-0 is load-bearing: a flex child defaults to
                  * min-width:auto, so one unbreakable part name wider than the
                  * column pushes the declared list and the Save button off
                  * canvas, where the dialog's overflow-hidden clips them. The
                  * user then cannot save at all. Found in QA against a
                  * pathologically long inventory name; any long real name does
                  * the same.
                  */}
                <div className="flex min-h-0 min-w-0 flex-1 flex-col md:rounded-2xl md:border md:border-slate-200 md:bg-white md:p-3">
                    <div className="flex-none px-3 pt-2 md:px-0 md:pt-0">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                ref={searchRef}
                                type="text"
                                value={query}
                                onChange={(e) => { setQuery(e.target.value); setSourcedOpen(false); }}
                                placeholder="Search parts…"
                                autoComplete="off"
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                            />
                            {query && (
                                <button
                                    type="button"
                                    aria-label="Clear search"
                                    onClick={() => setQuery("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pt-2 pb-2 md:px-0">
                        {results.length === 0 ? (
                            <div className="space-y-2">
                                <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
                                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">
                                        <Package className="h-4 w-4 text-slate-400" />
                                    </span>
                                    {/*
                                      * Two different facts, two different
                                      * sentences. "Nothing stocked by that name"
                                      * with an empty search box blames a search
                                      * nobody made, and reads as a fault when
                                      * the real answer is that the catalogue is
                                      * empty.
                                      */}
                                    <p className="text-[15px] font-bold text-slate-950 md:text-[13px]">
                                        {query.trim() ? "Nothing stocked by that name" : "No parts in stock yet"}
                                    </p>
                                    <p className="text-[12px] font-medium text-slate-500 md:text-[10px]">
                                        {query.trim()
                                            ? "If it was bought from a local vendor, add it as a sourced part."
                                            : "Search to find a part, or add one bought from a local vendor."}
                                    </p>
                                </div>
                                {sourcedOpen ? (
                                    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                                        <div className="flex items-center gap-2">
                                            <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl border", toneClasses.violet)}>
                                                <Store className="h-4 w-4" />
                                            </span>
                                            <p className="text-[15px] font-bold text-slate-950 md:text-[13px]">Sourced part</p>
                                        </div>
                                        <div className="mt-2.5 space-y-2">
                                            <label className="block">
                                                <span className={LABEL}>Part name</span>
                                                <input type="text" value={sourcedName} onChange={(e) => setSourcedName(e.target.value)} className={cn(INPUT, "mt-1")} />
                                            </label>
                                            <label className="block">
                                                <span className={LABEL}>Unit price</span>
                                                <input type="text" inputMode="decimal" value={sourcedPrice} onChange={(e) => setSourcedPrice(e.target.value)} placeholder="0" className={cn(INPUT, "mt-1")} />
                                            </label>
                                            <label className="block">
                                                <span className={LABEL}>Note (optional)</span>
                                                <input type="text" value={sourcedNote} onChange={(e) => setSourcedNote(e.target.value)} placeholder="e.g. Stadium Market vendor" className={cn(INPUT, "mt-1")} />
                                            </label>
                                        </div>
                                        <div className="mt-2.5 grid grid-cols-2 gap-2">
                                            <button type="button" onClick={() => setSourcedOpen(false)} className="h-10 rounded-xl border border-slate-200 bg-white text-[11px] font-bold text-slate-500 active:scale-[0.98]">
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={addSourced}
                                                disabled={!sourcedName.trim() || sourcedPrice.trim() === ""}
                                                className="flex h-10 items-center justify-center gap-1 rounded-xl bg-violet-600 text-[11px] font-bold text-white active:scale-[0.98] disabled:opacity-40"
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                                Add part
                                            </button>
                                        </div>
                                    </div>
                                ) : trimmedQuery ? (
                                    <button
                                        type="button"
                                        onClick={openSourcedForm}
                                        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2.5 text-left shadow-sm active:scale-[0.99]"
                                    >
                                        <span className="flex min-w-0 items-center gap-2">
                                            <PackagePlus className="h-4 w-4 shrink-0 text-violet-700" />
                                            <span className="truncate text-[13px] font-bold text-violet-700">
                                                Add &ldquo;{trimmedQuery}&rdquo; as a sourced part
                                            </span>
                                        </span>
                                    </button>
                                ) : null}
                            </div>
                        ) : (
                            results.map((item) => <ResultRow key={item.id} item={item} />)
                        )}
                    </div>
                </div>

                {/* Declared lines */}
                {/*
                  * On a phone this sizes to its contents up to a ceiling, rather
                  * than claiming half the screen.
                  *
                  * Both columns were flex-1, which is right side by side from md
                  * and wrong stacked: an empty "Nothing added yet" panel took the
                  * bottom half of the screen while the search results it is meant
                  * to be filled from were squeezed into the top half. The list
                  * that matters most at the counter had the least room precisely
                  * when it was longest.
                  */}
                <div className="flex min-h-0 max-h-[45%] flex-none flex-col border-t border-slate-200 bg-white md:max-h-none md:w-[380px] md:flex-1 md:shrink-0 md:rounded-2xl md:border md:p-3">
                    <div className="flex flex-none items-center justify-between gap-2 px-3 pt-2 md:px-0 md:pt-0">
                        <span className={LABEL}>Declared ({lines.length})</span>
                        {incompleteCount > 0 && showErrors && (
                            <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide md:text-[10px] md:text-[9px]", toneClasses.rose)}>
                                {incompleteCount} need serials
                            </span>
                        )}
                    </div>

                    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2 md:px-0">
                        {lines.length === 0 ? (
                            /*
                             * One quiet line, not a second empty state.
                             *
                             * A centred block here repeated what the catalogue
                             * above had already said, in a taller box, so a
                             * phone showing nothing declared spent most of its
                             * screen saying so twice.
                             */
                            <p className="px-3 py-2 text-[12px] font-medium text-slate-400 md:text-[10px]">
                                Nothing added yet — search above, or record that nothing was used.
                            </p>
                        ) : (
                            lines.map((line) => <LineRow key={line.id} line={line} />)
                        )}
                    </div>
                </div>
            </div>

            {/*
              * Action bar. The dock is hidden while this is open, so this only
              * has to clear the home indicator — not the seven rem it used to
              * reserve for a dock floating above it.
              */}
            <div className="flex-none border-t border-slate-200 bg-white px-3 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-4 md:pb-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <span className={LABEL}>Total</span>
                        <p className="text-lg font-black tabular-nums text-slate-950">{money(total)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {lines.length === 0 ? (
                            <button
                                type="button"
                                onClick={() => onSave([])}
                                disabled={isSaving}
                                className="flex h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-600 active:scale-[0.98] disabled:opacity-50"
                            >
                                <Check className="h-4 w-4" />
                                Nothing was used
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={attemptSave}
                                disabled={isSaving}
                                className="flex h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-[12px] font-bold text-white shadow-sm active:scale-[0.98] disabled:opacity-50"
                            >
                                <Check className="h-4 w-4" />
                                {isSaving ? "Saving…" : "Save parts"}
                            </button>
                        )}
                    </div>
                </div>
                {footerAction && <div className="mt-2.5">{footerAction}</div>}
            </div>
        </div>
    );
}
