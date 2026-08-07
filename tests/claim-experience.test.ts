import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TV_SYMPTOMS, isTvSymptom, labelTvSymptom } from "../shared/tv-symptoms.js";

/**
 * Claiming a warranty should feel like asking for help, not like being screened
 * for fraud.
 *
 * The claim form asked for free text and nothing else, which produced "tv not
 * working properly" — untriageable, uncountable — and made the customer do all
 * the work of explaining while the shop volunteered nothing in return.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const PAGE = read("client/src/pages/my-warranties.tsx");
const LANG = read("client/src/contexts/CustomerLanguageContext.tsx");
const SERVICE = read("server/services/customer-repair-journey.service.ts");
const ROUTES = read("server/routes/customer-repair-journey.routes.ts");
const SCHEMA = read("shared/schema.ts");
const MIGRATE = read("server/services/main-schema-migrate.service.ts");

describe("the symptom list speaks the customer's language", () => {
    it("describes symptoms, never components", () => {
        /**
         * The technician's list says T-Con, mainboard, power supply. Asking a
         * customer to pick from that is asking them to do the diagnosis.
         */
        const values = TV_SYMPTOMS.map((s) => s.value);
        for (const component of ["tcon", "t_con", "mainboard", "power_supply", "board_repair", "panel_damage"]) {
            expect(values, component).not.toContain(component);
        }
        expect(values).toContain("no_power");
        expect(values).toContain("lines_on_screen");
    });

    it("always offers an escape hatch, last", () => {
        // A customer whose fault is unusual must still be able to claim.
        expect(TV_SYMPTOMS[TV_SYMPTOMS.length - 1].value).toBe("other");
    });

    it("is translated, and labels fall back for unknown stored values", () => {
        for (const s of TV_SYMPTOMS) expect(s.bn, s.value).toMatch(/[ঀ-৿]/);
        expect(labelTvSymptom("no_power", "en")).toBe("No Power");
        expect(labelTvSymptom("legacy_value", "en")).toBe("legacy_value");
        expect(labelTvSymptom(null)).toBe("");
    });

    it("validates strictly on the way in", () => {
        expect(isTvSymptom("no_power")).toBe(true);
        for (const bad of ["", "NO_POWER", "tcon", null, undefined, 7, {}]) {
            expect(isTvSymptom(bad as unknown)).toBe(false);
        }
    });
});

describe("the sheet reassures before it asks", () => {
    it("shows coverage first, above any question", () => {
        /**
         * Someone opening a claim is already annoyed their television broke
         * again. Leading with a form reads as a hurdle.
         */
        const sheet = PAGE.slice(PAGE.indexOf("function WarrantyClaimSheet"), PAGE.indexOf("function WarrantyClock"));
        const coveredAt = sheet.indexOf("claim.covered");
        const whatsWrongAt = sheet.indexOf("claim.whatsWrong");
        expect(coveredAt).toBeGreaterThan(-1);
        expect(whatsWrongAt).toBeGreaterThan(-1);
        expect(coveredAt).toBeLessThan(whatsWrongAt);
    });

    it("answers the four questions without being asked", () => {
        // Do I pay, who moves the TV, how long, what if it is something else.
        for (const key of ["claim.nextCheck", "claim.nextCollect", "claim.nextReply", "claim.differentFault"]) {
            expect(PAGE, key).toContain(key);
        }
        expect(LANG).toMatch(/"claim\.nextCheck":[^}]*no charge/i);
    });

    it("a picked symptom is a complete claim on its own", () => {
        /**
         * Demanding prose as well turns a two-tap claim into an essay, and the
         * people most likely to give up are the ones least comfortable writing.
         */
        expect(PAGE).toMatch(/if \(!problemType && !issueDescription\.trim\(\)\) return/);
        expect(PAGE).toMatch(/disabled=\{busy \|\| \(!problemType && !issueDescription\.trim\(\)\)\}/);
    });
});

describe("a different fault is warned about, never refused", () => {
    it("sets the expectation of a new quotation", () => {
        /**
         * The app refusing a claim over a mismatched symptom would read as "you
         * are trying to get out of it" — the exact feeling this sheet exists to
         * avoid. It warns instead, and a human prices it.
         */
        const line = LANG.split("\n").find((l) => l.includes('"claim.differentFault"')) ?? "";
        expect(line).toMatch(/new quotation/i);
        expect(line).toMatch(/not be the same/i);
        expect(line).toMatch(/until you agree/i);
    });

    it("the discount itself is left to the shop, not encoded", () => {
        // Deliberately no percentage or amount anywhere in the claim path.
        expect(PAGE).not.toMatch(/discountPercent|discountRate|DISCOUNT_/);
        expect(SERVICE).not.toMatch(/discountPercent|discountRate|DISCOUNT_/);
    });

    it("nothing in the claim copy blames or alarms", () => {
        const entries = [...LANG.matchAll(/"claim\.[a-zA-Z.]+":\s*\{\s*en:\s*"([^"]*)"/g)].map((m) => m[1]);
        expect(entries.length).toBeGreaterThanOrEqual(8);
        for (const line of entries) {
            expect(line, line).not.toContain("!");
            expect(line, line).not.toMatch(/\b(prove|proof|verify|invalid|denied|reject|fraud)\b/i);
        }
    });
});

describe("the symptom is stored so it can be counted", () => {
    it("has its own nullable column", () => {
        // Prose cannot be grouped; five backlight failures on one supplier's
        // part are only visible if the symptom is a value.
        expect(SCHEMA).toMatch(/problemType: text\("problem_type"\)/);
        expect(MIGRATE).toContain("ADD COLUMN IF NOT EXISTS problem_type TEXT");
    });

    it("the migration is additive only", () => {
        const entry = MIGRATE.slice(MIGRATE.indexOf('id: "2026_08_08_claim_problem_type"'));
        const body = entry.slice(0, entry.indexOf("},\n];") + 1);
        for (const destructive of [/DROP\s+(TABLE|COLUMN)/i, /\bTRUNCATE\b/i, /SET NOT NULL/i]) {
            expect(body).not.toMatch(destructive);
        }
    });

    it("is written with the claim", () => {
        expect(SERVICE).toMatch(/problem_type/);
        expect(SERVICE).toMatch(/\$\{opts\.problemType \?\? null\}/);
    });

    it("an unrecognised symptom never costs the customer their claim", () => {
        // A stale client sending an old value must not fail the whole claim.
        expect(ROUTES).toMatch(/isTvSymptom\(problemType\) \? problemType : null/);
    });
});
