import { motion } from "framer-motion";
import type { MouseEvent } from "react";
import { CreditCard, PackagePlus, User, UserCheck, PhoneCall, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { JOB_DELAY_REASONS, delayReasonLabel } from "@shared/delay-reasons";
import type { JobTicket } from "@shared/schema";
import { getSafeJobDisplayRef } from "@shared/job-display-utils";
import { HighlightMatch } from "../../shared";
import { ClientClassBadge } from "@/components/admin/ClientClassBadge";
import { getPrimaryAction, getStatusVisual, mobileCardVariants } from "./jobActions";
import { hapticMedium } from "@/lib/native-features";
import { getJobModelDisplay } from "./jobIdentityDisplay";
import { formatScreenSize } from "@shared/tv-options";

interface JobCardMobileProps {
    job: JobTicket;
    searchQuery: string;
    onViewDetails: (job: JobTicket) => void;
    onEditJob: (job: JobTicket) => void;
    onAdvanceStage: (job: JobTicket) => void;
    onOpenNgWorkflow: (job: JobTicket) => void;
    onPrintTicket: (job: JobTicket) => void;
    userRole?: string;
    canEdit: boolean;
    /**
     * May move this job to its next status. Separate from canEdit, which is the
     * right to rewrite the customer, the device and the money — a technician
     * has the first and must never have the second.
     */
    canAdvance?: boolean;
    canReviewNg: boolean;
    canReportNg?: boolean;
    currencySymbol: string;
    /**
     * True only when the server's billing list actually contains this job.
     *
     * Deliberately NOT derived from job.status here. The server also requires
     * the walk-in lane, so a completed corporate job is not billable — a
     * status-only check would show this button on jobs the POS cannot link,
     * and the handoff would land on an empty till with no explanation.
     * Membership of the real list is the only thing that cannot disagree.
     */
    isBillable?: boolean;
    onBillAtPos?: (job: JobTicket) => void;
    /**
     * Record that the customer is asking about this repair.
     *
     * Optional in the same way onBillAtPos is: the parent passes it only to
     * people allowed to do it, and its absence removes the control rather than
     * showing one that refuses.
     */
    onCustomerChase?: (job: JobTicket) => void;
    /** Answer the stale-job nudge with one of the fixed reasons. */
    onSetDelayReason?: (job: JobTicket, reason: string) => void;
    /** True when this job has no parts recorded — what the nightly nudge chases. */
    needsPartsDeclaration?: boolean;
    onDeclareParts?: (job: JobTicket) => void;
}

/**
 * Technician-first mobile job card.
 * Status accent bar (left) + ticket/status + bold device + size·issue +
 * masked customer + Est cost + one full-width contextual action button.
 * Customer name is masked and phone hidden for plain technicians (privacy rule).
 */
export function JobCardMobile({
    job,
    searchQuery,
    onViewDetails,
    onEditJob,
    onAdvanceStage,
    onOpenNgWorkflow,
    onPrintTicket,
    userRole,
    canEdit,
    canAdvance,
    canReviewNg,
    canReportNg = false,
    currencySymbol,
    isBillable = false,
    onBillAtPos,
    onCustomerChase,
    onSetDelayReason,
    needsPartsDeclaration = false,
    onDeclareParts,
}: JobCardMobileProps) {
    const j = job as any;
    const isTechnician = userRole === "Technician";
    const showCustomerDetails = !isTechnician || canEdit;
    const status = getStatusVisual(job.status);
    const action = getPrimaryAction(job, canEdit, canReviewNg, canReportNg, canAdvance ?? canEdit);
    const ActionIcon = action.Icon;
    const actionLabel = action.label === "Assign Technician" ? "Assign" : action.label === "Print & Deliver" ? "Deliver" : action.label;

    const handlePrimaryAction = (event: MouseEvent) => {
        event.stopPropagation();
        /*
         * Medium, not light. This is the button that moves a real repair to its
         * next stage — a firmer answer than picking a brand, and the difference
         * is felt without being thought about.
         */
        void hapticMedium();
        if (action.type === "edit") onEditJob(job);
        else if (action.type === "advance") onAdvanceStage(job);
        else if (action.type === "ngWorkflow") onOpenNgWorkflow(job);
        else if (action.type === "print") onPrintTicket(job);
        else onViewDetails(job);
    };

    const customerLabel = showCustomerDetails
        ? job.customer || "Unknown"
        : job.customer
            ? `${job.customer.split(" ")[0]} ***`
            : "Unknown";

    const isHotPriority = job.priority === "High" || job.priority === "Critical";

    /*
     * The customer is waiting, and the card says so on its own.
     *
     * A technician is not given the control that raises this - somebody
     * marking their own job urgent is not a customer chasing - so the only way
     * they learn of it is the job carrying the mark. A push can be missed,
     * swiped, or arrive in a pocket; a red edge on the card is still there
     * tomorrow morning.
     */
    /*
     * Shown once the job has gone quiet, and not before.
     *
     * Six chips on every card would be noise on the ninety per cent of jobs
     * moving normally, and noise is what the whole change is meant to remove.
     * They appear on the jobs the nudge would chase - open, assigned, and
     * untouched for two days - which is exactly the set the reminder is about,
     * so the answer is in the same place as the question.
     */
    /*
     * Measured from intake, because a job has no last-touched column.
     *
     * The server's sweep computes real idleness from audit_logs; the card
     * cannot, and adding an updated_at to job_tickets to serve one badge would
     * be a schema change for a cosmetic. Age since intake asks a question that
     * is fair either way - this set has been in the shop two days and nobody
     * has said why - and the chips are an offer, not an accusation. Answering
     * removes them.
     */
    const inShopDays = job.createdAt
        ? Math.floor((Date.now() - new Date(job.createdAt as any).getTime()) / 86400000)
        : 0;
    const idleDays = inShopDays;
    const isStalled = idleDays >= 2
        && !["Completed", "Delivered", "Cancelled"].includes(String(job.status));
    const answeredReason = delayReasonLabel((job as any).delayReason);

    const isChased = Boolean((job as any).customerChaseAt);
    const chaseCount = Number((job as any).customerChaseCount) || 0;

    /*
     * Thirty minutes between chases, shown before it is refused.
     *
     * The server holds the rule; this only makes it visible. A greyed button
     * that says "asked 12m ago" answers the question somebody is about to ask -
     * has anyone told the technician yet - which is usually why they were
     * reaching for it in the first place. Letting them press it and then
     * showing an error would answer the same question and waste a tap on the way.
     */
    const minutesSinceChase = (job as any).customerChaseAt
        ? Math.floor((Date.now() - new Date((job as any).customerChaseAt).getTime()) / 60000)
        : null;
    const chaseOnCooldown = minutesSinceChase !== null && minutesSinceChase < 30;

    return (
        <motion.div
            variants={mobileCardVariants}
            onClick={() => onViewDetails(job)}
            className={cn(
                "relative cursor-pointer overflow-hidden rounded-xl border bg-white shadow-sm active:scale-[0.99] transition-transform",
                isChased ? "border-red-400 ring-1 ring-red-200" : "border-slate-300",
            )}
        >
            {isChased && (
                <div className="flex items-center gap-1.5 bg-red-50 px-3 py-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-red-700">
                        Urgent — customer asking{chaseCount > 1 ? ` (${chaseCount}x)` : ""}
                    </span>
                </div>
            )}
            {/* status accent bar */}
            <span className={cn("absolute left-0 top-0 h-full w-1", status.bar)} aria-hidden />

            <div className="p-2.5 pl-3.5 space-y-1.5">
                {/* ticket + status */}
                <div className="flex items-start justify-between gap-1.5">
                    <div className="min-w-0 space-y-1">
                        <span className="block font-mono text-[11px] font-bold text-slate-500 truncate">
                            #<HighlightMatch text={getSafeJobDisplayRef(j)} query={searchQuery} />
                        </span>
                        <ClientClassBadge clientClass={j.clientClass} size="xs" />
                        {/*
                          * Typed in from paper, not recorded as it happened.
                          *
                          * Outside the catch-up screen these jobs were
                          * indistinguishable from live ones, so a cashier
                          * tomorrow morning would have no way of knowing the
                          * money and the dates came off a bill somebody
                          * transcribed. The database has always marked them;
                          * nothing showed it.
                          */}
                        {(job as any).enteredAsCatchup && (
                            <Badge className="text-[9px] px-1.5 py-0 h-4 font-bold uppercase tracking-wider border-0 bg-amber-100 text-amber-800">
                                from paper
                            </Badge>
                        )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                        {isHotPriority && (
                            <Badge className={cn(
                                "text-[9px] px-1.5 py-0 h-4 font-bold uppercase tracking-wider border-0",
                                job.priority === "Critical" ? "bg-rose-100 text-rose-700" : "bg-red-100 text-red-700",
                            )}>
                                {job.priority}
                            </Badge>
                        )}
                        <Badge className={cn("text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-wider border-0", status.badge)}>
                            {status.label}
                        </Badge>
                    </div>
                </div>

                {/* device + size · model (no full serial on list) + issue */}
                <div>
                    <h3 className="text-[13px] font-bold text-slate-900 leading-tight line-clamp-2 min-h-[2rem]">
                        <HighlightMatch text={job.device} query={searchQuery} />
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                        {[
                            job.screenSize ? formatScreenSize(job.screenSize) : null,
                            getJobModelDisplay(job as any),
                        ].filter(Boolean).join(" · ")}
                        {((job.screenSize || getJobModelDisplay(job as any)) && job.issue) ? " · " : ""}
                        {job.issue ? <HighlightMatch text={job.issue} query={searchQuery} /> : null}
                    </p>
                </div>

                <div className="space-y-1.5 pt-1.5 border-t border-slate-100">
                    <div className="min-w-0 space-y-0.5">
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-700 min-w-0">
                            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">
                                <HighlightMatch text={customerLabel} query={searchQuery} />
                            </span>
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 min-w-0">
                            <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className={cn("truncate", (!job.technician || job.technician === "Unassigned") && "italic text-slate-400")}>
                                {job.technician && job.technician !== "Unassigned" ? job.technician : "Unassigned"}
                            </span>
                        </span>
                    </div>
                    {/*
                      * Only rendered once the job is genuinely on the server's
                      * billing list — the customer is at the counter and the
                      * repair is finished. Taking it straight to the till with
                      * the job already attached is the whole point: the till
                      * then only needs parts and warranty.
                      */}
                    {needsPartsDeclaration && onDeclareParts && (
                        <Button
                            onClick={(event) => {
                                event.stopPropagation();
                                onDeclareParts(job);
                            }}
                            className="h-9 w-full rounded-lg gap-1.5 border border-violet-100 bg-violet-50 text-[11px] font-bold text-violet-700 shadow-none hover:bg-violet-100"
                        >
                            <PackagePlus className="w-3.5 h-3.5" />
                            List parts used
                        </Button>
                    )}
                    {/*
                      * Above Bill at POS, because it is the one action here
                      * that is time-critical: somebody is on the phone now.
                      * Not shown once the job is delivered - there is nothing
                      * left for a technician to be woken about.
                      */}
                    {/*
                      * The answer, or the question.
                      *
                      * Once a reason is given the chips go and the reason
                      * stands in their place - it is what a manager reads and
                      * what the counter repeats to a customer who rings, so it
                      * has to be visible rather than only stored.
                      */}
                    {isStalled && answeredReason && (
                        <p className="text-[10px] font-bold text-amber-700">
                            {answeredReason}
                        </p>
                    )}
                    {isStalled && !answeredReason && onSetDelayReason && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2">
                            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                                Not moved in {idleDays} days — why?
                            </p>
                            <div className="flex flex-wrap gap-1">
                                {JOB_DELAY_REASONS.map((r) => (
                                    <button
                                        key={r.id}
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onSetDelayReason(job, r.id);
                                        }}
                                        className="rounded-md border border-amber-200 bg-white px-2 py-1.5 text-[10px] font-bold text-amber-900 active:scale-[0.97]"
                                    >
                                        {r.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {/*
                      * Who finished it, by name.
                      *
                      * A completion with a time and no author cannot be
                      * questioned, and the first thing anyone asks of a closed
                      * job is who closed it. The name is snapshotted on the
                      * job, so it survives the person leaving.
                      */}
                    {(job as any).completedByName && (
                        <p className="text-[10px] font-medium text-slate-500">
                            Completed by {(job as any).completedByName}
                        </p>
                    )}
                    {/*
                      * The technician is told, not asked.
                      *
                      * They do not raise urgency - a technician marking their
                      * own job important is not a customer chasing - so the
                      * control is only handed to whoever fields the call. What
                      * a technician gets is the card itself carrying the mark,
                      * which is why this is read from the job rather than from
                      * who is looking.
                      */}
                    {onCustomerChase && job.status !== "Delivered" && (
                        <Button
                            disabled={chaseOnCooldown}
                            onClick={(event) => {
                                event.stopPropagation();
                                if (chaseOnCooldown) return;
                                onCustomerChase(job);
                            }}
                            className={cn(
                                "h-9 w-full rounded-lg gap-1.5 border text-[11px] font-bold shadow-none",
                                chaseOnCooldown
                                    ? "border-slate-200 bg-slate-50 text-slate-400"
                                    : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
                            )}
                        >
                            <PhoneCall className="w-3.5 h-3.5" />
                            {chaseOnCooldown
                                ? `Technician told ${minutesSinceChase === 0 ? "just now" : `${minutesSinceChase}m ago`}`
                                : "Customer asking"}
                        </Button>
                    )}
                    {isBillable && onBillAtPos && (
                        <Button
                            onClick={(event) => {
                                event.stopPropagation();
                                onBillAtPos(job);
                            }}
                            className="h-9 w-full rounded-lg gap-1.5 bg-emerald-600 text-[11px] font-bold text-white shadow-sm hover:bg-emerald-700"
                        >
                            <CreditCard className="w-3.5 h-3.5" />
                            Bill at POS
                        </Button>
                    )}
                    <div className="flex items-center justify-between gap-1.5">
                        {job.estimatedCost != null && (
                            <span className="text-[10px] font-semibold text-slate-500 shrink-0 font-mono">
                                {currencySymbol}{Number(job.estimatedCost).toLocaleString()}
                            </span>
                        )}
                        <Button
                            onClick={handlePrimaryAction}
                            className={cn(
                                "h-7 rounded-lg gap-1 px-2 font-bold text-[11px] shadow-sm ml-auto",
                                action.type === "edit"
                                    ? "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100"
                                    : "bg-blue-600 hover:bg-blue-700 text-white",
                            )}
                        >
                            <ActionIcon className="w-3 h-3" />
                            {actionLabel}
                        </Button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
