/**
 * CUSTOMER-ACCOUNT-SETUP-DEAD-END-REPAIR-01A
 *
 * Reproduced in production before this phase: a customer submits an anonymous
 * repair request, then cannot register ("already linked to a repair record"),
 * and cannot log in ("invalid phone number or password") — for an account that
 * was created on their behalf 36 seconds earlier and never had a password.
 *
 * These prove the parts that live in pure functions and route logic. The two
 * database-shaped behaviours (indexed lookup, legacy fallback) are covered by
 * the disposable-PostgreSQL suite.
 */
import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import {
    NO_CUSTOMER_PASSWORD,
    TIMING_EQUALISER_HASH,
    isPlaceholderPassword,
} from "../server/services/customer-password.js";

describe("placeholder password cannot authenticate", () => {
    it("is not a bcrypt hash", () => {
        expect(NO_CUSTOMER_PASSWORD.startsWith("$2")).toBe(false);
    });

    it("rejects every comparison rather than throwing", async () => {
        // bcryptjs returns false for anything it cannot parse as a hash. If it
        // threw instead, a login attempt would surface as a 500 rather than a
        // 401 — and that difference would itself leak account state.
        for (const attempt of ["", " ", NO_CUSTOMER_PASSWORD, "password", "!no-customer-password!"]) {
            await expect(bcrypt.compare(attempt, NO_CUSTOMER_PASSWORD)).resolves.toBe(false);
        }
    });

    it("recognises the placeholder and nothing else", async () => {
        expect(isPlaceholderPassword(NO_CUSTOMER_PASSWORD)).toBe(true);
        expect(isPlaceholderPassword(null)).toBe(false);
        expect(isPlaceholderPassword(undefined)).toBe(false);
        expect(isPlaceholderPassword("")).toBe(false);
        expect(isPlaceholderPassword(await bcrypt.hash("real", 10))).toBe(false);
    });
});

describe("constant-time rejection closes the timing oracle", () => {
    it("the equaliser is a real, parseable bcrypt hash", async () => {
        // The whole point is that it costs what a genuine check costs. A malformed
        // value would return instantly and reintroduce the leak this prevents.
        expect(TIMING_EQUALISER_HASH).toMatch(/^\$2[aby]\$\d{2}\$/);
        await expect(bcrypt.compare("anything", TIMING_EQUALISER_HASH)).resolves.toBe(false);
    });

    it("nothing authenticates against the equaliser", async () => {
        for (const attempt of ["", "password", "admin", TIMING_EQUALISER_HASH, NO_CUSTOMER_PASSWORD]) {
            await expect(bcrypt.compare(attempt, TIMING_EQUALISER_HASH)).resolves.toBe(false);
        }
    });

    it("costs the same order of magnitude as a real wrong-password check", async () => {
        // Measured before the fix: 273ms against a real hash, 0.02ms against the
        // placeholder — ~12,000x, trivially observable over a network. Rejecting
        // an unclaimed account without this would tell an attacker which phone
        // numbers have records here.
        const realHash = await bcrypt.hash("correct horse", 12);

        const timeOf = async (hash: string) => {
            const started = process.hrtime.bigint();
            await bcrypt.compare("wrong guess", hash);
            return Number(process.hrtime.bigint() - started) / 1e6;
        };

        const realMs = await timeOf(realHash);
        const equaliserMs = await timeOf(TIMING_EQUALISER_HASH);
        const placeholderMs = await timeOf(NO_CUSTOMER_PASSWORD);

        // The equaliser is within an order of magnitude of a genuine check...
        expect(equaliserMs).toBeGreaterThan(realMs / 10);
        // ...and the placeholder is emphatically not, which is why it must never
        // be the thing an unclaimed rejection compares against.
        expect(placeholderMs * 50).toBeLessThan(realMs);
    });
});
