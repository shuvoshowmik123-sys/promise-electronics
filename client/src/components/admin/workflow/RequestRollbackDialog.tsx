import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { History, ShieldAlert, Loader2 } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

interface RequestRollbackDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentStatus: string;
    onConfirm: (targetStatus: string, reason: string) => void;
    isPending: boolean;
}

const HISTORICAL_STATES = ["Pending", "In Progress", "Ready"];

export function RequestRollbackDialog({ open, onOpenChange, currentStatus, onConfirm, isPending }: RequestRollbackDialogProps) {
    const { user } = useAdminAuth();
    const [targetStatus, setTargetStatus] = useState<string>("");
    const [reason, setReason] = useState<string>("");

    // Filter out states that are "ahead" or same. 
    // Simplistic check for demo: just show all historical states that aren't the current one.
    // Real implementation would use the strict map index.
    const availableStatuses = HISTORICAL_STATES.filter(s => s !== currentStatus);

    const handleSubmit = () => {
        if (!targetStatus || !reason || reason.trim().length < 10) return;
        onConfirm(targetStatus, reason);
    };

    return (
        <Dialog open={open} onOpenChange={(val) => {
            if (!isPending) onOpenChange(val);
        }}>
            <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-2xl rounded-2xl">
                <DialogHeader className="space-y-3 pb-4 border-b border-slate-100">
                    <div className="mx-auto bg-amber-50 w-12 h-12 rounded-full flex items-center justify-center mb-2">
                        <History className="w-6 h-6 text-amber-500" />
                    </div>
                    <DialogTitle className="text-center text-xl text-slate-800 font-bold">Request Status Rollback</DialogTitle>
                    <DialogDescription className="text-center text-slate-600 font-medium px-4">
                        Reversing a job ticket's status requires Super Admin verification to maintain the audit ledger's integrity.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-5 px-2">
                    <div className="space-y-2">
                        <Label className="text-slate-700 font-bold">Target Status</Label>
                        <Select value={targetStatus} onValueChange={setTargetStatus}>
                            <SelectTrigger className="bg-slate-50 border-slate-200 h-11">
                                <SelectValue placeholder="Select previous state..." />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                                {availableStatuses.map(s => (
                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-slate-700 font-bold">Reason for Override (Min 10 chars) *</Label>
                        <Textarea
                            placeholder="Explain why this job must be moved backward..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="bg-slate-50 border-slate-200 resize-none h-24 text-sm"
                        />
                    </div>

                    <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5 mt-2">
                        <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-red-700 font-medium leading-relaxed">
                            This request will be permanently logged against your profile (<strong className="font-mono">{user?.name}</strong>). A Super Admin must approve this before the job's status actually changes.
                        </p>
                    </div>
                </div>

                <DialogFooter className="sm:justify-between border-t border-slate-100 pt-4 gap-3 sm:gap-0">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending} className="font-semibold text-slate-500 hover:text-slate-800">
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isPending || !targetStatus || reason.trim().length < 10}
                        className="font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-md transition-all"
                    >
                        {isPending ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting Request...</>
                        ) : (
                            "Submit to Super Admin"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
