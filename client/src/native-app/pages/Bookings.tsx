import { useQuery } from "@tanstack/react-query";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { customerServiceRequestsApi } from "@/lib/api";
import NativeLayout from "../NativeLayout";
import AnimatedButton from "../components/AnimatedButton";
import { Wrench, Clock, CheckCircle, Package, Loader2, AlertCircle, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { useState } from "react";
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "react-i18next";

export default function Bookings() {
    const { isAuthenticated } = useCustomerAuth();
    const { t } = useTranslation();
    const { data: serviceRequests = [], isLoading } = useQuery({
        queryKey: ["customer-service-requests"],
        queryFn: () => customerServiceRequestsApi.getAll(),
        enabled: isAuthenticated,
        refetchInterval: 3000, // Live feed update every 3 seconds
    });

    const [selectedRequest, setSelectedRequest] = useState<any>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    const handleViewDetails = (request: any) => {
        setSelectedRequest(request);
        setIsDrawerOpen(true);
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "Request Received": return "text-blue-500 bg-blue-500/10 border border-blue-500/20";
            case "Technician Assigned": return "text-purple-500 bg-purple-500/10 border border-purple-500/20";
            case "Diagnosis Completed": return "text-yellow-500 bg-yellow-500/10 border border-yellow-500/20";
            case "Repairing": return "text-cyan-500 bg-cyan-500/10 border border-cyan-500/20";
            case "Ready for Delivery": return "text-green-500 bg-green-500/10 border border-green-500/20";
            case "Delivered": return "text-green-600 bg-green-600/10 border border-green-600/20";
            default: return "text-[var(--color-native-text-muted)] bg-[var(--color-native-text-muted)]/10 border border-[var(--color-native-text-muted)]/20";
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case "Request Received": return Package;
            case "Repairing": return Wrench;
            case "Ready for Delivery": return CheckCircle;
            case "Delivered": return CheckCircle;
            default: return Clock;
        }
    };

    const getTranslatedStatus = (status: string) => {
        switch (status) {
            case "Request Received": return t('bookings.status_request_received');
            case "Technician Assigned": return t('bookings.status_technician_assigned');
            case "Diagnosis Completed": return t('bookings.status_diagnosis_completed');
            case "Repairing": return t('bookings.status_repairing');
            case "Ready for Delivery": return t('bookings.status_ready_for_delivery');
            case "Delivered": return t('bookings.status_delivered');
            default: return status || t('bookings.pending');
        }
    };

    return (
        <NativeLayout className="pb-32">
            <main className="flex-1 px-4 pt-4 flex flex-col gap-4 overflow-y-auto scrollbar-hide">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-[50vh] text-[var(--color-native-text-muted)]">
                        <Loader2 className="w-8 h-8 animate-spin mb-2" />
                        <p className="text-sm">{t('bookings.loading')}</p>
                    </div>
                ) : serviceRequests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-[60vh] text-center px-8">
                        <div className="w-16 h-16 bg-[var(--color-native-input)] rounded-full flex items-center justify-center mb-4">
                            <Wrench className="w-8 h-8 text-[var(--color-native-text-muted)]" />
                        </div>
                        <h3 className="text-lg font-bold text-[var(--color-native-text)] mb-2">{t('bookings.no_repairs_title')}</h3>
                        <p className="text-[var(--color-native-text-muted)] text-sm mb-6">
                            {t('bookings.no_repairs_subtitle')}
                        </p>
                        <Link href="/native/repair">
                            <AnimatedButton variant="pulse" className="bg-[var(--color-native-primary)] text-white px-6 py-3 rounded-full font-bold text-sm shadow-lg shadow-[var(--color-native-primary)]/30">
                                {t('bookings.book_repair')}
                            </AnimatedButton>
                        </Link>
                    </div>
                ) : (
                    serviceRequests.map((request: any) => {
                        const StatusIcon = getStatusIcon(request.trackingStatus);
                        const statusColorClass = getStatusColor(request.trackingStatus);

                        return (
                            <AnimatedButton
                                key={request.id}
                                variant="cardExpand"
                                className="w-full bg-[var(--color-native-card)] rounded-2xl p-4 border border-[var(--color-native-border)] shadow-sm cursor-pointer text-left"
                                onClick={() => handleViewDetails(request)}
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${statusColorClass} bg-opacity-20`}>
                                            <StatusIcon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-[var(--color-native-text)] text-sm">{request.device}</h3>
                                            <p className="text-xs text-[var(--color-native-text)] font-bold">#{request.convertedJobId || request.ticketNumber}</p>
                                        </div>
                                    </div>
                                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide ${statusColorClass}`}>
                                        {getTranslatedStatus(request.trackingStatus)}
                                    </span>
                                </div>

                                <div className="pl-[52px]">
                                    <p className="text-sm text-[var(--color-native-text-muted)] mb-2 line-clamp-1">
                                        {request.primaryIssue}
                                    </p>
                                    <div className="flex items-center justify-between text-xs text-[var(--color-native-text-muted)] border-t border-[var(--color-native-border)] pt-2">
                                        <span>{format(new Date(request.createdAt), "MMM d, yyyy")}</span>
                                        <div className="flex items-center gap-1 text-[var(--color-native-primary)] font-medium">
                                            {t('bookings.view_details')} <ChevronRight className="w-3 h-3" />
                                        </div>
                                    </div>
                                </div>
                            </AnimatedButton>
                        );
                    })
                )}
            </main>



            <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
                <DrawerContent className="bg-[var(--color-native-card)] border-[var(--color-native-border)]">
                    <div className="mx-auto w-full max-w-sm">
                        <DrawerHeader>
                            <DrawerTitle className="text-center text-xl font-bold text-[var(--color-native-text)]">{t('bookings.request_details')}</DrawerTitle>
                            <DrawerDescription className="text-center text-[var(--color-native-text-muted)]">
                                {selectedRequest?.convertedJobId ? `${t('bookings.job')} #${selectedRequest.convertedJobId}` : `${t('bookings.ticket')} #${selectedRequest?.ticketNumber}`}
                            </DrawerDescription>
                        </DrawerHeader>

                        {selectedRequest && (
                            <div className="p-4 space-y-4">
                                <div className="flex items-center justify-between p-3 bg-[var(--color-native-input)] rounded-lg border border-[var(--color-native-border)]">
                                    <span className="text-sm font-medium text-[var(--color-native-text-muted)]">{t('bookings.status')}</span>
                                    <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wide ${getStatusColor(selectedRequest.trackingStatus)}`}>
                                        {getTranslatedStatus(selectedRequest.trackingStatus)}
                                    </span>
                                </div>

                                <div className="space-y-3">
                                    <div>
                                        <h4 className="text-xs font-bold text-[var(--color-native-text-muted)] uppercase mb-1">{t('bookings.device_info')}</h4>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="p-2 border border-[var(--color-native-border)] rounded-md bg-[var(--color-native-card)]">
                                                <p className="text-[10px] text-[var(--color-native-text-muted)]">{t('bookings.device')}</p>
                                                <p className="text-sm font-medium text-[var(--color-native-text)]">{selectedRequest.brand} {selectedRequest.modelNumber}</p>
                                            </div>
                                            <div className="p-2 border border-[var(--color-native-border)] rounded-md bg-[var(--color-native-card)]">
                                                <p className="text-[10px] text-[var(--color-native-text-muted)]">{t('bookings.brand')}</p>
                                                <p className="text-sm font-medium text-[var(--color-native-text)]">{selectedRequest.brand}</p>
                                            </div>
                                            {selectedRequest.modelNumber && (
                                                <div className="p-2 border border-[var(--color-native-border)] rounded-md col-span-2 bg-[var(--color-native-card)]">
                                                    <p className="text-[10px] text-[var(--color-native-text-muted)]">{t('bookings.model')}</p>
                                                    <p className="text-sm font-medium text-[var(--color-native-text)]">{selectedRequest.modelNumber}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="text-xs font-bold text-[var(--color-native-text-muted)] uppercase mb-1">{t('bookings.issue_details')}</h4>
                                        <div className="p-3 border border-[var(--color-native-border)] rounded-md bg-[var(--color-native-input)]">
                                            <p className="text-sm font-medium mb-1 text-[var(--color-native-text)]">{selectedRequest.primaryIssue}</p>
                                            {selectedRequest.description && (
                                                <p className="text-xs text-[var(--color-native-text-muted)]">{selectedRequest.description}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between text-xs text-[var(--color-native-text-muted)] pt-2">
                                        <span>{t('bookings.created_on')} {format(new Date(selectedRequest.createdAt), "PPP")}</span>
                                        {selectedRequest.expectedPickupDate && (
                                            <span className="text-[var(--color-native-primary)] font-medium">
                                                {t('bookings.est_pickup')}: {format(new Date(selectedRequest.expectedPickupDate), "MMM d, yyyy")}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        <DrawerFooter>
                            <DrawerClose asChild>
                                <Button variant="outline" className="bg-[var(--color-native-card)] text-[var(--color-native-text)] border-[var(--color-native-border)] hover:bg-[var(--color-native-input)]">{t('bookings.close')}</Button>
                            </DrawerClose>
                        </DrawerFooter>
                    </div>
                </DrawerContent>
            </Drawer>
        </NativeLayout >
    );
}
