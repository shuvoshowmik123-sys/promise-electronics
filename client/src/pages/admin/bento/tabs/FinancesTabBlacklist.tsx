import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, ShieldCheck, AlertTriangle, Ban, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { paymentBlacklistApi } from "@/lib/api";
import { BentoCard } from "../shared";

/**
 * End-of-day payment blacklist review. Surfaces numbers with repeated rejected
 * payment submissions (rolling 48h) so staff can decide — typo (leave/whitelist)
 * vs abuse (block) — before closing the register. Fully manual: no auto-blocking.
 */
export function BlacklistReview({ getCurrencySymbol }: { getCurrencySymbol: () => string }) {
    const qc = useQueryClient();
    const [newPhone, setNewPhone] = useState("");
    const [newReason, setNewReason] = useState("");

    const { data, isLoading } = useQuery({
        queryKey: ["payment-blacklist-review"],
        queryFn: paymentBlacklistApi.getReview,
    });

    const invalidate = () => qc.invalidateQueries({ queryKey: ["payment-blacklist-review"] });

    const addMutation = useMutation({
        mutationFn: (vars: { phone: string; reason?: string }) => paymentBlacklistApi.add(vars),
        onSuccess: () => { toast.success("Number blacklisted"); setNewPhone(""); setNewReason(""); invalidate(); },
        onError: (e: Error) => toast.error(e.message || "Failed to blacklist"),
    });
    const removeMutation = useMutation({
        mutationFn: (id: string) => paymentBlacklistApi.remove(id),
        onSuccess: () => { toast.success("Whitelisted — removed as if nothing happened"); invalidate(); },
        onError: (e: Error) => toast.error(e.message || "Failed to whitelist"),
    });

    const flagged = data?.flagged || [];
    const blacklisted = data?.blacklisted || [];
    const cur = getCurrencySymbol();

    return (
        <div className="space-y-4">
            <BentoCard className="border border-amber-100 bg-amber-50/60" disableHover>
                <div className="flex items-start gap-3">
                    <ShieldAlert className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-bold text-slate-800">End-of-day review — before you close</h3>
                        <p className="text-sm text-slate-600 mt-0.5">
                            Numbers with repeated rejected payments in the last {data?.windowHours || 48} hours.
                            Match each against your bKash / Nagad app: a <b>typo</b> → leave it (or Whitelist if blocked);
                            real <b>abuse</b> → Block.
                        </p>
                    </div>
                </div>
            </BentoCard>

            {/* Needs review */}
            <BentoCard className="border border-slate-100" disableHover>
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" /> Needs review ({flagged.length})
                </h4>
                {isLoading ? (
                    <div className="py-6 text-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
                ) : flagged.length === 0 ? (
                    <div className="py-8 text-center">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-1" />
                        <p className="text-slate-500 text-sm">Nothing to review — all clear.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {flagged.map((f: any) => (
                            <div key={f.phone} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
                                <div>
                                    <p className="font-mono font-semibold text-slate-800">{f.phone}</p>
                                    <p className="text-xs text-slate-500">
                                        {f.rejections} rejected · last {cur}{Number(f.lastAmount || 0).toLocaleString()} · {f.customerName || "—"}
                                    </p>
                                </div>
                                {f.alreadyBlacklisted ? (
                                    <span className="text-xs font-semibold text-rose-600 flex items-center gap-1"><Ban className="h-3.5 w-3.5" /> Blacklisted</span>
                                ) : (
                                    <Button size="sm" variant="outline" className="border-rose-200 text-rose-600 hover:bg-rose-50"
                                        onClick={() => addMutation.mutate({ phone: f.phone, reason: `Repeated rejected submissions (${f.rejections})` })}
                                        disabled={addMutation.isPending}>
                                        <Ban className="h-4 w-4 mr-1" /> Block
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </BentoCard>

            {/* Current blacklist + manual add */}
            <BentoCard className="border border-slate-100" disableHover>
                <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                    <Ban className="h-4 w-4 text-rose-500" /> Blacklisted numbers ({blacklisted.length})
                </h4>
                <div className="flex flex-col sm:flex-row gap-2 mb-3">
                    <Input placeholder="01XXXXXXXXX" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="sm:w-44 font-mono" />
                    <Input placeholder="Reason (optional)" value={newReason} onChange={(e) => setNewReason(e.target.value)} className="flex-1" />
                    <Button onClick={() => addMutation.mutate({ phone: newPhone, reason: newReason || undefined })}
                        disabled={!newPhone.trim() || addMutation.isPending}>
                        <Ban className="h-4 w-4 mr-1" /> Add
                    </Button>
                </div>
                {blacklisted.length === 0 ? (
                    <p className="text-sm text-slate-400 py-2">No numbers blacklisted.</p>
                ) : (
                    <div className="space-y-2">
                        {blacklisted.map((b: any) => (
                            <div key={b.id} className="flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50/40 p-3">
                                <div>
                                    <p className="font-mono font-semibold text-slate-800">{b.phone}</p>
                                    <p className="text-xs text-slate-500">{b.reason || "No reason"} · by {b.addedByName || "—"}</p>
                                </div>
                                <Button size="sm" variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                    onClick={() => removeMutation.mutate(b.id)} disabled={removeMutation.isPending}>
                                    <ShieldCheck className="h-4 w-4 mr-1" /> Whitelist
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </BentoCard>
        </div>
    );
}
