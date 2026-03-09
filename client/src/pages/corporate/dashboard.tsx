
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { corporatePortalApi } from "@/lib/api";
import { corporateQueryConfig } from "@/lib/corporateApiErrorHandler";
import {
    Loader2,
    Activity,
    Clock,
    CreditCard,
    Wrench,
    TrendingUp,
    ArrowUpRight,
    ArrowDownRight,
    Calendar,
    ChevronRight,
    Search,
    MessageSquare
} from "lucide-react";
import { useCorporateAuth } from "@/contexts/CorporateAuthContext";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { variants } from "@/lib/motion";
import { DashboardSkeleton } from "@/components/corporate/CorporatePageSkeleton";
import React, { Suspense } from "react";

// Lazy load heavy chart components
const DashboardCharts = React.lazy(() => import("@/components/corporate/dashboard/DashboardCharts"));

export default function CorporateDashboard() {
    const { user } = useCorporateAuth();

    const { data: stats, isLoading } = useQuery({
        queryKey: ["corporateDashboard"],
        queryFn: corporatePortalApi.getDashboardStats,
        refetchInterval: 30000, // Refresh every 30s
        ...corporateQueryConfig
    });

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-BD', {
            style: 'currency',
            currency: 'BDT',
            minimumFractionDigits: 0
        }).format(amount);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full min-h-[400px]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-[var(--corp-blue)]" />
                    <p className="text-slate-400 animate-pulse">Loading your insights...</p>
                </div>
            </div>
        );
    }

    // Mock trend data for visualization
    const chartData = [
        { name: 'Mon', jobs: 4, spent: 12000 },
        { name: 'Tue', jobs: 7, spent: 18500 },
        { name: 'Wed', jobs: 5, spent: 11000 },
        { name: 'Thu', jobs: 9, spent: 22000 },
        { name: 'Fri', jobs: 12, spent: 31000 },
        { name: 'Sat', jobs: 8, spent: 24000 },
        { name: 'Sun', jobs: 6, spent: 15000 },
    ];

    const statusData = [
        { name: 'Active', value: stats?.activeJobs || 0, color: 'var(--corp-blue)' },
        { name: 'Pending', value: stats?.pendingApprovals || 0, color: '#f59e0b' },
        { name: 'Completed', value: stats?.recentActivity?.filter((a: any) => a.status === 'Completed').length || 0, color: '#10b981' },
    ];

    const containerVariants = {
        hidden: variants.staggerContainer.initial as any,
        visible: variants.staggerContainer.animate as any
    };

    const itemVariants = {
        hidden: variants.staggerItem.initial as any,
        visible: variants.staggerItem.animate as any
    };

    return (
        <motion.div
            className="space-y-8 pb-10"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
                        Welcome back, <span className="text-[var(--corp-blue)]">{user?.name?.split(" ")[0]}</span>!
                    </h1>
                    <p className="text-slate-500 mt-2 flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Today is {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </p>
                </div>
                <div className="flex gap-4">
                    <Link href="/corporate/messages">
                        <Button className="bg-[var(--corp-blue)] text-white hover:bg-[var(--corp-blue-hover)] shadow-lg shadow-blue-200 h-12 px-6 rounded-xl corp-btn-glow font-semibold transition-all">
                            <MessageSquare className="mr-2 h-5 w-5" /> Message Center
                        </Button>
                    </Link>
                    <Link href="/corporate/service-request">
                        <Button variant="outline" className="border-slate-200 text-slate-600 hover:bg-slate-50 h-12 px-6 rounded-xl font-semibold transition-all">
                            <Wrench className="mr-2 h-5 w-5" /> Request Service
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <motion.div variants={itemVariants}>
                    <Card className="border-none shadow-sm bg-white overflow-hidden relative group">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-[var(--corp-blue)]"></div>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Active Jobs</CardTitle>
                            <div className="p-2 bg-blue-50 rounded-lg group-hover:bg-[var(--corp-blue)] group-hover:text-white transition-colors duration-300">
                                <Activity className="h-5 w-5 text-[var(--corp-blue)] group-hover:text-white" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-baseline gap-2">
                                <div className="text-4xl font-black text-slate-900">{stats?.activeJobs || 0}</div>
                            </div>
                            <p className="text-xs text-slate-400 mt-2">Repairs currently in progress</p>
                        </CardContent>
                    </Card>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <Card className="border-none shadow-sm bg-white overflow-hidden relative group">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500"></div>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Pending Approvals</CardTitle>
                            <div className="p-2 bg-amber-50 rounded-lg group-hover:bg-amber-500 group-hover:text-white transition-colors duration-300">
                                <Clock className="h-5 w-5 text-amber-500 group-hover:text-white" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-baseline gap-2">
                                <div className="text-4xl font-black text-slate-900">{stats?.pendingApprovals || 0}</div>
                                {stats?.pendingApprovals && stats.pendingApprovals > 0 ? (
                                    <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-100 text-[10px] py-0">Urgent</Badge>
                                ) : null}
                            </div>
                            <p className="text-xs text-slate-400 mt-2">Waiting for your verification</p>
                        </CardContent>
                    </Card>
                </motion.div>

                <motion.div variants={itemVariants}>
                    <Card className="border-none shadow-sm bg-white overflow-hidden relative group">
                        <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500"></div>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Spend (Month)</CardTitle>
                            <div className="p-2 bg-emerald-50 rounded-lg group-hover:bg-emerald-500 group-hover:text-white transition-colors duration-300">
                                <CreditCard className="h-5 w-5 text-emerald-500 group-hover:text-white" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-baseline gap-2">
                                <div className="text-3xl font-black text-slate-900">{formatCurrency(stats?.totalSpentMonth || 0)}</div>
                            </div>
                            <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                                Current billing cycle spend
                            </p>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            {/* Charts Section */}
            <Suspense fallback={
                <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-5">
                    <div className="lg:col-span-3 h-[400px] bg-white rounded-xl animate-pulse" />
                    <div className="lg:col-span-2 h-[400px] bg-white rounded-xl animate-pulse" />
                </div>
            }>
                <DashboardCharts
                    chartData={chartData}
                    statusData={statusData}
                    itemVariants={itemVariants}
                />
            </Suspense>

            {/* Recent Activity Section */}
            <motion.div variants={itemVariants}>
                <Card className="border-none shadow-sm bg-white overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-xl">Recent Activity</CardTitle>
                            <CardDescription>Track chronological updates for your repairs</CardDescription>
                        </div>
                        <Link href="/corporate/jobs">
                            <Button variant="ghost" className="text-[var(--corp-blue)] font-bold text-sm hover:bg-blue-50 hover:text-[var(--corp-blue-hover)] corp-btn-glow">
                                View History <ChevronRight className="ml-1 h-4 w-4" />
                            </Button>
                        </Link>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="px-6 pb-6">
                            {stats?.recentActivity && stats.recentActivity.length > 0 ? (
                                <div className="divide-y divide-slate-50">
                                    {stats.recentActivity.map((activity: any, idx: number) => (
                                        <motion.div
                                            key={activity.id}
                                            className="py-5 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-slate-50/50 transition-colors rounded-xl px-2 group"
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.05 }}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:shadow-md transition-all duration-300">
                                                    <Activity className={`h-6 w-6 ${activity.status === "Completed" ? "text-emerald-500" :
                                                        activity.status === "In Progress" ? "text-[var(--corp-blue)]" :
                                                            "text-amber-500"
                                                        }`} />
                                                </div>
                                                <div className="space-y-1">
                                                    <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                                        {activity.device}
                                                        <span className="text-[10px] text-slate-400 font-mono tracking-tighter">#{activity.id.substring(0, 8)}</span>
                                                    </h4>
                                                    <p className="text-xs text-slate-400 flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        Last update: {new Date(activity.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(activity.updatedAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 mt-4 sm:mt-0">
                                                <Badge className={`
                                                    rounded-full px-3 py-1 border-none shadow-sm text-[10px] font-extrabold uppercase tracking-widest
                                                    ${activity.status === "Pending" ? "bg-amber-100 text-amber-700" :
                                                        activity.status === "In Progress" ? "bg-blue-100 text-[var(--corp-blue)]" :
                                                            activity.status === "Completed" ? "bg-emerald-100 text-emerald-700" :
                                                                "bg-slate-100 text-slate-700"}
                                                `}>
                                                    {activity.status}
                                                </Badge>
                                                <Link href={`/corporate/jobs/${activity.id}`}>
                                                    <Button variant="outline" size="sm" className="h-9 px-4 rounded-full text-xs font-bold border-slate-100 hover:border-[var(--corp-blue)] hover:text-[var(--corp-blue)] corp-btn-glow">
                                                        Details
                                                    </Button>
                                                </Link>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-100">
                                    <div className="mx-auto w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-slate-300 mb-4">
                                        <Search className="h-8 w-8" />
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-700">No Recent Activity</h3>
                                    <p className="text-slate-400 text-sm max-w-xs mx-auto mt-2">Any new service requests or status updates will appear here in real-time.</p>
                                    <Link href="/corporate/service-request">
                                        <Button className="mt-6 bg-[var(--corp-blue)] corp-btn-glow rounded-xl">Create Request</Button>
                                    </Link>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </motion.div >
    );
}
