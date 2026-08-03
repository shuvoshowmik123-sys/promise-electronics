/**
 * SSE types that should surface as admin inquiry list activity.
 * Pure predicate for unit tests — handler lives in AdminSSEContext.
 */

export const INQUIRY_VISIBILITY_SSE_TYPES = [
  "account_recovery_request",
  "customer_created",
] as const;

export type InquiryVisibilitySseType = (typeof INQUIRY_VISIBILITY_SSE_TYPES)[number];

export function isInquiryVisibilitySseEvent(data: { type?: string } | null | undefined): boolean {
  return !!data?.type && (INQUIRY_VISIBILITY_SSE_TYPES as readonly string[]).includes(data.type);
}

export function toastForInquiryVisibilityEvent(data: {
  type?: string;
  data?: { name?: string; phone?: string };
}): { title: string; description?: string } {
  if (data.type === "account_recovery_request") {
    return {
      title: "Account recovery request",
      description: "A customer asked for help recovering their account. Check Inquiries.",
    };
  }
  if (data.type === "customer_created") {
    const name = data.data?.name;
    return {
      title: "New customer registered",
      description: name ? `${name} just created an account.` : "A new customer account was created.",
    };
  }
  return { title: "Update" };
}
