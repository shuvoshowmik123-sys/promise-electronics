import { describe, expect, it } from "vitest";
import { parseGuidedJobDemoHash } from "../client/src/pages/admin/bento/tabs/jobs/guided-job-demo-route.js";

describe("guided jobs demo route", () => {
    it("activates only for the guided jobs hash", () => {
        expect(parseGuidedJobDemoHash("#jobs?demo=guided&role=technician&lesson=first_job")).toEqual({
            active: true,
            role: "technician",
            lesson: "first_job",
        });

        expect(parseGuidedJobDemoHash("#jobs")).toEqual({
            active: false,
            role: "technician",
            lesson: "first_job",
        });

        expect(parseGuidedJobDemoHash("#workflow-demo?demo=guided")).toEqual({
            active: false,
            role: "technician",
            lesson: "first_job",
        });
    });

    it("keeps stable defaults when optional params are missing", () => {
        expect(parseGuidedJobDemoHash("#jobs?demo=guided")).toEqual({
            active: true,
            role: "technician",
            lesson: "first_job",
        });
    });
});
