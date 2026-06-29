import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
    MessageSquare, ClipboardList, Heart, Truck, ShoppingCart, Banknote,
    Building2, MessageCircle, ScrollText, Users, Package, ShieldCheck,
    BarChart3, Brain, UserCog, Settings, UserCheck, Bell,
    ChevronRight, ChevronLeft, Check, X, AlertTriangle, Loader2, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { permissionsApi, type PermissionProfileResponse, type PreviewResponse } from "@/lib/api/adminApi";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const MODULE_META: Record<string, { icon: LucideIcon; color: string; label: string }> = {
    dashboard: { icon: BarChart3, color: "blue", label: "Dashboard" },
    serviceRequests: { icon: MessageSquare, color: "blue", label: "Service Requests" },
    jobs: { icon: ClipboardList, color: "indigo", label: "Jobs" },
    repairJourney: { icon: Heart, color: "violet", label: "Repair Journeys" },
    pickup: { icon: Truck, color: "sky", label: "Pickup & Delivery" },
    pos: { icon: ShoppingCart, color: "emerald", label: "POS / Billing" },
    finance: { icon: Banknote, color: "emerald", label: "Finance" },
    corporate: { icon: Building2, color: "teal", label: "Corporate Clients" },
    corporateMessages: { icon: MessageCircle, color: "cyan", label: "Corporate Messages" },
    challans: { icon: ScrollText, color: "amber", label: "Challans" },
    customers: { icon: Users, color: "amber", label: "Customers" },
    inventory: { icon: Package, color: "orange", label: "Inventory" },
    warranty: { icon: ShieldCheck, color: "rose", label: "Warranty" },
    reports: { icon: BarChart3, color: "slate", label: "Reports" },
    analytics: { icon: BarChart3, color: "slate", label: "Analytics" },
    aiBrain: { icon: Brain, color: "fuchsia", label: "AI Brain" },
    users: { icon: UserCog, color: "pink", label: "Staff / Users" },
    settings: { icon: Settings, color: "slate", label: "System Settings" },
    attendance: { icon: UserCheck, color: "green", label: "Attendance" },
    notifications: { icon: Bell, color: "sky", label: "Notifications" },
};

const RISK_COLORS: Record<string, string> = {
    low: "bg-emerald-100 text-emerald-700",
    medium: "bg-amber-100 text-amber-700",
    high: "bg-orange-100 text-orange-700",
    critical: "bg-rose-100 text-rose-700",
};

const TONE: Record<string, string> = {
    blue: "border-blue-200 bg-blue-50", indigo: "border-indigo-200 bg-indigo-50",
    violet: "border-violet-200 bg-violet-50", sky: "border-sky-200 bg-sky-50",
    emerald: "border-emerald-200 bg-emerald-50", teal: "border-teal-200 bg-teal-50",
    cyan: "border-cyan-200 bg-cyan-50", amber: "border-amber-200 bg-amber-50",
    orange: "border-orange-200 bg-orange-50", rose: "border-rose-200 bg-rose-50",
    slate: "border-slate-200 bg-slate-50", fuchsia: "border-fuchsia-200 bg-fuchsia-50",
    pink: "border-pink-200 bg-pink-50", green: "border-green-200 bg-green-50",
};

const ICON_TONE: Record<string, string> = {
    blue: "text-blue-600", indigo: "text-indigo-600", violet: "text-violet-600",
    sky: "text-sky-600", emerald: "text-emerald-600", teal: "text-teal-600",
    cyan: "text-cyan-600", amber: "text-amber-600", orange: "text-orange-600",
    rose: "text-rose-600", slate: "text-slate-600", fuchsia: "text-fuchsia-600",
    pink: "text-pink-600", green: "text-green-600",
};

const STEPS = ["Profile", "Work Areas", "Actions", "Packs", "Risk Review", "Save"] as const;

interface Props {
    userId: string;
    userName: string;
    userRole: string;
    onClose: () => void;
    onSaved: () => void;
}

export function PermissionDesigner({ userId, userName, userRole, onClose, onSaved }: Props) {
    const [step, setStep] = useState(0);
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [criticalConfirmed, setCriticalConfirmed] = useState<Record<string, boolean>>({});
    const [expandedModule, setExpandedModule] = useState<string | null>(null);

    const { data: catalog } = useQuery({ queryKey: ["permCatalog"], queryFn: permissionsApi.getCatalog, staleTime: 300000 });
    const { data: profile, isLoading: profileLoading } = useQuery({ queryKey: ["permProfile", userId], queryFn: () => permissionsApi.getUserProfile(userId) });

    useEffect(() => {
        if (profile) {
            const init: Record<string, boolean> = {};
            for (const k of profile.effectiveGranular) init[k] = true;
            setSelected(init);
        }
    }, [profile]);

    const previewData = useMemo(() => {
        const keys = Object.keys(selected).filter(k => selected[k]);
        return { manualPermissions: keys };
    }, [selected]);

    const { data: preview } = useQuery({
        queryKey: ["permPreview", previewData],
        queryFn: () => permissionsApi.preview(previewData),
        enabled: step >= 4 && Object.keys(selected).length > 0,
        staleTime: 5000,
    });

    const saveMutation = useMutation({
        mutationFn: () => permissionsApi.saveUserProfile(userId, selected),
        onSuccess: () => { toast.success("Access saved"); onSaved(); onClose(); },
        onError: (e: any) => toast.error(e?.message || "Failed to save"),
    });

    const modules = useMemo(() => {
        if (!catalog) return [];
        return catalog.modules.map((m: any) => {
            const meta = MODULE_META[m.id] || { icon: Shield, color: "slate", label: m.id };
            const enabled = m.permissions.filter((p: any) => selected[p.key]).length;
            const maxRisk = m.permissions.reduce((r: string, p: any) => {
                if (selected[p.key]) {
                    const order = { low: 0, medium: 1, high: 2, critical: 3 };
                    return (order[p.risk as keyof typeof order] || 0) > (order[r as keyof typeof order] || 0) ? p.risk : r;
                }
                return r;
            }, "low");
            return { ...m, meta, enabled, total: m.permissions.length, maxRisk };
        });
    }, [catalog, selected]);

    const applyPreset = (presetName: string) => {
        if (!catalog) return;
        const keys = catalog.presets[presetName];
        if (!keys) return;
        const n: Record<string, boolean> = {};
        for (const k of keys) n[k] = true;
        setSelected(n);
        setCriticalConfirmed({});
        toast.success(`Applied ${presetName} preset`);
    };

    const applyPack = (packId: string) => {
        if (!catalog) return;
        const pack = catalog.packs[packId];
        if (!pack) return;
        const n = { ...selected };
        for (const k of pack.permissions) n[k] = true;
        setSelected(n);
        toast.success(`Added ${pack.label}`);
    };

    const togglePerm = (key: string) => {
        setSelected(s => ({ ...s, [key]: !s[key] }));
        if (criticalConfirmed[key]) setCriticalConfirmed(c => { const n = { ...c }; delete n[key]; return n; });
    };

    const criticalPerms = useMemo(() => {
        if (!catalog) return [];
        return catalog.catalog.filter((p: any) => p.risk === "critical" && selected[p.key]);
    }, [catalog, selected]);

    const allCriticalConfirmed = criticalPerms.every((p: any) => criticalConfirmed[p.key]);
    const canSave = allCriticalConfirmed && !saveMutation.isPending;

    const selectedCount = Object.values(selected).filter(Boolean).length;

    if (profileLoading || !catalog) {
        return createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="bg-white rounded-2xl p-8"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>
            </div>,
            document.body,
        );
    }

    const renderStep = () => {
        switch (step) {
            case 0: return (
                <div className="space-y-5">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">Staff Member</p>
                        <p className="text-lg font-black text-slate-900">{userName}</p>
                        <p className="text-sm text-slate-500">Role: {userRole} · {selectedCount} permissions active</p>
                        {profile?.suggestedPreset && <p className="text-xs text-blue-600 mt-1">Matches: {profile.suggestedPreset}</p>}
                        {(profile?.deprecatedPresent?.length || 0) > 0 && (
                            <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" /> Has {profile!.deprecatedPresent.length} deprecated broad permissions</p>
                        )}
                    </div>
                    <div>
                        <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">Quick Start — Apply Preset</p>
                        <div className="grid grid-cols-2 gap-2">
                            {Object.entries(catalog.presets).filter(([k]) => k !== "Super Admin").map(([name, keys]) => (
                                <button key={name} onClick={() => applyPreset(name)}
                                    className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-blue-300 hover:bg-blue-50/50 transition-colors">
                                    <p className="text-sm font-bold text-slate-800">{name}</p>
                                    <p className="text-xs text-slate-400">{(keys as string[]).length} permissions</p>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            );

            case 1: return (
                <div className="space-y-2">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">Toggle Work Areas</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {modules.map((m: any) => {
                            const Icon = m.meta.icon;
                            const hasAny = m.enabled > 0;
                            return (
                                <button key={m.id} onClick={() => setExpandedModule(expandedModule === m.id ? null : m.id)}
                                    className={cn("rounded-xl border p-3 text-left transition-colors",
                                        hasAny ? TONE[m.meta.color] : "border-slate-200 bg-white opacity-60")}>
                                    <div className="flex items-center gap-2.5">
                                        <Icon className={cn("h-5 w-5", hasAny ? ICON_TONE[m.meta.color] : "text-slate-400")} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-800 truncate">{m.meta.label}</p>
                                            <p className="text-[10px] text-slate-500">{m.enabled}/{m.total} active</p>
                                        </div>
                                        {hasAny && <Badge className={cn("text-[9px] px-1.5 py-0", RISK_COLORS[m.maxRisk])}>{m.maxRisk}</Badge>}
                                        <ChevronRight className="h-4 w-4 text-slate-300" />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            );

            case 2: return (
                <div className="space-y-3">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">Permissions by Module</p>
                    {modules.filter((m: any) => m.enabled > 0 || expandedModule === m.id).map((m: any) => {
                        const Icon = m.meta.icon;
                        const isExpanded = expandedModule === m.id;
                        return (
                            <div key={m.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                                <button onClick={() => setExpandedModule(isExpanded ? null : m.id)}
                                    className="w-full flex items-center gap-2.5 p-3 hover:bg-slate-50 transition-colors">
                                    <Icon className={cn("h-4 w-4", ICON_TONE[m.meta.color])} />
                                    <span className="flex-1 text-left text-sm font-bold text-slate-800">{m.meta.label}</span>
                                    <span className="text-xs text-slate-400">{m.enabled}/{m.total}</span>
                                    <ChevronRight className={cn("h-4 w-4 text-slate-300 transition-transform", isExpanded && "rotate-90")} />
                                </button>
                                {isExpanded && (
                                    <div className="border-t border-slate-100 divide-y divide-slate-50">
                                        {m.permissions.map((p: any) => (
                                            <label key={p.key} className="flex items-start gap-3 p-3 cursor-pointer hover:bg-slate-50/50">
                                                <Checkbox checked={!!selected[p.key]} onCheckedChange={() => togglePerm(p.key)} className="mt-0.5" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-semibold text-slate-800">{p.label}</span>
                                                        <Badge className={cn("text-[9px] px-1.5 py-0", RISK_COLORS[p.risk])}>{p.risk}</Badge>
                                                    </div>
                                                    <p className="text-xs text-slate-500 mt-0.5">{p.description}</p>
                                                    {selected[p.key] && (p.risk === "high" || p.risk === "critical") && (
                                                        <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" /> {p.consequence}</p>
                                                    )}
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {modules.filter((m: any) => m.enabled > 0).length === 0 && (
                        <p className="text-center text-sm text-slate-400 py-8">No modules enabled. Go back to Work Areas or apply a preset.</p>
                    )}
                </div>
            );

            case 3: return (
                <div className="space-y-3">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">Permission Packs</p>
                    {Object.entries(catalog.packs).map(([id, pack]: [string, any]) => {
                        const alreadyHas = pack.permissions.every((k: string) => selected[k]);
                        return (
                            <div key={id} className="rounded-xl border border-slate-200 bg-white p-4">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">{pack.label}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">{pack.description}</p>
                                        <p className="text-[10px] text-slate-400 mt-1">Adds: {pack.permissions.join(", ")}</p>
                                    </div>
                                    <Button size="sm" variant={alreadyHas ? "outline" : "default"} disabled={alreadyHas}
                                        onClick={() => applyPack(id)} className="rounded-lg h-8 text-xs shrink-0">
                                        {alreadyHas ? "Applied" : "Add Pack"}
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            );

            case 4: return (
                <div className="space-y-4">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">Risk Review</p>
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
                    {criticalPerms.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs font-black uppercase text-rose-500">Critical — Requires Confirmation</p>
                            {criticalPerms.map((p: any) => (
                                <label key={p.key} className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 cursor-pointer">
                                    <Checkbox checked={!!criticalConfirmed[p.key]}
                                        onCheckedChange={() => setCriticalConfirmed(c => ({ ...c, [p.key]: !c[p.key] }))}
                                        className="mt-0.5" />
                                    <div>
                                        <p className="text-xs font-bold text-rose-800">{p.label}</p>
                                        <p className="text-xs text-rose-700">{p.consequence}</p>
                                    </div>
                                </label>
                            ))}
                        </div>
                    )}
                    {criticalPerms.length === 0 && (
                        <p className="text-sm text-emerald-600 flex items-center gap-2"><Check className="h-4 w-4" /> No critical permissions selected.</p>
                    )}
                </div>
            );

            case 5: return (
                <div className="space-y-4">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">Final Summary</p>
                    {preview && <p className="text-sm text-slate-600">{preview.summary}</p>}
                    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 max-h-[300px] overflow-y-auto">
                        {modules.filter((m: any) => m.enabled > 0).map((m: any) => (
                            <div key={m.id}>
                                <p className="text-xs font-bold text-slate-500">{m.meta.label}</p>
                                <p className="text-xs text-slate-700">
                                    {m.permissions.filter((p: any) => selected[p.key]).map((p: any) => p.label).join(", ")}
                                </p>
                            </div>
                        ))}
                    </div>
                    {!allCriticalConfirmed && criticalPerms.length > 0 && (
                        <div className="flex items-center gap-2 text-xs text-rose-500">
                            <AlertTriangle className="h-4 w-4" /> Confirm all critical permissions in Risk Review before saving.
                        </div>
                    )}
                </div>
            );

            default: return null;
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4">
            <div className="w-full max-w-2xl max-h-[90vh] rounded-2xl bg-slate-50 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 shrink-0">
                    <div>
                        <p className="text-sm font-black text-slate-900">Edit Access — {userName}</p>
                        <p className="text-[10px] text-slate-400">{STEPS[step]} · Step {step + 1} of {STEPS.length}</p>
                    </div>
                    <button onClick={onClose} className="rounded-full p-1.5 hover:bg-slate-100"><X className="h-4 w-4 text-slate-500" /></button>
                </div>

                {/* Progress */}
                <div className="flex gap-1 px-5 pt-3 shrink-0">
                    {STEPS.map((_, i) => (
                        <div key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= step ? "bg-blue-500" : "bg-slate-200")} />
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
                    {renderStep()}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-3 bg-white border-t border-slate-200 shrink-0">
                    <div className="flex gap-2">
                        {step > 0 && (
                            <Button variant="outline" size="sm" onClick={() => setStep(step - 1)} className="rounded-lg h-9">
                                <ChevronLeft className="h-4 w-4 mr-1" /> Back
                            </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={onClose} className="rounded-lg h-9 text-slate-400">Cancel</Button>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">{selectedCount} perms</span>
                        {step < STEPS.length - 1 ? (
                            <Button size="sm" onClick={() => setStep(step + 1)} className="rounded-lg h-9 bg-blue-600 hover:bg-blue-700 text-white font-bold">
                                Next <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        ) : (
                            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!canSave}
                                className="rounded-lg h-9 bg-blue-600 hover:bg-blue-700 text-white font-bold">
                                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" /> Save Access</>}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
