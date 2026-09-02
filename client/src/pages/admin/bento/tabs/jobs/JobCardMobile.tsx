import { motion } from "framer-motion";
import type { MouseEvent } from "react";
import { CreditCard, PackagePlus, User, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { JobTicket } from "@shared/schema";
import { getSafeJobDisplayRef } from "@shared/job-display-utils";
import { HighlightMatch } from "../../shared";
import { ClientClassBadge } from "@/components/admin/ClientClassBadge";
import { getPrimaryAction, getStatusVisual, mobileCardVariants } from "./jobActions";
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

    return (
        <motion.div
            variants={mobileCardVariants}
            onClick={() => onViewDetails(job)}
            className="relative cursor-pointer overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm active:scale-[0.99] transition-transform"
        >
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
