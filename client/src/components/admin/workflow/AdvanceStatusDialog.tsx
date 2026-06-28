import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, ArrowRight, CheckCircle2, ShieldAlert, XCircle, Package, Ban } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

interface AdvanceStatusDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentStatus: string;
    onConfirm: () => void;
    onSetOutcome?: (outcome: string, reason?: string) => void;
    isPending: boolean;
}

const STATE_PROGRESSION: Record<string, string> = {
    'Pending': 'In Progress',
    'In Progress': 'Ready',
    'Ready': 'Completed',
    'Diagnosing': 'In Progress',
    'Pending Parts': 'In Progress',
    'Waiting on Parts': 'In Progress',
    'On Workbench': 'Ready',
};

const TRANSITION_LABEL: Record<string, string> = {
    'Pending': 'Start repair work on this device',
    'Diagnosing': 'Begin repair after diagnosis',
    'Ready': 'Complete job, finalize billing, and prepare for handover',
    'Pending Parts': 'Parts arrived — resume repair',
    'Waiting on Parts': 'Parts arrived — resume repair',
};

const WORK_STATUSES = ['In Progress', 'On Workbench', 'Diagnosing'];

interface OutcomeOption {
    value: string;
    label: string;
    description: string;
    icon: typeof CheckCircle2;
    color: string;
    requiresReason: boolean;
}

const OUTCOME_OPTIONS: OutcomeOption[] = [
    { value: "repair_ok", label: "Repair Successful", description: "Device is fixed and ready for customer", icon: CheckCircle2, color: "border-emerald-200 bg-emerald-50 hover:border-emerald-400", requiresReason: false },
    { value: "needs_parts", label: "Needs Parts", description: "Waiting for replacement parts to arrive", icon: Package, color: "border-amber-200 bg-amber-50 hover:border-amber-400", requiresReason: false },
    { value: "not_repairable", label: "Not Repairable", description: "Device cannot be fixed — inform customer", icon: XCircle, color: "border-rose-200 bg-rose-50 hover:border-rose-400", requiresReason: true },
    { value: "customer_declined", label: "Customer Declined", description: "Customer chose not to proceed with repair", icon: Ban, color: "border-slate-200 bg-slate-50 hover:border-slate-400", requiresReason: true },
];

export function AdvanceStatusDialog({ open, onOpenChange, currentStatus, onConfirm, onSetOutcome, isPending }: AdvanceStatusDialogProps) {
    const { user } = useAdminAuth();
    const [countdown, setCountdown] = useState(3);
    const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
    const [reason, setReason] = useState("");
    const nextStatus = STATE_PROGRESSION[currentStatus];
    const isWorkStatus = WORK_STATUSES.includes(currentStatus);

    useEffect(() => {
        if (!open) {
            setCountdown(3);
            setSelectedOutcome(null);
            setReason("");
        }
    }, [open]);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (open && !isWorkStatus && countdown > 0) {
            timer = setTimeout(() => setCountdown(prev => Math.max(0, prev - 1)), 1000);
        }
        return () => clearTimeout(timer);
    }, [open, countdown, isWorkStatus]);

    if (!nextStatus && !isWorkStatus) return null;

    const selectedOption = OUTCOME_OPTIONS.find(o => o.value === selectedOutcome);
    const canConfirmOutcome = selectedOutcome && (!selectedOption?.requiresReason || reason.trim());

    const handleOutcomeConfirm = () => {
        if (!selectedOutcome || !onSetOutcome) return;
        onSetOutcome(selectedOutcome, reason.trim() || undefined);
    };

    if (isWorkStatus && onSetOutcome) {
        return (
            <Dialog open={open} onOpenChange={(val) => { if (!isPending) onOpenChange(val); }}>
                <DialogContent className="sm:max-w-lg bg-white border border-slate-200 shadow-2xl">
                    <DialogHeader className="space-y-2 pb-3 border-b border-slate-100">
                        <DialogTitle className="text-xl text-slate-800 font-bold">Repair Result</DialogTitle>
                        <DialogDescription className="text-slate-500">
                            What is the outcome of the repair work?
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-4 space-y-2">
                        {OUTCOME_OPTIONS.map((opt) => {
                            const Icon = opt.icon;
                            const active = selectedOutcome === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => { setSelectedOutcome(opt.value); setReason(""); }}
                                    className={`w-full flex items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors ${active ? opt.color + " ring-2 ring-offset-1 ring-slate-300" : "border-slate-100 bg-white hover:border-slate-200"}`}
                                >
                                    <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${active ? "text-slate-800" : "text-slate-400"}`} />
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-800">{opt.label}</p>
                                        <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {selectedOption?.requiresReason && (
                        <div className="pb-3">
                            <Textarea
                                placeholder="Reason is required..."
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                className="min-h-20 rounded-xl"
                            />
                        </div>
                    )}

                    <DialogFooter className="border-t border-slate-100 pt-3 gap-2 sm:gap-0">
                        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
                        <Button
                            onClick={handleOutcomeConfirm}
                            disabled={!canConfirmOutcome || isPending}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
                        >
                            {isPending ? "Saving..." : "Confirm Result"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={open} onOpenChange={(val) => { if (!isPending) onOpenChange(val); }}>
            <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-2xl">
                <DialogHeader className="space-y-3 pb-4 border-b border-slate-100">
                    <div className="mx-auto bg-blue-50 w-12 h-12 rounded-full flex items-center justify-center mb-2">
                        <ShieldAlert className="w-6 h-6 text-blue-500" />
                    </div>
                    <DialogTitle className="text-center text-xl text-slate-800 font-bold">Confirm Next Step</DialogTitle>
                    <DialogDescription className="text-center text-slate-600 font-medium">
                        {TRANSITION_LABEL[currentStatus] || "This will move the job forward."}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-6">
                    <div className="flex items-center justify-center gap-4">
                        <div className="px-4 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600 font-bold text-sm">
                            {currentStatus}
                        </div>
                        <ArrowRight className="w-5 h-5 text-slate-400" />
                        <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 font-bold text-sm">
                            {nextStatus}
                        </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-sm text-amber-800 leading-relaxed font-medium">
                            <p>This will be recorded in job history:</p>
                            <p className="mt-2 font-mono text-xs bg-amber-100/50 px-2 py-1 rounded w-fit border border-amber-200/50 text-amber-900">
                                {user?.name || "Unknown"} ({user?.role || "Unknown"})
                            </p>
                        </div>
                    </div>
                </div>

                <DialogFooter className="sm:justify-between border-t border-slate-100 pt-4 gap-3 sm:gap-0">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
                    <Button
                        onClick={onConfirm}
                        disabled={countdown > 0 || isPending}
                        className={`font-bold transition-all ${countdown > 0 ? "bg-slate-200 text-slate-400 pointer-events-none" : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"}`}
                    >
                        {isPending ? "Saving..." : countdown > 0 ? `Confirm in ${countdown}s` : <><CheckCircle2 className="w-4 h-4 mr-2" />Confirm</>}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
