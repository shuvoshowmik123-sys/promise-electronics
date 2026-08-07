import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Phone, Wrench } from "lucide-react";
import { customerRepairJourneysApi } from "@/lib/api";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";

/**
 * Why a television could not be repaired, told to the person who owns it.
 *
 * The portal was blind to this. A TV could be declared not-repairable, a
 * decision recorded on the customer's behalf, and none of it ever appeared in
 * their account — so every explanation happened by phone. That is slow for the
 * shop and anxious for the customer, who knows something is wrong and has to
 * ring to find out what.
 *
 * WHAT IS DELIBERATELY NOT SHOWN
 *
 * The technician's technical notes, the parts snapshot and the evidence
 * photographs are an internal engineering record. Repeated to a customer they
 * read as either jargon or excuse-making, and they invite an argument about
 * diagnosis rather than a decision about what to do next. Three things are
 * shown instead: what was found, what was decided, and what happens now.
 *
 * TONE
 *
 * A customer reading this has just learned their television may be beyond
 * repair. The panel states facts and then says who is going to call them. It
 * does not apologise repeatedly, does not use alarm colours, and never asks
 * them to take an action the shop is about to take for them.
 *
 * Renders nothing when there is nothing to explain — which is most repairs. A
 * permanent "no problems found" box would train people to ignore the one that
 * matters.
 */
export function NgExplanationCard({ jobId }: { jobId: string | null | undefined }) {
    const { t } = useCustomerLanguage();

    const { data } = useQuery({
        queryKey: ["customer-ng", jobId],
        queryFn: () => customerRepairJourneysApi.getNg(jobId as string),
        enabled: Boolean(jobId),
        // A diagnosis does not change minute to minute, and this sits on a
        // screen customers refresh anxiously.
        staleTime: 5 * 60 * 1000,
        retry: false,
    });

    const ng = data?.ng;
    if (!ng) return null;

    const decisionLabel = (() => {
        switch (ng.decisionType) {
            case "replacement": return t("ng.decision.replacement");
            case "repair_alternative": return t("ng.decision.repair_alternative");
            case "quote_required": return t("ng.decision.quote_required");
            case "decline": return t("ng.decision.decline");
            default: return null;
        }
    })();

    return (
        <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
            <div className="flex items-start gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                    <AlertCircle className="h-4 w-4 text-amber-700" />
                </span>
                <div className="min-w-0">
                    <p className="text-sm font-black text-slate-950">{t("ng.title")}</p>
                    {ng.device && (
                        <p className="text-[11px] font-medium text-slate-500">{ng.device}</p>
                    )}
                </div>
            </div>

            <div className="mt-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    {t("ng.whatWeFound")}
                </p>
                <p className="mt-1 text-[13px] font-medium leading-5 text-slate-700">{ng.diagnosis}</p>
            </div>

            {decisionLabel && (
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1">
                    <Wrench className="h-3.5 w-3.5 text-emerald-700" />
                    <span className="text-[11px] font-bold text-emerald-700">{decisionLabel}</span>
                </div>
            )}

            <div className="mt-3 rounded-xl bg-white/80 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    {t("ng.whatNext")}
                </p>
                <p className="mt-1 text-[13px] font-medium leading-5 text-slate-700">
                    {ng.awaitingDecision ? t("ng.awaiting") : t("ng.decided")}
                </p>
                {/*
                  * The escape hatch, stated plainly. Anything beyond "what was
                  * found and what happens next" is a conversation, and pointing
                  * at it here is what keeps this panel short.
                  */}
                <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                    <Phone className="h-3.5 w-3.5" />
                    {t("ng.callUs")}
                </p>
            </div>
        </div>
    );
}
