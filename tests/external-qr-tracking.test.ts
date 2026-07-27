import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { getSafeJobDisplayRef } from "../shared/job-display-utils.js";

vi.mock("../server/db.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  },
}));

describe("external QR tracking — pure helpers", () => {
  it("hashes credentials with SHA-256 hex", async () => {
    const { hashExternalQrToken } = await import(
      "../server/services/external-qr-tracking.service.js"
    );
    const token = "a".repeat(64);
    const h = hashExternalQrToken(token);
    expect(h).toBe(createHash("sha256").update(token, "utf8").digest("hex"));
    expect(h).not.toBe(token);
  });

  it("builds opaque public path without entity ids", async () => {
    const { buildExternalQrPublicPath } = await import(
      "../server/services/external-qr-tracking.service.js"
    );
    const token = "b".repeat(64);
    const path = buildExternalQrPublicPath(token);
    expect(path).toBe(`/ext-track/${token}`);
    expect(path).not.toMatch(/JOB-/i);
  });

  it("safe DTO includes panel/parts badges and excludes sensitive fields", async () => {
    const { toSafeExternalJobStatus } = await import(
      "../server/services/external-qr-tracking.service.js"
    );
    const safe = toSafeExternalJobStatus({
      id: "JOB-2026-0001",
      device: "32 inch panel",
      ticketType: "panel_only",
      status: "Pending",
      createdAt: new Date("2026-01-01"),
      completedAt: null,
    });
    expect(safe.badges.panelOnly).toBe(true);
    expect(safe.badges.partsOnly).toBe(false);
    expect(safe.slipId).toBe(getSafeJobDisplayRef({ id: "JOB-2026-0001" }));
    expect(Object.keys(safe).sort()).toEqual(
      ["badges", "completedAt", "createdAt", "device", "slipId", "status", "ticketType"].sort(),
    );

    const parts = toSafeExternalJobStatus({
      id: "abc123xyz",
      device: "board",
      ticketType: "parts_only",
      status: "In Progress",
      createdAt: null,
      completedAt: null,
    });
    expect(parts.badges.partsOnly).toBe(true);
    expect(parts.badges.panelOnly).toBe(false);
  });
});

describe("external QR tracking — public route denials", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function mountPublicRoute(
    resolveImpl: (token: string) => Promise<any>,
  ) {
    vi.doMock("../server/services/external-qr-tracking.service.js", async () => {
      const actual = await vi.importActual<
        typeof import("../server/services/external-qr-tracking.service.js")
      >("../server/services/external-qr-tracking.service.js");
      return {
        ...actual,
        publicResolveExternalQr: resolveImpl,
      };
    });
    const router = (await import("../server/routes/external-qr-tracking.routes.js"))
      .default;
    const app = express();
    app.use(express.json());
    app.use(router);
    return app;
  }

  it("returns generic 404 for unknown token", async () => {
    const app = await mountPublicRoute(async () => null);
    const res = await request(app).get(`/api/public/external-track/${"c".repeat(64)}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });

  it("returns generic 404 for malformed token", async () => {
    const app = await mountPublicRoute(async () => null);
    const res = await request(app).get("/api/public/external-track/not-a-token");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Not found");
  });

  it("returns safe job payload on allow path", async () => {
    const payload = {
      kind: "job" as const,
      slipId: "JOB-2026-0042",
      device: "TV panel",
      ticketType: "panel_only",
      status: "Pending",
      createdAt: "2026-01-01T00:00:00.000Z",
      completedAt: null,
      badges: { panelOnly: true, partsOnly: false },
    };
    const app = await mountPublicRoute(async () => payload);
    const res = await request(app).get(`/api/public/external-track/${"d".repeat(64)}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(payload);
    expect(res.body).not.toHaveProperty("customerPhone");
    expect(res.body).not.toHaveProperty("serialNumber");
    expect(res.body).not.toHaveProperty("estimatedCost");
  });

  it("returns safe batch payload with panel/parts badges", async () => {
    const payload = {
      kind: "batch" as const,
      slipId: "BATCH-EXT-1",
      status: "open",
      totalItems: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
      jobs: [
        {
          slipId: "JOB-2026-0001",
          device: "Panel A",
          ticketType: "panel_only",
          status: "Pending",
          createdAt: null,
          completedAt: null,
          badges: { panelOnly: true, partsOnly: false },
        },
        {
          slipId: "JOB-2026-0002",
          device: "Part B",
          ticketType: "parts_only",
          status: "Pending",
          createdAt: null,
          completedAt: null,
          badges: { panelOnly: false, partsOnly: true },
        },
      ],
    };
    const app = await mountPublicRoute(async () => payload);
    const res = await request(app).get(`/api/public/external-track/${"e".repeat(64)}`);
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("batch");
    expect(res.body.jobs[0].badges.panelOnly).toBe(true);
    expect(res.body.jobs[1].badges.partsOnly).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/customerPhone|serialNumber|estimatedCost|technician/i);
  });
});

describe("external QR tracking — isExternalTechnicianJob boundary helper", () => {
  it("flags external intake jobs", async () => {
    const { isExternalTechnicianJob } = await import(
      "../server/services/external-technician-intake.service.js"
    );
    expect(
      isExternalTechnicianJob({
        source: "external_technician_intake",
        intakePartyKind: null,
        externalPartyId: null,
      }),
    ).toBe(true);
    expect(
      isExternalTechnicianJob({
        source: null,
        intakePartyKind: "external_technician",
        externalPartyId: "p1",
      }),
    ).toBe(true);
    expect(
      isExternalTechnicianJob({
        source: "walk_in",
        intakePartyKind: null,
        externalPartyId: null,
      }),
    ).toBe(false);
  });
});

describe("external QR tracking — multi-credential lifecycle (no revoke on print)", () => {
  it("second issue keeps first hash active and never updates/revokes", async () => {
    const inserts: Array<{
      credentialHash: string;
      entityType: string;
      entityId: string;
      revokedAt: Date | null;
    }> = [];
    let updateCalls = 0;

    const executor = {
      insert: () => ({
        values: async (value: (typeof inserts)[0]) => {
          inserts.push({
            credentialHash: value.credentialHash,
            entityType: value.entityType,
            entityId: value.entityId,
            revokedAt: value.revokedAt ?? null,
          });
        },
      }),
      update: () => {
        updateCalls += 1;
        return { set: () => ({ where: async () => undefined }) };
      },
    };

    const { issueExternalQrCredential, hashExternalQrToken } = await import(
      "../server/services/external-qr-tracking.service.js"
    );

    const first = await issueExternalQrCredential("job", "job-1", executor as any);
    const second = await issueExternalQrCredential("job", "job-1", executor as any);

    expect(first.token).not.toBe(second.token);
    expect(first.path).toContain(first.token);
    expect(second.path).toContain(second.token);
    expect(inserts).toHaveLength(2);
    expect(updateCalls).toBe(0);
    expect(inserts.every((r) => r.revokedAt === null)).toBe(true);
    expect(inserts.every((r) => r.entityId === "job-1" && r.entityType === "job")).toBe(true);
    expect(hashExternalQrToken(first.token)).toBe(inserts[0].credentialHash);
    expect(hashExternalQrToken(second.token)).toBe(inserts[1].credentialHash);
    // Both distinct active hashes retained — intake token + later print token both valid
    expect(inserts[0].credentialHash).not.toBe(inserts[1].credentialHash);
  });
});
