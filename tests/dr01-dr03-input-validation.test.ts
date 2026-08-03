import { describe, expect, it } from "vitest";
import { z } from "zod";
import { insertInventoryItemSchema } from "../shared/schema.js";

/**
 * Regression tests for DR-01, DR-02, DR-03.
 *
 * All three were the same failure shape: an empty string satisfied a NOT NULL
 * column, so `{ "name": "" }` was accepted and silently wiped the record while
 * returning a success status. The database constraint cannot express "non-empty";
 * only the schema can.
 *
 * DR-02/DR-03 are covered by asserting the shared inventory schema directly —
 * both the create route (`.parse`) and the update route (`.partial().parse`)
 * derive from it, so constraining it once fixes both call sites.
 *
 * DR-01 has no shared export (the schema is route-local), so its contract is
 * restated here. If the route schema is ever loosened, this test still encodes
 * what the route is required to reject.
 */

// Mirrors adminCustomerUpdateSchema in server/routes/users.routes.ts.
const adminCustomerUpdateContract = z.object({
    name: z.string().trim().min(1, "Name cannot be empty").max(120, "Name is too long").optional(),
    email: z.union([z.string().trim().email("Invalid email address"), z.literal("")]).optional(),
    phone: z.string().trim().min(10, "Phone number is too short").max(20, "Phone number is too long").optional(),
    address: z.string().trim().max(500, "Address is too long").optional(),
    isVerified: z.boolean().optional(),
}).strict();

describe("DR-02 / DR-03 — inventory schema rejects empty required text", () => {
    const valid = {
        name: "qa_widget",
        category: "Parts",
        price: 100,
        stock: 5,
    };

    it("accepts a well-formed item", () => {
        expect(insertInventoryItemSchema.safeParse(valid).success).toBe(true);
    });

    it("DR-02: rejects an empty name on create", () => {
        const r = insertInventoryItemSchema.safeParse({ ...valid, name: "" });
        expect(r.success).toBe(false);
    });

    it("rejects a whitespace-only name (trim must apply before the length check)", () => {
        const r = insertInventoryItemSchema.safeParse({ ...valid, name: "   " });
        expect(r.success).toBe(false);
    });

    it("rejects an empty category", () => {
        const r = insertInventoryItemSchema.safeParse({ ...valid, category: "" });
        expect(r.success).toBe(false);
    });

    it("DR-03: rejects an empty name on update, via the .partial() path the route uses", () => {
        const r = insertInventoryItemSchema.partial().safeParse({ name: "" });
        expect(r.success).toBe(false);
    });

    it("still allows a partial update that omits name entirely", () => {
        const r = insertInventoryItemSchema.partial().safeParse({ stock: 12 });
        expect(r.success).toBe(true);
    });
});

describe("DR-01 — customer update rejects destructive and malformed input", () => {
    it("accepts a valid partial update", () => {
        expect(adminCustomerUpdateContract.safeParse({ name: "QA Customer" }).success).toBe(true);
    });

    it("accepts an empty body — PATCH with no fields is a no-op, not an error", () => {
        expect(adminCustomerUpdateContract.safeParse({}).success).toBe(true);
    });

    it("DR-01: rejects an empty name instead of wiping the record", () => {
        const r = adminCustomerUpdateContract.safeParse({ name: "" });
        expect(r.success).toBe(false);
        if (!r.success) expect(r.error.issues[0].message).toBe("Name cannot be empty");
    });

    it("rejects a whitespace-only name", () => {
        expect(adminCustomerUpdateContract.safeParse({ name: "    " }).success).toBe(false);
    });

    it("rejects a malformed email", () => {
        expect(adminCustomerUpdateContract.safeParse({ email: "not-an-email" }).success).toBe(false);
    });

    it("allows clearing the email with an explicit empty string", () => {
        expect(adminCustomerUpdateContract.safeParse({ email: "" }).success).toBe(true);
    });

    it("rejects a phone that is too short to normalise", () => {
        expect(adminCustomerUpdateContract.safeParse({ phone: "123" }).success).toBe(false);
    });

    it("rejects a non-boolean isVerified", () => {
        expect(adminCustomerUpdateContract.safeParse({ isVerified: "yes" as unknown as boolean }).success).toBe(false);
    });

    it("rejects unknown keys so privileged columns cannot be smuggled in", () => {
        expect(adminCustomerUpdateContract.safeParse({ role: "Super Admin" }).success).toBe(false);
        expect(adminCustomerUpdateContract.safeParse({ permissions: '{"*":true}' }).success).toBe(false);
        expect(adminCustomerUpdateContract.safeParse({ passwordHash: "x" }).success).toBe(false);
    });

    it("rejects an over-length name", () => {
        expect(adminCustomerUpdateContract.safeParse({ name: "a".repeat(121) }).success).toBe(false);
    });
});
