/**
 * GPS readiness transitions used by ShiftTab / pickup flows (DR-17).
 * From denied/error, a successful position read must reach "ready".
 */

export type GpsReadOutcome =
  | { ok: true }
  | { ok: false; code: number };

export type GpsReadResultState = "ready" | "denied" | "error";

/** Map a getCurrentPosition success/error into the UI GPS state. */
export function gpsStateAfterRead(result: GpsReadOutcome): GpsReadResultState {
  if (result.ok) return "ready";
  return result.code === 1 ? "denied" : "error";
}
