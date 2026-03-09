import { BentoCard, BentoHeader } from "@/components/ui/bento-grid";
import { useRecentActivity } from "@/hooks/use-dashboard";
import { Activity, Wrench, DollarSign, CheckCircle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

interface ActivityFeedProps {
    className?: string;
    colSpan?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

export const ActivityFeed = ({ className, colSpan = 4 }: ActivityFeedProps) => {
    const { data, isLoading } = useRecentActivity();

    if (isLoading) {
        return (
            <BentoCard colSpan={colSpan} className={className}>
                <div className="space-y-4 p-6">
                    <Skeleton className="h-8 w-1/3" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            </BentoCard>
        );
    }

    const logs = data?.activityLogs || [];

    const getIcon = (type: string) => {
        switch (type) {
            case "job": return <Wrench className="w-4 h-4 text-blue-500" />;
            case "payment": return <DollarSign className="w-4 h-4 text-green-500" />;
            default: return <Activity className="w-4 h-4 text-slate-400" />;
        }
    };

    return (
        <BentoCard colSpan={colSpan} className={className}>
            <BentoHeader title="Recent Activity" icon={Clock} subtitle="Latest system events" />
            <div className="space-y-4">
                {logs.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No recent activity.</p>
                ) : (
                    logs.slice(0, 5).map((log, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-800">
                            <div className="mt-0.5 p-2 rounded-full bg-slate-100 dark:bg-slate-800">
                                {getIcon(log.type)}
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{log.action}</p>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-muted-foreground">{log.user}</span>
                                    <span className="text-xs text-slate-300">•</span>
                                    <time className="text-xs text-muted-foreground">
                                        {formatDistanceToNow(new Date(log.time), { addSuffix: true })}
                                    </time>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </BentoCard>
    );
};
