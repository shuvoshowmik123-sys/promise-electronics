import { describe, expect, it, vi } from "vitest";
import { insertServiceRequestSchema } from "../shared/schema.js";
import {
  clearLegacyProfileSkip,
  createProfileDismissHandler,
  PROFILE_SKIP_STORAGE_KEY,
  shouldShowProfileCompletion,
} from "../client/src/lib/profile-completion-dismiss.js";
import {
  canUseSavedContactSummary,
  validateRepairContactFields,
} from "../client/src/lib/repair-request-contact.js";
import { gpsStateAfterRead } from "../client/src/lib/gps-retry-state.js";

/**
 * FIX-DR16-DR17-HOTFIX-1 regression coverage.
 *
 * H7/H8 — profile dismiss + in-memory skip (exported pure helpers used by the modal/layout).
 * H9  — authenticated phone-null contact validation (repair-request uses this on step 3 + submit).
 * H10 — insertServiceRequestSchema rejects empty/whitespace phone.
 * H11 — GPS read outcome: denied + success → ready.
 */

describe("H7 — profile modal dismiss invokes skip (not a no-op trap)", () => {
  it("calls onSkip when Dialog reports closed (nextOpen=false)", () => {
    const onSkip = vi.fn();
    const handler = createProfileDismissHandler(onSkip);
    handler(false);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("does not call onSkip when Dialog stays open", () => {
    const onSkip = vi.fn();
    createProfileDismissHandler(onSkip)(true);
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("is safe when onSkip is omitted", () => {
    expect(() => createProfileDismissHandler()(false)).not.toThrow();
  });
});

describe("H8 — profile skip is in-memory only (reload re-prompts)", () => {
  it("clears legacy sessionStorage skip key so storage cannot suppress the prompt", () => {
    const store = new Map<string, string>();
    const storage = {
      removeItem: (key: string) => {
        store.delete(key);
      },
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      getItem: (key: string) => store.get(key) ?? null,
    };
    storage.setItem(PROFILE_SKIP_STORAGE_KEY, "1");
    clearLegacyProfileSkip(storage);
    expect(storage.getItem(PROFILE_SKIP_STORAGE_KEY)).toBeNull();
  });

  it("hides the modal only while the in-memory flag is true", () => {
    expect(
      shouldShowProfileCompletion({
        isAuthenticated: true,
        needsProfileCompletion: true,
        profileSkippedInMemory: true,
      }),
    ).toBe(false);
  });

  it("re-prompts on a fresh mount (in-memory skip defaults to false)", () => {
    // Fresh React mount: useState(false) → profileSkippedInMemory is false.
    expect(
      shouldShowProfileCompletion({
        isAuthenticated: true,
        needsProfileCompletion: true,
        profileSkippedInMemory: false,
      }),
    ).toBe(true);
  });

  it("does not prompt when the profile already has a phone", () => {
    expect(
      shouldShowProfileCompletion({
        isAuthenticated: true,
        needsProfileCompletion: false,
        profileSkippedInMemory: false,
      }),
    ).toBe(false);
  });
});

describe("H9 — phone required for authenticated users without a phone", () => {
  it("blocks empty phone even when the caller is authenticated (auth is not a proxy for phone)", () => {
    const r = validateRepairContactFields({ customerName: "Google User", phone: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toContain("Phone Number");
      expect(r.errors.phone).toBe(true);
    }
  });

  it("blocks whitespace-only and too-short phones", () => {
    expect(validateRepairContactFields({ customerName: "A", phone: "   " }).ok).toBe(false);
    expect(validateRepairContactFields({ customerName: "A", phone: "12345" }).ok).toBe(false);
  });

  it("accepts a usable name + local phone", () => {
    expect(validateRepairContactFields({ customerName: "QA User", phone: "01712345678" }).ok).toBe(true);
  });

  it("saved contact summary requires both name and phone", () => {
    expect(canUseSavedContactSummary({ name: "X", phone: null })).toBe(false);
    expect(canUseSavedContactSummary({ name: "X", phone: "" })).toBe(false);
    expect(canUseSavedContactSummary({ name: "X", phone: "01712345678" })).toBe(true);
  });
});

describe("H10 — insertServiceRequestSchema rejects empty phone", () => {
  const base = {
    brand: "Samsung",
    primaryIssue: "No power",
    customerName: "QA Customer",
    phone: "01712345678",
  };

  it("accepts a valid service request payload", () => {
    expect(insertServiceRequestSchema.safeParse(base).success).toBe(true);
  });

  it("rejects phone: empty string", () => {
    const r = insertServiceRequestSchema.safeParse({ ...base, phone: "" });
    expect(r.success).toBe(false);
  });

  it("rejects phone: whitespace-only", () => {
    const r = insertServiceRequestSchema.safeParse({ ...base, phone: "   " });
    expect(r.success).toBe(false);
  });

  it("rejects phone shorter than 10 after trim", () => {
    expect(insertServiceRequestSchema.safeParse({ ...base, phone: "12345" }).success).toBe(false);
  });

  it("also rejects empty brand / primaryIssue / customerName (user-supplied required text)", () => {
    expect(insertServiceRequestSchema.safeParse({ ...base, brand: "" }).success).toBe(false);
    expect(insertServiceRequestSchema.safeParse({ ...base, primaryIssue: "  " }).success).toBe(false);
    expect(insertServiceRequestSchema.safeParse({ ...base, customerName: " " }).success).toBe(false);
  });
});

describe("H11 — GPS retry: denied then successful read → ready", () => {
  it("maps geolocation permission denial to denied", () => {
    expect(gpsStateAfterRead({ ok: false, code: 1 })).toBe("denied");
  });

  it("maps other geolocation failures to error", () => {
    expect(gpsStateAfterRead({ ok: false, code: 2 })).toBe("error");
    expect(gpsStateAfterRead({ ok: false, code: 3 })).toBe("error");
  });

  it("from denied, a successful position read reaches ready", () => {
    const afterDeny = gpsStateAfterRead({ ok: false, code: 1 });
    expect(afterDeny).toBe("denied");
    const afterRetrySuccess = gpsStateAfterRead({ ok: true });
    expect(afterRetrySuccess).toBe("ready");
  });
});
