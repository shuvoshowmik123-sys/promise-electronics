/**
 * Picking a Dhaka neighbourhood or road instead of spelling one.
 *
 * The pickup address used to be free text that nothing checked, which cost the
 * shop twice: a driver was sent to an address nobody had verified, and the
 * collection fare is decided by which rated circle the address falls in, so an
 * address with no coordinates quietly fell through to the most expensive
 * "anywhere else" rate. Choosing from a list fixes both at once, because a
 * chosen row carries a point on the map as well as a spelling.
 *
 * Two rules shape the interaction:
 *
 *   1. Suggestions never interrupt typing. They appear underneath, the field
 *      keeps focus and the caret keeps its place, and nothing is ever written
 *      into the box on the customer's behalf. Autocompletes that overwrite the
 *      field mid-word are the reason people distrust them.
 *   2. Typing something unrecognised is a state, not an error. It says the
 *      place was not found and leaves the text alone — plenty of real Dhaka
 *      addresses are not in OpenStreetMap, and refusing them would block the
 *      order. What it must not do is stay silent, because the silent case is
 *      how a wrong spelling reaches a driver.
 *
 * Selection is by pointer or by keyboard: arrows move, Enter takes, Escape
 * closes the list without touching the text.
 */
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, MapPin, SearchX } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { publicAreaMapApi, type DhakaPlaceSuggestion } from "@/lib/api/mapApi";
import { cn } from "@/lib/utils";

export interface DhakaPlaceSearchInputProps {
    /** Fired when a suggestion is chosen. Never fired for typed text. */
    onSelect: (place: DhakaPlaceSuggestion) => void;
    /** The already-chosen place, so the field can show it as confirmed. */
    selected?: DhakaPlaceSuggestion | null;
    /** Clears the confirmed place when the customer edits away from it. */
    onClear?: () => void;
    placeholder?: string;
    label?: string;
    /** Copy for the "no such place" line, so the caller can localise it. */
    noMatchText?: string;
    helpText?: string;
    className?: string;
    inputId?: string;
}

/** Two characters is where Bangla place names start to mean something. */
const MIN_QUERY_LENGTH = 2;

export function DhakaPlaceSearchInput({
    onSelect,
    selected,
    onClear,
    placeholder = "Area or road — e.g. Dhanmondi, ধানমন্ডি",
    label,
    noMatchText = "No matching place found. You can still type your address below.",
    helpText,
    className,
    inputId,
}: DhakaPlaceSearchInputProps) {
    const [query, setQuery] = useState(selected?.label ?? "");
    const [debounced, setDebounced] = useState("");
    const [open, setOpen] = useState(false);
    const [highlighted, setHighlighted] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const generatedId = useId();
    const fieldId = inputId ?? `dhaka-place-${generatedId}`;
    const listboxId = `${fieldId}-listbox`;

    // 300ms: the table is local and answers in milliseconds, so this only needs
    // to be long enough to skip the letters of a word in progress. The Photon
    // search elsewhere waits 550ms because it is spending someone else's quota.
    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(query.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [query]);

    // Editing away from a confirmed place drops the coordinates with it. Keeping
    // them would silently price the journey to a spot the text no longer names.
    useEffect(() => {
        if (selected && query.trim() !== selected.label) onClear?.();
        // onClear is deliberately excluded: callers commonly pass an inline
        // arrow, and depending on it would fire this on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, selected]);

    useEffect(() => {
        function onPointerDown(event: MouseEvent) {
            if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
        }
        document.addEventListener("mousedown", onPointerDown);
        return () => document.removeEventListener("mousedown", onPointerDown);
    }, []);

    const enabled = debounced.length >= MIN_QUERY_LENGTH && !selected;
    const placeQuery = useQuery({
        queryKey: ["dhaka-place-search", debounced],
        queryFn: () => publicAreaMapApi.searchDhakaPlaces(debounced),
        enabled,
        // Place names do not change while somebody is typing, and correcting a
        // typo usually returns to a query already answered a second ago.
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        retry: false,
    });

    const results = placeQuery.data?.results ?? [];
    const settled = enabled && !placeQuery.isFetching;
    const showNoMatch = settled && results.length === 0 && open;
    const showList = open && results.length > 0;

    useEffect(() => setHighlighted(0), [debounced]);

    function choose(place: DhakaPlaceSuggestion) {
        setQuery(place.label);
        setOpen(false);
        onSelect(place);
    }

    function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (!showList) return;
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlighted((index) => (index + 1) % results.length);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlighted((index) => (index - 1 + results.length) % results.length);
        } else if (event.key === "Enter") {
            // Only when the list is open and something is highlighted — Enter
            // must otherwise stay free to submit the form.
            event.preventDefault();
            const place = results[highlighted];
            if (place) choose(place);
        } else if (event.key === "Escape") {
            setOpen(false);
        }
    }

    return (
        <div ref={containerRef} className={cn("relative space-y-1.5", className)}>
            {label && (
                <label htmlFor={fieldId} className="text-sm font-medium text-slate-700">
                    {label}
                </label>
            )}

            <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
                <Input
                    id={fieldId}
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={onKeyDown}
                    placeholder={placeholder}
                    className={cn(
                        "h-12 rounded-xl border-emerald-100 pl-9 pr-9",
                        selected && "border-emerald-300 bg-emerald-50/40",
                    )}
                    autoComplete="off"
                    role="combobox"
                    aria-expanded={showList}
                    aria-controls={showList ? listboxId : undefined}
                    aria-autocomplete="list"
                />
                {placeQuery.isFetching && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-emerald-500" />
                )}
                {selected && !placeQuery.isFetching && (
                    <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
                )}
            </div>

            {helpText && !showNoMatch && <p className="text-xs text-slate-500">{helpText}</p>}

            {showNoMatch && (
                <p className="flex items-start gap-1.5 text-xs font-medium text-amber-700">
                    <SearchX className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {noMatchText}
                </p>
            )}

            {showList && (
                <ul
                    id={listboxId}
                    role="listbox"
                    className="absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-2xl border border-emerald-100 bg-white py-1 shadow-lg"
                >
                    {results.map((place, index) => (
                        <li key={place.id} role="option" aria-selected={index === highlighted}>
                            <button
                                type="button"
                                // mousedown, not click: the input's blur would
                                // otherwise close the list before click lands.
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    choose(place);
                                }}
                                onMouseEnter={() => setHighlighted(index)}
                                className={cn(
                                    "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors",
                                    index === highlighted ? "bg-emerald-50" : "bg-transparent",
                                )}
                            >
                                <MapPin
                                    className={cn(
                                        "mt-0.5 h-4 w-4 shrink-0",
                                        place.kind === "area" ? "text-emerald-600" : "text-slate-400",
                                    )}
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-slate-800">
                                        {place.label}
                                    </span>
                                    {place.secondary && (
                                        <span className="block truncate text-xs text-slate-500">
                                            {place.secondary}
                                        </span>
                                    )}
                                </span>
                                {place.kind === "area" && (
                                    <span className="mt-0.5 shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                                        Area
                                    </span>
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
