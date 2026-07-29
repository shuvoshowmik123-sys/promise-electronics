/**
 * SEARCH PICKER — full-screen, keyboard-aware option search.
 *
 * The layout exists specifically to stay usable once the on-screen keyboard is
 * up. Two decisions do the work:
 *
 *  1. The input is pinned to the TOP, not centred or bottom-docked. A keyboard
 *     eats the bottom half of the screen, so anything docked low ends up
 *     squashed against it. With the input on top, the keyboard only ever covers
 *     the tail of the results list — what you typed and the best matches stay
 *     in view.
 *
 *  2. Height comes from 100dvh with the list as the only flexible row
 *     (min-h-0 + flex-1). dvh tracks the visual viewport as the keyboard opens,
 *     so the list shrinks and scrolls instead of the whole page being pushed
 *     and clipped.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Search, X } from "lucide-react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { cn } from "@/lib/utils";

interface SearchPickerOverlayProps {
  open: boolean;
  title: string;
  placeholder: string;
  emptyLabel: string;
  options: string[];
  value: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

export function SearchPickerOverlay({
  open,
  title,
  placeholder,
  emptyLabel,
  options,
  value,
  onSelect,
  onClose,
}: SearchPickerOverlayProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    // Delay focus until after the mount/animation frame, otherwise iOS often
    // opens the keyboard against a stale layout and scrolls the page instead.
    const timer = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return options;
    return options.filter((option) => option.toLocaleLowerCase().includes(term));
  }, [options, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-white" style={{ height: "100dvh" }}>
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-2.5">
        <button
          type="button"
          onClick={onClose}
          aria-label={title}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <label className="flex h-11 flex-1 items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50/50 px-3.5">
          <Search className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            enterKeyHint="search"
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-medium text-slate-900 outline-none placeholder:text-slate-400"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Clear"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-white hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
      </div>

      {/* Only flexible row: shrinks as the keyboard opens instead of clipping. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
        {filtered.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">{emptyLabel}</p>
        ) : (
          <ul className="py-1">
            {filtered.map((option) => {
              const selected = option === value;
              return (
                <li key={option}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(option);
                      onClose();
                    }}
                    className={cn(
                      "flex min-h-12 w-full items-center justify-between gap-3 px-5 py-3 text-left text-[15px] transition-colors",
                      selected ? "font-bold text-emerald-800" : "font-medium text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    <span className="min-w-0 truncate">{option}</span>
                    {selected && <Check className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
