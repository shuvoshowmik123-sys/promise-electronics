
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { warrantyClaimsApi } from "@/lib/api";
import { JobTicket } from "@shared/schema";
import { toast } from "sonner";
import { useState } from "react";
import { Loader2 } from "lucide-react";

interface CreateWarrantyClaimDialogProps {
    job: JobTicket | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CreateWarrantyClaimDialog({ job, open, onOpenChange }: CreateWarrantyClaimDialogProps) {
    const queryClient = useQueryClient();
    const [claimType, setClaimType] = useState<"service" | "parts">("service");
    const [claimReason, setClaimReason] = useState("");
    const [notes, setNotes] = useState("");

    const createClaimMutation = useMutation({
        mutationFn: async (data: any) => {
            const res = await warrantyClaimsApi.create(data);
            return res;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["warranty-claims"] });
            queryClient.invalidateQueries({ queryKey: ["job-tickets"] });
            toast.success("Warranty claim created successfully");
            onOpenChange(false);
            setClaimReason("");
            setNotes("");
        },
        onError: (error: any) => {
            toast.error(error.message || "Failed to create warranty claim");
        },
    });

    const handleSubmit = () => {
        if (!job) return;
        if (!claimReason) {
            toast.error("Please enter a reason for the claim");
            return;
        }

        createClaimMutation.mutate({
            originalJobId: job.id,
            claimType,
            claimReason,
            notes,
        });
    };

    if (!job) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Create Warranty Claim</DialogTitle>
                    <DialogDescription>
                        Initiate a warranty claim for Job #{job.id}.
                        This will be submitted for approval.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">


                    <div className="grid gap-2">
                        <Label>Claim Reason / Symptom</Label>
                        <Textarea
                            placeholder="Describe the recurring issue or defect..."
                            value={claimReason}
                            onChange={(e) => setClaimReason(e.target.value)}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label>Additional Notes</Label>
                        <Textarea
                            placeholder="Any checks performed? Technician comments?"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={createClaimMutation.isPending}>
                        {createClaimMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Submit Claim
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
