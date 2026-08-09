/**
 * The endpoint, end to end, against the real brain database.
 *
 * Skips unless BRAIN_DATABASE_URL is set, so nobody else is required to hold a
 * Neon credential to run the suite. Its job is to prove the two paths that
 * matter in production: a model the pattern reader resolves on its own, and a
 * local-brand model that only the learned encyclopedia can answer.
 *
 * It seeds and removes its own rows. The encyclopedia is supposed to contain
 * only televisions the shop actually repaired, and a test that leaves an
 * invented Walton behind would be doing precisely the thing this whole feature
 * was built to prevent.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import pg from "pg";
import tvModelRoutes from "../server/routes/tv-model.routes.js";
import { brandFromModel } from "../shared/tv-model.js";

const HAVE_BRAIN = !!process.env.BRAIN_DATABASE_URL;

// Deliberately not a real model number, so it can never collide with a
// television someone actually brings in.
const FAKE_MODEL_RAW = "QATEST-JX32-SB";
const FAKE_MODEL_NORM = "QATESTJX32SB";
const FAKE_JOBS = ["QA-TVMODEL-1", "QA-TVMODEL-2"];

describe.skipIf(!HAVE_BRAIN)("POST /api/tv-model/check against the real brain", () => {
    const app = express();
    app.use(express.json());
    app.use(tvModelRoutes);

    let client: pg.Client;

    beforeAll(async () => {
        client = new pg.Client({
            connectionString: process.env.BRAIN_DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 20_000,
        });
        await client.connect();
        // Two sightings from separate jobs, so the row is verified and may
        // contradict — the same path a real pair of repairs would take.
        await client.query(
            `INSERT INTO tv_model_brand (model_norm, brand_norm, brand, size_inches, sightings)
             VALUES ($1,'WALTON','Walton',32,2)
             ON CONFLICT (model_norm, brand_norm) DO UPDATE SET sightings = 2`,
            [FAKE_MODEL_NORM],
        );
    }, 60_000);

    afterAll(async () => {
        await client?.query(`DELETE FROM tv_model_brand WHERE model_norm = $1`, [FAKE_MODEL_NORM]).catch(() => {});
        await client?.query(`DELETE FROM tv_model_harvest_log WHERE job_id = ANY($1)`, [FAKE_JOBS]).catch(() => {});
        await client?.end().catch(() => {});
    });

    it("reads Samsung 55 from the number alone, no database needed", async () => {
        const res = await request(app).post("/api/tv-model/check")
            .send({ model: "UA55AU7700", brand: "LG", size: "32" }).expect(200);
        expect(res.body).toMatchObject({
            status: "notice", brand: "Samsung", sizeInches: 55, source: "pattern",
        });
        expect(res.body.mismatch).toEqual({ brand: true, size: true });
    }, 30_000);

    it("says nothing when the customer already agrees with the number", async () => {
        const res = await request(app).post("/api/tv-model/check")
            .send({ model: "UA55AU7700", brand: "Samsung", size: '55"' }).expect(200);
        expect(res.body.status).toBe("ok");
    }, 30_000);

    it("knows a local brand only because we repaired it twice", async () => {
        // The pattern reader is blind to this shape; the answer can only have
        // come from history. This is the case the encyclopedia exists for.
        expect(brandFromModel(FAKE_MODEL_RAW)).toBeNull();
        const res = await request(app).post("/api/tv-model/check")
            .send({ model: FAKE_MODEL_RAW, brand: "Samsung", size: "55" }).expect(200);
        expect(res.body).toMatchObject({
            status: "notice", brand: "Walton", sizeInches: 32,
            source: "history", confidence: "verified",
        });
        expect(res.body.mismatch).toEqual({ brand: true, size: true });
    }, 30_000);

    it("treats prose as unreadable", async () => {
        const res = await request(app).post("/api/tv-model/check")
            .send({ model: "my tv", brand: "Samsung", size: "55" }).expect(200);
        expect(res.body.status).toBe("unreadable");
    }, 30_000);

    it("says nothing about a model nobody has ever repaired", async () => {
        const res = await request(app).post("/api/tv-model/check")
            .send({ model: "ZZ9PLURALZALPHA1", brand: "Samsung", size: "55" }).expect(200);
        expect(res.body.status).toBe("ok");
    }, 30_000);
});
