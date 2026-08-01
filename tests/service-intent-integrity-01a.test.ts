/**
 * CUSTOMER-SERVICE-INTENT-INTEGRITY-AND-MAP-NOTICE-HOTFIX-01A
 *
 * Pure-helper unit tests. No database, no jsdom, no Testing Library.
 *
 * Tests 1-5: isSelectableCustomerService predicate (inventory_items contract)
 * Tests 6-8: resolveDesktopServiceId (desktop payload resolver)
 * Tests 9-12: areaNoticeReducer (notice lifecycle)
 */
import { describe, expect, it } from "vitest";
import { resolveDesktopServiceId, NOT_SURE_SERVICE } from "../client/src/lib/service-constants";
import { areaNoticeReducer, AREA_NOTICE_INITIAL } from "../client/src/lib/area-notice";
import { isSelectableCustomerService } from "../server/utils/service-visibility";

const baseService = { id: "svc_test", itemType: "service", showOnWebsite: true };

describe("Inventory customer-service contract", () => {
    it("1. serviceId null is accepted (resolves to null — not a rejection)", () => {
        // null serviceId bypasses isSelectable entirely; this test proves
        // the helper returns null for null input (the resolver, not the predicate).
        const result = resolveDesktopServiceId([], null as unknown as string);
        expect(result).toBeNull();
    });

    it("2. public active inventory service selectable with no service_catalog row", () => {
        // The predicate does NOT query service_catalog — only inventory_items fields.
        expect(isSelectableCustomerService(baseService)).toBe(true);
    });

    it("3. show_on_website=false service is rejected", () => {
        expect(isSelectableCustomerService({ ...baseService, showOnWebsite: false })).toBe(false);
    });

    it("4. non-service item_type is rejected", () => {
        expect(isSelectableCustomerService({ ...baseService, itemType: "product" })).toBe(false);
    });

    it("5. unknown ID (null item) is rejected", () => {
        expect(isSelectableCustomerService(null)).toBe(false);
        expect(isSelectableCustomerService(undefined)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Desktop payload resolver
// ---------------------------------------------------------------------------
const catalogServices = [
    { id: "svc_panel", name: "Panel Repair" },
    { id: "svc_power", name: "Power Board Fix" },
];

describe("resolveDesktopServiceId", () => {
    it("6. Not sure → null", () => {
        expect(resolveDesktopServiceId(catalogServices, NOT_SURE_SERVICE)).toBeNull();
    });

    it("7. explicit selection → exact inventory ID", () => {
        expect(resolveDesktopServiceId(catalogServices, "svc_power")).toBe("svc_power");
    });

    it("8. unmatched value never substitutes first service", () => {
        expect(resolveDesktopServiceId(catalogServices, "svc_unknown")).toBeNull();
        expect(resolveDesktopServiceId(catalogServices, "")).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Area-error notice lifecycle reducer
// ---------------------------------------------------------------------------
describe("areaNoticeReducer", () => {
    it("9. first area-error opens the notice", () => {
        const next = areaNoticeReducer(AREA_NOTICE_INITIAL, "area-error");
        expect(next).toEqual({ visible: true, hasShown: true });
    });

    it("10. manual dismissal closes it", () => {
        const shown = areaNoticeReducer(AREA_NOTICE_INITIAL, "area-error");
        const dismissed = areaNoticeReducer(shown, "dismiss");
        expect(dismissed.visible).toBe(false);
        expect(dismissed.hasShown).toBe(true);
    });

    it("11. automatic dismissal (same dismiss event) closes it", () => {
        const shown = areaNoticeReducer(AREA_NOTICE_INITIAL, "area-error");
        const autoDismissed = areaNoticeReducer(shown, "dismiss");
        expect(autoDismissed.visible).toBe(false);
    });

    it("12. later errors/retries do not reopen during the same mount", () => {
        const shown = areaNoticeReducer(AREA_NOTICE_INITIAL, "area-error");
        const dismissed = areaNoticeReducer(shown, "dismiss");
        const retry1 = areaNoticeReducer(dismissed, "area-error");
        const retry2 = areaNoticeReducer(retry1, "area-error");
        expect(retry1.visible).toBe(false);
        expect(retry2.visible).toBe(false);
    });
});
