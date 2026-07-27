/**
 * One-time in-memory handoff after contextual create when staff has disputes.view.
 * Consumed immediately by DisputesTab. Not written to URL, toast, or storage.
 */
let pendingOpenCaseId: string | null = null;

export function handoffOpenDisputeCase(caseId: string): void {
  if (!caseId) return;
  pendingOpenCaseId = caseId;
}

/** Returns and clears the pending id (one-time). */
export function consumeOpenDisputeCaseHandoff(): string | null {
  const id = pendingOpenCaseId;
  pendingOpenCaseId = null;
  return id;
}

export const DISPUTES_OPEN_CASE_EVENT = "disputes:open-case";

export function emitOpenDisputeCase(caseId: string): void {
  if (typeof window === "undefined" || !caseId) return;
  window.dispatchEvent(
    new CustomEvent(DISPUTES_OPEN_CASE_EVENT, { detail: { id: caseId } }),
  );
}
