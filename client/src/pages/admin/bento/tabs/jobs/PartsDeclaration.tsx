import { useEffect, useMemo, useRef, useState } from "react";
import {
    AlertCircle, Check, Minus, Package, PackagePlus, Plus, Search, Store, Trash2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatModelNumber, requiresModelNumber, hasModelAnswer, NO_MODEL_VALUE } from "@shared/part-types";

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
    /**
     * The part vocabulary, from Settings.
     *
     * Passed in rather than read here so this stays a presentation component,
     * and so the caller decides what a reader who cannot fetch Settings sees.
     */
    partTypes: string[];
    /** What the customer was quoted, if anything has been recorded yet. */
    initialQuote?: number | null;
    /**
     * Whether to show what the job makes.
     *
     * The quote itself is visible to whoever declares - a technician usually
     * gave it - but the subtraction against parts is the shop's margin, which
     * follows the same rule as cost prices everywhere else in this system.
     */
    canSeeMargin?: boolean;
    onSave: (lines: ProductLineItem[], quotedAmount: number | null) => void;
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
    partTypes,
    initialQuote,
    canSeeMargin = false,
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
    /*
     * A sourced part is described the way the catalogue describes one.
     *
     * This used to be a single free-text "Part name". Two people typing the
     * same board produced "power board", "Power Bd" and "PSU", none of which
     * match each other or anything on the shelf, so a part fitted last month
     * cannot be found when the same set comes back. Type comes from the shop's
     * own list and the model number identifies which one it actually is - the
     * pair a warranty claim is answered with.
     */
    const [sourcedType, setSourcedType] = useState("");
    const [sourcedModel, setSourcedModel] = useState("");
    const [sourcedPrice, setSourcedPrice] = useState("");

    /**
     * What the customer was told the repair would cost.
     *
     * Kept on this screen because this is the moment the two numbers are both
     * known. Declaring parts without it records what the job consumed and not
     * what it earns, which is the same half-record the parts gate was built to
     * stop.
     */
    const [quote, setQuote] = useState<string>(
        initialQuote != null && Number.isFinite(initialQuote) ? String(initialQuote) : "",
    );
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

    /**
     * Complete enough to be worth recording.
     *
     * The model is demanded only for the types where it identifies the part
     * rather than describes it, and "n/a" satisfies it - a salvaged board with
     * no legible marking is a real answer, and refusing it only teaches people
     * to invent one.
     */
    const sourcedModelNeeded = requiresModelNumber(sourcedType);
    const sourcedPriceValue = Number(sourcedPrice);
    const sourcedReady =
        Boolean(sourcedType)
        && Number.isFinite(sourcedPriceValue)
        && sourcedPrice.trim() !== ""
        && sourcedPriceValue >= 0
        && (!sourcedModelNeeded || hasModelAnswer(sourcedModel));

    /**
     * The quote as a number, or null for "not recorded".
     *
     * Blank is not zero. A job nobody has quoted and a job quoted at nothing are
     * different facts, and storing the first as the second would make every
     * unquoted repair look like a giveaway in any report that sums this.
     */
    const quotedAmount = (): number | null => {
        const trimmed = quote.trim();
        if (trimmed === "") return null;
        const n = Number(trimmed);
        return Number.isFinite(n) && n >= 0 ? n : null;
    };

    const addSourced = () => {
        if (!sourcedReady) return;
        const model = sourcedModel.trim();
        /*
         * name stays populated because every list, receipt and warranty lookup
         * downstream reads it. It is composed here rather than typed, so the
         * same part is written the same way every time.
         */
        const name = model && model.toLowerCase() !== NO_MODEL_VALUE
            ? `${sourcedType} ${model}`
            : sourcedType;
        setLines((prev) => [...prev, {
            id: newId(),
            inventoryItemId: "",
            name,
            partType: sourcedType,
            modelNumber: model || undefined,
            quantity: 1,
            unitPrice: sourcedPriceValue,
            source: "outsourced",
            /*
             * No purchase note is written.
             *
             * The field that fed it invited a shop name - its placeholder was a
             * market trader's - and productLines is stored on the job, so every
             * declaration quietly built a record of where we buy. Who supplies a
             * part is commercially confidential and has no bearing on the
             * repair: the job needs the part named and priced, and nothing here
             * reads a supplier for any other purpose.
             *
             * The field stays on the type because older jobs already carry one
             * and must keep loading. Nothing writes it from this screen.
             */
        }]);
        setSourcedOpen(false);
        setSourcedType("");
        setSourcedModel("");
        setSourcedPrice("");
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
        onSave(lines, quotedAmount());
    };

    const openSourcedForm = () => {
        setSourcedType("");
        // A typed search is nearly always a model number, so it carries over.
        setSourcedModel(trimmedQuery);
        setSourcedPrice("");
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

    /*
     * Adding a part is its own step, not a card wedged into the list.
     *
     * It used to render inside the catalogue's scroll area. Open the keyboard
     * there and three things compete for what is left of the screen - the
     * search box above, the declared list below, and the form itself - inside a
     * sheet that has just lost half its height to the keyboard. Everything is
     * squeezed, the field being typed into is the smallest thing on screen, and
     * a nested scroller has to be fought to reach the price.
     *
     * A step owns the whole sheet. The keyboard takes its space from one
     * scrolling column with nothing else in it, which is what every native form
     * does, and there is room to make the controls thumb-sized rather than
     * fitting them into a gap.
     */
    if (sourcedOpen) {
        return (
            <div className="flex h-auto max-h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[#f8fafc] md:h-full">
                <div aria-hidden className="flex flex-none justify-center pt-2.5 pb-1 md:hidden">
                    <span className="h-1 w-9 rounded-full bg-slate-300" />
                </div>

                <div className="flex flex-none items-center gap-2.5 border-b border-slate-200 bg-white px-3 py-2.5 md:px-4">
                    <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl border", toneClasses.violet)}>
                        <Store className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <span className={LABEL}>Add a part</span>
                        <p className="truncate text-[15px] font-bold text-slate-950 md:text-[13px]">Not in stock</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setSourcedOpen(false)}
                        aria-label="Back to parts"
                        className="flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-transform active:scale-[0.97]"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/*
                  * pb-24 is not decoration. The keyboard covers the bottom of
                  * the sheet, and without slack under the last field the price
                  * sits behind it with nothing left to scroll.
                  */}
                <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto overscroll-contain px-3 py-3.5 pb-24 [-webkit-overflow-scrolling:touch] md:px-4 md:pb-4">
                    {/*
                      * Tappable list, not a <select>.
                      *
                      * A select hands its dropdown to Android, which renders it
                      * outside the page with its own rules. In this WebView the
                      * option labels came back blank on a white sheet - the
                      * picker was the right height for all eleven types and
                      * every one of them was invisible - with the placeholder in
                      * a cursive fallback, because the OS picker does not
                      * inherit the page's font stack and does inherit the
                      * user-select:none this app sets on select.
                      *
                      * A list that is part of the sheet cannot be repainted by
                      * the OS. It also shows every type at once, which is what
                      * somebody standing at a bench with a board in one hand
                      * needs - no dropdown to open, and a target sized for a
                      * thumb rather than for a mouse.
                      */}
                    <div className="block">
                        <span className={LABEL}>Part type</span>
                        <div className="mt-1.5 grid grid-cols-2 gap-2">
                            {partTypes.map((t) => {
                                const active = sourcedType === t;
                                return (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setSourcedType(t)}
                                        aria-pressed={active}
                                        className={cn(
                                            "flex min-h-[3rem] items-center rounded-xl border px-3 py-2 text-left text-[13px] font-bold transition-transform active:scale-[0.97]",
                                            active
                                                ? "border-violet-300 bg-violet-600 text-white shadow-sm"
                                                : "border-slate-200 bg-white text-slate-700",
                                        )}
                                    >
                                        {t}
                                    </button>
                                );
                            })}
                        </div>
                        {partTypes.length === 0 && (
                            <p className="mt-1.5 flex items-center gap-1 text-[12px] font-medium text-amber-700">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                No part types are configured. Add them in Settings.
                            </p>
                        )}
                    </div>

                    <div className="block">
                        <span className={LABEL}>
                            Model number{sourcedModelNeeded ? "" : " (optional)"}
                        </span>
                        <input
                            type="text"
                            value={sourcedModel}
                            onChange={(e) => setSourcedModel(e.target.value)}
                            placeholder={sourcedModelNeeded ? "As printed on the part" : "If the part carries one"}
                            className={cn(INPUT, "mt-1.5 h-12 md:h-9")}
                        />
                        {/*
                          * The honest way past a required field.
                          *
                          * A salvaged board with no legible marking has no model
                          * number, and a field that will not accept that teaches
                          * people to type anything to get through - which is
                          * worse than an admitted gap, because invented data
                          * cannot be told apart from the real thing later.
                          */}
                        <button
                            type="button"
                            onClick={() => setSourcedModel(NO_MODEL_VALUE)}
                            className="mt-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[12px] font-bold text-slate-500 transition-transform active:scale-[0.97]"
                        >
                            No marking on the part
                        </button>
                        {sourcedModelNeeded && !hasModelAnswer(sourcedModel) && (
                            <p className="mt-1.5 flex items-center gap-1 text-[12px] font-medium text-amber-700 md:text-[10px]">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                                A {sourcedType.toLowerCase()} is identified by its model number.
                            </p>
                        )}
                    </div>

                    <label className="block">
                        <span className={LABEL}>Unit price</span>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={sourcedPrice}
                            onChange={(e) => setSourcedPrice(e.target.value)}
                            placeholder="0"
                            className={cn(INPUT, "mt-1.5 h-12 md:h-9")}
                        />
                    </label>
                </div>

                <div className="flex-none border-t border-slate-200 bg-white px-3 py-2.5 md:px-4">
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => setSourcedOpen(false)}
                            className="h-12 rounded-xl border border-slate-200 bg-white text-[13px] font-bold text-slate-500 transition-transform active:scale-[0.97] md:h-10 md:text-[11px]"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={addSourced}
                            disabled={!sourcedReady}
                            className="flex h-12 items-center justify-center gap-1 rounded-xl bg-violet-600 text-[13px] font-bold text-white shadow-sm transition-transform active:scale-[0.97] disabled:opacity-40 md:h-10 md:text-[11px]"
                        >
                            <Plus className="h-4 w-4" />
                            Add part
                        </button>
                    </div>
                </div>
            </div>
        );
    }

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
        <div className="flex h-auto max-h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[#f8fafc] md:h-full">
            {/*
              * The grabber. Phone only.
              *
              * It is what tells somebody at a glance that this is a surface over
              * the screen rather than a new page, which is the single clearest
              * signal that separates an app from a website in a WebView. It is
              * decoration, not a control - the sheet is dismissed by the close
              * button beside the title, which is a bigger and more reliable
              * target than a drag on a scrolling surface.
              */}
            <div aria-hidden className="flex flex-none justify-center pt-2.5 pb-1 md:hidden">
                <span className="h-1 w-9 rounded-full bg-slate-300" />
            </div>
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
                {/*
                  * Sizes to its contents when there is nothing to list.
                  *
                  * flex-1 unconditionally meant an empty catalogue still claimed
                  * every spare pixel, so a phone with no stock showed a search
                  * box, a short message, and then eight hundred pixels of blank
                  * grey before anything else — which reads as a screen that
                  * failed to load rather than a shop with no parts entered yet.
                  *
                  * With results it grows again, which is when the room is
                  * actually wanted.
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

                    {/*
                      * Empty, this centres rather than stacking at the top.
                      *
                      * Two releases were spent moving the blank area around —
                      * out of the middle, then below the declared list — on the
                      * assumption that some flex rule would absorb it. None can.
                      * A shop with no stock entered and nothing declared has
                      * genuinely nothing to put on this screen, and the space
                      * exists whatever the panels do with it.
                      *
                      * So it stops being a gap and becomes the margin around the
                      * message: icon, explanation and the one available action,
                      * centred in the room they already own. Empty on purpose
                      * reads as an answer; empty at the bottom reads as a screen
                      * that failed to finish loading.
                      */}
                    <div
                        className={cn(
                            "min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 pt-2 pb-2 md:px-0",
                            /*
                             * Centred only while nothing here can overflow.
                             *
                             * justify-center on a scrolling column hides the top
                             * of its own content: the overflow goes above the
                             * start of the scroll range and scrollTop cannot be
                             * negative, so it can never be reached. Empty, the
                             * message fits and it looks right - which is why the
                             * release that added it seemed fine. Open the part
                             * form and the content grows past the box, and the
                             * first field scrolls up out of sight with no way
                             * back to it.
                             *
                             * So the centring is dropped the moment the form
                             * opens, and the content aligns to the top where it
                             * can be scrolled normally.
                             */
                            results.length === 0 && !sourcedOpen && "flex flex-col justify-center",
                            "overscroll-contain [-webkit-overflow-scrolling:touch]",
                        )}
                    >
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
                                            ? "Add it as a new part, with its name and price."
                                            : "Search to find a part, or add one that is not in stock."}
                                    </p>
                                </div>
                                {
                                    /*
                                      * Offered whether or not anything was typed.
                                      *
                                      * This was gated on a search term, so the
                                      * empty screen told somebody to "add one
                                      * bought from a local vendor" and then gave
                                      * them nothing to press. An instruction with
                                      * no control is worse than no instruction:
                                      * they go looking for a button that was
                                      * never rendered, and conclude the screen is
                                      * broken.
                                      *
                                      * A shop with an empty catalogue — which is
                                      * every shop before stock is entered — has
                                      * exactly one useful action here, and this
                                      * is it.
                                      */
                                    <button
                                        type="button"
                                        onClick={openSourcedForm}
                                        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2.5 text-left shadow-sm active:scale-[0.99]"
                                    >
                                        <span className="flex min-w-0 items-center gap-2">
                                            <PackagePlus className="h-4 w-4 shrink-0 text-violet-700" />
                                            <span className="truncate text-[13px] font-bold text-violet-700">
                                                {trimmedQuery
                                                    ? `Add \u201c${trimmedQuery}\u201d as a new part`
                                                    : "Add a part that is not in stock"}
                                            </span>
                                        </span>
                                    </button>
                                }
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
                <div
                    className={cn(
                        "flex min-h-0 flex-col border-t border-slate-200 bg-white md:max-h-none md:w-[380px] md:flex-1 md:shrink-0 md:rounded-2xl md:border md:p-3",
                        /*
                         * Whichever panel is not showing a list absorbs the
                         * space, so no band of page background is ever left
                         * stranded between the content and the action bar.
                         *
                         * The first attempt gave the empty catalogue flex-none
                         * and stopped there, which did not remove the gap — it
                         * moved it below the declared section, where it read
                         * exactly as badly. Space has to be given to something,
                         * not merely taken away.
                         *
                         * With results in the catalogue the roles swap: it takes
                         * the room and this is capped, so a long parts list is
                         * never squeezed by an empty declared panel.
                         */
                        "max-h-[45%] flex-none",
                    )}
                >
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
            <div className="flex-none border-t border-slate-200 bg-white px-3 pt-2.5 pb-3 md:px-4">
                {/*
                  * What the customer was quoted, entered where both numbers are
                  * known.
                  *
                  * The screen recorded what a repair consumed and never what it
                  * was sold for, so the two halves of the same job were written
                  * in different places at different times - and the second half
                  * usually was not written at all. A parts total on its own
                  * cannot answer whether the work was worth doing.
                  *
                  * Its own row above the actions, not squeezed beside them: it
                  * is a number to be typed, and a keyboard opening under a
                  * cramped field is what made this screen unusable before.
                  */}
                <label className="mb-2.5 flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2">
                    <span className={cn(LABEL, "flex-none")}>Quoted</span>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={quote}
                        onChange={(e) => setQuote(e.target.value)}
                        placeholder="Not recorded"
                        className="h-9 min-w-0 flex-1 border-0 bg-transparent text-right text-[15px] font-black tabular-nums text-slate-950 placeholder:text-[13px] placeholder:font-medium placeholder:text-slate-400 focus:outline-none md:text-[13px]"
                    />
                </label>
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <span className={LABEL}>Total</span>
                        <p className="text-lg font-black tabular-nums text-slate-950">{money(total)}</p>
                        {/*
                          * The subtraction is the shop's margin, so it follows
                          * the same rule as cost prices: managers and above.
                          * A technician sees both numbers they are responsible
                          * for and is not handed the business's.
                          */}
                        {canSeeMargin && quotedAmount() != null && (
                            <p className={cn(
                                "text-[12px] font-bold tabular-nums md:text-[10px]",
                                (quotedAmount() as number) - total < 0 ? "text-rose-600" : "text-emerald-700",
                            )}>
                                {money((quotedAmount() as number) - total)} after parts
                            </p>
                        )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        {lines.length === 0 ? (
                            <button
                                type="button"
                                onClick={() => onSave([], quotedAmount())}
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
