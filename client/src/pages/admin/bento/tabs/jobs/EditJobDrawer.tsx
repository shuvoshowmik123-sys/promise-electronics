import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { PenTool, Zap, Lock, ArrowRight, Loader2 } from "lucide-react";
import { jobTicketsApi } from "@/lib/api";
import { toast } from "sonner";
import { TechnicianPicker } from "@/components/admin/TechnicianPicker";
import { AdvanceStatusDialog } from "@/components/admin/workflow/AdvanceStatusDialog";
import { RequestRollbackDialog } from "@/components/admin/workflow/RequestRollbackDialog";
import { JobTicket, InsertJobTicket } from "@shared/schema";

interface EditJobDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    job: JobTicket | null;
    technicianUsers: any[];
    userRole?: string;
    canEdit: boolean;
    currencySymbol: string;
}

export function EditJobDrawer({
    isOpen,
    onClose,
    job,
    technicianUsers,
    userRole,
    canEdit,
    currencySymbol
}: EditJobDrawerProps) {
    const queryClient = useQueryClient();

    const [editFormData, setEditFormData] = useState<Partial<InsertJobTicket>>({});
    const [selectedAssistedBy, setSelectedAssistedBy] = useState<string[]>([]);

    const [isAdvanceDialogOpen, setIsAdvanceDialogOpen] = useState(false);
    const [isRollbackDialogOpen, setIsRollbackDialogOpen] = useState(false);

    useEffect(() => {
        if (job && isOpen) {
            setEditFormData({
                id: job.id,
                customer: job.customer,
                device: job.device,
                issue: job.issue,
                status: job.status,
                priority: job.priority,
                technician: job.technician || "Unassigned",
                screenSize: job.screenSize || "",
                notes: job.notes || "",
                receivedAccessories: job.receivedAccessories || "",
                estimatedCost: job.estimatedCost || undefined,
                deadline: job.deadline || undefined,
                warrantyDays: job.warrantyDays || 30,
                gracePeriodDays: (job as any).gracePeriodDays || 7,
                assignedTechnicianId: job.assignedTechnicianId,
            });
            try {
                const assistedIds = (job as any).assistedByIds ? JSON.parse((job as any).assistedByIds as string) : [];
                setSelectedAssistedBy(Array.isArray(assistedIds) ? assistedIds : []);
            } catch {
                setSelectedAssistedBy([]);
            }
        }
    }, [job, isOpen]);

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<InsertJobTicket> }) =>
            jobTicketsApi.update(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["jobTickets"] });
            onClose();
            toast.success("Job ticket updated successfully");
        },
        onError: () => toast.error("Failed to update job ticket"),
    });

    const advanceStatusMutation = useMutation({
        mutationFn: (id: string) => jobTicketsApi.advanceStatus(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["jobTickets"] });
            setIsAdvanceDialogOpen(false);
            toast.success("Job advanced to next stage successfully");
            onClose();
        },
        onError: () => toast.error("Failed to advance job status"),
    });

    const rollbackMutation = useMutation({
        mutationFn: ({ id, targetStatus, reason }: { id: string; targetStatus: string; reason: string }) =>
            jobTicketsApi.requestRollback(id, reason, targetStatus),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["jobTickets"] });
            setIsRollbackDialogOpen(false);
            toast.success("Rollback request submitted to Super Admin successfully");
            onClose();
        },
        onError: () => toast.error("Failed to submit rollback request"),
    });

    const handleUpdateJob = () => {
        if (!job) return;

        const getCsrfToken = () => {
            if (typeof document === 'undefined') return undefined;
            const match = document.cookie.match(new RegExp('(^| )XSRF-TOKEN=([^;]+)'));
            return match ? match[2] : undefined;
        };

        const dataToUpdate: Record<string, any> = { ...editFormData };

        // Remove ID to prevent Drizzle update errors on primary key
        delete dataToUpdate.id;

        if (dataToUpdate.status === "Completed") {
            const completedAt = new Date();
            dataToUpdate.completedAt = completedAt;
            if (dataToUpdate.warrantyDays && dataToUpdate.warrantyDays > 0) {
                const warrantyExpiry = new Date(completedAt);
                warrantyExpiry.setDate(warrantyExpiry.getDate() + dataToUpdate.warrantyDays + (dataToUpdate.gracePeriodDays || 0));
                dataToUpdate.warrantyExpiryDate = warrantyExpiry;
            }
        }

        if (selectedAssistedBy.length > 0) {
            dataToUpdate.assistedByIds = JSON.stringify(selectedAssistedBy);
            const assistantNames = selectedAssistedBy
                .map(id => technicianUsers.find(t => t.id === id)?.name)
                .filter(Boolean).join(", ");
            dataToUpdate.assistedByNames = assistantNames || null;
        } else {
            dataToUpdate.assistedByIds = "[]";
            dataToUpdate.assistedByNames = null;
        }

        // --- OVERRIDE DETECTION LOGIC ---
        const isReassignment = job.assignedTechnicianId && dataToUpdate.assignedTechnicianId && job.assignedTechnicianId !== dataToUpdate.assignedTechnicianId;

        if (isReassignment) {
            const newTech = technicianUsers.find(t => t.id === dataToUpdate.assignedTechnicianId);

            if (userRole === "Manager") {
                // Route to approval queue 
                toast.promise(
                    fetch('/api/admin/notifications/override', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-XSRF-TOKEN': getCsrfToken() || ''
                        },
                        body: JSON.stringify({
                            jobId: job.id,
                            originalTechId: job.assignedTechnicianId,
                            originalTechName: job.technician,
                            proposedTechId: newTech?.id,
                            proposedTechName: newTech?.name,
                            reason: dataToUpdate.notes || "No reason provided",
                        })
                    }).then(res => {
                        if (!res.ok) throw new Error("Failed to send request");
                        return res.json();
                    }),
                    {
                        loading: 'Sending override request...',
                        success: `Requested reassignment to ${newTech?.name}. Pending Super Admin approval.`,
                        error: 'Failed to send override request'
                    }
                );

                // Do not update the technician yet
                delete dataToUpdate.assignedTechnicianId;
                delete dataToUpdate.technician;
                delete dataToUpdate.assistedByIds;
                delete dataToUpdate.assistedByNames;
            } else if (userRole === "Super Admin") {
                // Instant override with confirmation
                const confirmed = window.confirm(`This job is currently assigned to ${job.technician}. Overwrite assignment to ${newTech?.name}?`);
                if (!confirmed) return;
                toast.success("Assignment Override Applied", { description: `Instantly reassigned to ${newTech?.name}` });
            }
        }

        updateMutation.mutate({ id: job.id, data: dataToUpdate });
    };

    return (
        <>
            <Sheet open={isOpen} onOpenChange={onClose}>
                <SheetContent className="w-full sm:max-w-xl bg-white/95 backdrop-blur-xl border-l border-white/20 shadow-2xl flex flex-col p-0">
                    <div className="px-6 pt-8 shrink-0 bg-white/50 border-b border-slate-100 z-10 relative">
                        <SheetHeader className="pb-4">
                            <SheetTitle className="text-2xl font-bold font-heading flex items-center gap-2 text-slate-800">
                                <PenTool className="w-5 h-5 text-blue-600" /> Edit Ticket
                            </SheetTitle>
                            <SheetDescription>Update status and add notes for <strong className="font-mono text-blue-600">#{job?.id?.slice(-6).toUpperCase()}</strong>.</SheetDescription>
                        </SheetHeader>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 relative">

                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3 pb-5">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Customer</div>
                                    <div className="font-bold text-slate-800">{editFormData.customer} <Lock className="inline w-3 h-3 text-slate-300 ml-1 mb-1" /></div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Device</div>
                                    <div className="font-bold text-slate-800">{editFormData.device} <Lock className="inline w-3 h-3 text-slate-300 ml-1 mb-1" /></div>
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Original Issue</div>
                                <div className="text-sm text-slate-600 mt-1">{editFormData.issue}</div>
                            </div>
                        </div>

                        <div className="space-y-3 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                            <Label className="flex items-center justify-between text-blue-800 font-bold w-full">
                                <span className="flex items-center gap-2"><Zap className="w-4 h-4" /> Workflow Progress</span>
                                {editFormData.status !== 'Pending' && (
                                    <Button variant="link" size="sm" onClick={() => setIsRollbackDialogOpen(true)} className="h-auto p-0 text-slate-400 hover:text-amber-600 font-semibold text-xs transition-colors">
                                        Request Rollback
                                    </Button>
                                )}
                            </Label>
                            <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-blue-200 shadow-sm">
                                <span className="font-bold text-lg text-slate-800">{editFormData.status}</span>
                                {editFormData.status !== 'Completed' && editFormData.status !== 'Cancelled' && (
                                    <Button
                                        onClick={() => setIsAdvanceDialogOpen(true)}
                                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold tracking-wide shadow-md"
                                        type="button"
                                        disabled={!canEdit}
                                    >
                                        Next Stage <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                )}
                            </div>
                        </div>

                        <TechnicianPicker
                            users={technicianUsers}
                            assignedTechnicianId={editFormData.assignedTechnicianId as string}
                            assistedByIds={selectedAssistedBy}
                            onAssignedChange={(id, name) => setEditFormData({ ...editFormData, assignedTechnicianId: id, technician: name })}
                            onAssistedChange={setSelectedAssistedBy}
                        />

                        <div className="space-y-2">
                            <Label>Accessories Received</Label>
                            <Textarea
                                placeholder="Example: AC cord, remote, wall mount screws"
                                value={editFormData.receivedAccessories || ""}
                                onChange={(e) => setEditFormData({ ...editFormData, receivedAccessories: e.target.value })}
                                rows={3}
                                className="bg-slate-50 resize-none text-sm"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Technician Notes</Label>
                            <Textarea placeholder="Add repair logic, parts used, or client communication notes..." value={editFormData.notes || ""} onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })} rows={4} className="bg-slate-50 resize-none text-sm" />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Priority Level</Label>
                                <Select value={editFormData.priority || "Medium"} onValueChange={(value) => setEditFormData({ ...editFormData, priority: value as any })}>
                                    <SelectTrigger className="bg-slate-50"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Low">Low</SelectItem>
                                        <SelectItem value="Medium">Medium</SelectItem>
                                        <SelectItem value="High">High</SelectItem>
                                        <SelectItem value="Critical">Critical</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Est. Cost ({currencySymbol})</Label>
                                <Input type="number" placeholder="0.00" value={editFormData.estimatedCost || ""} onChange={(e) => setEditFormData({ ...editFormData, estimatedCost: e.target.value ? parseFloat(e.target.value) : undefined })} className="bg-slate-50 font-mono font-bold" />
                            </div>
                        </div>
                    </div>
                    <div className="shrink-0 p-4 bg-white border-t border-slate-100 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-20 w-full mt-auto">
                        <SheetFooter className="flex flex-row justify-end space-x-3 w-full sm:justify-end">
                            <Button variant="outline" onClick={onClose} className="rounded-xl border-slate-200 bg-white">Cancel</Button>
                            <Button onClick={handleUpdateJob} disabled={updateMutation.isPending} className="rounded-xl px-8 shadow-md bg-emerald-600 hover:bg-emerald-700 font-bold tracking-wide text-white">
                                {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Save Changes"}
                            </Button>
                        </SheetFooter>
                    </div>
                </SheetContent>
            </Sheet>

            {job && (
                <>
                    <AdvanceStatusDialog
                        open={isAdvanceDialogOpen}
                        onOpenChange={setIsAdvanceDialogOpen}
                        currentStatus={editFormData.status || "Pending"}
                        onConfirm={() => {
                            advanceStatusMutation.mutate(job.id);
                        }}
                        isPending={advanceStatusMutation.isPending}
                    />

                    <RequestRollbackDialog
                        open={isRollbackDialogOpen}
                        onOpenChange={setIsRollbackDialogOpen}
                        currentStatus={editFormData.status || "Pending"}
                        onConfirm={(targetStatus, reason) => {
                            rollbackMutation.mutate({ id: job.id, targetStatus, reason });
                        }}
                        isPending={rollbackMutation.isPending}
                    />
                </>
            )}
        </>
    );
}
