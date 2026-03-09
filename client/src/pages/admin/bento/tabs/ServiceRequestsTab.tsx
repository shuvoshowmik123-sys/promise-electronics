import { useState, useEffect, useRef, useMemo } from "react";
import type { ServiceRequest } from "@shared/schema";
import {
    ADMIN_PIPELINE_FLOW, ADMIN_TERMINAL_STATES, ADMIN_STEP_CONFIG, ADMIN_OFFRAMP_CONFIG,
    ADMIN_ROLLBACK_RULES, PICKUP_STATUS_FLOW, SERVICE_CENTER_STATUS_FLOW,
    PICKUP_STEP_CONFIG, SC_STEP_CONFIG
} from "@shared/constants";
import { getContextualActions } from "@/lib/workflowFrontend";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
    Clock, Search, MessageSquare, FileText, Trash2, ChevronLeft, ChevronRight,
    X, Phone, MapPin, Tv, AlertTriangle, Loader2, CheckCircle, XCircle,
    ArrowRightCircle, Image, Film, DollarSign, Send, Calendar, Undo2, LayoutGrid, LayoutList
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { JobTicketList } from "./jobs/JobTicketList";
import { JobDetailsSheet } from "./jobs/JobDetailsSheet";

const getCsrfToken = () => {
    if (typeof document === 'undefined') return undefined;
    const match = document.cookie.match(new RegExp('(^| )XSRF-TOKEN=([^;]+)'));
    return match ? match[2] : undefined;
};
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { MediaViewer } from "@/components/MediaViewer";
import { StatusStepper, WorkflowStepper } from "@/components/StatusStepper";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

const INTERNAL_STEPS = [...ADMIN_PIPELINE_FLOW];

const PICKUP_TRACKING_STEPS = PICKUP_STEP_CONFIG.map(s => ({ value: s.value, label: s.label }));

const SC_TRACKING_STEPS = SC_STEP_CONFIG.map(s => ({ value: s.value, label: s.label }));

// "Technician Assigned" index in each flow
const PICKUP_JOB_LOCK_INDEX = PICKUP_STEP_CONFIG.findIndex(s => s.value === "Technician Assigned");
const SC_JOB_LOCK_INDEX = SC_STEP_CONFIG.findIndex(s => s.value === "Technician Assigned");

function getStatusChangeWarning(type: 'internal' | 'tracking', from: string, to: string) {
    if (type === 'internal') {
        const config = ADMIN_STEP_CONFIG.find(s => s.value === to);
        const offramp = ADMIN_OFFRAMP_CONFIG.find(s => s.value === to);

        if (offramp) return {
            title: offramp.tooltip.title,
            warning: offramp.tooltip.body,
            effects: to === "Declined"
                ? ['Request will be declined and archived', 'Customer will be notified', 'No further changes allowed']
                : to === "Cancelled"
                    ? ['Service will stop immediately', 'Device returned as-is if collected', 'Customer notified of cancellation']
                    : ['Device marked as unrepairable', 'Device returned as-is to customer', 'Case documented for records'],
            color: 'bg-red-50 border-red-200 text-red-800',
        };

        if (to === 'Under Review') return {
            title: 'Mark as Under Review',
            warning: 'A staff member will begin evaluating this request.',
            effects: ['Request is being actively reviewed', 'Customer will not be notified yet'],
            color: 'bg-amber-50 border-amber-200 text-amber-800',
        };
        if (to === 'Approved') return {
            title: 'Approve Request',
            warning: 'This confirms the request is approved for service.',
            effects: ['Request approved for service', 'Quote accepted (if applicable)', 'Ready for work order creation'],
            color: 'bg-emerald-50 border-emerald-200 text-emerald-800',
        };
        if (to === 'Work Order') return {
            title: 'Create Work Order',
            warning: 'This will create a Job Ticket and activate technician tracking.',
            effects: ['A new Job Ticket will be created', 'Customer tracking stages will unlock', 'Technician assignment becomes available'],
            color: 'bg-violet-50 border-violet-200 text-violet-800',
        };
        if (to === 'Resolved') return {
            title: 'Mark as Resolved',
            warning: 'This confirms the repair is complete and device returned.',
            effects: ['Request marked as resolved', 'Auto-closes in 7 days if no issues reported'],
            color: 'bg-teal-50 border-teal-200 text-teal-800',
        };
        if (to === 'Closed') return {
            title: 'Close & Archive',
            warning: 'Closing this request is final. No further changes allowed.',
            effects: ['Request will be archived', 'No further edits allowed'],
            color: 'bg-slate-100 border-slate-300 text-slate-800',
        };
    }
    return {
        title: `Update to "${to}"`,
        warning: 'The customer will see this status change in their tracking portal.',
        effects: ['Customer-facing tracking status will update', 'Status notification may be sent'],
        color: 'bg-blue-50 border-blue-200 text-blue-800',
    };
}
import { serviceRequestsApi, adminQuotesApi, adminStageApi, jobTicketsApi, settingsApi } from "@/lib/api";
import { useRollback } from "@/contexts/RollbackContext";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { cn } from "@/lib/utils";
import { BentoCard, DashboardSkeleton, containerVariants, itemVariants, HighlightMatch, smartMatch } from "../shared";
import { toast } from "sonner";

const LEGACY_ADMIN_STATUS_MAP: Record<string, string> = {
    Pending: "New",
    Reviewed: "Under Review",
    Converted: "Work Order",
};

const normalizeAdminStatus = (status: string | null | undefined) => {
    if (!status) return "New";
    return LEGACY_ADMIN_STATUS_MAP[status] || status;
};

const normalizeServiceRequest = <T extends ServiceRequest | null | undefined>(request: T): T => {
    if (!request) return request;
    return {
        ...request,
        status: normalizeAdminStatus(request.status),
    };
};

const STATUS_FILTERS = ["all", ...ADMIN_PIPELINE_FLOW] as const;

const statusActiveColors: Record<string, string> = {
    all: "bg-slate-600 text-white",
    New: "bg-blue-500 text-white",
    "Under Review": "bg-amber-500 text-white",
    Approved: "bg-emerald-500 text-white",
    "Work Order": "bg-violet-500 text-white",
    Resolved: "bg-teal-500 text-white",
    Closed: "bg-slate-500 text-white",
    Declined: "bg-red-500 text-white",
    Cancelled: "bg-orange-500 text-white",
    Unrepairable: "bg-rose-500 text-white",
};
const statusGradients: Record<string, string> = {
    New: "from-blue-500 to-indigo-600",
    "Under Review": "from-amber-500 to-orange-600",
    Approved: "from-emerald-500 to-teal-600",
    "Work Order": "from-violet-500 to-purple-600",
    Resolved: "from-teal-500 to-cyan-600",
    Closed: "from-slate-500 to-slate-700",
    Declined: "from-red-500 to-red-700",
    Cancelled: "from-orange-500 to-orange-700",
    Unrepairable: "from-rose-500 to-rose-700",
};
const statusCardColors: Record<string, { border: string; bg: string; ring: string; badge: string }> = {
    New: { border: "border-blue-400", bg: "bg-blue-50/30", ring: "hover:ring-blue-200/60", badge: "bg-blue-50 text-blue-700 border-blue-200" },
    "Under Review": { border: "border-amber-400", bg: "bg-amber-50/30", ring: "hover:ring-amber-200/60", badge: "bg-amber-50 text-amber-700 border-amber-200" },
    Approved: { border: "border-emerald-400", bg: "bg-emerald-50/30", ring: "hover:ring-emerald-200/60", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    "Work Order": { border: "border-violet-400", bg: "bg-violet-50/30", ring: "hover:ring-violet-200/60", badge: "bg-violet-50 text-violet-700 border-violet-200" },
    Resolved: { border: "border-teal-400", bg: "bg-teal-50/30", ring: "hover:ring-teal-200/60", badge: "bg-teal-50 text-teal-700 border-teal-200" },
    Closed: { border: "border-slate-300", bg: "bg-slate-50/20", ring: "hover:ring-slate-200/60", badge: "bg-slate-50 text-slate-600 border-slate-200" },
    Declined: { border: "border-red-400", bg: "bg-red-50/30", ring: "hover:ring-red-200/60", badge: "bg-red-50 text-red-700 border-red-200" },
    Cancelled: { border: "border-orange-400", bg: "bg-orange-50/30", ring: "hover:ring-orange-200/60", badge: "bg-orange-50 text-orange-700 border-orange-200" },
    Unrepairable: { border: "border-rose-400", bg: "bg-rose-50/30", ring: "hover:ring-rose-200/60", badge: "bg-rose-50 text-rose-700 border-rose-200" },
};

const formatStageName = (stage: string): string => {
    const m: Record<string, string> = { intake: "Intake", assessment: "Assessment", awaiting_customer: "Awaiting Customer", authorized: "Authorized", pickup_scheduled: "Pickup Scheduled", picked_up: "Picked Up", awaiting_dropoff: "Awaiting Drop-off", device_received: "Device Received", in_repair: "In Repair", ready: "Ready", out_for_delivery: "Out for Delivery", completed: "Completed", closed: "Closed" };
    return m[stage] || stage;
};
const getStageColor = (stage: string): string => {
    const m: Record<string, string> = { intake: "bg-gray-100 text-gray-700", assessment: "bg-blue-50 text-blue-700", awaiting_customer: "bg-amber-50 text-amber-700", authorized: "bg-green-50 text-green-700", pickup_scheduled: "bg-purple-50 text-purple-700", picked_up: "bg-indigo-50 text-indigo-700", awaiting_dropoff: "bg-orange-50 text-orange-700", device_received: "bg-teal-50 text-teal-700", in_repair: "bg-cyan-50 text-cyan-700", ready: "bg-lime-50 text-lime-700", out_for_delivery: "bg-fuchsia-50 text-fuchsia-700", completed: "bg-green-100 text-green-800", closed: "bg-slate-100 text-slate-700" };
    return m[stage] || "bg-gray-100 text-gray-700";
};
const getMediaUrls = (s: string | null): string[] => { if (!s) return []; try { const p = JSON.parse(s); return p.map((i: string | { url: string }) => typeof i === 'string' ? i : i.url); } catch { return []; } };
const getSymptoms = (s: string | null): string[] => { if (!s) return []; try { return JSON.parse(s); } catch { return []; } };
const isImage = (u: string) => u.startsWith("data:image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(u);
const isVideo = (u: string) => u.startsWith("data:video/") || /\.(mp4|webm|mov|avi)$/i.test(u);
const getTrackingStatusFlow = (sp: string | null | undefined): readonly string[] => (sp === "service_center" || sp === "center") ? SERVICE_CENTER_STATUS_FLOW : PICKUP_STATUS_FLOW;

const BOARD_COLUMNS = [
    { id: "New", label: "New Requests" },
    { id: "Under Review", label: "Reviewing" },
    { id: "Approved", label: "Approved" },
    { id: "Work Order", label: "Work Order" },
    { id: "Resolved", label: "Resolved" },
];

interface ServiceRequestsTabProps {
    initialSearchQuery?: string;
    onSearchConsumed?: () => void;
}

export default function ServiceRequestsTab({ initialSearchQuery, onSearchConsumed }: ServiceRequestsTabProps = {}) {
    const { hasPermission } = useAdminAuth();
    const [viewMode, setViewMode] = useState<"grid" | "list">("list");
    const [draggedRequestId, setDraggedRequestId] = useState<string | null>(null);
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

    const [srSearchQuery, setSrSearchQuery] = useState(initialSearchQuery || "");
    const [srStatusFilter, setSrStatusFilter] = useState("all");

    // Update search query when initialSearchQuery changes (e.g., from deep link)
    useEffect(() => {
        if (initialSearchQuery) {
            setSrSearchQuery(initialSearchQuery);
            setSrStatusFilter("all"); // Ensure it isn't hidden by status filters
            autoOpenedQueryRef.current = null; // Reset auto-open tracking
            onSearchConsumed?.();
        }
    }, [initialSearchQuery]);
    const [srPage, setSrPage] = useState(1);
    const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);
    const [selectedCardIndex, setSelectedCardIndex] = useState(0);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [requestToDelete, setRequestToDelete] = useState<ServiceRequest | null>(null);
    // Admin state
    const [pendingChanges, setPendingChanges] = useState<{ status: string; trackingStatus: string; paymentStatus: string; scheduledPickupDate: Date | null } | null>(null);
    const [showStatusConfirmDialog, setShowStatusConfirmDialog] = useState(false);
    const [pendingStatusChange, setPendingStatusChange] = useState<{ type: 'internal' | 'tracking'; newValue: string; message: string } | null>(null);
    // Quote state
    const [showQuotePriceDialog, setShowQuotePriceDialog] = useState(false);
    const [quoteAmount, setQuoteAmount] = useState("");
    const [quoteNotes, setQuoteNotes] = useState("");
    // Verify state
    const [showVerifyDialog, setShowVerifyDialog] = useState(false);
    const [verificationNotes, setVerificationNotes] = useState("");
    const [priority, setPriority] = useState("Medium");
    const [requestToVerify, setRequestToVerify] = useState<ServiceRequest | null>(null);
    // Media state
    const [mediaViewerOpen, setMediaViewerOpen] = useState(false);
    const [mediaViewerIndex, setMediaViewerIndex] = useState(0);
    const [currentMediaUrls, setCurrentMediaUrls] = useState<string[]>([]);

    // Rollback state
    const [showRollbackDialog, setShowRollbackDialog] = useState(false);
    const [rollbackReason, setRollbackReason] = useState("");
    const { addRollbackRequest } = useRollback();

    const queryClient = useQueryClient();

    const { data: srData, isLoading } = useQuery<{ items: ServiceRequest[]; pagination: any }>({
        queryKey: ["serviceRequests"], queryFn: () => serviceRequestsApi.getAll(), staleTime: 0, refetchOnMount: "always",
    });
    const { data: settings = [] } = useQuery({ queryKey: ["settings"], queryFn: settingsApi.getAll });
    const { data: nextStagesData } = useQuery({
        queryKey: ["next-stages", selectedRequest?.id],
        queryFn: () => selectedRequest ? adminStageApi.getNextStages(selectedRequest.id) : null,
        enabled: !!selectedRequest?.id,
    });
    const { data: convertedJobData } = useQuery({
        queryKey: ["job-ticket", selectedRequest?.convertedJobId],
        queryFn: () => selectedRequest?.convertedJobId ? jobTicketsApi.getOne(selectedRequest.convertedJobId) : null,
        enabled: !!selectedRequest?.convertedJobId,
    });

    const developerMode = settings.find((s: any) => s.key === "developer_mode")?.value === "true";
    const getCurrencySymbol = () => settings?.find((s: any) => s.key === "currency_symbol")?.value || "৳";

    const serviceRequests: ServiceRequest[] = useMemo(() => (srData?.items ?? []).map((request) => normalizeServiceRequest(request)), [srData?.items]);
    useEffect(() => {
        if (selectedRequest && serviceRequests.length > 0) {
            const u = serviceRequests.find(r => r.id === selectedRequest.id);
            if (u && u !== selectedRequest) setSelectedRequest(u);
        }
    }, [serviceRequests, selectedRequest]);

    const autoOpenedQueryRef = useRef<string | null>(null);

    // Auto-open exact single search matches
    useEffect(() => {
        if (srSearchQuery && serviceRequests.length > 0 && !selectedRequest) {
            // Only auto-open once per unique search query
            if (autoOpenedQueryRef.current === srSearchQuery) return;

            const query = srSearchQuery.toLowerCase();
            const matches = serviceRequests.filter((r: any) =>
                (r.ticketNumber?.toLowerCase() === query) ||
                (r.reference?.toLowerCase() === query) ||
                (r.modelNumber?.toLowerCase() === query) ||
                (r.id === query)
            );
            if (matches.length === 1) {
                autoOpenedQueryRef.current = srSearchQuery;
                // Find the index for setSelectedCardIndex
                const index = serviceRequests.findIndex(r => r.id === matches[0].id);
                handleViewDetails(matches[0], index > -1 ? index : 0);
            }
        }
    }, [srSearchQuery, serviceRequests, selectedRequest]);

    // === MUTATIONS ===
    const deleteMutation = useMutation({
        mutationFn: (id: string) => serviceRequestsApi.delete(id),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["serviceRequests"] }); toast.success("Request deleted"); setShowDeleteDialog(false); setRequestToDelete(null); if (selectedRequest?.id === requestToDelete?.id) setSelectedRequest(null); },
        onError: () => { toast.error("Failed to delete"); },
    });
    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<ServiceRequest> }) => serviceRequestsApi.update(id, data as any),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["serviceRequests"] }); toast.success("Request updated"); },
        onError: (e: Error) => { toast.error(e.message || "Failed to update"); },
    });
    const quotePriceMutation = useMutation({
        mutationFn: ({ id, quoteAmount: qa, quoteNotes: qn }: { id: string; quoteAmount: number; quoteNotes?: string }) => adminQuotesApi.updatePrice(id, { quoteAmount: qa, quoteNotes: qn }),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["serviceRequests"] }); toast.success("Quote sent"); setShowQuotePriceDialog(false); setQuoteAmount(""); setQuoteNotes(""); },
        onError: () => { toast.error("Failed to send quote"); },
    });
    const markInteractedMutation = useMutation({
        mutationFn: (id: string) => serviceRequestsApi.markInteracted(id),
        onSuccess: (updatedRequest) => {
            const normalized = normalizeServiceRequest(updatedRequest);
            queryClient.invalidateQueries({ queryKey: ["serviceRequests"] });
            queryClient.invalidateQueries({ queryKey: ["adminNotifications"] });
            queryClient.invalidateQueries({ queryKey: ["adminNotificationCount"] });
            setSelectedRequest((current) => current?.id === normalized.id ? { ...current, ...normalized } : current);
        },
    });

    const actionMutation = useMutation({
        mutationFn: async ({ id, actionId }: { id: string, actionId: string }) => {
            const res = await fetch(`/api/admin/service-requests/${id}/action`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-XSRF-TOKEN": getCsrfToken() || ""
                },
                body: JSON.stringify({ actionId })
            });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        },
        onSuccess: (u) => {
            queryClient.invalidateQueries({ queryKey: ["serviceRequests"] });
            setSelectedRequest(normalizeServiceRequest(u));
            toast.success("Action executed successfully.");
        },
        onError: (e: Error) => { toast.error("Action failed: " + e.message); }
    });

    const adjustProgressMutation = useMutation({
        mutationFn: async ({ id, targetStatus, reason }: { id: string, targetStatus: string, reason: string }) => {
            const res = await fetch(`/api/admin/service-requests/${id}/adjust-progress`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-XSRF-TOKEN": getCsrfToken() || ""
                },
                body: JSON.stringify({ targetStatus, reason })
            });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        },
        onSuccess: (u) => {
            queryClient.invalidateQueries({ queryKey: ["serviceRequests"] });
            setSelectedRequest(normalizeServiceRequest(u));
            toast.success("Progress adjusted");
            setShowRollbackDialog(false);
            setRollbackReason("");
        },
        onError: (e: Error) => { toast.error("Failed to adjust progress: " + e.message); }
    });

    const stageTransitionMutation = useMutation({
        mutationFn: ({ id, stage }: { id: string; stage: string }) => adminStageApi.transitionStage(id, { stage }),
        onSuccess: (u) => { queryClient.invalidateQueries({ queryKey: ["serviceRequests"] }); queryClient.invalidateQueries({ queryKey: ["next-stages", u.id] }); setSelectedRequest(normalizeServiceRequest(u)); toast.success(`Stage → "${formatStageName(u.stage || "")}"`); if (u.convertedJobId) toast.success(`Job ticket ${u.convertedJobId} created!`); },
        onError: (e: Error) => { toast.error(e.message || "Failed to update stage"); },
    });
    const expectedDatesMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: any }) => adminStageApi.updateExpectedDates(id, data),
        onSuccess: (u) => { queryClient.invalidateQueries({ queryKey: ["serviceRequests"] }); setSelectedRequest(normalizeServiceRequest(u)); toast.success("Dates updated"); },
        onError: () => { toast.error("Failed to update dates"); },
    });
    const verifyMutation = useMutation({
        mutationFn: ({ id, verificationNotes: vn, priority: p }: { id: string; verificationNotes: string; priority: string }) => serviceRequestsApi.verifyAndConvert(id, { verificationNotes: vn, priority: p }),
        onSuccess: (r) => { queryClient.invalidateQueries({ queryKey: ["serviceRequests"] }); toast.success(`Converted to Job #${r.jobTicket.id}`); setShowVerifyDialog(false); setVerificationNotes(""); setPriority("Medium"); setRequestToVerify(null); },
        onError: (e: Error) => { toast.error(e.message || "Failed to verify"); },
    });

    const canVerifyAndConvert = hasPermission("serviceRequests") && hasPermission("jobs") && hasPermission("canCreate");

    // === STATUS HELPERS ===
    const isStatusDisabled = (status: string, current: string, flow: readonly string[]): boolean => {
        if (developerMode) return false;
        const ci = flow.indexOf(current), si = flow.indexOf(status);
        return si < ci && si !== -1 && ci !== -1;
    };
    const isInternalStatusDisabled = (status: string, current: string): boolean => {
        if (developerMode) return false;
        const flow = ADMIN_PIPELINE_FLOW as readonly string[];
        const ci = flow.indexOf(current), si = flow.indexOf(status);
        return si < ci && si !== -1 && ci !== -1;
    };
    const getStatusChangeDescription = (type: 'internal' | 'tracking', from: string, to: string): string => {
        if (type === 'internal') {
            if (to === "Work Order") return "This will create a job ticket and unlock technician workflow.";
            if (to === "Closed") return "This will mark the request as complete.";
            return `Changing from '${from}' to '${to}'.`;
        }
        return `Customer tracking will change from '${from}' to '${to}'.`;
    };
    const handleInternalStatusWithConfirm = (newStatus: string) => {
        if (!pendingChanges || !selectedRequest) return;
        setPendingStatusChange({ type: 'internal', newValue: newStatus, message: getStatusChangeDescription('internal', selectedRequest.status, newStatus) });
        setShowStatusConfirmDialog(true);
    };
    const handleTrackingStatusTransition = (newStatus: string) => {
        if (!pendingChanges || !selectedRequest) return;
        const jobRelated = ["Technician Assigned", "Diagnosis Complete", "Awaiting Parts", "Repairing", "Ready for Return", "Ready for Collection", "Delivered", "Collected"];
        if (jobRelated.includes(newStatus) && normalizeAdminStatus(selectedRequest.status) !== "Work Order") {
            toast.error(`Cannot set '${newStatus}' - create the work order first`);
            return;
        }
        setPendingStatusChange({ type: 'tracking', newValue: newStatus, message: getStatusChangeDescription('tracking', selectedRequest.trackingStatus, newStatus) });
        setShowStatusConfirmDialog(true);
    };
    const handleTrackingStatusWithConfirm = (newStatus: string) => {
        if (!pendingChanges || !selectedRequest) return;
        const jobRelated = ["Technician Assigned", "Diagnosis Completed", "Parts Pending", "Repairing", "Ready for Delivery", "Delivered"];
        if (jobRelated.includes(newStatus) && selectedRequest.status !== "Converted") { toast.error(`Cannot set '${newStatus}' — convert to job first`); return; }
        setPendingStatusChange({ type: 'tracking', newValue: newStatus, message: getStatusChangeDescription('tracking', selectedRequest.trackingStatus, newStatus) });
        setShowStatusConfirmDialog(true);
    };
    const confirmStatusChange = () => {
        if (!pendingStatusChange || !pendingChanges) return;
        if (pendingStatusChange.type === 'internal') {
            let ts = pendingChanges.trackingStatus;
            if (pendingStatusChange.newValue === "Closed") ts = "Delivered";
            setPendingChanges({ ...pendingChanges, status: pendingStatusChange.newValue, trackingStatus: ts });
        } else {
            setPendingChanges({ ...pendingChanges, trackingStatus: pendingStatusChange.newValue });
        }
        setShowStatusConfirmDialog(false); setPendingStatusChange(null);
    };
    const hasUnsavedChanges = () => {
        if (!selectedRequest || !pendingChanges) return false;
        return pendingChanges.status !== selectedRequest.status || pendingChanges.trackingStatus !== selectedRequest.trackingStatus || pendingChanges.paymentStatus !== (selectedRequest.paymentStatus || "Due") || (pendingChanges.scheduledPickupDate?.toISOString() || null) !== (selectedRequest.scheduledPickupDate ? new Date(selectedRequest.scheduledPickupDate).toISOString() : null);
    };
    const handleSaveChanges = () => {
        if (!selectedRequest || !pendingChanges) return;
        const d: any = {};
        if (pendingChanges.status !== selectedRequest.status) d.status = pendingChanges.status;
        if (pendingChanges.trackingStatus !== selectedRequest.trackingStatus) d.trackingStatus = pendingChanges.trackingStatus;
        if (pendingChanges.paymentStatus !== (selectedRequest.paymentStatus || "Due")) d.paymentStatus = pendingChanges.paymentStatus;
        if ((pendingChanges.scheduledPickupDate?.toISOString() || null) !== (selectedRequest.scheduledPickupDate ? new Date(selectedRequest.scheduledPickupDate).toISOString() : null)) d.scheduledPickupDate = pendingChanges.scheduledPickupDate?.toISOString() || null;
        if (Object.keys(d).length === 0) return;
        updateMutation.mutate({ id: selectedRequest.id, data: d }, {
            onSuccess: (u: any) => {
                const normalized = normalizeServiceRequest(u);
                setSelectedRequest(normalized);
                setPendingChanges({ status: normalized.status, trackingStatus: normalized.trackingStatus, paymentStatus: normalized.paymentStatus || "Due", scheduledPickupDate: normalized.scheduledPickupDate ? new Date(normalized.scheduledPickupDate) : null });
            }
        });
    };

    const handleViewDetails = (request: ServiceRequest, index: number) => {
        setSelectedRequest(request);
        setSelectedCardIndex(index);
        setPendingChanges({ status: request.status, trackingStatus: request.trackingStatus, paymentStatus: request.paymentStatus || "Due", scheduledPickupDate: request.scheduledPickupDate ? new Date(request.scheduledPickupDate) : null });
        if (!request.adminInteracted && !markInteractedMutation.isPending) {
            markInteractedMutation.mutate(request.id);
        }
    };
    const handleCloseDialog = () => { setSelectedRequest(null); setPendingChanges(null); };

    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDraggedRequestId(id);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent, columnId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dragOverColumn !== columnId) setDragOverColumn(columnId);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        setDragOverColumn(null);
    };

    const handleDrop = (e: React.DragEvent, newStatus: string) => {
        e.preventDefault();
        setDragOverColumn(null);
        if (!draggedRequestId) return;
        const request = serviceRequests.find(r => r.id === draggedRequestId);
        if (!request || request.status === newStatus || isInternalStatusDisabled(newStatus, request.status)) return;

        setSelectedRequest(request);
        setPendingChanges({
            status: request.status,
            trackingStatus: request.trackingStatus,
            paymentStatus: request.paymentStatus || "Due",
            scheduledPickupDate: request.scheduledPickupDate ? new Date(request.scheduledPickupDate) : null
        });

        setTimeout(() => {
            setPendingStatusChange({
                type: 'internal',
                newValue: newStatus,
                message: getStatusChangeDescription('internal', request.status, newStatus)
            });
            setShowStatusConfirmDialog(true);
        }, 50);

        setDraggedRequestId(null);
    };

    if (isLoading) return <DashboardSkeleton />;

    const filtered = serviceRequests.filter((r: any) => {
        const ms = smartMatch(srSearchQuery,
            r.customerName,
            r.ticketNumber,
            r.phone,
            r.brand,
            r.reference,
            r.modelNumber,
            r.primaryIssue,
            r.description,
            ...getSymptoms(r.symptoms),
            r.id
        );
        return ms && (srStatusFilter === 'all' || r.status === srStatusFilter);
    });
    const paginated = filtered.slice((srPage - 1) * 12, srPage * 12);
    const totalPages = Math.ceil(filtered.length / 12);

    const getSlideFrom = (index: number) => {
        const cols = window.innerWidth >= 1024 ? 3 : window.innerWidth >= 768 ? 2 : 1;
        const col = index % cols;
        return { x: col === 0 ? -250 : col === 2 ? 250 : 0, y: Math.floor(index / cols) > 2 ? 100 : 0 };
    };
    const slideFrom = selectedRequest ? getSlideFrom(selectedCardIndex) : { x: 0, y: 0 };

    // Blocking logic for selected request
    const sr = selectedRequest;
    const isServiceCenter = sr?.servicePreference === "service_center" || sr?.servicePreference === "center";
    const isClosedState = sr?.status === "Closed";
    const isConverted = sr?.status === "Work Order";
    const quoteBlocked = Boolean(sr?.isQuote) && !["Quoted", "Accepted", "Converted"].includes(sr?.quoteStatus || "");
    const effectiveTracking = pendingChanges?.trackingStatus || sr?.trackingStatus || "";
    const trackingFlow = getTrackingStatusFlow(sr?.servicePreference);
    const threshold = isServiceCenter ? "Device Received" : "Device Collected";
    const isDeviceAtCenter = trackingFlow.indexOf(effectiveTracking) >= trackingFlow.indexOf(threshold) && trackingFlow.indexOf(threshold) !== -1;
    const isInternalBlocked = isClosedState || (!developerMode && (quoteBlocked || !isDeviceAtCenter));
    const hasTechAssigned = !!(convertedJobData?.technician && convertedJobData.technician !== "Unassigned");
    const canUseJobStatuses = isConverted && hasTechAssigned;
    const isTrackingBlocked = isClosedState || (!developerMode && quoteBlocked);
    const jobStatusBlocked = !canUseJobStatuses;
    const jobStatusHint = !isConverted ? " (Requires job)" : (!hasTechAssigned ? " (Assign tech)" : "");

    return (
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="flex flex-col h-full gap-6">
            {/* KPI Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 shrink-0">
                <motion.div variants={itemVariants} className="col-span-1 h-full min-h-[200px]">
                    <BentoCard className="h-full bg-gradient-to-br from-blue-500 to-indigo-600" title="Total Requests" icon={<MessageSquare size={24} className="text-white" />} variant="vibrant">
                        <div className="flex-1 flex flex-col justify-end">
                            <div className="text-3xl font-black tracking-tighter text-white drop-shadow-md font-mono mt-4">{serviceRequests.length}</div>
                            <div className="text-white/80 text-sm mt-2">All time</div>
                        </div>
                    </BentoCard>
                </motion.div>
                <motion.div variants={itemVariants} className="col-span-1 h-full min-h-[200px]">
                    <BentoCard className="h-full bg-gradient-to-br from-amber-500 to-orange-600" title="Pending" icon={<Clock size={24} className="text-white" />} variant="vibrant">
                        <div className="flex-1 flex flex-col justify-end">
                            <div className="text-3xl font-black tracking-tighter text-white drop-shadow-md font-mono mt-4">{serviceRequests.filter((r: any) => r.status === 'New').length}</div>
                            <div className="text-white/80 text-sm mt-2">Needs Review</div>
                        </div>
                    </BentoCard>
                </motion.div>
                <motion.div variants={itemVariants} className="col-span-1 md:col-span-2 h-full min-h-[200px]">
                    <BentoCard className="h-full bg-gradient-to-br from-purple-500 to-fuchsia-600" title="Quote Requests" icon={<FileText size={24} className="text-white" />} variant="vibrant">
                        <div className="flex-1 flex justify-between items-end">
                            <div><div className="text-3xl font-black tracking-tighter text-white drop-shadow-md font-mono mt-4">{serviceRequests.filter((r: any) => r.isQuote).length}</div><div className="text-white/80 text-sm mt-2">Total Quotes</div></div>
                            <div className="text-right"><div className="text-2xl font-bold text-white/90">{serviceRequests.filter((r: any) => r.isQuote && r.quoteStatus === 'Pending').length}</div><div className="text-white/60 text-xs">Pending Response</div></div>
                        </div>
                    </BentoCard>
                </motion.div>
            </div>

            {/* Filter Toolbar */}
            <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-3">
                <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                    {STATUS_FILTERS.map(s => (
                        <button key={s} onClick={() => { setSrStatusFilter(s); setSrPage(1); }} className={cn("px-3 py-1.5 text-xs font-semibold rounded-lg transition-all", srStatusFilter === s ? statusActiveColors[s] : "text-slate-500 hover:text-slate-700 hover:bg-slate-200")}>
                            {s === "all" ? `All (${serviceRequests.length})` : s}
                        </button>
                    ))}
                </div>
                <div className="relative ml-auto w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input placeholder="Search tickets..." className="pl-9 h-9 bg-white border-slate-200 rounded-xl text-sm" value={srSearchQuery} onChange={(e) => { setSrSearchQuery(e.target.value); setSrPage(1); }} />
                </div>
                <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 shadow-sm ml-2 hidden sm:flex">
                    <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" onClick={() => setViewMode("grid")} className="h-7 w-7 p-0"><LayoutGrid size={14} /></Button>
                    <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" onClick={() => setViewMode("list")} className="h-7 w-7 p-0"><LayoutList size={14} /></Button>
                </div>
                <span className="text-xs font-medium text-slate-400 tabular-nums shrink-0">{filtered.length} results</span>
            </motion.div>

            {/* View Area */}
            <div className="min-h-0 pb-6">
                {paginated.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 bg-slate-50 rounded-3xl border border-dashed border-slate-200 text-slate-500">
                        <MessageSquare className="h-10 w-10 opacity-20 mb-3" />
                        <p>No service requests found</p>
                        <Button variant="link" onClick={() => { setSrSearchQuery(""); setSrStatusFilter("all"); }}>Clear filters</Button>
                    </div>
                ) : viewMode === "grid" ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {paginated.map((request: any, index: number) => {
                            const sc = statusCardColors[request.status] || statusCardColors.Closed;
                            return (
                                <motion.div layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.04 }} key={request.id}
                                    onClick={() => handleViewDetails(request, index)}
                                    className={cn(
                                        "group relative bg-white rounded-2xl border cursor-pointer bc-hover bc-rise",
                                        "border-t-4",
                                        sc.border,
                                        sc.bg,
                                        sc.ring,
                                        !request.adminInteracted && "ring-1 ring-rose-100 bg-rose-50/30"
                                    )}
                                >
                                    <div className="p-4 space-y-2.5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {!request.adminInteracted && (
                                                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shrink-0" aria-label="Unread service request" />
                                                )}
                                                <span className="font-mono text-[11px] font-bold text-slate-400 truncate">#<HighlightMatch text={request.ticketNumber} query={srSearchQuery} /></span>
                                            </div>
                                            <Badge className={cn("font-semibold shadow-none border text-[10px] px-1.5 py-0", sc.badge)}>{request.status}</Badge>
                                        </div>
                                        <h4 className="text-sm font-semibold text-slate-800 truncate group-hover:text-blue-600 transition-colors"><HighlightMatch text={request.customerName} query={srSearchQuery} /></h4>
                                        <p className="text-xs text-slate-500 truncate"><HighlightMatch text={request.brand} query={srSearchQuery} /> {request.screenSize ? `${request.screenSize}"` : ""} — <HighlightMatch text={request.primaryIssue} query={srSearchQuery} /></p>
                                        <p className="text-[11px] text-slate-400 pt-1">{format(new Date(request.createdAt), 'MMM d, yyyy')}</p>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px]">
                        <div className="overflow-x-auto">
                            <Table className="table-fixed w-full min-w-[800px]">
                                <TableHeader className="bg-slate-50/80 border-b border-slate-100">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="w-[120px] font-semibold text-slate-600 tracking-wide">Ticket</TableHead>
                                        <TableHead className="w-[200px] font-semibold text-slate-600 tracking-wide">Customer</TableHead>
                                        <TableHead className="w-[180px] font-semibold text-slate-600 tracking-wide">Device</TableHead>
                                        <TableHead className="font-semibold text-slate-600 tracking-wide hidden md:table-cell">Issue</TableHead>
                                        <TableHead className="w-[120px] font-semibold text-slate-600 tracking-wide">Status</TableHead>
                                        <TableHead className="w-[140px] font-semibold text-slate-600 tracking-wide text-right">Date Submited</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <AnimatePresence>
                                        {paginated.map((request: any, index: number) => {
                                            const sc = statusCardColors[request.status] || statusCardColors.Closed;
                                            return (
                                                <TableRow
                                                    key={request.id}
                                                    onClick={() => handleViewDetails(request, index)}
                                                    className={cn(
                                                        "cursor-pointer hover:bg-blue-50/50 transition-colors group bc-hover bc-rise border-b border-slate-100 last:border-0",
                                                        !request.adminInteracted && "bg-rose-50/20"
                                                    )}
                                                >
                                                    <TableCell className="font-mono text-xs font-bold text-slate-500 py-4">
                                                        <div className="flex items-center gap-2">
                                                            {!request.adminInteracted && (
                                                                <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shrink-0" aria-label="Unread service request" />
                                                            )}
                                                            <span>#<HighlightMatch text={request.ticketNumber} query={srSearchQuery} /></span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="font-medium text-slate-800 py-4"><HighlightMatch text={request.customerName} query={srSearchQuery} /></TableCell>
                                                    <TableCell className="text-sm text-slate-600 py-4"><HighlightMatch text={request.brand} query={srSearchQuery} /> {request.screenSize ? `${request.screenSize}"` : ""}</TableCell>
                                                    <TableCell className="text-sm text-slate-500 max-w-[250px] truncate hidden md:table-cell py-4"><HighlightMatch text={request.primaryIssue} query={srSearchQuery} /></TableCell>
                                                    <TableCell className="py-4">
                                                        <Badge className={cn("font-semibold shadow-none border text-[10px] px-2 py-0.5", sc.badge)}>
                                                            {request.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-xs text-slate-500 text-right py-4 font-medium">
                                                        {format(new Date(request.createdAt), 'MMM d, yyyy')}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </AnimatePresence>
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                )}
            </div>

            {/* Pagination */}
            {filtered.length > 12 && (
                <div className="flex items-center justify-between px-2 pt-2 pb-6">
                    <div className="text-sm text-slate-500">Viewing {((srPage - 1) * 12) + 1}-{Math.min(srPage * 12, filtered.length)} of {filtered.length}</div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={srPage === 1} onClick={() => setSrPage(p => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4 mr-1" /> Prev</Button>
                        <Button variant="outline" size="sm" disabled={srPage === totalPages} onClick={() => setSrPage(p => Math.min(totalPages, p + 1))}>Next <ChevronRight className="h-4 w-4 ml-1" /></Button>
                    </div>
                </div>
            )}

            {/* ========== POPUP DETAIL VIEW ========== */}
            {createPortal(
                <AnimatePresence>
                    {selectedRequest && (
                        <>
                            <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-md" onClick={handleCloseDialog} />
                            <motion.div key="panel" initial={{ opacity: 0, scale: 0.85, x: slideFrom.x, y: slideFrom.y }} animate={{ opacity: 1, scale: 1, x: 0, y: 0 }} exit={{ opacity: 0, scale: 0.9, x: slideFrom.x / 2, y: slideFrom.y / 2 }} transition={{ type: "spring", stiffness: 260, damping: 25 }}
                                className="fixed z-40 top-1/2 left-1/2 w-[92vw] max-w-3xl max-h-[88vh] -translate-x-1/2 -translate-y-1/2 rounded-[2rem] bg-white shadow-2xl shadow-black/20 ring-1 ring-black/5 overflow-hidden flex flex-col"
                            >
                                {/* Header */}
                                <div className={`bg-gradient-to-br ${statusGradients[selectedRequest.status] || 'from-slate-500 to-slate-700'} p-5 text-white flex items-center justify-between shrink-0`}>
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm"><MessageSquare size={20} /></div>
                                        <div>
                                            <h2 className="text-lg font-bold tracking-tight">Service Request Details</h2>
                                            <p className="text-sm text-white/80 font-mono">#{selectedRequest.ticketNumber}</p>
                                        </div>
                                    </div>
                                    <button onClick={handleCloseDialog} className="h-9 w-9 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors backdrop-blur-sm"><X size={18} /></button>
                                </div>

                                {/* Scrollable content */}
                                <div className="p-5 overflow-y-auto flex-1 space-y-5">
                                    {/* Status + Date */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div><Label className="text-muted-foreground text-xs">Status</Label><Badge className={cn("font-semibold shadow-none border mt-1", statusCardColors[selectedRequest.status]?.badge)}>{selectedRequest.status}</Badge></div>
                                        <div><Label className="text-muted-foreground text-xs">Submitted</Label><p className="text-sm mt-1">{format(new Date(selectedRequest.createdAt), "PPP 'at' p")}</p></div>
                                    </div>

                                    {/* Customer Info */}
                                    <div className="border-t pt-4">
                                        <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm"><Phone className="w-4 h-4" /> Customer</h3>
                                        <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl text-sm">
                                            <div><Label className="text-muted-foreground text-xs">Name</Label><p className="font-medium">{selectedRequest.customerName}</p></div>
                                            <div><Label className="text-muted-foreground text-xs">Phone</Label><p className="font-medium">{selectedRequest.phone}</p></div>
                                            {selectedRequest.address && <div className="col-span-2"><Label className="text-muted-foreground text-xs flex items-center gap-1"><MapPin className="w-3 h-3" /> Address</Label><p>{selectedRequest.address}</p></div>}
                                            <div><Label className="text-muted-foreground text-xs">Preference</Label><p className="font-medium capitalize">{selectedRequest.servicePreference === "pickup" || selectedRequest.servicePreference === "home_pickup" ? "Pickup & Drop" : "Service Center Visit"}</p></div>
                                        </div>
                                    </div>

                                    {/* Device Info */}
                                    <div className="border-t pt-4">
                                        <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm"><Tv className="w-4 h-4" /> Device</h3>
                                        <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl text-sm">
                                            <div><Label className="text-muted-foreground text-xs">Brand</Label><p className="font-medium">{selectedRequest.brand}</p></div>
                                            <div><Label className="text-muted-foreground text-xs">Size</Label><p className="font-medium">{selectedRequest.screenSize ? `${selectedRequest.screenSize}"` : "-"}</p></div>
                                            <div><Label className="text-muted-foreground text-xs">Model</Label><p className="font-medium">{selectedRequest.modelNumber || "-"}</p></div>
                                        </div>
                                    </div>

                                    {/* Issue Details */}
                                    <div className="border-t pt-4">
                                        <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm"><AlertTriangle className="w-4 h-4" /> Issue</h3>
                                        <div className="space-y-2 bg-slate-50 p-3 rounded-xl text-sm">
                                            <div><Label className="text-muted-foreground text-xs">Primary Issue</Label><p className="font-medium">{selectedRequest.primaryIssue}</p></div>
                                            {getSymptoms(selectedRequest.symptoms).length > 0 && <div><Label className="text-muted-foreground text-xs">Symptoms</Label><div className="flex flex-wrap gap-1.5 mt-1">{getSymptoms(selectedRequest.symptoms).map((s, i) => <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>)}</div></div>}
                                            {selectedRequest.description && <div><Label className="text-muted-foreground text-xs">Description</Label><p className="text-xs text-slate-600">{selectedRequest.description}</p></div>}
                                        </div>
                                    </div>

                                    {/* Media */}
                                    {getMediaUrls(selectedRequest.mediaUrls).length > 0 && (
                                        <div className="border-t pt-4">
                                            <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm"><Image className="w-4 h-4" /> Media</h3>
                                            <div className="grid grid-cols-3 gap-2">
                                                {getMediaUrls(selectedRequest.mediaUrls).map((url, i) => (
                                                    <div key={i} className="relative rounded-xl overflow-hidden border bg-slate-100 cursor-pointer hover:opacity-90" onClick={() => { setCurrentMediaUrls(getMediaUrls(selectedRequest.mediaUrls)); setMediaViewerIndex(i); setMediaViewerOpen(true); }}>
                                                        {isImage(url) ? <img src={url} alt={`Upload ${i + 1}`} className="w-full h-28 object-cover" /> : isVideo(url) ? <div className="w-full h-28 relative"><video src={url} className="w-full h-28 object-cover pointer-events-none" /><div className="absolute inset-0 flex items-center justify-center bg-black/30"><Film className="h-8 w-8 text-white" /></div></div> : <div className="w-full h-28 flex items-center justify-center bg-slate-200"><Film className="h-8 w-8 text-slate-400" /></div>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Quote Banners */}
                                    {selectedRequest.quoteStatus === "Declined" && <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-3"><div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center shrink-0"><XCircle className="w-4 h-4 text-red-600" /></div><div><h4 className="font-semibold text-red-800 text-sm">Quote Declined</h4><p className="text-xs text-red-600">This request is closed and cannot be edited.</p></div></div>}
                                    {selectedRequest.isQuote && (!selectedRequest.quoteStatus || selectedRequest.quoteStatus === "Pending") && <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3"><div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center shrink-0"><Clock className="w-4 h-4 text-amber-600" /></div><div><h4 className="font-semibold text-amber-800 text-sm">Quote Not Sent</h4><p className="text-xs text-amber-600">Send the quote before changing status.</p></div></div>}
                                    {selectedRequest.isQuote && selectedRequest.quoteStatus === "Quoted" && <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-3"><div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center shrink-0"><Clock className="w-4 h-4 text-blue-600" /></div><div><h4 className="font-semibold text-blue-800 text-sm">Waiting for Customer</h4><p className="text-xs text-blue-600">Quote sent. Awaiting acceptance.</p></div></div>}

                                    {/* Workflow Stage */}
                                    {sr && (
                                        <div className="border-t pt-4">
                                            <div className="bg-gradient-to-br from-slate-50 to-blue-50 p-4 rounded-xl border space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <Label className="text-xs font-semibold text-slate-700">Workflow Stage</Label>
                                                    {sr.serviceMode && <Badge variant="outline" className="text-[10px]">{sr.serviceMode === "pickup" ? "🚗 Pickup" : "🏪 Service Center"}</Badge>}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Badge className={`${getStageColor(sr.stage || "intake")} border px-2 py-0.5 text-xs`}>{formatStageName(sr.stage || "intake")}</Badge>
                                                    {sr.convertedJobId && <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">Job: {sr.convertedJobId}</Badge>}
                                                </div>
                                                {(nextStagesData?.validNextStages?.length || 0) > 0 && !isClosedState && (
                                                    <div className="space-y-1">
                                                        <Label className="text-[10px] text-muted-foreground">Move to next stage:</Label>
                                                        <Select onValueChange={(v) => stageTransitionMutation.mutate({ id: sr.id, stage: v })} disabled={stageTransitionMutation.isPending}>
                                                            <SelectTrigger className="w-full h-8 text-xs rounded-lg"><SelectValue placeholder="Select next stage..." /></SelectTrigger>
                                                            <SelectContent>{nextStagesData?.validNextStages?.map((s: string) => <SelectItem key={s} value={s}>{formatStageName(s)}</SelectItem>)}</SelectContent>
                                                        </Select>
                                                    </div>
                                                )}
                                                {nextStagesData?.stageFlow && (
                                                    <div className="flex flex-wrap gap-1 pt-2 border-t border-slate-200">
                                                        {nextStagesData.stageFlow.map((stage: string, idx: number) => {
                                                            const ci = nextStagesData.stageFlow.indexOf(sr.stage || "intake");
                                                            return <div key={stage} className={`text-[10px] px-1.5 py-0.5 rounded ${idx === ci ? "bg-blue-600 text-white font-medium" : idx < ci ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{formatStageName(stage)}</div>;
                                                        })}
                                                    </div>
                                                )}
                                                {/* Expected Dates */}
                                                {sr.serviceMode && (
                                                    <div className="space-y-2 pt-2 border-t border-slate-200">
                                                        <Label className="text-[10px] font-medium text-slate-600">Expected Dates</Label>
                                                        {sr.serviceMode === "pickup" ? (
                                                            <div className="grid grid-cols-2 gap-2">
                                                                {[{ label: "Pickup", key: "expectedPickupDate" }, { label: "Return", key: "expectedReturnDate" }].map(({ label, key }) => (
                                                                    <div key={key}>
                                                                        <Label className="text-[10px] text-muted-foreground mb-1 block"><Calendar className="w-3 h-3 inline mr-1" />{label}</Label>
                                                                        <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="w-full justify-start text-left text-[11px] h-7 rounded-lg">{(sr as any)[key] ? format(new Date((sr as any)[key]), "MMM d, yyyy") : "Set date..."}</Button></PopoverTrigger>
                                                                            <PopoverContent className="w-auto p-0" align="start"><CalendarComponent mode="single" selected={(sr as any)[key] ? new Date((sr as any)[key]) : undefined} onSelect={(d) => { if (d) expectedDatesMutation.mutate({ id: sr.id, data: { [key]: d.toISOString() } }); }} disabled={(d) => d < new Date()} /></PopoverContent>
                                                                        </Popover>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div>
                                                                <Label className="text-[10px] text-muted-foreground mb-1 block"><Calendar className="w-3 h-3 inline mr-1" />Ready Date</Label>
                                                                <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="w-full justify-start text-left text-[11px] h-7 rounded-lg">{sr.expectedReadyDate ? format(new Date(sr.expectedReadyDate), "MMM d, yyyy") : "Set date..."}</Button></PopoverTrigger>
                                                                    <PopoverContent className="w-auto p-0" align="start"><CalendarComponent mode="single" selected={sr.expectedReadyDate ? new Date(sr.expectedReadyDate) : undefined} onSelect={(d) => { if (d) expectedDatesMutation.mutate({ id: sr.id, data: { expectedReadyDate: d.toISOString() } }); }} disabled={(d) => d < new Date()} /></PopoverContent>
                                                                </Popover>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Internal Status + Tracking Status + Payment */}
                                    {sr && pendingChanges && (
                                        <div className="border-t pt-4 space-y-4">
                                            {/* Internal Status - Stepper */}
                                            <div className="bg-gradient-to-br from-slate-50 to-blue-50/30 p-4 rounded-xl border">
                                                <div className="flex items-center justify-between mb-3">
                                                    <Label className="text-xs font-semibold text-slate-700">Internal Status</Label>
                                                    <div className="flex items-center gap-2">
                                                        {isInternalBlocked && !isClosedState && (
                                                            <TooltipProvider>
                                                                <Tooltip delayDuration={300}>
                                                                    <TooltipTrigger asChild>
                                                                        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 cursor-help">
                                                                            <AlertTriangle className="w-3 h-3 mr-1" />
                                                                            {quoteBlocked ? "Locked (Quote)" : "Locked (Device)"}
                                                                        </Badge>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent side="bottom" className="max-w-[250px] bg-slate-800 text-white border-slate-700">
                                                                        <p className="font-semibold text-xs mb-1">
                                                                            {quoteBlocked ? "Quote Approval Required" : "Device Reception Required"}
                                                                        </p>
                                                                        <p className="text-[10px] text-slate-300">
                                                                            {quoteBlocked
                                                                                ? "You cannot proceed until the customer approves the quote. Sent quotes must be accepted or declined."
                                                                                : "For Service Center requests, the device must be marked as 'Received' in the tracking flow before you can proceed."
                                                                            }
                                                                        </p>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            </TooltipProvider>
                                                        )}
                                                        {selectedRequest.status !== "New" && !isClosedState && (
                                                            <button
                                                                onClick={() => setShowRollbackDialog(true)}
                                                                className="text-[10px] text-rose-500 hover:text-rose-600 hover:underline flex items-center gap-1"
                                                            >
                                                                <Undo2 className="w-3 h-3" /> Adjust Progress
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <StatusStepper
                                                    steps={INTERNAL_STEPS}
                                                    currentStep={selectedRequest.status}
                                                    disabled={true}
                                                    formatStep={(s) => s}
                                                    stepConfig={ADMIN_STEP_CONFIG}
                                                    terminalState={ADMIN_TERMINAL_STATES.includes(selectedRequest.status as any) ? selectedRequest.status : null}
                                                />
                                                {selectedRequest.convertedJobId && (
                                                    <div className="mt-3 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[10px] text-emerald-700 flex items-center gap-1.5">
                                                        <CheckCircle className="w-3 h-3 shrink-0" />
                                                        Job: <a href={`/admin#jobs?search=${encodeURIComponent(selectedRequest.convertedJobId)}`} className="font-medium underline">{selectedRequest.convertedJobId}</a>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Tracking Status - Visual Pipeline (Read Only) */}
                                            <div className="bg-gradient-to-br from-slate-50 to-indigo-50/30 p-4 rounded-xl border">
                                                <div className="flex items-center justify-between mb-3">
                                                    <Label className="text-xs font-semibold text-slate-700">Customer Tracking (Derived)</Label>
                                                    <div className="flex items-center gap-2">
                                                        {sr.serviceMode && <Badge variant="outline" className="text-[10px]">{isServiceCenter ? "🏪 Center" : "🚗 Pickup"}</Badge>}
                                                    </div>
                                                </div>
                                                <WorkflowStepper
                                                    steps={isServiceCenter ? SC_TRACKING_STEPS : PICKUP_TRACKING_STEPS}
                                                    currentValue={selectedRequest.trackingStatus}
                                                    isBlocked={true} // Read Only
                                                    jobLockedIndex={isServiceCenter ? SC_JOB_LOCK_INDEX : PICKUP_JOB_LOCK_INDEX}
                                                    isJobCreated={selectedRequest.status === "Work Order" || !!selectedRequest.convertedJobId}
                                                    stepDetailConfig={isServiceCenter ? SC_STEP_CONFIG : PICKUP_STEP_CONFIG}
                                                    canRollback={false}
                                                />
                                            </div>

                                            {/* Payment */}
                                            <div>
                                                <Label className="text-xs font-semibold text-slate-700 mb-1.5 block">Payment</Label>
                                                <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border">
                                                    {(selectedRequest.paymentStatus || "Due") === "Paid" ? <Badge className="bg-green-100 text-green-700 border-green-200 text-xs"><CheckCircle className="w-3 h-3 mr-1" />Paid</Badge> : <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs"><Clock className="w-3 h-3 mr-1" />Due</Badge>}
                                                    <p className="text-[10px] text-muted-foreground">{selectedRequest.convertedJobId ? <a href={`/admin#pos?search=${encodeURIComponent(selectedRequest.convertedJobId)}`} className="text-primary underline">View POS invoice</a> : "Auto-updates from Job invoice"}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Sticky footer */}
                                <div className="border-t p-4 flex items-center justify-between bg-slate-50/80 shrink-0">
                                    <div className="flex gap-2 flex-wrap items-center">
                                        <Button variant="ghost" onClick={handleCloseDialog} className="rounded-xl">Close</Button>

                                        {/* Dynamic Contextual Actions */}
                                        {getContextualActions(selectedRequest.status, selectedRequest.serviceMode || "service_center", "Admin", selectedRequest.quoteStatus).map((action) => (
                                            <Button
                                                key={action.id}
                                                variant={action.isPrimary ? "default" : action.intent === "negative" ? "destructive" : "outline"}
                                                size="sm"
                                                className="rounded-xl"
                                                onClick={() => actionMutation.mutate({ id: selectedRequest.id, actionId: action.id })}
                                                disabled={actionMutation.isPending || isInternalBlocked}
                                            >
                                                {action.label}
                                            </Button>
                                        ))}

                                        {selectedRequest.isQuote && (!selectedRequest.quoteStatus || selectedRequest.quoteStatus === "Pending") && (
                                            <Button size="sm" className="rounded-xl bg-amber-600 hover:bg-amber-700" onClick={() => { setQuoteAmount(selectedRequest.quoteAmount?.toString() || ""); setQuoteNotes(selectedRequest.quoteNotes || ""); setShowQuotePriceDialog(true); }}><Send className="w-3.5 h-3.5 mr-1.5" />Send Quote</Button>
                                        )}
                                        {!selectedRequest.convertedJobId && ["New", "Under Review", "Approved"].includes(selectedRequest.status) && canVerifyAndConvert && (
                                            <Button size="sm" className="rounded-xl bg-green-600 hover:bg-green-700" onClick={() => { setRequestToVerify(selectedRequest); setVerificationNotes(selectedRequest.description || ""); setShowVerifyDialog(true); }}><CheckCircle className="w-3.5 h-3.5 mr-1.5" />Convert to Job</Button>
                                        )}
                                    </div>
                                    <div className="flex gap-2 pl-4 border-l ml-2">
                                        <Button variant="destructive" size="sm" className="rounded-xl" onClick={() => { setRequestToDelete(selectedRequest); setShowDeleteDialog(true); handleCloseDialog(); }}><Trash2 className="w-3.5 h-3.5 mr-1.5" />Delete</Button>
                                    </div>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* ========== DIALOGS ========== */}
            {/* Delete */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent className="rounded-2xl">
                    <AlertDialogHeader><AlertDialogTitle>Delete Service Request?</AlertDialogTitle><AlertDialogDescription>This will permanently delete #{requestToDelete?.ticketNumber}. Cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel><AlertDialogAction onClick={() => requestToDelete && deleteMutation.mutate(requestToDelete.id)} className="bg-red-600 hover:bg-red-700 rounded-xl">{deleteMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting...</> : 'Delete'}</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Status Confirm — Enterprise Warning Dialog */}
            <Dialog open={showStatusConfirmDialog} onOpenChange={(open) => { if (!open) { setShowStatusConfirmDialog(false); setPendingStatusChange(null); } }}>
                <DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden border-0">
                    {(() => {
                        const warning = pendingStatusChange ? getStatusChangeWarning(
                            pendingStatusChange.type,
                            selectedRequest?.status || '',
                            pendingStatusChange.newValue
                        ) : null;
                        return warning ? (
                            <>
                                <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-5">
                                    <h3 className="text-white font-bold text-base flex items-center gap-2">
                                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                                        {warning.title}
                                    </h3>
                                    <p className="text-slate-300 text-xs mt-1">This action cannot be undone. Please review carefully.</p>
                                </div>
                                <div className="p-5 space-y-4">
                                    {/* Flow Visualization */}
                                    <div className="flex items-center justify-center gap-3">
                                        <Badge variant="outline" className="px-3 py-1 text-xs">{selectedRequest?.status || '—'}</Badge>
                                        <ArrowRightCircle className="w-5 h-5 text-slate-400" />
                                        <Badge className="px-3 py-1 text-xs bg-blue-600 text-white">{pendingStatusChange?.newValue}</Badge>
                                    </div>

                                    {/* Warning Box */}
                                    <div className={`p-3 rounded-lg border ${warning.color}`}>
                                        <p className="text-xs font-medium">{warning.warning}</p>
                                    </div>

                                    {/* Effects */}
                                    <div className="space-y-2">
                                        <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">What will happen:</p>
                                        {warning.effects.map((effect, i) => (
                                            <div key={i} className="flex items-start gap-2 text-xs text-slate-600">
                                                <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                                {effect}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex gap-2 p-4 border-t bg-slate-50">
                                    <Button variant="outline" onClick={() => { setShowStatusConfirmDialog(false); setPendingStatusChange(null); }} className="flex-1 rounded-xl">Cancel</Button>
                                    <Button onClick={confirmStatusChange} className="flex-1 rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 text-white">Confirm & Advance</Button>
                                </div>
                            </>
                        ) : null;
                    })()}
                </DialogContent>
            </Dialog>

            {/* Quote Price */}
            <Dialog open={showQuotePriceDialog} onOpenChange={setShowQuotePriceDialog}>
                <DialogContent className="rounded-2xl">
                    <DialogHeader><DialogTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-primary" />Send Quote Price</DialogTitle></DialogHeader>
                    {selectedRequest && (
                        <div className="space-y-4">
                            <div className="bg-muted/50 p-3 rounded-xl space-y-1.5 text-sm">
                                <div className="flex justify-between"><span className="text-muted-foreground">Ticket:</span><span className="font-mono font-medium">{selectedRequest.ticketNumber}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Customer:</span><span>{selectedRequest.customerName}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Issue:</span><span>{selectedRequest.primaryIssue}</span></div>
                            </div>
                            <div className="space-y-1.5"><Label>Amount ({getCurrencySymbol()}) *</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{getCurrencySymbol()}</span><Input type="number" placeholder="Enter price" value={quoteAmount} onChange={(e) => setQuoteAmount(e.target.value)} className="pl-8 rounded-xl" /></div></div>
                            <div className="space-y-1.5"><Label>Notes (Optional)</Label><Textarea placeholder="Details about repair, parts..." value={quoteNotes} onChange={(e) => setQuoteNotes(e.target.value)} rows={3} className="rounded-xl" /></div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowQuotePriceDialog(false)} className="rounded-xl">Cancel</Button>
                        <Button onClick={() => selectedRequest && quoteAmount && quotePriceMutation.mutate({ id: selectedRequest.id, quoteAmount: parseFloat(quoteAmount), quoteNotes: quoteNotes || undefined })} disabled={!quoteAmount || quotePriceMutation.isPending} className="rounded-xl">
                            {quotePriceMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</> : <><Send className="w-4 h-4 mr-2" />Send Quote</>}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Verify & Convert */}
            <Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
                <DialogContent className="sm:max-w-[425px] rounded-2xl">
                    <DialogHeader><DialogTitle>Verify & Convert Request</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2"><Label>Priority</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select priority" /></SelectTrigger><SelectContent>{["Low", "Medium", "High", "Urgent"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
                        <div className="grid gap-2"><Label>Verification Notes</Label><Textarea value={verificationNotes} onChange={(e) => setVerificationNotes(e.target.value)} placeholder="Add notes..." className="h-32 rounded-xl" /></div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowVerifyDialog(false)} className="rounded-xl">Cancel</Button>
                        <Button onClick={() => requestToVerify && verifyMutation.mutate({ id: requestToVerify.id, verificationNotes, priority })} disabled={verifyMutation.isPending} className="rounded-xl">
                            {verifyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Convert to Job
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Adjust Progress Dialog */}
            <Dialog open={showRollbackDialog} onOpenChange={setShowRollbackDialog}>
                <DialogContent className="sm:max-w-[425px] rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Undo2 className="w-5 h-5 text-amber-500" />
                            Adjust Progress
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                            <p className="text-sm text-amber-800">
                                You are modifying the status of <strong>{selectedRequest?.ticketNumber}</strong> from <strong>{selectedRequest?.status}</strong> to a previous state. This action is audited.
                            </p>
                        </div>
                        <div className="grid gap-2">
                            <Label>Target Stage</Label>
                            <Select onValueChange={(v) => document.getElementById('rollback-target-val')?.setAttribute('value', v)}>
                                <SelectTrigger className="rounded-xl">
                                    <SelectValue placeholder="Select target stage..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {selectedRequest && INTERNAL_STEPS.slice(0, INTERNAL_STEPS.indexOf(selectedRequest.status as any)).map(step => (
                                        <SelectItem key={step} value={step}>{step}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {/* Hidden input to hold state since we don't want to add a new useState just for this if we can avoid it. Actually we can just add a state but since I am outside the component root, I'll use a hack or just add state via useState during next iteration if needed. Let's just create a ref or rely on an onboard state string. Oh wait, I didn't declare rollbackTarget. I'll read from DOM. */}
                            <input type="hidden" id="rollback-target-val" value="" />
                        </div>
                        <div className="grid gap-2">
                            <Label>Reason for Adjustment</Label>
                            <Textarea
                                value={rollbackReason}
                                onChange={(e) => setRollbackReason(e.target.value)}
                                placeholder="Explain why this adjustment is needed..."
                                className="h-32 rounded-xl"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setShowRollbackDialog(false);
                            setRollbackReason("");
                        }} className="rounded-xl">Cancel</Button>
                        <Button
                            onClick={() => {
                                const target = document.getElementById('rollback-target-val')?.getAttribute('value');
                                if (selectedRequest && rollbackReason.trim() && target) {
                                    adjustProgressMutation.mutate({
                                        id: selectedRequest.id,
                                        targetStatus: target,
                                        reason: rollbackReason
                                    });
                                } else {
                                    toast.error("Please select a target stage and provide a reason");
                                }
                            }}
                            disabled={!rollbackReason.trim() || adjustProgressMutation.isPending}
                            className="rounded-xl bg-amber-500 hover:bg-amber-600"
                        >
                            {adjustProgressMutation.isPending ? "Adjusting..." : "Adjust Progress"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Media Viewer */}
            <MediaViewer urls={currentMediaUrls} initialIndex={mediaViewerIndex} isOpen={mediaViewerOpen} onClose={() => setMediaViewerOpen(false)} />
        </motion.div>
    );
}
