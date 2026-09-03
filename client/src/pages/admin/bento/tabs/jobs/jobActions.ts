import {
    CheckCircle2, ClipboardCheck, CreditCard, Eye, PackageCheck, Play, Truck, UserCheck,
    type LucideIcon,
} from "lucide-react";

export const mobileListVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.04, duration: 0.2 } },
};

export const mobileCardVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 26 } as any },
};
import type { JobTicket } from "@shared/schema";

export type PrimaryActionType = "view" | "edit" | "advance" | "print" | "ngWorkflow";

export interface PrimaryAction {
    label: string;
    type: PrimaryActionType;
    Icon: LucideIcon;
}

/**
 * The single contextual action shown per job. Changes by status.
 * Shared by the desktop grid card, the mobile card, and the detail sheet
 * so the technician sees one consistent "next step" everywhere.
 */
/**
 * The one button this job is asking for, from whoever is looking at it.
 *
 * `canEdit` and `canAdvance` are separate because they were one flag doing two
 * unrelated jobs — "may move this job along" and "may rewrite the customer,
 * the device and the money". A technician needs the first and must never have
 * the second, and a single flag cannot say that.
 *
 * The cost of conflating them was a repair flow with four of its five steps
 * shut. A technician created through the current Add-User flow holds
 * jobs.advanceStatus and no canEdit, so Start Repair, Parts Arrived, Record
 * Final Test and Complete all rendered as "View Job" — while the server would
 * have accepted every one of them, because it only ever checked assignment.
 * Only "Report Result" worked, because someone had already noticed and added
 * canReportNg as an escape hatch for that single step.
 *
 * Technicians created before the preset existed have blank permissions, fall
 * back to legacy defaults that include canEdit, and work fine. That is why the
 * fault looked random.
 *
 * `canAdvance` defaults to `canEdit` so every caller that has not been updated
 * behaves exactly as before.
 */
export function getPrimaryAction(
    job: JobTicket,
    canEdit: boolean,
    canReviewNg = false,
    canReportNg = false,
    canAdvance = canEdit,
): PrimaryAction {
    const status = job.status || "";
    const hasTechnician = Boolean(job.technician && job.technician !== "Unassigned");

    if (status === "NG Review Pending") {
        return { label: canReviewNg ? "Review NG" : "View NG Report", type: "ngWorkflow", Icon: ClipboardCheck };
    }
    if (status === "Awaiting Customer Decision") {
        return { label: "View Workflow", type: "ngWorkflow", Icon: ClipboardCheck };
    }
    // Nothing to offer someone who can only look.
    if (!canEdit && !canAdvance && !canReportNg) return { label: "View Job", type: "view", Icon: Eye };

    /**
     * Assigning somebody is editing the job, not advancing it. A technician
     * moving their own work along should never be handed this.
     */
    if (canEdit && !hasTechnician && !["Delivered", "Completed", "Cancelled", "Abandoned", "Forfeited"].includes(status)) {
        return { label: "Assign Technician", type: "edit", Icon: UserCheck };
    }

    // Each step of the repair asks only for the right to advance it.
    if (status === "Pending" && canAdvance) return { label: "Start Repair", type: "advance", Icon: Play };
    if (["Diagnosing", "In Progress", "On Workbench"].includes(status) && (canAdvance || canReportNg)) {
        return { label: "Report Result", type: "advance", Icon: CheckCircle2 };
    }
    if (["Pending Parts", "Waiting on Parts"].includes(status) && canAdvance) {
        return { label: "Parts Arrived", type: "advance", Icon: PackageCheck };
    }
    if (status === "Testing" && canAdvance) {
        return { label: "Record Final Test", type: "advance", Icon: ClipboardCheck };
    }
    /*
     * Completing is not billing.
     *
     * "Complete & Bill" named one button after two jobs and did only the first
     * - it advances Ready to Completed and never opens a till - while a second
     * button beside it, "Bill at POS", was the one that actually takes money.
     * Two controls, both saying bill, one of which does not. Nobody could tell
     * them apart, and the person who may finish a repair is not always the
     * person who may handle payment.
     *
     * So this says what it does. Billing stays on its own control, shown only
     * to whoever holds the till permission.
     */
    if (status === "Ready" && canAdvance) return { label: "Mark Completed", type: "advance", Icon: CheckCircle2 };

    /**
     * Delivery stays with canEdit. Handing the television back is a counter
     * action with money and custody attached, not the last step of a repair.
     */
    if (status === "Completed" && canEdit) return { label: "Print & Deliver", type: "print", Icon: Truck };
    return { label: "View Job", type: "view", Icon: Eye };
}

export interface StatusVisual {
    /** vertical accent bar on the mobile card */
    bar: string;
    /** soft-tint badge (bg + text) */
    badge: string;
    /** label shown in the badge */
    label: string;
}

/**
 * Status -> color language. Drives the card's left accent bar and the status badge.
 * New=blue, Repairing=indigo, Waiting Parts=amber, Ready=emerald,
 * Delivered/Completed=slate/emerald, Cancelled=red.
 */
export function getStatusVisual(status: string | null | undefined): StatusVisual {
    const s = status || "";
    if (["Pending", "Diagnosing"].includes(s))
        return { bar: "bg-blue-500", badge: "bg-blue-100 text-blue-700", label: s === "Diagnosing" ? "DIAGNOSING" : "NEW" };
    if (["In Progress", "On Workbench"].includes(s))
        return { bar: "bg-indigo-500", badge: "bg-indigo-100 text-indigo-700", label: "REPAIRING" };
    if (["Pending Parts", "Waiting on Parts"].includes(s))
        return { bar: "bg-amber-500", badge: "bg-amber-100 text-amber-700", label: "WAITING PARTS" };
    if (s === "Testing")
        return { bar: "bg-violet-500", badge: "bg-violet-100 text-violet-800", label: "FINAL TESTING" };
    if (s === "NG Review Pending")
        return { bar: "bg-amber-500", badge: "bg-amber-100 text-amber-800", label: "REVIEW NG" };
    if (s === "Awaiting Customer Decision")
        return { bar: "bg-blue-500", badge: "bg-blue-100 text-blue-800", label: "CUSTOMER DECISION" };
    if (s === "Ready")
        return { bar: "bg-cyan-500", badge: "bg-cyan-100 text-cyan-700", label: "READY" };
    if (s === "Completed")
        return { bar: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700", label: "COMPLETED" };
    if (s === "Delivered")
        return { bar: "bg-slate-400", badge: "bg-slate-100 text-slate-600", label: "DELIVERED" };
    if (["Cancelled", "Abandoned", "Forfeited"].includes(s))
        return { bar: "bg-red-500", badge: "bg-red-100 text-red-700", label: s.toUpperCase() };
    return { bar: "bg-slate-300", badge: "bg-slate-100 text-slate-600", label: s.toUpperCase() || "—" };
}
