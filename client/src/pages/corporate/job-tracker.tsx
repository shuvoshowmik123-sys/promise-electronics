
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { corporatePortalApi } from "@/lib/api";
import { corporateQueryConfig } from "@/lib/corporateApiErrorHandler";
import {
    Loader2,
    Search,
    Filter,
    MonitorCheck,
    Printer,
    ArrowRight,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    Clock,
    CheckCircle2,
    AlertCircle,
    Package,
    ArrowUpRight
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";


export default function CorporateJobTracker() {
    const [page, setPage] = useState(1);
    const [limit] = useState(10);
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [searchTerm, setSearchTerm] = useState("");

    const { data, isLoading } = useQuery({
        queryKey: ["corporateJobs", page, limit, statusFilter],
        queryFn: () => corporatePortalApi.getJobs({
            page,
            limit,
            status: statusFilter === "all" ? undefined : statusFilter
        }),
        refetchInterval: 30000,
        ...corporateQueryConfig
    });

    const getStatusConfig = (status: string) => {
        switch (status) {
            case "Pending":
                return { icon: Clock, class: "bg-amber-50 text-amber-600 border-amber-100", label: "Waiting" };
            case "In Progress":
                return { icon: Clock, class: "bg-blue-50 text-[var(--corp-blue)] border-blue-100", label: "Working" };
            case "Completed":
                return { icon: CheckCircle2, class: "bg-emerald-50 text-emerald-600 border-emerald-100", label: "Fixed" };
            case "Delivered":
                return { icon: Package, class: "bg-purple-50 text-purple-600 border-purple-100", label: "Sent" };
            case "Cancelled":
                return { icon: AlertCircle, class: "bg-rose-50 text-rose-600 border-rose-100", label: "Closed" };
            default:
                return { icon: MonitorCheck, class: "bg-slate-50 text-slate-600 border-slate-100", label: status };
        }
    };

    return (
        <div className="space-y-8 pb-10 animate-in fade-in slide-in-from-bottom-4">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Job Tracker</h1>
                    <p className="text-slate-500 mt-1 flex items-center gap-2">
                        <MonitorCheck className="h-4 w-4 text-[var(--corp-blue)]" />
                        Managing {data?.pagination?.total || 0} active repair tickets
                    </p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-80">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Find by ID or Serial..."
                            className="pl-10 h-11 bg-white border-slate-100 focus:border-[var(--corp-blue)] rounded-xl shadow-sm transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[160px] h-11 bg-white border-slate-100 rounded-xl shadow-sm">
                            <Filter className="h-4 w-4 mr-2 text-slate-400" />
                            <SelectValue placeholder="All Status" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-slate-100">
                            <SelectItem value="all">Every State</SelectItem>
                            <SelectItem value="Pending">Pending</SelectItem>
                            <SelectItem value="In Progress">In Progress</SelectItem>
                            <SelectItem value="Completed">Completed</SelectItem>
                            <SelectItem value="Delivered">Delivered</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Table Card */}
            <Card className="border-none shadow-sm overflow-hidden bg-white rounded-2xl">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-slate-50/50">
                                <TableRow className="hover:bg-transparent border-slate-50">
                                    <TableHead className="w-[140px] font-bold text-slate-500 text-xs uppercase tracking-wider pl-8">Job ID</TableHead>
                                    <TableHead className="font-bold text-slate-500 text-xs uppercase tracking-wider">Requested On</TableHead>
                                    <TableHead className="font-bold text-slate-500 text-xs uppercase tracking-wider">Device Model</TableHead>
                                    <TableHead className="font-bold text-slate-500 text-xs uppercase tracking-wider">Serial Number</TableHead>
                                    <TableHead className="font-bold text-slate-500 text-xs uppercase tracking-wider">Current Status</TableHead>
                                    <TableHead className="text-right pr-8 font-bold text-slate-500 text-xs uppercase tracking-wider">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>

                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-64 text-center">
                                            <div className="flex flex-col items-center justify-center gap-3">
                                                <Loader2 className="h-10 w-10 animate-spin text-[var(--corp-blue)]" />
                                                <p className="text-slate-400 text-sm font-medium">Fetching job list...</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (data?.items?.length === 0 || !data?.items) ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-64 text-center">
                                            <div className="flex flex-col items-center justify-center gap-4">
                                                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-200">
                                                    <Package className="h-8 w-8" />
                                                </div>
                                                <div>
                                                    <p className="text-slate-600 font-bold">No Records Found</p>
                                                    <p className="text-slate-400 text-sm mt-1">Try adjusting your filters or search terms.</p>
                                                </div>
                                                <Button variant="outline" className="rounded-xl corp-btn-glow" onClick={() => { setSearchTerm(""); setStatusFilter("all"); }}>
                                                    Reset Filters
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    data?.items
                                        ?.filter((job: any) => {
                                            if (!searchTerm) return true;
                                            const searchLower = searchTerm.toLowerCase();
                                            return (
                                                job.corporateJobNumber?.toLowerCase().includes(searchLower) ||
                                                job.id?.toLowerCase().includes(searchLower) ||
                                                job.device?.toLowerCase().includes(searchLower) ||
                                                job.tvSerialNumber?.toLowerCase().includes(searchLower)
                                            );
                                        })
                                        .map((job: any, idx: number) => {
                                            const config = getStatusConfig(job.status);
                                            const isOptimistic = (job as any).isOptimistic;

                                            return (
                                                <TableRow
                                                    key={job.id}
                                                    className={cn(
                                                        "group hover:bg-slate-50/50 transition-all border-slate-50 cursor-default",
                                                        isOptimistic && "opacity-70 bg-slate-50/80"
                                                    )}
                                                >
                                                    <TableCell className="pl-8 py-5">
                                                        <div className="flex flex-col">
                                                            <span className="font-black text-slate-900 text-sm">
                                                                {isOptimistic ? "Creating..." : (job.corporateJobNumber || job.id?.substring(0, 8))}
                                                            </span>
                                                            {!isOptimistic && (
                                                                <span className="text-[10px] text-slate-400 font-mono tracking-tighter">REF: {job.id.substring(0, 6)}</span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2 text-slate-600 text-sm font-medium">
                                                            {new Date(job.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="font-bold text-slate-800 text-sm">
                                                            {job.device}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <code className="text-[10px] bg-slate-50 px-2 py-1 rounded text-slate-500 font-mono">
                                                            {job.tvSerialNumber}
                                                        </code>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col gap-1.5 items-end">
                                                            {isOptimistic ? (
                                                                <Badge className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-none bg-slate-100 text-slate-500 border-slate-200">
                                                                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                                                                    Syncing
                                                                </Badge>
                                                            ) : (
                                                                <Badge className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-none ${config.class}`}>
                                                                    <config.icon className="w-3 h-3 mr-1.5" />
                                                                    {config.label}
                                                                </Badge>
                                                            )}
                                                            {job.priority && job.priority !== 'Medium' && (
                                                                <Badge variant="outline" className={cn(
                                                                    "px-2 py-0 h-5 text-[9px] font-bold uppercase",
                                                                    job.priority === 'Critical' ? "bg-red-50 text-red-600 border-red-200" :
                                                                        job.priority === 'High' ? "bg-orange-50 text-orange-600 border-orange-200" :
                                                                            "bg-slate-50 text-slate-500 border-slate-200"
                                                                )}>
                                                                    Priority: {job.priority}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right pr-8">
                                                        <Link href={isOptimistic ? "#" : `/corporate/jobs/${job.id}`}>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                disabled={isOptimistic}
                                                                className="h-9 px-4 rounded-full text-xs font-bold text-[var(--corp-blue)] hover:bg-blue-50 corp-btn-glow group-hover:translate-x-1 transition-transform"
                                                            >
                                                                View <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                                                            </Button>
                                                        </Link>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                )}

                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Premium Pagination */}
            {data && data.pagination && data.pagination.pages > 1 && (
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-4">
                        <p className="text-sm font-medium text-slate-500">
                            Showing <span className="text-slate-900">{(page - 1) * limit + 1}</span> to <span className="text-slate-900">{Math.min(page * limit, data.pagination.total)}</span> of <span className="text-slate-900">{data.pagination.total}</span> jobs
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 rounded-xl border-slate-100 bg-white shadow-sm hover:border-[var(--corp-blue)] hover:text-[var(--corp-blue)] disabled:opacity-30 corp-btn-glow"
                            disabled={page <= 1}
                            onClick={() => { setPage(p => p - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            aria-label="Previous page"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </Button>
                        <div className="flex items-center gap-1 mx-2">
                            {Array.from({ length: Math.min(5, data.pagination.pages) }).map((_, i) => {
                                const pageNum = i + 1;
                                return (
                                    <Button
                                        key={pageNum}
                                        variant={page === pageNum ? "default" : "ghost"}
                                        className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${page === pageNum
                                            ? "bg-[var(--corp-blue)] text-white shadow-md shadow-blue-100"
                                            : "text-slate-500 hover:bg-slate-50"
                                            }`}
                                        onClick={() => { setPage(pageNum); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                                    >
                                        {pageNum}
                                    </Button>
                                );
                            })}
                        </div>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 rounded-xl border-slate-100 bg-white shadow-sm hover:border-[var(--corp-blue)] hover:text-[var(--corp-blue)] disabled:opacity-30 corp-btn-glow"
                            disabled={page >= data.pagination.pages}
                            onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            aria-label="Next page"
                        >
                            <ChevronRight className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
