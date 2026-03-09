import React, { useState, useEffect } from 'react';
import { Bell, CheckCircle, RefreshCw, Filter, Calendar } from 'lucide-react';
import { useLocation } from "wouter";
import { useCorporateAuth } from '../../contexts/CorporateAuthContext';
import './notifications.css';

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
            const response = await fetch('/api/corporate/notifications', {
                credentials: 'include',
            });

            if (response.ok) {
                const data = await response.json();
                setNotifications(data);
            }
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, [user]);

    // Apply filters
    useEffect(() => {
        let filtered = notifications;

        // Apply status filter
        if (filter === 'unread') {
            filtered = filtered.filter(n => !n.read);
        } else if (filter === 'read') {
            filtered = filtered.filter(n => n.read);
        } else if (filter === 'repair') {
            filtered = filtered.filter(n => n.type === 'repair');
        } else if (filter === 'warning') {
            filtered = filtered.filter(n => n.type === 'warning');
        }

        // Apply date range filter
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
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            setNotifications(prev => prev.map(n =>
                n.id === id ? { ...n, read: true } : n
            ));
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    };

    const markAllAsRead = async () => {
        try {
            await fetch('/api/corporate/notifications/mark-all-read', {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
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

    const getNotificationTypeLabel = (type: string) => {
        switch (type) {
            case 'repair':
                return 'Repair Update';
            case 'success':
                return 'Success';
            case 'warning':
                return 'Alert';
            case 'shop':
                return 'Shop Update';
            default:
                return 'Information';
        }
    };

    const unreadCount = notifications.filter(n => !n.read).length;
    const repairCount = notifications.filter(n => n.type === 'repair').length;
    const warningCount = notifications.filter(n => n.type === 'warning').length;

    return (
            <div className="corporate-notifications-page">
                <div className="corporate-notifications-header">
                    <div className="corporate-notifications-header-left">
                        <h1>
                            <Bell size={24} />
                            Notifications
                        </h1>
                        <p>Stay updated with job status, alerts, and system messages</p>
                    </div>

                    <div className="corporate-notifications-header-right">
                        <button
                            className="refresh-btn"
                            onClick={fetchNotifications}
                            disabled={isLoading}
                        >
                            <RefreshCw size={16} />
                            Refresh
                        </button>

                        {unreadCount > 0 && (
                            <button
                                className="mark-all-read-btn"
                                onClick={markAllAsRead}
                            >
                                <CheckCircle size={16} />
                                Mark All as Read
                            </button>
                        )}
                    </div>
                </div>

                <div className="corporate-notifications-stats">
                    <div className="stat-card">
                        <div className="stat-number">{notifications.length}</div>
                        <div className="stat-label">Total</div>
                    </div>
                    <div className="stat-card unread">
                        <div className="stat-number">{unreadCount}</div>
                        <div className="stat-label">Unread</div>
                    </div>
                    <div className="stat-card repair">
                        <div className="stat-number">{repairCount}</div>
                        <div className="stat-label">Repair Updates</div>
                    </div>
                    <div className="stat-card warning">
                        <div className="stat-number">{warningCount}</div>
                        <div className="stat-label">Alerts</div>
                    </div>
                </div>

                <div className="corporate-notifications-controls">
                    <div className="filter-controls">
                        <div className="filter-group">
                            <Filter size={16} />
                            <select
                                value={filter}
                                onChange={(e) => setFilter(e.target.value as any)}
                                className="filter-select"
                            >
                                <option value="all">All Notifications</option>
                                <option value="unread">Unread Only</option>
                                <option value="read">Read Only</option>
                                <option value="repair">Repair Updates</option>
                                <option value="warning">Alerts</option>
                            </select>
                        </div>

                        <div className="filter-group">
                            <Calendar size={16} />
                            <select
                                value={selectedDateRange}
                                onChange={(e) => setSelectedDateRange(e.target.value as any)}
                                className="filter-select"
                            >
                                <option value="all">All Time</option>
                                <option value="today">Today</option>
                                <option value="week">Last 7 Days</option>
                                <option value="month">Last 30 Days</option>
                            </select>
                        </div>
                    </div>

                    <div className="results-count">
                        Showing {filteredNotifications.length} of {notifications.length} notifications
                    </div>
                </div>

                {isLoading ? (
                    <div className="corporate-notifications-loading">
                        Loading notifications...
                    </div>
                ) : filteredNotifications.length === 0 ? (
                    <div className="corporate-notifications-empty">
                        <div className="empty-icon">🔔</div>
                        <h3>No notifications found</h3>
                        <p>Try adjusting your filters or check back later for updates</p>
                    </div>
                ) : (
                    <div className="corporate-notifications-list">
                        {filteredNotifications.map((notification) => (
                            <div
                                key={notification.id}
                                className={`corporate-notification-card ${getNotificationTypeClass(notification.type)} ${notification.read ? 'read' : 'unread'}`}
                            >
                                <div className="corporate-notification-card-header">
                                    <div className="corporate-notification-type">
                                        <span className="notification-icon">
                                            {getNotificationIcon(notification.type)}
                                        </span>
                                        {getNotificationTypeLabel(notification.type)}
                                    </div>

                                    <div className="corporate-notification-actions">
                                        {!notification.read && (
                                            <button
                                                className="mark-read-btn"
                                                onClick={() => markAsRead(notification.id)}
                                            >
                                                Mark as Read
                                            </button>
                                        )}
                                        <span className="notification-time">
                                            {new Date(notification.createdAt).toLocaleDateString('en-US', {
                                                weekday: 'short',
                                                month: 'short',
                                                day: 'numeric',
                                            })}
                                            {' • '}
                                            {new Date(notification.createdAt).toLocaleTimeString([], {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </span>
                                    </div>
                                </div>

                                <div className="corporate-notification-card-body">
                                    <h3 className="notification-title">
                                        {notification.title}
                                    </h3>
                                    <p className="notification-message">
                                        {notification.message}
                                    </p>

                                    {notification.jobId && (
                                        <div className="notification-job-reference">
                                            Job ID: {notification.jobId}
                                        </div>
                                    )}

                                    {notification.link && (
                                        <a
                                            href={notification.link}
                                            className="notification-link"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setLocation(notification.link!);
                                            }}
                                        >
                                            View Details →
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
    );
};
