/**
 * Warranty stickers — proof that a repair is ours.
 *
 * The fraud this exists to stop is a customer arriving with a television and
 * claiming warranty work that was never done here, or done here on a different
 * set. Every rule below is load-bearing against that, so each test says which
 * part of the fraud it closes.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    CODE_LENGTH,
    STICKER_CODE_PATTERN,
    STICKER_PLACEMENTS,
    codeFromBytes,
    formatCode,
    jobCarriesWarranty,
    normaliseCode,
    warrantyStanding,
} from "../shared/warranty-sticker.js";

/** The closing brace of a top-level function, kept out of string literals. */
const NEWLINE = String.fromCharCode(10);
const END_OF_FN = NEWLINE + "}";

const ROOT = process.cwd();
const SERVICE = readFileSync(join(ROOT, "server/services/warranty-sticker.service.ts"), "utf8");
const ROUTES = readFileSync(join(ROOT, "server/routes/warranty-stickers.routes.ts"), "utf8");
const SCHEMA = readFileSync(join(ROOT, "shared/schema.ts"), "utf8");
const MIGRATIONS = readFileSync(join(ROOT, "server/services/main-schema-migrate.service.ts"), "utf8");
const INDEX = readFileSync(join(ROOT, "server/routes/index.ts"), "utf8");

describe("the code cannot be invented", () => {
    it("is long enough that guessing is hopeless", () => {
        // 31 symbols, 12 long — about 7.8e17 possibilities. A forger printing
        // labels at random will never hit one.
        expect(CODE_LENGTH).toBeGreaterThanOrEqual(12);
        const code = codeFromBytes(new Uint8Array(CODE_LENGTH).fill(7));
        expect(code).toHaveLength(CODE_LENGTH);
        expect(STICKER_CODE_PATTERN.test(code)).toBe(true);
    });

    it("leaves out the characters people misread", () => {
        // A sticker gets read off a scratched panel in bad light, sometimes
        // aloud. 0/O and 1/I/L confusion would turn honest customers into
        // suspected forgers.
        const all = Array.from({ length: 256 }, (_, i) => codeFromBytes(new Uint8Array(CODE_LENGTH).fill(i))).join("");
        for (const banned of ["0", "O", "1", "I", "L"]) {
            expect(all, `${banned} must not appear in a code`).not.toContain(banned);
        }
    });

    it("comes from crypto randomness, never Math.random", () => {
        // Math.random is seeded from the clock and predictable from a few
        // samples — a forger who can predict the next code prints it first.
        expect(SERVICE).toContain("randomBytes");
        expect(SERVICE).not.toContain("Math.random");
    });

    it("reads back the way it was typed", () => {
        expect(normaliseCode(" ab2-3cd4 ef5g ")).toBe("AB23CD4EF5G");
        expect(formatCode("ABCD2345EFGH")).toBe("ABCD-2345-EFGH");
        expect(normaliseCode(formatCode("ABCD2345EFGH"))).toBe("ABCD2345EFGH");
    });
});

describe("two stickers, two codes, one job", () => {
    it("puts one outside and one at the repair", () => {
        expect(STICKER_PLACEMENTS).toEqual(["outer", "inner"]);
    });

    it("gives each placement its own code", () => {
        /**
         * The whole point. One code on both would only ever answer "this is
         * job X". Two codes answer the sharper question: if the outer sticker
         * names one job and the hidden one names another, a sticker has been
         * moved between televisions.
         */
        const issue = SERVICE.slice(SERVICE.indexOf("export async function ensureStickersForJob"));
        const body = issue.slice(0, issue.indexOf("\n}"));
        // A code is minted per placement inside the loop, not once outside it.
        expect(body).toContain("for (const placement of missing)");
        expect(body).toContain("issueOne(jobTicketId, placement");
        const one = SERVICE.slice(SERVICE.indexOf("async function issueOne"));
        expect(one.slice(0, one.indexOf("\n}"))).toContain("codeFromBytes(randomBytes(CODE_LENGTH))");
    });

    it("hands back the other live sticker so the pair can be compared", () => {
        // Scan the back, open the set, scan the hidden one, check they agree.
        expect(SERVICE).toContain("siblings");
        const verify = SERVICE.slice(SERVICE.indexOf("export async function verifySticker"));
        expect(verify).toContain("isNull(schema.warrantyStickers.voidedAt)");
    });

    it("refuses to sticker a job with nothing to prove", () => {
        expect(jobCarriesWarranty({ warrantyDays: 30 })).toBe(true);
        expect(jobCarriesWarranty({ partsWarrantyDays: 90 })).toBe(true);
        expect(jobCarriesWarranty({ warrantyExpiryDate: new Date() })).toBe(true);
        expect(jobCarriesWarranty({ warrantyDays: 0, partsWarrantyDays: null })).toBe(false);
        expect(jobCarriesWarranty({})).toBe(false);
        expect(SERVICE).toContain("NO_WARRANTY");
    });
});

describe("what a scan answers", () => {
    it("keeps service and parts cover separate", () => {
        /**
         * A fitted panel can still be covered months after the labour warranty
         * has lapsed, and the published terms promise the two run separately.
         * One yes/no would refuse claims the shop actually owes.
         */
        const now = new Date("2026-08-11T00:00:00Z");
        const standing = warrantyStanding({
            warrantyExpiryDate: "2026-07-01T00:00:00Z",   // lapsed
            partsWarrantyExpiryDate: "2026-12-01T00:00:00Z", // live
            gracePeriodDays: 0,
        }, now);
        expect(standing.service).toBe(false);
        expect(standing.parts).toBe(true);
        expect(standing.any).toBe(true);
    });

    it("honours the grace period the shop promised", () => {
        const now = new Date("2026-08-11T00:00:00Z");
        const expired = { warrantyExpiryDate: "2026-08-06T00:00:00Z", gracePeriodDays: 7 };
        expect(warrantyStanding(expired, now).service).toBe(true);
        expect(warrantyStanding({ ...expired, gracePeriodDays: 0 }, now).service).toBe(false);
    });

    it("says no when there is no cover at all", () => {
        const standing = warrantyStanding({}, new Date());
        expect(standing.service).toBe(false);
        expect(standing.parts).toBe(false);
        expect(standing.any).toBe(false);
    });

    it("returns the television's own serial for the counter to compare", () => {
        // The sticker proves the job is ours; this proves it is the same set.
        expect(SERVICE).toContain("tvSerialNumber");
    });
});

describe("the failures are kept", () => {
    it("records a scan that matched nothing", () => {
        /**
         * A forged sticker is only visible if the misses are written down.
         * "Somebody tried a code we have never issued" is the earliest warning
         * the shop can get.
         */
        const verify = SERVICE.slice(SERVICE.indexOf("export async function verifySticker"));
        const body = verify.slice(0, verify.indexOf("\n}\n"));
        expect(body).toContain('result: "unknown"');
        expect(body).toContain("recordScan");
    });

    it("never fails a check because the logging failed", () => {
        // The counter needs its answer more than the audit trail needs a row.
        // Sliced to the next declaration: the parameter object's own closing
        // brace sits before the body, so a naive "\n}" stops too early.
        const from = SERVICE.indexOf("async function recordScan");
        const body = SERVICE.slice(from, SERVICE.indexOf("/** Recent scans", from));
        expect(body).toContain("catch");
        expect(body).toContain("Failed to record scan");
    });

    it("keeps a voided sticker instead of deleting it", () => {
        // A code that simply vanished from the records would read as a forgery
        // when it turns up on a television.
        expect(SCHEMA).toContain('voidedAt: timestamp("voided_at")');
        expect(SERVICE).toContain('"voided"');
    });
});

describe("a seal proves, it does not authorise", () => {
    const VERIFY = readFileSync(join(ROOT, "client/src/components/admin/WarrantyStickerVerify.tsx"), "utf8");

    it("offers the way in without a seal, in plain sight", () => {
        /**
         * The fallback is not an edge case. A seal ends up under a wall mount,
         * behind grease, or peeled off entirely, and a shop that can only
         * honour a warranty it can scan refuses genuine customers over its own
         * adhesive. Cover lives on the repair record; the seal only finds it.
         */
        expect(VERIFY).toContain("No seal, or it will not scan?");
        expect(VERIFY).toContain("not the sticker");
    });

    it("still lets a claim be started when cover has expired", () => {
        // Whether to honour a lapsed warranty is a decision for a person, not
        // a disabled button.
        expect(VERIFY).toContain("Start claim anyway (cover expired)");
    });

    it("leads straight into the claim instead of stopping at a verdict", () => {
        // Without this the counter reads an answer and then hunts for the same
        // job by hand — the work the seal was supposed to remove.
        expect(VERIFY).toContain("onStartClaim");
        expect(VERIFY).toContain("Start warranty claim");
    });
});

describe("replacing a damaged seal", () => {
    it("voids the old pair rather than deleting it", () => {
        // An old seal turning up on a television is worth knowing about: it
        // means a sticker is still out there, which is a different situation
        // from a forgery.
        const fn = SERVICE.slice(SERVICE.indexOf("export async function reissueStickersForJob"));
        const body = fn.slice(0, fn.indexOf(END_OF_FN));
        expect(body).toContain("voidedAt: new Date()");
        expect(body).toContain("isNull(schema.warrantyStickers.voidedAt)");
        expect(body).toContain("ensureStickersForJob");
    });

    it("demands a reason, and carries it on the voided code", () => {
        const fn = SERVICE.slice(SERVICE.indexOf("export async function reissueStickersForJob"));
        const body = fn.slice(0, fn.indexOf(END_OF_FN));
        expect(body).toContain("REASON_REQUIRED");
        expect(body).toContain("voidedReason");
    });

    it("is behind a staff login and an edit permission", () => {
        // The doc comment above the route mentions the same path, so match the
        // registration itself rather than the first line that names it.
        const line = ROUTES.split(NEWLINE).find((l) => l.trimStart().startsWith("router.") && l.includes("warranty-stickers/reissue"));
        expect(line, "reissue route is not registered").toBeTruthy();
        expect(line).toContain("requireAdminAuth");
        expect(line).toContain("requireGranularPermission");
    });
});

describe("nothing leaks", () => {
    it("requires a staff login on every route", () => {
        // A public page would tell anyone standing next to a television when it
        // was repaired and whether cover has run out — the first thing someone
        // planning a false claim wants to know.
        const routes = ROUTES.split("\n").filter((l) => l.trimStart().startsWith("router."));
        expect(routes.length).toBeGreaterThan(0);
        for (const line of routes) {
            expect(line, `unauthenticated route: ${line.trim()}`).toContain("requireAdminAuth");
        }
    });

    it("never puts a code in a URL", () => {
        // A warranty code in a server log or a browser history is a warranty
        // code somebody can print.
        expect(ROUTES).toContain('router.post("/api/warranty-stickers/verify"');
        expect(ROUTES).not.toMatch(/router\.get\([^)]*verify\/:code/);
    });

    it("is actually mounted", () => {
        // A route file nobody registers is a feature that silently does not
        // exist.
        expect(INDEX).toContain("warranty-stickers.routes.js");
        expect(INDEX).toContain("app.use(warrantyStickerRoutes)");
    });
});

describe("the tables ship", () => {
    it("has a migration that creates both", () => {
        expect(MIGRATIONS).toContain('id: "2026_08_11_warranty_stickers"');
        expect(MIGRATIONS).toContain("CREATE TABLE IF NOT EXISTS warranty_stickers");
        expect(MIGRATIONS).toContain("CREATE TABLE IF NOT EXISTS warranty_sticker_scans");
    });

    it("makes the code unique in the database, not just in code", () => {
        // The retry loop is a convenience; this is the actual guarantee that
        // two televisions can never carry the same code.
        expect(MIGRATIONS).toContain("code TEXT NOT NULL UNIQUE");
        expect(SCHEMA).toContain('code: text("code").notNull().unique()');
    });
});
