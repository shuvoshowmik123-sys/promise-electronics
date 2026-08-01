/**
 * CUSTOMER-PORTAL-SCROLL-RESTORATION-01A
 *
 * Covers only the DOM-free helpers in client/src/lib/scroll-restoration.ts.
 * The vitest config here runs under environment: 'node' (no jsdom/happy-dom),
 * so the window/history/sessionStorage-dependent hook
 * (client/src/hooks/useScrollRestoration.ts) is NOT unit tested — that
 * behavior is covered by the manual browser QA guide instead.
 */
import { describe, expect, it } from "vitest";
import {
  SCROLL_KEY_STORAGE_PREFIX,
  generateScrollEntryKey,
  parseScrollPosition,
  scrollStorageKey,
} from "../client/src/lib/scroll-restoration";

describe("scrollStorageKey", () => {
  it("namespaces the entry key under the storage prefix", () => {
    expect(scrollStorageKey("abc123")).toBe(`${SCROLL_KEY_STORAGE_PREFIX}abc123`);
  });
});

describe("generateScrollEntryKey", () => {
  it("returns a non-empty string", () => {
    const key = generateScrollEntryKey();
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });

  it("returns a different key on each call", () => {
    const a = generateScrollEntryKey();
    const b = generateScrollEntryKey();
    expect(a).not.toBe(b);
  });
});

describe("parseScrollPosition", () => {
  it("returns 0 for null (no saved position)", () => {
    expect(parseScrollPosition(null)).toBe(0);
  });

  it("returns 0 for a non-numeric string", () => {
    expect(parseScrollPosition("not-a-number")).toBe(0);
  });

  it("returns 0 for a negative value rather than scrolling somewhere invalid", () => {
    expect(parseScrollPosition("-50")).toBe(0);
  });

  it("returns 0 for an empty string", () => {
    expect(parseScrollPosition("")).toBe(0);
  });

  it("parses a valid positive integer", () => {
    expect(parseScrollPosition("842")).toBe(842);
  });

  it("parses a valid positive float by keeping it as-is", () => {
    expect(parseScrollPosition("120.5")).toBe(120.5);
  });

  it("treats 0 as a valid saved position (top of a page)", () => {
    expect(parseScrollPosition("0")).toBe(0);
  });
});
