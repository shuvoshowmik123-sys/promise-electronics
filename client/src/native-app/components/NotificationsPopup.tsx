import { X, Bell, Wrench, ShoppingBag, Info, CheckCircle, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

export interface Notification {
    id: string;
    title: string;
    message: string;
    time: string;
    read: boolean;
    link: string;
    type: 'info' | 'success' | 'warning' | 'repair' | 'shop';
}

interface NotificationsPopupProps {
    isOpen: boolean;
    onClose: () => void;
    notifications: Notification[];
    onMarkAsRead: (id: string) => void;
    onMarkAllAsRead: () => void;
}

export default function NotificationsPopup({ isOpen, onClose, notifications, onMarkAsRead, onMarkAllAsRead }: NotificationsPopupProps) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            document.body.style.overflow = 'hidden';
        } else {
            const timer = setTimeout(() => setIsVisible(false), 300);
            document.body.style.overflow = '';
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!isVisible && !isOpen) return null;

    const getIcon = (type: Notification['type']) => {
        switch (type) {
            case 'repair': return <Wrench className="w-5 h-5 text-blue-600" />;
            case 'shop': return <ShoppingBag className="w-5 h-5 text-orange-600" />;
            case 'success': return <CheckCircle className="w-5 h-5 text-green-600" />;
            case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
            default: return <Info className="w-5 h-5 text-slate-600" />;
        }
    };

    const getBgColor = (type: Notification['type']) => {
        switch (type) {
            case 'repair': return 'bg-blue-100';
            case 'shop': return 'bg-orange-100';
            case 'success': return 'bg-green-100';
            case 'warning': return 'bg-yellow-100';
            default: return 'bg-slate-100';
        }
    };

    return (
        <div className={cn(
            "fixed inset-0 z-[60] flex flex-col justify-end sm:justify-center sm:items-center transition-opacity duration-300",
            isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}>
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Popup Content */}
            <div className={cn(
                "relative w-full sm:w-[400px] max-h-[80vh] bg-[var(--color-native-surface)] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col transition-transform duration-300 ease-out",
                isOpen ? "translate-y-0" : "translate-y-full sm:translate-y-10"
            )}>
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-[var(--color-native-border)]">
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Bell className="w-6 h-6 text-[var(--color-native-text)]" />
                            {notifications.some(n => !n.read) && (
                                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 border-2 border-[var(--color-native-surface)] rounded-full"></span>
                            )}
                        </div>
                        <h2 className="text-lg font-bold text-[var(--color-native-text)]">Notifications</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-[var(--color-native-input)] transition-colors"
                    >
                        <X className="w-5 h-5 text-[var(--color-native-text-muted)]" />
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="w-16 h-16 bg-[var(--color-native-input)] rounded-full flex items-center justify-center mb-4">
                                <Bell className="w-8 h-8 text-[var(--color-native-text-muted)]" />
                            </div>
                            <p className="text-[var(--color-native-text)] font-medium">No notifications</p>
                            <p className="text-[var(--color-native-text-muted)] text-sm mt-1">You're all caught up!</p>
                        </div>
                    ) : (
                        notifications.map((notification) => (
                            <Link key={notification.id} href={notification.link}>
                                <div
                                    onClick={() => {
                                        onMarkAsRead(notification.id);
                                        onClose();
                                    }}
                                    className={cn(
                                        "flex gap-4 p-4 rounded-2xl transition-all active:scale-[0.98]",
                                        notification.read ? "bg-[var(--color-native-card)]" : "bg-[var(--color-native-primary)]/10"
                                    )}
                                >
                                    <div className={cn(
                                        "w-12 h-12 rounded-full flex items-center justify-center shrink-0",
                                        getBgColor(notification.type)
                                    )}>
                                        {getIcon(notification.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-1">
                                            <h3 className={cn(
                                                "text-sm font-bold truncate pr-2",
                                                notification.read ? "text-[var(--color-native-text)]" : "text-[var(--color-native-primary)]"
                                            )}>
                                                {notification.title}
                                            </h3>
                                            <span className="text-[10px] font-medium text-[var(--color-native-text-muted)] whitespace-nowrap">
                                                {notification.time}
                                            </span>
                                        </div>
                                        <p className={cn(
                                            "text-xs line-clamp-2",
                                            notification.read ? "text-[var(--color-native-text-muted)]" : "text-[var(--color-native-primary)]/80"
                                        )}>
                                            {notification.message}
                                        </p>
                                    </div>
                                    {!notification.read && (
                                        <div className="w-2 h-2 rounded-full bg-[var(--color-native-primary)] mt-2 shrink-0" />
                                    )}
                                </div>
                            </Link>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-[var(--color-native-border)] bg-[var(--color-native-card)] rounded-b-3xl">
                    <button
                        className="w-full py-3 text-sm font-bold text-[var(--color-native-primary)] hover:bg-[var(--color-native-input)] rounded-xl transition-colors"
                        onClick={() => {
                            onMarkAllAsRead();
                        }}
                    >
                        Mark all as read
                    </button>
                </div>
            </div>
        </div>
    );
}
