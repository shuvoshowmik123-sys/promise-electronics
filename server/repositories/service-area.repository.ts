import { randomUUID } from 'crypto';
import { db, eq, sql, and } from './base.js';
import { serviceAreas } from '../../shared/schema.js';
import type { ServiceArea } from '../../shared/schema.js';

export type AreaAnalyticsRow = {
    id: string;
    city: string;
    areaName: string;
    subareaName: string | null;
    blockOrSector: string | null;
    serviceRequestCount: number;
    jobCount: number;
    completedJobCount: number;
    billedTotal: number;
    collectedTotal: number;
    warrantyClaimCount: number;
};

// Phase Map-02: map-ready aggregate — geometry + analytics, never customer data
export type AreaMapRow = {
    id: string;
    city: string;
    areaName: string;
    subareaName: string | null;
    blockOrSector: string | null;
    isActive: boolean;
    isPublic: boolean;
    centroidLatitude: number | null;
    centroidLongitude: number | null;
    boundaryGeoJson: unknown | null;
    serviceRequestCount: number;
    jobCount: number;
    completedJobCount: number;
    billedTotal: number;
    collectedTotal: number;
    warrantyClaimCount: number;
};

export type AreaAnalyticsParams = {
    startDate?: Date | null;
    endDate?: Date | null;
    areaId?: string | null;
};

export type GeometryFields = {
    centroidLatitude?: number | null;
    centroidLongitude?: number | null;
    boundaryGeoJson?: unknown | null;
};

export type AreaHealthDiagnostics = {
    activeAreaCount: number;
    areasMissingGeometry: number;
    retailRequestsWithoutArea: number;
    retailJobsWithoutArea: number;
    retailPosWithoutArea: number;
    warrantyClaimsWithoutArea: number;
    legacyPosPendingAttribution: number;
};

export function buildNormalizedKey(
    city: string,
    areaName: string,
    subareaName?: string | null,
    blockOrSector?: string | null,
): string {
    return [city, areaName, subareaName ?? '', blockOrSector ?? '']
        .map((s) => s.toLowerCase().trim())
        .join(':');
}

export async function getAllServiceAreas(): Promise<ServiceArea[]> {
    return db.select().from(serviceAreas).orderBy(serviceAreas.city, serviceAreas.areaName);
}

export async function getActiveServiceAreas(): Promise<ServiceArea[]> {
    return db.select().from(serviceAreas)
        .where(eq(serviceAreas.isActive, true))
        .orderBy(serviceAreas.city, serviceAreas.areaName);
}

/** Public customer surface: active AND explicitly published (raw SQL gate — no Drizzle-only drift). */
export async function getPublicServiceAreas(): Promise<ServiceArea[]> {
    const result = await db.execute(sql`
        SELECT *
        FROM service_areas
        WHERE is_active = TRUE
          AND is_public = TRUE
        ORDER BY city ASC, area_name ASC
    `);
    return ((result as any).rows as Record<string, unknown>[]).map(mapServiceAreaRow);
}

function mapServiceAreaRow(r: Record<string, unknown>): ServiceArea {
    return {
        id: String(r.id),
        city: String(r.city),
        areaName: String(r.area_name),
        subareaName: (r.subarea_name as string | null) ?? null,
        blockOrSector: (r.block_or_sector as string | null) ?? null,
        normalizedKey: String(r.normalized_key),
        isActive: r.is_active === true || r.is_active === 't' || r.is_active === 1,
        isPublic: r.is_public === true || r.is_public === 't' || r.is_public === 1,
        centroidLatitude: r.centroid_latitude == null ? null : Number(r.centroid_latitude),
        centroidLongitude: r.centroid_longitude == null ? null : Number(r.centroid_longitude),
        boundaryGeoJson: (r.boundary_geo_json as ServiceArea['boundaryGeoJson']) ?? null,
        geometryUpdatedAt: (r.geometry_updated_at as Date | null) ?? null,
        createdAt: r.created_at as Date,
        updatedAt: r.updated_at as Date,
    };
}

export async function getServiceAreaById(id: string): Promise<ServiceArea | undefined> {
    const rows = await db.select().from(serviceAreas).where(eq(serviceAreas.id, id)).limit(1);
    return rows[0];
}

export async function getActiveServiceAreaById(id: string): Promise<ServiceArea | undefined> {
    const rows = await db.select().from(serviceAreas)
        .where(and(eq(serviceAreas.id, id), eq(serviceAreas.isActive, true)))
        .limit(1);
    return rows[0];
}

export async function getPublicServiceAreaById(id: string): Promise<ServiceArea | undefined> {
    const result = await db.execute(sql`
        SELECT *
        FROM service_areas
        WHERE id = ${id}
          AND is_active = TRUE
          AND is_public = TRUE
        LIMIT 1
    `);
    const row = ((result as any).rows as Record<string, unknown>[])[0];
    return row ? mapServiceAreaRow(row) : undefined;
}

export function isPublishableServiceArea(area: {
    areaName: string;
    isActive: boolean;
    centroidLatitude: number | null;
    centroidLongitude: number | null;
    boundaryGeoJson: unknown | null;
}): { ok: true } | { ok: false; message: string } {
    const name = area.areaName?.trim() ?? '';
    if (name.length < 2 || name.length > 100) {
        return { ok: false, message: 'A valid customer-safe area name is required to publish' };
    }
    if (!area.isActive) {
        return { ok: false, message: 'Only active areas can be published' };
    }
    if (
        area.centroidLatitude == null
        || area.centroidLongitude == null
        || !Number.isFinite(area.centroidLatitude)
        || !Number.isFinite(area.centroidLongitude)
    ) {
        return { ok: false, message: 'A valid centroid is required to publish' };
    }
    if (area.boundaryGeoJson == null || typeof area.boundaryGeoJson !== 'object') {
        return { ok: false, message: 'Supported boundary geometry is required to publish' };
    }
    const feature = area.boundaryGeoJson as { type?: string; geometry?: { type?: string } };
    if (feature.type !== 'Feature' || !feature.geometry) {
        return { ok: false, message: 'Supported boundary geometry is required to publish' };
    }
    if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') {
        return { ok: false, message: 'Supported boundary geometry is required to publish' };
    }
    return { ok: true };
}

export async function getServiceAreaByNormalizedKey(key: string): Promise<ServiceArea | undefined> {
    const rows = await db.select().from(serviceAreas)
        .where(eq(serviceAreas.normalizedKey, key))
        .limit(1);
    return rows[0];
}

export async function createServiceArea(data: {
    city?: string;
    areaName: string;
    subareaName?: string | null;
    blockOrSector?: string | null;
    centroidLatitude?: number | null;
    centroidLongitude?: number | null;
    boundaryGeoJson?: unknown | null;
}): Promise<ServiceArea> {
    const city = data.city ?? 'Dhaka';
    const normalizedKey = buildNormalizedKey(city, data.areaName, data.subareaName, data.blockOrSector);
    const hasGeometry = data.centroidLatitude != null || data.centroidLongitude != null || data.boundaryGeoJson != null;

    const rows = await db.insert(serviceAreas).values({
        id: randomUUID(),
        city,
        areaName: data.areaName,
        subareaName: data.subareaName ?? null,
        blockOrSector: data.blockOrSector ?? null,
        normalizedKey,
        isActive: true,
        isPublic: false,
        centroidLatitude: data.centroidLatitude ?? null,
        centroidLongitude: data.centroidLongitude ?? null,
        boundaryGeoJson: (data.boundaryGeoJson ?? null) as any,
        geometryUpdatedAt: hasGeometry ? new Date() : null,
    }).returning();
    return rows[0];
}

export async function updateServiceArea(
    id: string,
    data: Partial<{
        city: string;
        areaName: string;
        subareaName: string | null;
        blockOrSector: string | null;
        isActive: boolean;
        isPublic: boolean;
        centroidLatitude: number | null;
        centroidLongitude: number | null;
        boundaryGeoJson: unknown | null;
    }>,
): Promise<ServiceArea | undefined> {
    const existing = await getServiceAreaById(id);
    if (!existing) return undefined;

    const merged = {
        city: data.city ?? existing.city,
        areaName: data.areaName ?? existing.areaName,
        subareaName: 'subareaName' in data ? data.subareaName : existing.subareaName,
        blockOrSector: 'blockOrSector' in data ? data.blockOrSector : existing.blockOrSector,
    };

    const normalizedKey = buildNormalizedKey(
        merged.city,
        merged.areaName,
        merged.subareaName,
        merged.blockOrSector,
    );

    const geometryTouched =
        'centroidLatitude' in data ||
        'centroidLongitude' in data ||
        'boundaryGeoJson' in data;

    // Deactivating an area always unpublishes it from the public surface.
    const patch: Record<string, unknown> = {
        ...data,
        boundaryGeoJson: 'boundaryGeoJson' in data ? (data.boundaryGeoJson as any) : undefined,
        normalizedKey,
        ...(geometryTouched ? { geometryUpdatedAt: new Date() } : {}),
        updatedAt: new Date(),
    };
    if (geometryTouched) {
        patch.isPublic = false;
    }
    if (data.isActive === false) {
        patch.isPublic = false;
    }

    const rows = await db.update(serviceAreas)
        .set(patch as any)
        .where(eq(serviceAreas.id, id))
        .returning();
    return rows[0];
}

export async function getAreaAnalytics(params: AreaAnalyticsParams): Promise<AreaAnalyticsRow[]> {
    const areaFilter = params.areaId
        ? sql`AND sa.id = ${params.areaId}`
        : sql``;

    const result = await db.execute(sql`
        WITH request_stats AS (
            SELECT service_area_id,
                   COUNT(*)::int AS request_count
            FROM service_requests
            WHERE service_area_id IS NOT NULL
              AND corporate_client_id IS NULL
              AND (${params.startDate ?? null}::timestamp IS NULL OR created_at >= ${params.startDate ?? null})
              AND (${params.endDate ?? null}::timestamp IS NULL OR created_at <= ${params.endDate ?? null})
            GROUP BY service_area_id
        ), job_stats AS (
            SELECT service_area_id,
                   COUNT(*)::int AS job_count,
                   COUNT(*) FILTER (WHERE status IN ('Completed', 'Delivered'))::int AS completed_count
            FROM job_tickets
            WHERE service_area_id IS NOT NULL
              AND corporate_client_id IS NULL
              AND corporate_challan_id IS NULL
              AND (${params.startDate ?? null}::timestamp IS NULL OR created_at >= ${params.startDate ?? null})
              AND (${params.endDate ?? null}::timestamp IS NULL OR created_at <= ${params.endDate ?? null})
            GROUP BY service_area_id
        ), allocated_pos AS (
            SELECT allocation.service_area_id,
                   SUM(allocation.billed_amount)::numeric AS billed_total,
                   SUM(CASE WHEN pt.payment_status = 'Paid' THEN allocation.billed_amount ELSE 0 END)::numeric AS collected_total
            FROM pos_transaction_area_allocations allocation
            JOIN pos_transactions pt ON pt.id = allocation.transaction_id
            JOIN job_tickets job ON job.id = allocation.job_ticket_id
            WHERE job.corporate_client_id IS NULL
              AND job.corporate_challan_id IS NULL
              AND (${params.startDate ?? null}::timestamp IS NULL OR pt.created_at >= ${params.startDate ?? null})
              AND (${params.endDate ?? null}::timestamp IS NULL OR pt.created_at <= ${params.endDate ?? null})
            GROUP BY allocation.service_area_id
        ), standalone_pos AS (
            SELECT pt.service_area_id,
                   SUM(pt.total)::numeric AS billed_total,
                   SUM(CASE WHEN pt.payment_status = 'Paid' THEN pt.total ELSE 0 END)::numeric AS collected_total
            FROM pos_transactions pt
            WHERE pt.service_area_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM pos_transaction_area_allocations allocation
                  WHERE allocation.transaction_id = pt.id
              )
              AND (${params.startDate ?? null}::timestamp IS NULL OR pt.created_at >= ${params.startDate ?? null})
              AND (${params.endDate ?? null}::timestamp IS NULL OR pt.created_at <= ${params.endDate ?? null})
            GROUP BY pt.service_area_id
        ), warranty_stats AS (
            SELECT wc.service_area_id, COUNT(*)::int AS claim_count
            FROM warranty_claims wc
            JOIN job_tickets jt ON jt.id = wc.original_job_id
            WHERE wc.service_area_id IS NOT NULL
              AND jt.corporate_client_id IS NULL
              AND jt.corporate_challan_id IS NULL
              AND (${params.startDate ?? null}::timestamp IS NULL OR wc.created_at >= ${params.startDate ?? null})
              AND (${params.endDate ?? null}::timestamp IS NULL OR wc.created_at <= ${params.endDate ?? null})
            GROUP BY wc.service_area_id
        )
        SELECT
            sa.id,
            sa.city,
            sa.area_name,
            sa.subarea_name,
            sa.block_or_sector,
            COALESCE(request_stats.request_count, 0)::int AS service_request_count,
            COALESCE(job_stats.job_count, 0)::int AS job_count,
            COALESCE(job_stats.completed_count, 0)::int AS completed_job_count,
            (COALESCE(allocated_pos.billed_total, 0) + COALESCE(standalone_pos.billed_total, 0))::numeric AS billed_total,
            (COALESCE(allocated_pos.collected_total, 0) + COALESCE(standalone_pos.collected_total, 0))::numeric AS collected_total,
            COALESCE(warranty_stats.claim_count, 0)::int AS warranty_claim_count
        FROM service_areas sa
        LEFT JOIN request_stats ON request_stats.service_area_id = sa.id
        LEFT JOIN job_stats ON job_stats.service_area_id = sa.id
        LEFT JOIN allocated_pos ON allocated_pos.service_area_id = sa.id
        LEFT JOIN standalone_pos ON standalone_pos.service_area_id = sa.id
        LEFT JOIN warranty_stats ON warranty_stats.service_area_id = sa.id
        WHERE sa.is_active = TRUE ${areaFilter}
        ORDER BY sa.city ASC, sa.area_name ASC,
                 sa.subarea_name ASC NULLS LAST,
                 sa.block_or_sector ASC NULLS LAST
    `);

    return (result as any).rows.map((r: any) => ({
        id: r.id as string,
        city: r.city as string,
        areaName: r.area_name as string,
        subareaName: r.subarea_name as string | null,
        blockOrSector: r.block_or_sector as string | null,
        serviceRequestCount: Number(r.service_request_count ?? 0),
        jobCount: Number(r.job_count ?? 0),
        completedJobCount: Number(r.completed_job_count ?? 0),
        billedTotal: Number(r.billed_total ?? 0),
        collectedTotal: Number(r.collected_total ?? 0),
        warrantyClaimCount: Number(r.warranty_claim_count ?? 0),
    }));
}

// Phase Map-02: aggregated map data — geometry + analytics, no customer data
// Admin: all active areas. Public: active + is_public only (via publicOnly).
export async function getAreaMapData(
    params: AreaAnalyticsParams & { publicOnly?: boolean } = {},
): Promise<AreaMapRow[]> {
    const analytics = await getAreaAnalytics(params);
    const areas = params.publicOnly
        ? await getPublicServiceAreas()
        : await getActiveServiceAreas();
    const analyticsById = new Map(analytics.map((row) => [row.id, row]));
    return areas
        .filter((area) => !params.areaId || area.id === params.areaId)
        .map((area) => ({
            ...area,
            isPublic: Boolean(area.isPublic),
            ...(analyticsById.get(area.id) ?? {
                serviceRequestCount: 0,
                jobCount: 0,
                completedJobCount: 0,
                billedTotal: 0,
                collectedTotal: 0,
                warrantyClaimCount: 0,
            }),
        }));
}

export async function getAreaHealthDiagnostics(): Promise<AreaHealthDiagnostics> {
    const result = await db.execute(sql`
        SELECT
            (SELECT COUNT(*) FROM service_areas WHERE is_active = TRUE)::int AS active_area_count,
            (SELECT COUNT(*) FROM service_areas WHERE is_active = TRUE AND boundary_geo_json IS NULL AND (centroid_latitude IS NULL OR centroid_longitude IS NULL))::int AS areas_missing_geometry,
            (SELECT COUNT(*) FROM service_requests WHERE corporate_client_id IS NULL AND service_area_id IS NULL)::int AS retail_requests_without_area,
            (SELECT COUNT(*) FROM job_tickets WHERE corporate_client_id IS NULL AND corporate_challan_id IS NULL AND service_area_id IS NULL)::int AS retail_jobs_without_area,
            (SELECT COUNT(*) FROM pos_transactions pt WHERE pt.service_area_id IS NULL AND NOT EXISTS (SELECT 1 FROM pos_transaction_area_allocations allocation WHERE allocation.transaction_id = pt.id))::int AS retail_pos_without_area,
            (SELECT COUNT(*) FROM warranty_claims claim JOIN job_tickets job ON job.id = claim.original_job_id WHERE job.corporate_client_id IS NULL AND job.corporate_challan_id IS NULL AND claim.service_area_id IS NULL)::int AS warranty_claims_without_area,
            (SELECT COUNT(*) FROM pos_transactions pt WHERE pt.linked_jobs IS NOT NULL AND pt.linked_jobs <> '' AND NOT EXISTS (SELECT 1 FROM pos_transaction_area_allocations allocation WHERE allocation.transaction_id = pt.id))::int AS legacy_pos_pending_attribution
    `);
    const row = (result as any).rows[0] as Record<string, number>;
    return {
        activeAreaCount: Number(row.active_area_count ?? 0),
        areasMissingGeometry: Number(row.areas_missing_geometry ?? 0),
        retailRequestsWithoutArea: Number(row.retail_requests_without_area ?? 0),
        retailJobsWithoutArea: Number(row.retail_jobs_without_area ?? 0),
        retailPosWithoutArea: Number(row.retail_pos_without_area ?? 0),
        warrantyClaimsWithoutArea: Number(row.warranty_claims_without_area ?? 0),
        legacyPosPendingAttribution: Number(row.legacy_pos_pending_attribution ?? 0),
    };
}
