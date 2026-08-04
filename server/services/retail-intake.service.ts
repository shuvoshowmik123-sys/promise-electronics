import { createHmac } from "crypto";
import { db } from "../db.js";
import { sql, eq } from "drizzle-orm";
import * as schema from "../../shared/schema.js";
import { nanoid } from "../repositories/base.js";
import { normalizePhone } from "../utils/phone.js";
import { NO_CUSTOMER_PASSWORD } from "./customer-password.js";
import { getInventoryItem } from "../repositories/inventory.repository.js";
import { isSelectableCustomerService } from "../utils/service-visibility.js";
import type { ServiceRequest } from "../../shared/schema.js";

const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
const BD_MOBILE_RE = /^1\d{9}$/;
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;
const IDEMPOTENCY_KEY_CONSTRAINT = "uidx_service_requests_client_request_id";

/** SERVICE-INTAKE-RELIABILITY-01D — bounds applied inside createRetailServiceRequest (all ingress). */
export const INTAKE_PAYLOAD_LIMITS = {
    customerName: { min: 2, max: 120 },
    brand: { min: 1, max: 80 },
    modelNumber: { max: 80 },
    primaryIssue: { min: 1, max: 300 },
    symptoms: { max: 1000 },
    description: { max: 2000 },
    address: { max: 500 },
    screenSize: { max: 40 },
    mediaUrlCount: 5,
    mediaUrlLength: 2048,
    mediaPayloadTotalChars: 12_000,
    serviceId: { max: 128 },
    serviceAreaId: { max: 128 },
} as const;

const SAFE_URL_RE = /^https?:\/\/[^\s<>"']{1,2040}$/i;

export type IntakeSource =
  | "public_web"
  | "customer_portal"
  | "mobile_admin"
  | "whatsapp"
  | "messenger"
  | "ai_chat"
  | "quote_request";

export class IntakeError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
        super(message);
        this.name = "IntakeError";
        this.status = status;
        this.code = code;
    }
}

export interface CanonicalIntakeInput {
    brand: string;
    primaryIssue: string;
    customerName: string;
    phone: string;
    screenSize?: string | null;
    modelNumber?: string | null;
    symptoms?: string | null;
    description?: string | null;
    address?: string | null;
    mediaUrls?: string | null;
    servicePreference?: string | null;
    serviceMode?: string | null;
    requestIntent?: string | null;
    serviceId?: string | null;
    serviceAreaId?: string | null;
    /** PICKUP-MAP-PIN-01 — customer-dropped pin. Both or neither; never one alone. */
    pickupLatitude?: number | null;
    pickupLongitude?: number | null;
    pickupLocationSource?: string | null;
    isQuote?: boolean;
    customerId?: string | null;
    source?: string | null;
    intakeSource: IntakeSource;
    clientRequestId?: string | null;
    idempotencyKey?: string | null;
    /** Initial tracking status set inside the intake transaction. */
    initialTrackingStatus?: string | null;
}

export interface CanonicalIntakeResult {
    serviceRequest: ServiceRequest;
    idempotent: boolean;
    duplicateWindow: boolean;
}

/** Public/customer response sanitizer — strips intake-internal columns. */
export function sanitizePublicServiceRequest<T extends Record<string, unknown> | null | undefined>(
    sr: T,
): T {
    if (!sr || typeof sr !== "object") return sr;
    const {
        idempotencyFingerprint: _fp,
        clientRequestId: _cr,
        intakeSource: _is,
        phoneNormalized: _pn,
        source: _src,
        ...rest
    } = sr as Record<string, unknown>;
    return rest as T;
}

function getFingerprintSecret(): string {
    const secret = process.env.INTAKE_FINGERPRINT_SECRET;
    if (!secret || secret.trim().length < 16) {
        throw new IntakeError(
            500,
            "INTAKE_FINGERPRINT_SECRET_MISSING",
            "Server configuration error.",
        );
    }
    return secret;
}

/**
 * Canonical text part for fingerprint material / client material keys.
 * NFKC + lower + trim + collapse internal whitespace. Never store this raw.
 */
export function canonicalMaterialPart(value: unknown): string {
    return String(value ?? "")
        .normalize("NFKC")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
}

/** Canonical pipe material (never stored — only HMAC digest is persisted). */
export function buildFingerprintMaterial(input: {
    phone: string;
    requestIntent?: string | null;
    serviceId?: string | null;
    brand?: string | null;
    modelNumber?: string | null;
    screenSize?: string | null;
    primaryIssue?: string | null;
    serviceMode?: string | null;
    servicePreference?: string | null;
    address?: string | null;
}): string {
    const phoneNorm = normalizePhone(input.phone) || "";
    return [
        phoneNorm,
        canonicalMaterialPart(input.requestIntent || "repair"),
        canonicalMaterialPart(input.serviceId),
        canonicalMaterialPart(input.brand),
        canonicalMaterialPart(input.modelNumber),
        canonicalMaterialPart(input.screenSize),
        canonicalMaterialPart(input.primaryIssue),
        canonicalMaterialPart(input.serviceMode || input.servicePreference),
        canonicalMaterialPart(input.address),
    ].join("|");
}

/** HMAC-SHA-256 digest of canonical material. Digest only is stored. */
export function computeIdempotencyFingerprint(input: CanonicalIntakeInput): string {
    const material = buildFingerprintMaterial(input);
    return createHmac("sha256", getFingerprintSecret())
        .update(material, "utf8")
        .digest("hex");
}

/** Re-hash a legacy raw pipe fingerprint without logging its value. */
export function hmacLegacyFingerprintMaterial(rawMaterial: string): string {
    return createHmac("sha256", getFingerprintSecret())
        .update(rawMaterial, "utf8")
        .digest("hex");
}

export function requireValidBdMobile(phone: string | null | undefined): string {
    const normalized = normalizePhone(phone);
    if (!normalized || !BD_MOBILE_RE.test(normalized)) {
        throw new IntakeError(
            400,
            "INVALID_PHONE",
            "A valid Bangladesh mobile number is required (e.g. 01XXXXXXXXX).",
        );
    }
    return normalized;
}

/**
 * Strict single Idempotency-Key: ^[A-Za-z0-9._:-]{8,128}$
 * Rejects array/multi, whitespace, control chars, commas, HTML-like, oversized.
 * Never logs the submitted key.
 */
export function parseIdempotencyKeyHeader(
    header: string | string[] | undefined | null,
): string | null {
    if (header === undefined || header === null || header === "") {
        return null;
    }
    if (Array.isArray(header)) {
        if (header.length === 0) return null;
        if (header.length > 1) {
            throw new IntakeError(400, "INVALID_IDEMPOTENCY_KEY", "Invalid request key format.");
        }
        return parseIdempotencyKeyHeader(header[0]);
    }
    if (typeof header !== "string") {
        throw new IntakeError(400, "INVALID_IDEMPOTENCY_KEY", "Invalid request key format.");
    }
    // Comma-joined multi-header / multi-value
    if (header.includes(",")) {
        throw new IntakeError(400, "INVALID_IDEMPOTENCY_KEY", "Invalid request key format.");
    }
    // Whitespace (including leading/trailing) or control characters
    if (/[\s\x00-\x1f\x7f]/.test(header)) {
        throw new IntakeError(400, "INVALID_IDEMPOTENCY_KEY", "Invalid request key format.");
    }
    // HTML-like angle brackets
    if (/[<>]/.test(header)) {
        throw new IntakeError(400, "INVALID_IDEMPOTENCY_KEY", "Invalid request key format.");
    }
    if (!IDEMPOTENCY_KEY_RE.test(header)) {
        throw new IntakeError(400, "INVALID_IDEMPOTENCY_KEY", "Invalid request key format.");
    }
    return header;
}

function validateIdempotencyKey(key: string): void {
    parseIdempotencyKeyHeader(key);
}

function rejectPayload(message = "Invalid request data."): never {
    throw new IntakeError(400, "INVALID_INTAKE_PAYLOAD", message);
}

function boundString(
    value: unknown,
    field: string,
    max: number,
    min = 0,
): string | null {
    if (value === undefined || value === null || value === "") {
        if (min > 0) rejectPayload(`${field} is required.`);
        return null;
    }
    if (typeof value !== "string") rejectPayload("Invalid request data.");
    const s = value.trim();
    if (s.length < min) rejectPayload(`${field} is required.`);
    if (s.length > max) rejectPayload("Request data exceeds allowed size.");
    return s;
}

/**
 * Bounded validation for all retail intake ingress.
 * Rejects oversized/malformed payloads before any DB write.
 * Never echoes supplied payload content in errors.
 */
export function validateCanonicalIntakePayload(input: CanonicalIntakeInput): void {
    const L = INTAKE_PAYLOAD_LIMITS;
    boundString(input.customerName, "customerName", L.customerName.max, L.customerName.min);
    boundString(input.brand, "brand", L.brand.max, L.brand.min);
    boundString(input.primaryIssue, "primaryIssue", L.primaryIssue.max, L.primaryIssue.min);
    boundString(input.modelNumber, "modelNumber", L.modelNumber.max);
    boundString(input.symptoms, "symptoms", L.symptoms.max);
    boundString(input.description, "description", L.description.max);
    boundString(input.address, "address", L.address.max);
    boundString(input.screenSize, "screenSize", L.screenSize.max);
    boundString(input.serviceId, "serviceId", L.serviceId.max);
    boundString(input.serviceAreaId, "serviceAreaId", L.serviceAreaId.max);

    if (input.servicePreference != null && input.servicePreference !== "") {
        const ok = ["home_pickup", "service_center", "both"].includes(String(input.servicePreference));
        if (!ok) rejectPayload("Invalid request data.");
    }
    if (input.serviceMode != null && input.serviceMode !== "") {
        const ok = ["pickup", "service_center", "drop_off"].includes(String(input.serviceMode));
        if (!ok) rejectPayload("Invalid request data.");
    }
    if (input.requestIntent != null && input.requestIntent !== "") {
        const ok = ["quote", "repair"].includes(String(input.requestIntent));
        if (!ok) rejectPayload("Invalid request data.");
    }

    // PICKUP-MAP-PIN-01 — mirrors chk_service_requests_pickup_latlng so a bad pin
    // is refused with a clean 400 instead of surfacing as a DB constraint error.
    const hasLat = input.pickupLatitude != null;
    const hasLon = input.pickupLongitude != null;
    if (hasLat !== hasLon) rejectPayload("Invalid request data.");
    if (hasLat && hasLon) {
        const lat = Number(input.pickupLatitude);
        const lon = Number(input.pickupLongitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) rejectPayload("Invalid request data.");
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) rejectPayload("Invalid request data.");
    }
    if (input.pickupLocationSource != null && input.pickupLocationSource !== "") {
        const ok = ["map_pin", "gps", "manual_address"].includes(String(input.pickupLocationSource));
        if (!ok) rejectPayload("Invalid request data.");
    }

    if (input.mediaUrls != null && input.mediaUrls !== "") {
        if (typeof input.mediaUrls !== "string") rejectPayload("Invalid request data.");
        if (input.mediaUrls.length > L.mediaPayloadTotalChars) {
            rejectPayload("Request data exceeds allowed size.");
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(input.mediaUrls);
        } catch {
            rejectPayload("Invalid request data.");
        }
        if (!Array.isArray(parsed)) rejectPayload("Invalid request data.");
        if (parsed.length > L.mediaUrlCount) rejectPayload("Request data exceeds allowed size.");
        for (const item of parsed) {
            // Two accepted shapes:
            //   1. "https://..."                                  (legacy plain URL)
            //   2. { url, fileId?, resourceType? }                (current clients)
            // Shape 2 is canonical — fileId is required to clean up orphaned R2
            // objects. Both customer intake surfaces (repair-request.tsx and
            // MobileServiceWizard.tsx) send it, and getMediaUrls() already reads
            // both. Rejecting objects here made every request WITH an attached
            // photo fail "Invalid request data." while photo-less ones succeeded.
            const url =
                typeof item === "string"
                    ? item
                    : item && typeof item === "object" && typeof (item as any).url === "string"
                        ? (item as any).url
                        : null;
            if (url === null) rejectPayload("Invalid request data.");
            if (url.length > L.mediaUrlLength) rejectPayload("Request data exceeds allowed size.");
            if (!SAFE_URL_RE.test(url)) rejectPayload("Invalid request data.");
        }
    }
}

function pgConstraintName(error: any): string {
    return String(error?.constraint || error?.constraint_name || error?.message || "");
}

function isUniqueViolation(error: any): boolean {
    return error?.code === "23505" || /duplicate key/i.test(String(error?.message || ""));
}

function isIdempotencyKeyUniqueViolation(error: any): boolean {
    const c = pgConstraintName(error);
    return c.includes(IDEMPOTENCY_KEY_CONSTRAINT) || c.includes("client_request_id");
}

function isTicketNumberUniqueViolation(error: any): boolean {
    const c = pgConstraintName(error);
    return c.includes("ticket_number") || c.includes("ticketNumber");
}

async function loadServiceRequestById(
    tx: any,
    id: string,
): Promise<ServiceRequest> {
    const [full] = await tx
        .select()
        .from(schema.serviceRequests)
        .where(eq(schema.serviceRequests.id, id))
        .limit(1);
    return full;
}

async function findByClientKey(
    tx: any,
    clientKey: string,
    intakeSource: IntakeSource,
): Promise<any | null> {
    const keyRes = await tx.execute(sql`
        SELECT id, idempotency_fingerprint FROM service_requests
        WHERE client_request_id = ${clientKey} AND intake_source = ${intakeSource}
        LIMIT 1
    `);
    const keyRows = (keyRes as any).rows ?? keyRes;
    if (Array.isArray(keyRows) && keyRows.length > 0) return keyRows[0];
    return null;
}

function resolveInitialTrackingStatus(input: CanonicalIntakeInput): string {
    if (input.initialTrackingStatus) return input.initialTrackingStatus;
    if (input.isQuote) return "Request Received";
    if (input.servicePreference === "service_center") return "Awaiting Drop-off";
    if (input.servicePreference === "home_pickup") return "Arriving to Receive";
    return "Request Received";
}

/**
 * Under phone advisory lock:
 * - Prefer Active customers with matching phone_normalized (deterministic ORDER BY).
 * - Else find legacy Active customers with blank phone_normalized whose phone normalizes
 *   to the same value; backfill phone_normalized and link (no merge of duplicates).
 * - Else create a new customer.
 * Does not log phone values or identities.
 */
async function resolveCustomerUnderPhoneLock(
    tx: any,
    phoneNormalized: string,
    rawPhone: string,
    customerName: string,
): Promise<string> {
    await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`intake_cust:${phoneNormalized}`}))`,
    );

    const byNorm = await tx.execute(sql`
        SELECT id FROM users
        WHERE phone_normalized = ${phoneNormalized}
          AND role = 'Customer'
          AND status = 'Active'
        ORDER BY joined_at ASC NULLS LAST, id ASC
    `);
    const normRows = (byNorm as any).rows ?? byNorm;
    if (Array.isArray(normRows) && normRows.length > 0) {
        return normRows[0].id;
    }

    // Legacy: blank/null phone_normalized — match by normalizing raw phone (no PII logs)
    const legacyRes = await tx.execute(sql`
        SELECT id, phone FROM users
        WHERE role = 'Customer'
          AND status = 'Active'
          AND (phone_normalized IS NULL OR btrim(phone_normalized) = '')
          AND phone IS NOT NULL
        ORDER BY joined_at ASC NULLS LAST, id ASC
    `);
    const legacyRows = ((legacyRes as any).rows ?? legacyRes) as Array<{ id: string; phone: string }>;
    const legacyMatches = Array.isArray(legacyRows)
        ? legacyRows.filter((r) => normalizePhone(r.phone) === phoneNormalized)
        : [];

    if (legacyMatches.length > 0) {
        const chosen = legacyMatches[0];
        await tx.execute(sql`
            UPDATE users
            SET phone_normalized = ${phoneNormalized}
            WHERE id = ${chosen.id}
              AND (phone_normalized IS NULL OR btrim(phone_normalized) = '')
        `);
        return chosen.id;
    }

    try {
        const newUser = await tx
            .insert(schema.users)
            .values({
                id: nanoid(),
                name: customerName,
                phone: rawPhone,
                phoneNormalized: phoneNormalized,
                role: "Customer",
                status: "Active",
                customerAccountState: "unclaimed",
                // Was `await bcrypt.hash(nanoid(), 12)`: ~2s of cost-12 hashing,
                // inside this transaction, while holding a pool connection and the
                // advisory lock above — to protect a value nothing can ever verify
                // against. See NO_CUSTOMER_PASSWORD.
                password: NO_CUSTOMER_PASSWORD,
                permissions: "{}",
            } as any)
            .returning();
        return newUser[0].id;
    } catch (userErr: any) {
        if (isUniqueViolation(userErr)) {
            const retryRows = await tx.execute(sql`
                SELECT id FROM users
                WHERE (
                    phone_normalized = ${phoneNormalized}
                    OR (phone IS NOT NULL AND (phone_normalized IS NULL OR btrim(phone_normalized) = ''))
                  )
                  AND role = 'Customer'
                ORDER BY joined_at ASC NULLS LAST, id ASC
                LIMIT 20
            `);
            const retry = ((retryRows as any).rows ?? retryRows) as Array<{ id: string }>;
            if (Array.isArray(retry) && retry.length > 0) {
                // Re-check by norm first after race
                const again = await tx.execute(sql`
                    SELECT id FROM users
                    WHERE phone_normalized = ${phoneNormalized}
                      AND role = 'Customer'
                    ORDER BY joined_at ASC NULLS LAST, id ASC
                    LIMIT 1
                `);
                const againRows = (again as any).rows ?? again;
                if (Array.isArray(againRows) && againRows.length > 0) return againRows[0].id;
                return retry[0].id;
            }
        }
        throw userErr;
    }
}

/**
 * CUSTOMER-SERVICE-INTENT-01A — verifies a customer-supplied serviceId.
 *
 * null / "" means "Not sure — Check my TV": a legitimate UI state, stored as
 * null so the technician's diagnosis determines the actual work. Never
 * substituted with a placeholder or with services[0].
 *
 * A non-null id must reference a service that exists AND is active. Unknown or
 * deactivated ids are rejected with 400 rather than silently coerced, so a stale
 * bookmark or a tampered payload can never attach a customer request to the
 * wrong service.
 */
async function resolveRequestedServiceId(rawServiceId: string | null | undefined): Promise<string | null> {
    const serviceId = rawServiceId == null ? "" : String(rawServiceId).trim();
    if (serviceId === "") return null;

    const item = await getInventoryItem(serviceId);
    if (!isSelectableCustomerService(item)) {
        throw new IntakeError(400, "UNKNOWN_SERVICE", "Selected service is not available. Please choose again.");
    }
    return item.id;
}

export async function createRetailServiceRequest(
    input: CanonicalIntakeInput,
): Promise<CanonicalIntakeResult> {
    // Payload bounds first — before phone/fingerprint/DB (all ingress share this path).
    validateCanonicalIntakePayload(input);

    // Resolve before the fingerprint is computed so the stored request and its
    // idempotency material agree on exactly one canonical value.
    const requestedServiceId = await resolveRequestedServiceId(input.serviceId);
    input = { ...input, serviceId: requestedServiceId };

    const clientKey = input.idempotencyKey || input.clientRequestId || null;
    if (clientKey) {
        validateIdempotencyKey(clientKey);
    }

    const phoneNormalized = requireValidBdMobile(input.phone);
    const fingerprint = computeIdempotencyFingerprint(input);
    const trackingStatus = resolveInitialTrackingStatus(input);
    const now = new Date();
    const windowStart = new Date(now.getTime() - DUPLICATE_WINDOW_MS);

    const result = await db.transaction(async (tx) => {
        // 1) Exact-key lock first (stable order before fingerprint)
        if (clientKey) {
            await tx.execute(
                sql`SELECT pg_advisory_xact_lock(hashtext(${`intake_key:${input.intakeSource}:${clientKey}`}))`,
            );
            const existing = await findByClientKey(tx, clientKey, input.intakeSource);
            if (existing) {
                const storedFp = existing.idempotency_fingerprint ?? existing.idempotencyFingerprint;
                if (storedFp !== fingerprint) {
                    throw new IntakeError(
                        409,
                        "IDEMPOTENCY_CONFLICT",
                        "The request key was used with different request data.",
                    );
                }
                const full = await loadServiceRequestById(tx, existing.id);
                return { serviceRequest: full, idempotent: true, duplicateWindow: false };
            }
        }

        // 2) Fingerprint lock (duplicate-window + insert serialization)
        await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${`intake_fp:${fingerprint}`}))`,
        );

        // Re-read exact key under both locks
        if (clientKey) {
            const existing = await findByClientKey(tx, clientKey, input.intakeSource);
            if (existing) {
                const storedFp = existing.idempotency_fingerprint ?? existing.idempotencyFingerprint;
                if (storedFp !== fingerprint) {
                    throw new IntakeError(
                        409,
                        "IDEMPOTENCY_CONFLICT",
                        "The request key was used with different request data.",
                    );
                }
                const full = await loadServiceRequestById(tx, existing.id);
                return { serviceRequest: full, idempotent: true, duplicateWindow: false };
            }
        }

        const dupRes = await tx.execute(sql`
            SELECT id FROM service_requests
            WHERE idempotency_fingerprint = ${fingerprint}
              AND created_at > ${windowStart}
            ORDER BY created_at DESC
            LIMIT 1
        `);
        const dupRows = (dupRes as any).rows ?? dupRes;
        if (Array.isArray(dupRows) && dupRows.length > 0) {
            const full = await loadServiceRequestById(tx, dupRows[0].id);
            return { serviceRequest: full, idempotent: false, duplicateWindow: true };
        }

        // 3) Ticket sequence lock
        const datePrefix = now.toISOString().slice(0, 10).replace(/-/g, "");
        await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtext(${`srv_seq_${datePrefix}`}))`,
        );
        const lastReqRes = await tx.execute(sql`
            SELECT ticket_number FROM service_requests
            WHERE ticket_number LIKE ${"SRV-" + datePrefix + "-%"}
            ORDER BY ticket_number DESC
            LIMIT 1
        `);
        const lastReqRows = (lastReqRes as any).rows ?? lastReqRes;
        const lastTicket = Array.isArray(lastReqRows) && lastReqRows[0] ? lastReqRows[0].ticket_number : null;

        let maxSequence = 0;
        if (lastTicket) {
            const parts = lastTicket.split("-");
            const seq = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(seq)) maxSequence = seq;
        }

        for (let attempt = 0; attempt < 5; attempt++) {
            const sequence = (maxSequence + 1 + attempt).toString().padStart(4, "0");
            const candidate = `SRV-${datePrefix}-${sequence}`;
            try {
                const [inserted] = await tx
                    .insert(schema.serviceRequests)
                    .values({
                        id: nanoid(),
                        ticketNumber: candidate,
                        brand: input.brand,
                        screenSize: input.screenSize || null,
                        modelNumber: input.modelNumber || null,
                        primaryIssue: input.primaryIssue,
                        symptoms: input.symptoms || null,
                        description: input.description || null,
                        mediaUrls: input.mediaUrls || null,
                        customerName: input.customerName,
                        phone: input.phone,
                        phoneNormalized: phoneNormalized,
                        address: input.address || null,
                        servicePreference: input.servicePreference || null,
                        serviceMode: input.serviceMode || null,
                        requestIntent: input.requestIntent || null,
                        serviceId: input.serviceId || null,
                        serviceAreaId: input.serviceAreaId || null,
                        // PICKUP-MAP-PIN-01 — `?? null` not `|| null`: latitude 0 is a
                        // legitimate coordinate and must not be coerced away.
                        pickupLatitude: input.pickupLatitude ?? null,
                        pickupLongitude: input.pickupLongitude ?? null,
                        pickupLocationSource: input.pickupLocationSource || null,
                        pickupLocationCapturedAt:
                            input.pickupLatitude != null && input.pickupLongitude != null ? now : null,
                        status: "Pending",
                        trackingStatus: trackingStatus,
                        isQuote: input.isQuote || false,
                        quoteStatus: input.isQuote ? "Pending" : null,
                        customerId: input.customerId || null,
                        intakeSource: input.intakeSource,
                        clientRequestId: clientKey,
                        idempotencyFingerprint: fingerprint,
                        source: input.source || null,
                        expiresAt: input.mediaUrls
                            ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
                            : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
                    } as any)
                    .returning();
                const newRequest = inserted;

                await tx.insert(schema.serviceRequestEvents).values({
                    id: nanoid(),
                    serviceRequestId: newRequest.id,
                    status: trackingStatus,
                    message: "Your repair request has been received and is being reviewed.",
                    actor: "System",
                });

                // 4) Customer identity lock by normalized phone
                let customerIdToLink = input.customerId || null;
                if (!customerIdToLink) {
                    customerIdToLink = await resolveCustomerUnderPhoneLock(
                        tx,
                        phoneNormalized,
                        input.phone,
                        input.customerName,
                    );
                }

                if (customerIdToLink && customerIdToLink !== newRequest.customerId) {
                    await tx
                        .update(schema.serviceRequests)
                        .set({ customerId: customerIdToLink })
                        .where(eq(schema.serviceRequests.id, newRequest.id));
                }

                const finalRow = await loadServiceRequestById(tx, newRequest.id);

                // Test-only fail point: after all transactional writes, before commit.
                // Activated only by process env — never by request input/header/query.
                if (
                    process.env.NODE_ENV === "test" &&
                    process.env.ENABLE_RETAIL_INTAKE_FAIL_POINT === "true"
                ) {
                    throw new IntakeError(
                        500,
                        "RETAIL_INTAKE_FAIL_POINT",
                        "Forced retail intake failure for test.",
                    );
                }

                return { serviceRequest: finalRow, idempotent: false, duplicateWindow: false };
            } catch (error: any) {
                if (error instanceof IntakeError) throw error;

                if (isUniqueViolation(error)) {
                    if (isIdempotencyKeyUniqueViolation(error)) {
                        // Never treat as ticket collision — re-read exact key
                        if (clientKey) {
                            const existing = await findByClientKey(tx, clientKey, input.intakeSource);
                            if (existing) {
                                const storedFp =
                                    existing.idempotency_fingerprint ?? existing.idempotencyFingerprint;
                                if (storedFp !== fingerprint) {
                                    throw new IntakeError(
                                        409,
                                        "IDEMPOTENCY_CONFLICT",
                                        "The request key was used with different request data.",
                                    );
                                }
                                const full = await loadServiceRequestById(tx, existing.id);
                                return {
                                    serviceRequest: full,
                                    idempotent: true,
                                    duplicateWindow: false,
                                };
                            }
                        }
                        throw error;
                    }
                    // Retry only ticket-number collisions
                    if (isTicketNumberUniqueViolation(error) && attempt < 4) {
                        continue;
                    }
                    // Unknown unique constraint — do not silently retry as ticket
                    if (!isTicketNumberUniqueViolation(error) && attempt < 4) {
                        // Legacy DBs may lack named ticket unique — only retry if message mentions ticket
                        const msg = String(error?.message || "");
                        if (/ticket/i.test(msg) && !/client_request/i.test(msg)) {
                            continue;
                        }
                    }
                }
                throw error;
            }
        }
        throw new IntakeError(500, "TICKET_GENERATION_FAILED", "Failed to generate unique ticket number.");
    });

    return result;
}

export { DUPLICATE_WINDOW_MS, BD_MOBILE_RE };
