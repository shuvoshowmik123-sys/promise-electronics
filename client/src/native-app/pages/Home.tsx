import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import NativeLayout from "../NativeLayout";
import NotificationsPopup, { Notification as UiNotification } from "../components/NotificationsPopup";
import { useState, useEffect, useMemo } from "react";
import {
    Bell,
    Wrench,
    ShoppingBag,
    Map,
    Headphones,
    ArrowRight,
    Tv,
    BatteryCharging,
    ShieldCheck,
    Volume2,
    Smartphone,
    Laptop,
    Watch,
    Monitor,
    Speaker
} from "lucide-react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi, settingsApi, customerServiceRequestsApi } from "@/lib/api";
import { Notification as SchemaNotification, ServiceRequest, TRACKING_STATUSES } from "@shared/schema";
import { formatDistanceToNow, format } from "date-fns";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import AnimatedButton from "../components/AnimatedButton";
import PullToRefresh from "../components/PullToRefresh";
import { RepairCardSkeleton } from "../components/SkeletonCard";
import { getApiUrl } from "@/lib/config";

// Helper to get icon based on device type
const getDeviceIcon = (deviceType: string) => {
    const lower = deviceType.toLowerCase();
    if (lower.includes('phone')) return Smartphone;
    if (lower.includes('laptop') || lower.includes('computer')) return Laptop;
    if (lower.includes('watch')) return Watch;
    if (lower.includes('monitor') || lower.includes('screen')) return Monitor;
    if (lower.includes('speaker') || lower.includes('audio')) return Speaker;
    return Tv; // Default
};

// Helper to calculate progress based on tracking status
const getProgress = (status: string) => {
    const index = TRACKING_STATUSES.indexOf(status as any);
    if (index === -1) return 10; // Default start
    const total = TRACKING_STATUSES.length;
    return Math.max(10, Math.min(100, ((index + 1) / total) * 100));
};

export default function Home() {
    const { customer } = useCustomerAuth();
    const [selectedRepair, setSelectedRepair] = useState<ServiceRequest | null>(null);
    const queryClient = useQueryClient();
    const { t } = useTranslation();
    const { data: serviceRequests = [], isLoading: isLoadingRequests } = useQuery<ServiceRequest[]>({
        queryKey: ["customer-service-requests"],
        queryFn: customerServiceRequestsApi.getAll,
        enabled: !!customer,
    });

    const isLoading = isLoadingRequests;

    // Find the most recent active repair
    const currentRepair = useMemo(() => {
        const active = serviceRequests.filter(req =>
            !["Delivered", "Cancelled", "Closed"].includes(req.trackingStatus)
        );
        return active.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    }, [serviceRequests]);

    const { data: settings = [] } = useQuery<any[]>({
        queryKey: ["settings"],
        queryFn: settingsApi.getAll,
    });

    const nativeHomeBannerImage = settings.find(s => s.key === "native_home_banner_image")?.value || "https://images.unsplash.com/photo-1593784991095-a205069470b6?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80";

    const DeviceIcon = currentRepair ? getDeviceIcon(currentRepair.brand) : Tv;

    return (
        <NativeLayout className="pb-32">
            <div className="flex-1 overflow-hidden">
                <PullToRefresh onRefresh={async () => {
                    await Promise.all([
                        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
                        queryClient.invalidateQueries({ queryKey: ["customer-service-requests"] }),
                        queryClient.invalidateQueries({ queryKey: ["settings"] })
                    ]);
                }}>
                    <main className="flex flex-col gap-6 px-4 pt-4 pb-32 min-h-full">
                        {/* Hero Section */}
                        <section className="w-full">
                            <div className="group relative overflow-hidden rounded-2xl bg-slate-900 shadow-xl">
                                {/* Background Image Overlay */}
                                <div className="absolute inset-0 bg-cover bg-center opacity-60 mix-blend-overlay transition-transform duration-500 group-hover:scale-105"
                                    style={{ backgroundImage: `url("${nativeHomeBannerImage}")` }}>
                                </div>
                                <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-transparent"></div>

                                <div className="relative z-10 p-6 flex flex-col justify-center h-full min-h-[200px]">
                                    <div className="max-w-[80%]">
                                        <span className="inline-block py-1 px-3 rounded-full bg-[var(--color-native-primary)]/20 text-[var(--color-native-primary)] text-xs font-bold uppercase tracking-wider mb-3 backdrop-blur-sm border border-[var(--color-native-primary)]/20">
                                            {t('home.fast_service')}
                                        </span>
                                        <h2 className="text-2xl font-bold text-white leading-tight mb-2">
                                            {t('home.hero_title')}
                                        </h2>
                                        <p className="text-slate-300 text-sm mb-6 leading-relaxed">
                                            {t('home.hero_subtitle')}
                                        </p>
                                        <Link href="/native/repair">
                                            <button className="flex items-center gap-2 bg-[var(--color-native-primary)] text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-opacity-90 shadow-lg shadow-[var(--color-native-primary)]/30">
                                                <span>{t('home.book_now')}</span>
                                                <ArrowRight className="w-4 h-4" />
                                            </button>
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Quick Actions */}
                        <section>
                            <h3 className="text-lg font-bold px-2 mb-3 tracking-tight text-[var(--color-native-text)]">{t('home.quick_actions')}</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <Link href="/native/repair">
                                    <AnimatedButton disableHaptics className="w-full flex flex-col items-start gap-3 p-4 rounded-2xl bg-[var(--color-native-card)] border border-[var(--color-native-border)] shadow-sm">
                                        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500">
                                            <Wrench className="w-5 h-5" />
                                        </div>
                                        <div className="text-left">
                                            <span className="block text-base font-bold text-[var(--color-native-text)]">{t('home.new_repair')}</span>
                                            <span className="block text-xs text-[var(--color-native-text-muted)] mt-0.5">{t('home.schedule_service')}</span>
                                        </div>
                                    </AnimatedButton>
                                </Link>

                                <Link href="/native/shop">
                                    <AnimatedButton disableHaptics className="w-full flex flex-col items-start gap-3 p-4 rounded-2xl bg-[var(--color-native-card)] border border-[var(--color-native-border)] shadow-sm">
                                        <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-500">
                                            <ShoppingBag className="w-5 h-5" />
                                        </div>
                                        <div className="text-left">
                                            <span className="block text-base font-bold text-[var(--color-native-text)]">{t('home.buy_parts')}</span>
                                            <span className="block text-xs text-[var(--color-native-text-muted)] mt-0.5">{t('home.shop_electronics')}</span>
                                        </div>
                                    </AnimatedButton>
                                </Link>

                                <Link href="/native/bookings">
                                    <AnimatedButton disableHaptics className="w-full flex flex-col items-start gap-3 p-4 rounded-2xl bg-[var(--color-native-card)] border border-[var(--color-native-border)] shadow-sm">
                                        <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-500">
                                            <Map className="w-5 h-5" />
                                        </div>
                                        <div className="text-left">
                                            <span className="block text-base font-bold text-[var(--color-native-text)]">{t('home.track_order')}</span>
                                            <span className="block text-xs text-[var(--color-native-text-muted)] mt-0.5">{t('home.status_updates')}</span>
                                        </div>
                                    </AnimatedButton>
                                </Link>

                                <Link href="/native/support">
                                    <AnimatedButton disableHaptics className="w-full flex flex-col items-start gap-3 p-4 rounded-2xl bg-[var(--color-native-card)] border border-[var(--color-native-border)] shadow-sm">
                                        <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-500">
                                            <Headphones className="w-5 h-5" />
                                        </div>
                                        <div className="text-left">
                                            <span className="block text-base font-bold text-[var(--color-native-text)]">{t('home.help_center')}</span>
                                            <span className="block text-xs text-[var(--color-native-text-muted)] mt-0.5">{t('home.chat_with_us')}</span>
                                        </div>
                                    </AnimatedButton>
                                </Link>
                            </div>
                        </section>

                        {/* Current Repair (Real Data) */}
                        {currentRepair && (
                            <section>
                                <div className="flex items-center justify-between px-2 mb-3">
                                    <h3 className="text-lg font-bold tracking-tight text-[var(--color-native-text)]">{t('home.current_repair')}</h3>
                                    <Link href={`/native/repair/${currentRepair.id}`} className="text-xs font-semibold text-[var(--color-native-primary)] hover:underline">
                                        {t('home.view_details')}
                                    </Link>
                                </div>
                                <AnimatedButton
                                    disableHaptics
                                    onClick={() => setSelectedRepair(currentRepair)}
                                    className="w-full bg-[var(--color-native-card)] rounded-2xl p-5 border border-[var(--color-native-border)] shadow-sm cursor-pointer text-left group relative overflow-hidden"
                                >
                                    {/* Background decoration */}
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--color-native-primary)]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                                    <div className="flex gap-4 items-start mb-5 relative z-10">
                                        {/* Icon Container */}
                                        <div className="relative">
                                            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[var(--color-native-input)] to-[var(--color-native-card)] border border-[var(--color-native-border)] flex items-center justify-center shrink-0 shadow-inner">
                                                <DeviceIcon className="w-8 h-8 text-[var(--color-native-primary)] drop-shadow-sm" />
                                            </div>
                                            {/* Status Dot */}
                                            <div className="absolute -bottom-1 -right-1 h-5 w-5 bg-[var(--color-native-card)] rounded-full flex items-center justify-center border border-[var(--color-native-border)]">
                                                <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                                            </div>
                                        </div>

                                        <div className="flex-1 min-w-0 pt-1">
                                            <div className="flex justify-between items-start gap-2">
                                                <div>
                                                    <h4 className="text-lg font-bold truncate text-[var(--color-native-text)] leading-tight">
                                                        {currentRepair.brand}
                                                    </h4>
                                                    <p className="text-sm text-[var(--color-native-text-muted)] font-medium truncate">
                                                        {currentRepair.modelNumber}
                                                    </p>
                                                </div>
                                                <span className="px-2.5 py-1 rounded-lg bg-[var(--color-native-primary)]/10 text-[var(--color-native-primary)] text-[10px] font-bold uppercase tracking-wider border border-[var(--color-native-primary)]/20 shadow-sm">
                                                    {currentRepair.trackingStatus}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2 mt-2 text-xs text-[var(--color-native-text-muted)]">
                                                <span className="bg-[var(--color-native-input)] px-1.5 py-0.5 rounded text-[10px] font-mono border border-[var(--color-native-border)]">
                                                    #{currentRepair.convertedJobId || currentRepair.ticketNumber}
                                                </span>
                                                <span>•</span>
                                                <span className="font-medium text-[var(--color-native-text)] truncate">
                                                    {currentRepair.primaryIssue}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Progress Bar */}
                                    {/* Progress Bar */}
                                    <div className="relative z-10">
                                        {(() => {
                                            const PICKUP_FLOW = [
                                                "Request Received", "Arriving to Receive", "Received", "Technician Assigned",
                                                "Diagnosis Completed", "Parts Pending", "Repairing", "Ready for Delivery", "Delivered"
                                            ];

                                            const SERVICE_CENTER_FLOW = [
                                                "Request Received", "Awaiting Drop-off", "Received", "Technician Assigned",
                                                "Diagnosis Completed", "Parts Pending", "Repairing", "Ready for Delivery", "Delivered"
                                            ];

                                            const isPickup = currentRepair.serviceMode === 'pickup' || !!currentRepair.pickupTier;
                                            const flow = isPickup ? PICKUP_FLOW : SERVICE_CENTER_FLOW;
                                            const currentStatusIndex = flow.indexOf(currentRepair.trackingStatus);

                                            const safeIndex = currentStatusIndex === -1 ? 0 : currentStatusIndex;

                                            const pageIndex = Math.floor(safeIndex / 3);
                                            const startStep = pageIndex * 3;
                                            const displaySteps = flow.slice(startStep, startStep + 3);

                                            const indexInPage = safeIndex % 3;
                                            const progressWidth = indexInPage === 0 ? 15 : indexInPage === 1 ? 50 : 100;

                                            return (
                                                <>
                                                    <div className="flex justify-between text-[10px] font-bold text-[var(--color-native-text-muted)] uppercase tracking-wider mb-2">
                                                        {displaySteps.map((step, idx) => {
                                                            const isCompleted = idx < indexInPage;
                                                            const isCurrent = idx === indexInPage;
                                                            return (
                                                                <span
                                                                    key={step}
                                                                    className={`
                                                                ${isCompleted || isCurrent ? "text-[var(--color-native-primary)]" : ""}
                                                                ${isCurrent ? "animate-pulse scale-105 transition-transform" : ""}
                                                            `}
                                                                >
                                                                    {step}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                    <div className="relative w-full h-2.5 bg-[var(--color-native-input)] rounded-full overflow-hidden shadow-inner border border-[var(--color-native-border)]/50">
                                                        <div
                                                            className="absolute left-0 top-0 h-full bg-gradient-to-r from-[var(--color-native-primary)] to-purple-500 rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(var(--color-native-primary-rgb),0.5)]"
                                                            style={{ width: `${progressWidth}%` }}
                                                        >
                                                            {/* Shimmer effect */}
                                                            <div className="absolute inset-0 bg-white/20 skew-x-12 animate-[shimmer_2s_infinite] w-full translate-x-[-100%]"></div>
                                                        </div>
                                                    </div>
                                                </>
                                            );
                                        })()}
                                    </div>
                                </AnimatedButton>
                            </section>
                        )}

                        {/* For You */}
                        <section>
                            <h3 className="text-lg font-bold px-4 mb-3 tracking-tight text-[var(--color-native-text)]">{t('home.for_you')}</h3>
                            <div className="relative w-full overflow-x-auto snap-x snap-mandatory flex gap-4 pb-4 px-4 scrollbar-hide">

                                {/* Card 1 */}
                                <div className="snap-start shrink-0 w-[85%] rounded-2xl overflow-hidden relative bg-slate-900">
                                    <div className="absolute inset-0 bg-gradient-to-br from-purple-900 to-blue-900 opacity-80"></div>
                                    <div className="absolute right-0 bottom-0 opacity-20 transform translate-x-10 translate-y-10">
                                        <BatteryCharging className="w-32 h-32 text-white" />
                                    </div>
                                    <div className="relative z-10 p-5 flex flex-col items-start h-full">
                                        <span className="bg-white/20 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded mb-3">{t('home.limited_time')}</span>
                                        <h4 className="text-xl font-bold text-white leading-tight mb-1">15% OFF Power Boards</h4>
                                        <p className="text-white/80 text-sm mb-4 max-w-[70%]">Get your TV power supply fixed this week.</p>
                                        <button className="bg-white text-purple-900 text-xs font-bold px-4 py-2 rounded-full">{t('home.claim_offer')}</button>
                                    </div>
                                </div>

                                {/* Card 2 */}
                                <div className="snap-start shrink-0 w-[85%] rounded-2xl overflow-hidden relative bg-slate-900">
                                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-native-primary)] to-emerald-900 opacity-80"></div>
                                    <div className="absolute right-0 bottom-0 opacity-20 transform translate-x-10 translate-y-10">
                                        <ShieldCheck className="w-32 h-32 text-white" />
                                    </div>
                                    <div className="relative z-10 p-5 flex flex-col items-start h-full">
                                        <span className="bg-black/20 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded mb-3">{t('home.new')}</span>
                                        <h4 className="text-xl font-bold text-white leading-tight mb-1">Promise Care+</h4>
                                        <p className="text-white/80 text-sm mb-4 max-w-[70%]">Extend your warranty for just 999 BDT.</p>
                                        <button className="bg-black text-white text-xs font-bold px-4 py-2 rounded-full">{t('home.learn_more')}</button>
                                    </div>
                                </div>

                            </div>
                        </section>
                    </main>
                </PullToRefresh>
            </div >

            <Dialog open={!!selectedRepair} onOpenChange={(open) => !open && setSelectedRepair(null)}>
                <DialogContent className="max-w-[90%] rounded-2xl p-0 overflow-hidden bg-[var(--color-native-bg)]">
                    <DialogHeader className="p-5 bg-[var(--color-native-card)] border-b border-[var(--color-native-border)]">
                        <DialogTitle className="text-lg font-bold text-[var(--color-native-text)]">{t('home.repair_details')}</DialogTitle>
                        <DialogDescription className="text-xs text-[var(--color-native-text-muted)]">
                            Job ID: #{selectedRepair?.ticketNumber} • {selectedRepair?.brand} {selectedRepair?.modelNumber}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="p-5 space-y-6">
                        {/* Status Timeline */}
                        <div className="space-y-4">
                            <h4 className="text-sm font-bold text-[var(--color-native-text)]">{t('home.status_timeline')}</h4>
                            <div className="relative pl-4 border-l-2 border-[var(--color-native-border)] space-y-6">
                                <div className="relative">
                                    <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-green-500 ring-4 ring-[var(--color-native-bg)]"></div>
                                    <p className="text-sm font-medium text-[var(--color-native-text)]">Request Received</p>
                                    <p className="text-xs text-[var(--color-native-text-muted)]">
                                        {selectedRepair?.createdAt && format(new Date(selectedRepair.createdAt), 'MMM d, h:mm a')}
                                    </p>
                                </div>
                                <div className="relative">
                                    <div className="absolute -left-[21px] top-1 w-3 h-3 rounded-full bg-[var(--color-native-primary)] ring-4 ring-[var(--color-native-bg)] animate-pulse"></div>
                                    <p className="text-sm font-medium text-[var(--color-native-primary)]">{selectedRepair?.trackingStatus}</p>
                                    <p className="text-xs text-[var(--color-native-text-muted)]">Current Status</p>
                                </div>
                            </div>
                        </div>

                        {/* Cost Estimate */}
                        <div className="space-y-2">
                            <h4 className="text-sm font-bold text-[var(--color-native-text)]">{t('home.estimated_cost')}</h4>
                            <div className="bg-[var(--color-native-card)] p-4 rounded-xl border border-[var(--color-native-border)] shadow-sm space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-[var(--color-native-text-muted)]">{t('home.service_charge')}</span>
                                    <span className="font-medium text-[var(--color-native-text)]">
                                        {selectedRepair?.pickupCost ? `${selectedRepair.pickupCost} BDT` : 'TBD'}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-[var(--color-native-text-muted)]">{t('home.parts')}</span>
                                    <span className="font-medium text-[var(--color-native-text)]">
                                        {selectedRepair?.quoteAmount ? `${selectedRepair.quoteAmount} BDT` : 'TBD'}
                                    </span>
                                </div>
                                <div className="border-t border-[var(--color-native-border)] pt-2 flex justify-between text-sm font-bold text-[var(--color-native-text)]">
                                    <span>{t('home.total')}</span>
                                    <span>
                                        {selectedRepair?.totalAmount ? `${selectedRepair.totalAmount} BDT` : 'Calculating...'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-5 bg-[var(--color-native-card)] border-t border-[var(--color-native-border)]">
                        <AnimatedButton
                            disableHaptics
                            onClick={() => setSelectedRepair(null)}
                            className="w-full bg-[var(--color-native-input)] text-[var(--color-native-text)] font-bold py-3 rounded-xl hover:bg-[var(--color-native-border)] transition-colors"
                        >
                            {t('home.close')}
                        </AnimatedButton>
                    </div>
                </DialogContent>
            </Dialog>
        </NativeLayout >
    );
}
