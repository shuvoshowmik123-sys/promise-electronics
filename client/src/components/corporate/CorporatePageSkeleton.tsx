import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

/**
 * Dashboard skeleton with 4 stat cards + charts
 */
export function DashboardSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            {/* Stats row */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <Card key={i}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-4 w-4 rounded" />
                        </CardHeader>
                        <CardContent>
                            <Skeleton className="h-8 w-20 mb-2" />
                            <Skeleton className="h-3 w-32" />
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Charts row */}
            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-40" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-[300px] w-full" />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <Skeleton className="h-6 w-40" />
                    </CardHeader>
                    <CardContent>
                        <Skeleton className="h-[300px] w-full" />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

/**
 * Table skeleton for job tracker, notifications list
 */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="space-y-4">
            {/* Search/filter bar */}
            <div className="flex gap-2">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 w-32" />
            </div>

            {/* Table */}
            <div className="border rounded-lg overflow-hidden">
                {/* Header */}
                <div className="bg-slate-50 border-b p-4">
                    <div className="flex gap-4">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-28" />
                    </div>
                </div>

                {/* Rows */}
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="border-b last:border-b-0 p-4">
                        <div className="flex gap-4 items-center">
                            <Skeleton className="h-5 w-20" />
                            <Skeleton className="h-5 w-40" />
                            <Skeleton className="h-6 w-16 rounded-full" />
                            <Skeleton className="h-5 w-24" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * Chat/Messages skeleton
 */
export function ChatSkeleton() {
    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="border-b p-4">
                <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-3 w-24" />
                    </div>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 p-4 space-y-4 overflow-hidden">
                {/* Received message */}
                <div className="flex gap-2">
                    <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                    <div className="space-y-2 flex-1 max-w-[70%]">
                        <Skeleton className="h-16 w-full rounded-2xl" />
                        <Skeleton className="h-3 w-20" />
                    </div>
                </div>

                {/* Sent message */}
                <div className="flex gap-2 justify-end">
                    <div className="space-y-2 flex-1 max-w-[70%] items-end flex flex-col">
                        <Skeleton className="h-12 w-full rounded-2xl" />
                        <Skeleton className="h-3 w-16" />
                    </div>
                </div>

                {/* Received message */}
                <div className="flex gap-2">
                    <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                    <div className="space-y-2 flex-1 max-w-[70%]">
                        <Skeleton className="h-20 w-full rounded-2xl" />
                        <Skeleton className="h-3 w-20" />
                    </div>
                </div>
            </div>

            {/* Input area */}
            <div className="border-t p-4">
                <div className="flex gap-2">
                    <Skeleton className="h-10 flex-1 rounded-full" />
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <Skeleton className="h-10 w-10 rounded-full" />
                </div>
            </div>
        </div>
    );
}

/**
 * Profile skeleton
 */
export function ProfileSkeleton() {
    return (
        <div className="space-y-6">
            {/* Header card */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex items-center gap-4">
                        <Skeleton className="h-20 w-20 rounded-full" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-6 w-48" />
                            <Skeleton className="h-4 w-32" />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Info cards */}
            <div className="grid gap-4 md:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                    <Card key={i}>
                        <CardHeader>
                            <Skeleton className="h-5 w-32" />
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-3/4" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}

/**
 * Generic content skeleton (fallback)
 */
export function GenericSkeleton() {
    return (
        <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />

            <div className="pt-4 space-y-3">
                <Skeleton className="h-32 w-full rounded-lg" />
                <Skeleton className="h-32 w-full rounded-lg" />
            </div>
        </div>
    );
}
