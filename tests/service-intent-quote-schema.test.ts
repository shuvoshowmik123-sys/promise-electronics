/**
 * CUSTOMER-SERVICE-INTENT-01A — quote intake contract.
 *
 * Covers the schema-level half of the contract (serviceId nullability) plus the
 * safe icon registry. Catalogue-existence checks in
 * retail-intake.service.resolveRequestedServiceId need a live database and are
 * covered by the API/manual QA guide, not here — this project's Vitest config
 * runs environment: 'node' with no test database bootstrapped for unit tests.
 */
import { describe, expect, it } from "vitest";
import { insertQuoteRequestSchema } from "../shared/schema";
import {
  SERVICE_ICON_FALLBACK,
  SERVICE_ICON_REGISTRY,
  resolveServiceIcon,
} from "../client/src/lib/service-icons";

const baseQuote = {
  brand: "Samsung",
  primaryIssue: "No Display",
  customerName: "QA Customer",
  phone: "+8801712345678",
};

describe("insertQuoteRequestSchema — serviceId nullability", () => {
  it('accepts serviceId: null ("Not sure — Check my TV")', () => {
    const parsed = insertQuoteRequestSchema.parse({ ...baseQuote, serviceId: null });
    expect(parsed.serviceId).toBeNull();
  });

  it("accepts a fully omitted serviceId", () => {
    const parsed = insertQuoteRequestSchema.parse({ ...baseQuote });
    expect(parsed.serviceId).toBeUndefined();
  });

  it("accepts a concrete service id unchanged", () => {
    const parsed = insertQuoteRequestSchema.parse({ ...baseQuote, serviceId: "svc_panel_repair" });
    expect(parsed.serviceId).toBe("svc_panel_repair");
  });

  it("still rejects an empty-string serviceId (neither a real id nor an explicit null)", () => {
    expect(() => insertQuoteRequestSchema.parse({ ...baseQuote, serviceId: "" })).toThrow();
  });

  it("still rejects an over-long serviceId", () => {
    expect(() =>
      insertQuoteRequestSchema.parse({ ...baseQuote, serviceId: "x".repeat(129) }),
    ).toThrow();
  });

  it("still enforces the unrelated required fields", () => {
    expect(() => insertQuoteRequestSchema.parse({ serviceId: null })).toThrow();
  });
});

describe("service icon registry — closed set, no dynamic lookup", () => {
  it("exposes exactly the nine admin-managed icon names", () => {
    expect(Object.keys(SERVICE_ICON_REGISTRY).sort()).toEqual(
      ["Cpu", "Gamepad2", "LayoutGrid", "Monitor", "Smartphone", "Tv", "Volume2", "Wrench", "Zap"].sort(),
    );
  });

  it("resolves a known icon name to its registered component", () => {
    expect(resolveServiceIcon("Tv")).toBe(SERVICE_ICON_REGISTRY.Tv);
  });

  it("falls back to Wrench for null, empty, and unknown names", () => {
    expect(resolveServiceIcon(null)).toBe(SERVICE_ICON_FALLBACK);
    expect(resolveServiceIcon(undefined)).toBe(SERVICE_ICON_FALLBACK);
    expect(resolveServiceIcon("")).toBe(SERVICE_ICON_FALLBACK);
    expect(resolveServiceIcon("NotARealIcon")).toBe(SERVICE_ICON_FALLBACK);
  });

  it("does not resolve arbitrary object/prototype keys to a component", () => {
    // Guards against admin-editable text reaching a prototype property.
    expect(resolveServiceIcon("constructor")).toBe(SERVICE_ICON_FALLBACK);
    expect(resolveServiceIcon("__proto__")).toBe(SERVICE_ICON_FALLBACK);
    expect(resolveServiceIcon("toString")).toBe(SERVICE_ICON_FALLBACK);
  });
});
