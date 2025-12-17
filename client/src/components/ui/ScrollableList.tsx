import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ScrollableListProps {
    children: ReactNode;
    className?: string;
}

export function ScrollableList({ children, className }: ScrollableListProps) {
    return (
        <div className={cn("overflow-x-auto scrollbar-hide", className)}>
            {children}
        </div>
    );
}
