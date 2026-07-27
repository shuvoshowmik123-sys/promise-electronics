import { db } from "../db.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import * as schema from "../../shared/schema.js";
import type { Dispute, DisputeNote, InsertDispute, InsertDisputeNote } from "../../shared/schema.js";

// ── Lifecycle rules (server-enforced) ──────────────────────────────────────
const VALID_TRANSITIONS: Record<string, string[]> = {
  open: ["under_review", "closed"],
  under_review: ["resolved", "closed", "open"],
  resolved: [],   // terminal
  closed: [],     // terminal
};

// ── Errors ─────────────────────────────────────────────────────────────────
export class DisputeError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "DisputeError";
  }
}

// ── Repository ─────────────────────────────────────────────────────────────

export const disputesRepo = {
  // ── Read ───────────────────────────────────────────────────────────────

  async getDispute(id: string): Promise<Dispute | undefined> {
    const rows = await db.select().from(schema.disputes).where(eq(schema.disputes.id, id)).limit(1);
    return rows[0];
  },

  async listDisputes(opts: {
    status?: string;
    disputeType?: string;
    phone?: string;
    targetTable?: "pos" | "refund" | "warranty";
    page?: number;
    limit?: number;
  } = {}): Promise<{ items: Dispute[]; total: number }> {
    const { status, disputeType, phone, targetTable, page = 1, limit = 20 } = opts;
    const conditions: any[] = [];
    if (status) conditions.push(eq(schema.disputes.status, status));
    if (disputeType) conditions.push(eq(schema.disputes.disputeType, disputeType));
    if (phone) conditions.push(eq(schema.disputes.customerPhone, phone));
    if (targetTable === "pos") conditions.push(sql`${schema.disputes.posTransactionId} IS NOT NULL`);
    if (targetTable === "refund") conditions.push(sql`${schema.disputes.refundId} IS NOT NULL`);
    if (targetTable === "warranty") conditions.push(sql`${schema.disputes.warrantyClaimId} IS NOT NULL`);

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (page - 1) * limit;

    const [items, countResult] = await Promise.all([
      db.select().from(schema.disputes).where(where).orderBy(desc(schema.disputes.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(schema.disputes).where(where),
    ]);

    return { items, total: countResult[0]?.count ?? 0 };
  },

  // ── Notes (append-only) ───────────────────────────────────────────────

  async getDisputeNotes(disputeId: string): Promise<DisputeNote[]> {
    return db.select().from(schema.disputeNotes)
      .where(eq(schema.disputeNotes.disputeId, disputeId))
      .orderBy(schema.disputeNotes.createdAt);
  },

  async addNote(note: InsertDisputeNote): Promise<DisputeNote> {
    const id = randomUUID();
    const rows = await db.insert(schema.disputeNotes).values({ ...note, id }).returning();
    return rows[0];
  },

  // ── Create (transactional: dispute + creation note) ─────────────────────

  async createDispute(
    data: Omit<InsertDispute, "openedBy" | "openedByName" | "openedByRole">,
    actor: { id: string; name: string; role: string },
  ): Promise<Dispute> {
    const id = randomUUID();
    const noteId = randomUUID();

    const result = await db.transaction(async (tx) => {
      const [dispute] = await tx.insert(schema.disputes).values({
        ...data,
        id,
        openedBy: actor.id,
        openedByName: actor.name,
        openedByRole: actor.role,
      }).returning();

      const [note] = await tx.insert(schema.disputeNotes).values({
        id: noteId,
        disputeId: id,
        noteType: "note",
        content: `Dispute opened: ${data.description}`,
        authorId: actor.id,
        authorName: actor.name,
        authorRole: actor.role,
      }).returning();

      return { dispute, note };
    });

    return result.dispute;
  },

  // ── Status transition (transactional: update + status event note) ──────

  async transitionStatus(
    disputeId: string,
    newStatus: string,
    actor: { id: string; name: string; role: string },
    resolutionNotes?: string,
  ): Promise<Dispute> {
    const noteId = randomUUID();

    const result = await db.transaction(async (tx) => {
      // Lock the row inside the transaction to prevent concurrent transitions
      const { rows } = await tx.execute<schema.Dispute>(
        sql`SELECT * FROM ${schema.disputes} WHERE ${schema.disputes.id} = ${disputeId} FOR UPDATE`
      );
      const dispute = rows[0];
      if (!dispute) throw new DisputeError(404, "DISPUTE_NOT_FOUND", "Dispute not found");

      const allowed = VALID_TRANSITIONS[dispute.status] ?? [];
      if (!allowed.includes(newStatus)) {
        throw new DisputeError(
          409,
          "INVALID_TRANSITION",
          `Cannot transition from "${dispute.status}" to "${newStatus}". Allowed: ${allowed.join(", ") || "none (terminal)"}`,
        );
      }

      const update: Record<string, any> = {
        status: newStatus,
        updatedAt: new Date(),
      };

      if (newStatus === "resolved") {
        update.resolvedBy = actor.id;
        update.resolvedByName = actor.name;
        update.resolvedByRole = actor.role;
        update.resolvedAt = new Date();
        if (resolutionNotes) update.resolutionNotes = resolutionNotes;
      }

      const [updated] = await tx.update(schema.disputes)
        .set(update)
        .where(eq(schema.disputes.id, disputeId))
        .returning();

      const [note] = await tx.insert(schema.disputeNotes).values({
        id: noteId,
        disputeId,
        noteType: "status_change",
        content: `Status changed from "${dispute.status}" to "${newStatus}"${resolutionNotes ? `: ${resolutionNotes}` : ""}`,
        authorId: actor.id,
        authorName: actor.name,
        authorRole: actor.role,
        previousStatus: dispute.status,
        newStatus,
      }).returning();

      return { dispute: updated, note };
    });

    return result.dispute;
  },

  // ── Target validation ─────────────────────────────────────────────────

  async validateTargetExists(
    targetType: "pos" | "refund" | "warranty",
    targetId: string,
  ): Promise<boolean> {
    let table: any;
    if (targetType === "pos") table = schema.posTransactions;
    else if (targetType === "refund") table = schema.refunds;
    else table = schema.warrantyClaims;

    const rows = await db.select({ id: table.id }).from(table).where(eq(table.id, targetId)).limit(1);
    return rows.length > 0;
  },
};
