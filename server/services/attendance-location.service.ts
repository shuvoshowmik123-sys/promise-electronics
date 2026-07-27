/**
 * Canonical attendance work-location resolution + accuracy-aware geofence.
 * Single source of truth for classic and mobile attendance routes.
 */

import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db.js";
import * as schema from "../../shared/schema.js";
import type { AttendanceRecord, WorkLocation } from "../../shared/schema.js";

export const MAIN_SERVICE_CENTER_NAME = "Main Service Center";
export const SERVICE_CENTER_WORK_LOCATION_SETTING = "service_center_work_location_id";
export const ATTENDANCE_RADIUS_MIN = 25;
export const ATTENDANCE_RADIUS_MAX = 1000;
export const DEFAULT_ATTENDANCE_RADIUS = 150;
export const ACCURACY_MAX_METERS = 500;

export const BD_LAT_MIN = 20.0;
export const BD_LAT_MAX = 27.0;
export const BD_LON_MIN = 87.5;
export const BD_LON_MAX = 93.0;

export type CanonicalGeofenceStatus =
  | "inside_office"
  | "outside_office"
  | "accuracy_uncertain"
  | "unverified";

export type GeofenceEvaluation = {
  status: CanonicalGeofenceStatus;
  distanceMeters: number | null;
  radiusMeters: number | null;
  accuracyMeters: number | null;
};

export type ServiceCenterLocationView = {
  address: string;
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string;
  attendanceRadiusMeters: number | null;
  canonicalAttendanceConfigured: boolean;
  workLocationId: string | null;
};

export type LocationContextResponse = {
  recordId: string;
  workLocationId: string | null;
  workLocationName: string | null;
  referenceLatitude: number | null;
  referenceLongitude: number | null;
  referenceRadiusMeters: number | null;
  referenceSource: "snapshot" | "current_fallback" | "none";
  checkIn: {
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    distanceMeters: number | null;
    status: string | null;
    timestamp: string | null;
  };
  checkOut: {
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    distanceMeters: number | null;
    status: string | null;
    timestamp: string | null;
  } | null;
};

const EARTH_RADIUS_METERS = 6371000;

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isFiniteCoord(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export function isInBangladeshBounds(lat: number, lng: number): boolean {
  return lat >= BD_LAT_MIN && lat <= BD_LAT_MAX && lng >= BD_LON_MIN && lng <= BD_LON_MAX;
}

export function clampAttendanceRadius(raw: unknown, fallback: number = DEFAULT_ATTENDANCE_RADIUS): number {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  if (rounded < ATTENDANCE_RADIUS_MIN || rounded > ATTENDANCE_RADIUS_MAX) return fallback;
  return rounded;
}

export function seedRadiusFromLegacyEnv(): number {
  return clampAttendanceRadius(process.env.OFFICE_RADIUS_METERS, DEFAULT_ATTENDANCE_RADIUS);
}

export function isConfidentOutsideStatus(status: string | null | undefined): boolean {
  return status === "outside_office" || status === "outside";
}

export function isInsideStatus(status: string | null | undefined): boolean {
  return status === "inside_office" || status === "inside";
}

export function isOffsiteBannerStatus(status: string | null | undefined): boolean {
  return isConfidentOutsideStatus(status);
}

/**
 * Accuracy-aware geofence.
 * Missing/invalid accuracy → unverified (never confidently outside).
 */
export function evaluateAccuracyAwareGeofence(input: {
  employeeLat: unknown;
  employeeLng: unknown;
  accuracyMeters: unknown;
  officeLat: unknown;
  officeLng: unknown;
  radiusMeters: unknown;
}): GeofenceEvaluation {
  if (
    !isFiniteCoord(input.employeeLat) ||
    !isFiniteCoord(input.employeeLng) ||
    input.employeeLat < -90 ||
    input.employeeLat > 90 ||
    input.employeeLng < -180 ||
    input.employeeLng > 180
  ) {
    return { status: "unverified", distanceMeters: null, radiusMeters: null, accuracyMeters: null };
  }

  if (!isFiniteCoord(input.officeLat) || !isFiniteCoord(input.officeLng)) {
    return { status: "unverified", distanceMeters: null, radiusMeters: null, accuracyMeters: null };
  }

  if (!isInBangladeshBounds(input.officeLat, input.officeLng)) {
    return { status: "unverified", distanceMeters: null, radiusMeters: null, accuracyMeters: null };
  }

  const radiusRaw =
    typeof input.radiusMeters === "number"
      ? input.radiusMeters
      : parseFloat(String(input.radiusMeters ?? ""));
  if (
    !Number.isFinite(radiusRaw) ||
    Math.round(radiusRaw) < ATTENDANCE_RADIUS_MIN ||
    Math.round(radiusRaw) > ATTENDANCE_RADIUS_MAX
  ) {
    return { status: "unverified", distanceMeters: null, radiusMeters: null, accuracyMeters: null };
  }
  const radiusMeters = Math.round(radiusRaw);

  const accRaw =
    input.accuracyMeters === null || input.accuracyMeters === undefined || input.accuracyMeters === ""
      ? null
      : typeof input.accuracyMeters === "number"
        ? input.accuracyMeters
        : parseFloat(String(input.accuracyMeters));

  if (accRaw === null || !Number.isFinite(accRaw) || accRaw < 0 || accRaw > ACCURACY_MAX_METERS) {
    const distOnly = Math.round(
      haversineMeters(input.employeeLat, input.employeeLng, input.officeLat, input.officeLng),
    );
    return {
      status: "unverified",
      distanceMeters: distOnly,
      radiusMeters,
      accuracyMeters: accRaw !== null && Number.isFinite(accRaw) ? accRaw : null,
    };
  }

  const accuracyMeters = accRaw;
  const distanceMeters = Math.round(
    haversineMeters(input.employeeLat, input.employeeLng, input.officeLat, input.officeLng),
  );

  if (distanceMeters + accuracyMeters <= radiusMeters) {
    return { status: "inside_office", distanceMeters, radiusMeters, accuracyMeters };
  }
  if (distanceMeters - accuracyMeters > radiusMeters) {
    return { status: "outside_office", distanceMeters, radiusMeters, accuracyMeters };
  }
  return { status: "accuracy_uncertain", distanceMeters, radiusMeters, accuracyMeters };
}

export function evaluateGeofenceForWorkLocation(
  location: WorkLocation | null | undefined,
  input: { latitude: unknown; longitude: unknown; accuracy?: unknown },
): GeofenceEvaluation {
  if (!location) {
    return evaluateAccuracyAwareGeofence({
      employeeLat: input.latitude,
      employeeLng: input.longitude,
      accuracyMeters: input.accuracy,
      officeLat: null,
      officeLng: null,
      radiusMeters: null,
    });
  }
  return evaluateAccuracyAwareGeofence({
    employeeLat: input.latitude,
    employeeLng: input.longitude,
    accuracyMeters: input.accuracy,
    officeLat: location.latitude,
    officeLng: location.longitude,
    radiusMeters: location.radiusMeters,
  });
}

async function getSettingValue(key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .limit(1);
  return row?.value ?? null;
}

async function upsertSettingTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  key: string,
  value: string,
): Promise<void> {
  const id = randomUUID();
  await tx
    .insert(schema.settings)
    .values({ id, key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.settings.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function readCanonicalServiceCenterLocation(): Promise<ServiceCenterLocationView> {
  const [address, latitude, longitude, googlePlaceId, linkedId] = await Promise.all([
    getSettingValue("service_center_contact"),
    getSettingValue("service_center_latitude"),
    getSettingValue("service_center_longitude"),
    getSettingValue("service_center_google_place_id"),
    getSettingValue(SERVICE_CENTER_WORK_LOCATION_SETTING),
  ]);

  const parsedLat = latitude ? Number(latitude) : null;
  const parsedLng = longitude ? Number(longitude) : null;
  const lat = Number.isFinite(parsedLat) ? parsedLat : null;
  const lng = Number.isFinite(parsedLng) ? parsedLng : null;

  let workLocation: WorkLocation | null = null;
  if (linkedId) {
    const [row] = await db
      .select()
      .from(schema.workLocations)
      .where(eq(schema.workLocations.id, linkedId))
      .limit(1);
    workLocation = row ?? null;
  }

  return {
    address: address ?? "",
    latitude: lat,
    longitude: lng,
    googlePlaceId: googlePlaceId ?? "",
    attendanceRadiusMeters: workLocation?.radiusMeters ?? null,
    canonicalAttendanceConfigured: Boolean(
      workLocation &&
        workLocation.status === "Active" &&
        isFiniteCoord(workLocation.latitude) &&
        isFiniteCoord(workLocation.longitude),
    ),
    workLocationId: workLocation?.id ?? linkedId,
  };
}

/**
 * Resolution order:
 * 1. Active users.defaultWorkLocationId
 * 2. Active work location matching users.storeId
 * 3. Canonical Main Service Center (Area Intelligence link)
 * 4. null
 */
export async function resolveAttendanceWorkLocation(
  user: Pick<schema.User, "defaultWorkLocationId" | "storeId">,
): Promise<WorkLocation | null> {
  if (user.defaultWorkLocationId) {
    const [direct] = await db
      .select()
      .from(schema.workLocations)
      .where(
        and(
          eq(schema.workLocations.id, user.defaultWorkLocationId),
          eq(schema.workLocations.status, "Active"),
        ),
      )
      .limit(1);
    if (direct) return direct;
  }

  if (user.storeId) {
    const [storeLoc] = await db
      .select()
      .from(schema.workLocations)
      .where(
        and(eq(schema.workLocations.storeId, user.storeId), eq(schema.workLocations.status, "Active")),
      )
      .limit(1);
    if (storeLoc) return storeLoc;
  }

  const linkedId = await getSettingValue(SERVICE_CENTER_WORK_LOCATION_SETTING);
  if (linkedId) {
    const [canonical] = await db
      .select()
      .from(schema.workLocations)
      .where(and(eq(schema.workLocations.id, linkedId), eq(schema.workLocations.status, "Active")))
      .limit(1);
    if (canonical) return canonical;
  }

  // Fallback: active row named Main Service Center (linked setting missing but row exists)
  const [byName] = await db
    .select()
    .from(schema.workLocations)
    .where(
      and(
        eq(schema.workLocations.name, MAIN_SERVICE_CENTER_NAME),
        eq(schema.workLocations.status, "Active"),
      ),
    )
    .limit(1);
  return byName ?? null;
}

/**
 * Idempotent: if valid service-center coords exist without linked work location, create/link one.
 * Never invents Dhaka coordinates. Never mutates user assignments.
 */
export async function reconcileCanonicalServiceCenterWorkLocation(): Promise<{
  action: "noop" | "linked_existing" | "created" | "no_coords";
  workLocationId: string | null;
}> {
  const latRaw = await getSettingValue("service_center_latitude");
  const lngRaw = await getSettingValue("service_center_longitude");
  const linkedId = await getSettingValue(SERVICE_CENTER_WORK_LOCATION_SETTING);

  const lat = latRaw ? Number(latRaw) : NaN;
  const lng = lngRaw ? Number(lngRaw) : NaN;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && isInBangladeshBounds(lat, lng);

  if (linkedId) {
    const [existing] = await db
      .select()
      .from(schema.workLocations)
      .where(eq(schema.workLocations.id, linkedId))
      .limit(1);
    if (existing) {
      return { action: "noop", workLocationId: existing.id };
    }
  }

  if (!hasCoords) {
    return { action: "no_coords", workLocationId: null };
  }

  // Prefer single existing Main Service Center row (avoid duplicates on partial runs)
  const [named] = await db
    .select()
    .from(schema.workLocations)
    .where(eq(schema.workLocations.name, MAIN_SERVICE_CENTER_NAME))
    .limit(1);

  if (named) {
    await db
      .insert(schema.settings)
      .values({
        id: randomUUID(),
        key: SERVICE_CENTER_WORK_LOCATION_SETTING,
        value: named.id,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.settings.key,
        set: { value: named.id, updatedAt: new Date() },
      });
    console.log(
      `[AttendanceLocation] Linked existing Main Service Center work location ${named.id}`,
    );
    return { action: "linked_existing", workLocationId: named.id };
  }

  const radius = seedRadiusFromLegacyEnv();
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(schema.workLocations).values({
      id,
      name: MAIN_SERVICE_CENTER_NAME,
      storeId: null,
      latitude: lat,
      longitude: lng,
      radiusMeters: radius,
      status: "Active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await upsertSettingTx(tx, SERVICE_CENTER_WORK_LOCATION_SETTING, id);
  });

  console.log(`[AttendanceLocation] Created canonical Main Service Center work location ${id}`);
  return { action: "created", workLocationId: id };
}

export type UpdateServiceCenterInput = {
  address: string;
  latitude: number | null;
  longitude: number | null;
  googlePlaceId: string;
  attendanceRadiusMeters?: number;
};

/**
 * Atomically update Area Intelligence settings + linked Main Service Center work location.
 * Does not mutate user defaultWorkLocationId assignments.
 */
export async function updateServiceCenterLocationAtomic(
  input: UpdateServiceCenterInput,
): Promise<ServiceCenterLocationView> {
  const previousLinkedId = await getSettingValue(SERVICE_CENTER_WORK_LOCATION_SETTING);
  let previousRadius = DEFAULT_ATTENDANCE_RADIUS;
  if (previousLinkedId) {
    const [prevLoc] = await db
      .select()
      .from(schema.workLocations)
      .where(eq(schema.workLocations.id, previousLinkedId))
      .limit(1);
    if (prevLoc) previousRadius = prevLoc.radiusMeters;
  } else {
    previousRadius = seedRadiusFromLegacyEnv();
  }

  const nextRadius =
    input.attendanceRadiusMeters !== undefined
      ? clampAttendanceRadius(input.attendanceRadiusMeters, previousRadius)
      : clampAttendanceRadius(previousRadius, previousRadius);

  if (
    input.attendanceRadiusMeters !== undefined &&
    (input.attendanceRadiusMeters < ATTENDANCE_RADIUS_MIN ||
      input.attendanceRadiusMeters > ATTENDANCE_RADIUS_MAX ||
      !Number.isInteger(input.attendanceRadiusMeters))
  ) {
    throw Object.assign(new Error("attendanceRadiusMeters must be an integer between 25 and 1000"), {
      status: 400,
    });
  }

  await db.transaction(async (tx) => {
    await upsertSettingTx(tx, "service_center_contact", input.address);
    await upsertSettingTx(tx, "service_center_latitude", input.latitude?.toString() ?? "");
    await upsertSettingTx(tx, "service_center_longitude", input.longitude?.toString() ?? "");
    await upsertSettingTx(tx, "service_center_google_place_id", input.googlePlaceId);

    const hasCoords =
      input.latitude != null &&
      input.longitude != null &&
      Number.isFinite(input.latitude) &&
      Number.isFinite(input.longitude) &&
      isInBangladeshBounds(input.latitude, input.longitude);

    if (!hasCoords) {
      // Clear coords settings already written; keep linked work location row if present
      // (do not delete branches). Leave radius as-is on existing row.
      return;
    }

    let targetId = previousLinkedId;
    if (targetId) {
      const [existing] = await tx
        .select()
        .from(schema.workLocations)
        .where(eq(schema.workLocations.id, targetId))
        .limit(1);
      if (!existing) targetId = null;
    }

    if (!targetId) {
      const [named] = await tx
        .select()
        .from(schema.workLocations)
        .where(eq(schema.workLocations.name, MAIN_SERVICE_CENTER_NAME))
        .limit(1);
      if (named) targetId = named.id;
    }

    if (targetId) {
      await tx
        .update(schema.workLocations)
        .set({
          name: MAIN_SERVICE_CENTER_NAME,
          latitude: input.latitude!,
          longitude: input.longitude!,
          radiusMeters: nextRadius,
          status: "Active",
          updatedAt: new Date(),
        })
        .where(eq(schema.workLocations.id, targetId));
      await upsertSettingTx(tx, SERVICE_CENTER_WORK_LOCATION_SETTING, targetId);
    } else {
      const id = randomUUID();
      await tx.insert(schema.workLocations).values({
        id,
        name: MAIN_SERVICE_CENTER_NAME,
        storeId: null,
        latitude: input.latitude!,
        longitude: input.longitude!,
        radiusMeters: nextRadius,
        status: "Active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await upsertSettingTx(tx, SERVICE_CENTER_WORK_LOCATION_SETTING, id);
    }
  });

  return readCanonicalServiceCenterLocation();
}

export function snapshotFieldsFromLocation(
  location: WorkLocation | null,
  side: "checkIn" | "checkOut",
): Partial<AttendanceRecord> {
  if (!location) return {};
  if (side === "checkIn") {
    return {
      workLocationId: location.id,
      checkInReferenceLat: location.latitude,
      checkInReferenceLng: location.longitude,
      checkInReferenceRadiusMeters: location.radiusMeters,
    };
  }
  return {
    workLocationId: location.id,
    checkOutReferenceLat: location.latitude,
    checkOutReferenceLng: location.longitude,
    checkOutReferenceRadiusMeters: location.radiusMeters,
  };
}

export async function buildAttendanceLocationContext(
  record: AttendanceRecord,
): Promise<LocationContextResponse> {
  let workLocation: WorkLocation | null = null;
  if (record.workLocationId) {
    const [row] = await db
      .select()
      .from(schema.workLocations)
      .where(eq(schema.workLocations.id, record.workLocationId))
      .limit(1);
    workLocation = row ?? null;
  }

  const hasInSnapshot =
    isFiniteCoord(record.checkInReferenceLat) && isFiniteCoord(record.checkInReferenceLng);
  const hasOutSnapshot =
    isFiniteCoord(record.checkOutReferenceLat) && isFiniteCoord(record.checkOutReferenceLng);

  let referenceLatitude: number | null = null;
  let referenceLongitude: number | null = null;
  let referenceRadiusMeters: number | null = null;
  let referenceSource: LocationContextResponse["referenceSource"] = "none";

  if (hasInSnapshot) {
    referenceLatitude = record.checkInReferenceLat!;
    referenceLongitude = record.checkInReferenceLng!;
    referenceRadiusMeters = record.checkInReferenceRadiusMeters ?? null;
    referenceSource = "snapshot";
  } else if (hasOutSnapshot) {
    referenceLatitude = record.checkOutReferenceLat!;
    referenceLongitude = record.checkOutReferenceLng!;
    referenceRadiusMeters = record.checkOutReferenceRadiusMeters ?? null;
    referenceSource = "snapshot";
  } else if (workLocation) {
    referenceLatitude = workLocation.latitude;
    referenceLongitude = workLocation.longitude;
    referenceRadiusMeters = workLocation.radiusMeters;
    referenceSource = "current_fallback";
  }

  return {
    recordId: record.id,
    workLocationId: record.workLocationId ?? workLocation?.id ?? null,
    workLocationName: workLocation?.name ?? null,
    referenceLatitude,
    referenceLongitude,
    referenceRadiusMeters,
    referenceSource,
    checkIn: {
      latitude: record.checkInLat ?? null,
      longitude: record.checkInLng ?? null,
      accuracy: record.checkInAccuracy ?? null,
      distanceMeters: record.checkInDistanceMeters ?? null,
      status: record.checkInGeofenceStatus ?? null,
      timestamp: record.checkInTime ? new Date(record.checkInTime).toISOString() : null,
    },
    checkOut: record.checkOutTime
      ? {
          latitude: record.checkOutLat ?? null,
          longitude: record.checkOutLng ?? null,
          accuracy: record.checkOutAccuracy ?? null,
          distanceMeters: record.checkOutDistanceMeters ?? null,
          status: record.checkOutGeofenceStatus ?? null,
          timestamp: new Date(record.checkOutTime).toISOString(),
        }
      : null,
  };
}

/** Safe distance text for alerts — never include coordinates. */
export function formatDistanceForAlert(distanceMeters: number): string {
  if (distanceMeters >= 1000) return `${(distanceMeters / 1000).toFixed(1)}km`;
  return `${Math.round(distanceMeters)}m`;
}
