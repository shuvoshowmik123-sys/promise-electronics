import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Sourced parts remember what happened last time.
 *
 * Parts come two ways. Catalogue parts are stocked, priced and imaged. SOURCED
 * parts are bought ad hoc from whichever local vendor has one that afternoon:
 * no catalogue entry, no stable price, and a warranty negotiated per purchase —
 * six months on one LVDS, three on the next.
 *
 * local_purchases already recorded partName, supplierName, costPrice and
 * sellingPrice. It had simply never been read back, so staff retyped all of it
 * from memory every time, at a counter, with a customer waiting.
 *
 * Two additions close that: a warranty period on the row, and an endpoint that
 * answers "what did I do last time?" from the history already being written.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const SCHEMA = read("shared/schema.ts");
const MIGRATE = read("server/services/main-schema-migrate.service.ts");
const ROUTES = read("server/routes/inventory.routes.ts");

describe("warranty can be recorded where it is decided", () => {
    it("sourced parts carry their own warranty period", () => {
        // The negotiated period cannot live on a catalogue, because a sourced
        // part has no catalogue entry.
        const lp = SCHEMA.slice(
            SCHEMA.indexOf("export const localPurchases"),
            SCHEMA.indexOf("export const insertLocalPurchaseSchema"),
        );
        expect(lp).toContain('warrantyDays: integer("warranty_days")');
    });

    it("catalogue parts and services carry a default period", () => {
        const inv = SCHEMA.slice(
            SCHEMA.indexOf("export const inventoryItems"),
            SCHEMA.indexOf("export const inventorySerials"),
        );
        expect(inv).toContain('warrantyDays: integer("warranty_days")');

        const svc = SCHEMA.slice(
            SCHEMA.indexOf("export const serviceCatalog"),
            SCHEMA.indexOf("export const insertServiceCatalogSchema"),
        );
        expect(svc).toContain('warrantyDays: integer("warranty_days")');
    });

    it("every warranty column is nullable", () => {
        /**
         * NULL means "no distinct warranty here" and callers fall back to the
         * job's service warranty. A NOT NULL default would silently grant a
         * warranty nobody agreed to sell on every historical row.
         */
        for (const line of SCHEMA.split("\n").filter((l) => /warranty_days/.test(l))) {
            if (/default_service_warranty_days/.test(line)) continue; // pre-existing B2B field
            if (/\/\//.test(line) && !/integer\(/.test(line)) continue; // comment lines
            if (!/integer\("warranty_days"\)/.test(line)) continue;
            expect(line, line.trim()).not.toMatch(/notNull\(\)/);
        }
    });

    it("the insert schema does not drop it", () => {
        // createInsertSchema is Drizzle-derived, so a new column flows through
        // automatically — unless someone adds it to the omit list.
        const omit = SCHEMA.slice(
            SCHEMA.indexOf("insertLocalPurchaseSchema = createInsertSchema"),
            SCHEMA.indexOf("export type InsertLocalPurchase"),
        );
        expect(omit).not.toContain("warrantyDays");
    });
});

describe("the migration is safe on a live database", () => {
    it("adds every column additively", () => {
        // Anchor on the migration ENTRY, not the first mention of the id — the
        // id also appears in REQUIRED_MAIN_SCHEMA_VERSION near the top of the
        // file, and slicing from there cuts the body long before the ALTERs.
        const m = MIGRATE.slice(MIGRATE.indexOf('id: "2026_08_06_parts_warranty_separation"'));
        const body = m.slice(0, m.indexOf("];"));
        for (const table of ["inventory_items", "service_catalog", "local_purchases"]) {
            expect(body, table).toMatch(
                new RegExp(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS warranty_days`),
            );
        }
        expect(body).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
        expect(body).not.toMatch(/\bSET\s+NOT\s+NULL\b/i);
    });

    it("indexes the lookup the suggestion endpoint performs", () => {
        // Without this the suggestion is a sequential scan of every purchase
        // ever made, on the hot path of a counter sale.
        // Anchor on the migration ENTRY, not the first mention of the id — the
        // id also appears in REQUIRED_MAIN_SCHEMA_VERSION near the top of the
        // file, and slicing from there cuts the body long before the ALTERs.
        const m = MIGRATE.slice(MIGRATE.indexOf('id: "2026_08_06_parts_warranty_separation"'));
        expect(m).toContain("idx_local_purchases_part_name_lower");
        expect(m).toContain("LOWER(part_name)");
    });
});

describe("the suggestion endpoint", () => {
    it("is registered BEFORE the dynamic /:id route", () => {
        /**
         * The file's own contract: Express matches in registration order, so a
         * named sub-resource registered after GET /:id is swallowed by it.
         */
        const suggestIdx = ROUTES.indexOf("'/api/inventory/local-purchases/suggest'");
        const dynamicIdx = ROUTES.indexOf("'/api/inventory/:id'");
        expect(suggestIdx).toBeGreaterThan(0);
        if (dynamicIdx > 0) expect(suggestIdx).toBeLessThan(dynamicIdx);
    });

    it("returns the MOST RECENT purchase, not an average", () => {
        // Last price paid is the best estimate of the next one. An average
        // across months of a volatile local market is worse than useless.
        const fn = ROUTES.slice(
            ROUTES.indexOf("'/api/inventory/local-purchases/suggest'"),
            ROUTES.indexOf("'/api/inventory/local-purchases/recent-names'"),
        );
        expect(fn).toContain("ORDER BY created_at DESC");
        expect(fn).toContain("LIMIT 1");
        expect(fn).not.toMatch(/\bAVG\s*\(/i);
    });

    it("matches case-insensitively but NOT fuzzily", () => {
        // Suggesting the wrong part's price at a counter is worse than
        // suggesting nothing, because it is silently plausible.
        const fn = ROUTES.slice(
            ROUTES.indexOf("'/api/inventory/local-purchases/suggest'"),
            ROUTES.indexOf("'/api/inventory/local-purchases/recent-names'"),
        );
        expect(fn).toContain("LOWER(part_name) = LOWER(");
        expect(fn).not.toMatch(/\bLIKE\b|\bILIKE\b|similarity\(/i);
    });

    it("degrades to no-suggestion instead of failing the sale", () => {
        const fn = ROUTES.slice(
            ROUTES.indexOf("'/api/inventory/local-purchases/suggest'"),
            ROUTES.indexOf("'/api/inventory/local-purchases/recent-names'"),
        );
        expect(fn).toContain("catch");
        expect(fn).toContain("found: false");
        // Never a 5xx — the form still works when typed by hand.
        expect(fn).not.toMatch(/status\(5\d\d\)/);
    });

    it("is permission-gated like every other inventory read", () => {
        const suggest = ROUTES.slice(ROUTES.indexOf("'/api/inventory/local-purchases/suggest'"), ROUTES.indexOf("'/api/inventory/local-purchases/suggest'") + 200);
        expect(suggest).toContain("requireAdminAuth");
        expect(suggest).toContain("inventory.view");
    });
});
