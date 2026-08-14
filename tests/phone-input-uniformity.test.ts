/**
 * One phone field, one rule, everywhere.
 *
 * Every number in this system is Bangladeshi and every field prints +880 beside
 * the box, so what the customer types is the local part. But people type their
 * number the way it is written on the SIM pack and on every shop sign in the
 * country — 018 12345678 — and that leading zero is a national dialling prefix
 * which is redundant once +880 is already shown.
 *
 * So the zero is removed as it is typed. Not rejected, not warned about:
 * removed, because the customer has written their own number correctly and it
 * is the field's job to understand it.
 *
 * The rule was already implemented once and then re-implemented, differently,
 * on four other screens. The reset page — the one a staff-issued link lands on
 * — asked for "01XXXXXXXXX" with no prefix at all, which invited exactly the
 * zero every other screen removes. These tests exist because a rule that lives
 * in five places is a rule that will disagree with itself again.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { toLocalPhoneDigits, uncontrolledRewrite } from "../client/src/components/ui/phone-input";
import { normalizeLocalPhone, toE164Bd } from "../client/src/lib/phone";
import { normalizePhone } from "../server/utils/phone";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("the leading zero disappears as you type", () => {
    it("takes 018... and keeps 18...", () => {
        // The exact keystrokes: 0, then 1, then 8.
        expect(toLocalPhoneDigits("0")).toBe("");
        expect(toLocalPhoneDigits("01")).toBe("1");
        expect(toLocalPhoneDigits("018")).toBe("18");
        expect(toLocalPhoneDigits("01812345678")).toBe("1812345678");
    });

    it("accepts the number written any way a person writes it", () => {
        for (const written of [
            "01812345678",
            "1812345678",
            "+8801812345678",
            "8801812345678",
            "+880 1812 345678",
            "018-1234-5678",
            "018 12345678",
        ]) {
            expect(toLocalPhoneDigits(written), `${written} was not understood`).toBe("1812345678");
        }
    });

    it("does not eat digits from somebody halfway through typing", () => {
        // "880" typed into an empty box is three digits, not a country code.
        // Erasing them under the cursor would be baffling.
        expect(toLocalPhoneDigits("8")).toBe("8");
        expect(toLocalPhoneDigits("88")).toBe("88");
        expect(toLocalPhoneDigits("880")).toBe("880");
    });

    it("survives a fumbled keypress and a pasted country code", () => {
        expect(toLocalPhoneDigits("0018")).toBe("18");
        // Was the real bug: +880 pasted, country code kept, then cut at ten
        // characters, silently becoming 8801812345 — a number belonging to
        // nobody, which is worse than a rejection because it looks like it
        // worked.
        expect(toLocalPhoneDigits("+8801812345678")).not.toBe("8801812345");
    });

    it("never returns more than the ten local digits", () => {
        expect(toLocalPhoneDigits("018123456789999")).toHaveLength(10);
    });
});

describe("a field nobody is holding state for still cleans itself", () => {
    /**
     * The bug QA found, and the hole in the test above it.
     *
     * login.tsx and support.tsx render <PhoneInput name="phone" /> and read the
     * value with FormData on submit. They pass no value and no onChange, so the
     * cleaned digits were computed, handed to an onChange that did not exist,
     * and discarded. 018... stayed 018... — eleven digits — and sign-in refused
     * it for being the wrong length.
     *
     * The test that was supposed to catch this asserted the file CONTAINED the
     * string "PhoneInput". It proved the import and nothing else, which is
     * exactly the kind of test that reads green while the screen is broken.
     */
    it("rewrites the box when nothing else will", () => {
        expect(uncontrolledRewrite("01812345678", { isControlled: false })).toBe("1812345678");
        expect(uncontrolledRewrite("+8801812345678", { isControlled: false })).toBe("1812345678");
        expect(uncontrolledRewrite("018", { isControlled: false })).toBe("18");
    });

    it("leaves a controlled field alone, because its owner re-renders it", () => {
        expect(uncontrolledRewrite("01812345678", { isControlled: true })).toBeNull();
    });

    it("does not touch the caret on keystrokes that change nothing", () => {
        // Returning a value here would move the cursor to the end mid-edit.
        expect(uncontrolledRewrite("1812345678", { isControlled: false })).toBeNull();
        expect(uncontrolledRewrite("", { isControlled: false })).toBeNull();
        expect(uncontrolledRewrite("880", { isControlled: false })).toBeNull();
    });
});

describe("the browser, the server and the database agree", () => {
    it("all three reduce a number to the same thing", () => {
        for (const written of ["01812345678", "+8801812345678", "8801812345678", "1812345678"]) {
            const field = toLocalPhoneDigits(written);
            const client = normalizeLocalPhone(written);
            const server = normalizePhone(written);
            expect(field, `field disagrees for ${written}`).toBe("1812345678");
            expect(client, `client helper disagrees for ${written}`).toBe("1812345678");
            expect(server, `server disagrees for ${written}`).toBe("1812345678");
        }
    });

    it("puts the country code back exactly once", () => {
        expect(toE164Bd(toLocalPhoneDigits("01812345678"))).toBe("+8801812345678");
        // Idempotent: running a stored number back through must not grow it.
        expect(toE164Bd(toE164Bd("01812345678"))).toBe("+8801812345678");
    });
});

describe("every screen uses the one field", () => {
    /** Customer-facing screens where a phone number is entered. */
    const SCREENS = [
        "client/src/pages/login.tsx",
        "client/src/pages/reset.tsx",
        "client/src/pages/checkout.tsx",
        "client/src/pages/repair-request.tsx",
        "client/src/pages/get-quote.tsx",
        "client/src/pages/support.tsx",
        "client/src/components/auth/CustomerAuthModal.tsx",
        "client/src/components/auth/ProfileCompletionModal.tsx",
        "client/src/components/customer/AccountSetupPanel.tsx",
        "client/src/components/mobile/MobileServiceWizard.tsx",
    ];

    it.each(SCREENS)("%s uses PhoneInput", (screen) => {
        expect(read(screen)).toContain("PhoneInput");
    });

    it.each(SCREENS)("%s does not ask for the leading zero", (screen) => {
        // "01XXXXXXXXX" as a placeholder tells the customer to type the zero
        // that every field then removes. It is the shop contradicting itself
        // on its own screen.
        expect(read(screen)).not.toContain("01XXXXXXXXX");
    });

    it("nobody hand-rolls the prefix beside their own input", () => {
        // Two screens drew their own "+880" next to a plain input, which is how
        // the rule drifted in the first place.
        for (const screen of SCREENS) {
            const source = read(screen);
            const handRolled = /<span[^>]*>\s*\+880\s*<\/span>/.test(source);
            expect(handRolled, `${screen} draws its own +880`).toBe(false);
        }
    });
});

describe("the rule lives in one place on the server too", () => {
    it("has no rival normaliser that keeps the zero", () => {
        /**
         * shared/validators.ts declared a different canonical form —
         * "01XXXXXXXXX", zero included — and an isValidBDPhone that REQUIRED
         * the zero. Nothing imported it, so it was never wrong in production,
         * but it contradicted users.phone_normalized and would have rejected
         * every correctly-stored number the day somebody used it.
         */
        expect(existsSync(join(ROOT, "shared/validators.ts"))).toBe(false);
    });

    it("routes the copies through server/utils/phone.ts", () => {
        for (const file of [
            "server/services/customer.service.ts",
            "server/services/canonical-customer.service.ts",
            "server/routes/mobile.routes.ts",
        ]) {
            expect(read(file), `${file} still normalises phones by hand`).toMatch(/utils\/phone\.js/);
        }
    });

    it("keeps the shape the database indexes", () => {
        // users.phone_normalized is the last ten digits with no prefix, and the
        // login lookup resolves against it. Any drift here is a customer who
        // cannot sign in.
        expect(normalizePhone("+8801812345678")).toBe("1812345678");
        expect(normalizePhone("01812345678")).toBe("1812345678");
        expect(normalizePhone("")).toBeNull();
    });
});
