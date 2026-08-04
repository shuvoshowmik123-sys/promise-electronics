import { describe, expect, it } from "vitest";
import { PERMISSION_CATALOG, LEGACY_TO_GRANULAR, ROLE_PRESETS } from "../shared/permission-catalog.js";
import { getDefaultPermissionsForRole } from "../shared/admin-permissions.js";

describe("pickup.confirmHandover permission", () => {
  it("exists in the catalog", () => {
    const entry = PERMISSION_CATALOG.find((p) => p.key === "pickup.confirmHandover");
    expect(entry).toBeTruthy();
    expect(entry?.module).toBe("pickup");
  });

  it("is included when expanding legacy pickup:true", () => {
    expect(LEGACY_TO_GRANULAR.pickup).toContain("pickup.confirmHandover");
  });

  it("is granted to Driver defaults and Driver Basic preset", () => {
    const driver = getDefaultPermissionsForRole("Driver");
    expect(driver["pickup.confirmHandover"] === true || driver.pickup === true).toBe(true);
    expect(ROLE_PRESETS["Driver Basic"]).toContain("pickup.confirmHandover");
  });

  it("is on Manager Basic; Driver still lacks serviceRequests", () => {
    expect(ROLE_PRESETS["Manager Basic"]).toContain("pickup.confirmHandover");
    const driver = getDefaultPermissionsForRole("Driver");
    expect(driver.serviceRequests).toBe(false);
  });
});
