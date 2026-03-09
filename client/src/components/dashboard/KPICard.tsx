import { BentoCard } from "@/components/ui/bento-grid";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface KPICardProps {
    title: string;
    value: string | number;
    icon: LucideIcon;
    trend?: string;
    trendUp?: boolean;
    trendDown?: boolean;
    color?: "blue" | "green" | "orange" | "purple" | "red";
    description?: string;
    className?: string;
    colSpan?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

export const KPICard = ({
    title,
    value,
    icon: Icon,
    trend,
    trendUp,
    trendDown,
    color = "blue",
    description,
    className,
    colSpan = 1,
}: KPICardProps) => {
    const colorStyles = {
        blue: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400",
        green: "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400",
        orange: "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400",
        purple: "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400",
        red: "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400",
    };

    return (
        <BentoCard colSpan={colSpan} className={className}>
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
                    <h3 className="text-2xl font-bold tracking-tight">{value}</h3>
                    {(trend || description) && (
                        <div className="flex items-center gap-2 mt-1 text-xs">
                            {trend && (
                                <span
                                    className={cn(
                                        "font-medium",
                                        trendUp && "text-green-600",
                                        trendDown && "text-red-600",
                                        !trendUp && !trendDown && "text-muted-foreground"
                                    )}
                                >
                                    {trend}
                                </span>
                            )}
                            {description && <span className="text-muted-foreground opacity-80">{description}</span>}
                        </div>
                    )}
                </div>
                <div className={cn("p-2.5 rounded-xl", colorStyles[color])}>
                    <Icon className="w-5 h-5" />
                </div>
            </div>
        </BentoCard>
    );
};
