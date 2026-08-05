import { describe, expect, it } from "vitest";
import { toCustomerSessionView } from "../server/services/customer-session-view";
import { normalizeLocalPhone, samePhone, toE164Bd } from "../client/src/lib/phone";

/**
 * Google login must return the same profile fields as /api/customer/me.
 *
 * It used to return five hand-picked fields — id, name, email, role,
 * profileImageUrl — with no `phone`, while /me returned the whole row minus
 * the password. The client derives
 *
 *     needsProfileCompletion = !!customer && !customer.phone
 *
 * so signing in with Google produced a session that looked like an account
 * with no phone number and demanded completion of a profile that was already
 * complete. Refreshing called /me and the warning vanished, which made a
 * structural bug look intermittent.
 */

const DB_USER = {
    id: "user-1",
    username: "+8801712345678",
    name: "Test Customer",
    email: "test@example.com",
    phone: "+8801712345678",
    phoneNormalized: "1712345678",
    password: "$2a$12$hashedhashedhashedhashed",
    role: "Customer",
    status: "Active",
    address: "116, Hossain Tower, Naya Paltan",
    profileImageUrl: "https://example.com/a.png",
    googleSub: "google-sub-123",
    firebaseUid: "firebase-uid-123",
    customerAccountState: "active",
} as any;

describe("toCustomerSessionView", () => {
    const view = toCustomerSessionView(DB_USER) as Record<string, unknown>;

    it("includes the fields the client needs to avoid a false profile prompt", () => {
        // phone is the one that mattered: its absence drove needsProfileCompletion.
        expect(view.phone).toBe("+8801712345678");
        expect(view.address).toBe("116, Hossain Tower, Naya Paltan");
        expect(view.name).toBe("Test Customer");
        expect(view.id).toBe("user-1");
        expect(view.role).toBe("Customer");
    });

    it("never leaks the password hash", () => {
        expect(view).not.toHaveProperty("password");
    });

    it("never leaks credential-linkage identifiers", () => {
        expect(view).not.toHaveProperty("firebaseUid");
        expect(view).not.toHaveProperty("googleSub");
    });

    it("produces an identical shape whatever endpoint called it", () => {
        // The regression guard: every session endpoint routes through this one
        // function, so Google login and /me cannot describe the same account
        // differently.
        const fromGoogleLogin = toCustomerSessionView(DB_USER);
        const fromMe = toCustomerSessionView(DB_USER);
        expect(Object.keys(fromGoogleLogin).sort()).toEqual(Object.keys(fromMe).sort());
        expect(fromGoogleLogin).toEqual(fromMe);
    });

    it("does not mutate the row it was given", () => {
        const row = { ...DB_USER };
        toCustomerSessionView(row as any);
        expect(row.password).toBe(DB_USER.password);
        expect(row.firebaseUid).toBe(DB_USER.firebaseUid);
    });
});

/**
 * The desktop repair form kept its phone input stripped of the country code and
 * compared it directly against the stored "+880..." value. They were never
 * equal, so every submission counted as a change and rewrote the account phone
 * with the bare local part.
 */
describe("samePhone", () => {
    it("matches the stored +880 form against the stripped input state", () => {
        expect(samePhone("1712345678", "+8801712345678")).toBe(true);
    });

    it.each([
        ["01712345678", "+8801712345678"],
        ["8801712345678", "+8801712345678"],
        ["+880 1712-345678", "01712345678"],
    ])("treats %s and %s as the same number", (a, b) => {
        expect(samePhone(a, b)).toBe(true);
    });

    it("still detects a genuinely different number", () => {
        expect(samePhone("1712345678", "+8801812345678")).toBe(false);
    });

    it("does not call two blanks a match", () => {
        // An absent phone is an absence, not an equality.
        expect(samePhone("", "")).toBe(false);
        expect(samePhone(null, undefined)).toBe(false);
        expect(samePhone("1712345678", null)).toBe(false);
    });
});

describe("normalizeLocalPhone / toE164Bd", () => {
    it("mirrors the server rule of last ten digits without prefix", () => {
        expect(normalizeLocalPhone("+8801712345678")).toBe("1712345678");
        expect(normalizeLocalPhone("01712345678")).toBe("1712345678");
        expect(normalizeLocalPhone("8801712345678")).toBe("1712345678");
    });

    it("canonicalises to the form the rest of the system stores", () => {
        expect(toE164Bd("1712345678")).toBe("+8801712345678");
        expect(toE164Bd("01712345678")).toBe("+8801712345678");
        expect(toE164Bd("")).toBeNull();
    });
});
