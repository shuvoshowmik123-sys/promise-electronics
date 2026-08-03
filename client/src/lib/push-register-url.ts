/**
 * Pure multi-portal push register URL selection (FIX-PUSH-MULTI-PORTAL-REGISTRATION-01A).
 * No browser or Firebase imports — safe for unit tests.
 */

export type PushPortal = "customer" | "admin" | "corporate";

/**
 * Returns the POST path for device-token registration for an explicit portal.
 * null = no server route accepts that portal's session (do not invent one client-side).
 */
export function pushRegisterUrlForPortal(portal: PushPortal): string | null {
  switch (portal) {
    case "customer":
      return "/api/push/register";
    case "admin":
      return "/api/admin/push/register";
    case "corporate":
      return null;
    default:
      return null;
  }
}
