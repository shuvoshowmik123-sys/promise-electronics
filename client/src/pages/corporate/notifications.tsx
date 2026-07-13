import { useState, useEffect } from 'react';
import {
    Bell,
    CheckCircle,
    RefreshCw,
    Filter,
    Calendar,
    Wrench,
    AlertCircle,
    Package,
    Info,
    Loader2,
    ChevronRight,
    CheckCheck,
} from 'lucide-react';
import { useLocation } from "wouter";
import { useCorporateAuth } from '../../contexts/CorporateAuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getSafeJobDisplayRef } from '@shared/job-display-utils';

interface Notification {
    id: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'repair' | 'shop';
    link?: string;
    read: boolean;
    createdAt: string;
    jobId?: string;
    corporateClientId?: string;
}

function getNotificationIcon(type: string) {
    switch (type) {
        case 'repair': return Wrench;
        case 'success': return CheckCircle;
        case 'warning': return AlertCircle;
        case 'shop': return Package;
        default: return Info;
    }
}

function getNotificationTypeLabel(type: string) {
    switch (type) {
        case 'repair': return 'Repair Update';
        case 'success': return 'Success';
        case 'warning': return 'Alert';
        case 'shop': return 'Shop Update';
        default: return 'Information';
    }
}

function getTypeBadgeClass(type: string) {
    switch (type) {
        case 'repair': return 'bg-blue-50 text-blue-600 border-blue-100';
        case 'success': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
        case 'warning': return 'bg-amber-50 text-amber-700 border-amber-100';
        case 'shop': return 'bg-sky-50 text-sky-700 border-sky-100';
        default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
}

function getUnreadAccentClass(type: string) {
    switch (type) {
        case 'repair': return 'border-l-blue-400';
        case 'success': return 'border-l-emerald-400';
        case 'warning': return 'border-l-amber-400';
        case 'shop': return 'border-l-sky-400';
        default: return 'border-l-slate-300';
    }
}

export default function CorporateNotificationsPage() {
    const { user } = useCorporateAuth();
    const [, setLocation] = useLocation();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [filteredNotifications, setFilteredNotifications] = useState<Notification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'unread' | 'read' | 'repair' | 'warning'>('all');
    const [selectedDateRange, setSelectedDateRange] = useState<'all' | 'today' | 'week' | 'month'>('all');

    const fetchNotifications = async () => {
        if (!user) return;
        try {
            setIsLoading(true);
            const response = await fetch('/api/corporate/notifications', { credentials: 'include' });
            if (response.ok) {
                const data = await response.json();
                setNotifications(data);
            }
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, [user]);

    useEffect(() => {
        let filtered = notifications;

        if (filter === 'unread') filtered = filtered.filter(n => !n.read);
        else if (filter === 'read') filtered = filtered.filter(n => n.read);
        else if (filter === 'repair') filtered = filtered.filter(n => n.type === 'repair');
        else if (filter === 'warning') filtered = filtered.filter(n => n.type === 'warning');

        const now = new Date();
        if (selectedDateRange === 'today') {
            const today = new Date(now.setHours(0, 0, 0, 0));
            filtered = filtered.filter(n => new Date(n.createdAt) >= today);
        } else if (selectedDateRange === 'week') {
            const weekAgo = new Date(now.setDate(now.getDate() - 7));
            filtered = filtered.filter(n => new Date(n.createdAt) >= weekAgo);
        } else if (selectedDateRange === 'month') {
            const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
            filtered = filtered.filter(n => new Date(n.createdAt) >= monthAgo);
        }

        setFilteredNotifications(filtered);
    }, [notifications, filter, selectedDateRange]);

    const markAsRead = async (id: string) => {
        try {
            await fetch(`/api/corporate/notifications/${id}/read`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
            });
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        } catch {
            // silent
        }
    };

    const markAllAsRead = async () => {
        try {
            await fetch('/api/corporate/notifications/mark-all-read', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
            });
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        } catch {
            // silent
        }
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <div className="space-y-4 pb-4">
            {/* Page header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--corp-blue)]">Updates</p>
                    <h1 className="mt-0.5 text-2xl font-black tracking-tight text-slate-900">Notifications</h1>
                    <p className="mt-1 text-sm text-slate-500">
                        {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                    </p>
                </div>
                <div className="flex gap-2 pt-1">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-9 w-9 rounded-xl border-slate-200 p-0"
                        onClick={fetchNotifications}
                        disabled={isLoading}
                        aria-label="Refresh notifications"
                    >
                        <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
                    </Button>
                    {unreadCount > 0 && (
                        <Button
                            size="sm"
                            className="h-9 rounded-xl bg-[var(--corp-blue)] text-xs font-bold text-white"
                            onClick={markAllAsRead}
                        >
                            <CheckCheck className="h-3.5 w-3.5 mr-1.5" />
                            Mark all read
                        </Button>
                    )}
                </div>
            </div>

            {/* Summary strip */}
            <div className="grid grid-cols-4 gap-2">
                {[
                    { label: 'Total', value: notifications.length, active: filter === 'all', onClick: () => setFilter('all') },
                    { label: 'Unread', value: unreadCount, active: filter === 'unread', onClick: () => setFilter('unread') },
                    { label: 'Repairs', value: notifications.filter(n => n.type === 'repair').length, active: filter === 'repair', onClick: () => setFilter('repair') },
                    { label: 'Alerts', value: notifications.filter(n => n.type === 'warning').length, active: filter === 'warning', onClick: () => setFilter('warning') },
                ].map(({ label, value, active, onClick }) => (
                    <button
                        key={label}
                        onClick={onClick}
                        className={cn(
                            "rounded-xl border p-3 text-center transition-colors",
                            active
                                ? "border-[var(--corp-blue)] bg-blue-50"
                                : "border-slate-200 bg-white hover:border-slate-300"
                        )}
                    >
                        <p className={cn("text-xl font-black", active ? "text-[var(--corp-blue)]" : "text-slate-900")}>{value}</p>
                        <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{label}</p>
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div className="flex gap-2">
                <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <Filter className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value as typeof filter)}
                        className="flex-1 border-none bg-transparent text-xs font-medium text-slate-700 outline-none"
                    >
                        <option value="all">All types</option>
                        <option value="unread">Unread only</option>
                        <option value="read">Read only</option>
                        <option value="repair">Repair updates</option>
                        <option value="warning">Alerts</option>
                    </select>
                </div>
                <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <select
                        value={selectedDateRange}
                        onChange={(e) => setSelectedDateRange(e.target.value as typeof selectedDateRange)}
                        className="flex-1 border-none bg-transparent text-xs font-medium text-slate-700 outline-none"
                    >
                        <option value="all">All time</option>
                        <option value="today">Today</option>
                        <option value="week">Last 7 days</option>
                        <option value="month">Last 30 days</option>
                    </select>
                </div>
            </div>

            {/* Count */}
            <p className="text-xs text-slate-400">
                Showing {filteredNotifications.length} of {notifications.length}
            </p>

            {/* Notification list */}
            {isLoading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-[var(--corp-blue)]" />
                </div>
            ) : filteredNotifications.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-14 text-center">
                    <Bell className="mx-auto h-9 w-9 text-slate-200" />
                    <p className="mt-3 font-bold text-slate-700">No notifications found</p>
                    <p className="mt-1 text-sm text-slate-400">Try adjusting your filters or check back later.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filteredNotifications.map((notification) => {
                        const Icon = getNotificationIcon(notification.type);
                        const badgeClass = getTypeBadgeClass(notification.type);
                        const accentClass = getUnreadAccentClass(notification.type);
                        return (
                            <div
                                key={notification.id}
                                className={cn(
                                    "rounded-xl border bg-white transition-shadow hover:shadow-sm",
                                    notification.read
                                        ? "border-slate-100 opacity-80"
                                        : cn("border-l-4 border-slate-100", accentClass)
                                )}
                            >
                                <div className="p-4">
                                    {/* Card header */}
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border", badgeClass)}>
                                                <Icon className="h-3.5 w-3.5" />
                                            </div>
                                            <span className={cn("text-[10px] font-black uppercase tracking-wider border rounded-full px-2 py-0.5", badgeClass)}>
                                                {getNotificationTypeLabel(notification.type)}
                                            </span>
                                            {!notification.read && (
                                                <span className="h-1.5 w-1.5 rounded-full bg-[var(--corp-blue)]" />
                                            )}
                                        </div>
                                        <span className="shrink-0 text-[10px] text-slate-400">
                                            {new Date(notification.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            {' · '}
                                            {new Date(notification.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>

                                    {/* Card body */}
                                    <p className="text-sm font-bold text-slate-800 leading-snug">{notification.title}</p>
                                    <p className="mt-1 text-xs text-slate-500 leading-relaxed">{notification.message}</p>

                                    {notification.jobId && (
                                        <span className="mt-2 inline-block rounded-lg bg-slate-50 border border-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500">
                                            Ref: {getSafeJobDisplayRef({ id: notification.jobId })}
                                        </span>
                                    )}

                                    {/* Actions */}
                                    <div className="mt-3 flex items-center justify-between">
                                        {notification.link ? (
                                            <button
                                                onClick={() => setLocation(notification.link!)}
                                                className="flex items-center gap-1 text-xs font-bold text-[var(--corp-blue)]"
                                            >
                                                View Details <ChevronRight className="h-3 w-3" />
                                            </button>
                                        ) : <span />}
                                        {!notification.read && (
                                            <button
                                                onClick={() => markAsRead(notification.id)}
                                                className="text-[10px] font-semibold text-slate-400 hover:text-slate-600"
                                            >
                                                Mark read
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
