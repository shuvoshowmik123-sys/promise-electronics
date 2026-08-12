/**
 * The condition photo taken as a television changes hands.
 *
 * A repair shop holds other people's panels. When a customer says "that crack
 * was not there when I gave it to you", the argument is one person's word
 * against another's, and it is expensive for whichever side is telling the
 * truth. A photograph taken at the doorstep settles it — but only if it is
 * taken on ordinary handovers, and only if the customer sees the same picture
 * at the time rather than having it produced against them weeks later.
 *
 * Before this, a photo existed only on the no-code exception path, where its
 * job is to evidence that a handover happened at all. And it could only be
 * supplied by pasting an image URL — into a phone, at a customer's gate, which
 * is not a thing a driver can do.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SHEET = readFileSync(join(ROOT, "client/src/pages/admin/bento/tabs/pickup/HandoverSheet.tsx"), "utf8");
const CAPTURE = readFileSync(join(ROOT, "client/src/components/admin/PhotoCapture.tsx"), "utf8");
const SR_ROUTES = readFileSync(join(ROOT, "server/routes/service-requests.routes.ts"), "utf8");
const COMPLETION = readFileSync(join(ROOT, "server/services/custody-completion.service.ts"), "utf8");
const CUSTOMER_ROUTES = readFileSync(join(ROOT, "server/routes/customer.routes.ts"), "utf8");
const TRACK = readFileSync(join(ROOT, "client/src/pages/track-order-detail.tsx"), "utf8");

describe("a driver can actually take the photo", () => {
    it("uses the camera, not a box asking for a URL", () => {
        // "Paste image URL from upload" was a required field nobody standing
        // at a gate could fill, which makes it a reason to abandon the path.
        expect(SHEET).not.toContain("Paste image URL");
        expect(SHEET).not.toContain("https://… device + customer photo");
        expect(SHEET).toContain("PhotoCapture");
    });

    it("asks Android for the rear camera directly", () => {
        // Without capture=environment the phone offers the gallery first,
        // which is not what somebody in front of a television wants.
        expect(CAPTURE).toContain('capture="environment"');
        expect(CAPTURE).toContain('accept="image/*"');
    });

    it("shrinks the photo before sending it", () => {
        // A modern phone photograph is several megabytes and the driver is on
        // mobile data at somebody's gate. A handover that waits on an upload
        // gets abandoned.
        expect(CAPTURE).toContain("MAX_EDGE");
        expect(CAPTURE).toContain("toDataURL(\"image/jpeg\"");
    });

    it("says what went wrong in words a driver can act on", () => {
        expect(CAPTURE).toContain("Check the signal and try again");
        expect(CAPTURE).toContain("Photo storage is not set up");
    });
});

describe("the photo rides on an ordinary handover, not only the exception", () => {
    it("is offered on the verified path", () => {
        // The capture on the coded path is the one whose file name carries the
        // handover mode; the other belongs to the no-code fallback.
        expect(SHEET).toContain("fileNamePrefix={`handover-${mode}`}");
        expect(SHEET).toContain("value={conditionPhotoUrl}");
    });

    it("travels with the confirmation", () => {
        expect(SHEET).toContain("proofPhotoUrl: conditionPhotoUrl.trim() || undefined");
        expect(SR_ROUTES).toContain("const conditionPhotoUrl");
        expect(SR_ROUTES).toContain("proofPhotoUrl: conditionPhotoUrl || undefined");
    });

    it("is written to the column that has always existed and never been used", () => {
        expect(COMPLETION).toContain("pickupProofUrl: input.proofPhotoUrl");
    });
});

describe("it never costs the shop a handover", () => {
    it("is optional, so a failed upload cannot strand a driver", () => {
        /**
         * The judgement call. A required photo is stronger evidence and a
         * worse system: a driver at a gate with no signal must still be able
         * to complete a verified handover. Refusing custody over an upload is
         * a worse failure than a missing photograph.
         */
        expect(SHEET).toContain("Condition photo (optional)");
        // No guard anywhere may block confirmation on the photo being present.
        expect(SHEET).not.toMatch(/disabled=\{[^}]*!conditionPhotoUrl/);
        expect(SR_ROUTES).not.toContain("Condition photo is required");
    });

    it("still requires one where it is the only evidence", () => {
        // The no-code path has no customer code, so the photograph is the
        // whole record. That requirement stays.
        expect(SHEET).toContain("Photo proof (required)");
    });
});

describe("the customer sees the same picture the shop holds", () => {
    it("is returned on the customer's own request", () => {
        expect(CUSTOMER_ROUTES).toContain("collection");
        expect(CUSTOMER_ROUTES).toContain("pickup.pickupProofUrl");
    });

    it("never fails the page when there is no photo", () => {
        // A missing photograph must not break the screen the customer came to
        // read; it is extra evidence, not the point of the page.
        const block = CUSTOMER_ROUTES.slice(CUSTOMER_ROUTES.indexOf("let collection"));
        expect(block.slice(0, block.indexOf("res.json"))).toContain("catch");
    });

    it("shows only the photo and the moment, nothing else from the pickup record", () => {
        const block = CUSTOMER_ROUTES.slice(CUSTOMER_ROUTES.indexOf("let collection"));
        const shape = block.slice(0, block.indexOf("res.json"));
        for (const leaked of ["pickupAddress", "assignedStaff", "tierCost", "pickupNotes"]) {
            expect(shape, `${leaked} must not reach the customer`).not.toContain(leaked);
        }
    });

    it("invites the customer to disagree with it", () => {
        // Evidence a customer cannot challenge is not trust, it is a trap.
        expect(TRACK).toContain("Condition when collected");
        expect(TRACK).toContain("Tell us straight away if this does not match");
    });
});
