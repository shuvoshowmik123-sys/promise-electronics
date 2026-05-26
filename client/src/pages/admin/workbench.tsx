import { useState, useMemo, useCallback } from "react";
import { Link } from "wouter";
import { ArrowLeft, ShieldAlert, Zap, Layers, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { useModules } from "@/contexts/ModuleContext";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

// Lean Mode: the 12 core modules for a 3-4 person daily operation
const LEAN_MODE_IDS = new Set([
    "dashboard", "jobs", "inventory", "pos", "customers",
    "ai_brain", "settings", "notifications", "users",
    "finance_dues", "finance_petty_cash", "finance_drawer",
]);

// Human-readable category names for grouping
const CATEGORY_LABELS: Record<string, string> = {
    system: "Daily Use",
    operations: "Operations",
    finance: "Finance",
    people: "People",
    b2b: "B2B / Corporate",
};

const CATEGORY_ORDER = ["system", "operations", "finance", "people", "b2b"];

export default function SuperAdminWorkbench() {
    const { user } = useAdminAuth();
    const { modules, isLoading, toggleModule } = useModules();
    const [pendingAction, setPendingAction] = useState<"lean" | "full" | null>(null);
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

    const enabledCount = useMemo(() => modules.filter(m => m.enabledAdmin).length, [modules]);
    const isLeanActive = useMemo(() => {
        if (!modules.length) return false;
        return modules.every(m => LEAN_MODE_IDS.has(m.id) ? m.enabledAdmin : !m.enabledAdmin);
    }, [modules]);
    const isFullActive = useMemo(() => modules.every(m => m.enabledAdmin), [modules]);

    const grouped = useMemo(() => {
        const map = new Map<string, typeof modules>();
        for (const cat of CATEGORY_ORDER) map.set(cat, []);
        for (const mod of modules) {
            const cat = mod.category || "system";
            if (!map.has(cat)) map.set(cat, []);
            map.get(cat)!.push(mod);
        }
        // Sort within each group by displayOrder
        map.forEach(mods => mods.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)));
        return map;
    }, [modules]);

    const toggleCategory = useCallback((cat: string) => {
        setCollapsedCategories(prev => {
            const next = new Set(prev);
            next.has(cat) ? next.delete(cat) : next.add(cat);
            return next;
        });
    }, []);

    const applyLeanMode = useCallback(() => {
        for (const mod of modules) {
            const shouldBeOn = LEAN_MODE_IDS.has(mod.id);
            if (mod.enabledAdmin !== shouldBeOn) {
                toggleModule(mod.id, "admin", shouldBeOn);
            }
        }
        setPendingAction(null);
    }, [modules, toggleModule]);

    const applyFullPower = useCallback(() => {
        for (const mod of modules) {
            if (!mod.enabledAdmin) toggleModule(mod.id, "admin", true);
        }
        setPendingAction(null);
    }, [modules, toggleModule]);

    if (user?.role !== "Super Admin") {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6">
                <ShieldAlert size={48} className="text-rose-500 mb-4" />
                <h1 className="text-2xl font-bold text-slate-800 mb-2">Access Denied</h1>
                <p className="text-slate-600 mb-6">Super Admin access required.</p>
                <Link href="/admin"><button className="px-4 py-2 border rounded-lg text-sm">← Back to Dashboard</button></Link>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-600" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
                <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
                    <Link href="/admin">
                        <button className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
                            <ArrowLeft size={18} />
                        </button>
                    </Link>
                    <div className="flex-1">
                        <h1 className="text-base font-bold text-slate-900">Module Manager</h1>
                        <p className="text-xs text-slate-500">{enabledCount} of {modules.length} modules active</p>
                    </div>
                </div>
            </header>

            <main className="max-w-2xl mx-auto px-4 py-5 space-y-5">

                {/* Mode Buttons */}
                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={() => isLeanActive ? null : setPendingAction("lean")}
                        className={`relative flex flex-col items-start p-4 rounded-xl border-2 transition-all min-h-[100px] text-left ${
                            isLeanActive
                                ? "border-emerald-500 bg-emerald-50"
                                : "border-slate-200 bg-white hover:border-emerald-400 active:scale-95"
                        }`}
                    >
                        {isLeanActive && (
                            <span className="absolute top-3 right-3 text-[10px] font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full">ACTIVE</span>
                        )}
                        <div className={`p-2 rounded-lg mb-2 ${isLeanActive ? "bg-emerald-100" : "bg-slate-100"}`}>
                            <Layers size={18} className={isLeanActive ? "text-emerald-600" : "text-slate-500"} />
                        </div>
                        <span className={`font-bold text-sm ${isLeanActive ? "text-emerald-700" : "text-slate-800"}`}>Lean Mode</span>
                        <span className="text-xs text-slate-500 mt-0.5">7 core modules for daily ops</span>
                    </button>

                    <button
                        onClick={() => isFullActive ? null : setPendingAction("full")}
                        className={`relative flex flex-col items-start p-4 rounded-xl border-2 transition-all min-h-[100px] text-left ${
                            isFullActive
                                ? "border-amber-500 bg-amber-50"
                                : "border-slate-200 bg-white hover:border-amber-400 active:scale-95"
                        }`}
                    >
                        {isFullActive && (
                            <span className="absolute top-3 right-3 text-[10px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full">ACTIVE</span>
                        )}
                        <div className={`p-2 rounded-lg mb-2 ${isFullActive ? "bg-amber-100" : "bg-slate-100"}`}>
                            <Zap size={18} className={isFullActive ? "text-amber-600" : "text-slate-500"} />
                        </div>
                        <span className={`font-bold text-sm ${isFullActive ? "text-amber-700" : "text-slate-800"}`}>Full Power</span>
                        <span className="text-xs text-slate-500 mt-0.5">All {modules.length} modules on</span>
                    </button>
                </div>

                {/* Module Groups */}
                {CATEGORY_ORDER.map(cat => {
                    const mods = grouped.get(cat);
                    if (!mods?.length) return null;
                    const collapsed = collapsedCategories.has(cat);
                    const onCount = mods.filter(m => m.enabledAdmin).length;

                    return (
                        <div key={cat} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            {/* Category Header */}
                            <button
                                onClick={() => toggleCategory(cat)}
                                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-sm text-slate-800">{CATEGORY_LABELS[cat] || cat}</span>
                                    <span className="text-xs text-slate-400">{onCount}/{mods.length} on</span>
                                </div>
                                {collapsed ? <ChevronRight size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                            </button>

                            {/* Module Rows */}
                            {!collapsed && (
                                <div className="divide-y divide-slate-100">
                                    {mods.map(mod => (
                                        <div key={mod.id} className="flex items-center gap-3 px-4 py-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-sm font-medium text-slate-900">{mod.name}</span>
                                                    {mod.isCore && (
                                                        <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded uppercase">Core</span>
                                                    )}
                                                </div>
                                                {mod.description && (
                                                    <p className="text-xs text-slate-500 truncate mt-0.5">{mod.description}</p>
                                                )}
                                            </div>
                                            <Switch
                                                checked={mod.enabledAdmin}
                                                disabled={!!mod.isCore}
                                                onCheckedChange={(checked) => toggleModule(mod.id, "admin", checked)}
                                                className="shrink-0 scale-110"
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}

                <p className="text-xs text-slate-400 text-center pb-4">
                    Core modules cannot be disabled. Changes take effect immediately.
                </p>
            </main>

            {/* Lean Mode Confirm */}
            <AlertDialog open={pendingAction === "lean"} onOpenChange={(open) => !open && setPendingAction(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <Layers size={18} className="text-emerald-600" />
                            Switch to Lean Mode?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-left">
                            Enables only the {LEAN_MODE_IDS.size} daily-use modules (Jobs, Inventory, POS, Customers, Brain, Finance basics, Settings). All other modules will be hidden immediately.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={applyLeanMode} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                            Apply Lean Mode
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Full Power Confirm */}
            <AlertDialog open={pendingAction === "full"} onOpenChange={(open) => !open && setPendingAction(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle size={18} className="text-amber-500" />
                            Enable Full Power Mode?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-left">
                            All {modules.length} modules will be turned on. This includes B2B, HR, Payroll, Audit, and all advanced features.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={applyFullPower} className="bg-amber-600 hover:bg-amber-700 text-white">
                            Enable All Modules
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
