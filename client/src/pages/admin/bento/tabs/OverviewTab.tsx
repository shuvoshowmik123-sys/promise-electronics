import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
    Clock, Calendar, Truck, Wrench, Users, AlertCircle, User, CheckCircle2,
    PenTool, Plus, MessageSquare, TrendingUp, BarChart3, Award
} from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { Button } from "@/components/ui/button";
import { BentoCard, DashboardSkeleton, containerVariants, itemVariants } from "../shared";
import { analyticsApi } from "@/lib/api";

async function fetchJobOverview() {
    const response = await fetch("/api/admin/job-overview");
    if (!response.ok) throw new Error("Failed to fetch job overview");
    return response.json();
}

export default function OverviewTab() {
    const { data: overviewData, isLoading: isOverviewLoading, isError: isOverviewError } = useQuery({
        queryKey: ["jobOverview"],
        queryFn: fetchJobOverview,
    });

    // Phase E — Owner Analytics (30-day rolling)
    const { data: analyticsData } = useQuery({
        queryKey: ["dashboardStats", "analytics"],
        queryFn: () => analyticsApi.getDashboard(),
        staleTime: 30000,
    });

    if (isOverviewLoading) return <DashboardSkeleton />;
    if (isOverviewError || !overviewData) return (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="p-4 bg-red-50 rounded-2xl">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <p className="text-slate-500 font-medium text-sm">Failed to load overview data. Please refresh.</p>
        </div>
    );

    const { stats, technicianWorkloads, dueToday, readyForDelivery } = overviewData as any;

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
                                    {technicianWorkloads.map((entry: any, index: any) => (
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
                    {/* Section header */}
                    <motion.div variants={itemVariants} className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-xl shadow-md">
                            <TrendingUp className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800 text-sm">Owner Analytics</h3>
                            <p className="text-xs text-slate-500">30-day rolling performance</p>
                        </div>
                    </motion.div>

                    {/* KPI mini cards */}
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

                    {/* Technician performance table */}
                    {analyticsData.technicianPerformance?.length > 0 && (
                        <motion.div variants={itemVariants}>
                            <BentoCard className="bg-white border border-slate-200" title="Technician Performance" icon={<Award className="w-4 h-4 text-indigo-600" />}>
                                <div className="space-y-3 pt-2">
                                    {analyticsData.technicianPerformance.slice(0, 6).map((tech) => (
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
