/**
 * Decide how to fetch an authenticated service-request detail.
 * Public ticket numbers (SRV-...) must use the ticket-aware track route;
 * internal ids use getOne. Ownership checks stay on the server.
 */
export function isPublicServiceTicketNumber(id: string): boolean {
  return /^SRV-/i.test(id.trim());
}
