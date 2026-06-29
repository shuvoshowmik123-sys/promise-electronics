import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, ChevronRight, ChevronLeft, Check, Loader2, Copy, Clock, AlertTriangle, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { permissionsApi, staffInvitesApi } from "@/lib/api/adminApi";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ROLES = ["Driver", "Technician", "Cashier", "Manager"] as const;
const ROLE_PRESET_MAP: Record<string, string> = { Driver: "Driver Basic", Technician: "Technician Basic", Cashier: "Cashier Basic", Manager: "Manager Basic" };
const ROLE_SUMMARIES: Record<string, string> = {
    Driver: "View pickup tasks, check in for attendance, call customers.",
    Technician: "View assigned jobs, report repair outcomes, check service requests.",
    Cashier: "Process POS payments, view inventory and finance.",
    Manager: "Full operations: jobs, service requests, pickups, finance, corporate.",
};

const RISK_COLORS: Record<string, string> = { low: "bg-emerald-100 text-emerald-700", medium: "bg-amber-100 text-amber-700", high: "bg-orange-100 text-orange-700", critical: "bg-rose-100 text-rose-700" };
const STEPS = ["Role", "Access", "Packs", "Review", "Link"] as const;

interface Props { onClose: () => void; onCreated: () => void; }

export function InviteWizard({ onClose, onCreated }: Props) {
    const [step, setStep] = useState(0);
    const [role, setRole] = useState<string>("Driver");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [note, setNote] = useState("");
    const [selectedPerms, setSelectedPerms] = useState<Record<string, boolean>>({});
    const [criticalConfirmed, setCriticalConfirmed] = useState<Record<string, boolean>>({});
    const [generatedLink, setGeneratedLink] = useState("");
    const [permsInit, setPermsInit] = useState("");

    const { data: catalog } = useQuery({ queryKey: ["permCatalog"], queryFn: permissionsApi.getCatalog, staleTime: 300000 });

    useEffect(() => {
        if (!catalog || permsInit === role) return;
        const presetName = ROLE_PRESET_MAP[role];
        const keys = catalog.presets[presetName] || [];
        const init: Record<string, boolean> = {};
        for (const k of keys as string[]) init[k] = true;
        setSelectedPerms(init);
        setCriticalConfirmed({});
        setPermsInit(role);
    }, [catalog, role, permsInit]);

    const applyPack = (packId: string) => {
        if (!catalog) return;
        const pack = catalog.packs[packId];
        if (!pack) return;
        const n = { ...selectedPerms };
        for (const k of pack.permissions) n[k] = true;
        setSelectedPerms(n);
        toast.success(`Added ${pack.label}`);
    };

    const previewData = useMemo(() => ({ manualPermissions: Object.keys(selectedPerms).filter(k => selectedPerms[k]) }), [selectedPerms]);
    const { data: preview } = useQuery({
        queryKey: ["invitePreview", previewData],
        queryFn: () => permissionsApi.preview(previewData),
        enabled: step >= 3 && Object.keys(selectedPerms).length > 0,
        staleTime: 5000,
    });

    const criticalPerms = useMemo(() => {
        if (!catalog) return [];
        return catalog.catalog.filter((p: any) => p.risk === "critical" && selectedPerms[p.key]);
    }, [catalog, selectedPerms]);

    const allCriticalConfirmed = criticalPerms.every((p: any) => criticalConfirmed[p.key]);

    const createMutation = useMutation({
        mutationFn: () => {
            const permKeys = Object.keys(selectedPerms).filter(k => selectedPerms[k]);
            const permsObj: Record<string, boolean> = {};
            for (const k of permKeys) permsObj[k] = true;
            return staffInvitesApi.create({
                role,
                permissions: JSON.stringify(permsObj),
                phone: phone || undefined,
                email: email || undefined,
                note: note || undefined,
            });
        },
        onSuccess: (data: any) => {
            const url = window.location.origin + data.setupUrl;
            setGeneratedLink(url);
            setStep(4);
            onCreated();
        },
        onError: (e: any) => toast.error(e?.message || "Failed to create link"),
    });

    const copyLink = () => {
        navigator.clipboard.writeText(generatedLink);
        toast.success("Link copied!");
    };

    const selectedCount = Object.values(selectedPerms).filter(Boolean).length;

    const renderStep = () => {
        switch (step) {
            case 0: return (
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase text-slate-500">Role</Label>
                        <Select value={role} onValueChange={(v) => { setRole(v); setPermsInit(""); }}>
                            <SelectTrigger className="h-10 rounded-lg"><SelectValue /></SelectTrigger>
                            <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-700">
                        {ROLE_SUMMARIES[role] || "Select a role."}
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase text-slate-500">Phone (optional)</Label>
                        <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="01XXXXXXXXX" className="h-10 rounded-lg" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase text-slate-500">Email (optional)</Label>
                        <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="staff@example.com" className="h-10 rounded-lg" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-bold uppercase text-slate-500">Note (optional)</Label>
                        <Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. New pickup driver for Mirpur" className="h-10 rounded-lg" />
                    </div>
                </div>
            );

            case 1: return (
                <div className="space-y-3">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400">Access Plan — {ROLE_PRESET_MAP[role]}</p>
                    <p className="text-sm text-slate-600">{selectedCount} permissions from the <strong>{role}</strong> preset. Adjust in the next step if needed.</p>
                    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-1.5 max-h-[300px] overflow-y-auto">
                        {catalog?.modules?.filter((m: any) => m.permissions.some((p: any) => selectedPerms[p.key])).map((m: any) => (
                            <div key={m.id}>
                                <p className="text-xs font-bold text-slate-500">{m.id.replace(/([A-Z])/g, " $1").replace(/^./, (s: string) => s.toUpperCase())}</p>
                                <p className="text-xs text-slate-700">{m.permissions.filter((p: any) => selectedPerms[p.key]).map((p: any) => p.label).join(", ")}</p>
                            </div>
                        ))}
                    </div>
                </div>
            );

            case 2: return (
                <div className="space-y-3">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400">Add Permission Packs</p>
                    {catalog && Object.entries(catalog.packs).map(([id, pack]: [string, any]) => {
                        const alreadyHas = pack.permissions.every((k: string) => selectedPerms[k]);
                        return (
                            <div key={id} className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-800">{pack.label}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">{pack.description}</p>
                                        <p className="text-[10px] text-slate-400 mt-1">Adds: {pack.permissions.join(", ")}</p>
                                    </div>
                                    <Button size="sm" variant={alreadyHas ? "outline" : "default"} disabled={alreadyHas}
                                        onClick={() => applyPack(id)} className="rounded-lg h-8 text-xs shrink-0">
                                        {alreadyHas ? "Added" : "Add"}
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            );

            case 3: return (
                <div className="space-y-4">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400">Risk Review</p>
                    {preview && (
                        <div className="flex gap-2 flex-wrap">
                            {(["low", "medium", "high", "critical"] as const).map(r => (
                                <div key={r} className={cn("rounded-lg px-3 py-1.5 text-xs font-bold", RISK_COLORS[r])}>
                                    {preview.riskSummary[r]} {r}
                                </div>
                            ))}
                        </div>
                    )}
                    {preview?.consequences.filter(c => c.risk === "high").map(c => (
                        <div key={c.key} className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                            <p className="text-xs font-bold text-orange-800">{c.key}</p>
                            <p className="text-xs text-orange-700">{c.consequence}</p>
                        </div>
                    ))}
                    {criticalPerms.length > 0 ? (
                        <div className="space-y-2">
                            <p className="text-xs font-black uppercase text-rose-500">Critical — Confirm</p>
                            {criticalPerms.map((p: any) => (
                                <label key={p.key} className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 cursor-pointer">
                                    <Checkbox checked={!!criticalConfirmed[p.key]}
                                        onCheckedChange={() => setCriticalConfirmed(c => ({ ...c, [p.key]: !c[p.key] }))} className="mt-0.5" />
                                    <div>
                                        <p className="text-xs font-bold text-rose-800">{p.label}</p>
                                        <p className="text-xs text-rose-700">{p.consequence}</p>
                                    </div>
                                </label>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-emerald-600 flex items-center gap-2"><Check className="h-4 w-4" /> No critical permissions. Safe to proceed.</p>
                    )}
                    {preview && <p className="text-xs text-slate-500">{preview.summary}</p>}
                </div>
            );

            case 4: return (
                <div className="space-y-4">
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center">
                        <Check className="h-8 w-8 text-emerald-600 mx-auto" />
                        <p className="text-sm font-bold text-emerald-800 mt-2">Setup Link Ready</p>
                        <p className="text-xs text-emerald-600 mt-1">{role} · {selectedCount} permissions</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Input value={generatedLink} readOnly className="font-mono text-xs h-10 rounded-lg" />
                        <Button variant="outline" className="shrink-0 h-10 rounded-lg" onClick={copyLink}><Copy className="h-4 w-4" /></Button>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-amber-600">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span>Expires in 5 minutes. One-time use. Will not be shown again.</span>
                    </div>
                </div>
            );

            default: return null;
        }
    };

    const canAdvance = step === 0 ? !!role : step === 3 ? allCriticalConfirmed : true;
    const isLinkStep = step === 4;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4">
            <div className="w-full max-w-md max-h-[90vh] rounded-2xl bg-slate-50 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 shrink-0">
                    <div>
                        <p className="text-sm font-black text-slate-900 flex items-center gap-2"><LinkIcon className="h-4 w-4 text-blue-600" /> Create Setup Link</p>
                        <p className="text-[10px] text-slate-400">{STEPS[step]} · Step {step + 1} of {STEPS.length}</p>
                    </div>
                    <button onClick={onClose} className="rounded-full p-1.5 hover:bg-slate-100"><X className="h-4 w-4 text-slate-500" /></button>
                </div>

                <div className="flex gap-1 px-5 pt-3 shrink-0">
                    {STEPS.map((_, i) => (
                        <div key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= step ? "bg-blue-500" : "bg-slate-200")} />
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
                    {renderStep()}
                </div>

                <div className="flex items-center justify-between px-5 py-3 bg-white border-t border-slate-200 shrink-0">
                    {isLinkStep ? (
                        <>
                            <span />
                            <Button size="sm" onClick={onClose} className="rounded-lg h-9 bg-blue-600 hover:bg-blue-700 text-white font-bold">Done</Button>
                        </>
                    ) : (
                        <>
                            <div className="flex gap-2">
                                {step > 0 && <Button variant="outline" size="sm" onClick={() => setStep(step - 1)} className="rounded-lg h-9"><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>}
                                <Button variant="ghost" size="sm" onClick={onClose} className="rounded-lg h-9 text-slate-400">Cancel</Button>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400">{selectedCount} perms</span>
                                {step < 3 ? (
                                    <Button size="sm" onClick={() => setStep(step + 1)} disabled={!canAdvance} className="rounded-lg h-9 bg-blue-600 hover:bg-blue-700 text-white font-bold">
                                        Next <ChevronRight className="h-4 w-4 ml-1" />
                                    </Button>
                                ) : (
                                    <Button size="sm" onClick={() => createMutation.mutate()} disabled={!canAdvance || createMutation.isPending}
                                        className="rounded-lg h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                                        {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><LinkIcon className="h-4 w-4 mr-1" /> Generate Link</>}
                                    </Button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}
