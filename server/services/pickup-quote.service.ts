/**
 * Telling a customer what collection will cost, before they agree to it.
 *
 * `quotePickup` in shared/pickup-pricing.ts has been able to work this out for
 * some time, and until now nothing called it. The fares panel let staff set
 * prices, the portal told customers "an extra charge applies", and the number
 * was never computed or shown anywhere. This is the caller that closes that gap
 * on the customer's side: it gathers the two things the calculator needs — the
 * saved fares and the centre of every rated area — and answers with a fare for
 * one address.
 *
 * It deliberately does NOT bill. Charging happens at the counter against a real
 * job; this only quotes, so the customer sees the price at the moment they
 * choose collection rather than discovering it on collection day.
 */
import { eq } from "drizzle-orm";

import {
    quotePickup,
    type PickupQuote,
    type PickupTier,
} from "../../shared/pickup-pricing.js";
import { serviceAreas, settings } from "../../shared/schema.js";
import { db } from "../db.js";
import { readCanonicalServiceCenterLocation } from "./attendance-location.service.js";

export interface PickupQuoteRequest {
    tier: PickupTier;
    /** Where the television is. Without it only the "anywhere else" fare applies. */
    point?: { lat: number; lng: number } | null;
    /** Low end of the repair estimate, for the free-over-X waiver. */
    repairEstimate?: number | null;
}

/**
 * The centre of every rated circle.
 *
 * Only active areas, and only those with a centre: an area nobody has placed on
 * the map cannot claim an address, and letting it try would mean comparing a
 * distance against a null.
 */
async function loadAreaCentres(): Promise<Record<string, { lat: number; lng: number }>> {
    const rows = await db
        .select({
            id: serviceAreas.id,
            lat: serviceAreas.centroidLatitude,
            lng: serviceAreas.centroidLongitude,
        })
        .from(serviceAreas)
        .where(eq(serviceAreas.isActive, true));

    const centres: Record<string, { lat: number; lng: number }> = {};
    for (const row of rows) {
        if (row.lat == null || row.lng == null) continue;
        centres[row.id] = { lat: Number(row.lat), lng: Number(row.lng) };
    }
    return centres;
}

export async function getPickupQuote(request: PickupQuoteRequest): Promise<PickupQuote> {
    const [settingRows, areaCentres, shop] = await Promise.all([
        db.select({ key: settings.key, value: settings.value }).from(settings),
        loadAreaCentres(),
        readCanonicalServiceCenterLocation(),
    ]);

    /**
     * The shop is where the rings are measured from.
     *
     * Read from the canonical service-centre location rather than a constant so
     * that moving the shop on the map moves the pricing with it. If it has not
     * been placed, no ring can apply and pricing falls back to areas and the
     * "anywhere else" fare — which is the honest result, not a guessed origin.
     */
    const origin =
        shop.latitude != null && shop.longitude != null
            ? { lat: Number(shop.latitude), lng: Number(shop.longitude) }
            : null;

    return quotePickup({
        tier: request.tier,
        point: request.point ?? null,
        areaCentres,
        origin,
        repairEstimate: request.repairEstimate ?? null,
        settings: settingRows,
    });
}
