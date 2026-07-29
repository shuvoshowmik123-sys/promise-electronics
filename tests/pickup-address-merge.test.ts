/**
 * PICKUP-MAP-PIN-01 — pin address merge behaviour.
 *
 * The rule these lock in: a pin must never destroy what the customer typed.
 * OSM reverse geocoding rarely resolves Dhaka house/flat numbers, so the typed
 * portion is usually the better data.
 */
import { describe, expect, it } from "vitest";
import { mergePinAddress } from "../client/src/lib/pickup-address";

const DHANMONDI = "Road 7, Dhanmondi, Dhaka, Bangladesh";
const GULSHAN = "Road 12, Gulshan, Dhaka, Bangladesh";
const TYPED = "House 42, Flat 3B";

describe("mergePinAddress", () => {
  it("fills an empty box with the pin address", () => {
    expect(mergePinAddress("", DHANMONDI, null)).toBe(DHANMONDI);
  });

  it("treats a whitespace-only box as empty", () => {
    expect(mergePinAddress("   \n  ", DHANMONDI, null)).toBe(DHANMONDI);
  });

  it("keeps typed text and appends the pin address below it", () => {
    expect(mergePinAddress(TYPED, DHANMONDI, null)).toBe(`${TYPED}\n${DHANMONDI}`);
  });

  it("never discards the typed house/flat number", () => {
    const result = mergePinAddress(TYPED, DHANMONDI, null);
    expect(result).toContain("House 42, Flat 3B");
  });

  it("does not duplicate when the same spot is confirmed twice", () => {
    const once = mergePinAddress(TYPED, DHANMONDI, null);
    const twice = mergePinAddress(once, DHANMONDI, DHANMONDI);
    expect(twice).toBe(once);
  });

  it("replaces the previous pin line when re-pinned elsewhere", () => {
    const once = mergePinAddress(TYPED, DHANMONDI, null);
    const moved = mergePinAddress(once, GULSHAN, DHANMONDI);
    expect(moved).toBe(`${TYPED}\n${GULSHAN}`);
    expect(moved).not.toContain("Dhanmondi");
  });

  it("does not stack addresses across repeated re-pins", () => {
    let value = mergePinAddress(TYPED, DHANMONDI, null);
    value = mergePinAddress(value, GULSHAN, DHANMONDI);
    value = mergePinAddress(value, DHANMONDI, GULSHAN);
    expect(value.split("\n")).toHaveLength(2);
    expect(value).toBe(`${TYPED}\n${DHANMONDI}`);
  });

  it("leaves unrelated typed lines untouched when replacing a pin line", () => {
    const typedMultiline = "House 42, Flat 3B\nNear the mosque";
    const once = mergePinAddress(typedMultiline, DHANMONDI, null);
    const moved = mergePinAddress(once, GULSHAN, DHANMONDI);
    expect(moved).toBe(`${typedMultiline}\n${GULSHAN}`);
    expect(moved).toContain("Near the mosque");
  });
});
