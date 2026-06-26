import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "@/lib/config";

export type DbReadiness = {
  ready: boolean;
};

async function fetchDbReadiness(): Promise<DbReadiness> {
  const res = await fetch(`${API_BASE_URL}/api/ready`, { credentials: "include" });
  if (!res.ok) return { ready: false };
  return res.json();
}

export function useDbReadiness(enabled = true) {
  return useQuery({
    queryKey: ["db-readiness"],
    queryFn: fetchDbReadiness,
    enabled,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
    retry: false,
  });
}
