import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from "recharts";
import { motion } from "framer-motion";
import { CheckCircle2, ArrowUpRight } from "lucide-react";

interface DashboardChartsProps {
    chartData: any[];
    statusData: any[];
    itemVariants: any;
}

const DashboardCharts: React.FC<DashboardChartsProps> = ({ chartData, statusData, itemVariants }) => {
    return (
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-5">
            {/* Main Activity Chart */}
            <motion.div variants={itemVariants} className="lg:col-span-3">
                <Card className="border-none shadow-sm bg-white h-[400px]">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-lg">Service Distribution</CardTitle>
                                <CardDescription>Repairs handled throughout the week</CardDescription>
                            </div>
                            <div className="flex gap-2">
                                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                    <div className="w-2.5 h-2.5 rounded-full bg-[var(--corp-blue)]"></div>
                                    <span>Jobs</span>
                                </div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="h-[300px] w-full pb-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="colorJobs" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--corp-blue)" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="var(--corp-blue)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 12, fill: '#94a3b8' }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 12, fill: '#94a3b8' }}
                                />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    cursor={{ stroke: 'var(--corp-blue)', strokeWidth: 2 }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="jobs"
                                    stroke="var(--corp-blue)"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorJobs)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Status Breakthrough */}
            <motion.div variants={itemVariants} className="lg:col-span-2">
                <Card className="border-none shadow-sm bg-white h-[400px]">
                    <CardHeader>
                        <CardTitle className="text-lg">Performance Load</CardTitle>
                        <CardDescription>Real-time status breakdown</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {statusData.map((item) => (
                            <div key={item.name} className="space-y-2 group">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500 font-medium group-hover:text-slate-900 transition-colors uppercase tracking-tight text-xs">{item.name}</span>
                                    <span className="font-bold text-slate-800">{item.value}</span>
                                </div>
                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${(item.value / 25) * 100}%` }}
                                        transition={{ duration: 1, ease: "easeOut" }}
                                        className="h-full rounded-full shadow-[0_0_10px_rgba(0,0,0,0.1)]"
                                        style={{ backgroundColor: item.color }}
                                    />
                                </div>
                            </div>
                        ))}
                        <div className="pt-6 border-t border-slate-50">
                            <div className="bg-slate-50 p-4 rounded-xl flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-100 rounded-lg">
                                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">100% Reliability</p>
                                        <p className="text-[10px] text-slate-400">System Uptime verified</p>
                                    </div>
                                </div>
                                <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
};

export default DashboardCharts;
