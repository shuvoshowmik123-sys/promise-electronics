import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import {
    AlertTriangle,
    ClipboardCheck,
    FileWarning,
    ImagePlus,
    Loader2,
    LockKeyhole,
    RotateCcw,
    Send,
    ShieldCheck,
    Trash2,
    X,
} from "lucide-react";
import type { JobNgFailedRepairType, JobNgReport, JobTicket } from "@shared/schema";
import { getSafeJobDisplayRef } from "@shared/job-display-utils";
import { ImageKitUpload } from "@/components/common/ImageKitUpload";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MobileBottomSheetDragHandle, MobileBottomSheetFrame } from "@/components/ui/mobile-bottom-sheet";
import { useAdminMobileMode } from "@/hooks/useAdminMobileMode";
import { jobTicketsApi, type NgEvidenceAttachment } from "@/lib/api/adminApi";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PROTECTED_NG_STATUSES = ["NG Review Pending", "Awaiting Customer Decision"];

const FAILED_REPAIR_TYPES: Array<{ value: JobNgFailedRepairType; label: string; helper: string }> = [
    { value: "panel_repair", label: "Panel repair", helper: "Panel-level repair failed" },
    { value: "motherboard", label: "Motherboard", helper: "Main-board repair failed" },
    { value: "backlight", label: "Backlight", helper: "Backlight work failed" },
    { value: "power_board", label: "Power board", helper: "Power-stage repair failed" },
    { value: "tcon", label: "T-CON", helper: "Timing controller work failed" },
    { value: "full_tv", label: "Full television", helper: "Multiple systems failed" },
    { value: "other", label: "Other", helper: "Another verified failure" },
];

const LOCKED_STAGES = ["Clarification", "Quote", "Customer Decision", "Work Order", "Payment"];

interface NgResolutionWizardProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    job: JobTicket | null;
    canReview: boolean;
    currentUserId?: string;
}

interface ReporterSnapshot {
    userId?: string;
    name?: string;
    role?: string;
}

function asReporterSnapshot(value: unknown): ReporterSnapshot {
    if (!value || typeof value !== "object") return {};
    const source = value as Record<string, unknown>;
    return {
        userId: typeof source.userId === "string" ? source.userId : undefined,
        name: typeof source.name === "string" ? source.name : undefined,
        role: typeof source.role === "string" ? source.role : undefined,
    };
}

function asEvidence(value: unknown): NgEvidenceAttachment[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const source = item as Record<string, unknown>;
        if (typeof source.fileId !== "string" || typeof source.url !== "string") return [];
        return [{
            fileId: source.fileId,
            url: source.url,
            name: typeof source.name === "string" ? source.name : undefined,
            thumbnailUrl: typeof source.thumbnailUrl === "string" ? source.thumbnailUrl : undefined,
        }];
    });
}

function getPartsCount(value: unknown): number {
    if (!value || typeof value !== "object") return 0;
    const source = value as Record<string, unknown>;
    const candidates = [source.productLines, source.partsLineitems, source.charges];
    return candidates.reduce<number>((count, candidate) => count + (Array.isArray(candidate) ? candidate.length : 0), 0);
}

function getPartsSummary(value: unknown): string[] {
    if (!value || typeof value !== "object") return [];
    const source = value as Record<string, unknown>;
    return [source.productLines, source.partsLineitems, source.charges].flatMap((candidate) => {
        if (!Array.isArray(candidate)) return [];
        return candidate.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const row = item as Record<string, unknown>;
            const name = [row.name, row.productName, row.itemName, row.description].find((entry) => typeof entry === "string" && entry.trim());
            if (typeof name !== "string") return [];
            const quantity = typeof row.qty === "number" ? row.qty : typeof row.quantity === "number" ? row.quantity : null;
            return [quantity ? `${name} x${quantity}` : name];
        });
    }).slice(0, 12);
}

export function NgResolutionWizard({ open, onOpenChange, job, canReview, currentUserId }: NgResolutionWizardProps) {
    const isMobile = useAdminMobileMode();
    const queryClient = useQueryClient();
    const formJobIdRef = useRef<string | null>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const wasOpenRef = useRef(false);
    const [submissionId, setSubmissionId] = useState("");
    const [failedRepairType, setFailedRepairType] = useState<JobNgFailedRepairType | null>(null);
    const [diagnosis, setDiagnosis] = useState("");
    const [technicalNotes, setTechnicalNotes] = useState("");
    const [evidence, setEvidence] = useState<NgEvidenceAttachment[]>([]);
    const [confirmed, setConfirmed] = useState(false);
    const [uploadingEvidence, setUploadingEvidence] = useState(false);
    const [reviewMode, setReviewMode] = useState<"none" | "return">("none");
    const [reviewNotes, setReviewNotes] = useState("");

    const protectedStatus = Boolean(job && PROTECTED_NG_STATUSES.includes(job.status || ""));

    useEffect(() => {
        if (open && !wasOpenRef.current) {
            previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }
        if (!open && wasOpenRef.current) previousFocusRef.current?.focus();
        wasOpenRef.current = open;
    }, [open]);

    useEffect(() => {
        if (!open || !job || protectedStatus) return;
        if (formJobIdRef.current !== job.id) {
            formJobIdRef.current = job.id;
            setSubmissionId(crypto.randomUUID());
            setFailedRepairType(null);
            setDiagnosis("");
            setTechnicalNotes("");
            setEvidence([]);
            setConfirmed(false);
            setUploadingEvidence(false);
            return;
        }
        if (!submissionId) setSubmissionId(crypto.randomUUID());
    }, [job, open, protectedStatus, submissionId]);

    useEffect(() => {
        setReviewMode("none");
        setReviewNotes("");
    }, [job?.id]);

    const workStatus = Boolean(job && ["Diagnosing", "In Progress", "On Workbench"].includes(job.status || ""));
    const reportQuery = useQuery({
        queryKey: ["jobNgReport", job?.id, protectedStatus ? "active" : "latest"],
        queryFn: () => jobTicketsApi.getNgReport(job!.id, { latest: !protectedStatus }),
        enabled: open && Boolean(job?.id) && (protectedStatus || workStatus),
        retry: false,
    });

    const resetForm = () => {
        setSubmissionId(crypto.randomUUID());
        setFailedRepairType(null);
        setDiagnosis("");
        setTechnicalNotes("");
        setEvidence([]);
        setConfirmed(false);
        setUploadingEvidence(false);
    };

    const finishMutation = async () => {
        await queryClient.invalidateQueries({ queryKey: ["jobTickets"] });
        if (job?.id) await queryClient.invalidateQueries({ queryKey: ["jobNgReport", job.id] });
    };

    const submitMutation = useMutation({
        mutationFn: () => jobTicketsApi.submitNgReport(job!.id, {
            submissionId,
            failedRepairType: failedRepairType!,
            diagnosis: diagnosis.trim(),
            technicalNotes: technicalNotes.trim(),
            evidenceAttachments: evidence,
        }),
        onSuccess: async () => {
            await finishMutation();
            resetForm();
            onOpenChange(false);
            toast.success("NG report sent for Manager review");
        },
        onError: () => toast.error("NG report could not be submitted. Review the required evidence and try again."),
    });

    const reviewMutation = useMutation({
        mutationFn: (action: "verify" | "return_for_correction") => jobTicketsApi.reviewNgReport(job!.id, {
            action,
            reviewNotes: reviewNotes.trim() || undefined,
        }),
        onSuccess: async (response, action) => {
            await finishMutation();
            setReviewMode("none");
            setReviewNotes("");
            toast.success(action === "verify" ? "NG report verified" : "NG report returned for correction");
            if (action === "return_for_correction") onOpenChange(false);
            else queryClient.setQueryData(["jobNgReport", job?.id], response);
        },
        onError: () => toast.error("The NG review could not be completed. Refresh the report and try again."),
    });

    const formErrors = useMemo(() => ({
        failedRepairType: !failedRepairType,
        diagnosis: diagnosis.trim().length < 10,
        technicalNotes: technicalNotes.trim().length < 10,
        evidence: evidence.length === 0,
        confirmed: !confirmed,
    }), [confirmed, diagnosis, evidence.length, failedRepairType, technicalNotes]);
    const canSubmit = !Object.values(formErrors).some(Boolean) && !submitMutation.isPending && !uploadingEvidence;

    if (!job) return null;

    const report = reportQuery.data?.report;
    const partsSummary = getPartsSummary(report?.partsSnapshot);
    const reporter = asReporterSnapshot(report?.reportedBySnapshot);
    const isReporter = Boolean(currentUserId && report?.reportedByUserId === currentUserId);
    const mayReview = canReview && !isReporter && report?.reportStatus === "pending_review";
    const isAwaitingDecision = job.status === "Awaiting Customer Decision" || report?.reportStatus === "verified";

    const close = () => {
        if (!submitMutation.isPending && !reviewMutation.isPending) onOpenChange(false);
    };

    const returnedReport = !protectedStatus && report?.reportStatus === "returned" ? report : null;

    const formContent = (
        <div className="space-y-6">
            {returnedReport && (
                <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                        <div>
                            <p className="font-bold text-amber-950">Returned for Correction</p>
                            <p className="text-sm text-amber-900">
                                Revision {returnedReport.revision}
                                {returnedReport.reviewNotes ? ` — Manager notes below. Submit a new revision (new submission id).` : "."}
                            </p>
                        </div>
                    </div>
                    {returnedReport.reviewNotes && (
                        <div className="rounded-lg border border-amber-200 bg-white p-3">
                            <p className="text-xs font-bold uppercase text-amber-600">Manager review notes</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{returnedReport.reviewNotes}</p>
                        </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-amber-100 bg-white p-3">
                            <p className="text-xs font-bold uppercase text-slate-400">Previous diagnosis</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{returnedReport.diagnosis}</p>
                        </div>
                        <div className="rounded-lg border border-amber-100 bg-white p-3">
                            <p className="text-xs font-bold uppercase text-slate-400">Previous technical notes</p>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{returnedReport.technicalNotes}</p>
                        </div>
                    </div>
                    {asEvidence(returnedReport.evidenceAttachments).length > 0 && (
                        <div>
                            <p className="mb-2 text-xs font-bold uppercase text-slate-400">Previous evidence</p>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {asEvidence(returnedReport.evidenceAttachments).map((item) => (
                                    <a key={item.fileId} href={item.url} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-lg border border-slate-200">
                                        <img src={item.thumbnailUrl || item.url} alt={item.name || "Prior evidence"} className="h-full w-full object-cover" />
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            )}

            <section className="space-y-3">
                <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-rose-600">Step 1</p>
                    <h3 className="text-base font-bold text-slate-900">What repair failed?</h3>
                    <p className="text-sm text-slate-500">Choose one technical category. This is not a status shortcut.</p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {FAILED_REPAIR_TYPES.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => setFailedRepairType(option.value)}
                            className={cn(
                                "min-h-16 rounded-xl border p-3 text-left transition-colors",
                                failedRepairType === option.value
                                    ? "border-rose-400 bg-rose-50 ring-2 ring-rose-100"
                                    : "border-slate-200 bg-white hover:border-slate-300",
                            )}
                        >
                            <span className="block text-sm font-bold text-slate-800">{option.label}</span>
                            <span className="mt-0.5 block text-xs text-slate-500">{option.helper}</span>
                        </button>
                    ))}
                </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
                <label className="space-y-2">
                    <span className="text-sm font-bold text-slate-800">Diagnosis</span>
                    <Textarea
                        value={diagnosis}
                        onChange={(event) => setDiagnosis(event.target.value)}
                        placeholder="Explain the confirmed fault and tests performed"
                        maxLength={4000}
                        className="min-h-28 resize-y rounded-xl"
                    />
                    <span className={cn("block text-xs", diagnosis.trim().length > 0 && formErrors.diagnosis ? "text-rose-600" : "text-slate-400")}>Minimum 10 characters</span>
                </label>
                <label className="space-y-2">
                    <span className="text-sm font-bold text-slate-800">Technical notes</span>
                    <Textarea
                        value={technicalNotes}
                        onChange={(event) => setTechnicalNotes(event.target.value)}
                        placeholder="Record measurements, parts tried, and why repair cannot continue"
                        maxLength={8000}
                        className="min-h-28 resize-y rounded-xl"
                    />
                    <span className={cn("block text-xs", technicalNotes.trim().length > 0 && formErrors.technicalNotes ? "text-rose-600" : "text-slate-400")}>Minimum 10 characters</span>
                </label>
            </section>

            <section className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wide text-rose-600">Step 2</p>
                        <h3 className="text-base font-bold text-slate-900">Evidence</h3>
                        <p className="text-sm text-slate-500">At least one clear ImageKit photo is required.</p>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">{evidence.length}/12</span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {evidence.map((item) => (
                        <div key={item.fileId} className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                            <img src={item.thumbnailUrl || item.url} alt={item.name || "NG evidence"} className="h-full w-full object-cover" />
                            <button
                                type="button"
                                onClick={() => setEvidence((current) => current.filter((entry) => entry.fileId !== item.fileId))}
                                className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-950/75 text-white shadow-sm"
                                aria-label={`Remove ${item.name || "evidence"}`}
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    ))}
                    {evidence.length < 12 && (
                        <ImageKitUpload
                            folder="/job-ng-evidence"
                            accept="image/*"
                            onUploadSuccess={(result) => setEvidence((current) => current.length >= 12 ? current : [...current, result])}
                            onUploadingChange={setUploadingEvidence}
                            className="aspect-square"
                        >
                            <button type="button" disabled={uploadingEvidence} className="flex h-full min-h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-600 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-60">
                                {uploadingEvidence ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
                                <span className="text-xs font-bold">{uploadingEvidence ? "Uploading..." : "Add evidence"}</span>
                            </button>
                        </ImageKitUpload>
                    )}
                </div>
            </section>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} className="mt-0.5" />
                <span className="text-sm leading-relaxed text-amber-900">I confirm this diagnosis and evidence are accurate. A different authorized Manager must review this report.</span>
            </label>
        </div>
    );

    const reportContent = reportQuery.isLoading ? (
        <div className="flex min-h-64 items-center justify-center gap-2 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />Loading NG report...</div>
    ) : reportQuery.isError || !report ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">The active NG report could not be loaded. Refresh the job before reviewing it.</div>
    ) : (
        <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-400">Reported by</p><p className="mt-1 text-sm font-bold text-slate-800">{reporter.name || "Staff member"}</p><p className="text-xs text-slate-500">{reporter.role || "Technician"}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-400">Submitted</p><p className="mt-1 text-sm font-bold text-slate-800">{report.reportedAt ? format(new Date(report.reportedAt), "MMM d, yyyy - h:mm a") : "Not recorded"}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-400">Failed repair</p><p className="mt-1 text-sm font-bold capitalize text-slate-800">{report.failedRepairType.replaceAll("_", " ")}</p><p className="text-xs text-slate-500">Source: {report.sourceJobStatus}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold uppercase text-slate-400">Revision</p><p className="mt-1 text-sm font-bold text-slate-800">{report.revision}</p><p className="text-xs text-slate-500">{getPartsCount(report.partsSnapshot)} captured line items</p></div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-bold uppercase text-slate-400">Diagnosis</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{report.diagnosis}</p></div>
                <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-bold uppercase text-slate-400">Technical notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{report.technicalNotes}</p></div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-bold uppercase text-slate-400">Parts snapshot</p>
                {partsSummary.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">{partsSummary.map((item, index) => <span key={`${item}-${index}`} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{item}</span>)}</div>
                ) : (
                    <p className="mt-2 text-sm text-slate-500">No recorded parts at submission.</p>
                )}
            </div>

            {report.reviewNotes && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs font-bold uppercase text-blue-500">Manager review notes</p><p className="mt-2 whitespace-pre-wrap text-sm text-blue-900">{report.reviewNotes}</p></div>}

            <div>
                <p className="mb-2 text-xs font-bold uppercase text-slate-400">Evidence</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {asEvidence(report.evidenceAttachments).map((item) => (
                        <a key={item.fileId} href={item.url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                            <img src={item.thumbnailUrl || item.url} alt={item.name || "NG evidence"} className="h-full w-full object-cover" />
                        </a>
                    ))}
                </div>
            </div>

            {isAwaitingDecision ? (
                <div className="space-y-3">
                    <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                        <div><p className="font-bold text-blue-900">NG evidence verified</p><p className="text-sm text-blue-700">The report is immutable. Customer-decision workflow will unlock in backend Phase 02B.</p></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {LOCKED_STAGES.map((stage) => <div key={stage} className="flex min-h-16 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-500"><LockKeyhole className="h-4 w-4 shrink-0" />{stage}</div>)}
                    </div>
                </div>
            ) : mayReview ? (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    {reviewMode === "return" && (
                        <label className="block space-y-2"><span className="text-sm font-bold text-slate-800">Correction notes</span><Textarea value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} placeholder="Explain exactly what must be corrected" className="min-h-24 rounded-xl" /></label>
                    )}
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        {reviewMode === "return" ? (
                            <>
                                <Button variant="outline" onClick={() => { setReviewMode("none"); setReviewNotes(""); }} disabled={reviewMutation.isPending}>Cancel</Button>
                                <Button variant="destructive" onClick={() => reviewMutation.mutate("return_for_correction")} disabled={reviewNotes.trim().length < 5 || reviewMutation.isPending}>Return for Correction</Button>
                            </>
                        ) : (
                            <>
                                <Button variant="outline" onClick={() => setReviewMode("return")} disabled={reviewMutation.isPending}>Return for Correction</Button>
                                <Button onClick={() => reviewMutation.mutate("verify")} disabled={reviewMutation.isPending} className="bg-blue-600 text-white hover:bg-blue-700"><ClipboardCheck className="mr-2 h-4 w-4" />Verify NG</Button>
                            </>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <div><p className="font-bold text-amber-900">Review pending</p><p className="text-sm text-amber-800">{isReporter ? "Another authorized Manager must review this report." : "You can view this evidence, but you do not have review permission."}</p></div>
                </div>
            )}
        </div>
    );

    const header = (
        <div className="flex items-start justify-between gap-3">
            <span className="sr-only" aria-live="polite">{submitMutation.isPending ? "Submitting NG report" : reviewMutation.isPending ? "Saving Manager review" : ""}</span>
            <div className="flex min-w-0 items-start gap-3">
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", protectedStatus ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700")}>
                    {protectedStatus ? <ClipboardCheck className="h-5 w-5" /> : <FileWarning className="h-5 w-5" />}
                </div>
                <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">#{getSafeJobDisplayRef(job)}</p><h2 className="truncate text-lg font-bold text-slate-900">{protectedStatus ? (isAwaitingDecision ? "NG Decision Workflow" : "Manager NG Review") : "Report NG"}</h2><p className="text-sm text-slate-500">{job.device || "Repair job"}</p></div>
            </div>
            <Button variant="ghost" size="icon" onClick={close} className="h-10 w-10 shrink-0 rounded-full" aria-label="Close NG workflow"><X className="h-5 w-5" /></Button>
        </div>
    );

    const footer = !protectedStatus ? (
        <div className="flex w-full items-center justify-between gap-3">
            <Button type="button" variant="ghost" onClick={resetForm} disabled={submitMutation.isPending}><RotateCcw className="mr-2 h-4 w-4" />Reset</Button>
            <Button type="button" onClick={() => submitMutation.mutate()} disabled={!canSubmit} className="min-w-40 bg-rose-600 text-white hover:bg-rose-700">
                {submitMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</> : <><Send className="mr-2 h-4 w-4" />Send for Review</>}
            </Button>
        </div>
    ) : null;

    if (isMobile) {
        return createPortal(
            <AnimatePresence>
                {open && (
                    <div className="fixed inset-0 z-[260]" role="dialog" aria-modal="true" aria-label="NG resolution workflow">
                        <button type="button" className="absolute inset-0 bg-slate-950/45" onClick={close} aria-label="Close NG workflow" />
                        <MobileBottomSheetFrame onClose={close} dragHandleOnly className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-2xl bg-white shadow-2xl">
                            <MobileBottomSheetDragHandle onClose={close} />
                            <div className="shrink-0 border-b border-slate-100 px-4 pb-3">{header}</div>
                            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{protectedStatus ? reportContent : formContent}</div>
                            {footer && <div className="w-full shrink-0 border-t border-slate-100 bg-white p-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>{footer}</div>}
                        </MobileBottomSheetFrame>
                    </div>
                )}
            </AnimatePresence>,
            document.body,
        );
    }

    return (
        <Dialog open={open} onOpenChange={(value) => { if (!value) close(); }}>
            <DialogContent className="flex max-h-[90vh] max-w-6xl flex-col gap-0 overflow-hidden border-slate-200 p-0 shadow-2xl [&>button]:hidden">
                <DialogHeader className="shrink-0 border-b border-slate-100 px-6 py-5 text-left">
                    <DialogTitle className="sr-only">NG resolution workflow</DialogTitle>
                    <DialogDescription className="sr-only">Submit or review a controlled not-good repair report.</DialogDescription>
                    {header}
                </DialogHeader>
                <div className="min-h-0 flex-1 overflow-y-auto p-6">{protectedStatus ? reportContent : formContent}</div>
                {footer && <div className="shrink-0 border-t border-slate-100 bg-white px-6 py-4">{footer}</div>}
            </DialogContent>
        </Dialog>
    );
}
