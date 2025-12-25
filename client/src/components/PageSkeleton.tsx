import { Skeleton } from "@/components/ui/skeleton";

export function PageSkeleton() {
    return (
        <div className="p-4 space-y-4 h-full overflow-hidden">
            {/* Hero / Banner Area */}
            <Skeleton className="h-48 w-full rounded-xl" />

            {/* Title Area */}
            <div className="space-y-2">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-2 gap-4 pt-4">
                <Skeleton className="h-32 rounded-lg" />
                <Skeleton className="h-32 rounded-lg" />
                <Skeleton className="h-32 rounded-lg" />
                <Skeleton className="h-32 rounded-lg" />
            </div>

            {/* List Items */}
            <div className="space-y-3 pt-4">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
            </div>
        </div>
    );
}
