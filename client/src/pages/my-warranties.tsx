import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useCustomerLanguage, type TranslationKey } from "@/contexts/CustomerLanguageContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { customerWarrantiesApi, type WarrantyInfo } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { QueryErrorState } from "@/components/customer/QueryErrorState";
import { PillButton, SectionEyebrow, StatusChip, RefBadge } from "@/components/customer/mobile-kit";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  ShieldCheck,
  ShieldX,
  Wrench,
  Cpu,
  Calendar,
  Loader2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";

type WarrantyClaimType = "service" | "parts";
type WarrantyClaimTarget = { warranty: WarrantyInfo; claimType: WarrantyClaimType };

function formatWarrantyRef(jobId: string) {
  return jobId.length > 14 ? jobId.slice(0, 8) + "..." : jobId;
}

function warrantyStatusLabel(active: boolean, t: (key: TranslationKey) => string) {
  return active ? t("status.active") : t("status.cancelled");
}

function WarrantyClaimSheet({
  target,
  onClose,
  onSubmit,
  busy,
}: {
  target: WarrantyClaimTarget | null;
  onClose: () => void;
  onSubmit: (data: { claimType: WarrantyClaimType; issueDescription: string }) => void;
  busy: boolean;
}) {
  const { t } = useCustomerLanguage();
  const [claimType, setClaimType] = useState<WarrantyClaimType>("service");
  const [issueDescription, setIssueDescription] = useState("");

  useEffect(() => {
    if (target) {
      setClaimType(target.claimType);
      setIssueDescription("");
    }
  }, [target]);

  if (!target) return null;

  const hasServiceWarranty = target.warranty.serviceWarranty.isActive;
  const hasPartsWarranty = target.warranty.partsWarranty.isActive;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!issueDescription.trim()) return;
    onSubmit({ claimType, issueDescription: issueDescription.trim() });
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/45 backdrop-blur-sm">
      <button type="button" className="absolute inset-0" aria-label={t("journey.cancel")} onClick={onClose} />
      <form
        onSubmit={submit}
        className="absolute inset-x-0 bottom-0 mx-auto max-h-[88dvh] max-w-[560px] overflow-y-auto rounded-t-[2rem] bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl md:inset-0 md:my-auto md:h-fit md:rounded-[2rem] md:border md:border-emerald-100"
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-emerald-100 md:hidden" />
        <SectionEyebrow>{t("warranties.claimTitle")}</SectionEyebrow>
        <h2 className="mt-2 text-2xl font-black text-slate-950">{target.warranty.device}</h2>
        <RefBadge className="mt-3">{formatWarrantyRef(target.warranty.jobId)}</RefBadge>

        <label className="mt-5 block">
          <span className="text-xs font-black uppercase tracking-wide text-slate-500">{t("warranties.claimType")}</span>
          <select
            value={claimType}
            onChange={(event) => setClaimType(event.target.value as WarrantyClaimType)}
            className="mt-2 h-12 w-full rounded-2xl border border-emerald-100 bg-white px-3 text-sm font-bold text-slate-800"
          >
            {hasServiceWarranty && <option value="service">{t("warranties.service")}</option>}
            {hasPartsWarranty && <option value="parts">{t("warranties.parts")}</option>}
          </select>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            {claimType === "service" ? t("warranties.serviceHelp") : t("warranties.partsHelp")}
          </p>
        </label>

        <label className="mt-4 block">
          <span className="text-xs font-black uppercase tracking-wide text-slate-500">{t("warranties.issue")}</span>
          <textarea
            value={issueDescription}
            onChange={(event) => setIssueDescription(event.target.value)}
            placeholder={t("warranties.issuePlaceholder")}
            className="mt-2 min-h-32 w-full rounded-2xl border border-emerald-100 bg-emerald-50/40 px-3 py-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
          />
        </label>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onClose} className="h-12 rounded-2xl border border-slate-200 text-sm font-black text-slate-600">
            {t("journey.cancel")}
          </button>
          <PillButton disabled={busy || !issueDescription.trim()}>{t("warranties.submitClaim")}</PillButton>
        </div>
      </form>
    </div>
  );
}

function WarrantyCard({ warranty, onClaim }: { warranty: WarrantyInfo; onClaim: (claimType: WarrantyClaimType) => void }) {
  const { t } = useCustomerLanguage();
  const hasServiceWarranty = warranty.serviceWarranty.days > 0;
  const hasPartsWarranty = warranty.partsWarranty.days > 0;

  return (
    <Card className="hover:shadow-md transition-all" data-testid={`card-warranty-${warranty.jobId}`}>
      <CardContent className="p-4 md:p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <Shield className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-semibold text-lg" data-testid={`text-device-${warranty.jobId}`}>{warranty.device}</h3>
              <p className="text-sm text-muted-foreground">Job ID: {formatWarrantyRef(warranty.jobId)}</p>
            </div>
          </div>
        </div>

        <div className="text-sm text-muted-foreground mb-4">
          <p className="line-clamp-2">{warranty.issue}</p>
          {warranty.completedAt && (
            <p className="mt-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Completed: {format(new Date(warranty.completedAt), "dd MMM yyyy")}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {hasServiceWarranty && (
            <div className={`p-4 rounded-lg border ${warranty.serviceWarranty.isActive ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Wrench className={`w-4 h-4 ${warranty.serviceWarranty.isActive ? 'text-green-600' : 'text-red-600'}`} />
                <span className="font-medium">{t("warranties.service")}</span>
              </div>
              <div className="flex items-center gap-2">
                {warranty.serviceWarranty.isActive ? (
                  <ShieldCheck className="w-5 h-5 text-green-600" />
                ) : (
                  <ShieldX className="w-5 h-5 text-red-600" />
                )}
                <Badge
                  variant={warranty.serviceWarranty.isActive ? "default" : "destructive"}
                  className={warranty.serviceWarranty.isActive ? "bg-green-600" : ""}
                  data-testid={`badge-service-warranty-${warranty.jobId}`}
                >
                  {warrantyStatusLabel(warranty.serviceWarranty.isActive, t)}
                </Badge>
              </div>
              <div className="mt-2 text-sm">
                <p className="text-muted-foreground">
                  {warranty.serviceWarranty.days} days warranty
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("warranties.serviceHelp")}</p>
                {warranty.serviceWarranty.expiryDate && (
                  <p className="flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3" />
                    {warranty.serviceWarranty.isActive ? (
                      <span className="text-green-700 font-medium">
                        {warranty.serviceWarranty.remainingDays} {t("warranties.daysLeft")}
                      </span>
                    ) : (
                      <span className="text-red-600">
                        {t("warranties.expiredOn")} {format(new Date(warranty.serviceWarranty.expiryDate), "dd MMM yyyy")}
                      </span>
                    )}
                  </p>
                )}
              </div>
              {warranty.serviceWarranty.isActive && (
                <button type="button" onClick={() => onClaim("service")} className="mt-3 h-10 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white shadow-sm shadow-emerald-100">
                  {t("warranties.apply")}
                </button>
              )}
            </div>
          )}

          {hasPartsWarranty && (
            <div className={`p-4 rounded-lg border ${warranty.partsWarranty.isActive ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Cpu className={`w-4 h-4 ${warranty.partsWarranty.isActive ? 'text-green-600' : 'text-red-600'}`} />
                <span className="font-medium">{t("warranties.parts")}</span>
              </div>
              <div className="flex items-center gap-2">
                {warranty.partsWarranty.isActive ? (
                  <ShieldCheck className="w-5 h-5 text-green-600" />
                ) : (
                  <ShieldX className="w-5 h-5 text-red-600" />
                )}
                <Badge
                  variant={warranty.partsWarranty.isActive ? "default" : "destructive"}
                  className={warranty.partsWarranty.isActive ? "bg-green-600" : ""}
                  data-testid={`badge-parts-warranty-${warranty.jobId}`}
                >
                  {warrantyStatusLabel(warranty.partsWarranty.isActive, t)}
                </Badge>
              </div>
              <div className="mt-2 text-sm">
                <p className="text-muted-foreground">
                  {warranty.partsWarranty.days >= 365
                    ? `${Math.floor(warranty.partsWarranty.days / 365)} year warranty`
                    : `${warranty.partsWarranty.days} days warranty`
                  }
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{t("warranties.partsHelp")}</p>
                {warranty.partsWarranty.expiryDate && (
                  <p className="flex items-center gap-1 mt-1">
                    <Clock className="w-3 h-3" />
                    {warranty.partsWarranty.isActive ? (
                      <span className="text-green-700 font-medium">
                        {warranty.partsWarranty.remainingDays} {t("warranties.daysLeft")}
                      </span>
                    ) : (
                      <span className="text-red-600">
                        {t("warranties.expiredOn")} {format(new Date(warranty.partsWarranty.expiryDate), "dd MMM yyyy")}
                      </span>
                    )}
                  </p>
                )}
              </div>
              {warranty.partsWarranty.isActive && (
                <button type="button" onClick={() => onClaim("parts")} className="mt-3 h-10 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white shadow-sm shadow-emerald-100">
                  {t("warranties.apply")}
                </button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MobileWarrantyCard({ warranty, onClaim }: { warranty: WarrantyInfo; onClaim: (claimType: WarrantyClaimType) => void }) {
  const { t } = useCustomerLanguage();
  const isActive = warranty.serviceWarranty.isActive || warranty.partsWarranty.isActive;
  const hasServiceWarranty = warranty.serviceWarranty.days > 0;
  const hasPartsWarranty = warranty.partsWarranty.days > 0;

  return (
    <div
      className="rounded-3xl bg-white p-4 shadow-sm"
      data-testid={`mobile-card-warranty-${warranty.jobId}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-50">
          <Shield className="h-6 w-6 text-emerald-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3
              className="truncate font-semibold text-slate-900"
              data-testid={`mobile-text-device-${warranty.jobId}`}
            >
              {warranty.device}
            </h3>
            <span data-testid={`mobile-chip-status-${warranty.jobId}`}>
              <StatusChip tone={isActive ? "live" : "neutral"}>
                {warrantyStatusLabel(isActive, t)}
              </StatusChip>
            </span>
          </div>
          <span data-testid={`mobile-ref-${warranty.jobId}`}>
            <RefBadge>{formatWarrantyRef(warranty.jobId)}</RefBadge>
          </span>
          <p
            className="mt-1 line-clamp-2 text-sm text-slate-500"
            data-testid={`mobile-text-issue-${warranty.jobId}`}
          >
            {warranty.issue}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {hasServiceWarranty && (
          <div
            className="flex items-center justify-between rounded-xl bg-slate-50 p-3"
            data-testid={`mobile-row-service-${warranty.jobId}`}
          >
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-slate-500" />
              <div>
                <span className="text-sm font-medium text-slate-700">{t("warranties.service")}</span>
                <p className="text-[11px] leading-4 text-slate-400">{t("warranties.serviceHelp")}</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-slate-600">
              {warranty.serviceWarranty.isActive
                ? `${warranty.serviceWarranty.remainingDays} ${t("warranties.daysLeft")}`
                : warranty.serviceWarranty.expiryDate
                  ? `${t("warranties.expiredOn")} ${format(new Date(warranty.serviceWarranty.expiryDate), "dd MMM yyyy")}`
                  : t("status.cancelled")}
            </span>
          </div>
        )}
        {hasPartsWarranty && (
          <div
            className="flex items-center justify-between rounded-xl bg-slate-50 p-3"
            data-testid={`mobile-row-parts-${warranty.jobId}`}
          >
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-slate-500" />
              <div>
                <span className="text-sm font-medium text-slate-700">{t("warranties.parts")}</span>
                <p className="text-[11px] leading-4 text-slate-400">{t("warranties.partsHelp")}</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-slate-600">
              {warranty.partsWarranty.isActive
                ? `${warranty.partsWarranty.remainingDays} ${t("warranties.daysLeft")}`
                : warranty.partsWarranty.expiryDate
                  ? `${t("warranties.expiredOn")} ${format(new Date(warranty.partsWarranty.expiryDate), "dd MMM yyyy")}`
                  : t("status.cancelled")}
            </span>
          </div>
        )}
      </div>
      {isActive && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {warranty.serviceWarranty.isActive && (
            <button type="button" onClick={() => onClaim("service")} className="h-11 rounded-2xl bg-emerald-600 px-3 text-xs font-black text-white shadow-sm shadow-emerald-100">
              {t("warranties.service")}
            </button>
          )}
          {warranty.partsWarranty.isActive && (
            <button type="button" onClick={() => onClaim("parts")} className="h-11 rounded-2xl bg-emerald-600 px-3 text-xs font-black text-white shadow-sm shadow-emerald-100">
              {t("warranties.parts")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function MyWarrantiesPage() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useCustomerAuth();
  const { t } = useCustomerLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [claimTarget, setClaimTarget] = useState<WarrantyClaimTarget | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, authLoading, setLocation]);

  const { data: warranties = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["customer-warranties"],
    queryFn: customerWarrantiesApi.getAll,
    enabled: isAuthenticated,
  });

  const claimMutation = useMutation({
    mutationFn: (data: { jobId: string; claimType: WarrantyClaimType; issueDescription: string }) =>
      customerWarrantiesApi.claim(data.jobId, { claimType: data.claimType, issueDescription: data.issueDescription }),
    onSuccess: () => {
      toast({ title: t("warranties.claimSubmitted") });
      setClaimTarget(null);
      queryClient.invalidateQueries({ queryKey: ["customer-warranties"] });
      queryClient.invalidateQueries({ queryKey: ["customerRepairJourneys"] });
    },
  });

  if (authLoading) {
    return (
      <>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const activeWarranties = warranties.filter(w => w.serviceWarranty.isActive || w.partsWarranty.isActive);
  const expiredWarranties = warranties.filter(w => !w.serviceWarranty.isActive && !w.partsWarranty.isActive);

  return (
    <>
      <div className="container mx-auto px-4 py-6 md:py-8 hidden md:block">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-page-title">{t("warranties.title")}</h1>
              <p className="text-muted-foreground">{t("warranties.subtitle")}</p>
            </div>
          </div>

          {isError ? (
            <div className="py-12">
              <QueryErrorState message="Failed to load your warranties" onRetry={() => refetch()} />
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : warranties.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <Shield className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-2">{t("warranties.none")}</h3>
                <p className="text-muted-foreground">
                  {t("warranties.noneDesc")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-8">
              {activeWarranties.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-green-600" />
                    {t("warranties.active")} ({activeWarranties.length})
                  </h2>
                  <div className="grid gap-4">
                    {activeWarranties.map((warranty) => (
                      <WarrantyCard key={warranty.jobId} warranty={warranty} onClaim={(claimType) => setClaimTarget({ warranty, claimType })} />
                    ))}
                  </div>
                </div>
              )}

              {expiredWarranties.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <ShieldX className="w-5 h-5 text-red-600" />
                    {t("warranties.expired")} ({expiredWarranties.length})
                  </h2>
                  <div className="grid gap-4 opacity-75">
                    {expiredWarranties.map((warranty) => (
                      <WarrantyCard key={warranty.jobId} warranty={warranty} onClaim={(claimType) => setClaimTarget({ warranty, claimType })} />
                    ))}
                  </div>
                </div>
              )}

              <Card className="bg-emerald-50 border-emerald-200">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-emerald-800 mb-1">{t("warranties.terms")}</p>
                      <p className="text-emerald-700">{t("warranties.termsDesc")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </motion.div>
      </div>

      <div className="md:hidden px-4 py-5 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-4"
        >
          <div className="flex items-center gap-3" data-testid="mobile-page-header">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
              <Shield className="h-5 w-5 text-emerald-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-900" data-testid="mobile-text-page-title">{t("warranties.title")}</h1>
          </div>

          {isError ? (
            <div className="py-8" data-testid="mobile-error-state">
              <QueryErrorState
                compact
                message="Failed to load your warranties"
                onRetry={() => refetch()}
                showHomeLink={false}
              />
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-16" data-testid="mobile-loading-state">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : warranties.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center rounded-3xl bg-white p-10 text-center shadow-sm"
              data-testid="mobile-empty-state"
            >
              <Shield className="h-14 w-14 text-slate-300" />
              <h3 className="mt-4 font-semibold text-slate-900">{t("warranties.none")}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {t("warranties.noneDesc")}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {activeWarranties.length > 0 && (
                <div className="space-y-3" data-testid="mobile-active-group">
                  <div data-testid="mobile-active-eyebrow">
                    <SectionEyebrow tone="teal">{t("warranties.active")} ({activeWarranties.length})</SectionEyebrow>
                  </div>
                  <div className="space-y-3">
                    {activeWarranties.map((warranty) => (
                      <MobileWarrantyCard key={warranty.jobId} warranty={warranty} onClaim={(claimType) => setClaimTarget({ warranty, claimType })} />
                    ))}
                  </div>
                </div>
              )}

              {expiredWarranties.length > 0 && (
                <div className="space-y-3" data-testid="mobile-expired-group">
                  <div data-testid="mobile-expired-eyebrow">
                    <SectionEyebrow tone="slate">{t("warranties.expired")} ({expiredWarranties.length})</SectionEyebrow>
                  </div>
                  <div className="space-y-3">
                    {expiredWarranties.map((warranty) => (
                      <MobileWarrantyCard key={warranty.jobId} warranty={warranty} onClaim={(claimType) => setClaimTarget({ warranty, claimType })} />
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-2xl bg-emerald-50 p-4" data-testid="mobile-warranty-terms">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                  <div className="text-xs text-emerald-700">
                    <p className="font-semibold text-emerald-800">{t("warranties.terms")}</p>
                    <p className="mt-0.5">{t("warranties.termsDesc")}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      <WarrantyClaimSheet
        target={claimTarget}
        busy={claimMutation.isPending}
        onClose={() => setClaimTarget(null)}
        onSubmit={(data) => {
          if (!claimTarget) return;
          claimMutation.mutate({ jobId: claimTarget.warranty.jobId, ...data });
        }}
      />
    </>
  );
}
