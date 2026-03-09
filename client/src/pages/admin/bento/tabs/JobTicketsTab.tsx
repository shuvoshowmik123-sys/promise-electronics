import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
    Search, Filter, Download, Zap, Plus,
    ChevronRight, CheckCircle2, QrCode, X, LayoutGrid, List, KanbanSquare
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
import { AdvanceStatusDialog } from "@/components/admin/workflow/AdvanceStatusDialog";
import { BulkActionToolbar } from "@/components/admin/workflow/BulkActionToolbar";
import { KanbanBoard } from "@/components/admin/workflow/KanbanBoard";
import { JobTicket, InsertJobTicket } from "@shared/schema";
import { JobTicketGrid } from "./jobs/JobTicketGrid";
import { JobTicketList } from "./jobs/JobTicketList";
import { JobDetailsSheet } from "./jobs/JobDetailsSheet";
import { CreateJobDrawer } from "./jobs/CreateJobDrawer";
import { EditJobDrawer } from "./jobs/EditJobDrawer";
import { JobFilters } from "./jobs/JobFilters";
import { generatePrintHtml } from "./jobs/JobPrintTemplate";

interface JobTicketsTabProps {
    initialSearchQuery?: string;
    onSearchConsumed?: () => void;
    initialJobType?: "all" | "walk-in" | "corporate";
}

export default function JobTicketsTab({ initialSearchQuery, onSearchConsumed, initialJobType }: JobTicketsTabProps) {
    const { hasPermission, user } = useAdminAuth();
    const { sseSupported } = useAdminSSE();
    const queryClient = useQueryClient();
    const previousJobCountRef = useRef(0);

    const [jobSearchQuery, setJobSearchQuery] = useState(initialSearchQuery || "");
    const [jobStatusFilter, setJobStatusFilter] = useState("all");
    const [jobPriorityFilter, setJobPriorityFilter] = useState("all");
    const [jobTechnicianFilter, setJobTechnicianFilter] = useState("all");
    const [showJobFilters, setShowJobFilters] = useState(false);
    const [jobPage, setJobPage] = useState(1);
    const [viewMode, setViewMode] = useState<"grid" | "list" | "kanban">("grid");

    const autoOpenedQueryRef = useRef<string | null>(null);

    // Update search query when initialSearchQuery changes (e.g., from deep link)
    useEffect(() => {
        if (initialSearchQuery) {
            setJobSearchQuery(initialSearchQuery);
            setJobStatusFilter("all");
            setJobPriorityFilter("all");
            setJobTechnicianFilter("all");
            autoOpenedQueryRef.current = null; // Reset auto-open tracking
            onSearchConsumed?.();
        }
    }, [initialSearchQuery]);

    // Dialog & Panel States
    const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
    const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
    const [viewDialogOpen, setViewDialogOpen] = useState(false);
    const [qrDialogOpen, setQrDialogOpen] = useState(false);
    const [isAdvanceDialogOpen, setIsAdvanceDialogOpen] = useState(false);

    // Selection States
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedJobIds, setSelectedJobIds] = useState<string[]>([]);

    // Form Data States
    const [selectedJob, setSelectedJob] = useState<JobTicket | null>(null);

    useEffect(() => {
        if (initialSearchQuery) {
            setJobSearchQuery(initialSearchQuery);
            onSearchConsumed?.();
        }
    }, [initialSearchQuery]);

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
            const matches = jobTickets.filter((j: any) =>
                (j.ticketNumber || j.id).toLowerCase() === query ||
                j.id.toLowerCase() === query
            );

            if (matches.length === 1) {
                autoOpenedQueryRef.current = jobSearchQuery;
                const match = matches[0];
                setSelectedJob(match);
            }
        }
    }, [jobSearchQuery, jobTickets, selectedJob]);

    // Filtering & Pagination
    const filteredJobs = jobTickets.filter((j: any) => {
        const matchesSearch = smartMatch(jobSearchQuery,
            j.ticketNumber || j.id,
            j.customer,
            j.customerPhone,
            j.device,
            j.issue,
            j.technician,
            j.screenSize,
            j.serialNumber, // added bonus: we can throw more fields in easily
            j.brand
        );
        const matchesStatus = jobStatusFilter === "all" || j.status === jobStatusFilter;
        const matchesPriority = jobPriorityFilter === "all" || j.priority === jobPriorityFilter;
        const matchesTechnician = jobTechnicianFilter === "all" ||
            (jobTechnicianFilter === "Unassigned" && (!j.technician || j.technician === "Unassigned")) ||
            j.technician === jobTechnicianFilter;

        return matchesSearch && matchesStatus && matchesPriority && matchesTechnician;
    });

    const paginatedJobs = filteredJobs.slice((jobPage - 1) * 10, jobPage * 10);
    const hasActiveFilters = jobStatusFilter !== "all" || jobPriorityFilter !== "all" || jobTechnicianFilter !== "all";

    const clearFilters = () => {
        setJobSearchQuery("");
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

    const handleViewDetails = (job: JobTicket) => {
        setSelectedJob(job);
        setViewDialogOpen(true);
    };

    const handleEditJob = (job: JobTicket) => {
        setSelectedJob(job);
        setIsEditDrawerOpen(true);
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

    const getQRCodeUrl = (jobId: string) => {
        const origin = window.location.origin;
        return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`${origin}/track?id=${encodeURIComponent(jobId)}`)}`;
    };

    if (isLoading) return <DashboardSkeleton />;

    return (
        <div className="flex flex-col h-full min-h-0 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden relative">
            <div className="flex-1 min-h-0 flex flex-col">
                <BentoCard className="flex-1 min-h-0 flex flex-col bg-white border-slate-200 shadow-sm overflow-y-auto overflow-x-hidden p-0" variant="ghost" disableHover>

                    {/* Fixed Top Header (Sticky on Desktop, Scrolls on Mobile) */}
                    <div className="flex-none p-6 pb-4 bg-white/95 backdrop-blur-sm border-b border-slate-100 z-30 md:sticky md:top-0">
                        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
                            <div>
                                <div className="flex items-center gap-3">
                                    <h1 className="text-2xl font-bold text-slate-800">Job Tickets</h1>
                                    <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
                                        sseSupported ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700")}>
                                        <Zap className={cn("w-3 h-3", sseSupported ? "text-emerald-600" : "text-slate-500")} />
                                        <span>{sseSupported ? "Live" : "Reconnecting"}</span>
                                    </div>
                                </div>
                                <p className="text-slate-500 mt-1">Manage repair jobs, assignments, and status updates.</p>
                            </div>
                            {hasPermission("canCreate") && (
                                <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-md transition-all bc-hover bc-rise" onClick={() => setIsCreateDrawerOpen(true)}>
                                    <Plus className="w-4 h-4" /> Create New Ticket
                                </Button>
                            )}
                        </div>

                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col sm:flex-row items-center gap-4">
                                <div className="relative flex-1 w-full max-w-md">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Search by Job ID, Phone, or Name..."
                                        value={jobSearchQuery}
                                        onChange={(e) => setJobSearchQuery(e.target.value)}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-3xl pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 text-slate-700 shadow-sm"
                                    />
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 hide-scrollbar">
                                    <Button variant={isSelectionMode ? "default" : "outline"} className={cn("gap-2 shadow-sm whitespace-nowrap", isSelectionMode ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:bg-slate-50")} onClick={() => { setIsSelectionMode(!isSelectionMode); setSelectedJobIds([]); }}>
                                        <CheckCircle2 className="w-4 h-4" /> {isSelectionMode ? "Cancel Selection" : "Bulk Select"}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className={cn("gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm", showJobFilters && "bg-slate-100 border-slate-300 text-slate-900")}
                                        onClick={() => setShowJobFilters(!showJobFilters)}
                                    >
                                        <Filter className="w-4 h-4" /> Filters
                                        {hasActiveFilters && <Badge variant="secondary" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs bg-blue-100 text-blue-700">!</Badge>}
                                    </Button>
                                    <Button variant="outline" className="gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm" onClick={handleExport}>
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
                    <div className="flex-1 bg-slate-50/30 p-4 sm:p-6 lg:p-8 pb-4 md:pb-24">
                        {filteredJobs.length === 0 ? (
                            <div className="h-64 flex flex-col items-center justify-center gap-4">
                                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                                    <Search className="w-8 h-8 text-slate-300" />
                                </div>
                                <p className="text-lg font-medium text-slate-600">No job tickets found</p>
                                {hasActiveFilters && <Button variant="link" onClick={clearFilters}>Clear Filters</Button>}
                            </div>
                        ) : viewMode === "grid" ? (
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
                            />
                        ) : viewMode === "list" ? (
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
                        ) : viewMode === "kanban" ? (
                            <KanbanBoard
                                jobs={filteredJobs as JobTicket[]}
                                onStatusChange={(jobId, newStatus) =>
                                    updateMutation.mutate({ id: jobId, data: { status: newStatus } })
                                }
                                onJobClick={handleViewDetails}
                            />
                        ) : null}
                    </div>

                    {/* Fixed Pagination Footer */}
                    {filteredJobs.length > 0 && (
                        <div className="flex-none flex items-center justify-between p-4 px-6 border-t border-slate-100 bg-white/95 backdrop-blur-sm z-20">
                            <div className="text-xs font-medium text-slate-500">
                                Showing {Math.min((jobPage - 1) * 10 + 1, filteredJobs.length)} to {Math.min(jobPage * 10, filteredJobs.length)} of {filteredJobs.length} Tickets
                            </div>
                            <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-1 border border-slate-100">
                                <Button variant="ghost" size="sm" onClick={() => setJobPage(p => Math.max(1, p - 1))} disabled={jobPage === 1} className="h-7 w-7 p-0 rounded-md">
                                    <ChevronRight className="w-4 h-4 rotate-180" />
                                </Button>
                                <span className="text-xs font-bold text-slate-700 min-w-[3rem] text-center font-mono">
                                    {jobPage} / {Math.ceil(filteredJobs.length / 10)}
                                </span>
                                <Button variant="ghost" size="sm" onClick={() => setJobPage(p => Math.min(Math.ceil(filteredJobs.length / 10), p + 1))} disabled={jobPage >= Math.ceil(filteredJobs.length / 10)} className="h-7 w-7 p-0 rounded-md">
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </BentoCard>
            </div>

            {/* CREATE JOB SHEET */}
            <CreateJobDrawer
                isOpen={isCreateDrawerOpen}
                onClose={() => setIsCreateDrawerOpen(false)}
                technicianUsers={technicianUsers}
                tvInches={tvInches}
            />

            {/* EDIT JOB SHEET */}
            <EditJobDrawer
                isOpen={isEditDrawerOpen}
                onClose={() => setIsEditDrawerOpen(false)}
                job={selectedJob}
                technicianUsers={technicianUsers}
                userRole={user?.role}
                canEdit={hasPermission("canEdit")}
                currencySymbol={getCurrencySymbol()}
            />

            {/* VIEW DETAILS OVERLAY — isolated into a separate component that also handles the portal */}
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
            />

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

            <AdvanceStatusDialog
                open={isAdvanceDialogOpen}
                onOpenChange={setIsAdvanceDialogOpen}
                currentStatus={selectedJob?.status || "Pending"}
                onConfirm={() => {
                    if (selectedJob) advanceStatusMutation.mutate(selectedJob.id);
                }}
                isPending={advanceStatusMutation.isPending}
            />

            <BulkActionToolbar selectedJobIds={selectedJobIds} onClearSelection={() => { setSelectedJobIds([]); setIsSelectionMode(false); }} />

            {/* CREATE JOB SHEET */}
            <CreateJobDrawer
                isOpen={isCreateDrawerOpen}
                onClose={() => setIsCreateDrawerOpen(false)}
                technicianUsers={technicianUsers}
                tvInches={tvInches}
            />

            {/* EDIT JOB SHEET */}
            <EditJobDrawer
                isOpen={isEditDrawerOpen}
                onClose={() => setIsEditDrawerOpen(false)}
                job={selectedJob}
                technicianUsers={technicianUsers}
                userRole={user?.role}
                canEdit={hasPermission("canEdit")}
                currencySymbol={getCurrencySymbol()}
            />

            {/* VIEW JOB DETAILS SHEET */}
            <JobDetailsSheet
                isOpen={viewDialogOpen}
                onClose={() => setViewDialogOpen(false)}
                job={selectedJob}
                viewMode={viewMode}
                userRole={user?.role}
                canEdit={hasPermission("canEdit")}
                currencySymbol={getCurrencySymbol()}
                onEditJob={handleEditJob}
                onPrintTicket={handlePrintTicket}
            />
        </div >
    );
}

// Placeholder for a micro icon used in the button
function SendIcon(props: any) {
    return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
}
