import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { normalizePhone } from "../utils/phone.js";

export type TaskType = "pickup" | "delivery" | "transfer" | "manual";
export type SourceType = "service_request" | "job_ticket" | "manual";
export type TaskStatus = "pending" | "assigned" | "en_route" | "completed" | "failed" | "cancelled" | "rescheduled";

export interface LogisticsTask {
    id: string;
    taskType: TaskType;
    sourceType: SourceType;
    serviceRequestId: string | null;
    jobTicketId: string | null;
    customerId: string | null;
    customerName: string;
    customerPhone: string | null;
    customerPhoneNormalized: string | null;
    pickupAddress: string | null;
    deliveryAddress: string | null;
    scheduledDate: string | null;
    timeWindow: string | null;
    status: TaskStatus;
    assignedDriverId: string | null;
    assignedDriverName: string | null;
    zone: string | null;
    routeOrder: number | null;
    latitude: number | null;
    longitude: number | null;
    proofPhotoUrl: string | null;
    signatureUrl: string | null;
    notes: string | null;
    failureReason: string | null;
    rescheduleReason: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
    createdAt: string;
    updatedAt: string;
    legacyPickupScheduleId: string | null;
}

function rowToTask(row: any): LogisticsTask {
    return {
        id: row.id,
        taskType: row.task_type,
        sourceType: row.source_type,
        serviceRequestId: row.service_request_id ?? null,
        jobTicketId: row.job_ticket_id ?? null,
        customerId: row.customer_id ?? null,
        customerName: row.customer_name ?? "",
        customerPhone: row.customer_phone ?? null,
        customerPhoneNormalized: row.customer_phone_normalized ?? null,
        pickupAddress: row.pickup_address ?? null,
        deliveryAddress: row.delivery_address ?? null,
        scheduledDate: row.scheduled_date ?? null,
        timeWindow: row.time_window ?? null,
        status: row.status,
        assignedDriverId: row.assigned_driver_id ?? null,
        assignedDriverName: row.assigned_driver_name ?? null,
        zone: row.zone ?? null,
        routeOrder: row.route_order != null ? Number(row.route_order) : null,
        latitude: row.latitude != null ? Number(row.latitude) : null,
        longitude: row.longitude != null ? Number(row.longitude) : null,
        proofPhotoUrl: row.proof_photo_url ?? null,
        signatureUrl: row.signature_url ?? null,
        notes: row.notes ?? null,
        failureReason: row.failure_reason ?? null,
        rescheduleReason: row.reschedule_reason ?? null,
        completedAt: row.completed_at ?? null,
        cancelledAt: row.cancelled_at ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        legacyPickupScheduleId: row.legacy_pickup_schedule_id ?? null,
    };
}

const VALID_TASK_TYPES: TaskType[] = ["pickup", "delivery", "transfer", "manual"];
const VALID_SOURCE_TYPES: SourceType[] = ["service_request", "job_ticket", "manual"];
const VALID_STATUSES: TaskStatus[] = ["pending", "assigned", "en_route", "completed", "failed", "cancelled", "rescheduled"];

export interface CreateTaskInput {
    taskType: TaskType;
    sourceType: SourceType;
    serviceRequestId?: string | null;
    jobTicketId?: string | null;
    customerId?: string | null;
    customerName: string;
    customerPhone?: string | null;
    pickupAddress?: string | null;
    deliveryAddress?: string | null;
    scheduledDate?: string | null;
    timeWindow?: string | null;
    assignedDriverId?: string | null;
    assignedDriverName?: string | null;
    zone?: string | null;
    routeOrder?: number | null;
    latitude?: number | null;
    longitude?: number | null;
    notes?: string | null;
}

type OperationalOverrides = Pick<CreateTaskInput,
    'pickupAddress' | 'deliveryAddress' | 'scheduledDate' | 'timeWindow' |
    'assignedDriverId' | 'assignedDriverName' | 'zone' | 'routeOrder' |
    'latitude' | 'longitude' | 'notes'
>;

function pickOperational(input?: Partial<CreateTaskInput>): Partial<OperationalOverrides> {
    if (!input) return {};
    const safe: Partial<OperationalOverrides> = {};
    if (input.pickupAddress !== undefined) safe.pickupAddress = input.pickupAddress;
    if (input.deliveryAddress !== undefined) safe.deliveryAddress = input.deliveryAddress;
    if (input.scheduledDate !== undefined) safe.scheduledDate = input.scheduledDate;
    if (input.timeWindow !== undefined) safe.timeWindow = input.timeWindow;
    if (input.assignedDriverId !== undefined) safe.assignedDriverId = input.assignedDriverId;
    if (input.assignedDriverName !== undefined) safe.assignedDriverName = input.assignedDriverName;
    if (input.zone !== undefined) safe.zone = input.zone;
    if (input.routeOrder !== undefined) safe.routeOrder = input.routeOrder;
    if (input.latitude !== undefined) safe.latitude = input.latitude;
    if (input.longitude !== undefined) safe.longitude = input.longitude;
    if (input.notes !== undefined) safe.notes = input.notes;
    return safe;
}

function validateTaskType(t: string): t is TaskType {
    return VALID_TASK_TYPES.includes(t as TaskType);
}

function validateSourceType(t: string): t is SourceType {
    return VALID_SOURCE_TYPES.includes(t as SourceType);
}

function validateStatus(s: string): s is TaskStatus {
    return VALID_STATUSES.includes(s as TaskStatus);
}

export async function createTask(input: CreateTaskInput): Promise<LogisticsTask> {
    if (!validateTaskType(input.taskType)) {
        throw new Error(`Invalid task_type: ${input.taskType}`);
    }
    if (!validateSourceType(input.sourceType)) {
        throw new Error(`Invalid source_type: ${input.sourceType}`);
    }

    const id = `LT-${randomUUID().slice(0, 10).toUpperCase()}`;
    const phoneNormalized = normalizePhone(input.customerPhone);

    const result = await db.execute(sql`
        INSERT INTO logistics_tasks (
            id, task_type, source_type,
            service_request_id, job_ticket_id, customer_id,
            customer_name, customer_phone, customer_phone_normalized,
            pickup_address, delivery_address,
            scheduled_date, time_window,
            status, assigned_driver_id, assigned_driver_name,
            zone, route_order, latitude, longitude,
            notes, created_at, updated_at
        ) VALUES (
            ${id}, ${input.taskType}, ${input.sourceType},
            ${input.serviceRequestId ?? null}, ${input.jobTicketId ?? null}, ${input.customerId ?? null},
            ${input.customerName}, ${input.customerPhone ?? null}, ${phoneNormalized},
            ${input.pickupAddress ?? null}, ${input.deliveryAddress ?? null},
            ${input.scheduledDate ? new Date(input.scheduledDate) : null}, ${input.timeWindow ?? null},
            'pending', ${input.assignedDriverId ?? null}, ${input.assignedDriverName ?? null},
            ${input.zone ?? null}, ${input.routeOrder ?? null},
            ${input.latitude ?? null}, ${input.longitude ?? null},
            ${input.notes ?? null}, NOW(), NOW()
        )
        RETURNING *
    `);

    return rowToTask(result.rows[0]);
}

export async function createTaskFromServiceRequest(
    serviceRequestId: string,
    taskType: TaskType,
    overrides?: Partial<CreateTaskInput>
): Promise<LogisticsTask> {
    const srRows = await db.execute(sql`
        SELECT id, customer_id, customer_name, phone, address
        FROM service_requests WHERE id = ${serviceRequestId}
    `);
    const sr = srRows.rows[0] as any;
    if (!sr) throw new Error(`Service request ${serviceRequestId} not found`);

    return createTask({
        taskType,
        sourceType: "service_request",
        serviceRequestId: sr.id,
        customerId: sr.customer_id ?? null,
        customerName: sr.customer_name ?? "",
        customerPhone: sr.phone ?? null,
        pickupAddress: taskType === "pickup" ? (sr.address ?? null) : null,
        deliveryAddress: taskType === "delivery" ? (sr.address ?? null) : null,
        ...pickOperational(overrides),
    });
}

export async function createTaskFromJobTicket(
    jobTicketId: string,
    taskType: TaskType,
    overrides?: Partial<CreateTaskInput>
): Promise<LogisticsTask> {
    const jobRows = await db.execute(sql`
        SELECT id, customer, customer_phone, customer_phone_normalized
        FROM job_tickets WHERE id = ${jobTicketId}
    `);
    const job = jobRows.rows[0] as any;
    if (!job) throw new Error(`Job ticket ${jobTicketId} not found`);

    const srRows = await db.execute(sql`
        SELECT id, address FROM service_requests WHERE converted_job_id = ${jobTicketId} LIMIT 1
    `);
    const sr = srRows.rows[0] as any;

    return createTask({
        taskType,
        sourceType: "job_ticket",
        jobTicketId: job.id,
        serviceRequestId: sr?.id ?? null,
        customerName: job.customer ?? "",
        customerPhone: job.customer_phone ?? null,
        deliveryAddress: taskType === "delivery" ? (sr?.address ?? null) : null,
        pickupAddress: taskType === "pickup" ? (sr?.address ?? null) : null,
        ...pickOperational(overrides),
    });
}

export interface ListTasksFilter {
    status?: string;
    taskType?: string;
    assignedDriverId?: string;
    serviceRequestId?: string;
    jobTicketId?: string;
    zone?: string;
    limit?: number;
}

export async function listTasks(filter: ListTasksFilter = {}): Promise<LogisticsTask[]> {
    const conditions: ReturnType<typeof sql>[] = [];
    if (filter.status) conditions.push(sql`status = ${filter.status}`);
    if (filter.taskType) conditions.push(sql`task_type = ${filter.taskType}`);
    if (filter.assignedDriverId) conditions.push(sql`assigned_driver_id = ${filter.assignedDriverId}`);
    if (filter.serviceRequestId) conditions.push(sql`service_request_id = ${filter.serviceRequestId}`);
    if (filter.jobTicketId) conditions.push(sql`job_ticket_id = ${filter.jobTicketId}`);
    if (filter.zone) conditions.push(sql`zone = ${filter.zone}`);

    const whereClause = conditions.length > 0
        ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
        : sql``;

    const limit = filter.limit ?? 200;
    const result = await db.execute(sql`
        SELECT * FROM logistics_tasks ${whereClause}
        ORDER BY scheduled_date ASC NULLS LAST, created_at DESC
        LIMIT ${limit}
    `);

    return result.rows.map(rowToTask);
}

export async function getTask(id: string): Promise<LogisticsTask | null> {
    const result = await db.execute(sql`SELECT * FROM logistics_tasks WHERE id = ${id}`);
    return result.rows[0] ? rowToTask(result.rows[0]) : null;
}

export async function getTasksByServiceRequest(serviceRequestId: string): Promise<LogisticsTask[]> {
    const result = await db.execute(sql`
        SELECT * FROM logistics_tasks
        WHERE service_request_id = ${serviceRequestId}
        ORDER BY created_at DESC
    `);
    return result.rows.map(rowToTask);
}

export async function getTasksByJobTicket(jobTicketId: string): Promise<LogisticsTask[]> {
    const result = await db.execute(sql`
        SELECT * FROM logistics_tasks
        WHERE job_ticket_id = ${jobTicketId}
        ORDER BY created_at DESC
    `);
    return result.rows.map(rowToTask);
}

export async function updateTaskStatus(id: string, status: string, extra?: {
    failureReason?: string;
    notes?: string;
    proofPhotoUrl?: string;
    signatureUrl?: string;
}): Promise<LogisticsTask | null> {
    if (!validateStatus(status)) {
        throw new Error(`Invalid status: ${status}. Valid: ${VALID_STATUSES.join(", ")}`);
    }

    const sets: ReturnType<typeof sql>[] = [
        sql`status = ${status}`,
        sql`updated_at = NOW()`,
    ];

    if (status === "completed") sets.push(sql`completed_at = NOW()`);
    if (status === "cancelled") sets.push(sql`cancelled_at = NOW()`);
    if (extra?.failureReason) sets.push(sql`failure_reason = ${extra.failureReason}`);
    if (extra?.notes) sets.push(sql`notes = ${extra.notes}`);
    if (extra?.proofPhotoUrl) sets.push(sql`proof_photo_url = ${extra.proofPhotoUrl}`);
    if (extra?.signatureUrl) sets.push(sql`signature_url = ${extra.signatureUrl}`);

    const result = await db.execute(sql`
        UPDATE logistics_tasks
        SET ${sql.join(sets, sql`, `)}
        WHERE id = ${id}
        RETURNING *
    `);

    return result.rows[0] ? rowToTask(result.rows[0]) : null;
}

export async function assignDriver(id: string, driverId: string, driverName: string, zone?: string, routeOrder?: number): Promise<LogisticsTask | null> {
    const result = await db.execute(sql`
        UPDATE logistics_tasks
        SET assigned_driver_id = ${driverId},
            assigned_driver_name = ${driverName},
            zone = ${zone ?? null},
            route_order = ${routeOrder ?? null},
            status = CASE WHEN status = 'pending' THEN 'assigned' ELSE status END,
            updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
    `);

    return result.rows[0] ? rowToTask(result.rows[0]) : null;
}

export async function rescheduleTask(id: string, scheduledDate: string, timeWindow?: string, reason?: string): Promise<LogisticsTask | null> {
    const result = await db.execute(sql`
        UPDATE logistics_tasks
        SET scheduled_date = ${new Date(scheduledDate)},
            time_window = ${timeWindow ?? null},
            reschedule_reason = ${reason ?? null},
            status = 'rescheduled',
            updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
    `);

    return result.rows[0] ? rowToTask(result.rows[0]) : null;
}

export async function cancelTask(id: string, reason?: string): Promise<LogisticsTask | null> {
    const result = await db.execute(sql`
        UPDATE logistics_tasks
        SET status = 'cancelled',
            cancelled_at = NOW(),
            failure_reason = ${reason ?? null},
            updated_at = NOW()
        WHERE id = ${id} AND status NOT IN ('completed', 'cancelled')
        RETURNING *
    `);

    return result.rows[0] ? rowToTask(result.rows[0]) : null;
}

export async function updateTask(id: string, updates: Record<string, unknown>): Promise<LogisticsTask | null> {
    const allowedFields: Record<string, string> = {
        customerName: "customer_name",
        customerPhone: "customer_phone",
        pickupAddress: "pickup_address",
        deliveryAddress: "delivery_address",
        scheduledDate: "scheduled_date",
        timeWindow: "time_window",
        zone: "zone",
        routeOrder: "route_order",
        latitude: "latitude",
        longitude: "longitude",
        notes: "notes",
        proofPhotoUrl: "proof_photo_url",
        signatureUrl: "signature_url",
    };

    const sets: ReturnType<typeof sql>[] = [sql`updated_at = NOW()`];

    for (const [key, value] of Object.entries(updates)) {
        const column = allowedFields[key];
        if (!column) continue;

        if (key === "customerPhone" && typeof value === "string") {
            sets.push(sql`customer_phone = ${value}`);
            sets.push(sql`customer_phone_normalized = ${normalizePhone(value)}`);
        } else if (key === "scheduledDate" && typeof value === "string") {
            sets.push(sql`${sql.raw(column)} = ${new Date(value)}`);
        } else {
            sets.push(sql`${sql.raw(column)} = ${value as string | number | null}`);
        }
    }

    if (sets.length === 1) return getTask(id);

    const result = await db.execute(sql`
        UPDATE logistics_tasks
        SET ${sql.join(sets, sql`, `)}
        WHERE id = ${id}
        RETURNING *
    `);

    return result.rows[0] ? rowToTask(result.rows[0]) : null;
}

// ── Batch operations ──────────────────────────────────────────────────────

export async function batchAssign(
    taskIds: string[],
    driverId: string,
    driverName: string,
    zone?: string
): Promise<{ updated: number; tasks: LogisticsTask[] }> {
    const tasks: LogisticsTask[] = [];
    for (const id of taskIds) {
        const t = await assignDriver(id, driverId, driverName, zone);
        if (t) tasks.push(t);
    }
    return { updated: tasks.length, tasks };
}

export async function batchReorder(
    items: { id: string; routeOrder: number }[]
): Promise<{ updated: number; tasks: LogisticsTask[] }> {
    const tasks: LogisticsTask[] = [];
    for (const item of items) {
        const result = await db.execute(sql`
            UPDATE logistics_tasks
            SET route_order = ${item.routeOrder}, updated_at = NOW()
            WHERE id = ${item.id}
            RETURNING *
        `);
        if (result.rows[0]) tasks.push(rowToTask(result.rows[0]));
    }
    return { updated: tasks.length, tasks };
}

// ── Backfill: pickup_schedules → logistics_tasks ──────────────────────────

function mapPickupStatusToLogistics(puStatus: string, taskType: "pickup" | "delivery", pickedUpAt: unknown, deliveredAt: unknown): TaskStatus {
    if (taskType === "delivery") {
        if (deliveredAt || puStatus === "Delivered") return "completed";
        return "pending";
    }
    if (pickedUpAt || puStatus === "PickedUp" || puStatus === "Delivered") return "completed";
    if (puStatus === "Scheduled") return "assigned";
    return "pending";
}

export async function backfillPickupSchedulesToLogisticsTasks(): Promise<void> {
    const allPu = await db.execute(sql`
        SELECT p.*,
               sr.customer_id, sr.customer_name, sr.phone, sr.converted_job_id
        FROM pickup_schedules p
        LEFT JOIN service_requests sr ON sr.id = p.service_request_id
        ORDER BY p.created_at ASC
    `);

    let pickupCount = 0;
    let deliveryCount = 0;

    for (const row of allPu.rows as any[]) {
        const puId = row.id as string;

        const existingPickup = await db.execute(sql`
            SELECT 1 FROM logistics_tasks
            WHERE legacy_pickup_schedule_id = ${puId} AND task_type = 'pickup'
            LIMIT 1
        `);
        if (existingPickup.rows.length === 0) {
            const pickupStatus = mapPickupStatusToLogistics(row.status, "pickup", row.picked_up_at, row.delivered_at);
            const pickupId = `LT-${randomUUID().slice(0, 10).toUpperCase()}`;
            const phoneNorm = normalizePhone(row.phone);
            await db.execute(sql`
                INSERT INTO logistics_tasks (
                    id, task_type, source_type,
                    service_request_id, job_ticket_id, customer_id,
                    customer_name, customer_phone, customer_phone_normalized,
                    pickup_address, scheduled_date,
                    status, assigned_driver_name,
                    notes, proof_photo_url,
                    completed_at, legacy_pickup_schedule_id,
                    created_at, updated_at
                ) VALUES (
                    ${pickupId}, 'pickup', 'service_request',
                    ${row.service_request_id}, ${row.converted_job_id ?? null}, ${row.customer_id ?? null},
                    ${row.customer_name ?? ""}, ${row.phone ?? null}, ${phoneNorm},
                    ${row.pickup_address ?? null}, ${row.scheduled_date ?? null},
                    ${pickupStatus}, ${row.assigned_staff ?? null},
                    ${row.pickup_notes ?? null}, ${row.pickup_proof_url ?? null},
                    ${pickupStatus === "completed" ? (row.picked_up_at ?? row.created_at) : null},
                    ${puId},
                    ${row.created_at}, NOW()
                )
            `);
            pickupCount++;
        }

        const needsDelivery = row.picked_up_at != null || row.status === "Delivered";
        if (needsDelivery) {
            const existingDelivery = await db.execute(sql`
                SELECT 1 FROM logistics_tasks
                WHERE legacy_pickup_schedule_id = ${puId} AND task_type = 'delivery'
                LIMIT 1
            `);
            if (existingDelivery.rows.length === 0) {
                const deliveryStatus = mapPickupStatusToLogistics(row.status, "delivery", row.picked_up_at, row.delivered_at);
                const deliveryId = `LT-${randomUUID().slice(0, 10).toUpperCase()}`;
                const phoneNorm = normalizePhone(row.phone);
                await db.execute(sql`
                    INSERT INTO logistics_tasks (
                        id, task_type, source_type,
                        service_request_id, job_ticket_id, customer_id,
                        customer_name, customer_phone, customer_phone_normalized,
                        delivery_address, scheduled_date,
                        status, assigned_driver_name,
                        notes, completed_at, legacy_pickup_schedule_id,
                        created_at, updated_at
                    ) VALUES (
                        ${deliveryId}, 'delivery', 'service_request',
                        ${row.service_request_id}, ${row.converted_job_id ?? null}, ${row.customer_id ?? null},
                        ${row.customer_name ?? ""}, ${row.phone ?? null}, ${phoneNorm},
                        ${row.pickup_address ?? null}, ${row.scheduled_date ?? null},
                        ${deliveryStatus}, ${row.assigned_staff ?? null},
                        ${row.pickup_notes ?? null},
                        ${deliveryStatus === "completed" ? (row.delivered_at ?? row.created_at) : null},
                        ${puId},
                        ${row.created_at}, NOW()
                    )
                `);
                deliveryCount++;
            }
        }
    }

    console.log(`[Logistics] Backfill: ${pickupCount} pickup tasks, ${deliveryCount} delivery tasks created from ${allPu.rows.length} pickup_schedules`);
}

// ── Forward sync: pickup_schedules changes → logistics_tasks ──────────────

export async function syncPickupScheduleToLogisticsTask(pickupScheduleId: string): Promise<void> {
    const puRows = await db.execute(sql`SELECT * FROM pickup_schedules WHERE id = ${pickupScheduleId}`);
    const pu = puRows.rows[0] as any;
    if (!pu) return;

    const pickupTaskRows = await db.execute(sql`
        SELECT id FROM logistics_tasks
        WHERE legacy_pickup_schedule_id = ${pickupScheduleId} AND task_type = 'pickup'
        LIMIT 1
    `);
    const pickupTaskId = (pickupTaskRows.rows[0] as any)?.id;

    if (pickupTaskId) {
        const newStatus = mapPickupStatusToLogistics(pu.status, "pickup", pu.picked_up_at, pu.delivered_at);
        const sets: ReturnType<typeof sql>[] = [
            sql`status = ${newStatus}`,
            sql`updated_at = NOW()`,
        ];
        if (pu.scheduled_date) sets.push(sql`scheduled_date = ${pu.scheduled_date}`);
        if (pu.assigned_staff) sets.push(sql`assigned_driver_name = ${pu.assigned_staff}`);
        if (pu.pickup_address) sets.push(sql`pickup_address = ${pu.pickup_address}`);
        if (pu.pickup_proof_url) sets.push(sql`proof_photo_url = ${pu.pickup_proof_url}`);
        if (newStatus === "completed" && pu.picked_up_at) sets.push(sql`completed_at = ${pu.picked_up_at}`);

        await db.execute(sql`
            UPDATE logistics_tasks SET ${sql.join(sets, sql`, `)} WHERE id = ${pickupTaskId}
        `);
    } else {
        const srRows = await db.execute(sql`
            SELECT customer_id, customer_name, phone, converted_job_id
            FROM service_requests WHERE id = ${pu.service_request_id}
        `);
        const sr = srRows.rows[0] as any;
        const pickupStatus = mapPickupStatusToLogistics(pu.status, "pickup", pu.picked_up_at, pu.delivered_at);
        const newId = `LT-${randomUUID().slice(0, 10).toUpperCase()}`;
        await db.execute(sql`
            INSERT INTO logistics_tasks (
                id, task_type, source_type,
                service_request_id, job_ticket_id, customer_id,
                customer_name, customer_phone, customer_phone_normalized,
                pickup_address, scheduled_date,
                status, assigned_driver_name,
                notes, proof_photo_url,
                completed_at, legacy_pickup_schedule_id,
                created_at, updated_at
            ) VALUES (
                ${newId}, 'pickup', 'service_request',
                ${pu.service_request_id}, ${sr?.converted_job_id ?? null}, ${sr?.customer_id ?? null},
                ${sr?.customer_name ?? ""}, ${sr?.phone ?? null}, ${normalizePhone(sr?.phone)},
                ${pu.pickup_address ?? null}, ${pu.scheduled_date ?? null},
                ${pickupStatus}, ${pu.assigned_staff ?? null},
                ${pu.pickup_notes ?? null}, ${pu.pickup_proof_url ?? null},
                ${pickupStatus === "completed" ? (pu.picked_up_at ?? pu.created_at) : null},
                ${pickupScheduleId},
                ${pu.created_at}, NOW()
            )
        `);
    }

    const needsDelivery = pu.picked_up_at != null || pu.status === "PickedUp" || pu.status === "Delivered";
    if (needsDelivery) {
        const deliveryTaskRows = await db.execute(sql`
            SELECT id FROM logistics_tasks
            WHERE legacy_pickup_schedule_id = ${pickupScheduleId} AND task_type = 'delivery'
            LIMIT 1
        `);

        if (deliveryTaskRows.rows.length === 0) {
            const srRows = await db.execute(sql`
                SELECT customer_id, customer_name, phone, converted_job_id
                FROM service_requests WHERE id = ${pu.service_request_id}
            `);
            const sr = srRows.rows[0] as any;
            const deliveryStatus = mapPickupStatusToLogistics(pu.status, "delivery", pu.picked_up_at, pu.delivered_at);
            const deliveryId = `LT-${randomUUID().slice(0, 10).toUpperCase()}`;
            await db.execute(sql`
                INSERT INTO logistics_tasks (
                    id, task_type, source_type,
                    service_request_id, job_ticket_id, customer_id,
                    customer_name, customer_phone, customer_phone_normalized,
                    delivery_address, status, assigned_driver_name,
                    completed_at, legacy_pickup_schedule_id,
                    created_at, updated_at
                ) VALUES (
                    ${deliveryId}, 'delivery', 'service_request',
                    ${pu.service_request_id}, ${sr?.converted_job_id ?? null}, ${sr?.customer_id ?? null},
                    ${sr?.customer_name ?? ""}, ${sr?.phone ?? null}, ${normalizePhone(sr?.phone)},
                    ${pu.pickup_address ?? null}, ${deliveryStatus}, ${pu.assigned_staff ?? null},
                    ${deliveryStatus === "completed" ? (pu.delivered_at ?? new Date()) : null},
                    ${pickupScheduleId},
                    NOW(), NOW()
                )
            `);
        } else {
            const deliveryTaskId = (deliveryTaskRows.rows[0] as any).id;
            const deliveryStatus = mapPickupStatusToLogistics(pu.status, "delivery", pu.picked_up_at, pu.delivered_at);
            const sets: ReturnType<typeof sql>[] = [
                sql`status = ${deliveryStatus}`,
                sql`updated_at = NOW()`,
            ];
            if (deliveryStatus === "completed" && pu.delivered_at) sets.push(sql`completed_at = ${pu.delivered_at}`);
            if (pu.assigned_staff) sets.push(sql`assigned_driver_name = ${pu.assigned_staff}`);

            await db.execute(sql`
                UPDATE logistics_tasks SET ${sql.join(sets, sql`, `)} WHERE id = ${deliveryTaskId}
            `);
        }
    }
}
