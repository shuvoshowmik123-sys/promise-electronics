/**
 * The brand picker: one line of pills you slide through.
 *
 * A grid of tiles was the obvious thing and it was wrong for this. Intake
 * happens standing at a counter with a television in one hand, and a nine-tile
 * grid means reading nine words and aiming at a small square. A single rail
 * means one thumb, one direction, and the brands the shop actually sees most
 * sitting at the front where they are reached first.
 *
 * The last pill is Custom. Choosing it swaps the rail for a text box and a back
 * arrow, because the one thing worse than not offering Custom is offering it
 * with no way out — tap it by mistake and the brand list is gone.
 *
 * ── Built for Android 9 on purpose ──────────────────────────────────────────
 *
 * The app now installs on Android 9, whose WebView may be several years old if
 * it has never been updated through the Play Store. Three things this component
 * would naturally use are avoided for that reason, and each would have failed
 * silently rather than loudly — the layout would simply look wrong, on those
 * phones only, and nowhere else:
 *
 *   flex `gap`        Chrome 84+. Below that it is ignored and every pill
 *                     touches its neighbour. Margins are used instead.
 *   `mask-image`      patchy on old WebViews. The edge fades are ordinary
 *                     overlay elements with a linear-gradient background.
 *   `scrollend`       far too new. Scroll position is read on plain scroll
 *                     events, which have worked for ever.
 *
 * scroll-snap is kept: it is Chrome 69+, and where it is missing the rail is
 * still an ordinary scrolling row. That degrades to something usable rather
 * than something broken, which is the test worth applying.
 */

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type BrandRailProps = {
    /** The list from Settings → tv_brands. "Other"/"Custom" is dropped; this owns that. */
    brands: string[];
    value: string;
    onChange: (brand: string) => void;
    label?: string;
};

/** The shop's own list should not carry its own escape hatch — this component is that. */
function withoutCustomEntries(brands: string[]): string[] {
    return brands.filter((b) => !/^(other|custom)$/i.test(b.trim()));
}

export function BrandRail({ brands, value, onChange, label = "Brand" }: BrandRailProps) {
    const list = withoutCustomEntries(brands);

    /**
     * Custom mode is inferred, not remembered separately.
     *
     * A brand that is set but not in the list can only have been typed, so
     * reopening a job someone entered by hand shows the text box with their
     * text in it rather than an empty rail that silently disagrees with the
     * saved value.
     */
    const [custom, setCustom] = useState<boolean>(
        () => Boolean(value) && !list.some((b) => b.toLowerCase() === value.toLowerCase()),
    );

    const scroller = useRef<HTMLDivElement>(null);
    const [atStart, setAtStart] = useState(true);
    const [atEnd, setAtEnd] = useState(false);

    /**
     * Which fades to show.
     *
     * A fade means "there is more this way", so it is hidden at each end rather
     * than drawn permanently. A fade that never goes away stops being a signal
     * and starts being decoration.
     */
    const readEdges = () => {
        const el = scroller.current;
        if (!el) return;
        const max = el.scrollWidth - el.clientWidth;
        setAtStart(el.scrollLeft <= 1);
        // A pixel of slack: fractional widths mean scrollLeft rarely lands
        // exactly on the maximum, and without it the right fade never clears.
        setAtEnd(el.scrollLeft >= max - 1);
    };

    useEffect(() => {
        readEdges();
        const el = scroller.current;
        if (!el) return;
        // Recheck when the list itself changes size, e.g. Settings edited.
        const t = window.setTimeout(readEdges, 50);
        return () => window.clearTimeout(t);
    }, [list.length, custom]);

    /** Bring the selected pill into view when the value changes from outside. */
    useEffect(() => {
        if (custom || !value) return;
        const el = scroller.current?.querySelector<HTMLElement>(`[data-brand="${CSS.escape(value)}"]`);
        el?.scrollIntoView({ block: "nearest", inline: "center" });
    }, [value, custom]);

    if (custom) {
        return (
            <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{label}</p>
                <div className="flex items-center">
                    {/*
                      * The way back. Tapping Custom by mistake is easy and the
                      * list is otherwise unreachable, so this clears the typed
                      * name as well — leaving it behind would mean the rail
                      * showed nothing selected while a value was still held.
                      */}
                    <button
                        type="button"
                        onClick={() => { setCustom(false); onChange(""); }}
                        aria-label="Back to the brand list"
                        className="mr-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors active:bg-slate-100"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <span className="inline-flex h-11 items-center rounded-full bg-slate-900 px-5 text-[13px] font-bold text-white">
                        Custom
                    </span>
                </div>

                <Input
                    autoFocus
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Type the brand name"
                    className="mt-3 h-12 rounded-xl text-[15px]"
                />
                <p className="mt-2 text-[12px] text-slate-500">
                    Tap back to choose from the list instead.
                </p>
            </div>
        );
    }

    return (
        <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{label}</p>

            <div className="relative">
                <div
                    ref={scroller}
                    onScroll={readEdges}
                    className="brand-rail flex overflow-x-auto overflow-y-hidden pb-1"
                    style={{
                        scrollSnapType: "x mandatory",
                        // Momentum scrolling on older WebKit-based WebViews.
                        WebkitOverflowScrolling: "touch",
                    }}
                >
                    {list.map((brand) => {
                        const selected = value === brand;
                        return (
                            <button
                                key={brand}
                                type="button"
                                data-brand={brand}
                                onClick={() => onChange(brand)}
                                style={{ scrollSnapAlign: "center" }}
                                className={cn(
                                    // mr-2.5 rather than a flex gap — see the note at the top.
                                    "mr-2.5 shrink-0 whitespace-nowrap rounded-full border px-5 text-[13px] font-bold transition-all duration-200 active:scale-95",
                                    selected
                                        ? "h-12 border-slate-900 bg-slate-900 text-white shadow-md shadow-slate-900/20"
                                        : "h-11 border-slate-200 bg-white text-slate-700",
                                    // Everything else steps back once a choice is made,
                                    // so the answer is readable at a glance.
                                    value && !selected && "opacity-45",
                                )}
                            >
                                {selected && <Check size={14} className="mr-1.5 inline-block align-[-2px]" />}
                                {brand}
                            </button>
                        );
                    })}

                    <button
                        type="button"
                        onClick={() => { setCustom(true); onChange(""); }}
                        style={{ scrollSnapAlign: "center" }}
                        className="mr-2.5 flex h-11 shrink-0 items-center whitespace-nowrap rounded-full border border-dashed border-blue-300 bg-blue-50/50 px-5 text-[13px] font-bold text-blue-700 transition-all duration-200 active:scale-95"
                    >
                        <Plus size={14} className="mr-1.5" />
                        Custom
                    </button>
                </div>

                {/*
                  * Edge fades as overlay elements rather than a CSS mask, which
                  * old WebViews handle unevenly. pointer-events-none so they
                  * never swallow a tap meant for the pill underneath.
                  */}
                <div
                    aria-hidden
                    className={cn(
                        "pointer-events-none absolute inset-y-0 left-0 w-8 transition-opacity duration-200",
                        atStart ? "opacity-0" : "opacity-100",
                    )}
                    style={{ backgroundImage: "linear-gradient(to right, #f8fafc, rgba(248,250,252,0))" }}
                />
                <div
                    aria-hidden
                    className={cn(
                        "pointer-events-none absolute inset-y-0 right-0 w-8 transition-opacity duration-200",
                        atEnd ? "opacity-0" : "opacity-100",
                    )}
                    style={{ backgroundImage: "linear-gradient(to left, #f8fafc, rgba(248,250,252,0))" }}
                />
            </div>

            {/*
              * Three dots, showing where in the rail you are rather than how
              * many brands there are. A dot per brand would be nine dots nobody
              * can count; this answers the only question being asked, which is
              * whether there is more to slide to.
              */}
            <div className="mt-2 flex items-center justify-center">
                {[0, 1, 2].map((i) => {
                    const active = (atStart && i === 0) || (atEnd && i === 2) || (!atStart && !atEnd && i === 1);
                    return (
                        <span
                            key={i}
                            className={cn(
                                "mx-[3px] h-1.5 rounded-full transition-all duration-200",
                                active ? "w-4 bg-slate-800" : "w-1.5 bg-slate-300",
                            )}
                        />
                    );
                })}
            </div>
        </div>
    );
}
