import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { jobTicketsApi } from "@/lib/api";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { Loader2, Zap, Briefcase, Star, AlertTriangle } from "lucide-react";
import { recommendTechnicians, TechnicianMatch } from "@/lib/technician-matching";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { User } from "@shared/schema";
import { TechnicianPicker } from "@/components/admin/TechnicianPicker";

interface BulkAssignTechnicianDialogProps {
    jobs: any[]; // Full job objects
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
    technicians?: any[]; // Passed down to prevent re-fetching if available
}

// Interface matching the /api/users/technicians/workload response
interface TechnicianWithWorkload extends User {
    activeJobs: number;
    completedToday: number;
}

export function BulkAssignTechnicianDialog({
    jobs,
    open,
    onOpenChange,
    onSuccess,
    technicians: propTechnicians,
}: BulkAssignTechnicianDialogProps) {
    const queryClient = useQueryClient();
    const [selectedTechnicianId, setSelectedTechnicianId] = useState<string | null>(null);
    const [assistedByIds, setAssistedByIds] = useState<string[]>([]);

    // Fetch technicians with workload stats if not passed as props
    const { data: fetchedTechnicians = [], isLoading: isLoadingTechs } = useQuery({
        queryKey: ["technicians-workload"],
        queryFn: async () => {
            const res = await fetch("/api/users/technicians/workload");
            if (!res.ok) throw new Error("Failed to fetch technicians");
            return res.json() as Promise<TechnicianWithWorkload[]>;
        },
        staleTime: 60 * 1000,
        enabled: !propTechnicians,
    });

    const technicians = propTechnicians || fetchedTechnicians;

    // Compute recommendations
    const recommendedTechnicians = useMemo(() => {
        if (!technicians.length || !jobs.length) return [];
        return recommendTechnicians(jobs, technicians);
    }, [jobs, technicians]);

    const bulkUpdateMutation = useMutation({
        mutationFn: async (technicianId: string) => {
            const technician = technicians.find((t) => t.id === technicianId);
            if (!technician) throw new Error("Technician not found");

            const technicianName = technician.name;

            // Execute updates in parallel
            const promises = jobs.map((job) =>
                jobTicketsApi.update(job.id, {
                    assignedTechnicianId: technicianId,
                    technician: technicianName,
                    assistedByIds: JSON.stringify(assistedByIds),
                    status: "Diagnosing", // Auto-move to Diagnosing
                })
            );
            return Promise.all(promises);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["job-tickets"] });
            queryClient.invalidateQueries({ queryKey: ["corporateJobs"] });
            toast.success(`Assigned ${jobs.length} jobs to technician`);
            if (onSuccess) onSuccess();
            onOpenChange(false);
            setSelectedTechnicianId(null);
            setAssistedByIds([]);
        },
        onError: (error: any) => {
            toast.error("Failed to assign technicians");
        },
    });

    const handleAssign = () => {
        if (!selectedTechnicianId) {
            toast.error("Please select a technician");
            return;
        }
        bulkUpdateMutation.mutate(selectedTechnicianId);
    };
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-hidden flex flex-col p-4 md:p-6">
                <DialogHeader className="shrink-0">
                    <DialogTitle>Bulk Assign Technician</DialogTitle>
                    <DialogDescription className="text-xs md:text-sm">
                        Assign {jobs.length} selected jobs to a technician.
                        AI Recommendations based on skills and workload.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto pr-1 -mr-1">
                    <div className="grid gap-3 py-2">
                        <div className="space-y-2">
                            <Label className="text-xs md:text-sm">Select Technician</Label>

                            <ScrollArea className="h-[180px] md:h-[220px] border rounded-md p-2">
                                {isLoadingTechs ? (
                                    <div className="flex items-center justify-center h-20">
                                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : recommendedTechnicians.length === 0 ? (
                                    <div className="text-center py-4 text-muted-foreground">
                                        No technicians found.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {recommendedTechnicians.map((match) => {
                                            const techDetails = technicians.find(t => t.id === match.technicianId);
                                            return (
                                                <div
                                                    key={match.technicianId}
                                                    className={`
                                                flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all
                                                ${selectedTechnicianId === match.technicianId
                                                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                                                            : "hover:bg-muted/50 border-input"}
                                            `}
                                                    onClick={() => setSelectedTechnicianId(match.technicianId)}
                                                >
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium">{match.technicianName}</span>
                                                            {techDetails?.role === 'Super Admin' && <Badge variant="secondary" className="text-[10px]">Admin</Badge>}
                                                        </div>
                                                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                            <div className="flex items-center gap-1">
                                                                <Briefcase className="h-3 w-3" />
                                                                {match.currentWorkload} Active
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <Star className="h-3 w-3 text-yellow-500" />
                                                                {techDetails?.performanceScore ?? 5.0}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        {/* Match Score Badge */}
                                                        {match.matchScore > 80 && (
                                                            <Badge className="bg-green-600 hover:bg-green-700">
                                                                <Zap className="h-3 w-3 mr-1" /> Best Match
                                                            </Badge>
                                                        )}
                                                        {match.matchScore <= 80 && match.matchScore > 50 && (
                                                            <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
                                                                Good Match
                                                            </Badge>
                                                        )}

                                                        {/* Workload Warning */}
                                                        {match.currentWorkload > 5 && (
                                                            <Badge variant="destructive" className="ml-1">
                                                                Busy
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </ScrollArea>
                        </div>

                        {/* Selected Tech Summary */}
                        {selectedTechnicianId && (
                            <div className="bg-muted/30 p-3 rounded-md text-sm">
                                <span className="font-medium">Summary: </span>
                                Assigning <span className="font-bold">{jobs.length}</span> jobs will bring
                                <span className="font-bold ml-1">
                                    {recommendedTechnicians.find(t => t.technicianId === selectedTechnicianId)?.technicianName}
                                </span>'s active workload to
                                <span className="font-bold ml-1">
                                    {(recommendedTechnicians.find(t => t.technicianId === selectedTechnicianId)?.currentWorkload || 0) + jobs.length}
                                </span>.
                            </div>
                        )}

                        <div className="border-t pt-2 mt-2">
                            <TechnicianPicker
                                users={technicians.map(t => ({ id: t.id, name: t.name, role: t.role }))}
                                assignedTechnicianId={selectedTechnicianId}
                                assistedByIds={assistedByIds}
                                onAssignedChange={(id, name) => setSelectedTechnicianId(id)}
                                onAssistedChange={setAssistedByIds}
                            />
                        </div>
                    </div>
                </div>

                <DialogFooter className="shrink-0 pt-2 mt-auto border-t">
                    <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button size="sm" onClick={handleAssign} disabled={bulkUpdateMutation.isPending || !selectedTechnicianId}>
                        {bulkUpdateMutation.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        Assign & Notify
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
