import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell
} from "recharts";
import { Calendar as CalendarIcon, Download, Loader2, TrendingUp, AlertCircle, Clock } from "lucide-react";
import { DateRange } from "react-day-picker";
import { addDays, format, subDays } from "date-fns";
import { motion } from "framer-motion";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { BentoCard } from "../shared/BentoCard";
import { containerVariants, itemVariants } from "../shared/animations";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function QualityAnalyticsTab() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: subDays(new Date(), 30),
        to: new Date(),
    });

    const queryParams = new URLSearchParams({
        startDate: dateRange?.from?.toISOString() || "",
        endDate: dateRange?.to?.toISOString() || "",
    }).toString();

    // Fetch Defect Stats
    const { data: defectStats, isLoading: isLoadingDefects } = useQuery({
        queryKey: ["analytics-defects", dateRange],
        queryFn: async () => {
            const res = await fetch(`/api/analytics/defects?${queryParams}`);
            if (!res.ok) throw new Error("Failed to fetch defect stats");
            return res.json();
        },
    });

    // Fetch Technician Performance
    const { data: techPerformance, isLoading: isLoadingPerformance } = useQuery({
        queryKey: ["analytics-performance", dateRange],
        queryFn: async () => {
            const res = await fetch(`/api/analytics/performance?${queryParams}`);
            if (!res.ok) throw new Error("Failed to fetch performance stats");
            return res.json();
        },
    });

    // Fetch Supplier Defect Stats
    const { data: supplierDefects, isLoading: isLoadingSupplierDefects } = useQuery({
        queryKey: ["analytics-supplier-defects", dateRange],
        queryFn: async () => {
            const res = await fetch(`/api/analytics/supplier-defects?${queryParams}`);
            if (!res.ok) throw new Error("Failed to fetch supplier defect stats");
            return res.json();
        },
    });

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6"
        >
            {/* Header */}
            <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Quality Analytics</h2>
                    <p className="text-muted-foreground">Defect tracking & performance insights</p>
                </div>
                <div className="flex items-center gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className={cn(
                                    "w-[260px] justify-start text-left font-normal bg-white",
                                    !dateRange && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateRange?.from ? (
                                    dateRange.to ? (
                                        <>
                                            {format(dateRange.from, "LLL dd, y")} -{" "}
                                            {format(dateRange.to, "LLL dd, y")}
                                        </>
                                    ) : (
                                        format(dateRange.from, "LLL dd, y")
                                    )
                                ) : (
                                    <span>Pick a date</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                                initialFocus
                                mode="range"
                                defaultMonth={dateRange?.from}
                                selected={dateRange}
                                onSelect={setDateRange}
                                numberOfMonths={2}
                            />
                        </PopoverContent>
                    </Popover>
                    <Button variant="outline">
                        <Download className="mr-2 h-4 w-4" />
                        Download
                    </Button>
                </div>
            </motion.div>

            {/* Stats Grid */}
            <div className="grid gap-4 md:grid-cols-3">
                <motion.div variants={itemVariants}>
                    <BentoCard
                        title="Total Repairs"
                        icon={<TrendingUp className="w-5 h-5" />}
                        className="bg-gradient-to-br from-blue-500 to-indigo-600"
                        variant="vibrant"
                        spotlightColor="rgba(255,255,255,0.2)"
                    >
                        <div className="text-3xl font-black tracking-tighter text-white drop-shadow-md font-mono mt-8">{isLoadingPerformance ? "..." : techPerformance?.reduce((acc: any, curr: any) => acc + curr.jobs, 0) || "0"}</div>
                        <div className="text-white/70 text-sm mt-2">In selected period</div>
                    </BentoCard>
                </motion.div>
                <motion.div variants={itemVariants}>
                    <BentoCard
                        title="Avg. Turnaround"
                        icon={<Clock className="w-5 h-5" />}
                        variant="glass"
                    >
                        <div className="text-3xl font-black tracking-tighter text-slate-800 drop-shadow-sm font-mono mt-8">{isLoadingPerformance ? "..." : `${(techPerformance?.reduce((acc: any, curr: any) => acc + curr.avgTimeHours, 0) / (techPerformance?.length || 1)).toFixed(1)} h`}</div>
                        <div className="text-slate-500 text-sm mt-2">Average repair time</div>
                    </BentoCard>
                </motion.div>
                <motion.div variants={itemVariants}>
                    <BentoCard
                        title="Top Defect"
                        icon={<AlertCircle className="w-5 h-5" />}
                        variant="glass"
                    >
                        <div className="text-3xl font-black tracking-tighter text-slate-800 drop-shadow-sm font-mono mt-8">{isLoadingDefects ? "..." : defectStats?.[0]?.name || "N/A"}</div>
                        <div className="text-slate-500 text-sm mt-2">Most common issue</div>
                    </BentoCard>
                </motion.div>
            </div>

            {/* Charts Grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <motion.div variants={itemVariants} className="col-span-4">
                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle>Technician Performance</CardTitle>
                            <CardDescription>
                                Completed jobs vs average time per job
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="h-[350px]">
                            {isLoadingPerformance ? (
                                <div className="flex h-full items-center justify-center">
                                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={techPerformance}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="technician" axisLine={false} tickLine={false} fontSize={12} />
                                        <YAxis yAxisId="left" orientation="left" axisLine={false} tickLine={false} fontSize={12} />
                                        <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} fontSize={12} stroke="#10b981" />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                        />
                                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                        <Bar yAxisId="left" dataKey="jobs" name="Jobs Completed" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                        <Bar yAxisId="right" dataKey="avgTimeHours" name="Avg Time (Hours)" fill="#10b981" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>

                <motion.div variants={itemVariants} className="col-span-3">
                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle>Defect Distribution</CardTitle>
                            <CardDescription>
                                Breakdown of reported problems
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="h-[350px]">
                            {isLoadingDefects ? (
                                <div className="flex h-full items-center justify-center">
                                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={defectStats}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={5}
                                            dataKey="value"
                                            animationBegin={200}
                                            animationDuration={1000}
                                        >
                                            {defectStats?.map((entry: any, index: number) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                        />
                                        <Legend
                                            layout="vertical"
                                            verticalAlign="middle"
                                            align="right"
                                            wrapperStyle={{ fontSize: '12px' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Supplier Defects Chart */}
                <motion.div variants={itemVariants} className="col-span-1 md:col-span-2 lg:col-span-7 mt-4">
                    <Card className="h-full">
                        <CardHeader>
                            <CardTitle>Supplier Defect Report</CardTitle>
                            <CardDescription>
                                Factory defects and DOAs grouped by component supplier
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="h-[350px]">
                            {isLoadingSupplierDefects ? (
                                <div className="flex h-full items-center justify-center">
                                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : supplierDefects?.length === 0 ? (
                                <div className="flex h-full items-center justify-center text-slate-500">
                                    No factory defects reported in this period.
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={supplierDefects} layout="vertical" margin={{ left: 40 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" axisLine={false} tickLine={false} fontSize={12} />
                                        <YAxis type="category" dataKey="supplier" axisLine={false} tickLine={false} fontSize={12} width={100} />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                            formatter={(value: any, name: string) => [
                                                name === 'financialLoss' ? `৳${Number(value).toLocaleString()}` : value,
                                                name === 'defectCount' ? 'Defects' : 'Financial Loss'
                                            ]}
                                        />
                                        <Legend wrapperStyle={{ paddingTop: '10px' }} />
                                        <Bar dataKey="defectCount" name="Defect Count" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={20} />
                                        <Bar dataKey="financialLoss" name="Financial Loss (৳)" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={20} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        </motion.div>
    );
}
