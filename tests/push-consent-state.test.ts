import { describe, expect, it } from "vitest";
import {
  detectBrowserFamily,
  isIosUserAgent,
  isStandaloneMode,
  resolvePushConsentUiState,
  shouldShowPushValuePrompt,
} from "../client/src/lib/push-consent-state.js";

describe("resolvePushConsentUiState", () => {
  const base = {
    configured: true,
    permission: "default" as const,
    isIos: false,
    isStandalone: false,
  };

  it("hides when push is unconfigured (optional feature stays invisible)", () => {
    expect(
      resolvePushConsentUiState({ ...base, configured: false, permission: "default" }),
    ).toBe("hidden");
  });

  it("maps permission default → default (inviting OFF toggle)", () => {
    expect(resolvePushConsentUiState({ ...base, permission: "default" })).toBe("default");
  });

  it("maps permission granted → granted", () => {
    expect(resolvePushConsentUiState({ ...base, permission: "granted" })).toBe("granted");
  });

  it("maps permission denied → denied (recovery, no fake toggle)", () => {
    expect(resolvePushConsentUiState({ ...base, permission: "denied" })).toBe("denied");
  });

  it("maps unsupported permission → unsupported", () => {
    expect(resolvePushConsentUiState({ ...base, permission: "unsupported" })).toBe("unsupported");
  });

  it("iOS non-standalone → install hint (not a dead toggle)", () => {
    expect(
      resolvePushConsentUiState({
        ...base,
        permission: "default",
        isIos: true,
        isStandalone: false,
      }),
    ).toBe("ios_install_hint");
  });

  it("iOS standalone uses normal permission mapping", () => {
    expect(
      resolvePushConsentUiState({
        ...base,
        permission: "default",
        isIos: true,
        isStandalone: true,
      }),
    ).toBe("default");
    expect(
      resolvePushConsentUiState({
        ...base,
        permission: "granted",
        isIos: true,
        isStandalone: true,
      }),
    ).toBe("granted");
  });

  it("unconfigured wins over iOS hint (nothing to enable)", () => {
    expect(
      resolvePushConsentUiState({
        configured: false,
        permission: "default",
        isIos: true,
        isStandalone: false,
      }),
    ).toBe("hidden");
  });
});

describe("shouldShowPushValuePrompt", () => {
  it("shows only for default permission when configured and not dismissed", () => {
    expect(
      shouldShowPushValuePrompt({
        permission: "default",
        configured: true,
        dismissedThisSession: false,
        isIos: false,
        isStandalone: false,
      }),
    ).toBe(true);
  });

  it("never shows when denied", () => {
    expect(
      shouldShowPushValuePrompt({
        permission: "denied",
        configured: true,
        dismissedThisSession: false,
        isIos: false,
        isStandalone: false,
      }),
    ).toBe(false);
  });

  it("respects session dismissal", () => {
    expect(
      shouldShowPushValuePrompt({
        permission: "default",
        configured: true,
        dismissedThisSession: true,
        isIos: false,
        isStandalone: false,
      }),
    ).toBe(false);
  });

  it("hides on iOS non-standalone", () => {
    expect(
      shouldShowPushValuePrompt({
        permission: "default",
        configured: true,
        dismissedThisSession: false,
        isIos: true,
        isStandalone: false,
      }),
    ).toBe(false);
  });
});

describe("platform helpers", () => {
  it("detects iOS user agents", () => {
    expect(isIosUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
    expect(isIosUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120")).toBe(false);
  });

  it("detects standalone display mode", () => {
    expect(isStandaloneMode({ standaloneMedia: true, navigatorStandalone: false })).toBe(true);
    expect(isStandaloneMode({ standaloneMedia: false, navigatorStandalone: true })).toBe(true);
    expect(isStandaloneMode({ standaloneMedia: false, navigatorStandalone: undefined })).toBe(false);
  });

  it("classifies common browsers without wild guessing", () => {
    expect(detectBrowserFamily("Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36")).toBe("chrome");
    expect(detectBrowserFamily("Mozilla/5.0 Edg/120.0.0.0")).toBe("edge");
    expect(detectBrowserFamily("Mozilla/5.0 Firefox/121.0")).toBe("firefox");
    expect(
      detectBrowserFamily(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      ),
    ).toBe("safari");
    expect(detectBrowserFamily("SomeRareBrowser/1.0")).toBe("generic");
  });
});
