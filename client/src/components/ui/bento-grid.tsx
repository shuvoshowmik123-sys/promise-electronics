import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface BentoGridProps {
    children: ReactNode;
    className?: string;
}

export const BentoGrid = ({ children, className }: BentoGridProps) => {
    return (
        <div
            className={cn(
                "grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-4 auto-rows-[minmax(180px,auto)]",
                className
            )}
        >
            {children}
        </div>
    );
};

interface BentoCardProps {
    children: ReactNode;
    className?: string;
    colSpan?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    rowSpan?: 1 | 2 | 3 | 4;
    noPadding?: boolean;
}

export const BentoCard = ({
    children,
    className,
    colSpan = 1,
    rowSpan = 1,
    noPadding = false,
}: BentoCardProps) => {
    const colSpanClass = {
        1: "col-span-1 md:col-span-1",
        2: "col-span-1 md:col-span-2",
        3: "col-span-1 md:col-span-3",
        4: "col-span-1 md:col-span-4",
        5: "col-span-1 md:col-span-5",
        6: "col-span-1 md:col-span-6",
        7: "col-span-1 md:col-span-7",
        8: "col-span-1 md:col-span-8",
    };

    const rowSpanClass = {
        1: "row-span-1",
        2: "row-span-2",
        3: "row-span-3",
        4: "row-span-4",
    };

    return (
        <div
            className={cn(
                "bento-card flex flex-col overflow-hidden fade-in bg-white dark:bg-slate-950/50 backdrop-blur-sm",
                colSpanClass[colSpan],
                rowSpanClass[rowSpan],
                noPadding ? "p-0" : "p-6",
                className
            )}
        >
            {children}
        </div>
    );
};

export const BentoHeader = ({ title, subtitle, icon: Icon, action }: { title: string, subtitle?: string, icon?: any, action?: ReactNode }) => (
    <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
            {Icon && <div className="p-2 rounded-lg bg-primary/10 text-primary"><Icon className="w-4 h-4" /></div>}
            <div>
                <h3 className="font-semibold text-lg leading-tight">{title}</h3>
                {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            </div>
        </div>
        {action && <div>{action}</div>}
    </div>
);
