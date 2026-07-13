import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdminAuth, requireGranularPermission, requireAnyGranularPermission } from './middleware/auth.js';
import { auditLogger } from '../utils/auditLogger.js';
import { logRouteError } from '../utils/route-error.js';
import * as serviceAreaRepo from '../repositories/service-area.repository.js';
import { estimateRoute } from '../services/route-estimate.service.js';
import { routeEstimateLimiter, mapPlaceSearchLimiter } from './middleware/rate-limit.js';
import { settingsRepo } from '../repositories/index.js';
import { normalizePlaceQuery, searchMapBoundaries, searchMapPlaces } from '../services/map-place-search.service.js';

const router = Router();

// ── Operational bounds (Bangladesh) ──────────────────────────────────────
// Broad national bounds with small buffer — never used for customer location.
const BD_LAT_MIN = 20.0;
const BD_LAT_MAX = 27.0;
const BD_LON_MIN = 87.5;
const BD_LON_MAX = 93.0;

// Maximum serialized size for a boundary GeoJSON payload (per field, not whole body).
const BOUNDARY_MAX_BYTES = 256 * 1024; // 256 KB

// ── GeoJSON validator ────────────────────────────────────────────────────
// Accepts only a GeoJSON Feature with Polygon or MultiPolygon geometry,
// with all coordinates within Bangladesh operational bounds.
// Never stores customer GPS — geometry represents a broad operational area only.

function validatePolygonRings(
    rings: unknown,
): { ok: true } | { ok: false; message: string } {
    if (!Array.isArray(rings) || rings.length === 0) {
        return { ok: false, message: 'Polygon must have at least one ring' };
    }
    for (const ring of rings) {
        if (!Array.isArray(ring)) {
            return { ok: false, message: 'Each ring must be an array of positions' };
        }
        if (ring.length < 4) {
            return { ok: false, message: 'Each ring must have at least 4 positions' };
        }
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (!Array.isArray(first) || !Array.isArray(last)) {
            return { ok: false, message: 'Ring positions must be arrays' };
        }
        if (first[0] !== last[0] || first[1] !== last[1]) {
            return { ok: false, message: 'Ring must be closed: first and last positions must be identical' };
        }
        for (const pos of ring) {
            if (!Array.isArray(pos) || pos.length < 2) {
                return { ok: false, message: 'Each position must be [longitude, latitude]' };
            }
            const [lon, lat] = pos as unknown[];
            if (typeof lon !== 'number' || !isFinite(lon) || typeof lat !== 'number' || !isFinite(lat)) {
                return { ok: false, message: 'All coordinate values must be finite numbers' };
            }
            if (lon < BD_LON_MIN || lon > BD_LON_MAX) {
                return { ok: false, message: `Longitude ${lon} is outside Bangladesh operational bounds (${BD_LON_MIN}–${BD_LON_MAX})` };
            }
            if (lat < BD_LAT_MIN || lat > BD_LAT_MAX) {
                return { ok: false, message: `Latitude ${lat} is outside Bangladesh operational bounds (${BD_LAT_MIN}–${BD_LAT_MAX})` };
            }
        }
    }
    return { ok: true };
}

function validateBoundaryGeoJson(
    value: unknown,
): { ok: true } | { ok: false; message: string } {
    if (value === null || value === undefined) return { ok: true };

    // Payload size guard
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, 'utf8') > BOUNDARY_MAX_BYTES) {
        return { ok: false, message: `boundaryGeoJson exceeds maximum allowed size (${BOUNDARY_MAX_BYTES} bytes)` };
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false, message: 'boundaryGeoJson must be a GeoJSON Feature object' };
    }

    const obj = value as Record<string, unknown>;

    if (obj.type !== 'Feature') {
        return { ok: false, message: 'boundaryGeoJson must be a GeoJSON Feature (type: "Feature")' };
    }

    if (!obj.geometry || typeof obj.geometry !== 'object' || Array.isArray(obj.geometry)) {
        return { ok: false, message: 'boundaryGeoJson.geometry is required and must be an object' };
    }

    const geom = obj.geometry as Record<string, unknown>;

    if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') {
        return { ok: false, message: `boundaryGeoJson geometry type "${geom.type}" is not supported; must be Polygon or MultiPolygon` };
    }

    if (!Array.isArray(geom.coordinates)) {
        return { ok: false, message: 'boundaryGeoJson geometry.coordinates must be an array' };
    }

    if (geom.type === 'Polygon') {
        return validatePolygonRings(geom.coordinates);
    }

    // MultiPolygon: array of polygon-ring arrays
    if (geom.coordinates.length === 0) {
        return { ok: false, message: 'MultiPolygon coordinates must be a non-empty array' };
    }
    for (const polygonRings of geom.coordinates) {
        if (!Array.isArray(polygonRings)) {
            return { ok: false, message: 'Each MultiPolygon polygon must be an array of rings' };
        }
        const r = validatePolygonRings(polygonRings);
        if (!r.ok) return r;
    }

    return { ok: true };
}

// ── Geometry field validators ─────────────────────────────────────────────

const latSchema = z
    .number()
    .finite()
    .min(BD_LAT_MIN, `centroidLatitude must be within Bangladesh bounds (${BD_LAT_MIN}–${BD_LAT_MAX})`)
    .max(BD_LAT_MAX, `centroidLatitude must be within Bangladesh bounds (${BD_LAT_MIN}–${BD_LAT_MAX})`)
    .nullable()
    .optional();

const lonSchema = z
    .number()
    .finite()
    .min(BD_LON_MIN, `centroidLongitude must be within Bangladesh bounds (${BD_LON_MIN}–${BD_LON_MAX})`)
    .max(BD_LON_MAX, `centroidLongitude must be within Bangladesh bounds (${BD_LON_MIN}–${BD_LON_MAX})`)
    .nullable()
    .optional();

const CENTROID_PAIR_MSG = 'centroidLatitude and centroidLongitude must both be provided or both be null';

// ── Input Schemas ──────────────────────────────────────────────────────────

const createAreaSchema = z
    .object({
        city: z.string().min(1).max(100).optional(),
        areaName: z.string().min(1).max(100),
        subareaName: z.string().min(1).max(100).nullable().optional(),
        blockOrSector: z.string().min(1).max(100).nullable().optional(),
        centroidLatitude: latSchema,
        centroidLongitude: lonSchema,
        boundaryGeoJson: z.unknown().nullable().optional(),
    })
    .superRefine((d, ctx) => {
        if ((d.centroidLatitude != null) !== (d.centroidLongitude != null)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: CENTROID_PAIR_MSG });
        }
        if (d.boundaryGeoJson != null) {
            const r = validateBoundaryGeoJson(d.boundaryGeoJson);
            if (!r.ok) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.message, path: ['boundaryGeoJson'] });
            }
        }
    });

const updateAreaSchema = z
    .object({
        city: z.string().min(1).max(100).optional(),
        areaName: z.string().min(1).max(100).optional(),
        subareaName: z.string().min(1).max(100).nullable().optional(),
        blockOrSector: z.string().min(1).max(100).nullable().optional(),
        isActive: z.boolean().optional(),
        // Publication is managed only via dedicated publish/unpublish routes.
        centroidLatitude: latSchema,
        centroidLongitude: lonSchema,
        boundaryGeoJson: z.unknown().nullable().optional(),
    })
    .superRefine((d, ctx) => {
        if ((d.centroidLatitude != null) !== (d.centroidLongitude != null)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: CENTROID_PAIR_MSG });
        }
        if (d.boundaryGeoJson != null) {
            const r = validateBoundaryGeoJson(d.boundaryGeoJson);
            if (!r.ok) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.message, path: ['boundaryGeoJson'] });
            }
        }
    });

const publicationSchema = z.object({
    confirm: z.literal(true),
});

const analyticsQuerySchema = z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    areaId: z.string().optional(),
});

const routeEstimateSchema = z.object({
    latitude: z.number().finite().min(BD_LAT_MIN).max(BD_LAT_MAX),
    longitude: z.number().finite().min(BD_LON_MIN).max(BD_LON_MAX),
}).strict();

const serviceCenterSchema = z.object({
    address: z.string().trim().max(500),
    latitude: z.number().finite().min(BD_LAT_MIN).max(BD_LAT_MAX).nullable(),
    longitude: z.number().finite().min(BD_LON_MIN).max(BD_LON_MAX).nullable(),
    googlePlaceId: z.string().trim().max(300),
}).refine((value) => (value.latitude == null) === (value.longitude == null), {
    message: 'Latitude and longitude must both be provided or both be null',
});

async function readServiceCenterLocation() {
    const [address, latitude, longitude, googlePlaceId] = await Promise.all([
        settingsRepo.getSetting('service_center_contact'),
        settingsRepo.getSetting('service_center_latitude'),
        settingsRepo.getSetting('service_center_longitude'),
        settingsRepo.getSetting('service_center_google_place_id'),
    ]);
    const parsedLatitude = latitude?.value ? Number(latitude.value) : null;
    const parsedLongitude = longitude?.value ? Number(longitude.value) : null;
    return {
        address: address?.value ?? '',
        latitude: Number.isFinite(parsedLatitude) ? parsedLatitude : null,
        longitude: Number.isFinite(parsedLongitude) ? parsedLongitude : null,
        googlePlaceId: googlePlaceId?.value ?? '',
    };
}

// ── Demand bucket helper ───────────────────────────────────────────────────

function getDemandBucket(count: number): string {
    if (count < 5) return 'new';
    if (count < 20) return 'growing';
    if (count < 50) return 'popular';
    return 'high demand';
}

function getPublicDemandRange(count: number): string {
    if (count < 5) return 'new_service_area';
    if (count < 20) return '5_plus';
    if (count < 50) return '20_plus';
    return '50_plus';
}

// ── Date parsing helper ────────────────────────────────────────────────────

function parseDateParam(
    str: string | undefined,
    fieldName: string,
    res: Response,
): Date | null | 'error' {
    if (!str) return null;
    const d = new Date(str);
    if (isNaN(d.getTime())) {
        res.status(400).json({ error: `Invalid ${fieldName} format` });
        return 'error';
    }
    return d;
}

// ── Admin CRUD — Super Admin only ──────────────────────────────────────────

router.get(
    '/api/admin/service-center-location',
    requireAdminAuth,
    requireAnyGranularPermission(['map.manageAreas', 'map.viewAreaAnalytics']),
    async (req: Request, res: Response) => {
        try {
            res.json(await readServiceCenterLocation());
        } catch (error) {
            logRouteError('ServiceAreas.ServiceCenterRead', req, error);
            res.status(500).json({ error: 'Failed to read service-center location' });
        }
    },
);

router.get(
    '/api/admin/area-health',
    requireAdminAuth,
    requireAnyGranularPermission(['map.manageAreas', 'map.viewAreaAnalytics']),
    async (req: Request, res: Response) => {
        try {
            const [diagnostics, center] = await Promise.all([
                serviceAreaRepo.getAreaHealthDiagnostics(),
                readServiceCenterLocation(),
            ]);
            res.json({
                ...diagnostics,
                missingServiceCenterPin: center.latitude == null || center.longitude == null,
            });
        } catch (error) {
            logRouteError('ServiceAreas.Health', req, error);
            res.status(500).json({ error: 'Failed to read area health diagnostics' });
        }
    },
);

router.patch(
    '/api/admin/service-center-location',
    requireAdminAuth,
    requireGranularPermission('map.manageAreas'),
    async (req: Request, res: Response) => {
        const parsed = serviceCenterSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid service-center location' });
        try {
            const previous = await readServiceCenterLocation();
            const value = parsed.data;
            await Promise.all([
                settingsRepo.upsertSetting({ key: 'service_center_contact', value: value.address }),
                settingsRepo.upsertSetting({ key: 'service_center_latitude', value: value.latitude?.toString() ?? '' }),
                settingsRepo.upsertSetting({ key: 'service_center_longitude', value: value.longitude?.toString() ?? '' }),
                settingsRepo.upsertSetting({ key: 'service_center_google_place_id', value: value.googlePlaceId }),
            ]);
            await auditLogger.log({
                userId: req.session.adminUserId!,
                action: 'UPDATE_SERVICE_CENTER_LOCATION',
                entity: 'Setting',
                entityId: 'service-center-location',
                details: 'Updated canonical service-center location for map routing',
                oldValue: previous,
                newValue: value,
                req,
            });
            res.json(value);
        } catch (error) {
            logRouteError('ServiceAreas.ServiceCenterUpdate', req, error);
            res.status(500).json({ error: 'Failed to update service-center location' });
        }
    },
);

// GET /api/admin/service-areas
router.get(
    '/api/admin/service-areas',
    requireAdminAuth,
    requireAnyGranularPermission(['map.manageAreas', 'map.viewAreaAnalytics']),
    async (req: Request, res: Response) => {
        try {
            const areas = await serviceAreaRepo.getAllServiceAreas();
            res.json(areas);
        } catch (error) {
            logRouteError('ServiceAreas.List', req, error);
            res.status(500).json({ error: 'Failed to fetch service areas' });
        }
    },
);

// POST /api/admin/service-areas
router.post(
    '/api/admin/service-areas',
    requireAdminAuth,
    requireGranularPermission('map.manageAreas'),
    async (req: Request, res: Response) => {
        try {
            const parsed = createAreaSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
            }

            const { city = 'Dhaka', areaName, subareaName, blockOrSector,
                    centroidLatitude, centroidLongitude, boundaryGeoJson } = parsed.data;
            const normalizedKey = serviceAreaRepo.buildNormalizedKey(city, areaName, subareaName, blockOrSector);

            const existing = await serviceAreaRepo.getServiceAreaByNormalizedKey(normalizedKey);
            if (existing) {
                return res.status(409).json({ error: 'A service area with this combination already exists' });
            }

            const area = await serviceAreaRepo.createServiceArea({
                city, areaName, subareaName, blockOrSector,
                centroidLatitude: centroidLatitude ?? null,
                centroidLongitude: centroidLongitude ?? null,
                boundaryGeoJson: boundaryGeoJson ?? null,
            });

            await auditLogger.log({
                userId: req.session.adminUserId!,
                action: 'CREATE_SERVICE_AREA',
                entity: 'ServiceArea',
                entityId: area.id,
                details: `Created service area: ${city} / ${areaName}${subareaName ? ' / ' + subareaName : ''}${blockOrSector ? ' / ' + blockOrSector : ''}${centroidLatitude != null ? ' [centroid set]' : ''}`,
                newValue: area,
                req,
            }).catch(() => {});

            res.status(201).json(area);
        } catch (error) {
            logRouteError('ServiceAreas.Create', req, error);
            res.status(500).json({ error: 'Failed to create service area' });
        }
    },
);

// PATCH /api/admin/service-areas/:id
router.patch(
    '/api/admin/service-areas/:id',
    requireAdminAuth,
    requireGranularPermission('map.manageAreas'),
    async (req: Request, res: Response) => {
        try {
            const parsed = updateAreaSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Invalid input' });
            }

            const existing = await serviceAreaRepo.getServiceAreaById(req.params.id);
            if (!existing) {
                return res.status(404).json({ error: 'Service area not found' });
            }

            const merged = {
                city: parsed.data.city ?? existing.city,
                areaName: parsed.data.areaName ?? existing.areaName,
                subareaName: 'subareaName' in parsed.data ? parsed.data.subareaName : existing.subareaName,
                blockOrSector: 'blockOrSector' in parsed.data ? parsed.data.blockOrSector : existing.blockOrSector,
            };

            const normalizedKey = serviceAreaRepo.buildNormalizedKey(
                merged.city,
                merged.areaName,
                merged.subareaName,
                merged.blockOrSector,
            );

            const conflict = await serviceAreaRepo.getServiceAreaByNormalizedKey(normalizedKey);
            if (conflict && conflict.id !== req.params.id) {
                return res.status(409).json({ error: 'A service area with this combination already exists' });
            }

            const updateData: Parameters<typeof serviceAreaRepo.updateServiceArea>[1] = { ...parsed.data };

            const updated = await serviceAreaRepo.updateServiceArea(req.params.id, updateData);
            if (!updated) {
                return res.status(404).json({ error: 'Service area not found' });
            }

            const geometryChanged =
                'centroidLatitude' in parsed.data ||
                'centroidLongitude' in parsed.data ||
                'boundaryGeoJson' in parsed.data;

            await auditLogger.log({
                userId: req.session.adminUserId!,
                action: 'UPDATE_SERVICE_AREA',
                entity: 'ServiceArea',
                entityId: req.params.id,
                details: `Updated service area: ${updated.city} / ${updated.areaName}${geometryChanged ? ' [geometry updated]' : ''}`,
                oldValue: existing,
                newValue: updated,
                req,
            }).catch(() => {});

            res.json(updated);
        } catch (error) {
            logRouteError('ServiceAreas.Update', req, error);
            res.status(500).json({ error: 'Failed to update service area' });
        }
    },
);

// POST /api/admin/service-areas/:id/deactivate
router.post(
    '/api/admin/service-areas/:id/deactivate',
    requireAdminAuth,
    requireGranularPermission('map.manageAreas'),
    async (req: Request, res: Response) => {
        try {
            const existing = await serviceAreaRepo.getServiceAreaById(req.params.id);
            if (!existing) {
                return res.status(404).json({ error: 'Service area not found' });
            }

            // Deactivate also clears is_public (repository enforces).
            const updated = await serviceAreaRepo.updateServiceArea(req.params.id, { isActive: false });

            await auditLogger.log({
                userId: req.session.adminUserId!,
                action: 'DEACTIVATE_SERVICE_AREA',
                entity: 'ServiceArea',
                entityId: req.params.id,
                details: `Deactivated service area: ${existing.city} / ${existing.areaName}`,
                oldValue: { isActive: existing.isActive, isPublic: existing.isPublic },
                newValue: { isActive: false, isPublic: false },
                req,
            }).catch(() => {});

            res.json(updated);
        } catch (error) {
            logRouteError('ServiceAreas.Deactivate', req, error);
            res.status(500).json({ error: 'Failed to deactivate service area' });
        }
    },
);

// POST /api/admin/service-areas/:id/publish — Super Admin map.manageAreas only
router.post(
    '/api/admin/service-areas/:id/publish',
    requireAdminAuth,
    requireGranularPermission('map.manageAreas'),
    async (req: Request, res: Response) => {
        try {
            const parsed = publicationSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ error: 'Publication requires confirm: true' });
            }

            const existing = await serviceAreaRepo.getServiceAreaById(req.params.id);
            if (!existing) {
                return res.status(404).json({ error: 'Service area not found' });
            }

            const gate = serviceAreaRepo.isPublishableServiceArea(existing);
            if (!gate.ok) {
                return res.status(400).json({ error: gate.message });
            }

            const updated = await serviceAreaRepo.updateServiceArea(req.params.id, { isPublic: true });
            await auditLogger.log({
                userId: req.session.adminUserId!,
                action: 'PUBLISH_SERVICE_AREA',
                entity: 'ServiceArea',
                entityId: req.params.id,
                details: `Published service area: ${existing.city} / ${existing.areaName}`,
                oldValue: { isPublic: existing.isPublic },
                newValue: { isPublic: true },
                req,
            }).catch(() => {});

            res.json(updated);
        } catch (error) {
            logRouteError('ServiceAreas.Publish', req, error);
            res.status(500).json({ error: 'Failed to publish service area' });
        }
    },
);

// POST /api/admin/service-areas/:id/unpublish — Super Admin map.manageAreas only
router.post(
    '/api/admin/service-areas/:id/unpublish',
    requireAdminAuth,
    requireGranularPermission('map.manageAreas'),
    async (req: Request, res: Response) => {
        try {
            const parsed = publicationSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ error: 'Unpublication requires confirm: true' });
            }

            const existing = await serviceAreaRepo.getServiceAreaById(req.params.id);
            if (!existing) {
                return res.status(404).json({ error: 'Service area not found' });
            }

            const updated = await serviceAreaRepo.updateServiceArea(req.params.id, { isPublic: false });
            await auditLogger.log({
                userId: req.session.adminUserId!,
                action: 'UNPUBLISH_SERVICE_AREA',
                entity: 'ServiceArea',
                entityId: req.params.id,
                details: `Unpublished service area: ${existing.city} / ${existing.areaName}`,
                oldValue: { isPublic: existing.isPublic },
                newValue: { isPublic: false },
                req,
            }).catch(() => {});

            res.json(updated);
        } catch (error) {
            logRouteError('ServiceAreas.Unpublish', req, error);
            res.status(500).json({ error: 'Failed to unpublish service area' });
        }
    },
);

// ── Admin Analytics — Super Admin + Manager ────────────────────────────────

// GET /api/admin/area-analytics
router.get(
    '/api/admin/area-analytics',
    requireAdminAuth,
    requireAnyGranularPermission(['map.viewAreaAnalytics', 'map.manageAreas']),
    async (req: Request, res: Response) => {
        try {
            const parsed = analyticsQuerySchema.safeParse(req.query);
            if (!parsed.success) {
                return res.status(400).json({ error: 'Invalid query parameters' });
            }

            const { startDate: startStr, endDate: endStr, areaId } = parsed.data;

            const startDate = parseDateParam(startStr, 'startDate', res);
            if (startDate === 'error') return;
            const endDate = parseDateParam(endStr, 'endDate', res);
            if (endDate === 'error') return;

            if (startDate && endDate && endDate < startDate) {
                return res.status(400).json({ error: 'endDate must not be earlier than startDate' });
            }

            const params: serviceAreaRepo.AreaAnalyticsParams = {
                startDate,
                endDate,
                areaId: areaId ?? null,
            };

            const rows = await serviceAreaRepo.getAreaAnalytics(params);

            res.json({
                rows,
                dateRange: {
                    startDate: params.startDate?.toISOString() ?? null,
                    endDate: params.endDate?.toISOString() ?? null,
                },
                total: rows.length,
            });
        } catch (error) {
            logRouteError('ServiceAreas.Analytics', req, error);
            res.status(500).json({ error: 'Failed to fetch area analytics' });
        }
    },
);

// GET /api/admin/area-map-data — Phase Map-02
// Returns area hierarchy + safe centroid/boundary + aggregates.
// Never exposes customer records, addresses, phones, notes, IDs, or exact request locations.
router.get(
    '/api/admin/area-map-data',
    requireAdminAuth,
    requireAnyGranularPermission(['map.viewAreaAnalytics', 'map.manageAreas']),
    async (req: Request, res: Response) => {
        try {
            const parsed = analyticsQuerySchema.safeParse(req.query);
            if (!parsed.success) {
                return res.status(400).json({ error: 'Invalid query parameters' });
            }

            const { startDate: startStr, endDate: endStr, areaId } = parsed.data;

            const startDate = parseDateParam(startStr, 'startDate', res);
            if (startDate === 'error') return;
            const endDate = parseDateParam(endStr, 'endDate', res);
            if (endDate === 'error') return;

            if (startDate && endDate && endDate < startDate) {
                return res.status(400).json({ error: 'endDate must not be earlier than startDate' });
            }

            const params: serviceAreaRepo.AreaAnalyticsParams = {
                startDate,
                endDate,
                areaId: areaId ?? null,
            };

            const rows = await serviceAreaRepo.getAreaMapData(params);

            res.json({
                areas: rows.map((r) => ({
                    id: r.id,
                    city: r.city,
                    areaName: r.areaName,
                    subareaName: r.subareaName ?? null,
                    blockOrSector: r.blockOrSector ?? null,
                    isActive: r.isActive,
                    isPublic: r.isPublic,
                    centroidLatitude: r.centroidLatitude ?? null,
                    centroidLongitude: r.centroidLongitude ?? null,
                    boundaryGeoJson: r.boundaryGeoJson ?? null,
                    demandLevel: getDemandBucket(r.serviceRequestCount),
                    serviceRequestCount: r.serviceRequestCount,
                    jobCount: r.jobCount,
                    completedJobCount: r.completedJobCount,
                    billedTotal: r.billedTotal,
                    collectedTotal: r.collectedTotal,
                    warrantyClaimCount: r.warrantyClaimCount,
                })),
                dateRange: {
                    startDate: params.startDate?.toISOString() ?? null,
                    endDate: params.endDate?.toISOString() ?? null,
                },
                total: rows.length,
            });
        } catch (error) {
            logRouteError('ServiceAreas.MapData', req, error);
            res.status(500).json({ error: 'Failed to fetch area map data' });
        }
    },
);

// ── Public Customer API ────────────────────────────────────────────────────
// Public map geometry represents broad service areas; customer and operational records stay private.
// Publication gate: is_active AND is_public only.
// MAP-PUBLIC-LEAK-HOTFIX: never HTTP-cache publication payloads (stale lists re-expose unpublished areas).

function setPublicAreaNoStore(res: Response) {
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
}

/** Defense-in-depth: never serialize a row that is not explicitly public+active. */
function isPubliclyReleasedArea(row: { isActive?: boolean; isPublic?: boolean }) {
    return row.isActive === true && row.isPublic === true;
}

function publicBoundaryGeometry(value: unknown): unknown | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const feature = value as { type?: unknown; geometry?: unknown };
    if (feature.type !== 'Feature' || !feature.geometry) return null;
    return {
        type: 'Feature',
        properties: {},
        geometry: feature.geometry,
    };
}

router.get(
    '/api/public/area-map',
    async (_req: Request, res: Response) => {
        try {
            const rows = await serviceAreaRepo.getAreaMapData({ publicOnly: true });
            setPublicAreaNoStore(res);
            res.json({
                areas: rows
                    .filter(isPubliclyReleasedArea)
                    .map((row) => ({
                        id: row.id,
                        city: row.city,
                        areaName: row.areaName,
                        subareaName: row.subareaName ?? null,
                        blockOrSector: row.blockOrSector ?? null,
                        centroidLatitude: row.centroidLatitude ?? null,
                        centroidLongitude: row.centroidLongitude ?? null,
                        boundaryGeoJson: publicBoundaryGeometry(row.boundaryGeoJson),
                        demandLevel: getDemandBucket(row.serviceRequestCount),
                        demandRange: getPublicDemandRange(row.serviceRequestCount),
                        serviceAvailable: true,
                    })),
            });
        } catch (error) {
            logRouteError('ServiceAreas.PublicMap', _req, error);
            res.status(500).json({ error: 'Failed to fetch service area map' });
        }
    },
);

router.post(
    '/api/public/route-estimate',
    routeEstimateLimiter,
    async (req: Request, res: Response) => {
        try {
            const parsed = routeEstimateSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ error: 'Location must be within Bangladesh' });
            }
            // Privacy: origin coords exist only in this request body; never log body/coords.
            const result = await estimateRoute(parsed.data);
            if (!result) {
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
                res.setHeader('Pragma', 'no-cache');
                return res.status(503).json({ error: 'Service center location is not configured' });
            }
            // Never cache responses that include route geometry derived from customer location.
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.setHeader('Pragma', 'no-cache');
            res.json(result);
        } catch (error) {
            // Do not include req.body (customer coordinates) in logs.
            logRouteError('ServiceAreas.RouteEstimate', req, error);
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.status(500).json({ error: 'Route estimate is temporarily unavailable' });
        }
    },
);

// GET /api/public/area-summary/:areaId
router.get(
    '/api/public/area-summary/:areaId',
    async (req: Request, res: Response) => {
        try {
            const { areaId } = req.params;
            if (!areaId || areaId.length < 1 || areaId.length > 60) {
                return res.status(400).json({ error: 'Invalid area ID' });
            }

            const area = await serviceAreaRepo.getPublicServiceAreaById(areaId);
            if (!area || !isPubliclyReleasedArea(area)) {
                setPublicAreaNoStore(res);
                return res.status(404).json({ error: 'Service area not found' });
            }

            const [analyticsRow] = await serviceAreaRepo.getAreaAnalytics({ areaId });

            const count = analyticsRow?.serviceRequestCount ?? 0;
            const demandLabel = getDemandBucket(count);

            setPublicAreaNoStore(res);
            res.json({
                id: area.id,
                city: area.city,
                areaName: area.areaName,
                subareaName: area.subareaName ?? null,
                blockOrSector: area.blockOrSector ?? null,
                demandLevel: demandLabel,
                serviceAvailable: true,
                // centroid, boundary, finance, keys intentionally omitted from public endpoint
            });
        } catch (error) {
            logRouteError('ServiceAreas.PublicSummary', req, error);
            res.status(500).json({ error: 'Failed to fetch area summary' });
        }
    },
);

// GET /api/public/area-list — published active areas for customer service-request form
router.get(
    '/api/public/area-list',
    async (_req: Request, res: Response) => {
        try {
            const areas = await serviceAreaRepo.getPublicServiceAreas();
            setPublicAreaNoStore(res);
            res.json(
                areas
                    .filter(isPubliclyReleasedArea)
                    .map((a) => ({
                        id: a.id,
                        city: a.city,
                        areaName: a.areaName,
                        subareaName: a.subareaName ?? null,
                        blockOrSector: a.blockOrSector ?? null,
                        // geometry, finance, keys intentionally omitted from public endpoint
                    })),
            );
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch area list' });
        }
    },
);

// ── Admin place search (Photon/OSM) — Map-Search-01 ────────────────────────
// Server-side only. Does not persist, audit, or log query text / coordinates.

const PLACE_QUERY_MIN = 3;
const PLACE_QUERY_MAX = 120;

router.get(
    '/api/public/map-place-search',
    mapPlaceSearchLimiter,
    async (req: Request, res: Response) => {
        try {
            const raw = typeof req.query.q === 'string' ? req.query.q : '';
            const trimmed = raw.trim();
            if (trimmed.length < PLACE_QUERY_MIN || trimmed.length > PLACE_QUERY_MAX) {
                return res.status(400).json({ error: 'Search query must be 3-120 characters' });
            }
            const normalized = normalizePlaceQuery(trimmed);
            if (normalized.length < PLACE_QUERY_MIN) {
                return res.status(400).json({ error: 'Search query must be 3-120 characters' });
            }

            const results = await searchMapPlaces(normalized, { cache: false });
            res.setHeader('Cache-Control', 'private, no-store');
            res.json({ results });
        } catch {
            res.status(503).json({ error: 'Place search is temporarily unavailable' });
        }
    },
);

router.get(
    '/api/admin/map-place-search',
    requireAdminAuth,
    requireAnyGranularPermission(['map.manageAreas', 'map.viewAreaAnalytics']),
    mapPlaceSearchLimiter,
    async (req: Request, res: Response) => {
        try {
            const raw = typeof req.query.q === 'string' ? req.query.q : '';
            const trimmed = raw.trim();
            if (trimmed.length < PLACE_QUERY_MIN || trimmed.length > PLACE_QUERY_MAX) {
                return res.status(400).json({ error: 'Search query must be 3–120 characters' });
            }
            const normalized = normalizePlaceQuery(trimmed);
            if (normalized.length < PLACE_QUERY_MIN) {
                return res.status(400).json({ error: 'Search query must be 3–120 characters' });
            }

            const results = await searchMapPlaces(normalized);
            res.setHeader('Cache-Control', 'private, no-store');
            res.json({ results });
        } catch {
            // Never surface provider errors or query details
            res.status(503).json({ error: 'Place search is temporarily unavailable' });
        }
    },
);

router.get(
    '/api/admin/map-boundary-search',
    requireAdminAuth,
    requireGranularPermission('map.manageAreas'),
    mapPlaceSearchLimiter,
    async (req: Request, res: Response) => {
        try {
            const raw = typeof req.query.q === 'string' ? req.query.q : '';
            const trimmed = raw.trim();
            if (trimmed.length < PLACE_QUERY_MIN || trimmed.length > PLACE_QUERY_MAX) {
                return res.status(400).json({ error: 'Search query must be 3-120 characters' });
            }
            const normalized = normalizePlaceQuery(trimmed);
            if (normalized.length < PLACE_QUERY_MIN) {
                return res.status(400).json({ error: 'Search query must be 3-120 characters' });
            }

            const candidates = (await searchMapBoundaries(normalized)).filter((candidate) => {
                // Rejected candidates may still be previewed; only require valid rings for non-empty geometry
                if (candidate.confidence === 'reject' && candidate.vertexCount === 0) return true;
                return validateBoundaryGeoJson(candidate.boundaryGeoJson).ok;
            });
            res.setHeader('Cache-Control', 'private, no-store');
            res.json({ candidates });
        } catch {
            res.status(503).json({ error: 'Boundary lookup is temporarily unavailable' });
        }
    },
);

export default router;
