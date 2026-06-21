import { describe, expect, it } from "vitest";
import en from "../client/src/locales/en.json";
import bn from "../client/src/locales/bn.json";
import {
    makeGuidedDemoProgressKey,
    markGuidedDemoLessonComplete,
    parseGuidedDemoProgress,
    serializeGuidedDemoProgress,
} from "../client/src/pages/admin/bento/tabs/guided-demo-progress.js";

describe("guided demo progress", () => {
    it("builds stable role lesson keys", () => {
        expect(makeGuidedDemoProgressKey("technician", "first_job")).toBe("technician.first_job");
        expect(makeGuidedDemoProgressKey("cashier", "hold_to_agree")).toBe("cashier.hold_to_agree");
    });

    it("parses stored progress defensively", () => {
        expect(Array.from(parseGuidedDemoProgress(null))).toEqual([]);
        expect(Array.from(parseGuidedDemoProgress("not-json"))).toEqual([]);
        expect(Array.from(parseGuidedDemoProgress(JSON.stringify({ bad: true })))).toEqual([]);
        expect(Array.from(parseGuidedDemoProgress(JSON.stringify(["manager.assign_job", 12, null, "driver.first_route"])))).toEqual([
            "manager.assign_job",
            "driver.first_route",
        ]);
    });

    it("marks lesson completion without duplicating existing progress", () => {
        const progress = parseGuidedDemoProgress(JSON.stringify(["technician.first_job"]));
        const next = markGuidedDemoLessonComplete(progress, "technician", "first_job");
        const finalProgress = markGuidedDemoLessonComplete(next, "driver", "pickup_proof");

        expect(Array.from(finalProgress)).toEqual(["technician.first_job", "driver.pickup_proof"]);
        expect(Array.from(progress)).toEqual(["technician.first_job"]);
    });

    it("serializes progress for localStorage", () => {
        const progress = new Set(["cashier.review_cart", "manager.check_finance"]);
        expect(serializeGuidedDemoProgress(progress)).toBe(JSON.stringify(["cashier.review_cart", "manager.check_finance"]));
    });

    it("keeps required bilingual progress labels available", () => {
        expect(en.guided_demo.progress).toBe("Progress");
        expect(en.guided_demo.completed).toBe("Completed");
        expect(bn.guided_demo.progress).toBe("অগ্রগতি");
        expect(bn.guided_demo.completed).toBe("সম্পন্ন");
    });
});
