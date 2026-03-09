import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import {
    Shield, Activity, Search, ArrowRight, Clock, AlertTriangle,
    Filter, User, FileText, Trash2, Edit, LogIn, RefreshCw, ChevronDown
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BentoCard, DashboardSkeleton } from "../shared";
import { auditLogsApi } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Action helpers ─────────────────────────────────────────────────────────────
const ACTION_MAP: Record<string, { color: string; icon: React.ReactNode }> = {
    CREATE: { color: "bg-emerald-50 text-emerald-700 border-emerald-100", icon: <FileText className="w-3 h-3" /> },
    UPDATE: { color: "bg-blue-50 text-blue-700 border-blue-100", icon: <Edit className="w-3 h-3" /> },
    CHANGE: { color: "bg-blue-50 text-blue-700 border-blue-100", icon: <Edit className="w-3 h-3" /> },
    DELETE: { color: "bg-rose-50 text-rose-700 border-rose-100", icon: <Trash2 className="w-3 h-3" /> },
    LOGIN: { color: "bg-indigo-50 text-indigo-700 border-indigo-100", icon: <LogIn className="w-3 h-3" /> },
    LOGOUT: { color: "bg-slate-100 text-slate-600 border-slate-200", icon: <LogIn className="w-3 h-3 rotate-180" /> },
    ACTION: { color: "bg-amber-50 text-amber-700 border-amber-100", icon: <Activity className="w-3 h-3" /> },
    VIEW: { color: "bg-purple-50 text-purple-700 border-purple-100", icon: <ArrowRight className="w-3 h-3" /> },
};

const SEVERITY_DOT: Record<string, string> = {
    info: "bg-slate-400",
    warning: "bg-amber-400",
    critical: "bg-rose-500",
};

function getActionStyle(action: string) {
    for (const [key, val] of Object.entries(ACTION_MAP)) {
        if (action?.toUpperCase().includes(key)) return val;
    }
    return { color: "bg-slate-100 text-slate-600 border-slate-200", icon: <Activity className="w-3 h-3" /> };
}

// ── Stat cards ─────────────────────────────────────────────────────────────────
function StatCard({ title, value, subtitle, icon, gradient }: {
    title: string; value: number | string; subtitle: string;
    icon: React.ReactNode; gradient: string;
}) {
    return (
        <div className={cn("rounded-3xl p-6 text-white flex flex-col gap-3 shadow-lg", gradient)}>
            <div className="flex items-start justify-between">
                <div className="p-2.5 rounded-2xl bg-white/20 backdrop-blur-sm">
                    {icon}
                </div>
                <div className="w-2 h-2 rounded-full bg-white/50 animate-pulse mt-1" />
            </div>
            <div>
                <p className="text-white/70 text-xs font-semibold uppercase tracking-wider">{title}</p>
                <p className="text-3xl font-black mt-1 leading-none">{value}</p>
                <p className="text-white/60 text-xs mt-1">{subtitle}</p>
            </div>
        </div>
    );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function AuditLogsTab() {
    const [searchTerm, setSearchTerm] = useState("");
    const [actionFilter, setActionFilter] = useState("all");
    const [severityFilter, setSeverityFilter] = useState("all");
    const [expandedId, setExpandedId] = useState<string | null>(null);

    // Default to last 7 days
    const [startDate, setStartDate] = useState<string>(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

    const { data: logs = [], isLoading } = useQuery({
        queryKey: ["admin-audit-logs", startDate, endDate],
        queryFn: () => auditLogsApi.getAll({
            limit: 1000,
            startDate: startDate ? new Date(startDate).toISOString() : undefined,
            // Add 1 day to end date to ensure it covers the entire day up to 23:59:59
            endDate: endDate ? new Date(new Date(endDate).getTime() + 86400000).toISOString() : undefined
        }),
        staleTime: 30_000,
    });

    const filteredLogs = useMemo(() => {
        const term = searchTerm.toLowerCase();
        return logs.filter(log => {
            const matchSearch = !term || (
                (log.actorName || log.userId || "").toLowerCase().includes(term) ||
                (log.action || "").toLowerCase().includes(term) ||
                (log.entity || "").toLowerCase().includes(term) ||
                (log.details || "").toLowerCase().includes(term)
            );
            const matchAction = actionFilter === "all" || (log.action || "").toUpperCase().includes(actionFilter.toUpperCase());
            const matchSeverity = severityFilter === "all" || (log.severity || "info") === severityFilter;
            return matchSearch && matchAction && matchSeverity;
        });
    }, [logs, searchTerm, actionFilter, severityFilter]);

    const criticalCount = useMemo(() => logs.filter(l => l.severity === "critical").length, [logs]);
    const todayCount = useMemo(() => {
        const today = new Date().toDateString();
        return logs.filter(l => new Date(l.createdAt).toDateString() === today).length;
    }, [logs]);

    if (isLoading) return <DashboardSkeleton />;

    return (
        <div className="space-y-6 pb-24 md:pb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* ── KPI Header Cards (fixed: use lg:grid-cols-3 proper layout) ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <StatCard
                    title="Total Events Logged"
                    value={logs.length.toLocaleString()}
                    subtitle={`${todayCount} events today`}
                    icon={<Shield className="w-5 h-5 text-white" />}
                    gradient="bg-gradient-to-br from-slate-700 to-slate-900"
                />
                <StatCard
                    title="Currently Viewing"
                    value={filteredLogs.length.toLocaleString()}
                    subtitle="matches your active filters"
                    icon={<Activity className="w-5 h-5 text-white" />}
                    gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
                />
                <StatCard
                    title="Critical Alerts"
                    value={criticalCount}
                    subtitle="require attention"
                    icon={<AlertTriangle className="w-5 h-5 text-white" />}
                    gradient={criticalCount > 0
                        ? "bg-gradient-to-br from-rose-500 to-red-600"
                        : "bg-gradient-to-br from-emerald-500 to-teal-600"}
                />
            </div>

            {/* ── Log Table ── */}
            <BentoCard variant="glass" disableHover className="border-slate-200 p-0 overflow-hidden">
                {/* Table header + filters */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 border-b border-slate-100">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 tracking-tight">System Event Ledger</h3>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Immutable, chronological record of all system modifications.
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                        {/* Search */}
                        <div className="relative flex-1 md:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder="Search actor, action, entity…"
                                className="pl-9 h-9 bg-slate-50 border-slate-200 rounded-xl text-sm"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {/* Action filter */}
                        <Select value={actionFilter} onValueChange={setActionFilter}>
                            <SelectTrigger className="h-9 w-32 rounded-xl border-slate-200 bg-slate-50 text-sm">
                                <Filter className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                                <SelectValue placeholder="Action" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All actions</SelectItem>
                                <SelectItem value="CREATE">Create</SelectItem>
                                <SelectItem value="UPDATE">Update</SelectItem>
                                <SelectItem value="DELETE">Delete</SelectItem>
                                <SelectItem value="LOGIN">Login</SelectItem>
                                <SelectItem value="ACTION">Action</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Severity filter */}
                        <Select value={severityFilter} onValueChange={setSeverityFilter}>
                            <SelectTrigger className="h-9 w-32 rounded-xl border-slate-200 bg-slate-50 text-sm shrink-0">
                                <AlertTriangle className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                                <SelectValue placeholder="Severity" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All levels</SelectItem>
                                <SelectItem value="info">Info</SelectItem>
                                <SelectItem value="warning">Warning</SelectItem>
                                <SelectItem value="critical">Critical</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Date Range */}
                        <div className="flex items-center gap-2 shrink-0">
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="h-9 w-36 bg-slate-50 border-slate-200 rounded-xl text-sm"
                            />
                            <span className="text-slate-400 text-sm">to</span>
                            <Input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="h-9 w-36 bg-slate-50 border-slate-200 rounded-xl text-sm"
                            />
                        </div>

                        {/* Refresh */}
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-9 rounded-xl border-slate-200 text-slate-600"
                            onClick={() => window.location.reload()}
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </div>

                {/* Log rows — scrollable list */}
                <div className="overflow-y-auto max-h-[600px] bg-white">
                    {filteredLogs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                            <Shield className="w-10 h-10 mb-3 opacity-30" />
                            <p className="font-semibold text-slate-600">No events match your filters</p>
                            <p className="text-sm mt-1">Try adjusting your search or date range.</p>
                        </div>
                    ) : (
                        (() => {
                            // Group logs by date
                            const groupedLogs: Record<string, typeof filteredLogs> = {};
                            filteredLogs.forEach(log => {
                                const dateStr = format(new Date(log.createdAt), "MMMM d, yyyy");
                                if (!groupedLogs[dateStr]) groupedLogs[dateStr] = [];
                                groupedLogs[dateStr].push(log);
                            });

                            return Object.entries(groupedLogs).map(([dateLabel, logsForDate]) => (
                                <div key={dateLabel} className="mb-4">
                                    {/* Date Header */}
                                    <div className="sticky top-0 z-10 bg-slate-100/80 backdrop-blur-md px-5 py-2 border-y border-slate-200 shadow-sm flex items-center gap-2 text-sm font-semibold text-slate-700">
                                        <Clock className="w-4 h-4 text-slate-500" />
                                        {dateLabel}
                                        <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full text-xs ml-auto">
                                            {logsForDate.length} events
                                        </span>
                                    </div>

                                    <div className="divide-y divide-slate-50">
                                        {logsForDate.map(log => {
                                            const { color, icon } = getActionStyle(log.action);
                                            const isExpanded = expandedId === log.id;
                                            const hasChanges = log.changes && (
                                                typeof log.changes === 'object' && (log.changes as any)?.old !== undefined
                                            );

                                            return (
                                                <div
                                                    key={log.id}
                                                    className={cn(
                                                        "group px-5 py-3.5 hover:bg-slate-50/70 transition-colors cursor-pointer",
                                                        isExpanded && "bg-slate-50"
                                                    )}
                                                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                                                >
                                                    {/* Main row */}
                                                    <div className="flex flex-wrap items-start gap-3 md:gap-4 md:flex-nowrap">
                                                        {/* Severity dot + timestamp (time only since grouped by date) */}
                                                        <div className="flex items-center gap-2 shrink-0 md:w-32">
                                                            <div className={cn("w-2 h-2 rounded-full shrink-0 mt-1", SEVERITY_DOT[log.severity || 'info'])} />
                                                            <div className="text-slate-500 text-xs">
                                                                <div className="font-medium text-slate-700">
                                                                    {format(new Date(log.createdAt), "h:mm:ss a")}
                                                                </div>
                                                                <div className="text-slate-400 text-[10px]">
                                                                    {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Actor */}
                                                        <div className="shrink-0 md:w-36">
                                                            <div className="flex items-center gap-1.5 bg-slate-100 text-slate-700 font-semibold text-xs px-2.5 py-1 rounded-lg inline-flex max-w-[140px]">
                                                                <User className="w-3 h-3 text-slate-400 shrink-0" />
                                                                <span className="truncate" title={log.actorName || log.userId}>
                                                                    {log.actorName || log.userId || "System"}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Action badge */}
                                                        <div className="shrink-0 md:w-48">
                                                            <div className={cn(
                                                                "text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5 border",
                                                                color
                                                            )}>
                                                                {icon}
                                                                {log.action}
                                                            </div>
                                                        </div>

                                                        {/* Resource + details */}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-slate-800 font-semibold text-sm">{log.entity}</span>
                                                                {log.entityId && (
                                                                    <span className="text-slate-400 text-[10px] font-mono truncate max-w-[120px]">{log.entityId}</span>
                                                                )}
                                                            </div>
                                                            {log.details && (
                                                                <p className="text-slate-500 text-xs mt-0.5 truncate">{log.details}</p>
                                                            )}
                                                        </div>

                                                        {/* Expand toggle */}
                                                        {(hasChanges || log.metadata) && (
                                                            <div className="shrink-0">
                                                                <ChevronDown className={cn(
                                                                    "w-4 h-4 text-slate-400 transition-transform duration-200",
                                                                    isExpanded && "rotate-180"
                                                                )} />
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Expanded changes */}
                                                    {isExpanded && hasChanges && (
                                                        <div className="mt-3 ml-4 bg-white border border-slate-200 rounded-xl p-4 text-xs font-mono text-slate-600 space-y-2 overflow-x-auto">
                                                            {(log.changes as any)?.old && (
                                                                <div>
                                                                    <p className="text-rose-500 font-sans font-bold text-[10px] uppercase tracking-widest mb-1">Before</p>
                                                                    <pre className="text-slate-600 text-[11px] overflow-y-auto max-h-32">
                                                                        {JSON.stringify((log.changes as any).old, null, 2)}
                                                                    </pre>
                                                                </div>
                                                            )}
                                                            {(log.changes as any)?.new && (
                                                                <div>
                                                                    <p className="text-emerald-600 font-sans font-bold text-[10px] uppercase tracking-widest mb-1">After</p>
                                                                    <pre className="text-slate-600 text-[11px] overflow-y-auto max-h-32">
                                                                        {JSON.stringify((log.changes as any).new, null, 2)}
                                                                    </pre>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ));
                        })()
                    )}
                </div>

                {filteredLogs.length > 0 && (
                    <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 text-xs text-slate-400 flex items-center justify-between">
                        <span>Showing <span className="font-semibold text-slate-600">{filteredLogs.length}</span> of <span className="font-semibold text-slate-600">{logs.length}</span> events</span>
                        <span className="font-mono">ledger is immutable · read-only view</span>
                    </div>
                )}
            </BentoCard>
        </div>
    );
}
