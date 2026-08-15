import { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import type { ServiceRequest } from "@shared/schema";
import { buildNavigateAdminTabPath } from "@/lib/admin-workspace-routing";
import { shouldAdoptRefreshedRequest } from "@/lib/service-request-drawer-sync";
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
    ArrowRightCircle, Image, Film, DollarSign, Send, Calendar, Undo2, LayoutGrid, LayoutList, Truck
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { JobTicketList } from "./jobs/JobTicketList";

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
const MediaViewer = lazy(() => import("@/components/MediaViewer").then(m => ({ default: m.MediaViewer })));
const StatusStepper = lazy(() => import("@/components/StatusStepper").then(m => ({ default: m.StatusStepper })));
const WorkflowStepper = lazy(() => import("@/components/StatusStepper").then(m => ({ default: m.WorkflowStepper })));
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MobileBottomSheetFrame, MobileBottomSheetHandle } from "@/components/ui/mobile-bottom-sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = window.setTimeout(() => setDebounced(value), delayMs);
        return () => window.clearTimeout(t);
    }, [value, delayMs]);
    return debounced;
}

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
import { serviceRequestsApi, adminQuotesApi, adminStageApi, jobTicketsApi, settingsApi, adminPickupsApi, adminLogisticsApi, repairCaseApi, callAttemptsApi, intakeSummaryApi } from "@/lib/api";
import { resolveCustodyOwner, serviceDeskMayCollectCustodyCode } from "@/lib/custody-owner";
import { useRollback } from "@/contexts/RollbackContext";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { cn } from "@/lib/utils";
import {
    BentoCard,
    DashboardSkeleton,
    containerVariants,
    itemVariants,
    HighlightMatch,
    smartMatch,
    MobileTabHeader,
    MobileScrollContent,
    MobileKpiGrid,
    MobileCommandRail,
    MobileSegmentTabs,
} from "../shared";
import { toast } from "sonner";
import { formatScreenSize } from "@shared/tv-options";

type IntakeLane = 'all' | 'new_intake' | 'needs_call' | 'needs_reply' | 'quote_sent' | 'schedule_needed' | 'waiting_customer' | 'ready_to_receive' | 'converted_to_job' | 'rejected_closed';

const LANE_CONFIG: { value: IntakeLane; label: string; shortLabel: string; tone: string }[] = [
    { value: "all", label: "All", shortLabel: "All", tone: "slate" },
    { value: "new_intake", label: "New Intake", shortLabel: "New", tone: "blue" },
    { value: "needs_reply", label: "Needs Reply", shortLabel: "Reply", tone: "amber" },
    { value: "quote_sent", label: "Quote Sent", shortLabel: "Quote", tone: "violet" },
    { value: "schedule_needed", label: "Schedule", shortLabel: "Sched", tone: "cyan" },
    { value: "waiting_customer", label: "Waiting", shortLabel: "Wait", tone: "orange" },
    { value: "ready_to_receive", label: "Ready", shortLabel: "Ready", tone: "emerald" },
    { value: "converted_to_job", label: "Job", shortLabel: "Job", tone: "indigo" },
    { value: "rejected_closed", label: "Closed", shortLabel: "Closed", tone: "rose" },
];

function classifyLane(sr: ServiceRequest): IntakeLane {
    if (sr.convertedJobId) return 'converted_to_job';
    const closed = ['Cancelled', 'Declined', 'Closed', 'Unrepairable'];
    if (closed.includes(sr.status)) return 'rejected_closed';
    const ready = ['picked_up', 'device_received'];
    if (sr.stage && ready.includes(sr.stage)) return 'ready_to_receive';
    if ((sr as any).quoteStatus === 'Quoted') return 'quote_sent';
    const sched = ['pickup_scheduled', 'awaiting_dropoff'];
    if (sr.stage && sched.includes(sr.stage)) return 'schedule_needed';
    if ((sr as any).isQuote && (!(sr as any).quoteStatus || (sr as any).quoteStatus === 'Pending')) return 'needs_reply';
    if (!sr.adminInteracted && sr.status === 'Pending') return 'new_intake';
    if (sr.status === 'Pending' || sr.status === 'Under Review') return 'needs_reply';
    return 'new_intake';
}

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
type CustodyOtpAction = "receive" | "delivery";

const getCustodyActionForStage = (stage: string): CustodyOtpAction | null => {
    if (stage === "picked_up" || stage === "device_received") return "receive";
    if (stage === "completed") return "delivery";
    return null;
};

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
const getJourneyGroup = (stage: string) => {
    if (["intake", "assessment", "awaiting_customer", "authorized"].includes(stage)) return "Request";
    if (["pickup_scheduled", "picked_up", "awaiting_dropoff", "device_received"].includes(stage)) return "Custody";
    if (["in_repair", "ready"].includes(stage)) return "Repair";
    if (["out_for_delivery", "completed", "closed"].includes(stage)) return "Return";
    return "Request";
};
const normalizeTel = (phone?: string | null) => {
    const digits = (phone || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("880")) return `+${digits}`;
    if (digits.startsWith("0")) return `+88${digits}`;
    return `+880${digits}`;
};
const getMediaUrls = (s: string | null): string[] => { if (!s) return []; try { const p = JSON.parse(s); return p.map((i: string | { url: string }) => typeof i === 'string' ? i : i.url); } catch { return []; } };
const getSymptoms = (s: string | null): string[] => { if (!s) return []; try { return JSON.parse(s); } catch { return []; } };
/**
 * The range the customer was shown on the website, if any.
 *
 * The homepage fault simulator writes it into `symptoms` at intake. Whoever is
 * about to type a quote needs to see it: the customer still has that number on
 * their phone, and a quote that departs from it without anyone here knowing it
 * existed is an argument at the counter that we lose from memory.
 *
 * It is an estimate made before anybody saw the television, so it is shown as
 * context for the quote and never as a default for it.
 */
const getShownEstimate = (s: string | null): string | null =>
    getSymptoms(s).find((line) => typeof line === "string" && line.startsWith("Estimate shown online:")) ?? null;
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
    initialRequestId?: string;
    onSearchConsumed?: () => void;
}

export default function ServiceRequestsTab({ initialSearchQuery, initialRequestId, onSearchConsumed }: ServiceRequestsTabProps = {}) {
    const { user, permissions, hasPermission } = useAdminAuth();
    const isMobile = useIsMobile();
    const [, setLocation] = useLocation();
    const [viewMode, setViewMode] = useState<"grid" | "list">("list");
    const [draggedRequestId, setDraggedRequestId] = useState<string | null>(null);
    const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

    const [srSearchQuery, setSrSearchQuery] = useState(initialSearchQuery || "");
    const [srStatusFilter, setSrStatusFilter] = useState("all");
    const [laneFilter, setLaneFilter] = useState<IntakeLane>("all");
    const [showCallLogDialog, setShowCallLogDialog] = useState(false);
    const [callForm, setCallForm] = useState({ callType: "follow_up", outcome: "", customerMood: "", callbackAt: "", notes: "" });
    const resetCallForm = () => setCallForm({ callType: "follow_up", outcome: "", customerMood: "", callbackAt: "", notes: "" });

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
    const [rollbackTarget, setRollbackTarget] = useState("");
    const [showMobileMoreActions, setShowMobileMoreActions] = useState(false);
    const { addRollbackRequest } = useRollback();
    // Open once a transfer produces a task that nobody was auto-assigned to.
    const [driverPicker, setDriverPicker] = useState<{ taskId: string; ticketNumber: string | null } | null>(null);
    const [custodyOtp, setCustodyOtp] = useState<{ requestId: string; action: CustodyOtpAction; targetStage: string } | null>(null);
    const [custodyOtpCode, setCustodyOtpCode] = useState("");

    useEffect(() => {
        const anyOpen = !!selectedRequest || showDeleteDialog || showStatusConfirmDialog || showQuotePriceDialog || showVerifyDialog || showRollbackDialog || showMobileMoreActions || showCallLogDialog;
        if (isMobile && anyOpen) {
            window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: true } }));
            return () => {
                window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: false } }));
            };
        }
    }, [isMobile, selectedRequest, showDeleteDialog, showStatusConfirmDialog, showQuotePriceDialog, showVerifyDialog, showRollbackDialog, showMobileMoreActions, showCallLogDialog]);

    const queryClient = useQueryClient();

    // HOTFIX-1/2: server-side page/search/status — never slice a single incomplete page client-side.
    // Lane filter disabled until a correct bounded SQL lane query exists (no false global counts).
    const srPageSize = 12;
    const debouncedSrSearch = useDebouncedValue(srSearchQuery, 300);
    useEffect(() => {
        setSrPage(1);
    }, [debouncedSrSearch, srStatusFilter]);

    const { data: srData, isLoading, isError, error: srError, isFetching, isPlaceholderData, refetch: refetchRequests } = useQuery({
        queryKey: ["serviceRequests", srPage, srPageSize, debouncedSrSearch, srStatusFilter],
        queryFn: () =>
            serviceRequestsApi.getAll({
                page: srPage,
                limit: srPageSize,
                search: debouncedSrSearch.trim() || undefined,
                status: srStatusFilter !== "all" ? srStatusFilter : undefined,
            }),
        staleTime: 15_000,
        refetchOnMount: false,
        placeholderData: (previousData) => previousData,
    });
    const pageRequestIds = useMemo(
        () => (srData?.items ?? []).map((r) => r.id).filter(Boolean),
        [srData?.items],
    );

    /**
     * Keep the open drawer in step with the list.
     *
     * `selectedRequest` is a snapshot taken when the row was clicked, so
     * invalidating the list refreshed the table behind the drawer while the
     * drawer itself kept rendering the old row. Transferring to Pickup &
     * Delivery advances the stage server-side, but the drawer still showed
     * "Intake" and still offered "Transfer to Pickup & Delivery" — click it
     * again and the idempotent endpoint answered "Already in Pickup &
     * Delivery". The transfer had worked both times; only the screen was stale.
     *
     * Compared on the fields the drawer's actions actually branch on rather
     * than object identity, which changes on every refetch and would loop.
     */
    useEffect(() => {
        const items = srData?.items ?? [];
        setSelectedRequest((current) => {
            if (!current?.id) return current;
            const fresh = items.find((r) => r.id === current.id);
            if (!fresh) return current;

            // Returning `current` unchanged lets React bail out rather than
            // re-render. See service-request-drawer-sync for why the comparison
            // treats null and undefined as equal — getting that wrong is what
            // crashed every drawer with React #185.
            return shouldAdoptRefreshedRequest(current, fresh) ? fresh : current;
        });
    }, [srData?.items]);
    const { data: intakeSummary } = useQuery({
        queryKey: ["intake-summary", pageRequestIds.join(",")],
        queryFn: () => intakeSummaryApi.byIds(pageRequestIds),
        enabled: pageRequestIds.length > 0,
        staleTime: 10_000,
        refetchOnMount: "always" as const,
    });
    const intakeLaneMap = useMemo(() => {
        const m = new Map<string, { lane: string; callSummary: any; needsStaffAction: boolean }>();
        if (intakeSummary) for (const item of intakeSummary) m.set(item.serviceRequestId, item);
        return m;
    }, [intakeSummary]);
    const getLane = (sr: ServiceRequest): IntakeLane => {
        const backend = intakeLaneMap.get(sr.id);
        if (backend) return backend.lane as IntakeLane;
        return classifyLane(sr);
    };
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

    const { data: repairCase } = useQuery({
        queryKey: ["repair-case", selectedRequest?.id],
        queryFn: () => selectedRequest ? repairCaseApi.getByServiceRequest(selectedRequest.id) : null,
        enabled: !!selectedRequest?.id,
    });
    const { data: callAttempts = [] } = useQuery({
        queryKey: ["call-attempts", selectedRequest?.id],
        queryFn: () => selectedRequest ? callAttemptsApi.list(selectedRequest.id) : [],
        enabled: !!selectedRequest?.id,
    });
    const callLogMutation = useMutation({
        mutationFn: (data: { serviceRequestId: string; callType: string; outcome?: string; notes?: string; customerMood?: string; callbackAt?: string }) =>
            callAttemptsApi.create(data.serviceRequestId, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["call-attempts", selectedRequest?.id] });
            queryClient.invalidateQueries({ queryKey: ["repair-case", selectedRequest?.id] });
            queryClient.invalidateQueries({ queryKey: ["intake-summary"] });
            queryClient.invalidateQueries({ queryKey: ["serviceRequests"] });
            toast.success("Call logged");
            setShowCallLogDialog(false);
            resetCallForm();
        },
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

    // Auto-open service request by initialRequestId (from Smart Search deep-link)
    const initialRequestIdOpenedRef = useRef<string | null>(null);
    useEffect(() => {
        if (initialRequestId && serviceRequests.length > 0 && !selectedRequest) {
            if (initialRequestIdOpenedRef.current === initialRequestId) return;
            const match = serviceRequests.find((r: any) =>
                r.id === initialRequestId ||
                r.ticketNumber === initialRequestId ||
                r.reference === initialRequestId
            );
            if (match) {
                initialRequestIdOpenedRef.current = initialRequestId;
                const index = serviceRequests.findIndex(r => r.id === match.id);
                handleViewDetails(match, index > -1 ? index : 0);
                setSrStatusFilter("all");
            }
        }
    }, [initialRequestId, serviceRequests, selectedRequest]);

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
            setRollbackTarget("");
        },
        onError: (e: Error) => { toast.error("Failed to adjust progress: " + e.message); }
    });

    const stageTransitionMutation = useMutation({
        mutationFn: ({ id, stage }: { id: string; stage: string }) => adminStageApi.transitionStage(id, { stage }),
        onSuccess: (u) => { queryClient.invalidateQueries({ queryKey: ["serviceRequests"] }); queryClient.invalidateQueries({ queryKey: ["next-stages", u.id] }); setSelectedRequest(normalizeServiceRequest(u)); toast.success(`Stage -> "${formatStageName(u.stage || "")}"`); if (u.convertedJobId) toast.success(`Job ticket ${u.convertedJobId} created!`); },
        onError: (e: Error) => { toast.error(e.message || "Failed to update stage"); },
    });
    const transferToPickupMutation = useMutation({
        mutationFn: (id: string) => adminPickupsApi.transferFromServiceRequest(id),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ["serviceRequests"] });
            if (selectedRequest?.id) queryClient.invalidateQueries({ queryKey: ["next-stages", selectedRequest.id] });
            queryClient.invalidateQueries({ queryKey: ["adminPickups"] });
            // The transfer now advances the stage and may assign a driver, so the
            // logistics board is stale too. Without this the task appears
            // unassigned until the tab is reloaded.
            queryClient.invalidateQueries({ queryKey: ["logistics-tasks"] });
            // The wizard card names the driver from this query, so it has to
            // refetch or the card stays on "Send to pickup desk" after a
            // successful transfer — which is what made the button look dead.
            queryClient.invalidateQueries({ queryKey: ["pickup-by-request"] });

            if (res.autoAssignedDriver) {
                toast.success(
                    res.alreadyExisted
                        ? `Already in Pickup & Delivery — ${res.autoAssignedDriver}`
                        : `Transferred to Pickup & Delivery — assigned to ${res.autoAssignedDriver}`,
                );
                return;
            }

            // With two or more drivers autoAssignSoleDriver assigns nobody on
            // purpose. Previously that ended here: the task sat unassigned in
            // Pickup & Delivery and nothing said a choice was still owed. Ask
            // for the driver now, while the admin is still looking at the case.
            if (res.driverChoiceRequired && res.taskId) {
                setDriverPicker({ taskId: res.taskId, ticketNumber: selectedRequest?.ticketNumber ?? null });
                return;
            }

            /**
             * A transfer that assigned nobody is not a success worth a green tick.
             *
             * This used to report plain success in every remaining case, so a
             * request with no driver looked identical to one with a driver —
             * which is what "the send-to-driver button does not assign anyone"
             * looks like from the counter.
             */
            if (res.driverBlocker === "no_driver") {
                toast.warning("Moved to Pickup & Delivery, but nobody is assigned", {
                    description: "There is no active user with the Driver role. Add one in Users, then assign this task.",
                    duration: 8000,
                });
                return;
            }
            if (res.driverBlocker === "no_task") {
                toast.error("Moved, but no pickup task was created", {
                    description: "There is nothing for a driver to pick up. Open Pickup & Delivery and check this request.",
                    duration: 8000,
                });
                return;
            }

            toast.success(res.alreadyExisted ? "Already in Pickup & Delivery" : "Transferred to Pickup & Delivery");
        },
        onError: (e: Error) => toast.error(e.message || "Failed to transfer to pickup"),
    });
    /**
     * The logistics task for the open request, so the wizard can NAME the driver.
     *
     * Read from logistics_tasks rather than the legacy pickup_schedules row: the
     * legacy table only has `assignedStaff`, while assignment actually writes
     * `assigned_driver_name` on the task — that is what autoAssignSoleDriver and
     * the assign endpoint both set. It also carries the task id, which is what
     * the driver picker needs.
     *
     * Without this the screen had nothing to say after a transfer, so it offered
     * "Open Pickup & Delivery" — a button that navigated away from the case the
     * admin was reading and answered neither question they actually had: did the
     * transfer work, and who is collecting it.
     */
    const selectedIsPickupMode = selectedRequest?.serviceMode === "pickup"
        || selectedRequest?.servicePreference === "pickup"
        || selectedRequest?.servicePreference === "home_pickup";

    const { data: selectedPickupTasks } = useQuery({
        queryKey: ["pickup-by-request", selectedRequest?.id],
        queryFn: () => adminLogisticsApi.list({
            serviceRequestId: selectedRequest!.id,
            taskType: "pickup",
        }),
        enabled: !!selectedRequest?.id && !!selectedIsPickupMode,
        staleTime: 15 * 1000,
    });
    const selectedPickupTask = selectedPickupTasks?.[0] ?? null;

    // Only fetched once the picker opens — most requests never need the list.
    const { data: availableDrivers = [], isLoading: driversLoading } = useQuery({
        queryKey: ["logistics-drivers"],
        queryFn: adminLogisticsApi.listDrivers,
        enabled: !!driverPicker,
        staleTime: 5 * 60 * 1000,
    });

    const assignDriverMutation = useMutation({
        mutationFn: ({ taskId, driver }: { taskId: string; driver: { id: string; name: string } }) =>
            adminLogisticsApi.assign(taskId, { driverId: driver.id, driverName: driver.name }),
        onSuccess: (_r, vars) => {
            queryClient.invalidateQueries({ queryKey: ["logistics-tasks"] });
            queryClient.invalidateQueries({ queryKey: ["adminPickups"] });
            queryClient.invalidateQueries({ queryKey: ["serviceRequests"] });
            // Without this the wizard card keeps showing "Waiting for a driver"
            // after the driver has just been chosen.
            queryClient.invalidateQueries({ queryKey: ["pickup-by-request"] });
            setDriverPicker(null);
            toast.success(`Assigned to ${vars.driver.name}`);
        },
        onError: (e: Error) => toast.error(e.message || "Failed to assign driver"),
    });

    const sendCustodyOtpMutation = useMutation({
        mutationFn: ({ id, action }: { id: string; action: CustodyOtpAction }) => adminStageApi.sendCustodyOtp(id, { action }),
        onSuccess: (r, vars) => {
            // No phone: custody is an account control now, not a phone one, so
            // the response no longer echoes a number the desk does not need.
            setCustodyOtp({ requestId: vars.id, action: vars.action, targetStage: r.targetStage });
            setCustodyOtpCode("");
            toast.success("Online code is available in the customer's repair page");
        },
        onError: (e: Error) => { toast.error(e.message || "Failed to send OTP"); },
    });
    const confirmCustodyOtpMutation = useMutation({
        mutationFn: ({ id, action, code }: { id: string; action: CustodyOtpAction; code: string }) => adminStageApi.confirmCustodyOtp(id, { action, code }),
        onSuccess: (u) => {
            queryClient.invalidateQueries({ queryKey: ["serviceRequests"] });
            queryClient.invalidateQueries({ queryKey: ["next-stages", u.id] });
            setSelectedRequest(normalizeServiceRequest(u));
            setCustodyOtp(null);
            setCustodyOtpCode("");
            toast.success(`Stage -> "${formatStageName(u.stage || "")}"`);
        },
        onError: (e: Error) => { toast.error(e.message || "Failed to confirm OTP"); },
    });
    const expectedDatesMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: any }) => adminStageApi.updateExpectedDates(id, data),
        onSuccess: (u) => { queryClient.invalidateQueries({ queryKey: ["serviceRequests"] }); setSelectedRequest(normalizeServiceRequest(u)); toast.success("Dates updated"); },
        onError: () => { toast.error("Failed to update dates"); },
    });
    const verifyMutation = useMutation({
        mutationFn: ({ id, verificationNotes: vn, priority: p }: { id: string; verificationNotes: string; priority: string }) => serviceRequestsApi.verifyAndConvert(id, { verificationNotes: vn, priority: p }),
        onSuccess: (r) => { queryClient.invalidateQueries({ queryKey: ["serviceRequests"] }); toast.success(`Job #${r.jobTicket.id} created`); setShowVerifyDialog(false); setVerificationNotes(""); setPriority("Medium"); setRequestToVerify(null); },
        onError: (e: Error) => { toast.error(e.message || "Failed to verify"); },
    });

    // === PERMISSION HELPERS ===
    const isSuperAdmin = user?.role === "Super Admin";
    const hasDirect = (key: string) => (permissions as any)?.[key] === true;
    const hasLegacy = (key: string) => (permissions as any)?.[key] === true;

    const canSendQuote = isSuperAdmin || hasDirect("serviceRequests.quote") || hasLegacy("serviceRequests");
    const canTransitionStage = isSuperAdmin || hasDirect("serviceRequests.transitionStage") || hasLegacy("serviceRequests");
    const canLogCall = isSuperAdmin || hasDirect("serviceRequests.logCall") || hasLegacy("serviceRequests");
    const canConvertServiceRequest = isSuperAdmin || hasDirect("serviceRequests.convertToJob") || hasLegacy("serviceRequests");
    const canCreateJobTicket = isSuperAdmin || hasDirect("jobs.create") || (hasLegacy("jobs") && hasLegacy("canCreate"));
    const canVerifyAndConvert = canConvertServiceRequest && canCreateJobTicket;
    const canDeleteServiceRequest = isSuperAdmin;
    const canEditServiceRequest = isSuperAdmin || hasDirect("serviceRequests.edit") || hasLegacy("serviceRequests");
    const handleStageSelect = (id: string, stage: string) => {
        const custodyAction = getCustodyActionForStage(stage);
        if (custodyAction) {
            /**
             * Whose handover is this?
             *
             * resolveCustodyOwner has said since it was written that a pickup
             * request's handover happens at the customer's door and therefore
             * belongs to the driver, while a drop-off happens at the counter
             * and belongs to this desk. That rule was applied to the wizard
             * button and to nothing else — so the stage dropdown on every row
             * of the list still offered "receive" on a pickup request.
             *
             * The server has always refused those: resolveCustodyAuthority
             * throws unless the actor IS the assigned driver. So the button
             * could never succeed; it just failed with a message about
             * permissions, which reads like a broken system rather than a
             * handover that belongs to somebody else.
             */
            const row = (srData?.items ?? []).find((r: any) => r.id === id)
                ?? (selectedRequest?.id === id ? selectedRequest : null);
            const custodyIsOurs = serviceDeskMayCollectCustodyCode({
                serviceMode: row?.serviceMode ?? null,
                stage: row?.stage ?? null,
                convertedJobId: row?.convertedJobId ?? null,
            });

            if (!custodyIsOurs) {
                toast.info("This handover belongs to the driver", {
                    description: "The customer's code is read at their door, in Pickup & Delivery — not from this desk.",
                    action: {
                        label: "Open Pickup & Delivery",
                        onClick: () => setLocation(buildNavigateAdminTabPath("pickup")),
                    },
                    duration: 8000,
                });
                return;
            }

            sendCustodyOtpMutation.mutate({ id, action: custodyAction });
            return;
        }
        stageTransitionMutation.mutate({ id, stage });
    };

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
    const handleCloseDialog = () => { setSelectedRequest(null); setPendingChanges(null); setShowMobileMoreActions(false); };

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

    // HOTFIX-2: lane chips show page-only distribution (never as global totals). Lane filter disabled.
    const laneCounts = useMemo(() => {
        const counts: Record<string, number> = { all: serviceRequests.length };
        for (const sr of serviceRequests) {
            const lane = getLane(sr);
            counts[lane] = (counts[lane] || 0) + 1;
        }
        return counts;
    }, [serviceRequests, intakeLaneMap]);

    if (isLoading) return <DashboardSkeleton />;

    /**
     * A failed load must not look like an empty inbox.
     *
     * There was no error branch at all: when the request failed — a timed-out
     * cold start, an expired session, a dropped connection — srData stayed
     * undefined and the tab fell through to "No service requests found". Staff
     * could not tell "nothing came in today" from "this screen is broken", and
     * the only way to retry was to reload the whole admin panel.
     *
     * Queries here are configured retry: false, so nothing recovers on its own.
     * Somebody has to be told, and given a button.
     */
    if (isError) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center p-6">
                <div className="w-full max-w-md rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
                    <AlertTriangle className="mx-auto h-8 w-8 text-red-500" />
                    <h3 className="mt-3 text-base font-black text-red-900">Could not load service requests</h3>
                    <p className="mt-1.5 text-sm font-semibold text-red-800/80">
                        This is a loading problem, not an empty inbox — requests may still be coming in.
                    </p>
                    <p className="mt-2 break-words text-xs text-red-700/70">
                        {(srError as Error)?.message || "The server did not respond."}
                    </p>
                    <Button
                        className="mt-4 h-11 w-full rounded-xl bg-red-600 hover:bg-red-700"
                        onClick={() => refetchRequests()}
                        disabled={isFetching}
                    >
                        {isFetching ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Retrying…</> : "Try again"}
                    </Button>
                </div>
            </div>
        );
    }

    // Server applied search + status. Full page shown; lane filter not applied (would be wrong cross-page).
    const paginated = serviceRequests;
    /**
     * A page change that has been asked for but not yet answered.
     *
     * `placeholderData` deliberately keeps the previous page on screen while the
     * next one loads, so the table does not collapse and re-expand. Without a
     * cue that is indistinguishable from nothing happening: the request takes a
     * second or two, the rows do not move, and the only thing that changes is
     * the "Viewing 13–24" line — which is computed locally and updates at once.
     * So the page looked broken and people pressed Next again.
     *
     * `isPlaceholderData` is exactly this state, and distinguishes it from a
     * background refresh of the page already shown.
     */
    const pageChanging = isPlaceholderData;
    const totalFromServer = Number(srData?.total ?? serviceRequests.length);
    const totalPages = Math.max(1, Number(srData?.totalPages ?? (Math.ceil(totalFromServer / srPageSize) || 1)));

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
    /**
     * A quote that has been sent but not answered blocks the work.
     *
     * "Quoted" — sent, awaiting the customer — used to be on the allowed list,
     * so a repair could begin on a price nobody had agreed to, while the
     * tooltip beside the button promised "Sent quotes must be accepted or
     * declined". The screen made a promise the code did not keep, and the case
     * it let through is exactly the one that becomes an argument at billing.
     *
     * Only quote requests are gated at all. A customer who simply wants their
     * television fixed is never held up waiting for a price nobody asked for —
     * quoting here is something either side may start, not a step in every
     * repair.
     */
    const quoteBlocked = Boolean(sr?.isQuote) && !["Accepted", "Converted"].includes(sr?.quoteStatus || "");
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
    const selectedStage = selectedRequest?.stage || "intake";
    const selectedIsPickup = selectedRequest?.serviceMode === "pickup" || selectedRequest?.servicePreference === "pickup" || selectedRequest?.servicePreference === "home_pickup";
    const selectedPaymentPaid = (selectedRequest?.paymentStatus || "").toLowerCase() === "paid";
    const selectedValidNextStages = nextStagesData?.validNextStages || [];
    const findNextStage = (...stages: string[]) => stages.find((stage) => selectedValidNextStages.includes(stage));
    const mobileWizardAction = selectedRequest ? (() => {
        const quoted = selectedRequest.isQuote && (!selectedRequest.quoteStatus || selectedRequest.quoteStatus === "Pending");
        const waitingQuote = selectedRequest.isQuote && selectedRequest.quoteStatus === "Quoted";
        if (canSendQuote && quoted) {
            return {
                title: "Send customer quote",
                body: "Price must be sent before this request can move forward.",
                label: "Send Quote",
                tone: "amber",
                icon: <Send className="h-4 w-4" />,
                onClick: () => { setQuoteAmount(selectedRequest.quoteAmount?.toString() || ""); setQuoteNotes(selectedRequest.quoteNotes || ""); setShowQuotePriceDialog(true); },
                disabled: quotePriceMutation.isPending,
            };
        }
        if (waitingQuote) {
            return {
                title: "Waiting for customer",
                body: "The quote is already sent. Continue after the customer accepts.",
                label: "View Request",
                tone: "slate",
                icon: <Clock className="h-4 w-4" />,
                onClick: () => undefined,
                disabled: true,
            };
        }
        if (!selectedRequest.convertedJobId && ["picked_up", "device_received"].includes(selectedStage) && canVerifyAndConvert) {
            return {
                title: "Custody confirmed",
                body: "Device is with the shop. Create the job ticket now.",
                label: "Create Job",
                tone: "emerald",
                icon: <CheckCircle className="h-4 w-4" />,
                onClick: () => { setRequestToVerify(selectedRequest); setVerificationNotes(selectedRequest.description || ""); setShowVerifyDialog(true); },
                disabled: verifyMutation.isPending,
            };
        }
        if (canTransitionStage && selectedRequest.convertedJobId && selectedStage === "ready" && selectedIsPickup) {
            const nextStage = findNextStage("out_for_delivery");
            return {
                title: "Ready for return",
                body: "Move this case to delivery before handover.",
                label: "Start Return",
                tone: "blue",
                icon: <Truck className="h-4 w-4" />,
                onClick: () => nextStage ? handleStageSelect(selectedRequest.id, nextStage) : setLocation(buildNavigateAdminTabPath("pickup")),
                disabled: stageTransitionMutation.isPending,
            };
        }
        if (canTransitionStage && selectedRequest.convertedJobId && (selectedStage === "out_for_delivery" || selectedStage === "ready")) {
            return {
                title: "Release to customer",
                body: selectedPaymentPaid ? "Verify customer OTP before releasing the device." : "Open billing first, then verify OTP at handover.",
                label: selectedPaymentPaid ? "Verify Release OTP" : "Open Bill",
                tone: selectedPaymentPaid ? "emerald" : "amber",
                icon: selectedPaymentPaid ? <CheckCircle className="h-4 w-4" /> : <DollarSign className="h-4 w-4" />,
                onClick: () => selectedPaymentPaid ? handleStageSelect(selectedRequest.id, "completed") : setLocation(buildNavigateAdminTabPath("pos", { search: selectedRequest.convertedJobId || undefined })),
                disabled: selectedPaymentPaid && (sendCustodyOtpMutation.isPending || stageTransitionMutation.isPending),
            };
        }
        if (selectedRequest.convertedJobId) {
            return {
                title: "Job already created",
                body: "Continue repair, billing, and technician work from the job ticket.",
                label: "Open Job",
                tone: "violet",
                icon: <Tv className="h-4 w-4" />,
                onClick: () => { setLocation(buildNavigateAdminTabPath("jobs", { search: selectedRequest.convertedJobId || undefined })); },
                disabled: false,
            };
        }
        /**
         * Pickup requests hand off to the driver, not to this desk.
         *
         * This branch must come BEFORE the custody branch below, and used not
         * to. getNextValidStages returns stageFlow.slice(index + 1) — every
         * remaining stage, not the next one — so findNextStage("picked_up")
         * matched from "intake" onwards and the custody branch won every time.
         * "Receive Pickup OTP" therefore occupied the one primary action slot
         * on mobile for the whole life of a pickup request, and this transfer
         * branch was unreachable: dead code behind a condition that could never
         * be false first.
         *
         * Collecting the customer's code belongs to whoever is standing at the
         * customer's door. Offering it here invites an admin at a desk to
         * confirm a handover that has not physically happened.
         */
        const custodyOwner = resolveCustodyOwner({
            serviceMode: selectedIsPickup ? "pickup" : selectedRequest.serviceMode,
            stage: selectedStage,
            convertedJobId: selectedRequest.convertedJobId,
        });
        if (canTransitionStage && custodyOwner === "pickup_desk") {
            // A pickup row is the proof the transfer happened. The stage alone is
            // not: a request can reach pickup_scheduled by other routes, and the
            // admin's real question is "is this with the drivers, and who has it".
            const transferred = Boolean(selectedPickupTask) || selectedStage === "pickup_scheduled";
            const driverName = selectedPickupTask?.assignedDriverName?.trim() || null;

            // Done, and with a named driver. The button greys out because there
            // is nothing left to press — pressing it again transferred nothing
            // and said "Already in Pickup & Delivery", which reads like a fault.
            if (transferred && driverName) {
                return {
                    title: `Driver assigned — ${driverName}`,
                    body: `${driverName} is collecting this device and will confirm the customer's code at the door. Nothing more is needed here; follow it in Pickup & Delivery.`,
                    label: "Transferred to Pickup & Delivery",
                    // Slate + disabled so the button is plainly spent. Leaving it
                    // blue and live invited a second press, which transferred
                    // nothing and answered "Already in Pickup & Delivery" — a
                    // reply that reads like a failure.
                    tone: "slate",
                    icon: <CheckCircle className="h-4 w-4" />,
                    onClick: () => undefined,
                    disabled: true,
                };
            }

            // Transferred, nobody assigned. Not a dead end — name the gap and
            // offer the one action that closes it.
            if (transferred) {
                return {
                    title: "Waiting for a driver",
                    body: "This is in Pickup & Delivery but nobody is assigned yet. Choose who collects it.",
                    label: "Choose driver",
                    tone: "amber",
                    icon: <Truck className="h-4 w-4" />,
                    onClick: () => {
                        if (selectedPickupTask?.id) {
                            setDriverPicker({ taskId: selectedPickupTask.id, ticketNumber: selectedRequest.ticketNumber ?? null });
                            return;
                        }
                        // No task loaded yet — re-running the transfer is
                        // idempotent and returns the existing task id, from
                        // which the mutation opens the picker.
                        transferToPickupMutation.mutate(selectedRequest.id);
                    },
                    disabled: transferToPickupMutation.isPending || assignDriverMutation.isPending,
                };
            }

            return {
                title: "Send to pickup desk",
                body: "Create the Pickup & Delivery job, then choose the driver who collects it.",
                label: "Transfer to Pickup & Delivery",
                tone: "blue",
                icon: <Truck className="h-4 w-4" />,
                onClick: () => transferToPickupMutation.mutate(selectedRequest.id),
                disabled: transferToPickupMutation.isPending,
            };
        }
        // Drop-off only. The customer is at the counter, so the person taking
        // the device is the person reading the code — that is this desk.
        const receiveStage = custodyOwner === "service_desk" ? findNextStage("device_received") : undefined;
        if (canTransitionStage && receiveStage) {
            return {
                title: "Confirm custody",
                body: "Customer OTP is required before this can become a job.",
                label: "Receive Device OTP",
                tone: "emerald",
                icon: <CheckCircle className="h-4 w-4" />,
                onClick: () => handleStageSelect(selectedRequest.id, receiveStage),
                disabled: sendCustodyOtpMutation.isPending,
            };
        }
        const nextStage = canTransitionStage
            ? (findNextStage("assessment", "authorized", "awaiting_dropoff", "in_repair", "ready", "closed") || selectedValidNextStages[0])
            : null;
        return {
            title: nextStage ? `Next: ${formatStageName(nextStage)}` : "No next action",
            body: nextStage ? "Move the case forward one step." : "This case has no available wizard action.",
            label: nextStage ? `Move to ${formatStageName(nextStage)}` : "Done",
            tone: nextStage ? "blue" : "slate",
            icon: <ArrowRightCircle className="h-4 w-4" />,
            onClick: () => nextStage && handleStageSelect(selectedRequest.id, nextStage),
            disabled: !nextStage || stageTransitionMutation.isPending,
        };
    })() : null;
    // Badge counts: "all" uses server total; per-status badges reflect current page only (not full inventory).
    const statusCounts = STATUS_FILTERS.reduce<Record<string, number>>((acc, status) => {
        acc[status] = status === "all"
            ? totalFromServer
            : status === srStatusFilter
                ? totalFromServer
                : serviceRequests.filter((request: any) => request.status === status).length;
        return acc;
    }, {});
    const pendingQuoteCount = serviceRequests.filter((request: any) => request.isQuote && (!request.quoteStatus || request.quoteStatus === "Pending")).length;
    const unreadCount = serviceRequests.filter((request: any) => !request.adminInteracted).length;
    const mobileStatusLabels: Record<string, string> = {
        all: "All",
        New: "New",
        "Under Review": "Review",
        Approved: "Ok",
        "Work Order": "Work",
        Resolved: "Done",
        Closed: "Closed",
        Declined: "No",
        Cancelled: "Cancel",
        Unrepairable: "Bad",
    };
    const selectStatusFilter = (status: (typeof STATUS_FILTERS)[number]) => {
        setSrStatusFilter(status);
        setSrPage(1);
    };
    const mobileStatusItems = STATUS_FILTERS.map((status) => ({
        value: status,
        label: mobileStatusLabels[status] || status,
        badge: statusCounts[status] || 0,
    }));

    return (
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="flex flex-col h-full w-full overflow-hidden md:overflow-auto md:gap-6">
            {/*
              * md:hidden — this is the mobile header, and without the guard it
              * also rendered on desktop, putting a second "Service Requests"
              * title and a second search box above the desktop toolbar that
              * already has one.
              */}
            <MobileTabHeader className="md:hidden">
                <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h2 className="truncate text-[17px] font-black text-slate-950">Service Requests</h2>
                            {unreadCount > 0 && <Badge className="h-5 rounded-full bg-rose-100 px-2 text-[10px] font-black text-rose-700 shadow-none">{unreadCount} new</Badge>}
                        </div>
                        <p className="truncate text-[11px] font-medium text-slate-500">{totalFromServer} total · follow wizard action first</p>
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    <div className="relative min-w-0 flex-1">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <Input
                            placeholder="Search ticket, phone, customer..."
                            className="h-8 rounded-xl border-slate-200 bg-white pl-8 pr-2 text-xs font-semibold shadow-sm"
                            value={srSearchQuery}
                            onChange={(e) => { setSrSearchQuery(e.target.value); setSrPage(1); }}
                        />
                    </div>
                </div>
            </MobileTabHeader>

            <MobileScrollContent className="md:hidden space-y-2 pb-[calc(7.5rem+env(safe-area-inset-bottom))]">
                <div className="space-y-2">
                    <MobileKpiGrid
                        collapsible
                        summaryLabel="Intake pulse (this page)"
                        items={[
                            { label: "All", value: totalFromServer, meta: "server total", tone: "slate", onClick: () => { setLaneFilter("all"); setSrStatusFilter("all"); } },
                            { label: "New", value: laneCounts.new_intake || 0, meta: "on page", tone: "blue" },
                            { label: "Reply", value: laneCounts.needs_reply || 0, meta: "on page", tone: "amber" },
                            { label: "Job", value: laneCounts.converted_to_job || 0, meta: "on page", tone: "violet" },
                        ]}
                    />
                    <div className="flex gap-1.5 overflow-x-auto hide-scrollbar px-1">
                        {LANE_CONFIG.map(lane => (
                            <span key={lane.value}
                                title="Lane counts are for this page only"
                                className="shrink-0 whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                                {lane.shortLabel} {(laneCounts[lane.value] || 0) > 0 && <span className="ml-1 font-black">{laneCounts[lane.value]}</span>}
                            </span>
                        ))}
                    </div>
                </div>
                {paginated.length === 0 ? (
                    <div className="mt-2 flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-4 text-center text-slate-500 shadow-sm">
                        <MessageSquare className="mb-3 h-8 w-8 opacity-25" />
                        <p className="text-sm font-bold text-slate-700">No request found</p>
                        <Button variant="link" className="h-8 text-xs" onClick={() => { setSrSearchQuery(""); setSrStatusFilter("all"); }}>Clear filters</Button>
                    </div>
                ) : (
                    <div className="space-y-2 pt-2">
                        {paginated.map((request: any, index: number) => {
                            const sc = statusCardColors[request.status] || statusCardColors.Closed;
                            const modeLabel = request.servicePreference === "pickup" ? "Pickup" : "Center";
                            const lane = getLane(request);
                            const isMuted = lane === 'converted_to_job' || lane === 'rejected_closed';
                            return (
                                <button
                                    key={request.id}
                                    type="button"
                                    onClick={() => handleViewDetails(request, index)}
                                    className={cn(
                                        "w-full rounded-2xl border p-3 text-left shadow-sm transition active:scale-[0.99]",
                                        "border-l-4 border-slate-300",
                                        sc.border,
                                        isMuted ? "bg-slate-50 opacity-70" : "bg-white",
                                        !request.adminInteracted && !isMuted && "bg-rose-50/40 ring-1 ring-rose-100"
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                {!request.adminInteracted && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />}
                                                <span className="truncate font-mono text-[10px] font-black text-slate-400">#<HighlightMatch text={request.ticketNumber} query={srSearchQuery} /></span>
                                                {request.isQuote && <Badge className="h-4 rounded-md border-amber-200 bg-amber-50 px-1.5 text-[9px] font-black text-amber-700 shadow-none">QUOTE</Badge>}
                                                {lane === 'converted_to_job' && <Badge className="h-4 rounded-md border-indigo-200 bg-indigo-50 px-1.5 text-[9px] font-black text-indigo-700 shadow-none">JOB</Badge>}
                                            </div>
                                            <h3 className={cn("mt-1 truncate text-sm font-black leading-tight", isMuted ? "text-slate-500" : "text-slate-950")}><HighlightMatch text={request.customerName} query={srSearchQuery} /></h3>
                                        </div>
                                        <Badge className={cn("shrink-0 border px-1.5 py-0 text-[9px] font-black shadow-none", sc.badge)}>{request.status}</Badge>
                                    </div>
                                    <div className="mt-2 grid grid-cols-[1fr_auto] items-end gap-2 border-t border-slate-100 pt-2">
                                        <div className="min-w-0 space-y-1">
                                            <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold text-slate-700">
                                                <Tv className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                                                <span className="truncate"><HighlightMatch text={request.brand || "Unknown"} query={srSearchQuery} /> {request.screenSize ? formatScreenSize(request.screenSize) : ""}</span>
                                            </div>
                                            <div className="truncate text-[11px] font-medium text-slate-500"><HighlightMatch text={request.primaryIssue || "No issue noted"} query={srSearchQuery} /></div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] font-black uppercase text-slate-400">{getJourneyGroup(request.stage || "intake")}</div>
                                            <div className="text-[10px] font-bold text-slate-500">{format(new Date(request.createdAt), 'MMM d')}</div>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex items-center justify-between gap-2">
                                        <div className="flex min-w-0 items-center gap-1 text-[10px] font-semibold text-slate-500">
                                            <Phone className="h-3 w-3 shrink-0" />
                                            <span className="truncate"><HighlightMatch text={request.phone || "No phone"} query={srSearchQuery} /></span>
                                        </div>
                                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black", getStageColor(request.stage || "intake"))}>{modeLabel} · {formatStageName(request.stage || "intake")}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                        <Button variant="outline" size="sm" disabled={srPage === 1} onClick={() => setSrPage(p => Math.max(1, p - 1))} className="h-8 rounded-xl text-xs">Prev</Button>
                        <span className="text-xs font-black text-slate-500">{srPage} / {totalPages}</span>
                        <Button variant="outline" size="sm" disabled={srPage === totalPages} onClick={() => setSrPage(p => Math.min(totalPages, p + 1))} className="h-8 rounded-xl text-xs">Next</Button>
                    </div>
                )}
            </MobileScrollContent>
            {/* Compact KPI Strip — page-scoped lane pulse only (not global filter) */}
            <div className="hidden md:flex gap-3 shrink-0">
                {([
                    { label: "New Intake", value: laneCounts.new_intake || 0, sub: "On this page", icon: <MessageSquare size={16} />, color: "text-blue-600 bg-blue-50 border-blue-200", lane: "new_intake" as IntakeLane },
                    { label: "Needs Reply", value: laneCounts.needs_reply || 0, sub: "On this page", icon: <Clock size={16} />, color: "text-amber-600 bg-amber-50 border-amber-200", lane: "needs_reply" as IntakeLane },
                    { label: "Quotes Sent", value: laneCounts.quote_sent || 0, sub: "On this page", icon: <FileText size={16} />, color: "text-violet-600 bg-violet-50 border-violet-200", lane: "quote_sent" as IntakeLane },
                    { label: "Schedule", value: laneCounts.schedule_needed || 0, sub: "On this page", icon: <Clock size={16} />, color: "text-fuchsia-600 bg-fuchsia-50 border-fuchsia-200", lane: "schedule_needed" as IntakeLane },
                ]).map(kpi => (
                    <div key={kpi.lane}
                        title="Lane counts are for the current page only"
                        className={`flex items-center gap-3 rounded-xl border ${kpi.color} px-3 py-2.5 text-left flex-1`}>
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${kpi.color.split(" ").slice(1).join(" ")}`}>{kpi.icon}</div>
                        <div className="min-w-0">
                            <p className="text-lg font-black leading-tight">{kpi.value}</p>
                            <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60">{kpi.label}</p>
                            <p className="text-[9px] font-medium opacity-50">{kpi.sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filter Toolbar — lane chips informational (page only); status/search drive the list */}
            <motion.div variants={itemVariants} className="hidden md:flex flex-wrap items-center gap-3">
                <div className="flex gap-1 overflow-x-auto hide-scrollbar bg-slate-100 p-1 rounded-xl" title="Lane distribution on this page only">
                    {LANE_CONFIG.map(lane => (
                        <span key={lane.value}
                            className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap text-slate-600 bg-white/60">
                            {lane.label} {(laneCounts[lane.value] || 0) > 0 && <span className="ml-1 font-black tabular-nums">{laneCounts[lane.value]}</span>}
                        </span>
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
                <span className="text-xs font-medium text-slate-400 tabular-nums shrink-0">{totalFromServer} results</span>
            </motion.div>

            {/* View Area */}
            {/*
              * shrink-0, and no min-h-0.
              *
              * This is a flex column child, so it shrank to whatever height was
              * left (413px) while the table card inside kept its natural 693px.
              * The wrapper does not clip — overflow is visible — so the card
              * spilled 280px past its own box and painted straight over the
              * pagination row below it, which is why "Viewing 1-12 of 283" and
              * the Prev/Next buttons appeared on top of the last table rows.
              * `min-h-0` was what permitted the shrink in the first place.
              *
              * The page itself is the scrolling surface here (the root is
              * md:overflow-auto), so the list should keep its full height and
              * let the root scroll, rather than be squeezed and overflow.
              */}
            <div className="hidden md:block shrink-0 pb-6">
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
                            const deskLane = getLane(request);
                            const deskMuted = deskLane === 'converted_to_job' || deskLane === 'rejected_closed';
                            return (
                                <motion.div layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.04 }} key={request.id}
                                    onClick={() => handleViewDetails(request, index)}
                                    className={cn(
                                        "group relative rounded-2xl border cursor-pointer bc-hover bc-rise",
                                        "border-t-4",
                                        sc.border,
                                        deskMuted ? "bg-slate-50 opacity-75" : cn("bg-white", sc.bg, sc.ring),
                                        !request.adminInteracted && !deskMuted && "ring-1 ring-rose-100 bg-rose-50/30"
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
                                            <div className="flex items-center gap-1">
                                                {deskLane === 'converted_to_job' && <Badge className="h-4 rounded-md border-indigo-200 bg-indigo-50 px-1.5 text-[9px] font-black text-indigo-700 shadow-none">JOB</Badge>}
                                                <Badge className={cn("font-semibold shadow-none border text-[10px] px-1.5 py-0", sc.badge)}>{request.status}</Badge>
                                            </div>
                                        </div>
                                        <h4 className={cn("text-sm font-semibold truncate transition-colors", deskMuted ? "text-slate-500" : "text-slate-800 group-hover:text-blue-600")}><HighlightMatch text={request.customerName} query={srSearchQuery} /></h4>
                                        <p className="text-xs text-slate-500 truncate"><HighlightMatch text={request.brand} query={srSearchQuery} /> {request.screenSize ? formatScreenSize(request.screenSize) : ""} — <HighlightMatch text={request.primaryIssue} query={srSearchQuery} /></p>
                                        <p className="text-[11px] text-slate-400 pt-1">{format(new Date(request.createdAt), 'MMM d, yyyy')}</p>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="relative bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px]">
                        {/*
                          * The page is loading. Say so.
                          *
                          * A moving bar across the top rather than a spinner in the
                          * middle: the old rows stay readable underneath, and the
                          * bar sits where the eye already is after pressing Next.
                          */}
                        {pageChanging && (
                            <div className="absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden bg-blue-100">
                                <div className="h-full w-1/3 animate-[srPageBar_1s_ease-in-out_infinite] rounded-full bg-blue-600" />
                            </div>
                        )}
                        <div
                            className={cn(
                                "overflow-x-auto transition-opacity duration-200",
                                // Faded and inert, so a row cannot be clicked while the
                                // list underneath is about to be replaced.
                                pageChanging && "pointer-events-none opacity-50",
                            )}
                            aria-busy={pageChanging}
                        >
                            <Table className="table-fixed w-full min-w-[800px]">
                                <TableHeader className="bg-slate-50/80 border-b border-slate-100">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="w-[180px] font-semibold text-slate-600 tracking-wide">Ticket</TableHead>
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
                                            const tblLane = getLane(request);
                                            const tblMuted = tblLane === 'converted_to_job' || tblLane === 'rejected_closed';
                                            return (
                                                <TableRow
                                                    key={request.id}
                                                    onClick={() => handleViewDetails(request, index)}
                                                    /*
                                                     * Selectable with the keyboard, and visibly so.
                                                     *
                                                     * The row was a click target with no way to reach or
                                                     * mark it otherwise: nothing showed which request was
                                                     * open, so after the drawer closed there was no trace
                                                     * of where you had been in a list of twelve near
                                                     * identical lines.
                                                     */
                                                    tabIndex={0}
                                                    role="button"
                                                    aria-selected={selectedRequest?.id === request.id}
                                                    onKeyDown={(event) => {
                                                        if (event.key === "Enter" || event.key === " ") {
                                                            event.preventDefault();
                                                            handleViewDetails(request, index);
                                                        }
                                                    }}
                                                    className={cn(
                                                        /*
                                                         * A row highlights; it does not perform.
                                                         *
                                                         * This carried bc-hover and bc-rise, which are card
                                                         * effects: bc-rise lifts and tilts in 3D, which on a
                                                         * <tr> pulls the row out of the table and over its
                                                         * neighbours, and bc-hover sweeps a white gradient
                                                         * across it that washes the text out — the row looked
                                                         * like it was disappearing under the cursor. A table
                                                         * row only has to say "you can click me", so it gets a
                                                         * background tint and a left marker and nothing that
                                                         * moves.
                                                         */
                                                        "cursor-pointer select-none border-b border-slate-100 last:border-0 group",
                                                        "transition-colors duration-150 hover:bg-blue-50",
                                                        /*
                                                         * The left marker is an inset shadow, not a border.
                                                         *
                                                         * A 2px left border on a <tr> takes its width out of
                                                         * the fixed-width Ticket column, and "#SRV-20260809-0007"
                                                         * then wrapped onto three lines the moment the rule was
                                                         * added. A shadow paints inside the row and costs no
                                                         * layout at all.
                                                         */
                                                        "sr-row",
                                                        // Focus ring inset for the same reason: an outline would
                                                        // sit outside the row and nudge its neighbours.
                                                        "outline-none focus-visible:bg-blue-50",
                                                        "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/50",
                                                        // The open row stays marked while the drawer covers it,
                                                        // and still reads as where you were once it closes.
                                                        selectedRequest?.id === request.id &&
                                                            "sr-row-selected bg-blue-50/80 hover:bg-blue-50",
                                                        tblMuted ? "opacity-60" : "",
                                                        !request.adminInteracted && !tblMuted && "bg-rose-50/20"
                                                    )}
                                                >
                                                    <TableCell className="font-mono text-xs font-bold text-slate-500 py-4">
                                                        <div className="flex items-center gap-2">
                                                            {!request.adminInteracted && (
                                                                <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shrink-0" aria-label="Unread service request" />
                                                            )}
                                                            <span className="whitespace-nowrap">#<HighlightMatch text={request.ticketNumber} query={srSearchQuery} /></span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="font-medium text-slate-800 py-4"><HighlightMatch text={request.customerName} query={srSearchQuery} /></TableCell>
                                                    <TableCell className="text-sm text-slate-600 py-4"><HighlightMatch text={request.brand} query={srSearchQuery} /> {request.screenSize ? formatScreenSize(request.screenSize) : ""}</TableCell>
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
            {totalPages > 1 && (
                <div className="hidden md:flex items-center justify-between px-2 pt-2 pb-6">
                    <div className="text-sm text-slate-500">
                        {pageChanging
                            ? `Loading page ${srPage} of ${totalPages}…`
                            : `Viewing ${((srPage - 1) * srPageSize) + 1}-${Math.min(srPage * srPageSize, totalFromServer)} of ${totalFromServer}`}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={srPage === 1 || pageChanging} onClick={() => setSrPage(p => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4 mr-1" /> Prev</Button>
                        <Button variant="outline" size="sm" disabled={srPage === totalPages || pageChanging} onClick={() => setSrPage(p => Math.min(totalPages, p + 1))}>{pageChanging ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Next <ChevronRight className="h-4 w-4 ml-1" /></>}</Button>
                    </div>
                </div>
            )}

            {createPortal(
                <AnimatePresence>
                    {isMobile && selectedRequest && (
                        <div className="fixed inset-0 z-50 md:hidden">
                            <motion.div
                                key="mobile-sr-backdrop"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
                                onClick={handleCloseDialog}
                            />
                            <MobileBottomSheetFrame
                                key="mobile-sr-detail"
                                onClose={handleCloseDialog}
                                className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-[2rem] border-t border-slate-200 bg-white shadow-2xl"
                            >
                                <div className="flex-none px-4 pb-3 pt-3">
                                    <MobileBottomSheetHandle />
                                    <div className="mt-3 flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate font-mono text-xs font-black text-slate-400">#{selectedRequest.ticketNumber}</span>
                                                <Badge className={cn("shrink-0 border px-1.5 py-0 text-[9px] font-black shadow-none", statusCardColors[selectedRequest.status]?.badge)}>{selectedRequest.status}</Badge>
                                            </div>
                                            <h2 className="mt-1 truncate text-lg font-black text-slate-950">{selectedRequest.customerName}</h2>
                                            <p className="truncate text-xs font-semibold text-slate-500">{selectedRequest.phone || "No phone"} · {selectedRequest.servicePreference === "pickup" || selectedRequest.servicePreference === "home_pickup" ? "Pickup" : "Service center"}</p>
                                        </div>
                                        <button type="button" onClick={handleCloseDialog} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                                            <X className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>

                                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 space-y-2">
                                    {/* Intake lane + call summary */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {(() => {
                                            const lane = getLane(selectedRequest);
                                            const laneConf = LANE_CONFIG.find(l => l.value === lane);
                                            return laneConf ? <Badge className="rounded-full border border-blue-200 bg-blue-50 text-blue-800 text-[10px] font-black shadow-none px-2 py-0">{laneConf.label}</Badge> : null;
                                        })()}
                                        {repairCase?.intake?.callSummary?.callAttemptCount > 0 && (
                                            <span className="text-[10px] font-bold text-slate-500">{repairCase.intake.callSummary.callAttemptCount} call{repairCase.intake.callSummary.callAttemptCount > 1 ? 's' : ''}{repairCase.intake.callSummary.lastCallOutcome ? ` · ${repairCase.intake.callSummary.lastCallOutcome.replace(/_/g, ' ')}` : ''}</span>
                                        )}
                                        {/*
                                          * A phone icon must dial the phone.
                                          *
                                          * This button carried a handset and opened a
                                          * five-field form instead, which is what
                                          * anybody reaching for it actually wants least:
                                          * the customer is on the other end of a number,
                                          * not of a questionnaire. Dialling is now the
                                          * button; logging is the small optional one
                                          * beside it, for the times somebody wants a
                                          * record afterwards.
                                          *
                                          * An <a href="tel:"> rather than a scripted
                                          * location change, so Android hands it to the
                                          * dialler the way every other link on the phone
                                          * behaves.
                                          */}
                                        <div className="ml-auto flex items-center gap-1.5">
                                            {normalizeTel(selectedRequest?.phone) && (
                                                <a
                                                    href={`tel:${normalizeTel(selectedRequest?.phone)}`}
                                                    className="inline-flex h-7 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-[10px] font-bold text-white shadow-sm active:scale-[0.97]"
                                                >
                                                    <Phone className="h-3 w-3" /> Call
                                                </a>
                                            )}
                                            {canLogCall && (
                                                <Button variant="ghost" size="sm" className="h-7 rounded-lg px-2 text-[10px] font-bold text-slate-500" onClick={() => setShowCallLogDialog(true)}>
                                                    Log
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    {repairCase?.intake?.needsStaffAction && (
                                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                                            ⚡ Staff action needed — {repairCase.intake.lane.replace(/_/g, ' ')}
                                        </div>
                                    )}
                                    {callAttempts.length > 0 && (
                                        <div className="rounded-xl border border-slate-200 bg-white p-2.5 space-y-1.5">
                                            <p className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1"><Phone className="h-3 w-3" /> Call History ({callAttempts.length})</p>
                                            {callAttempts.slice(0, 4).map((a: any) => (
                                                <div key={a.id} className="flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px]">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="font-bold text-slate-700">{(a.callType || '').replace(/_/g, ' ')}</span>
                                                            {a.outcome && <Badge className="h-4 rounded-full border-0 bg-slate-200 px-1.5 text-[9px] font-bold text-slate-600 shadow-none">{a.outcome.replace(/_/g, ' ')}</Badge>}
                                                            {a.customerMood && a.customerMood !== 'normal' && <Badge className="h-4 rounded-full border-0 bg-amber-100 px-1.5 text-[9px] font-bold text-amber-700 shadow-none">{a.customerMood}</Badge>}
                                                        </div>
                                                        {a.notes && <p className="mt-0.5 text-slate-500 truncate">{a.notes}</p>}
                                                        {a.callbackAt && <p className="text-blue-600 font-semibold">↩ Callback: {new Date(a.callbackAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
                                                    </div>
                                                    <span className="shrink-0 text-[9px] text-slate-400">{a.staffName}</span>
                                                </div>
                                            ))}
                                            {callAttempts.length > 4 && <p className="text-center text-[10px] text-slate-400 font-semibold">+{callAttempts.length - 4} more</p>}
                                        </div>
                                    )}
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                            <div>
                                                <p className="text-[10px] font-black uppercase text-slate-400">Device</p>
                                                <p className="truncate font-black text-slate-900">{selectedRequest.brand || "Unknown"} {formatScreenSize(selectedRequest.screenSize)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black uppercase text-slate-400">Model</p>
                                                <p className="truncate font-bold text-slate-700">{selectedRequest.modelNumber || "-"}</p>
                                            </div>
                                        </div>
                                        <div className="mt-2 border-t border-slate-200 pt-2">
                                            <p className="text-[10px] font-black uppercase text-slate-400">Issue</p>
                                            <p className="text-sm font-bold text-slate-800">{selectedRequest.primaryIssue || "No issue noted"}</p>
                                            {selectedRequest.description && <p className="mt-1 line-clamp-3 text-xs font-medium text-slate-500">{selectedRequest.description}</p>}
                                        </div>
                                    </div>

                                    {getSymptoms(selectedRequest.symptoms).length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-white p-3">
                                            {getSymptoms(selectedRequest.symptoms).map((symptom, index) => (
                                                <Badge key={`${symptom}-${index}`} variant="secondary" className="rounded-lg text-[10px]">{symptom}</Badge>
                                            ))}
                                        </div>
                                    )}

                                    {getMediaUrls(selectedRequest.mediaUrls).length > 0 && (
                                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                                            <div className="mb-2 flex items-center justify-between">
                                                <p className="text-xs font-black uppercase text-slate-500">Media</p>
                                                <span className="text-[10px] font-bold text-slate-400">{getMediaUrls(selectedRequest.mediaUrls).length} files</span>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2">
                                                {getMediaUrls(selectedRequest.mediaUrls).slice(0, 6).map((url, index) => (
                                                    <button key={`${url}-${index}`} type="button" className="relative h-20 overflow-hidden rounded-xl border border-slate-200 bg-slate-100" onClick={() => { setCurrentMediaUrls(getMediaUrls(selectedRequest.mediaUrls)); setMediaViewerIndex(index); setMediaViewerOpen(true); }}>
                                                        {isImage(url) ? <img src={url} alt="" className="h-full w-full object-cover" /> : <Film className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-slate-400" />}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {sr && mobileWizardAction && (
                                        <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-3 shadow-sm">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-black uppercase tracking-wide text-blue-600">Wizard next step</p>
                                                    <h3 className="mt-1 text-base font-black leading-tight text-slate-950">{mobileWizardAction.title}</h3>
                                                    <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{mobileWizardAction.body}</p>
                                                </div>
                                                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl", mobileWizardAction.tone === "emerald" ? "bg-emerald-100 text-emerald-700" : mobileWizardAction.tone === "amber" ? "bg-amber-100 text-amber-700" : mobileWizardAction.tone === "violet" ? "bg-violet-100 text-violet-700" : mobileWizardAction.tone === "slate" ? "bg-slate-100 text-slate-600" : "bg-blue-100 text-blue-700")}>
                                                    {mobileWizardAction.icon}
                                                </span>
                                            </div>
                                            <Button
                                                className={cn("mt-3 h-11 w-full rounded-2xl text-sm font-black", mobileWizardAction.tone === "emerald" ? "bg-emerald-600 hover:bg-emerald-700" : mobileWizardAction.tone === "amber" ? "bg-amber-600 hover:bg-amber-700" : mobileWizardAction.tone === "violet" ? "bg-violet-600 hover:bg-violet-700" : mobileWizardAction.tone === "slate" ? "bg-slate-500 hover:bg-slate-600" : "bg-blue-600 hover:bg-blue-700")}
                                                onClick={mobileWizardAction.onClick}
                                                disabled={mobileWizardAction.disabled}
                                            >
                                                {mobileWizardAction.label}
                                            </Button>
                                        </div>
                                    )}

                                    {sr && (
                                        <div className="rounded-2xl border border-slate-200 bg-white p-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-xs font-black uppercase text-slate-500">Case state</p>
                                                {(selectedRequest.paymentStatus || "Due").toLowerCase() === "paid" ? <Badge className="bg-green-100 text-green-700">Paid</Badge> : <Badge variant="outline" className="bg-amber-50 text-amber-700">Due</Badge>}
                                            </div>
                                            <div className="mt-2 rounded-2xl bg-slate-950 p-3 text-white">
                                                <p className="text-[10px] font-black uppercase tracking-wide text-white/55">Universal flow</p>
                                                <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[10px] font-black">
                                                    {["Request", "Custody", "Repair", "Return"].map((step) => {
                                                        const active = getJourneyGroup(selectedRequest.stage || "intake") === step;
                                                        return (
                                                            <span key={step} className={cn("rounded-lg px-1.5 py-1.5", active ? "bg-white text-slate-950" : "bg-white/10 text-white/65")}>
                                                                {step}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div className="mt-2 grid grid-cols-3 gap-1.5">
                                                <div className="rounded-xl bg-slate-50 p-2">
                                                    <p className="text-[9px] font-black uppercase text-slate-400">Stage</p>
                                                    <p className="truncate text-[11px] font-black text-slate-800">{formatStageName(selectedRequest.stage || "intake")}</p>
                                                </div>
                                                <div className="rounded-xl bg-slate-50 p-2">
                                                    <p className="text-[9px] font-black uppercase text-slate-400">Internal</p>
                                                    <p className="truncate text-[11px] font-black text-slate-800">{selectedRequest.status}</p>
                                                </div>
                                                <div className="rounded-xl bg-slate-50 p-2">
                                                    <p className="text-[9px] font-black uppercase text-slate-400">Mode</p>
                                                    <p className="truncate text-[11px] font-black text-slate-800">{selectedIsPickup ? "Pickup" : "Center"}</p>
                                                </div>
                                            </div>
                                            {nextStagesData?.stageFlow && (
                                                <div className="mt-2 flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                                                    {nextStagesData.stageFlow.map((stage: string) => {
                                                        const currentIndex = nextStagesData.stageFlow.indexOf(sr.stage || "intake");
                                                        const stageIndex = nextStagesData.stageFlow.indexOf(stage);
                                                        return <span key={stage} className={cn("whitespace-nowrap rounded-lg px-2 py-1 text-[10px] font-black", stageIndex === currentIndex ? "bg-blue-600 text-white" : stageIndex < currentIndex ? "bg-emerald-100 text-emerald-700" : "bg-slate-50 text-slate-500")}>{formatStageName(stage)}</span>;
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="flex-none border-t border-slate-100 bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                                    <div className="grid grid-cols-3 gap-2">
                                        <Button variant="outline" size="sm" className="h-10 rounded-xl text-xs font-black" disabled={!normalizeTel(selectedRequest.phone)} onClick={() => { const tel = normalizeTel(selectedRequest.phone); if (tel) window.location.href = `tel:${tel}`; }}>
                                            Call
                                        </Button>
                                        <Button variant="outline" size="sm" className="h-10 rounded-xl text-xs font-black" onClick={() => { setLocation(selectedRequest.convertedJobId ? buildNavigateAdminTabPath("jobs", { search: selectedRequest.convertedJobId }) : buildNavigateAdminTabPath("pickup")); }}>
                                            Open
                                        </Button>
                                        <Button variant="outline" size="sm" className="h-10 rounded-xl text-xs font-black" onClick={() => setShowMobileMoreActions(true)}>
                                            More
                                        </Button>
                                    </div>
                                </div>
                            </MobileBottomSheetFrame>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* ========== POPUP DETAIL VIEW ========== */}
            {createPortal(
                <AnimatePresence>
                    {selectedRequest && !isMobile && (
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

                                    {/* Intake Lane + Call Summary */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {(() => {
                                            const lane = getLane(selectedRequest);
                                            const laneConf = LANE_CONFIG.find(l => l.value === lane);
                                            return laneConf ? <Badge className="rounded-full border border-blue-200 bg-blue-50 text-blue-800 text-[10px] font-black shadow-none px-2 py-0">{laneConf.label}</Badge> : null;
                                        })()}
                                        {repairCase?.intake?.callSummary?.callAttemptCount > 0 && (
                                            <span className="text-xs text-slate-500">{repairCase.intake.callSummary.callAttemptCount} call{repairCase.intake.callSummary.callAttemptCount > 1 ? 's' : ''}{repairCase.intake.callSummary.lastCallOutcome ? ` · ${repairCase.intake.callSummary.lastCallOutcome.replace(/_/g, ' ')}` : ''}</span>
                                        )}
                                        {canLogCall && (
                                            <Button variant="outline" size="sm" className="ml-auto h-7 rounded-lg text-xs font-bold gap-1" onClick={() => setShowCallLogDialog(true)}>
                                                <Phone className="h-3 w-3" /> Log Call
                                            </Button>
                                        )}
                                    </div>
                                    {repairCase?.intake?.needsStaffAction && (
                                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                                            ⚡ Staff action needed — {repairCase.intake.lane.replace(/_/g, ' ')}
                                        </div>
                                    )}
                                    {callAttempts.length > 0 && (
                                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
                                            <p className="text-xs font-bold text-slate-500 flex items-center gap-1"><Phone className="h-3 w-3" /> Call History ({callAttempts.length})</p>
                                            {callAttempts.slice(0, 4).map((a: any) => (
                                                <div key={a.id} className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-xs border border-slate-100">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span className="font-bold text-slate-700">{(a.callType || '').replace(/_/g, ' ')}</span>
                                                            {a.outcome && <Badge className="h-4 rounded-full border-0 bg-slate-200 px-1.5 text-[9px] font-bold text-slate-600 shadow-none">{a.outcome.replace(/_/g, ' ')}</Badge>}
                                                            {a.customerMood && a.customerMood !== 'normal' && <Badge className="h-4 rounded-full border-0 bg-amber-100 px-1.5 text-[9px] font-bold text-amber-700 shadow-none">{a.customerMood}</Badge>}
                                                        </div>
                                                        {a.notes && <p className="mt-0.5 text-slate-500">{a.notes}</p>}
                                                        {a.callbackAt && <p className="text-blue-600 font-semibold">↩ Callback: {new Date(a.callbackAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
                                                    </div>
                                                    <span className="shrink-0 text-[10px] text-slate-400">{a.staffName}</span>
                                                </div>
                                            ))}
                                            {callAttempts.length > 4 && <p className="text-center text-xs text-slate-400 font-semibold">+{callAttempts.length - 4} more</p>}
                                        </div>
                                    )}

                                    {/* Customer Info */}
                                    <div className="border-t pt-4">
                                        <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm"><Phone className="w-4 h-4" /> Customer</h3>
                                        <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl text-sm">
                                            <div><Label className="text-muted-foreground text-xs">Name</Label><p className="font-medium">{selectedRequest.customerName}</p></div>
                                            <div><Label className="text-muted-foreground text-xs">Phone</Label><p className="font-medium">{selectedRequest.phone}</p></div>
                                            {selectedRequest.address && <div className="col-span-2"><Label className="text-muted-foreground text-xs flex items-center gap-1"><MapPin className="w-3 h-3" /> Address</Label><p>{selectedRequest.address}</p></div>}
                                            {/* PICKUP-MAP-PIN-01 — deep link opens the exact pin in the rider's map app. */}
                                            {selectedRequest.pickupLatitude != null && selectedRequest.pickupLongitude != null && (
                                                <div className="col-span-2">
                                                    <Label className="text-muted-foreground text-xs flex items-center gap-1"><MapPin className="w-3 h-3" /> Pickup pin</Label>
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="font-mono text-xs">{selectedRequest.pickupLatitude.toFixed(6)}, {selectedRequest.pickupLongitude.toFixed(6)}</p>
                                                        {selectedRequest.pickupLocationSource && (
                                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                                                {selectedRequest.pickupLocationSource === "gps" ? "GPS" : selectedRequest.pickupLocationSource === "map_pin" ? "Map pin" : "Typed"}
                                                            </span>
                                                        )}
                                                        <a
                                                            href={`https://www.google.com/maps/search/?api=1&query=${selectedRequest.pickupLatitude},${selectedRequest.pickupLongitude}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                                                        >
                                                            Open in Maps
                                                        </a>
                                                    </div>
                                                </div>
                                            )}
                                            <div><Label className="text-muted-foreground text-xs">Preference</Label><p className="font-medium capitalize">{selectedRequest.servicePreference === "pickup" || selectedRequest.servicePreference === "home_pickup" ? "Pickup & Drop" : "Service Center Visit"}</p></div>
                                        </div>
                                    </div>

                                    {/* Device Info */}
                                    <div className="border-t pt-4">
                                        <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm"><Tv className="w-4 h-4" /> Device</h3>
                                        <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl text-sm">
                                            <div><Label className="text-muted-foreground text-xs">Brand</Label><p className="font-medium">{selectedRequest.brand}</p></div>
                                            <div><Label className="text-muted-foreground text-xs">Size</Label><p className="font-medium">{formatScreenSize(selectedRequest.screenSize) || "-"}</p></div>
                                            <div><Label className="text-muted-foreground text-xs">Model</Label><p className="font-medium">{selectedRequest.modelNumber || "-"}</p></div>
                                        </div>
                                    </div>

                                    {/* Issue Details */}
                                    <div className="border-t pt-4">
                                        <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm"><AlertTriangle className="w-4 h-4" /> Issue</h3>
                                        <div className="space-y-2 bg-slate-50 p-3 rounded-xl text-sm">
                                            <div><Label className="text-muted-foreground text-xs">Primary Issue</Label><p className="font-medium">{selectedRequest.primaryIssue}</p></div>
                                            {getSymptoms(selectedRequest.symptoms).length > 0 && <div><Label className="text-muted-foreground text-xs">Symptoms</Label><div className="flex flex-wrap gap-1.5 mt-1">{getSymptoms(selectedRequest.symptoms).map((s, i) => <Badge key={`symptom-${s}-${i}`} variant="secondary" className="text-xs">{s}</Badge>)}</div></div>}
                                            {selectedRequest.description && <div><Label className="text-muted-foreground text-xs">Description</Label><p className="text-xs text-slate-600">{selectedRequest.description}</p></div>}
                                        </div>
                                    </div>

                                    {/* Media */}
                                    {getMediaUrls(selectedRequest.mediaUrls).length > 0 && (
                                        <div className="border-t pt-4">
                                            <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm"><Image className="w-4 h-4" /> Media</h3>
                                            <div className="grid grid-cols-3 gap-2">
                                                {getMediaUrls(selectedRequest.mediaUrls).map((url, i) => (
                                                    <div key={`media-${url}-${i}`} className="relative rounded-xl overflow-hidden border bg-slate-100 cursor-pointer hover:opacity-90" onClick={() => { setCurrentMediaUrls(getMediaUrls(selectedRequest.mediaUrls)); setMediaViewerIndex(i); setMediaViewerOpen(true); }}>
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
                                                        <Select onValueChange={(v) => handleStageSelect(sr.id, v)} disabled={stageTransitionMutation.isPending || sendCustodyOtpMutation.isPending}>
                                                            <SelectTrigger className="w-full h-8 text-xs rounded-lg"><SelectValue placeholder="Select next stage..." /></SelectTrigger>
                                                            {/*
                                                              * A stage this desk cannot complete is not offered.
                                                              *
                                                              * The custody stages on a pickup request belong to the
                                                              * driver at the customer's door, and the server refuses
                                                              * them here — so listing them only produced a permission
                                                              * error that read like a broken system. The stage still
                                                              * happens; it happens in Pickup & Delivery.
                                                              */}
                                                            <SelectContent>{nextStagesData?.validNextStages
                                                                ?.filter((stage: string) => !getCustodyActionForStage(stage) || serviceDeskMayCollectCustodyCode({
                                                                    serviceMode: sr.serviceMode,
                                                                    stage: sr.stage,
                                                                    convertedJobId: sr.convertedJobId,
                                                                }))
                                                                .map((s: string) => <SelectItem key={s} value={s}>{formatStageName(s)}</SelectItem>)}</SelectContent>
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
                                                {sr.serviceMode && canTransitionStage && (
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
                                                <Suspense fallback={null}><StatusStepper
                                                    steps={INTERNAL_STEPS}
                                                    currentStep={selectedRequest.status}
                                                    disabled={true}
                                                    formatStep={(s) => s}
                                                    stepConfig={ADMIN_STEP_CONFIG}
                                                    terminalState={ADMIN_TERMINAL_STATES.includes(selectedRequest.status as any) ? selectedRequest.status : null}
                                                /></Suspense>
                                                {selectedRequest.convertedJobId && (
                                                    <div className="mt-3 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[10px] text-emerald-700 flex items-center gap-1.5">
                                                        <CheckCircle className="w-3 h-3 shrink-0" />
                                                        Job: <a href={buildNavigateAdminTabPath("jobs", { search: selectedRequest.convertedJobId })} className="font-medium underline">{selectedRequest.convertedJobId}</a>
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
                                                <Suspense fallback={null}><WorkflowStepper
                                                    steps={isServiceCenter ? SC_TRACKING_STEPS : PICKUP_TRACKING_STEPS}
                                                    currentValue={selectedRequest.trackingStatus}
                                                    isBlocked={true} // Read Only
                                                    jobLockedIndex={isServiceCenter ? SC_JOB_LOCK_INDEX : PICKUP_JOB_LOCK_INDEX}
                                                    isJobCreated={selectedRequest.status === "Work Order" || !!selectedRequest.convertedJobId}
                                                    stepDetailConfig={isServiceCenter ? SC_STEP_CONFIG : PICKUP_STEP_CONFIG}
                                                    canRollback={false}
                                                /></Suspense>
                                            </div>

                                            {/* Payment */}
                                            <div>
                                                <Label className="text-xs font-semibold text-slate-700 mb-1.5 block">Payment</Label>
                                                <div className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border">
                                                    {(selectedRequest.paymentStatus || "Due") === "Paid" ? <Badge className="bg-green-100 text-green-700 border-green-200 text-xs"><CheckCircle className="w-3 h-3 mr-1" />Paid</Badge> : <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs"><Clock className="w-3 h-3 mr-1" />Due</Badge>}
                                                    <p className="text-[10px] text-muted-foreground">{selectedRequest.convertedJobId ? <a href={buildNavigateAdminTabPath("pos", { search: selectedRequest.convertedJobId })} className="text-primary underline">View POS invoice</a> : "Auto-updates from Job invoice"}</p>
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
                                        {canTransitionStage && getContextualActions(selectedRequest.status, selectedRequest.serviceMode || "service_center", "Admin", selectedRequest.quoteStatus).map((action) => (
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

                                        {canSendQuote && selectedRequest.isQuote && (!selectedRequest.quoteStatus || selectedRequest.quoteStatus === "Pending") && (
                                            <Button size="sm" className="rounded-xl bg-amber-600 hover:bg-amber-700" onClick={() => { setQuoteAmount(selectedRequest.quoteAmount?.toString() || ""); setQuoteNotes(selectedRequest.quoteNotes || ""); setShowQuotePriceDialog(true); }}><Send className="w-3.5 h-3.5 mr-1.5" />Send Quote</Button>
                                        )}
                                        {canVerifyAndConvert && !selectedRequest.convertedJobId && ["picked_up", "device_received"].includes(selectedRequest.stage || "") && (
                                            <Button size="sm" className="rounded-xl bg-green-600 hover:bg-green-700" onClick={() => { setRequestToVerify(selectedRequest); setVerificationNotes(selectedRequest.description || ""); setShowVerifyDialog(true); }}><CheckCircle className="w-3.5 h-3.5 mr-1.5" />Create Job</Button>
                                        )}
                                        {canTransitionStage && (selectedRequest.servicePreference === "pickup" || selectedRequest.servicePreference === "home_pickup" || selectedRequest.serviceMode === "pickup") && (
                                            <Button size="sm" variant="outline" className="rounded-xl border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => transferToPickupMutation.mutate(selectedRequest.id)} disabled={transferToPickupMutation.isPending}>
                                                {transferToPickupMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Truck className="w-3.5 h-3.5 mr-1.5" />}
                                                Transfer to Pickup & Delivery
                                            </Button>
                                        )}
                                    </div>
                                    {canDeleteServiceRequest && (
                                        <div className="flex gap-2 pl-4 border-l ml-2">
                                            <Button variant="destructive" size="sm" className="rounded-xl" onClick={() => { setRequestToDelete(selectedRequest); setShowDeleteDialog(true); handleCloseDialog(); }}><Trash2 className="w-3.5 h-3.5 mr-1.5" />Delete</Button>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* ========== DIALOGS ========== */}
            {createPortal(
                <AnimatePresence>
                    {isMobile && showMobileMoreActions && selectedRequest && (
                        <div className="fixed inset-0 z-[70] md:hidden">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={() => setShowMobileMoreActions(false)} />
                            <MobileBottomSheetFrame onClose={() => setShowMobileMoreActions(false)} className="absolute inset-x-0 bottom-0 rounded-t-[2rem] bg-white p-4 shadow-2xl">
                                <MobileBottomSheetHandle />
                                <div className="mt-4">
                                    <h3 className="text-lg font-black text-slate-950">More Actions</h3>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">Manual controls for #{selectedRequest.ticketNumber}</p>
                                </div>
                                <div className="mt-4 space-y-2">
                                    <button
                                        type="button"
                                        className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-left"
                                        onClick={() => {
                                            setShowMobileMoreActions(false);
                                            setLocation(selectedRequest.convertedJobId ? buildNavigateAdminTabPath("jobs", { search: selectedRequest.convertedJobId }) : buildNavigateAdminTabPath("pickup"));
                                        }}
                                    >
                                        <span>
                                            <span className="block text-sm font-black text-slate-900">{selectedRequest.convertedJobId ? "Open linked job" : "Open Pickup & Delivery"}</span>
                                            <span className="block text-xs font-semibold text-slate-500">Jump to the connected workspace</span>
                                        </span>
                                        <ChevronRight className="h-4 w-4 text-slate-400" />
                                    </button>

                                    {/* "Transfer to Pickup & Delivery" is deliberately NOT
                                        here any more. It is a step in the case's forward
                                        flow, not a manual override, so it belongs in the
                                        wizard action at the top of the sheet where the
                                        next step always lives. Offering it in both places
                                        meant the same request could be transferred from
                                        two screens, with different feedback each time and
                                        no indication afterwards that it had happened. */}

                                    {canTransitionStage && selectedRequest.status !== "New" && !isClosedState && (
                                        <button
                                            type="button"
                                            className="flex w-full items-center justify-between rounded-2xl border border-amber-100 bg-amber-50 px-3 py-3 text-left"
                                            onClick={() => {
                                                setRollbackTarget("");
                                                setShowMobileMoreActions(false);
                                                setShowRollbackDialog(true);
                                            }}
                                        >
                                            <span>
                                                <span className="block text-sm font-black text-amber-900">Adjust progress</span>
                                                <span className="block text-xs font-semibold text-amber-700">Audited correction only</span>
                                            </span>
                                            <Undo2 className="h-4 w-4 text-amber-600" />
                                        </button>
                                    )}

                                    {canDeleteServiceRequest && (
                                        <button
                                            type="button"
                                            className="flex w-full items-center justify-between rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-left"
                                            onClick={() => {
                                                setRequestToDelete(selectedRequest);
                                                setShowMobileMoreActions(false);
                                                setShowDeleteDialog(true);
                                                handleCloseDialog();
                                            }}
                                        >
                                            <span>
                                                <span className="block text-sm font-black text-rose-900">Delete request</span>
                                                <span className="block text-xs font-semibold text-rose-600">Permanent action, confirmation required</span>
                                            </span>
                                            <Trash2 className="h-4 w-4 text-rose-600" />
                                        </button>
                                    )}
                                </div>
                                <Button variant="outline" className="mt-4 h-11 w-full rounded-2xl font-black" onClick={() => setShowMobileMoreActions(false)}>
                                    Close
                                </Button>
                            </MobileBottomSheetFrame>
                        </div>
                    )}

                    {isMobile && showDeleteDialog && requestToDelete && (
                        <div className="fixed inset-0 z-[60] md:hidden">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={() => setShowDeleteDialog(false)} />
                            <MobileBottomSheetFrame onClose={() => setShowDeleteDialog(false)} className="absolute inset-x-0 bottom-0 rounded-t-[2rem] bg-white p-4 shadow-2xl">
                                <MobileBottomSheetHandle />
                                <h3 className="mt-4 text-lg font-black text-slate-950">Delete Service Request?</h3>
                                <p className="mt-2 text-sm font-medium text-slate-500">This will permanently delete #{requestToDelete.ticketNumber}. This action cannot be undone.</p>
                                <div className="mt-5 grid grid-cols-2 gap-2 pb-[env(safe-area-inset-bottom)]">
                                    <Button variant="outline" className="h-11 rounded-xl" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
                                    <Button variant="destructive" className="h-11 rounded-xl" onClick={() => deleteMutation.mutate(requestToDelete.id)} disabled={deleteMutation.isPending}>
                                        {deleteMutation.isPending ? "Deleting..." : "Delete"}
                                    </Button>
                                </div>
                            </MobileBottomSheetFrame>
                        </div>
                    )}

                    {isMobile && showStatusConfirmDialog && pendingStatusChange && (
                        <div className="fixed inset-0 z-[60] md:hidden">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={() => { setShowStatusConfirmDialog(false); setPendingStatusChange(null); }} />
                            <MobileBottomSheetFrame onClose={() => { setShowStatusConfirmDialog(false); setPendingStatusChange(null); }} className="absolute inset-x-0 bottom-0 rounded-t-[2rem] bg-white p-4 shadow-2xl">
                                <MobileBottomSheetHandle />
                                {(() => {
                                    const warning = getStatusChangeWarning(pendingStatusChange.type, selectedRequest?.status || "", pendingStatusChange.newValue);
                                    return (
                                        <>
                                            <h3 className="mt-4 flex items-center gap-2 text-lg font-black text-slate-950"><AlertTriangle className="h-5 w-5 text-amber-500" />{warning.title}</h3>
                                            <div className="mt-3 flex items-center justify-center gap-3 rounded-2xl bg-slate-50 p-3">
                                                <Badge variant="outline">{selectedRequest?.status || "-"}</Badge>
                                                <ArrowRightCircle className="h-5 w-5 text-slate-400" />
                                                <Badge className="bg-blue-600 text-white">{pendingStatusChange.newValue}</Badge>
                                            </div>
                                            <div className={cn("mt-3 rounded-xl border p-3 text-xs font-bold", warning.color)}>{warning.warning}</div>
                                            <div className="mt-5 grid grid-cols-2 gap-2 pb-[env(safe-area-inset-bottom)]">
                                                <Button variant="outline" className="h-11 rounded-xl" onClick={() => { setShowStatusConfirmDialog(false); setPendingStatusChange(null); }}>Cancel</Button>
                                                <Button className="h-11 rounded-xl bg-slate-900 text-white" onClick={confirmStatusChange}>Confirm</Button>
                                            </div>
                                        </>
                                    );
                                })()}
                            </MobileBottomSheetFrame>
                        </div>
                    )}

                    {/* Driver chooser — a list of people, not a <Select>. One tap
                        per driver, same sheet on mobile and desktop so the two
                        views cannot drift apart again. */}
                    {driverPicker && (
                        <div className="fixed inset-0 z-[75] flex items-end justify-center md:items-center md:p-6">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
                                onClick={() => setDriverPicker(null)}
                            />
                            <motion.div
                                initial={{ opacity: 0, y: 24 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 24 }}
                                className="relative w-full max-w-md rounded-t-[2rem] bg-white p-4 shadow-2xl md:rounded-3xl md:p-6"
                            >
                                <div className="md:hidden"><MobileBottomSheetHandle /></div>
                                <div className="mt-3 md:mt-0">
                                    <h3 className="text-lg font-black text-slate-950">Who is collecting this?</h3>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">
                                        {driverPicker.ticketNumber ? `Request #${driverPicker.ticketNumber} is` : "This request is"} in Pickup &amp; Delivery and needs a driver.
                                    </p>
                                </div>

                                <div className="mt-4 max-h-[45vh] space-y-2 overflow-y-auto">
                                    {driversLoading && (
                                        <div className="flex items-center justify-center py-8">
                                            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                                        </div>
                                    )}
                                    {!driversLoading && availableDrivers.length === 0 && (
                                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
                                            <p className="text-sm font-bold text-amber-900">No drivers available</p>
                                            <p className="mt-1 text-xs font-semibold text-amber-700">
                                                Add a user with the Driver role, then assign from Pickup &amp; Delivery.
                                            </p>
                                        </div>
                                    )}
                                    {!driversLoading && availableDrivers.map((driver) => (
                                        <button
                                            key={driver.id}
                                            type="button"
                                            disabled={assignDriverMutation.isPending}
                                            onClick={() => assignDriverMutation.mutate({
                                                taskId: driverPicker.taskId,
                                                driver: { id: driver.id, name: driver.name },
                                            })}
                                            className="flex min-h-[56px] w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors active:bg-slate-50 disabled:opacity-60 md:hover:border-blue-300 md:hover:bg-blue-50/50"
                                        >
                                            <span className="flex items-center gap-3">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-black text-blue-700">
                                                    {driver.name.charAt(0).toUpperCase()}
                                                </span>
                                                <span>
                                                    <span className="block text-sm font-black text-slate-900">{driver.name}</span>
                                                    <span className="block text-xs font-semibold text-slate-500">{driver.role}</span>
                                                </span>
                                            </span>
                                            {assignDriverMutation.isPending
                                                ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                                                : <ChevronRight className="h-4 w-4 text-slate-300" />}
                                        </button>
                                    ))}
                                </div>

                                <div className="mt-4 flex flex-col gap-2">
                                    {/* Leaving it unassigned is legitimate — the pickup desk may
                                        want to plan a route first — but it must be a choice, not
                                        the silent default it used to be. */}
                                    <Button
                                        variant="outline"
                                        className="h-11 rounded-xl"
                                        onClick={() => setDriverPicker(null)}
                                    >
                                        Decide later in Pickup &amp; Delivery
                                    </Button>
                                </div>
                            </motion.div>
                        </div>
                    )}

                    {isMobile && custodyOtp && (
                        <div className="fixed inset-0 z-[60] md:hidden">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={() => { setCustodyOtp(null); setCustodyOtpCode(""); }} />
                            <MobileBottomSheetFrame onClose={() => { setCustodyOtp(null); setCustodyOtpCode(""); }} className="absolute inset-x-0 bottom-0 rounded-t-[2rem] bg-white p-4 shadow-2xl">
                                <MobileBottomSheetHandle />
                                <h3 className="mt-4 text-lg font-black text-slate-950">Customer OTP Required</h3>
                                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm">
                                    <div className="flex justify-between"><span className="font-bold text-slate-400">Stage</span><span className="font-black text-slate-800">{formatStageName(custodyOtp.targetStage || "")}</span></div>
                                    <div className="mt-1 text-[11px] font-semibold text-slate-500">Ask the customer to open My Repairs and read you the code.</div>
                                </div>
                                <Input value={custodyOtpCode} onChange={(event) => setCustodyOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" className="mt-3 h-12 rounded-2xl text-center text-lg font-black tracking-[0.35em]" />
                                <div className="mt-5 grid grid-cols-2 gap-2 pb-[env(safe-area-inset-bottom)]">
                                    <Button variant="outline" className="h-11 rounded-xl" onClick={() => { setCustodyOtp(null); setCustodyOtpCode(""); }}>Cancel</Button>
                                    <Button className="h-11 rounded-xl" onClick={() => confirmCustodyOtpMutation.mutate({ id: custodyOtp.requestId, action: custodyOtp.action, code: custodyOtpCode })} disabled={!custodyOtpCode.trim() || confirmCustodyOtpMutation.isPending}>
                                        {confirmCustodyOtpMutation.isPending ? "Confirming..." : "Confirm"}
                                    </Button>
                                </div>
                            </MobileBottomSheetFrame>
                        </div>
                    )}

                    {isMobile && showQuotePriceDialog && selectedRequest && (
                        <div className="fixed inset-0 z-[60] md:hidden">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={() => setShowQuotePriceDialog(false)} />
                            <MobileBottomSheetFrame onClose={() => setShowQuotePriceDialog(false)} className="absolute inset-x-0 bottom-0 flex max-h-[86dvh] flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl">
                                <div className="flex-none p-4 pb-3">
                                    <MobileBottomSheetHandle />
                                    <h3 className="mt-4 text-lg font-black text-slate-950">Send Quote Price</h3>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">#{selectedRequest.ticketNumber} · {selectedRequest.customerName}</p>
                                </div>
                                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 space-y-3">
                                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">Customer must approve before job creation.</div>
                                    {getShownEstimate(selectedRequest.symptoms) && (
                                        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3">
                                            <p className="text-[10px] font-black uppercase tracking-wider text-sky-700">What the customer was already shown</p>
                                            <p className="mt-1 text-xs font-bold text-sky-900">{getShownEstimate(selectedRequest.symptoms)}</p>
                                            <p className="mt-1 text-[10px] font-semibold text-sky-700/80">Website estimate, made before anyone saw the TV. If your quote differs, say why in the notes.</p>
                                        </div>
                                    )}
                                    <div>
                                        <Label>Amount ({getCurrencySymbol()}) *</Label>
                                        <div className="relative mt-1">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{getCurrencySymbol()}</span>
                                            <Input type="number" value={quoteAmount} onChange={(event) => setQuoteAmount(event.target.value)} className="h-11 rounded-xl pl-8" />
                                        </div>
                                    </div>
                                    <div>
                                        <Label>Notes</Label>
                                        <Textarea value={quoteNotes} onChange={(event) => setQuoteNotes(event.target.value)} className="mt-1 min-h-24 rounded-xl" placeholder="Parts, service, warranty..." />
                                    </div>
                                </div>
                                <div className="grid flex-none grid-cols-2 gap-2 border-t border-slate-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                                    <Button variant="outline" className="h-11 rounded-xl" onClick={() => setShowQuotePriceDialog(false)}>Cancel</Button>
                                    <Button className="h-11 rounded-xl bg-amber-600 hover:bg-amber-700" onClick={() => quoteAmount && quotePriceMutation.mutate({ id: selectedRequest.id, quoteAmount: parseFloat(quoteAmount), quoteNotes: quoteNotes || undefined })} disabled={!quoteAmount || quotePriceMutation.isPending}>{quotePriceMutation.isPending ? "Sending..." : "Send Quote"}</Button>
                                </div>
                            </MobileBottomSheetFrame>
                        </div>
                    )}

                    {isMobile && showVerifyDialog && requestToVerify && (
                        <div className="fixed inset-0 z-[60] md:hidden">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={() => setShowVerifyDialog(false)} />
                            <MobileBottomSheetFrame onClose={() => setShowVerifyDialog(false)} className="absolute inset-x-0 bottom-0 flex max-h-[86dvh] flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl">
                                <div className="flex-none p-4 pb-3">
                                    <MobileBottomSheetHandle />
                                    <h3 className="mt-4 text-lg font-black text-slate-950">Confirm Device & Create Job</h3>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">#{requestToVerify.ticketNumber} · {requestToVerify.brand} {formatScreenSize(requestToVerify.screenSize)}</p>
                                </div>
                                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 space-y-3">
                                    <div className="grid grid-cols-4 gap-1">
                                        {["Low", "Medium", "High", "Urgent"].map((item) => (
                                            <button key={item} type="button" onClick={() => setPriority(item)} className={cn("h-9 rounded-xl border text-[11px] font-black", priority === item ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600")}>{item}</button>
                                        ))}
                                    </div>
                                    <Textarea value={verificationNotes} onChange={(event) => setVerificationNotes(event.target.value)} className="min-h-28 rounded-xl" placeholder="Verification notes..." />
                                </div>
                                <div className="grid flex-none grid-cols-2 gap-2 border-t border-slate-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                                    <Button variant="outline" className="h-11 rounded-xl" onClick={() => setShowVerifyDialog(false)}>Cancel</Button>
                                    <Button className="h-11 rounded-xl bg-green-600 hover:bg-green-700" onClick={() => verifyMutation.mutate({ id: requestToVerify.id, verificationNotes, priority })} disabled={verifyMutation.isPending}>{verifyMutation.isPending ? "Creating..." : "Create Job"}</Button>
                                </div>
                            </MobileBottomSheetFrame>
                        </div>
                    )}

                    {isMobile && showRollbackDialog && selectedRequest && (
                        <div className="fixed inset-0 z-[60] md:hidden">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={() => setShowRollbackDialog(false)} />
                            <MobileBottomSheetFrame onClose={() => setShowRollbackDialog(false)} className="absolute inset-x-0 bottom-0 flex max-h-[86dvh] flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl">
                                <div className="flex-none p-4 pb-3">
                                    <MobileBottomSheetHandle />
                                    <h3 className="mt-4 text-lg font-black text-slate-950">Adjust Progress</h3>
                                    <p className="mt-1 text-xs font-semibold text-amber-700">Audited change for #{selectedRequest.ticketNumber}</p>
                                </div>
                                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3 space-y-3">
                                    <Select value={rollbackTarget} onValueChange={setRollbackTarget}>
                                        <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Select target stage" /></SelectTrigger>
                                        <SelectContent>
                                            {INTERNAL_STEPS.slice(0, INTERNAL_STEPS.indexOf(selectedRequest.status as any)).map(step => <SelectItem key={step} value={step}>{step}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Textarea value={rollbackReason} onChange={(event) => setRollbackReason(event.target.value)} className="min-h-28 rounded-xl" placeholder="Reason for adjustment..." />
                                </div>
                                <div className="grid flex-none grid-cols-2 gap-2 border-t border-slate-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                                    <Button variant="outline" className="h-11 rounded-xl" onClick={() => setShowRollbackDialog(false)}>Cancel</Button>
                                    <Button className="h-11 rounded-xl bg-amber-500 hover:bg-amber-600" onClick={() => {
                                        if (rollbackTarget && rollbackReason.trim()) adjustProgressMutation.mutate({ id: selectedRequest.id, targetStatus: rollbackTarget, reason: rollbackReason });
                                        else toast.error("Please select a target stage and provide a reason");
                                    }} disabled={!rollbackTarget || !rollbackReason.trim() || adjustProgressMutation.isPending}>{adjustProgressMutation.isPending ? "Adjusting..." : "Adjust"}</Button>
                                </div>
                            </MobileBottomSheetFrame>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Delete */}
            <AlertDialog open={showDeleteDialog && !isMobile} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent className="rounded-2xl">
                    <AlertDialogHeader><AlertDialogTitle>Delete Service Request?</AlertDialogTitle><AlertDialogDescription>This will permanently delete #{requestToDelete?.ticketNumber}. Cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel><AlertDialogAction onClick={() => requestToDelete && deleteMutation.mutate(requestToDelete.id)} className="bg-red-600 hover:bg-red-700 rounded-xl">{deleteMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Deleting...</> : 'Delete'}</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Status Confirm — Enterprise Warning Dialog */}
            <Dialog open={showStatusConfirmDialog && !isMobile} onOpenChange={(open) => { if (!open) { setShowStatusConfirmDialog(false); setPendingStatusChange(null); } }}>
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
                                            <div key={`effect-${effect}-${i}`} className="flex items-start gap-2 text-xs text-slate-600">
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

            <Dialog open={!!custodyOtp && !isMobile} onOpenChange={(open) => { if (!open) { setCustodyOtp(null); setCustodyOtpCode(""); } }}>
                <DialogContent className="sm:max-w-[425px] rounded-2xl">
                    <DialogHeader>
                        <DialogTitle>Customer OTP Required</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-2">
                        <div className="bg-muted/50 p-3 rounded-xl space-y-1.5 text-sm">
                            <div className="flex justify-between"><span className="text-muted-foreground">Stage:</span><span className="font-medium">{formatStageName(custodyOtp?.targetStage || "")}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Phone:</span><span>{selectedRequest?.phone}</span></div>
                        </div>
                        <div className="grid gap-2">
                            <Label>OTP</Label>
                            <Input
                                value={custodyOtpCode}
                                onChange={(e) => setCustodyOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                placeholder="6-digit code"
                                className="rounded-xl tracking-[0.25em]"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setCustodyOtp(null); setCustodyOtpCode(""); }} className="rounded-xl">Cancel</Button>
                        <Button
                            onClick={() => custodyOtp && confirmCustodyOtpMutation.mutate({ id: custodyOtp.requestId, action: custodyOtp.action, code: custodyOtpCode })}
                            disabled={!custodyOtpCode.trim() || confirmCustodyOtpMutation.isPending}
                            className="rounded-xl"
                        >
                            {confirmCustodyOtpMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Quote Price */}
            <Dialog open={showQuotePriceDialog && !isMobile} onOpenChange={setShowQuotePriceDialog}>
                <DialogContent className="rounded-2xl">
                    <DialogHeader><DialogTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-primary" />Send Quote Price</DialogTitle></DialogHeader>
                    {selectedRequest && (
                        <div className="space-y-4">
                            <div className="bg-muted/50 p-3 rounded-xl space-y-1.5 text-sm">
                                <div className="flex justify-between"><span className="text-muted-foreground">Ticket:</span><span className="font-mono font-medium">{selectedRequest.ticketNumber}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Customer:</span><span>{selectedRequest.customerName}</span></div>
                                <div className="flex justify-between"><span className="text-muted-foreground">Issue:</span><span>{selectedRequest.primaryIssue}</span></div>
                            </div>
                            {/* Same context the mobile sheet shows. Whoever types a
                                number here must see what the customer was already told. */}
                            {getShownEstimate(selectedRequest.symptoms) && (
                                <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-sky-700">What the customer was already shown</p>
                                    <p className="mt-1 text-xs font-bold text-sky-900">{getShownEstimate(selectedRequest.symptoms)}</p>
                                    <p className="mt-1 text-[10px] font-semibold text-sky-700/80">Website estimate, made before anyone saw the TV. If your quote differs, say why in the notes.</p>
                                </div>
                            )}
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

            {/* Confirm & Create Job */}
            <Dialog open={showVerifyDialog && !isMobile} onOpenChange={setShowVerifyDialog}>
                <DialogContent className="sm:max-w-[425px] rounded-2xl">
                    <DialogHeader><DialogTitle>Confirm Device & Create Job</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2"><Label>Priority</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select priority" /></SelectTrigger><SelectContent>{["Low", "Medium", "High", "Urgent"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
                        <div className="grid gap-2"><Label>Verification Notes</Label><Textarea value={verificationNotes} onChange={(e) => setVerificationNotes(e.target.value)} placeholder="Add notes..." className="h-32 rounded-xl" /></div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowVerifyDialog(false)} className="rounded-xl">Cancel</Button>
                        <Button onClick={() => requestToVerify && verifyMutation.mutate({ id: requestToVerify.id, verificationNotes, priority })} disabled={verifyMutation.isPending} className="rounded-xl">
                            {verifyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Job
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Adjust Progress Dialog */}
            <Dialog open={showRollbackDialog && !isMobile} onOpenChange={setShowRollbackDialog}>
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
                            <Select value={rollbackTarget} onValueChange={setRollbackTarget}>
                                <SelectTrigger className="rounded-xl">
                                    <SelectValue placeholder="Select target stage..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {selectedRequest && INTERNAL_STEPS.slice(0, INTERNAL_STEPS.indexOf(selectedRequest.status as any)).map(step => (
                                        <SelectItem key={step} value={step}>{step}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
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
                            setRollbackTarget("");
                        }} className="rounded-xl">Cancel</Button>
                        <Button
                            onClick={() => {
                                if (selectedRequest && rollbackReason.trim() && rollbackTarget) {
                                    adjustProgressMutation.mutate({
                                        id: selectedRequest.id,
                                        targetStatus: rollbackTarget,
                                        reason: rollbackReason
                                    });
                                } else {
                                    toast.error("Please select a target stage and provide a reason");
                                }
                            }}
                            disabled={!rollbackTarget || !rollbackReason.trim() || adjustProgressMutation.isPending}
                            className="rounded-xl bg-amber-500 hover:bg-amber-600"
                        >
                            {adjustProgressMutation.isPending ? "Adjusting..." : "Adjust Progress"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Media Viewer */}
            <Suspense fallback={null}><MediaViewer urls={currentMediaUrls} initialIndex={mediaViewerIndex} isOpen={mediaViewerOpen} onClose={() => setMediaViewerOpen(false)} /></Suspense>

            {/* Call Log Dialog */}
            <Dialog open={showCallLogDialog} onOpenChange={(open) => { setShowCallLogDialog(open); if (open) resetCallForm(); }}>
                <DialogContent className="sm:max-w-[400px] rounded-2xl">
                    <DialogHeader><DialogTitle className="flex items-center gap-2"><Phone className="w-4 h-4" /> Log Call</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-xs">Call Type</Label>
                                <Select value={callForm.callType} onValueChange={v => setCallForm(f => ({ ...f, callType: v }))}>
                                    <SelectTrigger className="h-9 rounded-xl text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="consultation">Consultation</SelectItem>
                                        <SelectItem value="quote">Quote</SelectItem>
                                        <SelectItem value="schedule">Schedule</SelectItem>
                                        <SelectItem value="follow_up">Follow-up</SelectItem>
                                        <SelectItem value="payment">Payment</SelectItem>
                                        <SelectItem value="delivery">Delivery</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-xs">Outcome</Label>
                                <Select value={callForm.outcome} onValueChange={v => setCallForm(f => ({ ...f, outcome: v }))}>
                                    <SelectTrigger className="h-9 rounded-xl text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="accepted">Accepted</SelectItem>
                                        <SelectItem value="scheduled">Scheduled</SelectItem>
                                        <SelectItem value="callback_requested">Callback</SelectItem>
                                        <SelectItem value="no_answer">No Answer</SelectItem>
                                        <SelectItem value="phone_off">Phone Off</SelectItem>
                                        <SelectItem value="rejected">Rejected</SelectItem>
                                        <SelectItem value="asked_for_time">Asked for Time</SelectItem>
                                        <SelectItem value="wrong_number">Wrong Number</SelectItem>
                                        <SelectItem value="hung_up">Hung Up</SelectItem>
                                        <SelectItem value="converted_to_pickup">→ Pickup</SelectItem>
                                        <SelectItem value="converted_to_service_center">→ Center</SelectItem>
                                        <SelectItem value="converted_to_quote">→ Quote</SelectItem>
                                        <SelectItem value="closed_no_response">Closed</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div>
                            <Label className="text-xs">Customer Mood</Label>
                            <Select value={callForm.customerMood} onValueChange={v => setCallForm(f => ({ ...f, customerMood: v }))}>
                                <SelectTrigger className="h-9 rounded-xl text-xs"><SelectValue placeholder="Optional..." /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="normal">Normal</SelectItem>
                                    <SelectItem value="interested">Interested</SelectItem>
                                    <SelectItem value="confused">Confused</SelectItem>
                                    <SelectItem value="angry">Angry</SelectItem>
                                    <SelectItem value="not_interested">Not Interested</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="text-xs">Callback At</Label>
                            <Input type="datetime-local" value={callForm.callbackAt} onChange={e => setCallForm(f => ({ ...f, callbackAt: e.target.value }))} className="h-9 rounded-xl text-xs" />
                        </div>
                        <div>
                            <Label className="text-xs">Notes</Label>
                            <Textarea value={callForm.notes} onChange={e => setCallForm(f => ({ ...f, notes: e.target.value }))} placeholder="Call notes..." rows={2} className="rounded-xl text-xs" />
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => { setShowCallLogDialog(false); resetCallForm(); }} className="rounded-xl">Cancel</Button>
                            <Button disabled={callLogMutation.isPending} className="rounded-xl" onClick={() => {
                                if (!selectedRequest) return;
                                callLogMutation.mutate({
                                    serviceRequestId: selectedRequest.id,
                                    callType: callForm.callType,
                                    outcome: callForm.outcome || undefined,
                                    customerMood: callForm.customerMood || undefined,
                                    notes: callForm.notes || undefined,
                                    callbackAt: callForm.callbackAt || undefined,
                                });
                            }}>
                                {callLogMutation.isPending ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Saving...</> : "Save Call"}
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
