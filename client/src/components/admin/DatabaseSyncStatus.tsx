import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CloudCog } from "lucide-react";
import { cn } from "../../lib/utils.js";
import { useDbReadiness } from "../../hooks/useDbReadiness.js";

type DatabaseSyncStatusProps = {
  enabled?: boolean;
  className?: string;
};

export function DatabaseSyncStatus({ enabled = true, className }: DatabaseSyncStatusProps) {
  const queryClient = useQueryClient();
  const previousReadyRef = useRef<boolean | null>(null);
  const [visible, setVisible] = useState(true);
  const { data, isError } = useDbReadiness(enabled);

  const ready = Boolean(data?.ready);
  const connecting = !ready || isError;
  const label = connecting ? (data?.dbConnected ? "Syncing latest data..." : "Database connecting...") : "Live";

  useEffect(() => {
    if (!enabled) return;
    if (previousReadyRef.current === false && ready) {
      queryClient.invalidateQueries({
        predicate: (query) => query.isActive() && query.queryKey[0] !== "db-readiness",
      });
    }
    previousReadyRef.current = ready;
  }, [enabled, queryClient, ready]);

  useEffect(() => {
    if (!enabled) return;
    setVisible(true);
    const timeout = window.setTimeout(() => setVisible(false), 2_000);
    return () => window.clearTimeout(timeout);
  }, [enabled, label]);

  if (!enabled) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed right-3 top-16 z-[70] flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black shadow-sm backdrop-blur-xl transition-all duration-500 ease-out md:top-4",
        connecting
          ? "border-amber-200 bg-amber-50/90 text-amber-800"
          : "border-emerald-200 bg-emerald-50/90 text-emerald-800",
        visible ? "translate-x-0 opacity-100" : "translate-x-[calc(100%+1rem)] opacity-0",
        className,
      )}
      aria-live="polite"
    >
      {connecting ? <CloudCog className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
      <span>{label}</span>
    </div>
  );
}
