/**
 * Collection fares, edited on the map they belong to.
 *
 * These live under Area Intelligence rather than System Settings on purpose:
 * that screen also holds maintenance mode and registrations, and widening
 * access to it so somebody can change a fare is not a trade worth making. Same
 * storage, different door — and this door already carries map.manageAreas.
 *
 * Two things are being edited here and they are deliberately separated. The
 * fare for a place is a fact about traffic that only somebody who drives it
 * knows; the shop-wide numbers are policy. Mixing them in one list invites
 * changing a policy while meaning to correct one neighbourhood.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, CircleDollarSign, Loader2, MapPin, Radius, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { settingsApi } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
    ringColor,
    readAreaFares, readRingSlots, readTierExtras, readAnywhereElseFare, readFreeOverAmount, readHoldDays,
    PICKUP_AREA_FARES_KEY, PICKUP_RING_FARES_KEY, PICKUP_TIER_EXTRAS_KEY, PICKUP_ANYWHERE_ELSE_KEY,
    PICKUP_FREE_OVER_KEY, PICKUP_HOLD_DAYS_KEY,
    type PickupAreaFare,
} from "@shared/pickup-pricing";

type SettingRow = { key: string; value: string | null };

export interface PickupFaresPanelProps {
    settings: SettingRow[];
    /** The area currently selected on the map, if any. */
    area: { id: string; label: string } | null;
    canManage: boolean;
    currency: string;
    className?: string;
}

/** Empty string rather than 0 — an unset fare must never read as free. */
const show = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
const parse = (s: string): number | null => {
    const t = s.trim();
    if (!t) return null;
    const v = Number(t);
    return Number.isFinite(v) && v >= 0 ? Math.round(v) : null;
};

export function PickupFaresPanel({ settings, area, canManage, currency, className }: PickupFaresPanelProps) {
    const queryClient = useQueryClient();

    const areaFares = useMemo(() => readAreaFares(settings), [settings]);
    const tierExtras = useMemo(() => readTierExtras(settings), [settings]);
    const anywhereElse = useMemo(() => readAnywhereElseFare(settings), [settings]);
    const freeOver = useMemo(() => readFreeOverAmount(settings), [settings]);
    const holdDays = useMemo(() => readHoldDays(settings), [settings]);

    const current: PickupAreaFare | undefined = area ? areaFares[area.id] : undefined;
    const [fare, setFare] = useState(show(current?.fare));
    const [radius, setRadius] = useState(show(current?.radiusKm));

    // Switching area on the map must load that area's fare, not keep the last.
    useEffect(() => {
        setFare(show(current?.fare));
        setRadius(show(current?.radiusKm));
    }, [area?.id, current?.fare, current?.radiusKm]);

    const save = useMutation({
        mutationFn: async (entries: Array<{ key: string; value: string }>) => {
            for (const entry of entries) await settingsApi.upsert(entry);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["settings-pickup-fares"] });
            toast.success("Fares updated");
        },
        // The server says which field and why; repeating "could not save"
        // over the top of that would throw away the only useful part.
        onError: (error: any) => toast.error(error?.message || "Could not save the fares"),
    });

    const saveArea = () => {
        if (!area) return;
        const next = { ...areaFares };
        const f = parse(fare);
        const r = parse(radius);
        // Clearing either field un-rates the place, which turns it pink again.
        // That is the honest result of deleting a fare, and better than keeping
        // half of one that can never match an address.
        if (f === null || r === null || r <= 0) delete next[area.id];
        else next[area.id] = { fare: f, radiusKm: r };
        save.mutate([{ key: PICKUP_AREA_FARES_KEY, value: JSON.stringify(next) }]);
    };

    /**
     * The five bands, held as text while being edited.
     *
     * Text rather than numbers so a half-typed "1" on the way to "12" is not
     * read as a one-kilometre ring, and so clearing a box stays cleared instead
     * of snapping to 0 — which would read as a free collection.
     *
     * There are always exactly five and they cannot be added to or removed; the
     * count is a fact about the city, not a preference. Only the distance and
     * the fare are the shop's to set.
     */
    const savedRings = useMemo(() => readRingSlots(settings), [settings]);
    const [ringDrafts, setRingDrafts] = useState<Array<{ radiusKm: string; fare: string; discountOver: string }>>([]);
    const [openRing, setOpenRing] = useState<number | null>(null);

    // Reload from the server's answer whenever it changes, so a save elsewhere
    // is not silently overwritten by a stale draft.
    useEffect(() => {
        setRingDrafts(savedRings.map((r) => ({
            radiusKm: String(r.radiusKm),
            fare: r.fare === null ? "" : String(r.fare),
            discountOver: r.discountOver === null ? "" : String(r.discountOver),
        })));
    }, [savedRings]);

    type RingField = "radiusKm" | "fare" | "discountOver";
    const rings = ringDrafts;
    const ringDraft = (i: number, field: RingField) => ringDrafts[i]?.[field] ?? "";
    const setRingDraft = (i: number, field: RingField, value: string) =>
        setRingDrafts((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

    /**
     * Send what was typed, not what could be salvaged.
     *
     * The tier extras learned this the hard way: coercing a bad value to 0 in
     * the browser produced a cheerful "saved" and a free same-day collection.
     * The one validator on the server must get the raw text so it can refuse it
     * and say which field was wrong.
     */
    const saveRings = () =>
        save.mutate([{
            key: PICKUP_RING_FARES_KEY,
            /**
             * The raw text, not Number() of it.
             *
             * This claimed to send what was typed and then called Number() on
             * it, which is the same salvaging it was written to avoid — just
             * quieter. Number("1.5.5") is NaN, JSON.stringify turns NaN into
             * null, and the server then reported "A fare cannot be left blank"
             * for a box that plainly had 1.5.5 in it. The refusal was right and
             * the explanation was nonsense, which is worse than either alone.
             *
             * Sending the text lets the one validator see 1.5.5 and say so.
             */
            value: JSON.stringify(ringDrafts.map((d) => ({
                radiusKm: d.radiusKm.trim(),
                fare: d.fare.trim(),
                // Blank is a real answer here, unlike the fare: it means this
                // ring gives no discount. Sent as null so the reader does not
                // have to guess whether "" meant unset or zero.
                discountOver: d.discountOver.trim() === "" ? null : Number(d.discountOver),
            }))),
        }]);

    const rated = Object.keys(areaFares).length;
    const ladderInverted = tierExtras.sameDay > 0 && tierExtras.sameDay < tierExtras.chooseDay;

    return (
        <div className={cn("space-y-3", className)}>
            {/* ── the rings: the primary way collection is priced ─────────── */}
            <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                    <Radius className="h-4 w-4 text-blue-600" />
                    <p className="text-[11px] font-black uppercase tracking-wide text-blue-600">Distance rings</p>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">
                    Measured from the shop. An address pays the first ring that reaches it.
                </p>

                <div className="mt-3 space-y-2">
                        {rings.map((ring, index) => {
                            // Blank while being typed reads as an em dash, never as 0 —
                            // a ring showing "৳0" would say collection is free.
                            const outerKm = ring.radiusKm.trim() === "" ? "—" : ring.radiusKm;
                            const inner = index === 0 ? "0" : (rings[index - 1].radiusKm.trim() || "—");
                            const fareNum = ring.fare.trim() === "" ? null : Number(ring.fare);
                            const isOpen = openRing === index;
                            return (
                                <div key={index} className={cn(
                                    "rounded-xl border transition-colors",
                                    isOpen ? "border-blue-300 bg-blue-50/40" : "border-slate-200 bg-white",
                                )}>
                                    {/*
                                      * Collapsed shows only the basic fare. The three timings
                                      * were previously always on screen, which meant four
                                      * numbers competing for attention when the question being
                                      * asked is almost always just "what does this ring cost".
                                      */}
                                    <button type="button" onClick={() => setOpenRing(isOpen ? null : index)}
                                        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left">
                                        {/* Same colour as the circle on the map — the only thing
                                            tying a row to the band it prices. */}
                                        <span className="h-8 w-1.5 shrink-0 rounded-full"
                                            style={{ backgroundColor: ringColor(index) }} />
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-black text-slate-900">Ring {index + 1}</p>
                                            <p className="text-[11px] font-semibold text-slate-500">{inner}–{outerKm} km</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-black text-blue-700">
                                                {fareNum === null ? "Not set" : `${currency}${fareNum}`}
                                            </span>
                                            <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", isOpen && "rotate-180")} />
                                        </div>
                                    </button>

                                    {isOpen && (
                                        <div className="border-t border-blue-100 px-3 py-3">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="space-y-1">
                                                    <Label className="text-[11px] font-bold text-slate-600">Basic fare ({currency})</Label>
                                                    <Input inputMode="numeric" value={ringDraft(index, "fare")} disabled={!canManage}
                                                        onChange={(e) => setRingDraft(index, "fare", e.target.value)}
                                                        className="h-9 rounded-lg text-sm" />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-[11px] font-bold text-slate-600">Reaches (km)</Label>
                                                    <Input inputMode="decimal" value={ringDraft(index, "radiusKm")} disabled={!canManage}
                                                        onChange={(e) => setRingDraft(index, "radiusKm", e.target.value)}
                                                        className="h-9 rounded-lg text-sm" />
                                                </div>
                                            </div>

                                            {/*
                                              * The discount threshold, set per ring rather than
                                              * once for the city.
                                              *
                                              * The two ends of Dhaka are not the same journey. A
                                              * customer five kilometres out is worth collecting
                                              * from on a modest repair; thirty kilometres out the
                                              * same repair does not cover the driver's day. One
                                              * shop-wide figure has to be right for one of those
                                              * and is then wrong for the other.
                                              */}
                                            <div className="mt-3 space-y-1">
                                                <Label className="text-[11px] font-bold text-slate-600">
                                                    Discount the fare on repairs over ({currency})
                                                </Label>
                                                <Input inputMode="numeric" placeholder="No discount in this ring"
                                                    value={ringDraft(index, "discountOver")} disabled={!canManage}
                                                    onChange={(e) => setRingDraft(index, "discountOver", e.target.value)}
                                                    className="h-9 rounded-lg text-sm" />
                                                <p className="text-[11px] leading-snug text-slate-500">
                                                    {ringDraft(index, "discountOver").trim() === ""
                                                        ? "Leave blank and this ring's fare is always charged in full."
                                                        : fareNum === null
                                                            ? `Once this ring has a fare, a repair over ${currency}${ringDraft(index, "discountOver")} takes all of it off.`
                                                            /* Written as the customer will see it, so the
                                                               shop is setting a sentence, not a number. */
                                                            : `A repair over ${currency}${ringDraft(index, "discountOver")} shows ${currency}${fareNum} for pickup & drop, then −${currency}${fareNum} discount. Never "free".`}
                                                </p>
                                            </div>

                                            {/*
                                              * What the customer actually pays, per timing.
                                              *
                                              * The extras are one shop-wide set, not per ring, so
                                              * showing them alone would repeat the same three
                                              * numbers under every ring. Adding them to this
                                              * ring's fare answers the question staff are really
                                              * asking at the counter.
                                              */}
                                            <div className="mt-3 rounded-lg bg-white/70 p-2">
                                                <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Customer pays</p>
                                                <div className="mt-1 space-y-1">
                                                    {([["flexible", "We choose the day"], ["chooseDay", "Customer chooses"], ["sameDay", "Same day"]] as const).map(([k, label]) => (
                                                        <div key={k} className="flex items-center justify-between text-[11px]">
                                                            <span className="font-semibold text-slate-600">{label}</span>
                                                            <span className="font-black text-slate-900">
                                                                {fareNum === null ? "—" : `${currency}${fareNum + (tierExtras[k] ?? 0)}`}
                                                                {fareNum !== null && tierExtras[k] > 0 && (
                                                                    <span className="ml-1 font-semibold text-slate-400">(+{tierExtras[k]})</span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {canManage && (
                                                <Button size="sm" className="mt-3 h-8 w-full rounded-lg text-[11px]"
                                                    onClick={saveRings} disabled={save.isPending}>
                                                    {save.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save rings"}
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
            </div>

            {/* ── the selected place ─────────────────────────────────────── */}
            <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-blue-600" />
                    <p className="text-[11px] font-black uppercase tracking-wide text-blue-600">Fare for this place</p>
                </div>

                {!area ? (
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                        Select an area on the map to set what collection costs there.
                    </p>
                ) : (
                    <>
                        <p className="mt-1 truncate text-sm font-black text-slate-900">{area.label}</p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label className="text-[11px]">Fare ({currency})</Label>
                                <Input inputMode="numeric" placeholder="Not set" value={fare} disabled={!canManage}
                                    onChange={(e) => setFare(e.target.value)} className="h-10 rounded-xl" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[11px]">Covers (km)</Label>
                                <Input inputMode="decimal" placeholder="e.g. 3" value={radius} disabled={!canManage}
                                    onChange={(e) => setRadius(e.target.value)} className="h-10 rounded-xl" />
                            </div>
                        </div>
                        <p className="mt-2 text-[11px] leading-snug text-slate-500">
                            {/* Said plainly, because the rule is not obvious from two inputs. */}
                            Any address within {radius || "…"} km of this area pays {currency}{fare || "…"}.
                            Where circles overlap, the smaller one wins.
                        </p>
                        {canManage && (
                            <Button className="mt-3 h-10 w-full rounded-xl" onClick={saveArea} disabled={save.isPending}>
                                {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {parse(fare) === null ? "Clear fare for this area" : "Save fare"}
                            </Button>
                        )}
                    </>
                )}
            </div>

            {/* ── everywhere else, and the policy numbers ────────────────── */}
            <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                    <CircleDollarSign className="h-4 w-4 text-blue-600" />
                    <p className="text-[11px] font-black uppercase tracking-wide text-blue-600">Everywhere else</p>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">
                    {/* The leak this closes: a long trip whose nearest circle happens
                        to be a cheap one must not be charged the cheap fare. */}
                    Charged when an address falls outside every circle. Without it, a distant
                    collection is quoted at whichever fare happens to be closest.
                </p>
                <FieldRow
                    label={`Fare (${currency})`} value={show(anywhereElse)} canManage={canManage} pending={save.isPending}
                    onSave={(v) => save.mutate([{ key: PICKUP_ANYWHERE_ELSE_KEY, value: JSON.stringify(parse(v)) }])}
                />

                <div className="mt-4 border-t border-slate-100 pt-3">
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Timing extras</p>
                    <p className="mt-1 text-[11px] text-slate-500">Added on top of the area fare, never multiplied.</p>
                    <div className="mt-2 space-y-2">
                        {([["flexible", "We choose the day"], ["chooseDay", "Customer chooses"], ["sameDay", "Same day"]] as const).map(([k, label]) => (
                            <FieldRow
                                key={k} label={label} value={String(tierExtras[k])} canManage={canManage} pending={save.isPending}
                                onSave={(v) => save.mutate([{
                                    key: PICKUP_TIER_EXTRAS_KEY,
                                    /**
                                     * What was typed, not what was salvageable.
                                     *
                                     * This read `parse(v) ?? 0`, so -25 and a
                                     * cleared box both became 0 HERE, in the
                                     * browser, before the server could object.
                                     * The save then succeeded honestly and the
                                     * shop's same-day extra was free. Sending
                                     * the raw value lets the one validator
                                     * refuse it and say why.
                                     */
                                    value: JSON.stringify({ ...tierExtras, [k]: v.trim() === "" ? "" : Number(v) }),
                                }])}
                            />
                        ))}
                    </div>
                    {ladderInverted && (
                        /* A warning, not a block — there may be a reason. But an
                           inverted ladder on a live site is easy to cause with one
                           mistyped digit and embarrassing to discover later. */
                        <p className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold text-amber-700">
                            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            Same-day costs less than letting the customer choose. Check that is intended.
                        </p>
                    )}
                </div>
            </div>

            {/* ── the promise, kept apart from the costs ─────────────────── */}
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700">Fallback discount</p>
                <p className="mt-1 text-[11px] leading-snug text-emerald-800/80">
                    {/* Its own block on purpose: the fares above are cost recovery,
                        this is a promise the customer will read and hold us to.

                        Used only where a ring cannot answer — a hand-priced area,
                        or an address outside every ring paying the anywhere-else
                        fare. Each ring's own threshold always wins. */}
                    {freeOver
                        ? `Where no ring applies, a repair over ${currency}${freeOver} takes the whole collection fare off the bill. Shown as fare, discount and total — never as "free".`
                        : "Not set — outside the rings, the collection fare is always charged in full."}
                </p>
                <FieldRow
                    label={`Repairs over (${currency})`} value={show(freeOver)} canManage={canManage} pending={save.isPending}
                    onSave={(v) => save.mutate([{ key: PICKUP_FREE_OVER_KEY, value: JSON.stringify(parse(v)) }])}
                />
                <FieldRow
                    label="Hold a decided-against TV (days)" value={String(holdDays)} canManage={canManage} pending={save.isPending}
                    onSave={(v) => save.mutate([{ key: PICKUP_HOLD_DAYS_KEY, value: JSON.stringify(parse(v) ?? 30) }])}
                />
            </div>

            <p className="px-1 text-[11px] text-slate-500">
                {rated === 0
                    ? "No area has a fare yet, so no collection price is shown to customers anywhere."
                    : `${rated} area${rated === 1 ? "" : "s"} rated. Pink areas on the map have no fare.`}
            </p>
        </div>
    );
}

/** A labelled number with its own save, so one field cannot overwrite another. */
function FieldRow({
    label, value, canManage, pending, onSave,
}: { label: string; value: string; canManage: boolean; pending: boolean; onSave: (v: string) => void }) {
    const [draft, setDraft] = useState(value);
    useEffect(() => setDraft(value), [value]);
    const dirty = draft !== value;
    return (
        <div className="mt-2 flex items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
                <Label className="text-[11px]">{label}</Label>
                <Input inputMode="numeric" placeholder="Not set" value={draft} disabled={!canManage}
                    onChange={(e) => setDraft(e.target.value)} className="h-10 rounded-xl" />
            </div>
            {canManage && (
                <Button variant={dirty ? "default" : "outline"} className="h-10 shrink-0 rounded-xl px-3"
                    disabled={!dirty || pending} onClick={() => onSave(draft)}>
                    Save
                </Button>
            )}
        </div>
    );
}
