import { motion, AnimatePresence } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { jobTicketsApi, adminUsersApi } from "@/lib/api";
import { JobTicket, InsertJobTicket } from "@shared/schema"; // Ensure shared/schema is available
import { format } from "date-fns";
import { Loader2, Save, History, Shield, Info, DollarSign, Building, Plus, X, Pencil, ShoppingCart } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { JobChargesDialog } from "@/components/admin/corporate/JobChargesDialog";
import { CreateWarrantyClaimDialog } from "@/components/admin/corporate/CreateWarrantyClaimDialog";
import { LocalPurchaseModal } from "@/components/inventory/LocalPurchaseModal";
import { SlaTimer } from "@/components/admin/corporate/SlaTimer";

interface JobDetailsSheetProps {
    job: JobTicket | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onEditClick?: () => void;
}

export function JobDetailsSheet({ job, open, onOpenChange, onEditClick }: JobDetailsSheetProps) {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState("info");
    const [isChargesOpen, setIsChargesOpen] = useState(false);
    const [isWarrantyClaimOpen, setIsWarrantyClaimOpen] = useState(false);
    const [isLocalPurchaseOpen, setIsLocalPurchaseOpen] = useState(false);

    // Warranty State

    // Warranty State
    const [warrantyDays, setWarrantyDays] = useState("");
    const [gracePeriodDays, setGracePeriodDays] = useState("");
    const [warrantyNotes, setWarrantyNotes] = useState("");

    useEffect(() => {
        if (job) {
            setWarrantyDays(job.warrantyDays?.toString() || "30");
            setGracePeriodDays(job.gracePeriodDays?.toString() || "7");
            setWarrantyNotes(job.warrantyNotes || "");
        }
    }, [job]);

    const { data: history = [], isLoading: isLoadingHistory } = useQuery({
        queryKey: ["jobHistory", job?.id],
        queryFn: () => job ? jobTicketsApi.getHistory(job.id) : Promise.resolve([]),
        enabled: !!job && open && activeTab === "history",
    });

    const { data: usersData } = useQuery({
        queryKey: ["users"],
        queryFn: () => adminUsersApi.lookup(),
        staleTime: 5 * 60 * 1000,
    });

    const parsedAssistedIds = typeof job?.assistedByIds === 'string' ? JSON.parse(job.assistedByIds) : (job?.assistedByIds || []);
    const assistTeamNames = parsedAssistedIds
        ?.map((id: string) => (usersData as any[])?.find((u: any) => u.id === id)?.name || "Unknown")
        ?.join(", ");

    const updateJobMutation = useMutation({
        mutationFn: (updates: Partial<InsertJobTicket>) => {
            if (!job) throw new Error("No job selected");
            return jobTicketsApi.update(job.id, updates);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["job-tickets"] });
            toast.success("Job updated successfully");
        },
        onError: (error: any) => {
            toast.error(error.message || "Failed to update job");
        },
    });

    const handleSaveWarranty = () => {
        updateJobMutation.mutate({
            warrantyDays: parseInt(warrantyDays) || 30,
            gracePeriodDays: parseInt(gracePeriodDays) || 7,
            warrantyNotes: warrantyNotes,
        });
    };

    return (
        <AnimatePresence>
            {open && job && (
                <div className="fixed inset-0 z-40 flex justify-end">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => onOpenChange(false)}
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, x: '100%' }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: '100%' }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="relative w-full sm:max-w-[520px] h-full bg-white shadow-2xl overflow-hidden flex flex-col z-10"
                    >
                        {/* Header */}
                        <div className="p-5 sm:p-6 pb-4 border-b bg-slate-50 shrink-0 relative">
                            <div className="absolute right-3 top-3 flex items-center gap-1">
                                {onEditClick && (
                                    <Button variant="ghost" size="sm" className="hidden sm:flex text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={onEditClick}>
                                        <Pencil className="h-4 w-4 mr-2" /> Edit Job
                                    </Button>
                                )}
                                <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-200" onClick={() => onOpenChange(false)}>
                                    <X className="h-5 w-5 text-slate-500" />
                                </Button>
                            </div>
                            <div>
                                <h1 className="text-xl font-bold flex items-center gap-2 text-slate-800 tracking-tight">
                                    Job #{job.corporateJobNumber || job.id.substring(0, 8)}
                                    <Badge variant={job.status === "Closed" ? "secondary" : "default"}>
                                        {job.status}
                                    </Badge>
                                    {job.slaDeadline && (
                                        <SlaTimer deadline={job.slaDeadline} status={job.status} />
                                    )}
                                </h1>
                                <p className="mt-1 text-sm text-slate-500">
                                    {job.device} - {job.issue}
                                </p>
                            </div>
                        </div>

                        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                                <div className="px-6 border-b">
                                    <TabsList className="w-full justify-start h-12 bg-transparent p-0 gap-4">
                                        <TabsTrigger
                                            value="info"
                                            className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-none border-b-2 border-transparent data-[state=active]:border-primary h-full px-4"
                                        >
                                            <Info className="w-4 h-4 mr-2" />
                                            Info
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value="history"
                                            className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-none border-b-2 border-transparent data-[state=active]:border-primary h-full px-4"
                                        >
                                            <History className="w-4 h-4 mr-2" />
                                            History
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value="warranty"
                                            className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-none border-b-2 border-transparent data-[state=active]:border-primary h-full px-4"
                                        >
                                            <Shield className="w-4 h-4 mr-2" />
                                            Warranty
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value="charges"
                                            className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-none border-b-2 border-transparent data-[state=active]:border-primary h-full px-4"
                                        >
                                            <DollarSign className="w-4 h-4 mr-2" />
                                            Charges
                                        </TabsTrigger>
                                        {onEditClick && (
                                            <div className="ml-auto pr-4 hidden sm:flex items-center">
                                                {/* Edit gets its own space on desktop in header, handled above */}
                                            </div>
                                        )}
                                    </TabsList>
                                </div>

                                {/* Floating Mobile Action Button */}
                                {onEditClick && (
                                    <div className="sm:hidden px-6 pt-4 pb-2 shrink-0">
                                        <Button onClick={onEditClick} className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 rounded-xl h-11 text-sm font-semibold">
                                            <Pencil className="w-4 h-4 mr-2" /> Action / Edit Details
                                        </Button>
                                    </div>
                                )}

                                <ScrollArea className="flex-1 p-6">
                                    <TabsContent value="info" className="mt-0 space-y-6">
                                        <div className="p-5 bg-white border border-slate-100 rounded-xl shadow-sm">
                                            <div className="pb-3 mb-3 border-b border-slate-50">
                                                <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                                                    <Building className="w-4 h-4 text-blue-500" />
                                                    Corporate Reference
                                                </h3>
                                            </div>
                                            <div className="grid gap-3 text-sm">
                                                <div className="flex justify-between items-center group">
                                                    <span className="text-slate-500 font-medium">Our Job No:</span>
                                                    <span className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                                                        {job.corporateJobNumber || "N/A"}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center group">
                                                    <span className="text-slate-500 font-medium">System ID:</span>
                                                    <span className="font-medium text-slate-700">
                                                        {job.id.substring(0, 10)}...
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-start group">
                                                    <span className="text-slate-500 font-medium mt-0.5">Device:</span>
                                                    <span className="text-right max-w-[200px] text-slate-700 leading-snug">
                                                        {job.device || "N/A"}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-5 bg-white border border-slate-100 rounded-xl shadow-sm">
                                            <div className="pb-3 mb-3 border-b border-slate-50">
                                                <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                                                    <Info className="w-4 h-4 text-indigo-500" />
                                                    Job Specifics
                                                </h3>
                                            </div>
                                            <div className="grid gap-3 text-sm">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-slate-500 font-medium">Technician:</span>
                                                    <span className="font-semibold text-slate-900">{job.technician || "Unassigned"}</span>
                                                </div>
                                                {job.assistedByIds && job.assistedByIds.length > 0 && (
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-slate-500 font-medium">Assist Team:</span>
                                                        <span className="font-semibold text-slate-900">{assistTeamNames || "None"}</span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between items-center">
                                                    <span className="text-slate-500 font-medium">Priority:</span>
                                                    <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200">{job.priority}</Badge>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-slate-500 font-medium">Deadline:</span>
                                                    <span className="font-medium text-slate-700">
                                                        {job.deadline ? format(new Date(job.deadline), "PP") : "None"}
                                                    </span>
                                                </div>
                                                <Separator className="my-1 border-slate-100" />
                                                <div>
                                                    <span className="text-slate-500 font-medium block mb-2">Issue Description:</span>
                                                    <p className="bg-slate-50/80 p-3 rounded-lg text-xs leading-relaxed text-slate-700 border border-slate-100">{job.issue}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="history" className="mt-0">
                                        {isLoadingHistory ? (
                                            <div className="flex justify-center py-8">
                                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                            </div>
                                        ) : history.length === 0 ? (
                                            <div className="text-center py-8 text-muted-foreground">No history found.</div>
                                        ) : (
                                            <div className="space-y-4">
                                                {history.map((log: any) => (
                                                    <div key={log.id} className="flex gap-4 text-sm bg-card p-3 rounded border">
                                                        <div className="min-w-24 text-xs text-muted-foreground py-1">
                                                            {(log.timestamp || log.createdAt) && !isNaN(new Date(log.timestamp || log.createdAt).getTime())
                                                                ? format(new Date(log.timestamp || log.createdAt), "PP p")
                                                                : "Unknown Time"}
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="font-medium">{log.action.replace(/_/g, " ")}</div>
                                                            <div className="text-muted-foreground text-xs mt-1">{log.details}</div>
                                                            <div className="text-xs text-primary mt-1">by {log.userName || "System"}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </TabsContent>

                                    <TabsContent value="warranty" className="mt-0 space-y-6">
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label>Warranty Period (Days)</Label>
                                                    <Input
                                                        type="number"
                                                        value={warrantyDays}
                                                        onChange={(e) => setWarrantyDays(e.target.value)}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Grace Period (Days)</Label>
                                                    <Input
                                                        type="number"
                                                        value={gracePeriodDays}
                                                        onChange={(e) => setGracePeriodDays(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Warranty Notes / Terms</Label>
                                                <Textarea
                                                    value={warrantyNotes}
                                                    onChange={(e) => setWarrantyNotes(e.target.value)}
                                                    placeholder="Enter specific warranty terms for corporate client..."
                                                    className="min-h-[100px]"
                                                />
                                            </div>
                                            <Button onClick={handleSaveWarranty} disabled={updateJobMutation.isPending}>
                                                {updateJobMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                Save Warranty Terms
                                            </Button>

                                            {job && ['Completed', 'Delivered', 'Closed'].includes(job.status) && (
                                                <>
                                                    <Separator className="my-4" />
                                                    <div className="bg-red-50 p-4 rounded-md border border-red-100">
                                                        <h4 className="font-medium text-red-900 mb-2 flex items-center gap-2">
                                                            <Shield className="h-4 w-4" />
                                                            Warranty Claim
                                                        </h4>
                                                        <p className="text-sm text-red-700 mb-4">
                                                            If this device has returned with a recurring issue covered under warranty, you can initiate a claim here.
                                                        </p>
                                                        <Button
                                                            variant="destructive"
                                                            className="w-full"
                                                            onClick={() => setIsWarrantyClaimOpen(true)}
                                                        >
                                                            Create Warranty Claim
                                                        </Button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </TabsContent>

                                    <TabsContent value="charges" className="mt-0">
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center bg-muted/20 p-4 rounded-lg border">
                                                <div>
                                                    <h3 className="font-medium text-sm">Estimated Cost</h3>
                                                    <p className="text-2xl font-bold text-primary">
                                                        {job.estimatedCost ? `${job.estimatedCost.toFixed(2)} BDT` : "0.00 BDT"}
                                                    </p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button size="sm" variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => setIsLocalPurchaseOpen(true)}>
                                                        <ShoppingCart className="w-4 h-4 mr-2" />
                                                        Source Locally
                                                    </Button>
                                                    <Button size="sm" onClick={() => setIsChargesOpen(true)}>
                                                        <Plus className="w-4 h-4 mr-2" />
                                                        Manage Charges
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Read-only Charges List */}
                                            <div className="space-y-2">
                                                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Itemized Breakdown</Label>
                                                {(!job.charges || (Array.isArray(job.charges) && job.charges.length === 0)) ? (
                                                    <div className="text-center py-8 text-muted-foreground bg-muted/10 rounded border border-dashed">
                                                        No charges added yet.
                                                    </div>
                                                ) : (
                                                    <div className="border rounded-md divide-y">
                                                        {(job.charges as any[]).map((charge, idx) => (
                                                            <div key={idx} className="flex justify-between p-3 text-sm">
                                                                <div>
                                                                    <div className="font-medium">{charge.description}</div>
                                                                    <Badge variant="outline" className="text-[10px] uppercase mt-1 text-muted-foreground h-5">
                                                                        {charge.type}
                                                                    </Badge>
                                                                </div>
                                                                <div className="font-mono">
                                                                    {charge.amount?.toFixed(2)}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </TabsContent>
                                </ScrollArea>
                            </Tabs>
                        </div>
                        <JobChargesDialog
                            job={job}
                            open={isChargesOpen}
                            onOpenChange={setIsChargesOpen}
                        />
                        <CreateWarrantyClaimDialog
                            job={job}
                            open={isWarrantyClaimOpen}
                            onOpenChange={setIsWarrantyClaimOpen}
                        />
                        <LocalPurchaseModal
                            jobTicketId={job.id}
                            open={isLocalPurchaseOpen}
                            onOpenChange={setIsLocalPurchaseOpen}
                        />
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
