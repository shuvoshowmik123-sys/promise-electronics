import { cn } from "@/lib/utils";

interface SkeletonProps {
    className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
    return (
        <div className={cn("animate-pulse rounded-md bg-[var(--color-native-border)]/50", className)} />
    );
}

export function RepairCardSkeleton() {
    return (
        <div className="w-full p-4 bg-[var(--color-native-card)] rounded-2xl animate-pulse shadow-sm border border-[var(--color-native-border)]">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[var(--color-native-border)]/50 rounded-xl" />
                <div className="flex-1 space-y-2">
                    <div className="h-4 bg-[var(--color-native-border)]/50 rounded w-3/4" />
                    <div className="h-3 bg-[var(--color-native-border)]/30 rounded w-1/2" />
                </div>
            </div>
            <div className="mt-4 h-2 bg-[var(--color-native-border)]/30 rounded-full w-full" />
        </div>
    );
}
