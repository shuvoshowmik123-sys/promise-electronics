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
export function getPrimaryAction(
    job: JobTicket,
    canEdit: boolean,
    canReviewNg = false,
    canReportNg = false,
): PrimaryAction {
    const status = job.status || "";
    const hasTechnician = Boolean(job.technician && job.technician !== "Unassigned");

    if (status === "NG Review Pending") {
        return { label: canReviewNg ? "Review NG" : "View NG Report", type: "ngWorkflow", Icon: ClipboardCheck };
    }
    if (status === "Awaiting Customer Decision") {
        return { label: "View Workflow", type: "ngWorkflow", Icon: ClipboardCheck };
    }
    // Report-only technicians may open result / NG workflow without generic canEdit
    if (!canEdit && !canReportNg) return { label: "View Job", type: "view", Icon: Eye };
    if (canEdit && !hasTechnician && !["Delivered", "Completed", "Cancelled", "Abandoned", "Forfeited"].includes(status)) {
        return { label: "Assign Technician", type: "edit", Icon: UserCheck };
    }
    if (status === "Pending" && canEdit) return { label: "Start Repair", type: "advance", Icon: Play };
    if (["Diagnosing", "In Progress", "On Workbench"].includes(status) && (canEdit || canReportNg)) {
        return { label: "Report Result", type: "advance", Icon: CheckCircle2 };
    }
    if (["Pending Parts", "Waiting on Parts"].includes(status) && canEdit) {
        return { label: "Parts Arrived", type: "advance", Icon: PackageCheck };
    }
    if (status === "Testing" && canEdit) {
        return { label: "Record Final Test", type: "advance", Icon: ClipboardCheck };
    }
    if (status === "Ready" && canEdit) return { label: "Complete & Bill", type: "advance", Icon: CreditCard };
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
