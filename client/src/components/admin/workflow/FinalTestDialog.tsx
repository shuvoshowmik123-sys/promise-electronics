import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
    FINAL_TEST_CHECK_CODES,
    FINAL_TEST_REINSPECTION_REASONS,
    jobTicketsApi,
    type FinalTestCheckCode,
    type FinalTestReinspectionReason,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const CHECK_LABELS: Record<FinalTestCheckCode, string> = {
    power_on: "Power on",
    picture: "Picture",
    sound: "Sound",
    ports: "Ports",
    remote: "Remote",
    menu: "Menu",
    backlight: "Backlight",
    panel_basic: "Panel basics",
};

const REINSPECTION_LABELS: Record<FinalTestReinspectionReason, string> = {
    picture_issue: "Picture issue",
    sound_issue: "Sound issue",
    intermittent: "Intermittent issue",
    customer_request: "Customer request",
    manager_recheck: "Manager recheck",
    other_allowlisted: "Other approved reason",
};

type FinalTestDialogProps = {
    job: { id: string; status?: string | null } | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onComplete?: (result: { outcome: "pass" | "fail"; status: "Ready" | "Testing" | "In Progress" }) => void;
};

export function FinalTestDialog({ job, open, onOpenChange, onComplete }: FinalTestDialogProps) {
    const [outcome, setOutcome] = useState<"pass" | "fail">("pass");
    const [checkCodes, setCheckCodes] = useState<FinalTestCheckCode[]>([]);
    const [reinspectionReason, setReinspectionReason] = useState<FinalTestReinspectionReason | "">("");
    const [returnToInspection, setReturnToInspection] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setOutcome("pass");
        setCheckCodes([]);
        setReinspectionReason("");
        setReturnToInspection(true);
    }, [open, job?.id]);

    const toggleCheck = (code: FinalTestCheckCode) => {
        setCheckCodes((current) => current.includes(code)
            ? current.filter((item) => item !== code)
            : [...current, code]);
    };

    const canSubmit = outcome === "pass"
        ? checkCodes.length > 0
        : Boolean(reinspectionReason);

    const submit = async () => {
        if (!job || !canSubmit || isSaving) return;
        setIsSaving(true);
        try {
            await jobTicketsApi.recordFinalTestRun(job.id, {
                outcome,
                checkCodes: checkCodes.length > 0 ? checkCodes : undefined,
                reinspectionReason: outcome === "fail" ? reinspectionReason as FinalTestReinspectionReason : undefined,
            });

            if (outcome === "pass") {
                await jobTicketsApi.advanceStatus(job.id, { testingConfirmed: true });
                toast.success("Final test recorded. Job is Ready.");
                onComplete?.({ outcome, status: "Ready" });
            } else if (returnToInspection) {
                await jobTicketsApi.returnToInspection(job.id);
                toast.success("Final test recorded. Job returned to inspection.");
                onComplete?.({ outcome, status: "In Progress" });
            } else {
                toast.success("Final test recorded. Job remains in final testing.");
                onComplete?.({ outcome, status: "Testing" });
            }
            onOpenChange(false);
        } catch {
            toast.error("Could not save the final test. Check the job status and try again.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => { if (!isSaving) onOpenChange(nextOpen); }}>
            <DialogContent className="gap-5 border-slate-200 bg-slate-50 p-4 sm:max-w-xl sm:rounded-2xl sm:p-6">
                <DialogHeader className="border-b border-slate-200 pb-4 pr-7 text-left">
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                        <ClipboardCheck className="h-5 w-5" />
                    </div>
                    <DialogTitle className="text-xl font-bold text-slate-900">Final Test</DialogTitle>
                    <DialogDescription className="text-slate-600">Record the current result for this job.</DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Final test result">
                        <button
                            type="button"
                            aria-pressed={outcome === "pass"}
                            onClick={() => setOutcome("pass")}
                            className={cn(
                                "flex min-h-20 items-start gap-3 rounded-lg border p-3 text-left",
                                outcome === "pass" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-700",
                            )}
                        >
                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                            <span className="text-sm font-bold">Passed</span>
                        </button>
                        <button
                            type="button"
                            aria-pressed={outcome === "fail"}
                            onClick={() => setOutcome("fail")}
                            className={cn(
                                "flex min-h-20 items-start gap-3 rounded-lg border p-3 text-left",
                                outcome === "fail" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-700",
                            )}
                        >
                            <RotateCcw className="mt-0.5 h-5 w-5 shrink-0" />
                            <span className="text-sm font-bold">Needs reinspection</span>
                        </button>
                    </div>

                    <section className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="mb-2 text-sm font-bold text-slate-800">Checks completed</p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {FINAL_TEST_CHECK_CODES.map((code) => {
                                const selected = checkCodes.includes(code);
                                return (
                                    <button
                                        key={code}
                                        type="button"
                                        aria-pressed={selected}
                                        onClick={() => toggleCheck(code)}
                                        className={cn(
                                            "min-h-10 rounded-md border px-2 text-left text-xs font-semibold",
                                            selected ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600",
                                        )}
                                    >
                                        {CHECK_LABELS[code]}
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {outcome === "fail" && (
                        <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                            <div>
                                <p className="text-sm font-bold text-amber-950">Reinspection reason</p>
                                <Select value={reinspectionReason} onValueChange={(value) => setReinspectionReason(value as FinalTestReinspectionReason)}>
                                    <SelectTrigger className="mt-2 h-10 border-amber-200 bg-white">
                                        <SelectValue placeholder="Choose a reason" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {FINAL_TEST_REINSPECTION_REASONS.map((reason) => (
                                            <SelectItem key={reason} value={reason}>{REINSPECTION_LABELS[reason]}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <button
                                type="button"
                                aria-pressed={returnToInspection}
                                onClick={() => setReturnToInspection((current) => !current)}
                                className={cn(
                                    "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm font-semibold",
                                    returnToInspection ? "border-amber-300 bg-white text-amber-950" : "border-amber-200 bg-amber-50 text-amber-800",
                                )}
                            >
                                Return to inspection
                                <span className={cn("h-4 w-4 rounded border", returnToInspection ? "border-amber-600 bg-amber-500" : "border-amber-400 bg-white")} aria-hidden />
                            </button>
                        </section>
                    )}
                </div>

                <DialogFooter className="gap-2 border-t border-slate-200 pt-4 sm:justify-between">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
                    <Button
                        onClick={submit}
                        disabled={!canSubmit || isSaving}
                        className={outcome === "pass" ? "bg-emerald-600 font-bold text-white hover:bg-emerald-700" : "bg-amber-600 font-bold text-white hover:bg-amber-700"}
                    >
                        {isSaving ? "Saving..." : outcome === "pass" ? "Save test and mark Ready" : returnToInspection ? "Save and return to inspection" : "Save final test"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
