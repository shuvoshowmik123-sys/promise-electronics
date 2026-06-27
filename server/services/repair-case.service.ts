import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { jobRepo, serviceRequestRepo, pickupRepo } from '../repositories/index.js';
import type { ServiceRequest, JobTicket, PickupSchedule } from '../../shared/schema.js';
import { getCallSummary, deriveIntakeLane, type CallSummary, type IntakeLane } from './call-attempt.service.js';

interface JourneySummary {
    id: string;
    serviceRequestId: string | null;
    jobTicketId: string | null;
    currentStage: string;
    currentStatus: string;
    customerFriendlyStatus: string;
    serviceMode: string;
    pickupRequired: boolean;
    dropoffRequired: boolean;
    createdAt: string;
    updatedAt: string;
    eventCount: number;
    scheduleCount: number;
}

interface RepairCaseWarning {
    code: string;
    message: string;
}

export interface UnifiedRepairCase {
    operationalOwner: 'service_request' | 'job_ticket';
    serviceRequest: ServiceRequest | null;
    jobTicket: JobTicket | null;
    journey: JourneySummary | null;
    pickup: PickupSchedule | null;
    customer: {
        id: string | null;
        name: string;
        phone: string;
        address: string | null;
    };
    links: {
        serviceRequestId: string | null;
        jobTicketId: string | null;
        journeyId: string | null;
        pickupScheduleId: string | null;
        serviceRequestTicketNumber: string | null;
        jobTicketNumber: string | null;
    };
    warnings: RepairCaseWarning[];
    intake: {
        lane: IntakeLane;
        callSummary: CallSummary;
        needsStaffAction: boolean;
    } | null;
}

async function getJourneySummary(serviceRequestId: string | null, jobTicketId: string | null): Promise<JourneySummary | null> {
    let journeyRow: any = null;

    if (serviceRequestId) {
        const rows = await db.execute(sql`
            SELECT *, (SELECT count(*) FROM customer_repair_journey_events WHERE journey_id = j.id) as event_count,
                      (SELECT count(*) FROM customer_repair_schedules WHERE journey_id = j.id) as schedule_count
            FROM customer_repair_journeys j
            WHERE j.service_request_id = ${serviceRequestId}
            LIMIT 1
        `);
        journeyRow = rows.rows[0];
    }

    if (!journeyRow && jobTicketId) {
        const rows = await db.execute(sql`
            SELECT *, (SELECT count(*) FROM customer_repair_journey_events WHERE journey_id = j.id) as event_count,
                      (SELECT count(*) FROM customer_repair_schedules WHERE journey_id = j.id) as schedule_count
            FROM customer_repair_journeys j
            WHERE j.job_ticket_id = ${jobTicketId}
            LIMIT 1
        `);
        journeyRow = rows.rows[0];
    }

    if (!journeyRow) return null;

    return {
        id: journeyRow.id,
        serviceRequestId: journeyRow.service_request_id ?? null,
        jobTicketId: journeyRow.job_ticket_id ?? null,
        currentStage: journeyRow.current_stage,
        currentStatus: journeyRow.current_status,
        customerFriendlyStatus: journeyRow.customer_friendly_status,
        serviceMode: journeyRow.service_mode,
        pickupRequired: journeyRow.pickup_required,
        dropoffRequired: journeyRow.dropoff_required,
        createdAt: journeyRow.created_at,
        updatedAt: journeyRow.updated_at,
        eventCount: Number(journeyRow.event_count) || 0,
        scheduleCount: Number(journeyRow.schedule_count) || 0,
    };
}

function determineOwner(sr: ServiceRequest | null, job: JobTicket | null): 'service_request' | 'job_ticket' {
    if (job) return 'job_ticket';
    return 'service_request';
}

function buildWarnings(sr: ServiceRequest | null, job: JobTicket | null, journey: JourneySummary | null, pickup: PickupSchedule | null): RepairCaseWarning[] {
    const warnings: RepairCaseWarning[] = [];

    if (sr && sr.convertedJobId && !job) {
        warnings.push({ code: 'ORPHANED_CONVERSION', message: `Service request references job ${sr.convertedJobId} but job not found` });
    }

    if (sr && !sr.customerId) {
        warnings.push({ code: 'NO_CUSTOMER_ACCOUNT', message: 'No linked customer account — walk-in or unregistered' });
    }

    if (sr && sr.convertedJobId && !journey) {
        warnings.push({ code: 'NO_JOURNEY', message: 'Converted to job but no customer repair journey exists' });
    }

    if (job && !sr) {
        warnings.push({ code: 'NO_SOURCE_REQUEST', message: 'Job has no linked service request — may be direct walk-in or corporate job' });
    }

    if (sr && (sr.serviceMode === 'pickup' || sr.servicePreference === 'pickup' || sr.servicePreference === 'home_pickup') && !pickup) {
        warnings.push({ code: 'MISSING_PICKUP', message: 'Service request indicates pickup but no pickup schedule found' });
    }

    if (sr && sr.convertedJobId && job && journey && journey.jobTicketId !== job.id) {
        warnings.push({ code: 'JOURNEY_LINK_BROKEN', message: `Journey exists but is not linked to converted job ${job.id} — journey.jobTicketId is ${journey.jobTicketId || 'null'}` });
    }

    if (job && sr && (sr.serviceMode === 'pickup' || sr.servicePreference === 'pickup' || sr.servicePreference === 'home_pickup')) {
        const jobReady = job.status === 'Ready' || job.status === 'Completed';
        const deliveryDone = pickup && pickup.status === 'Delivered';
        if (jobReady && !deliveryDone) {
            warnings.push({ code: 'DELIVERY_NEEDED', message: `Repair is ${job.status.toLowerCase()} but return delivery is not confirmed. Customer expects pickup/delivery service.` });
        }
    }

    return warnings;
}

export async function loadRepairCaseByServiceRequest(serviceRequestId: string): Promise<UnifiedRepairCase | null> {
    const sr = await serviceRequestRepo.getServiceRequest(serviceRequestId);
    if (!sr) return null;

    const job = sr.convertedJobId ? await jobRepo.getJobTicket(sr.convertedJobId) : null;
    const journey = await getJourneySummary(sr.id, job?.id ?? null);
    const pickup = await pickupRepo.getPickupScheduleByServiceRequestId(sr.id) ?? null;

    return {
        operationalOwner: determineOwner(sr, job ?? null),
        serviceRequest: sr,
        jobTicket: job ?? null,
        journey,
        pickup,
        customer: {
            id: sr.customerId,
            name: sr.customerName,
            phone: sr.phone,
            address: sr.address,
        },
        links: {
            serviceRequestId: sr.id,
            jobTicketId: sr.convertedJobId,
            journeyId: journey?.id ?? null,
            pickupScheduleId: pickup?.id ?? null,
            serviceRequestTicketNumber: sr.ticketNumber,
            jobTicketNumber: job?.id ?? null,
        },
        warnings: buildWarnings(sr, job ?? null, journey, pickup),
        intake: await buildIntake(sr),
    };
}

async function buildIntake(sr: ServiceRequest | null): Promise<UnifiedRepairCase['intake']> {
    if (!sr) return null;
    const callSummary = await getCallSummary(sr.id);
    const lane = deriveIntakeLane(sr, callSummary);
    const actionLanes: IntakeLane[] = ['new_intake', 'needs_call', 'needs_reply', 'schedule_needed'];
    return { lane, callSummary, needsStaffAction: actionLanes.includes(lane) };
}

export async function loadRepairCaseByJobTicket(jobTicketId: string): Promise<UnifiedRepairCase | null> {
    const job = await jobRepo.getJobTicket(jobTicketId);
    if (!job) return null;

    const sr = await serviceRequestRepo.getServiceRequestByConvertedJobId(jobTicketId) ?? null;
    const journey = await getJourneySummary(sr?.id ?? null, job.id);
    const pickup = sr ? (await pickupRepo.getPickupScheduleByServiceRequestId(sr.id) ?? null) : null;

    const customerName = sr?.customerName || job.customer || '';
    const customerPhone = sr?.phone || job.customerPhone || '';

    return {
        operationalOwner: 'job_ticket',
        serviceRequest: sr,
        jobTicket: job,
        journey,
        pickup,
        customer: {
            id: sr?.customerId ?? null,
            name: customerName,
            phone: customerPhone,
            address: sr?.address ?? null,
        },
        links: {
            serviceRequestId: sr?.id ?? null,
            jobTicketId: job.id,
            journeyId: journey?.id ?? null,
            pickupScheduleId: pickup?.id ?? null,
            serviceRequestTicketNumber: sr?.ticketNumber ?? null,
            jobTicketNumber: job.id,
        },
        warnings: buildWarnings(sr, job, journey, pickup),
        intake: await buildIntake(sr),
    };
}
