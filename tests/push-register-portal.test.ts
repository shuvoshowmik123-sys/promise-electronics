import { describe, expect, it } from "vitest";
import { pushRegisterUrlForPortal, type PushPortal } from "../client/src/lib/push-register-url.js";

/**
 * FIX-PUSH-MULTI-PORTAL-REGISTRATION-01A
 * Endpoint selection must stay explicit and pure — no URL sniffing.
 */
describe("pushRegisterUrlForPortal", () => {
  it("customer → customer session endpoint", () => {
    expect(pushRegisterUrlForPortal("customer")).toBe("/api/push/register");
  });

  it("admin → admin session endpoint", () => {
    expect(pushRegisterUrlForPortal("admin")).toBe("/api/admin/push/register");
  });

  it("corporate → null (no corporate-session register route on server)", () => {
    expect(pushRegisterUrlForPortal("corporate")).toBeNull();
  });

  it("covers only the three known portals with stable mapping", () => {
    const portals: PushPortal[] = ["customer", "admin", "corporate"];
    const map = Object.fromEntries(portals.map((p) => [p, pushRegisterUrlForPortal(p)]));
    expect(map).toEqual({
      customer: "/api/push/register",
      admin: "/api/admin/push/register",
      corporate: null,
    });
  });
});
