/**
 * FINANCE-AND-AFTERCARE-01.4-UI-01A — dispute client shapes match server DTOs.
 * Calls only /api/disputes*. No finance/refund/warranty/job mutation endpoints.
 */
import { fetchApi } from "./httpClient";

export type DisputeStatus = "open" | "under_review" | "resolved" | "closed";
export type DisputeType = "billing" | "service_quality" | "refund" | "warranty" | "other";
export type DisputeTargetTable = "pos" | "refund" | "warranty";

export type Dispute = {
  id: string;
  posTransactionId: string | null;
  refundId: string | null;
  warrantyClaimId: string | null;
  disputeType: string;
  status: string;
  customer: string | null;
  customerPhone: string | null;
  description: string;
  resolutionNotes: string | null;
  openedBy: string;
  openedByName: string;
  openedByRole: string;
  openedAt: string;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolvedByRole: string | null;
  resolvedAt: string | null;
  updatedAt: string;
  createdAt: string;
};

export type DisputeNote = {
  id: string;
  disputeId: string;
  noteType: string;
  content: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  previousStatus: string | null;
  newStatus: string | null;
  createdAt: string;
};

export type CreateDisputeBody = {
  pos_transaction_id?: string | null;
  refund_id?: string | null;
  warranty_claim_id?: string | null;
  dispute_type: string;
  description: string;
  customer?: string | null;
  customer_phone?: string | null;
};

export type ListDisputesParams = {
  status?: string;
  dispute_type?: string;
  target_table?: DisputeTargetTable;
  page?: number;
  limit?: number;
};

function toQuery(params: ListDisputesParams): string {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.dispute_type) q.set("dispute_type", params.dispute_type);
  if (params.target_table) q.set("target_table", params.target_table);
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const disputesApi = {
  list: (params: ListDisputesParams = {}) =>
    fetchApi<{ items: Dispute[]; total: number }>(`/disputes${toQuery(params)}`),

  getOne: (id: string) => fetchApi<Dispute>(`/disputes/${id}`),

  getNotes: (id: string) => fetchApi<DisputeNote[]>(`/disputes/${id}/notes`),

  create: (body: CreateDisputeBody) =>
    fetchApi<Dispute>("/disputes", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  addNote: (id: string, content: string, note_type: "note" | "internal" = "note") =>
    fetchApi<DisputeNote>(`/disputes/${id}/notes`, {
      method: "POST",
      body: JSON.stringify({ content, note_type }),
    }),

  transitionStatus: (id: string, status: string, resolution_notes?: string) =>
    fetchApi<Dispute>(`/disputes/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, resolution_notes }),
    }),

  resolve: (id: string, resolution_notes: string) =>
    fetchApi<Dispute>(`/disputes/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolution_notes }),
    }),
};

export function disputeCaseRef(id: string): string {
  if (!id) return "—";
  const short = id.replace(/-/g, "").slice(-6).toUpperCase();
  return `DSP-${short}`;
}

export function disputeTargetLabel(d: Pick<Dispute, "posTransactionId" | "refundId" | "warrantyClaimId">): {
  kind: DisputeTargetTable;
  label: string;
  id: string;
} | null {
  if (d.posTransactionId) {
    return { kind: "pos", label: "POS sale", id: d.posTransactionId };
  }
  if (d.refundId) {
    return { kind: "refund", label: "Refund", id: d.refundId };
  }
  if (d.warrantyClaimId) {
    return { kind: "warranty", label: "Warranty claim", id: d.warrantyClaimId };
  }
  return null;
}

export function disputeTargetShortRef(id: string): string {
  return id.replace(/-/g, "").slice(-6).toUpperCase();
}
