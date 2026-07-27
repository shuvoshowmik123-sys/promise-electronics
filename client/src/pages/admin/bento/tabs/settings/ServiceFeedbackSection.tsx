/**
 * CUSTOMER-FEEDBACK-01B — staff Feedback workspace (Settings family).
 * Permission-aware UI; backend remains authoritative.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CheckCircle2,
  EyeOff,
  Loader2,
  MessageSquareHeart,
  RefreshCw,
  Star,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import {
  adminServiceFeedbackApi,
  ServiceFeedbackQueryKeys,
  type StaffPublicQueueItem,
  type StaffRecoveryCase,
  type StaffRetentionDueItem,
} from "@/lib/api/serviceFeedbackApi";
import {
  canFeaturePublicFeedback,
  canModeratePublicFeedback,
  canResolveFeedbackRecovery,
  canReviewFeedbackRetention,
  canUpdateFeedbackRecovery,
  canViewFeedbackRecoveryAll,
  canViewFeedbackRecoveryAssigned,
} from "@/lib/service-feedback-capabilities";
import { ApiError } from "@/lib/api/httpClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmState =
  | { kind: "publish" | "hide" | "feature" | "unfeature"; id: string }
  | { kind: "retention"; id: string; decision: "renew" | "hide" | "archive_anonymize" }
  | null;

function RatingStars({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i <= n ? "fill-amber-400 text-amber-400" : "text-slate-200"}`}
        />
      ))}
    </div>
  );
}

export default function ServiceFeedbackSection() {
  const { user, permissions } = useAdminAuth();
  const perms = permissions as Record<string, boolean | undefined>;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"recovery" | "public" | "retention">("recovery");
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const canRecovery = canViewFeedbackRecoveryAssigned(user, perms);
  const canRecoveryAll = canViewFeedbackRecoveryAll(user, perms);
  const canUpdate = canUpdateFeedbackRecovery(user, perms);
  const canResolve = canResolveFeedbackRecovery(user, perms);
  const canModerate = canModeratePublicFeedback(user, perms);
  const canFeature = canFeaturePublicFeedback(user, perms);
  const canRetention = canReviewFeedbackRetention(user, perms);

  const recoveryQ = useQuery({
    queryKey: ServiceFeedbackQueryKeys.recovery(),
    queryFn: () => adminServiceFeedbackApi.listRecovery(),
    enabled: canRecovery,
  });
  const publicQ = useQuery({
    queryKey: ServiceFeedbackQueryKeys.publicQueue(),
    queryFn: () => adminServiceFeedbackApi.publicQueue(),
    enabled: canModerate || canFeature,
  });
  const retentionQ = useQuery({
    queryKey: ServiceFeedbackQueryKeys.retentionDue(),
    queryFn: () => adminServiceFeedbackApi.retentionDue(),
    enabled: canRetention,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["service-feedback"] });
  };

  const onErr = (err: unknown, fallback: string) => {
    toast({ title: err instanceof ApiError ? err.message : fallback });
  };

  const updateRecovery = useMutation({
    mutationFn: ({ id, staffNotes, status }: { id: string; staffNotes?: string; status?: string }) =>
      adminServiceFeedbackApi.updateRecovery(id, { staffNotes, status }),
    onSuccess: () => {
      toast({ title: "Recovery updated" });
      invalidateAll();
    },
    onError: (e) => onErr(e, "Update failed"),
  });

  const resolveRecovery = useMutation({
    mutationFn: (id: string) => adminServiceFeedbackApi.resolveRecovery(id),
    onSuccess: () => {
      toast({ title: "Case resolved" });
      invalidateAll();
    },
    onError: (e) => onErr(e, "Resolve failed"),
  });

  const pubAction = useMutation({
    mutationFn: async (c: NonNullable<ConfirmState>) => {
      if (c.kind === "publish") return adminServiceFeedbackApi.publish(c.id);
      if (c.kind === "hide") return adminServiceFeedbackApi.hide(c.id);
      if (c.kind === "feature") return adminServiceFeedbackApi.feature(c.id, true);
      if (c.kind === "unfeature") return adminServiceFeedbackApi.feature(c.id, false);
      if (c.kind === "retention") return adminServiceFeedbackApi.retention(c.id, c.decision);
    },
    onSuccess: () => {
      toast({ title: "Saved" });
      setConfirm(null);
      invalidateAll();
    },
    onError: (e) => onErr(e, "Action failed"),
  });

  const tabs = useMemo(() => {
    const list: { id: "recovery" | "public" | "retention"; label: string }[] = [];
    if (canRecovery) list.push({ id: "recovery", label: canRecoveryAll ? "Recovery" : "My recovery" });
    if (canModerate || canFeature) list.push({ id: "public", label: "Public reviews" });
    if (canRetention) list.push({ id: "retention", label: "Annual review" });
    return list;
  }, [canRecovery, canRecoveryAll, canModerate, canFeature, canRetention]);

  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id || "recovery";

  if (!tabs.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        You do not have service feedback permissions.
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="service-feedback-admin">
      <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
        <MessageSquareHeart className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <p className="text-sm font-bold text-slate-900">Service feedback</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-600">
            Post-delivery customer ratings and recovery. Customer wording cannot be edited here.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`h-10 rounded-xl px-3 text-xs font-bold transition ${
              activeTab === t.id
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "recovery" && canRecovery && (
        <div className="space-y-3">
          {recoveryQ.isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          )}
          {(recoveryQ.data?.items || []).length === 0 && !recoveryQ.isLoading && (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              No recovery cases in your queue.
            </p>
          )}
          {(recoveryQ.data?.items || []).map((c: StaffRecoveryCase) => (
            <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <RatingStars n={c.ratingSnapshot} />
                  <p className="mt-2 text-sm text-slate-700">
                    {c.customerComment || "No customer comment"}
                  </p>
                  <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    {c.status}
                    {c.assignmentScope ? ` · ${c.assignmentScope}` : ""}
                  </p>
                </div>
              </div>
              {canUpdate && c.status !== "resolved" && (
                <div className="mt-3 space-y-2">
                  <Textarea
                    value={notesDraft[c.id] ?? c.staffNotes ?? ""}
                    onChange={(e) => setNotesDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                    placeholder="Staff notes (private)"
                    className="min-h-20 rounded-xl text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10 rounded-xl"
                      disabled={updateRecovery.isPending}
                      onClick={() =>
                        updateRecovery.mutate({
                          id: c.id,
                          staffNotes: notesDraft[c.id] ?? c.staffNotes ?? "",
                          status: "in_progress",
                        })
                      }
                    >
                      Save notes
                    </Button>
                    {canResolve && (
                      <Button
                        size="sm"
                        className="h-10 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                        disabled={resolveRecovery.isPending}
                        onClick={() => resolveRecovery.mutate(c.id)}
                      >
                        <CheckCircle2 className="mr-1.5 h-4 w-4" />
                        Resolve
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {c.status === "resolved" && (
                <p className="mt-2 text-xs font-semibold text-emerald-700">Resolved</p>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === "public" && (canModerate || canFeature) && (
        <div className="space-y-3">
          {publicQ.isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          )}
          {(publicQ.data?.items || []).length === 0 && !publicQ.isLoading && (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              No submitted feedback yet.
            </p>
          )}
          {(publicQ.data?.items || []).map((item: StaffPublicQueueItem) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                {item.rating != null ? <RatingStars n={item.rating} /> : <span />}
                <span className="text-[11px] font-bold uppercase text-slate-400">
                  {item.publicationStatus}
                  {item.featured ? " · featured" : ""}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-800">
                {item.publicDisplayName || "Customer"}
              </p>
              <p className="mt-1 text-sm italic leading-6 text-slate-600">
                "{item.publicExcerpt || item.comment || "—"}"
              </p>
              <p className="mt-2 text-[11px] text-slate-400">
                Consent: {item.publicConsent ? "yes" : "no"} · Staff cannot edit wording
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {canModerate && item.publicConsent && item.publicationStatus !== "published" && (
                  <Button
                    size="sm"
                    className="h-10 rounded-xl"
                    onClick={() => setConfirm({ kind: "publish", id: item.id })}
                  >
                    Publish
                  </Button>
                )}
                {canModerate && item.publicationStatus === "published" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-10 rounded-xl"
                    onClick={() => setConfirm({ kind: "hide", id: item.id })}
                  >
                    <EyeOff className="mr-1.5 h-4 w-4" />
                    Hide
                  </Button>
                )}
                {canFeature && item.publicationStatus === "published" && item.publicConsent && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-10 rounded-xl"
                    onClick={() =>
                      setConfirm({
                        kind: item.featured ? "unfeature" : "feature",
                        id: item.id,
                      })
                    }
                  >
                    {item.featured ? "Unfeature" : "Feature on homepage"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "retention" && canRetention && (
        <div className="space-y-3">
          {retentionQ.isLoading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          )}
          {(retentionQ.data?.items || []).length === 0 && !retentionQ.isLoading && (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              No public reviews due for annual review.
            </p>
          )}
          {(retentionQ.data?.items || []).map((item: StaffRetentionDueItem) => (
            <div key={item.id} className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">
                    {item.publicDisplayName || "Customer review"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Expires {item.displayExpiresAt ? new Date(item.displayExpiresAt).toLocaleDateString() : "—"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="h-10 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={() => setConfirm({ kind: "retention", id: item.id, decision: "renew" })}
                    >
                      <RefreshCw className="mr-1.5 h-4 w-4" />
                      Renew 12 months
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10 rounded-xl"
                      onClick={() => setConfirm({ kind: "retention", id: item.id, decision: "hide" })}
                    >
                      <EyeOff className="mr-1.5 h-4 w-4" />
                      Hide
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10 rounded-xl border-amber-300 text-amber-800"
                      onClick={() =>
                        setConfirm({ kind: "retention", id: item.id, decision: "archive_anonymize" })
                      }
                    >
                      <Archive className="mr-1.5 h-4 w-4" />
                      Archive / anonymize
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm public action</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "publish" && "Publish this consented review for public display?"}
              {confirm?.kind === "hide" && "Hide this review from public display?"}
              {confirm?.kind === "feature" && "Feature this review on the homepage?"}
              {confirm?.kind === "unfeature" && "Remove this review from homepage featured placement?"}
              {confirm?.kind === "retention" &&
                confirm.decision === "renew" &&
                "Renew public display for another 12 months?"}
              {confirm?.kind === "retention" &&
                confirm.decision === "hide" &&
                "Hide this public review after annual review?"}
              {confirm?.kind === "retention" &&
                confirm.decision === "archive_anonymize" &&
                "Archive and anonymize public display fields? Private feedback history is preserved."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-slate-900"
              disabled={pubAction.isPending}
              onClick={() => confirm && pubAction.mutate(confirm)}
            >
              {pubAction.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
