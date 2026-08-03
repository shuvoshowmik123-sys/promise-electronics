import { describe, expect, it, beforeEach, vi } from "vitest";
import { LEGACY_TO_GRANULAR, PERMISSION_CATALOG, ROLE_PRESETS, resolveGranularPermission } from "../shared/permission-catalog.js";
import { getDefaultPermissionsForRole } from "../shared/admin-permissions.js";

const { getUserMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
}));

vi.mock("../server/storage.js", () => ({
  storage: { getUser: getUserMock },
}));

import { requireGranularPermission } from "../server/routes/middleware/auth.js";

type GuardResult = {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  next: ReturnType<typeof vi.fn>;
};

const runGuard = async (
  granularKey: string,
  permissions: Record<string, boolean>,
  options: { role?: string; method?: string; path?: string } = {},
): Promise<GuardResult> => {
  getUserMock.mockResolvedValue({
    id: "staff-1",
    role: options.role || "Technician",
    permissions: JSON.stringify(permissions),
  });

  const req = {
    method: options.method || "POST",
    path: options.path || "/api/test",
    session: { adminUserId: "staff-1" },
  } as any;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;
  const next = vi.fn();

  await requireGranularPermission(granularKey)(req, res, next);
  return { status: res.status, json: res.json, next };
};

const legacyBridgeCases = [
  { legacy: "finance", read: "finance.view", write: "finance.createRecord" },
  { legacy: "users", read: "users.viewStaff", write: "users.inviteStaff" },
  { legacy: "jobs", read: "jobs.view", write: "jobs.delete" },
  { legacy: "inventory", read: "inventory.view", write: "inventory.deleteItem" },
  { legacy: "inquiries", read: "serviceRequests.view", write: "serviceRequests.transitionStage" },
] as const;

const newKeys = [
  { legacy: "users", key: "users.editStaff" },
  { legacy: "users", key: "customers.create" },
  { legacy: "users", key: "customers.delete" },
  { legacy: "jobs", key: "jobs.rollback" },
] as const;

describe("DR-12 permission bridge", () => {
  beforeEach(() => {
    getUserMock.mockReset();
  });

  it.each(legacyBridgeCases)("denies a read-only $read permission for the $write write route", async ({ read, write }) => {
    const result = await runGuard(write, { [read]: true });
    expect(result.status).toHaveBeenCalledWith(403);
    expect(result.next).not.toHaveBeenCalled();
  });

  it.each(legacyBridgeCases)("allows the exact $write permission", async ({ write }) => {
    const result = await runGuard(write, { [write]: true });
    expect(result.next).toHaveBeenCalledOnce();
    expect(result.status).not.toHaveBeenCalled();
  });

  it.each(legacyBridgeCases)("preserves direct legacy $legacy access for its existing mapped write route", async ({ legacy, write }) => {
    const result = await runGuard(write, { [legacy]: true });
    expect(result.next).toHaveBeenCalledOnce();
    expect(result.status).not.toHaveBeenCalled();
  });

  it.each(legacyBridgeCases)("keeps the Super Admin wildcard for $write", async ({ write }) => {
    const result = await runGuard(write, { "*": true }, { role: "Super Admin" });
    expect(result.next).toHaveBeenCalledOnce();
    expect(result.status).not.toHaveBeenCalled();
  });

  it.each(newKeys)("requires an explicit grant for new key $key", async ({ legacy, key }) => {
    const result = await runGuard(key, { [legacy]: true });
    expect(result.status).toHaveBeenCalledWith(403);
    expect(result.next).not.toHaveBeenCalled();

    const granted = await runGuard(key, { [key]: true });
    expect(granted.next).toHaveBeenCalledOnce();
  });

  it("reproduces the live customer PATCH boundary: users.viewStaff alone returns 403", async () => {
    const result = await runGuard("customers.edit", { "users.viewStaff": true }, {
      method: "PATCH",
      path: "/api/admin/customers/customer-1",
    });
    expect(result.status).toHaveBeenCalledWith(403);
    expect(result.json).toHaveBeenCalledWith({ error: "Access denied: Missing permission customers.edit" });
    expect(result.next).not.toHaveBeenCalled();
  });

  it("keeps the four new keys out of all role presets and legacy role defaults", () => {
    const roles = ["Super Admin", "Manager", "Cashier", "Technician", "Driver", "Corporate"];

    for (const { key } of newKeys) {
      expect(PERMISSION_CATALOG.some((permission) => permission.key === key)).toBe(true);
      expect(Object.values(ROLE_PRESETS).some((preset) => preset.includes(key))).toBe(false);
      expect(Object.values(LEGACY_TO_GRANULAR).some((mapped) => mapped.includes(key))).toBe(false);
      for (const role of roles) {
        expect(getDefaultPermissionsForRole(role)[key]).not.toBe(true);
      }
    }
  });

  it("does not let a view key resolve to any protected write key", () => {
    for (const { read, write } of legacyBridgeCases) {
      expect(resolveGranularPermission({ [read]: true }, write)).toBe(false);
    }
  });
});
