import { useState, useMemo } from "react";
import { Search, ChevronRight, LogOut, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { label: string; id: string; icon: any; color?: string };
type NavGroup = { title: string; items: NavItem[] };

// soft tinted icon tiles per sidebar colour token
const TONE: Record<string, string> = {
    blue: "bg-blue-100 text-blue-600",
    indigo: "bg-indigo-100 text-indigo-600",
    violet: "bg-violet-100 text-violet-600",
    rose: "bg-rose-100 text-rose-600",
    emerald: "bg-emerald-100 text-emerald-600",
    green: "bg-green-100 text-green-600",
    orange: "bg-orange-100 text-orange-600",
    amber: "bg-amber-100 text-amber-600",
    cyan: "bg-cyan-100 text-cyan-600",
    teal: "bg-teal-100 text-teal-600",
    pink: "bg-pink-100 text-pink-600",
    sky: "bg-sky-100 text-sky-600",
    fuchsia: "bg-fuchsia-100 text-fuchsia-600",
    slate: "bg-slate-100 text-slate-600",
};

// Modules already pinned in the bottom dock — never repeat them in More
const DOCK_IDS = new Set(["jobs", "pos", "shift", "finance"]);

const APP_VERSION = "1.2.4";

export function MobileMoreMenu({
    groups,
    user,
    isOnline,
    onSelect,
    onLogout,
}: {
    groups: NavGroup[];
    user?: { name?: string | null; username?: string | null; role?: string | null; id?: string | null; avatar?: string | null } | null;
    isOnline: boolean;
    onSelect: (id: string) => void;
    onLogout: () => void;
}) {
    const [query, setQuery] = useState("");

    // Drop dock items, then apply search
    const visibleGroups = useMemo(() => {
        const q = query.trim().toLowerCase();
        return groups
            .map((g) => ({
                ...g,
                items: g.items.filter(
                    (it) => !DOCK_IDS.has(it.id) && (q === "" || it.label.toLowerCase().includes(q)),
                ),
            }))
            .filter((g) => g.items.length > 0);
    }, [groups, query]);

    const name = user?.name || user?.username || "Admin User";
    const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

    return (
        <div className="flex flex-col h-full bg-[#f8fafc]">
            {/* Header */}
            <div className="flex-none px-4 pt-4 pb-2 bg-[#f8fafc]">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-black text-slate-900">More</h1>
                    <div className="h-10 w-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-sm overflow-hidden">
                        {user?.avatar ? <img src={user.avatar} alt={name} className="w-full h-full object-cover" /> : initials}
                    </div>
                </div>

                {/* Search */}
                <div className="relative mt-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                        autoFocus={false}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search modules…"
                        className="w-full h-12 pl-10 pr-3 rounded-2xl border border-slate-200 bg-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                    />
                </div>
            </div>

            {/* Scrollable groups */}
            <div data-bottom-sheet-scroll="true" className="flex-1 min-h-0 overflow-y-auto px-4 pb-8 pt-2 space-y-3">
                {visibleGroups.length === 0 ? (
                    <p className="text-center text-sm text-slate-400 py-10">No modules found</p>
                ) : visibleGroups.map((group) => (
                    <div key={group.title}>
                        <p className="px-1 mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">{group.title}</p>
                        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                            {group.items.map((item, i) => {
                                const label = item.id === "service-requests" ? "Service Requests" : item.label;
                                return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => onSelect(item.id)}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-3 py-2.5 text-left active:bg-slate-50 transition-colors",
                                        i !== group.items.length - 1 && "border-b border-slate-100",
                                    )}
                                >
                                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", TONE[item.color || "slate"])}>
                                        <item.icon size={18} strokeWidth={2.2} />
                                    </span>
                                    <span className="flex-1 font-bold text-slate-900">{label}</span>
                                    <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                                </button>
                                );
                            })}
                        </div>
                    </div>
                ))}

                {/* My Account */}
                <button
                    type="button"
                    onClick={() => onSelect("account")}
                    className="w-full h-13 py-3.5 rounded-2xl border border-slate-200 bg-white text-slate-700 font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                >
                    <UserCog className="h-5 w-5" /> My Account
                </button>

                {/* Logout */}
                <button
                    type="button"
                    onClick={onLogout}
                    className="w-full h-13 py-3.5 rounded-2xl border border-rose-200 bg-rose-50/50 text-rose-600 font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                >
                    <LogOut className="h-5 w-5" /> Logout
                </button>
                <p className="text-center text-xs text-slate-400">
                    <span className={cn("inline-block h-2 w-2 rounded-full mr-1.5 align-middle", isOnline ? "bg-emerald-500" : "bg-slate-300")} />
                    System {isOnline ? "Online" : "Offline"} · v{APP_VERSION}
                </p>
            </div>
        </div>
    );
}
