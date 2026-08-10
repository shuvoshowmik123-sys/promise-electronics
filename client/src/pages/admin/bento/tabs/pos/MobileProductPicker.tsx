import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, History, Loader2, Package, PackagePlus, Plus, ScanBarcode, Search, Store, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileTabLayout, MobileTabHeader, MobileScrollContent } from "../../shared";

export type MobilePickerItem = {
    id: string;
    name: string;
    price: string;
    category?: string;
    images?: string | null;
    stock?: number;
};

export interface MobileProductPickerProps {
    items: MobilePickerItem[];
    recentItemIds: string[];
    isLoading: boolean;
    onAdd: (item: { id: string; name: string; price: string; quantity: number; image?: string }) => void;
    onAddSourcedPart: (part: {
        partName: string;
        supplierName?: string;
        costPrice: number;
        sellingPrice: number;
        warrantyDays?: number;
    }) => void;
    sourcedPartSuggestion?: (name: string) => {
        supplierName?: string;
        costPrice?: number;
        sellingPrice?: number;
        warrantyDays?: number;
    } | undefined;
    /**
     * Whether the floating cart bar is currently showing.
     *
     * The list scrolls under fixed chrome that it cannot see: the tab dock
     * always, plus the cart bar once the sale has a line on it. Without the
     * matching bottom padding that chrome covers the end of the list — and,
     * worse, the sourced-part form's Cancel/Add buttons, which sit inside this
     * scroll area. A tap there lands on "View Cart" instead of submitting, so
     * the part cannot be added at all.
     */
    cartBarVisible?: boolean;
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

const firstImage = (images?: string | null): string | undefined => {
    if (!images) return undefined;
    try {
        const parsed: unknown = JSON.parse(images);
        if (Array.isArray(parsed) && typeof parsed[0] === "string" && parsed[0]) return parsed[0];
        return undefined;
    } catch {
        return undefined;
    }
};

function CatalogueRow({ item, onPress }: { item: MobilePickerItem; onPress: (item: MobilePickerItem) => void }) {
    const [imgFailed, setImgFailed] = useState(false);
    const imageUrl = imgFailed ? undefined : firstImage(item.images);
    const stock = item.stock;
    const isOut = stock !== undefined && stock <= 0;
    const isLow = !isOut && stock !== undefined && stock <= 5;
    const accentTone = isOut ? "bg-rose-500" : isLow ? "bg-amber-500" : stock !== undefined ? "bg-emerald-500" : "bg-slate-300";

    return (
        <button
            type="button"
            onClick={() => onPress(item)}
            className={cn(
                "relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm active:scale-[0.98]",
                isOut && "opacity-60",
            )}
        >
            <span className={cn("absolute inset-y-3 left-0 w-1 rounded-r-full", accentTone)} />
            {imageUrl ? (
                <img
                    src={imageUrl}
                    alt=""
                    loading="lazy"
                    onError={() => setImgFailed(true)}
                    className="h-14 w-14 shrink-0 rounded-xl border border-slate-100 bg-slate-50 object-cover"
                />
            ) : (
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50">
                    <Package className="h-6 w-6 text-slate-300" />
                </span>
            )}
            <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm font-bold leading-snug text-slate-950">{item.name}</span>
                {item.category && (
                    <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500">{item.category}</span>
                )}
                {stock !== undefined && (
                    <span
                        className={cn(
                            "mt-1.5 inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                            isOut ? toneClasses.rose : isLow ? toneClasses.amber : toneClasses.emerald,
                        )}
                    >
                        {isOut ? "Out" : isLow ? `Low · ${stock}` : `${stock} in stock`}
                    </span>
                )}
            </span>
            <span className="shrink-0 self-center text-base font-black tabular-nums text-slate-950">
                {item.price}
            </span>
        </button>
    );
}

/** A way into sourcing that does not require a search to fail first. */
function SourceAPartButton({ onPress }: { onPress: () => void }) {
    return (
        <button
            type="button"
            onClick={onPress}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 text-sm font-bold text-violet-700 shadow-sm active:scale-[0.98]"
        >
            <PackagePlus className="h-5 w-5 shrink-0" />
            Source a part from a vendor
        </button>
    );
}

export function MobileProductPicker({
    items,
    recentItemIds,
    isLoading,
    onAdd,
    onAddSourcedPart,
    sourcedPartSuggestion,
    cartBarVisible = false,
}: MobileProductPickerProps) {
    const searchRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState("");
    const [activeCategory, setActiveCategory] = useState("All");
    const [sourcedOpen, setSourcedOpen] = useState(false);
    const [partName, setPartName] = useState("");
    const [supplierName, setSupplierName] = useState("");
    const [costPrice, setCostPrice] = useState("");
    const [sellingPrice, setSellingPrice] = useState("");
    const [warrantyDays, setWarrantyDays] = useState("");

    useEffect(() => {
        searchRef.current?.focus();
    }, []);

    const categories = useMemo(() => {
        const set = new Set<string>();
        for (const item of items) {
            if (item.category) set.add(item.category);
        }
        return ["All", ...Array.from(set)];
    }, [items]);

    const itemsById = useMemo(() => {
        const map = new Map<string, MobilePickerItem>();
        for (const item of items) map.set(item.id, item);
        return map;
    }, [items]);

    const trimmedQuery = query.trim();
    const loweredQuery = trimmedQuery.toLowerCase();

    const filteredItems = useMemo(() => {
        return items.filter((item) => {
            if (activeCategory !== "All" && item.category !== activeCategory) return false;
            if (!loweredQuery) return true;
            return (
                item.name.toLowerCase().includes(loweredQuery) ||
                (item.category ?? "").toLowerCase().includes(loweredQuery)
            );
        });
    }, [items, activeCategory, loweredQuery]);

    const recentItems = useMemo(() => {
        if (trimmedQuery) return [];
        const seen = new Set<string>();
        const out: MobilePickerItem[] = [];
        for (const id of recentItemIds) {
            if (seen.has(id)) continue;
            seen.add(id);
            const found = itemsById.get(id);
            if (found) out.push(found);
            if (out.length === 8) break;
        }
        return out;
    }, [recentItemIds, itemsById, trimmedQuery]);

    const handleQueryChange = (value: string) => {
        setQuery(value);
        setSourcedOpen(false);
    };

    const handleAdd = (item: MobilePickerItem) => {
        onAdd({ id: item.id, name: item.name, price: item.price, quantity: 1, image: firstImage(item.images) });
        setQuery("");
        searchRef.current?.focus();
    };

    /**
     * While the form is open the shell chrome stands down.
     *
     * The form's action row is pinned to the bottom of the screen, which is
     * also where the tab dock and the PWA install banner live. Rather than
     * stack three fixed things and hope the arithmetic holds on every handset,
     * the two that are not being used get out of the way — the same signal the
     * cart sheet and every POS dialog already send.
     */
    useEffect(() => {
        if (!sourcedOpen || typeof window === "undefined" || window.innerWidth >= 768) return;
        window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: true } }));
        return () => {
            window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: false } }));
        };
    }, [sourcedOpen]);

    const openSourcedForm = (seed = trimmedQuery) => {
        const suggestion = sourcedPartSuggestion?.(seed);
        setPartName(seed);
        setSupplierName(suggestion?.supplierName ?? "");
        setCostPrice(suggestion?.costPrice != null ? String(suggestion.costPrice) : "");
        setSellingPrice(suggestion?.sellingPrice != null ? String(suggestion.sellingPrice) : "");
        setWarrantyDays(suggestion?.warrantyDays != null ? String(suggestion.warrantyDays) : "");
        setSourcedOpen(true);
    };

    const parsedSelling = Number(sellingPrice);
    const sellingValid = sellingPrice.trim() !== "" && Number.isFinite(parsedSelling) && parsedSelling >= 0;
    const canSubmitSourced = partName.trim() !== "" && sellingValid;

    const submitSourced = () => {
        if (!canSubmitSourced) return;
        const parsedCost = Number(costPrice);
        const parsedWarranty = Number(warrantyDays);
        onAddSourcedPart({
            partName: partName.trim(),
            supplierName: supplierName.trim() || undefined,
            costPrice: costPrice.trim() !== "" && Number.isFinite(parsedCost) ? parsedCost : 0,
            sellingPrice: parsedSelling,
            warrantyDays:
                warrantyDays.trim() !== "" && Number.isFinite(parsedWarranty)
                    ? Math.max(0, Math.round(parsedWarranty))
                    : undefined,
        });
        setSourcedOpen(false);
        setQuery("");
        searchRef.current?.focus();
    };

    // 44px, not 36 — these are tapped with a thumb across a counter.
    const inputClass =
        "h-11 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-[13px] font-bold text-slate-950 placeholder:font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400";
    const labelClass = "text-[9px] font-bold uppercase tracking-wide text-slate-500";

    /**
     * One form, reached from two dead ends: a search that matched nothing, and
     * a catalogue with nothing in it. Defining it once means the two entrances
     * can never drift apart.
     */
    const sourcedForm = (
<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
                <span
                    className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                        toneClasses.violet,
                    )}
                >
                    <Store className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-950">Sourced part</p>
                    <p className="text-[11px] font-medium text-slate-500">
                        Bought from a local vendor for this job
                    </p>
                </div>
            </div>
            <div className="mt-3 space-y-2.5">
                <label className="block">
                    <span className={labelClass}>Part name</span>
                    <input
                        type="text"
                        value={partName}
                        onChange={(e) => setPartName(e.target.value)}
                        className={cn(inputClass, "mt-1")}
                    />
                </label>
                <label className="block">
                    <span className={labelClass}>Supplier</span>
                    <input
                        type="text"
                        value={supplierName}
                        onChange={(e) => setSupplierName(e.target.value)}
                        placeholder="e.g. Stadium Market vendor"
                        className={cn(inputClass, "mt-1")}
                    />
                </label>
                <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                        <span className={labelClass}>Cost price</span>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={costPrice}
                            onChange={(e) => setCostPrice(e.target.value)}
                            placeholder="0"
                            className={cn(inputClass, "mt-1")}
                        />
                    </label>
                    <label className="block">
                        <span className={labelClass}>Selling price</span>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={sellingPrice}
                            onChange={(e) => setSellingPrice(e.target.value)}
                            placeholder="0"
                            className={cn(inputClass, "mt-1")}
                        />
                    </label>
                </div>
                <label className="block">
                    <span className={labelClass}>Warranty (days)</span>
                    <input
                        type="text"
                        inputMode="numeric"
                        value={warrantyDays}
                        onChange={(e) => setWarrantyDays(e.target.value)}
                        placeholder="e.g. 90 — empty means no warranty"
                        className={cn(inputClass, "mt-1")}
                    />
                </label>
            </div>
            {/* Cancel and Add are NOT here. They live in a
                pinned bar below, because inside the scroller
                they sat under the dock at one scroll
                position and under the install banner at
                another — unreachable either way. */}
        </div>
    );

    return (
        <MobileTabLayout className="md:overflow-auto">
            {/* The search box is hidden while the form is open. It is wired to
                close the form on every keystroke, so leaving it there next to a
                half-filled form is an invitation to lose the entry — and the
                form has its own Part name field anyway. */}
            <MobileTabHeader className={cn("border-b border-slate-100/80 pt-1", sourcedOpen && "hidden md:block")}>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                        ref={searchRef}
                        type="text"
                        value={query}
                        onChange={(e) => handleQueryChange(e.target.value)}
                        placeholder="Search items or parts…"
                        autoFocus
                        autoComplete="off"
                        autoCorrect="off"
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    />
                    {query ? (
                        <button
                            type="button"
                            aria-label="Clear search"
                            onClick={() => handleQueryChange("")}
                            className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-slate-400"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    ) : (
                        <ScanBarcode className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    )}
                </div>
                {categories.length > 1 && (
                    <div className="-mx-0.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
                        <div className="flex min-w-max gap-1 px-0.5">
                            {categories.map((category) => (
                                <button
                                    key={category}
                                    type="button"
                                    onClick={() => setActiveCategory(category)}
                                    className={cn(
                                        "flex h-8 items-center gap-1 rounded-lg border px-2 text-[11px] font-bold transition-colors",
                                        activeCategory === category
                                            ? toneClasses.slate
                                            : "border-slate-200 bg-white text-slate-500",
                                    )}
                                >
                                    {category}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </MobileTabHeader>

            <MobileScrollContent
                className={cn(
                    "md:hidden space-y-2",
                    // Clearance for whatever is pinned over the bottom of the
                    // screen: the dock, the cart bar above it, or — while the
                    // sourced form is open — that form's own action bar.
                    sourcedOpen
                        ? "pb-[calc(6rem+env(safe-area-inset-bottom))]"
                        : cartBarVisible
                            ? "pb-[calc(11.5rem+env(safe-area-inset-bottom))]"
                            : "pb-[calc(5.5rem+env(safe-area-inset-bottom))]",
                )}
            >
                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
                    </div>
                ) : sourcedOpen ? (
                    /* The form owns the screen while it is open, wherever it
                       was opened from. Leaving the list or the empty-state
                       illustration above it was what pushed the fields below
                       the fold in the first place. */
                    <>
                        {trimmedQuery && filteredItems.length === 0 && (
                            <p className="px-1 pt-1 text-[11px] font-medium text-slate-500">
                                Nothing stocked named &ldquo;{trimmedQuery}&rdquo; — sourcing it instead.
                            </p>
                        )}
                        {sourcedForm}
                    </>
                ) : trimmedQuery && filteredItems.length === 0 ? (
                    <>
                        <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                                <Package className="h-5 w-5 text-slate-400" />
                            </span>
                            <p className="text-sm font-bold text-slate-950">No catalogue match</p>
                            <p className="text-[11px] font-medium text-slate-500">
                                Nothing stocked named &ldquo;{trimmedQuery}&rdquo;. Source it ad-hoc instead.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => openSourcedForm()}
                            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3.5 text-left shadow-sm active:scale-[0.98]"
                        >
                            <span className="flex min-w-0 items-center gap-2.5">
                                <PackagePlus className="h-5 w-5 shrink-0 text-violet-700" />
                                <span className="line-clamp-2 text-sm font-bold text-violet-700">
                                    Add &ldquo;{trimmedQuery}&rdquo; as a sourced part
                                </span>
                            </span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-violet-700" />
                        </button>
                    </>
                ) : !trimmedQuery && items.length === 0 ? (
                    (
                        <div className="flex flex-col items-center gap-3 px-3 py-12 text-center">
                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                                <Package className="h-5 w-5 text-slate-400" />
                            </span>
                            <p className="text-sm font-bold text-slate-950">Catalogue is empty</p>
                            <p className="text-[11px] font-medium text-slate-500">
                                Stocked items will appear here.
                            </p>
                            {/* With nothing stocked, sourcing is the only way to
                                sell anything — so it gets a button rather than
                                being the consolation prize for a failed search. */}
                            <SourceAPartButton onPress={() => openSourcedForm("")} />
                        </div>
                    )
                ) : (
                    <>
                        {recentItems.length > 0 && (
                            <section className="space-y-2">
                                <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                                    <History className="h-3.5 w-3.5" />
                                    Recent
                                </p>
                                <div className="space-y-2">
                                    {recentItems.map((item) => (
                                        <CatalogueRow key={`recent-${item.id}`} item={item} onPress={handleAdd} />
                                    ))}
                                </div>
                            </section>
                        )}
                        <section className="space-y-2">
                            {recentItems.length > 0 && (
                                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">All items</p>
                            )}
                            <div className="space-y-2">
                                {filteredItems.map((item) => (
                                    <CatalogueRow key={item.id} item={item} onPress={handleAdd} />
                                ))}
                            </div>
                        </section>
                        {/* Sourcing is a daily job, not an error path. Anyone
                            who has not already learnt that a failed search
                            reveals it would otherwise never find it. */}
                        <div className="pt-1">
                            <SourceAPartButton onPress={() => openSourcedForm("")} />
                        </div>
                    </>
                )}
            </MobileScrollContent>

            {/*
              * The form's action row, pinned rather than scrolled.
              *
              * Inside the scroll area these two buttons were unreachable: at
              * one scroll position the tab dock covered them, at the bottom of
              * the list the PWA install banner did. Pinning them removes the
              * arithmetic entirely — they are the last thing on screen and
              * nothing else is competing for that space, because opening this
              * form stands the shell chrome down.
              */}
            {sourcedOpen && (
                <div
                    className="fixed inset-x-3 z-[45] grid grid-cols-[auto,1fr] gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-[0_-2px_20px_rgba(15,23,42,0.12)] backdrop-blur md:hidden"
                    style={{
                        // Clear the cart bar when a sale is already running.
                        bottom: cartBarVisible
                            ? "calc(env(safe-area-inset-bottom) + 9rem)"
                            : "calc(env(safe-area-inset-bottom) + 0.75rem)",
                    }}
                >
                    <button
                        type="button"
                        onClick={() => setSourcedOpen(false)}
                        className="h-12 rounded-xl border border-slate-200 bg-white px-5 text-[13px] font-bold text-slate-500 active:scale-[0.98]"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={!canSubmitSourced}
                        onClick={submitSourced}
                        className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-violet-600 text-[13px] font-bold text-white shadow-sm active:scale-[0.98] disabled:opacity-40"
                    >
                        <Plus className="h-4 w-4" />
                        {canSubmitSourced ? "Add to sale" : "Enter a selling price"}
                    </button>
                </div>
            )}
        </MobileTabLayout>
    );
}
