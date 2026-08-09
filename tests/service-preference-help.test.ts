/**
 * "Pickup & drop", "Drop-off" and "Call first" are our words, not the
 * customer's, and none of them answers the only question being asked: who
 * physically moves the television, and does it cost anything.
 *
 * The mobile wizard showed the three titles with no explanation at all. The
 * desktop form had explanations, hardcoded in English, so a Bangla reader got
 * nothing there either.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const LANG = read("client/src/contexts/CustomerLanguageContext.tsx");
const WIZARD = read("client/src/components/mobile/MobileServiceWizard.tsx");
const DESKTOP = read("client/src/pages/repair-request.tsx");

const KEYS = ["wizard.pickupDropHelp", "wizard.dropOffHelp", "wizard.callFirstHelp"];

describe("every service option explains itself", () => {
  it("has help text for all three, in both languages", () => {
    for (const key of KEYS) {
      const entry = LANG.slice(LANG.indexOf(`"${key}"`), LANG.indexOf(`"${key}"`) + 420);
      expect(entry, `${key} missing`).toContain("en:");
      expect(entry, `${key} has no Bangla`).toMatch(/[ঀ-৿]/);
    }
  });

  it("says who moves the television", () => {
    // The distinction between the first two options is entirely about who
    // carries it; if the copy does not say that, it has not explained anything.
    const pickup = LANG.slice(LANG.indexOf('"wizard.pickupDropHelp"'), LANG.indexOf('"wizard.pickupDropHelp"') + 420);
    const drop = LANG.slice(LANG.indexOf('"wizard.dropOffHelp"'), LANG.indexOf('"wizard.dropOffHelp"') + 420);
    expect(pickup).toMatch(/we come to your home/i);
    expect(drop).toMatch(/you bring the TV/i);
  });

  it("is honest about the charge, on both options", () => {
    /**
     * Pickup costs extra and drop-off does not. Saying so here is the whole
     * point: a customer who discovers the fee later feels tricked by a form
     * that had the chance to tell them.
     */
    const pickup = LANG.slice(LANG.indexOf('"wizard.pickupDropHelp"'), LANG.indexOf('"wizard.pickupDropHelp"') + 420);
    const drop = LANG.slice(LANG.indexOf('"wizard.dropOffHelp"'), LANG.indexOf('"wizard.dropOffHelp"') + 420);
    expect(pickup).toMatch(/extra charge/i);
    expect(drop).toMatch(/no transport charge/i);
  });

  it("both screens render it, and neither hardcodes English", () => {
    for (const [name, src] of [["mobile", WIZARD], ["desktop", DESKTOP]] as const) {
      expect(src, `${name} does not use the help keys`).toMatch(/wizard\.pickupDropHelp/);
      expect(src, `${name} does not use the help keys`).toMatch(/wizard\.dropOffHelp/);
    }
    // the sentences that used to sit inline in the desktop form
    expect(DESKTOP).not.toContain("We collect your device, repair it, and deliver it back.");
    expect(DESKTOP).not.toContain("You bring the device to our nearest branch.");
  });

  it("the mobile option shows its help under the title", () => {
    expect(WIZARD).toContain("{option.help}");
  });
});
