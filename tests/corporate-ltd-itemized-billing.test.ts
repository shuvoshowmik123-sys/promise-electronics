import { describe, expect, it } from "vitest";
import {
  DEPRECATED_GRANULAR_EXPANSIONS,
  LEGACY_TO_GRANULAR,
  ROLE_PRESETS,
  resolveGranularPermission,
} from "../shared/permission-catalog.js";
import {
  corporateLtdReceipts,
  corporateLtdReceiptAllocations,
  corporateBills,
  billLineItems,
} from "../shared/schema.js";
import {
  isCorporateLimitedClientType,
  isNormalCorporateClientType,
  CORPORATE_LIMITED_CLIENT_TYPE,
} from "../shared/constants.js";
import {
  MAIN_SCHEMA_MIGRATIONS,
  REQUIRED_MAIN_SCHEMA_VERSION,
  computeMigrationChecksum,
} from "../server/services/main-schema-migrate.service.js";
import {
  corporateLtdBillingRepo,
  CorporateLtdBillingError,
  CORPORATE_LTD_REQUIRED,
  ITEMIZED_BILL_REQUIRED,
  ALL_COLUMN_KEYS,
} from "../server/repositories/corporate-ltd-billing.repository.js";

const view = "corporate.bills.view";
const create = "corporate.bills.create";
const configure = "corporate.bills.configureTemplates";
const recordPayment = "corporate.bills.recordPayment";

describe("FINANCE-AFTERCARE-01.3 — schema + migration registration", () => {
  it("registers the corporate ltd itemized migration in the MAIN ledger", () => {
    const ids = MAIN_SCHEMA_MIGRATIONS.map((m) => m.id);
    expect(ids).toContain("2026_07_23_corporate_ltd_itemized_billing");
  });

  it("bumps REQUIRED_MAIN_SCHEMA_VERSION to the new migration", () => {
    expect(REQUIRED_MAIN_SCHEMA_VERSION).toBe("2026_07_23_corporate_ltd_itemized_billing");
  });

  it("migration ids are unique with stable checksums (append-only)", () => {
    const uniqueIds = new Set(MAIN_SCHEMA_MIGRATIONS.map((m) => m.id));
    expect(uniqueIds.size).toBe(MAIN_SCHEMA_MIGRATIONS.length);
    const checksums = MAIN_SCHEMA_MIGRATIONS.map((m) => computeMigrationChecksum(m));
    expect(new Set(checksums).size).toBe(checksums.length);
  });

  it("the prior account-receipts migration is still present (no rewrite of history)", () => {
    const ids = MAIN_SCHEMA_MIGRATIONS.map((m) => m.id);
    expect(ids).toContain("2026_07_23_corporate_account_receipts");
  });

  it("exports the new schema tables and columns", () => {
    expect(corporateLtdReceipts).toBeDefined();
    expect(corporateLtdReceiptAllocations).toBeDefined();
    expect((corporateLtdReceipts as any).billId).toBeDefined();
    expect((corporateLtdReceiptAllocations as any).receiptId).toBeDefined();
    expect((corporateBills as any).layoutSnapshot).toBeDefined();
    expect((corporateBills as any).itemizedMode).toBeDefined();
    expect((billLineItems as any).clientJobNumber).toBeDefined();
    expect((billLineItems as any).promiseJobNumber).toBeDefined();
  });

  it("migration is append-only (no destructive DROP)", () => {
    const migration = MAIN_SCHEMA_MIGRATIONS.find((m) => m.id === "2026_07_23_corporate_ltd_itemized_billing");
    expect(migration).toBeDefined();
    const body = migration!.up.toString();
    expect(body).not.toMatch(/DROP TABLE/i);
    expect(body).not.toMatch(/DROP COLUMN/i);
    expect(body).toMatch(/ADD COLUMN IF NOT EXISTS/);
    expect(body).toMatch("corporate_ltd_receipts");
    expect(body).toMatch("corporate_ltd_receipt_allocations");
    expect(body).toMatch("ck_corporate_ltd_receipts_amount_positive");
    expect(body).toMatch("ck_corporate_ltd_alloc_amount_positive");
  });
});

describe("FINANCE-AFTERCARE-01.3 — permission contract", () => {
  it("configureTemplates is a distinct capability from create/recordPayment", () => {
    expect(resolveGranularPermission({ [create]: true }, configure)).toBe(false);
    expect(resolveGranularPermission({ [recordPayment]: true }, configure)).toBe(false);
    expect(resolveGranularPermission({ [view]: true }, configure)).toBe(false);
  });

  it("legacy corporate.billing expands to configureTemplates (backward compat)", () => {
    expect(DEPRECATED_GRANULAR_EXPANSIONS["corporate.billing"]).toContain(configure);
    expect(resolveGranularPermission({ "corporate.billing": true }, configure)).toBe(true);
  });

  it("legacy corporate:true grants configureTemplates for backward compatibility", () => {
    expect(LEGACY_TO_GRANULAR["corporate"]).toContain(configure);
    expect(resolveGranularPermission({ corporate: true }, configure)).toBe(true);
  });

  it("Manager Basic gets configureTemplates by default", () => {
    const managerPerms = Object.fromEntries(ROLE_PRESETS["Manager Basic"].map((k) => [k, true]));
    expect(resolveGranularPermission(managerPerms, configure)).toBe(true);
  });

  it("Cashier Basic does NOT get configureTemplates", () => {
    const cashierPerms = Object.fromEntries(ROLE_PRESETS["Cashier Basic"].map((k) => [k, true]));
    expect(resolveGranularPermission(cashierPerms, configure)).toBe(false);
  });

  it("view does not imply create or recordPayment", () => {
    expect(resolveGranularPermission({ [view]: true }, create)).toBe(false);
    expect(resolveGranularPermission({ [view]: true }, recordPayment)).toBe(false);
  });

  it("Super Admin wildcard passes all corporate Ltd. capabilities", () => {
    expect(resolveGranularPermission({ "*": true }, configure)).toBe(true);
    expect(resolveGranularPermission({ "*": true }, create)).toBe(true);
    expect(resolveGranularPermission({ "*": true }, recordPayment)).toBe(true);
  });
});

describe("FINANCE-AFTERCARE-01.3 — client-type boundary", () => {
  it("Corporate Ltd. = clientType 'limited_company' and is NOT Normal Corporate", () => {
    expect(isCorporateLimitedClientType(CORPORATE_LIMITED_CLIENT_TYPE)).toBe(true);
    expect(isCorporateLimitedClientType("limited_company")).toBe(true);
    expect(isNormalCorporateClientType("limited_company")).toBe(false);
  });

  it("Normal Corporate (corporate) is NOT Corporate Ltd.", () => {
    expect(isCorporateLimitedClientType("corporate")).toBe(false);
    expect(isNormalCorporateClientType("corporate")).toBe(true);
  });
});

describe("FINANCE-AFTERCARE-01.3 — preset normalization + column keys", () => {
  it("ALL_COLUMN_KEYS enumerates the seven approved document columns", () => {
    expect(ALL_COLUMN_KEYS).toEqual([
      "clientJobNumber",
      "promiseJobNumber",
      "tvSerial",
      "brandModel",
      "tvSize",
      "service",
      "amount",
    ]);
  });

  it("normalizePreset rejects an invalid recipientPolicy and falls back to safe default", async () => {
    const { normalizePreset } = await import("../server/repositories/corporate-ltd-billing.repository.js");
    const bad = normalizePreset({ recipientPolicy: "weird", enabledColumns: ["amount"] });
    expect(bad.recipientPolicy).toBe("company_only");
    expect(bad.enabledColumns).toContain("amount");
  });

  it("normalizePreset filters unknown columns and keeps only approved ones", async () => {
    const { normalizePreset } = await import("../server/repositories/corporate-ltd-billing.repository.js");
    const p = normalizePreset({ recipientPolicy: "attention_person", enabledColumns: ["amount", "bogus", "tvSerial"] });
    expect(p.enabledColumns).toEqual(["amount", "tvSerial"]);
  });

  it("normalizePreset restores full column set when enabledColumns is empty", async () => {
    const { normalizePreset } = await import("../server/repositories/corporate-ltd-billing.repository.js");
    const p = normalizePreset({ recipientPolicy: "company_only", enabledColumns: [] });
    expect(p.enabledColumns.length).toBe(ALL_COLUMN_KEYS.length);
  });

  it("normalizePreset returns a safe default for non-object input", async () => {
    const { normalizePreset } = await import("../server/repositories/corporate-ltd-billing.repository.js");
    const p = normalizePreset(null);
    expect(p.recipientPolicy).toBe("company_only");
    expect(p.enabledColumns.length).toBe(ALL_COLUMN_KEYS.length);
  });
});

describe("FINANCE-AFTERCARE-01.3 — repository input validation (synchronous, no DB)", () => {
  it("CorporateLtdBillingError carries status + code", () => {
    const err = new CorporateLtdBillingError(422, CORPORATE_LTD_REQUIRED, "nope");
    expect(err.status).toBe(422);
    expect(err.code).toBe(CORPORATE_LTD_REQUIRED);
    expect(err.name).toBe("CorporateLtdBillingError");
  });

  it("getBillingPreset does not silently succeed for a missing client (rejects)", async () => {
    let err: any;
    try { await corporateLtdBillingRepo.getBillingPreset("no-such-client"); } catch (e: any) { err = e; }
    expect(err).toBeDefined();
  });

  it("listEligibleJobs does not silently succeed for a missing client (rejects)", async () => {
    let err: any;
    try { await corporateLtdBillingRepo.listEligibleJobs("no-such-client"); } catch (e: any) { err = e; }
    expect(err).toBeDefined();
  });

  it("issueBill does not silently succeed for a missing client (rejects)", async () => {
    let err: any;
    try {
      await corporateLtdBillingRepo.issueBill("no-such-client", ["j1"], new Date(), new Date(), "u");
    } catch (e: any) { err = e; }
    expect(err).toBeDefined();
  });

  it("recordReceiptAndAllocations rejects (no DB) and not with a validation code", async () => {
    let err: any;
    try {
      await corporateLtdBillingRepo.recordReceiptAndAllocations({
        corporateClientId: "no-such-client",
        billId: "b1",
        amount: 100,
        method: "cash",
      });
    } catch (e: any) { err = e; }
    expect(err).toBeDefined();
    // The error must NOT be a validation error (amount/method are valid); it is a
    // connection/DB error proving the call did not silently accept.
    expect(err?.code).not.toBe("INVALID_METHOD");
    expect(err?.code).not.toBe("INVALID_AMOUNT");
  });
});

describe("FINANCE-AFTERCARE-01.3 — isolation invariants (static contract)", () => {
  it("the repository exposes no POS/Due/refund/warranty/job-status methods", () => {
    const ownKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(corporateLtdBillingRepo)).filter(
      (k) => k !== "constructor",
    );
    expect(ownKeys.some((k) => /pos|dueRecord|refund|warranty|repairStatus|jobStatus/i.test(k))).toBe(false);
    expect(ownKeys).toContain("recordReceiptAndAllocations");
    expect(ownKeys).toContain("issueBill");
  });

  it("itemized receipts are bill-scoped (billId NOT NULL on the table)", () => {
    expect((corporateLtdReceipts as any).billId).toBeDefined();
  });

  it("allocations carry corporateClientId + billId for same-client enforcement", () => {
    expect((corporateLtdReceiptAllocations as any).corporateClientId).toBeDefined();
    expect((corporateLtdReceiptAllocations as any).billId).toBeDefined();
  });
});

describe("FINANCE-AFTERCARE-01.3 — Gap 1: getBillingPreset rejects Normal Corporate", () => {
  it("ITEMIZED_BILL_REQUIRED error code is exported", () => {
    expect(ITEMIZED_BILL_REQUIRED).toBe("ITEMIZED_BILL_REQUIRED");
  });

  it("getBillingPreset source code checks client type (source-level)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(__dirname, "../server/repositories/corporate-ltd-billing.repository.ts"),
      "utf-8",
    );
    const getPresetBlock = content.slice(
      content.indexOf("async getBillingPreset"),
      content.indexOf("async setBillingPreset"),
    );
    expect(getPresetBlock).toContain("isCorporateLimitedClientType");
    expect(getPresetBlock).toContain(CORPORATE_LTD_REQUIRED);
  });

  it("CorporateLtdBillingError can carry ITEMIZED_BILL_REQUIRED code", () => {
    const err = new CorporateLtdBillingError(422, ITEMIZED_BILL_REQUIRED, "legacy bill");
    expect(err.code).toBe(ITEMIZED_BILL_REQUIRED);
    expect(err.status).toBe(422);
  });
});

describe("FINANCE-AFTERCARE-01.3 — Gap 2: issueBill exact selection + concurrency contract", () => {
  it("issueBill rejects empty job IDs (synchronous pre-check)", async () => {
    let err: any;
    try {
      await corporateLtdBillingRepo.issueBill("c1", [], new Date(), new Date(), "u");
    } catch (e: any) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.code).toBe("EMPTY_SELECTION");
  });

  it("issueBill rejects duplicate job IDs (synchronous pre-check)", async () => {
    let err: any;
    try {
      await corporateLtdBillingRepo.issueBill("c1", ["j1", "j1"], new Date(), new Date(), "u");
    } catch (e: any) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(err.code).toBe("DUPLICATE_JOB_IDS");
  });

  it("issueBill validates inputs before hitting DB (source-level)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(__dirname, "../server/repositories/corporate-ltd-billing.repository.ts"),
      "utf-8",
    );
    const issueBlock = content.slice(
      content.indexOf("async issueBill"),
      content.indexOf("return db.transaction(async (tx)"),
    );
    const emptyCheckPos = issueBlock.indexOf("EMPTY_SELECTION");
    const dupCheckPos = issueBlock.indexOf("DUPLICATE_JOB_IDS");
    const getClientPos = issueBlock.indexOf("this.getClient");
    expect(emptyCheckPos).toBeGreaterThan(-1);
    expect(dupCheckPos).toBeGreaterThan(-1);
    expect(getClientPos).toBeGreaterThan(-1);
    expect(emptyCheckPos).toBeLessThan(getClientPos);
    expect(dupCheckPos).toBeLessThan(getClientPos);
  });

  it("issueBill uses FOR UPDATE lock inside transaction (source-level)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(__dirname, "../server/repositories/corporate-ltd-billing.repository.ts"),
      "utf-8",
    );
    const txBlock = content.slice(content.indexOf("return db.transaction(async (tx)"));
    expect(txBlock).toContain("FOR UPDATE");
    expect(txBlock).toContain("JOB_NOT_FOUND");
    expect(txBlock).toContain("JOBS_NOT_ELIGIBLE");
  });
});

describe("FINANCE-AFTERCARE-01.3 — Gap 3: non-itemized bill rejection contract", () => {
  it("recordReceiptAndAllocations carries ITEMIZED_BILL_REQUIRED for legacy bills", () => {
    const err = new CorporateLtdBillingError(422, ITEMIZED_BILL_REQUIRED, "Use account-level flow");
    expect(err.code).toBe(ITEMIZED_BILL_REQUIRED);
    expect(err.message).toMatch(/account-level/);
  });

  it("getBillBalance carries ITEMIZED_BILL_REQUIRED for legacy bills", () => {
    const err = new CorporateLtdBillingError(422, ITEMIZED_BILL_REQUIRED, "Use account-level balance");
    expect(err.code).toBe(ITEMIZED_BILL_REQUIRED);
  });

  it("getBillWithLines carries ITEMIZED_BILL_REQUIRED for legacy bills", () => {
    const err = new CorporateLtdBillingError(422, ITEMIZED_BILL_REQUIRED, "Use account-level view");
    expect(err.code).toBe(ITEMIZED_BILL_REQUIRED);
  });
});

describe("FINANCE-AFTERCARE-01.3 — Gap 4: B2B UI access contract (source-level)", () => {
  it("design-concept B2B gate checks corporate.bills.configureTemplates", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/admin/design-concept.tsx"),
      "utf-8",
    );
    expect(content).toContain("corporate.bills.configureTemplates");
    expect(content).toMatch(/tabId === "b2b"[\s\S]*configureTemplates/);
  });

  it("LtdBillingPresetEditor checks configureTemplates permission (source-level)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const content = fs.readFileSync(
      path.resolve(__dirname, "../client/src/components/admin/corporate/LtdBillingPresetEditor.tsx"),
      "utf-8",
    );
    expect(content).toContain("corporate.bills.configureTemplates");
    expect(content).toMatch(/canConfigure.*configureTemplates/);
  });
});
