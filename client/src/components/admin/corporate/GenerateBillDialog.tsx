
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { corporateApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { JobTicket } from "@shared/schema";

interface GenerateBillDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    clientId: string;
    selectedJobs: JobTicket[];
    onSuccess: () => void;
}

export function GenerateBillDialog({
    open,
    onOpenChange,
    clientId,
    selectedJobs,
    onSuccess
}: GenerateBillDialogProps) {
    const queryClient = useQueryClient();
    const today = new Date();
    const [periodStart, setPeriodStart] = useState(format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-dd"));
    const [periodEnd, setPeriodEnd] = useState(format(today, "yyyy-MM-dd"));

    const totalAmount = selectedJobs.reduce((sum, job) => {
        let jobTotal = job.estimatedCost || 0;
        // If charges are detailed, maybe use them? 
        // Logic in backend: if charges array exists, use sum of those. Else use estimatedCost.
        // Let's replicate simple logic here for display.
        // Ideally backend calculation is truth.
        return sum + jobTotal;
    }, 0);

    const generateBillMutation = useMutation({
        mutationFn: async () => {
            return corporateApi.generateBill({
                corporateClientId: clientId,
                jobIds: selectedJobs.map(j => j.id),
                periodStart: new Date(periodStart),
                periodEnd: new Date(periodEnd)
            });
        },
        onSuccess: (data) => {
            toast.success(`Bill Generated: ${data.billNumber}`);
            queryClient.invalidateQueries({ queryKey: ["corporateBills"] });
            queryClient.invalidateQueries({ queryKey: ["corporateJobs"] });
            onSuccess();
            onOpenChange(false);
        },
        onError: (error: any) => {
            toast.error(error.message || "Failed to generate bill");
        }
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Generate Corporate Bill</DialogTitle>
                    <DialogDescription>
                        Create an invoice for {selectedJobs.length} selected jobs.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Period Start</Label>
                            <Input
                                type="date"
                                value={periodStart}
                                onChange={(e) => setPeriodStart(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Period End</Label>
                            <Input
                                type="date"
                                value={periodEnd}
                                onChange={(e) => setPeriodEnd(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="bg-muted p-4 rounded-md flex justify-between items-center">
                        <span className="font-medium">Total Amount</span>
                        <span className="text-xl font-bold">{totalAmount.toFixed(2)} BDT</span>
                    </div>

                    <div className="text-sm text-muted-foreground">
                        <p>Included Jobs:</p>
                        <ul className="list-disc pl-5 max-h-[100px] overflow-auto mt-1">
                            {selectedJobs.map(j => (
                                <li key={j.id}>{j.corporateJobNumber} - {j.device}</li>
                            ))}
                        </ul>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={() => generateBillMutation.mutate()} disabled={generateBillMutation.isPending}>
                        {generateBillMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Generate Bill
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
