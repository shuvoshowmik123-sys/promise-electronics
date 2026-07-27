/**
 * CUSTOMER-FEEDBACK-01B — exact granular feedback keys only.
 * Super Admin wildcard handled by role check. No role-name-only grants.
 */

export type FeedbackPermBag = Record<string, boolean | undefined>;

function isSuperAdmin(user: { role?: string | null } | null | undefined): boolean {
  return user?.role === "Super Admin";
}

export function canViewFeedbackRecoveryAll(
  user: { role?: string | null } | null | undefined,
  permissions: FeedbackPermBag,
): boolean {
  if (isSuperAdmin(user)) return true;
  return permissions["feedback.recovery.viewAll"] === true;
}

export function canViewFeedbackRecoveryAssigned(
  user: { role?: string | null } | null | undefined,
  permissions: FeedbackPermBag,
): boolean {
  if (isSuperAdmin(user)) return true;
  if (permissions["feedback.recovery.viewAll"] === true) return true;
  return permissions["feedback.recovery.viewAssigned"] === true;
}

export function canUpdateFeedbackRecovery(
  user: { role?: string | null } | null | undefined,
  permissions: FeedbackPermBag,
): boolean {
  if (isSuperAdmin(user)) return true;
  return permissions["feedback.recovery.updateAssigned"] === true;
}

export function canResolveFeedbackRecovery(
  user: { role?: string | null } | null | undefined,
  permissions: FeedbackPermBag,
): boolean {
  if (isSuperAdmin(user)) return true;
  return permissions["feedback.recovery.resolve"] === true;
}

export function canModeratePublicFeedback(
  user: { role?: string | null } | null | undefined,
  permissions: FeedbackPermBag,
): boolean {
  if (isSuperAdmin(user)) return true;
  return permissions["feedback.public.moderate"] === true;
}

export function canFeaturePublicFeedback(
  user: { role?: string | null } | null | undefined,
  permissions: FeedbackPermBag,
): boolean {
  if (isSuperAdmin(user)) return true;
  return permissions["feedback.public.feature"] === true;
}

export function canReviewFeedbackRetention(
  user: { role?: string | null } | null | undefined,
  permissions: FeedbackPermBag,
): boolean {
  if (isSuperAdmin(user)) return true;
  return permissions["feedback.retention.review"] === true;
}

/** Any feedback staff surface visible in Settings. */
export function canOpenServiceFeedbackWorkspace(
  user: { role?: string | null } | null | undefined,
  permissions: FeedbackPermBag,
): boolean {
  return (
    canViewFeedbackRecoveryAssigned(user, permissions) ||
    canModeratePublicFeedback(user, permissions) ||
    canFeaturePublicFeedback(user, permissions) ||
    canReviewFeedbackRetention(user, permissions)
  );
}
