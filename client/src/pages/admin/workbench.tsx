import { useState, useMemo, useCallback } from "react";
import { Link } from "wouter";
import { ArrowLeft, ShieldAlert, Search, Zap, ShieldCheck, Layers, Store, Briefcase, Globe, AlertTriangle } from "lucide-react";
import { useModules } from "@/contexts/ModuleContext";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const PORTAL_LABELS: Record<string, string> = {
    admin: "Admin Panel",
    customer: "Customer Portal",
    corporate: "Corporate Portal",
    technician: "Technician Portal",
};

const PORTAL_COLORS: Record<string, string> = {
    admin: "bg-blue-100 text-blue-700",
    customer: "bg-green-100 text-green-700",
    corporate: "bg-purple-100 text-purple-700",
    technician: "bg-orange-100 text-orange-700",
};

// Helper: parse portal scope string into array
function getPortalScopes(portalScope: string | null | undefined): string[] {
    return (portalScope || "admin").split(",").map(s => s.trim()).filter(Boolean);
}

// Helper: get the toggle value for a given portal
function getPortalEnabled(mod: { enabledAdmin: boolean; enabledCustomer: boolean; enabledCorporate: boolean; enabledTechnician: boolean }, portal: string): boolean {
    if (portal === "admin") return mod.enabledAdmin;
    if (portal === "customer") return mod.enabledCustomer;
    if (portal === "corporate") return mod.enabledCorporate;
    if (portal === "technician") return mod.enabledTechnician;
    return false;
}

type OperatingMode = "admin_only" | "retail" | "b2b" | "full_business" | "max_power" | "custom";
const devInfraModules = ["system_health", "ai_brain", "audit_logs"];

function detectActiveMode(modules: any[]): OperatingMode {
    if (!modules || modules.length === 0) return "custom";

    let matchCount = { admin_only: 0, retail: 0, b2b: 0, full_business: 0, max_power: 0 };
    let totalChecks = 0;

    for (const mod of modules) {
        totalChecks++;
        const scopes = getPortalScopes(mod.portalScope);
        const canAdmin = scopes.includes("admin");
        const canCust = scopes.includes("customer");
        const canCorp = scopes.includes("corporate");
        const canTech = scopes.includes("technician");
        const isDev = devInfraModules.includes(mod.id);
        const isCore = mod.isCore;

        const a = mod.enabledAdmin;
        const c = mod.enabledCustomer;
        const p = mod.enabledCorporate;
        const t = mod.enabledTechnician;

        // admin_only
        if (a === (canAdmin || isCore) && c === false && p === false && t === false) matchCount.admin_only++;

        // retail
        if (a === ((canAdmin && !isDev) || isCore) && c === (canCust && !isDev) && p === false && t === false) matchCount.retail++;

        // b2b
        if (a === ((canAdmin && !isDev) || isCore) && c === false && p === (canCorp && !isDev) && t === false) matchCount.b2b++;

        // full_business
        if (a === ((canAdmin && !isDev) || isCore) && c === (canCust && !isDev) && p === (canCorp && !isDev) && t === false) matchCount.full_business++;

        // max_power
        if (a === (canAdmin || isCore) && c === canCust && p === canCorp && t === canTech) matchCount.max_power++;
    }

    if (matchCount.admin_only === totalChecks) return "admin_only";
    if (matchCount.retail === totalChecks) return "retail";
    if (matchCount.b2b === totalChecks) return "b2b";
    if (matchCount.full_business === totalChecks) return "full_business";
    if (matchCount.max_power === totalChecks) return "max_power";

    return "custom";
}

export default function SuperAdminWorkbench() {
    // ALL hooks MUST be called unconditionally at the top — no early returns above this block
    const { user } = useAdminAuth();
    const { modules, isLoading, toggleModule, applyPreset } = useModules();
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [pendingMode, setPendingMode] = useState<OperatingMode | null>(null);

    const activeMode = useMemo(() => detectActiveMode(modules), [modules]);

    const categories = useMemo(() => {
        const cats = new Set(modules.map(m => m.category));
        return Array.from(cats).sort();
    }, [modules]);

    const filteredModules = useMemo(() => {
        return modules
            .filter(m => {
                const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (m.description || "").toLowerCase().includes(searchTerm.toLowerCase());
                const matchesCategory = selectedCategory === "all" || m.category === selectedCategory;
                return matchesSearch && matchesCategory;
            })
            .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    }, [modules, searchTerm, selectedCategory]);

    const enabledCount = useMemo(() => modules.filter(m => m.enabledAdmin).length, [modules]);
    const totalCount = modules.length;

    const handleToggle = useCallback((id: string, portal: string, checked: boolean) => {
        toggleModule(id, portal as "admin" | "customer" | "corporate" | "technician", checked);
    }, [toggleModule]);

    const requestModeChange = useCallback((preset: OperatingMode) => {
        if (activeMode === preset) return; // Mode already active
        setPendingMode(preset);
    }, [activeMode]);

    const confirmModeChange = useCallback(() => {
        if (pendingMode && pendingMode !== "custom") {
            applyPreset(pendingMode);
            setPendingMode(null);
        }
    }, [pendingMode, applyPreset]);

    // === ALL HOOKS CALLED ABOVE THIS LINE — safe to do early returns below ===

    // Security: deny non-Super Admin
    if (user?.role !== "Super Admin") {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6">
                <ShieldAlert size={48} className="text-rose-500 mb-4" />
                <h1 className="text-2xl font-bold text-slate-800 mb-2">Access Denied</h1>
                <p className="text-slate-600 mb-6">Super Admin access required.</p>
                <Link href="/admin"><Button variant="outline">← Back to Dashboard</Button></Link>
            </div>
        );
    }

    // Loading state
    if (isLoading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white">
            {/* Header */}
            <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/admin">
                            <button className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
                                <ArrowLeft size={18} />
                            </button>
                        </Link>
                        <div>
                            <h1 className="text-base font-bold flex items-center gap-2">
                                <Zap size={16} className="text-amber-400" />
                                Module Manager
                            </h1>
                            <p className="text-[11px] text-slate-500">{enabledCount}/{totalCount} modules active in Admin</p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

                {/* Presets (Bento Grid) */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            <Zap size={14} className="text-amber-500" />
                            Operating Mode
                        </h2>
                        {activeMode === "custom" && (
                            <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200/50 animate-in fade-in">
                                <AlertTriangle size={12} />
                                Custom Configuration Active
                            </div>
                        )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
                        {/* 1. Admin Only */}
                        <div
                            onClick={() => requestModeChange("admin_only")}
                            className={`col-span-1 md:col-span-2 group relative overflow-hidden bg-white border hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-1 rounded-xl p-5 cursor-pointer transition-all duration-300 flex flex-col items-start ${activeMode === "admin_only" ? "border-l-4 border-l-blue-500 border-blue-200 bg-blue-50/30" : "border-slate-200"
                                }`}
                        >
                            {activeMode === "admin_only" && (
                                <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider animate-in fade-in zoom-in">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                    </span>
                                    ACTIVE
                                </div>
                            )}
                            <div className="bg-slate-100 group-hover:bg-blue-50 text-slate-500 group-hover:text-blue-600 p-2.5 rounded-lg mb-3 transition-colors ring-1 ring-slate-200 group-hover:ring-blue-200">
                                <ShieldCheck size={20} />
                            </div>
                            <h3 className="font-semibold text-slate-800 mb-1 group-hover:text-blue-600 transition-colors">Admin Only</h3>
                            <p className="text-xs text-slate-500 leading-relaxed mb-4 flex-1">Internal operations only. Core business modules active. All external portals disabled.</p>
                            <div className="flex flex-wrap gap-1.5 mt-auto">
                                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-blue-50 text-blue-700 border-blue-200 uppercase tracking-wider">Admin</Badge>
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-slate-400 border-slate-200 opacity-60 uppercase tracking-wider">Cust</Badge>
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-slate-400 border-slate-200 opacity-60 uppercase tracking-wider">Corp</Badge>
                            </div>
                            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <ArrowLeft size={14} className="text-blue-500 rotate-135" />
                            </div>
                        </div>

                        {/* 2. Retail */}
                        <div
                            onClick={() => requestModeChange("retail")}
                            className={`col-span-1 md:col-span-2 group relative overflow-hidden bg-white border hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-500/10 hover:-translate-y-1 rounded-xl p-5 cursor-pointer transition-all duration-300 flex flex-col items-start ${activeMode === "retail" ? "border-l-4 border-l-emerald-500 border-emerald-200 bg-emerald-50/30" : "border-slate-200"
                                }`}
                        >
                            {activeMode === "retail" && (
                                <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider animate-in fade-in zoom-in">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                    ACTIVE
                                </div>
                            )}
                            <div className="bg-slate-100 group-hover:bg-emerald-50 text-slate-500 group-hover:text-emerald-600 p-2.5 rounded-lg mb-3 transition-colors ring-1 ring-slate-200 group-hover:ring-emerald-200">
                                <Store size={20} />
                            </div>
                            <h3 className="font-semibold text-slate-800 mb-1 group-hover:text-emerald-600 transition-colors">Retail &amp; Walk-in</h3>
                            <p className="text-xs text-slate-500 leading-relaxed mb-4 flex-1">Enables the Admin panel and Customer portal for walk-ins and order tracking.</p>
                            <div className="flex flex-wrap gap-1.5 mt-auto">
                                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-blue-50 text-blue-700 border-blue-200 uppercase tracking-wider">Admin</Badge>
                                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-emerald-50 text-emerald-700 border-emerald-200 uppercase tracking-wider">Cust</Badge>
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-slate-400 border-slate-200 opacity-60 uppercase tracking-wider">Corp</Badge>
                            </div>
                            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <ArrowLeft size={14} className="text-emerald-500 rotate-135" />
                            </div>
                        </div>

                        {/* 3. B2B Mode */}
                        <div
                            onClick={() => requestModeChange("b2b")}
                            className={`col-span-1 md:col-span-2 lg:col-span-2 group relative overflow-hidden bg-white border hover:border-violet-500 hover:shadow-lg hover:shadow-violet-500/10 hover:-translate-y-1 rounded-xl p-5 cursor-pointer transition-all duration-300 flex flex-col items-start ${activeMode === "b2b" ? "border-l-4 border-l-violet-500 border-violet-200 bg-violet-50/30" : "border-slate-200"
                                }`}
                        >
                            {activeMode === "b2b" && (
                                <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider animate-in fade-in zoom-in">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
                                    </span>
                                    ACTIVE
                                </div>
                            )}
                            <div className="bg-slate-100 group-hover:bg-violet-50 text-slate-500 group-hover:text-violet-600 p-2.5 rounded-lg mb-3 transition-colors ring-1 ring-slate-200 group-hover:ring-violet-200">
                                <Briefcase size={20} />
                            </div>
                            <h3 className="font-semibold text-slate-800 mb-1 group-hover:text-violet-600 transition-colors">Corporate B2B</h3>
                            <p className="text-xs text-slate-500 leading-relaxed mb-4 flex-1">Enables Admin and Corporate portals for B2B. Hides retail customer features.</p>
                            <div className="flex flex-wrap gap-1.5 mt-auto">
                                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-blue-50 text-blue-700 border-blue-200 uppercase tracking-wider">Admin</Badge>
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-slate-400 border-slate-200 opacity-60 uppercase tracking-wider">Cust</Badge>
                                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-violet-50 text-violet-700 border-violet-200 uppercase tracking-wider">Corp</Badge>
                            </div>
                            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <ArrowLeft size={14} className="text-violet-500 rotate-135" />
                            </div>
                        </div>

                        {/* 4. Full Business */}
                        <div
                            onClick={() => requestModeChange("full_business")}
                            className={`col-span-1 md:col-span-2 lg:col-span-3 group relative overflow-hidden bg-gradient-to-br from-white to-slate-50 border hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-500/15 hover:-translate-y-1 rounded-xl p-5 cursor-pointer transition-all duration-300 flex flex-col items-start ${activeMode === "full_business" ? "border-l-4 border-l-indigo-500 border-indigo-200 bg-indigo-50/30" : "border-slate-200"
                                }`}
                        >
                            {activeMode === "full_business" && (
                                <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider animate-in fade-in zoom-in">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                                    </span>
                                    ACTIVE
                                </div>
                            )}
                            <div className="bg-slate-100 group-hover:bg-indigo-50 text-slate-600 group-hover:text-indigo-600 p-2.5 rounded-lg mb-3 transition-colors ring-1 ring-slate-200 group-hover:ring-indigo-200">
                                <Globe size={20} />
                            </div>
                            <h3 className="font-semibold text-slate-800 mb-1 group-hover:text-indigo-600 transition-colors">Full Business Mode</h3>
                            <p className="text-xs text-slate-500 leading-relaxed mb-4 flex-1">The standard operational configuration. Both retail customers and corporate B2B clients have functional portal access.</p>
                            <div className="flex flex-wrap gap-1.5 mt-auto">
                                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-blue-50 text-blue-700 border-blue-200 uppercase tracking-wider">Admin</Badge>
                                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-emerald-50 text-emerald-700 border-emerald-200 uppercase tracking-wider">Cust</Badge>
                                <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-violet-50 text-violet-700 border-violet-200 uppercase tracking-wider">Corp</Badge>
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-slate-400 border-slate-200 opacity-60 uppercase tracking-wider">Tech</Badge>
                            </div>
                            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <ArrowLeft size={14} className="text-indigo-500 rotate-135" />
                            </div>
                        </div>

                        {/* 5. Max Power */}
                        <div
                            onClick={() => requestModeChange("max_power")}
                            className={`col-span-1 md:col-span-2 lg:col-span-3 group relative overflow-hidden bg-gradient-to-br border hover:border-amber-500 hover:shadow-xl hover:shadow-amber-500/20 hover:-translate-y-1 rounded-xl p-5 cursor-pointer transition-all duration-300 flex flex-col items-start ${activeMode === "max_power" ? "from-slate-800 to-slate-800 border-l-4 border-l-amber-500 border-amber-500/50" : "from-slate-900 to-slate-800 border-slate-700"
                                }`}
                        >
                            {activeMode === "max_power" && (
                                <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider animate-in fade-in zoom-in border border-amber-500/30">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                    </span>
                                    ACTIVE
                                </div>
                            )}
                            <div className="bg-white/10 group-hover:bg-amber-500/10 text-slate-300 group-hover:text-amber-400 p-2.5 rounded-lg mb-3 transition-colors ring-1 ring-white/10 group-hover:ring-amber-500/30">
                                <Zap size={20} />
                            </div>
                            <h3 className="font-semibold text-white mb-1 group-hover:text-amber-400 transition-colors">Maximum Power</h3>
                            <p className="text-xs text-slate-400 leading-relaxed mb-4 flex-1">Nuclear option. Unlocks all 4 portals (Admin, Cust, Corp, Tech) plus Developer Infrastructure.</p>
                            <div className="flex flex-wrap gap-1.5 mt-auto">
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-blue-500/20 text-blue-300 border-blue-500/30 uppercase tracking-wider">Admin</Badge>
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-emerald-500/20 text-emerald-300 border-emerald-500/30 uppercase tracking-wider">Cust</Badge>
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-violet-500/20 text-violet-300 border-violet-500/30 uppercase tracking-wider">Corp</Badge>
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-orange-500/20 text-orange-300 border-orange-500/30 uppercase tracking-wider">Tech</Badge>
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-rose-500/20 text-rose-300 border-rose-500/30 uppercase tracking-wider">Infra</Badge>
                            </div>
                            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <ArrowLeft size={14} className="text-amber-400 rotate-135" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <Input
                            placeholder="Search modules..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8 h-9 text-sm"
                        />
                    </div>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                        <SelectTrigger className="w-full sm:w-[160px] h-9 text-sm">
                            <SelectValue placeholder="Category" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Categories</SelectItem>
                            {categories.map(c => (
                                <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Module List */}
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
                    {filteredModules.map(mod => {
                        const scopes = getPortalScopes(mod.portalScope);
                        const isSingleScope = scopes.length === 1;

                        return (
                            <div key={mod.id} className="px-4 py-3 sm:px-5 sm:py-4 flex flex-col sm:flex-row gap-3 sm:items-center hover:bg-slate-50/50 transition-colors">
                                {/* Left: Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="font-semibold text-sm text-slate-900">{mod.name}</span>
                                        {mod.isCore && (
                                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 border-amber-200">CORE</Badge>
                                        )}
                                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 capitalize">{mod.category}</Badge>
                                    </div>
                                    <p className="text-xs text-slate-500 truncate">{mod.description}</p>
                                </div>

                                {/* Right: Toggles */}
                                <div className="flex items-center gap-4 shrink-0">
                                    {isSingleScope ? (
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PORTAL_COLORS[scopes[0]] || ""}`}>
                                                {PORTAL_LABELS[scopes[0]] || scopes[0]}
                                            </span>
                                            <Switch
                                                checked={getPortalEnabled(mod, scopes[0])}
                                                disabled={mod.isCore && scopes[0] === "admin"}
                                                onCheckedChange={(checked) => handleToggle(mod.id, scopes[0], checked)}
                                            />
                                        </div>
                                    ) : (
                                        scopes.map(portal => (
                                            <div key={portal} className="flex flex-col items-center gap-1">
                                                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${PORTAL_COLORS[portal] || ""}`}>
                                                    {portal === "technician" ? "Tech" : portal.slice(0, 4)}
                                                </span>
                                                <Switch
                                                    checked={getPortalEnabled(mod, portal)}
                                                    disabled={mod.isCore && portal === "admin"}
                                                    onCheckedChange={(checked) => handleToggle(mod.id, portal, checked)}
                                                />
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {filteredModules.length === 0 && (
                        <div className="py-10 text-center text-sm text-slate-500">
                            No modules found.
                        </div>
                    )}
                </div>

                {/* Footer note */}
                <p className="text-[11px] text-slate-400 text-center">
                    Changes take effect immediately. Core modules cannot be disabled in the Admin Panel.
                </p>
                {/* Confirmation Dialog */}
                <AlertDialog open={!!pendingMode && pendingMode !== "custom"} onOpenChange={(open) => !open && setPendingMode(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2">
                                <AlertTriangle className="text-amber-500" size={18} />
                                Change Operating Mode?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-left space-y-3 mt-2">
                                <p>You are about to switch the system into <strong>{pendingMode === 'admin_only' ? 'Admin Only' : pendingMode === 'retail' ? 'Retail & Walk-in' : pendingMode === 'b2b' ? 'Corporate B2B' : pendingMode === 'full_business' ? 'Full Business Mode' : 'Maximum Power'}</strong> mode.</p>
                                <p>This will immediately change portal access for all users. Portals not included in this mode will be locked out instantly.</p>
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={confirmModeChange} className="bg-amber-600 hover:bg-amber-700 text-white">
                                Confirm Switch
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </main>
        </div>
    );
}
