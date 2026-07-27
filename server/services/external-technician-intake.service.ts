/**
 * JOB-INTAKE-UNIFICATION-01A-B — external Technician single/batch intake.
 * Dedicated path: never POST /api/job-tickets, never bindCustomerToJob, never journeys/SR.
 */
import { and, eq, not, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import {
  EXTERNAL_INTAKE_PARTY_KIND,
  externalIntakeParties,
  jobBatches,
  jobTickets,
} from "../../shared/schema.js";
import { allocateJobIdsInTx } from "../repositories/job.repository.js";
import { userRepo } from "../repositories/index.js";
import { normalizePhone } from "../utils/phone.js";
import {
  EXTERNAL_PARTY_KIND,
  ExternalIntakePartyError,
} from "./external-intake-party.service.js";

export class ExternalTechnicianIntakeError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ExternalTechnicianIntakeError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const TICKET_TYPES = ["full_device", "panel_only", "motherboard_only", "parts_only"] as const;
type TicketType = (typeof TICKET_TYPES)[number];

const ACTIVE_EXCLUDED = [
  "Completed",
  "Cancelled",
  "Delivered",
  "Abandoned",
  "Forfeited",
  "Closed",
] as const;

const SOURCE = "external_technician_intake";
const CLIENT_CLASS = "technician";
const BD_MOBILE_RE = /^1\d{9}$/;
const MAX_BATCH = 100;

export type IntakeUnitInput = {
  ticketType: unknown;
  device: unknown;
  modelNumber?: unknown;
  serialNumber?: unknown;
  issue?: unknown;
  screenSize?: unknown;
};

export type ExternalIntakeRequest = {
  externalPartyId?: unknown;
  newExternalParty?: {
    name?: unknown;
    phone?: unknown;
    shortAddress?: unknown;
  };
  confirmDuplicates?: unknown;
  assignedTechnicianId?: unknown;
  unit?: IntakeUnitInput;
  units?: IntakeUnitInput[];
};

type NormalizedUnit = {
  ticketType: TicketType;
  device: string;
  modelNumber: string | null;
  serialNumber: string | null;
  issue: string | null;
  screenSize: string | null;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function rejectForbiddenClientFields(body: Record<string, unknown>): void {
  const forbidden = [
    "customer",
    "customerPhone",
    "customerPhoneNormalized",
    "customerAddress",
    "corporateClientId",
    "corporateChallanId",
    "corporateJobNumber",
    "batchId",
    "tvSerialNumber",
    "panelItems",
    "source",
    "clientClass",
    "intakePartyKind",
    "id",
  ];
  for (const key of forbidden) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") {
      throw new ExternalTechnicianIntakeError(
        400,
        "FORBIDDEN_FIELD",
        `Field "${key}" is not allowed on external technician intake.`,
      );
    }
  }
}

function normalizeUnit(raw: IntakeUnitInput, index: number): NormalizedUnit {
  const prefix = `units[${index}]`;
  const ticketType = typeof raw?.ticketType === "string" ? raw.ticketType.trim() : "";
  if (!(TICKET_TYPES as readonly string[]).includes(ticketType)) {
    throw new ExternalTechnicianIntakeError(
      400,
      "INVALID_TICKET_TYPE",
      `${prefix}: ticketType must be full_device, panel_only, motherboard_only, or parts_only.`,
    );
  }
  if (typeof raw?.device !== "string" || !raw.device.trim()) {
    throw new ExternalTechnicianIntakeError(400, "INVALID_DEVICE", `${prefix}: device is required.`);
  }
  const device = raw.device.trim().slice(0, 200);
  const modelNumber =
    typeof raw.modelNumber === "string" && raw.modelNumber.trim()
      ? raw.modelNumber.trim().slice(0, 120)
      : null;
  const serialNumber =
    typeof raw.serialNumber === "string" && raw.serialNumber.trim()
      ? raw.serialNumber.trim().slice(0, 120)
      : null;
  const issue =
    typeof raw.issue === "string" && raw.issue.trim() ? raw.issue.trim().slice(0, 500) : null;
  const screenSize =
    typeof raw.screenSize === "string" && raw.screenSize.trim()
      ? raw.screenSize.trim().slice(0, 40)
      : null;
  return {
    ticketType: ticketType as TicketType,
    device,
    modelNumber,
    serialNumber,
    issue,
    screenSize,
  };
}

function sanitizeNewParty(input: NonNullable<ExternalIntakeRequest["newExternalParty"]>) {
  if (typeof input.name !== "string" || input.name.trim().length < 2) {
    throw new ExternalTechnicianIntakeError(400, "INVALID_NAME", "Party name is required.");
  }
  if (typeof input.phone !== "string" || !input.phone.trim()) {
    throw new ExternalTechnicianIntakeError(400, "INVALID_PHONE", "Party phone is required.");
  }
  const phoneNormalized = normalizePhone(input.phone);
  if (!phoneNormalized || !BD_MOBILE_RE.test(phoneNormalized)) {
    throw new ExternalTechnicianIntakeError(400, "INVALID_PHONE", "Party phone is invalid.");
  }
  const shortAddress =
    typeof input.shortAddress === "string" && input.shortAddress.trim()
      ? input.shortAddress.trim().slice(0, 200)
      : null;
  return {
    name: input.name.trim().replace(/\s+/g, " ").slice(0, 120),
    phone: input.phone.trim(),
    phoneNormalized,
    shortAddress,
  };
}

async function createPartyInTx(
  tx: Tx,
  party: ReturnType<typeof sanitizeNewParty>,
): Promise<string> {
  const id = `ext_${nanoid(12)}`;
  try {
    await tx.insert(externalIntakeParties).values({
      id,
      kind: EXTERNAL_PARTY_KIND,
      name: party.name,
      phone: party.phone,
      phoneNormalized: party.phoneNormalized,
      shortAddress: party.shortAddress,
      isActive: true,
    });
  } catch (err: any) {
    if (err?.code === "23505") {
      throw new ExternalTechnicianIntakeError(
        409,
        "PARTY_PHONE_EXISTS",
        "An external technician party with this phone already exists.",
      );
    }
    throw err;
  }
  return id;
}

async function lockAndLoadParty(tx: Tx, partyId: string) {
  const res = await tx.execute(sql`
    SELECT id, kind, is_active AS "isActive"
    FROM external_intake_parties
    WHERE id = ${partyId}
    FOR UPDATE
  `);
  const rows = (res as any).rows ?? res;
  const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
  if (!row) {
    throw new ExternalTechnicianIntakeError(404, "PARTY_NOT_FOUND", "External party not found.");
  }
  if (row.kind !== EXTERNAL_INTAKE_PARTY_KIND) {
    throw new ExternalTechnicianIntakeError(400, "INVALID_PARTY_KIND", "Party kind is invalid.");
  }
  if (row.isActive === false || row.isActive === "f" || row.isActive === 0) {
    throw new ExternalTechnicianIntakeError(400, "PARTY_INACTIVE", "External party is inactive.");
  }
  return String(row.id);
}

async function resolvePartyId(
  tx: Tx,
  externalPartyId: unknown,
  newExternalParty: ExternalIntakeRequest["newExternalParty"],
): Promise<string> {
  const hasId = typeof externalPartyId === "string" && externalPartyId.trim() !== "";
  const hasNew = newExternalParty != null && typeof newExternalParty === "object";
  if (hasId && hasNew) {
    throw new ExternalTechnicianIntakeError(
      400,
      "PARTY_XOR",
      "Provide either externalPartyId or newExternalParty, not both.",
    );
  }
  if (!hasId && !hasNew) {
    throw new ExternalTechnicianIntakeError(
      400,
      "PARTY_REQUIRED",
      "externalPartyId or newExternalParty is required.",
    );
  }
  if (hasId) {
    return lockAndLoadParty(tx, String(externalPartyId).trim());
  }
  const sanitized = sanitizeNewParty(newExternalParty!);
  return createPartyInTx(tx, sanitized);
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
    throw new ExternalTechnicianIntakeError(400, "ASSIGNEE_NOT_FOUND", "Assigned technician not found.");
  }
  if (assignee.status && assignee.status !== "Active") {
    throw new ExternalTechnicianIntakeError(400, "ASSIGNEE_INACTIVE", "Assigned technician is not active.");
  }
  if (assignee.role !== "Technician") {
    throw new ExternalTechnicianIntakeError(400, "ASSIGNEE_ROLE", "Assignee must have the Technician role.");
  }
  return { assignedTechnicianId: assignee.id, technician: assignee.name };
}

type DupSignal = { type: "UNIT_SERIAL_ACTIVE" | "PARTY_ACTIVE_WORK"; jobId?: string; activeJobCount?: number };

async function findDuplicateSignals(partyId: string, units: NormalizedUnit[]): Promise<DupSignal[]> {
  const signals: DupSignal[] = [];
  const serials = Array.from(
    new Set(
      units
        .map((u) => u.serialNumber)
        .filter((s): s is string => !!s)
        .map((s) => s.toLowerCase()),
    ),
  );

  const active = await db
    .select({
      id: jobTickets.id,
      serialNumber: jobTickets.serialNumber,
      status: jobTickets.status,
    })
    .from(jobTickets)
    .where(
      and(
        eq(jobTickets.externalPartyId, partyId),
        eq(jobTickets.intakePartyKind, EXTERNAL_INTAKE_PARTY_KIND),
        not(inArray(jobTickets.status, [...ACTIVE_EXCLUDED])),
      ),
    );

  if (active.length > 0) {
    signals.push({ type: "PARTY_ACTIVE_WORK", activeJobCount: active.length });
  }

  if (serials.length > 0) {
    for (const job of active) {
      const sn = (job.serialNumber || "").trim().toLowerCase();
      if (sn && serials.includes(sn)) {
        signals.push({ type: "UNIT_SERIAL_ACTIVE", jobId: job.id });
      }
    }
  }

  // Dedupe UNIT_SERIAL_ACTIVE by jobId
  const seen = new Set<string>();
  return signals.filter((s) => {
    if (s.type === "UNIT_SERIAL_ACTIVE" && s.jobId) {
      if (seen.has(s.jobId)) return false;
      seen.add(s.jobId);
    }
    if (s.type === "PARTY_ACTIVE_WORK") {
      if (seen.has("PARTY_ACTIVE_WORK")) return false;
      seen.add("PARTY_ACTIVE_WORK");
    }
    return true;
  });
}

function buildJobRow(args: {
  id: string;
  partyId: string;
  batchId: string | null;
  unit: NormalizedUnit;
  creator: { id: string; name: string };
  assignment: { assignedTechnicianId: string | null; technician: string };
}) {
  return {
    id: args.id,
    status: "Pending",
    technician: args.assignment.technician,
    assignedTechnicianId: args.assignment.assignedTechnicianId,
    clientClass: CLIENT_CLASS,
    source: SOURCE,
    intakePartyKind: EXTERNAL_INTAKE_PARTY_KIND,
    externalPartyId: args.partyId,
    batchId: args.batchId,
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
    createdByUserId: args.creator.id,
    createdByName: args.creator.name,
    paymentStatus: "unpaid",
    billingStatus: "pending",
    activeWorkStartedAt: new Date(),
  };
}

export async function createExternalTechnicianIntake(args: {
  body: Record<string, unknown>;
  mode: "single" | "batch";
  creator: { id: string; name: string };
  canAssignTechnician: boolean;
}): Promise<
  | {
      mode: "single";
      job: { id: string; status: string; externalPartyId: string; batchId: string | null };
      externalPartyId: string;
      qrTracking: { path: string; token: string };
    }
  | {
      mode: "batch";
      batch: { id: string; batchNumber: string | null; totalItems: number; externalPartyId: string };
      jobs: { id: string; status: string }[];
      externalPartyId: string;
      qrTracking: { path: string; token: string };
    }
  | {
      requiresConfirmation: true;
      code: "DUPLICATE_CONFIRMATION_REQUIRED";
      signals: DupSignal[];
    }
> {
  rejectForbiddenClientFields(args.body);
  const req = args.body as ExternalIntakeRequest;

  let units: NormalizedUnit[];
  if (args.mode === "single") {
    if (!req.unit || typeof req.unit !== "object") {
      throw new ExternalTechnicianIntakeError(400, "UNIT_REQUIRED", "unit is required for single intake.");
    }
    if (req.units !== undefined) {
      throw new ExternalTechnicianIntakeError(400, "INVALID_BODY", "units is not allowed on single intake.");
    }
    units = [normalizeUnit(req.unit, 0)];
  } else {
    if (!Array.isArray(req.units) || req.units.length === 0) {
      throw new ExternalTechnicianIntakeError(400, "UNITS_REQUIRED", "units array is required for batch intake.");
    }
    if (req.units.length > MAX_BATCH) {
      throw new ExternalTechnicianIntakeError(400, "BATCH_TOO_LARGE", `Batch max is ${MAX_BATCH} units.`);
    }
    if (req.unit !== undefined) {
      throw new ExternalTechnicianIntakeError(400, "INVALID_BODY", "unit is not allowed on batch intake.");
    }
    units = req.units.map((u, i) => normalizeUnit(u, i));
  }

  const confirm =
    req.confirmDuplicates === true ||
    req.confirmDuplicates === "true" ||
    req.confirmDuplicates === 1;

  const assignment = await resolveAssignee(args.canAssignTechnician, req.assignedTechnicianId);

  // Resolve party id for duplicate scan when existing id provided (no write yet).
  // New party has no prior jobs → no serial/party-active signals until after create.
  let previewPartyId: string | null = null;
  if (typeof req.externalPartyId === "string" && req.externalPartyId.trim()) {
    const [row] = await db
      .select({
        id: externalIntakeParties.id,
        kind: externalIntakeParties.kind,
        isActive: externalIntakeParties.isActive,
      })
      .from(externalIntakeParties)
      .where(eq(externalIntakeParties.id, req.externalPartyId.trim()))
      .limit(1);
    if (!row) {
      throw new ExternalTechnicianIntakeError(404, "PARTY_NOT_FOUND", "External party not found.");
    }
    if (row.kind !== EXTERNAL_INTAKE_PARTY_KIND) {
      throw new ExternalTechnicianIntakeError(400, "INVALID_PARTY_KIND", "Party kind is invalid.");
    }
    if (!row.isActive) {
      throw new ExternalTechnicianIntakeError(400, "PARTY_INACTIVE", "External party is inactive.");
    }
    previewPartyId = row.id;
  }

  if (previewPartyId && !confirm) {
    const signals = await findDuplicateSignals(previewPartyId, units);
    if (signals.length > 0) {
      return {
        requiresConfirmation: true,
        code: "DUPLICATE_CONFIRMATION_REQUIRED",
        signals,
      };
    }
  }

  return await db.transaction(async (tx) => {
    const partyId = await resolvePartyId(tx, req.externalPartyId, req.newExternalParty);

    // Duplicates already gated outside tx for existing parties when !confirm.

    const year = new Date().getFullYear();
    const jobIds = await allocateJobIdsInTx(tx, units.length, year);

    let batchId: string | null = null;
    let batchNumber: string | null = null;
    if (args.mode === "batch") {
      batchId = nanoid();
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      batchNumber = `BATCH-EXT-${dateStr}-${jobIds[0].slice(-4)}`;
      await tx.insert(jobBatches).values({
        id: batchId,
        batchNumber,
        clientClass: CLIENT_CLASS,
        intakePartyKind: EXTERNAL_INTAKE_PARTY_KIND,
        externalPartyId: partyId,
        customerId: null,
        totalItems: units.length,
        batchStatus: "open",
        createdBy: args.creator.id,
        receiver: args.creator.name,
      });
    }

    const jobRows = units.map((unit, i) =>
      buildJobRow({
        id: jobIds[i],
        partyId,
        batchId,
        unit,
        creator: args.creator,
        assignment,
      }),
    );

    await tx.insert(jobTickets).values(jobRows as any);

    const { issueExternalQrCredential } = await import("./external-qr-tracking.service.js");
    const { EXTERNAL_QR_ENTITY_BATCH, EXTERNAL_QR_ENTITY_JOB } = await import(
      "../../shared/schema.js"
    );

    if (args.mode === "single") {
      const qr = await issueExternalQrCredential(EXTERNAL_QR_ENTITY_JOB, jobIds[0], tx);
      return {
        mode: "single" as const,
        job: {
          id: jobIds[0],
          status: "Pending",
          externalPartyId: partyId,
          batchId: null,
        },
        externalPartyId: partyId,
        qrTracking: { path: qr.path, token: qr.token },
      };
    }

    const qr = await issueExternalQrCredential(EXTERNAL_QR_ENTITY_BATCH, batchId!, tx);
    return {
      mode: "batch" as const,
      batch: {
        id: batchId!,
        batchNumber,
        totalItems: units.length,
        externalPartyId: partyId,
      },
      jobs: jobIds.map((id) => ({ id, status: "Pending" })),
      externalPartyId: partyId,
      qrTracking: { path: qr.path, token: qr.token },
    };
  });
}

/** Public/generic track must not disclose external technician jobs. */
export function isExternalTechnicianJob(job: {
  source?: string | null;
  intakePartyKind?: string | null;
  externalPartyId?: string | null;
}): boolean {
  if (job.externalPartyId) return true;
  if (job.intakePartyKind === EXTERNAL_INTAKE_PARTY_KIND) return true;
  if (job.source === SOURCE) return true;
  return false;
}
