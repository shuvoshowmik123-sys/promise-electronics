/**
 * Exact disputes.* keys only. Super Admin via role. No catalog suggested-role grants.
 */
import { hasGranularPermission } from "@/lib/permissions";

export type DisputePermBag = Record<string, boolean | undefined>;

export function canViewDisputes(
  user: { role?: string | null } | null | undefined,
  permissions: DisputePermBag,
): boolean {
  return hasGranularPermission(user?.role, permissions as Record<string, boolean>, "disputes.view");
}

export function canCreateDisputes(
  user: { role?: string | null } | null | undefined,
  permissions: DisputePermBag,
): boolean {
  return hasGranularPermission(user?.role, permissions as Record<string, boolean>, "disputes.create");
}

export function canResolveDisputes(
  user: { role?: string | null } | null | undefined,
  permissions: DisputePermBag,
): boolean {
  return hasGranularPermission(user?.role, permissions as Record<string, boolean>, "disputes.resolve");
}
