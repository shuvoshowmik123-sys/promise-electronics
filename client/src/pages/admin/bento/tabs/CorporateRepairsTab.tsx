import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    ArrowLeft, FileDown, FileUp, Filter, MoreVertical, Printer, Search,
    Loader2, Users, Receipt, CreditCard, Pencil, Eye, Building2, Check,
    LayoutGrid, List, ChevronLeft, ChevronRight
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format, isWithinInterval } from "date-fns";
import { DateRange } from "react-day-picker";
import { useToast } from "@/hooks/use-toast"; // Use existing hook
import { corporateApi, adminUsersApi } from "@/lib/api";
import { smartMatch } from "../shared/smartMatch";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

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
import { ChallanInWizard } from "@/components/admin/challan/ChallanInWizard";
import { SlaTimer } from "@/components/admin/corporate/SlaTimer";
import CorporateMessagesTab from "./CorporateMessagesTab";

import { DashboardSkeleton, BentoCard, containerVariants, itemVariants, tableRowVariants } from "../shared";

interface CorporateRepairsTabProps {
    initialClientId?: string | null;
    initialSearchQuery?: string;
    onSearchConsumed?: () => void;
    onBack?: () => void;
}

export default function CorporateRepairsTab({ initialClientId, initialSearchQuery, onSearchConsumed, onBack }: CorporateRepairsTabProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { user } = useAdminAuth();

    // If no client is passed, we allow selecting one
    const [selectedClientId, setSelectedClientId] = useState<string | null>(initialClientId || null);

    // Fetch all corporate clients for the selector
    const { data: clients = [] } = useQuery({
        queryKey: ["corporate-clients"],
        queryFn: corporateApi.getAll,
        enabled: !selectedClientId
    });

    const [selectedJobs, setSelectedJobs] = useState<string[]>([]);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [billingFilter, setBillingFilter] = useState("all");
    const [technicianFilter, setTechnicianFilter] = useState("all");
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [activeTab, setActiveTab] = useState("jobs");
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
    const [isChallanInOpen, setIsChallanInOpen] = useState(false);
    const [isChallanOutOpen, setIsChallanOutOpen] = useState(false);

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
                    id: j.id, jobNo: j.corporateJobNumber || j.id, brand: (j.device || '').split(' ')[0] || "Unknown",
                    model: j.device || "Unknown", serial: j.tvSerialNumber || "", problem: j.reportedDefect || "", status: j.status
                }))
            });
            toast({ title: "Challan OUT Created" });
            setIsChallanOutOpen(false);
            setSelectedJobs([]);
            queryClient.invalidateQueries({ queryKey: ["corporateJobs"] });
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

            return matchesSearch && matchesStatus && matchesTechnician && matchesDate && matchesBilling;
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
    }, [jobs, search, statusFilter, technicianFilter, dateRange, billingFilter]);

    const itemsPerPage = 10;
    const totalPages = Math.ceil((filteredJobs?.length || 0) / itemsPerPage);
    const paginatedJobs = filteredJobs?.slice((clientPage - 1) * itemsPerPage, clientPage * itemsPerPage) || [];
    const allVisibleJobsSelected = paginatedJobs.length > 0 && paginatedJobs.every((job) => selectedJobs.includes(job.id));

    useEffect(() => {
        setClientPage(1);
        setSelectedJobs([]);
    }, [
        selectedClientId,
        activeTab,
        statusFilter,
        billingFilter,
        technicianFilter,
        dateRange?.from?.getTime(),
        dateRange?.to?.getTime(),
    ]);

    useEffect(() => {
        if (totalPages === 0 && clientPage !== 1) {
            setClientPage(1);
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
        <div className="flex flex-col h-full min-h-0 gap-4 overflow-y-auto lg:overflow-hidden lg:pb-0 pb-20 pt-1 px-1 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
            {/* Hidden Print Components */}
            <div className="hidden print:block">
                {jobForPrint && <CorporateSingleJobPrint job={jobForPrint} />}
                {jobsForMultiPrint.length > 0 && client && <CorporateMultiJobPrint jobs={jobsForMultiPrint} client={client} />}
                {challanOutPrintData && <ChallanOutPrint data={challanOutPrintData} />}
            </div>

            {/* Header - Desktop */}
            <BentoCard variant="ghost" className="hidden lg:flex flex-col md:flex-row md:items-center justify-between gap-4 py-4 px-6 shadow-sm border-slate-200/60" disableHover>
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => {
                        if (onBack) {
                            onBack();
                        } else {
                            setSelectedClientId(null);
                        }
                    }}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            {client?.companyName || "Loading..."}
                            {client && <Badge variant="secondary">{client.shortCode}</Badge>}
                        </h1>
                        <p className="text-xs text-muted-foreground">Corporate Repair Manager</p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    {activeTab === 'jobs' && (
                        <>
                            <Button className="gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm rounded-xl bc-hover bc-rise transition-all" variant="outline" onClick={() => setIsChallanInOpen(true)}>
                                <FileDown className="h-4 w-4" /> Challan IN
                            </Button>
                            <Button
                                className="gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm rounded-xl bc-hover bc-rise transition-all"
                                variant="outline"
                                disabled={selectedJobs.length === 0}
                                onClick={() => setIsBulkAssignOpen(true)}
                            >
                                <Users className="h-4 w-4" /> Bulk Assign
                            </Button>
                            <Button
                                className="gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm rounded-xl bc-hover bc-rise transition-all"
                                variant="outline"
                                disabled={selectedJobs.length === 0}
                                onClick={() => {
                                    const jobsToPrint = jobs?.filter((j: any) => selectedJobs.includes(j.id)) || [];
                                    setJobsForMultiPrint(jobsToPrint);
                                }}
                            >
                                <Printer className="h-4 w-4" /> Print
                            </Button>
                            <Button
                                disabled={selectedJobs.length === 0}
                                onClick={() => setIsGenerateBillOpen(true)}
                                className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20 rounded-xl bc-hover bc-rise transition-all"
                            >
                                <Receipt className="h-4 w-4" /> Bill
                            </Button>
                            <Button
                                className="gap-2 border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm rounded-xl bc-hover bc-rise transition-all"
                                variant="outline"
                                disabled={selectedJobs.length === 0}
                                onClick={() => setIsChallanOutOpen(true)}
                            >
                                <FileUp className="h-4 w-4" /> Challan OUT
                            </Button>
                        </>
                    )}
                </div>
            </BentoCard>

            {/* Header - Mobile (Hero Card) */}
            <div className="lg:hidden relative overflow-hidden bg-gradient-to-br from-indigo-600 to-violet-600 text-white p-5 rounded-3xl shadow-lg shadow-indigo-500/20 mb-1 shrink-0">
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

            {/* Mobile Bento Action Grid */}
            <div className="lg:hidden grid grid-cols-2 gap-3 shrink-0">
                <BentoCard className="flex flex-col items-center justify-center p-4 gap-2 border-emerald-100 bg-emerald-50/40 hover:bg-emerald-50 cursor-pointer shadow-sm active:scale-95 transition-transform" disableHover onClick={() => setIsChallanInOpen(true)}>
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-1 shadow-sm">
                        <FileDown className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-semibold text-emerald-800">Challan IN</span>
                </BentoCard>
                <BentoCard className="flex flex-col items-center justify-center p-4 gap-2 border-violet-100 bg-violet-50/40 hover:bg-violet-50 cursor-pointer shadow-sm active:scale-95 transition-transform" disableHover onClick={() => {
                    if (selectedJobs.length === 0) toast({ title: "Select Jobs", description: "Select items first to bill.", variant: "destructive" });
                    else setIsGenerateBillOpen(true);
                }}>
                    <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 mb-1 shadow-sm">
                        <Receipt className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-semibold text-violet-800">Bill Selected</span>
                </BentoCard>
                <BentoCard className="flex flex-col items-center justify-center p-4 gap-2 border-amber-100 bg-amber-50/40 hover:bg-amber-50 cursor-pointer shadow-sm active:scale-95 transition-transform" disableHover onClick={() => {
                    if (selectedJobs.length === 0) toast({ title: "Select Jobs", description: "Select items first.", variant: "destructive" });
                    else setIsChallanOutOpen(true);
                }}>
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 mb-1 shadow-sm">
                        <FileUp className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-semibold text-amber-800">Challan OUT</span>
                </BentoCard>
                <BentoCard className="flex flex-col items-center justify-center p-4 gap-2 border-slate-200 bg-slate-50/40 hover:bg-slate-100 cursor-pointer shadow-sm active:scale-95 transition-transform" disableHover onClick={() => {
                    if (selectedJobs.length === 0) toast({ title: "Select Jobs", description: "Select items first to print.", variant: "destructive" });
                    else {
                        const jobsToPrint = jobs?.filter((j: any) => selectedJobs.includes(j.id)) || [];
                        setJobsForMultiPrint(jobsToPrint);
                    }
                }}>
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 mb-1 shadow-sm">
                        <Printer className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-semibold text-slate-800">Print Selected</span>
                </BentoCard>
            </div>

            {/* Main Tabs */}
            <BentoCard variant="ghost" className="flex-1 flex flex-col p-0 lg:overflow-hidden lg:border-slate-200/60 lg:bg-white border-transparent bg-transparent" disableHover>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                    <div className="pb-1 px-1 lg:px-4 lg:bg-slate-50 lg:border-b shrink-0 z-10 sticky top-0 bg-slate-50/90 backdrop-blur-md lg:bg-transparent -mx-1 lg:mx-0 pt-1 lg:pt-0">
                        <TabsList className="bg-slate-200/50 p-1 w-full flex lg:inline-flex rounded-full lg:h-12 h-auto shadow-inner shadow-slate-300/30 overflow-x-auto gap-1">
                            <TabsTrigger value="jobs" className="rounded-full flex-1 lg:flex-none data-[state=active]:shadow-md data-[state=active]:bg-white py-2 lg:py-1.5 text-xs lg:text-sm transition-all whitespace-nowrap px-4 font-semibold">Repair Jobs</TabsTrigger>
                            <TabsTrigger value="history" className="rounded-full flex-1 lg:flex-none data-[state=active]:shadow-md data-[state=active]:bg-white py-2 lg:py-1.5 text-xs lg:text-sm transition-all whitespace-nowrap px-4 font-semibold">History</TabsTrigger>
                            <TabsTrigger value="billing" className="rounded-full flex-1 lg:flex-none data-[state=active]:shadow-md data-[state=active]:bg-white py-2 lg:py-1.5 text-xs lg:text-sm transition-all whitespace-nowrap px-4 font-semibold">Billing</TabsTrigger>
                            <TabsTrigger value="messages" className="hidden lg:inline-flex rounded-full flex-1 lg:flex-none data-[state=active]:shadow-md data-[state=active]:bg-white py-2 lg:py-1.5 text-xs lg:text-sm transition-all whitespace-nowrap px-4 font-semibold">Messages</TabsTrigger>
                            <TabsTrigger value="users" className="hidden lg:inline-flex rounded-full flex-1 lg:flex-none data-[state=active]:shadow-md data-[state=active]:bg-white py-2 lg:py-1.5 text-xs lg:text-sm transition-all whitespace-nowrap px-4 font-semibold">Users</TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="jobs" className="flex-1 flex flex-col p-0 m-0 lg:overflow-hidden">
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
                                    {(statusFilter !== "all" || billingFilter !== "all" || technicianFilter !== "all" || dateRange) && (
                                        <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center rounded-full bg-blue-100 text-blue-700 border-none shadow-none font-bold">!</Badge>
                                    )}
                                </Button>
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
                                            onReset={() => { setStatusFilter("all"); setBillingFilter("all"); setTechnicianFilter("all"); setDateRange(undefined); setSearch(""); setClientPage(1); }}
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
                                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-w-[800px]">
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
                                                            {job.status}
                                                        </Badge>
                                                        {job.slaDeadline && (
                                                            <div className="mt-1">
                                                                <SlaTimer deadline={job.slaDeadline} status={job.status} />
                                                            </div>
                                                        )}
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
                                                            {job.status}
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

                    <TabsContent value="history" className="flex-1 lg:overflow-hidden p-4">
                        {client && <ChallanHistoryTable client={client} />}
                    </TabsContent>

                    <TabsContent value="billing" className="flex-1 lg:overflow-hidden p-4">
                        <CorporateBillsTable clientId={client?.id || ""} />
                    </TabsContent>

                    <TabsContent value="messages" className="flex-1 lg:overflow-hidden p-0 m-0 relative">
                        {client && <CorporateMessagesTab preSelectedClientId={client.id} hideSidebar={true} />}
                    </TabsContent>

                    <TabsContent value="users" className="flex-1 lg:overflow-hidden p-4">
                        <CorporateUsersTable clientId={client?.id || ""} />
                    </TabsContent>
                </Tabs>
            </BentoCard>

            {/* Dialogs */}
            <Dialog open={isChallanInOpen} onOpenChange={setIsChallanInOpen}>
                <DialogContent className="sm:max-w-4xl max-h-[90vh]">
                    <ChallanInWizard clientId={selectedClientId} onClose={() => setIsChallanInOpen(false)} userName={user?.name || "Admin"} />
                </DialogContent>
            </Dialog>

            <Dialog open={isChallanOutOpen} onOpenChange={setIsChallanOutOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Challan OUT</DialogTitle>
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
                            {createChallanOutMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Generate
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
        </div>
    );
}
