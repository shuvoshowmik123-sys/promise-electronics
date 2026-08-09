/**
 * The encyclopedia only earns its place if it is honest about what it knows.
 *
 * Three things have to hold, and none of them can be proved by reading the
 * code: the sightings counter must survive a re-run without inflating, a model
 * claimed by two brands must come back as "not sure" rather than picking a
 * winner, and a single sighting must never be allowed to contradict anybody.
 *
 * So this runs the real SQL against a real PostgreSQL. Both the MAIN side (the
 * harvest query) and the brain side (the counters) are exercised — pointed at
 * the same disposable database here, which is fine because the code never
 * assumes they share a transaction.
 */
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import {
    ensureEncyclopediaTables,
    recordSighting,
    lookupModel,
    normalizeModel,
    normalizeBrand,
    normalizeSize,
    VERIFY_AT_SIGHTINGS,
} from "../server/brain/tv-encyclopedia.service.js";
import { harvestTvModels } from "../server/services/tv-model-harvest.service.js";

const MAINT_URL = process.env.TEST_LOCAL_PG_URL || "postgresql://postgres:postgres@127.0.0.1:5432/postgres";
const DB_NAME = `qa_tvenc_${process.pid.toString(36)}_${Date.now().toString(36)}`;
const DISPOSABLE_URL = MAINT_URL.replace(/\/[^/]*$/, `/${DB_NAME}`);

function probeLocalPostgres(): boolean {
    if (!/localhost|127\.0\.0\.1|::1/i.test(MAINT_URL)) return false;
    const script = `
    const pg = require(${JSON.stringify("pg")});
    const c = new pg.Client({ connectionString: ${JSON.stringify(MAINT_URL)}, connectionTimeoutMillis: 3000 });
    c.connect().then(() => { console.log("PG_OK"); return c.end(); }).catch(() => { process.exit(0); });
  `;
    const res = spawnSync(process.execPath, ["-e", script], { cwd: process.cwd(), timeout: 10_000, encoding: "utf8" });
    return /PG_OK/.test(res.stdout || "");
}
const LOCAL_PG_AVAILABLE = probeLocalPostgres();

describe.skipIf(!LOCAL_PG_AVAILABLE)("the model encyclopedia only claims what it has seen", () => {
    let admin: pg.Client;
    let pool: pg.Pool;
    let runner: any;

    beforeAll(async () => {
        admin = new pg.Client({ connectionString: MAINT_URL });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${DB_NAME}`);

        pool = new pg.Pool({ connectionString: DISPOSABLE_URL });
        runner = drizzle(pool);
        await ensureEncyclopediaTables(runner);

        // The two MAIN tables the harvest query reads, with only the columns it
        // actually selects — a faithful subset, not the whole schema.
        await pool.query(`
            CREATE TABLE job_tickets (id TEXT PRIMARY KEY, status TEXT NOT NULL);
            CREATE TABLE service_requests (
                id TEXT PRIMARY KEY,
                converted_job_id TEXT,
                brand TEXT,
                model_number TEXT,
                screen_size TEXT
            );
        `);
    }, 60_000);

    afterAll(async () => {
        await pool?.end().catch(() => {});
        await admin?.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`).catch(() => {});
        await admin?.end().catch(() => {});
    });

    it("normalises the ways a person can write the same television", () => {
        expect(normalizeModel("ua55-au7700")).toBe("UA55AU7700");
        expect(normalizeModel("UA55 AU7700")).toBe("UA55AU7700");
        for (const junk of ["", "ab", null, undefined, 7, "x".repeat(41)]) {
            expect(normalizeModel(junk as unknown), String(junk)).toBeNull();
        }
        expect(normalizeBrand("  Samsung  ")).toBe("Samsung");
        expect(normalizeSize('55"')).toBe(55);
        expect(normalizeSize("55 inch")).toBe(55);
        // A television is not 3 inches and not 300.
        expect(normalizeSize("3")).toBeNull();
        expect(normalizeSize("300")).toBeNull();
    });

    it("knows nothing until a job teaches it", async () => {
        await expect(lookupModel("UA55AU7700", runner)).resolves.toEqual({ known: false });
    });

    it("a single sighting may suggest, never contradict", async () => {
        expect(await recordSighting({ jobId: "J-1", brand: "Samsung", model: "UA55AU7700", size: '55"' }, runner)).toBe(true);
        const v = await lookupModel("ua55-au7700", runner);
        expect(v).toMatchObject({ known: true, ambiguous: false, brand: "Samsung", sizeInches: 55 });
        // The distinction the whole design rests on: one person's typing is a
        // hint, not grounds for telling the next customer they are wrong.
        expect((v as any).confidence).toBe("suggest");
    });

    it("a second, separate job makes it believable", async () => {
        expect(await recordSighting({ jobId: "J-2", brand: "Samsung", model: "UA55AU7700" }, runner)).toBe(true);
        const v = await lookupModel("UA55AU7700", runner);
        expect((v as any).confidence).toBe("verified");
        // The size from the first job must survive a later job that omitted it.
        expect((v as any).sizeInches).toBe(55);
    });

    it("counting the same job twice teaches nothing", async () => {
        const before = await countSightings();
        expect(await recordSighting({ jobId: "J-1", brand: "Samsung", model: "UA55AU7700" }, runner)).toBe(false);
        expect(await countSightings(), "a replayed job must not inflate the counter").toBe(before);
    });

    it("a model claimed by two brands comes back as not sure", async () => {
        // Sony now appears twice under the same model number. Both are verified,
        // so the honest answer is that we cannot tell — not a winner on count.
        await recordSighting({ jobId: "J-3", brand: "Sony", model: "UA55AU7700" }, runner);
        await recordSighting({ jobId: "J-4", brand: "Sony", model: "UA55AU7700" }, runner);
        const v = await lookupModel("UA55AU7700", runner);
        expect(v).toEqual({ known: true, ambiguous: true });
    });

    it("harvests only completed jobs, and is safe to run again", async () => {
        await pool.query(`
            INSERT INTO job_tickets (id, status) VALUES
                ('J-10','Completed'), ('J-11','Completed'), ('J-12','In Progress'), ('J-13','Completed');
            INSERT INTO service_requests (id, converted_job_id, brand, model_number, screen_size) VALUES
                ('SR-10','J-10','LG','43UN7300PTC','43 inch'),
                ('SR-11','J-11','LG','43UN7300PTC','43 inch'),
                ('SR-12','J-12','Walton','WD1-JX32-SB','32 inch'),
                ('SR-13','J-13','Vision',NULL,'32 inch');
        `);

        const first = await harvestTvModels(runner, runner);
        // J-12 is still on the bench and J-13 has no model number.
        expect(first.examined).toBe(2);
        expect(first.learned).toBe(2);

        const lg = await lookupModel("43UN7300PTC", runner);
        expect(lg).toMatchObject({ known: true, ambiguous: false, brand: "LG", sizeInches: 43 });
        expect((lg as any).confidence).toBe("verified");

        // Nightly means this runs over the same finished jobs forever.
        const second = await harvestTvModels(runner, runner);
        expect(second.learned, "a second sweep must learn nothing new").toBe(0);
        const after = await lookupModel("43UN7300PTC", runner);
        expect((after as any).confidence).toBe("verified");
        expect(await sightingsFor("43UN7300PTC", "LG")).toBe(VERIFY_AT_SIGHTINGS);
    });

    async function countSightings(): Promise<number> {
        const { rows } = await pool.query(`SELECT COALESCE(SUM(sightings),0)::int AS n FROM tv_model_brand`);
        return rows[0].n;
    }
    async function sightingsFor(model: string, brand: string): Promise<number> {
        const { rows } = await pool.query(
            `SELECT sightings FROM tv_model_brand WHERE model_norm=$1 AND brand_norm=$2`,
            [model.toUpperCase(), brand.toUpperCase()],
        );
        return rows[0]?.sightings ?? 0;
    }
});
