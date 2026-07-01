import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
    Clock, Calendar, Truck, Wrench, Users, AlertCircle, User, CheckCircle2,
    PenTool, Plus, MessageSquare, TrendingUp, Award, RefreshCw
} from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { Button } from "@/components/ui/button";
import { BentoCard, DashboardSkeleton, containerVariants, itemVariants } from "../shared";
import { analyticsApi } from "@/lib/api";
import { fetchApi } from "@/lib/api/httpClient";
import { useAdminMobileMode } from "@/hooks/useAdminMobileMode";

const fetchJobOverview = () => fetchApi<any>("/admin/job-overview", { timeoutMs: 120_000 });

function SoftOverviewUnavailable({ onRetry, isRetrying }: { onRetry: () => void; isRetrying: boolean }) {
    return (
        <div className="flex min-h-[260px] items-center justify-center px-4">
            <div className="w-full max-w-md rounded-2xl border border-amber-100 bg-amber-50/70 p-5 text-center shadow-sm">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-amber-600 shadow-sm">
                    <RefreshCw className={`h-5 w-5 ${isRetrying ? "animate-spin" : ""}`} />
                </div>
                <h3 className="text-sm font-black text-slate-900">Overview is reconnecting</h3>
                <p className="mt-1 text-xs font-medium leading-5 text-slate-600">
                    Shop data is taking longer than usual. Your work is safe; try again in a moment.
                </p>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onRetry}
                    disabled={isRetrying}
                    className="mt-4 border-amber-200 bg-white text-amber-700 hover:bg-amber-100"
                >
                    <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`} />
                    {isRetrying ? "Checking..." : "Retry"}
                </Button>
            </div>
        </div>
    );
}

function SoftRefreshNotice({ onRetry, isRetrying }: { onRetry: () => void; isRetrying: boolean }) {
    return (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <span className="font-semibold">Live refresh delayed. Showing the last good overview.</span>
            <button
                type="button"
                onClick={onRetry}
                disabled={isRetrying}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-2 py-1 font-black text-amber-700 shadow-sm disabled:opacity-60"
            >
                <RefreshCw className={`h-3 w-3 ${isRetrying ? "animate-spin" : ""}`} />
                Retry
            </button>
        </div>
    );
}

// ─── Mobile Overview ──────────────────────────────────────────────────────────

const KPI_TONES: Record<string, { bg: string; border: string; text: string }> = {
    violet: { bg: "bg-violet-50", border: "border-violet-100", text: "text-violet-700" },
    amber:  { bg: "bg-amber-50",  border: "border-amber-100",  text: "text-amber-700"  },
    emerald:{ bg: "bg-emerald-50",border: "border-emerald-100",text: "text-emerald-700" },
    blue:   { bg: "bg-blue-50",   border: "border-blue-100",   text: "text-blue-700"   },
    rose:   { bg: "bg-rose-50",   border: "border-rose-100",   text: "text-rose-700"   },
};

function MobileKpiChip({ label, value, meta, tone }: { label: string; value: React.ReactNode; meta?: string; tone: keyof typeof KPI_TONES }) {
    const t = KPI_TONES[tone];
    return (
        <div className={`rounded-xl border ${t.border} ${t.bg} px-2.5 py-2`}>
            <span className={`text-[9px] font-bold uppercase tracking-wide ${t.text}`}>{label}</span>
            <div className="mt-0.5 text-[15px] font-black leading-tight tracking-tight text-slate-950">{value}</div>
            {meta && <div className="text-[10px] font-medium text-slate-500">{meta}</div>}
        </div>
    );
}

function MobileJobRow({ job, variant }: { job: any; variant: "urgent" | "ready" }) {
    if (variant === "urgent") {
        return (
            <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-100 bg-rose-50">
                    <AlertCircle className="h-4 w-4 text-rose-600" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-500">{job.ticketNumber}</span>
                        <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-rose-600">{job.priority}</span>
                    </div>
                    <div className="truncate text-sm font-bold text-slate-900">{job.deviceType} {job.model}</div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500">
                        <User className="h-3 w-3" />{job.technician || "Unassigned"}
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-slate-900">{job.customerName}</div>
                <div className="text-[10px] text-slate-500">{job.deviceType} · {job.ticketNumber}</div>
            </div>
        </div>
    );
}

function MobileSection({ title, count, countTone = "slate", children }: {
    title: string;
    count?: number;
    countTone?: keyof typeof KPI_TONES;
    children: React.ReactNode;
}) {
    const t = KPI_TONES[countTone];
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2.5 flex items-center justify-between gap-2">
                <h3 className="text-xs font-black uppercase tracking-wide text-slate-600">{title}</h3>
                {count !== undefined && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${t?.bg ?? "bg-slate-100"} ${t?.text ?? "text-slate-500"}`}>{count}</span>
                )}
            </div>
            {children}
        </div>
    );
}

function MobileOverviewLayout({ stats, technicianWorkloads, dueToday, readyForDelivery, analyticsData }: {
    stats: any;
    technicianWorkloads: any[];
    dueToday: any[];
    readyForDelivery: any[];
    analyticsData: any;
}) {
    const maxJobs = Math.max(1, ...technicianWorkloads.map((t) => t.jobs?.length ?? 0));

    return (
        <div
            className="bg-[#f8fafc] px-3 pt-2 space-y-3"
            style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
        >
            {/* Header */}
            <div className="pb-1">
                <h1 className="text-base font-black text-slate-900">Overview</h1>
                <p className="text-xs text-slate-500">Shop floor at a glance</p>
            </div>

            {/* KPI chips */}
            <div className="grid grid-cols-2 gap-1.5">
                <MobileKpiChip label="Due Today"     value={stats.totalDueToday}        meta="Urgent action" tone="violet" />
                <MobileKpiChip label="Due Tomorrow"  value={stats.totalDueTomorrow}      meta="Upcoming"      tone="amber"  />
                <MobileKpiChip label="Ready Pickup"  value={stats.totalReadyForDelivery} meta="Completed"     tone="emerald"/>
                <MobileKpiChip label="Active Repairs" value={stats.totalInProgress}      meta="On bench"      tone="blue"   />
            </div>

            {/* Urgent Jobs */}
            <MobileSection title="Urgent Jobs — Due Today" count={dueToday.length} countTone="rose">
                {dueToday.length === 0 ? (
                    <div className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs font-medium text-slate-500">No jobs due today</div>
                ) : (
                    <div className="space-y-2">
                        {dueToday.slice(0, 8).map((job: any) => (
                            <MobileJobRow key={job.id} job={job} variant="urgent" />
                        ))}
                    </div>
                )}
            </MobileSection>

            {/* Ready for Delivery */}
            <MobileSection title="Ready for Delivery" count={readyForDelivery.length} countTone="emerald">
                {readyForDelivery.length === 0 ? (
                    <div className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs font-medium text-slate-500">No completed jobs pending</div>
                ) : (
                    <div className="space-y-2">
                        {readyForDelivery.slice(0, 8).map((job: any) => (
                            <MobileJobRow key={job.id} job={job} variant="ready" />
                        ))}
                    </div>
                )}
            </MobileSection>

            {/* Technician Workload — progress rows */}
            <MobileSection title="Technician Workload">
                {technicianWorkloads.length === 0 ? (
                    <div className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs font-medium text-slate-500">No active technicians</div>
                ) : (
                    <div className="space-y-2.5">
                        {technicianWorkloads.map((tech: any) => {
                            const count = tech.jobs?.length ?? 0;
                            const pct = Math.min(100, (count / maxJobs) * 100);
                            return (
                                <div key={tech.technician} className="flex items-center gap-3">
                                    <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-[11px] font-black">
                                        {tech.technician.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs font-bold text-slate-700 truncate">{tech.technician}</span>
                                            <span className="text-[10px] font-mono text-slate-500 shrink-0 ml-2">{count} jobs</span>
                                        </div>
                                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </MobileSection>

            {/* Owner Analytics — compact stacked */}
            {analyticsData && (
                <MobileSection title="30-Day Performance">
                    <div className="grid grid-cols-2 gap-1.5 mb-3">
                        <MobileKpiChip
                            label="Revenue"
                            value={`৳${((analyticsData.summary.totalRevenue ?? 0) / 1000).toFixed(1)}k`}
                            tone="emerald"
                        />
                        <MobileKpiChip
                            label="Repairs Done"
                            value={analyticsData.summary.totalRepairs ?? 0}
                            tone="blue"
                        />
                        <MobileKpiChip
                            label="Wastage Loss"
                            value={`৳${((analyticsData.summary.totalWastageLoss ?? 0) / 1000).toFixed(1)}k`}
                            tone="rose"
                        />
                        <MobileKpiChip
                            label="Active Staff"
                            value={analyticsData.summary.totalStaff ?? 0}
                            tone="amber"
                        />
                    </div>

                    {analyticsData.technicianPerformance?.length > 0 && (
                        <div className="space-y-2.5 border-t border-slate-100 pt-2.5">
                            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Top Performers</p>
                            {analyticsData.technicianPerformance.slice(0, 5).map((tech: any) => (
                                <div key={tech.name} className="flex items-center gap-3">
                                    <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-[10px] font-black">
                                        {tech.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs font-bold text-slate-700 truncate">{tech.name}</span>
                                            <span className="text-[10px] font-bold text-indigo-600 shrink-0 ml-2">{(tech.efficiency ?? 0).toFixed(0)}%</span>
                                        </div>
                                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                                                style={{ width: `${Math.min(100, tech.efficiency ?? 0)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </MobileSection>
            )}
        </div>
    );
}

// ─── Desktop Overview (preserved) ────────────────────────────────────────────

function DesktopOverviewLayout({ stats, technicianWorkloads, dueToday, readyForDelivery, analyticsData }: {
    stats: any;
    technicianWorkloads: any[];
    dueToday: any[];
    readyForDelivery: any[];
    analyticsData: any;
}) {
    return (
        <div className="space-y-6 pb-8">
            {/* KPI ROW */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
            >
                <motion.div variants={itemVariants} className="col-span-1">
                    <BentoCard
                        className="h-full bg-gradient-to-br from-violet-500 to-fuchsia-600"
                        title="Due Today"
                        icon={<Clock size={20} className="text-white" />}
                        variant="vibrant"
                        spotlightColor="rgba(255, 255, 255, 0.3)"
                    >
                        <div className="flex flex-col h-full justify-between">
                            <div className="text-5xl font-bold text-white tracking-tighter filter drop-shadow-sm">{stats.totalDueToday}</div>
                            <div className="text-xs font-bold px-3 py-1.5 bg-white/20 text-white rounded-lg w-fit mt-2 backdrop-blur-md border border-white/10 uppercase tracking-wider">Urgent Action</div>
                        </div>
                    </BentoCard>
                </motion.div>
                <motion.div variants={itemVariants} className="col-span-1">
                    <BentoCard
                        className="h-full bg-gradient-to-br from-amber-400 to-orange-600"
                        title="Due Tomorrow"
                        icon={<Calendar size={20} className="text-white" />}
                        variant="vibrant"
                        spotlightColor="rgba(255, 255, 255, 0.3)"
                    >
                        <div className="flex flex-col h-full justify-between">
                            <div className="text-5xl font-bold text-white tracking-tighter filter drop-shadow-sm">{stats.totalDueTomorrow}</div>
                            <div className="text-xs font-bold px-3 py-1.5 bg-white/20 text-white rounded-lg w-fit mt-2 backdrop-blur-md border border-white/10 uppercase tracking-wider">Upcoming</div>
                        </div>
                    </BentoCard>
                </motion.div>
                <motion.div variants={itemVariants} className="col-span-1">
                    <BentoCard
                        className="h-full bg-gradient-to-br from-emerald-400 to-teal-600"
                        title="Ready for Pickup"
                        icon={<Truck size={20} className="text-white" />}
                        variant="vibrant"
                        spotlightColor="rgba(255, 255, 255, 0.3)"
                    >
                        <div className="flex flex-col h-full justify-between">
                            <div className="text-5xl font-bold text-white tracking-tighter filter drop-shadow-sm">{stats.totalReadyForDelivery}</div>
                            <div className="text-xs font-bold px-3 py-1.5 bg-white/20 text-white rounded-lg w-fit mt-2 backdrop-blur-md border border-white/10 uppercase tracking-wider">Completed</div>
                        </div>
                    </BentoCard>
                </motion.div>
                <motion.div variants={itemVariants} className="col-span-1">
                    <BentoCard
                        className="h-full bg-gradient-to-br from-blue-500 to-indigo-600"
                        title="Active Repairs"
                        icon={<Wrench size={20} className="text-white" />}
                        variant="vibrant"
                        spotlightColor="rgba(255, 255, 255, 0.3)"
                    >
                        <div className="flex flex-col h-full justify-between">
                            <div className="text-5xl font-bold text-white tracking-tighter filter drop-shadow-sm">{stats.totalInProgress}</div>
                            <div className="text-xs font-bold px-3 py-1.5 bg-white/20 text-white rounded-lg w-fit mt-2 backdrop-blur-md border border-white/10 uppercase tracking-wider">On Bench</div>
                        </div>
                    </BentoCard>
                </motion.div>
            </motion.div>

            {/* CHARTS ROW */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
                <motion.div variants={itemVariants} className="col-span-2 h-full min-h-[400px]">
                    <BentoCard
                        className="h-full bg-gradient-to-br from-indigo-500 to-purple-600"
                        title="Technician Workload"
                        icon={<Users size={20} className="text-white" />}
                        variant="vibrant"
                        spotlightColor="rgba(255, 255, 255, 0.2)"
                    >
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={technicianWorkloads} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                                <XAxis dataKey="technician" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 500 }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }} />
                                <Tooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.1)' }}
                                    contentStyle={{ borderRadius: '16px', border: 'none', background: 'rgba(255, 255, 255, 0.9)', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', padding: '12px', color: '#1e293b' }}
                                    itemStyle={{ color: '#1e293b' }}
                                    labelStyle={{ color: '#64748b' }}
                                />
                                <Bar dataKey="jobs.length" name="Active Jobs" fill="rgba(255,255,255,0.9)" radius={[6, 6, 0, 0]} barSize={40}>
                                    {technicianWorkloads.map((_entry: any, index: any) => (
                                        <Cell key={`cell-${index}`} fill="rgba(255, 255, 255, 0.8)" />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </BentoCard>
                </motion.div>

                <motion.div variants={itemVariants} className="col-span-1 h-full min-h-[400px]">
                    <BentoCard
                        className="h-full bg-gradient-to-br from-rose-500 to-red-600"
                        title="Urgent Jobs Feed"
                        icon={<AlertCircle size={20} className="text-white" />}
                        variant="vibrant"
                        spotlightColor="rgba(255, 255, 255, 0.2)"
                    >
                        <div className="overflow-y-auto pr-2 space-y-3 h-full pb-4 scrollbar-thin scrollbar-track-white/10 scrollbar-thumb-white/30">
                            {dueToday.length === 0 && <div className="text-center text-white/50 mt-10">No jobs due today</div>}
                            {dueToday.map((job: any) => (
                                <div key={job.id} className="p-4 bg-white/10 rounded-2xl border border-white/10 hover:bg-white/20 transition-all cursor-pointer group backdrop-blur-md bc-hover bc-rise relative z-10 hover:z-20">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="font-bold text-xs text-white bg-white/20 px-2 py-1 rounded-md">{job.ticketNumber}</span>
                                        <span className="text-[10px] bg-white text-rose-600 px-2 py-1 rounded-full font-bold uppercase tracking-wide shadow-sm">{job.priority}</span>
                                    </div>
                                    <div className="text-sm font-semibold text-white line-clamp-1 mb-1">{job.deviceType} {job.model}</div>
                                    <div className="flex items-center justify-between mt-2">
                                        <div className="text-xs text-white/70 flex items-center gap-1.5">
                                            <User size={12} className="text-white/70" /> {job.technician || "Unassigned"}
                                        </div>
                                        <div className="text-[10px] text-white/90 font-medium bg-rose-500/50 px-2 py-0.5 rounded-full">Due Today</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </BentoCard>
                </motion.div>
            </motion.div>

            {/* BOTTOM LISTS */}
            <motion.div
                variants={containerVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
            >
                <motion.div variants={itemVariants} className="h-full min-h-[320px]">
                    <BentoCard
                        className="h-full bg-gradient-to-br from-emerald-500 to-teal-600"
                        title="Ready for Delivery"
                        icon={<CheckCircle2 size={20} className="text-white" />}
                        variant="vibrant"
                        spotlightColor="rgba(255, 255, 255, 0.2)"
                    >
                        <div className="overflow-y-auto pr-2 space-y-3 h-full pb-4 scrollbar-thin scrollbar-track-white/10 scrollbar-thumb-white/30">
                            {readyForDelivery.length === 0 && <div className="text-center text-white/50 mt-10">No completed jobs pending cleanup</div>}
                            {readyForDelivery.map((job: any) => (
                                <div key={job.id} className="flex items-center justify-between p-4 bg-white/10 hover:bg-white/20 rounded-2xl border border-white/10 transition-all cursor-pointer shadow-sm group backdrop-blur-md bc-hover bc-rise relative z-10 hover:z-20">
                                    <div>
                                        <div className="font-bold text-white text-sm">{job.customerName}</div>
                                        <div className="text-xs text-white/70 font-medium mt-0.5">{job.deviceType} • {job.ticketNumber}</div>
                                    </div>
                                    <div className="h-8 w-8 rounded-full bg-white text-emerald-600 flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-300">
                                        <CheckCircle2 size={16} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </BentoCard>
                </motion.div>

                <motion.div variants={itemVariants} className="h-full min-h-[320px]">
                    <BentoCard
                        className="h-full bg-gradient-to-br from-blue-500 to-cyan-600"
                        title="Quick Actions"
                        icon={<PenTool size={20} className="text-white" />}
                        variant="vibrant"
                        spotlightColor="rgba(255, 255, 255, 0.2)"
                    >
                        <div className="grid grid-cols-2 gap-4 h-full content-center">
                            <Button variant="outline" className="h-full flex flex-col items-center justify-center gap-3 bg-white/10 border-white/20 hover:bg-white/20 text-white hover:text-white hover:border-white/40 transition-all shadow-lg bc-hover bc-rise relative z-10 hover:z-20 rounded-2xl group border-2">
                                <div className="p-3 bg-white/20 text-white rounded-full group-hover:scale-110 transition-transform duration-300 ring-1 ring-white/30">
                                    <Plus size={20} />
                                </div>
                                <span className="font-bold tracking-wide text-xs">New Job</span>
                            </Button>
                            <Button variant="outline" className="h-full flex flex-col items-center justify-center gap-3 bg-white/10 border-white/20 hover:bg-white/20 text-white hover:text-white hover:border-white/40 transition-all shadow-lg bc-hover bc-rise relative z-10 hover:z-20 rounded-2xl group border-2">
                                <div className="p-3 bg-white/20 text-white rounded-full group-hover:scale-110 transition-transform duration-300 ring-1 ring-white/30">
                                    <MessageSquare size={20} />
                                </div>
                                <span className="font-bold tracking-wide text-xs">Send SMS</span>
                            </Button>
                            <Button variant="outline" className="h-full flex flex-col items-center justify-center gap-3 bg-white/10 border-white/20 hover:bg-white/20 text-white hover:text-white hover:border-white/40 transition-all shadow-lg bc-hover bc-rise relative z-10 hover:z-20 rounded-2xl group border-2">
                                <div className="p-3 bg-white/20 text-white rounded-full group-hover:scale-110 transition-transform duration-300 ring-1 ring-white/30">
                                    <Truck size={20} />
                                </div>
                                <span className="font-bold tracking-wide text-xs">Pickup</span>
                            </Button>
                            <Button variant="outline" className="h-full flex flex-col items-center justify-center gap-3 bg-white/10 border-white/20 hover:bg-white/20 text-white hover:text-white hover:border-white/40 transition-all shadow-lg bc-hover bc-rise relative z-10 hover:z-20 rounded-2xl group border-2">
                                <div className="p-3 bg-white/20 text-white rounded-full group-hover:scale-110 transition-transform duration-300 ring-1 ring-white/30">
                                    <Users size={20} />
                                </div>
                                <span className="font-bold tracking-wide text-xs">Technicians</span>
                            </Button>
                        </div>
                    </BentoCard>
                </motion.div>
            </motion.div>

            {/* OWNER ANALYTICS — 30-Day Rolling */}
            {analyticsData && (
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-50px" }}
                    className="space-y-4"
                >
                    <motion.div variants={itemVariants} className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl shadow-md">
                            <TrendingUp className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800 text-sm">Owner Analytics</h3>
                            <p className="text-xs text-slate-500">30-day rolling performance</p>
                        </div>
                    </motion.div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: "Revenue", icon: <TrendingUp className="w-4 h-4" />, value: `৳${((analyticsData.summary.totalRevenue ?? 0) / 1000).toFixed(1)}k`, from: "from-emerald-500", to: "to-teal-600" },
                            { label: "Repairs Done", icon: <Wrench className="w-4 h-4" />, value: analyticsData.summary.totalRepairs ?? 0, from: "from-blue-500", to: "to-indigo-600" },
                            { label: "Wastage Loss", icon: <AlertCircle className="w-4 h-4" />, value: `৳${((analyticsData.summary.totalWastageLoss ?? 0) / 1000).toFixed(1)}k`, from: "from-red-500", to: "to-rose-600" },
                            { label: "Active Staff", icon: <Users className="w-4 h-4" />, value: analyticsData.summary.totalStaff ?? 0, from: "from-amber-400", to: "to-orange-500" },
                        ].map((kpi) => (
                            <motion.div key={kpi.label} variants={itemVariants}>
                                <BentoCard className={`h-full bg-gradient-to-br ${kpi.from} ${kpi.to}`} variant="vibrant" spotlightColor="rgba(255,255,255,0.25)">
                                    <div className="flex items-center gap-2 mb-2 text-white/80">
                                        {kpi.icon}
                                        <span className="text-[10px] font-bold uppercase tracking-wider">{kpi.label}</span>
                                    </div>
                                    <div className="text-3xl font-black text-white tracking-tighter">{kpi.value}</div>
                                </BentoCard>
                            </motion.div>
                        ))}
                    </div>

                    {analyticsData.technicianPerformance?.length > 0 && (
                        <motion.div variants={itemVariants}>
                            <BentoCard className="bg-white border border-slate-200" title="Technician Performance" icon={<Award className="w-4 h-4 text-indigo-600" />}>
                                <div className="space-y-3 pt-2">
                                    {analyticsData.technicianPerformance.slice(0, 6).map((tech: any) => (
                                        <div key={tech.name} className="flex items-center gap-3">
                                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">
                                                {tech.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-xs font-bold text-slate-700 truncate">{tech.name}</span>
                                                    <span className="text-[10px] font-mono text-slate-500 shrink-0 ml-2">{tech.tasks} jobs</span>
                                                </div>
                                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-700"
                                                        style={{ width: `${Math.min(100, tech.efficiency ?? 0)}%` }}
                                                    />
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-bold text-indigo-600 w-8 text-right shrink-0">{(tech.efficiency ?? 0).toFixed(0)}%</span>
                                        </div>
                                    ))}
                                </div>
                            </BentoCard>
                        </motion.div>
                    )}
                </motion.div>
            )}
        </div>
    );
}

// ─── Tab Entry Point ──────────────────────────────────────────────────────────

export default function OverviewTab() {
    const isMobile = useAdminMobileMode();

    const { data: overviewData, isLoading: isOverviewLoading, isError: isOverviewError, isFetching: isOverviewFetching, refetch: refetchOverview } = useQuery({
        queryKey: ["jobOverview"],
        queryFn: fetchJobOverview,
        retry: 1,
        retryDelay: 5000,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    const { data: analyticsData } = useQuery({
        queryKey: ["dashboardStats", "analytics"],
        queryFn: () => analyticsApi.getDashboard(),
        staleTime: 30000,
        refetchOnWindowFocus: false,
    });

    if (isOverviewLoading && !overviewData) return <DashboardSkeleton />;
    if (isOverviewError && !overviewData) return <SoftOverviewUnavailable onRetry={() => refetchOverview()} isRetrying={isOverviewFetching} />;

    const { stats, technicianWorkloads, dueToday, readyForDelivery } = overviewData as any;
    const refreshNotice = isOverviewError ? <SoftRefreshNotice onRetry={() => refetchOverview()} isRetrying={isOverviewFetching} /> : null;

    if (isMobile) {
        return (
            <>
                {refreshNotice}
                <MobileOverviewLayout
                    stats={stats}
                    technicianWorkloads={technicianWorkloads}
                    dueToday={dueToday}
                    readyForDelivery={readyForDelivery}
                    analyticsData={analyticsData}
                />
            </>
        );
    }

    return (
        <>
            {refreshNotice}
            <DesktopOverviewLayout
                stats={stats}
                technicianWorkloads={technicianWorkloads}
                dueToday={dueToday}
                readyForDelivery={readyForDelivery}
                analyticsData={analyticsData}
            />
        </>
    );
}
