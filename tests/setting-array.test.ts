import { describe, expect, it } from "vitest";
import { resolveSettingArray } from "../client/src/lib/setting-array";

/**
 * The case that took down the desktop repair form: an emptied catalog is
 * stored as the JSON string "[]", which is truthy, so a `if (setting?.value)`
 * guard parsed it to [] and never reached the fallback. With
 * service_categories empty in production the required "Primary Issue" dropdown
 * rendered zero options and the form could not be submitted at all.
 */

const FALLBACK = ["No Power", "No Display"];

describe("resolveSettingArray", () => {
    it("returns the stored catalog when it has entries", () => {
        const settings = [{ key: "common_symptoms", value: '["No picture","V-line"]' }];
        expect(resolveSettingArray(settings, "common_symptoms", FALLBACK)).toEqual([
            "No picture",
            "V-line",
        ]);
    });

    it("falls back when the stored catalog is an empty array", () => {
        // The production failure, exactly: value is "[]", not null.
        const settings = [{ key: "service_categories", value: "[]" }];
        expect(resolveSettingArray(settings, "service_categories", FALLBACK)).toEqual(FALLBACK);
    });

    it("falls back when the key is absent", () => {
        expect(resolveSettingArray([], "service_categories", FALLBACK)).toEqual(FALLBACK);
    });

    it("falls back when the value is null", () => {
        const settings = [{ key: "service_categories", value: null }];
        expect(resolveSettingArray(settings, "service_categories", FALLBACK)).toEqual(FALLBACK);
    });

    it("falls back on malformed JSON rather than throwing", () => {
        const settings = [{ key: "service_categories", value: "not json" }];
        expect(resolveSettingArray(settings, "service_categories", FALLBACK)).toEqual(FALLBACK);
    });

    it("falls back when the stored value is not an array", () => {
        const settings = [{ key: "service_categories", value: '{"a":1}' }];
        expect(resolveSettingArray(settings, "service_categories", FALLBACK)).toEqual(FALLBACK);
    });

    it("drops blank entries, which Radix Select rejects as item values", () => {
        const settings = [{ key: "common_symptoms", value: '["No picture","","  ","No sound"]' }];
        expect(resolveSettingArray(settings, "common_symptoms", FALLBACK)).toEqual([
            "No picture",
            "No sound",
        ]);
    });

    it("falls back when every entry is blank", () => {
        const settings = [{ key: "common_symptoms", value: '["","   "]' }];
        expect(resolveSettingArray(settings, "common_symptoms", FALLBACK)).toEqual(FALLBACK);
    });
});
