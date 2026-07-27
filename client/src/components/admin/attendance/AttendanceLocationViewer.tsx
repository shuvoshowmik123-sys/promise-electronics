import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ExternalLink, Loader2, MapPin } from "lucide-react";
import {
  attendanceApi,
  attendanceLocationContextQueryKey,
  type AttendanceLocationContext,
} from "@/lib/api/adminApi";
import { ApiError } from "@/lib/api/httpClient";
import {
  externalMapsUrl,
  presentGeofenceStatus,
  referenceSourceLabel,
  roundMeters,
} from "@/lib/attendance-location";
import { useAdminMobileMode } from "@/hooks/useAdminMobileMode";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  MobileBottomSheetDragHandle,
  MobileBottomSheetFrame,
} from "@/components/ui/mobile-bottom-sheet";
import { AttendanceLocationMap } from "./AttendanceLocationMap";
import { cn } from "@/lib/utils";

export type AttendanceLocationViewerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordId: string | null;
  employeeName?: string | null;
  recordDate?: string | null;
};

type Side = "checkIn" | "checkOut";

function toneClasses(tone: "success" | "warning" | "neutral" | "muted") {
  if (tone === "success") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (tone === "warning") return "bg-amber-50 text-amber-900 border-amber-200";
  if (tone === "neutral") return "bg-sky-50 text-sky-900 border-sky-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function formatTs(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "h:mm a");
  } catch {
    return "—";
  }
}

function formatDateLabel(date: string | null | undefined): string {
  if (!date) return "—";
  try {
    return format(parseISO(date), "EEE, d MMM yyyy");
  } catch {
    return date;
  }
}

function pickSide(ctx: AttendanceLocationContext | undefined, side: Side) {
  if (!ctx) return null;
  if (side === "checkOut") return ctx.checkOut;
  return ctx.checkIn;
}

function openExternalMaps(lat: number, lng: number) {
  const url = externalMapsUrl(lat, lng);
  window.open(url, "_blank", "noopener,noreferrer");
}

function ViewerBody({
  data,
  isLoading,
  error,
  employeeName,
  recordDate,
  side,
  setSide,
}: {
  data: AttendanceLocationContext | undefined;
  isLoading: boolean;
  error: unknown;
  employeeName?: string | null;
  recordDate?: string | null;
  side: Side;
  setSide: (s: Side) => void;
}) {
  const hasCheckOut = Boolean(data?.checkOut?.timestamp || data?.checkOut?.latitude != null);
  const event = pickSide(data, side);
  const status = presentGeofenceStatus(event?.status);
  const officeOk =
    data?.referenceLatitude != null &&
    data?.referenceLongitude != null &&
    Number.isFinite(data.referenceLatitude) &&
    Number.isFinite(data.referenceLongitude);
  const employeeOk =
    event?.latitude != null &&
    event?.longitude != null &&
    Number.isFinite(event.latitude) &&
    Number.isFinite(event.longitude);

  const office = officeOk
    ? { latitude: data!.referenceLatitude!, longitude: data!.referenceLongitude! }
    : null;
  const employee = employeeOk
    ? {
        latitude: event!.latitude!,
        longitude: event!.longitude!,
        accuracyMeters: event!.accuracy,
      }
    : null;

  const canOpenExternal = employeeOk || officeOk;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-[min(48vh,360px)] min-h-[220px] animate-pulse rounded-xl bg-slate-100" />
        <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
        <div className="flex items-center justify-center gap-2 py-2 text-xs font-bold text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading location…
        </div>
      </div>
    );
  }

  if (error) {
    const statusCode = error instanceof ApiError ? error.statusCode : undefined;
    const message =
      statusCode === 403
        ? "You do not have permission to view this location."
        : statusCode === 404
          ? "Attendance record not found."
          : error instanceof Error
            ? error.message
            : "Failed to load location.";
    return (
      <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-6 text-center">
        <p className="text-sm font-black text-rose-800">{message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {hasCheckOut && (
        <div
          className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1"
          role="tablist"
          aria-label="Check-in or check-out"
        >
          {(["checkIn", "checkOut"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={side === key}
              onClick={() => setSide(key)}
              className={cn(
                "rounded-lg py-2 text-xs font-black transition-colors",
                side === key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              {key === "checkIn" ? "Check-in" : "Check-out"}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-black text-slate-900">
            {employeeName || "Staff member"}
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold",
              toneClasses(status.tone),
            )}
          >
            {status.label}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          {formatDateLabel(recordDate)} · {side === "checkIn" ? "In" : "Out"}{" "}
          {formatTs(event?.timestamp)}
        </p>
        <p className="text-xs font-semibold text-slate-600">
          {data?.workLocationName || "Work location not named"}
        </p>
      </div>

      <div
        className={cn(
          "rounded-xl border px-3 py-2.5 text-xs leading-relaxed",
          toneClasses(status.tone),
        )}
      >
        {status.description}
      </div>

      {!officeOk && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          Office location is not configured. Ask a Super Administrator to save the Service Center
          pin in Area Intelligence.
        </div>
      )}

      {officeOk && !employeeOk && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
          No GPS location was recorded for this event.
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Metric label="Distance" value={roundMeters(event?.distanceMeters) ?? "—"} />
        <Metric label="GPS accuracy" value={roundMeters(event?.accuracy) ?? "—"} />
        <Metric label="Office radius" value={roundMeters(data?.referenceRadiusMeters) ?? "—"} />
      </div>

      <p className="text-[11px] font-medium text-slate-500">
        Reference: {referenceSourceLabel(data?.referenceSource)}
      </p>

      <div className="h-[min(48vh,360px)] min-h-[220px]">
        <AttendanceLocationMap
          office={office}
          employee={employee}
          employeeEvent={side}
          radiusMeters={data?.referenceRadiusMeters ?? null}
          className="h-full"
          fallbackSummary={status.description}
        />
      </div>

      {canOpenExternal && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              if (employeeOk) {
                openExternalMaps(event!.latitude!, event!.longitude!);
              } else if (officeOk) {
                openExternalMaps(data!.referenceLatitude!, data!.referenceLongitude!);
              }
            }}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-blue-600"
          >
            <ExternalLink className="h-3 w-3" />
            Open externally
          </button>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-2">
      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm font-black text-slate-800">{value}</div>
    </div>
  );
}

/**
 * Shared in-app attendance location viewer.
 * Desktop: Dialog. Mobile: portaled sheet with handle-only drag.
 * Fetches location context only while open.
 */
export function AttendanceLocationViewer({
  open,
  onOpenChange,
  recordId,
  employeeName,
  recordDate,
}: AttendanceLocationViewerProps) {
  const isMobile = useAdminMobileMode();
  const [side, setSide] = useState<Side>("checkIn");
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open && typeof document !== "undefined") {
      triggerRef.current = document.activeElement as HTMLElement | null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) setSide("checkIn");
  }, [open, recordId]);

  useEffect(() => {
    if (!open || !isMobile) return;
    window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: true } }));
    return () => {
      window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: false } }));
    };
  }, [open, isMobile]);

  useEffect(() => {
    if (open) return;
    const el = triggerRef.current;
    if (el && typeof el.focus === "function") {
      window.setTimeout(() => el.focus(), 0);
    }
  }, [open]);

  const enabled = open && Boolean(recordId);
  const { data, isLoading, error } = useQuery({
    queryKey: attendanceLocationContextQueryKey(recordId || "none"),
    queryFn: () => attendanceApi.getLocationContext(recordId!),
    enabled,
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (!data?.checkOut && side === "checkOut") setSide("checkIn");
  }, [data, side]);

  const body = useMemo(
    () => (
      <ViewerBody
        data={data}
        isLoading={isLoading}
        error={error}
        employeeName={employeeName}
        recordDate={recordDate}
        side={side}
        setSide={setSide}
      />
    ),
    [data, isLoading, error, employeeName, recordDate, side],
  );

  const close = () => onOpenChange(false);

  // Mobile sheet only — do not mount desktop Dialog simultaneously.
  // dragHandleOnly: map pan + body scroll must not drag/close the sheet.
  if (isMobile) {
    if (!open || typeof document === "undefined") return null;
    return createPortal(
      <>
        <div
          className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-[2px]"
          onClick={close}
          aria-hidden
        />
        <MobileBottomSheetFrame
          onClose={close}
          dragHandleOnly
          className="fixed inset-x-0 bottom-0 z-[201] flex max-h-[92dvh] flex-col rounded-t-3xl bg-white shadow-2xl"
        >
          <MobileBottomSheetDragHandle onClose={close} className="mt-1" />
          <div className="shrink-0 border-b border-slate-100 px-4 pb-2">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-teal-700" />
              <h2 className="text-sm font-black text-slate-900">Attendance location</h2>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{body}</div>
          <div className="shrink-0 border-t border-slate-100 px-4 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <Button type="button" variant="outline" className="h-11 w-full rounded-2xl font-bold" onClick={close}>
              Close
            </Button>
          </div>
        </MobileBottomSheetFrame>
      </>,
      document.body,
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="border-b border-slate-100 px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base font-black">
            <MapPin className="h-4 w-4 text-teal-700" />
            Attendance location
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            In-app map of office boundary and staff check position. Coordinates are not shown as text.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[min(80vh,720px)] overflow-y-auto px-5 py-4">{body}</div>
      </DialogContent>
    </Dialog>
  );
}

/** Compact “View location” control for rows/cards. */
export function ViewLocationButton({
  onClick,
  className,
  compact,
}: {
  onClick: () => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 font-bold text-blue-600 hover:underline",
        compact ? "text-[10px]" : "text-xs",
        className,
      )}
    >
      <MapPin className={compact ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} />
      View location
    </button>
  );
}
