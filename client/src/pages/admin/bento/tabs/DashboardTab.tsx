import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import {
    Activity, Package, DollarSign, Users, Clock, AlertCircle,
    TrendingUp, CheckCircle2, ChevronRight, X, ShoppingCart
} from "lucide-react";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";
import {
    BentoCard, containerVariants, itemVariants, DashboardSkeleton
} from "../shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { adminAuthApi, type AdminAggregatedDashboard, type AdminDashboardJobSummary } from "@/lib/api";
import { format } from "date-fns";
import { saveDashboardSnapshot, getDashboardSnapshot } from "@/lib/dashboardSnapshot";

const cardMeta: Record<string, { title: string; icon: React.ReactNode; gradient: string; slideFrom: { x: number; y: number } }> = {
    revenue: { title: "Revenue Details", icon: <DollarSign size={20} />, gradient: "from-emerald-500 to-teal-600", slideFrom: { x: -300, y: 0 } },
    active: { title: "Active Jobs", icon: <Activity size={20} />, gradient: "from-blue-500 to-cyan-600", slideFrom: { x: -150, y: 0 } },
    pending: { title: "Pending Actions", icon: <AlertCircle size={20} />, gradient: "from-orange-500 to-amber-600", slideFrom: { x: 150, y: 0 } },
    parts: { title: "Parts Low Stock", icon: <Package size={20} />, gradient: "from-rose-500 to-red-600", slideFrom: { x: 300, y: 0 } },
    wastage: { title: "Wastage & Defects", icon: <AlertCircle size={20} />, gradient: "from-red-600 to-rose-700", slideFrom: { x: 400, y: 0 } },
    // 'activity' removed — no longer uses the popup panel
};

interface DashboardTabProps {
    onNavigate?: (tab: string, searchQuery?: string) => void;
}

export default function DashboardTab({ onNavigate }: DashboardTabProps) {
    const [selectedCard, setSelectedCard] = useState<string | null>(null);
    const [selectedActivity, setSelectedActivity] = useState<AdminDashboardJobSummary | null>(null);

    const navigateTo = (tab: string, searchQuery?: string) => {
        setSelectedCard(null);
        onNavigate?.(tab, searchQuery);
    };

    const { data: dashboardData, isLoading, isError } = useQuery<AdminAggregatedDashboard>({
        queryKey: ["dashboardStats", "aggregated"],
        queryFn: async () => {
            const fresh = await adminAuthApi.getAggregatedDashboard();
            saveDashboardSnapshot(fresh);
            return fresh;
        },
        staleTime: 30_000,
        gcTime: 600_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        placeholderData: () => getDashboardSnapshot(),
    });

    const data = dashboardData || getDashboardSnapshot();

    if (isLoading) return <DashboardSkeleton />;
    if (isError || !data) return (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="p-4 bg-red-50 rounded-2xl">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <p className="text-slate-500 font-medium text-sm">Failed to load dashboard data. Please refresh.</p>
        </div>
    );

    const getPopupContent = (cardId: string) => {
        switch (cardId) {
            case 'revenue':
                return (
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                            <div onClick={() => navigateTo('finance')} className="p-4 bg-blue-50 rounded-xl border border-blue-100 cursor-pointer hover:bg-blue-100 hover:border-blue-200 transition-all group/rev">
                                <div className="text-sm text-blue-600 font-medium">Total Revenue</div>
                                <div className="text-2xl font-bold text-blue-900">৳ {data.totalRevenue.toLocaleString()}</div>
                                <div className="text-[10px] text-blue-400 mt-1 group-hover/rev:text-blue-600 transition-colors">View in Finance →</div>
                            </div>
                            <div onClick={() => navigateTo('pos')} className="p-4 bg-green-50 rounded-xl border border-green-100 cursor-pointer hover:bg-green-100 hover:border-green-200 transition-all group/rev flex flex-col justify-between">
                                <div className="text-sm text-green-600 font-medium">POS Sales</div>
                                <div className="text-xl font-bold text-green-900 my-1">৳ {data.posRevenueThisMonth?.toLocaleString() || '0'}</div>
                                <div className="text-[10px] text-green-500 group-hover/rev:text-green-700 transition-colors">Analyze POS Register →</div>
                            </div>
                            <div onClick={() => navigateTo('b2b')} className="p-4 bg-purple-50 rounded-xl border border-purple-100 cursor-pointer hover:bg-purple-100 hover:border-purple-200 transition-all group/rev flex flex-col justify-between">
                                <div className="text-sm text-purple-600 font-medium">Corporate Revenue</div>
                                <div className="text-xl font-bold text-purple-900 my-1">৳ {data.corporateRevenueThisMonth?.toLocaleString() || '0'}</div>
                                <div className="text-[10px] text-purple-500 group-hover/rev:text-purple-700 transition-colors">Analyze Statements →</div>
                            </div>
                        </div>
                        <div onClick={() => navigateTo('finance')} className="p-3 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-200 cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-all">
                            <span className="text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors">📊 View Full Financial Report →</span>
                        </div>
                    </div>
                );
            case 'active':
                return (
                    <div className="space-y-2">
                        {data.activeJobsList.length === 0 ? <div className="text-slate-500 text-center py-4">No active jobs</div> :
                            data.activeJobsList.map((job: any) => (
                                <div
                                    key={job.id}
                                    onClick={() => navigateTo('jobs', job.ticketNumber)}
                                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-all group/item bc-hover bc-rise relative z-10 hover:z-20"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-mono font-bold">{job.ticketNumber}</span>
                                        <div>
                                            <div className="font-medium text-sm text-slate-800 group-hover/item:text-blue-600 transition-colors truncate max-w-[200px]">{job.deviceModel}</div>
                                            <div className="text-xs text-slate-500">Tech: {job.technician || 'Unassigned'}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-semibold whitespace-nowrap">{job.status}</div>
                                        <ChevronRight size={14} className="text-slate-300 group-hover/item:text-blue-500 transition-colors" />
                                    </div>
                                </div>
                            ))}
                    </div>
                );
            case 'pending':
                return (
                    <div className="space-y-2">
                        {data.pendingJobsList.length === 0 ? <div className="text-slate-500 text-center py-4">No pending actions</div> :
                            data.pendingJobsList.map((job: any) => (
                                <div key={job.id} className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100 cursor-pointer hover:bg-amber-100 hover:border-amber-200 transition-all group/pend"
                                    onClick={() => navigateTo('jobs', job.ticketNumber)}
                                >
                                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                                    <div className="flex-1">
                                        <div className="font-medium text-sm text-amber-900 group-hover/pend:text-amber-700 transition-colors">Action Required: {job.ticketNumber}</div>
                                        <div className="text-xs text-amber-700 mt-1 truncate max-w-[250px]">{job.problemDescription || 'No description'}</div>
                                        <div className="flex gap-2 mt-2">
                                            <Button size="sm" variant="outline" className="h-7 text-xs bg-white text-amber-700 border-amber-200 hover:bg-amber-50">View Job</Button>
                                        </div>
                                    </div>
                                    <ChevronRight size={14} className="text-amber-300 mt-1 group-hover/pend:text-amber-600 transition-colors" />
                                </div>
                            ))}
                    </div>
                );

            case 'wastage':
                return (
                    <div className="space-y-4">
                        <div className="p-4 bg-red-50 rounded-xl border border-red-100 flex flex-col items-center justify-center text-center">
                            <div className="text-sm text-red-600 font-medium mb-1">Total Financial Impact</div>
                            <div className="text-3xl font-black text-red-900">৳ {data.totalWastageLoss.toLocaleString()}</div>
                            <div className="text-xs text-red-500 mt-2 bg-red-100/50 px-3 py-1 rounded-full border border-red-200">Across {data.wastageCount} reported incidents</div>
                        </div>
                        <div className="p-3 bg-slate-50 flex items-center justify-between rounded-xl border border-slate-200 cursor-pointer hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-all group/waste" onClick={() => navigateTo('inventory')}>
                            <div className="flex items-center gap-2 text-sm font-medium text-slate-700 group-hover/waste:text-red-700"><ShoppingCart size={16} /> Check Inventory Hub</div>
                            <ChevronRight size={16} className="text-slate-400 group-hover/waste:text-red-600" />
                        </div>
                    </div>
                );
            case 'activity':
                return (
                    <div className="space-y-2">
                        {data.recentJobs?.map((job: any, i: number) => (
                            <div
                                key={i}
                                onClick={() => navigateTo('jobs', job.ticketNumber)}
                                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-all group/item bc-hover bc-rise relative z-10 hover:z-20"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                        <CheckCircle2 size={16} />
                                    </div>
                                    <div>
                                        <div className="font-medium text-sm text-slate-800 group-hover/item:text-blue-600 transition-colors truncate max-w-[220px]">Job #{job.ticketNumber} Update</div>
                                        <div className="text-xs text-slate-500">Status changed to {job.status}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-400 whitespace-nowrap">{job.updatedAt ? format(new Date(job.updatedAt), 'MMM d, h:mm a') : 'Just now'}</span>
                                    <ChevronRight size={14} className="text-slate-300 group-hover/item:text-blue-500 transition-colors" />
                                </div>
                            </div>
                        ))}
                    </div>
                );
            case 'parts':
                return (
                    <div className="space-y-4">
                        <div className="flex justify-between items-end mb-4">
                            <p className="text-slate-500">Items below minimum stock threshold</p>
                            <Button
                                size="sm"
                                className="bg-[#52D3D8] hover:bg-[#38bdf8] text-white"
                                onClick={() => navigateTo('purchasing')}
                            >
                                <ShoppingCart className="w-4 h-4 mr-2" />
                                Create POs
                            </Button>
                        </div>
                        <div className="rounded-xl border border-slate-200 overflow-hidden text-sm">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3">Item</th>
                                        <th className="px-4 py-3">Current Stock</th>
                                        <th className="px-4 py-3">Threshold</th>
                                        <th className="px-4 py-3">Supplier</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {data.lowStockItems.length === 0 ? (
                                        <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">All stock levels are optimal.</td></tr>
                                    ) : data.lowStockItems.map((item: any) => (
                                        <tr key={item.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => navigateTo('inventory', item.name)}>
                                            <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-red-100 text-red-700">
                                                    {item.stock}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-500">{item.lowStockThreshold || 5}</td>
                                            <td className="px-4 py-3 text-slate-500">{item.preferredSupplier || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            default:
                return null;
        }
    }
    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6 pb-8"
        >


            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* ROW 1: GRAPHS */}
                <motion.div variants={itemVariants} className="col-span-1 md:col-span-2 h-full min-h-[320px]">
                    <BentoCard
                        className="h-full cursor-pointer bg-gradient-to-br from-blue-600 to-indigo-700"
                        title="Revenue Trend"
                        icon={<TrendingUp size={18} className="text-white" />}
                        variant="vibrant"
                        spotlightColor="rgba(255, 255, 255, 0.2)"
                        onClick={() => setSelectedCard('revenue')}
                    >
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.revenueData}>
                                <defs>
                                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#fff" stopOpacity={0.5} />
                                        <stop offset="95%" stopColor="#fff" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }} tickFormatter={(value) => `৳${value / 1000}k`} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', background: 'rgba(255, 255, 255, 0.9)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', color: '#1e293b' }}
                                    cursor={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 2 }}
                                />
                                <Area type="monotone" dataKey="value" stroke="#fff" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </BentoCard>
                </motion.div>

                <motion.div variants={itemVariants} className="col-span-1 md:col-span-1 h-full min-h-[320px]">
                    <BentoCard
                        variant="vibrant"
                        spotlightColor="rgba(255, 255, 255, 0.2)"
                        onClick={() => navigateTo('jobs')}
                        className="h-full flex flex-col bg-gradient-to-br from-violet-600 to-purple-700 cursor-pointer"
                        title="Job Status"
                        icon={<Activity size={18} className="text-white" />}
                    >
                        <div className="relative flex-1 min-h-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                                    <Pie
                                        data={data.jobStatusData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={42}
                                        outerRadius={60}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {data.jobStatusData.map((_entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={['#fff', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.2)'][index % 3]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', background: 'rgba(255, 255, 255, 0.9)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', color: '#1e293b' }} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="text-center">
                                    <div className="text-2xl font-bold text-white">{data.jobStatusData.reduce((a: any, b: any) => a + b.value, 0)}</div>
                                    <div className="text-[10px] text-white/70 uppercase font-semibold">Total</div>
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 flex flex-wrap justify-center gap-3">
                            {data.jobStatusData.map((item: any, index: number) => (
                                <div key={index} className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ['#fff', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.2)'][index % 3] }} />
                                    <span className="text-xs font-medium text-white/80">{item.name}</span>
                                </div>
                            ))}
                        </div>
                    </BentoCard>
                </motion.div>

                <motion.div variants={itemVariants} className="col-span-1 md:col-span-1 h-full min-h-[320px]">
                    <BentoCard
                        variant="vibrant"
                        spotlightColor="rgba(255, 255, 255, 0.2)"
                        onClick={() => navigateTo('reports')}
                        className="h-full bg-gradient-to-br from-pink-500 to-rose-600 cursor-pointer"
                        title="Tech Workload"
                        icon={<Users size={18} className="text-white" />}
                    >
                        <div className="h-full w-full flex flex-col gap-1.5 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                            {data.techData.slice(0, 8).map((entry: any, i: number) => {
                                const maxJobs = data.techData[0]?.jobs || 1;
                                const pct = Math.max(4, Math.round((entry.jobs / maxJobs) * 100));
                                return (
                                    <div key={entry.name} className="flex flex-col gap-0.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-semibold text-white truncate max-w-[75%] leading-tight">
                                                {i === 0 && '🔥 '}{entry.name}
                                            </span>
                                            <span className="text-[11px] font-bold text-white/80 shrink-0 ml-1">
                                                {entry.jobs}
                                            </span>
                                        </div>
                                        <div className="w-full h-1.5 rounded-full bg-white/20 overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-white"
                                                style={{ width: `${pct}%`, opacity: 0.7 + (i === 0 ? 0.3 : 0) }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </BentoCard>
                </motion.div>

                {/* ROW 2: KPIs */}
                <motion.div layoutId="card-revenue" variants={itemVariants} className="col-span-1">
                    <BentoCard
                        className="cursor-pointer bg-gradient-to-br from-emerald-500 to-teal-600 h-full"
                        title="Total Revenue"
                        icon={<DollarSign size={18} className="text-white" />}
                        variant="vibrant"
                        onClick={() => setSelectedCard('revenue')}
                        spotlightColor="rgba(255, 255, 255, 0.2)"
                    >
                        <div className="text-3xl font-bold text-white mt-2">৳ {data.totalRevenue.toLocaleString()}</div>
                        <div className="text-xs font-medium text-white/80 mt-1 flex items-center gap-1">
                            Total Revenue Generated
                        </div>
                    </BentoCard>
                </motion.div>
                <motion.div layoutId="card-active" variants={itemVariants} className="col-span-1">
                    <BentoCard
                        className="cursor-pointer bg-gradient-to-br from-blue-500 to-cyan-600 h-full"
                        title="Active Jobs"
                        icon={<Activity size={18} className="text-white" />}
                        variant="vibrant"
                        onClick={() => setSelectedCard('active')}
                        spotlightColor="rgba(255, 255, 255, 0.2)"
                    >
                        <div className="text-3xl font-bold text-white mt-2">{data.activeCount}</div>
                        <div className="text-xs font-medium text-white/80 mt-1">
                            {data.activeJobsList.length} requiring update
                        </div>
                    </BentoCard>
                </motion.div>
                <motion.div layoutId="card-pending" variants={itemVariants} className="col-span-1">
                    <BentoCard
                        className="cursor-pointer bg-gradient-to-br from-orange-500 to-amber-600 h-full"
                        title="Pending Actions"
                        icon={<AlertCircle size={18} className="text-white" />}
                        variant="vibrant"
                        onClick={() => setSelectedCard('pending')}
                        spotlightColor="rgba(255, 255, 255, 0.2)"
                    >
                        <div className="text-3xl font-bold text-white mt-2">{data.pendingCount}</div>
                        <div className="text-xs font-medium text-white/80 mt-1">
                            Requires attention
                        </div>
                    </BentoCard>
                </motion.div>
                <motion.div layoutId="card-parts" variants={itemVariants} className="col-span-1">
                    <BentoCard
                        className="cursor-pointer bg-gradient-to-br from-rose-500 to-red-600 h-full"
                        title="Parts Low"
                        icon={<AlertCircle size={18} className="text-white" />}
                        variant="vibrant"
                        onClick={() => setSelectedCard('parts')}
                        spotlightColor="rgba(255, 255, 255, 0.2)"
                    >
                        <div className="text-3xl font-bold text-white mt-2">{data.lowStockCount}</div>
                        <div className="text-xs font-medium text-white/80 mt-1">
                            Restock <Package size={12} className="inline ml-1" />
                        </div>
                    </BentoCard>
                </motion.div>
                <motion.div layoutId="card-wastage" variants={itemVariants} className="col-span-1">
                    <BentoCard
                        className="cursor-pointer bg-gradient-to-br from-red-600 to-rose-700 h-full"
                        title="Wastage Loss"
                        icon={<TrendingUp size={18} className="text-white" />}
                        variant="vibrant"
                        onClick={() => setSelectedCard('wastage')}
                        spotlightColor="rgba(255, 255, 255, 0.2)"
                    >
                        <div className="text-3xl font-bold text-white mt-2">৳{(data.totalWastageLoss / 1000).toFixed(1)}k</div>
                        <div className="text-xs font-medium text-white/80 mt-1">
                            {data.wastageCount} Items Defaulted
                        </div>
                    </BentoCard>
                </motion.div>

                {/* ROW 3: LISTS */}
                <motion.div layoutId="card-activity" variants={itemVariants} className="col-span-1 md:col-span-2 lg:col-span-4">
                    <BentoCard
                        className="!overflow-visible"
                        title="Recent Jobs"
                        icon={<Clock size={18} className="text-slate-500" />}
                        variant="glass"
                        disableHover
                    >
                        {/* Table */}
                        <div className="rounded-xl border-2 border-slate-200 overflow-hidden">
                            {/* Header — desktop only */}
                            <div className="hidden md:grid grid-cols-[44px_1fr_160px_160px_120px] bg-slate-100 border-b-2 border-slate-200 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                                <div className="px-3 py-3 border-r border-slate-200" />
                                <div className="px-4 py-3 border-r border-slate-200">Ticket / Device</div>
                                <div className="px-4 py-3 border-r border-slate-200">Status</div>
                                <div className="px-4 py-3 border-r border-slate-200">Technician</div>
                                <div className="px-4 py-3 text-right">Updated</div>
                            </div>

                            {data.recentJobs?.map((job: any, i: number) => (
                                <div
                                    key={i}
                                    onClick={() => setSelectedActivity(job)}
                                    className={[
                                        "cursor-pointer transition-all duration-150 group/row",
                                        "border-b border-slate-200 last:border-b-0",
                                        "hover:bg-blue-50 hover:border-transparent",
                                        i % 2 === 0 ? "bg-white" : "bg-slate-50",
                                        "bc-hover bc-rise relative z-10 hover:z-20 hover:rounded-xl"
                                    ].join(" ")}
                                >
                                    {/* Desktop row */}
                                    <div className="hidden md:grid grid-cols-[44px_1fr_160px_160px_120px] items-center">
                                        <div className="px-3 py-3 border-r border-slate-200 flex items-center justify-center">
                                            <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center group-hover/row:bg-blue-600 group-hover/row:text-white transition-colors shrink-0">
                                                <CheckCircle2 size={13} />
                                            </div>
                                        </div>
                                        <div className="px-4 py-3 border-r border-slate-200 min-w-0">
                                            <div className="font-semibold text-[13px] text-slate-800 group-hover/row:text-blue-700 transition-colors truncate">{job.deviceModel || '—'}</div>
                                            <div className="font-mono text-[11px] text-blue-600 font-bold mt-0.5">{job.ticketNumber}</div>
                                        </div>
                                        <div className="px-4 py-3 border-r border-slate-200">
                                            <span className={[
                                                "inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold border whitespace-nowrap",
                                                job.status === 'Completed' || job.status === 'Delivered'
                                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                    : job.status === 'In Progress' || job.status === 'Repairing'
                                                        ? "bg-blue-50 text-blue-700 border-blue-200"
                                                        : job.status === 'Pending' || job.status === 'Waiting for Parts'
                                                            ? "bg-amber-50 text-amber-700 border-amber-200"
                                                            : "bg-slate-100 text-slate-600 border-slate-200"
                                            ].join(" ")}>
                                                {job.status}
                                            </span>
                                        </div>
                                        <div className="px-4 py-3 border-r border-slate-200 text-[13px] text-slate-700 font-medium truncate">
                                            {job.technician || <span className="text-slate-400 italic text-[12px] font-normal">Unassigned</span>}
                                        </div>
                                        <div className="px-4 py-3 text-right">
                                            <div className="text-[12px] text-slate-600 font-semibold whitespace-nowrap">
                                                {job.updatedAt ? format(new Date(job.updatedAt), 'MMM d') : '—'}
                                            </div>
                                            <div className="text-[10px] text-slate-400 whitespace-nowrap mt-0.5">
                                                {job.updatedAt ? format(new Date(job.updatedAt), 'h:mm a') : 'Just now'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Mobile row */}
                                    <div className="flex md:hidden items-center gap-3 px-4 py-3">
                                        <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0 group-hover/row:bg-blue-600 group-hover/row:text-white transition-colors">
                                            <CheckCircle2 size={14} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className="font-mono text-[11px] font-bold text-blue-600">{job.ticketNumber}</span>
                                                <span className="text-slate-300 text-xs">·</span>
                                                <span className="font-semibold text-[13px] text-slate-800 truncate">{job.deviceModel || '—'}</span>
                                            </div>
                                            <div className="text-[11px] text-slate-500 mt-0.5">
                                                <span className="font-bold text-slate-700">{job.status}</span>
                                                {job.technician ? ` · ${job.technician}` : ''}
                                            </div>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <div className="text-[11px] text-slate-400 whitespace-nowrap">
                                                {job.updatedAt ? format(new Date(job.updatedAt), 'MMM d, h:mm a') : 'Just now'}
                                            </div>
                                            <ChevronRight size={13} className="text-slate-300 group-hover/row:text-blue-500 transition-colors ml-auto mt-1" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </BentoCard>
                </motion.div>
            </div>

            {createPortal(
                <AnimatePresence>
                    {selectedCard && (
                        <>
                            {/* Blurred Backdrop */}
                            <motion.div
                                key="backdrop"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.25 }}
                                className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-md"
                                onClick={() => setSelectedCard(null)}
                            />

                            {/* Expanded Card Panel */}
                            <motion.div
                                key="panel"
                                initial={{ opacity: 0, scale: 0.85, x: cardMeta[selectedCard]?.slideFrom.x ?? 0, y: cardMeta[selectedCard]?.slideFrom.y ?? 0 }}
                                animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, x: (cardMeta[selectedCard]?.slideFrom.x ?? 0) / 2, y: (cardMeta[selectedCard]?.slideFrom.y ?? 0) / 2 }}
                                transition={{ type: "spring", stiffness: 260, damping: 25 }}
                                className="fixed z-[9999] top-1/2 left-1/2 w-[90vw] max-w-2xl max-h-[80vh] -translate-x-1/2 -translate-y-1/2 rounded-[2rem] bg-white shadow-2xl shadow-black/20 ring-1 ring-black/5 overflow-hidden flex flex-col"
                            >
                                {/* Header with gradient */}
                                <div className={`bg-gradient-to-br ${cardMeta[selectedCard]?.gradient} p-6 text-white flex items-center justify-between`}>
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                                            {cardMeta[selectedCard]?.icon}
                                        </div>
                                        <h2 className="text-xl font-bold tracking-tight">{cardMeta[selectedCard]?.title}</h2>
                                    </div>
                                    <button
                                        onClick={() => setSelectedCard(null)}
                                        className="h-9 w-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors backdrop-blur-sm"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                {/* Content */}
                                <div className="p-6 overflow-y-auto flex-1">
                                    {getPopupContent(selectedCard)}
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Per-Activity Item Popup */}
            {createPortal(
                <AnimatePresence>
                    {selectedActivity && (
                        <>
                            <motion.div
                                key="activity-backdrop"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-md"
                                onClick={() => setSelectedActivity(null)}
                            />
                            <motion.div
                                key="activity-panel"
                                initial={{ opacity: 0, scale: 0.88, y: 40 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.92, y: 20 }}
                                transition={{ type: "spring", stiffness: 280, damping: 26 }}
                                className="fixed z-[9999] top-1/2 left-1/2 w-[90vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[2rem] bg-white shadow-2xl shadow-black/20 ring-1 ring-black/5 overflow-hidden flex flex-col"
                            >
                                {/* Header */}
                                <div className="bg-gradient-to-br from-slate-700 to-slate-900 p-6 text-white flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                                            <Clock size={20} />
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-bold tracking-tight">Activity Detail</h2>
                                            <p className="text-white/60 text-xs font-mono">{selectedActivity.ticketNumber}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedActivity(null)}
                                        className="h-9 w-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors backdrop-blur-sm"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                {/* Content */}
                                <div className="p-6 space-y-4">
                                    {/* Status banner */}
                                    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-50 border border-blue-100">
                                        <CheckCircle2 size={16} className="text-blue-600 shrink-0" />
                                        <span className="text-sm text-blue-800 font-medium">Status changed to&nbsp;</span>
                                        <span className="font-bold text-blue-900 bg-blue-100 px-2 py-0.5 rounded-lg text-sm">{selectedActivity.status}</span>
                                    </div>

                                    {/* Detail grid */}
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            { label: 'Ticket', value: selectedActivity.ticketNumber, mono: true },
                                            { label: 'Device', value: selectedActivity.deviceModel || '—' },
                                            { label: 'Technician', value: selectedActivity.technician || 'Unassigned' },
                                            { label: 'Customer', value: selectedActivity.customerName || '—' },
                                        ].map(({ label, value, mono }) => (
                                            <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</div>
                                                <div className={`text-sm font-semibold text-slate-800 truncate ${mono ? 'font-mono' : ''}`}>{value}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Problem description */}
                                    {selectedActivity.problemDescription && (
                                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Problem Description</div>
                                            <p className="text-sm text-slate-700 leading-relaxed">{selectedActivity.problemDescription}</p>
                                        </div>
                                    )}

                                    {/* Timestamps */}
                                    <div className="flex gap-3">
                                        <div className="flex-1 bg-slate-50 rounded-xl p-3 border border-slate-100">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Created</div>
                                            <div className="text-xs font-semibold text-slate-700">
                                                {selectedActivity.createdAt ? format(new Date(selectedActivity.createdAt), 'MMM d, yyyy h:mm a') : '—'}
                                            </div>
                                        </div>
                                        <div className="flex-1 bg-slate-50 rounded-xl p-3 border border-slate-100">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Last Updated</div>
                                            <div className="text-xs font-semibold text-slate-700">
                                                {selectedActivity.updatedAt ? format(new Date(selectedActivity.updatedAt), 'MMM d, yyyy h:mm a') : '—'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Footer action */}
                                    <Button
                                        className="w-full rounded-xl h-10 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm gap-2"
                                        onClick={() => navigateTo('jobs', selectedActivity.ticketNumber)}
                                    >
                                        Open Full Job Ticket <ChevronRight size={15} />
                                    </Button>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </motion.div>
    );
}
