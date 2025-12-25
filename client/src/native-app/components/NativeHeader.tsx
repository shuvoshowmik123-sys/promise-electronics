import { useLocation, Link } from "wouter";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { Bell, ChevronLeft, User } from "lucide-react";
import NotificationsPopup, { Notification as UiNotification } from "./NotificationsPopup";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi, customerServiceRequestsApi } from "@/lib/api";
import { Notification as SchemaNotification } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { getApiUrl } from "@/lib/config";

export default function NativeHeader() {
    const [location] = useLocation();
    const { customer } = useCustomerAuth();
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    // Service Requests for Badge
    const { data: serviceRequests = [] } = useQuery({
        queryKey: ["customer-service-requests"],
        queryFn: customerServiceRequestsApi.getAll,
        enabled: !!customer,
    });

    // Notifications Logic (Moved from Home.tsx)
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

    const { data: notifications = [] } = useQuery<SchemaNotification[]>({
        queryKey: ["notifications"],
        queryFn: notificationsApi.getAll,
        enabled: !!customer,
    });

    const markAsReadMutation = useMutation({
        mutationFn: (id: string) => notificationsApi.markAsRead(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
        },
    });

    const markAllAsReadMutation = useMutation({
        mutationFn: notificationsApi.markAllAsRead,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
        },
    });

    const unreadCount = notifications.filter(n => !n.read).length;

    const handleMarkAsRead = (id: string) => {
        markAsReadMutation.mutate(id);
    };

    const handleMarkAllAsRead = () => {
        markAllAsReadMutation.mutate();
    };

    const playNotificationSound = () => {
        console.log("[NOTIFICATION] Playing notification sound...");
        try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.setValueAtTime(587.33, audioContext.currentTime); // D5
            oscillator.frequency.setValueAtTime(880, audioContext.currentTime + 0.1); // A5

            oscillator.type = 'sine';

            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.05);
            gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.15);
            gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.3);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.3);
        } catch (error) {
            console.log("Could not play notification sound:", error);
        }
    };

    // SSE for Notifications
    // SSE for Notifications
    useEffect(() => {
        if (!customer) return;

        let eventSource: EventSource | null = null;
        let reconnectTimeout: NodeJS.Timeout | null = null;
        let isMounted = true;

        const connectSSE = () => {
            if (!isMounted) return;

            // Close existing connection if any
            if (eventSource) {
                eventSource.close();
            }

            console.log("[SSE] Connecting to event stream...");
            eventSource = new EventSource(getApiUrl("/api/customer/events"), { withCredentials: true });

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    if (data.type === "connected") {
                        console.log("[SSE] Connected successfully");
                        return;
                    }

                    if (data.type === "notification" || data.type === "order_update") {
                        console.log("[SSE] Received update:", data.type);
                        playNotificationSound();
                        queryClient.invalidateQueries({ queryKey: ["notifications"] });

                        if (data.type === "order_update") {
                            // Invalidate both keys to be safe
                            queryClient.invalidateQueries({ queryKey: ["customer-service-requests"] });
                            queryClient.invalidateQueries({ queryKey: ["/customer/service-requests"] });
                        }
                    }
                } catch (error) {
                    console.error("SSE Parse Error:", error);
                }
            };

            eventSource.onerror = (error) => {
                console.error("SSE Error:", error);
                if (eventSource) {
                    eventSource.close();
                    eventSource = null;
                }

                // Attempt to reconnect after 5 seconds
                if (isMounted) {
                    console.log("[SSE] Attempting to reconnect in 5s...");
                    reconnectTimeout = setTimeout(connectSSE, 5000);
                }
            };
        };

        connectSSE();

        return () => {
            isMounted = false;
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            if (eventSource) {
                eventSource.close();
            }
        };
    }, [customer, queryClient]);

    const displayNotifications: UiNotification[] = notifications.map(n => ({
        ...n,
        read: !!n.read,
        link: n.link || "#",
        time: formatDistanceToNow(new Date(n.createdAt), { addSuffix: true }),
        type: (['info', 'success', 'warning', 'repair', 'shop'].includes(n.type) ? n.type : 'info') as any
    }));

    // --- Render Logic ---

    // 1. Home Header
    if (location === '/native/home') {
        return (
            <>
                <header className="sticky top-0 z-20 bg-[var(--color-native-surface)]/90 backdrop-blur-md px-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-2 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                        <Link href="/native/profile">
                            <div className="w-10 h-10 rounded-full bg-[var(--color-native-input)] overflow-hidden border border-[var(--color-native-border)] flex items-center justify-center">
                                {customer?.profileImageUrl ? (
                                    <img src={customer.profileImageUrl} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-5 h-5 text-[var(--color-native-text-muted)]" />
                                )}
                            </div>
                        </Link>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-[var(--color-native-text-muted)]">Hello,</span>
                            <h1 className="text-xl font-bold leading-tight tracking-tight text-[var(--color-native-text)]">
                                {customer?.name?.split(" ")[0] || t('home.guest')} 👋
                            </h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsNotificationsOpen(true)}
                            className="relative flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-native-card)] border border-[var(--color-native-border)] shadow-sm active:scale-95 transition-transform"
                        >
                            <Bell className="w-6 h-6 text-[var(--color-native-text)]" />
                            {unreadCount > 0 && (
                                <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-red-500 border-2 border-[var(--color-native-surface)] rounded-full"></span>
                            )}
                        </button>
                    </div>
                </header>

                <NotificationsPopup
                    isOpen={isNotificationsOpen}
                    onClose={() => setIsNotificationsOpen(false)}
                    notifications={displayNotifications}
                    onMarkAsRead={handleMarkAsRead}
                    onMarkAllAsRead={handleMarkAllAsRead}
                />
            </>
        );
    }

    // 2. Settings Header
    if (location === '/native/settings') {
        return (
            <header className="sticky top-0 z-50 bg-[var(--color-native-surface)]/80 backdrop-blur-md px-4 py-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => window.history.back()}
                        className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-[var(--color-native-input)]"
                    >
                        <ChevronLeft className="w-6 h-6 text-[var(--color-native-text)]" />
                    </button>
                    <h1 className="text-2xl font-bold tracking-tight text-[var(--color-native-text)]">{t('settings.title')}</h1>
                </div>
                <div className="w-10 h-10 rounded-full bg-[var(--color-native-input)] overflow-hidden border-2 border-transparent hover:border-[var(--color-native-primary)] flex items-center justify-center">
                    {customer?.profileImageUrl ? (
                        <img
                            src={customer.profileImageUrl}
                            alt="Profile"
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <User className="w-6 h-6 text-[var(--color-native-text-muted)]" />
                    )}
                </div>
            </header>
        );
    }

    const routeTitles: Record<string, string> = {
        '/native/shop': 'Shop',
        '/native/bookings': 'My Repairs', // Renamed from 'My Bookings'
        '/native/profile': 'My Profile',
        '/native/addresses': 'My Addresses',
        // '/native/repair' excluded - RepairRequest.tsx has its own header with progress indicator
        // '/native/support' excluded - Support.tsx has its own custom Help Center header
        '/native/orders': 'Order History',
        '/native/repair-history': 'Repair History',
        '/native/warranties': 'My Warranties',
        '/native/about': 'About Us',
        '/native/privacy-policy': 'Privacy Policy',
        '/native/terms-and-conditions': 'Terms & Conditions',
        '/native/settings/edit-profile': 'Edit Profile',
        '/native/settings/change-password': 'Change Password',
    };

    const title = routeTitles[location];

    if (title) {
        return (
            <header className="sticky top-0 z-50 bg-[var(--color-native-surface)]/80 backdrop-blur-md px-4 py-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between border-b border-[var(--color-native-border)]">
                <div className="flex items-center gap-3">
                    {/* Only show back button if not a main tab */}
                    {!['/native/shop', '/native/bookings', '/native/profile', '/native/support'].includes(location) && (
                        <button onClick={() => history.back()} className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-[var(--color-native-input)]">
                            <ChevronLeft className="w-6 h-6 text-[var(--color-native-text)]" />
                        </button>
                    )}
                    <h1 className="text-xl font-bold tracking-tight text-[var(--color-native-text)]">{title}</h1>
                </div>

                {/* Active Repairs Badge */}
                {location === '/native/bookings' && (
                    <div className="bg-[var(--color-native-primary)]/10 text-[var(--color-native-primary)] px-3 py-1 rounded-full text-xs font-bold border border-[var(--color-native-primary)]/20">
                        {serviceRequests.length} Active
                    </div>
                )}
            </header>
        );
    }

    // 4. Special Case: Repair Details (Dynamic ID)
    if (location.startsWith('/native/repair/')) {
        return (
            <header className="sticky top-0 z-50 bg-[var(--color-native-surface)]/80 backdrop-blur-md px-4 py-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between border-b border-[var(--color-native-border)]">
                <div className="flex items-center gap-3">
                    <button onClick={() => history.back()} className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-[var(--color-native-input)]">
                        <ChevronLeft className="w-6 h-6 text-[var(--color-native-text)]" />
                    </button>
                    <h1 className="text-xl font-bold tracking-tight text-[var(--color-native-text)]">Repair Details</h1>
                </div>
            </header>
        );
    }

    // Default: Return null (No header for Login, Register, Splash, etc.)
    return null;
}
