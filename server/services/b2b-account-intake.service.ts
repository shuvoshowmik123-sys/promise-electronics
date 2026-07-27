/**
 * B2B-ACCOUNT-BATCH-01 — staff Corporate / Corporate Ltd. single+batch intake.
 * Dedicated path: never POST /api/job-tickets, never customers/journeys/external parties/QR/challan.
 * Lane authority: corporate_clients.clientType only (corporate | limited_company).
 */
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { corporateClients, jobBatches, jobTickets } from "../../shared/schema.js";
import { allocateJobIdsInTx } from "../repositories/job.repository.js";
import { userRepo } from "../repositories/index.js";

export class B2bAccountIntakeError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "B2bAccountIntakeError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const B2B_LANE_CORPORATE = "corporate" as const;
export const B2B_LANE_LIMITED = "limited_company" as const;
export type B2bLaneType = typeof B2B_LANE_CORPORATE | typeof B2B_LANE_LIMITED;

const TICKET_TYPES = ["full_device", "panel_only", "motherboard_only", "parts_only"] as const;
type TicketType = (typeof TICKET_TYPES)[number];

const SOURCE = "b2b_account_intake";
const MAX_BATCH = 100;
const SEARCH_LIMIT = 20;

export type B2bAccountCard = {
  id: string;
  companyName: string;
  shortCode: string;
  clientType: B2bLaneType;
};

export type B2bUnitInput = {
  ticketType: unknown;
  device: unknown;
  modelNumber?: unknown;
  serialNumber?: unknown;
  issue?: unknown;
  screenSize?: unknown;
  externalRef?: unknown;
};

type NormalizedUnit = {
  ticketType: TicketType;
  device: string;
  modelNumber: string | null;
  serialNumber: string | null;
  issue: string | null;
  screenSize: string | null;
  externalRef: string | null;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function rejectForbiddenClientFields(body: Record<string, unknown>): void {
  const forbidden = [
    "customer",
    "customerPhone",
    "customerPhoneNormalized",
    "customerAddress",
    "corporateChallanId",
    "batchId",
    "externalPartyId",
    "intakePartyKind",
    "newExternalParty",
    "source",
    "clientClass",
    "id",
    "qrTracking",
  ];
  for (const key of forbidden) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") {
      throw new B2bAccountIntakeError(
        400,
        "FORBIDDEN_FIELD",
        `Field "${key}" is not allowed on B2B account intake.`,
      );
    }
  }
}

function parseLane(raw: unknown): B2bLaneType {
  if (raw === B2B_LANE_CORPORATE || raw === B2B_LANE_LIMITED) return raw;
  throw new B2bAccountIntakeError(
    400,
    "INVALID_LANE",
    "lane must be corporate or limited_company.",
  );
}

function normalizeUnit(raw: B2bUnitInput, index: number): NormalizedUnit {
  const prefix = `units[${index}]`;
  const ticketType = typeof raw?.ticketType === "string" ? raw.ticketType.trim() : "";
  if (!(TICKET_TYPES as readonly string[]).includes(ticketType)) {
    throw new B2bAccountIntakeError(
      400,
      "INVALID_TICKET_TYPE",
      `${prefix}: ticketType must be full_device, panel_only, motherboard_only, or parts_only.`,
    );
  }
  const device = typeof raw?.device === "string" ? raw.device.trim() : "";
  if (!device) {
    throw new B2bAccountIntakeError(400, "DEVICE_REQUIRED", `${prefix}: device is required.`);
  }
  const externalRef =
    typeof raw?.externalRef === "string" && raw.externalRef.trim()
      ? raw.externalRef.trim()
      : null;
  return {
    ticketType: ticketType as TicketType,
    device,
    modelNumber:
      typeof raw?.modelNumber === "string" && raw.modelNumber.trim()
        ? raw.modelNumber.trim()
        : null,
    serialNumber:
      typeof raw?.serialNumber === "string" && raw.serialNumber.trim()
        ? raw.serialNumber.trim()
        : null,
    issue: typeof raw?.issue === "string" && raw.issue.trim() ? raw.issue.trim() : null,
    screenSize:
      typeof raw?.screenSize === "string" && raw.screenSize.trim()
        ? raw.screenSize.trim()
        : null,
    externalRef,
  };
}

function assertUniqueRefsInBatch(units: NormalizedUnit[]): void {
  const seen = new Map<string, number>();
  for (let i = 0; i < units.length; i++) {
    const ref = units[i].externalRef;
    if (!ref) continue;
    const key = normalizeExternalRefKey(ref);
    if (seen.has(key)) {
      throw new B2bAccountIntakeError(
        409,
        "DUPLICATE_EXTERNAL_REF_IN_BATCH",
        `External reference "${ref}" is duplicated in this batch.`,
        { externalRef: ref, indexes: [seen.get(key), i] },
      );
    }
    seen.set(key, i);
  }
}

/** Case-folded ref used for lock keys, in-batch uniqueness, and DB collision lookups. Stored value remains original trim. */
export function normalizeExternalRefKey(ref: string): string {
  return ref.trim().toLowerCase();
}

/**
 * Pure mixed-case collision semantics (mirrors SQL lower(column) = normalized key).
 * Empty stored refs never collide.
 */
export function corporateJobNumberCollidesWithExternalRef(
  storedCorporateJobNumber: string | null | undefined,
  candidateExternalRef: string,
): boolean {
  if (typeof storedCorporateJobNumber !== "string" || !storedCorporateJobNumber.trim()) {
    return false;
  }
  if (typeof candidateExternalRef !== "string" || !candidateExternalRef.trim()) {
    return false;
  }
  return (
    normalizeExternalRefKey(storedCorporateJobNumber) ===
    normalizeExternalRefKey(candidateExternalRef)
  );
}

/**
 * Deterministic advisory lock keys for (account, externalRef) pairs.
 * Sorted unique keys so concurrent multi-ref batches acquire locks in the same order (no cross-batch deadlocks).
 */
export function buildB2bExternalRefLockKeys(
  corporateClientId: string,
  externalRefs: Array<string | null | undefined>,
): string[] {
  const keys = new Set<string>();
  for (const raw of externalRefs) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    keys.add(`b2b_ext_ref:${corporateClientId}:${normalizeExternalRefKey(raw)}`);
  }
  return Array.from(keys).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

async function acquireExternalRefLocks(
  tx: Tx,
  lockKeys: string[],
): Promise<void> {
  for (const key of lockKeys) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
  }
}

/** Account-scoped case-folded lookup; same folding as normalizeExternalRefKey / lock keys. */
async function findJobByExternalRefOnAccount(
  executor: Tx | typeof db,
  corporateClientId: string,
  externalRef: string,
): Promise<{ id: string } | null> {
  const key = normalizeExternalRefKey(externalRef);
  const [hit] = await executor
    .select({ id: jobTickets.id })
    .from(jobTickets)
    .where(
      and(
        eq(jobTickets.corporateClientId, corporateClientId),
        sql`lower(${jobTickets.corporateJobNumber}) = ${key}`,
      ),
    )
    .limit(1);
  return hit ?? null;
}

async function assertNoExistingAccountRefs(
  corporateClientId: string,
  units: NormalizedUnit[],
): Promise<void> {
  const refs = units.map((u) => u.externalRef).filter((r): r is string => !!r);
  if (refs.length === 0) return;
  for (const ref of refs) {
    const hit = await findJobByExternalRefOnAccount(db, corporateClientId, ref);
    if (hit) {
      throw new B2bAccountIntakeError(
        409,
        "EXTERNAL_REF_COLLISION",
        `External reference "${ref}" already exists on this account.`,
        { externalRef: ref, existingJobId: hit.id },
      );
    }
  }
}

async function loadAccountForLane(
  corporateClientId: string,
  lane: B2bLaneType,
): Promise<{
  id: string;
  companyName: string;
  shortCode: string;
  clientType: string;
  clientClass: string | null;
  defaultBatchClearanceDays: number | null;
  defaultSlaHours: number | null;
}> {
  const [row] = await db
    .select({
      id: corporateClients.id,
      companyName: corporateClients.companyName,
      shortCode: corporateClients.shortCode,
      clientType: corporateClients.clientType,
      clientClass: corporateClients.clientClass,
      defaultBatchClearanceDays: corporateClients.defaultBatchClearanceDays,
      defaultSlaHours: corporateClients.defaultSlaHours,
    })
    .from(corporateClients)
    .where(eq(corporateClients.id, corporateClientId))
    .limit(1);
  if (!row) {
    throw new B2bAccountIntakeError(404, "ACCOUNT_NOT_FOUND", "Corporate account not found.");
  }
  if (row.clientType !== lane) {
    throw new B2bAccountIntakeError(
      400,
      "LANE_TYPE_MISMATCH",
      `Account type is ${row.clientType}; this lane requires ${lane}.`,
    );
  }
  return row;
}

export async function searchB2bAccountsForLane(
  lane: B2bLaneType,
  q: string,
): Promise<B2bAccountCard[]> {
  const query = q.trim();
  if (query.length < 1) return [];
  const pattern = `%${query.replace(/[%_]/g, "")}%`;
  const rows = await db
    .select({
      id: corporateClients.id,
      companyName: corporateClients.companyName,
      shortCode: corporateClients.shortCode,
      clientType: corporateClients.clientType,
    })
    .from(corporateClients)
    .where(
      and(
        eq(corporateClients.clientType, lane),
        or(
          ilike(corporateClients.companyName, pattern),
          ilike(corporateClients.shortCode, pattern),
        ),
      ),
    )
    .limit(SEARCH_LIMIT);

  return rows
    .filter((r) => r.clientType === lane)
    .map((r) => ({
      id: r.id,
      companyName: r.companyName,
      shortCode: r.shortCode,
      clientType: r.clientType as B2bLaneType,
    }));
}

async function resolveAssignee(
  canAssign: boolean,
  requestedId: unknown,
): Promise<{ assignedTechnicianId: string | null; technician: string }> {
  if (!canAssign) {
    return { assignedTechnicianId: null, technician: "Unassigned" };
  }
  if (typeof requestedId !== "string" || !requestedId.trim()) {
    return { assignedTechnicianId: null, technician: "Unassigned" };
  }
  const assignee = await userRepo.getUser(requestedId.trim());
  if (!assignee) {
    throw new B2bAccountIntakeError(400, "ASSIGNEE_NOT_FOUND", "Assigned technician not found.");
  }
  if (assignee.status && assignee.status !== "Active") {
    throw new B2bAccountIntakeError(400, "ASSIGNEE_INACTIVE", "Assigned technician is not active.");
  }
  if (assignee.role !== "Technician") {
    throw new B2bAccountIntakeError(400, "ASSIGNEE_ROLE", "Assignee must have the Technician role.");
  }
  return { assignedTechnicianId: assignee.id, technician: assignee.name };
}

function clearanceDates(days: number | null | undefined): {
  batchTargetClearDate: Date | null;
  targetClearDate: Date | null;
  slaDeadline: Date | null;
  deadline: Date | null;
} {
  const n = typeof days === "number" && days > 0 ? days : 7;
  const d = new Date();
  d.setDate(d.getDate() + n);
  return {
    batchTargetClearDate: d,
    targetClearDate: d,
    slaDeadline: d,
    deadline: d,
  };
}

function buildJobRow(args: {
  id: string;
  account: {
    id: string;
    clientClass: string | null;
  };
  batchId: string | null;
  unit: NormalizedUnit;
  creator: { id: string; name: string };
  assignment: { assignedTechnicianId: string | null; technician: string };
  dates: ReturnType<typeof clearanceDates>;
}) {
  return {
    id: args.id,
    status: "Pending",
    technician: args.assignment.technician,
    assignedTechnicianId: args.assignment.assignedTechnicianId,
    clientClass: args.account.clientClass || "b2b_normal",
    source: SOURCE,
    corporateClientId: args.account.id,
    corporateChallanId: null,
    corporateJobNumber: args.unit.externalRef,
    batchId: args.batchId,
    batchTargetClearDate: args.dates.batchTargetClearDate,
    slaDeadline: args.dates.slaDeadline,
    deadline: args.dates.deadline,
    ticketType: args.unit.ticketType,
    device: args.unit.device,
    modelNumber: args.unit.modelNumber,
    serialNumber: args.unit.serialNumber,
    issue: args.unit.issue,
    screenSize: args.unit.screenSize,
    quantity: 1,
    panelItems: [],
    customer: null,
    customerPhone: null,
    customerPhoneNormalized: null,
    customerAddress: null,
    intakePartyKind: null,
    externalPartyId: null,
    createdByUserId: args.creator.id,
    createdByName: args.creator.name,
    paymentStatus: "unpaid",
    billingStatus: "pending",
    activeWorkStartedAt: new Date(),
  };
}

export async function createB2bAccountIntake(args: {
  body: Record<string, unknown>;
  mode: "single" | "batch";
  creator: { id: string; name: string };
  canAssignTechnician: boolean;
}): Promise<
  | {
      mode: "single";
      lane: B2bLaneType;
      job: {
        id: string;
        status: string;
        corporateClientId: string;
        batchId: string | null;
        corporateJobNumber: string | null;
      };
      account: B2bAccountCard;
    }
  | {
      mode: "batch";
      lane: B2bLaneType;
      batch: {
        id: string;
        batchNumber: string | null;
        totalItems: number;
        corporateClientId: string;
      };
      jobs: { id: string; status: string; corporateJobNumber: string | null }[];
      account: B2bAccountCard;
    }
> {
  rejectForbiddenClientFields(args.body);
  const lane = parseLane(args.body.lane);
  const corporateClientId =
    typeof args.body.corporateClientId === "string" ? args.body.corporateClientId.trim() : "";
  if (!corporateClientId) {
    throw new B2bAccountIntakeError(400, "ACCOUNT_REQUIRED", "corporateClientId is required.");
  }

  let units: NormalizedUnit[];
  if (args.mode === "single") {
    if (!args.body.unit || typeof args.body.unit !== "object") {
      throw new B2bAccountIntakeError(400, "UNIT_REQUIRED", "unit is required for single intake.");
    }
    if (args.body.units !== undefined) {
      throw new B2bAccountIntakeError(400, "INVALID_BODY", "units is not allowed on single intake.");
    }
    units = [normalizeUnit(args.body.unit as B2bUnitInput, 0)];
  } else {
    if (!Array.isArray(args.body.units) || args.body.units.length === 0) {
      throw new B2bAccountIntakeError(400, "UNITS_REQUIRED", "units array is required for batch intake.");
    }
    if (args.body.units.length > MAX_BATCH) {
      throw new B2bAccountIntakeError(400, "BATCH_TOO_LARGE", `Batch max is ${MAX_BATCH} units.`);
    }
    if (args.body.unit !== undefined) {
      throw new B2bAccountIntakeError(400, "INVALID_BODY", "unit is not allowed on batch intake.");
    }
    units = (args.body.units as B2bUnitInput[]).map((u, i) => normalizeUnit(u, i));
  }

  assertUniqueRefsInBatch(units);

  const account = await loadAccountForLane(corporateClientId, lane);
  await assertNoExistingAccountRefs(account.id, units);

  const assignment = await resolveAssignee(args.canAssignTechnician, args.body.assignedTechnicianId);
  const dates = clearanceDates(account.defaultBatchClearanceDays);

  return await db.transaction(async (tx) => {
    // Serialize concurrent inserts for the same account+externalRef pairs.
    // Locks are sorted deterministically; recheck after acquire for atomic 409.
    const lockKeys = buildB2bExternalRefLockKeys(
      account.id,
      units.map((u) => u.externalRef),
    );
    await acquireExternalRefLocks(tx, lockKeys);

    for (const unit of units) {
      if (!unit.externalRef) continue;
      const hit = await findJobByExternalRefOnAccount(tx, account.id, unit.externalRef);
      if (hit) {
        throw new B2bAccountIntakeError(
          409,
          "EXTERNAL_REF_COLLISION",
          `External reference "${unit.externalRef}" already exists on this account.`,
          { externalRef: unit.externalRef, existingJobId: hit.id },
        );
      }
    }

    const year = new Date().getFullYear();
    const jobIds = await allocateJobIdsInTx(tx, units.length, year);

    let batchId: string | null = null;
    let batchNumber: string | null = null;
    if (args.mode === "batch") {
      batchId = nanoid();
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      batchNumber = `BATCH-B2B-${account.shortCode}-${dateStr}-${jobIds[0].slice(-4)}`;
      await tx.insert(jobBatches).values({
        id: batchId,
        batchNumber,
        clientClass: account.clientClass || "b2b_normal",
        corporateClientId: account.id,
        customerId: null,
        intakePartyKind: null,
        externalPartyId: null,
        totalItems: units.length,
        batchStatus: "open",
        targetClearDate: dates.targetClearDate,
        createdBy: args.creator.id,
        receiver: args.creator.name,
      });
    }

    const jobRows = units.map((unit, i) =>
      buildJobRow({
        id: jobIds[i],
        account: { id: account.id, clientClass: account.clientClass },
        batchId,
        unit,
        creator: args.creator,
        assignment,
        dates,
      }),
    );

    await tx.insert(jobTickets).values(jobRows as any);

    const card: B2bAccountCard = {
      id: account.id,
      companyName: account.companyName,
      shortCode: account.shortCode,
      clientType: lane,
    };

    if (args.mode === "single") {
      return {
        mode: "single" as const,
        lane,
        job: {
          id: jobIds[0],
          status: "Pending",
          corporateClientId: account.id,
          batchId: null,
          corporateJobNumber: units[0].externalRef,
        },
        account: card,
      };
    }

    return {
      mode: "batch" as const,
      lane,
      batch: {
        id: batchId!,
        batchNumber,
        totalItems: units.length,
        corporateClientId: account.id,
      },
      jobs: jobIds.map((id, i) => ({
        id,
        status: "Pending",
        corporateJobNumber: units[i].externalRef,
      })),
      account: card,
    };
  });
}
