/**
 * Parts Demand must be granted deliberately, never inherited.
 *
 * This screen holds two things the shop cannot afford to leak: what it is about
 * to buy, and a list of customers waiting to spend money. A competitor would
 * want the first; a departing employee could walk out with the second.
 *
 * So it is its own module rather than a corner of `inventory` — seeing what
 * stock exists and seeing what the shop is about to buy are different levels of
 * trust — and it appears in no role preset, so nobody receives it as a side
 * effect of being made a Manager.
 *
 * The risk this guards against is quiet: somebody adding "partsDemand.view" to
 * a preset months from now to fix a support complaint, and silently handing the
 * customer list to every manager.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PERMISSION_CATALOG } from "../shared/permission-catalog.js";

const CATALOG_SOURCE = readFileSync(
    join(__dirname, "../shared/permission-catalog.ts"),
    "utf8",
);

describe("the parts demand permission module", () => {
    it("exists as its own module, separate from inventory", () => {
        const perms = PERMISSION_CATALOG.filter((p) => p.module === "partsDemand");
        expect(perms.length).toBeGreaterThan(0);
        // Never folded into inventory: stock visibility is a lower bar.
        expect(perms.every((p) => p.module !== "inventory")).toBe(true);
    });

    it("separates viewing from managing", () => {
        const keys = PERMISSION_CATALOG
            .filter((p) => p.module === "partsDemand")
            .map((p) => p.key);
        expect(keys).toContain("partsDemand.view");
        expect(keys).toContain("partsDemand.manage");
    });

    it("marks viewing as high risk, because it exposes customers and strategy", () => {
        const view = PERMISSION_CATALOG.find((p) => p.key === "partsDemand.view");
        expect(view?.risk).toBe("high");
    });

    it("is suggested for Super Admin only", () => {
        for (const p of PERMISSION_CATALOG.filter((x) => x.module === "partsDemand")) {
            expect(p.suggestedRoles).toEqual(["Super Admin"]);
        }
    });

    it("appears in NO role preset — it must be granted by hand", () => {
        /**
         * Asserted against the source rather than an exported constant, because
         * the failure being defended against is somebody quietly adding the key
         * to a preset list. That edit is a source edit, so the source is what
         * has to be watched.
         */
        const presetsStart = CATALOG_SOURCE.indexOf('"Technician Basic"');
        expect(presetsStart, "role presets not found").toBeGreaterThan(-1);
        const presets = CATALOG_SOURCE.slice(presetsStart);
        expect(
            presets.includes("partsDemand"),
            "partsDemand was added to a role preset — it must be granted per person, " +
            "or every holder of that role silently gains the customer waiting list",
        ).toBe(false);
    });
});

describe("the API refuses without it", () => {
    /**
     * Hiding the tab hides a link, not the data. Anyone who knows the URL can
     * still call the endpoint, so the guard has to be on the server.
     */
    const ROUTES = readFileSync(
        join(__dirname, "../server/routes/part-requests.routes.ts"),
        "utf8",
    );

    it("gates both read endpoints on partsDemand.view", () => {
        const reads = ROUTES.split("\n").filter(
            (l) => l.includes('router.get("/api/admin/part-requests'),
        );
        expect(reads.length).toBe(2);
        for (const line of reads) {
            expect(line, `unguarded read route: ${line.trim()}`).toContain("canViewDemand");
        }
    });

    it("gates the write endpoint on partsDemand.manage", () => {
        const write = ROUTES.split("\n").find(
            (l) => l.includes('router.patch("/api/admin/part-requests'),
        );
        expect(write).toBeDefined();
        expect(write).toContain("canManageDemand");
    });

    it("leaves the public request endpoint open", () => {
        // Customers are not logged in. A permission here would close the front
        // door and there would be no demand to read at all.
        const create = ROUTES.split("\n").find(
            (l) => l.includes('router.post("/api/public/part-requests'),
        );
        expect(create).toBeDefined();
        expect(create).not.toContain("requireAdminAuth");
        expect(create).not.toContain("canViewDemand");
    });
});
