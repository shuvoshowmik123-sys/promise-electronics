import { BentoCard, BentoHeader } from "@/components/ui/bento-grid";
import { useJobOverview } from "@/hooks/use-dashboard";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Skeleton } from "@/components/ui/skeleton";
import { Users } from "lucide-react";

interface TechnicianChartWidgetProps {
    className?: string;
    colSpan?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

export const TechnicianChartWidget = ({ className, colSpan = 2 }: TechnicianChartWidgetProps) => {
    const { data: overview, isLoading } = useJobOverview();

    if (isLoading) {
        return (
            <BentoCard colSpan={colSpan} className={className}>
                <div className="space-y-4 p-6">
                    <Skeleton className="h-8 w-1/2" />
                    <Skeleton className="h-full w-full" />
                </div>
            </BentoCard>
        );
    }

    if (!overview) return null;

    const data = overview.technicianWorkloads.map(t => ({
        name: t.technician.split(' ')[0], // First name only for chart space
        jobs: t.jobs.length
    }));

    return (
        <BentoCard colSpan={colSpan} className={className + " flex flex-col"}>
            <BentoHeader title="Tech Load" icon={Users} subtitle="Active jobs per tech" />
            <div className="flex-1 min-h-[150px] w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data}>
                        <XAxis
                            dataKey="name"
                            stroke="#94a3b8"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            interval={0}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                            itemStyle={{ color: '#f8fafc' }}
                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                        />
                        <Bar dataKey="jobs" radius={[4, 4, 0, 0]}>
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#3b82f6' : '#60a5fa'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </BentoCard>
    );
};
