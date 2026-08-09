/**
 * What the customer told the homepage has to reach the request intact.
 *
 * Being asked the same question twice is the fastest way to make someone
 * believe their first answer went nowhere, and the estimate they were shown is
 * the number they will quote at the counter — so losing it means arguing from
 * memory against a figure still visible on their phone.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  readCarriedAnswers,
  carriedAsSymptomLines,
  hasCarriedAnswers,
  EMPTY_CARRIED,
} from "../client/src/lib/carried-answers.js";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const SIM = read("client/src/components/customer/FaultSimulator.tsx");
const WIZARD = read("client/src/components/mobile/MobileServiceWizard.tsx");
const DESKTOP = read("client/src/pages/repair-request.tsx");
const STRIP = read("client/src/components/customer/CarriedAnswersStrip.tsx");

describe("reading what was carried", () => {
  it("reads the whole answer", () => {
    const c = readCarriedAnswers(
      "?issue=Lines%20on%20Screen&detail=Horizontal%20Lines&brand=Samsung&size=55%20inch&model=UA55AU7700&answer=A%20loose%20bond&est=2500-6000",
    );
    expect(c).toEqual({
      issue: "Lines on Screen", detail: "Horizontal Lines", brand: "Samsung",
      size: "55 inch", model: "UA55AU7700", answer: "A loose bond", estimate: [2500, 6000],
    });
  });

  it("refuses an estimate that was tampered with", () => {
    /**
     * The query string is customer-controlled and this number ends up in front
     * of a customer and in the record staff quote against. A hand-edited URL
     * must not be able to invent a price.
     */
    for (const bad of ["est=0-100", "est=9000-100", "est=abc", "est=-5--1", "est=1-99999999", "est="]) {
      expect(readCarriedAnswers("?" + bad).estimate, bad).toBeNull();
    }
    expect(readCarriedAnswers("?est=500-1500").estimate).toEqual([500, 1500]);
  });

  it("drops absurdly long values rather than storing them", () => {
    expect(readCarriedAnswers("?brand=" + "x".repeat(200)).brand).toBeNull();
    expect(readCarriedAnswers("?brand=%20%20").brand).toBeNull();
  });

  it("knows when nothing was carried", () => {
    expect(hasCarriedAnswers(EMPTY_CARRIED)).toBe(false);
    expect(hasCarriedAnswers(readCarriedAnswers(""))).toBe(false);
    expect(hasCarriedAnswers(readCarriedAnswers("?brand=Sony"))).toBe(true);
  });

  it("writes facts as readable lines, and omits what it does not have", () => {
    const lines = carriedAsSymptomLines(readCarriedAnswers("?detail=Horizontal%20Lines&est=2500-6000"));
    expect(lines).toEqual([
      "Reported on the website: Horizontal Lines",
      "Estimate shown online: ৳2,500 – ৳6,000 (before inspection)",
    ]);
    expect(carriedAsSymptomLines(EMPTY_CARRIED)).toEqual([]);
  });
});

describe("the handoff is wired at both ends", () => {
  it("the simulator sends the answer and the estimate", () => {
    expect(SIM).toMatch(/params\.set\("answer"/);
    expect(SIM).toMatch(/params\.set\("est"/);
  });

  it("both forms store the facts in symptoms, not in the notes box", () => {
    /**
     * description belongs to the customer and can be cleared. Losing the detail
     * line loses the vertical-versus-horizontal distinction, which is the
     * difference between a T-Con repair and a new panel.
     */
    for (const [name, src] of [["mobile", WIZARD], ["desktop", DESKTOP]] as const) {
      expect(src, name).toContain("carriedAsSymptomLines(carried)");
      expect(src, name).toMatch(/symptoms: JSON\.stringify\(\[/);
    }
  });

  it("both forms show the confirm strip", () => {
    for (const [name, src] of [["mobile", WIZARD], ["desktop", DESKTOP]] as const) {
      expect(src, name).toContain("<CarriedAnswersStrip");
      expect(src, name).toContain("hasCarriedAnswers(carried)");
    }
  });

  it("nothing carried is locked against correction", () => {
    // Green and editable, never greyed: a wrong carry-over must be fixable
    // where it sits, not trap the customer with a value they can see is wrong.
    expect(STRIP).not.toMatch(/disabled/);
    expect(STRIP).toMatch(/Change it on the step below/);
  });

  it("the estimate reaches the person typing the quote", () => {
    /**
     * Storing it is not enough. The customer still has that number on their
     * phone, so a quote that departs from it without anyone here knowing it
     * existed is an argument at the counter we lose from memory.
     *
     * Both quote dialogs — the mobile sheet and the desktop one — must show it,
     * and it must never prefill the amount: it was made before anybody saw the
     * television.
     */
    const ADMIN = read("client/src/pages/admin/bento/tabs/ServiceRequestsTab.tsx");
    expect((ADMIN.match(/getShownEstimate\(selectedRequest\.symptoms\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(ADMIN).toMatch(/What the customer was already shown/);
    expect(ADMIN).toMatch(/If your quote differs, say why in the notes/);
    expect(ADMIN).not.toMatch(/setQuoteAmount\(getShownEstimate/);
  });

  it("says the estimate came before any inspection", () => {
    expect(STRIP).toMatch(/before inspection/);
    expect(carriedAsSymptomLines(readCarriedAnswers("?est=500-900"))[0]).toContain("before inspection");
  });
});
