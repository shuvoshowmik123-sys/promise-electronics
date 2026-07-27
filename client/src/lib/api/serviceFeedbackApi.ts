/**
 * CUSTOMER-FEEDBACK-01B — client API shapes match server DTOs only.
 * Isolated from legacy reviewsApi / customer_reviews.
 */
import { fetchApi } from "./httpClient";

// ── Public featured (anonymous) ───────────────────────────────────────────

export type PublicFeaturedTestimonial = {
  rating: number;
  displayName: string;
  comment: string | null;
};

export const publicServiceFeedbackApi = {
  getFeatured: () =>
    fetchApi<{ items: PublicFeaturedTestimonial[] }>("/public/service-feedback/featured"),
};

// ── Customer ownership ────────────────────────────────────────────────────

export type CustomerFeedbackCurrent = {
  rating: number;
  comment: string | null;
  publicConsent: boolean;
  submittedAt: string | null;
  versionNo: number;
};

export type CustomerFeedbackOpportunity = {
  id: string;
  handoverAt: string | null;
  windowEndsAt: string | null;
  status: string;
  canSubmit: boolean;
  canReplace: boolean;
  withinWindow: boolean;
  publicConsent: boolean;
  consentWithdrawnAt: string | null;
  deviceLabel: string | null;
  ticketNumber: string | null;
  current: CustomerFeedbackCurrent | null;
};

export type CustomerFeedbackDetail = CustomerFeedbackOpportunity & {
  history: Array<{
    versionNo: number;
    rating: number;
    comment: string | null;
    publicConsent: boolean;
    submittedAt: string | null;
    supersededAt: string | null;
  }>;
};

export type CustomerFeedbackSubmitBody = {
  rating: number;
  comment?: string | null;
  publicConsent?: boolean;
};

export const customerServiceFeedbackApi = {
  list: () => fetchApi<{ items: CustomerFeedbackOpportunity[] }>("/customer/service-feedback"),
  getOne: (id: string) => fetchApi<CustomerFeedbackDetail>(`/customer/service-feedback/${id}`),
  submit: (id: string, body: CustomerFeedbackSubmitBody) =>
    fetchApi<{
      id: string;
      versionId: string;
      versionNo: number;
      rating: number;
      comment: string | null;
      publicConsent: boolean;
      submittedAt: string;
    }>(`/customer/service-feedback/${id}/submit`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  withdrawConsent: (id: string) =>
    fetchApi<{ id: string; publicConsent: boolean; withdrawnAt: string }>(
      `/customer/service-feedback/${id}/withdraw-consent`,
      { method: "POST", body: JSON.stringify({}) },
    ),
};

// ── Staff admin ───────────────────────────────────────────────────────────

export type StaffRecoveryCase = {
  id: string;
  opportunityId: string;
  feedbackVersionId: string;
  ratingSnapshot: number;
  status: string;
  assignedToUserId: string | null;
  assignmentScope: string | null;
  logisticsTaskId: string | null;
  staffNotes: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string | null;
  handoverEventId: string;
  jobTicketId: string;
  customerComment: string | null;
};

export type StaffPublicQueueItem = {
  id: string;
  handoverEventId: string;
  publicConsent: boolean;
  publicationStatus: string;
  featured: boolean;
  publicDisplayName: string | null;
  publicExcerpt: string | null;
  displayExpiresAt: string | null;
  retentionStatus: string;
  rating: number | null;
  comment: string | null;
  submittedAt: string | null;
};

export type StaffRetentionDueItem = {
  id: string;
  handoverEventId: string;
  publicationStatus: string;
  featured: boolean;
  displayExpiresAt: string | null;
  retentionStatus: string;
  publicDisplayName: string | null;
};

export const adminServiceFeedbackApi = {
  listRecovery: (status?: string) =>
    fetchApi<{ items: StaffRecoveryCase[] }>(
      `/admin/service-feedback/recovery${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    ),
  updateRecovery: (
    id: string,
    body: {
      staffNotes?: string;
      status?: string;
      assignedToUserId?: string | null;
      assignmentScope?: string | null;
      logisticsTaskId?: string | null;
    },
  ) =>
    fetchApi<{ id: string; status: string; assignedToUserId: string | null }>(
      `/admin/service-feedback/recovery/${id}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  resolveRecovery: (id: string, note?: string) =>
    fetchApi<{ id: string; status: string; resolvedAt: string }>(
      `/admin/service-feedback/recovery/${id}/resolve`,
      { method: "POST", body: JSON.stringify({ note }) },
    ),
  publicQueue: () =>
    fetchApi<{ items: StaffPublicQueueItem[] }>("/admin/service-feedback/public-queue"),
  publish: (id: string) =>
    fetchApi<{ id: string; publicationStatus: string }>(`/admin/service-feedback/${id}/publish`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  hide: (id: string) =>
    fetchApi<{ id: string; publicationStatus: string; featured: boolean }>(
      `/admin/service-feedback/${id}/hide`,
      { method: "POST", body: JSON.stringify({}) },
    ),
  feature: (id: string, featured: boolean) =>
    fetchApi<{ id: string; featured: boolean }>(`/admin/service-feedback/${id}/feature`, {
      method: "POST",
      body: JSON.stringify({ featured }),
    }),
  retentionDue: () =>
    fetchApi<{ items: StaffRetentionDueItem[] }>("/admin/service-feedback/retention-due"),
  retention: (id: string, decision: "renew" | "hide" | "archive_anonymize") =>
    fetchApi<{ id: string; retentionStatus: string }>(`/admin/service-feedback/${id}/retention`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    }),
};

export const ServiceFeedbackQueryKeys = {
  publicFeatured: () => ["service-feedback", "public-featured"] as const,
  customerList: () => ["service-feedback", "customer-list"] as const,
  customerOne: (id: string) => ["service-feedback", "customer", id] as const,
  recovery: (status?: string) => ["service-feedback", "admin-recovery", status ?? "all"] as const,
  publicQueue: () => ["service-feedback", "admin-public-queue"] as const,
  retentionDue: () => ["service-feedback", "admin-retention-due"] as const,
};
