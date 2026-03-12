import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Package, AlertTriangle, MessageSquare, CheckCircle2, AlertCircle, ShieldCheck, XCircle, Check, Undo2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminNotificationsApi, serviceRequestsApi } from "@/lib/api";
import { toast } from "sonner";
import { useRollback } from "@/contexts/RollbackContext";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface NotificationPanelProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onNavigate: (tab: string, id?: string) => void;
}

export function NotificationPanel({ open, onOpenChange, onNavigate }: NotificationPanelProps) {
    const { getPendingRollbacks, approveRollback, denyRollback } = useRollback();
    const [activeTab, setActiveTab] = React.useState("notifications");
    const queryClient = useQueryClient();

    const {
        data: adminNotifications,
        isLoading: isNotificationsLoading,
        isError: isNotificationsError,
    } = useQuery({
        queryKey: ['adminNotifications'],
        queryFn: adminNotificationsApi.getAll,
        enabled: open,
        staleTime: 30_000,
    });

    const {
        data: unreadCountData,
    } = useQuery({
        queryKey: ['adminNotificationCount'],
        queryFn: adminNotificationsApi.getUnreadCount,
        enabled: open,
        staleTime: 30_000,
    });

    const { data: pendingOverrides = [], refetch: refetchOverrides } = useQuery({
        queryKey: ['notifications-overrides'],
        queryFn: adminNotificationsApi.getOverrides,
        enabled: open,
        staleTime: 30_000,
    });

    const pendingRollbacks = getPendingRollbacks();
    const totalApprovals = pendingRollbacks.length + pendingOverrides.length;
    const notificationItems = adminNotifications ?? [];
    const unreadNotificationCount = unreadCountData?.count ?? (!isNotificationsError ? notificationItems.length : 0);

    const notifications = React.useMemo(() => {
        return notificationItems.map((notification) => ({
            id: notification.id,
            type: notification.type || 'service_request',
            title: notification.title,
            message: notification.message,
            time: new Date(notification.createdAt || new Date()),
            priority: notification.type === 'critical' ? 'critical' : 'info',
            read: Boolean(notification.read),
            link: notification.link || 'dashboard',
            linkId: notification.linkId || notification.jobId || undefined,
        }));
    }, [notificationItems]);

    const handleNavigate = async (n: any) => {
        if (n.type === 'service_request' && n.linkId) {
            try {
                await serviceRequestsApi.markInteracted(n.linkId);
                queryClient.invalidateQueries({ queryKey: ['serviceRequests'] });
                queryClient.invalidateQueries({ queryKey: ['adminNotifications'] });
                queryClient.invalidateQueries({ queryKey: ['adminNotificationCount'] });
            } catch {
                toast.error("Failed to mark request as interacted");
            }
        }
        onNavigate(n.link, n.linkId);
        onOpenChange(false);
    };

    const handleApproveRollback = (id: string) => {
        approveRollback(id);
        // In real implementation, this would call API to perform rollback
    };

    const handleDenyRollback = (id: string) => {
        denyRollback(id);
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-md p-0 flex flex-col">
                <SheetHeader className="p-4 border-b border-slate-100">
                    <SheetTitle className="flex items-center gap-2">
                        <Bell className="h-5 w-5 text-slate-500" />
                        Notifications
                        {unreadNotificationCount > 0 && (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] text-white">
                                {unreadNotificationCount}
                            </span>
                        )}
                    </SheetTitle>
                </SheetHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
                    <TabsList className="mx-4 mt-2 grid grid-cols-2">
                        <TabsTrigger value="notifications" className="flex items-center gap-2">
                            <Bell size={14} />
                            Notifications
                            {unreadNotificationCount > 0 && (
                                <span className="h-4 w-4 rounded-full bg-rose-500 text-[10px] text-white flex items-center justify-center">
                                    {unreadNotificationCount}
                                </span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="approvals" className="flex items-center gap-2">
                            <ShieldCheck size={14} />
                            Approvals
                            {totalApprovals > 0 && (
                                <span className="h-4 w-4 rounded-full bg-amber-500 text-[10px] text-white flex items-center justify-center">
                                    {totalApprovals}
                                </span>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    <ScrollArea className="flex-1">
                        <TabsContent value="notifications" className="m-0">
                            <div className="flex flex-col">
                                {isNotificationsLoading ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                                        <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                                            <Bell className="h-6 w-6 text-slate-400" />
                                        </div>
                                        <h3 className="text-sm font-semibold text-slate-900">Loading notifications</h3>
                                        <p className="text-sm text-slate-500 max-w-xs mt-1">
                                            Fetching the latest unread items from the server.
                                        </p>
                                    </div>
                                ) : isNotificationsError ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                                        <div className="h-12 w-12 rounded-full bg-rose-50 flex items-center justify-center mb-4">
                                            <AlertCircle className="h-6 w-6 text-rose-500" />
                                        </div>
                                        <h3 className="text-sm font-semibold text-slate-900">Could not load notifications</h3>
                                        <p className="text-sm text-slate-500 max-w-xs mt-1">
                                            The notification feed request failed. Check the server response and try again.
                                        </p>
                                    </div>
                                ) : notifications.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                                        <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                                            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                                        </div>
                                        <h3 className="text-sm font-semibold text-slate-900">All caught up!</h3>
                                        <p className="text-sm text-slate-500 max-w-xs mt-1">
                                            You have no new notifications to review at this moment.
                                        </p>
                                    </div>
                                ) : (
                                    notifications.map((n) => (
                                        <button
                                            key={n.id}
                                            onClick={() => handleNavigate(n)}
                                            className={cn(
                                                "flex items-start gap-4 p-4 transition-colors border-b border-slate-50 text-left w-full",
                                                n.read ? "hover:bg-slate-50" : "bg-rose-50/40 hover:bg-rose-50/70"
                                            )}
                                        >
                                            <div className={cn(
                                                "h-9 w-9 rounded-full flex items-center justify-center shrink-0 border",
                                                n.type === 'service_request' && "bg-rose-50 border-rose-100 text-rose-600",
                                                n.type === 'inventory' && "bg-orange-50 border-orange-100 text-orange-600",
                                                n.type === 'job' && "bg-blue-50 border-blue-100 text-blue-600",
                                                n.type === 'message' && "bg-indigo-50 border-indigo-100 text-indigo-600",
                                                (!['service_request', 'inventory', 'job', 'message'].includes(n.type)) && "bg-slate-50 border-slate-100 text-slate-600",
                                            )}>
                                                {n.type === 'service_request' && <MessageSquare size={16} />}
                                                {n.type === 'inventory' && <Package size={16} />}
                                                {n.type === 'job' && <AlertCircle size={16} />}
                                                {n.type === 'message' && <MessageSquare size={16} />}
                                                {!['service_request', 'inventory', 'job', 'message'].includes(n.type) && <Bell size={16} />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                                    <span className="text-sm font-semibold text-slate-900 truncate">
                                                        {n.title}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 shrink-0">
                                                        {format(n.time, 'MMM d, h:mm a')}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-500 line-clamp-2">
                                                    {n.message}
                                                </p>
                                                {n.priority === 'critical' && (
                                                    <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                                                        <AlertTriangle size={10} />
                                                        Critical
                                                    </span>
                                                )}
                                            </div>
                                            <div
                                                className={cn(
                                                    "h-2.5 w-2.5 rounded-full shrink-0 mt-1.5",
                                                    n.read ? "bg-slate-200" : "bg-rose-500"
                                                )}
                                                aria-label={n.read ? "Already interacted" : "Unread notification"}
                                            />
                                        </button>
                                    ))
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="approvals" className="m-0">
                            <div className="flex flex-col">
                                {totalApprovals === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                                        <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                                            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                                        </div>
                                        <h3 className="text-sm font-semibold text-slate-900">No pending approvals</h3>
                                        <p className="text-sm text-slate-500 max-w-xs mt-1">
                                            All rollback requests have been processed.
                                        </p>
                                    </div>
                                ) : (
                                    pendingRollbacks.map((request) => (
                                        <div
                                            key={request.id}
                                            className="p-4 border-b border-slate-50"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="h-9 w-9 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                                                    <Undo2 size={16} className="text-amber-600" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2 mb-1">
                                                        <span className="text-sm font-semibold text-slate-900">
                                                            Rollback Request
                                                        </span>
                                                        <span className="text-[10px] text-slate-400">
                                                            {format(request.requestedAt, 'MMM d, h:mm a')}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-500 mb-2">
                                                        <span className="font-medium">Ticket:</span> {request.ticketNumber}
                                                    </p>
                                                    <div className="flex items-center gap-2 text-xs mb-2">
                                                        <span className="text-red-500 line-through">{request.fromStatus}</span>
                                                        <Undo2 size={12} className="text-slate-400" />
                                                        <span className="text-green-600 font-medium">{request.toStatus}</span>
                                                    </div>
                                                    <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded mb-3">
                                                        "{request.reason}"
                                                    </p>
                                                    <div className="text-[10px] text-slate-400 mb-3">
                                                        Requested by: {request.requestedBy}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-7 text-xs rounded-lg border-red-200 text-red-600 hover:bg-red-50"
                                                            onClick={() => handleDenyRollback(request.id)}
                                                        >
                                                            <XCircle size={14} className="mr-1" />
                                                            Deny
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            className="h-7 text-xs rounded-lg bg-green-600 hover:bg-green-700"
                                                            onClick={() => handleApproveRollback(request.id)}
                                                        >
                                                            <Check size={14} className="mr-1" />
                                                            Approve
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}

                                {pendingOverrides.map((n: any) => {
                                    const payload = n.link ? JSON.parse(n.link) : {};
                                    return (
                                        <div key={n.id} className="p-4 border-b border-slate-50">
                                            <div className="flex items-start gap-3">
                                                <div className="h-9 w-9 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                                                    <AlertCircle size={16} className="text-amber-600" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between gap-2 mb-1">
                                                        <span className="text-sm font-semibold text-slate-900">
                                                            {n.title}
                                                        </span>
                                                        <span className="text-[10px] text-slate-400">
                                                            {format(new Date(n.createdAt), 'MMM d, h:mm a')}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-600 mb-2">
                                                        {n.message}
                                                    </p>
                                                    <div className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded mb-3">
                                                        <span className="font-medium mr-1">Requester Notes:</span> "{payload.reason}"
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            size="sm"
                                                            className="h-7 text-xs rounded-lg bg-green-600 hover:bg-green-700"
                                                            onClick={async () => {
                                                                try {
                                                                    await adminNotificationsApi.approveOverrideRequest(n.id);
                                                                    toast.success("Override Approved");
                                                                    refetchOverrides();
                                                                } catch (err) {
                                                                    toast.error("Failed to approve override");
                                                                }
                                                            }}
                                                        >
                                                            <Check size={14} className="mr-1" />
                                                            Approve
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </TabsContent>
                    </ScrollArea>
                </Tabs>

                <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                    <button
                        className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors disabled:cursor-not-allowed disabled:text-slate-400"
                        disabled
                    >
                        Mark all as read
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
