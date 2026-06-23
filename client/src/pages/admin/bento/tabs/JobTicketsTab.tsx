import { useState, useRef, useEffect, useMemo, lazy, Suspense, type UIEvent } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
    Search, Filter, Download, Zap, Plus,
    ChevronRight, CheckCircle2, QrCode, LayoutGrid, List, KanbanSquare, UserCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Dialog, DialogContent, DialogTitle,
} from "@/components/ui/dialog";
import { jobTicketsApi, settingsApi, adminUsersApi } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useAdminSSE } from "@/contexts/AdminSSEContext";
import { playNotificationSound, type NotificationTone } from "@/lib/notification-sound";
import { BentoCard, DashboardSkeleton, smartMatch } from "../shared";
import { BulkActionToolbar } from "@/components/admin/workflow/BulkActionToolbar";
import { JobTicket, InsertJobTicket } from "@shared/schema";
import { JobTicketGrid } from "./jobs/JobTicketGrid";
import { JobTicketList } from "./jobs/JobTicketList";
import type { WorkFeedbackPayload } from "./jobs/JobDetailsSheet";
import { JobFilters } from "./jobs/JobFilters";
import { generatePrintHtml } from "./jobs/JobPrintTemplate";

const CreateJobDrawer = lazy(() => import("./jobs/CreateJobDrawer").then(m => ({ default: m.CreateJobDrawer })));
const EditJobDrawer = lazy(() => import("./jobs/EditJobDrawer").then(m => ({ default: m.EditJobDrawer })));
const JobDetailsSheet = lazy(() => import("./jobs/JobDetailsSheet").then(m => ({ default: m.JobDetailsSheet })));
const AdvanceStatusDialog = lazy(() => import("@/components/admin/workflow/AdvanceStatusDialog").then(m => ({ default: m.AdvanceStatusDialog })));
const KanbanBoard = lazy(() => import("@/components/admin/workflow/KanbanBoard").then(m => ({ default: m.KanbanBoard })));
const LocalPurchaseModal = lazy(() => import("@/components/inventory/LocalPurchaseModal").then(m => ({ default: m.LocalPurchaseModal })));
import { getJobSkillRules, hasAnySkill, type TechUser } from "@/components/admin/TechnicianPicker";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileBottomSheetFrame, MobileBottomSheetHandle } from "@/components/ui/mobile-bottom-sheet";

type JobGroupKey = "new" | "repairing" | "waiting-parts" | "ready" | "delivered" | "all";

const JOB_GROUPS: Array<{
    key: JobGroupKey;
    label: string;
    shortLabel: string;
    helper: string;
    statuses: string[];
    className: string;
}> = [
    { key: "new", label: "New", shortLabel: "New", helper: "Needs first action", statuses: ["Pending", "Diagnosing"], className: "border-blue-100 bg-blue-50/60 text-blue-700" },
    { key: "repairing", label: "Repairing", shortLabel: "Active", helper: "Work is running", statuses: ["In Progress", "On Workbench"], className: "border-indigo-100 bg-indigo-50/60 text-indigo-700" },
    { key: "waiting-parts", label: "Waiting Parts", shortLabel: "Parts", helper: "Needs parts update", statuses: ["Pending Parts", "Waiting on Parts"], className: "border-amber-100 bg-amber-50/70 text-amber-700" },
    { key: "ready", label: "Ready", shortLabel: "Ready", helper: "Payment or handover", statuses: ["Ready", "Completed"], className: "border-emerald-100 bg-emerald-50/70 text-emerald-700" },
    { key: "delivered", label: "Delivered", shortLabel: "Done", helper: "Finished jobs", statuses: ["Delivered"], className: "border-slate-200 bg-slate-50 text-slate-700" },
];

interface JobTicketsTabProps {
    initialSearchQuery?: string;
    initialJobId?: string;
    onSearchConsumed?: () => void;
    initialJobType?: "all" | "walk-in" | "corporate";
}

export default function JobTicketsTab({ initialSearchQuery, initialJobId, onSearchConsumed, initialJobType }: JobTicketsTabProps) {
    const { hasPermission, user } = useAdminAuth();
    const { sseSupported } = useAdminSSE();
    const isMobile = useIsMobile();
    const queryClient = useQueryClient();
    const previousJobCountRef = useRef(0);

    const [jobSearchQuery, setJobSearchQuery] = useState(initialSearchQuery || "");
    const [jobStatusFilter, setJobStatusFilter] = useState("all");
    const [jobPriorityFilter, setJobPriorityFilter] = useState("all");
    const [jobTechnicianFilter, setJobTechnicianFilter] = useState("all");
    const [showJobFilters, setShowJobFilters] = useState(false);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [jobPage, setJobPage] = useState(1);
    const [jobGroupFilter, setJobGroupFilter] = useState<JobGroupKey>("new");
    const [viewMode, setViewMode] = useState<"grid" | "list" | "kanban">("grid");

    const autoOpenedQueryRef = useRef<string | null>(null);

    // Update search query when initialSearchQuery changes (e.g., from deep link)
    useEffect(() => {
        if (initialSearchQuery) {
            setJobSearchQuery(initialSearchQuery);
            setJobStatusFilter("all");
            setJobPriorityFilter("all");
            setJobTechnicianFilter("all");
            setJobGroupFilter("all");
            autoOpenedQueryRef.current = null; // Reset auto-open tracking
            onSearchConsumed?.();
        }
    }, [initialSearchQuery]);



    // Dialog & Panel States
    const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
    const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
    const [isMobileAssignSheetOpen, setIsMobileAssignSheetOpen] = useState(false);
    const [viewDialogOpen, setViewDialogOpen] = useState(false);
    const [qrDialogOpen, setQrDialogOpen] = useState(false);
    const [isAdvanceDialogOpen, setIsAdvanceDialogOpen] = useState(false);
    const [isLocalPurchaseOpen, setIsLocalPurchaseOpen] = useState(false);

    // Selection States
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);

    // Form Data States
    const [selectedJob, setSelectedJob] = useState<JobTicket | null>(null);
    const [mobileAssignTechId, setMobileAssignTechId] = useState<string>("");
    const [mobileAssistTechIds, setMobileAssistTechIds] = useState<string[]>([]);

    useEffect(() => {
        if (initialSearchQuery) {
            setJobSearchQuery(initialSearchQuery);
            onSearchConsumed?.();
        }
    }, [initialSearchQuery]);

    useEffect(() => {
        return () => {
            window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: false } }));
        };
    }, []);

    useEffect(() => {
        const anySheetOpen = isMobileAssignSheetOpen || viewDialogOpen || isCreateDrawerOpen || isEditDrawerOpen || qrDialogOpen || isAdvanceDialogOpen || isLocalPurchaseOpen;
        if (window.innerWidth < 768 && anySheetOpen) {
            window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: true } }));
            return () => {
                window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: false } }));
            };
        }
    }, [isMobileAssignSheetOpen, viewDialogOpen, isCreateDrawerOpen, isEditDrawerOpen, qrDialogOpen, isAdvanceDialogOpen, isLocalPurchaseOpen]);

    // Data Fetching
    // Use `initialJobType` if provided (e.g., when deep-linking from System Health so all job types are searched)
    const jobFetchType = initialJobType || "walk-in";
    const { data: jobTicketsData, isLoading } = useQuery({
        queryKey: ["jobTickets", jobFetchType],
        queryFn: () => jobTicketsApi.getAll(jobFetchType),
    });

    const { data: settings = [] } = useQuery({
        queryKey: ["settings"],
        queryFn: settingsApi.getAll,
    });

    const { data: usersData } = useQuery({
        queryKey: ["users"],
        queryFn: adminUsersApi.lookup,
    });

    const jobTickets = useMemo(() => Array.isArray(jobTicketsData) ? jobTicketsData : (jobTicketsData?.items || []), [jobTicketsData]);
    const technicianUsers = usersData?.filter(u => ["Technician", "Super Admin", "Admin"].includes(u.role)) || [];

    const getCurrencySymbol = () => {
        const currencySetting = settings?.find(s => s.key === "currency_symbol");
        return currencySetting?.value || "৳";
    };

    const getLogoUrl = () => {
        const logoSetting = settings?.find(s => s.key === "logo_url");
        return logoSetting?.value || "";
    };

    const getSettingArray = (key: string, defaultValue: string[]): string[] => {
        const setting = settings.find((s) => s.key === key);
        if (setting?.value) {
            try { return JSON.parse(setting.value); } catch { return defaultValue; }
        }
        return defaultValue;
    };
    const tvInches = getSettingArray("tv_inches", ["24 inch", "32 inch", "40 inch", "43 inch", "50 inch", "55 inch", "65 inch", "75 inch"]);
    const notificationTone = (settings.find(s => s.key === "notification_tone")?.value as NotificationTone) || "default";
    const selectedJobGroup = JOB_GROUPS.find((group) => group.key === jobGroupFilter);

    // Sounds & Sync
    useEffect(() => {
        if (jobTickets.length > 0 && previousJobCountRef.current > 0) {
            if (jobTickets.length > previousJobCountRef.current) {
                playNotificationSound(notificationTone);
            }
        }
        previousJobCountRef.current = jobTickets.length;
    }, [jobTickets.length, notificationTone]);

    useEffect(() => {
        if (selectedJob && jobTickets.length > 0) {
            const updatedJob = jobTickets.find(j => j.id === selectedJob.id);
            if (updatedJob && updatedJob !== selectedJob) {
                setSelectedJob(updatedJob);
            }
        }
    }, [jobTickets, selectedJob]);

    // Auto-open exact single search matches
    useEffect(() => {
        if (jobSearchQuery && jobTickets.length > 0 && !selectedJob) {
            if (autoOpenedQueryRef.current === jobSearchQuery) return; // Prevent loops

            const query = jobSearchQuery.toLowerCase();
            const matches = jobTickets.filter((j) =>
                (j.ticketNumber || j.id).toLowerCase() === query ||
                j.id.toLowerCase() === query
            );

            if (matches.length === 1) {
                autoOpenedQueryRef.current = jobSearchQuery;
                const match = matches[0];
                setSelectedJob(match);
                setViewDialogOpen(true);
            }
        }
    }, [jobSearchQuery, jobTickets, selectedJob]);

    // Auto-open job by initialJobId (from Smart Search deep-link)
    const initialJobIdOpenedRef = useRef<string | null>(null);
    useEffect(() => {
        if (initialJobId && jobTickets.length > 0 && !selectedJob) {
            if (initialJobIdOpenedRef.current === initialJobId) return;
            const match = jobTickets.find((j) =>
                j.id === initialJobId ||
                (j as any).ticketNumber === initialJobId ||
                (j.id.slice(-6).toUpperCase() === initialJobId.toUpperCase())
            );
            if (match) {
                initialJobIdOpenedRef.current = initialJobId;
                setSelectedJob(match);
                setViewDialogOpen(true);
                setJobStatusFilter("all");
                setJobPriorityFilter("all");
                setJobTechnicianFilter("all");
                setJobGroupFilter("all");
            }
        }
    }, [initialJobId, jobTickets, selectedJob]);

    const currentTech = useMemo<TechUser | null>(() => {
        if (!user) return null;
        const fromList = technicianUsers.find((tech) => tech.id === user.id);
        return {
            id: user.id,
            name: user.name,
            role: user.role,
            skills: (fromList as any)?.skills || (user as any).skills || null,
        };
    }, [technicianUsers, user]);

    const isAssignedToCurrentTech = (job: JobTicket) => {
        if (!currentTech) return false;
        return job.assignedTechnicianId === currentTech.id || job.technician === currentTech.name;
    };

    const isUnassignedJob = (job: JobTicket) => !job.technician || job.technician === "Unassigned" || !job.assignedTechnicianId;

    const matchesCurrentTechSkills = (job: JobTicket) => {
        if (!currentTech) return false;
        const rules = getJobSkillRules((job as any).ticketType || "full_device", job.issue);
        return hasAnySkill(currentTech, [...rules.primary, ...rules.assist]);
    };

    const jobSortScore = (job: JobTicket) => {
        const assignedToMe = isAssignedToCurrentTech(job) ? 0 : 20;
        const skillMatch = matchesCurrentTechSkills(job) ? 0 : 8;
        const unassigned = isUnassignedJob(job) ? 2 : 10;
        const statusRank = ["Pending", "Diagnosing", "In Progress", "On Workbench", "Pending Parts", "Waiting on Parts", "Ready", "Completed", "Delivered"].indexOf(job.status || "");
        const priorityRank = job.priority === "Critical" ? 0 : job.priority === "High" ? 1 : job.priority === "Medium" ? 2 : 3;
        return assignedToMe + skillMatch + unassigned + (statusRank >= 0 ? statusRank : 99) + priorityRank;
    };

    const filteredJobs = jobTickets.filter((j) => {
        const matchesSearch = smartMatch(jobSearchQuery,
            j.ticketNumber || j.id,
            j.customer,
            j.customerPhone,
            j.device,
            j.issue,
            j.technician,
            (j as any).assistedByNames,
            j.screenSize,
            (j as any).tvSerialNumber,
            (j as any).corporateJobNumber,
            (j as any).ticketType,
        );
        const matchesGroup = jobGroupFilter === "all" || !selectedJobGroup || selectedJobGroup.statuses.includes(j.status || "");
        const matchesStatus = jobStatusFilter === "all" || j.status === jobStatusFilter;
        const matchesPriority = jobPriorityFilter === "all" || j.priority === jobPriorityFilter;
        const matchesTechnician = jobTechnicianFilter === "all" ||
            (jobTechnicianFilter === "Unassigned" && (!j.technician || j.technician === "Unassigned")) ||
            j.technician === jobTechnicianFilter;

        if (user?.role === "Technician") {
            return matchesSearch && matchesGroup && matchesStatus && matchesPriority && (isAssignedToCurrentTech(j) || (isUnassignedJob(j) && matchesCurrentTechSkills(j)));
        }

        return matchesSearch && matchesGroup && matchesStatus && matchesPriority && matchesTechnician;
    }).sort((a, b) => jobSortScore(a) - jobSortScore(b));

    const searchSuggestions = useMemo(() => {
        const query = jobSearchQuery.trim();
        if (query.length < 1) return [];
        return jobTickets
            .filter((job) => smartMatch(query,
                job.ticketNumber || job.id,
                job.customer,
                job.customerPhone,
                job.device,
                job.issue,
                job.technician,
                (job as any).assistedByNames,
                (job as any).tvSerialNumber,
                (job as any).corporateJobNumber,
            ))
            .sort((a, b) => jobSortScore(a) - jobSortScore(b))
            .slice(0, 6);
    }, [jobSearchQuery, jobTickets, currentTech]);

    const groupCounts = useMemo(() => {
        return JOB_GROUPS.reduce<Record<JobGroupKey, number>>((acc, group) => {
            acc[group.key] = jobTickets.filter((job) => group.statuses.includes(job.status || "")).length;
            return acc;
        }, { new: 0, repairing: 0, "waiting-parts": 0, ready: 0, delivered: 0, all: jobTickets.length });
    }, [jobTickets]);

    const pageSize = 20;
    const paginatedJobs = filteredJobs.slice((jobPage - 1) * pageSize, jobPage * pageSize);
    // Kanban is drag-and-drop with horizontal columns — unusable on phones, fall back to grid.
    const effectiveViewMode = isMobile && viewMode === "kanban" ? "grid" : viewMode;
    const hasActiveFilters = jobGroupFilter !== "new" || jobStatusFilter !== "all" || jobPriorityFilter !== "all" || jobTechnicianFilter !== "all";

    useEffect(() => {
        setJobPage(1);
    }, [jobSearchQuery, jobGroupFilter, jobStatusFilter, jobPriorityFilter, jobTechnicianFilter]);

    const clearFilters = () => {
        setJobSearchQuery("");
        setJobGroupFilter("new");
        setJobStatusFilter("all");
        setJobPriorityFilter("all");
        setJobTechnicianFilter("all");
    };

    // Actions & Mutations
    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<InsertJobTicket> }) =>
            jobTicketsApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["jobTickets"] });
            setIsMobileAssignSheetOpen(false);
            setMobileAssignTechId("");
            setMobileAssistTechIds([]);
            toast.success("Job ticket updated successfully");
        }
    });

    const advanceStatusMutation = useMutation({
        mutationFn: (id: string) => jobTicketsApi.advanceStatus(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["jobTickets"] });
            setIsAdvanceDialogOpen(false);
            toast.success("Job advanced to next stage successfully");
        }
    });

    const handleExport = () => {
        const headers = ["Job ID", "Customer", "Phone", "Device", "Issue", "Technician", "Priority", "Status", "Created At"];
        const csvData = filteredJobs.map(job => [
            job.id,
            job.customer || "",
            job.customerPhone || "",
            job.device || "",
            `"${(job.issue || "").replace(/"/g, '""')}"`,
            job.technician || "Unassigned",
            job.priority || "",
            job.status || "",
            job.createdAt ? format(new Date(job.createdAt), "yyyy-MM-dd HH:mm") : ""
        ]);

        const csvContent = [headers.join(","), ...csvData.map(row => row.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `job-tickets-${format(new Date(), "yyyy-MM-dd")}.csv`;
        link.click();
        toast.success("Jobs exported successfully");
    };

    const handleMobileChromeScroll = (event: UIEvent<HTMLDivElement>) => {
        if (window.innerWidth >= 768) return;
        window.dispatchEvent(new CustomEvent("admin:mobile-chrome", {
            detail: { scrollTop: event.currentTarget.scrollTop },
        }));
    };

    const handleViewDetails = (job: JobTicket) => {
        setSelectedJob(job);
        setViewDialogOpen(true);
    };

    const handleEditJob = (job: JobTicket) => {
        setSelectedJob(job);
        if (isMobile && isUnassignedJob(job)) {
            setMobileAssignTechId("");
            setMobileAssistTechIds([]);
            setIsMobileAssignSheetOpen(true);
            return;
        }
        setIsEditDrawerOpen(true);
    };

    const selectedAssignRules = selectedJob ? getJobSkillRules((selectedJob as any).ticketType || "full_device", selectedJob.issue) : null;
    const eligibleMobileAssignTechs = selectedJob && selectedAssignRules
        ? technicianUsers.filter((tech) => hasAnySkill(tech as TechUser, [...selectedAssignRules.primary, ...selectedAssignRules.assist]))
        : technicianUsers;
    const visibleMobileAssignTechs = eligibleMobileAssignTechs.length > 0 ? eligibleMobileAssignTechs : technicianUsers;
    const selectedMobileAssignTech = visibleMobileAssignTechs.find((tech) => tech.id === mobileAssignTechId);
    const visibleMobileAssistTechs = visibleMobileAssignTechs.filter((tech) => tech.id !== mobileAssignTechId);
    const selectedMobileAssistNames = mobileAssistTechIds
        .map(id => technicianUsers.find((tech) => tech.id === id)?.name)
        .filter(Boolean)
        .join(", ");

    const toggleMobileAssistTech = (techId: string) => {
        setMobileAssistTechIds(current => current.includes(techId) ? current.filter(id => id !== techId) : [...current, techId]);
    };

    const submitMobileAssignment = () => {
        if (!selectedJob || !selectedMobileAssignTech) return;
        updateMutation.mutate({
            id: selectedJob.id,
            data: {
                assignedTechnicianId: selectedMobileAssignTech.id,
                technician: selectedMobileAssignTech.name,
                assistedByIds: JSON.stringify(mobileAssistTechIds),
                assistedByNames: selectedMobileAssistNames || null,
            },
        });
    };

    const parsePartsLineitems = (value: unknown): Array<Record<string, unknown>> => {
        if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
        if (typeof value === "string" && value.trim()) {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [];
            } catch {
                return [];
            }
        }
        return [];
    };

    const handleSaveWorkFeedback = async (job: JobTicket, payload: WorkFeedbackPayload) => {
        const timestamp = format(new Date(), "MMM d, yyyy h:mm a");
        const partText = payload.partName && payload.partName !== "No parts used"
            ? `${payload.partName} x${payload.partQty} (${payload.partSource})`
            : "No parts used";
        const feedbackBlock = [
            `[WORK FEEDBACK ${timestamp}]`,
            `Result: ${payload.result}`,
            `Work: ${payload.workDone.join(", ") || "Not set"}`,
            `Parts: ${partText}`,
            payload.customerSummary ? `Customer: ${payload.customerSummary}` : "",
            payload.internalNote ? `Internal: ${payload.internalNote}` : "",
            `Next: ${payload.nextAction}`,
        ].filter(Boolean).join("\n");

        const existingNotes = (job.notes || "").trim();
        const nextParts = parsePartsLineitems((job as any).partsLineitems);
        if (payload.partName && payload.partName !== "No parts used") {
            nextParts.push({
                name: payload.partName,
                qty: payload.partQty,
                source: payload.partSource,
                charge: 0,
                notes: "Technician work feedback",
                recordedAt: new Date().toISOString(),
            });
        }

        await jobTicketsApi.update(job.id, {
            notes: existingNotes ? `${existingNotes}\n\n${feedbackBlock}` : feedbackBlock,
            problemFound: `${payload.result}: ${payload.workDone.join(", ") || "Work feedback saved"}`,
            partsLineitems: nextParts as any,
        } as Partial<InsertJobTicket>);

        queryClient.invalidateQueries({ queryKey: ["jobTickets"] });
        toast.success("Work feedback saved");
    };

    const waitForPrintAssets = (printWindow: Window) => {
        const images = Array.from(printWindow.document.images);
        if (images.length === 0) return Promise.resolve();

        return new Promise<void>((resolve) => {
            let remaining = images.length;
            let settled = false;
            const timeoutId = window.setTimeout(() => {
                if (!settled) {
                    settled = true;
                    resolve();
                }
            }, 4000);

            const finish = () => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timeoutId);
                resolve();
            };

            const markLoaded = () => {
                remaining -= 1;
                if (remaining <= 0) finish();
            };

            images.forEach((img) => {
                if (img.complete) {
                    markLoaded();
                    return;
                }

                img.addEventListener("load", markLoaded, { once: true });
                img.addEventListener("error", markLoaded, { once: true });
            });
        });
    };

    const handlePrintTicket = (job: JobTicket) => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) { toast.error("Please allow pop-ups to print the ticket"); return; }
        const trackingUrl = `${window.location.origin}/track?id=${job.id}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(trackingUrl)}`;

        const printContent = generatePrintHtml(job, qrUrl, trackingUrl, getCurrencySymbol(), getLogoUrl());
        printWindow.document.write(printContent);
        printWindow.document.close();
        waitForPrintAssets(printWindow).then(() => {
            printWindow.focus();
            printWindow.print();
        });
        toast.success("Print dialog opened");
    };

    const readImageAsDataUrl = async (url: string) => {
        if (!url) return null;
        try {
            const response = await fetch(url, { mode: "cors" });
            if (!response.ok) return null;
            const blob = await response.blob();
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
            });
            const format = blob.type.includes("jpeg") || blob.type.includes("jpg")
                ? "JPEG"
                : blob.type.includes("webp")
                    ? "WEBP"
                    : "PNG";
            return { dataUrl, format };
        } catch {
            return null;
        }
    };

    const handleDownloadTicketPdf = async (job: JobTicket) => {
        try {
            const { default: jsPDF } = await import("jspdf");
            const doc = new jsPDF({ unit: "pt", format: "a4" });
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 42;
            const ticketNumber = (job as any).ticketNumber || job.id.slice(-6).toUpperCase();
            const trackingUrl = `${window.location.origin}/track?id=${encodeURIComponent(job.id)}`;
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(trackingUrl)}`;
            const [logoDataUrl, qrDataUrl] = await Promise.all([
                readImageAsDataUrl(getLogoUrl() || "/logo.png"),
                readImageAsDataUrl(qrUrl),
            ]);

            doc.setFillColor(248, 250, 252);
            doc.rect(0, 0, pageWidth, pageHeight, "F");

            doc.saveGraphicsState();
            doc.setTextColor(226, 232, 240);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(26);
            for (let y = 70; y < pageHeight; y += 135) {
                for (let x = -80; x < pageWidth; x += 260) {
                    doc.text(`PROMISE ELECTRONICS  #${ticketNumber}`, x, y, { angle: -32 });
                }
            }
            doc.restoreGraphicsState();

            doc.setFillColor(15, 23, 42);
            doc.roundedRect(margin, 34, pageWidth - margin * 2, 116, 18, 18, "F");
            if (logoDataUrl) {
                doc.addImage(logoDataUrl.dataUrl, logoDataUrl.format, margin + 18, 54, 54, 54);
            } else {
                doc.setFillColor(37, 99, 235);
                doc.circle(margin + 45, 81, 27, "F");
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(14);
                doc.text("PE", margin + 35, 86);
            }

            doc.setTextColor(255, 255, 255);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(22);
            doc.text("Promise Electronics", margin + 88, 76);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.setTextColor(203, 213, 225);
            doc.text("System Generated Job Ticket Copy", margin + 88, 96);
            doc.text(`Generated ${format(new Date(), "MMM d, yyyy h:mm a")}`, margin + 88, 113);

            doc.setFont("helvetica", "bold");
            doc.setFontSize(20);
            doc.setTextColor(147, 197, 253);
            doc.text(`#${ticketNumber}`, pageWidth - margin - 120, 82);
            doc.setFontSize(10);
            doc.setTextColor(203, 213, 225);
            doc.text(String(job.status || "Pending").toUpperCase(), pageWidth - margin - 120, 102);

            const field = (label: string, value: unknown, x: number, y: number, width = 220) => {
                doc.setFont("helvetica", "bold");
                doc.setFontSize(8);
                doc.setTextColor(100, 116, 139);
                doc.text(label.toUpperCase(), x, y);
                doc.setFont("helvetica", "normal");
                doc.setFontSize(12);
                doc.setTextColor(15, 23, 42);
                doc.text(doc.splitTextToSize(String(value || "Not set"), width), x, y + 18);
            };

            doc.setFillColor(255, 255, 255);
            doc.roundedRect(margin, 174, pageWidth - margin * 2, 238, 16, 16, "F");
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(margin, 174, pageWidth - margin * 2, 238, 16, 16, "S");

            field("Customer", (job as any).customer || "Unknown", margin + 22, 204);
            field("Phone", (job as any).customerPhone || "Not set", margin + 292, 204, 190);
            field("Device", (job as any).device || "Not set", margin + 22, 270);
            field("Problem", (job as any).issue || "Not set", margin + 292, 270, 190);
            field("Technician", (job as any).technician || "Unassigned", margin + 22, 348);
            field("Estimate", (job as any).estimatedCost != null ? `${getCurrencySymbol()}${Number((job as any).estimatedCost).toLocaleString()}` : "Not set", margin + 292, 348, 190);

            doc.setFillColor(239, 246, 255);
            doc.roundedRect(margin, 434, pageWidth - margin * 2, 146, 16, 16, "F");
            doc.setTextColor(30, 64, 175);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text("Live Verification", margin + 22, 462);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.setTextColor(51, 65, 85);
            doc.text(doc.splitTextToSize("This PDF is a customer copy. Verify the real-time job status using the QR code or tracking URL below.", 310), margin + 22, 484);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(15, 23, 42);
            doc.text("Tracking URL", margin + 22, 535);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(37, 99, 235);
            doc.text(doc.splitTextToSize(trackingUrl, 310), margin + 22, 552);

            if (qrDataUrl) {
                doc.setFillColor(255, 255, 255);
                doc.roundedRect(pageWidth - margin - 118, 448, 96, 96, 10, 10, "F");
                doc.addImage(qrDataUrl.dataUrl, qrDataUrl.format, pageWidth - margin - 108, 458, 76, 76);
            }

            doc.setFillColor(255, 255, 255);
            doc.roundedRect(margin, 604, pageWidth - margin * 2, 86, 16, 16, "F");
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(margin, 604, pageWidth - margin * 2, 86, 16, 16, "S");
            doc.setFont("helvetica", "bold");
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(11);
            doc.text("Tamper Notice", margin + 22, 632);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(71, 85, 105);
            doc.text(doc.splitTextToSize("Watermarking discourages editing, but the live tracking page is the authority. Staff and customers should trust the QR/tracking status over any forwarded image or edited PDF.", pageWidth - margin * 2 - 44), margin + 22, 652);

            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.setTextColor(100, 116, 139);
            doc.text("Generated by Promise Integrated System", margin, pageHeight - 34);
            doc.text(`Job ID: ${job.id}`, pageWidth - margin - 170, pageHeight - 34);

            doc.save(`promise-job-${ticketNumber}.pdf`);
            toast.success("Job PDF downloaded");
        } catch {
            toast.error("Could not generate job PDF");
        }
    };

    const getQRCodeUrl = (jobId: string) => {
        const origin = window.location.origin;
        return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${origin}/track?id=${encodeURIComponent(jobId)}`)}`;
    };

    if (isLoading) return <DashboardSkeleton />;

    return (
        <div className="flex flex-col h-full min-h-0 gap-0 md:gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden md:overflow-auto relative">
            <div className="flex-1 min-h-0 flex flex-col">
                <BentoCard className="flex-1 min-h-0 flex flex-col bg-[#f8fafc] md:bg-white border-0 md:border-slate-200 shadow-none md:shadow-sm rounded-none md:rounded-[2rem] overflow-hidden p-0" variant="ghost" disableHover>

                    {/* Fixed Top Header (Sticky on Desktop, Scrolls on Mobile) */}
                    <div className="flex-none px-3 py-2.5 md:p-6 md:pb-4 bg-[#f8fafc]/95 md:bg-white/95 backdrop-blur-sm border-b border-slate-100 z-30">
                        <div className="flex flex-row gap-2 md:gap-4 justify-between items-center mb-2.5 md:mb-6">
                            <div>
                                <div className="flex items-center gap-3">
                                    <h1 className="text-xl md:text-2xl font-bold text-slate-800">Jobs</h1>
                                    <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
                                        sseSupported ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700")}>
                                        <Zap className={cn("w-3 h-3", sseSupported ? "text-emerald-600" : "text-slate-500")} />
                                        <span>{sseSupported ? "Live" : "Reconnecting"}</span>
                                    </div>
                                </div>
                                <p className="text-slate-500 mt-1 text-[11px] font-semibold md:text-sm">Normal customer jobs only · B2B stays separate.</p>
                            </div>
                            {hasPermission("canCreate") && (
                                <Button className="h-9 md:h-10 rounded-xl gap-1.5 px-3 md:px-4 bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all bc-hover bc-rise shrink-0" onClick={() => setIsCreateDrawerOpen(true)}>
                                    <Plus className="w-4 h-4" /> New Job
                                </Button>
                            )}
                        </div>

                        <div className="flex flex-col gap-2 md:gap-4">
                            <div className="flex flex-row items-center gap-2 md:gap-4">
                                <div className="relative flex-1 min-w-0 w-full max-w-xl">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Search phone, job number, customer, device..."
                                        value={jobSearchQuery}
                                        onChange={(e) => setJobSearchQuery(e.target.value)}
                                        onFocus={() => setIsSearchFocused(true)}
                                        onBlur={() => window.setTimeout(() => setIsSearchFocused(false), 120)}
                                        className="w-full bg-white md:bg-slate-50 border border-slate-200 rounded-2xl md:rounded-3xl pl-10 pr-4 py-2 md:py-3 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 text-slate-700 shadow-sm text-sm md:text-base"
                                    />
                                    {isSearchFocused && searchSuggestions.length > 0 && (
                                        <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl md:max-w-xl">
                                            {searchSuggestions.map((job) => (
                                                <button
                                                    key={job.id}
                                                    type="button"
                                                    onMouseDown={(event) => {
                                                        event.preventDefault();
                                                        setJobSearchQuery((job as any).ticketNumber || job.id);
                                                        handleViewDetails(job);
                                                        setIsSearchFocused(false);
                                                    }}
                                                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50"
                                                >
                                                    <span className="min-w-0">
                                                        <span className="block truncate font-mono text-xs font-black text-blue-700">#{(job as any).ticketNumber || job.id.slice(-6).toUpperCase()}</span>
                                                        <span className="block truncate text-xs font-semibold text-slate-800">{job.device || "Device not set"}</span>
                                                        <span className="block truncate text-[11px] text-slate-500">{job.customer || "Unknown"} {job.technician && job.technician !== "Unassigned" ? `- ${job.technician}` : "- Unassigned"}</span>
                                                    </span>
                                                    <Badge variant="secondary" className="shrink-0 rounded-md px-1.5 py-0 text-[10px]">{job.status}</Badge>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-2 w-auto overflow-x-auto pb-1 sm:pb-0 hide-scrollbar shrink-0">
                                    <Button variant={isSelectionMode ? "default" : "outline"} className={cn("gap-2 shadow-sm whitespace-nowrap hidden md:inline-flex", isSelectionMode ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:bg-slate-50")} onClick={() => { setIsSelectionMode(!isSelectionMode); setSelectedJobIds([]); }}>
                                        <CheckCircle2 className="w-4 h-4" /> {isSelectionMode ? "Cancel Selection" : "Bulk Select"}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className={cn("h-9 md:h-10 gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm px-3", showJobFilters && "bg-slate-100 border-slate-300 text-slate-900")}
                                        onClick={() => setShowJobFilters(!showJobFilters)}
                                    >
                                        <Filter className="w-4 h-4" /> <span className="hidden sm:inline">Filters</span>
                                        {hasActiveFilters && <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-blue-100 text-blue-700">!</Badge>}
                                    </Button>
                                    <Button variant="outline" className="gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm hidden md:inline-flex" onClick={handleExport}>
                                        <Download className="w-4 h-4" /> Export
                                    </Button>
                                    <div className="hidden sm:flex items-center bg-slate-100/80 p-1 rounded-lg border border-slate-200 shadow-sm ml-2">
                                        <Button variant="ghost" size="sm" className={cn("px-2.5 h-7 rounded-md", viewMode === 'grid' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")} onClick={() => setViewMode('grid')}>
                                            <LayoutGrid className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" className={cn("px-2.5 h-7 rounded-md", viewMode === 'list' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")} onClick={() => setViewMode('list')}>
                                            <List className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" className={cn("px-2.5 h-7 rounded-md", viewMode === 'kanban' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")} onClick={() => setViewMode('kanban')} title="Kanban board">
                                            <KanbanSquare className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-1.5 md:gap-2 overflow-x-auto pb-1 hide-scrollbar">
                                {JOB_GROUPS.map((group) => (
                                    <button
                                        key={group.key}
                                        type="button"
                                        onClick={() => setJobGroupFilter(group.key)}
                                        className={cn(
                                            "min-w-[64px] md:min-w-[132px] rounded-lg border px-2 md:px-3 py-1.5 md:py-2.5 text-left transition-all shadow-sm",
                                            jobGroupFilter === group.key ? group.className : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                        )}
                                    >
                                        <span className="flex items-center justify-between gap-2 md:gap-3">
                                            <span className="text-xs md:text-sm font-bold">
                                                <span className="md:hidden">{group.shortLabel}</span>
                                                <span className="hidden md:inline">{group.label}</span>
                                            </span>
                                            <span className="font-mono text-xs md:text-sm font-bold">{groupCounts[group.key]}</span>
                                        </span>
                                        <span className="mt-1 hidden md:block text-[11px] font-medium opacity-75">{group.helper}</span>
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setJobGroupFilter("all")}
                                    className={cn(
                                        "min-w-[58px] md:min-w-[104px] rounded-lg border px-2 md:px-3 py-1.5 md:py-2.5 text-left transition-all shadow-sm",
                                        jobGroupFilter === "all" ? "border-slate-300 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                    )}
                                >
                                    <span className="flex items-center justify-between gap-2 md:gap-3">
                                        <span className="text-xs md:text-sm font-bold">All</span>
                                        <span className="font-mono text-xs md:text-sm font-bold">{groupCounts.all}</span>
                                    </span>
                                    <span className="mt-1 hidden md:block text-[11px] font-medium opacity-75">Everything</span>
                                </button>
                            </div>

                            <JobFilters
                                show={showJobFilters}
                                statusFilter={jobStatusFilter}
                                setStatusFilter={setJobStatusFilter}
                                priorityFilter={jobPriorityFilter}
                                setPriorityFilter={setJobPriorityFilter}
                                technicianFilter={jobTechnicianFilter}
                                setTechnicianFilter={setJobTechnicianFilter}
                                hasActiveFilters={hasActiveFilters}
                                clearFilters={clearFilters}
                                technicians={technicianUsers}
                            />
                        </div>
                    </div>

                    {/* Scrollable Card Grid Area */}
                    <div
                        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-[#f8fafc] md:bg-slate-50/60 px-3 py-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:p-6 lg:p-8 md:pb-24"
                        onScroll={handleMobileChromeScroll}
                    >
                        {filteredJobs.length === 0 ? (
                            <div className="h-64 flex flex-col items-center justify-center gap-4">
                                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                                    <Search className="w-8 h-8 text-slate-300" />
                                </div>
                                <p className="text-lg font-medium text-slate-600">No jobs found here</p>
                                {hasActiveFilters && <Button variant="link" onClick={clearFilters}>Clear Filters</Button>}
                            </div>
                        ) : effectiveViewMode === "grid" ? (
                            <JobTicketGrid
                                jobs={paginatedJobs}
                                searchQuery={jobSearchQuery}
                                isSelectionMode={isSelectionMode}
                                selectedJobIds={selectedJobIds}
                                onToggleSelection={(id) => setSelectedJobIds(prev => prev.includes(id) ? prev.filter(jId => jId !== id) : [...prev, id])}
                                onViewDetails={handleViewDetails}
                                onEditJob={handleEditJob}
                                onAdvanceStage={(job) => { setSelectedJob(job); setIsAdvanceDialogOpen(true); }}
                                onPrintTicket={handlePrintTicket}
                                onGenerateQr={(job) => { setSelectedJob(job); setQrDialogOpen(true); }}
                                userRole={user?.role}
                                canEdit={hasPermission("canEdit")}
                                currencySymbol={getCurrencySymbol()}
                            />
                        ) : effectiveViewMode === "list" ? (
                            <JobTicketList
                                jobs={paginatedJobs}
                                searchQuery={jobSearchQuery}
                                isSelectionMode={isSelectionMode}
                                selectedJobIds={selectedJobIds}
                                onToggleSelection={(id) => setSelectedJobIds(prev => prev.includes(id) ? prev.filter(jId => jId !== id) : [...prev, id])}
                                onViewDetails={handleViewDetails}
                                onEditJob={handleEditJob}
                                onAdvanceStage={(job) => { setSelectedJob(job); setIsAdvanceDialogOpen(true); }}
                                onPrintTicket={handlePrintTicket}
                                userRole={user?.role}
                                canEdit={hasPermission("canEdit")}
                            />
                        ) : effectiveViewMode === "kanban" ? (
                            <Suspense fallback={null}>
                                <KanbanBoard
                                    jobs={filteredJobs as JobTicket[]}
                                    onStatusChange={(jobId, newStatus) =>
                                        updateMutation.mutate({ id: jobId, data: { status: newStatus } })
                                    }
                                    onJobClick={handleViewDetails}
                                />
                            </Suspense>
                        ) : null}
                        {filteredJobs.length > 0 && (
                            <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 md:hidden">
                                <span className="text-[11px] font-semibold text-slate-500">
                                    {Math.min((jobPage - 1) * pageSize + 1, filteredJobs.length)}-{Math.min(jobPage * pageSize, filteredJobs.length)} of {filteredJobs.length}
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <Button variant="ghost" size="sm" onClick={() => setJobPage(p => Math.max(1, p - 1))} disabled={jobPage === 1} className="h-8 w-8 p-0 rounded-lg">
                                        <ChevronRight className="w-4 h-4 rotate-180" />
                                    </Button>
                                    <span className="text-xs font-bold text-slate-700 min-w-[2.5rem] text-center font-mono">
                                        {jobPage}/{Math.ceil(filteredJobs.length / pageSize)}
                                    </span>
                                    <Button variant="ghost" size="sm" onClick={() => setJobPage(p => Math.min(Math.ceil(filteredJobs.length / pageSize), p + 1))} disabled={jobPage >= Math.ceil(filteredJobs.length / pageSize)} className="h-8 w-8 p-0 rounded-lg">
                                        <ChevronRight className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Fixed Pagination Footer */}
                    {filteredJobs.length > 0 && (
                        <div className="hidden md:flex flex-none items-center justify-between p-4 px-6 border-t border-slate-100 bg-white/95 backdrop-blur-sm z-20">
                            <div className="text-xs font-medium text-slate-500">
                                Showing {Math.min((jobPage - 1) * pageSize + 1, filteredJobs.length)} to {Math.min(jobPage * pageSize, filteredJobs.length)} of {filteredJobs.length} Jobs
                            </div>
                            <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-1 border border-slate-100">
                                <Button variant="ghost" size="sm" onClick={() => setJobPage(p => Math.max(1, p - 1))} disabled={jobPage === 1} className="h-7 w-7 p-0 rounded-md">
                                    <ChevronRight className="w-4 h-4 rotate-180" />
                                </Button>
                                <span className="text-xs font-bold text-slate-700 min-w-[3rem] text-center font-mono">
                                    {jobPage} / {Math.ceil(filteredJobs.length / pageSize)}
                                </span>
                                <Button variant="ghost" size="sm" onClick={() => setJobPage(p => Math.min(Math.ceil(filteredJobs.length / pageSize), p + 1))} disabled={jobPage >= Math.ceil(filteredJobs.length / pageSize)} className="h-7 w-7 p-0 rounded-md">
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </BentoCard>
            </div>

            {/* CREATE JOB SHEET */}
            <Suspense fallback={null}>
                <CreateJobDrawer
                    isOpen={isCreateDrawerOpen}
                    onClose={() => setIsCreateDrawerOpen(false)}
                    technicianUsers={technicianUsers}
                    tvInches={tvInches}
                />
            </Suspense>

            {/* MOBILE ASSIGN SHEET */}
            {createPortal(
                selectedJob ? (
                    <div className={cn("fixed inset-0 z-[210] md:hidden", !isMobileAssignSheetOpen && "pointer-events-none")}>
                    {isMobileAssignSheetOpen && (
                        <>
                            <div
                                className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
                                onClick={() => setIsMobileAssignSheetOpen(false)}
                            />
                            <div className="absolute inset-x-0 bottom-0">
                                <MobileBottomSheetFrame
                                    onClose={() => setIsMobileAssignSheetOpen(false)}
                                    className="overflow-hidden rounded-t-[1.75rem] border border-slate-200 bg-white shadow-2xl"
                                >
                                    <div className="space-y-3 bg-gradient-to-b from-blue-50 to-white px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-3">
                                        <MobileBottomSheetHandle />
                                        <div className="rounded-2xl border border-white/80 bg-white/90 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
                                            <div className="flex items-start gap-3">
                                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/20">
                                                    <UserCheck className="h-5 w-5" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <h2 className="text-lg font-black leading-tight text-slate-950">Assign Technician</h2>
                                                    <p className="mt-0.5 truncate font-mono text-xs font-bold text-blue-700">
                                                        #{(selectedJob as any).ticketNumber || selectedJob.id.slice(-6).toUpperCase()}
                                                    </p>
                                                    <p className="mt-1 line-clamp-2 text-xs font-medium text-slate-500">{selectedJob.device} - {selectedJob.issue}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                <div>
                                                    <p className="text-xs font-black uppercase tracking-wide text-slate-600">Primary Technician</p>
                                                    <p className="text-[11px] font-medium text-slate-500">
                                                        {eligibleMobileAssignTechs.length > 0 ? "Filtered by job skills" : "No skill match found, showing all"}
                                                    </p>
                                                </div>
                                                <Badge variant="outline" className="rounded-full bg-slate-50 text-[10px] font-black">
                                                    {visibleMobileAssignTechs.length}
                                                </Badge>
                                            </div>
                                            <div className="max-h-[28vh] space-y-2 overflow-y-auto pr-1">
                                                {visibleMobileAssignTechs.map((tech) => {
                                                    const active = mobileAssignTechId === tech.id;
                                                    return (
                                                        <button
                                                            key={tech.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setMobileAssignTechId(tech.id);
                                                                setMobileAssistTechIds(current => current.filter(id => id !== tech.id));
                                                            }}
                                                            className={cn(
                                                                "flex w-full items-center gap-3 rounded-2xl border p-3 text-left shadow-sm transition-colors active:scale-[0.99]",
                                                                active ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white",
                                                            )}
                                                        >
                                                            <div className={cn(
                                                                "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-black",
                                                                active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700",
                                                            )}>
                                                                {tech.name?.charAt(0) || "?"}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="truncate text-sm font-black text-slate-950">{tech.name}</div>
                                                                <div className="truncate text-xs font-medium text-slate-500">{tech.role}</div>
                                                            </div>
                                                            {active && <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-600" />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                                            <div className="mb-2 flex items-center justify-between gap-2">
                                                <div>
                                                    <p className="text-xs font-black uppercase tracking-wide text-slate-600">Assist Technicians</p>
                                                    <p className="text-[11px] font-medium text-slate-500">Optional support team for this job</p>
                                                </div>
                                                <Badge variant="outline" className="rounded-full bg-slate-50 text-[10px] font-black">
                                                    {mobileAssistTechIds.length}
                                                </Badge>
                                            </div>
                                            {visibleMobileAssistTechs.length === 0 ? (
                                                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs font-medium text-slate-500">
                                                    Select a primary technician first.
                                                </div>
                                            ) : (
                                                <div className="max-h-[24vh] space-y-2 overflow-y-auto pr-1">
                                                    {visibleMobileAssistTechs.map((tech) => {
                                                        const active = mobileAssistTechIds.includes(tech.id);
                                                        return (
                                                            <button
                                                                key={tech.id}
                                                                type="button"
                                                                onClick={() => toggleMobileAssistTech(tech.id)}
                                                                className={cn(
                                                                    "flex w-full items-center gap-3 rounded-2xl border p-3 text-left shadow-sm transition-colors active:scale-[0.99]",
                                                                    active ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white",
                                                                )}
                                                            >
                                                                <div className={cn(
                                                                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-sm font-black",
                                                                    active ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700",
                                                                )}>
                                                                    {tech.name?.charAt(0) || "?"}
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="truncate text-sm font-black text-slate-950">{tech.name}</div>
                                                                    <div className="truncate text-xs font-medium text-slate-500">{tech.role}</div>
                                                                </div>
                                                                {active && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <Button
                                                variant="outline"
                                                className="h-11 rounded-2xl"
                                                onClick={() => setIsMobileAssignSheetOpen(false)}
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                className="h-11 rounded-2xl bg-blue-600 font-black text-white shadow-lg shadow-blue-500/20"
                                                disabled={!selectedMobileAssignTech || updateMutation.isPending}
                                                onClick={submitMobileAssignment}
                                            >
                                                {updateMutation.isPending ? "Assigning..." : mobileAssistTechIds.length > 0 ? `Assign + ${mobileAssistTechIds.length}` : "Assign"}
                                            </Button>
                                        </div>
                                    </div>
                                </MobileBottomSheetFrame>
                            </div>
                        </>
                    )}
                    </div>
                ) : null,
                document.body
            )}

            {/* EDIT JOB SHEET */}
            <Suspense fallback={null}>
                <EditJobDrawer
                    isOpen={isEditDrawerOpen}
                    onClose={() => setIsEditDrawerOpen(false)}
                    job={selectedJob}
                    technicianUsers={technicianUsers}
                    userRole={user?.role}
                    canEdit={hasPermission("canEdit")}
                    currencySymbol={getCurrencySymbol()}
                />
            </Suspense>

            {/* VIEW DETAILS OVERLAY */}
            <Suspense fallback={null}>
                <JobDetailsSheet
                    job={selectedJob}
                    isOpen={viewDialogOpen}
                    onClose={() => setViewDialogOpen(false)}
                    viewMode={viewMode}
                    userRole={user?.role}
                    canEdit={hasPermission("canEdit")}
                    currencySymbol={getCurrencySymbol()}
                    onEditJob={(job) => { setViewDialogOpen(false); handleEditJob(job); }}
                    onPrintTicket={handlePrintTicket}
                    onDownloadTicket={handleDownloadTicketPdf}
                    onSaveWorkFeedback={handleSaveWorkFeedback}
                    onOutsidePurchase={() => setIsLocalPurchaseOpen(true)}
                    onAdvanceStage={(job) => { setSelectedJob(job); setIsAdvanceDialogOpen(true); }}
                />
            </Suspense>

            {/* OUTSIDE PURCHASE — lives at parent z-level, above the details sheet */}
            {selectedJob && (
                <Suspense fallback={null}>
                    <LocalPurchaseModal
                        jobTicketId={selectedJob.id}
                        open={isLocalPurchaseOpen}
                        onOpenChange={setIsLocalPurchaseOpen}
                    />
                </Suspense>
            )}

            {/* QR CODE DIALOG */}
            <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
                <DialogContent className="sm:max-w-sm rounded-2xl p-0 overflow-hidden border-0 shadow-2xl bg-white">
                    <div className="bg-slate-900 p-6 text-center text-white">
                        <QrCode className="w-10 h-10 mx-auto mb-3 text-blue-400 opacity-80" />
                        <DialogTitle className="text-xl font-bold">Track Job Status</DialogTitle>
                        <p className="text-xs text-slate-400 mt-1 font-mono">{selectedJob?.id}</p>
                    </div>
                    <div className="p-8 flex flex-col items-center bg-slate-50/50">
                        {selectedJob && (
                            <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100">
                                <img src={getQRCodeUrl(selectedJob.id)} alt={`QR for ${selectedJob.id}`} className="w-48 h-48" />
                            </div>
                        )}
                        <p className="text-sm text-slate-500 font-medium text-center mt-6">Scan with phone camera to view live repair progress.</p>
                    </div>
                    <div className="p-4 border-t border-slate-100 bg-white">
                        <Button variant="outline" className="w-full rounded-xl" onClick={() => setQrDialogOpen(false)}>Close</Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Suspense fallback={null}>
                <AdvanceStatusDialog
                    open={isAdvanceDialogOpen}
                    onOpenChange={setIsAdvanceDialogOpen}
                    currentStatus={selectedJob?.status || "Pending"}
                    onConfirm={() => {
                        if (selectedJob) advanceStatusMutation.mutate(selectedJob.id);
                    }}
                    isPending={advanceStatusMutation.isPending}
                />
            </Suspense>

            <BulkActionToolbar selectedJobIds={selectedJobIds} onClearSelection={() => { setSelectedJobIds([]); setIsSelectionMode(false); }} />
        </div >
    );
}
