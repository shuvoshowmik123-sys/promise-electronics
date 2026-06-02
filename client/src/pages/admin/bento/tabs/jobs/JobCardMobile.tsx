import { motion } from "framer-motion";
import type { MouseEvent } from "react";
import { User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { JobTicket } from "@shared/schema";
import { HighlightMatch } from "../../shared";
import { ClientClassBadge } from "@/components/admin/ClientClassBadge";
import { getPrimaryAction, getStatusVisual, mobileCardVariants } from "./jobActions";

interface JobCardMobileProps {
    job: JobTicket;
    searchQuery: string;
    onViewDetails: (job: JobTicket) => void;
    onEditJob: (job: JobTicket) => void;
    onAdvanceStage: (job: JobTicket) => void;
    onPrintTicket: (job: JobTicket) => void;
    userRole?: string;
    canEdit: boolean;
    currencySymbol: string;
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
    onPrintTicket,
    userRole,
    canEdit,
    currencySymbol,
}: JobCardMobileProps) {
    const j = job as any;
    const isTechnician = userRole === "Technician";
    const showCustomerDetails = !isTechnician || canEdit;
    const status = getStatusVisual(job.status);
    const action = getPrimaryAction(job, canEdit);
    const ActionIcon = action.Icon;

    const handlePrimaryAction = (event: MouseEvent) => {
        event.stopPropagation();
        if (action.type === "edit") onEditJob(job);
        else if (action.type === "advance") onAdvanceStage(job);
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
            className="relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm active:scale-[0.99] transition-transform"
        >
            {/* status accent bar */}
            <span className={cn("absolute left-0 top-0 h-full w-1.5", status.bar)} aria-hidden />

            <div className="p-4 pl-5 space-y-3">
                {/* ticket + status */}
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs font-bold text-slate-400 truncate">
                            #<HighlightMatch text={j.ticketNumber || job.id.slice(-6).toUpperCase()} query={searchQuery} />
                        </span>
                        <ClientClassBadge clientClass={j.clientClass} size="xs" />
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        {isHotPriority && (
                            <Badge className={cn(
                                "text-[9px] px-1.5 py-0 h-4 font-bold uppercase tracking-wider border-0",
                                job.priority === "Critical" ? "bg-rose-100 text-rose-700" : "bg-red-100 text-red-700",
                            )}>
                                {job.priority}
                            </Badge>
                        )}
                        <Badge className={cn("text-[10px] px-2 py-0.5 font-bold uppercase tracking-wider border-0", status.badge)}>
                            {status.label}
                        </Badge>
                    </div>
                </div>

                {/* device + issue */}
                <div>
                    <h3 className="text-lg font-bold text-slate-900 leading-tight line-clamp-1">
                        <HighlightMatch text={job.device} query={searchQuery} />
                    </h3>
                    <p className="text-sm text-slate-500 mt-0.5 line-clamp-1">
                        {job.screenSize ? `${job.screenSize}" · ` : ""}
                        <HighlightMatch text={job.issue} query={searchQuery} />
                    </p>
                </div>

                {/* customer + est cost */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 min-w-0">
                        <User className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="truncate">
                            <HighlightMatch text={customerLabel} query={searchQuery} />
                        </span>
                    </span>
                    {job.estimatedCost != null && (
                        <span className="text-sm font-semibold text-slate-600 shrink-0 font-mono">
                            Est: {currencySymbol}{Number(job.estimatedCost).toLocaleString()}
                        </span>
                    )}
                </div>

                {/* contextual action */}
                <Button
                    onClick={handlePrimaryAction}
                    className={cn(
                        "w-full h-12 rounded-xl gap-2 font-bold text-base shadow-sm",
                        action.type === "edit"
                            ? "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100"
                            : "bg-blue-600 hover:bg-blue-700 text-white",
                    )}
                >
                    <ActionIcon className="w-5 h-5" />
                    {action.label}
                </Button>
            </div>
        </motion.div>
    );
}
