import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ChevronRight, Clock3, Monitor, Wrench } from "lucide-react";
import { customerRepairJourneysApi, type CustomerRepairJourneyEnriched } from "@/lib/api/customerApi";
import { useCustomerLanguage } from "@/contexts/CustomerLanguageContext";
import { PillButton, RefBadge, SectionEyebrow, SegmentedToggle, StatusChip, toneForStatus } from "@/components/customer/mobile-kit";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  labelServiceMode,
  presentCustomerJourney,
  safeCustomerTicketRef,
} from "@/lib/customerRepairJourneyLabels";

type Filter = "active" | "quotes" | "done" | "all";

function formatDate(value?: string | null) {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function filterJourney(journey: CustomerRepairJourneyEnriched, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "quotes") return journey.currentStage.includes("quote");
  if (filter === "done") return ["delivered", "cancelled"].includes(journey.currentStage);
  return !["delivered", "cancelled"].includes(journey.currentStage);
}

function deviceLabel(journey: CustomerRepairJourneyEnriched): string {
  const parts = [journey.deviceBrand, journey.deviceModel].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return "Repair request";
}

function JourneyCard({ journey, onOpen }: { journey: CustomerRepairJourneyEnriched; onOpen: () => void }) {
  const { t } = useCustomerLanguage();
  const presentation = presentCustomerJourney(journey, t);
  const serviceModeLabel = labelServiceMode(journey.serviceMode, t);
  const device = deviceLabel(journey);
  const ref = safeCustomerTicketRef(journey);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-[1.75rem] border border-emerald-100 bg-white p-4 text-left shadow-sm shadow-emerald-50 transition active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 shrink-0 text-emerald-600" />
            <h3 className="truncate text-base font-black text-slate-950">{device}</h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-400">
            {ref ? <RefBadge>{ref}</RefBadge> : null}
            {journey.screenSize && <span>{journey.screenSize}&quot;</span>}
          </div>
        </div>
        <StatusChip tone={toneForStatus(presentation.toneStage)}>{presentation.title}</StatusChip>
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-500">{presentation.explanation}</p>
      {presentation.reassurance && (
        <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-amber-700">{presentation.reassurance}</p>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 text-xs font-bold text-slate-500">
        <span className="inline-flex min-w-0 items-center gap-1">
          <Clock3 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span className="truncate">
            {journey.lastEventTitle && !/JOB-|serial|estimate/i.test(journey.lastEventTitle)
              ? `${journey.lastEventTitle} · ${formatDate(journey.lastEventAt)}`
              : formatDate(journey.updatedAt)}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-slate-400">
          <CalendarClock className="h-3.5 w-3.5" />
          {serviceModeLabel}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700">
        <span className="line-clamp-1">{presentation.nextLine}</span>
        <ChevronRight className="h-4 w-4 shrink-0" />
      </div>
    </button>
  );
}

export default function MyRepairsPage() {
  const [, setLocation] = useLocation();
  const { t } = useCustomerLanguage();
  const [filter, setFilter] = useState<Filter>("active");
  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["customerRepairJourneys"],
    queryFn: customerRepairJourneysApi.getAll,
  });

  const journeys = useMemo(() => data.filter((journey) => filterJourney(journey, filter)), [data, filter]);

  /**
   * Land the customer on their handover code, not on a list.
   *
   * The custody notification links to
   * /my-repairs?order=<ticket>&type=service&issuance=<id>, and this page ignored
   * every one of those parameters — worse, it does not render HandoverCodeCard
   * at all. That card lives on the DETAIL page. So a customer tapping "Handover
   * code ready" arrived at a list, with a driver standing in front of them, and
   * had to work out which repair to open.
   *
   * Matched here rather than by changing the link, because the link format is
   * reproduced and compared server-side (customer.routes.ts builds an
   * expectedLink from the same helper); altering it would break that matcher.
   *
   * `order` is ticketNumber-or-id, so both are accepted. Replace rather than
   * push, so Back returns to wherever they came from instead of bouncing them
   * into this redirect again.
   */
  useEffect(() => {
    if (!data.length) return;
    const params = new URLSearchParams(window.location.search);
    const order = params.get("order");
    if (!order) return;

    const match = data.find(
      (j) => j.srTicketNumber === order || j.serviceRequestId === order || j.id === order,
    );
    if (match) {
      window.history.replaceState(null, "", "/my-repairs");
      setLocation("/my-repairs/" + match.id, { replace: true });
    }
  }, [data, setLocation]);
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
                    <th className="px-4 py-3">Device</th>
                    <th className="px-4 py-3">{t("journey.status")}</th>
                    <th className="px-4 py-3">Last Update</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((journey) => {
                    const presentation = presentCustomerJourney(journey, t);
                    const ref = safeCustomerTicketRef(journey);
                    return (
                      <tr key={journey.id} className="border-t border-slate-100 hover:bg-emerald-50/30">
                        <td className="px-4 py-4">
                          <div className="font-bold text-slate-900">{deviceLabel(journey)}</div>
                          {ref ? <div className="mt-0.5 text-xs text-slate-400">{ref}</div> : null}
                        </td>
                        <td className="px-4 py-4">
                          <StatusChip tone={toneForStatus(presentation.toneStage)}>{presentation.title}</StatusChip>
                        </td>
                        <td className="px-4 py-4 text-xs text-slate-500">
                          {journey.lastEventTitle && !/JOB-|serial|estimate/i.test(journey.lastEventTitle)
                            ? `${journey.lastEventTitle} · ${formatDate(journey.lastEventAt)}`
                            : formatDate(journey.updatedAt)}
                        </td>
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
                <Monitor className="h-8 w-8 text-emerald-600" />
                <h2 className="mt-4 text-2xl font-black text-slate-950">{deviceLabel(selected)}</h2>
                {safeCustomerTicketRef(selected) ? (
                  <p className="mt-1 text-xs font-bold text-slate-400">{safeCustomerTicketRef(selected)}</p>
                ) : null}
                <p className="mt-3 text-sm leading-6 text-slate-500">{presentCustomerJourney(selected, t).explanation}</p>
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
