import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    isLegacySseEvent,
    tagsForLegacyEvent,
    LEGACY_EVENT_TYPES,
} from "../client/src/lib/legacy-sse-bridge";

/**
 * Legacy SSE events used to reach the browser and do nothing.
 *
 * notifyAdminUpdate publishes `{ type, data, createdAt }`. AdminSSEContext's
 * handler ended after the isAdminRealtimeEvent branch with no fallback, and
 * that guard requires `channel: "admin"` plus an `invalidate` array — which a
 * legacy payload never has. So the event arrived, was parsed, and fell off the
 * end of the chain. Saving an order or accepting a quote still needed a manual
 * refresh, while the infrastructure looked correctly wired.
 *
 * The bridge translates those payloads into query tags on the client, which
 * fixes every legacy publisher without a server deploy and without touching the
 * nine route files that emit them.
 */

const CONTEXT = readFileSync(
    join(process.cwd(), "client/src/contexts/AdminSSEContext.tsx"),
    "utf8",
);

describe("legacy event recognition", () => {
    it("recognises the types the server actually publishes", () => {
        // Verified against notifyAdminUpdate call sites in the server.
        for (const type of [
            "order_created", "order_updated", "order_accepted", "order_declined",
            "quote_request_created", "quote_accepted", "quote_declined", "quote_converted",
            "pickup_created", "pickup_updated", "cod_collected",
            "customer_created", "customer_payment_submitted",
            "corporate_message", "corporate_notification",
        ]) {
            expect(isLegacySseEvent({ type }), type).toBe(true);
            expect(tagsForLegacyEvent({ type }).length, type).toBeGreaterThan(0);
        }
    });

    it("ignores control frames so they keep their existing handlers", () => {
        // These are matched earlier in the chain and must not be re-handled.
        for (const type of ["connected", "force_logout", "force_refresh_user", "smart_sync_needed"]) {
            expect(isLegacySseEvent({ type }), type).toBe(false);
        }
    });

    it("NEVER claims a structured event", () => {
        // Structured events are matched first. If the bridge also claimed them
        // the same change would invalidate twice — once immediately and once
        // through the summary flush.
        const structured = {
            id: "abc",
            channel: "admin",
            topic: "job_ticket",
            action: "updated",
            type: "order_created",          // deliberately collides with a legacy key
            invalidate: ["jobTickets"],
        };
        expect(isLegacySseEvent(structured)).toBe(false);
    });

    it("rejects malformed payloads instead of throwing", () => {
        for (const bad of [null, undefined, 42, "order_created", {}, { type: 123 }, { type: "unknown_event" }]) {
            expect(isLegacySseEvent(bad)).toBe(false);
        }
    });

    it("returns no tags for an unmapped type", () => {
        expect(tagsForLegacyEvent({ type: "nothing_maps_to_this" })).toEqual([]);
    });
});

describe("tag choices stay cheap", () => {
    it("keeps dashboardStats off high-frequency events", () => {
        /**
         * dashboardStats is mounted for most admins at once, so attaching it to
         * a frequent event turns one mutation into a refetch on every open
         * screen. It belongs only where a counter genuinely moves.
         */
        for (const type of ["order_updated", "pickup_updated", "quote_accepted", "corporate_message"]) {
            expect(tagsForLegacyEvent({ type }), type).not.toContain("dashboardStats");
        }
    });

    it("no event fans out to an unreasonable number of queries", () => {
        for (const type of LEGACY_EVENT_TYPES) {
            expect(tagsForLegacyEvent({ type }).length, type).toBeLessThanOrEqual(4);
        }
    });
});

describe("wiring into the SSE handler", () => {
    it("runs AFTER the structured branch, as a fallback", () => {
        const structuredIdx = CONTEXT.indexOf("isAdminRealtimeEvent(data)");
        const legacyIdx = CONTEXT.indexOf("isLegacySseEvent(data)");
        expect(structuredIdx).toBeGreaterThan(0);
        expect(legacyIdx).toBeGreaterThan(structuredIdx);
    });

    it("the branch is live, not short-circuited", () => {
        /**
         * Substring checks alone are not enough here: `false && isLegacySseEvent(data)`
         * still contains `isLegacySseEvent(data)`, so a disabled branch would
         * satisfy every other assertion in this block. Anchoring on the exact
         * condition is what makes these tests load-bearing — verified by
         * disabling the branch and watching this fail.
         */
        expect(CONTEXT).toMatch(/else if \(isLegacySseEvent\(data\)\) \{/);
        expect(CONTEXT).not.toMatch(/&&\s*isLegacySseEvent\(data\)/);
        expect(CONTEXT).not.toMatch(/isLegacySseEvent\(data\)\s*&&\s*false/);
    });

    it("coalesces through the existing summary flush, never immediate", () => {
        // A burst of ten legacy mutations must cost one refetch, not ten.
        const branch = CONTEXT.slice(CONTEXT.indexOf("isLegacySseEvent(data)"));
        expect(branch).toContain("pendingSummaryInvalidationsRef");
        expect(branch).toContain("scheduleSummaryFlush(800)");
    });

    it("does not refetch while the tab is hidden", () => {
        const branch = CONTEXT.slice(CONTEXT.indexOf("isLegacySseEvent(data)"));
        expect(branch).toContain("!document.hidden");
    });
});
