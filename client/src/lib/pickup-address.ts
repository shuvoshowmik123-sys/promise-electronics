/**
 * PICKUP-MAP-PIN-01 — merging a reverse-geocoded pin address into the address
 * the customer typed.
 *
 * Kept as a pure module (no React, no Vite globals) so it is directly unit
 * testable and reusable by any other intake surface.
 */

/**
 * Append a pin-resolved address to whatever the customer already typed.
 *
 * Append, never overwrite: OSM rarely resolves Dhaka house/flat numbers, so the
 * typed portion is usually the more valuable half and must survive.
 *
 * @param current  Current textarea contents.
 * @param next     Address resolved from the newly-confirmed pin.
 * @param previous Address contributed by the *previous* pin, if any. Removing it
 *                 first means re-pinning replaces that line rather than stacking
 *                 a second address, while text the customer typed is untouched.
 */
export function mergePinAddress(
  current: string,
  next: string,
  previous?: string | null,
): string {
  let base = current;
  if (previous) {
    base = base
      .split("\n")
      .filter((line) => line.trim() !== previous.trim())
      .join("\n");
  }
  base = base.trim();
  if (!base) return next;
  // Same spot re-confirmed — do not add a duplicate line.
  if (base.split("\n").some((line) => line.trim() === next.trim())) return base;
  return `${base}\n${next}`;
}
