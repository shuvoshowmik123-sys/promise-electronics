/** Marker written into inquiry.message when a customer requests staff-mediated recovery. */
export const ACCOUNT_RECOVERY_MESSAGE_PREFIX = "[ACCOUNT_RECOVERY]";

/** Pure detector for recovery inquiries (prefix match on message). */
export function isAccountRecoveryInquiryMessage(message: string | null | undefined): boolean {
  if (typeof message !== "string") return false;
  return message.trimStart().startsWith(ACCOUNT_RECOVERY_MESSAGE_PREFIX);
}
