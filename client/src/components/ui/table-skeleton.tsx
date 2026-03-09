import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"

interface TableSkeletonProps {
    rows?: number
    columns?: number
    showAction?: boolean
}

export function TableSkeleton({ rows = 5, columns = 5, showAction = true }: TableSkeletonProps) {
    return (
        <div className="rounded-md border bg-card text-card-foreground shadow-sm">
            <Table>
                <TableHeader>
                    <TableRow>
                        {Array.from({ length: columns }).map((_, i) => (
                            <TableHead key={i}>
                                <Skeleton className="h-4 w-[100px]" />
                            </TableHead>
                        ))}
                        {showAction && (
                            <TableHead className="w-[50px]">
                                <Skeleton className="h-4 w-8" />
                            </TableHead>
                        )}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {Array.from({ length: rows }).map((_, i) => (
                        <TableRow key={i}>
                            {Array.from({ length: columns }).map((_, j) => (
                                <TableCell key={j}>
                                    <Skeleton className="h-4 w-full" />
                                </TableCell>
                            ))}
                            {showAction && (
                                <TableCell>
                                    <Skeleton className="h-8 w-8 rounded-full" />
                                </TableCell>
                            )}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
