import { describe, expect, it } from "vitest";
import {
  DEPRECATED_GRANULAR_EXPANSIONS,
  ROLE_PRESETS,
  resolveGranularPermission,
} from "../shared/permission-catalog.js";
import { describeBillLineItem, getBillLineItems } from "../shared/corporate-bill-utils.js";
import { deriveBillingTier } from "../shared/constants.js";

const view = "corporate.bills.view";
const create = "corporate.bills.create";
const print = "corporate.bills.print";
const recordPayment = "corporate.bills.recordPayment";
const configure = "corporate.bills.configureTemplates";

describe("Finance and Aftercare 01.1 authority reconciliation", () => {
  it("expands the legacy corporate.billing grant without reverse escalation", () => {
    expect(DEPRECATED_GRANULAR_EXPANSIONS["corporate.billing"])
      .toEqual([view, create, print, recordPayment, configure]);
    expect(resolveGranularPermission({ "corporate.billing": true }, view)).toBe(true);
    expect(resolveGranularPermission({ [view]: true }, "corporate.billing")).toBe(false);
  });

  it("keeps direct capabilities separate", () => {
    const permissions = { [view]: true };
    expect(resolveGranularPermission(permissions, view)).toBe(true);
    expect(resolveGranularPermission(permissions, create)).toBe(false);
    expect(resolveGranularPermission(permissions, configure)).toBe(false);
  });

  it("allows Manager Basic to configure a Corporate Ltd. preset but not create bills", () => {
    const permissions = Object.fromEntries(ROLE_PRESETS["Manager Basic"].map((key) => [key, true]));
    expect(resolveGranularPermission(permissions, configure)).toBe(true);
    expect(resolveGranularPermission(permissions, create)).toBe(false);
  });

  it("keeps wildcard and legacy corporate grants compatible", () => {
    expect(resolveGranularPermission({ "*": true }, recordPayment)).toBe(true);
    expect(resolveGranularPermission({ corporate: true }, print)).toBe(true);
  });

  it("uses the authoritative lineItems array, not a dormant items property", () => {
    const line = { jobId: "j1", jobNo: "JOB-1", device: "TV", defect: "No power", amount: 1200 };
    expect(getBillLineItems({ lineItems: [line] })).toEqual([line]);
    expect(getBillLineItems({ items: [line] } as any)).toEqual([]);
  });

  it("formats a safe corporate bill display line", () => {
    expect(describeBillLineItem({ jobNo: "JOB-1", device: "TV", defect: "No power", amount: 1200 }))
      .toMatchObject({ description: "TV - No power", jobRef: "JOB-1", amount: 1200 });
  });

  it("derives a canonical profile tier from client type", () => {
    expect(deriveBillingTier("limited_company")).toBe("corporate");
    expect(deriveBillingTier("corporate")).toBe("normal");
  });
});
