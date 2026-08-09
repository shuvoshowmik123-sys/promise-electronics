/**
 * The homepage and the service wizard must offer the same brands and sizes.
 *
 * The simulator hands its answers to the wizard on the URL, and the wizard
 * selects by exact string. Any list the two do not share is a value that can
 * be chosen on one screen and silently dropped on the next.
 *
 * This had already happened: the wizard's sizes were a hardcoded array ending
 * "75 inch" while the homepage read Settings and fell back to "75 inch+", so a
 * customer who picked the largest size lost it in the handoff and was asked
 * again.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formatScreenSize,
  DEFAULT_TV_BRANDS,
  DEFAULT_TV_SIZES,
  readTvBrands,
  readTvSizes,
} from "../shared/tv-options.js";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/**
 * Every screen that offers a brand or a size. Checking only two of them is how
 * the last fix looked complete while three more copies were still live.
 */
const SCREENS: [string, string][] = [
  ["homepage", "client/src/pages/home.tsx"],
  ["mobile wizard", "client/src/components/mobile/MobileServiceWizard.tsx"],
  ["desktop repair form", "client/src/pages/repair-request.tsx"],
  ["get a quote", "client/src/pages/get-quote.tsx"],
  ["admin job tickets", "client/src/pages/admin/bento/tabs/JobTicketsTab.tsx"],
];
const HOME = read("client/src/pages/home.tsx");
const WIZARD = read("client/src/components/mobile/MobileServiceWizard.tsx");

describe("a screen size reads correctly wherever it is shown", () => {
  /**
   * Sizes are stored as Settings holds them — "55 inch", "75 inch+" — but five
   * admin screens rendered `${screenSize}"`, which assumed a bare number and
   * printed 55 inch" and 75 inch+". The stray quote only became visible once
   * sizes flowed end to end from the homepage into the ticket.
   */
  it("never doubles the inch mark", () => {
    expect(formatScreenSize("55 inch")).toBe("55 inch");
    expect(formatScreenSize("75 inch+")).toBe("75 inch+");
    expect(formatScreenSize('55"')).toBe('55"');
  });

  it("still adds it to a bare number", () => {
    expect(formatScreenSize("55")).toBe('55"');
    expect(formatScreenSize(55)).toBe('55"');
  });

  it("shows nothing rather than a lone quote mark", () => {
    for (const empty of ["", "   ", null, undefined]) {
      expect(formatScreenSize(empty), String(empty)).toBe("");
    }
  });

  it("no screen appends the mark by hand any more", () => {
    for (const [name, path] of SCREENS) {
      expect(read(path), `${name} still appends a quote to a size`).not.toMatch(/screenSize\}"/);
    }
  });
});

describe("brand and size are defined in one place", () => {
  it("both screens read through the shared readers", () => {
    for (const src of [HOME, WIZARD]) {
      expect(src).toMatch(/readTvBrands\(/);
      expect(src).toMatch(/readTvSizes\(/);
    }
  });

  it("no screen anywhere keeps its own copy of the lists", () => {
    /**
     * There were four spellings of the size list in the codebase at once:
     * the shared one ending "75 inch+", two ending "75 inch", and get-quote
     * with a capital I — "24 Inch". Every one of those is a value a customer
     * can choose on one screen and have silently dropped on the next, because
     * all of them select by exact string.
     */
    for (const [name, path] of SCREENS) {
      const src = read(path);
      expect(src, `${name} still hardcodes a size list`).not.toMatch(/\["24 [Ii]nch",\s*"32 [Ii]nch"/);
      expect(src, `${name} still hardcodes a brand list`).not.toMatch(/\["Sony",\s*"Samsung",\s*"LG"/);
      expect(src, `${name} still reads tv_brands directly`).not.toMatch(/getSettingArray\("tv_brands"/);
      expect(src, `${name} still reads tv_inches directly`).not.toMatch(/getSettingArray\("tv_inches"/);
    }
  });

  it("neither homepage nor wizard keeps its own copy of the lists any more", () => {
    for (const [name, src] of [["home", HOME], ["wizard", WIZARD]] as const) {
      // A literal list of sizes or brands sitting in a screen is the drift.
      expect(src, `${name} still hardcodes sizes`).not.toMatch(/\["24 inch",\s*"32 inch"/);
      expect(src, `${name} still hardcodes brands`).not.toMatch(/\["Samsung",\s*"Sony",\s*"LG"/);
    }
    expect(HOME).not.toContain("CALC_SIZES_DEFAULT");
    expect(HOME).not.toContain("CALC_BRANDS_DEFAULT");
  });

  it("the largest size is one value, not two spellings of one", () => {
    // "75 inch" and "75 inch+" were the actual bug.
    expect(DEFAULT_TV_SIZES.filter((s) => s.startsWith("75"))).toHaveLength(1);
  });

  it("falls back to the shared defaults when Settings is empty", () => {
    expect(readTvBrands([])).toEqual([...DEFAULT_TV_BRANDS]);
    expect(readTvSizes([])).toEqual([...DEFAULT_TV_SIZES]);
  });

  it("prefers Settings, and still reads the older tv_inches key", () => {
    expect(readTvBrands([{ key: "tv_brands", value: '["Walton","Vision"]' }])).toEqual(["Walton", "Vision"]);
    expect(readTvSizes([{ key: "tv_inches", value: '["32 inch"]' }])).toEqual(["32 inch"]);
    // tv_sizes wins over the legacy key when both are present.
    expect(readTvSizes([
      { key: "tv_sizes", value: '["43 inch"]' },
      { key: "tv_inches", value: '["32 inch"]' },
    ])).toEqual(["43 inch"]);
  });

  it("treats an unusable stored value as absent rather than showing nothing", () => {
    // An empty picker is worse than a default one.
    for (const bad of ["", "not json", "{}", "[]"]) {
      expect(readTvSizes([{ key: "tv_sizes", value: bad }]), bad).toEqual([...DEFAULT_TV_SIZES]);
    }
  });
});
