/**
 * Due Calculation Utilities (Phase 2.6)
 *
 * Payment statuses: unpaid | paid | partial | incomplete | written_off | forgiven
 * daysOverdue: calculated from createdAt/deadline for unpaid/partial jobs
 * Aging buckets: 0-30, 31-60, 61-90, 90+
 */

export type PaymentStatus = "unpaid" | "paid" | "partial" | "incomplete" | "written_off" | "forgiven";

export type DueAgingBucket = "current" | "30_days" | "60_days" | "90_days" | "over_90";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
    unpaid: "Unpaid",
    paid: "Paid",
    partial: "Partial Payment",
    incomplete: "Incomplete",
    written_off: "Written Off",
    forgiven: "Forgiven",
};

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
    unpaid: "red",
    paid: "green",
    partial: "amber",
    incomplete: "orange",
    written_off: "slate",
    forgiven: "purple",
};

/** Calculate how many days a job has been outstanding */
export function calcDaysOverdue(createdAt: Date | string, referenceDate: Date = new Date()): number {
    const created = new Date(createdAt);
    const diffMs = referenceDate.getTime() - created.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/** Classify a job into an aging bucket based on daysOverdue */
export function getDueAgingBucket(daysOverdue: number): DueAgingBucket {
    if (daysOverdue <= 30) return "current";
    if (daysOverdue <= 60) return "30_days";
    if (daysOverdue <= 90) return "60_days";
    if (daysOverdue <= 120) return "90_days";
    return "over_90";
}

export const DUE_AGING_BUCKET_LABELS: Record<DueAgingBucket, string> = {
    current: "0–30 days",
    "30_days": "31–60 days",
    "60_days": "61–90 days",
    "90_days": "91–120 days",
    over_90: "120+ days",
};

export const DUE_AGING_BUCKET_COLORS: Record<DueAgingBucket, string> = {
    current: "green",
    "30_days": "amber",
    "60_days": "orange",
    "90_days": "red",
    over_90: "rose",
};

/** Returns true for statuses that mean the debt no longer needs collection */
export function isDueClosed(status: PaymentStatus): boolean {
    return status === "paid" || status === "written_off" || status === "forgiven";
}

/** Build a due summary for a list of jobs */
export interface DueSummaryItem {
    jobId: string;
    customer: string | null;
    remaining: number;
    daysOverdue: number;
    bucket: DueAgingBucket;
    status: PaymentStatus;
}

export function buildDueSummary(
    jobs: Array<{
        id: string;
        customer: string | null;
        remainingAmount: number | null;
        paymentStatus: string;
        createdAt: Date | string;
    }>
): DueSummaryItem[] {
    return jobs
        .filter(j => !isDueClosed(j.paymentStatus as PaymentStatus) && (j.remainingAmount ?? 0) > 0)
        .map(j => {
            const days = calcDaysOverdue(j.createdAt);
            return {
                jobId: j.id,
                customer: j.customer,
                remaining: j.remainingAmount ?? 0,
                daysOverdue: days,
                bucket: getDueAgingBucket(days),
                status: j.paymentStatus as PaymentStatus,
            };
        })
        .sort((a, b) => b.daysOverdue - a.daysOverdue);
}
