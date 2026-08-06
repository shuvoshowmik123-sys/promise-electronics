import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Push copy that Chrome's spam classifier will accept.
 *
 * Since May 2025 Chrome runs an on-device machine-learning filter over web push
 * title and body text on Android. It reads the WORDS — not the VAPID keys, not
 * the service worker, not the FCM setup — and hides anything it dislikes behind
 * a "this may be deceptive" warning. For a repair shop that is a trust problem:
 * the customer is told, by their own browser, that we might be scamming them.
 *
 * The worst offender was the handover code: "Handover code ready" / "Open repair
 * X in My Repairs to see your code". That is structurally identical to OTP
 * phishing — vague subject, no named party, tap through for a code. It was
 * worded vaguely for a SECURITY reason (the code must never appear in a push),
 * which the classifier cannot know.
 *
 * The rule these tests enforce: name the specific thing, state a fact, drop the
 * urgency. Copy that reads like a receipt passes; copy that reads like an
 * advertisement does not.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Files that build push notification titles or bodies. */
const PUSH_SOURCES: Array<[string, string]> = [
    ["pushService", read("server/pushService.ts")],
    ["service-requests", read("server/routes/service-requests.routes.ts")],
    ["logistics-task", read("server/services/logistics-task.service.ts")],
    ["jobs.routes", read("server/routes/jobs.routes.ts")],
    ["ai-logger", read("server/routes/middleware/ai-logger.ts")],
    ["backup-scheduler", read("server/services/backup-scheduler.service.ts")],
];

/** Pull the string literal from every `title:` / `body:` line. */
function pushCopyLines(src: string): string[] {
    const out: string[] = [];
    for (const m of src.matchAll(/^\s*(?:title|body):\s*(["'`])([^"'`]*)\1\s*,/gm)) {
        if (m[2].trim()) out.push(m[2]);
    }
    return out;
}

describe("no known spam triggers in push copy", () => {
    it("contains no exclamation marks", () => {
        // "Your Quote is Ready!" and "ready for pickup/delivery!" were both
        // flagged patterns. Excitement is the single clearest signal.
        for (const [name, src] of PUSH_SOURCES) {
            for (const line of pushCopyLines(src)) {
                expect(line, `${name}: "${line}"`).not.toMatch(/!/);
            }
        }
    });

    it("contains no tap-through or click-bait instructions", () => {
        // "Tap to view details" is close to a canonical example of what the
        // classifier is built to catch.
        const banned = /\b(tap to (view|see|open)|click here|see more|find out|don'?t miss)\b/i;
        for (const [name, src] of PUSH_SOURCES) {
            for (const line of pushCopyLines(src)) {
                expect(line, `${name}: "${line}"`).not.toMatch(banned);
            }
        }
    });

    it("contains no urgency or promotional vocabulary", () => {
        const banned = /\b(urgent|hurry|act now|limited time|free|win|winner|congratulations|claim now|expires soon)\b/i;
        for (const [name, src] of PUSH_SOURCES) {
            for (const line of pushCopyLines(src)) {
                expect(line, `${name}: "${line}"`).not.toMatch(banned);
            }
        }
    });
});

describe("the handover code notification specifically", () => {
    const SR = read("server/routes/service-requests.routes.ts");

    it("no longer uses the OTP-phishing shape", () => {
        // Matched as an ASSIGNMENT, not as a substring: the comment above the
        // fix quotes the old wording verbatim to explain why it was changed,
        // and a bare `toContain` would flag that explanation as the defect.
        expect(SR).not.toMatch(/title:\s*["']Handover code ready["']/);
        expect(SR).not.toMatch(/body:\s*[`"'][^`"']*to see your code/);
    });

    it("names the business and the device", () => {
        // Specificity is what separates transactional from bait.
        expect(SR).toContain("Promise Electronics ${action === \"receive\" ? \"collection\" : \"delivery\"}");
        expect(SR).toMatch(/request\.brand \|\| "your TV"/);
    });

    it("STILL never puts the code itself in the push", () => {
        /**
         * The security requirement that forced the vague wording in the first
         * place. Rewriting for the spam filter must not have leaked the code
         * into a payload that renders on a lock screen.
         */
        const block = SR.slice(
            SR.indexOf("Promise Electronics ${action"),
            SR.indexOf("Promise Electronics ${action") + 600,
        );
        expect(block).not.toMatch(/\bcode\s*[:=]\s*(code|issued\.code|plaintext)/);
        expect(block).not.toContain("hashCustodyCode");
        expect(block).toMatch(/6-digit code is in My Repairs/);
    });
});

describe("titles carry a subject, not a bare category", () => {
    it("staff assignment pushes name the work", () => {
        const LOGISTICS = read("server/services/logistics-task.service.ts");
        const JOBS = read("server/routes/jobs.routes.ts");
        // Body is built from customer, device, place and time — not a task id.
        expect(LOGISTICS).toContain("task.customerName");
        expect(JOBS).toContain("job.device");
    });

    it("the new-request push leads with the device, not a generic subject", () => {
        const SR = read("server/routes/service-requests.routes.ts");
        expect(SR).not.toMatch(/title: 'New service request'/);
        expect(SR).toMatch(/New repair request — \$\{request\.brand/);
    });
});
