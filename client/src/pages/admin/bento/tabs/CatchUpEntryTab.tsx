/**
 * The side door — one screen for work that already happened.
 *
 * The normal intake is six steps in a fixed order, which is right for real new
 * work and unusable for a repair that finished three weeks ago. This is one
 * form and one save, so a shelf full of televisions the system knows nothing
 * about can actually be entered from the paper they came in on.
 *
 * Two things are deliberate and visible on screen rather than buried: the price
 * box accepts whatever was really charged, because the same panel goes out at
 * 26,000 or 35,000 depending on what else the set needed; and every entry is
 * stamped permanently as typed-in-later, which is said plainly at the top
 * rather than hidden in a database column.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertCircle, Check, Loader2, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BentoCard, containerVariants, itemVariants } from "../shared";
import { fetchApi } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CatchUpEntry {
    id: string;
    customer: string;
    customer_phone: string;
    device: string;
    estimated_cost: number;
    payment_status: string;
    catchup_amount_due: number | null;
    created_at: string;
    created_by_name: string;
}

const EMPTY = {
    customerName: "", customerPhone: "", customerAddress: "",
    device: "", modelNumber: "", screenSize: "",
    workDone: "",
    amountCharged: "", amountPaid: "",
    jobDate: new Date().toISOString().slice(0, 10),
    warrantyMonths: "", technicianName: "", note: "",
};

export function CatchUpEntryTab({ getCurrencySymbol }: { getCurrencySymbol: () => string }) {
    const [form, setForm] = useState({ ...EMPTY });
    const queryClient = useQueryClient();
    const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

    const { data: recent } = useQuery({
        queryKey: ["catch-up-entries"],
        queryFn: () => fetchApi<{ entries: CatchUpEntry[]; count: number }>("/admin/catch-up-job?limit=20"),
    });

    const charged = Number(form.amountCharged) || 0;
    const paid = Number(form.amountPaid) || 0;
    const due = Math.max(0, charged - paid);
    /** The server refuses this, so the screen must not let it be sent. */
    const overpaid = paid > charged;

    const save = useMutation({
        mutationFn: () => fetchApi<{ jobId: string; message: string }>("/admin/catch-up-job", {
            method: "POST",
            body: JSON.stringify({
                customerName: form.customerName.trim(),
                customerPhone: form.customerPhone.trim(),
                customerAddress: form.customerAddress.trim() || undefined,
                device: form.device.trim(),
                modelNumber: form.modelNumber.trim() || undefined,
                screenSize: form.screenSize.trim() || undefined,
                workDone: form.workDone.trim(),
                amountCharged: charged,
                amountPaid: paid,
                jobDate: form.jobDate,
                warrantyMonths: form.warrantyMonths ? Number(form.warrantyMonths) : undefined,
                technicianName: form.technicianName.trim() || undefined,
                note: form.note.trim() || undefined,
            }),
        }),
        onSuccess: (r) => {
            toast.success(r.message);
            // Only the customer is cleared: entering a paper of forty repairs for
            // one corporate client means re-typing their details forty times
            // otherwise.
            setForm((f) => ({
                ...EMPTY,
                customerName: f.customerName,
                customerPhone: f.customerPhone,
                customerAddress: f.customerAddress,
                jobDate: f.jobDate,
            }));
            queryClient.invalidateQueries({ queryKey: ["catch-up-entries"] });
            queryClient.invalidateQueries({ queryKey: ["jobs"] });
        },
        onError: (e: Error) => toast.error(e.message || "Could not save this entry"),
    });

    const ready = form.customerName.trim() && form.customerPhone.trim()
        && form.device.trim() && form.workDone.trim() && charged >= 0
        && form.amountCharged !== "" && !overpaid;
    const money = (n: number) => `${getCurrencySymbol()} ${n.toLocaleString()}`;

    /** Every field is h-12 — a thumb needs 44px and these get typed on a phone. */
    const field = "h-12 bg-white";

    return (
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-4">
            <motion.div variants={itemVariants}>
                <div className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <div className="text-sm text-amber-900">
                        <span className="font-semibold">For work that already happened.</span>{" "}
                        <span className="text-amber-800/90">
                            Use this for repairs finished before the system, or already delivered. Every entry
                            is permanently marked as typed in later, with your name and the time — so these can
                            always be told apart from live records. New work must go through the normal intake.
                        </span>
                    </div>
                </div>
            </motion.div>

            <motion.div variants={itemVariants}>
                <BentoCard className="bg-white" disableHover>
                    <div className="space-y-5">
                        <section className="space-y-3">
                            <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Customer</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Name</Label>
                                    <Input className={field} value={form.customerName}
                                        onChange={(e) => set("customerName", e.target.value)} placeholder="e.g. Rahim Uddin" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Phone</Label>
                                    <Input className={field} inputMode="tel" value={form.customerPhone}
                                        onChange={(e) => set("customerPhone", e.target.value)} placeholder="e.g. 01711223344" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Address <span className="font-normal text-slate-400">(optional)</span></Label>
                                <Input className={field} value={form.customerAddress}
                                    onChange={(e) => set("customerAddress", e.target.value)} />
                            </div>
                        </section>

                        <section className="space-y-3">
                            <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">The set</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="space-y-1.5 sm:col-span-1">
                                    <Label className="text-xs">Brand / device</Label>
                                    <Input className={field} value={form.device}
                                        onChange={(e) => set("device", e.target.value)} placeholder="e.g. Sony TV" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Model <span className="font-normal text-slate-400">(optional)</span></Label>
                                    <Input className={field} value={form.modelNumber}
                                        onChange={(e) => set("modelNumber", e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Size <span className="font-normal text-slate-400">(optional)</span></Label>
                                    <Input className={field} value={form.screenSize}
                                        onChange={(e) => set("screenSize", e.target.value)} placeholder="e.g. 55" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">What was done</Label>
                                <Textarea className="min-h-[88px] bg-white" value={form.workDone}
                                    onChange={(e) => set("workDone", e.target.value)}
                                    placeholder="e.g. Panel replaced, 55 inch. New LVDS cable fitted." />
                                <p className="text-[11px] text-slate-400">Write it as you would on the paper bill.</p>
                            </div>
                        </section>

                        <section className="space-y-3">
                            <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Money</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Charged</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-slate-500">৳</span>
                                        <Input className={cn(field, "pl-8 text-lg font-mono")} type="number" inputMode="decimal"
                                            min="0" value={form.amountCharged}
                                            onChange={(e) => set("amountCharged", e.target.value)} placeholder="e.g. 26000" />
                                    </div>
                                    {/*
                                      * No catalogue check. The same 55-inch panel leaves at
                                      * 26,000, 28,000 or 35,000 depending on what else the set
                                      * needed, and a system that cannot hold the real number
                                      * just gets worked around.
                                      */}
                                    <p className="text-[11px] text-slate-400">Whatever you actually charged.</p>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Paid so far</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-slate-500">৳</span>
                                        <Input className={cn(field, "pl-8 text-lg font-mono")} type="number" inputMode="decimal"
                                            min="0" value={form.amountPaid}
                                            onChange={(e) => set("amountPaid", e.target.value)} placeholder="0" />
                                    </div>
                                </div>
                            </div>

                            {/*
                              * Paid above charged is refused by the server, and the screen
                              * used to answer "Fully paid ৳0" and leave the button live — so
                              * the only way to discover the mistake was to press save and
                              * read an error. The screen now says the same thing the server
                              * would.
                              */}
                            <div className={cn(
                                "flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold",
                                overpaid ? "bg-amber-50 text-amber-900"
                                    : due > 0 ? "bg-rose-50 text-rose-800"
                                    : "bg-emerald-50 text-emerald-800",
                            )}>
                                <span>
                                    {overpaid ? "Paid is more than charged — check the figures"
                                        : due > 0 ? "Customer still owes" : "Fully paid"}
                                </span>
                                {!overpaid && <span className="font-mono text-base">{money(due)}</span>}
                            </div>
                        </section>

                        <section className="space-y-3">
                            <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">When and who</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Date of the work</Label>
                                    <Input className={field} type="date" value={form.jobDate}
                                        max={new Date().toISOString().slice(0, 10)}
                                        onChange={(e) => set("jobDate", e.target.value)} />
                                    {/*
                                      * The date is repeated in words because a native date
                                      * input renders in the browser's own locale, and a US
                                      * locale shows 12 July as 07/12/2026 — which reads as 7
                                      * December here. Somebody entering sixty bills would put
                                      * months in the wrong place and never notice. The month
                                      * name cannot be misread.
                                      */}
                                    {form.jobDate && (
                                        <p className="text-[11px] font-semibold text-slate-600">
                                            {new Date(form.jobDate + "T00:00:00").toLocaleDateString("en-GB", {
                                                day: "numeric", month: "long", year: "numeric",
                                            })}
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Warranty months <span className="font-normal text-slate-400">(optional)</span></Label>
                                    <Input className={field} type="number" inputMode="numeric" min="0"
                                        value={form.warrantyMonths}
                                        onChange={(e) => set("warrantyMonths", e.target.value)} placeholder="e.g. 6" />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Technician <span className="font-normal text-slate-400">(optional)</span></Label>
                                    <Input className={field} value={form.technicianName}
                                        onChange={(e) => set("technicianName", e.target.value)} />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Note <span className="font-normal text-slate-400">(optional)</span></Label>
                                <Input className={field} value={form.note}
                                    onChange={(e) => set("note", e.target.value)}
                                    placeholder="e.g. from the paper bill dated 12 July" />
                            </div>
                        </section>

                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <Button variant="ghost" className="h-12 rounded-xl"
                                onClick={() => setForm({ ...EMPTY })}>Clear</Button>
                            <Button className="h-12 rounded-xl px-8 bg-slate-900 hover:bg-slate-800"
                                disabled={!ready || save.isPending}
                                onClick={() => save.mutate()}>
                                {save.isPending
                                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
                                    : <><Check className="mr-2 h-4 w-4" /> Record this job</>}
                            </Button>
                        </div>
                    </div>
                </BentoCard>
            </motion.div>

            {/*
              * A shortcut nobody can review is a hole, not a shortcut. This list
              * is the review, and it is on the same screen so it cannot be
              * forgotten about.
              */}
            <motion.div variants={itemVariants}>
                <BentoCard className="bg-white" disableHover>
                    <div className="mb-3 flex items-center gap-2">
                        <ScrollText className="h-4 w-4 text-slate-400" />
                        <h3 className="text-sm font-black text-slate-900">Recently entered this way</h3>
                        <span className="text-[11px] text-slate-400">{recent?.count ?? 0}</span>
                    </div>

                    {!recent?.entries.length ? (
                        <p className="py-6 text-center text-sm text-slate-400">Nothing entered yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {recent.entries.map((e) => (
                                <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-bold text-slate-800">{e.customer} · {e.device}</div>
                                        <div className="text-[11px] text-slate-500">
                                            {new Date(e.created_at).toLocaleDateString()} · entered by {e.created_by_name}
                                        </div>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <div className="text-sm font-black text-slate-800">{money(Number(e.estimated_cost || 0))}</div>
                                        {Number(e.catchup_amount_due || 0) > 0 && (
                                            <div className="text-[10px] font-bold text-rose-600">
                                                owes {money(Number(e.catchup_amount_due))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </BentoCard>
            </motion.div>
        </motion.div>
    );
}
