/**
 * Pure safety rules for orphan journey adoption (ITEM 4).
 * No DB imports — unit-testable offline.
 */

/**
 * Adopt only when journey is unowned and the linked service request already
 * proves an owner. Never invent an owner. Never overwrite a non-null owner.
 */
export function shouldAdoptOrphanJourney(opts: {
  journeyCustomerId: string | null | undefined;
  serviceRequestCustomerId: string | null | undefined;
}): boolean {
  if (opts.journeyCustomerId != null && opts.journeyCustomerId !== "") {
    return false;
  }
  if (opts.serviceRequestCustomerId == null || opts.serviceRequestCustomerId === "") {
    return false;
  }
  return true;
}
