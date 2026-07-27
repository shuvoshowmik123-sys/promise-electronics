/**
 * CUSTOMER-FEEDBACK-01B — calm post-Delivered feedback prompt.
 * Uses customer service-feedback APIs only; never shows IDs/serials/staff data.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MessageSquareHeart, Star } from "lucide-react";
import {
  customerServiceFeedbackApi,
  ServiceFeedbackQueryKeys,
  type CustomerFeedbackOpportunity,
} from "@/lib/api/serviceFeedbackApi";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";
import { PillButton, SectionEyebrow } from "@/components/customer/mobile-kit";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ApiError } from "@/lib/api/httpClient";

function StarPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-50"
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          aria-pressed={value === n}
        >
          <Star
            className={`h-7 w-7 ${value >= n ? "fill-amber-400 text-amber-400" : "text-slate-300"}`}
          />
        </button>
      ))}
    </div>
  );
}

function matchOpportunity(
  items: CustomerFeedbackOpportunity[],
  ticketNumber: string | null | undefined,
  deviceLabel: string | null | undefined,
): CustomerFeedbackOpportunity | null {
  if (!items.length) return null;
  const ticket = (ticketNumber || "").trim();
  if (ticket) {
    const byTicket = items.find((i) => (i.ticketNumber || "").trim() === ticket);
    if (byTicket) return byTicket;
  }
  const device = (deviceLabel || "").trim().toLowerCase();
  if (device) {
    const byDevice = items.find((i) => (i.deviceLabel || "").trim().toLowerCase() === device);
    if (byDevice) return byDevice;
  }
  // Single open opportunity for this customer is a safe fallback when ticket not yet linked.
  const actionable = items.filter((i) => i.canSubmit || i.canReplace || i.status === "submitted");
  if (actionable.length === 1) return actionable[0];
  return null;
}

export function ServiceFeedbackCard({
  ticketNumber,
  deviceLabel,
}: {
  ticketNumber?: string | null;
  deviceLabel?: string | null;
}) {
  const { t } = useCustomerLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [publicConsent, setPublicConsent] = useState(false);

  const listQuery = useQuery({
    queryKey: ServiceFeedbackQueryKeys.customerList(),
    queryFn: () => customerServiceFeedbackApi.list(),
  });

  const opportunity = useMemo(
    () => matchOpportunity(listQuery.data?.items || [], ticketNumber, deviceLabel),
    [listQuery.data?.items, ticketNumber, deviceLabel],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ServiceFeedbackQueryKeys.customerList() });
    if (opportunity?.id) {
      queryClient.invalidateQueries({ queryKey: ServiceFeedbackQueryKeys.customerOne(opportunity.id) });
    }
  };

  const submit = useMutation({
    mutationFn: () => {
      if (!opportunity) throw new Error("No opportunity");
      return customerServiceFeedbackApi.submit(opportunity.id, {
        rating,
        comment: comment.trim() || null,
        publicConsent,
      });
    },
    onSuccess: () => {
      toast({ title: t("feedback.thankYou") });
      setRating(0);
      setComment("");
      setPublicConsent(false);
      invalidate();
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof ApiError
          ? err.message
          : t("feedback.submitFailed");
      toast({ title: msg });
    },
  });

  const withdraw = useMutation({
    mutationFn: () => {
      if (!opportunity) throw new Error("No opportunity");
      return customerServiceFeedbackApi.withdrawConsent(opportunity.id);
    },
    onSuccess: () => {
      toast({ title: t("feedback.consentWithdrawn") });
      invalidate();
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof ApiError ? err.message : t("feedback.withdrawFailed");
      toast({ title: msg });
    },
  });

  if (listQuery.isLoading || !opportunity) return null;

  const submitted = opportunity.status === "submitted" && opportunity.current;
  const canEdit = opportunity.canSubmit || opportunity.canReplace;

  if (!canEdit && !submitted) return null;

  return (
    <section
      className="rounded-[1.75rem] border border-emerald-100 bg-white p-4 shadow-sm shadow-emerald-50"
      data-testid="service-feedback-card"
    >
      <SectionEyebrow>
        <MessageSquareHeart className="mr-1 inline h-3.5 w-3.5" />
        {t("feedback.title")}
      </SectionEyebrow>
      <p className="mt-2 text-sm leading-6 text-slate-600">{t("feedback.intro")}</p>

      {submitted && !canEdit && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {t("feedback.submitted")}
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={`h-5 w-5 ${
                  (opportunity.current?.rating || 0) >= n
                    ? "fill-amber-400 text-amber-400"
                    : "text-slate-200"
                }`}
              />
            ))}
          </div>
          {opportunity.current?.comment ? (
            <p className="text-sm italic leading-6 text-slate-600">"{opportunity.current.comment}"</p>
          ) : null}
          {opportunity.publicConsent ? (
            <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-600">{t("feedback.publicOn")}</p>
              <PillButton
                type="button"
                disabled={withdraw.isPending}
                onClick={() => withdraw.mutate()}
                className="!bg-white !text-slate-800 border border-slate-200"
              >
                {t("feedback.withdrawConsent")}
              </PillButton>
            </div>
          ) : (
            <p className="text-xs font-semibold text-slate-500">{t("feedback.publicOff")}</p>
          )}
        </div>
      )}

      {canEdit && (
        <div className="mt-4 space-y-4">
          {submitted && (
            <p className="text-xs font-bold text-emerald-700">{t("feedback.canUpdate")}</p>
          )}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              {t("feedback.rating")}
            </p>
            <StarPicker value={rating} onChange={setRating} disabled={submit.isPending} />
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {t("feedback.commentOptional")}
            </span>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={2000}
              disabled={submit.isPending}
              placeholder={t("feedback.commentPlaceholder")}
              className="min-h-24 rounded-2xl border-emerald-100"
            />
          </label>
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">{t("feedback.consentLabel")}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{t("feedback.consentHelp")}</p>
            </div>
            <Switch
              checked={publicConsent}
              onCheckedChange={setPublicConsent}
              disabled={submit.isPending}
              aria-label={t("feedback.consentLabel")}
            />
          </div>
          <PillButton
            type="button"
            disabled={submit.isPending || rating < 1}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? t("feedback.sending") : t("feedback.submit")}
          </PillButton>
        </div>
      )}
    </section>
  );
}
