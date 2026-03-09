import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

interface AdvanceStatusDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentStatus: string;
    onConfirm: () => void;
    isPending: boolean;
}

const STATE_PROGRESSION: Record<string, string> = {
    'Pending': 'In Progress',
    'In Progress': 'Ready',
    'Ready': 'Completed',
    'Diagnosing': 'In Progress',
    'Pending Parts': 'In Progress',
};

export function AdvanceStatusDialog({ open, onOpenChange, currentStatus, onConfirm, isPending }: AdvanceStatusDialogProps) {
    const { user } = useAdminAuth();
    const [countdown, setCountdown] = useState(3);
    const nextStatus = STATE_PROGRESSION[currentStatus];

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (open && countdown > 0) {
            timer = setTimeout(() => {
                setCountdown(prev => Math.max(0, prev - 1));
            }, 1000);
        }
        if (!open) {
            setCountdown(3);
        }
        return () => clearTimeout(timer);
    }, [open, countdown]);

    if (!nextStatus) return null;

    return (
        <Dialog open={open} onOpenChange={(val) => {
            if (!isPending) onOpenChange(val);
        }}>
            <DialogContent className="sm:max-w-md bg-white border border-rose-100 shadow-2xl">
                <DialogHeader className="space-y-3 pb-4 border-b border-slate-100">
                    <div className="mx-auto bg-rose-50 w-12 h-12 rounded-full flex items-center justify-center mb-2">
                        <ShieldAlert className="w-6 h-6 text-rose-500" />
                    </div>
                    <DialogTitle className="text-center text-xl text-slate-800 font-bold">Accountability Warning</DialogTitle>
                    <DialogDescription className="text-center text-slate-600 font-medium">
                        You are about to irreversibly advance this job ticket.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-6">
                    <div className="flex items-center justify-center gap-4">
                        <div className="px-4 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600 font-bold text-sm">
                            {currentStatus}
                        </div>
                        <ArrowRight className="w-5 h-5 text-slate-400" />
                        <div className="px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 font-bold text-sm shadow-inner">
                            {nextStatus}
                        </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-sm text-amber-800 leading-relaxed font-medium">
                            <p>This action creates an immutable, permanent record in the system audit ledger linked directly to your identity:</p>
                            <p className="mt-2 font-mono text-xs bg-amber-100/50 px-2 py-1 rounded w-fit border border-amber-200/50 text-amber-900">
                                {user?.name || "Unknown User"} ({user?.role || "Unknown Role"})
                            </p>
                        </div>
                    </div>
                </div>

                <DialogFooter className="sm:justify-between border-t border-slate-100 pt-4 gap-3 sm:gap-0">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending} className="font-semibold text-slate-500 hover:text-slate-800">
                        Cancel
                    </Button>
                    <Button
                        onClick={onConfirm}
                        disabled={countdown > 0 || isPending}
                        className={`font-bold transition-all ${countdown > 0
                                ? "bg-slate-200 text-slate-400 hover:bg-slate-200 pointer-events-none"
                                : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg"
                            }`}
                    >
                        {isPending ? (
                            "Advancing..."
                        ) : countdown > 0 ? (
                            `Acknowledge & Sign in ${countdown}s`
                        ) : (
                            <>
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Electronically Sign & Advance
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
