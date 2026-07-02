import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
    MessageSquare, ClipboardList, Heart, Truck, ShoppingCart, Banknote,
    Building2, MessageCircle, ScrollText, Users, Package, ShieldCheck,
    BarChart3, Brain, UserCog, Settings, UserCheck, Bell, Shield,
    ChevronRight, ChevronLeft, Check, X, AlertTriangle, Loader2,
    Copy, Clock, Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { permissionsApi, staffInvitesApi } from "@/lib/api/adminApi";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

const ROLES = ["Driver", "Technician", "Cashier", "Manager"] as const;
const ROLE_PRESET_MAP: Record<string, string> = {
    Driver: "Driver Basic",
    Technician: "Technician Basic",
    Cashier: "Cashier Basic",
    Manager: "Manager Basic",
};
const ROLE_SUMMARIES: Record<string, string> = {
    Driver: "View pickup tasks, check in for attendance, call customers.",
    Technician: "View assigned jobs, report repair outcomes, check service requests.",
    Cashier: "Process POS payments, view inventory and finance.",
    Manager: "Full operations: jobs, service requests, pickups, finance, corporate.",
};

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

// Step 5 = Link (generated after mutation succeeds on step 4)
const STEPS = ["Role", "Work Areas", "Permissions", "Packs", "Risk Review", "Link"] as const;

interface Props { onClose: () => void; onCreated: () => void; }

export function InviteWizard({ onClose, onCreated }: Props) {
    const [step, setStep] = useState(0);
    const [role, setRole] = useState<string>("Driver");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [note, setNote] = useState("");
    const [selectedPerms, setSelectedPerms] = useState<Record<string, boolean>>({});
    const [criticalConfirmed, setCriticalConfirmed] = useState<Record<string, boolean>>({});
    const [expandedModule, setExpandedModule] = useState<string | null>(null);
    const [generatedLink, setGeneratedLink] = useState("");
    const [permsInit, setPermsInit] = useState("");

    const { data: catalog } = useQuery({ queryKey: ["permCatalog"], queryFn: permissionsApi.getCatalog, staleTime: 300000 });

    // Load role preset whenever role changes (only once per role)
    useEffect(() => {
        if (!catalog || permsInit === role) return;
        const keys = catalog.presets[ROLE_PRESET_MAP[role]] || [];
        const init: Record<string, boolean> = {};
        for (const k of keys as string[]) init[k] = true;
        setSelectedPerms(init);
        setCriticalConfirmed({});
        setExpandedModule(null);
        setPermsInit(role);
    }, [catalog, role, permsInit]);

    const togglePerm = (key: string) => {
        setSelectedPerms(s => ({ ...s, [key]: !s[key] }));
        if (criticalConfirmed[key]) setCriticalConfirmed(c => { const n = { ...c }; delete n[key]; return n; });
    };

    const applyPack = (packId: string) => {
        if (!catalog) return;
        const pack = catalog.packs[packId];
        if (!pack) return;
        const n = { ...selectedPerms };
        for (const k of pack.permissions) n[k] = true;
        setSelectedPerms(n);
        toast.success(`Added ${pack.label}`);
    };

    // Enrich module list with enabled count + max risk — same pattern as PermissionDesigner
    const modules = useMemo(() => {
        if (!catalog) return [];
        return catalog.modules.map((m: any) => {
            const meta = MODULE_META[m.id] || { icon: Shield, color: "slate", label: m.id };
            const enabled = m.permissions.filter((p: any) => selectedPerms[p.key]).length;
            const maxRisk = m.permissions.reduce((r: string, p: any) => {
                if (selectedPerms[p.key]) {
                    const order = { low: 0, medium: 1, high: 2, critical: 3 };
                    return (order[p.risk as keyof typeof order] || 0) > (order[r as keyof typeof order] || 0) ? p.risk : r;
                }
                return r;
            }, "low");
            return { ...m, meta, enabled, total: m.permissions.length, maxRisk };
        });
    }, [catalog, selectedPerms]);

    const previewData = useMemo(() => ({
        manualPermissions: Object.keys(selectedPerms).filter(k => selectedPerms[k]),
    }), [selectedPerms]);

    const { data: preview } = useQuery({
        queryKey: ["invitePreview", previewData],
        queryFn: () => permissionsApi.preview(previewData),
        enabled: step >= 4 && Object.keys(selectedPerms).length > 0,
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
            setStep(5);
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
                        {ROLE_SUMMARIES[role] || "Select a role."} Loads the <strong>{ROLE_PRESET_MAP[role]}</strong> preset — you can adjust every permission on the next screens.
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

            // Step 1: Work Areas — module grid showing active/total per module
            case 1: return (
                <div className="space-y-2">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">
                        Toggle Work Areas — <span className="text-blue-500">{selectedCount} permissions active</span>
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {modules.map((m: any) => {
                            const Icon = m.meta.icon;
                            const hasAny = m.enabled > 0;
                            return (
                                <button key={m.id}
                                    onClick={() => setExpandedModule(expandedModule === m.id ? null : m.id)}
                                    className={cn("rounded-xl border p-3 text-left transition-colors",
                                        hasAny ? TONE[m.meta.color] : "border-slate-200 bg-white opacity-60",
                                    )}>
                                    <div className="flex items-center gap-2.5">
                                        <Icon className={cn("h-5 w-5 shrink-0", hasAny ? ICON_TONE[m.meta.color] : "text-slate-400")} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-800 truncate">{m.meta.label}</p>
                                            <p className="text-[10px] text-slate-500">{m.enabled}/{m.total} active</p>
                                        </div>
                                        {hasAny && <Badge className={cn("text-[9px] px-1.5 py-0 shrink-0", RISK_COLORS[m.maxRisk])}>{m.maxRisk}</Badge>}
                                        <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-[10px] text-slate-400 pt-1">Use the Permissions step to add or remove individual actions within each area.</p>
                </div>
            );

            // Step 2: Per-permission checkboxes, grouped by module
            case 2: return (
                <div className="space-y-3">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
                        Permissions by Module — <span className="text-blue-500">{selectedCount} selected</span>
                    </p>
                    {modules.filter((m: any) => m.enabled > 0 || expandedModule === m.id).map((m: any) => {
                        const Icon = m.meta.icon;
                        const isExpanded = expandedModule === m.id;
                        return (
                            <div key={m.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                                <button onClick={() => setExpandedModule(isExpanded ? null : m.id)}
                                    className="w-full flex items-center gap-2.5 p-3 hover:bg-slate-50 transition-colors">
                                    <Icon className={cn("h-4 w-4 shrink-0", ICON_TONE[m.meta.color])} />
                                    <span className="flex-1 text-left text-sm font-bold text-slate-800">{m.meta.label}</span>
                                    <span className="text-xs text-slate-400 shrink-0">{m.enabled}/{m.total}</span>
                                    <ChevronRight className={cn("h-4 w-4 text-slate-300 shrink-0 transition-transform", isExpanded && "rotate-90")} />
                                </button>
                                {isExpanded && (
                                    <div className="border-t border-slate-100 divide-y divide-slate-50">
                                        {m.permissions.map((p: any) => (
                                            <label key={p.key} className="flex items-start gap-3 p-3 cursor-pointer hover:bg-slate-50/50">
                                                <Checkbox checked={!!selectedPerms[p.key]} onCheckedChange={() => togglePerm(p.key)} className="mt-0.5 shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-sm font-semibold text-slate-800">{p.label}</span>
                                                        <Badge className={cn("text-[9px] px-1.5 py-0 shrink-0", RISK_COLORS[p.risk])}>{p.risk}</Badge>
                                                    </div>
                                                    <p className="text-xs text-slate-500 mt-0.5 break-words">{p.description}</p>
                                                    {selectedPerms[p.key] && (p.risk === "high" || p.risk === "critical") && (
                                                        <p className="text-xs text-amber-600 mt-1 flex items-start gap-1">
                                                            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                                                            <span className="break-words">{p.consequence}</span>
                                                        </p>
                                                    )}
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {/* Surface modules with 0 active so user can expand and add permissions */}
                    {modules.filter((m: any) => m.enabled === 0 && expandedModule !== m.id).length > 0 && (
                        <details className="group">
                            <summary className="text-xs text-slate-400 cursor-pointer list-none flex items-center gap-1 py-1 select-none">
                                <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
                                {modules.filter((m: any) => m.enabled === 0).length} inactive modules (click to expand)
                            </summary>
                            <div className="space-y-2 mt-2">
                                {modules.filter((m: any) => m.enabled === 0 && expandedModule !== m.id).map((m: any) => {
                                    const Icon = m.meta.icon;
                                    const isExpanded = expandedModule === m.id;
                                    return (
                                        <div key={m.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden opacity-70">
                                            <button onClick={() => setExpandedModule(isExpanded ? null : m.id)}
                                                className="w-full flex items-center gap-2.5 p-3 hover:bg-slate-50 transition-colors">
                                                <Icon className="h-4 w-4 text-slate-400 shrink-0" />
                                                <span className="flex-1 text-left text-sm font-bold text-slate-500">{m.meta.label}</span>
                                                <span className="text-xs text-slate-400 shrink-0">0/{m.total}</span>
                                                <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </details>
                    )}
                    {selectedCount === 0 && (
                        <p className="text-center text-sm text-slate-400 py-6">No permissions selected. Go back to Role to reload the preset.</p>
                    )}
                </div>
            );

            // Step 3: Permission packs (shortcuts to add groups of permissions)
            case 3: return (
                <div className="space-y-3">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400">Add Permission Packs</p>
                    <p className="text-xs text-slate-500">Packs add permissions — they don't lock anything. You can remove pack permissions in the Permissions step.</p>
                    {catalog && Object.entries(catalog.packs).map(([id, pack]: [string, any]) => {
                        const alreadyHas = pack.permissions.every((k: string) => selectedPerms[k]);
                        return (
                            <div key={id} className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-800">{pack.label}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">{pack.description}</p>
                                        <p className="text-[10px] text-slate-400 mt-1 break-words">Adds: {pack.permissions.join(", ")}</p>
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

            // Step 4: Risk Review + Generate Link button (in footer)
            case 4: return (
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
                    {preview?.consequences.filter((c: any) => c.risk === "high").map((c: any) => (
                        <div key={c.key} className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                            <p className="text-xs font-bold text-orange-800">{c.key}</p>
                            <p className="text-xs text-orange-700">{c.consequence}</p>
                        </div>
                    ))}
                    {criticalPerms.length > 0 ? (
                        <div className="space-y-2">
                            <p className="text-xs font-black uppercase text-rose-500">Critical — Confirm Each</p>
                            {criticalPerms.map((p: any) => (
                                <label key={p.key} className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 cursor-pointer">
                                    <Checkbox checked={!!criticalConfirmed[p.key]}
                                        onCheckedChange={() => setCriticalConfirmed(c => ({ ...c, [p.key]: !c[p.key] }))}
                                        className="mt-0.5 shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-rose-800">{p.label}</p>
                                        <p className="text-xs text-rose-700 break-words">{p.consequence}</p>
                                    </div>
                                </label>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-emerald-600 flex items-center gap-2">
                            <Check className="h-4 w-4 shrink-0" /> No critical permissions. Safe to generate link.
                        </p>
                    )}
                    {preview && <p className="text-xs text-slate-500">{preview.summary}</p>}
                    {!allCriticalConfirmed && criticalPerms.length > 0 && (
                        <div className="flex items-center gap-2 text-xs text-rose-500">
                            <AlertTriangle className="h-4 w-4 shrink-0" /> Confirm all critical permissions above to enable Generate Link.
                        </div>
                    )}
                </div>
            );

            // Step 5: Generated link display
            case 5: return (
                <div className="space-y-4">
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center">
                        <Check className="h-8 w-8 text-emerald-600 mx-auto" />
                        <p className="text-sm font-bold text-emerald-800 mt-2">Setup Link Ready</p>
                        <p className="text-xs text-emerald-600 mt-1">{role} · {selectedCount} permissions</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Input value={generatedLink} readOnly className="font-mono text-xs h-10 rounded-lg" />
                        <Button variant="outline" className="shrink-0 h-10 rounded-lg" onClick={copyLink}>
                            <Copy className="h-4 w-4" />
                        </Button>
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

    const isLinkStep = step === 5;
    const isRiskStep = step === 4;
    const canAdvance = step === 0 ? !!role : true;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4">
            <div className="w-full max-w-2xl max-h-[90vh] rounded-2xl bg-slate-50 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 shrink-0">
                    <div>
                        <p className="text-sm font-black text-slate-900 flex items-center gap-2">
                            <LinkIcon className="h-4 w-4 text-blue-600" /> Create Setup Link
                        </p>
                        <p className="text-[10px] text-slate-400">{STEPS[step]} · Step {step + 1} of {STEPS.length}</p>
                    </div>
                    <button onClick={onClose} className="rounded-full p-1.5 hover:bg-slate-100">
                        <X className="h-4 w-4 text-slate-500" />
                    </button>
                </div>

                {/* Progress bar */}
                <div className="flex gap-1 px-5 pt-3 shrink-0">
                    {STEPS.map((_, i) => (
                        <div key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= step ? "bg-blue-500" : "bg-slate-200")} />
                    ))}
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
                    {renderStep()}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-3 bg-white border-t border-slate-200 shrink-0">
                    {isLinkStep ? (
                        <>
                            <span />
                            <Button size="sm" onClick={onClose} className="rounded-lg h-9 bg-blue-600 hover:bg-blue-700 text-white font-bold">
                                Done
                            </Button>
                        </>
                    ) : (
                        <>
                            <div className="flex gap-2">
                                {step > 0 && (
                                    <Button variant="outline" size="sm" onClick={() => setStep(step - 1)} className="rounded-lg h-9">
                                        <ChevronLeft className="h-4 w-4 mr-1" /> Back
                                    </Button>
                                )}
                                <Button variant="ghost" size="sm" onClick={onClose} className="rounded-lg h-9 text-slate-400">
                                    Cancel
                                </Button>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400">{selectedCount} perms</span>
                                {isRiskStep ? (
                                    <Button size="sm" onClick={() => createMutation.mutate()}
                                        disabled={!allCriticalConfirmed || createMutation.isPending}
                                        className="rounded-lg h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                                        {createMutation.isPending
                                            ? <Loader2 className="h-4 w-4 animate-spin" />
                                            : <><LinkIcon className="h-4 w-4 mr-1" /> Generate Link</>}
                                    </Button>
                                ) : (
                                    <Button size="sm" onClick={() => setStep(step + 1)} disabled={!canAdvance}
                                        className="rounded-lg h-9 bg-blue-600 hover:bg-blue-700 text-white font-bold">
                                        Next <ChevronRight className="h-4 w-4 ml-1" />
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
