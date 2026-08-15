/**
 * Working out which service area an address belongs to, instead of asking.
 *
 * The customer portal used to put a "Select service area" dropdown in front of
 * the customer. That asks them to translate their own address into the shop's
 * internal partition of Dhaka — a question only staff can answer reliably, and
 * one where every wrong answer is silent.
 *
 * It was also the second answer to a question the system already answered once.
 * `quotePickup` decides the collection fare by finding which rated circle
 * contains the address, so the fare came from the coordinates while
 * `serviceAreaId` — which drives job records, POS billing allocations and
 * revenue-by-area reporting — came from a dropdown. Nothing compared the two.
 * A customer who picked Gulshan from an address in Mirpur was charged the
 * Mirpur fare and booked as Gulshan revenue, and no code path noticed.
 *
 * One derivation, used for both, removes that contradiction by construction
 * rather than by luck.
 *
 * Three ways to place a point, most trustworthy first:
 *
 *   1. Inside a boundary somebody drew. A drawn polygon is an explicit
 *      statement about the map and beats anything inferred.
 *   2. Inside a rated circle. The SAME rule and the same smallest-wins
 *      tie-break `quotePickup` uses — deliberately, so the attributed area and
 *      the charged area cannot diverge.
 *   3. Nearest centre, within a limit, offered as a guess and labelled as one.
 *
 * Confidence travels with the answer because the caller must be able to tell a
 * fact from a guess. A guess is shown to the customer as a changeable
 * suggestion; it is never silently written as though it were certain.
 */
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { eq } from "drizzle-orm";

import { distanceKm, readAreaFares } from "../../shared/pickup-pricing.js";
import { serviceAreas, settings } from "../../shared/schema.js";
import { db } from "../db.js";

export interface ResolvedServiceArea {
    id: string;
    label: string;
    /**
     * 'boundary' and 'circle' are decisions; 'nearest' is a suggestion.
     * Callers must not treat 'nearest' as settled without the customer seeing it.
     */
    confidence: "boundary" | "circle" | "nearest";
    distanceKm: number | null;
}

/**
 * Beyond this, "nearest" stops meaning anything.
 *
 * Without a cap the nearest centre is always *some* area, so an address in
 * Chattogram would be attributed to whichever Dhaka neighbourhood happened to
 * be closest. Better to return nothing and let the caller say "outside our
 * areas" than to invent a plausible wrong answer.
 */
const NEAREST_LIMIT_KM = 8;

function areaLabel(row: {
    city: string | null;
    areaName: string | null;
    subareaName: string | null;
    blockOrSector: string | null;
}): string {
    return [row.blockOrSector, row.subareaName, row.areaName, row.city]
        .filter(Boolean)
        .join(", ");
}

export async function resolveServiceArea(point: {
    lat: number;
    lng: number;
}): Promise<ResolvedServiceArea | null> {
    const [rows, settingRows] = await Promise.all([
        db
            .select({
                id: serviceAreas.id,
                city: serviceAreas.city,
                areaName: serviceAreas.areaName,
                subareaName: serviceAreas.subareaName,
                blockOrSector: serviceAreas.blockOrSector,
                lat: serviceAreas.centroidLatitude,
                lng: serviceAreas.centroidLongitude,
                boundary: serviceAreas.boundaryGeoJson,
            })
            .from(serviceAreas)
            .where(eq(serviceAreas.isActive, true)),
        db.select({ key: settings.key, value: settings.value }).from(settings),
    ]);

    if (rows.length === 0) return null;

    const geoPoint: Feature<import("geojson").Point> = {
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [point.lng, point.lat] },
    };

    // 1. A boundary somebody drew.
    for (const row of rows) {
        const boundary = row.boundary as { geometry?: unknown } | null;
        if (!boundary?.geometry) continue;
        try {
            if (booleanPointInPolygon(geoPoint, boundary as Feature<Polygon | MultiPolygon>)) {
                return {
                    id: row.id,
                    label: areaLabel(row),
                    confidence: "boundary",
                    distanceKm:
                        row.lat != null && row.lng != null
                            ? distanceKm(point, { lat: Number(row.lat), lng: Number(row.lng) })
                            : null,
                };
            }
        } catch {
            // A malformed polygon must not take the whole lookup down with it;
            // the circle and nearest passes below still have a chance.
            continue;
        }
    }

    // 2. A rated circle — smallest wins, exactly as the fare does.
    const fares = readAreaFares(settingRows);
    let circle: ResolvedServiceArea | null = null;
    let bestRadius = Infinity;
    for (const row of rows) {
        const rated = fares[row.id];
        if (!rated || row.lat == null || row.lng == null) continue;
        const d = distanceKm(point, { lat: Number(row.lat), lng: Number(row.lng) });
        if (d <= rated.radiusKm && rated.radiusKm < bestRadius) {
            bestRadius = rated.radiusKm;
            circle = { id: row.id, label: areaLabel(row), confidence: "circle", distanceKm: d };
        }
    }
    if (circle) return circle;

    // 3. Nearest centre, as a guess.
    let nearest: ResolvedServiceArea | null = null;
    let bestDistance = Infinity;
    for (const row of rows) {
        if (row.lat == null || row.lng == null) continue;
        const d = distanceKm(point, { lat: Number(row.lat), lng: Number(row.lng) });
        if (d < bestDistance && d <= NEAREST_LIMIT_KM) {
            bestDistance = d;
            nearest = { id: row.id, label: areaLabel(row), confidence: "nearest", distanceKm: d };
        }
    }
    return nearest;
}
