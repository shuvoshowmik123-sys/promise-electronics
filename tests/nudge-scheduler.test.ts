import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The system now speaks first — attendance, unlisted parts, stalled work.
 *
 * Two things make that safe rather than annoying, and both are pinned here:
 * every nudge must be sendable at most once per day, because the scheduler
 * polls; and the copy must survive Chrome's on-device spam classifier, which
 * already buried this shop's notifications once.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const NUDGE = read("server/services/nudge-scheduler.service.ts");
const SCHEMA = read("shared/schema.ts");
const MIGRATE = read("server/services/main-schema-migrate.service.ts");
const INDEX = read("server/index.ts");

describe("a polling scheduler cannot send the same nudge twice", () => {
    it("claims each dispatch with an atomic insert, not a read-then-write", () => {
        /**
         * A SELECT-then-INSERT loses to a second instance polling at the same
         * instant. ON CONFLICT DO NOTHING resolves in one statement, and the
         * push is gated on a row actually being created.
         */
        expect(NUDGE).toContain("INSERT INTO reminder_dispatches");
        expect(NUDGE).toContain("ON CONFLICT (run_day, reminder_kind, user_id, target_ref) DO NOTHING");
        expect(NUDGE).toMatch(/return \(result\.rowCount \?\? 0\) > 0/);
    });

    it("sends only when the claim was won", () => {
        expect(NUDGE).toMatch(/if \(!\(await claimDispatch\([^)]*\)\)\) return false/);
    });

    it("the uniqueness is enforced by the database, not by application logic", () => {
        expect(SCHEMA).toContain("uq_reminder_dispatch_once");
        expect(MIGRATE).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_reminder_dispatch_once");
    });

    it("targetRef defaults to empty string, never NULL", () => {
        // NULL <> NULL in a unique index, so nullable day-scoped rows would
        // never collide and every poll would send again.
        expect(SCHEMA).toMatch(/targetRef:\s*text\("target_ref"\)\.notNull\(\)\.default\(""\)/);
        expect(MIGRATE).toContain("target_ref    TEXT NOT NULL DEFAULT ''");
    });
});

describe("the copy survives the spam classifier", () => {
    /**
     * Chrome runs an on-device model over notifications and buries anything
     * shaped like marketing. This shop was already flagged once, so the rule
     * is: no exclamation marks, no urgency, no tap-bait. Specificity is what
     * makes a nudge feel human, not punctuation.
     */
    const literals = [...NUDGE.matchAll(/(?:title|message):\s*(?:`([^`]*)`|"([^"]*)")/g)]
        .map((m) => m[1] ?? m[2] ?? "")
        .filter(Boolean);

    it("finds the nudge copy to check", () => {
        expect(literals.length).toBeGreaterThanOrEqual(6);
    });

    it("uses no exclamation marks", () => {
        for (const line of literals) expect(line, line).not.toContain("!");
    });

    it("uses no urgency or tap-bait vocabulary", () => {
        const banned = /\b(hurry|urgent|now only|don'?t forget|last chance|act now|click here|tap here|immediately)\b/i;
        for (const line of literals) expect(line, line).not.toMatch(banned);
    });

    it("never scolds — the evening message offers the correction flow", () => {
        // The day cannot be checked into any more, so guilt achieves nothing.
        // attendance_correction_requests already exists; this is where it earns
        // its keep.
        expect(NUDGE).toContain("submit a correction");
        expect(NUDGE.toLowerCase()).not.toContain("you forgot");
    });
});

describe("it stops rather than nags", () => {
    it("nudges attendance twice, then escalates to a manager", () => {
        /**
         * Past ~11:00 a missing check-in is rarely forgetfulness — it is a day
         * off, illness, or a pickup. A third buzz reaches someone who cannot
         * act on it and teaches them to swipe everything away, which would
         * cost the parts declarations this whole system exists to collect.
         */
        expect(NUDGE).toContain("attendance_first");
        expect(NUDGE).toContain("attendance_second");
        expect(NUDGE).toContain("attendance_manager_digest");
        expect(NUDGE).not.toContain("attendance_third");
    });

    it("sends nothing at all on a day with nothing to do", () => {
        expect(NUDGE).toMatch(/if \(missing\.length === 0\) return/);
    });

    it("escalates a stalled job sideways instead of repeating to the technician", () => {
        // Still stuck on day four and the technician is not the blocker.
        expect(NUDGE).toContain("stale_job_escalation");
        expect(NUDGE).toMatch(/STALE_JOB_ESCALATE_DAYS\s*=\s*4/);
        expect(NUDGE).toMatch(/STALE_JOB_DAYS\s*=\s*2/);
    });

    it("the manager digest is one notification naming everyone, not one each", () => {
        expect(NUDGE).toMatch(/names\.slice\(0, 3\)/);
        expect(NUDGE).toMatch(/and \$\{names\.length - 3\} more/);
    });
});

describe("it asks the right question about time and activity", () => {
    it("uses the Dhaka calendar day, not UTC", () => {
        // A 09:00 Dhaka check-in is the previous UTC day; comparing raw
        // timestamps would mark present staff absent every morning.
        expect(NUDGE).toContain('const DHAKA_TZ = "Asia/Dhaka"');
        expect(NUDGE).toContain("AT TIME ZONE 'UTC' AT TIME ZONE");
    });

    it("derives job activity from audit_logs, because job_tickets has no updated_at", () => {
        /**
         * created_at answers the wrong question: a job opened last week and
         * worked on this morning is exactly the one whose parts are due
         * tonight. Verified against the schema — if an updated_at column is
         * ever added, this test is the reminder to reconsider.
         */
        expect(NUDGE).toContain("FROM audit_logs a");
        expect(NUDGE).toContain("a.entity = 'JobTicket'");
        expect(NUDGE).not.toMatch(/j\.updated_at/);

        const jobTable = SCHEMA.slice(SCHEMA.indexOf('pgTable("job_tickets"'));
        const jobTableBody = jobTable.slice(0, jobTable.indexOf("});"));
        expect(jobTableBody).not.toContain('timestamp("updated_at")');
    });

    it("treats a never-touched job as the most stalled, not as excluded", () => {
        expect(NUDGE).toMatch(/COALESCE\([\s\S]*?j\.created_at[\s\S]*?\) AS last_touched/);
    });
});

describe("the ledgers stay bounded", () => {
    it("sweeps read notifications and old dispatches", () => {
        // The bell queries notifications on every load, so an unbounded table
        // gets slower forever.
        expect(NUDGE).toContain("DELETE FROM notifications");
        expect(NUDGE).toContain("DELETE FROM reminder_dispatches");
    });

    it("never deletes unread notifications regardless of age", () => {
        // Those are still somebody's outstanding work.
        expect(NUDGE).toMatch(/DELETE FROM notifications\s*\n\s*WHERE read = true/);
    });
});

describe("wiring", () => {
    it("starts and stops with the other schedulers", () => {
        expect(INDEX).toContain("startNudgeScheduler()");
        expect(INDEX).toContain("stopNudgeScheduler()");
    });

    it("does not collide with the user-created reminder service", () => {
        /**
         * reminder.service.ts delivers reminders a PERSON set. Both once
         * exported startReminderScheduler; importing both into index.ts would
         * have been a redeclaration.
         */
        expect(NUDGE).not.toContain("export function startReminderScheduler");
        expect(INDEX).toContain('from "./services/reminder.service.js"');
        expect(INDEX).toContain('from "./services/nudge-scheduler.service.js"');
    });

    it("one slow sweep cannot overlap the next tick", () => {
        expect(NUDGE).toMatch(/if \(sweepInFlight\) return/);
    });

    it("a failing sweep never silences the others", () => {
        // Attendance failing must not also cancel the parts declaration.
        const body = NUDGE.slice(NUDGE.indexOf("export async function runNudgeSweep"));
        expect(body).toContain("ATTENDANCE_SWEEP_FAILED");
        expect(body).toContain("PARTS_SWEEP_FAILED");
        expect(body).toContain("STALE_JOB_SWEEP_FAILED");
    });
});

describe("migration safety", () => {
    it("is additive only", () => {
        const entry = MIGRATE.slice(MIGRATE.indexOf('id: "2026_08_07_reminder_dispatches"'));
        const body = entry.slice(0, entry.indexOf("},\n];") + 1);
        expect(body).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
        expect(body).not.toMatch(/\bTRUNCATE\b/i);
        expect(body).not.toMatch(/\bDELETE\s+FROM\b/i);
        expect(body).toContain("CREATE TABLE IF NOT EXISTS reminder_dispatches");
    });

    it("is registered in the migration ledger", () => {
        /**
         * Presence, not position. This originally pinned
         * REQUIRED_MAIN_SCHEMA_VERSION to this id, so the next migration
         * appended anywhere in the project failed it — a false alarm about
         * unrelated work rather than a real regression. The ledger is
         * append-only; being last is temporary by definition.
         */
        expect(MIGRATE).toContain('id: "2026_08_07_reminder_dispatches"');
    });
});
