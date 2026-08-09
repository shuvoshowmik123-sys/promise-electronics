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
import { CircleDollarSign, Loader2, MapPin, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { settingsApi } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
    readAreaFares, readTierExtras, readAnywhereElseFare, readFreeOverAmount, readHoldDays,
    PICKUP_AREA_FARES_KEY, PICKUP_TIER_EXTRAS_KEY, PICKUP_ANYWHERE_ELSE_KEY,
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
        onError: () => toast.error("Could not save the fares"),
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

    const rated = Object.keys(areaFares).length;
    const ladderInverted = tierExtras.sameDay > 0 && tierExtras.sameDay < tierExtras.chooseDay;

    return (
        <div className={cn("space-y-3", className)}>
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
                                    value: JSON.stringify({ ...tierExtras, [k]: parse(v) ?? 0 }),
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
                <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700">Free collection</p>
                <p className="mt-1 text-[11px] leading-snug text-emerald-800/80">
                    {/* Its own block on purpose: the fares above are cost recovery,
                        this is a promise the customer will read and hold us to. */}
                    {freeOver
                        ? `Customers are told: free collection and return on repairs over ${currency}${freeOver}.`
                        : "Not set — no free-collection promise is shown to customers."}
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
