import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../server/db.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
}));

describe("B2B account intake — pure helpers & route denials", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects forbidden customer/external fields before write", async () => {
    const { createB2bAccountIntake, B2bAccountIntakeError } = await import(
      "../server/services/b2b-account-intake.service.js"
    );
    await expect(
      createB2bAccountIntake({
        body: {
          lane: "corporate",
          corporateClientId: "acc-1",
          customer: "Leak",
          unit: { ticketType: "full_device", device: "TV", issue: "dead" },
        },
        mode: "single",
        creator: { id: "u1", name: "Staff" },
        canAssignTechnician: false,
      }),
    ).rejects.toMatchObject({ name: "B2bAccountIntakeError", code: "FORBIDDEN_FIELD" });

    await expect(
      createB2bAccountIntake({
        body: {
          lane: "corporate",
          corporateClientId: "acc-1",
          externalPartyId: "x",
          unit: { ticketType: "full_device", device: "TV", issue: "dead" },
        },
        mode: "single",
        creator: { id: "u1", name: "Staff" },
        canAssignTechnician: false,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN_FIELD" });

    expect(B2bAccountIntakeError).toBeTruthy();
  });

  it("rejects invalid lane", async () => {
    const { createB2bAccountIntake } = await import(
      "../server/services/b2b-account-intake.service.js"
    );
    await expect(
      createB2bAccountIntake({
        body: {
          lane: "b2b_normal",
          corporateClientId: "acc-1",
          unit: { ticketType: "full_device", device: "TV", issue: "dead" },
        },
        mode: "single",
        creator: { id: "u1", name: "Staff" },
        canAssignTechnician: false,
      }),
    ).rejects.toMatchObject({ code: "INVALID_LANE" });
  });

  it("rejects duplicate external refs inside submitted batch", async () => {
    const { createB2bAccountIntake } = await import(
      "../server/services/b2b-account-intake.service.js"
    );
    await expect(
      createB2bAccountIntake({
        body: {
          lane: "limited_company",
          corporateClientId: "acc-1",
          units: [
            { ticketType: "full_device", device: "A", issue: "x", externalRef: "REF-1" },
            { ticketType: "panel_only", device: "B", issue: "y", externalRef: "ref-1" },
          ],
        },
        mode: "batch",
        creator: { id: "u1", name: "Staff" },
        canAssignTechnician: false,
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_EXTERNAL_REF_IN_BATCH" });
  });

  it("builds sorted unique advisory lock keys for account/ref pairs", async () => {
    const { buildB2bExternalRefLockKeys, normalizeExternalRefKey } = await import(
      "../server/services/b2b-account-intake.service.js"
    );

    expect(normalizeExternalRefKey("  Ref-A ")).toBe("ref-a");

    const keys = buildB2bExternalRefLockKeys("acct-9", [
      "Z-ref",
      null,
      "a-ref",
      "  A-REF  ",
      "",
      "m-ref",
      undefined,
    ]);

    expect(keys).toEqual([
      "b2b_ext_ref:acct-9:a-ref",
      "b2b_ext_ref:acct-9:m-ref",
      "b2b_ext_ref:acct-9:z-ref",
    ]);

    // Same inputs in different order still sort deterministically
    const keys2 = buildB2bExternalRefLockKeys("acct-9", ["m-ref", "z-ref", "a-ref"]);
    expect(keys2).toEqual(keys);

    // Different accounts never share lock key namespace
    const other = buildB2bExternalRefLockKeys("acct-other", ["a-ref"]);
    expect(other[0]).toBe("b2b_ext_ref:acct-other:a-ref");
    expect(other[0]).not.toBe(keys[0]);
  });

  it("treats mixed-case external refs as the same collision key", async () => {
    const {
      corporateJobNumberCollidesWithExternalRef,
      normalizeExternalRefKey,
      buildB2bExternalRefLockKeys,
    } = await import("../server/services/b2b-account-intake.service.js");

    // Stored REF-1 must collide with candidate ref-1 (locks + DB both case-fold)
    expect(corporateJobNumberCollidesWithExternalRef("REF-1", "ref-1")).toBe(true);
    expect(corporateJobNumberCollidesWithExternalRef("ref-1", "REF-1")).toBe(true);
    expect(corporateJobNumberCollidesWithExternalRef("  Ref-1 ", "REF-1")).toBe(true);

    // Distinct refs do not collide
    expect(corporateJobNumberCollidesWithExternalRef("REF-1", "REF-2")).toBe(false);
    expect(corporateJobNumberCollidesWithExternalRef(null, "ref-1")).toBe(false);
    expect(corporateJobNumberCollidesWithExternalRef("", "ref-1")).toBe(false);

    // Lock namespace for REF-1 and ref-1 is identical (same advisory key)
    const keys = buildB2bExternalRefLockKeys("acct-1", ["REF-1", "ref-1"]);
    expect(keys).toEqual([`b2b_ext_ref:acct-1:${normalizeExternalRefKey("REF-1")}`]);
    expect(keys).toHaveLength(1);
  });

  it("public search route requires admin + returns 401 without session middleware identity", async () => {
    vi.doMock("../server/routes/middleware/auth.js", () => ({
      requireAdminAuth: (_req: any, res: any) => res.status(401).json({ error: "Admin authentication required" }),
      requireGranularPermission: () => (_req: any, res: any) =>
        res.status(401).json({ error: "Admin authentication required" }),
      userHasGranularPermission: () => false,
    }));
    const router = (await import("../server/routes/b2b-account-intake.routes.js")).default;
    const app = express();
    app.use(express.json());
    app.use(router);
    const res = await request(app).get("/api/admin/b2b-account-intake/accounts?lane=corporate&q=acme");
    expect(res.status).toBe(401);
  });
});
