import React, { useState, useEffect } from 'react';
import { Bell, CheckCircle } from 'lucide-react';
import { useLocation } from 'wouter';
import { useCorporateAuth } from '../../contexts/CorporateAuthContext';
import { corporateNotificationsApi, type CorporateNotification } from '../../lib/api';
import { useCorporateSSE } from '../../hooks/useCorporateSSE';
import { playNotificationSound } from '../../lib/notification-sound';
import './CorporateNotificationsBell.css';

export const CorporateNotificationsBell: React.FC = () => {
    const { user } = useCorporateAuth();
    const [, setLocation] = useLocation();
    const [notifications, setNotifications] = useState<CorporateNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [lastChecked, setLastChecked] = useState<Date | null>(null);
    const [isPulsing, setIsPulsing] = useState(false);

    // SSE connection for real-time updates
    const { latestEvent, isConnected } = useCorporateSSE({ autoConnect: true });

    // Fetch notifications and unread count
    const fetchNotifications = async () => {
        if (!user) return;

        try {
            setIsLoading(true);
            const [notificationsData, unreadCountData] = await Promise.all([
                corporateNotificationsApi.getAll(),
                corporateNotificationsApi.getUnreadCount()
            ]);

            setNotifications(notificationsData);
            setUnreadCount(unreadCountData.count);
            setLastChecked(new Date());
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // Initial fetch
    useEffect(() => {
        fetchNotifications();
    }, [user]);

    // Fallback: Auto-refresh every 2 minutes (SSE is primary, this is backup)
    useEffect(() => {
        const interval = setInterval(fetchNotifications, 120000);
        return () => clearInterval(interval);
    }, []);

    // Handle real-time SSE events
    useEffect(() => {
        if (latestEvent && latestEvent.type === 'corporate_notification') {
            console.log('[CorporateNotificationsBell] New notification via SSE:', latestEvent.data);

            // Play notification sound based on preference
            try {
                const prefs = JSON.parse(user?.preferences || "{}");
                const tone = prefs.notificationSound || "default";
                playNotificationSound(tone);
            } catch (e) {
                playNotificationSound("default");
            }

            // Trigger pulse animation
            setIsPulsing(true);
            setTimeout(() => setIsPulsing(false), 2000);

            // Refetch to get the latest state
            fetchNotifications();
        }
    }, [latestEvent]);

    const toggleNotifications = () => {
        setIsOpen(!isOpen);
    };

    const handleNotificationClick = async (notification: CorporateNotification) => {
        if (!notification.read) {
            try {
                await corporateNotificationsApi.markAsRead(notification.id);
                // Update local state
                setNotifications(prev => prev.map(n =>
                    n.id === notification.id ? { ...n, read: true } : n
                ));
                setUnreadCount(prev => Math.max(0, prev - 1));
            } catch (error) {
                console.error('Failed to mark notification as read:', error);
            }
        }

        // Navigate if there's a link
        if (notification.link) {
            setLocation(notification.link);
            setIsOpen(false);
        }
    };

    const markAllAsRead = async () => {
        try {
            await corporateNotificationsApi.markAllAsRead();
            // Update local state
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        }
    };

    const getNotificationIcon = (type: string) => {
        switch (type) {
            case 'repair':
                return '🔧';
            case 'success':
                return '✅';
            case 'warning':
                return '⚠️';
            case 'shop':
                return '🛒';
            default:
                return '📢';
        }
    };

    const getNotificationTypeClass = (type: string) => {
        switch (type) {
            case 'repair':
                return 'notification-repair';
            case 'success':
                return 'notification-success';
            case 'warning':
                return 'notification-warning';
            case 'shop':
                return 'notification-shop';
            default:
                return 'notification-info';
        }
    };

    return (
        <div className="corporate-notifications-container">
            <button
                className={`corporate-notifications-bell ${isPulsing ? 'pulse-animation' : ''}`}
                onClick={toggleNotifications}
                aria-label={`Notifications (${unreadCount} unread)`}
                title={isConnected ? 'Live notifications connected' : 'Notifications (polling mode)'}
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="corporate-notifications-badge">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
                {/* Connection status indicator */}
                {isConnected && (
                    <span className="sse-connection-indicator" title="Real-time updates active" />
                )}
            </button>

            {isOpen && (
                <>
                    <div className="corporate-notifications-backdrop" onClick={() => setIsOpen(false)} />
                    <div className="corporate-notifications-dropdown">
                        <div className="corporate-notifications-header">
                            <h3>Notifications</h3>
                            <div className="corporate-notifications-header-actions">
                                {unreadCount > 0 && (
                                    <button
                                        className="corporate-notifications-mark-all-read"
                                        onClick={markAllAsRead}
                                    >
                                        <CheckCircle size={14} />
                                        Mark all as read
                                    </button>
                                )}
                                {lastChecked && (
                                    <span className="corporate-notifications-last-checked">
                                        Last checked: {lastChecked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                )}
                            </div>
                        </div>

                        {isLoading ? (
                            <div className="corporate-notifications-loading">Loading notifications...</div>
                        ) : notifications.length === 0 ? (
                            <div className="corporate-notifications-empty">
                                No notifications yet
                            </div>
                        ) : (
                            <div className="corporate-notifications-list">
                                {notifications.slice(0, 10).map((notification) => (
                                    <div
                                        key={notification.id}
                                        className={`corporate-notification-item ${getNotificationTypeClass(notification.type)} ${notification.read ? 'read' : 'unread'}`}
                                        onClick={() => handleNotificationClick(notification)}
                                    >
                                        <div className="corporate-notification-icon">
                                            {getNotificationIcon(notification.type)}
                                        </div>
                                        <div className="corporate-notification-content">
                                            <div className="corporate-notification-title">
                                                {notification.title}
                                            </div>
                                            <div className="corporate-notification-message">
                                                {notification.message}
                                            </div>
                                            <div className="corporate-notification-time">
                                                {new Date(notification.createdAt).toLocaleDateString()} at{' '}
                                                {new Date(notification.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                        {!notification.read && (
                                            <div className="corporate-notification-unread-indicator" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {notifications.length > 10 && (
                            <div
                                className="corporate-notifications-view-all"
                                onClick={() => {
                                    setLocation('/corporate/notifications');
                                    setIsOpen(false);
                                }}
                            >
                                View all notifications ({notifications.length})
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
