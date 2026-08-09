/**
 * A customer who carries their television in must not be told it was delivered.
 *
 * JOB_TO_JOURNEY holds one string per status and knows nothing about how the
 * set arrived, so a walk-in was told "we will arrange delivery" and later
 * "your TV has been delivered". Nobody delivered anything — they were standing
 * in the shop.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const TRANSITION = read("server/services/job-status-transition.service.ts");
const SR_ROUTE = read("server/routes/service-requests.routes.ts");
const WIZARD = read("client/src/components/mobile/MobileServiceWizard.tsx");

describe("the journey speaks the right ending", () => {
  it("has collection wording for the two stages the TV leaves at", () => {
    const block = TRANSITION.slice(TRANSITION.indexOf("const COLLECTION_COPY"));
    expect(block.slice(0, 900)).toMatch(/repair_completed/);
    expect(block.slice(0, 900)).toMatch(/delivered/);
    expect(block).toMatch(/collect your television from our shop/i);
    expect(block).toMatch(/You have collected your television/i);
  });

  it("recognises every spelling of a service-centre booking", () => {
    /**
     * The UI sends servicePreference "service_center" while the API also
     * accepts serviceMode "drop_off". Reading only one of them would leave
     * half the drop-off customers hearing about delivery.
     */
    const fn = TRANSITION.slice(TRANSITION.indexOf("function isDropOffMode"));
    for (const token of ["service_center", "drop_off", "center"]) {
      expect(fn.slice(0, 500), token).toContain(token);
    }
  });

  it("leaves the wording alone when the mode is unknown", () => {
    // A job with no service request should not be told something confidently
    // specific — that would be a guess, not a fix.
    expect(TRANSITION).toMatch(/isDropOffMode\(sr\) \? COLLECTION_COPY\[mapping\.stage\] : undefined/);
  });

  it("only rewrites the ending, not the whole journey", () => {
    // Received, inspected and repairing read the same either way; rewriting
    // them would be churn with no benefit.
    const block = TRANSITION.slice(TRANSITION.indexOf("const COLLECTION_COPY"), TRANSITION.indexOf("export function isCanonicalJobStatus"));
    expect(block).not.toMatch(/repair_in_progress|inspection_started|device_received/);
  });
});

describe("the visit date is asked for, and kept", () => {
  it("the create endpoint actually writes it", () => {
    /**
     * The desktop form has required this for service-centre bookings for a
     * long time and the column exists, but the insert never included it — so
     * every date a customer was made to choose went in the bin, and staff had
     * no idea who to expect.
     */
    expect(SR_ROUTE).toMatch(/scheduledPickupDate: \(validated as any\)\.scheduledPickupDate \?\? null/);
  });

  it("mobile asks for it too, and refuses to continue without it", () => {
    expect(WIZARD).toMatch(/wizard\.visitDate/);
    expect(WIZARD).toMatch(/if \(servicePreference === "service_center"\) return Boolean\(visitDate\)/);
  });

  it("mobile sends it under the same name desktop uses", () => {
    // Two names for one field is how it ends up stored on one path only.
    expect(WIZARD).toMatch(/scheduledPickupDate: servicePreference === "service_center"/);
  });

  it("cannot be a date in the past", () => {
    expect(WIZARD).toMatch(/min=\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}/);
  });
});
