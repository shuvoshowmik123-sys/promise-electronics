/**
 * CAROUSEL SELECTOR — horizontal card picker for the mobile service wizard.
 *
 * Replaces the Brand and Screen-size dropdowns. Radix Select flips above or
 * below depending on free space, so the same control opened upward one time and
 * downward the next — unpredictable and uncomfortable on a phone. A carousel
 * has no overlay at all, so there is nothing to flip and the form never jumps.
 *
 * Cards are deliberately small: enough of the next card stays visible at the
 * right edge to signal "swipe for more" without a separate hint line.
 */
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface CarouselSelectorProps {
  options: string[];
  value: string;
  onSelect: (value: string) => void;
  /** Optional trailing card, e.g. a compact "Search all" affordance. */
  trailing?: React.ReactNode;
  /** Renders inside each card above the label (screen-size glyph, etc). */
  renderVisual?: (option: string, selected: boolean) => React.ReactNode;
  /**
   * Short display label for the card. The stored value is unchanged — sizes
   * keep "43 inch" but the card shows 43" so it never truncates in a narrow
   * card, and the full value is echoed beside the section heading.
   */
  formatLabel?: (option: string) => string;
  ariaLabel: string;
  cardClassName?: string;
}

export function CarouselSelector({
  options,
  value,
  onSelect,
  trailing,
  renderVisual,
  formatLabel,
  ariaLabel,
  cardClassName,
}: CarouselSelectorProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  // Bring the active card into view when the value changes from outside the
  // carousel — e.g. chosen in the search overlay, or prefilled from the
  // calculator query params. Without this a preselected brand can sit off
  // screen and look unselected.
  useEffect(() => {
    const el = selectedRef.current;
    const scroller = scrollerRef.current;
    if (!el || !scroller) return;
    const elLeft = el.offsetLeft;
    const elRight = elLeft + el.offsetWidth;
    const viewLeft = scroller.scrollLeft;
    const viewRight = viewLeft + scroller.clientWidth;
    if (elLeft < viewLeft || elRight > viewRight) {
      scroller.scrollTo({ left: Math.max(0, elLeft - 16), behavior: "smooth" });
    }
  }, [value]);

  return (
    <div
      ref={scrollerRef}
      role="radiogroup"
      aria-label={ariaLabel}
      // -mx-4 px-4 lets cards bleed to the card edges so the row reads as
      // scrollable; snap-x keeps them tidy after a swipe.
      className="scrollbar-hide -mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-pl-4 px-4 pb-1"
    >
      {options.map((option) => {
        const selected = value === option;
        return (
          <button
            key={option}
            ref={selected ? selectedRef : undefined}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option}
            onClick={() => onSelect(option)}
            className={cn(
              "flex shrink-0 snap-start flex-col items-center justify-center gap-1.5 rounded-2xl border px-3 text-center transition-colors",
              selected
                ? "border-emerald-600 bg-emerald-50 text-emerald-800 shadow-[0_2px_10px_rgba(4,120,87,0.12)]"
                : "border-slate-200 bg-white text-slate-700",
              cardClassName,
            )}
          >
            {renderVisual?.(option, selected)}
            <span className={cn("w-full truncate text-[13px] leading-tight", selected ? "font-bold" : "font-semibold")}>
              {formatLabel ? formatLabel(option) : option}
            </span>
          </button>
        );
      })}
      {trailing}
    </div>
  );
}

/**
 * Small outline of a TV whose width grows with the screen size, so the row
 * reads as a size scale at a glance rather than eight identical boxes.
 */
export function ScreenSizeGlyph({ option, selected }: { option: string; selected: boolean }) {
  const inches = parseInt(option, 10);
  const safe = Number.isFinite(inches) ? inches : 32;
  // 24" -> 20px wide, 75" -> 42px. A wide spread on purpose: at a subtler ratio
  // the eight cards read as identical boxes and the glyph adds nothing.
  const width = Math.round(Math.min(42, Math.max(20, 20 + (safe - 24) * 0.43)));
  const height = Math.round(width * 0.62);
  return (
    <span className="flex h-[30px] items-end justify-center" aria-hidden>
      <span className="flex flex-col items-center">
        <span
          className={cn("rounded-[3px] border-[1.5px]", selected ? "border-emerald-600" : "border-slate-400")}
          style={{ width, height }}
        />
        <span className={cn("h-[3px] w-3 rounded-b-sm", selected ? "bg-emerald-600" : "bg-slate-400")} />
      </span>
    </span>
  );
}
