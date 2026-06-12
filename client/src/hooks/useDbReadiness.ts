import { useQuery } from "@tanstack/react-query";

export type DbReadinessState = "initializing" | "checking" | "ready" | "degraded";

export type DbReadiness = {
  ready: boolean;
  state: DbReadinessState;
  dbConnected: boolean;
  migrationsComplete: boolean;
  lastCheck: string | null;
  lastError: string | null;
  checkCount: number;
  ts: string;
};

async function fetchDbReadiness(): Promise<DbReadiness> {
  const res = await fetch("/ready", { credentials: "include" });
  const data = await res.json();
  return data;
}

export function useDbReadiness(enabled = true) {
  return useQuery({
    queryKey: ["db-readiness"],
    queryFn: fetchDbReadiness,
    enabled,
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
    staleTime: 2_000,
    retry: false,
  });
}
