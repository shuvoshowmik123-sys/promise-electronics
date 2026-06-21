import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ChevronRight, Clock3, FileText, Wrench } from "lucide-react";
import { customerRepairJourneysApi, type CustomerRepairJourney } from "@/lib/api/customerApi";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";
import { PillButton, RefBadge, SectionEyebrow, SegmentedToggle, StatusChip, toneForStatus } from "@/components/customer/mobile-kit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatJourneyRef, labelJourneyFriendly, labelJourneyStage, labelJourneyStatus, labelNextAction, labelServiceMode } from "@/lib/customerRepairJourneyLabels";

type Filter = "active" | "quotes" | "done" | "all";

function formatDate(value?: string | null) {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function filterJourney(journey: CustomerRepairJourney, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "quotes") return journey.currentStage.includes("quote");
  if (filter === "done") return ["delivered", "cancelled", "repair_completed"].includes(journey.currentStage);
  return !["delivered", "cancelled"].includes(journey.currentStage);
}

function JourneyCard({ journey, onOpen }: { journey: CustomerRepairJourney; onOpen: () => void }) {
  const { t, language } = useCustomerLanguage();
  const stageLabel = labelJourneyStage(journey.currentStage, t);
  const friendlyLabel = labelJourneyFriendly(journey.currentStage, journey.customerFriendlyStatus, t);
  const statusLabel = labelJourneyStatus(journey.currentStatus, stageLabel, t);
  const serviceModeLabel = labelServiceMode(journey.serviceMode, t);
  const nextActionLabel = labelNextAction(journey.nextAction, journey.nextActionLabel, t, language);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-[1.75rem] border border-emerald-100 bg-white p-4 text-left shadow-sm shadow-emerald-50 transition active:scale-[0.99]"
      data-testid={"button-open-journey-" + journey.id}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <RefBadge>{formatJourneyRef(journey)}</RefBadge>
          <h3 className="mt-2 line-clamp-2 text-lg font-black text-slate-950">{stageLabel}</h3>
        </div>
        <StatusChip tone={toneForStatus(journey.currentStage)}>{statusLabel}</StatusChip>
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-500">{friendlyLabel}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold text-slate-500">
        <span className="inline-flex items-center gap-1 rounded-2xl bg-slate-50 px-3 py-2">
          <Clock3 className="h-3.5 w-3.5 text-emerald-600" />
          {formatDate(journey.updatedAt)}
        </span>
        <span className="inline-flex items-center gap-1 rounded-2xl bg-slate-50 px-3 py-2">
          <CalendarClock className="h-3.5 w-3.5 text-emerald-600" />
          {serviceModeLabel}
        </span>
      </div>
      {(journey.nextAction || journey.nextActionLabel) && (
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700">
          <span>{nextActionLabel}</span>
          <ChevronRight className="h-4 w-4" />
        </div>
      )}
    </button>
  );
}

export default function MyRepairsPage() {
  const [, setLocation] = useLocation();
  const { t, language } = useCustomerLanguage();
  const [filter, setFilter] = useState<Filter>("active");
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["customerRepairJourneys"],
    queryFn: customerRepairJourneysApi.getAll,
  });

  const journeys = useMemo(() => data.filter((journey) => filterJourney(journey, filter)), [data, filter]);
  const selected = journeys[0] || data[0] || null;

  const filterOptions = [
    { value: "active" as const, label: t("track.repairs") },
    { value: "quotes" as const, label: t("track.quotes") },
    { value: "done" as const, label: t("profile.completed") },
    { value: "all" as const, label: t("track.all") },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white px-4 pb-28 pt-[calc(env(safe-area-inset-top)+20px)] md:px-8 md:py-10">
        <div className="mx-auto max-w-[560px] space-y-3 md:max-w-6xl">
          <Skeleton className="h-36 rounded-[2rem]" />
          <Skeleton className="h-24 rounded-[1.5rem]" />
          <Skeleton className="h-24 rounded-[1.5rem]" />
        </div>
      </div>
    );
  }

  return (
    <>
      <main className="md:hidden min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white px-4 pb-28 pt-[calc(env(safe-area-inset-top)+20px)]">
        <div className="mx-auto max-w-[560px] space-y-4">
          <section className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-emerald-900 to-emerald-600 p-5 text-white shadow-xl shadow-emerald-100">
            <SectionEyebrow className="text-emerald-100">{t("journey.title")}</SectionEyebrow>
            <h1 className="mt-2 text-3xl font-black tracking-tight">{t("journey.title")}</h1>
            <p className="mt-2 text-sm leading-6 text-emerald-50/90">{t("journey.subtitle")}</p>
          </section>

          <SegmentedToggle value={filter} onChange={setFilter} options={filterOptions} />

          {isError ? (
            <div className="rounded-[1.75rem] border border-rose-100 bg-white p-5 text-center">
              <p className="text-sm font-bold text-slate-700">{t("track.orderNotFoundDesc")}</p>
              <PillButton className="mt-4" onClick={() => refetch()}>{t("track.tryAgain")}</PillButton>
            </div>
          ) : journeys.length === 0 ? (
            <div className="rounded-[1.75rem] border border-emerald-100 bg-white p-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600">
                <Wrench className="h-8 w-8" />
              </div>
              <h2 className="mt-4 text-xl font-black text-slate-950">{t("journey.empty")}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{t("journey.emptyDesc")}</p>
              <Link href="/repair">
                <PillButton className="mt-5">{t("journey.startRepair")}</PillButton>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {journeys.map((journey) => (
                <JourneyCard key={journey.id} journey={journey} onOpen={() => setLocation("/my-repairs/" + journey.id)} />
              ))}
            </div>
          )}
        </div>
      </main>

      <main className="hidden min-h-screen bg-slate-50 px-8 py-10 md:block">
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_380px] gap-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <SectionEyebrow>{t("journey.title")}</SectionEyebrow>
                <h1 className="mt-2 text-3xl font-black text-slate-950">{t("journey.title")}</h1>
              </div>
              <Button onClick={() => setLocation("/repair")} className="rounded-full bg-emerald-600 hover:bg-emerald-700">
                {t("journey.startRepair")}
              </Button>
            </div>
            <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t("common.details")}</th>
                    <th className="px-4 py-3">{t("journey.status")}</th>
                    <th className="px-4 py-3">{t("journey.nextAction")}</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((journey) => {
                    const stageLabel = labelJourneyStage(journey.currentStage, t);
                    return (
                      <tr key={journey.id} className="border-t border-slate-100">
                        <td className="px-4 py-4">
                          <RefBadge>{formatJourneyRef(journey)}</RefBadge>
                          <div className="mt-1 font-bold text-slate-900">{stageLabel}</div>
                        </td>
                        <td className="px-4 py-4"><StatusChip tone={toneForStatus(journey.currentStage)}>{labelJourneyStatus(journey.currentStatus, stageLabel, t)}</StatusChip></td>
                        <td className="px-4 py-4 text-slate-500">{labelNextAction(journey.nextAction, journey.nextActionLabel, t, language)}</td>
                        <td className="px-4 py-4 text-right">
                          <Button variant="outline" className="rounded-full" onClick={() => setLocation("/my-repairs/" + journey.id)}>
                            {t("journey.open")}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            {selected ? (
              <div>
                <FileText className="h-8 w-8 text-emerald-600" />
                <h2 className="mt-4 text-2xl font-black text-slate-950">{labelJourneyStage(selected.currentStage, t)}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-500">{labelJourneyFriendly(selected.currentStage, selected.customerFriendlyStatus, t)}</p>
                <Button className="mt-6 w-full rounded-full bg-emerald-600 hover:bg-emerald-700" onClick={() => setLocation("/my-repairs/" + selected.id)}>
                  {t("journey.details")}
                </Button>
              </div>
            ) : (
              <div className="text-center text-sm text-slate-500">{t("journey.empty")}</div>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}
