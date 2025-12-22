import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Wrench, Calendar, ChevronRight, Loader2, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { customerServiceRequestsApi } from "@/lib/api";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import NativeLayout from "../NativeLayout";
import { RepairCardSkeleton } from "../components/SkeletonCard";

// Status configurations
const serviceStatusColors: Record<string, string> = {
    "Request Received": "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800",
    "Technician Assigned": "bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-100 dark:border-purple-800",
    "Diagnosis Completed": "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-100 dark:border-yellow-800",
    "Parts Pending": "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-100 dark:border-orange-800",
    "Repairing": "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 border-cyan-100 dark:border-cyan-800",
    "Ready for Delivery": "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-100 dark:border-green-800",
    "Delivered": "bg-green-600 text-white border-green-600",
};

export default function NativeRepairHistory() {
    const [, setLocation] = useLocation();
    const { isAuthenticated } = useCustomerAuth();

    const { data: serviceRequests = [], isLoading } = useQuery({
        queryKey: ["/customer/service-requests"],
        queryFn: () => customerServiceRequestsApi.getAll(),
        enabled: isAuthenticated,
    });

    const activeRepairs = serviceRequests.filter(r => r.trackingStatus !== "Delivered");
    const completedRepairs = serviceRequests.filter(r => r.trackingStatus === "Delivered");

    return (
        <NativeLayout className="bg-[var(--color-native-bg)] text-[var(--color-native-text)] pb-20">
            {/* Header */}
            <div className="bg-[var(--color-native-surface)] px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3 border-b border-[var(--color-native-border)] transition-colors duration-200">
                <Link href="/native/profile">
                    <button className="p-2 -ml-2 rounded-full active:bg-[var(--color-native-input)] text-[var(--color-native-text-muted)] hover:text-[var(--color-native-text)] transition-colors">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                </Link>
                <h1 className="text-xl font-bold text-[var(--color-native-text)]">Repair History</h1>
            </div>

            <main className="flex-1 overflow-y-auto scrollbar-hide p-4">
                <Tabs defaultValue="active" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-6 bg-[var(--color-native-card)] p-1 rounded-xl border border-[var(--color-native-border)] shadow-sm h-auto">
                        <TabsTrigger
                            value="active"
                            className="py-3 rounded-lg data-[state=active]:bg-[var(--color-native-primary)] data-[state=active]:text-white font-medium transition-all text-[var(--color-native-text-muted)]"
                        >
                            Active Repairs
                        </TabsTrigger>
                        <TabsTrigger
                            value="completed"
                            className="py-3 rounded-lg data-[state=active]:bg-[var(--color-native-primary)] data-[state=active]:text-white font-medium transition-all text-[var(--color-native-text-muted)]"
                        >
                            Completed
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="active" className="space-y-4 outline-none">
                        {isLoading ? (
                            <div className="space-y-4">
                                <RepairCardSkeleton />
                                <RepairCardSkeleton />
                                <RepairCardSkeleton />
                            </div>
                        ) : activeRepairs.length > 0 ? (
                            activeRepairs.map((request) => (
                                <div
                                    key={request.id}
                                    onClick={() => setLocation(`/native/repair/${request.id}`)}
                                    className="bg-[var(--color-native-card)] p-4 rounded-2xl border border-[var(--color-native-border)] shadow-sm active:scale-[0.98] transition-transform"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
                                                <Wrench className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-[var(--color-native-text)]">{request.convertedJobId || request.ticketNumber}</h3>
                                                <p className="text-xs text-[var(--color-native-text-muted)] flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {format(new Date(request.createdAt), "MMM d, yyyy")}
                                                </p>
                                            </div>
                                        </div>
                                        <Badge className={cn("text-xs font-medium px-2.5 py-0.5 border", serviceStatusColors[request.trackingStatus || "Request Received"])}>
                                            {request.trackingStatus || "Request Received"}
                                        </Badge>
                                    </div>

                                    <div className="mb-3">
                                        <p className="text-sm font-medium text-[var(--color-native-text)]">{request.brand} {request.modelNumber ? `- ${request.modelNumber}` : ''}</p>
                                        <p className="text-xs text-[var(--color-native-text-muted)] line-clamp-1">{request.primaryIssue}</p>
                                    </div>

                                    <div className="flex justify-end">
                                        <div className="flex items-center text-xs font-medium text-[var(--color-native-text-muted)] bg-[var(--color-native-input)] px-3 py-1.5 rounded-full">
                                            View Details <ChevronRight className="w-3 h-3 ml-1" />
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 bg-[var(--color-native-input)] rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Wrench className="w-8 h-8 text-[var(--color-native-text-muted)]" />
                                </div>
                                <h3 className="text-lg font-bold text-[var(--color-native-text)] mb-2">No Active Repairs</h3>
                                <p className="text-[var(--color-native-text-muted)] mb-6">You don't have any ongoing repair requests.</p>
                                <Link href="/native/repair">
                                    <button className="bg-[var(--color-native-primary)] text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-transform">
                                        Request Repair
                                    </button>
                                </Link>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="completed" className="space-y-4 outline-none">
                        {isLoading ? (
                            <div className="space-y-4">
                                <RepairCardSkeleton />
                                <RepairCardSkeleton />
                                <RepairCardSkeleton />
                            </div>
                        ) : completedRepairs.length > 0 ? (
                            completedRepairs.map((request) => (
                                <div
                                    key={request.id}
                                    onClick={() => setLocation(`/native/repair/${request.id}`)}
                                    className="bg-[var(--color-native-card)] p-4 rounded-2xl border border-[var(--color-native-border)] shadow-sm active:scale-[0.98] transition-transform"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400">
                                                <CheckCircle className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-[var(--color-native-text)]">{request.convertedJobId || request.ticketNumber}</h3>
                                                <p className="text-xs text-[var(--color-native-text-muted)] flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {format(new Date(request.createdAt), "MMM d, yyyy")}
                                                </p>
                                            </div>
                                        </div>
                                        <Badge className={cn("text-xs font-medium px-2.5 py-0.5 border", serviceStatusColors[request.trackingStatus || "Request Received"])}>
                                            {request.trackingStatus || "Request Received"}
                                        </Badge>
                                    </div>

                                    <div className="mb-3">
                                        <p className="text-sm font-medium text-[var(--color-native-text)]">{request.brand} {request.modelNumber ? `- ${request.modelNumber}` : ''}</p>
                                        <p className="text-xs text-[var(--color-native-text-muted)] line-clamp-1">{request.primaryIssue}</p>
                                    </div>

                                    <div className="flex justify-end">
                                        <div className="flex items-center text-xs font-medium text-[var(--color-native-text-muted)] bg-[var(--color-native-input)] px-3 py-1.5 rounded-full">
                                            View Details <ChevronRight className="w-3 h-3 ml-1" />
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 bg-[var(--color-native-input)] rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Clock className="w-8 h-8 text-[var(--color-native-text-muted)]" />
                                </div>
                                <h3 className="text-lg font-bold text-[var(--color-native-text)] mb-2">No Completed Repairs</h3>
                                <p className="text-[var(--color-native-text-muted)]">You haven't completed any repair requests yet.</p>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </main>
        </NativeLayout>
    );
}
