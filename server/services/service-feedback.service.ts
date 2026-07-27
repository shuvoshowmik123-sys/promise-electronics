/**
 * CUSTOMER-FEEDBACK-01A — canonical post-Delivered service feedback.
 * Never mutates Job/SR/journey/money/warranty or legacy customer_reviews.
 */
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import type { JobTicket } from "../../shared/schema.js";
import { userHasGranularPermission } from "../routes/middleware/auth.js";

export const FEEDBACK_WINDOW_DAYS = 14;
export const PUBLIC_DISPLAY_MONTHS = 12;

export class ServiceFeedbackError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ServiceFeedbackError";
    this.status = status;
    this.code = code;
  }
}

export type HandoverKind = "retail_job_delivered" | "corporate_challan_out";

export type EnsureOpportunityInput = {
  job: Pick<
    JobTicket,
    "id" | "status" | "customerPhone" | "customerPhoneNormalized" | "corporateClientId" | "completedAt"
  >;
  handoverKind: HandoverKind;
  handoverSourceId?: string | null;
  handoverAt?: Date;
  /** Optional open client for use inside an existing transaction */
  tx?: any;
};

function exec(client: any, query: any) {
  return client.execute ? client.execute(query) : db.execute(query);
}

function rowsOf(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result?.rows) return result.rows;
  return [];
}

function firstRow(result: any): any | undefined {
  return rowsOf(result)[0];
}

async function resolveOwnerLinks(jobId: string, client: any = db): Promise<{
  customerId: string | null;
  serviceRequestId: string | null;
  corporateClientId: string | null;
  ticketNumber: string | null;
  deviceLabel: string | null;
}> {
  const sr = firstRow(
    await exec(
      client,
      sql`
        SELECT id, customer_id AS "customerId", ticket_number AS "ticketNumber",
               brand, model_number AS "modelNumber"
        FROM service_requests
        WHERE converted_job_id = ${jobId}
        ORDER BY created_at DESC NULLS LAST
        LIMIT 1
      `,
    ),
  );

  let customerId = sr?.customerId ? String(sr.customerId) : null;
  if (!customerId) {
    const journey = firstRow(
      await exec(
        client,
        sql`
          SELECT customer_id AS "customerId", service_request_id AS "serviceRequestId"
          FROM customer_repair_journeys
          WHERE job_ticket_id = ${jobId}
          ORDER BY updated_at DESC NULLS LAST
          LIMIT 1
        `,
      ),
    );
    if (journey?.customerId) customerId = String(journey.customerId);
  }

  const job = firstRow(
    await exec(
      client,
      sql`
        SELECT device, customer_phone_normalized AS "phoneNorm",
               corporate_client_id AS "corporateClientId"
        FROM job_tickets WHERE id = ${jobId} LIMIT 1
      `,
    ),
  );

  if (!customerId && job?.phoneNorm) {
    const user = firstRow(
      await exec(
        client,
        sql`
          SELECT id FROM users
          WHERE role = 'Customer' AND phone_normalized = ${String(job.phoneNorm)}
          LIMIT 1
        `,
      ),
    );
    if (user?.id) customerId = String(user.id);
  }

  const deviceLabel = job?.device
    ? String(job.device)
    : sr?.brand
      ? `${sr.brand}${sr.modelNumber ? ` ${sr.modelNumber}` : ""}`.trim()
      : null;

  return {
    customerId,
    serviceRequestId: sr?.id ? String(sr.id) : null,
    corporateClientId: job?.corporateClientId ? String(job.corporateClientId) : null,
    ticketNumber: sr?.ticketNumber ? String(sr.ticketNumber) : null,
    deviceLabel,
  };
}

/**
 * Idempotent opportunity creation for a real Delivered handover.
 * Does not write Job/SR/journey/payment/reviews.
 */
export async function ensureFeedbackOpportunityForDelivered(
  input: EnsureOpportunityInput,
): Promise<{ created: boolean; opportunityId: string | null }> {
  const jobId = String(input.job.id);
  if (input.job.status && input.job.status !== "Delivered") {
    return { created: false, opportunityId: null };
  }

  const client = input.tx || db;
  const existing = firstRow(
    await exec(
      client,
      sql`SELECT id FROM service_feedback_opportunities WHERE job_ticket_id = ${jobId} LIMIT 1`,
    ),
  );
  if (existing?.id) {
    return { created: false, opportunityId: String(existing.id) };
  }

  const links = await resolveOwnerLinks(jobId, client);
  const handoverAt = input.handoverAt || input.job.completedAt || new Date();
  const windowEnds = new Date(handoverAt.getTime() + FEEDBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const opportunityId = randomUUID();
  const handoverEventId = randomUUID();

  try {
    await exec(
      client,
      sql`
        INSERT INTO service_feedback_opportunities (
          id, job_ticket_id, customer_id, service_request_id, corporate_client_id,
          handover_event_id, handover_kind, handover_source_id,
          handover_at, window_ends_at, status, publication_status, featured,
          public_consent, retention_status, created_at, updated_at
        ) VALUES (
          ${opportunityId},
          ${jobId},
          ${links.customerId},
          ${links.serviceRequestId},
          ${links.corporateClientId || input.job.corporateClientId || null},
          ${handoverEventId},
          ${input.handoverKind},
          ${input.handoverSourceId || null},
          ${handoverAt},
          ${windowEnds},
          'eligible',
          'hidden',
          FALSE,
          FALSE,
          'none',
          now(),
          now()
        )
        ON CONFLICT (job_ticket_id) DO NOTHING
      `,
    );
  } catch (err: any) {
    // Unique race: another writer won
    const again = firstRow(
      await exec(
        client,
        sql`SELECT id FROM service_feedback_opportunities WHERE job_ticket_id = ${jobId} LIMIT 1`,
      ),
    );
    if (again?.id) return { created: false, opportunityId: String(again.id) };
    throw err;
  }

  const row = firstRow(
    await exec(
      client,
      sql`SELECT id FROM service_feedback_opportunities WHERE job_ticket_id = ${jobId} LIMIT 1`,
    ),
  );
  const id = row?.id ? String(row.id) : null;
  return { created: id === opportunityId, opportunityId: id };
}

function toIso(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Customer-safe DTO: opaque resource id only — no handoverEventId / job / staff fields. */
function customerSafeDto(row: any, version: any | null) {
  const now = Date.now();
  const windowEnds = row.window_ends_at ? new Date(row.window_ends_at).getTime() : 0;
  const withinWindow = now <= windowEnds;
  return {
    id: String(row.id),
    handoverAt: toIso(row.handover_at),
    windowEndsAt: toIso(row.window_ends_at),
    status: String(row.status),
    canSubmit: String(row.status) === "eligible" && withinWindow,
    canReplace: String(row.status) === "submitted" && withinWindow,
    withinWindow,
    publicConsent: Boolean(row.public_consent),
    consentWithdrawnAt: toIso(row.consent_withdrawn_at),
    deviceLabel: row.device_label || null,
    ticketNumber: row.ticket_number || null,
    current: version
      ? {
          rating: Number(version.rating),
          comment: version.comment ?? null,
          publicConsent: Boolean(version.public_consent),
          submittedAt: toIso(version.submitted_at),
          versionNo: Number(version.version_no),
        }
      : null,
  };
}

/** Deterministic homepage text from customer comment only — never staff-composed. */
export function publicExcerptFromCustomerComment(comment: string | null | undefined): string | null {
  if (comment == null) return null;
  const t = String(comment);
  if (!t.trim()) return null;
  if (t.length <= 500) return t;
  return t.slice(0, 500);
}

const RECOVERY_UPDATE_STATUSES = new Set(["open", "in_progress"]);
const RECOVERY_ASSIGNMENT_SCOPES = new Set(["delivery_pickup", "general"]);

async function loadOpportunityForCustomer(opportunityId: string, customerId: string) {
  const row = firstRow(
    await db.execute(sql`
      SELECT o.*,
             sr.ticket_number AS ticket_number,
             jt.device AS device_label
      FROM service_feedback_opportunities o
      LEFT JOIN service_requests sr ON sr.id = o.service_request_id
      LEFT JOIN job_tickets jt ON jt.id = o.job_ticket_id
      WHERE o.id = ${opportunityId}
      LIMIT 1
    `),
  );
  if (!row) throw new ServiceFeedbackError(404, "FEEDBACK_NOT_FOUND", "Feedback opportunity not found");
  if (!row.customer_id || String(row.customer_id) !== customerId) {
    throw new ServiceFeedbackError(403, "FEEDBACK_NOT_OWNER", "You cannot access this feedback");
  }
  return row;
}

export async function listCustomerFeedbackOpportunities(customerId: string) {
  const result = await db.execute(sql`
    SELECT o.*,
           sr.ticket_number AS ticket_number,
           jt.device AS device_label
    FROM service_feedback_opportunities o
    LEFT JOIN service_requests sr ON sr.id = o.service_request_id
    LEFT JOIN job_tickets jt ON jt.id = o.job_ticket_id
    WHERE o.customer_id = ${customerId}
    ORDER BY o.handover_at DESC
  `);
  const items = [];
  for (const row of rowsOf(result)) {
    let version = null;
    if (row.current_version_id) {
      version = firstRow(
        await db.execute(sql`
          SELECT * FROM service_feedback_versions WHERE id = ${String(row.current_version_id)} LIMIT 1
        `),
      );
    }
    items.push(customerSafeDto(row, version));
  }
  return { items };
}

export async function getCustomerFeedbackOpportunity(opportunityId: string, customerId: string) {
  const row = await loadOpportunityForCustomer(opportunityId, customerId);
  let version = null;
  if (row.current_version_id) {
    version = firstRow(
      await db.execute(sql`
        SELECT * FROM service_feedback_versions WHERE id = ${String(row.current_version_id)} LIMIT 1
      `),
    );
  }
  const history = rowsOf(
    await db.execute(sql`
      SELECT version_no AS "versionNo", rating, comment, public_consent AS "publicConsent",
             submitted_at AS "submittedAt", superseded_at AS "supersededAt"
      FROM service_feedback_versions
      WHERE opportunity_id = ${opportunityId}
      ORDER BY version_no ASC
    `),
  ).map((h) => ({
    versionNo: Number(h.versionNo),
    rating: Number(h.rating),
    comment: h.comment ?? null,
    publicConsent: Boolean(h.publicConsent),
    submittedAt: toIso(h.submittedAt),
    supersededAt: toIso(h.supersededAt),
  }));
  return { ...customerSafeDto(row, version), history };
}

export async function submitCustomerFeedback(opts: {
  opportunityId: string;
  customerId: string;
  rating: number;
  comment?: string | null;
  publicConsent?: boolean;
}) {
  const rating = Number(opts.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new ServiceFeedbackError(400, "RATING_REQUIRED", "A rating from 1 to 5 is required");
  }
  const comment =
    opts.comment == null || String(opts.comment).trim() === ""
      ? null
      : String(opts.comment).trim().slice(0, 2000);
  const publicConsent = Boolean(opts.publicConsent);

  return await db.transaction(async (tx) => {
    const lock = firstRow(
      await exec(
        tx,
        sql`
          SELECT * FROM service_feedback_opportunities
          WHERE id = ${opts.opportunityId}
          FOR UPDATE
        `,
      ),
    );
    if (!lock) throw new ServiceFeedbackError(404, "FEEDBACK_NOT_FOUND", "Feedback opportunity not found");
    if (!lock.customer_id || String(lock.customer_id) !== opts.customerId) {
      throw new ServiceFeedbackError(403, "FEEDBACK_NOT_OWNER", "You cannot access this feedback");
    }

    const now = new Date();
    const windowEnds = new Date(lock.window_ends_at);
    if (now > windowEnds) {
      throw new ServiceFeedbackError(409, "FEEDBACK_WINDOW_CLOSED", "The feedback window has closed");
    }

    const current = lock.current_version_id
      ? firstRow(
          await exec(
            tx,
            sql`SELECT * FROM service_feedback_versions WHERE id = ${String(lock.current_version_id)} LIMIT 1`,
          ),
        )
      : null;

    let versionNo = 1;
    if (current) {
      await exec(
        tx,
        sql`
          UPDATE service_feedback_versions
          SET superseded_at = ${now}
          WHERE id = ${String(current.id)} AND superseded_at IS NULL
        `,
      );
      versionNo = Number(current.version_no) + 1;
    }

    const versionId = randomUUID();
    await exec(
      tx,
      sql`
        INSERT INTO service_feedback_versions (
          id, opportunity_id, version_no, rating, comment, public_consent, submitted_at, superseded_at
        ) VALUES (
          ${versionId}, ${opts.opportunityId}, ${versionNo}, ${rating}, ${comment},
          ${publicConsent}, ${now}, NULL
        )
      `,
    );

    const consentAt = publicConsent ? now : null;
    const withdrawnAt = publicConsent ? null : lock.consent_withdrawn_at;
    let publicationStatus = String(lock.publication_status || "hidden");
    let featured = Boolean(lock.featured);
    let displayExpires = lock.display_expires_at;
    if (!publicConsent) {
      publicationStatus = "hidden";
      featured = false;
      displayExpires = null;
    }

    await exec(
      tx,
      sql`
        UPDATE service_feedback_opportunities SET
          status = 'submitted',
          current_version_id = ${versionId},
          public_consent = ${publicConsent},
          public_consent_at = COALESCE(${consentAt}, public_consent_at),
          consent_withdrawn_at = ${withdrawnAt},
          publication_status = ${publicationStatus},
          featured = ${featured},
          display_expires_at = ${displayExpires},
          updated_at = ${now}
        WHERE id = ${opts.opportunityId}
      `,
    );

    if (rating <= 2) {
      await exec(
        tx,
        sql`
          INSERT INTO service_feedback_recovery_cases (
            id, opportunity_id, feedback_version_id, rating_snapshot, status,
            created_at, updated_at
          ) VALUES (
            ${randomUUID()}, ${opts.opportunityId}, ${versionId}, ${rating}, 'open',
            ${now}, ${now}
          )
          ON CONFLICT (feedback_version_id) DO NOTHING
        `,
      );
    }

    return {
      id: opts.opportunityId,
      versionId,
      versionNo,
      rating,
      comment,
      publicConsent,
      submittedAt: now.toISOString(),
    };
  });
}

export async function withdrawCustomerConsent(opportunityId: string, customerId: string) {
  return await db.transaction(async (tx) => {
    const lock = firstRow(
      await exec(
        tx,
        sql`
          SELECT * FROM service_feedback_opportunities
          WHERE id = ${opportunityId}
          FOR UPDATE
        `,
      ),
    );
    if (!lock) throw new ServiceFeedbackError(404, "FEEDBACK_NOT_FOUND", "Feedback opportunity not found");
    if (!lock.customer_id || String(lock.customer_id) !== customerId) {
      throw new ServiceFeedbackError(403, "FEEDBACK_NOT_OWNER", "You cannot access this feedback");
    }
    const now = new Date();
    await exec(
      tx,
      sql`
        UPDATE service_feedback_opportunities SET
          public_consent = FALSE,
          consent_withdrawn_at = ${now},
          publication_status = 'hidden',
          featured = FALSE,
          featured_at = NULL,
          display_expires_at = NULL,
          updated_at = ${now}
        WHERE id = ${opportunityId}
      `,
    );
    if (lock.current_version_id) {
      await exec(
        tx,
        sql`
          UPDATE service_feedback_versions
          SET public_consent = FALSE
          WHERE id = ${String(lock.current_version_id)} AND superseded_at IS NULL
        `,
      );
    }
    return { id: opportunityId, publicConsent: false, withdrawnAt: now.toISOString() };
  });
}

function assertStaffPerm(
  user: { id: string; role: string; permissions?: string | null },
  key: string,
) {
  if (!userHasGranularPermission(user, key)) {
    throw new ServiceFeedbackError(403, "PERMISSION_DENIED", `Missing permission ${key}`);
  }
}

export async function listRecoveryCases(
  user: { id: string; role: string; permissions?: string | null },
  opts?: { status?: string },
) {
  const canAll = userHasGranularPermission(user, "feedback.recovery.viewAll");
  const canAssigned = userHasGranularPermission(user, "feedback.recovery.viewAssigned");
  if (!canAll && !canAssigned) {
    throw new ServiceFeedbackError(403, "PERMISSION_DENIED", "Missing recovery view permission");
  }

  const statusFilter = opts?.status ? String(opts.status) : null;
  let result;
  if (canAll && statusFilter) {
    result = await db.execute(sql`
      SELECT c.id, c.opportunity_id AS "opportunityId", c.feedback_version_id AS "feedbackVersionId",
             c.rating_snapshot AS "ratingSnapshot", c.status, c.assigned_to_user_id AS "assignedToUserId",
             c.assignment_scope AS "assignmentScope", c.logistics_task_id AS "logisticsTaskId",
             c.staff_notes AS "staffNotes", c.resolved_by AS "resolvedBy",
             c.resolved_at AS "resolvedAt", c.created_at AS "createdAt",
             o.handover_event_id AS "handoverEventId", o.job_ticket_id AS "jobTicketId",
             v.comment AS "customerComment"
      FROM service_feedback_recovery_cases c
      JOIN service_feedback_opportunities o ON o.id = c.opportunity_id
      JOIN service_feedback_versions v ON v.id = c.feedback_version_id
      WHERE c.status = ${statusFilter}
      ORDER BY c.created_at DESC
      LIMIT 200
    `);
  } else if (canAll) {
    result = await db.execute(sql`
      SELECT c.id, c.opportunity_id AS "opportunityId", c.feedback_version_id AS "feedbackVersionId",
             c.rating_snapshot AS "ratingSnapshot", c.status, c.assigned_to_user_id AS "assignedToUserId",
             c.assignment_scope AS "assignmentScope", c.logistics_task_id AS "logisticsTaskId",
             c.staff_notes AS "staffNotes", c.resolved_by AS "resolvedBy",
             c.resolved_at AS "resolvedAt", c.created_at AS "createdAt",
             o.handover_event_id AS "handoverEventId", o.job_ticket_id AS "jobTicketId",
             v.comment AS "customerComment"
      FROM service_feedback_recovery_cases c
      JOIN service_feedback_opportunities o ON o.id = c.opportunity_id
      JOIN service_feedback_versions v ON v.id = c.feedback_version_id
      ORDER BY c.created_at DESC
      LIMIT 200
    `);
  } else if (statusFilter) {
    result = await db.execute(sql`
      SELECT c.id, c.opportunity_id AS "opportunityId", c.feedback_version_id AS "feedbackVersionId",
             c.rating_snapshot AS "ratingSnapshot", c.status, c.assigned_to_user_id AS "assignedToUserId",
             c.assignment_scope AS "assignmentScope", c.logistics_task_id AS "logisticsTaskId",
             c.staff_notes AS "staffNotes", c.resolved_by AS "resolvedBy",
             c.resolved_at AS "resolvedAt", c.created_at AS "createdAt",
             o.handover_event_id AS "handoverEventId", o.job_ticket_id AS "jobTicketId",
             v.comment AS "customerComment"
      FROM service_feedback_recovery_cases c
      JOIN service_feedback_opportunities o ON o.id = c.opportunity_id
      JOIN service_feedback_versions v ON v.id = c.feedback_version_id
      WHERE c.assigned_to_user_id = ${user.id}
        AND c.status = ${statusFilter}
      ORDER BY c.created_at DESC
      LIMIT 200
    `);
  } else {
    result = await db.execute(sql`
      SELECT c.id, c.opportunity_id AS "opportunityId", c.feedback_version_id AS "feedbackVersionId",
             c.rating_snapshot AS "ratingSnapshot", c.status, c.assigned_to_user_id AS "assignedToUserId",
             c.assignment_scope AS "assignmentScope", c.logistics_task_id AS "logisticsTaskId",
             c.staff_notes AS "staffNotes", c.resolved_by AS "resolvedBy",
             c.resolved_at AS "resolvedAt", c.created_at AS "createdAt",
             o.handover_event_id AS "handoverEventId", o.job_ticket_id AS "jobTicketId",
             v.comment AS "customerComment"
      FROM service_feedback_recovery_cases c
      JOIN service_feedback_opportunities o ON o.id = c.opportunity_id
      JOIN service_feedback_versions v ON v.id = c.feedback_version_id
      WHERE c.assigned_to_user_id = ${user.id}
      ORDER BY c.created_at DESC
      LIMIT 200
    `);
  }

  return {
    items: rowsOf(result).map((r) => ({
      id: String(r.id),
      opportunityId: String(r.opportunityId),
      feedbackVersionId: String(r.feedbackVersionId),
      ratingSnapshot: Number(r.ratingSnapshot),
      status: String(r.status),
      assignedToUserId: r.assignedToUserId ? String(r.assignedToUserId) : null,
      assignmentScope: r.assignmentScope ?? null,
      logisticsTaskId: r.logisticsTaskId ?? null,
      staffNotes: r.staffNotes ?? null,
      resolvedBy: r.resolvedBy ?? null,
      resolvedAt: toIso(r.resolvedAt),
      createdAt: toIso(r.createdAt),
      handoverEventId: String(r.handoverEventId),
      jobTicketId: String(r.jobTicketId),
      customerComment: r.customerComment ?? null,
    })),
  };
}

async function assertEligibleRecoveryAssignee(userId: string): Promise<void> {
  const u = firstRow(
    await db.execute(sql`
      SELECT id, role, status FROM users WHERE id = ${userId} LIMIT 1
    `),
  );
  if (!u) {
    throw new ServiceFeedbackError(400, "INVALID_ASSIGNEE", "Assignee not found");
  }
  if (String(u.status) !== "Active") {
    throw new ServiceFeedbackError(400, "INVALID_ASSIGNEE", "Assignee is not active");
  }
  const role = String(u.role || "");
  if (role === "Customer" || role === "Corporate") {
    throw new ServiceFeedbackError(400, "INVALID_ASSIGNEE", "Assignee must be staff");
  }
}

export async function updateRecoveryCase(
  user: { id: string; role: string; permissions?: string | null },
  caseId: string,
  patch: {
    staffNotes?: string;
    status?: string;
    assignedToUserId?: string | null;
    assignmentScope?: string | null;
    logisticsTaskId?: string | null;
  },
) {
  const row = firstRow(
    await db.execute(sql`SELECT * FROM service_feedback_recovery_cases WHERE id = ${caseId} LIMIT 1`),
  );
  if (!row) throw new ServiceFeedbackError(404, "RECOVERY_NOT_FOUND", "Recovery case not found");

  const canAll = userHasGranularPermission(user, "feedback.recovery.viewAll");
  const isAssignee = row.assigned_to_user_id && String(row.assigned_to_user_id) === user.id;
  if (!canAll && !isAssignee) {
    throw new ServiceFeedbackError(403, "RECOVERY_NOT_ASSIGNED", "Not assigned to this recovery case");
  }
  assertStaffPerm(user, "feedback.recovery.updateAssigned");

  if (patch.status === "resolved" || patch.status === "closed") {
    throw new ServiceFeedbackError(400, "USE_RESOLVE_ENDPOINT", "Use the resolve endpoint to close a case");
  }

  // Assigned Driver/staff without viewAll: only bounded in-progress fields (notes + open/in_progress).
  if (!canAll) {
    if (
      patch.assignedToUserId !== undefined ||
      patch.assignmentScope !== undefined ||
      patch.logisticsTaskId !== undefined
    ) {
      throw new ServiceFeedbackError(
        403,
        "RECOVERY_SCOPE_DENIED",
        "Assigned staff may not reassign or change assignment scope",
      );
    }
  }

  if (patch.status !== undefined) {
    const st = String(patch.status);
    if (!RECOVERY_UPDATE_STATUSES.has(st)) {
      throw new ServiceFeedbackError(
        400,
        "INVALID_RECOVERY_STATUS",
        "Recovery status must be open or in_progress",
      );
    }
  }

  if (patch.assignmentScope !== undefined && patch.assignmentScope !== null) {
    const sc = String(patch.assignmentScope);
    if (!RECOVERY_ASSIGNMENT_SCOPES.has(sc)) {
      throw new ServiceFeedbackError(
        400,
        "INVALID_ASSIGNMENT_SCOPE",
        "Assignment scope is not allowlisted",
      );
    }
  }

  if (patch.assignedToUserId !== undefined && patch.assignedToUserId !== null) {
    const assigneeId = String(patch.assignedToUserId).trim();
    if (!assigneeId) {
      throw new ServiceFeedbackError(400, "INVALID_ASSIGNEE", "Assignee id is required");
    }
    await assertEligibleRecoveryAssignee(assigneeId);
  }

  if (patch.logisticsTaskId !== undefined && patch.logisticsTaskId !== null) {
    const lid = String(patch.logisticsTaskId).trim();
    if (lid.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(lid)) {
      throw new ServiceFeedbackError(400, "INVALID_LOGISTICS_TASK", "Invalid logistics task id");
    }
  }

  const notes =
    patch.staffNotes !== undefined ? String(patch.staffNotes).slice(0, 4000) : row.staff_notes;
  const status = patch.status !== undefined ? String(patch.status) : row.status;
  const assignee =
    patch.assignedToUserId !== undefined ? patch.assignedToUserId : row.assigned_to_user_id;
  const scope =
    patch.assignmentScope !== undefined ? patch.assignmentScope : row.assignment_scope;
  const logistics =
    patch.logisticsTaskId !== undefined ? patch.logisticsTaskId : row.logistics_task_id;

  await db.execute(sql`
    UPDATE service_feedback_recovery_cases SET
      staff_notes = ${notes},
      status = ${status},
      assigned_to_user_id = ${assignee},
      assignment_scope = ${scope},
      logistics_task_id = ${logistics},
      updated_at = now()
    WHERE id = ${caseId}
  `);

  return { id: caseId, status, assignedToUserId: assignee };
}

export async function resolveRecoveryCase(
  user: { id: string; role: string; permissions?: string | null },
  caseId: string,
  note?: string,
) {
  assertStaffPerm(user, "feedback.recovery.resolve");
  const row = firstRow(
    await db.execute(sql`SELECT * FROM service_feedback_recovery_cases WHERE id = ${caseId} LIMIT 1`),
  );
  if (!row) throw new ServiceFeedbackError(404, "RECOVERY_NOT_FOUND", "Recovery case not found");

  const canAll = userHasGranularPermission(user, "feedback.recovery.viewAll");
  const isAssignee = row.assigned_to_user_id && String(row.assigned_to_user_id) === user.id;
  if (!canAll && !isAssignee) {
    throw new ServiceFeedbackError(403, "RECOVERY_NOT_ASSIGNED", "Not assigned to this recovery case");
  }

  const now = new Date();
  const notes =
    note != null
      ? `${row.staff_notes ? row.staff_notes + "\n" : ""}${String(note).slice(0, 2000)}`
      : row.staff_notes;

  await db.execute(sql`
    UPDATE service_feedback_recovery_cases SET
      status = 'resolved',
      staff_notes = ${notes},
      resolved_by = ${user.id},
      resolved_at = ${now},
      updated_at = ${now}
    WHERE id = ${caseId}
  `);

  return { id: caseId, status: "resolved", resolvedAt: now.toISOString() };
}

function firstNameOrInitials(fullName: string | null | undefined): string {
  if (!fullName || !String(fullName).trim()) return "Customer";
  const parts = String(fullName).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 24);
  return `${parts[0]} ${parts[parts.length - 1][0]}.`.slice(0, 32);
}

export async function setPublication(
  user: { id: string; role: string; permissions?: string | null },
  opportunityId: string,
  action: "publish" | "hide",
) {
  assertStaffPerm(user, "feedback.public.moderate");
  const row = firstRow(
    await db.execute(sql`
      SELECT o.*, u.name AS customer_name, v.comment AS version_comment, v.rating AS version_rating
      FROM service_feedback_opportunities o
      LEFT JOIN users u ON u.id = o.customer_id
      LEFT JOIN service_feedback_versions v ON v.id = o.current_version_id
      WHERE o.id = ${opportunityId}
      LIMIT 1
    `),
  );
  if (!row) throw new ServiceFeedbackError(404, "FEEDBACK_NOT_FOUND", "Feedback opportunity not found");

  if (action === "publish") {
    if (!row.public_consent || row.consent_withdrawn_at) {
      throw new ServiceFeedbackError(409, "CONSENT_REQUIRED", "Customer public consent is required to publish");
    }
    if (String(row.status) !== "submitted" || !row.current_version_id) {
      throw new ServiceFeedbackError(409, "NO_FEEDBACK", "No submitted feedback to publish");
    }
    const displayName = firstNameOrInitials(row.customer_name);
    const publicExcerpt = publicExcerptFromCustomerComment(
      row.version_comment != null ? String(row.version_comment) : null,
    );
    const expires = new Date();
    expires.setMonth(expires.getMonth() + PUBLIC_DISPLAY_MONTHS);
    await db.execute(sql`
      UPDATE service_feedback_opportunities SET
        publication_status = 'published',
        public_display_name = ${displayName},
        public_excerpt = ${publicExcerpt},
        display_expires_at = ${expires},
        retention_status = 'active',
        updated_at = now()
      WHERE id = ${opportunityId}
    `);
    return {
      id: opportunityId,
      publicationStatus: "published",
      publicDisplayName: displayName,
      publicExcerpt,
      displayExpiresAt: expires.toISOString(),
    };
  }

  await db.execute(sql`
    UPDATE service_feedback_opportunities SET
      publication_status = 'hidden',
      featured = FALSE,
      featured_at = NULL,
      display_expires_at = NULL,
      retention_status = CASE WHEN retention_status = 'none' THEN 'none' ELSE 'hidden' END,
      updated_at = now()
    WHERE id = ${opportunityId}
  `);
  return { id: opportunityId, publicationStatus: "hidden", featured: false };
}

export async function setFeatured(
  user: { id: string; role: string; permissions?: string | null },
  opportunityId: string,
  featured: boolean,
) {
  assertStaffPerm(user, "feedback.public.feature");
  const row = firstRow(
    await db.execute(sql`
      SELECT * FROM service_feedback_opportunities WHERE id = ${opportunityId} LIMIT 1
    `),
  );
  if (!row) throw new ServiceFeedbackError(404, "FEEDBACK_NOT_FOUND", "Feedback opportunity not found");
  if (featured) {
    if (
      String(row.publication_status) !== "published" ||
      !row.public_consent ||
      row.consent_withdrawn_at
    ) {
      throw new ServiceFeedbackError(
        409,
        "NOT_PUBLISHED",
        "Only published consented reviews can be featured",
      );
    }
    await db.execute(sql`
      UPDATE service_feedback_opportunities SET
        featured = TRUE, featured_at = now(), updated_at = now()
      WHERE id = ${opportunityId}
    `);
  } else {
    await db.execute(sql`
      UPDATE service_feedback_opportunities SET
        featured = FALSE, featured_at = NULL, updated_at = now()
      WHERE id = ${opportunityId}
    `);
  }
  return { id: opportunityId, featured };
}

export async function retentionDecision(
  user: { id: string; role: string; permissions?: string | null },
  opportunityId: string,
  decision: "renew" | "hide" | "archive_anonymize",
) {
  assertStaffPerm(user, "feedback.retention.review");
  const row = firstRow(
    await db.execute(sql`
      SELECT * FROM service_feedback_opportunities WHERE id = ${opportunityId} LIMIT 1
    `),
  );
  if (!row) throw new ServiceFeedbackError(404, "FEEDBACK_NOT_FOUND", "Feedback opportunity not found");
  const now = new Date();

  if (decision === "renew") {
    // Fail closed: never republish withdrawn/hidden/archived or non-consented reviews.
    if (String(row.status) !== "submitted") {
      throw new ServiceFeedbackError(409, "RENEW_NOT_ELIGIBLE", "Only submitted feedback can be renewed");
    }
    if (!row.public_consent || row.consent_withdrawn_at) {
      throw new ServiceFeedbackError(
        409,
        "RENEW_CONSENT_WITHDRAWN",
        "Cannot renew without active public consent",
      );
    }
    if (String(row.publication_status) !== "published") {
      throw new ServiceFeedbackError(
        409,
        "RENEW_NOT_PUBLISHED",
        "Only currently published reviews can be renewed",
      );
    }
    const expires = new Date(now);
    expires.setMonth(expires.getMonth() + PUBLIC_DISPLAY_MONTHS);
    await db.execute(sql`
      UPDATE service_feedback_opportunities SET
        display_expires_at = ${expires},
        retention_status = 'renewed',
        last_retention_review_at = ${now},
        updated_at = ${now}
      WHERE id = ${opportunityId}
        AND publication_status = 'published'
        AND public_consent = TRUE
        AND consent_withdrawn_at IS NULL
    `);
    return { id: opportunityId, retentionStatus: "renewed", displayExpiresAt: expires.toISOString() };
  }

  if (decision === "hide") {
    await db.execute(sql`
      UPDATE service_feedback_opportunities SET
        publication_status = 'hidden',
        featured = FALSE,
        featured_at = NULL,
        display_expires_at = NULL,
        retention_status = 'hidden',
        last_retention_review_at = ${now},
        updated_at = ${now}
      WHERE id = ${opportunityId}
    `);
    return { id: opportunityId, retentionStatus: "hidden" };
  }

  // archive_anonymize: hide public fields; keep private rating history
  await db.execute(sql`
    UPDATE service_feedback_opportunities SET
      publication_status = 'archived',
      featured = FALSE,
      featured_at = NULL,
      public_display_name = NULL,
      public_excerpt = NULL,
      display_expires_at = NULL,
      retention_status = 'archived_anonymized',
      last_retention_review_at = ${now},
      updated_at = ${now}
    WHERE id = ${opportunityId}
  `);
  return { id: opportunityId, retentionStatus: "archived_anonymized" };
}

export async function listPublicModerationQueue(
  user: { id: string; role: string; permissions?: string | null },
) {
  assertStaffPerm(user, "feedback.public.moderate");
  const result = await db.execute(sql`
    SELECT o.id, o.handover_event_id AS "handoverEventId", o.public_consent AS "publicConsent",
           o.publication_status AS "publicationStatus", o.featured, o.public_display_name AS "publicDisplayName",
           o.public_excerpt AS "publicExcerpt", o.display_expires_at AS "displayExpiresAt",
           o.retention_status AS "retentionStatus",
           v.rating, v.comment, v.submitted_at AS "submittedAt"
    FROM service_feedback_opportunities o
    LEFT JOIN service_feedback_versions v ON v.id = o.current_version_id
    WHERE o.status = 'submitted'
    ORDER BY v.submitted_at DESC NULLS LAST
    LIMIT 200
  `);
  return {
    items: rowsOf(result).map((r) => ({
      id: String(r.id),
      handoverEventId: String(r.handoverEventId),
      publicConsent: Boolean(r.publicConsent),
      publicationStatus: String(r.publicationStatus),
      featured: Boolean(r.featured),
      publicDisplayName: r.publicDisplayName ?? null,
      publicExcerpt: r.publicExcerpt ?? null,
      displayExpiresAt: toIso(r.displayExpiresAt),
      retentionStatus: String(r.retentionStatus),
      rating: r.rating != null ? Number(r.rating) : null,
      comment: r.comment ?? null,
      submittedAt: toIso(r.submittedAt),
    })),
  };
}

export async function listRetentionDue(
  user: { id: string; role: string; permissions?: string | null },
) {
  assertStaffPerm(user, "feedback.retention.review");
  const result = await db.execute(sql`
    SELECT id, handover_event_id AS "handoverEventId", publication_status AS "publicationStatus",
           featured, display_expires_at AS "displayExpiresAt", retention_status AS "retentionStatus",
           public_display_name AS "publicDisplayName"
    FROM service_feedback_opportunities
    WHERE publication_status = 'published'
      AND display_expires_at IS NOT NULL
      AND display_expires_at <= (now() + interval '30 days')
    ORDER BY display_expires_at ASC
    LIMIT 200
  `);
  return {
    items: rowsOf(result).map((r) => ({
      id: String(r.id),
      handoverEventId: String(r.handoverEventId),
      publicationStatus: String(r.publicationStatus),
      featured: Boolean(r.featured),
      displayExpiresAt: toIso(r.displayExpiresAt),
      retentionStatus: String(r.retentionStatus),
      publicDisplayName: r.publicDisplayName ?? null,
    })),
  };
}

/**
 * CUSTOMER-FEEDBACK-01A-HOTFIX-2 — anonymous homepage feed.
 * Strict public DTO only; never IDs, contact, device, staff, or recovery fields.
 * Empty list when nothing eligible — no fabricated fallbacks.
 */
export type PublicFeaturedTestimonial = {
  rating: number;
  displayName: string;
  comment: string | null;
};

const PUBLIC_FEATURED_KEYS = new Set(["rating", "displayName", "comment"]);

export function isPublicFeaturedTestimonialDto(item: Record<string, unknown>): boolean {
  const keys = Object.keys(item);
  if (keys.length === 0) return false;
  return keys.every((k) => PUBLIC_FEATURED_KEYS.has(k));
}

export async function listPublicFeaturedTestimonials(): Promise<{
  items: PublicFeaturedTestimonial[];
}> {
  const result = await db.execute(sql`
    SELECT
      v.rating AS rating,
      o.public_display_name AS "displayName",
      o.public_excerpt AS comment
    FROM service_feedback_opportunities o
    INNER JOIN service_feedback_versions v ON v.id = o.current_version_id
    WHERE o.status = 'submitted'
      AND o.public_consent = TRUE
      AND o.consent_withdrawn_at IS NULL
      AND o.publication_status = 'published'
      AND o.featured = TRUE
      AND o.retention_status IS DISTINCT FROM 'archived_anonymized'
      AND o.retention_status IS DISTINCT FROM 'hidden'
      AND (o.display_expires_at IS NULL OR o.display_expires_at > now())
      AND o.public_display_name IS NOT NULL
      AND btrim(o.public_display_name) <> ''
      AND v.rating IS NOT NULL
      AND v.rating >= 1
      AND v.rating <= 5
      AND v.superseded_at IS NULL
    ORDER BY o.featured_at DESC NULLS LAST, v.submitted_at DESC NULLS LAST
    LIMIT 50
  `);

  const items: PublicFeaturedTestimonial[] = [];
  for (const r of rowsOf(result)) {
    const rating = Number(r.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) continue;
    const displayName = String(r.displayName || "").trim().slice(0, 32);
    if (!displayName) continue;
    // Reject accidental full multi-part staff dumps: display name is set by firstNameOrInitials at publish.
    const comment =
      r.comment == null || String(r.comment).trim() === ""
        ? null
        : String(r.comment).slice(0, 500);
    items.push({ rating, displayName, comment });
  }
  return { items };
}

/** Snapshot job status/payment for mutation-guard proofs */
export async function snapshotJobLifecycle(jobId: string) {
  const row = firstRow(
    await db.execute(sql`
      SELECT status, payment_status AS "paymentStatus", billing_status AS "billingStatus",
             paid_amount AS "paidAmount", completed_at AS "completedAt"
      FROM job_tickets WHERE id = ${jobId} LIMIT 1
    `),
  );
  return row || null;
}
