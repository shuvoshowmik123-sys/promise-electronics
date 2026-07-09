import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
    Truck, Search, Calendar, Phone, User, CheckCircle, X, XCircle,
    Clock, MapPin, ArrowRight, MoreVertical, AlertTriangle, RotateCcw,
    Play, Package, RefreshCw, Plus, Navigation, List, Route, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { adminLogisticsApi, type LogisticsTask } from "@/lib/api/adminApi";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
    DashboardSkeleton, MobileTabLayout, MobileTabHeader,
    MobileScrollContent, MobileSegmentTabs, MobileKpiGrid,
} from "../shared";
import { HandoverSheet, type HandoverTarget } from "./pickup/HandoverSheet";
import { MobileBottomSheetFrame, MobileBottomSheetHandle } from "@/components/ui/mobile-bottom-sheet";
import { useIsMobile } from "@/hooks/use-mobile";

type Lane = "all" | "today" | "pickups" | "deliveries" | "assigned" | "en_route" | "failed" | "completed";

function isToday(d: string | null): boolean {
    if (!d) return false;
    const task = new Date(d);
    const now = new Date();
    return task.getFullYear() === now.getFullYear() && task.getMonth() === now.getMonth() && task.getDate() === now.getDate();
}

function matchLane(t: LogisticsTask, lane: Lane): boolean {
    if (lane === "all") return true;
    if (lane === "today") return isToday(t.scheduledDate) && !["completed", "cancelled"].includes(t.status);
    if (lane === "pickups") return t.taskType === "pickup" && !["completed", "cancelled"].includes(t.status);
    if (lane === "deliveries") return t.taskType === "delivery" && !["completed", "cancelled"].includes(t.status);
    if (lane === "assigned") return t.status === "assigned";
    if (lane === "en_route") return t.status === "en_route";
    if (lane === "failed") return t.status === "failed" || t.status === "rescheduled";
    if (lane === "completed") return t.status === "completed";
    return true;
}

function navigateUrl(t: LogisticsTask): string | null {
    const addr = t.pickupAddress || t.deliveryAddress;
    if (!addr) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
}

function routeSortKey(t: LogisticsTask): number[] {
    const todayFirst = isToday(t.scheduledDate) ? 0 : 1;
    const order = t.routeOrder ?? 999999;
    const sched = t.scheduledDate ? new Date(t.scheduledDate).getTime() : Number.MAX_SAFE_INTEGER;
    const created = new Date(t.createdAt).getTime();
    return [todayFirst, order, sched, -created];
}

function compareRouteSort(a: LogisticsTask, b: LogisticsTask): number {
    const ka = routeSortKey(a);
    const kb = routeSortKey(b);
    for (let i = 0; i < ka.length; i++) {
        if (ka[i] !== kb[i]) return ka[i] - kb[i];
    }
    return 0;
}

function statusBadge(status: string) {
    const map: Record<string, { className: string; label: string }> = {
        pending: { className: "bg-amber-50 text-amber-700 border-amber-200", label: "Pending" },
        assigned: { className: "bg-blue-50 text-blue-700 border-blue-200", label: "Assigned" },
        en_route: { className: "bg-orange-50 text-orange-700 border-orange-200", label: "En Route" },
        completed: { className: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Completed" },
        failed: { className: "bg-rose-50 text-rose-700 border-rose-200", label: "Failed" },
        cancelled: { className: "bg-slate-100 text-slate-500 border-slate-200", label: "Cancelled" },
        rescheduled: { className: "bg-violet-50 text-violet-700 border-violet-200", label: "Rescheduled" },
    };
    const m = map[status] || { className: "bg-slate-100 text-slate-600 border-slate-200", label: status };
    return <Badge variant="outline" className={m.className}>{m.label}</Badge>;
}

function typeIcon(taskType: string) {
    if (taskType === "delivery") return <Package className="h-3.5 w-3.5 text-violet-500" />;
    if (taskType === "transfer") return <ArrowRight className="h-3.5 w-3.5 text-slate-500" />;
    return <Truck className="h-3.5 w-3.5 text-blue-500" />;
}

function typeAccent(taskType: string): string {
    if (taskType === "delivery") return "bg-violet-500";
    if (taskType === "transfer") return "bg-slate-400";
    if (taskType === "manual") return "bg-amber-500";
    return "bg-blue-500";
}

function formatDateShort(d: string | null): string {
    if (!d) return "—";
    try { return format(new Date(d), "d MMM"); } catch { return "—"; }
}

function address(t: LogisticsTask): string {
    return t.pickupAddress || t.deliveryAddress || "No address";
}

export default function PickupTab() {
    const queryClient = useQueryClient();
    const { user } = useAdminAuth();
    const isMobile = useIsMobile();
    const isDriver = user?.role === "Driver";

    const [lane, setLane] = useState<Lane>("all");
    const [search, setSearch] = useState("");

    useEffect(() => {
        if (isDriver && lane === "all") setLane("today");
    }, [isDriver]);
    const [selectedTask, setSelectedTask] = useState<LogisticsTask | null>(null);
    const [handoverTarget, setHandoverTarget] = useState<HandoverTarget | null>(null);

    // Sheets
    const [assignOpen, setAssignOpen] = useState(false);
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [failOpen, setFailOpen] = useState(false);

    // Desktop view toggle
    const [desktopView, setDesktopView] = useState<"operations" | "routePlan">("operations");

    // Route plan state (desktop only)
    const [rpDate, setRpDate] = useState(format(new Date(), "yyyy-MM-dd"));
    const [rpZone, setRpZone] = useState("");
    const [rpDriverId, setRpDriverId] = useState("");
    const [rpDriverName, setRpDriverName] = useState("");
    const [rpSelected, setRpSelected] = useState<Set<string>>(new Set());
    const [rpOrders, setRpOrders] = useState<Record<string, number>>({});

    // Form state
    const [assignDriverId, setAssignDriverId] = useState("");
    const [assignDriverName, setAssignDriverName] = useState("");
    const [assignZone, setAssignZone] = useState("");
    const [schedDate, setSchedDate] = useState("");
    const [schedWindow, setSchedWindow] = useState("");
    const [schedReason, setSchedReason] = useState("");
    const [failReason, setFailReason] = useState("");

    const [cancelConfirmTask, setCancelConfirmTask] = useState<LogisticsTask | null>(null);

    const anySheetOpen = assignOpen || scheduleOpen || failOpen || !!handoverTarget || !!selectedTask;
    useEffect(() => {
        if (isMobile && anySheetOpen) {
            window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: true } }));
            return () => { window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: false } })); };
        }
    }, [anySheetOpen, isMobile]);

    const { data: tasks, isLoading } = useQuery({
        queryKey: ["logisticsTasks"],
        queryFn: () => adminLogisticsApi.list(),
    });

    const { data: drivers = [] } = useQuery({
        queryKey: ["logistics-drivers"],
        queryFn: () => adminLogisticsApi.listDrivers(),
        enabled: !isDriver,
        staleTime: 60_000,
    });

    const allTasks = useMemo(() => {
        let list = tasks || [];
        if (isDriver && user?.id) {
            const driverName = (user as any).name || "";
            list = list.filter(t =>
                t.assignedDriverId === user.id ||
                (!t.assignedDriverId && t.assignedDriverName && driverName && t.assignedDriverName === driverName)
            );
        }
        return list;
    }, [tasks, isDriver, user?.id, user]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return allTasks.filter(t => {
            if (!matchLane(t, lane)) return false;
            if (q && !(
                t.customerName.toLowerCase().includes(q) ||
                t.customerPhone?.includes(search) ||
                t.id.toLowerCase().includes(q) ||
                (t.pickupAddress || "").toLowerCase().includes(q) ||
                (t.deliveryAddress || "").toLowerCase().includes(q) ||
                (t.zone || "").toLowerCase().includes(q)
            )) return false;
            return true;
        }).sort(compareRouteSort);
    }, [allTasks, lane, search]);

    const laneCounts = useMemo(() => ({
        all: allTasks.length,
        today: allTasks.filter(t => matchLane(t, "today")).length,
        pickups: allTasks.filter(t => matchLane(t, "pickups")).length,
        deliveries: allTasks.filter(t => matchLane(t, "deliveries")).length,
        assigned: allTasks.filter(t => matchLane(t, "assigned")).length,
        en_route: allTasks.filter(t => matchLane(t, "en_route")).length,
        failed: allTasks.filter(t => matchLane(t, "failed")).length,
        completed: allTasks.filter(t => matchLane(t, "completed")).length,
    }), [allTasks]);

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ["logisticsTasks"] });
        queryClient.invalidateQueries({ queryKey: ["adminPickups"] });
        queryClient.invalidateQueries({ queryKey: ["service-requests"] });
    };

    const statusMutation = useMutation({
        mutationFn: ({ id, status, failureReason }: { id: string; status: string; failureReason?: string }) =>
            adminLogisticsApi.setStatus(id, { status, failureReason }),
        onSuccess: () => { toast.success("Status updated"); invalidate(); },
        onError: (e: Error) => toast.error(e.message),
    });

    const assignMutation = useMutation({
        mutationFn: ({ id, driverId, driverName, zone, routeOrder }: { id: string; driverId: string; driverName: string; zone?: string; routeOrder?: number }) =>
            adminLogisticsApi.assign(id, { driverId, driverName, zone, routeOrder }),
        onSuccess: () => { toast.success("Driver assigned"); invalidate(); setAssignOpen(false); },
        onError: (e: Error) => toast.error(e.message),
    });

    const rescheduleMutation = useMutation({
        mutationFn: ({ id, scheduledDate, timeWindow, reason }: { id: string; scheduledDate: string; timeWindow?: string; reason?: string }) =>
            adminLogisticsApi.reschedule(id, { scheduledDate, timeWindow, reason }),
        onSuccess: () => { toast.success("Rescheduled"); invalidate(); setScheduleOpen(false); },
        onError: (e: Error) => toast.error(e.message),
    });

    const cancelMutation = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
            adminLogisticsApi.cancel(id, { reason }),
        onSuccess: () => { toast.success("Task cancelled"); invalidate(); },
        onError: (e: Error) => toast.error(e.message),
    });

    const batchAssignMutation = useMutation({
        mutationFn: (data: { taskIds: string[]; driverId: string; driverName: string; zone?: string }) =>
            adminLogisticsApi.batchAssign(data),
        onSuccess: (res) => { toast.success(`Assigned ${res.updated} tasks`); invalidate(); setRpSelected(new Set()); },
        onError: (e: Error) => toast.error(e.message),
    });

    const batchReorderMutation = useMutation({
        mutationFn: (data: { tasks: { id: string; routeOrder: number }[] }) =>
            adminLogisticsApi.batchReorder(data),
        onSuccess: (res) => { toast.success(`Reordered ${res.updated} tasks`); invalidate(); setRpOrders({}); },
        onError: (e: Error) => toast.error(e.message),
    });

    // ── ROUTE PLAN computed lists (hooks must be above early return) ────────
    const rpMatchDate = (t: LogisticsTask): boolean => {
        if (!rpDate) return true;
        if (!t.scheduledDate) return false;
        try { return format(new Date(t.scheduledDate), "yyyy-MM-dd") === rpDate; } catch { return false; }
    };

    const rpUnassigned = useMemo(() => {
        return (tasks || []).filter(t => {
            if (["completed", "cancelled"].includes(t.status)) return false;
            if (!rpMatchDate(t)) return false;
            if (rpZone && t.zone && t.zone !== rpZone) return false;
            return !t.assignedDriverId;
        }).sort(compareRouteSort);
    }, [tasks, rpDate, rpZone]);

    const rpAssigned = useMemo(() => {
        if (!rpDriverId) return [];
        return (tasks || []).filter(t => {
            if (["completed", "cancelled"].includes(t.status)) return false;
            if (t.assignedDriverId !== rpDriverId) return false;
            if (!rpMatchDate(t)) return false;
            if (rpZone && t.zone !== rpZone) return false;
            return true;
        }).sort((a, b) => (a.routeOrder ?? 999) - (b.routeOrder ?? 999));
    }, [tasks, rpDriverId, rpDate, rpZone]);

    if (isLoading) return <DashboardSkeleton />;

    const openHandover = (t: LogisticsTask) => {
        if (!t.serviceRequestId || !t.legacyPickupScheduleId) {
            statusMutation.mutate({ id: t.id, status: "completed" });
            return;
        }
        setHandoverTarget({
            serviceRequestId: t.serviceRequestId,
            pickupId: t.legacyPickupScheduleId,
            device: t.taskType === "delivery" ? "Return Device" : "Pickup Device",
            customerName: t.customerName,
            phone: t.customerPhone || undefined,
            amountDue: 0,
            mode: t.taskType === "delivery" ? "delivery" : "receive",
        });
    };

    const openAssign = (t: LogisticsTask) => {
        setSelectedTask(t);
        setAssignDriverId(t.assignedDriverId || "");
        setAssignDriverName(t.assignedDriverName || "");
        setAssignZone(t.zone || "");
        setAssignOpen(true);
    };

    const openSchedule = (t: LogisticsTask) => {
        setSelectedTask(t);
        setSchedDate(t.scheduledDate ? format(new Date(t.scheduledDate), "yyyy-MM-dd") : "");
        setSchedWindow(t.timeWindow || "");
        setSchedReason("");
        setScheduleOpen(true);
    };

    const openFail = (t: LogisticsTask) => {
        setSelectedTask(t);
        setFailReason("");
        setFailOpen(true);
    };

    const primaryAction = (t: LogisticsTask) => {
        if (t.status === "completed" || t.status === "cancelled") return null;
        if (t.status === "pending" || t.status === "assigned" || t.status === "rescheduled")
            return { label: "Start Route", icon: <Play className="h-4 w-4" />, onClick: () => statusMutation.mutate({ id: t.id, status: "en_route" }) };
        if (t.status === "en_route")
            return { label: t.taskType === "delivery" ? "Deliver" : "Receive", icon: <CheckCircle className="h-4 w-4" />, onClick: () => openHandover(t) };
        return null;
    };

    // ── LANE CHIPS ───────────────────────────────────────────────
    const laneItems: { label: string; value: Lane }[] = [
        ...(isDriver ? [{ label: `Today ${laneCounts.today}`, value: "today" as Lane }] : []),
        { label: `All ${laneCounts.all}`, value: "all" },
        { label: `Pickups ${laneCounts.pickups}`, value: "pickups" },
        { label: `Deliveries ${laneCounts.deliveries}`, value: "deliveries" },
        { label: `Assigned ${laneCounts.assigned}`, value: "assigned" },
        { label: `En Route ${laneCounts.en_route}`, value: "en_route" },
        { label: `Failed ${laneCounts.failed}`, value: "failed" },
        { label: `Done ${laneCounts.completed}`, value: "completed" },
    ];

    const kpis = [
        { label: "Pickups", value: laneCounts.pickups, tone: "blue" as const, icon: <Truck className="h-4 w-4" /> },
        { label: "Deliveries", value: laneCounts.deliveries, tone: "violet" as const, icon: <Package className="h-4 w-4" /> },
        { label: "En Route", value: laneCounts.en_route, tone: "amber" as const, icon: <Play className="h-4 w-4" /> },
        { label: "Done", value: laneCounts.completed, tone: "emerald" as const, icon: <CheckCircle className="h-4 w-4" /> },
    ];

    const rpToggleSelect = (id: string) => {
        setRpSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    };

    const rpSelectAll = () => {
        setRpSelected(new Set(rpUnassigned.map(t => t.id)));
    };

    const rpSetOrder = (id: string, val: string) => {
        const n = parseInt(val, 10);
        if (!val) { setRpOrders(prev => { const next = { ...prev }; delete next[id]; return next; }); return; }
        if (Number.isFinite(n) && n > 0) setRpOrders(prev => ({ ...prev, [id]: n }));
    };

    const rpHasOrderEdits = Object.keys(rpOrders).length > 0;

    const rpSaveOrders = () => {
        const items = Object.entries(rpOrders).map(([id, routeOrder]) => ({ id, routeOrder }));
        if (items.length > 0) batchReorderMutation.mutate({ tasks: items });
    };

    const rpBatchAssign = () => {
        const ids = Array.from(rpSelected);
        if (ids.length === 0 || !rpDriverId) return;
        batchAssignMutation.mutate({ taskIds: ids, driverId: rpDriverId, driverName: rpDriverName, zone: rpZone || undefined });
    };

    // ── MOBILE BOTTOM SHEETS (portaled) ──────────────────────────
    const sheetPortal = (
        <>
            {/* Assign Driver Sheet */}
            {createPortal(
                <AnimatePresence>
                    {isMobile && assignOpen && selectedTask && (
                        <div className="fixed inset-0 z-[205]">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={() => setAssignOpen(false)} />
                            <MobileBottomSheetFrame onClose={() => setAssignOpen(false)} className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-[2rem] bg-white shadow-2xl">
                                <div className="flex-none px-4 pb-2 pt-3">
                                    <MobileBottomSheetHandle />
                                    <h3 className="mt-3 text-lg font-black text-slate-950">Assign Driver</h3>
                                </div>
                                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 space-y-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-black uppercase text-slate-500">Driver</Label>
                                        <select
                                            className="h-12 w-full rounded-2xl border border-slate-200 px-3 text-sm font-bold"
                                            value={assignDriverId}
                                            onChange={(e) => {
                                                const d = drivers.find((u: any) => u.id === e.target.value);
                                                setAssignDriverId(e.target.value);
                                                setAssignDriverName(d?.name || "");
                                            }}
                                        >
                                            <option value="">Select driver</option>
                                            {drivers.map((d: any) => <option key={d.id} value={d.id}>{d.name} ({d.role})</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-black uppercase text-slate-500">Zone</Label>
                                        <Input value={assignZone} onChange={(e) => setAssignZone(e.target.value)} placeholder="N, S, E, W..." className="h-12 rounded-2xl" />
                                    </div>
                                </div>
                                <div className="grid flex-none grid-cols-2 gap-2 border-t border-slate-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                                    <Button variant="outline" className="h-11 rounded-2xl font-black" onClick={() => setAssignOpen(false)}>Cancel</Button>
                                    <Button className="h-11 rounded-2xl bg-blue-600 font-black" disabled={!assignDriverId || assignMutation.isPending}
                                        onClick={() => assignMutation.mutate({ id: selectedTask.id, driverId: assignDriverId, driverName: assignDriverName, zone: assignZone || undefined })}>
                                        {assignMutation.isPending ? "Saving..." : "Assign"}
                                    </Button>
                                </div>
                            </MobileBottomSheetFrame>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Schedule / Reschedule Sheet */}
            {createPortal(
                <AnimatePresence>
                    {isMobile && scheduleOpen && selectedTask && (
                        <div className="fixed inset-0 z-[205]">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={() => setScheduleOpen(false)} />
                            <MobileBottomSheetFrame onClose={() => setScheduleOpen(false)} className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-[2rem] bg-white shadow-2xl">
                                <div className="flex-none px-4 pb-2 pt-3">
                                    <MobileBottomSheetHandle />
                                    <h3 className="mt-3 text-lg font-black text-slate-950">{selectedTask.scheduledDate ? "Reschedule" : "Schedule"}</h3>
                                </div>
                                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 space-y-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-black uppercase text-slate-500">Date</Label>
                                        <Input type="date" value={schedDate} min={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setSchedDate(e.target.value)} className="h-12 rounded-2xl text-base font-bold" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-black uppercase text-slate-500">Time Window</Label>
                                        <Input value={schedWindow} onChange={(e) => setSchedWindow(e.target.value)} placeholder="10 AM - 1 PM" className="h-12 rounded-2xl" />
                                    </div>
                                    {selectedTask.scheduledDate && (
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-black uppercase text-slate-500">Reason</Label>
                                            <Textarea value={schedReason} onChange={(e) => setSchedReason(e.target.value)} placeholder="Why reschedule?" className="min-h-20 rounded-2xl" />
                                        </div>
                                    )}
                                </div>
                                <div className="grid flex-none grid-cols-2 gap-2 border-t border-slate-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                                    <Button variant="outline" className="h-11 rounded-2xl font-black" onClick={() => setScheduleOpen(false)}>Cancel</Button>
                                    <Button className="h-11 rounded-2xl bg-blue-600 font-black" disabled={!schedDate || rescheduleMutation.isPending}
                                        onClick={() => rescheduleMutation.mutate({ id: selectedTask.id, scheduledDate: schedDate, timeWindow: schedWindow || undefined, reason: schedReason || undefined })}>
                                        {rescheduleMutation.isPending ? "Saving..." : "Save"}
                                    </Button>
                                </div>
                            </MobileBottomSheetFrame>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Mark Failed Sheet */}
            {createPortal(
                <AnimatePresence>
                    {isMobile && failOpen && selectedTask && (
                        <div className="fixed inset-0 z-[205]">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={() => setFailOpen(false)} />
                            <MobileBottomSheetFrame onClose={() => setFailOpen(false)} className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-[2rem] bg-white shadow-2xl">
                                <div className="flex-none px-4 pb-2 pt-3">
                                    <MobileBottomSheetHandle />
                                    <h3 className="mt-3 text-lg font-black text-slate-950">Mark Failed</h3>
                                </div>
                                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 space-y-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-black uppercase text-slate-500">Reason</Label>
                                        <Textarea value={failReason} onChange={(e) => setFailReason(e.target.value)} placeholder="Customer unavailable, wrong address, phone unreachable..." className="min-h-28 rounded-2xl" />
                                    </div>
                                </div>
                                <div className="grid flex-none grid-cols-2 gap-2 border-t border-slate-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                                    <Button variant="outline" className="h-11 rounded-2xl font-black" onClick={() => setFailOpen(false)}>Cancel</Button>
                                    <Button className="h-11 rounded-2xl bg-rose-600 font-black text-white" disabled={!failReason.trim() || statusMutation.isPending}
                                        onClick={() => { statusMutation.mutate({ id: selectedTask.id, status: "failed", failureReason: failReason.trim() }); setFailOpen(false); }}>
                                        {statusMutation.isPending ? "Saving..." : "Mark Failed"}
                                    </Button>
                                </div>
                            </MobileBottomSheetFrame>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Detail Sheet (mobile) */}
            {createPortal(
                <AnimatePresence>
                    {isMobile && selectedTask && !assignOpen && !scheduleOpen && !failOpen && (
                        <div className="fixed inset-0 z-[205]">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={() => setSelectedTask(null)} />
                            <MobileBottomSheetFrame onClose={() => setSelectedTask(null)} className="absolute inset-x-0 bottom-0 flex max-h-[90dvh] flex-col rounded-t-[2rem] bg-white shadow-2xl">
                                <div className="flex-none px-4 pb-2 pt-3">
                                    <MobileBottomSheetHandle />
                                    <div className="mt-3 flex items-center justify-between">
                                        <h3 className="text-lg font-black text-slate-950">{selectedTask.taskType === "delivery" ? "Delivery" : "Pickup"} Task</h3>
                                        {statusBadge(selectedTask.status)}
                                    </div>
                                    <p className="text-xs font-mono text-slate-400 mt-1">{selectedTask.id}</p>
                                </div>
                                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 space-y-3">
                                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3 space-y-2">
                                        <div className="flex items-center gap-2 text-sm"><User className="h-3.5 w-3.5 text-slate-400" /> <span className="font-bold text-slate-900">{selectedTask.customerName || "Unknown"}</span></div>
                                        {selectedTask.customerPhone && (
                                            <a href={`tel:${selectedTask.customerPhone}`} className="flex items-center gap-2 text-sm text-blue-600 font-bold">
                                                <Phone className="h-3.5 w-3.5" /> {selectedTask.customerPhone}
                                            </a>
                                        )}
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 text-sm text-slate-600 min-w-0"><MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" /> <span className="truncate">{address(selectedTask)}</span></div>
                                            {navigateUrl(selectedTask) && (
                                                <a href={navigateUrl(selectedTask)!} target="_blank" rel="noopener noreferrer" className="shrink-0 h-8 w-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center">
                                                    <Navigation className="h-3.5 w-3.5 text-blue-600" />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                    {selectedTask.scheduledDate && (
                                        <div className="flex items-center gap-2 text-sm"><Calendar className="h-3.5 w-3.5 text-slate-400" /> {format(new Date(selectedTask.scheduledDate), "PPP")} {selectedTask.timeWindow && `· ${selectedTask.timeWindow}`}</div>
                                    )}
                                    {selectedTask.assignedDriverName && (
                                        <div className="flex items-center gap-2 text-sm"><User className="h-3.5 w-3.5 text-slate-400" /> Driver: {selectedTask.assignedDriverName}</div>
                                    )}
                                    {selectedTask.zone && <div className="flex items-center gap-2 text-sm"><MapPin className="h-3.5 w-3.5 text-slate-400" /> Zone: {selectedTask.zone} {selectedTask.routeOrder != null && `· Route #${selectedTask.routeOrder}`}</div>}
                                    {selectedTask.notes && <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-sm text-amber-800">{selectedTask.notes}</div>}
                                    {selectedTask.failureReason && <div className="rounded-xl bg-rose-50 border border-rose-100 p-3 text-sm text-rose-800">Failed: {selectedTask.failureReason}</div>}
                                    {selectedTask.rescheduleReason && <div className="rounded-xl bg-violet-50 border border-violet-100 p-3 text-sm text-violet-800">Rescheduled: {selectedTask.rescheduleReason}</div>}
                                </div>
                                {selectedTask.status !== "completed" && selectedTask.status !== "cancelled" && (
                                    <div className="flex-none border-t border-slate-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-2">
                                        {(() => { const a = primaryAction(selectedTask); return a ? (
                                            <button type="button" onClick={a.onClick} className="w-full h-12 rounded-2xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98]">
                                                {a.icon} {a.label}
                                            </button>
                                        ) : null; })()}
                                        <div className="grid grid-cols-3 gap-2">
                                            {!isDriver && <Button variant="outline" className="h-10 rounded-xl text-xs font-bold" onClick={() => openAssign(selectedTask)}><User className="h-3.5 w-3.5 mr-1" />Assign</Button>}
                                            {!isDriver && <Button variant="outline" className="h-10 rounded-xl text-xs font-bold" onClick={() => openSchedule(selectedTask)}><Calendar className="h-3.5 w-3.5 mr-1" />{selectedTask.scheduledDate ? "Resched" : "Sched"}</Button>}
                                            {!isDriver && <Button variant="outline" className="h-10 rounded-xl text-xs font-bold text-rose-600 border-rose-200" onClick={() => openFail(selectedTask)}><XCircle className="h-3.5 w-3.5 mr-1" />Failed</Button>}
                                        </div>
                                    </div>
                                )}
                            </MobileBottomSheetFrame>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );

    return (
        <MobileTabLayout>
            {/* ── MOBILE ── */}
            <MobileTabHeader>
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-500">Logistics</p>
                            <h1 className="text-2xl font-black text-slate-950">Pickup & Delivery</h1>
                        </div>
                        <Button size="icon" variant="outline" className="rounded-2xl" onClick={() => queryClient.invalidateQueries({ queryKey: ["logisticsTasks"] })}><RefreshCw className="h-4 w-4" /></Button>
                    </div>
                    <MobileKpiGrid items={kpis} collapsible summaryLabel="Logistics pulse" />
                    <MobileSegmentTabs value={lane} onChange={(v) => setLane(v as Lane)} items={laneItems} />
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="Customer, address, zone…" value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                </div>
            </MobileTabHeader>

            <MobileScrollContent className="md:hidden space-y-2 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <Truck className="h-10 w-10 text-slate-200" />
                        <p className="text-sm font-medium text-slate-400">No tasks here</p>
                    </div>
                ) : filtered.map((t) => {
                    const action = primaryAction(t);
                    return (
                        <div key={t.id} onClick={() => setSelectedTask(t)} className="w-full text-left relative bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden active:scale-[0.99] transition-transform cursor-pointer">
                            <div className={cn("absolute left-0 top-0 bottom-0 w-[3px]", typeAccent(t.taskType))} />
                            <div className="pl-4 pr-3 py-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            {typeIcon(t.taskType)}
                                            <span className="font-black text-slate-900 text-[15px] truncate">{t.customerName || "Unknown"}</span>
                                        </div>
                                        <p className="text-xs text-slate-500 truncate mt-0.5">{address(t)}</p>
                                    </div>
                                    <div className="shrink-0 flex flex-col items-end gap-1">
                                        {statusBadge(t.status)}
                                        {t.zone && <span className="text-[10px] font-bold text-slate-400">{t.zone}{t.routeOrder != null ? ` #${t.routeOrder}` : ""}</span>}
                                    </div>
                                </div>
                                <div className="mt-2 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-3 text-xs text-slate-500">
                                        {t.scheduledDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDateShort(t.scheduledDate)}</span>}
                                        {t.timeWindow && <span>{t.timeWindow}</span>}
                                        {t.assignedDriverName && <span className="flex items-center gap-1"><User className="h-3 w-3" /> {t.assignedDriverName}</span>}
                                    </div>
                                    {t.customerPhone && (
                                        <a href={`tel:${t.customerPhone}`} onClick={(e) => e.stopPropagation()} className="shrink-0 h-8 w-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                                            <Phone className="h-3.5 w-3.5 text-emerald-600" />
                                        </a>
                                    )}
                                </div>
                                {action && (
                                    <button type="button" onClick={(e) => { e.stopPropagation(); action.onClick(); }}
                                        className="mt-3 w-full h-11 rounded-xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
                                        {action.icon} {action.label}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </MobileScrollContent>

            {/* ── HANDOVER SHEET ── */}
            <HandoverSheet target={handoverTarget} onClose={() => { setHandoverTarget(null); invalidate(); }} onVerified={() => invalidate()} />

            {sheetPortal}

            {/* ── DESKTOP ── */}
            <div className={cn("hidden h-full md:grid gap-5 p-5", desktopView === "operations" ? "grid-cols-[minmax(0,1fr)_380px]" : "grid-cols-1")}>
                {desktopView === "routePlan" && !isDriver ? (
                    /* ── ROUTE PLAN VIEW ── */
                    <section className="flex flex-col rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        <div className="p-5 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-500">Logistics</p>
                                    <h1 className="mt-1 text-3xl font-black text-slate-950">Route Planning</h1>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" className="rounded-full" onClick={() => setDesktopView("operations")}><List className="mr-2 h-4 w-4" />Operations</Button>
                                    <Button variant="outline" className="rounded-full" onClick={() => queryClient.invalidateQueries({ queryKey: ["logisticsTasks"] })}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-end gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs font-bold text-slate-500">Date</Label>
                                    <Input type="date" value={rpDate} onChange={(e) => setRpDate(e.target.value)} className="w-40" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-bold text-slate-500">Zone</Label>
                                    <Input value={rpZone} onChange={(e) => setRpZone(e.target.value)} placeholder="All zones" className="w-32" />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs font-bold text-slate-500">Driver</Label>
                                    <select className="h-10 w-48 rounded-lg border border-slate-200 px-3 text-sm" value={rpDriverId} onChange={(e) => { const d = drivers.find((u: any) => u.id === e.target.value); setRpDriverId(e.target.value); setRpDriverName(d?.name || ""); }}>
                                        <option value="">Select driver</option>
                                        {drivers.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto px-5 pb-5">
                            <div className="grid grid-cols-2 gap-5">
                                {/* Unassigned tasks */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-black text-slate-700">Unassigned ({rpUnassigned.length})</h3>
                                        <div className="flex items-center gap-2">
                                            {rpUnassigned.length > 0 && <Button variant="outline" size="sm" className="text-xs rounded-lg" onClick={rpSelectAll}>Select All</Button>}
                                            {rpSelected.size > 0 && rpDriverId && (
                                                <Button size="sm" className="text-xs rounded-lg bg-blue-600" disabled={batchAssignMutation.isPending} onClick={rpBatchAssign}>
                                                    Assign {rpSelected.size} → {rpDriverName || "Driver"}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        {rpUnassigned.map(t => (
                                            <label key={t.id} className={cn("flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors", rpSelected.has(t.id) ? "border-blue-300 bg-blue-50" : "border-slate-100 bg-white hover:border-slate-200")}>
                                                <input type="checkbox" checked={rpSelected.has(t.id)} onChange={() => rpToggleSelect(t.id)} className="h-4 w-4 rounded border-slate-300" />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                        {typeIcon(t.taskType)}
                                                        <span className="text-sm font-bold text-slate-800 truncate">{t.customerName || "Unknown"}</span>
                                                    </div>
                                                    <p className="text-xs text-slate-400 truncate">{address(t)}</p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    {t.scheduledDate && <span className="text-[10px] text-slate-400">{formatDateShort(t.scheduledDate)}</span>}
                                                    {t.zone && <span className="block text-[10px] font-bold text-slate-500">{t.zone}</span>}
                                                </div>
                                            </label>
                                        ))}
                                        {rpUnassigned.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No unassigned tasks for this date/zone.</p>}
                                    </div>
                                </div>

                                {/* Assigned route */}
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-black text-slate-700">
                                            {rpDriverName ? `${rpDriverName}'s Route` : "Select a driver"} ({rpAssigned.length})
                                        </h3>
                                        {rpHasOrderEdits && (
                                            <Button size="sm" className="text-xs rounded-lg bg-emerald-600" disabled={batchReorderMutation.isPending} onClick={rpSaveOrders}>
                                                <Save className="h-3.5 w-3.5 mr-1" /> Save Order
                                            </Button>
                                        )}
                                    </div>
                                    {rpDriverId ? (
                                        <div className="space-y-1.5">
                                            {rpAssigned.map(t => (
                                                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3">
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        className="h-8 w-12 rounded-lg border border-slate-200 text-center text-sm font-bold"
                                                        value={rpOrders[t.id] ?? t.routeOrder ?? ""}
                                                        onChange={(e) => rpSetOrder(t.id, e.target.value)}
                                                        placeholder="#"
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5">
                                                            {typeIcon(t.taskType)}
                                                            <span className="text-sm font-bold text-slate-800 truncate">{t.customerName || "Unknown"}</span>
                                                        </div>
                                                        <p className="text-xs text-slate-400 truncate">{address(t)}</p>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        {statusBadge(t.status)}
                                                        {t.zone && <span className="block mt-1 text-[10px] font-bold text-slate-500">{t.zone}</span>}
                                                    </div>
                                                </div>
                                            ))}
                                            {rpAssigned.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No tasks assigned to this driver.</p>}
                                        </div>
                                    ) : (
                                        <p className="py-8 text-center text-sm text-slate-400">Select a driver to see their route.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>
                ) : (<>
                {/* ── OPERATIONS VIEW ── */}
                <section className="flex flex-col rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-500">Logistics</p>
                                <h1 className="mt-1 text-3xl font-black text-slate-950">Pickup & Delivery</h1>
                            </div>
                            <div className="flex items-center gap-2">
                                {!isDriver && <Button variant="outline" className="rounded-full" onClick={() => setDesktopView("routePlan")}><Route className="mr-2 h-4 w-4" />Route Plan</Button>}
                                <Button variant="outline" className="rounded-full" onClick={() => queryClient.invalidateQueries({ queryKey: ["logisticsTasks"] })}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {laneItems.map((l) => (
                                <button key={l.value} type="button" onClick={() => setLane(l.value)}
                                    className={cn("h-8 px-3 rounded-lg border text-xs font-bold transition-colors", lane === l.value ? "bg-slate-800 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300")}>
                                    {l.label}
                                </button>
                            ))}
                        </div>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input className="pl-10" placeholder="Search customer, address, zone..." value={search} onChange={(e) => setSearch(e.target.value)} />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 sticky top-0">
                                <tr>
                                    <th className="px-4 py-3 w-8">Type</th>
                                    <th className="px-4 py-3">Customer</th>
                                    <th className="px-4 py-3">Zone</th>
                                    <th className="px-4 py-3">Scheduled</th>
                                    <th className="px-4 py-3">Driver</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3 w-8"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((t) => (
                                    <tr key={t.id} onClick={() => setSelectedTask(t)} className={cn("border-t border-slate-100 cursor-pointer hover:bg-blue-50/50 transition-colors", selectedTask?.id === t.id && "bg-blue-50")}>
                                        <td className="px-4 py-3">{typeIcon(t.taskType)}</td>
                                        <td className="px-4 py-3">
                                            <div className="font-bold text-slate-800">{t.customerName || "Unknown"}</div>
                                            <div className="text-xs text-slate-400 truncate max-w-[200px]">{address(t)}</div>
                                        </td>
                                        <td className="px-4 py-3 text-xs font-bold text-slate-600">{t.zone || "—"}{t.routeOrder != null ? ` #${t.routeOrder}` : ""}</td>
                                        <td className="px-4 py-3 text-xs text-slate-500 font-mono">{formatDateShort(t.scheduledDate)}{t.timeWindow ? ` · ${t.timeWindow}` : ""}</td>
                                        <td className="px-4 py-3 text-xs text-slate-500">{t.assignedDriverName || "—"}</td>
                                        <td className="px-4 py-3">{statusBadge(t.status)}</td>
                                        <td className="px-4 py-3">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild><Button variant="ghost" className="h-8 w-8 p-0"><MoreVertical className="h-4 w-4 text-slate-400" /></Button></DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                    {t.status !== "completed" && t.status !== "cancelled" && (
                                                        <>
                                                            {(t.status === "pending" || t.status === "assigned" || t.status === "rescheduled") && (
                                                                <DropdownMenuItem onClick={() => statusMutation.mutate({ id: t.id, status: "en_route" })}><Play className="w-4 h-4 mr-2" /> Start Route</DropdownMenuItem>
                                                            )}
                                                            {t.status === "en_route" && (
                                                                <DropdownMenuItem onClick={() => openHandover(t)}><CheckCircle className="w-4 h-4 mr-2" /> {t.taskType === "delivery" ? "Deliver" : "Receive"}</DropdownMenuItem>
                                                            )}
                                                            {!isDriver && <DropdownMenuItem onClick={() => openAssign(t)}><User className="w-4 h-4 mr-2" /> Assign Driver</DropdownMenuItem>}
                                                            {!isDriver && <DropdownMenuItem onClick={() => openSchedule(t)}><Calendar className="w-4 h-4 mr-2" /> {t.scheduledDate ? "Reschedule" : "Schedule"}</DropdownMenuItem>}
                                                            {!isDriver && <DropdownMenuItem onClick={() => openFail(t)} className="text-rose-600"><AlertTriangle className="w-4 h-4 mr-2" /> Mark Failed</DropdownMenuItem>}
                                                            {!isDriver && <DropdownMenuItem onClick={() => setCancelConfirmTask(t)} className="text-slate-500"><XCircle className="w-4 h-4 mr-2" /> Cancel</DropdownMenuItem>}
                                                        </>
                                                    )}
                                                    {t.customerPhone && (
                                                        <DropdownMenuItem asChild><a href={`tel:${t.customerPhone}`}><Phone className="w-4 h-4 mr-2" /> Call Customer</a></DropdownMenuItem>
                                                    )}
                                                    {navigateUrl(t) && (
                                                        <DropdownMenuItem asChild><a href={navigateUrl(t)!} target="_blank" rel="noopener noreferrer"><Navigation className="w-4 h-4 mr-2" /> Navigate</a></DropdownMenuItem>
                                                    )}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </td>
                                    </tr>
                                ))}
                                {filtered.length === 0 && (
                                    <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No tasks match your filters.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Right: detail panel */}
                <aside className="overflow-y-auto">
                    {selectedTask ? (
                        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        {typeIcon(selectedTask.taskType)}
                                        <span className="text-xs font-bold uppercase text-slate-400">{selectedTask.taskType}</span>
                                    </div>
                                    <h2 className="mt-2 text-xl font-black text-slate-950">{selectedTask.customerName || "Unknown"}</h2>
                                    <p className="text-xs font-mono text-slate-400 mt-1">{selectedTask.id}</p>
                                </div>
                                {statusBadge(selectedTask.status)}
                            </div>
                            <div className="space-y-2 text-sm">
                                {selectedTask.customerPhone && (
                                    <a href={`tel:${selectedTask.customerPhone}`} className="flex items-center gap-2 text-blue-600 font-bold"><Phone className="h-4 w-4" /> {selectedTask.customerPhone}</a>
                                )}
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 text-slate-600 min-w-0"><MapPin className="h-4 w-4 text-slate-400 shrink-0" /> <span className="truncate">{address(selectedTask)}</span></div>
                                    {navigateUrl(selectedTask) && (
                                        <a href={navigateUrl(selectedTask)!} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-bold text-blue-600 flex items-center gap-1 hover:underline">
                                            <Navigation className="h-3.5 w-3.5" /> Navigate
                                        </a>
                                    )}
                                </div>
                                {selectedTask.scheduledDate && <div className="flex items-center gap-2 text-slate-600"><Calendar className="h-4 w-4 text-slate-400" /> {format(new Date(selectedTask.scheduledDate), "PPP")} {selectedTask.timeWindow && `· ${selectedTask.timeWindow}`}</div>}
                                {selectedTask.assignedDriverName && <div className="flex items-center gap-2 text-slate-600"><User className="h-4 w-4 text-slate-400" /> {selectedTask.assignedDriverName}</div>}
                                {selectedTask.zone && <div className="flex items-center gap-2 text-slate-600"><MapPin className="h-4 w-4 text-slate-400" /> Zone: {selectedTask.zone}{selectedTask.routeOrder != null ? ` · Route #${selectedTask.routeOrder}` : ""}</div>}
                            </div>
                            {selectedTask.notes && <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-sm text-amber-800">{selectedTask.notes}</div>}
                            {selectedTask.failureReason && <div className="rounded-xl bg-rose-50 border border-rose-100 p-3 text-sm text-rose-800">Failed: {selectedTask.failureReason}</div>}
                            {selectedTask.rescheduleReason && <div className="rounded-xl bg-violet-50 border border-violet-100 p-3 text-sm text-violet-800">Rescheduled: {selectedTask.rescheduleReason}</div>}
                            {selectedTask.status !== "completed" && selectedTask.status !== "cancelled" && (
                                <div className="space-y-2 pt-2 border-t border-slate-100">
                                    {(() => { const a = primaryAction(selectedTask); return a ? (
                                        <Button className="w-full rounded-xl bg-blue-600 hover:bg-blue-700" onClick={a.onClick}>{a.icon}<span className="ml-2">{a.label}</span></Button>
                                    ) : null; })()}
                                    <div className="grid grid-cols-2 gap-2">
                                        {!isDriver && <Button variant="outline" className="rounded-xl" onClick={() => openAssign(selectedTask)}><User className="h-4 w-4 mr-1" />Assign</Button>}
                                        {!isDriver && <Button variant="outline" className="rounded-xl" onClick={() => openSchedule(selectedTask)}><Calendar className="h-4 w-4 mr-1" />{selectedTask.scheduledDate ? "Reschedule" : "Schedule"}</Button>}
                                        {!isDriver && <Button variant="outline" className="rounded-xl text-rose-600 border-rose-200" onClick={() => openFail(selectedTask)}><AlertTriangle className="h-4 w-4 mr-1" />Failed</Button>}
                                        {!isDriver && <Button variant="outline" className="rounded-xl text-slate-500" onClick={() => setCancelConfirmTask(selectedTask)}><XCircle className="h-4 w-4 mr-1" />Cancel</Button>}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Select a task to view details</div>
                    )}
                </aside>
                </>)}
            </div>

            {/* Desktop sheets use dialogs — reuse the same portaled sheets above, they only render when isMobile */}
            {!isMobile && assignOpen && selectedTask && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="fixed inset-0 bg-black/30" onClick={() => setAssignOpen(false)} />
                    <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
                        <h3 className="text-lg font-black text-slate-900">Assign Driver</h3>
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <Label>Driver</Label>
                                <select className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" value={assignDriverId} onChange={(e) => { const d = drivers.find((u: any) => u.id === e.target.value); setAssignDriverId(e.target.value); setAssignDriverName(d?.name || ""); }}>
                                    <option value="">Select driver</option>
                                    {drivers.map((d: any) => <option key={d.id} value={d.id}>{d.name} ({d.role})</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Zone</Label>
                                <Input value={assignZone} onChange={(e) => setAssignZone(e.target.value)} placeholder="N, S, E, W..." />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
                            <Button disabled={!assignDriverId || assignMutation.isPending} onClick={() => assignMutation.mutate({ id: selectedTask.id, driverId: assignDriverId, driverName: assignDriverName, zone: assignZone || undefined })}>
                                {assignMutation.isPending ? "Saving..." : "Assign"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {!isMobile && scheduleOpen && selectedTask && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="fixed inset-0 bg-black/30" onClick={() => setScheduleOpen(false)} />
                    <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
                        <h3 className="text-lg font-black text-slate-900">{selectedTask.scheduledDate ? "Reschedule" : "Schedule"}</h3>
                        <div className="space-y-3">
                            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={schedDate} min={format(new Date(), "yyyy-MM-dd")} onChange={(e) => setSchedDate(e.target.value)} /></div>
                            <div className="space-y-1.5"><Label>Time Window</Label><Input value={schedWindow} onChange={(e) => setSchedWindow(e.target.value)} placeholder="10 AM - 1 PM" /></div>
                            {selectedTask.scheduledDate && <div className="space-y-1.5"><Label>Reason</Label><Textarea value={schedReason} onChange={(e) => setSchedReason(e.target.value)} placeholder="Why reschedule?" /></div>}
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button>
                            <Button disabled={!schedDate || rescheduleMutation.isPending} onClick={() => rescheduleMutation.mutate({ id: selectedTask.id, scheduledDate: schedDate, timeWindow: schedWindow || undefined, reason: schedReason || undefined })}>
                                {rescheduleMutation.isPending ? "Saving..." : "Save"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {!isMobile && failOpen && selectedTask && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="fixed inset-0 bg-black/30" onClick={() => setFailOpen(false)} />
                    <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
                        <h3 className="text-lg font-black text-slate-900">Mark Failed</h3>
                        <div className="space-y-1.5"><Label>Reason</Label><Textarea value={failReason} onChange={(e) => setFailReason(e.target.value)} placeholder="Customer unavailable, wrong address..." /></div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setFailOpen(false)}>Cancel</Button>
                            <Button variant="destructive" disabled={!failReason.trim() || statusMutation.isPending} onClick={() => { statusMutation.mutate({ id: selectedTask.id, status: "failed", failureReason: failReason.trim() }); setFailOpen(false); }}>
                                {statusMutation.isPending ? "Saving..." : "Mark Failed"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <AlertDialog open={!isMobile && !!cancelConfirmTask} onOpenChange={(open) => { if (!open) setCancelConfirmTask(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Cancel Task?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Cancel the task for <strong>{cancelConfirmTask?.customerName || "Unknown"}</strong>? This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep Task</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={cancelMutation.isPending}
                            onClick={() => { if (cancelConfirmTask) { cancelMutation.mutate({ id: cancelConfirmTask.id }); setCancelConfirmTask(null); } }}
                        >
                            {cancelMutation.isPending ? "Cancelling..." : "Cancel Task"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </MobileTabLayout>
    );
}
