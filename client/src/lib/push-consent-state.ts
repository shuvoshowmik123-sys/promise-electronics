/**
 * Pure decision helpers for web-push consent UI.
 * No browser APIs are called here — pass snapshots from the caller.
 */

export type PushPermissionSnapshot = NotificationPermission | "unsupported";

/** Which surface the shared component should render. */
export type PushConsentUiState =
  | "hidden"
  | "unsupported"
  | "ios_install_hint"
  | "default"
  | "granted"
  | "denied";

export type BrowserFamily = "chrome" | "edge" | "firefox" | "safari" | "generic";

export function isIosUserAgent(ua: string): boolean {
  return /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua));
}

/** PWA installed / home-screen mode (iOS Safari web push requirement). */
export function isStandaloneMode(opts: {
  standaloneMedia: boolean;
  navigatorStandalone: boolean | undefined;
}): boolean {
  return opts.standaloneMedia || opts.navigatorStandalone === true;
}

export function detectBrowserFamily(ua: string): BrowserFamily {
  const s = ua || "";
  // Order matters: Edge/Chrome include Safari tokens; Firefox is distinct.
  if (/Edg\//i.test(s) || /EdgiOS\//i.test(s)) return "edge";
  if (/Firefox\//i.test(s) || /FxiOS\//i.test(s)) return "firefox";
  if (/Chrome\//i.test(s) || /CriOS\//i.test(s) || /Chromium\//i.test(s)) return "chrome";
  if (/Safari\//i.test(s) && !/Chrome\//i.test(s) && !/Chromium\//i.test(s) && !/CriOS\//i.test(s)) {
    return "safari";
  }
  return "generic";
}

/**
 * Map permission + platform + config into one UI state.
 * Call only with values from getNotificationPermission / isWebPushConfigured / UA checks.
 */
export function resolvePushConsentUiState(input: {
  configured: boolean;
  permission: PushPermissionSnapshot;
  isIos: boolean;
  isStandalone: boolean;
}): PushConsentUiState {
  // Unconfigured: hide control — app must behave as today (optional feature).
  if (!input.configured) return "hidden";

  // iOS Safari tab (not installed): web push cannot work — guide to home screen.
  if (input.isIos && !input.isStandalone) return "ios_install_hint";

  if (input.permission === "unsupported") return "unsupported";
  if (input.permission === "denied") return "denied";
  if (input.permission === "granted") return "granted";
  return "default";
}

/** Session-only dismiss key for the post-submit invitation card. */
export const PUSH_VALUE_PROMPT_DISMISSED_KEY = "pushValuePromptDismissed";

export function shouldShowPushValuePrompt(input: {
  permission: PushPermissionSnapshot;
  configured: boolean;
  dismissedThisSession: boolean;
  isIos: boolean;
  isStandalone: boolean;
}): boolean {
  if (input.dismissedThisSession) return false;
  if (!input.configured) return false;
  if (input.isIos && !input.isStandalone) return false;
  return input.permission === "default";
}
