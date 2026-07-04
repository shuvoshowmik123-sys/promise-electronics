/**
 * Job Display Reference Utilities
 *
 * Returns a safe, human-readable job reference for UI labels.
 * Internal nanoid IDs are never exposed as the primary visible label;
 * they may still be used internally for API lookup, search payloads,
 * selection, joins, and mutations.
 *
 * Used by both server (analytics/corporate repositories) and client
 * (admin/corporate/tech dashboards) to keep display logic consistent.
 */

type JobRefInput = {
    id?: string | null;
    corporateJobNumber?: string | null;
};

const JOB_NUMBER_RE = /^JOB-\d{4}-\d{4,}$/i;

export function getSafeJobDisplayRef(job: JobRefInput): string {
    const corporate = job.corporateJobNumber?.trim();
    if (corporate) return corporate;

    const id = job.id?.trim();
    if (!id) return "JOB-UNKNOWN";

    if (JOB_NUMBER_RE.test(id)) return id.toUpperCase();

    return `JOB-${id.slice(-6).toUpperCase()}`;
}