/**
 * Process-local session for disposable baseline adoption expected ledger checksums (A).
 * Intentionally has zero imports from main-schema-migrate or baseline-adoption to avoid cycles.
 *
 * Only activated after explicit local-disposable adoption verification succeeds.
 * Normal startup never activates this session.
 */

export type AdoptionChecksumSession = {
  active: boolean;
  /** Historic id → trusted baseline ledger checksum (identity A). */
  expectedLedgerChecksumById: Record<string, string>;
  baselineVersion: string;
  activatedAtMs: number;
};

let session: AdoptionChecksumSession | null = null;

export function clearAdoptionExpectedChecksumSession(): void {
  session = null;
}

export function getAdoptionExpectedChecksumSession(): AdoptionChecksumSession | null {
  return session
    ? {
        active: session.active,
        expectedLedgerChecksumById: { ...session.expectedLedgerChecksumById },
        baselineVersion: session.baselineVersion,
        activatedAtMs: session.activatedAtMs,
      }
    : null;
}

/**
 * Activate expected ledger checksum overrides (identity A) for adopted historic ids.
 * Caller must have already passed gate + manifest integrity + frozen source identity (B).
 */
export function activateAdoptionExpectedChecksumSession(input: {
  expectedLedgerChecksumById: Record<string, string>;
  baselineVersion: string;
}): void {
  const map = { ...input.expectedLedgerChecksumById };
  if (Object.keys(map).length === 0) {
    throw new Error("Adoption session refused: empty expected ledger checksum map");
  }
  session = {
    active: true,
    expectedLedgerChecksumById: map,
    baselineVersion: input.baselineVersion,
    activatedAtMs: Date.now(),
  };
}

/**
 * Resolve expected ledger checksum for an applied historic/current migration id.
 * When adoption session is active and id is adopted, return baseline ledger checksum (A).
 * Otherwise return the provided codeChecksum (current source identity).
 */
export function resolveExpectedLedgerChecksum(
  migrationId: string,
  codeChecksum: string
): string {
  if (!session?.active) return codeChecksum;
  const adopted = session.expectedLedgerChecksumById[migrationId];
  if (adopted === undefined) return codeChecksum;
  return adopted;
}

export function isAdoptionExpectedChecksumSessionActive(): boolean {
  return session?.active === true;
}
