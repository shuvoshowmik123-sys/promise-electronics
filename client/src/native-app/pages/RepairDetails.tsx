import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Wrench, Calendar, MapPin, Clock, CheckCircle, AlertCircle, Loader2, Phone, User } from "lucide-react";
import { format } from "date-fns";
import { customerServiceRequestsApi } from "@/lib/api";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import NativeLayout from "../NativeLayout";

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

export default function NativeRepairDetails() {
    const [, params] = useRoute("/native/repair/:id");
    const id = params?.id;
    const { isAuthenticated } = useCustomerAuth();

    const { data: request, isLoading } = useQuery({
        queryKey: [`/customer/service-requests/${id}`],
        queryFn: () => customerServiceRequestsApi.getOne(id!),
        enabled: isAuthenticated && !!id,
    });

    if (isLoading) {
        return (
            <NativeLayout className="bg-[var(--color-native-bg)] text-[var(--color-native-text)] flex items-center justify-center h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--color-native-primary)]" />
            </NativeLayout>
        );
    }

    if (!request) {
        return (
            <NativeLayout className="bg-[var(--color-native-bg)] text-[var(--color-native-text)] flex flex-col items-center justify-center h-screen p-6 text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                <h2 className="text-xl font-bold text-[var(--color-native-text)] mb-2">Repair Not Found</h2>
                <p className="text-[var(--color-native-text-muted)] mb-6">The repair request you are looking for does not exist or you don't have permission to view it.</p>
                <Link href="/native/repair-history">
                    <button className="bg-[var(--color-native-primary)] text-white px-6 py-3 rounded-xl font-bold shadow-lg">
                        Back to History
                    </button>
                </Link>
            </NativeLayout>
        );
    }

    return (
        <NativeLayout className="bg-[var(--color-native-bg)] text-[var(--color-native-text)] pb-20">
            {/* Header */}
            <div className="bg-[var(--color-native-surface)] px-4 pt-4 pb-4 sticky top-0 z-10 shadow-sm flex items-center gap-3 border-b border-[var(--color-native-border)] transition-colors duration-200">
                <Link href="/native/repair-history">
                    <button className="p-2 -ml-2 rounded-full active:bg-[var(--color-native-input)] text-[var(--color-native-text-muted)] hover:text-[var(--color-native-text)] transition-colors">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                </Link>
                <h1 className="text-xl font-bold text-[var(--color-native-text)]">Repair Details</h1>
            </div>

            <main className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-4">
                {/* Status Card */}
                <div className="bg-[var(--color-native-card)] p-5 rounded-2xl border border-[var(--color-native-border)] shadow-sm">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <p className="text-xs text-[var(--color-native-text-muted)] mb-1">Ticket Number</p>
                            <h2 className="text-2xl font-bold text-[var(--color-native-text)]">{request.ticketNumber}</h2>
                        </div>
                        <Badge className={cn("text-xs font-medium px-3 py-1 border", serviceStatusColors[request.trackingStatus || "Request Received"])}>
                            {request.trackingStatus || "Request Received"}
                        </Badge>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-[var(--color-native-text-muted)] border-t border-[var(--color-native-border)] pt-4">
                        <Calendar className="w-4 h-4" />
                        <span>Requested on {format(new Date(request.createdAt), "MMMM d, yyyy")}</span>
                    </div>
                </div>

                {/* Device Info */}
                <div className="bg-[var(--color-native-card)] p-5 rounded-2xl border border-[var(--color-native-border)] shadow-sm space-y-4">
                    <h3 className="font-bold text-[var(--color-native-text)] flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-[var(--color-native-primary)]" />
                        Device Information
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-xs text-[var(--color-native-text-muted)] mb-1">Brand</p>
                            <p className="font-medium text-[var(--color-native-text)]">{request.brand}</p>
                        </div>
                        <div>
                            <p className="text-xs text-[var(--color-native-text-muted)] mb-1">Model</p>
                            <p className="font-medium text-[var(--color-native-text)]">{request.modelNumber || "N/A"}</p>
                        </div>
                        <div>
                            <p className="text-xs text-[var(--color-native-text-muted)] mb-1">Screen Size</p>
                            <p className="font-medium text-[var(--color-native-text)]">{request.screenSize || "N/A"}</p>
                        </div>
                    </div>

                    <div>
                        <p className="text-xs text-[var(--color-native-text-muted)] mb-1">Primary Issue</p>
                        <p className="font-medium text-[var(--color-native-text)]">{request.primaryIssue}</p>
                    </div>

                    {request.description && (
                        <div>
                            <p className="text-xs text-[var(--color-native-text-muted)] mb-1">Description</p>
                            <p className="text-sm text-[var(--color-native-text)] bg-[var(--color-native-input)] p-3 rounded-lg">{request.description}</p>
                        </div>
                    )}
                </div>

                {/* Service Details */}
                <div className="bg-[var(--color-native-card)] p-5 rounded-2xl border border-[var(--color-native-border)] shadow-sm space-y-4">
                    <h3 className="font-bold text-[var(--color-native-text)] flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-[var(--color-native-primary)]" />
                        Service Details
                    </h3>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-[var(--color-native-text-muted)]">Service Mode</span>
                            <span className="text-sm font-medium text-[var(--color-native-text)] capitalize">{request.serviceMode?.replace("_", " ") || "Pickup"}</span>
                        </div>

                        {request.serviceMode === "pickup" && request.address && (
                            <div>
                                <p className="text-xs text-[var(--color-native-text-muted)] mb-1">Pickup Address</p>
                                <p className="text-sm text-[var(--color-native-text)]">{request.address}</p>
                            </div>
                        )}

                        {request.scheduledPickupDate && (
                            <div className="flex justify-between items-center">
                                <span className="text-sm text-[var(--color-native-text-muted)]">Scheduled Date</span>
                                <span className="text-sm font-medium text-[var(--color-native-text)]">{format(new Date(request.scheduledPickupDate), "MMM d, yyyy")}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Timeline */}
                {request.timeline && request.timeline.length > 0 && (
                    <div className="bg-[var(--color-native-card)] p-5 rounded-2xl border border-[var(--color-native-border)] shadow-sm space-y-4">
                        <h3 className="font-bold text-[var(--color-native-text)] flex items-center gap-2">
                            <Clock className="w-4 h-4 text-[var(--color-native-primary)]" />
                            Timeline
                        </h3>

                        <div className="relative pl-4 border-l-2 border-[var(--color-native-border)] space-y-6">
                            {request.timeline.map((event, index) => (
                                <div key={index} className="relative">
                                    <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-[var(--color-native-primary)] border-2 border-[var(--color-native-surface)] shadow-sm"></div>
                                    <p className="text-sm font-medium text-[var(--color-native-text)]">{event.status}</p>
                                    <p className="text-xs text-[var(--color-native-text-muted)]">
                                        {event.occurredAt ? format(new Date(event.occurredAt), "MMM d, h:mm a") : "Date N/A"}
                                    </p>
                                    {event.message && <p className="text-xs text-[var(--color-native-text-muted)] mt-1 bg-[var(--color-native-input)] p-2 rounded">{event.message}</p>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>
        </NativeLayout>
    );
}
