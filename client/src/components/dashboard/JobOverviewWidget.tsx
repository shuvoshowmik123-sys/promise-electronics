import { BentoCard, BentoHeader } from "@/components/ui/bento-grid";
import { useJobOverview } from "@/hooks/use-dashboard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Users, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface JobOverviewWidgetProps {
    className?: string;
    colSpan?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    rowSpan?: 1 | 2 | 3 | 4;
}

export const JobOverviewWidget = ({
    className,
    colSpan = 3,
    rowSpan = 2,
}: JobOverviewWidgetProps) => {
    const { data: overview, isLoading } = useJobOverview();

    if (isLoading) {
        return (
            <BentoCard colSpan={colSpan} rowSpan={rowSpan} className={className}>
                <div className="space-y-4 p-6">
                    <Skeleton className="h-8 w-1/2" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                </div>
            </BentoCard>
        );
    }

    if (!overview) return null;

    return (
        <BentoCard colSpan={colSpan} rowSpan={rowSpan} noPadding className={className}>
            <div className="p-6 h-full flex flex-col">
                <BentoHeader
                    title="Technician Workload"
                    subtitle={`${overview.stats.totalDueThisWeek} jobs due this week`}
                    icon={Users}
                />

                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                    {overview.technicianWorkloads.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                            <p>No active jobs</p>
                        </div>
                    ) : (
                        overview.technicianWorkloads.map((tech) => (
                            <div key={tech.technician} className="flex items-start gap-4 p-3 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                                <Avatar className="h-10 w-10 border-2 border-white dark:border-slate-800 shadow-sm">
                                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                        {tech.technician.substring(0, 2).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-1">
                                        <h4 className="font-medium text-sm truncate">{tech.technician}</h4>
                                        <Badge variant="secondary" className="text-xs h-5">
                                            {tech.jobs.length} Active
                                        </Badge>
                                    </div>
                                    <div className="space-y-1">
                                        {tech.jobs.slice(0, 2).map(job => (
                                            <div key={job.id} className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>
                                                <span className="font-mono opacity-70">#{job.id}</span>
                                                <span className="truncate">{job.device}</span>
                                            </div>
                                        ))}
                                        {tech.jobs.length > 2 && (
                                            <p className="text-[10px] text-muted-foreground pl-3">
                                                +{tech.jobs.length - 2} more jobs
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </BentoCard>
    );
};
