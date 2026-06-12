import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, ShieldCheck, AlertTriangle, Ban, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { paymentBlacklistApi } from "@/lib/api";
import { BentoCard } from "../shared";

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
        onSuccess: () => { toast.success("Whitelisted - removed from blacklist"); invalidate(); },
        onError: (e: Error) => toast.error(e.message || "Failed to whitelist"),
    });

    const flagged = data?.flagged || [];
    const blacklisted = data?.blacklisted || [];
    const cur = getCurrencySymbol();

    return (
        <div className="space-y-2 pb-[calc(10rem+env(safe-area-inset-bottom))] md:space-y-4 md:pb-0">
            <BentoCard className="scroll-mb-[calc(8rem+env(safe-area-inset-bottom))] rounded-xl border border-amber-100 bg-amber-50/60 p-3 md:rounded-[2rem] md:p-6" disableHover>
                <div className="flex items-start gap-2 md:gap-3">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 md:h-6 md:w-6" />
                    <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold text-slate-800 md:text-base">End-of-day review</h3>
                        <p className="mt-0.5 text-xs text-slate-600 md:text-sm">
                            Rejected send-money numbers from last {data?.windowHours || 48}h.
                            <span className="hidden md:inline"> Check bKash/Nagad, whitelist typos, block abuse.</span>
                        </p>
                    </div>
                </div>
            </BentoCard>

            <BentoCard className="scroll-mb-[calc(8rem+env(safe-area-inset-bottom))] rounded-xl border border-slate-100 p-3 md:rounded-[2rem] md:p-6" disableHover>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800 md:mb-3 md:text-base">
                    <AlertTriangle className="h-4 w-4 text-amber-500" /> Needs review ({flagged.length})
                </h4>
                {isLoading ? (
                    <div className="py-3 text-center text-slate-400 md:py-6"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
                ) : flagged.length === 0 ? (
                    <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 md:block md:bg-transparent md:px-0 md:py-8 md:text-center">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 md:mx-auto md:mb-1 md:h-8 md:w-8" />
                        <p className="text-xs font-semibold text-emerald-700 md:text-sm md:font-normal md:text-slate-500">All clear</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {flagged.map((f: any) => (
                            <div key={f.phone} className="flex scroll-mb-[calc(8rem+env(safe-area-inset-bottom))] items-center justify-between gap-2 rounded-xl border border-slate-100 p-2.5 md:p-3">
                                <div className="min-w-0">
                                    <p className="truncate font-mono text-sm font-semibold text-slate-800">{f.phone}</p>
                                    <p className="truncate text-xs text-slate-500">
                                        {f.rejections} rejected - last {cur}{Number(f.lastAmount || 0).toLocaleString()}
                                    </p>
                                </div>
                                {f.alreadyBlacklisted ? (
                                    <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-rose-600"><Ban className="h-3.5 w-3.5" /> Blacklisted</span>
                                ) : (
                                    <Button size="sm" variant="outline" className="h-8 shrink-0 border-rose-200 px-2 text-rose-600 hover:bg-rose-50"
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

            <BentoCard className="scroll-mb-[calc(8rem+env(safe-area-inset-bottom))] rounded-xl border border-slate-100 p-3 md:rounded-[2rem] md:p-6" disableHover>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800 md:mb-3 md:text-base">
                    <Ban className="h-4 w-4 text-rose-500" /> Blacklisted numbers ({blacklisted.length})
                </h4>
                <div className="mb-2 grid grid-cols-[1fr_auto] gap-2 md:mb-3 md:flex md:flex-row">
                    <Input placeholder="01XXXXXXXXX" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} className="h-9 font-mono md:w-44" />
                    <Button
                        onClick={() => addMutation.mutate({ phone: newPhone, reason: newReason || undefined })}
                        disabled={!newPhone.trim() || addMutation.isPending}
                        className="h-9 px-3"
                    >
                        <Ban className="h-4 w-4 mr-1" /> Add
                    </Button>
                    <Input placeholder="Reason (optional)" value={newReason} onChange={(e) => setNewReason(e.target.value)} className="col-span-2 h-9 flex-1" />
                </div>
                {blacklisted.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 md:bg-transparent md:px-0 md:text-sm md:text-slate-400">No numbers blacklisted.</p>
                ) : (
                    <div className="space-y-2">
                        {blacklisted.map((b: any) => (
                            <div key={b.id} className="flex scroll-mb-[calc(8rem+env(safe-area-inset-bottom))] items-center justify-between gap-2 rounded-xl border border-rose-100 bg-rose-50/40 p-2.5 md:p-3">
                                <div className="min-w-0">
                                    <p className="truncate font-mono text-sm font-semibold text-slate-800">{b.phone}</p>
                                    <p className="truncate text-xs text-slate-500">{b.reason || "No reason"} - by {b.addedByName || "-"}</p>
                                </div>
                                <Button size="sm" variant="outline" className="h-8 shrink-0 border-emerald-200 px-2 text-emerald-700 hover:bg-emerald-50"
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
