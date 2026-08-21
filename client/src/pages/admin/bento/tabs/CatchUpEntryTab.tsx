/**
 * The side door — one screen for work that already happened.
 *
 * Built customer-first, because that is the shape of the paper. A pile of old
 * bills is four or five customers with several televisions each, not eight
 * unrelated jobs, and the first version made you retype the customer for every
 * set. Pick the person once, then add their sets as rows.
 *
 * The running totals matter as much as the form. QA's complaint after entering
 * eight bills was not that typing was slow — it took a minute — but that
 * afterwards they still could not answer "how much is owed to me", so the whole
 * reason for typing never arrived. The pile total is now on screen and grows as
 * you work.
 *
 * Styling follows this app's mobile conventions rather than the shared
 * component defaults: rounded-xl and h-12 throughout, because the base Input
 * ships as rounded-md h-9 and looks sharp and cramped beside these screens.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertCircle, Building2, Check, Loader2, Plus, ScrollText, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BentoCard, containerVariants, itemVariants } from "../shared";
import { MobileScrollContent, MobileTabLayout } from "../shared/MobileAdminPrimitives";
import { CustomerDebtGrid, type DebtorTile } from "@/components/admin/CustomerDebtCard";
import { CustomerStatementSheet } from "@/components/admin/CustomerStatementSheet";
import { fetchApi } from "@/lib/api";
import { cn } from "@/lib/utils";

/** The app's mobile shape — not the component default. */
const FIELD = "h-12 rounded-xl bg-white";

type CustomerType = "individual" | "b2b_normal" | "b2b_corporate" | "limited_company";

const TYPES: Array<{ key: CustomerType; label: string; hint: string }> = [
    { key: "individual", label: "Person", hint: "A walk-in customer" },
    { key: "b2b_normal", label: "Business", hint: "A shop or dealer" },
    { key: "b2b_corporate", label: "Corporate", hint: "A company account" },
    { key: "limited_company", label: "Corporate Ltd", hint: "Several people handle it" },
];

interface KnownCustomer { name: string; phone: string; address: string | null; corporateClientId: string | null }
interface CorporateClient { id: string; companyName: string; shortCode: string | null }
interface CatchUpEntry {
    id: string; customer: string; customer_phone: string | null; device: string;
    catchup_entered_at: string | null; corporate_client_id: string | null;
    estimated_cost: number; catchup_amount_due: number | null;
    created_at: string; warranty_notes: string | null;
}

interface SetRow {
    key: string;
    device: string; modelNumber: string; screenSize: string; workDone: string;
    amountCharged: string; amountPaid: string; jobDate: string; warrantyMonths: string;
    saved?: string;
}

/**
 * Today where the shop is, not in UTC.
 *
 * toISOString() is UTC, and Dhaka is six hours ahead — so from midnight until
 * six in the morning the form offered yesterday's date, and somebody entering a
 * pile before opening would stamp every bill a day early without noticing.
 */
const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const blankRow = (): SetRow => ({
    key: Math.random().toString(36).slice(2),
    device: "", modelNumber: "", screenSize: "", workDone: "",
    amountCharged: "", amountPaid: "", jobDate: today(), warrantyMonths: "",
});

export function CatchUpEntryTab({ getCurrencySymbol }: { getCurrencySymbol: () => string }) {
    const queryClient = useQueryClient();
    const money = (n: number) => `${getCurrencySymbol()} ${n.toLocaleString()}`;

    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [address, setAddress] = useState("");
    const [type, setType] = useState<CustomerType>("individual");
    const [corporateClientId, setCorporateClientId] = useState("");
    /** Locked once a known customer is chosen; Change unlocks it. */
    const [locked, setLocked] = useState(false);
    const [search, setSearch] = useState("");
    const [rows, setRows] = useState<SetRow[]>([blankRow()]);
    /**
     * Rows the server has flagged as looking like a bill already entered.
     *
     * Lost in the customer-first rewrite and caught by QA: the refusal arrived
     * as a red toast with no way to proceed, so a genuine second identical
     * repair could not be recorded at all. Keyed by row so one flagged set does
     * not force the others through unchecked.
     */
    const [duplicateRows, setDuplicateRows] = useState<Set<string>>(new Set());

    /** Grows across every save this sitting — the number the owner came for. */
    const [pileOwed, setPileOwed] = useState(0);
    const [pileCount, setPileCount] = useState(0);
    /** Tapping a tile opens the same statement Finance opens. */
    const [openDebtor, setOpenDebtor] = useState<DebtorTile | null>(null);

    const isBusiness = type !== "individual";
    const searchRef = useRef<HTMLDivElement>(null);

    const { data: matches } = useQuery({
        queryKey: ["catchup-customers", search],
        queryFn: () => fetchApi<{ customers: KnownCustomer[] }>(
            `/admin/catch-up-job/customers?q=${encodeURIComponent(search)}`),
        enabled: search.trim().length >= 2 && !locked,
    });

    const { data: corporates } = useQuery({
        queryKey: ["catchup-corporates"],
        queryFn: () => fetchApi<{ clients: CorporateClient[] }>("/admin/catch-up-job/corporate-clients"),
        enabled: isBusiness,
    });

    /**
     * The same source Finance reads.
     *
     * Tiles used to sum catchup_amount_due over the last 20 entries, which gave
     * a different number from Finance for the same person — Catch-Up said Rahim
     * owed 81,000, Finance said 77,000 — and a manager cannot know which to read
     * out. It also missed anything older than twenty rows. Whose tiles appear
     * still comes from the catch-up list; what they OWE comes from here.
     */
    const { data: receivables } = useQuery({
        queryKey: ["receivables"],
        queryFn: () => fetchApi<{ debtors: DebtorTile[] }>("/admin/receivables"),
    });

    const { data: recent } = useQuery({
        queryKey: ["catch-up-entries"],
        queryFn: () => fetchApi<{ entries: CatchUpEntry[]; count: number }>("/admin/catch-up-job?limit=20"),
    });

    /**
     * One tile per customer, not one row per job.
     *
     * The list was every job typed in, newest first, which answered "did I
     * enter that?" and nothing else. What somebody actually wants after an
     * hour of typing is who they have covered and who still owes — and with
     * two televisions each, a job list buries that under twice the rows.
     *
     * Ordered by most recently touched rather than by debt: on this screen the
     * useful thing is what you just worked on. Finance sorts the same tiles by
     * who owes most, because there the useful thing is who to phone.
     */
    const enteredCustomers = useMemo<DebtorTile[]>(() => {
        const owedByKey = new Map((receivables?.debtors ?? []).map((d) => [d.id, d]));
        const byPerson = new Map<string, DebtorTile & { at: number }>();
        for (const e of recent?.entries ?? []) {
            /**
             * Companies key on their client id, people on their phone.
             *
             * The tile's id is what the statement is fetched with, and the two
             * statements read different tables — a company's bills, a person's
             * due records. A company keyed by phone asked the retail endpoint
             * for a customer that does not exist there and came back with the
             * wrong history under a "Person" label.
             */
            const isCompany = !!e.corporate_client_id;
            const key = isCompany
                ? e.corporate_client_id!
                : (e.customer_phone || e.customer || "Unknown");

            /**
             * Ordered by when it was TYPED, not by the date on the paper.
             *
             * created_at is the job's own date — 12 July for a July bill — so
             * entering something new for an old customer left their tile behind
             * anybody whose paper happened to be more recent. "I just did this"
             * is what should move a tile, and that is catchup_entered_at.
             */
            const at = new Date(e.catchup_entered_at || e.created_at).getTime();

            const existing = byPerson.get(key);
            if (existing) {
                existing.openCount += 1;
                existing.at = Math.max(existing.at, at);
            } else {
                const live = owedByKey.get(key);
                byPerson.set(key, {
                    kind: isCompany ? "corporate" : "retail",
                    id: key,
                    name: live?.name || e.customer || "Unknown",
                    phone: isCompany ? null : (e.customer_phone ?? null),
                    clientClass: live?.clientClass ?? null,
                    clientType: live?.clientType ?? null,
                    // Finance's figure, so the two screens cannot disagree.
                    owed: live?.owed ?? 0,
                    openCount: 1, at,
                });
            }
        }
        return Array.from(byPerson.values()).sort((a, b) => b.at - a.at);
    }, [recent, receivables]);

    const pickCustomer = (c: KnownCustomer) => {
        setName(c.name); setPhone(c.phone); setAddress(c.address ?? "");
        if (c.corporateClientId) { setCorporateClientId(c.corporateClientId); setType("b2b_corporate"); }
        setLocked(true);
        setSearch("");
    };

    const setRow = (key: string, patch: Partial<SetRow>) => {
        setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
        // A changed row is no longer the bill the server matched against.
        if (!("saved" in patch)) {
            setDuplicateRows((d) => {
                if (!d.has(key)) return d;
                const next = new Set(d); next.delete(key); return next;
            });
        }
    };

    const rowDue = (r: SetRow) => Math.max(0, (Number(r.amountCharged) || 0) - (Number(r.amountPaid) || 0));
    const rowOverpaid = (r: SetRow) => (Number(r.amountPaid) || 0) > (Number(r.amountCharged) || 0);
    const rowReady = (r: SetRow) =>
        !r.saved && !!r.device.trim() && !!r.workDone.trim() && r.amountCharged !== "" && !rowOverpaid(r);

    const pending = rows.filter(rowReady);
    const customerOwed = useMemo(
        () => rows.filter((r) => !r.saved).reduce((s, r) => s + rowDue(r), 0),
        [rows],
    );
    const customerReady = !!name.trim() && !!phone.trim() && (!isBusiness || !!corporateClientId);

    const save = useMutation({
        mutationFn: async () => {
            let owed = 0;
            let count = 0;
            let flagged = 0;
            /**
             * One request per set rather than one batch: a single bad row must
             * not lose the other five, and each job is stamped and audited on
             * its own.
             */
            for (const r of pending) {
                const res = await fetchApi<{ jobId: string }>("/admin/catch-up-job", {
                    method: "POST",
                    body: JSON.stringify({
                        customerName: name.trim(), customerPhone: phone.trim(),
                        customerAddress: address.trim() || undefined,
                        customerType: type,
                        corporateClientId: isBusiness ? corporateClientId : undefined,
                        device: r.device.trim(),
                        modelNumber: r.modelNumber.trim() || undefined,
                        screenSize: r.screenSize.trim() || undefined,
                        workDone: r.workDone.trim(),
                        amountCharged: Number(r.amountCharged) || 0,
                        amountPaid: Number(r.amountPaid) || 0,
                        jobDate: r.jobDate,
                        warrantyMonths: r.warrantyMonths ? Number(r.warrantyMonths) : undefined,
                        allowDuplicate: duplicateRows.has(r.key) || undefined,
                    }),
                }).catch((err: Error) => {
                    if (/already entered/i.test(err.message)) {
                        setDuplicateRows((d) => new Set(d).add(r.key));
                        flagged += 1;
                        return null;
                    }
                    throw err;
                });
                if (!res) continue;
                setRow(r.key, { saved: res.jobId });
                owed += rowDue(r);
                count += 1;
            }
            return { count, owed, flagged };
        },
        onSuccess: ({ count, owed, flagged }) => {
            if (flagged) {
                toast.warning(
                    `${flagged} ${flagged === 1 ? "set looks" : "sets look"} like a bill you already entered. ` +
                    "Press Save again only if it really is a second job.",
                );
            }
            if (!count) return;
            toast.success(`${count} ${count === 1 ? "job" : "jobs"} recorded`);
            setPileOwed((p) => p + owed);
            setPileCount((c) => c + count);
            setRows((rs) => [...rs.filter((r) => r.saved), blankRow()]);
            queryClient.invalidateQueries({ queryKey: ["catch-up-entries"] });
            queryClient.invalidateQueries({ queryKey: ["due-records"] });
            queryClient.invalidateQueries({ queryKey: ["jobs"] });
        },
        onError: (e: Error) => toast.error(e.message || "Could not save"),
    });

    const nextCustomer = () => {
        setName(""); setPhone(""); setAddress(""); setCorporateClientId("");
        setType("individual"); setLocked(false); setSearch("");
        setRows([blankRow()]);
    };

    // No Escape key on a phone, so an outside tap closes the suggestions.
    useEffect(() => {
        const away = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearch("");
        };
        document.addEventListener("mousedown", away);
        return () => document.removeEventListener("mousedown", away);
    }, []);

    return (
        /*
         * MobileAdminPrimitives states the rule outright: every mobile admin
         * tab must use these wrappers, and MobileScrollContent is "the only
         * scrolling surface on mobile". This tab did not use them, and the
         * shell hands each tab a fixed-height box — so the form simply
         * overflowed it. On a phone the page stuck after "Who are they" and the
         * sets below could not be reached except by tabbing into a field, which
         * then would not scroll back. Nothing was wrong with the form; there
         * was no scroller.
         *
         * Both wrappers are neutralised at md and above so the desktop layout,
         * which scrolls in the page itself, does not gain a second scrollbar.
         */
        <MobileTabLayout className="md:block md:h-auto md:overflow-visible">
        <MobileScrollContent className="px-0 md:flex-none md:min-h-0 md:overflow-visible md:px-0 md:pb-4">
        <motion.div
            variants={containerVariants} initial="hidden" animate="visible"
            /*
             * Bottom clearance comes from the shell's own CSS variable inside
             * MobileScrollContent, which knows the dock height. A hardcoded
             * padding here fought it and still left the Save button under the
             * dock at some scroll positions.
             */
            className="space-y-4"
        >
            <motion.div variants={itemVariants}>
                <div className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <div className="text-sm text-amber-900">
                        <span className="font-semibold">For work that already happened.</span>{" "}
                        <span className="text-amber-800/90">
                            Every entry is permanently marked as typed in later, with your name and the time.
                            New work must go through the normal intake.
                        </span>
                    </div>
                </div>
            </motion.div>

            {pileCount > 0 && (
                <motion.div variants={itemVariants}>
                    <div className="flex items-center justify-between rounded-2xl bg-slate-900 px-5 py-4 text-white">
                        <div>
                            <div className="text-[11px] uppercase tracking-wider text-white/60">Entered tonight</div>
                            <div className="text-sm font-semibold">{pileCount} {pileCount === 1 ? "job" : "jobs"}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-[11px] uppercase tracking-wider text-white/60">Still owed</div>
                            <div className="font-mono text-2xl font-black">{money(pileOwed)}</div>
                        </div>
                    </div>
                </motion.div>
            )}

            <motion.div variants={itemVariants}>
                <BentoCard className="bg-white" disableHover>
                    <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-500">Customer</h3>

                    {locked ? (
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div className="min-w-0">
                                <div className="truncate font-bold text-slate-900">{name}</div>
                                <div className="text-xs text-slate-500">{phone}{address ? ` · ${address}` : ""}</div>
                            </div>
                            {/*
                             * Locked rather than merely filled: these details came from a
                             * record that already exists, so nudging them while typing the
                             * fifth set would quietly create a second version of the same
                             * person.
                             */}
                            <Button variant="ghost" className="h-11 shrink-0 rounded-xl"
                                onClick={() => setLocked(false)}>Change</Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="relative" ref={searchRef}>
                                <Label className="text-xs">Name</Label>
                                <Input className={cn(FIELD, "mt-1.5")} value={name}
                                    placeholder="e.g. Rahim Uddin"
                                    onChange={(e) => { setName(e.target.value); setSearch(e.target.value); }} />
                                {!!matches?.customers.length && (
                                    <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                                        {matches.customers.map((c) => (
                                            <button key={c.phone} type="button"
                                                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                                                onClick={() => pickCustomer(c)}>
                                                {c.corporateClientId
                                                    ? <Building2 className="h-4 w-4 shrink-0 text-indigo-500" />
                                                    : <User className="h-4 w-4 shrink-0 text-slate-400" />}
                                                <span className="min-w-0">
                                                    <span className="block truncate text-sm font-semibold text-slate-800">{c.name}</span>
                                                    <span className="block text-xs text-slate-500">{c.phone}</span>
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Phone</Label>
                                    <Input className={FIELD} inputMode="tel" value={phone}
                                        placeholder="e.g. 01711223344"
                                        onChange={(e) => setPhone(e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Address <span className="font-normal text-slate-400">(optional)</span></Label>
                                    <Input className={FIELD} value={address}
                                        onChange={(e) => setAddress(e.target.value)} />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="mt-4 space-y-2">
                        <Label className="text-xs">Who are they?</Label>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {TYPES.map((t) => (
                                <button key={t.key} type="button" onClick={() => setType(t.key)}
                                    className={cn(
                                        "rounded-xl border px-3 py-3 text-left transition-all",
                                        type === t.key
                                            ? "border-slate-900 bg-slate-900 text-white"
                                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                                    )}>
                                    <div className="text-sm font-bold">{t.label}</div>
                                    <div className={cn("text-[10px] leading-tight",
                                        type === t.key ? "text-white/60" : "text-slate-400")}>{t.hint}</div>
                                </button>
                            ))}
                        </div>

                        {isBusiness && (
                            <div className="space-y-1.5 pt-1">
                                <Label className="text-xs">Which company?</Label>
                                {/*
                                 * A typed company name never reaches corporate billing —
                                 * the bills it belongs on would not know it exists. So the
                                 * real client is chosen, not written.
                                 */}
                                <select
                                    className={cn(FIELD, "w-full border border-slate-200 px-3 text-sm")}
                                    value={corporateClientId}
                                    onChange={(e) => {
                                        /**
                                         * Choosing the company IS choosing the customer.
                                         *
                                         * The name box and this list were independent, so a
                                         * job could be typed as "QA19 Corp Ltd" while pointing
                                         * at 1000FIX — and it was. The tile then showed one
                                         * name and its statement opened the other company's
                                         * bills, which a manager would have read out loud.
                                         * One customer cannot have two names.
                                         */
                                        setCorporateClientId(e.target.value);
                                        const picked = corporates?.clients.find((c) => c.id === e.target.value);
                                        if (picked) { setName(picked.companyName); setLocked(true); }
                                    }}>
                                    <option value="">Choose from the list…</option>
                                    {corporates?.clients.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.companyName}{c.shortCode ? ` (${c.shortCode})` : ""}
                                        </option>
                                    ))}
                                </select>
                                {!corporateClientId && (
                                    <p className="text-[11px] text-amber-600">
                                        Needed — otherwise this job will never appear on their bills.
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </BentoCard>
            </motion.div>

            <motion.div variants={itemVariants}>
                <BentoCard className="bg-white" disableHover>
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Their sets</h3>
                        {customerOwed > 0 && (
                            <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">
                                owes {money(customerOwed)}
                            </span>
                        )}
                    </div>

                    <div className="space-y-3">
                        {rows.map((r, i) => (
                            <div key={r.key} className={cn(
                                "rounded-2xl border p-4",
                                r.saved ? "border-emerald-100 bg-emerald-50/50" : "border-slate-200 bg-slate-50/40",
                            )}>
                                <div className="mb-3 flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-400">SET {i + 1}</span>
                                    {r.saved ? (
                                        <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                                            <Check className="h-3 w-3" /> saved
                                        </span>
                                    ) : rows.length > 1 ? (
                                        <button type="button" className="text-slate-300 hover:text-rose-500"
                                            onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    ) : null}
                                </div>

                                {r.saved ? (
                                    <div className="text-sm text-slate-600">
                                        {r.device} · {r.workDone.slice(0, 60)} · {money(Number(r.amountCharged) || 0)}
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            <Input className={FIELD} value={r.device} placeholder="e.g. Sony TV"
                                                onChange={(e) => setRow(r.key, { device: e.target.value })} />
                                            <Input className={FIELD} value={r.modelNumber} placeholder="Model (optional)"
                                                onChange={(e) => setRow(r.key, { modelNumber: e.target.value })} />
                                            <Input className={FIELD} value={r.screenSize} placeholder="Size e.g. 55"
                                                onChange={(e) => setRow(r.key, { screenSize: e.target.value })} />
                                        </div>

                                        <Textarea className="min-h-[72px] rounded-xl bg-white" value={r.workDone}
                                            placeholder="e.g. Panel replaced, 55 inch. New LVDS cable fitted."
                                            onChange={(e) => setRow(r.key, { workDone: e.target.value })} />

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-slate-500">৳</span>
                                                <Input className={cn(FIELD, "pl-8 font-mono")} type="number" inputMode="decimal"
                                                    min="0" value={r.amountCharged} placeholder="Charged"
                                                    onChange={(e) => setRow(r.key, { amountCharged: e.target.value })} />
                                            </div>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-slate-500">৳</span>
                                                <Input className={cn(FIELD, "pl-8 font-mono")} type="number" inputMode="decimal"
                                                    min="0" value={r.amountPaid} placeholder="Paid"
                                                    onChange={(e) => setRow(r.key, { amountPaid: e.target.value })} />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <Input className={FIELD} type="date" value={r.jobDate} max={today()}
                                                    onChange={(e) => setRow(r.key, { jobDate: e.target.value })} />
                                                {/*
                                                 * Repeated in words: a native date input renders in
                                                 * the browser's locale, so 12 July shows as
                                                 * 07/12/2026 under a US one — read here as 7
                                                 * December. A month name cannot be misread.
                                                 */}
                                                {r.jobDate && (
                                                    <p className="mt-1 text-[11px] font-semibold text-slate-600">
                                                        {new Date(r.jobDate + "T00:00:00").toLocaleDateString("en-GB",
                                                            { day: "numeric", month: "long", year: "numeric" })}
                                                    </p>
                                                )}
                                            </div>
                                            <Input className={FIELD} type="number" inputMode="numeric" min="0"
                                                value={r.warrantyMonths} placeholder="Warranty months"
                                                onChange={(e) => setRow(r.key, { warrantyMonths: e.target.value })} />
                                        </div>

                                        {rowOverpaid(r) ? (
                                            <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900">
                                                Paid is more than charged — check the figures
                                            </div>
                                        ) : rowDue(r) > 0 ? (
                                            <div className="flex items-center justify-between rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-800">
                                                <span>Still owes</span>
                                                <span className="font-mono">{money(rowDue(r))}</span>
                                            </div>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <Button variant="outline" className="mt-3 h-12 w-full rounded-xl border-dashed"
                        onClick={() => setRows((rs) => [...rs, blankRow()])}>
                        <Plus className="mr-2 h-4 w-4" /> Add another set
                    </Button>

                    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button variant="ghost" className="h-12 rounded-xl" onClick={nextCustomer}>
                            Next customer
                        </Button>
                        <Button className={cn("h-12 rounded-xl px-8",
                            pending.some((r) => duplicateRows.has(r.key))
                                ? "bg-amber-600 hover:bg-amber-700"
                                : "bg-slate-900 hover:bg-slate-800")}
                            disabled={!customerReady || !pending.length || save.isPending}
                            onClick={() => save.mutate()}>
                            {save.isPending
                                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
                                : pending.some((r) => duplicateRows.has(r.key))
                                    ? <><AlertCircle className="mr-2 h-4 w-4" /> Yes, save it anyway</>
                                    : <><Check className="mr-2 h-4 w-4" /> Save {pending.length || ""} {pending.length === 1 ? "job" : "jobs"}</>}
                        </Button>
                    </div>
                </BentoCard>
            </motion.div>

            {/* A shortcut nobody can review is a hole, not a shortcut. */}
            <motion.div variants={itemVariants}>
                <BentoCard className="bg-white" disableHover>
                    <div className="mb-3 flex items-center gap-2">
                        <ScrollText className="h-4 w-4 text-slate-400" />
                        <h3 className="text-sm font-black text-slate-900">Recently entered this way</h3>
                        <span className="text-[11px] text-slate-400">{recent?.count ?? 0}</span>
                    </div>
                    {/*
                      * Tiles, not rows: with two televisions each, a job list
                      * buries who still owes under twice the lines. Same tile
                      * as Finance uses, so the same person looks like the same
                      * record on both screens.
                      */}
                    <CustomerDebtGrid
                        debtors={enteredCustomers}
                        currency={getCurrencySymbol()}
                        onOpen={setOpenDebtor}
                        emptyText="Nothing entered yet."
                    />
                </BentoCard>
            </motion.div>
        </motion.div>
        <CustomerStatementSheet
            debtor={openDebtor}
            onClose={() => setOpenDebtor(null)}
            currency={getCurrencySymbol()}
        />
        </MobileScrollContent>
        </MobileTabLayout>
    );
}
