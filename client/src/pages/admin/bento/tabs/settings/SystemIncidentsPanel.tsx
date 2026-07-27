import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { systemIncidentsApi, type SystemIncidentDto } from "@/lib/api/adminApi";
import { Button } from "@/components/ui/button";
import { useState } from "react";

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      timeZone: "Asia/Dhaka",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function severityTone(s: SystemIncidentDto["severity"]) {
  if (s === "critical") return "bg-rose-50 text-rose-700 border-rose-200";
  if (s === "warning") return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function IncidentRow({
  item,
  onAck,
  onResolve,
  busy,
}: {
  item: SystemIncidentDto;
  onAck: (id: string) => void;
  onResolve: (id: string) => void;
  busy: boolean;
}) {
  const [confirm, setConfirm] = useState<"ack" | "resolve" | null>(null);

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-slate-900 break-words">{item.safeTitle}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{item.areaLabel}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black ${severityTone(item.severity)}`}>
          {item.severity === "critical" ? "Critical" : item.severity === "warning" ? "Needs attention" : "Info"}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        Seen {item.count}× · Last {formatWhen(item.lastSeenAt)}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-slate-600 break-words">{item.safeNextStep}</p>
      {confirm ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            className="h-8 rounded-lg text-[11px]"
            disabled={busy}
            onClick={() => {
              if (confirm === "ack") onAck(item.id);
              else onResolve(item.id);
              setConfirm(null);
            }}
          >
            Confirm {confirm === "ack" ? "acknowledge" : "resolve"}
          </Button>
          <Button size="sm" variant="outline" className="h-8 rounded-lg text-[11px]" onClick={() => setConfirm(null)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {item.status === "open" && (
            <Button size="sm" variant="outline" className="h-8 rounded-lg text-[11px]" disabled={busy} onClick={() => setConfirm("ack")}>
              Acknowledge
            </Button>
          )}
          {(item.status === "open" || item.status === "acknowledged") && (
            <Button size="sm" variant="outline" className="h-8 rounded-lg text-[11px]" disabled={busy} onClick={() => setConfirm("resolve")}>
              Resolve
            </Button>
          )}
          {item.status === "acknowledged" && (
            <span className="self-center text-[10px] font-bold text-slate-400">Acknowledged</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function SystemIncidentsPanel({ variant }: { variant: "mobile" | "desktop" }) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["system-incidents"],
    queryFn: () => systemIncidentsApi.list({ limit: 20 }),
    staleTime: 60_000,
    retry: 1,
  });
  const summary = useQuery({
    queryKey: ["system-incidents-summary"],
    queryFn: () => systemIncidentsApi.summary(),
    staleTime: 60_000,
    retry: 1,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["system-incidents"] });
    void qc.invalidateQueries({ queryKey: ["system-incidents-summary"] });
  };

  const ack = useMutation({
    mutationFn: (id: string) => systemIncidentsApi.acknowledge(id),
    onSuccess: invalidate,
  });
  const resolve = useMutation({
    mutationFn: (id: string) => systemIncidentsApi.resolve(id),
    onSuccess: invalidate,
  });

  const busy = ack.isPending || resolve.isPending;
  const unavailable = list.isError || summary.isError;
  const items = list.data?.items ?? [];
  const s = summary.data;
  const attention = (s?.open ?? 0) + (s?.acknowledged ?? 0) > 0;

  const header = (
    <div className="flex items-center gap-2">
      {list.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
      ) : unavailable ? (
        <ShieldAlert className="h-4 w-4 text-slate-500" />
      ) : attention ? (
        <AlertTriangle className="h-4 w-4 text-amber-600" />
      ) : (
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-slate-900">System incidents</p>
        <p className="text-[11px] text-slate-500">
          {unavailable
            ? "Incident list could not be loaded."
            : list.isLoading
              ? "Checking incidents…"
              : attention
                ? `${s?.open ?? 0} open · ${s?.acknowledged ?? 0} acknowledged`
                : "No active system incidents."}
        </p>
      </div>
    </div>
  );

  const body = unavailable ? null : (
    <div className={`space-y-2 ${variant === "mobile" ? "px-4 pb-3" : "mt-3"}`}>
      {items.length === 0 && !list.isLoading ? (
        <p className="text-[11px] text-slate-500">Nothing needs attention right now.</p>
      ) : (
        items.map((item) => (
          <IncidentRow
            key={item.id}
            item={item}
            busy={busy}
            onAck={(id) => ack.mutate(id)}
            onResolve={(id) => resolve.mutate(id)}
          />
        ))
      )}
    </div>
  );

  if (variant === "mobile") {
    return (
      <div className="border-t border-slate-100">
        <div className="flex items-center gap-3 px-4 py-3">{header}</div>
        {body}
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      {header}
      {body}
    </div>
  );
}
