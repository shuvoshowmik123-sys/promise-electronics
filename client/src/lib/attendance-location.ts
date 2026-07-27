/**
 * ATTENDANCE-LOCATION-01B — presentation helpers for accuracy-aware geofence.
 * Never treat accuracy_uncertain / unverified as "Outside".
 */

export type GeofencePresentation = {
  key: "inside" | "outside" | "uncertain" | "unverified" | "unknown";
  label: string;
  description: string;
  tone: "success" | "warning" | "neutral" | "muted";
};

export function presentGeofenceStatus(status: string | null | undefined): GeofencePresentation {
  const s = (status ?? "").toLowerCase();
  if (s === "inside_office" || s === "inside") {
    return {
      key: "inside",
      label: "Inside office",
      description: "Within the configured office boundary.",
      tone: "success",
    };
  }
  if (s === "outside_office" || s === "outside") {
    return {
      key: "outside",
      label: "Outside office",
      description: "Confirmed outside the configured office boundary.",
      tone: "warning",
    };
  }
  if (s === "accuracy_uncertain") {
    return {
      key: "uncertain",
      label: "Accuracy uncertain",
      description: "GPS accuracy overlaps the office boundary. Manual review may be needed.",
      tone: "neutral",
    };
  }
  if (s === "unverified" || !s) {
    return {
      key: "unverified",
      label: "Unverified",
      description: "The location could not be verified reliably.",
      tone: "muted",
    };
  }
  return {
    key: "unknown",
    label: "Unverified",
    description: "The location could not be verified reliably.",
    tone: "muted",
  };
}

export function referenceSourceLabel(
  source: "snapshot" | "current_fallback" | "none" | null | undefined,
): string {
  if (source === "snapshot") return "Recorded office boundary";
  if (source === "current_fallback") return "Current office boundary";
  return "Office boundary configuration unavailable";
}

export function roundMeters(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${Math.round(value)} m`;
}

export function externalMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
