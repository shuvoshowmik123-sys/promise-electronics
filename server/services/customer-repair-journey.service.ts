import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { serviceRequestRepo, jobRepo, warrantyRepo } from "../repositories/index.js";
import { notifyAdminUpdate, notifyCustomerUpdate } from "../routes/middleware/sse-broker.js";
import { pushService } from "../pushService.js";
import { storage } from "../storage.js";

// ── Stage constants ──

export const JOURNEY_STAGES = [
  "draft",
  "quote_requested",
  "quote_sent",
  "quote_accepted",
  "schedule_requested",
  "schedule_confirmed",
  "device_waiting",
  "device_received",
  "inspection_waiting",
  "inspection_started",
  "diagnosis_ready",
  "repair_approval_required",
  "repair_approved",
  "repair_in_progress",
  "repair_completed",
  "delivery_scheduled",
  "delivered",
  "cancelled",
] as const;

export type JourneyStage = (typeof JOURNEY_STAGES)[number];

export const SERVICE_MODES = [
  "quote_only",
  "drop_off",
  "pickup",
  "home_visit",
] as const;

export type ServiceMode = (typeof SERVICE_MODES)[number];

const FRIENDLY_STATUS: Record<string, string> = {
  draft: "We received your request. Our team will review it soon.",
  quote_requested: "Your quote request is being reviewed by our team.",
  quote_sent: "Your quote is ready. Please review and accept when convenient.",
  quote_accepted: "Quote accepted! We will schedule your service shortly.",
  schedule_requested: "Pickup requested. We will confirm a time slot shortly.",
  schedule_confirmed: "Your pickup is confirmed. We will be there at the scheduled time.",
  device_waiting: "Your TV is waiting for inspection. No action is needed from you right now.",
  device_received: "We have received your TV. It is safely in our queue.",
  inspection_waiting: "We are a little busy today, but your TV is safely in our queue.",
  inspection_started: "Inspection has started. We will share findings soon.",
  diagnosis_ready: "Diagnosis is ready. Please review before repair starts.",
  repair_approval_required: "We need your approval to proceed with the repair.",
  repair_approved: "Repair has been approved and will begin shortly.",
  repair_in_progress: "Repair is in progress.",
  repair_completed: "Your TV is ready! We will arrange delivery or you can pick it up.",
  delivery_scheduled: "Delivery is scheduled. Your TV is on its way!",
  delivered: "Your TV has been delivered. Thank you for choosing Promise Electronics!",
  cancelled: "This repair journey has been cancelled.",
};

const NEXT_ACTION_MAP: Record<string, { action: string; label: string } | null> = {
  quote_sent: { action: "accept_quote", label: "Review & Accept Quote" },
  quote_accepted: { action: "schedule_service", label: "Schedule Pickup or Visit" },
  diagnosis_ready: { action: "review_diagnosis", label: "Review Diagnosis" },
  repair_approval_required: { action: "approve_repair", label: "Approve Repair" },
  repair_completed: { action: "arrange_delivery", label: "Arrange Delivery or Pickup" },
};

const FRIENDLY_STAGE_TITLES: Record<string, string> = {
  draft: "Request Submitted",
  quote_requested: "Quote Requested",
  quote_sent: "Quote Sent",
  quote_accepted: "Quote Accepted",
  schedule_requested: "Schedule Requested",
  schedule_confirmed: "Schedule Confirmed",
  device_waiting: "Device Waiting",
  device_received: "Device Received",
  inspection_waiting: "Waiting for Inspection",
  inspection_started: "Inspection Started",
  diagnosis_ready: "Diagnosis Ready",
  repair_approval_required: "Approval Required",
  repair_approved: "Repair Approved",
  repair_in_progress: "Repair In Progress",
  repair_completed: "Repair Completed",
  delivery_scheduled: "Delivery Scheduled",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// ── Types ──

interface JourneyRow {
  id: string;
  customer_id: string | null;
  service_request_id: string | null;
  quote_request_id: string | null;
  job_ticket_id: string | null;
  current_stage: string;
  current_status: string;
  customer_friendly_status: string;
  next_action: string | null;
  next_action_label: string | null;
  next_update_eta: string | null;
  service_mode: string;
  pickup_required: boolean;
  dropoff_required: boolean;
  customer_note: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: string;
  journey_id: string;
  event_type: string;
  title: string;
  message: string | null;
  actor_type: string;
  actor_id: string | null;
  metadata: any;
  is_customer_visible: boolean;
  created_at: string;
}

interface ScheduleRow {
  id: string;
  journey_id: string;
  schedule_type: string;
  requested_date: string | null;
  requested_time_window: string | null;
  confirmed_date: string | null;
  confirmed_time_window: string | null;
  status: string;
  customer_note: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

function toCustomerView(row: JourneyRow) {
  return {
    id: row.id,
    customerId: row.customer_id,
    serviceRequestId: row.service_request_id,
    quoteRequestId: row.quote_request_id,
    jobTicketId: row.job_ticket_id,
    currentStage: row.current_stage,
    currentStatus: row.current_status,
    customerFriendlyStatus: row.customer_friendly_status,
    nextAction: row.next_action,
    nextActionLabel: row.next_action_label,
    nextUpdateEta: row.next_update_eta,
    serviceMode: row.service_mode,
    pickupRequired: row.pickup_required,
    dropoffRequired: row.dropoff_required,
    customerNote: row.customer_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAdminView(row: JourneyRow) {
  return {
    ...toCustomerView(row),
    adminNote: row.admin_note,
  };
}

function deriveSourceType(row: any): string {
  if (row.warranty_claim_id) return "warranty";
  if (row.service_request_id) return "service_request";
  if (row.quote_request_id) return "quote_request";
  if (row.job_ticket_id) return "walk_in";
  return "unknown";
}

function toEnrichedAdminView(row: any) {
  return {
    ...toAdminView(row as JourneyRow),
    sourceType: deriveSourceType(row),
    customerName: row.customer_name_joined ?? null,
    customerPhone: row.customer_phone_joined ?? null,
    deviceBrand: row.device_brand ?? row.job_device ?? null,
    deviceModel: row.device_model ?? null,
    screenSize: row.sr_screen_size ?? null,
    serialNumber: row.serial_number ?? null,
    srTicketNumber: row.sr_ticket_number ?? null,
    quoteStatus: row.quote_status ?? null,
    quoteAmount: row.quote_amount != null ? Number(row.quote_amount) : null,
    billingStatus: row.job_payment_status ?? row.sr_payment_status ?? null,
    lastEventTitle: row.last_event_title ?? null,
    lastEventAt: row.last_event_at ?? null,
  };
}

function toEventView(row: EventRow, forCustomer: boolean) {
  if (forCustomer && !row.is_customer_visible) return null;
  return {
    id: row.id,
    journeyId: row.journey_id,
    eventType: row.event_type,
    title: row.title,
    message: row.message,
    actorType: row.actor_type,
    actorId: forCustomer ? undefined : row.actor_id,
    metadata: forCustomer ? undefined : row.metadata,
    createdAt: row.created_at,
  };
}

function toScheduleView(row: ScheduleRow, forCustomer: boolean) {
  return {
    id: row.id,
    journeyId: row.journey_id,
    scheduleType: row.schedule_type,
    requestedDate: row.requested_date,
    requestedTimeWindow: row.requested_time_window,
    confirmedDate: row.confirmed_date,
    confirmedTimeWindow: row.confirmed_time_window,
    status: row.status,
    customerNote: row.customer_note,
    adminNote: forCustomer ? undefined : row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Service ──

export const repairJourneyService = {
  async createJourneyFromQuote(opts: {
    quoteRequestId: string;
    customerId: string | null;
    customerNote?: string;
    serviceMode?: ServiceMode;
  }) {
    const id = nanoid();
    const stage: JourneyStage = "quote_requested";
    const friendly = FRIENDLY_STATUS[stage];
    const mode = opts.serviceMode || "quote_only";

    await db.execute(sql`
      INSERT INTO customer_repair_journeys
        (id, customer_id, quote_request_id, current_stage, current_status,
         customer_friendly_status, service_mode, customer_note, created_at, updated_at)
      VALUES
        (${id}, ${opts.customerId}, ${opts.quoteRequestId}, ${stage}, 'active',
         ${friendly}, ${mode}, ${opts.customerNote || null}, NOW(), NOW())
    `);

    await this.addJourneyEvent({
      journeyId: id,
      eventType: "quote_requested",
      title: "Quote Requested",
      message: "Your quote request has been submitted. Our team will review it shortly.",
      actorType: opts.customerId ? "customer" : "system",
      actorId: opts.customerId || undefined,
    });

    console.log(`[RepairJourney] Created journey ${id} from quote ${opts.quoteRequestId}`);
    return id;
  },

  async createJourneyFromServiceRequest(opts: {
    serviceRequestId: string;
    customerId: string | null;
    serviceMode?: ServiceMode;
    customerNote?: string;
  }) {
    const id = nanoid();
    const stage: JourneyStage = "device_waiting";
    const friendly = FRIENDLY_STATUS[stage];
    const mode = opts.serviceMode || "drop_off";
    const pickup = mode === "pickup" || mode === "home_visit";
    const dropoff = mode === "drop_off";

    await db.execute(sql`
      INSERT INTO customer_repair_journeys
        (id, customer_id, service_request_id, current_stage, current_status,
         customer_friendly_status, service_mode, pickup_required, dropoff_required,
         customer_note, created_at, updated_at)
      VALUES
        (${id}, ${opts.customerId}, ${opts.serviceRequestId}, ${stage}, 'active',
         ${friendly}, ${mode}, ${pickup}, ${dropoff},
         ${opts.customerNote || null}, NOW(), NOW())
    `);

    await this.addJourneyEvent({
      journeyId: id,
      eventType: "service_request_created",
      title: "Service Request Created",
      message: "Your service request has been submitted.",
      actorType: opts.customerId ? "customer" : "system",
      actorId: opts.customerId || undefined,
    });

    console.log(`[RepairJourney] Created journey ${id} from service request ${opts.serviceRequestId}`);
    return id;
  },

  async linkJourneyToJobTicket(journeyId: string, jobTicketId: string) {
    await db.execute(sql`
      UPDATE customer_repair_journeys
      SET job_ticket_id = ${jobTicketId}, updated_at = NOW()
      WHERE id = ${journeyId}
    `);

    await this.addJourneyEvent({
      journeyId,
      eventType: "job_created",
      title: "Repair Job Created",
      message: "A repair job has been created for your device.",
      actorType: "system",
    });

    console.log(`[RepairJourney] Linked journey ${journeyId} to job ${jobTicketId}`);
  },

  async findJourneyByServiceRequest(serviceRequestId: string): Promise<string | null> {
    const rows = await db.execute(sql`
      SELECT id FROM customer_repair_journeys
      WHERE service_request_id = ${serviceRequestId}
      LIMIT 1
    `);
    return (rows.rows[0] as any)?.id || null;
  },

  async findJourneyByQuoteRequest(quoteRequestId: string): Promise<string | null> {
    const rows = await db.execute(sql`
      SELECT id FROM customer_repair_journeys
      WHERE quote_request_id = ${quoteRequestId}
      LIMIT 1
    `);
    return (rows.rows[0] as any)?.id || null;
  },

  async addJourneyEvent(opts: {
    journeyId: string;
    eventType: string;
    title: string;
    message?: string;
    actorType?: string;
    actorId?: string;
    metadata?: Record<string, any>;
    isCustomerVisible?: boolean;
  }) {
    const id = nanoid();
    const meta = opts.metadata ? JSON.stringify(opts.metadata) : "{}";
    const visible = opts.isCustomerVisible !== false;

    await db.execute(sql`
      INSERT INTO customer_repair_journey_events
        (id, journey_id, event_type, title, message, actor_type, actor_id, metadata, is_customer_visible, created_at)
      VALUES
        (${id}, ${opts.journeyId}, ${opts.eventType}, ${opts.title},
         ${opts.message || null}, ${opts.actorType || "system"}, ${opts.actorId || null},
         ${meta}::jsonb, ${visible}, NOW())
    `);
    return id;
  },

  async updateJourneyStage(
    journeyId: string,
    stage: JourneyStage,
    opts?: { adminNote?: string; customerFriendlyStatus?: string }
  ) {
    const friendly = opts?.customerFriendlyStatus || FRIENDLY_STATUS[stage] || stage;
    const nextActionEntry = NEXT_ACTION_MAP[stage] || null;

    await db.execute(sql`
      UPDATE customer_repair_journeys
      SET current_stage = ${stage},
          customer_friendly_status = ${friendly},
          next_action = ${nextActionEntry?.action || null},
          next_action_label = ${nextActionEntry?.label || null},
          admin_note = COALESCE(${opts?.adminNote || null}, admin_note),
          updated_at = NOW()
      WHERE id = ${journeyId}
    `);

    const stageTitle = FRIENDLY_STAGE_TITLES[stage] || stage.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

    await this.addJourneyEvent({
      journeyId,
      eventType: `stage_${stage}`,
      title: stageTitle,
      message: friendly,
      actorType: "system",
    });

    console.log(`[RepairJourney] Journey ${journeyId} → stage ${stage}`);
  },

  async insertScheduleRow(opts: {
    journeyId: string;
    scheduleType: string;
    requestedDate?: string;
    requestedTimeWindow?: string;
    customerNote?: string;
    status?: string;
  }) {
    const id = nanoid();
    await db.execute(sql`
      INSERT INTO customer_repair_schedules
        (id, journey_id, schedule_type, requested_date, requested_time_window,
         status, customer_note, created_at, updated_at)
      VALUES
        (${id}, ${opts.journeyId}, ${opts.scheduleType},
         ${opts.requestedDate || null}, ${opts.requestedTimeWindow || null},
         ${opts.status || "requested"}, ${opts.customerNote || null}, NOW(), NOW())
    `);
    return id;
  },

  async requestSchedule(opts: {
    journeyId: string;
    scheduleType: string;
    requestedDate?: string;
    requestedTimeWindow?: string;
    customerNote?: string;
  }) {
    const id = await this.insertScheduleRow(opts);

    await db.execute(sql`
      UPDATE customer_repair_journeys
      SET current_stage = 'schedule_requested',
          customer_friendly_status = ${FRIENDLY_STATUS["schedule_requested"]},
          pickup_required = ${opts.scheduleType === "pickup" || opts.scheduleType === "home_visit"},
          updated_at = NOW()
      WHERE id = ${opts.journeyId}
    `);

    const typeLabel = opts.scheduleType.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

    await this.addJourneyEvent({
      journeyId: opts.journeyId,
      eventType: "schedule_requested",
      title: `${typeLabel} Requested`,
      message: `A ${typeLabel.toLowerCase()} has been requested.`,
      actorType: "customer",
    });

    console.log(`[RepairJourney] Schedule ${id} requested for journey ${opts.journeyId}`);
    return id;
  },

  async confirmSchedule(scheduleId: string, confirmedDate: string, confirmedTimeWindow: string, adminNote?: string) {
    await db.execute(sql`
      UPDATE customer_repair_schedules
      SET status = 'confirmed',
          confirmed_date = ${confirmedDate},
          confirmed_time_window = ${confirmedTimeWindow},
          admin_note = ${adminNote || null},
          updated_at = NOW()
      WHERE id = ${scheduleId}
    `);

    const scheduleRows = await db.execute(sql`
      SELECT journey_id, schedule_type FROM customer_repair_schedules WHERE id = ${scheduleId}
    `);
    const schedule = scheduleRows.rows[0] as any;
    if (!schedule) return false;

    const friendly = FRIENDLY_STATUS["schedule_confirmed"];
    const nextAction = NEXT_ACTION_MAP["schedule_confirmed"] || null;
    await db.execute(sql`
      UPDATE customer_repair_journeys
      SET current_stage = 'schedule_confirmed',
          customer_friendly_status = ${friendly},
          next_action = ${nextAction?.action || null},
          next_action_label = ${nextAction?.label || null},
          updated_at = NOW()
      WHERE id = ${schedule.journey_id}
    `);

    const typeLabel = schedule.schedule_type.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    await this.addJourneyEvent({
      journeyId: schedule.journey_id,
      eventType: "schedule_confirmed",
      title: "Schedule Confirmed",
      message: `Your ${typeLabel.toLowerCase()} is confirmed for ${confirmedDate} (${confirmedTimeWindow}).`,
      actorType: "admin",
    });

    console.log(`[RepairJourney] Schedule ${scheduleId} confirmed`);
  },

  async requestReschedule(journeyId: string, scheduleId: string, newDate: string, newTimeWindow: string, customerNote?: string) {
    await db.execute(sql`
      UPDATE customer_repair_schedules
      SET status = 'reschedule_requested',
          requested_date = ${newDate},
          requested_time_window = ${newTimeWindow},
          customer_note = ${customerNote || null},
          updated_at = NOW()
      WHERE id = ${scheduleId}
        AND journey_id = ${journeyId}
    `);

    const scheduleRows = await db.execute(sql`
      SELECT journey_id FROM customer_repair_schedules
      WHERE id = ${scheduleId}
        AND journey_id = ${journeyId}
    `);
    const schedule = scheduleRows.rows[0] as any;
    if (!schedule) return;

    await this.addJourneyEvent({
      journeyId: schedule.journey_id,
      eventType: "reschedule_requested",
      title: "Reschedule Requested",
      message: "You requested a schedule change. We will confirm the new time shortly.",
      actorType: "customer",
    });

    console.log(`[RepairJourney] Reschedule requested for schedule ${scheduleId}`);
    return true;
  },

  async getCustomerJourneys(customerId: string) {
    const rows = await db.execute(sql`
      SELECT j.*,
        sr.ticket_number AS sr_ticket_number,
        sr.brand AS device_brand,
        COALESCE(jt.model_number, sr.model_number) AS device_model,
        sr.screen_size AS sr_screen_size,
        COALESCE(jt.serial_number, jt.tv_serial_number) AS serial_number,
        jt.device AS job_device,
        (SELECT title FROM customer_repair_journey_events WHERE journey_id = j.id AND is_customer_visible = true ORDER BY created_at DESC LIMIT 1) AS last_event_title,
        (SELECT created_at FROM customer_repair_journey_events WHERE journey_id = j.id AND is_customer_visible = true ORDER BY created_at DESC LIMIT 1) AS last_event_at
      FROM customer_repair_journeys j
      LEFT JOIN service_requests sr ON sr.id = COALESCE(j.service_request_id, j.quote_request_id)
      LEFT JOIN job_tickets jt ON jt.id = j.job_ticket_id
      WHERE j.customer_id = ${customerId}
      ORDER BY j.updated_at DESC
    `);
    return (rows.rows as any[]).map((row) => ({
      ...toCustomerView(row as JourneyRow),
      deviceBrand: row.device_brand ?? row.job_device ?? null,
      deviceModel: row.device_model ?? null,
      screenSize: row.sr_screen_size ?? null,
      serialNumber: row.serial_number ?? null,
      srTicketNumber: row.sr_ticket_number ?? null,
      lastEventTitle: row.last_event_title ?? null,
      lastEventAt: row.last_event_at ?? null,
    }));
  },

  async getJourneyDetail(journeyId: string, customerId: string) {
    const journeyRows = await db.execute(sql`
      SELECT * FROM customer_repair_journeys
      WHERE id = ${journeyId} AND customer_id = ${customerId}
    `);
    const journey = journeyRows.rows[0] as unknown as JourneyRow | undefined;
    if (!journey) return null;

    const eventRows = await db.execute(sql`
      SELECT * FROM customer_repair_journey_events
      WHERE journey_id = ${journeyId}
      ORDER BY created_at ASC
    `);

    const scheduleRows = await db.execute(sql`
      SELECT * FROM customer_repair_schedules
      WHERE journey_id = ${journeyId}
      ORDER BY created_at DESC
    `);

    let quoteAmount: number | null = null;
    const srId = journey.service_request_id || journey.quote_request_id;
    if (srId) {
      const srRows = await db.execute(sql`SELECT quote_amount, total_amount FROM service_requests WHERE id = ${srId} LIMIT 1`);
      const sr = srRows.rows[0] as any;
      if (sr) quoteAmount = sr.quote_amount != null ? Number(sr.quote_amount) : (sr.total_amount != null ? Number(sr.total_amount) : null);
    }

    return {
      ...toCustomerView(journey),
      quoteAmount,
      events: (eventRows.rows as unknown as EventRow[])
        .map((e) => toEventView(e, true))
        .filter(Boolean),
      schedules: (scheduleRows.rows as unknown as ScheduleRow[]).map((s) =>
        toScheduleView(s, true)
      ),
    };
  },

  async getAdminJourneyDetail(journeyId: string) {
    const journeyRows = await db.execute(sql`
      SELECT * FROM customer_repair_journeys WHERE id = ${journeyId}
    `);
    const journey = journeyRows.rows[0] as unknown as JourneyRow | undefined;
    if (!journey) return null;

    const eventRows = await db.execute(sql`
      SELECT * FROM customer_repair_journey_events
      WHERE journey_id = ${journeyId}
      ORDER BY created_at ASC
    `);

    const scheduleRows = await db.execute(sql`
      SELECT * FROM customer_repair_schedules
      WHERE journey_id = ${journeyId}
      ORDER BY created_at DESC
    `);

    return {
      ...toAdminView(journey),
      events: (eventRows.rows as unknown as EventRow[]).map((e) => toEventView(e, false)),
      schedules: (scheduleRows.rows as unknown as ScheduleRow[]).map((s) =>
        toScheduleView(s, false)
      ),
    };
  },

  async getAdminJourneys(filters?: { stage?: string; status?: string; limit?: number; search?: string; sourceType?: string; hasQuote?: string; dateFrom?: string; dateTo?: string }) {
    const limit = filters?.limit || 100;
    const conditions: ReturnType<typeof sql>[] = [];

    if (filters?.stage) conditions.push(sql`j.current_stage = ${filters.stage}`);
    if (filters?.status) conditions.push(sql`j.current_status = ${filters.status}`);
    if (filters?.dateFrom) conditions.push(sql`j.created_at >= ${new Date(filters.dateFrom)}`);
    if (filters?.dateTo) conditions.push(sql`j.created_at <= ${new Date(filters.dateTo + "T23:59:59")}`);
    if (filters?.sourceType) {
      if (filters.sourceType === "warranty") conditions.push(sql`j.warranty_claim_id IS NOT NULL`);
      else if (filters.sourceType === "service_request") conditions.push(sql`j.service_request_id IS NOT NULL AND j.warranty_claim_id IS NULL`);
      else if (filters.sourceType === "quote_request") conditions.push(sql`j.quote_request_id IS NOT NULL AND j.service_request_id IS NULL`);
      else if (filters.sourceType === "walk_in") conditions.push(sql`j.job_ticket_id IS NOT NULL AND j.service_request_id IS NULL AND j.quote_request_id IS NULL AND j.warranty_claim_id IS NULL`);
    }
    if (filters?.hasQuote === "true") conditions.push(sql`sr.quote_amount IS NOT NULL`);
    if (filters?.hasQuote === "false") conditions.push(sql`sr.quote_amount IS NULL`);
    if (filters?.search) {
      const q = `%${filters.search}%`;
      conditions.push(sql`(
        u.name ILIKE ${q} OR u.phone ILIKE ${q}
        OR sr.brand ILIKE ${q} OR sr.model_number ILIKE ${q}
        OR sr.ticket_number ILIKE ${q}
        OR jt.device ILIKE ${q}
        OR jt.tv_serial_number ILIKE ${q}
        OR jt.model_number ILIKE ${q}
        OR jt.serial_number ILIKE ${q}
        OR j.job_ticket_id ILIKE ${q}
        OR j.id ILIKE ${q}
      )`);
    }

    const whereClause = conditions.length > 0 ? sql`WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

    const rows = await db.execute(sql`
      SELECT j.*,
        sr.ticket_number AS sr_ticket_number,
        sr.brand AS device_brand,
        COALESCE(jt.model_number, sr.model_number) AS device_model,
        sr.screen_size AS sr_screen_size,
        sr.quote_amount AS quote_amount,
        sr.quote_status AS quote_status,
        sr.payment_status AS sr_payment_status,
        COALESCE(jt.serial_number, jt.tv_serial_number) AS serial_number,
        jt.status AS job_status,
        jt.payment_status AS job_payment_status,
        jt.device AS job_device,
        u.name AS customer_name_joined,
        u.phone AS customer_phone_joined,
        (SELECT title FROM customer_repair_journey_events WHERE journey_id = j.id ORDER BY created_at DESC LIMIT 1) AS last_event_title,
        (SELECT created_at FROM customer_repair_journey_events WHERE journey_id = j.id ORDER BY created_at DESC LIMIT 1) AS last_event_at
      FROM customer_repair_journeys j
      LEFT JOIN service_requests sr ON sr.id = COALESCE(j.service_request_id, j.quote_request_id)
      LEFT JOIN job_tickets jt ON jt.id = j.job_ticket_id
      LEFT JOIN users u ON u.id = j.customer_id
      ${whereClause}
      ORDER BY j.updated_at DESC
      LIMIT ${limit}
    `);

    return (rows.rows as any[]).map(toEnrichedAdminView);
  },

  async getAdminJourneysByCustomer(customerId: string) {
    const rows = await db.execute(sql`
      SELECT j.*,
        sr.ticket_number AS sr_ticket_number,
        sr.brand AS device_brand,
        COALESCE(jt.model_number, sr.model_number) AS device_model,
        sr.screen_size AS sr_screen_size,
        sr.quote_amount AS quote_amount,
        sr.quote_status AS quote_status,
        sr.payment_status AS sr_payment_status,
        COALESCE(jt.serial_number, jt.tv_serial_number) AS serial_number,
        jt.status AS job_status,
        jt.payment_status AS job_payment_status,
        jt.device AS job_device,
        (SELECT title FROM customer_repair_journey_events WHERE journey_id = j.id ORDER BY created_at DESC LIMIT 1) AS last_event_title,
        (SELECT created_at FROM customer_repair_journey_events WHERE journey_id = j.id ORDER BY created_at DESC LIMIT 1) AS last_event_at
      FROM customer_repair_journeys j
      LEFT JOIN service_requests sr ON sr.id = COALESCE(j.service_request_id, j.quote_request_id)
      LEFT JOIN job_tickets jt ON jt.id = j.job_ticket_id
      WHERE j.customer_id = ${customerId}
      ORDER BY j.updated_at DESC
      LIMIT 50
    `);
    return (rows.rows as any[]).map(toEnrichedAdminView);
  },

  async addCustomerQuestion(journeyId: string, customerId: string, question: string) {
    const journeyRows = await db.execute(sql`
      SELECT id FROM customer_repair_journeys
      WHERE id = ${journeyId} AND customer_id = ${customerId}
    `);
    if (!journeyRows.rows[0]) return null;

    return this.addJourneyEvent({
      journeyId,
      eventType: "customer_question",
      title: "Customer Question",
      message: question,
      actorType: "customer",
      actorId: customerId,
      isCustomerVisible: true,
    });
  },

  async acceptQuoteForJourney(
    journeyId: string,
    customerId: string,
    payload: {
      servicePreference: string;
      pickupTier?: string;
      address?: string;
      scheduledVisitDate?: string;
    }
  ): Promise<{ success: true; data: any } | { success: false; error: string; status: number }> {
    const journeyRows = await db.execute(sql`
      SELECT id, quote_request_id, customer_id, current_stage
      FROM customer_repair_journeys
      WHERE id = ${journeyId} AND customer_id = ${customerId}
    `);
    const journey = journeyRows.rows[0] as any;
    if (!journey) {
      return { success: false, error: "Journey not found", status: 404 };
    }
    if (!journey.quote_request_id) {
      return { success: false, error: "This journey has no linked quote", status: 400 };
    }
    if (journey.current_stage !== "quote_sent") {
      if (journey.current_stage === "quote_accepted") {
        return { success: false, error: "Quote has already been accepted", status: 409 };
      }
      return { success: false, error: "Quote is not in a state that can be accepted", status: 400 };
    }

    const quoteId = journey.quote_request_id as string;
    const { servicePreference, pickupTier, address, scheduledVisitDate } = payload;

    if (!servicePreference || !["home_pickup", "service_center"].includes(servicePreference)) {
      return { success: false, error: "Valid service preference is required (home_pickup or service_center)", status: 400 };
    }
    if (servicePreference === "home_pickup" && !pickupTier) {
      return { success: false, error: "Pickup tier is required for home pickup service", status: 400 };
    }
    const validTiers = ["Regular", "Priority", "Emergency"];
    if (servicePreference === "home_pickup" && !validTiers.includes(pickupTier!)) {
      return { success: false, error: "Invalid pickup tier. Must be Regular, Priority, or Emergency", status: 400 };
    }

    const existingRequest = await serviceRequestRepo.getServiceRequest(quoteId);
    if (!existingRequest) {
      return { success: false, error: "Linked quote not found", status: 404 };
    }
    if (existingRequest.customerId !== customerId) {
      return { success: false, error: "Forbidden: You can only manage your own quote", status: 403 };
    }

    const actualPickupTier = servicePreference === "service_center" ? null : pickupTier;
    const trackingStatus = servicePreference === "home_pickup" ? "Arriving to Receive" : "Queued";
    const parsedScheduledVisitDate =
      servicePreference === "service_center" && scheduledVisitDate
        ? new Date(scheduledVisitDate)
        : null;

    const updated = await serviceRequestRepo.acceptQuote(
      quoteId,
      actualPickupTier,
      address || "",
      servicePreference,
      parsedScheduledVisitDate
    );
    if (!updated) {
      return { success: false, error: "Failed to accept quote", status: 500 };
    }

    await serviceRequestRepo.updateServiceRequest(quoteId, { trackingStatus } as any);

    let eventMessage =
      servicePreference === "home_pickup"
        ? "Our team is on the way to collect your TV."
        : "Your service request has been queued. Please bring your TV to our service center.";

    if (servicePreference === "service_center" && scheduledVisitDate) {
      const visitDate = new Date(scheduledVisitDate);
      eventMessage = `Your visit is scheduled for ${visitDate.toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      })}. Please bring your TV to our service center.`;
    }

    await serviceRequestRepo.createServiceRequestEvent({
      serviceRequestId: quoteId,
      status: trackingStatus,
      message: eventMessage,
      actor: "System",
    });

    notifyAdminUpdate({
      type: "quote_accepted",
      data: { ...updated, servicePreference, trackingStatus, scheduledVisitDate },
      acceptedAt: new Date().toISOString(),
    });

    if (updated.customerId) {
      pushService
        .notifyQuoteAccepted(updated.customerId, updated.ticketNumber || updated.id)
        .catch((err) => console.error("[Push] Failed to send quote accepted notification:", (err as Error).message));
    }

    const scheduleType = servicePreference === "home_pickup" ? "pickup" : "service_center_visit";
    const journeyMode = servicePreference === "home_pickup" ? "pickup" : "drop_off";
    const isPickup = servicePreference === "home_pickup";

    await db.execute(sql`
      UPDATE customer_repair_journeys
      SET current_stage = 'quote_accepted',
          customer_friendly_status = ${FRIENDLY_STATUS["quote_accepted"]},
          next_action = 'schedule_service',
          next_action_label = 'Schedule Pickup or Visit',
          service_mode = ${journeyMode},
          pickup_required = ${isPickup},
          dropoff_required = ${!isPickup},
          updated_at = NOW()
      WHERE id = ${journeyId}
    `);

    await this.addJourneyEvent({
      journeyId,
      eventType: "stage_quote_accepted",
      title: "Quote Accepted",
      message: FRIENDLY_STATUS["quote_accepted"],
      actorType: "system",
    });

    await this.insertScheduleRow({
      journeyId,
      scheduleType,
      requestedDate: scheduledVisitDate || undefined,
      customerNote: address || undefined,
    });

    await this.addJourneyEvent({
      journeyId,
      eventType: "schedule_requested",
      title: `${scheduleType.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")} Requested`,
      message: isPickup
        ? "A pickup has been requested."
        : "A service center visit has been scheduled.",
      actorType: "system",
    });

    console.log(`[RepairJourney] Quote ${quoteId} accepted via journey ${journeyId}`);

    return {
      success: true,
      data: {
        ...updated,
        servicePreference,
        trackingStatus,
        scheduledPickupDate: parsedScheduledVisitDate,
      },
    };
  },

  // ── Unified sync functions ──

  async syncJobStatusToJourney(jobId: string, newStatus: string, jobData?: { device?: string; warrantyDays?: number; warrantyExpiryDate?: Date | string | null }) {
    const rows = await db.execute(sql`
      SELECT id FROM customer_repair_journeys WHERE job_ticket_id = ${jobId} LIMIT 1
    `);
    const journeyId = (rows.rows[0] as any)?.id;
    if (!journeyId) return;

    const JOB_TO_JOURNEY: Record<string, { stage: JourneyStage; title: string; message: string } | null> = {
      "Pending":        { stage: "device_received",     title: "Device Received",          message: "Your device has been received and a work order has been created." },
      "Diagnosing":     { stage: "inspection_started",  title: "Inspection Started",       message: "Our technician has started inspecting your device." },
      "Pending Parts":  { stage: "repair_in_progress",  title: "Waiting for Parts",        message: "We are sourcing the parts needed for your repair." },
      "Waiting on Parts": { stage: "repair_in_progress", title: "Parts Needed",             message: "Your repair needs additional parts. Our team will update you when the parts are available." },
      "In Progress":    { stage: "repair_in_progress",  title: "Repair In Progress",       message: "Your device is being repaired." },
      "On Workbench":   { stage: "repair_in_progress",  title: "Repair In Progress",       message: "Your device is on the workbench." },
      "Ready":          { stage: "repair_completed",    title: "Repair Completed",         message: "Your device is ready! We will arrange delivery or you can pick it up." },
      "Completed":      { stage: "repair_completed",    title: "Repair Completed",         message: "Your repair is complete." },
      "Delivered":      { stage: "delivered",            title: "Delivered",                message: "Your device has been delivered. Thank you for choosing Promise Electronics!" },
      "Cancelled":      { stage: "cancelled",           title: "Cancelled",                message: "This repair has been cancelled." },
    };

    const mapping = JOB_TO_JOURNEY[newStatus];
    if (!mapping) return;

    const friendly = FRIENDLY_STATUS[mapping.stage] || mapping.message;
    const nextAction = NEXT_ACTION_MAP[mapping.stage] || null;
    await db.execute(sql`
      UPDATE customer_repair_journeys
      SET current_stage = ${mapping.stage},
          customer_friendly_status = ${friendly},
          next_action = ${nextAction?.action || null},
          next_action_label = ${nextAction?.label || null},
          updated_at = NOW()
      WHERE id = ${journeyId}
    `);

    await this.addJourneyEvent({
      journeyId,
      eventType: `job_${newStatus.toLowerCase().replace(/\s+/g, "_")}`,
      title: mapping.title,
      message: mapping.message,
      actorType: "system",
      isCustomerVisible: true,
    });

    if (newStatus === "Completed" || newStatus === "Ready") {
      const expiryDate = jobData?.warrantyExpiryDate;
      if (expiryDate) {
        const formatted = new Date(expiryDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
        await this.addJourneyEvent({
          journeyId,
          eventType: "warranty_active",
          title: "Warranty Active",
          message: `Your repair warranty is active until ${formatted}.`,
          actorType: "system",
          isCustomerVisible: true,
        });
      }
    }

    console.log(`[RepairJourney] Job ${jobId} status ${newStatus} synced to journey ${journeyId}`);
  },

  async syncJobConversionToJourney(serviceRequestId: string, jobTicketId: string) {
    const journeyId = await this.findJourneyByServiceRequest(serviceRequestId);
    if (!journeyId) {
      const quoteJourneyId = await this.findJourneyByQuoteRequest(serviceRequestId);
      if (quoteJourneyId) {
        await this.linkJourneyToJobTicket(quoteJourneyId, jobTicketId);
        await this.updateJourneyStage(quoteJourneyId, "device_received");
        return;
      }
      return;
    }
    await this.linkJourneyToJobTicket(journeyId, jobTicketId);
    await this.updateJourneyStage(journeyId, "device_received");
  },

  async confirmScheduleWithPickup(scheduleId: string, opts: {
    confirmedDate: string;
    confirmedTimeWindow: string;
    adminNote?: string;
    assignedDriverId?: string;
    zone?: string;
    routeOrder?: number;
  }) {
    await db.execute(sql`
      UPDATE customer_repair_schedules
      SET status = 'confirmed',
          confirmed_date = ${opts.confirmedDate},
          confirmed_time_window = ${opts.confirmedTimeWindow},
          admin_note = ${opts.adminNote || null},
          assigned_driver_id = ${opts.assignedDriverId || null},
          zone = ${opts.zone || null},
          route_order = ${opts.routeOrder || null},
          updated_at = NOW()
      WHERE id = ${scheduleId}
    `);

    const scheduleRows = await db.execute(sql`
      SELECT journey_id, schedule_type FROM customer_repair_schedules WHERE id = ${scheduleId}
    `);
    const schedule = scheduleRows.rows[0] as any;
    if (!schedule) return;

    const friendly = FRIENDLY_STATUS["schedule_confirmed"];
    const nextAction = NEXT_ACTION_MAP["schedule_confirmed"] || null;
    await db.execute(sql`
      UPDATE customer_repair_journeys
      SET current_stage = 'schedule_confirmed',
          customer_friendly_status = ${friendly},
          next_action = ${nextAction?.action || null},
          next_action_label = ${nextAction?.label || null},
          updated_at = NOW()
      WHERE id = ${schedule.journey_id}
    `);

    const typeLabel = schedule.schedule_type.split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    await this.addJourneyEvent({
      journeyId: schedule.journey_id,
      eventType: "schedule_confirmed",
      title: "Schedule Confirmed",
      message: `Your ${typeLabel.toLowerCase()} is confirmed for ${opts.confirmedDate} (${opts.confirmedTimeWindow}).`,
      actorType: "admin",
      isCustomerVisible: true,
    });

    if (schedule.schedule_type === "pickup" || schedule.schedule_type === "home_visit") {
      const journeyRows = await db.execute(sql`
        SELECT service_request_id, quote_request_id FROM customer_repair_journeys WHERE id = ${schedule.journey_id}
      `);
      const jRow = journeyRows.rows[0] as any;
      const srId = jRow?.service_request_id || jRow?.quote_request_id;
      if (srId) {
        const existing = await storage.getPickupScheduleByServiceRequestId(srId);
        if (!existing) {
          const pickup = await storage.createPickupSchedule({
            serviceRequestId: srId,
            tier: "Regular",
            scheduledDate: new Date(opts.confirmedDate),
            pickupAddress: opts.adminNote || "",
            assignedStaff: opts.assignedDriverId || null,
          } as any);

          await db.execute(sql`
            UPDATE customer_repair_schedules
            SET pickup_schedule_id = ${pickup.id}
            WHERE id = ${scheduleId}
          `);

          console.log(`[RepairJourney] Created pickup schedule ${pickup.id} from confirmed schedule ${scheduleId}`);
        }
      }
    }

    const custRows = await db.execute(sql`
      SELECT customer_id FROM customer_repair_journeys WHERE id = ${schedule.journey_id}
    `);
    const customerId = (custRows.rows[0] as any)?.customer_id;
    if (customerId) {
      notifyCustomerUpdate(customerId, {
        type: "schedule_confirmed",
        journeyId: schedule.journey_id,
        confirmedDate: opts.confirmedDate,
        confirmedTimeWindow: opts.confirmedTimeWindow,
        updatedAt: new Date().toISOString(),
      });
    }

    console.log(`[RepairJourney] Schedule ${scheduleId} confirmed with pickup bridge`);
  },

  async syncPickupStatusToJourney(serviceRequestId: string, pickupStatus: string) {
    const journeyId = await this.findJourneyByServiceRequest(serviceRequestId);
    if (!journeyId) return;

    const PICKUP_TO_JOURNEY: Record<string, { stage: JourneyStage; title: string; message: string } | null> = {
      "Scheduled":  { stage: "schedule_confirmed",  title: "Pickup Scheduled",         message: "Your pickup has been scheduled." },
      "PickedUp":   { stage: "device_received",      title: "Device Picked Up",         message: "We have collected your device. It is on the way to our service center." },
      "Delivered":  { stage: "delivered",             title: "Device Delivered",          message: "Your device has been delivered back to you." },
    };

    const mapping = PICKUP_TO_JOURNEY[pickupStatus];
    if (!mapping) return;

    const friendly = FRIENDLY_STATUS[mapping.stage] || mapping.message;
    const nextAction = NEXT_ACTION_MAP[mapping.stage] || null;
    await db.execute(sql`
      UPDATE customer_repair_journeys
      SET current_stage = ${mapping.stage},
          customer_friendly_status = ${friendly},
          next_action = ${nextAction?.action || null},
          next_action_label = ${nextAction?.label || null},
          updated_at = NOW()
      WHERE id = ${journeyId}
    `);

    await this.addJourneyEvent({
      journeyId,
      eventType: `pickup_${pickupStatus.toLowerCase()}`,
      title: mapping.title,
      message: mapping.message,
      actorType: "system",
      isCustomerVisible: true,
    });

    console.log(`[RepairJourney] Pickup status ${pickupStatus} synced to journey for SR ${serviceRequestId}`);
  },

  async createWarrantyClaim(opts: {
    jobId: string;
    customerId: string;
    claimType: "service" | "parts";
    issueDescription: string;
  }): Promise<{ success: true; claimId: string } | { success: false; error: string; status: number }> {
    const job = await jobRepo.getJobTicket(opts.jobId);
    if (!job) {
      return { success: false, error: "Job not found", status: 404 };
    }

    if ((job as any).customerPhone) {
      const customer = await storage.getCustomer(opts.customerId);
      if (!customer?.phone || customer.phone !== (job as any).customerPhone) {
        return { success: false, error: "This job does not belong to your account", status: 403 };
      }
    }

    const now = new Date();
    const expiryDate = (job as any).warrantyExpiryDate ? new Date((job as any).warrantyExpiryDate) : null;
    if (!expiryDate || expiryDate < now) {
      return { success: false, error: "Warranty has expired for this repair", status: 400 };
    }

    if (!["service", "parts"].includes(opts.claimType)) {
      return { success: false, error: "Claim type must be 'service' or 'parts'", status: 400 };
    }

    const customer = await storage.getCustomer(opts.customerId);
    const claimId = nanoid();

    await db.execute(sql`
      INSERT INTO warranty_claims (id, original_job_id, customer, customer_phone, device, claim_type, claim_reason,
        warranty_valid, warranty_expiry_date, claimed_by, claimed_by_name, claimed_by_role, status, created_at, updated_at)
      VALUES (${claimId}, ${opts.jobId}, ${customer?.name || "Customer"}, ${customer?.phone || ""},
        ${(job as any).device || ""}, ${opts.claimType}, ${opts.issueDescription},
        TRUE, ${expiryDate.toISOString()}::timestamp, ${opts.customerId}, ${customer?.name || "Customer"}, 'Customer',
        'pending', NOW(), NOW())
    `);

    const journeyId = nanoid();
    await db.execute(sql`
      INSERT INTO customer_repair_journeys
        (id, customer_id, job_ticket_id, warranty_claim_id, current_stage, current_status,
         customer_friendly_status, service_mode, created_at, updated_at)
      VALUES
        (${journeyId}, ${opts.customerId}, ${opts.jobId}, ${claimId}, 'quote_requested', 'active',
         'Your warranty claim has been submitted. Our team will review it shortly.', 'quote_only', NOW(), NOW())
    `);

    await this.addJourneyEvent({
      journeyId,
      eventType: "warranty_claim_submitted",
      title: "Warranty Claim Submitted",
      message: `You submitted a ${opts.claimType} warranty claim: ${opts.issueDescription}`,
      actorType: "customer",
      actorId: opts.customerId,
      isCustomerVisible: true,
    });

    notifyAdminUpdate({
      type: "warranty_claim_created",
      data: { claimId, jobId: opts.jobId, claimType: opts.claimType },
      createdAt: new Date().toISOString(),
    });

    console.log(`[RepairJourney] Warranty claim ${claimId} created for job ${opts.jobId}`);

    return { success: true, claimId };
  },

  async syncBillToJourney(opts: {
    jobId: string;
    invoiceNumber?: string;
    transactionId?: string;
    amount?: number;
    paymentMethod?: string;
  }) {
    const rows = await db.execute(sql`
      SELECT id FROM customer_repair_journeys WHERE job_ticket_id = ${opts.jobId} LIMIT 1
    `);
    const journeyId = (rows.rows[0] as any)?.id;
    if (!journeyId) {
      console.log(`[RepairJourney] No journey found for bill job ${opts.jobId}`);
      return;
    }

    const dedupKey = opts.invoiceNumber || opts.transactionId || opts.jobId;
    const existing = await db.execute(sql`
      SELECT id FROM customer_repair_journey_events
      WHERE journey_id = ${journeyId} AND event_type = 'bill_ready'
        AND metadata::text LIKE ${'%' + dedupKey + '%'}
      LIMIT 1
    `);
    if (existing.rows.length > 0) {
      console.log(`[RepairJourney] Bill event already exists for ${dedupKey}, skipping`);
      return;
    }

    const hasAmount = typeof opts.amount === 'number' && opts.amount > 0;
    await this.addJourneyEvent({
      journeyId,
      eventType: "bill_ready",
      title: "Bill Ready",
      message: hasAmount
        ? `Your bill is ready: ৳${opts.amount!.toLocaleString()}. Please review before delivery or pickup.`
        : "Your bill is ready. Please review the amount before delivery or pickup.",
      actorType: "system",
      isCustomerVisible: true,
      metadata: {
        invoiceNumber: opts.invoiceNumber || null,
        transactionId: opts.transactionId || null,
        amount: opts.amount || null,
        paymentMethod: opts.paymentMethod || null,
      },
    });

    await db.execute(sql`
      UPDATE customer_repair_journeys
      SET next_action = 'review_bill',
          next_action_label = 'Review Bill',
          updated_at = NOW()
      WHERE id = ${journeyId}
    `);

    console.log(`[RepairJourney] Bill event added for job ${opts.jobId} on journey ${journeyId}`);
  },

  async syncPaymentToJourney(opts: {
    jobId: string;
    paymentStatus: string;
    amount?: number;
  }) {
    const rows = await db.execute(sql`
      SELECT id FROM customer_repair_journeys WHERE job_ticket_id = ${opts.jobId} LIMIT 1
    `);
    const journeyId = (rows.rows[0] as any)?.id;
    if (!journeyId) return;

    if (opts.paymentStatus !== "paid") return;

    const existing = await db.execute(sql`
      SELECT id FROM customer_repair_journey_events
      WHERE journey_id = ${journeyId} AND event_type = 'payment_received'
      LIMIT 1
    `);
    if (existing.rows.length > 0) return;

    await this.addJourneyEvent({
      journeyId,
      eventType: "payment_received",
      title: "Payment Received",
      message: "Payment received. Thank you.",
      actorType: "system",
      isCustomerVisible: true,
    });

    await db.execute(sql`
      UPDATE customer_repair_journeys
      SET next_action = NULL,
          next_action_label = NULL,
          updated_at = NOW()
      WHERE id = ${journeyId}
        AND next_action = 'review_bill'
    `);

    console.log(`[RepairJourney] Payment received event added for job ${opts.jobId}`);
  },
};
