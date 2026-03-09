import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function CardSkeleton({ className }: { className?: string }) {
    return (
        <Card className={className}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                    <Skeleton className="h-4 w-[100px]" />
                </CardTitle>
                <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">
                    <Skeleton className="h-8 w-[60px] mt-2" />
                </div>
                <Skeleton className="h-3 w-[140px] mt-2" />
            </CardContent>
        </Card>
    )
}

export function ChartSkeleton({ className }: { className?: string }) {
    return (
        <Card className={`col-span-4 ${className || ''}`}>
            <CardHeader>
                <CardTitle><Skeleton className="h-6 w-[150px]" /></CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
                <Skeleton className="h-[350px] w-full" />
            </CardContent>
        </Card>
    )
}
