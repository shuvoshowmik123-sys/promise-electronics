/**
 * Which warranty, if any, still covers a repair.
 *
 * This exists so the answer is not decided at the counter. Two dates are
 * already stored against every finished job and they run for different lengths
 * — a fitted panel can still be under its own cover months after the labour
 * warranty lapsed, which is exactly what the published Terms promise. Asking a
 * person to work that out with a customer in front of them is how the promise
 * gets broken in both directions: free repairs given away, and covered ones
 * refused.
 *
 * Shared between the server and the client on purpose. The counter needs to
 * show it and the claim route needs to enforce it, and two implementations of
 * one rule is two answers to the same question.
 */

export type WarrantyKind = "service" | "parts";

export type CoverageLine = {
    kind: WarrantyKind;
    /** Whether this cover is live right now. */
    active: boolean;
    expiresAt: Date | null;
    daysLeft: number | null;
    /** Said the way it would be said to a customer. */
    summary: string;
};

export type Coverage = {
    /** True when at least one cover is live. */
    covered: boolean;
    lines: CoverageLine[];
    /** What to show when nothing is covered, or null when something is. */
    refusal: string | null;
};

type WarrantyJobFields = {
    warrantyExpiryDate?: Date | string | null;
    partsWarrantyExpiryDate?: Date | string | null;
    warrantyDays?: number | null;
    partsWarrantyDays?: number | null;
};

function toDate(value: Date | string | null | undefined): Date | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function whole(days: number): string {
    if (days === 1) return "1 day";
    return `${days} days`;
}

/**
 * Read the cover as of a given moment.
 *
 * `now` is a parameter rather than read from the clock so the same job can be
 * asked about at a past date — and so this can be tested without waiting.
 */
export function getWarrantyCoverage(job: WarrantyJobFields, now: Date = new Date()): Coverage {
    const lines: CoverageLine[] = [];

    const build = (kind: WarrantyKind, expiry: Date | null, days: number | null | undefined): CoverageLine => {
        if (!expiry) {
            return {
                kind,
                active: false,
                expiresAt: null,
                daysLeft: null,
                /**
                 * No date is not the same as expired, and the difference
                 * matters at a counter. A parts warranty with no date usually
                 * means no parts were fitted; a service warranty with no date
                 * means nobody recorded one, which is a gap to fix rather than
                 * a refusal to make.
                 */
                summary: kind === "parts"
                    ? "No parts warranty on this job — no parts were recorded as fitted."
                    : "No service warranty was recorded for this job.",
            };
        }

        const msLeft = expiry.getTime() - now.getTime();
        const daysLeft = Math.ceil(msLeft / 86_400_000);
        const active = msLeft > 0;
        const label = kind === "service" ? "Service warranty" : "Parts warranty";
        const dateText = expiry.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

        return {
            kind,
            active,
            expiresAt: expiry,
            daysLeft,
            summary: active
                ? `${label} valid until ${dateText} — ${whole(daysLeft)} left.`
                : `${label} ended on ${dateText}, ${whole(Math.abs(daysLeft))} ago.`,
        };
    };

    lines.push(build("service", toDate(job.warrantyExpiryDate), job.warrantyDays));

    /**
     * The parts line is only offered when there is a parts warranty to speak
     * of. Showing "Parts warranty: none" on every job that never had a part
     * fitted trains people to ignore the whole panel.
     */
    const partsExpiry = toDate(job.partsWarrantyExpiryDate);
    if (partsExpiry || job.partsWarrantyDays) {
        lines.push(build("parts", partsExpiry, job.partsWarrantyDays));
    }

    const covered = lines.some((l) => l.active);

    return {
        covered,
        lines,
        refusal: covered
            ? null
            : lines.some((l) => l.expiresAt)
                ? "Every warranty on this job has ended. A repair now is chargeable."
                : "No warranty was recorded on this job, so there is nothing to claim against.",
    };
}

/** The kinds a claim may be raised under, given what is actually live. */
export function claimableKinds(coverage: Coverage): WarrantyKind[] {
    return coverage.lines.filter((l) => l.active).map((l) => l.kind);
}
