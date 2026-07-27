import { useQuery } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle, Clock, Wrench, CheckCircle, Layers } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { SectionEyebrow } from "@/components/customer/mobile-kit";

type SafeJob = {
  slipId: string;
  device: string | null;
  ticketType: string | null;
  status: string;
  createdAt: string | null;
  completedAt: string | null;
  badges: { panelOnly: boolean; partsOnly: boolean };
};

type TrackPayload =
  | ({ kind: "job" } & SafeJob)
  | {
      kind: "batch";
      slipId: string;
      status: string;
      totalItems: number;
      createdAt: string | null;
      jobs: SafeJob[];
    };

function formatWhen(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

function TypeBadges({ badges }: { badges: SafeJob["badges"] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.panelOnly && (
        <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100" data-testid="badge-panel-only">
          Panel only
        </Badge>
      )}
      {badges.partsOnly && (
        <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100" data-testid="badge-parts-only">
          Parts only
        </Badge>
      )}
      {!badges.panelOnly && !badges.partsOnly && (
        <Badge variant="secondary" className="text-slate-600">
          Full / other
        </Badge>
      )}
    </div>
  );
}

function JobCard({ job }: { job: SafeJob }) {
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      data-testid="external-qr-job-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Slip</div>
          <div className="font-mono text-lg font-bold text-slate-900" data-testid="external-qr-slip-id">
            {job.slipId}
          </div>
        </div>
        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">{job.status}</Badge>
      </div>
      <div className="mt-3 grid gap-2 text-sm text-slate-700">
        <div>
          <span className="text-slate-400">Device: </span>
          {job.device || "—"}
        </div>
        <TypeBadges badges={job.badges} />
        <div className="text-xs text-slate-500">
          Created {formatWhen(job.createdAt)}
          {job.completedAt ? ` · Completed ${formatWhen(job.completedAt)}` : ""}
        </div>
      </div>
    </div>
  );
}

export default function TrackExternalQrPage() {
  usePageTitle("Shop job status");
  const params = useParams<{ token?: string }>();
  const token = (params.token || "").trim();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["external-qr-track", token],
    enabled: token.length > 0,
    queryFn: async (): Promise<TrackPayload> => {
      const res = await fetch(`/api/public/external-track/${encodeURIComponent(token)}`);
      if (!res.ok) {
        const err = new Error("not_found");
        throw err;
      }
      return res.json();
    },
    retry: false,
  });

  return (
    <div className="min-h-[100dvh] bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-lg space-y-4">
        <div>
          <SectionEyebrow>Promise Electronics</SectionEyebrow>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Shop job status</h1>
          <p className="mt-1 text-sm text-slate-500">Status for the printed slip only. No account required.</p>
        </div>

        {isLoading && (
          <Card>
            <CardContent className="flex items-center gap-3 p-6 text-slate-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading status…
            </CardContent>
          </Card>
        )}

        {(isError || !token) && !isLoading && (
          <Card>
            <CardContent className="flex items-start gap-3 p-6 text-slate-700">
              <AlertCircle className="mt-0.5 h-5 w-5 text-rose-600" />
              <div>
                <div className="font-semibold">Not found</div>
                <p className="mt-1 text-sm text-slate-500">
                  This tracking link is invalid or no longer active.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {data?.kind === "job" && <JobCard job={data} />}

        {data?.kind === "batch" && (
          <div className="space-y-3" data-testid="external-qr-batch">
            <Card>
              <CardContent className="space-y-2 p-5">
                <div className="flex items-center gap-2 text-slate-800">
                  <Layers className="h-5 w-5 text-blue-600" />
                  <span className="font-bold">Batch {data.slipId}</span>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-100">{data.status}</Badge>
                  <Badge variant="outline">{data.totalItems} unit(s)</Badge>
                </div>
                <div className="text-xs text-slate-500">Created {formatWhen(data.createdAt)}</div>
              </CardContent>
            </Card>
            {data.jobs.map((job) => (
              <JobCard key={job.slipId + job.device + job.status} job={job} />
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Clock className="h-3.5 w-3.5" />
          <Wrench className="h-3.5 w-3.5" />
          <CheckCircle className="h-3.5 w-3.5" />
          Operational status only
        </div>
      </div>
    </div>
  );
}
