import { useEffect, useMemo, useState } from "react";
import { CalendarOff, Check, Loader2, Plus, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { settingsApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
    WARRANTY_SETTING_KEYS,
    DEFAULT_PARTS_MONTH_OPTIONS,
    DEFAULT_SERVICE_MONTH_OPTIONS,
    MAX_WARRANTY_MONTHS,
    parseMonthOptions,
    formatWarrantyMonths,
} from "@shared/warranty-options";

/**
 * The two operational rules the system enforces on the shop's behalf, in one
 * place: what warranty the counter may promise, and which days nobody works.
 *
 * Both were hardcoded, and both caused visible harm. The counter had no
 * warranty choice at all, so a customer told six months was issued thirty
 * days. The nudge scheduler had no idea Friday was closed, so it chased two
 * people on their rest day — and a reminder that fires on a holiday is exactly
 * how staff learn to ignore every reminder.
 *
 * Neither should need a deploy to change. A shop closes for Eid on dates that
 * move every year.
 */

const REST_DAY_KEYS = { restDays: "shop.restDays", holidays: "shop.holidays" } as const;

const WEEKDAYS = [
    { value: 0, label: "Sun" },
    { value: 1, label: "Mon" },
    { value: 2, label: "Tue" },
    { value: 3, label: "Wed" },
    { value: 4, label: "Thu" },
    { value: 5, label: "Fri" },
    { value: 6, label: "Sat" },
];

/** Matches the scheduler's own fallback, so the screen never misreports it. */
const DEFAULT_REST_DAYS = [5];

interface Setting { key: string; value: string }

function parseDayList(raw: string | undefined, fallback: number[]): number[] {
    if (!raw) return fallback;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return fallback;
        const days = parsed.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v >= 0 && v <= 6);
        return days.length > 0 ? Array.from(new Set(days)).sort() : fallback;
    } catch {
        return fallback;
    }
}

function parseHolidays(raw: string | undefined): string[] {
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((v) => String(v))
            .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))
            .sort();
    } catch {
        return [];
    }
}

export function OperationsSettingsPanel({ settings }: { settings: Setting[] }) {
    const { toast } = useToast();
    const [saving, setSaving] = useState(false);

    const initial = useMemo(() => {
        const get = (key: string) => settings.find((s) => s.key === key)?.value;
        return {
            parts: parseMonthOptions(get(WARRANTY_SETTING_KEYS.partsMonths), DEFAULT_PARTS_MONTH_OPTIONS),
            service: parseMonthOptions(get(WARRANTY_SETTING_KEYS.serviceMonths), DEFAULT_SERVICE_MONTH_OPTIONS),
            restDays: parseDayList(get(REST_DAY_KEYS.restDays), DEFAULT_REST_DAYS),
            holidays: parseHolidays(get(REST_DAY_KEYS.holidays)),
        };
    }, [settings]);

    const [parts, setParts] = useState<number[]>(initial.parts);
    const [service, setService] = useState<number[]>(initial.service);
    const [restDays, setRestDays] = useState<number[]>(initial.restDays);
    const [holidays, setHolidays] = useState<string[]>(initial.holidays);
    const [newHoliday, setNewHoliday] = useState("");

    // Settings arrive asynchronously; adopt them once they land.
    useEffect(() => {
        setParts(initial.parts);
        setService(initial.service);
        setRestDays(initial.restDays);
        setHolidays(initial.holidays);
    }, [initial]);

    const toggle = (list: number[], value: number, setter: (next: number[]) => void) => {
        setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value].sort((a, b) => a - b));
    };

    const addHoliday = () => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(newHoliday)) return;
        if (holidays.includes(newHoliday)) { setNewHoliday(""); return; }
        setHolidays([...holidays, newHoliday].sort());
        setNewHoliday("");
    };

    /**
     * An empty warranty list is refused rather than saved.
     *
     * Saved empty, the till would show a dropdown with nothing in it and the
     * cashier could not record any warranty at all — a silent regression of the
     * whole feature, discovered only when a customer claims.
     */
    const save = async () => {
        if (parts.length === 0 || service.length === 0) {
            toast({
                title: "Pick at least one period",
                description: "An empty list would leave the counter unable to promise any warranty.",
                variant: "destructive",
            });
            return;
        }
        setSaving(true);
        try {
            const payload: Record<string, string> = {
                [WARRANTY_SETTING_KEYS.partsMonths]: JSON.stringify(parts),
                [WARRANTY_SETTING_KEYS.serviceMonths]: JSON.stringify(service),
                [REST_DAY_KEYS.restDays]: JSON.stringify(restDays),
                [REST_DAY_KEYS.holidays]: JSON.stringify(holidays),
            };
            const results = await Promise.allSettled(
                Object.entries(payload).map(([key, value]) => settingsApi.upsert({ key, value })),
            );
            const failed = results.filter((r) => r.status === "rejected").length;
            if (failed === 0) {
                toast({ title: "Saved", description: "Warranty periods and closed days updated." });
            } else {
                toast({ title: "Partly saved", description: `${failed} setting(s) failed.`, variant: "destructive" });
            }
        } finally {
            setSaving(false);
        }
    };

    const monthChip = (m: number, active: boolean, onClick: () => void) => (
        <button
            key={m}
            type="button"
            onClick={onClick}
            className={cn(
                "h-9 rounded-xl border px-3 text-[12px] font-bold transition-colors",
                active
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-500",
            )}
        >
            {formatWarrantyMonths(m)}
        </button>
    );

    return (
        <div className="space-y-5">
            {/* ── Warranty periods ── */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50">
                        <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-sm font-black text-slate-950">Warranty periods</p>
                        <p className="text-[11px] font-medium text-slate-500">
                            What the counter can offer when billing a repair.
                        </p>
                    </div>
                </div>

                <div className="mt-4">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Parts warranty</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                        A replaced panel or board is a new component and is covered like one.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {Array.from({ length: MAX_WARRANTY_MONTHS }, (_, i) => i + 1).slice(0, 6).map((m) =>
                            monthChip(m, parts.includes(m), () => toggle(parts, m, setParts)),
                        )}
                    </div>
                </div>

                <div className="mt-4">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Service warranty</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                        Covers workmanship on the fault repaired — not the whole television.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {[1, 2, 3].map((m) => monthChip(m, service.includes(m), () => toggle(service, m, setService)))}
                    </div>
                </div>

                <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-medium leading-4 text-slate-500">
                    &ldquo;No warranty&rdquo; is always available at the counter and does not need listing here.
                </p>
            </section>

            {/* ── Closed days ── */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50">
                        <CalendarOff className="h-4 w-4 text-amber-600" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-sm font-black text-slate-950">Days the shop is closed</p>
                        <p className="text-[11px] font-medium text-slate-500">
                            Nobody is asked for attendance or parts on these days.
                        </p>
                    </div>
                </div>

                <div className="mt-4">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Weekly rest day</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {WEEKDAYS.map((d) => (
                            <button
                                key={d.value}
                                type="button"
                                onClick={() => toggle(restDays, d.value, setRestDays)}
                                className={cn(
                                    "h-9 w-12 rounded-xl border text-[12px] font-bold transition-colors",
                                    restDays.includes(d.value)
                                        ? "border-amber-200 bg-amber-50 text-amber-700"
                                        : "border-slate-200 bg-white text-slate-500",
                                )}
                            >
                                {d.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mt-4">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        Holidays ({holidays.length})
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                        Eid and public holidays move each year, so they are listed by date.
                    </p>
                    <div className="mt-2 flex gap-2">
                        <input
                            type="date"
                            value={newHoliday}
                            onChange={(e) => setNewHoliday(e.target.value)}
                            className="h-9 flex-1 rounded-xl border border-slate-200 bg-white px-2.5 text-[13px] font-bold text-slate-950 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        />
                        <button
                            type="button"
                            onClick={addHoliday}
                            disabled={!/^\d{4}-\d{2}-\d{2}$/.test(newHoliday)}
                            className="flex h-9 items-center gap-1 rounded-xl bg-slate-900 px-3 text-[12px] font-bold text-white disabled:opacity-40"
                        >
                            <Plus className="h-3.5 w-3.5" /> Add
                        </button>
                    </div>
                    {holidays.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {holidays.map((d) => (
                                <span
                                    key={d}
                                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-600"
                                >
                                    {d}
                                    <button type="button" aria-label={`Remove ${d}`} onClick={() => setHolidays(holidays.filter((h) => h !== d))}>
                                        <X className="h-3 w-3 text-slate-400" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </section>

            <button
                type="button"
                onClick={save}
                disabled={saving}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-black text-white shadow-sm active:scale-[0.98] disabled:opacity-50"
            >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {saving ? "Saving…" : "Save operations settings"}
            </button>
        </div>
    );
}
