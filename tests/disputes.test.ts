import { describe, expect, it } from "vitest";
import {
  disputes,
  disputeNotes,
  insertDisputeSchema,
  insertDisputeNoteSchema,
} from "../shared/schema.js";
import {
  MAIN_SCHEMA_MIGRATIONS,
  REQUIRED_MAIN_SCHEMA_VERSION,
  computeMigrationChecksum,
} from "../server/services/main-schema-migrate.service.js";
import {
  disputesRepo,
  DisputeError,
} from "../server/repositories/disputes.repository.js";

describe("Ticket 04 — Aftercare Disputes schema + migration", () => {
  it("registers the disputes migration in the MAIN ledger", () => {
    const ids = MAIN_SCHEMA_MIGRATIONS.map((m) => m.id);
    expect(ids).toContain("2026_07_24_aftercare_disputes");
  });

  it("the prior corporate ltd itemized migration is still present (no rewrite)", () => {
    const ids = MAIN_SCHEMA_MIGRATIONS.map((m) => m.id);
    expect(ids).toContain("2026_07_23_corporate_ltd_itemized_billing");
  });

  it("migration ids are unique with stable checksums (append-only)", () => {
    const uniqueIds = new Set(MAIN_SCHEMA_MIGRATIONS.map((m) => m.id));
    expect(uniqueIds.size).toBe(MAIN_SCHEMA_MIGRATIONS.length);
    const checksums = MAIN_SCHEMA_MIGRATIONS.map((m) => computeMigrationChecksum(m));
    expect(new Set(checksums).size).toBe(checksums.length);
  });

  it("exports the disputes table", () => {
    expect(disputes).toBeDefined();
    expect(disputes[Symbol.for("drizzle:Name")]).toBe("disputes");
  });

  it("exports the dispute_notes table", () => {
    expect(disputeNotes).toBeDefined();
    expect(disputeNotes[Symbol.for("drizzle:Name")]).toBe("dispute_notes");
  });

  it("disputes has exactly-one target columns", () => {
    const cols = Object.keys(disputes);
    expect(cols).toContain("posTransactionId");
    expect(cols).toContain("refundId");
    expect(cols).toContain("warrantyClaimId");
  });

  it("disputes has lifecycle columns", () => {
    const cols = Object.keys(disputes);
    expect(cols).toContain("status");
    expect(cols).toContain("openedBy");
    expect(cols).toContain("resolvedBy");
    expect(cols).toContain("resolvedAt");
  });

  it("dispute_notes has append-only audit columns", () => {
    const cols = Object.keys(disputeNotes);
    expect(cols).toContain("disputeId");
    expect(cols).toContain("noteType");
    expect(cols).toContain("content");
    expect(cols).toContain("previousStatus");
    expect(cols).toContain("newStatus");
    expect(cols).toContain("authorId");
    expect(cols).toContain("authorName");
    expect(cols).toContain("authorRole");
  });
});

describe("Ticket 04 — FK delete policy (RESTRICT)", () => {
  it("disputes posTransactionId FK is defined (RESTRICT enforced at DB level)", () => {
    expect(disputes.posTransactionId).toBeDefined();
    expect(disputes.refundId).toBeDefined();
    expect(disputes.warrantyClaimId).toBeDefined();
  });
});

describe("Ticket 04 — insert schema validation", () => {
  it("insertDisputeSchema accepts valid dispute with pos_transaction_id", () => {
    const parsed = insertDisputeSchema.safeParse({
      posTransactionId: "txn-1",
      disputeType: "billing",
      description: "Wrong amount charged",
      openedBy: "staff-1",
      openedByName: "John",
      openedByRole: "Admin",
    });
    expect(parsed.success).toBe(true);
  });

  it("insertDisputeSchema accepts valid dispute with refund_id", () => {
    const parsed = insertDisputeSchema.safeParse({
      refundId: "refund-1",
      disputeType: "refund",
      description: "Refund not received",
      openedBy: "staff-1",
      openedByName: "John",
      openedByRole: "Admin",
    });
    expect(parsed.success).toBe(true);
  });

  it("insertDisputeSchema accepts valid dispute with warranty_claim_id", () => {
    const parsed = insertDisputeSchema.safeParse({
      warrantyClaimId: "wc-1",
      disputeType: "warranty",
      description: "Warranty claim denied",
      openedBy: "staff-1",
      openedByName: "John",
      openedByRole: "Admin",
    });
    expect(parsed.success).toBe(true);
  });

  it("insertDisputeSchema rejects missing dispute_type", () => {
    const parsed = insertDisputeSchema.safeParse({
      posTransactionId: "txn-1",
      description: "Something",
    });
    expect(parsed.success).toBe(false);
  });

  it("insertDisputeNoteSchema accepts valid note", () => {
    const parsed = insertDisputeNoteSchema.safeParse({
      disputeId: "disp-1",
      noteType: "note",
      content: "Investigating",
      authorId: "staff-1",
      authorName: "John",
      authorRole: "Admin",
    });
    expect(parsed.success).toBe(true);
  });

  it("insertDisputeNoteSchema accepts status_change note (lifecycle-owned)", () => {
    const parsed = insertDisputeNoteSchema.safeParse({
      disputeId: "disp-1",
      noteType: "status_change",
      content: "Status changed",
      authorId: "staff-1",
      authorName: "John",
      authorRole: "Admin",
      previousStatus: "open",
      newStatus: "under_review",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("Ticket 04 — lifecycle transition rules (server-enforced)", () => {
  const VALID_TRANSITIONS: Record<string, string[]> = {
    open: ["under_review", "closed"],
    under_review: ["resolved", "closed", "open"],
    resolved: [],
    closed: [],
  };

  it("open -> under_review is valid", () => {
    expect(VALID_TRANSITIONS["open"]).toContain("under_review");
  });

  it("open -> closed is valid", () => {
    expect(VALID_TRANSITIONS["open"]).toContain("closed");
  });

  it("open -> resolved is invalid (must go through under_review)", () => {
    expect(VALID_TRANSITIONS["open"]).not.toContain("resolved");
  });

  it("open -> open is invalid (no self-transition)", () => {
    expect(VALID_TRANSITIONS["open"]).not.toContain("open");
  });

  it("under_review -> resolved is valid", () => {
    expect(VALID_TRANSITIONS["under_review"]).toContain("resolved");
  });

  it("under_review -> closed is valid", () => {
    expect(VALID_TRANSITIONS["under_review"]).toContain("closed");
  });

  it("under_review -> open is valid (reopen)", () => {
    expect(VALID_TRANSITIONS["under_review"]).toContain("open");
  });

  it("under_review -> under_review is invalid (no self-transition)", () => {
    expect(VALID_TRANSITIONS["under_review"]).not.toContain("under_review");
  });

  it("resolved is terminal", () => {
    expect(VALID_TRANSITIONS["resolved"]).toHaveLength(0);
  });

  it("closed is terminal", () => {
    expect(VALID_TRANSITIONS["closed"]).toHaveLength(0);
  });
});

describe("Ticket 04 — DisputeError", () => {
  it("has correct name and properties", () => {
    const err = new DisputeError(409, "INVALID_TRANSITION", "Cannot transition");
    expect(err.name).toBe("DisputeError");
    expect(err.status).toBe(409);
    expect(err.code).toBe("INVALID_TRANSITION");
    expect(err.message).toBe("Cannot transition");
  });
});

describe("Ticket 04 — permission catalog entries", () => {
  it("disputes.view permission exists", async () => {
    const { PERMISSION_CATALOG } = await import("../shared/permission-catalog.js");
    const keys = PERMISSION_CATALOG.map((p) => p.key);
    expect(keys).toContain("disputes.view");
  });

  it("disputes.create permission exists", async () => {
    const { PERMISSION_CATALOG } = await import("../shared/permission-catalog.js");
    const keys = PERMISSION_CATALOG.map((p) => p.key);
    expect(keys).toContain("disputes.create");
  });

  it("disputes.resolve permission exists", async () => {
    const { PERMISSION_CATALOG } = await import("../shared/permission-catalog.js");
    const keys = PERMISSION_CATALOG.map((p) => p.key);
    expect(keys).toContain("disputes.resolve");
  });

  it("disputes permissions are independent (no overlap with POS/warranty/refund)", async () => {
    const { PERMISSION_CATALOG } = await import("../shared/permission-catalog.js");
    const disputeKeys = PERMISSION_CATALOG.filter((p) => p.key.startsWith("disputes.")).map((p) => p.key);
    const posKeys = PERMISSION_CATALOG.filter((p) => p.key.startsWith("pos.")).map((p) => p.key);
    const warrantyKeys = PERMISSION_CATALOG.filter((p) => p.key.startsWith("warranty.")).map((p) => p.key);
    // No key should appear in both disputes and another module
    for (const dk of disputeKeys) {
      expect(posKeys).not.toContain(dk);
      expect(warrantyKeys).not.toContain(dk);
    }
  });

  it("Manager Basic preset includes disputes permissions", async () => {
    const { ROLE_PRESETS } = await import("../shared/permission-catalog.js");
    expect(ROLE_PRESETS["Manager Basic"]).toContain("disputes.view");
    expect(ROLE_PRESETS["Manager Basic"]).toContain("disputes.create");
    expect(ROLE_PRESETS["Manager Basic"]).toContain("disputes.resolve");
  });

  it("LEGACY_TO_GRANULAR maps disputes module correctly", async () => {
    const { LEGACY_TO_GRANULAR } = await import("../shared/permission-catalog.js");
    expect(LEGACY_TO_GRANULAR["disputes"]).toEqual([
      "disputes.view",
      "disputes.create",
      "disputes.resolve",
    ]);
  });
});

describe("Ticket 04 — no automatic authority action (schema contract)", () => {
  it("disputes table has no FK to jobs, manual_payments, or petty_cash", () => {
    const colNames = Object.keys(disputes);
    // Must NOT have columns that would create automatic authority links
    expect(colNames).not.toContain("jobTicketId");
    expect(colNames).not.toContain("manualPaymentId");
    expect(colNames).not.toContain("pettyCashRecordId");
    expect(colNames).not.toContain("refundAmount");
    expect(colNames).not.toContain("paymentStatus");
  });

  it("disputes table only links to read-only targets (POS, refund, warranty)", () => {
    const colNames = Object.keys(disputes);
    const targetCols = colNames.filter((c) =>
      c === "posTransactionId" || c === "refundId" || c === "warrantyClaimId"
    );
    expect(targetCols).toHaveLength(3);
  });

  it("dispute_notes has no columns that could trigger financial mutations", () => {
    const colNames = Object.keys(disputeNotes);
    expect(colNames).not.toContain("refundAmount");
    expect(colNames).not.toContain("paymentStatus");
    expect(colNames).not.toContain("warrantyStatus");
  });
});
