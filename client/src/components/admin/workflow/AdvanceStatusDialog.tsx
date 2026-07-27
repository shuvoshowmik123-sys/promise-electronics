import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, FileWarning, Package, ShieldAlert } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface AdvanceStatusDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentStatus: string;
    onConfirm: () => void;
    onSetOutcome?: (outcome: string, reason?: string) => void;
    onReportNg?: () => void;
    isPending: boolean;
}

const STATE_PROGRESSION: Record<string, string> = {
    Pending: "In Progress",
    "In Progress": "Ready",
    Ready: "Completed",
    Diagnosing: "In Progress",
    "Pending Parts": "In Progress",
    "Waiting on Parts": "In Progress",
    "On Workbench": "Ready",
};

const TRANSITION_LABEL: Record<string, string> = {
    Pending: "Start repair work on this device",
    Diagnosing: "Begin repair after diagnosis",
    Ready: "Complete job, finalize billing, and prepare for handover",
    "Pending Parts": "Parts arrived - resume repair",
    "Waiting on Parts": "Parts arrived - resume repair",
};

const WORK_STATUSES = ["In Progress", "On Workbench", "Diagnosing"];

const OUTCOME_OPTIONS = [
    {
        value: "repair_ok",
        label: "Repair Successful",
        description: "Device is fixed and ready for customer",
        icon: CheckCircle2,
        activeClass: "border-emerald-300 bg-emerald-50",
    },
    {
        value: "needs_parts",
        label: "Needs Parts",
        description: "Waiting for replacement parts to arrive",
        icon: Package,
        activeClass: "border-amber-300 bg-amber-50",
    },
] as const;

export function AdvanceStatusDialog({
    open,
    onOpenChange,
    currentStatus,
    onConfirm,
    onSetOutcome,
    onReportNg,
    isPending,
}: AdvanceStatusDialogProps) {
    const { user } = useAdminAuth();
    const [countdown, setCountdown] = useState(3);
    const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
    const nextStatus = STATE_PROGRESSION[currentStatus];
    const isWorkStatus = WORK_STATUSES.includes(currentStatus);

    useEffect(() => {
        if (!open) {
            setCountdown(3);
            setSelectedOutcome(null);
        }
    }, [open]);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        if (open && !isWorkStatus && countdown > 0) {
            timer = setTimeout(() => setCountdown((current) => Math.max(0, current - 1)), 1000);
        }
        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [open, countdown, isWorkStatus]);

    if (!nextStatus && !isWorkStatus) return null;

    if (isWorkStatus && onSetOutcome) {
        return (
            <Dialog open={open} onOpenChange={(value) => { if (!isPending) onOpenChange(value); }}>
                <DialogContent className="border border-slate-200 bg-white shadow-2xl sm:max-w-lg">
                    <DialogHeader className="space-y-2 border-b border-slate-100 pb-3">
                        <DialogTitle className="text-xl font-bold text-slate-800">Repair Result</DialogTitle>
                        <DialogDescription className="text-slate-500">Choose the completed repair result or start a controlled NG report.</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2 py-4">
                        {OUTCOME_OPTIONS.map((option) => {
                            const Icon = option.icon;
                            const active = selectedOutcome === option.value;
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setSelectedOutcome(option.value)}
                                    className={`flex w-full items-start gap-3 rounded-xl border-2 p-3 text-left transition-colors ${active ? option.activeClass : "border-slate-100 bg-white hover:border-slate-200"}`}
                                >
                                    <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${active ? "text-slate-800" : "text-slate-400"}`} />
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-800">{option.label}</p>
                                        <p className="mt-0.5 text-xs text-slate-500">{option.description}</p>
                                    </div>
                                </button>
                            );
                        })}

                        {onReportNg && (
                            <button
                                type="button"
                                onClick={onReportNg}
                                className="flex w-full items-start gap-3 rounded-xl border-2 border-rose-100 bg-rose-50/70 p-3 text-left transition-colors hover:border-rose-300"
                            >
                                <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-slate-800">Report NG</p>
                                    <p className="mt-0.5 text-xs text-slate-500">Submit diagnosis and evidence for independent Manager review</p>
                                </div>
                            </button>
                        )}
                    </div>

                    <DialogFooter className="gap-2 border-t border-slate-100 pt-3 sm:gap-0">
                        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
                        <Button
                            onClick={() => {
                                if (selectedOutcome) onSetOutcome(selectedOutcome);
                            }}
                            disabled={!selectedOutcome || isPending}
                            className="bg-blue-600 font-bold text-white hover:bg-blue-700"
                        >
                            {isPending ? "Saving..." : "Confirm Result"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={open} onOpenChange={(value) => { if (!isPending) onOpenChange(value); }}>
            <DialogContent className="border border-slate-200 bg-white shadow-2xl sm:max-w-md">
                <DialogHeader className="space-y-3 border-b border-slate-100 pb-4">
                    <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                        <ShieldAlert className="h-6 w-6 text-blue-500" />
                    </div>
                    <DialogTitle className="text-center text-xl font-bold text-slate-800">Confirm Next Step</DialogTitle>
                    <DialogDescription className="text-center font-medium text-slate-600">
                        {TRANSITION_LABEL[currentStatus] || "This will move the job forward."}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-6">
                    <div className="flex items-center justify-center gap-4">
                        <div className="rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600">{currentStatus}</div>
                        <ArrowRight className="h-5 w-5 text-slate-400" />
                        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700">{nextStatus}</div>
                    </div>

                    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                        <div className="text-sm font-medium leading-relaxed text-amber-800">
                            <p>This will be recorded in job history:</p>
                            <p className="mt-2 w-fit rounded border border-amber-200/50 bg-amber-100/50 px-2 py-1 font-mono text-xs text-amber-900">
                                {user?.name || "Unknown"} ({user?.role || "Unknown"})
                            </p>
                        </div>
                    </div>
                </div>

                <DialogFooter className="gap-3 border-t border-slate-100 pt-4 sm:justify-between sm:gap-0">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
                    <Button
                        onClick={onConfirm}
                        disabled={countdown > 0 || isPending}
                        className={countdown > 0 ? "pointer-events-none bg-slate-200 font-bold text-slate-400" : "bg-emerald-600 font-bold text-white shadow-md hover:bg-emerald-700"}
                    >
                        {isPending ? "Saving..." : countdown > 0 ? `Confirm in ${countdown}s` : <><CheckCircle2 className="mr-2 h-4 w-4" />Confirm</>}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
