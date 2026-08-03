/** Pure dismiss contract for ProfileCompletionModal (DR-16 / R1 / R2). */

export const PROFILE_SKIP_STORAGE_KEY = "profileCompletionSkipped";

/**
 * Radix Dialog onOpenChange receives the next open state.
 * Closing (next === false) must invoke skip — never a no-op trap.
 */
export function createProfileDismissHandler(onSkip?: () => void) {
  return (nextOpen: boolean) => {
    if (!nextOpen) onSkip?.();
  };
}

/** Legacy sessionStorage skip is never authoritative — always clear on layout mount. */
export function clearLegacyProfileSkip(storage: Pick<Storage, "removeItem"> = sessionStorage) {
  storage.removeItem(PROFILE_SKIP_STORAGE_KEY);
}

/**
 * Skip lives only in React state for the current mount.
 * A fresh mount starts with profileSkippedInMemory = false and re-prompts (R2).
 */
export function shouldShowProfileCompletion(opts: {
  isAuthenticated: boolean;
  needsProfileCompletion: boolean;
  profileSkippedInMemory: boolean;
}): boolean {
  return opts.isAuthenticated && opts.needsProfileCompletion && !opts.profileSkippedInMemory;
}
