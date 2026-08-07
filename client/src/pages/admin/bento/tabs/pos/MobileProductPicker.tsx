import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, History, Loader2, Package, PackagePlus, Plus, ScanBarcode, Search, Store, X } from "lucide-react";
import { cn } from "@/lib/utils";

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

    return (
        <button
            type="button"
            onClick={() => onPress(item)}
            className={cn(
                "flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-left shadow-sm active:scale-[0.98]",
                isOut && "opacity-60",
            )}
        >
            {imageUrl ? (
                <img
                    src={imageUrl}
                    alt=""
                    loading="lazy"
                    onError={() => setImgFailed(true)}
                    className="h-10 w-10 shrink-0 rounded-xl border border-slate-100 bg-slate-50 object-cover"
                />
            ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                    <Package className="h-4 w-4 text-slate-300" />
                </span>
            )}
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-slate-950">{item.name}</span>
                {item.category && (
                    <span className="block truncate text-[10px] font-medium text-slate-500">{item.category}</span>
                )}
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[13px] font-black tabular-nums text-slate-950">{item.price}</span>
                {stock !== undefined && (
                    <span
                        className={cn(
                            "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                            isOut ? toneClasses.rose : isLow ? toneClasses.amber : toneClasses.emerald,
                        )}
                    >
                        {isOut ? "Out" : isLow ? `Low · ${stock}` : `${stock} in stock`}
                    </span>
                )}
            </span>
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
    const scrollTickingRef = useRef(false);
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

    const openSourcedForm = () => {
        const suggestion = sourcedPartSuggestion?.(trimmedQuery);
        setPartName(trimmedQuery);
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

    // The admin shell listens for this event to hide/reveal top+bottom chrome on scroll.
    const onListScroll = (e: { currentTarget: HTMLDivElement }) => {
        if (window.innerWidth >= 768 || scrollTickingRef.current) return;
        const el = e.currentTarget;
        scrollTickingRef.current = true;
        requestAnimationFrame(() => {
            scrollTickingRef.current = false;
            /**
             * `syncOnly: true` is load-bearing, not decoration.
             *
             * design-concept.tsx branches on it: with the flag the listener runs
             * syncAdminMobileChromeScroll, without it updateAdminMobileChromeScroll,
             * which additionally consults mobileInputDirectionRef — direction
             * state this component never sets. Omitting the flag drives the
             * chrome from a half-initialised direction, so the header hides or
             * reveals against the scroll while this list is the active surface.
             *
             * Matches MobileScrollContent in MobileAdminPrimitives, which is the
             * canonical scrolling surface for every other mobile tab.
             */
            window.dispatchEvent(new CustomEvent("admin:mobile-chrome", {
                detail: { scrollTop: el.scrollTop, syncOnly: true },
            }));
        });
    };

    const inputClass =
        "h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-[13px] font-bold text-slate-950 placeholder:font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400";
    const labelClass = "text-[9px] font-bold uppercase tracking-wide text-slate-500";

    return (
        <div className="flex h-full min-h-0 flex-col bg-[#f8fafc]">
            <div className="flex-none space-y-1.5 border-b border-slate-100/80 bg-[#f8fafc] px-3 pb-1.5 pt-1">
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
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
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
            </div>

            <div
                className={cn(
                    "flex-1 min-h-0 space-y-2 overflow-y-auto overflow-x-hidden bg-[#f8fafc] px-3 pt-2",
                    // Clears the tab dock, and the cart bar on top of it when a
                    // sale is in progress. Measured against the 390x844 mobile
                    // shell: dock ~7rem, dock + cart bar ~13rem.
                    cartBarVisible
                        ? "pb-[calc(13rem+env(safe-area-inset-bottom))]"
                        : "pb-[calc(7rem+env(safe-area-inset-bottom))]",
                )}
                onScroll={onListScroll}
            >
                {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
                    </div>
                ) : trimmedQuery && filteredItems.length === 0 ? (
                    <>
                        <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">
                                <Package className="h-4 w-4 text-slate-400" />
                            </span>
                            <p className="text-[13px] font-bold text-slate-950">No catalogue match</p>
                            <p className="text-[10px] font-medium text-slate-500">
                                Nothing stocked named &ldquo;{trimmedQuery}&rdquo;. Source it ad-hoc instead.
                            </p>
                        </div>
                        {sourcedOpen ? (
                            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                                <div className="flex items-center gap-2">
                                    <span
                                        className={cn(
                                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border",
                                            toneClasses.violet,
                                        )}
                                    >
                                        <Store className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-bold text-slate-950">Sourced part</p>
                                        <p className="text-[10px] font-medium text-slate-500">
                                            Bought from a local vendor for this job
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-2.5 space-y-2">
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
                                <div className="mt-2.5 grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setSourcedOpen(false)}
                                        className="h-10 rounded-xl border border-slate-200 bg-white text-[11px] font-bold text-slate-500 active:scale-[0.98]"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!canSubmitSourced}
                                        onClick={submitSourced}
                                        className="flex h-10 items-center justify-center gap-1 rounded-xl bg-violet-600 text-[11px] font-bold text-white shadow-sm active:scale-[0.98] disabled:opacity-40"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                        Add to sale
                                    </button>
                                </div>
                            </div>
                        ) : (
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
                                <ArrowRight className="h-4 w-4 shrink-0 text-violet-700" />
                            </button>
                        )}
                    </>
                ) : !trimmedQuery && items.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-3 py-16 text-center">
                        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100">
                            <Package className="h-4 w-4 text-slate-400" />
                        </span>
                        <p className="text-[13px] font-bold text-slate-950">Catalogue is empty</p>
                        <p className="text-[10px] font-medium text-slate-500">
                            Stocked items will appear here. Type a name above to source a part instead.
                        </p>
                    </div>
                ) : (
                    <>
                        {recentItems.length > 0 && (
                            <section className="space-y-1.5">
                                <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                                    <History className="h-3.5 w-3.5" />
                                    Recent
                                </p>
                                <div className="space-y-1.5">
                                    {recentItems.map((item) => (
                                        <CatalogueRow key={`recent-${item.id}`} item={item} onPress={handleAdd} />
                                    ))}
                                </div>
                            </section>
                        )}
                        <section className="space-y-1.5">
                            {recentItems.length > 0 && (
                                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">All items</p>
                            )}
                            <div className="space-y-1.5">
                                {filteredItems.map((item) => (
                                    <CatalogueRow key={item.id} item={item} onPress={handleAdd} />
                                ))}
                            </div>
                        </section>
                    </>
                )}
            </div>
        </div>
    );
}
