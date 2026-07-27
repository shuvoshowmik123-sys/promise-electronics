import { resolveGranularPermission } from "@shared/permission-catalog";

/** Client mirror of the server's granular-permission resolution. */
export function hasGranularPermission(
  role: string | undefined | null,
  permissions: Record<string, boolean>,
  granularKey: string,
): boolean {
  if (role === "Super Admin") return true;
  return resolveGranularPermission(permissions, granularKey);
}
