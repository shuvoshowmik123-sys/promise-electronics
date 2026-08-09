/**
 * The model check has one job it must never get wrong: it may remind, and it
 * may not accuse falsely.
 *
 * These tests exercise the pattern reader that answers most requests without
 * touching a database, because that is the part that will run on every
 * homepage visit. The learned-history path is covered against a real
 * PostgreSQL in tv-encyclopedia-disposable.test.ts.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sizeFromModel, brandFromModel, looksLikeModel } from "../shared/tv-model.js";

describe("reading a model number", () => {
    it("reads the brands that encode themselves", () => {
        const cases: [string, string, number][] = [
            ["UA55AU7700", "Samsung", 55],
            ["UA32T4400", "Samsung", 32],
            ["QN65Q60B", "Samsung", 65],
            ["QA43T5410", "Samsung", 43],
            ["KD-55X7500H", "Sony", 55],
            ["KDL-32W600D", "Sony", 32],
            ["55UP7500PTZ", "LG", 55],
            ["43UN7300PTC", "LG", 43],
            ["65NANO80", "LG", 65],
        ];
        for (const [model, brand, size] of cases) {
            expect(brandFromModel(model), model).toBe(brand);
            expect(sizeFromModel(model), model).toBe(size);
        }
    });

    it("reads a size even when the brand is unknown", () => {
        // TCL and Hisense put the size first but their letters are not
        // distinctive enough to name the brand from.
        for (const m of ["55P615", "55A6G"]) {
            expect(sizeFromModel(m), m).toBe(55);
            expect(brandFromModel(m), m).toBeNull();
        }
    });

    it("stays silent rather than guessing", () => {
        /**
         * Every one of these must produce nothing. A wrong reading tells a
         * customer their real model is invalid, which is worse than never
         * having looked.
         */
        for (const junk of ["ABCDEFG", "1234", "WD1-JX-SB", "XX99YY1234", "my tv", "", "   "]) {
            expect(sizeFromModel(junk), junk).toBeNull();
            expect(brandFromModel(junk), junk).toBeNull();
        }
    });

    it("only accepts numbers that are real television sizes", () => {
        // 99 and 77 are not sizes, so neither string yields one.
        expect(sizeFromModel("UA99XX1234")).toBeNull();
        expect(sizeFromModel("77UP7500")).toBeNull();
        // 75 is, and reads normally.
        expect(sizeFromModel("75UP7500")).toBe(75);
    });

    it("treats prose as unreadable, not as a model", () => {
        expect(looksLikeModel("my tv")).toBe(false);
        expect(looksLikeModel("samsung")).toBe(false);
        expect(looksLikeModel("UA55AU7700")).toBe(true);
    });

    it("ignores punctuation and case the way a person types", () => {
        for (const m of ["ua55-au7700", "UA55 AU7700", "ua_55_au7700"]) {
            expect(sizeFromModel(m), m).toBe(55);
            expect(brandFromModel(m), m).toBe("Samsung");
        }
    });
});

describe("the endpoint keeps the shop's data in the shop", () => {
    const ROUTE = readFileSync(join(process.cwd(), "server/routes/tv-model.routes.ts"), "utf8");

    it("is rate limited, because it is public and unauthenticated", () => {
        expect(ROUTE).toContain("publicMapSearchLimiter");
    });

    it("requires a model and never lists what we know", () => {
        /**
         * A caller must bring a model number to get a verdict on it. Without
         * that, repeated calls would drain the encyclopedia one row at a time
         * and hand competitors the shop's repair history.
         */
        expect(ROUTE).toMatch(/if \(!model\) return res\.json\(\{ status: "ok" \}/);
        expect(ROUTE).not.toMatch(/SELECT \* FROM tv_model_brand|listModels|allModels/);
    });

    it("asks the brain only for what the pattern could not read", () => {
        expect(ROUTE).toMatch(/if \(\(!knownBrand \|\| !knownSize\) && process\.env\.BRAIN_DATABASE_URL\)/);
    });

    it("an unreachable brain never breaks the page", () => {
        const guard = ROUTE.slice(ROUTE.indexOf("try {", ROUTE.indexOf("BRAIN_DATABASE_URL")));
        expect(guard).toMatch(/catch \(error: any\) \{/);
        expect(ROUTE).toMatch(/Silence is the safe answer/);
    });
});
