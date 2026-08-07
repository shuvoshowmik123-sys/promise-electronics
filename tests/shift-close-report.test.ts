import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Closing the shift, and the pattern that only shows over weeks.
 *
 * The evening nudge asks; this records whether anyone answered. One missed
 * evening is noise — somebody was on a late delivery. The value is the shape of
 * it across a month, which is why the answer is stored rather than merely
 * notified.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const NUDGE = read("server/services/nudge-scheduler.service.ts");
const SCHEMA = read("shared/schema.ts");
const MIGRATE = read("server/services/main-schema-migrate.service.ts");

describe("the snapshot is taken when it is still true", () => {
    it("records at closing time, not the next morning", () => {
        /**
         * Recomputed in the morning this is unrecoverable: a technician who
         * declares yesterday's parts at 9am looks like they closed cleanly, and
         * the pattern erases itself.
         */
        expect(NUDGE).toMatch(/SHIFT_SNAPSHOT_MIN = 20 \* 60 \+ 30/);
        expect(NUDGE).toContain("async function snapshotShiftClose");
        expect(NUDGE).toMatch(/if \(minutes < SHIFT_SNAPSHOT_MIN\) return/);
    });

    it("takes the snapshot after the nudge, not before it", () => {
        // Nudge at 19:00 gives an hour to fix things; the record is what was
        // still outstanding after that chance.
        const nudgeAt = /SHIFT_CLOSE_MIN = 19 \* 60/.test(NUDGE);
        const snapAt = /SHIFT_SNAPSHOT_MIN = 20 \* 60 \+ 30/.test(NUDGE);
        expect(nudgeAt && snapAt).toBe(true);
    });

    it("never rewrites a day already recorded", () => {
        // The first snapshot is the honest one. A later pass must not quietly
        // launder the record after someone catches up.
        const fn = NUDGE.slice(NUDGE.indexOf("async function snapshotShiftClose"));
        expect(fn.slice(0, 4000)).toContain("ON CONFLICT (run_day, user_id) DO NOTHING");
        expect(fn.slice(0, 4000)).not.toMatch(/DO UPDATE SET/);
    });

    it("counts all three duties", () => {
        const fn = NUDGE.slice(NUDGE.indexOf("async function snapshotShiftClose"));
        const body = fn.slice(0, 4000);
        expect(body).toContain("attendanceOk");
        expect(body).toContain("partsOutstanding");
        expect(body).toContain("costsOutstanding");
        expect(body).toMatch(/attendanceOk && parts === 0 && costs === 0/);
    });

    it("counts parts from real activity, not job creation", () => {
        // job_tickets has no updated_at; created_at would ask the wrong
        // question about a job opened last week and worked on today.
        const fn = NUDGE.slice(NUDGE.indexOf("async function snapshotShiftClose"));
        expect(fn.slice(0, 4000)).toContain("FROM audit_logs al");
    });
});

describe("nobody is recorded as failing on a day the shop was shut", () => {
    it("the snapshot only runs on working days", () => {
        /**
         * On a rest day no snapshot exists, so the next morning's report finds
         * no rows and stays silent — rather than reporting every single person
         * as having missed attendance on their day off.
         */
        const sweepBlock = NUDGE.slice(NUDGE.indexOf("const sweeps = closed"));
        const closedBranch = sweepBlock.slice(0, sweepBlock.indexOf(": ("));
        expect(closedBranch).not.toContain("SHIFT_SNAPSHOT_FAILED");
        expect(closedBranch).not.toContain("MORNING_REPORT_FAILED");
        expect(sweepBlock).toContain("SHIFT_SNAPSHOT_FAILED");
        expect(sweepBlock).toContain("MORNING_REPORT_FAILED");
    });
});

describe("the report is aggregated, late, and goes to one desk", () => {
    it("reaches only the Super Admin", () => {
        // The evening nudge is private; naming people is a supervisory
        // question and belongs to one person.
        expect(NUDGE).toContain("async function superAdminIds");
        expect(NUDGE).toMatch(/eq\(schema\.users\.role, "Super Admin"\)/);
        const fn = NUDGE.slice(NUDGE.indexOf("async function sendMorningReport"));
        expect(fn.slice(0, 3000)).toContain("await superAdminIds()");
    });

    it("arrives the morning after, once people can act on it", () => {
        expect(NUDGE).toMatch(/MORNING_REPORT_MIN = 9 \* 60 \+ 30/);
        const fn = NUDGE.slice(NUDGE.indexOf("async function sendMorningReport"));
        expect(fn.slice(0, 3000)).toMatch(/setUTCDate\(yesterday\.getUTCDate\(\) - 1\)/);
    });

    it("reports only those who did not close cleanly", () => {
        const fn = NUDGE.slice(NUDGE.indexOf("async function sendMorningReport"));
        expect(fn.slice(0, 3000)).toContain("closed_clean = false");
    });

    it("is one digest naming people, not one notification each", () => {
        const fn = NUDGE.slice(NUDGE.indexOf("async function sendMorningReport"));
        expect(fn.slice(0, 3000)).toMatch(/names\.slice\(0, 3\)/);
    });

    it("stays silent when everyone closed cleanly", () => {
        // A daily "all good" is the fastest way to make this report unread.
        const fn = NUDGE.slice(NUDGE.indexOf("async function sendMorningReport"));
        expect(fn.slice(0, 3000)).toMatch(/if \(misses\.length === 0\) return/);
    });

    it("uses no urgency or blame language in the push", () => {
        // Chrome's classifier aside, a report that reads as an accusation gets
        // the messenger ignored rather than the behaviour fixed.
        const fn = NUDGE.slice(NUDGE.indexOf("async function sendMorningReport"));
        const body = fn.slice(0, 3000);
        const literals = [...body.matchAll(/(?:title|message):\s*`([^`]*)`/g)].map((m) => m[1]);
        expect(literals.length).toBeGreaterThan(0);
        for (const line of literals) {
            expect(line).not.toContain("!");
            expect(line).not.toMatch(/\b(fail|failed|guilty|warning|violation|penalty)\b/i);
        }
    });
});

describe("storage", () => {
    it("is one row per person per day", () => {
        expect(SCHEMA).toContain("uq_shift_close_once");
        expect(MIGRATE).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_shift_close_once");
    });

    it("stores counts, not copies of the underlying rows", () => {
        // Copies would let the snapshot and its source disagree.
        expect(SCHEMA).toMatch(/partsOutstanding: integer\("parts_outstanding"\)/);
        expect(SCHEMA).toMatch(/costsOutstanding: integer\("costs_outstanding"\)/);
    });

    it("the migration is additive only", () => {
        const entry = MIGRATE.slice(MIGRATE.indexOf('id: "2026_08_08_shift_close_records"'));
        const body = entry.slice(0, entry.indexOf("},\n];") + 1);
        for (const destructive of [/DROP\s+(TABLE|COLUMN)/i, /\bTRUNCATE\b/i, /\bDELETE\s+FROM\b/i]) {
            expect(body).not.toMatch(destructive);
        }
        expect(body).toContain("CREATE TABLE IF NOT EXISTS shift_close_records");
    });
});
