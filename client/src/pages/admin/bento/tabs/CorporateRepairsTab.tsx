import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    ArrowLeft, FileDown, FileUp, Filter, MoreVertical, Printer, Search,
    Loader2, Users, Receipt, CreditCard, Pencil, Eye, Building2, Check,
    LayoutGrid, List, ChevronLeft, ChevronRight, Clock,
    PackageCheck, RotateCcw, ShieldCheck, AlertTriangle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format, isWithinInterval } from "date-fns";
import { DateRange } from "react-day-picker";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { corporateApi, adminUsersApi } from "@/lib/api";
import { smartMatch } from "../shared/smartMatch";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { getSafeJobDisplayRef } from "@shared/job-display-utils";

// UI Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

// Existing Features (Imports from production components)
import { FilterBar } from "@/components/admin/corporate/FilterBar";
import { CorporateSingleJobPrint } from "@/components/print/CorporateSingleJobPrint";
import { CorporateMultiJobPrint } from "@/components/print/CorporateMultiJobPrint";
import { ChallanOutPrint, type ChallanOutData } from "@/components/print/ChallanOutPrint";
import { ChallanHistoryTable } from "@/components/admin/corporate/ChallanHistoryTable";
import { WarrantyClaimsTable } from "@/components/admin/corporate/WarrantyClaimsTable";
import { CorporateBillsTable } from "@/components/admin/corporate/CorporateBillsTable";
import { CorporateUsersTable } from "@/components/admin/corporate/CorporateUsersTable";
import { EditJobDialog } from "@/components/admin/corporate/EditJobDialog";
import { GenerateBillDialog } from "@/components/admin/corporate/GenerateBillDialog";
import { BulkAssignTechnicianDialog } from "@/components/admin/corporate/BulkAssignTechnicianDialog";
import { JobDetailsSheet } from "@/components/admin/corporate/JobDetailsSheet";
import { CreateWarrantyClaimDialog } from "@/components/admin/corporate/CreateWarrantyClaimDialog";
import { ChallanInWizard } from "@/components/admin/challan/ChallanInWizard";
import { SlaTimer } from "@/components/admin/corporate/SlaTimer";

import { DashboardSkeleton, BentoCard, containerVariants, itemVariants, tableRowVariants } from "../shared";

interface CorporateRepairsTabProps {
    initialClientId?: string | null;
    initialJobId?: string | null;
    initialSearchQuery?: string;
    onSearchConsumed?: () => void;
    onBack?: () => void;
}

const isServiceWarrantyActive = (job: any) => {
    if (!job?.warrantyDays || job.warrantyDays <= 0 || !job.warrantyExpiryDate) return false;
    return new Date(job.warrantyExpiryDate) > new Date();
};

const matchesCockpitFilter = (job: any, filter: string) => {
    const status = job.status || "";
    switch (filter) {
        case "received":
            return true;
        case "checking":
            return ["Checking", "Diagnosing", "Repairing", "In Progress"].includes(status);
        case "declared-ok":
            return ["Declared OK", "Ready", "Delivered", "Completed"].includes(status) || job.initialStatus === "OK";
        case "declared-not-ok":
            return ["Declared NG", "Declared Not OK", "Cancelled"].includes(status) || job.initialStatus === "NG";
        case "pending":
            return ["Pending", "Approval Requested", "Quote Sent", "Pending Parts"].includes(status);
        case "ready":
            return status === "Ready";
        case "delivered":
            return status === "Delivered";
        case "billed":
            return !!job.corporateBillId || ["billed", "invoiced"].includes(job.billingStatus);
        case "bill-pending":
            return ["Ready", "Delivered", "Completed"].includes(status) && !job.corporateBillId && !["billed", "invoiced"].includes(job.billingStatus);
        case "service-warranty":
            return isServiceWarrantyActive(job);
        case "crr":
            return ["warranty_claim", "repeat_repair"].includes(job.jobType) && !["Delivered", "Closed", "Cancelled"].includes(status);
        default:
            return true;
    }
};

const displayJobStatus = (status?: string | null) => status === "Declared Not OK" ? "Declared NG" : status;

const clientTypeOptions = [
    { value: "limited_company", label: "Limited Company" },
    { value: "corporate", label: "Corporate" },
    { value: "regular", label: "Regular" },
    { value: "panel_batch", label: "Panel / Batch Client" },
    { value: "parts_buyer", label: "Parts Buyer" },
    { value: "service_online_partner", label: "Service / Online Partner" },
];

const workTypeOptions = [
    { value: "full_tv", label: "Full TV" },
    { value: "panel", label: "Panel" },
    { value: "panel_batch", label: "Panel Batch" },
    { value: "board", label: "Board" },
    { value: "parts", label: "Parts Service" },
    { value: "parts_sale", label: "Parts Sale" },
    { value: "crr", label: "CRR / Re-service" },
];

export default function CorporateRepairsTab({ initialClientId, initialJobId, initialSearchQuery, onSearchConsumed, onBack }: CorporateRepairsTabProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { user } = useAdminAuth();
    const isMobile = useIsMobile();

    // If no client is passed, we allow selecting one
    const [selectedClientId, setSelectedClientId] = useState<string | null>(initialClientId || null);

    // Fetch all corporate clients for the selector — always kept fresh so re-selection works
    const { data: clients = [] } = useQuery({
        queryKey: ["corporate-clients"],
        queryFn: corporateApi.getAll,
        staleTime: 5 * 60 * 1000,
    });

    const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [billingFilter, setBillingFilter] = useState("all");
    const [technicianFilter, setTechnicianFilter] = useState("all");
    const [quickFilter, setQuickFilter] = useState("all");
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [activeTab, setActiveTab] = useState("work");
    const [viewMode, setViewMode] = useState<"list" | "grid">("list");
    const [clientPage, setClientPage] = useState(1);
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
        if (initialSearchQuery) {
            setSearch(initialSearchQuery);
            onSearchConsumed?.();
        }
    }, [initialSearchQuery]);

    useEffect(() => {
        if (initialClientId) {
            setSelectedClientId(initialClientId);
        }
    }, [initialClientId]);

    // Print State
    const [jobsForMultiPrint, setJobsForMultiPrint] = useState<any[]>([]);
    const [jobForPrint, setJobForPrint] = useState<any>(null);
    const [challanOutPrintData, setChallanOutPrintData] = useState<ChallanOutData | null>(null);

    // Dialog States
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [selectedJobForDetails, setSelectedJobForDetails] = useState<any>(null);
    const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
    const [isGenerateBillOpen, setIsGenerateBillOpen] = useState(false);
    const [isEditJobOpen, setIsEditJobOpen] = useState(false);
    const [selectedJobForEdit, setSelectedJobForEdit] = useState<any>(null);
    const [selectedJobForCrr, setSelectedJobForCrr] = useState<any>(null);
    const [isChallanInOpen, setIsChallanInOpen] = useState(false);
    const [isChallanOutOpen, setIsChallanOutOpen] = useState(false);
    const [isExtensionRequestOpen, setIsExtensionRequestOpen] = useState(false);
    const [isRulesOpen, setIsRulesOpen] = useState(false);
    const [extensionReason, setExtensionReason] = useState("");
    const [extensionUntil, setExtensionUntil] = useState("");
    const [clientRulesForm, setClientRulesForm] = useState({
        clientType: "corporate",
        allowedWorkTypes: ["full_tv"],
        defaultBatchClearanceDays: "7",
        serviceWarrantyEnabled: true,
        defaultServiceWarrantyDays: "30",
        paymentTerms: "30",
        billingCycle: "monthly",
        requiresChallanIn: true,
        requiresChallanOut: true,
        crrRule: "no_charge_inside_service_warranty",
        reminderRule: "due_soon_and_overdue",
    });

    // Challan Out Form
    const [receiverName, setReceiverName] = useState("");
    const [receiverPhone, setReceiverPhone] = useState("");

    // Print Effect
    useEffect(() => {
        if (jobForPrint || jobsForMultiPrint.length > 0 || challanOutPrintData) {
            const timer = setTimeout(() => window.print(), 500);
            return () => clearTimeout(timer);
        }
    }, [jobForPrint, jobsForMultiPrint, challanOutPrintData]);

    useEffect(() => {
        const handleAfterPrint = () => {
            setJobForPrint(null);
            setJobsForMultiPrint([]);
            setChallanOutPrintData(null);
        };

        window.addEventListener("afterprint", handleAfterPrint);
        return () => window.removeEventListener("afterprint", handleAfterPrint);
    }, []);

    // Fetch Technicians
    const { data: usersData } = useQuery({
        queryKey: ["users"],
        queryFn: () => adminUsersApi.lookup(),
        staleTime: 5 * 60 * 1000,
    });
    const technicians = usersData?.filter((u: any) => u.role === "Technician") || [];

    // Fetch Selected Client Details
    const { data: client } = useQuery({
        queryKey: ["corporateClient", selectedClientId],
        queryFn: async () => {
            if (!selectedClientId) return null;
            return corporateApi.getOne(selectedClientId);
        },
        enabled: !!selectedClientId
    });

    // Fetch Jobs linked to filtered client
    const { data: jobData, isLoading } = useQuery({
        queryKey: ["corporateJobs", selectedClientId],
        queryFn: async () => {
            if (!selectedClientId) return { jobs: [], pagination: { total: 0, page: 1, limit: 50, pages: 0 } };
            // Fetch first 50 results explicitly
            return corporateApi.getClientJobs(selectedClientId, 1, 50);
        },
        enabled: !!selectedClientId,
        staleTime: 30 * 1000,
    });

    const jobs = jobData?.jobs || [];
    const pagination = jobData?.pagination;

    useEffect(() => {
        if (!initialJobId || !jobs.length) return;
        const match = jobs.find((job: any) => job.id === initialJobId || job.corporateJobNumber === initialJobId);
        if (!match) return;
        setActiveTab("work");
        setSearch(match.corporateJobNumber || match.id);
        setSelectedJobForDetails(match);
        setIsDetailsOpen(true);
    }, [initialJobId, jobs]);

    useEffect(() => {
        if (!client || !isRulesOpen) return;
        const ruleProfile = (client as any).ruleProfile || {};
        setClientRulesForm({
            clientType: (client as any).clientType || "corporate",
            allowedWorkTypes: Array.isArray(ruleProfile.allowedWorkTypes) && ruleProfile.allowedWorkTypes.length ? ruleProfile.allowedWorkTypes : ["full_tv"],
            defaultBatchClearanceDays: String((client as any).defaultBatchClearanceDays || 7),
            serviceWarrantyEnabled: (client as any).serviceWarrantyEnabled !== false,
            defaultServiceWarrantyDays: String((client as any).defaultServiceWarrantyDays || 30),
            paymentTerms: String((client as any).paymentTerms || 30),
            billingCycle: (client as any).billingCycle || "monthly",
            requiresChallanIn: ruleProfile.requiresChallanIn !== false,
            requiresChallanOut: ruleProfile.requiresChallanOut !== false,
            crrRule: ruleProfile.crrRule || "no_charge_inside_service_warranty",
            reminderRule: ruleProfile.reminderRule || "due_soon_and_overdue",
        });
    }, [client, isRulesOpen]);

    const { data: batches = [] } = useQuery({
        queryKey: ["corporateBatches", selectedClientId],
        queryFn: async () => {
            if (!selectedClientId) return [];
            return corporateApi.getBatches(selectedClientId);
        },
        enabled: !!selectedClientId,
        staleTime: 30 * 1000,
    });

    const { data: extensionRequests = [] } = useQuery({
        queryKey: ["corporateExtensionRequests", selectedClientId],
        queryFn: async () => {
            if (!selectedClientId) return [];
            return corporateApi.getExtensionRequests(selectedClientId);
        },
        enabled: !!selectedClientId,
        staleTime: 30 * 1000,
    });

    // --- Mutations (Simplified from production for brevity, logic maintained) ---
    const createChallanOutMutation = useMutation({
        mutationFn: async () => {
            if (!selectedClientId) throw new Error("Client ID missing");
            const selectedJobObjects = jobs?.filter((j: any) => selectedJobs.includes(j.id));
            const challanInId = selectedJobObjects?.[0]?.corporateChallanId || "unknown";
            return corporateApi.createChallanOut({
                corporateClientId: selectedClientId,
                challanInId: challanInId,
                jobIds: selectedJobs,
                receiverName, receiverPhone
            });
        },
        onSuccess: (data) => {
            const selectedJobObjects = jobs?.filter((j: any) => selectedJobs.includes(j.id)) || [];
            if (!client) return;
            setChallanOutPrintData({
                id: data.challanOutId,
                date: new Date(),
                clientName: client.companyName,
                clientAddress: client.address || "",
                clientPhone: client.phone || client.contactPhone || undefined,
                receiverName, receiverPhone,
                items: selectedJobObjects.map((j: any) => ({
                    id: j.id, jobNo: getSafeJobDisplayRef(j), brand: (j.device || '').split(' ')[0] || "Unknown",
                    model: j.device || "Unknown", serial: j.tvSerialNumber || "", problem: j.reportedDefect || "", status: j.status
                }))
            });
            toast({ title: "Delivery Created" });
            setIsChallanOutOpen(false);
            setSelectedJobs([]);
            queryClient.invalidateQueries({ queryKey: ["corporateJobs"] });
            queryClient.invalidateQueries({ queryKey: ["corporateClient", selectedClientId] });
        },
        onError: (err) => toast({ variant: "destructive", title: "Failed", description: err.message })
    });

    const updateSelectedStatusMutation = useMutation({
        mutationFn: async ({ status, jobIds }: { status: string; jobIds?: string[] }) => {
            const targetIds = jobIds || selectedJobs;
            await Promise.all(targetIds.map((id) => corporateApi.updateJobStatus(id, status)));
            return { status, count: targetIds.length };
        },
        onSuccess: ({ status, count }) => {
            toast({ title: "Status Updated", description: `${count} item(s) marked ${status}.` });
            setSelectedJobs([]);
            queryClient.invalidateQueries({ queryKey: ["corporateJobs"] });
            queryClient.invalidateQueries({ queryKey: ["corporateClient", selectedClientId] });
        },
        onError: (err) => toast({ variant: "destructive", title: "Failed", description: err.message })
    });

    const createExtensionRequestMutation = useMutation({
        mutationFn: async () => {
            const job = selectedJobObjects[0];
            if (!job?.batchId) throw new Error("Selected item is not linked to a batch.");
            if (!extensionReason.trim()) throw new Error("Reason is required.");
            if (!extensionUntil) throw new Error("New target date is required.");

            return corporateApi.createExtensionRequest(job.batchId, {
                jobId: job.id,
                reason: extensionReason.trim(),
                requestedUntil: extensionUntil,
            });
        },
        onSuccess: () => {
            toast({ title: "Extension Requested", description: "Corporate portal can accept or reject it now." });
            setIsExtensionRequestOpen(false);
            setExtensionReason("");
            setExtensionUntil("");
            queryClient.invalidateQueries({ queryKey: ["corporateJobs"] });
            queryClient.invalidateQueries({ queryKey: ["corporateBatches"] });
            queryClient.invalidateQueries({ queryKey: ["corporateExtensionRequests"] });
        },
        onError: (err) => toast({ variant: "destructive", title: "Failed", description: err.message })
    });

    const updateClientRulesMutation = useMutation({
        mutationFn: async () => {
            if (!selectedClientId) throw new Error("Client ID missing");
            const existingRuleProfile = ((client as any)?.ruleProfile || {}) as Record<string, any>;
            const defaultBatchClearanceDays = parseInt(clientRulesForm.defaultBatchClearanceDays, 10) || 7;
            const defaultServiceWarrantyDays = clientRulesForm.serviceWarrantyEnabled ? parseInt(clientRulesForm.defaultServiceWarrantyDays, 10) || 30 : 0;
            const paymentTerms = parseInt(clientRulesForm.paymentTerms, 10) || 30;

            return corporateApi.updateRules(selectedClientId, {
                clientType: clientRulesForm.clientType,
                clientClass: clientRulesForm.clientType === "regular" ? "b2b_normal" : "b2b_corporate",
                defaultBatchClearanceDays,
                serviceWarrantyEnabled: clientRulesForm.serviceWarrantyEnabled,
                defaultServiceWarrantyDays,
                paymentTerms,
                billingCycle: clientRulesForm.billingCycle,
                ruleProfile: {
                    ...existingRuleProfile,
                    allowedWorkTypes: clientRulesForm.allowedWorkTypes,
                    requiresChallanIn: clientRulesForm.requiresChallanIn,
                    requiresChallanOut: clientRulesForm.requiresChallanOut,
                    crrRule: clientRulesForm.crrRule,
                    reminderRule: clientRulesForm.reminderRule,
                },
            });
        },
        onSuccess: () => {
            toast({ title: "Client Rules Updated", description: "B2B client working rules were saved." });
            setIsRulesOpen(false);
            queryClient.invalidateQueries({ queryKey: ["corporateClient", selectedClientId] });
            queryClient.invalidateQueries({ queryKey: ["corporate-clients"] });
            queryClient.invalidateQueries({ queryKey: ["corporateJobs", selectedClientId] });
        },
        onError: (err) => toast({ variant: "destructive", title: "Failed", description: err.message })
    });

    // Filtering Logic
    const filteredJobs = useMemo(() => {
        if (!jobs) return [];
        return jobs.filter(job => {
            const matchesSearch = smartMatch(
                search,
                job.corporateJobNumber,
                job.device,
                job.tvSerialNumber,
                job.reportedDefect,
                job.issue,
                job.technician,
                job.status,
                job.id
            );

            const matchesStatus = statusFilter === "all" || job.status === statusFilter;
            const matchesTechnician = technicianFilter === "all" || (technicianFilter === "unassigned" && !job.technician) || job.technician === technicianFilter;
            const matchesDate = !dateRange?.from || !job.createdAt ? true : isWithinInterval(new Date(job.createdAt), { start: dateRange.from, end: dateRange.to || dateRange.from });
            const matchesBilling =
                billingFilter === "all" ? true :
                    billingFilter === "unbilled" ? !job.corporateBillId :
                        billingFilter === "billed" ? !!job.corporateBillId : true;
            const matchesQuick = matchesCockpitFilter(job, quickFilter);

            return matchesSearch && matchesStatus && matchesTechnician && matchesDate && matchesBilling && matchesQuick;
        }).sort((a, b) => {
            const now = new Date();
            const aDeadline = a.slaDeadline ? new Date(a.slaDeadline) : null;
            const bDeadline = b.slaDeadline ? new Date(b.slaDeadline) : null;
            const aBreached = aDeadline && aDeadline < now;
            const bBreached = bDeadline && bDeadline < now;
            if (aBreached && !bBreached) return -1;
            if (!aBreached && bBreached) return 1;
            if (aDeadline && bDeadline) return aDeadline.getTime() - bDeadline.getTime();
            if (aDeadline) return -1;
            if (bDeadline) return 1;
            return 0;
        });
    }, [jobs, search, statusFilter, technicianFilter, dateRange, billingFilter, quickFilter]);

    const selectedJobObjects = useMemo(
        () => jobs?.filter((j: any) => selectedJobs.includes(j.id)) || [],
        [jobs, selectedJobs]
    );

    const cockpitCards = useMemo(() => [
        { key: "received", label: "Received", value: jobs.filter((job) => matchesCockpitFilter(job, "received")).length, icon: FileDown, tone: "bg-slate-50 text-slate-700 border-slate-200" },
        { key: "checking", label: "Checking", value: jobs.filter((job) => matchesCockpitFilter(job, "checking")).length, icon: Clock, tone: "bg-blue-50 text-blue-700 border-blue-200" },
        { key: "declared-ok", label: "Declared OK", value: jobs.filter((job) => matchesCockpitFilter(job, "declared-ok")).length, icon: Check, tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
        { key: "declared-not-ok", label: "Declared NG", value: jobs.filter((job) => matchesCockpitFilter(job, "declared-not-ok")).length, icon: AlertTriangle, tone: "bg-red-50 text-red-700 border-red-200" },
        { key: "pending", label: "Pending", value: jobs.filter((job) => matchesCockpitFilter(job, "pending")).length, icon: Clock, tone: "bg-amber-50 text-amber-700 border-amber-200" },
        { key: "ready", label: "Ready", value: jobs.filter((job) => matchesCockpitFilter(job, "ready")).length, icon: PackageCheck, tone: "bg-teal-50 text-teal-700 border-teal-200" },
        { key: "delivered", label: "Delivered", value: jobs.filter((job) => matchesCockpitFilter(job, "delivered")).length, icon: FileUp, tone: "bg-indigo-50 text-indigo-700 border-indigo-200" },
        { key: "billed", label: "Billed", value: jobs.filter((job) => matchesCockpitFilter(job, "billed")).length, icon: Receipt, tone: "bg-violet-50 text-violet-700 border-violet-200" },
        { key: "bill-pending", label: "Bill Pending", value: jobs.filter((job) => matchesCockpitFilter(job, "bill-pending")).length, icon: CreditCard, tone: "bg-orange-50 text-orange-700 border-orange-200" },
        { key: "service-warranty", label: "Service Warranty Active", value: jobs.filter((job) => matchesCockpitFilter(job, "service-warranty")).length, icon: ShieldCheck, tone: "bg-green-50 text-green-700 border-green-200" },
        { key: "crr", label: "CRR / Reservice Active", value: jobs.filter((job) => matchesCockpitFilter(job, "crr")).length, icon: RotateCcw, tone: "bg-rose-50 text-rose-700 border-rose-200" },
    ], [jobs]);

    const batchSummary = useMemo(() => ({
        total: batches.length,
        dueSoon: batches.filter((batch: any) => batch.isDueSoon && !batch.isOverdue).length,
        overdue: batches.filter((batch: any) => batch.isOverdue).length,
        extensionPending: extensionRequests.filter((request: any) => request.status === "pending").length,
    }), [batches, extensionRequests]);

    const setCockpitFilter = (filter: string) => {
        setQuickFilter(filter);
        setStatusFilter("all");
        setActiveTab("work");
    };

    const clearCockpitFilter = () => {
        setQuickFilter("all");
        setStatusFilter("all");
    };

    const workspaceCards = useMemo(() => [
        { key: "pending", label: "Pending", helper: "Needs action", value: jobs.filter((job) => matchesCockpitFilter(job, "pending")).length, icon: Clock, className: "from-amber-400 to-orange-600 text-white", action: () => setCockpitFilter("pending") },
        { key: "ready", label: "Ready", helper: "Can deliver", value: jobs.filter((job) => matchesCockpitFilter(job, "ready")).length, icon: PackageCheck, className: "from-emerald-400 to-teal-600 text-white", action: () => setCockpitFilter("ready") },
        { key: "delivered", label: "Delivered", helper: "Completed out", value: jobs.filter((job) => matchesCockpitFilter(job, "delivered")).length, icon: FileUp, className: "from-blue-500 to-indigo-600 text-white", action: () => setCockpitFilter("delivered") },
        { key: "bill-pending", label: "Bill Pending", helper: "Money follow-up", value: jobs.filter((job) => matchesCockpitFilter(job, "bill-pending")).length, icon: CreditCard, className: "from-violet-500 to-fuchsia-600 text-white", action: () => setCockpitFilter("bill-pending") },
        { key: "batch-risk", label: "Batch Risk", helper: "Due soon / overdue", value: batchSummary.dueSoon + batchSummary.overdue, icon: AlertTriangle, className: "from-rose-500 to-red-600 text-white", action: () => setActiveTab("dashboard") },
        { key: "extension", label: "Extensions", helper: "Waiting reply", value: batchSummary.extensionPending, icon: RotateCcw, className: "from-cyan-500 to-blue-600 text-white", action: () => setActiveTab("service-warranty") },
    ], [jobs, batchSummary]);

    const clientRuleChips = useMemo(() => {
        if (!client) return [];
        const clientType = (client.clientType || client.clientClass || "B2B").replace(/_/g, " ");
        const serviceWarrantyDays = client.serviceWarrantyEnabled === false ? "Off" : `${client.defaultServiceWarrantyDays || 30} days`;
        const paymentTerms = `${client.paymentTerms || 30} working days`;
        const batchDays = `${client.defaultBatchClearanceDays || 7} days batch`;

        return [
            { label: "Type", mobileLabel: "Type", value: clientType },
            { label: "Service Warranty", mobileLabel: "Warranty", value: serviceWarrantyDays },
            { label: "Payment", mobileLabel: "Pay", value: paymentTerms },
            { label: "Clearance", mobileLabel: "Batch", value: batchDays },
        ];
    }, [client]);

    const handleSelectedStatus = (status: string) => {
        if (selectedJobs.length === 0) {
            toast({ variant: "destructive", title: "Select Items", description: "Select one or more work items first." });
            return;
        }
        updateSelectedStatusMutation.mutate({ status });
    };

    const handleCreateCrr = () => {
        if (selectedJobObjects.length !== 1) {
            toast({ variant: "destructive", title: "Select One Item", description: "Choose one delivered item for CRR / reservice." });
            return;
        }
        setSelectedJobForCrr(selectedJobObjects[0]);
    };

    const itemsPerPage = 10;
    const totalPages = Math.ceil((filteredJobs?.length || 0) / itemsPerPage);
    const paginatedJobs = filteredJobs?.slice((clientPage - 1) * itemsPerPage, clientPage * itemsPerPage) || [];
    const allVisibleJobsSelected = paginatedJobs.length > 0 && paginatedJobs.every((job) => selectedJobs.includes(job.id));
    const activeWorkbenchJob = selectedJobForDetails || selectedJobObjects[0] || filteredJobs[0];

    useEffect(() => {
        setClientPage(1);
        setSelectedJobs([]);
    }, [
        selectedClientId,
        activeTab,
        statusFilter,
        billingFilter,
        technicianFilter,
        quickFilter,
        dateRange?.from?.getTime(),
        dateRange?.to?.getTime(),
    ]);

    useEffect(() => {
        if (totalPages === 0) {
            if (clientPage !== 1) setClientPage(1);
            return;
        }
        if (clientPage > totalPages) {
            setClientPage(totalPages);
        }
    }, [clientPage, totalPages]);

    useEffect(() => {
        const visibleJobIds = new Set((filteredJobs || []).map((job) => job.id));
        setSelectedJobs((prev) => {
            const next = prev.filter((id) => visibleJobIds.has(id));
            return next.length === prev.length ? prev : next;
        });
    }, [filteredJobs]);

    // Client Selection View
    if (!selectedClientId) {
        return (
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="h-full min-h-[400px] flex flex-col items-center justify-center p-8 text-center">
                <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 max-w-md w-full">
                    <div className="h-16 w-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <Building2 className="h-8 w-8" />
                    </div>
                    <h2 className="text-2xl font-bold mb-2">Select a Client</h2>
                    <p className="text-muted-foreground mb-6">Choose a B2B partner to manage repairs, challans, and billing.</p>

                    <div className="space-y-3">
                        {clients.map((c: any) => (
                            <button
                                key={c.id}
                                onClick={() => setSelectedClientId(c.id)}
                                className="w-full flex items-center justify-between p-4 rounded-xl border hover:border-blue-500 hover:bg-blue-50 transition-all group text-left"
                            >
                                <span className="font-semibold">{c.companyName}</span>
                                <ArrowLeft className="h-4 w-4 rotate-180 opacity-0 group-hover:opacity-100 transition-opacity text-blue-500" />
                            </button>
                        ))}
                    </div>
                </div>
            </motion.div>
        );
    }

    // Main Manager View
    return (
        <div className="fixed inset-0 z-40 flex min-h-0 flex-col gap-3 overflow-hidden bg-slate-50 p-2 animate-in fade-in slide-in-from-bottom-3 duration-500 lg:p-3">
            {/* Hidden Print Components */}
            <div className="hidden print:block">
                {jobForPrint && <CorporateSingleJobPrint job={jobForPrint} />}
                {jobsForMultiPrint.length > 0 && client && <CorporateMultiJobPrint jobs={jobsForMultiPrint} client={client} />}
                {challanOutPrintData && <ChallanOutPrint data={challanOutPrintData} />}
            </div>

            <motion.header
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="flex shrink-0 flex-col gap-3 rounded-[22px] border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between"
            >
                <div className="flex min-w-0 items-center gap-3">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-9 rounded-2xl border-slate-200 bg-white px-3 font-black text-slate-700 shadow-sm transition-all hover:-translate-x-0.5 hover:bg-slate-50"
                        onClick={() => {
                            if (onBack) onBack();
                            else setSelectedClientId(null);
                        }}
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back
                    </Button>
                    <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                            <h1 className="truncate text-lg font-black tracking-tight text-slate-950 md:text-xl">{client?.companyName || "Loading..."}</h1>
                            {client?.shortCode && <Badge className="hidden rounded-full bg-slate-100 font-mono text-slate-700 hover:bg-slate-100 sm:inline-flex">{client.shortCode}</Badge>}
                        </div>
                        <p className="text-xs font-bold text-slate-500">B2B full-page control room</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar px-1 scroll-px-2 lg:px-0">
                    {clientRuleChips.slice(0, 4).map((chip) => (
                        <span key={chip.label} className="shrink-0 whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black text-slate-700">
                            <span className="md:hidden">{chip.mobileLabel}</span><span className="hidden md:inline">{chip.label}</span>: <span className="capitalize text-slate-950">{chip.value}</span>
                        </span>
                    ))}
                    <span className="shrink-0 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black text-emerald-700">
                        <span className="mr-2 h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Portal Live
                    </span>
                </div>
            </motion.header>

            <div className="flex min-h-0 flex-1 flex-col gap-3 lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:overflow-hidden">
                <aside className="hidden min-h-0 overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm lg:flex lg:flex-col">
                    <div className="border-b border-slate-100 p-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                                <Building2 className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="truncate text-base font-black tracking-tight text-slate-950">Client Profile</h2>
                                <div className="mt-1 flex items-center gap-2 text-xs font-bold text-slate-500">
                                    <span>Rules and relation</span>
                                    {client?.shortCode && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-slate-700">{client.shortCode}</span>}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-auto p-4">
                        <div className="space-y-3">
                            {clientRuleChips.map((chip) => (
                                <div key={chip.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-3 transition-all hover:bg-white hover:shadow-sm">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">{chip.label}</div>
                                    <div className="mt-1 text-lg font-black capitalize text-slate-950">{chip.value}</div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                            <div className="text-sm font-black text-slate-950">Allowed Work</div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {["Full TV", "Panel", "Batch", "CRR", "Parts"].map((item) => (
                                    <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700">{item}</span>
                                ))}
                            </div>
                        </div>

                        <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-sm font-black text-slate-950">Portal Access</div>
                                    <div className="mt-1 text-xs font-semibold text-emerald-700">Corporate users active</div>
                                </div>
                                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/40" />
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-slate-100 p-4">
                        <Button variant="outline" className="w-full rounded-2xl border-slate-200 bg-white font-black text-slate-800 transition-all hover:-translate-y-0.5 hover:bg-slate-50" onClick={() => setIsRulesOpen(true)}>
                            Edit Client Rules
                        </Button>
                    </div>
                </aside>

            {/* Header - Mobile (Hero Card) */}
            <div className="hidden relative overflow-hidden bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-5 rounded-3xl shadow-lg shadow-indigo-500/20 mb-1 shrink-0">
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                    <Building2 className="w-32 h-32 transform rotate-12" />
                </div>
                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                        <Button variant="ghost" size="icon" className="text-white/80 hover:text-white hover:bg-white/20 -ml-2 rounded-full" onClick={() => { if (onBack) onBack(); else setSelectedClientId(null); }}>
                            <ArrowLeft className="h-6 w-6" />
                        </Button>
                        {client?.shortCode && <Badge className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-md px-3 py-1 font-mono tracking-wider">{client.shortCode}</Badge>}
                    </div>
                    <h1 className="text-2xl font-bold mb-1 tracking-tight">{client?.companyName || "Loading..."}</h1>
                    <p className="text-indigo-100 text-sm font-medium flex items-center gap-2 opacity-90">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        {jobs?.length || 0} Registered Jobs
                    </p>
                </div>
            </div>

            {/* Mobile Action Strip — compact horizontal row */}
            <div className="lg:hidden flex gap-2 overflow-x-auto hide-scrollbar shrink-0 px-0.5">
                <button type="button" onClick={() => setIsChallanInOpen(true)} className="flex items-center gap-1.5 shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 active:scale-95 transition-transform">
                    <FileDown className="h-3.5 w-3.5" /> Receive
                </button>
                <button type="button" onClick={() => { if (selectedJobs.length === 0) toast({ title: "Select Jobs", description: "Select items first to bill.", variant: "destructive" }); else setIsGenerateBillOpen(true); }} className="flex items-center gap-1.5 shrink-0 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800 active:scale-95 transition-transform">
                    <Receipt className="h-3.5 w-3.5" /> Bill
                </button>
                <button type="button" onClick={() => { if (selectedJobs.length === 0) toast({ title: "Select Jobs", description: "Select items first.", variant: "destructive" }); else setIsChallanOutOpen(true); }} className="flex items-center gap-1.5 shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 active:scale-95 transition-transform">
                    <FileUp className="h-3.5 w-3.5" /> Deliver
                </button>
                <button type="button" onClick={() => { if (selectedJobs.length === 0) toast({ title: "Select Jobs", description: "Select items first to print.", variant: "destructive" }); else { setJobsForMultiPrint(jobs?.filter((j: any) => selectedJobs.includes(j.id)) || []); } }} className="flex items-center gap-1.5 shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 active:scale-95 transition-transform">
                    <Printer className="h-3.5 w-3.5" /> Print
                </button>
            </div>

                <main className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
                    <div className="flex shrink-0 flex-col gap-2 border-b border-slate-200 bg-white p-2 lg:gap-3 lg:p-4">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div className="min-w-0">
                                <div className="hidden lg:block">
                                    <h2 className="text-xl font-black text-slate-900">Work Items</h2>
                                    <p className="text-sm text-slate-500">Operate from the list. Client rules stay visible on the left.</p>
                                </div>
                                <div className="hidden">
                                    <h2 className="text-lg font-black text-slate-900">{client?.companyName || "B2B Workspace"}</h2>
                                    <p className="text-xs font-semibold text-slate-500">Workbench view</p>
                                </div>
                            </div>

                            <div className="hidden lg:flex flex-wrap items-center gap-2">
                                <Button size="sm" className="rounded-xl bg-emerald-600 font-bold text-white hover:bg-emerald-700" onClick={() => setIsChallanInOpen(true)}>
                                    <FileDown className="mr-2 h-4 w-4" /> Receive Work
                                </Button>
                                <Button size="sm" variant="outline" className="rounded-xl" disabled={selectedJobs.length === 0} onClick={() => setIsChallanOutOpen(true)}>
                                    <FileUp className="mr-2 h-4 w-4" /> Deliver Selected
                                </Button>
                                <Button size="sm" variant="outline" className="rounded-xl" disabled={selectedJobs.length === 0} onClick={() => setIsGenerateBillOpen(true)}>
                                    <Receipt className="mr-2 h-4 w-4" /> Generate Bill
                                </Button>
                                {selectedJobs.length > 0 && (
                                    <Badge className="rounded-full bg-blue-50 px-3 py-1 text-blue-700 hover:bg-blue-50">
                                        {selectedJobs.length} selected
                                    </Badge>
                                )}
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex gap-2 overflow-x-auto hide-scrollbar px-1 scroll-px-3 lg:flex-wrap lg:px-0">
                                {[
                                    { key: "pending", label: "Pending", value: cockpitCards.find(c => c.key === "pending")?.value || 0, className: "bg-amber-50 text-amber-800 border-amber-200" },
                                    { key: "ready", label: "Ready", value: cockpitCards.find(c => c.key === "ready")?.value || 0, className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
                                    { key: "delivered", label: "Delivered", value: cockpitCards.find(c => c.key === "delivered")?.value || 0, className: "bg-blue-50 text-blue-800 border-blue-200" },
                                    { key: "bill-pending", label: "Bill Due", value: cockpitCards.find(c => c.key === "bill-pending")?.value || 0, className: "bg-violet-50 text-violet-800 border-violet-200" },
                                    { key: "crr", label: "CRR", value: cockpitCards.find(c => c.key === "crr")?.value || 0, className: "bg-rose-50 text-rose-800 border-rose-200" },
                                ].map((chip) => (
                                    <button key={chip.key} type="button" onClick={() => setCockpitFilter(chip.key)} className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-black transition hover:shadow-sm ${chip.className} ${quickFilter === chip.key ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}>
                                        {chip.value} {chip.label}
                                    </button>
                                ))}
                                <button type="button" onClick={() => setActiveTab("dashboard")} className="shrink-0 whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-black text-red-800 hover:shadow-sm">
                                    {batchSummary.dueSoon + batchSummary.overdue} Batch Risk
                                </button>
                                <button type="button" onClick={() => setActiveTab("service-warranty")} className="shrink-0 whitespace-nowrap rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-800 hover:shadow-sm">
                                    {batchSummary.extensionPending} Ext Wait
                                </button>
                            </div>

                            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row xl:max-w-xl">
                                <div className="relative min-w-0 flex-1">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                    <Input
                                        value={search}
                                        onChange={e => { setSearch(e.target.value); setClientPage(1); }}
                                        placeholder="Search job, device, serial..."
                                        className="h-9 rounded-xl border-slate-200 bg-slate-50 pl-9 text-sm"
                                    />
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={`h-9 rounded-xl ${showFilters ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" : ""}`}
                                    onClick={() => setShowFilters(!showFilters)}
                                    aria-expanded={showFilters}
                                >
                                    <Filter className="mr-2 h-4 w-4" /> {showFilters ? "Hide Filters" : "Show Filters"}
                                </Button>
                                {quickFilter !== "all" && (
                                    <Button variant="ghost" size="sm" className="h-9 rounded-xl text-blue-700 hover:bg-blue-50" onClick={clearCockpitFilter}>
                                        Clear
                                    </Button>
                                )}
                            </div>
                        </div>

                        <Tabs value={activeTab} onValueChange={setActiveTab} className="shrink-0">
                            <TabsList className="flex h-auto w-full gap-1 overflow-x-auto hide-scrollbar scroll-px-2 rounded-2xl bg-slate-100 p-1 md:w-auto md:overflow-visible">
                                <TabsTrigger value="work" className="shrink-0 whitespace-nowrap rounded-xl px-3 py-1 text-xs font-bold">Work</TabsTrigger>
                                <TabsTrigger value="dashboard" className="shrink-0 whitespace-nowrap rounded-xl px-3 py-1 text-xs font-bold">Batch</TabsTrigger>
                                <TabsTrigger value="billing" className="shrink-0 whitespace-nowrap rounded-xl px-3 py-1 text-xs font-bold">Billing</TabsTrigger>
                                <TabsTrigger value="portal-access" className="shrink-0 whitespace-nowrap rounded-xl px-3 py-1 text-xs font-bold">Portal</TabsTrigger>
                                <TabsTrigger value="service-warranty" className="shrink-0 whitespace-nowrap rounded-xl px-3 py-1 text-xs font-bold">CRR</TabsTrigger>
                                <TabsTrigger value="history" className="shrink-0 whitespace-nowrap rounded-xl px-3 py-1 text-xs font-bold">History</TabsTrigger>
                            </TabsList>
                        </Tabs>

                        <AnimatePresence>
                            {showFilters && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                    <FilterBar
                                        statusFilter={statusFilter} setStatusFilter={setStatusFilter}
                                        billingFilter={billingFilter} setBillingFilter={setBillingFilter}
                                        technicianFilter={technicianFilter} setTechnicianFilter={setTechnicianFilter}
                                        dateRange={dateRange} setDateRange={setDateRange}
                                        technicians={technicians}
                                        onReset={() => { setQuickFilter("all"); setStatusFilter("all"); setBillingFilter("all"); setTechnicianFilter("all"); setDateRange(undefined); setSearch(""); setClientPage(1); }}
                                    />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
                        <TabsContent value="work" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden">
                            <div className="flex min-h-0 flex-1 overflow-hidden">
                                <div className="h-full min-h-0 flex-1 overflow-auto bg-slate-50/40 p-3">
                                    {isLoading ? (
                                        <div className="flex h-40 items-center justify-center">
                                            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                                        </div>
                                    ) : paginatedJobs.length === 0 ? (
                                        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-500">
                                            <Search className="mx-auto mb-4 h-10 w-10 text-slate-300" />
                                            <p className="text-base font-bold">No work items found.</p>
                                        </div>
                                    ) : (
                                        <>
                                        {/* ─── MOBILE JOB CARDS ─── */}
                                        <div className="space-y-2 md:hidden">
                                            <div className="flex items-center justify-between px-1 pb-1">
                                                <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                                                    <Checkbox
                                                        checked={allVisibleJobsSelected}
                                                        onCheckedChange={() => {
                                                            const pageJobIds = paginatedJobs.map((job) => job.id);
                                                            const pageJobIdSet = new Set(pageJobIds);
                                                            setSelectedJobs((prev) => {
                                                                const areAllSelected = pageJobIds.every((id) => prev.includes(id));
                                                                if (areAllSelected) return prev.filter((id) => !pageJobIdSet.has(id));
                                                                const next = [...prev];
                                                                pageJobIds.forEach((id) => { if (!next.includes(id)) next.push(id); });
                                                                return next;
                                                            });
                                                        }}
                                                    />
                                                    Select all
                                                </label>
                                                {selectedJobs.length > 0 && (
                                                    <Badge className="rounded-full bg-blue-50 text-blue-700 hover:bg-blue-50 text-[10px]">{selectedJobs.length} selected</Badge>
                                                )}
                                            </div>
                                            {paginatedJobs.map((job) => (
                                                <div
                                                    key={job.id}
                                                    className={`rounded-2xl border bg-white p-3 shadow-sm transition active:scale-[0.99] ${selectedJobs.includes(job.id) ? "border-blue-300 ring-1 ring-blue-200" : "border-slate-200"}`}
                                                >
                                                    <div className="flex items-start gap-2.5">
                                                        <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                                                            <Checkbox
                                                                checked={selectedJobs.includes(job.id)}
                                                                onCheckedChange={() => setSelectedJobs(prev => prev.includes(job.id) ? prev.filter(id => id !== job.id) : [...prev, job.id])}
                                                            />
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className="min-w-0 flex-1 text-left"
                                                            onClick={() => { setSelectedJobForDetails(job); setIsDetailsOpen(true); }}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-mono text-[13px] font-black text-blue-700">#{job.corporateJobNumber || "N/A"}</span>
                                                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${job.status === "Ready" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : job.status === "Delivered" ? "bg-blue-50 text-blue-700 border-blue-200" : job.status === "Pending" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-700"}`}>
                                                                    {displayJobStatus(job.status)}
                                                                </Badge>
                                                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${job.corporateBillId ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-orange-50 text-orange-700 border-orange-200"}`}>
                                                                    {job.corporateBillId ? "Billed" : "Unbilled"}
                                                                </Badge>
                                                            </div>
                                                            <p className="mt-1 text-[13px] font-bold text-slate-900 truncate">{job.device || "Unknown device"}</p>
                                                            <p className="text-[11px] text-slate-500 truncate">{job.reportedDefect || "No defect reported"}</p>
                                                            <div className="mt-1.5 flex items-center gap-3 text-[10px] text-slate-500">
                                                                <span className="font-mono">{job.tvSerialNumber || "No serial"}</span>
                                                                {job.batchTargetClearDate && (
                                                                    <span className="font-bold text-slate-600">Batch {format(new Date(job.batchTargetClearDate), "dd MMM")}</span>
                                                                )}
                                                                {job.technician && (
                                                                    <span className="flex items-center gap-1 font-medium"><Users className="h-2.5 w-2.5" />{job.technician}</span>
                                                                )}
                                                            </div>
                                                            {job.slaDeadline && <div className="mt-1.5"><SlaTimer deadline={job.slaDeadline} status={job.status} /></div>}
                                                        </button>
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-lg text-slate-400">
                                                                    <MoreVertical className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end" className="w-48">
                                                                <DropdownMenuItem onClick={() => { setSelectedJobForDetails(job); setIsDetailsOpen(true); }}>
                                                                    <Eye className="mr-2 h-4 w-4" /> View Details
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => updateSelectedStatusMutation.mutate({ status: "Checking", jobIds: [job.id] })}>
                                                                    <Clock className="mr-2 h-4 w-4" /> Mark Checking
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => updateSelectedStatusMutation.mutate({ status: "Declared OK", jobIds: [job.id] })}>
                                                                    <Check className="mr-2 h-4 w-4" /> Declare OK
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => updateSelectedStatusMutation.mutate({ status: "Ready", jobIds: [job.id] })}>
                                                                    <PackageCheck className="mr-2 h-4 w-4" /> Mark Ready
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => setSelectedJobForCrr(job)}>
                                                                    <RotateCcw className="mr-2 h-4 w-4" /> CRR / Reservice
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* ─── DESKTOP TABLE ─── */}
                                        <div className="hidden md:block min-w-[860px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                            <Table>
                                                <TableHeader className="sticky top-0 z-10 border-b bg-slate-50">
                                                    <TableRow>
                                                        <TableHead className="w-[42px]">
                                                            <Checkbox
                                                                checked={allVisibleJobsSelected}
                                                                onCheckedChange={() => {
                                                                    const pageJobIds = paginatedJobs.map((job) => job.id);
                                                                    const pageJobIdSet = new Set(pageJobIds);
                                                                    setSelectedJobs((prev) => {
                                                                        const areAllSelected = pageJobIds.every((id) => prev.includes(id));
                                                                        if (areAllSelected) return prev.filter((id) => !pageJobIdSet.has(id));
                                                                        const next = [...prev];
                                                                        pageJobIds.forEach((id) => {
                                                                            if (!next.includes(id)) next.push(id);
                                                                        });
                                                                        return next;
                                                                    });
                                                                }}
                                                            />
                                                        </TableHead>
                                                        <TableHead className="font-black text-slate-600">Job</TableHead>
                                                        <TableHead className="font-black text-slate-600">Device</TableHead>
                                                        <TableHead className="font-black text-slate-600">Status</TableHead>
                                                        <TableHead className="font-black text-slate-600">Batch</TableHead>
                                                        <TableHead className="font-black text-slate-600">Billing</TableHead>
                                                        <TableHead className="w-[110px] text-right font-black text-slate-600">Action</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {paginatedJobs.map((job) => (
                                                        <TableRow
                                                            key={job.id}
                                                            className={`cursor-pointer transition-colors hover:bg-blue-50/60 ${activeWorkbenchJob?.id === job.id ? "bg-blue-50" : ""} ${selectedJobs.includes(job.id) ? "ring-1 ring-inset ring-blue-200" : ""}`}
                                                            onClick={() => { setSelectedJobForDetails(job); setIsDetailsOpen(true); }}
                                                        >
                                                            <TableCell onClick={e => e.stopPropagation()}>
                                                                <Checkbox
                                                                    checked={selectedJobs.includes(job.id)}
                                                                    onCheckedChange={() => setSelectedJobs(prev => prev.includes(job.id) ? prev.filter(id => id !== job.id) : [...prev, job.id])}
                                                                />
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="font-mono text-sm font-black text-blue-700">#{job.corporateJobNumber || "N/A"}</div>
                                                                <div className="mt-1 text-xs text-slate-500">{job.tvSerialNumber || "No serial"}</div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="font-bold text-slate-900">{job.device || "Unknown device"}</div>
                                                                <div className="mt-1 max-w-[260px] truncate text-xs text-slate-500">{job.reportedDefect || "No defect reported"}</div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant="outline" className={job.status === "Ready" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : job.status === "Delivered" ? "bg-blue-50 text-blue-700 border-blue-200" : job.status === "Pending" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-700"}>
                                                                    {displayJobStatus(job.status)}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-xs">
                                                                <div className="font-bold text-slate-700">{job.batchTargetClearDate ? format(new Date(job.batchTargetClearDate), "dd MMM") : "No target"}</div>
                                                                {job.extensionStatus && job.extensionStatus !== "none" && <div className="mt-1 text-amber-700">Extension {job.extensionStatus}</div>}
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant="outline" className={job.corporateBillId ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-orange-50 text-orange-700 border-orange-200"}>
                                                                    {job.corporateBillId ? "Billed" : "Pending"}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                                                                <div className="flex justify-end gap-1">
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-8 w-8 rounded-xl text-blue-600 hover:bg-blue-50"
                                                                        onClick={() => { setSelectedJobForDetails(job); setIsDetailsOpen(true); }}
                                                                        title="Full Details"
                                                                    >
                                                                        <Eye className="h-4 w-4" />
                                                                    </Button>
                                                                    <DropdownMenu>
                                                                        <DropdownMenuTrigger asChild>
                                                                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl text-slate-500 hover:bg-slate-100">
                                                                                <MoreVertical className="h-4 w-4" />
                                                                            </Button>
                                                                        </DropdownMenuTrigger>
                                                                        <DropdownMenuContent align="end" className="w-52">
                                                                            <DropdownMenuItem onClick={() => updateSelectedStatusMutation.mutate({ status: "Checking", jobIds: [job.id] })}>
                                                                                <Clock className="mr-2 h-4 w-4" /> Mark Checking
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuItem onClick={() => updateSelectedStatusMutation.mutate({ status: "Declared OK", jobIds: [job.id] })}>
                                                                                <Check className="mr-2 h-4 w-4" /> Declare OK
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuItem onClick={() => updateSelectedStatusMutation.mutate({ status: "Declared NG", jobIds: [job.id] })}>
                                                                                <AlertTriangle className="mr-2 h-4 w-4" /> Declare NG
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuItem onClick={() => updateSelectedStatusMutation.mutate({ status: "Ready", jobIds: [job.id] })}>
                                                                                <PackageCheck className="mr-2 h-4 w-4" /> Mark Ready
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuItem onClick={() => { setSelectedJobs([job.id]); setIsExtensionRequestOpen(true); }}>
                                                                                <RotateCcw className="mr-2 h-4 w-4" /> Request Extension
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuItem onClick={() => setSelectedJobForCrr(job)}>
                                                                                <RotateCcw className="mr-2 h-4 w-4" /> Create CRR / Reservice
                                                                            </DropdownMenuItem>
                                                                        </DropdownMenuContent>
                                                                    </DropdownMenu>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                        </>
                                    )}
                                </div>

                            </div>
                            {totalPages > 0 && (
                                <div className="grid shrink-0 grid-cols-1 items-center gap-2 border-t border-slate-100 bg-white/95 px-4 py-2.5 backdrop-blur sm:grid-cols-[1fr_auto_1fr]">
                                    <span className="text-center text-xs font-bold text-slate-500 sm:text-left">
                                        {(clientPage - 1) * itemsPerPage + 1}-{Math.min(clientPage * itemsPerPage, filteredJobs.length)} of {filteredJobs.length} work items
                                    </span>
                                    <span className="justify-self-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-700 shadow-sm">
                                        Page {clientPage} / {totalPages}
                                    </span>
                                    <div className="flex items-center justify-center gap-2 sm:justify-end">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setClientPage(p => Math.max(1, p - 1))}
                                            disabled={clientPage === 1}
                                            className="h-8 rounded-xl border-slate-200 bg-white px-2.5 text-xs font-black text-slate-700 shadow-sm transition-all hover:-translate-x-0.5 hover:bg-slate-50 disabled:translate-x-0 disabled:opacity-45"
                                            aria-label="Previous page"
                                        >
                                            <ChevronLeft className="mr-1 h-4 w-4" />
                                            Prev
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setClientPage(p => Math.min(totalPages, p + 1))}
                                            disabled={clientPage === totalPages}
                                            className="h-8 rounded-xl border-slate-200 bg-white px-2.5 text-xs font-black text-slate-700 shadow-sm transition-all hover:translate-x-0.5 hover:bg-slate-50 disabled:translate-x-0 disabled:opacity-45"
                                            aria-label="Next page"
                                        >
                                            Next
                                            <ChevronRight className="ml-1 h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="dashboard" className="m-0 flex-1 overflow-auto bg-slate-50/60 p-4">
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-xl font-black text-slate-900">Batch Clearance</h3>
                                        <p className="text-sm text-slate-500">See whether batches are on track before the client asks.</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">{batchSummary.total} open</Badge>
                                        <Badge className="rounded-full bg-amber-100 text-amber-800 hover:bg-amber-100">{batchSummary.dueSoon} due soon</Badge>
                                        <Badge className="rounded-full bg-red-100 text-red-800 hover:bg-red-100">{batchSummary.overdue} risk</Badge>
                                    </div>
                                </div>
                                <div className="grid gap-3 lg:grid-cols-2">
                                    {batches.slice(0, 8).map((batch: any) => (
                                        <div key={batch.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                            <div className="font-black text-slate-900">{batch.batchNumber || batch.id}</div>
                                            <div className="mt-1 text-xs text-slate-500">
                                                Target: {batch.targetClearDate ? format(new Date(batch.targetClearDate), "dd MMM yyyy") : "Not set"} | {batch.clearedItems || 0}/{batch.totalItems || 0} cleared
                                            </div>
                                        </div>
                                    ))}
                                    {batches.length === 0 && <div className="rounded-2xl border border-dashed p-8 text-sm text-slate-500">No received batches yet.</div>}
                                </div>
                            </div>
                        </TabsContent>
                        <TabsContent value="billing" className="m-0 flex-1 overflow-auto bg-slate-50/60 p-4">
                            <CorporateBillsTable clientId={client?.id || ""} />
                        </TabsContent>

                        <TabsContent value="portal-access" className="m-0 flex-1 overflow-hidden bg-slate-50/60 p-4">
                            <div className="mb-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                                <div className="font-black">Corporate Portal Credentials</div>
                                <div className="mt-1 text-xs">
                                    Passwords are not recoverable after creation. Use a 6-digit reset code for client-assisted recovery, or issue an instant temporary password only when needed.
                                </div>
                            </div>
                            {client?.id && <CorporateUsersTable clientId={selectedClientId || ""} />}
                        </TabsContent>

                        <TabsContent value="service-warranty" className="m-0 flex-1 overflow-auto bg-slate-50/60 p-4">
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
                                <WarrantyClaimsTable jobIds={jobs.map((job: any) => job.id)} />
                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <h3 className="font-bold text-slate-900">Extension Requests</h3>
                                    <p className="mt-1 text-xs text-slate-500">Corporate client must accept or reject delayed batch items.</p>
                                    <div className="mt-4 space-y-2">
                                        {extensionRequests.slice(0, 8).map((request: any) => {
                                            const job = jobs.find((item: any) => item.id === request.jobId);
                                            return (
                                                <div key={request.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="font-bold text-sm text-slate-800">{job?.corporateJobNumber || request.jobId}</div>
                                                        <Badge variant={request.status === "pending" ? "default" : "outline"}>{request.status}</Badge>
                                                    </div>
                                                    <div className="mt-1 text-xs text-slate-500">Until {format(new Date(request.requestedUntil), "dd MMM yyyy")}</div>
                                                    <div className="mt-2 text-xs text-slate-600">{request.reason}</div>
                                                </div>
                                            );
                                        })}
                                        {extensionRequests.length === 0 && <div className="rounded-xl border border-dashed p-4 text-sm text-slate-500">No extension requests yet.</div>}
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        <TabsContent value="history" className="m-0 flex-1 overflow-auto bg-slate-50/60 p-4">
                            {client && <ChallanHistoryTable client={client} />}
                        </TabsContent>
                    </Tabs>
                </main>

                {false && (
                    <>
                <div className="hidden">
                {workspaceCards.map((card) => {
                    const Icon = card.icon;
                    const isActive = quickFilter === card.key;
                    return (
                        <button
                            key={card.key}
                            type="button"
                            onClick={card.action}
                            className={`group relative overflow-hidden rounded-[18px] bg-gradient-to-br p-2.5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ${card.className} ${isActive ? "ring-2 ring-blue-500 ring-offset-2" : ""}`}
                        >
                            <div className="absolute -right-5 -top-6 h-20 w-20 rounded-full bg-white/20 blur-xl transition-transform group-hover:scale-125" />
                            <div className="relative flex items-center justify-between gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20">
                                    <Icon className="h-4 w-4 shrink-0" />
                                </div>
                                <span className="text-xl font-black tabular-nums">{card.value}</span>
                            </div>
                            <div className="relative mt-2 text-sm font-black leading-tight">{card.label}</div>
                            <div className="relative mt-0.5 text-xs font-semibold opacity-80">{card.helper}</div>
                        </button>
                    );
                })}
            </div>

            {/* Main Tabs */}
            <BentoCard variant="ghost" className="hidden min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border-slate-200/70 bg-white p-0 shadow-sm" disableHover>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                    <div className="sticky top-0 z-10 shrink-0 border-b bg-white/95 px-3 py-1.5 backdrop-blur-md lg:px-4">
                        <TabsList className="flex h-auto w-full gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 shadow-inner shadow-slate-300/30 lg:inline-flex lg:w-auto">
                            <TabsTrigger value="dashboard" className="rounded-full flex-1 lg:flex-none data-[state=active]:shadow-md data-[state=active]:bg-white py-1 text-xs transition-all whitespace-nowrap px-3 font-semibold">Dashboard</TabsTrigger>
                            <TabsTrigger value="work" className="rounded-full flex-1 lg:flex-none data-[state=active]:shadow-md data-[state=active]:bg-white py-1 text-xs transition-all whitespace-nowrap px-3 font-semibold">Work</TabsTrigger>
                            <TabsTrigger value="receive" className="rounded-full flex-1 lg:flex-none data-[state=active]:shadow-md data-[state=active]:bg-white py-1 text-xs transition-all whitespace-nowrap px-3 font-semibold">Receive</TabsTrigger>
                            <TabsTrigger value="deliver" className="rounded-full flex-1 lg:flex-none data-[state=active]:shadow-md data-[state=active]:bg-white py-1 text-xs transition-all whitespace-nowrap px-3 font-semibold">Delivery</TabsTrigger>
                            <TabsTrigger value="billing" className="rounded-full flex-1 lg:flex-none data-[state=active]:shadow-md data-[state=active]:bg-white py-1 text-xs transition-all whitespace-nowrap px-3 font-semibold">Billing</TabsTrigger>
                            <TabsTrigger value="portal-access" className="rounded-full flex-1 lg:flex-none data-[state=active]:shadow-md data-[state=active]:bg-white py-1 text-xs transition-all whitespace-nowrap px-3 font-semibold">Portal</TabsTrigger>
                            <TabsTrigger value="service-warranty" className="rounded-full flex-1 lg:flex-none data-[state=active]:shadow-md data-[state=active]:bg-white py-1 text-xs transition-all whitespace-nowrap px-3 font-semibold">CRR</TabsTrigger>
                            <TabsTrigger value="history" className="rounded-full flex-1 lg:flex-none data-[state=active]:shadow-md data-[state=active]:bg-white py-1 text-xs transition-all whitespace-nowrap px-3 font-semibold">History</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="dashboard" className="m-0 flex-1 overflow-auto bg-slate-50/60 p-4 lg:p-5">
                        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
                                <div>
                                    <h3 className="text-xl font-black text-slate-900">Priority Work Area</h3>
                                    <p className="text-sm text-slate-500">Shows important live items only. Full records stay in Work.</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">{jobs.length} total work items</Badge>
                                        <Badge className="rounded-full bg-blue-100 text-blue-800 hover:bg-blue-100">Showing {Math.min(filteredJobs.length, 8)} priority rows</Badge>
                                        {quickFilter !== "all" && <Badge className="rounded-full bg-amber-100 text-amber-800 hover:bg-amber-100">Filtered view</Badge>}
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Button size="sm" className="rounded-xl bg-emerald-600 hover:bg-emerald-700" onClick={() => setIsChallanInOpen(true)}>
                                        <FileDown className="mr-2 h-4 w-4" /> Add Work
                                    </Button>
                                    <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setActiveTab("work")}>Full List</Button>
                                </div>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {filteredJobs.slice(0, 8).map((job: any) => (
                                    <button
                                        key={job.id}
                                        type="button"
                                        onClick={() => { setSelectedJobForDetails(job); setIsDetailsOpen(true); }}
                                        className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-slate-50"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-mono text-sm font-bold text-blue-700">#{getSafeJobDisplayRef(job)}</span>
                                                <Badge variant="outline">{displayJobStatus(job.status)}</Badge>
                                                {job.extensionStatus && job.extensionStatus !== "none" && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Extension {job.extensionStatus}</Badge>}
                                            </div>
                                            <div className="mt-1 truncate font-semibold text-slate-900">{job.device || "Unknown device"}</div>
                                            <div className="mt-0.5 truncate text-xs text-slate-500">{job.reportedDefect || job.issue || "No defect reported"}</div>
                                        </div>
                                        <div className="hidden shrink-0 text-right md:block">
                                            <div className="text-xs font-bold text-slate-600">{job.technician || "Unassigned"}</div>
                                            <div className="text-xs text-slate-400">{job.batchTargetClearDate ? `Batch target ${format(new Date(job.batchTargetClearDate), "dd MMM")}` : "No batch target"}</div>
                                        </div>
                                    </button>
                                ))}
                                {filteredJobs.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No priority items match this view. Open Work for the full record list.</div>}
                            </div>
                        </div>
                            <div className="space-y-5">
                                <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                                    <h3 className="text-lg font-black text-slate-900">Today Needs Action</h3>
                                    <div className="mt-4 space-y-3">
                                        {[
                                            { label: "Ready to deliver", value: cockpitCards.find(c => c.key === "ready")?.value || 0, color: "text-emerald-700", action: () => setCockpitFilter("ready") },
                                            { label: "Bill pending", value: cockpitCards.find(c => c.key === "bill-pending")?.value || 0, color: "text-violet-700", action: () => setCockpitFilter("bill-pending") },
                                            { label: "Batch overdue risk", value: batchSummary.overdue, color: "text-red-700", action: () => setActiveTab("dashboard") },
                                            { label: "Extension waiting", value: batchSummary.extensionPending, color: "text-blue-700", action: () => setActiveTab("service-warranty") },
                                        ].map((item) => (
                                            <button key={item.label} type="button" onClick={item.action} className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-left hover:bg-white hover:shadow-sm">
                                                <span className="text-sm font-bold text-slate-700">{item.label}</span>
                                                <span className={`text-xl font-black tabular-nums ${item.color}`}>{item.value}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                                    <h3 className="text-lg font-black text-slate-900">Client Rules</h3>
                                    <div className="mt-4 space-y-2">
                                        {clientRuleChips.map((chip) => (
                                            <div key={chip.label} className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
                                                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{chip.label}</span>
                                                <span className="text-sm font-black capitalize text-slate-900">{chip.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                                    <h3 className="text-lg font-black text-slate-900">Quick Actions</h3>
                                    <p className="text-xs text-slate-500">Use after selecting one or more items.</p>
                                    <div className="mt-4 grid gap-2">
                                        <Button variant="outline" className="justify-start rounded-xl" disabled={selectedJobs.length === 0} onClick={() => setIsChallanOutOpen(true)}>
                                            <FileUp className="mr-2 h-4 w-4" /> Deliver selected
                                        </Button>
                                        <Button variant="outline" className="justify-start rounded-xl" disabled={selectedJobs.length === 0} onClick={() => setIsGenerateBillOpen(true)}>
                                            <Receipt className="mr-2 h-4 w-4" /> Generate bill
                                        </Button>
                                        <Button variant="outline" className="justify-start rounded-xl" disabled={selectedJobs.length !== 1} onClick={() => setIsExtensionRequestOpen(true)}>
                                            <AlertTriangle className="mr-2 h-4 w-4" /> Request extension
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-xl font-black text-slate-900">Batch Clearance</h3>
                                    <p className="text-sm text-slate-500">One place to see whether batches are on track.</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">{batchSummary.total} open</Badge>
                                    <Badge className="rounded-full bg-amber-100 text-amber-800 hover:bg-amber-100">{batchSummary.dueSoon} due soon</Badge>
                                    <Badge className="rounded-full bg-red-100 text-red-800 hover:bg-red-100">{batchSummary.overdue} risk</Badge>
                                </div>
                            </div>
                            <div className="grid gap-3 lg:grid-cols-2">
                                {batches.slice(0, 6).map((batch: any) => (
                                    <div key={batch.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                        <div>
                                            <div className="font-black text-slate-900">{batch.batchNumber || batch.id}</div>
                                            <div className="mt-1 text-xs text-slate-500">
                                                Target: {batch.targetClearDate ? format(new Date(batch.targetClearDate), "dd MMM yyyy") : "Not set"} · {batch.clearedItems || 0}/{batch.totalItems || 0} cleared
                                            </div>
                                        </div>
                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                            {batch.extensionPendingCount > 0 && <Badge className="rounded-full bg-blue-100 text-blue-800 hover:bg-blue-100">{batch.extensionPendingCount} extension pending</Badge>}
                                            {batch.isOverdue ? <Badge className="rounded-full bg-red-100 text-red-800 hover:bg-red-100">Overdue risk</Badge> : batch.isDueSoon ? <Badge className="rounded-full bg-amber-100 text-amber-800 hover:bg-amber-100">Due soon</Badge> : <Badge variant="outline" className="rounded-full">On track</Badge>}
                                        </div>
                                        {batch.totalItems > 0 && (
                                            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                                                <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500" style={{ width: `${Math.min(100, Math.round(((batch.clearedItems || 0) / batch.totalItems) * 100))}%` }} />
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {batches.length === 0 && <div className="rounded-2xl border border-dashed p-8 text-sm text-slate-500">No received batches yet.</div>}
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="work" className="flex-1 flex flex-col p-0 m-0 lg:overflow-hidden">
                        {/* Filters & View Toggle */}
                        <div className="p-4 border-b flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-white z-10 w-full shrink-0">
                            <div className="flex flex-col lg:flex-row gap-4 w-full md:w-auto flex-1">
                                <div className="relative w-full lg:w-72 mt-0.5">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Search by Job No, Device, Serial..."
                                        value={search}
                                        onChange={e => { setSearch(e.target.value); setClientPage(1); }}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-3xl pl-10 pr-4 py-2.5 outline-none transition-all placeholder:text-slate-400 text-slate-700 shadow-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm"
                                    />
                                </div>

                                <Button
                                    variant="outline"
                                    className="gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm rounded-xl transition-all h-[42px] mt-0.5"
                                    onClick={() => setShowFilters(!showFilters)}
                                >
                                    <Filter className="w-4 h-4" /> Filters
                                    {(quickFilter !== "all" || statusFilter !== "all" || billingFilter !== "all" || technicianFilter !== "all" || dateRange) && (
                                        <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center rounded-full bg-blue-100 text-blue-700 border-none shadow-none font-bold">!</Badge>
                                    )}
                                </Button>
                                {quickFilter !== "all" && (
                                    <Button variant="ghost" size="sm" className="h-[42px] rounded-xl text-blue-700 hover:bg-blue-50" onClick={clearCockpitFilter}>
                                        Clear cockpit filter
                                    </Button>
                                )}
                            </div>

                            <div className="hidden sm:flex items-center bg-slate-100/80 p-1 rounded-lg border border-slate-200 shadow-sm shrink-0 h-[42px] mt-0.5">
                                <Button variant="ghost" size="sm" className={`px-2.5 h-full rounded-md ${viewMode === 'grid' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`} onClick={() => setViewMode('grid')}>
                                    <LayoutGrid className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm" className={`px-2.5 h-full rounded-md ${viewMode === 'list' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`} onClick={() => setViewMode('list')}>
                                    <List className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>

                        <AnimatePresence>
                            {showFilters && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden bg-white/50 border-b border-slate-100"
                                >
                                    <div className="p-4 pt-0">
                                        <FilterBar
                                            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
                                            billingFilter={billingFilter} setBillingFilter={setBillingFilter}
                                            technicianFilter={technicianFilter} setTechnicianFilter={setTechnicianFilter}
                                            dateRange={dateRange} setDateRange={setDateRange}
                                            technicians={technicians}
                                            onReset={() => { setQuickFilter("all"); setStatusFilter("all"); setBillingFilter("all"); setTechnicianFilter("all"); setDateRange(undefined); setSearch(""); setClientPage(1); }}
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Content Area */}
                        <div className="flex-1 overflow-auto bg-slate-50/30 p-2 sm:p-4">
                            {isLoading ? (
                                <div className="flex justify-center items-center h-40">
                                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                                </div>
                            ) : paginatedJobs.length === 0 ? (
                                <div className="text-center py-12 text-slate-500">
                                    <Search className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                                    <p className="text-lg font-medium">No repair jobs found.</p>
                                </div>
                            ) : viewMode === 'list' ? (
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-w-[1080px]">
                                    <Table>
                                        <TableHeader className="bg-slate-50 border-b border-slate-100 sticky top-0 shadow-sm z-10">
                                            <TableRow>
                                                <TableHead className="w-[40px]">
                                                    <Checkbox
                                                        checked={allVisibleJobsSelected}
                                                        onCheckedChange={() => {
                                                            const pageJobIds = paginatedJobs.map((job) => job.id);
                                                            const pageJobIdSet = new Set(pageJobIds);
                                                            setSelectedJobs((prev) => {
                                                                const areAllSelected = pageJobIds.every((id) => prev.includes(id));
                                                                if (areAllSelected) {
                                                                    return prev.filter((id) => !pageJobIdSet.has(id));
                                                                }

                                                                const next = [...prev];
                                                                pageJobIds.forEach((id) => {
                                                                    if (!next.includes(id)) {
                                                                        next.push(id);
                                                                    }
                                                                });
                                                                return next;
                                                            });
                                                        }}
                                                    />
                                                </TableHead>
                                                <TableHead className="font-bold text-slate-600">Job No</TableHead>
                                                <TableHead className="font-bold text-slate-600">Device</TableHead>
                                                <TableHead className="font-bold text-slate-600">Problem</TableHead>
                                                <TableHead className="font-bold text-slate-600">Status</TableHead>
                                                <TableHead className="font-bold text-slate-600">Batch</TableHead>
                                                <TableHead className="font-bold text-slate-600">Billing</TableHead>
                                                <TableHead className="font-bold text-slate-600">Tech</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {paginatedJobs.map((job) => (
                                                <TableRow
                                                    key={job.id}
                                                    className={`cursor-pointer hover:bg-blue-50/50 transition-colors ${selectedJobs.includes(job.id) ? "bg-blue-50/30" : ""}`}
                                                    onClick={() => { setSelectedJobForDetails(job); setIsDetailsOpen(true); }}
                                                >
                                                    <TableCell onClick={e => e.stopPropagation()}>
                                                        <Checkbox
                                                            checked={selectedJobs.includes(job.id)}
                                                            onCheckedChange={() => setSelectedJobs(prev => prev.includes(job.id) ? prev.filter(id => id !== job.id) : [...prev, job.id])}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-mono font-medium text-blue-600">{job.corporateJobNumber}</TableCell>
                                                    <TableCell>
                                                        <div className="font-medium text-slate-900">{job.device}</div>
                                                        <div className="text-xs text-slate-500 font-mono mt-0.5">{job.tvSerialNumber}</div>
                                                    </TableCell>
                                                    <TableCell className="max-w-[200px] truncate text-xs text-slate-600" title={job.reportedDefect || undefined}>
                                                        {job.reportedDefect || "No defect reported"}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className={`
                                                            ${job.status === 'Ready' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                                job.status === 'Delivered' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-700'}
                                                        `}>
                                                            {displayJobStatus(job.status)}
                                                        </Badge>
                                                        {job.slaDeadline && (
                                                            <div className="mt-1">
                                                                <SlaTimer deadline={job.slaDeadline} status={job.status} />
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        <div className="font-semibold text-slate-700">{job.batchTargetClearDate ? format(new Date(job.batchTargetClearDate), "dd MMM") : "No target"}</div>
                                                        {job.extensionStatus && job.extensionStatus !== "none" && <div className="mt-1 text-amber-700">Extension {job.extensionStatus}</div>}
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        <Badge variant="outline" className={job.corporateBillId ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-orange-50 text-orange-700 border-orange-200"}>
                                                            {job.corporateBillId ? "Billed" : "Pending"}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        <div className="flex items-center gap-1.5 font-medium text-slate-700">
                                                            <Users className="w-3.5 h-3.5 text-indigo-400" />
                                                            {job.technician || <span className="text-slate-400 italic font-normal">Unassigned</span>}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ) : (
                                <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-1">
                                    {paginatedJobs.map((job) => (
                                        <motion.div variants={tableRowVariants} key={job.id} layout>
                                            <BentoCard
                                                className={`p-0 rounded-[24px] border shadow-sm cursor-pointer overflow-hidden transition-all duration-200 hover:shadow-md hover:border-blue-300 hover:-translate-y-1 ${selectedJobs.includes(job.id) ? 'ring-2 ring-blue-500 bg-blue-50/10 border-blue-200' : 'bg-white border-slate-200/60'}`}
                                                onClick={() => { setSelectedJobForDetails(job); setIsDetailsOpen(true); }}
                                                disableHover={true}
                                            >
                                                <div className="p-5">
                                                    <div className="flex justify-between items-center mb-4">
                                                        <div className="flex items-center gap-2">
                                                            <Checkbox
                                                                checked={selectedJobs.includes(job.id)}
                                                                onCheckedChange={(checked) => {
                                                                    if (checked) setSelectedJobs(prev => [...prev, job.id]);
                                                                    else setSelectedJobs(prev => prev.filter(id => id !== job.id));
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className={`rounded-md h-5 w-5 ${selectedJobs.includes(job.id) ? "border-blue-500 bg-blue-500 text-white" : "border-slate-300"}`}
                                                            />
                                                            <div className="flex items-center gap-2">
                                                                <div className={`w-2.5 h-2.5 rounded-full shadow-sm ${job.status === 'Ready' ? 'bg-emerald-500 shadow-emerald-500/50' : job.status === 'Delivered' ? 'bg-blue-500 shadow-blue-500/50' : 'bg-amber-500 shadow-amber-500/50'}`} />
                                                                <span className="font-mono text-sm font-bold text-slate-600 tracking-wider">#{job.corporateJobNumber || "N/A"}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50" onClick={() => { setSelectedJobForEdit(job); setIsEditJobOpen(true); }}>
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    <div className="mb-4">
                                                        <h3 className="text-lg font-bold text-slate-800 leading-tight mb-1.5">{job.device}</h3>
                                                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono bg-slate-50 w-fit px-2 py-1 rounded-md">
                                                            <span className="font-bold tracking-widest text-slate-400">SN</span>
                                                            {job.tvSerialNumber || "N/A"}
                                                        </div>
                                                        {job.slaDeadline && (
                                                            <div className="mt-3">
                                                                <SlaTimer deadline={job.slaDeadline} status={job.status} />
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-sm mb-4">
                                                        <p className="text-slate-600 line-clamp-2 leading-relaxed text-xs"><span className="font-semibold text-slate-700 mr-1">Reported:</span> {job.reportedDefect || "None specified"}</p>
                                                    </div>

                                                    <div className="flex items-center justify-between mt-auto">
                                                        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-600">
                                                            <div className="w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500 border border-indigo-100">
                                                                <Users size={14} />
                                                            </div>
                                                            {job.technician || <span className="text-slate-400 italic font-normal">Unassigned</span>}
                                                        </div>
                                                        <Badge variant="outline" className={`rounded-xl px-3 py-1 border-none font-bold tracking-wide text-xs ${job.status === 'Ready' ? 'bg-emerald-100 text-emerald-800' :
                                                            job.status === 'Delivered' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'
                                                            }`}>
                                                            {displayJobStatus(job.status)}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </BentoCard>
                                        </motion.div>
                                    ))}
                                </motion.div>
                            )}
                        </div>

                        {/* Pagination Footer */}
                        {totalPages > 0 && (
                            <div className="flex items-center justify-between border-t border-slate-200 bg-white p-4 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)]">
                                <span className="text-sm font-medium text-slate-500">
                                    Showing {(clientPage - 1) * itemsPerPage + 1} to {Math.min(clientPage * itemsPerPage, filteredJobs.length)} of {filteredJobs.length} jobs
                                </span>
                                <div className="flex items-center gap-1 sm:gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setClientPage(p => Math.max(1, p - 1))} disabled={clientPage === 1} className="gap-1 h-8 px-2 sm:px-3 rounded-lg border-slate-200">
                                        <ChevronLeft className="w-4 h-4" /> <span className="hidden sm:inline">Prev</span>
                                    </Button>
                                    <div className="hidden sm:flex items-center gap-1">
                                        {Array.from({ length: totalPages }).map((_, i) => {
                                            // Provide simple windowing for pages if too many
                                            if (totalPages > 7) {
                                                if (i !== 0 && i !== totalPages - 1 && Math.abs(i + 1 - clientPage) > 1) {
                                                    if (i === 1 || i === totalPages - 2) return <span key={i} className="px-1 text-slate-400">...</span>;
                                                    return null;
                                                }
                                            }
                                            return (
                                                <Button
                                                    key={i} variant={clientPage === i + 1 ? "default" : "ghost"} size="sm"
                                                    onClick={() => setClientPage(i + 1)}
                                                    className={`h-8 w-8 p-0 rounded-lg ${clientPage === i + 1 ? 'bg-blue-600 text-white font-bold shadow-sm shadow-blue-500/20' : 'text-slate-600 hover:bg-slate-100'}`}
                                                >
                                                    {i + 1}
                                                </Button>
                                            )
                                        })}
                                    </div>
                                    <div className="sm:hidden flex items-center px-3 font-medium text-sm text-slate-700">
                                        {clientPage} / {totalPages}
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => setClientPage(p => Math.min(totalPages, p + 1))} disabled={clientPage === totalPages} className="gap-1 h-8 px-2 sm:px-3 rounded-lg border-slate-200">
                                        <span className="hidden sm:inline">Next</span> <ChevronRight className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="receive" className="flex-1 overflow-auto p-4 bg-slate-50/30">
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-xl">
                            <FileDown className="h-6 w-6 text-emerald-600 mb-3" />
                            <h3 className="text-lg font-bold text-slate-900">Receive Work</h3>
                            <p className="text-sm text-slate-500 mt-1 mb-5">Add Full TV, Panel, Panel Batch, Board, Parts, Parts Sale, or CRR / Reservice work from one simple entry point.</p>
                            <Button onClick={() => setIsChallanInOpen(true)} className="bg-emerald-600 hover:bg-emerald-700">
                                <FileDown className="h-4 w-4 mr-2" /> Add Incoming Work
                            </Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="deliver" className="flex-1 overflow-auto p-4 bg-slate-50/30">
                        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-xl">
                            <FileUp className="h-6 w-6 text-indigo-600 mb-3" />
                            <h3 className="text-lg font-bold text-slate-900">Delivery</h3>
                            <p className="text-sm text-slate-500 mt-1 mb-5">Select ready items from Work Items, then deliver and print the delivery challan.</p>
                            <div className="flex flex-wrap gap-2">
                                <Button variant="outline" onClick={() => setCockpitFilter("ready")}>
                                    View Ready Items
                                </Button>
                                <Button disabled={selectedJobs.length === 0} onClick={() => setIsChallanOutOpen(true)}>
                                    <FileUp className="h-4 w-4 mr-2" /> Deliver Selected
                                </Button>
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="history" className="flex-1 lg:overflow-hidden p-4">
                        {null}
                    </TabsContent>

                    <TabsContent value="billing" className="flex-1 lg:overflow-hidden p-4">
                        <CorporateBillsTable clientId={client?.id || ""} />
                    </TabsContent>

                    <TabsContent value="portal-access" className="flex-1 overflow-hidden p-4">
                        <div className="mb-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                            <div className="font-black">Corporate Portal Credentials</div>
                            <div className="mt-1 text-xs">
                                Passwords are not recoverable after creation. Use a 6-digit reset code for client-assisted recovery, or issue an instant temporary password only when needed.
                            </div>
                        </div>
                        {client?.id && <CorporateUsersTable clientId={selectedClientId || ""} />}
                    </TabsContent>

                    <TabsContent value="service-warranty" className="flex-1 lg:overflow-hidden p-4">
                        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
                            <WarrantyClaimsTable jobIds={jobs.map((job: any) => job.id)} />
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                <h3 className="font-bold text-slate-900">Extension Requests</h3>
                                <p className="text-xs text-slate-500 mt-1">Corporate client must accept or reject delayed batch items.</p>
                                <div className="mt-4 space-y-2">
                                    {extensionRequests.slice(0, 8).map((request: any) => {
                                        const job = jobs.find((item: any) => item.id === request.jobId);
                                        return (
                                            <div key={request.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="font-bold text-sm text-slate-800">{job?.corporateJobNumber || request.jobId}</div>
                                                    <Badge variant={request.status === "pending" ? "default" : "outline"}>{request.status}</Badge>
                                                </div>
                                                <div className="mt-1 text-xs text-slate-500">Until {format(new Date(request.requestedUntil), "dd MMM yyyy")}</div>
                                                <div className="mt-2 text-xs text-slate-600">{request.reason}</div>
                                            </div>
                                        );
                                    })}
                                    {extensionRequests.length === 0 && <div className="rounded-xl border border-dashed p-4 text-sm text-slate-500">No extension requests yet.</div>}
                                </div>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </BentoCard>
                    </>
                )}
            </div>

            {/* Dialogs */}
            <Dialog open={isChallanInOpen} onOpenChange={setIsChallanInOpen}>
                <DialogContent className="h-screen w-screen max-w-none overflow-hidden p-0 sm:rounded-none">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Add Incoming Work</DialogTitle>
                        <DialogDescription>Receive B2B work items by manual entry or file import.</DialogDescription>
                    </DialogHeader>
                    <ChallanInWizard clientId={selectedClientId} onClose={() => setIsChallanInOpen(false)} userName={user?.name || "Admin"} />
                </DialogContent>
            </Dialog>

            <Dialog open={isChallanOutOpen} onOpenChange={setIsChallanOutOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Deliver Items</DialogTitle>
                        <DialogDescription>Generating delivery challan for {selectedJobs.length} items.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Receiver Name</label>
                            <Input value={receiverName} onChange={e => setReceiverName(e.target.value)} placeholder="e.g. John Doe" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Receiver Phone</label>
                            <Input value={receiverPhone} onChange={e => setReceiverPhone(e.target.value)} placeholder="017..." />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsChallanOutOpen(false)}>Cancel</Button>
                        <Button onClick={() => createChallanOutMutation.mutate()} disabled={createChallanOutMutation.isPending}>
                            {createChallanOutMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Deliver
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isExtensionRequestOpen} onOpenChange={setIsExtensionRequestOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Request Batch Clearance Extension</DialogTitle>
                        <DialogDescription>
                            Ask the corporate client before holding this item longer than the batch target.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                            Selected item: {selectedJobObjects[0] ? getSafeJobDisplayRef(selectedJobObjects[0]) : "None"}
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Requested Until</label>
                            <Input type="date" value={extensionUntil} onChange={(e) => setExtensionUntil(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Reason</label>
                            <Input value={extensionReason} onChange={(e) => setExtensionReason(e.target.value)} placeholder="Example: panel line needed, waiting for special part" />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsExtensionRequestOpen(false)}>Cancel</Button>
                        <Button onClick={() => createExtensionRequestMutation.mutate()} disabled={createExtensionRequestMutation.isPending}>
                            {createExtensionRequestMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send Request
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isRulesOpen} onOpenChange={setIsRulesOpen}>
                <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit Client Rules</DialogTitle>
                        <DialogDescription>
                            Set the default B2B rules used for receiving work, service warranty, batch clearance, and reminders.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-5 py-2">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700">Client Type</label>
                                <Select value={clientRulesForm.clientType} onValueChange={(value) => setClientRulesForm(prev => ({ ...prev, clientType: value }))}>
                                    <SelectTrigger className="rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {clientTypeOptions.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700">Payment Time</label>
                                <Select value={clientRulesForm.paymentTerms} onValueChange={(value) => setClientRulesForm(prev => ({ ...prev, paymentTerms: value }))}>
                                    <SelectTrigger className="rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="30">30 working days</SelectItem>
                                        <SelectItem value="60">60 working days</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700">Batch Clearance Days</label>
                                <Input type="number" min={1} max={90} value={clientRulesForm.defaultBatchClearanceDays} onChange={(e) => setClientRulesForm(prev => ({ ...prev, defaultBatchClearanceDays: e.target.value }))} className="rounded-xl" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700">Billing Cycle</label>
                                <Select value={clientRulesForm.billingCycle} onValueChange={(value) => setClientRulesForm(prev => ({ ...prev, billingCycle: value }))}>
                                    <SelectTrigger className="rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="weekly">Weekly</SelectItem>
                                        <SelectItem value="monthly">Monthly</SelectItem>
                                        <SelectItem value="batch">Per batch</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                            <div className="mb-3 text-sm font-black text-slate-800">Allowed Work Types</div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {workTypeOptions.map((option) => {
                                    const checked = clientRulesForm.allowedWorkTypes.includes(option.value);
                                    return (
                                        <label key={option.value} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-bold transition ${checked ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-700"}`}>
                                            <Checkbox
                                                checked={checked}
                                                onCheckedChange={() => setClientRulesForm(prev => ({
                                                    ...prev,
                                                    allowedWorkTypes: checked ? prev.allowedWorkTypes.filter((item) => item !== option.value) : [...prev.allowedWorkTypes, option.value],
                                                }))}
                                            />
                                            {option.label}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <label className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-sm font-bold text-slate-700">
                                <Checkbox checked={clientRulesForm.requiresChallanIn} onCheckedChange={(checked) => setClientRulesForm(prev => ({ ...prev, requiresChallanIn: checked === true }))} />
                                Requires challan in
                            </label>
                            <label className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-sm font-bold text-slate-700">
                                <Checkbox checked={clientRulesForm.requiresChallanOut} onCheckedChange={(checked) => setClientRulesForm(prev => ({ ...prev, requiresChallanOut: checked === true }))} />
                                Requires challan out
                            </label>
                        </div>

                        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-sm font-black text-slate-800">Service Warranty</div>
                                    <div className="text-xs font-medium text-slate-500">Use service warranty wording for B2B work.</div>
                                </div>
                                <Checkbox checked={clientRulesForm.serviceWarrantyEnabled} onCheckedChange={(checked) => setClientRulesForm(prev => ({ ...prev, serviceWarrantyEnabled: checked === true }))} />
                            </div>
                            <Input type="number" min={0} max={365} disabled={!clientRulesForm.serviceWarrantyEnabled} value={clientRulesForm.defaultServiceWarrantyDays} onChange={(e) => setClientRulesForm(prev => ({ ...prev, defaultServiceWarrantyDays: e.target.value }))} className="rounded-xl bg-white" />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700">CRR / Re-service Rule</label>
                                <Select value={clientRulesForm.crrRule} onValueChange={(value) => setClientRulesForm(prev => ({ ...prev, crrRule: value }))}>
                                    <SelectTrigger className="rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="no_charge_inside_service_warranty">No charge inside service warranty</SelectItem>
                                        <SelectItem value="review_before_no_charge">Review before no-charge</SelectItem>
                                        <SelectItem value="always_charge">Always charge</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700">Reminder Rule</label>
                                <Select value={clientRulesForm.reminderRule} onValueChange={(value) => setClientRulesForm(prev => ({ ...prev, reminderRule: value }))}>
                                    <SelectTrigger className="rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="due_soon_and_overdue">Due soon and overdue</SelectItem>
                                        <SelectItem value="overdue_only">Overdue only</SelectItem>
                                        <SelectItem value="manual_only">Manual only</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRulesOpen(false)}>Cancel</Button>
                        <Button onClick={() => updateClientRulesMutation.mutate()} disabled={updateClientRulesMutation.isPending || clientRulesForm.allowedWorkTypes.length === 0}>
                            {updateClientRulesMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Rules
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <JobDetailsSheet
                job={selectedJobForDetails}
                open={isDetailsOpen}
                onOpenChange={setIsDetailsOpen}
                onEditClick={() => {
                    setIsDetailsOpen(false);
                    setSelectedJobForEdit(selectedJobForDetails);
                    setTimeout(() => setIsEditJobOpen(true), 300);
                }}
            />
            <EditJobDialog
                job={selectedJobForEdit}
                open={isEditJobOpen}
                onOpenChange={setIsEditJobOpen}
                technicians={technicians.map((t: any) => ({ id: t.id, name: t.name, role: t.role || 'technician' }))}
            />
            <GenerateBillDialog open={isGenerateBillOpen} onOpenChange={setIsGenerateBillOpen} clientId={selectedClientId} selectedJobs={jobs?.filter((j: any) => selectedJobs.includes(j.id)) || []} onSuccess={() => setSelectedJobs([])} />
            <BulkAssignTechnicianDialog open={isBulkAssignOpen} onOpenChange={setIsBulkAssignOpen} jobs={jobs?.filter((j: any) => selectedJobs.includes(j.id)) || []} technicians={technicians} onSuccess={() => setSelectedJobs([])} />
            <CreateWarrantyClaimDialog
                job={selectedJobForCrr}
                open={!!selectedJobForCrr}
                onOpenChange={(open) => {
                    if (!open) setSelectedJobForCrr(null);
                }}
            />
        </div>
    );
}
