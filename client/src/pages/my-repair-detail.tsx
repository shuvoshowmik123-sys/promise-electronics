import { FormEvent, ReactNode, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock3, HelpCircle, MessageSquare, Truck, Wrench } from "lucide-react";
import { customerRepairJourneysApi, type AcceptJourneyQuotePayload, type CustomerRepairSchedule, type JourneySchedulePayload } from "@/lib/api/customerApi";
import { useCustomerLanguage, type CustomerLang } from "@/contexts/CustomerLanguageContext";
import { PillButton, RefBadge, SectionEyebrow, StatusChip, toneForStatus } from "@/components/customer/mobile-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatJourneyRef, labelJourneyFriendly, labelJourneyStage, labelJourneyStatus, labelNextAction, labelScheduleType } from "@/lib/customerRepairJourneyLabels";

type Sheet = "quote" | "schedule" | "reschedule" | "question" | null;

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatEventMessage(message: string | null, language: CustomerLang) {
  if (!message) return "";
  return message.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (value) => {
    const date = new Date(value + "T00:00:00");
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(language === "bn" ? "bn-BD" : "en-US", { month: "long", day: "numeric", year: "numeric" });
  });
}

function MobileSheet({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/40 md:hidden">
      <div className="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-[2rem] bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl">
        <button type="button" onClick={onClose} className="mx-auto mb-4 block h-1.5 w-12 rounded-full bg-slate-300" aria-label="Close" />
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function QuoteForm({ onSubmit, busy }: { onSubmit: (payload: AcceptJourneyQuotePayload) => void; busy: boolean }) {
  const { t } = useCustomerLanguage();
  const [servicePreference, setServicePreference] = useState<"home_pickup" | "service_center">("home_pickup");
  const [pickupTier, setPickupTier] = useState<"Regular" | "Priority" | "Emergency">("Regular");
  const [address, setAddress] = useState("");
  const [scheduledVisitDate, setScheduledVisitDate] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      servicePreference,
      pickupTier: servicePreference === "home_pickup" ? pickupTier : undefined,
      address,
      scheduledVisitDate: servicePreference === "service_center" ? scheduledVisitDate || null : null,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={t("journey.schedule")}>
        <select className="h-12 w-full rounded-2xl border border-emerald-100 bg-white px-3 text-sm font-bold" value={servicePreference} onChange={(event) => setServicePreference(event.target.value as AcceptJourneyQuotePayload["servicePreference"])}>
          <option value="home_pickup">{t("journey.homePickup")}</option>
          <option value="service_center">{t("journey.serviceCenter")}</option>
        </select>
      </Field>
      {servicePreference === "home_pickup" && (
        <Field label={t("journey.pickupTier")}>
          <select className="h-12 w-full rounded-2xl border border-emerald-100 bg-white px-3 text-sm font-bold" value={pickupTier} onChange={(event) => setPickupTier(event.target.value as NonNullable<AcceptJourneyQuotePayload["pickupTier"]>)}>
            <option value="Regular">{t("journey.regular")}</option>
            <option value="Priority">{t("journey.priority")}</option>
            <option value="Emergency">{t("journey.emergency")}</option>
          </select>
        </Field>
      )}
      <Field label={t("journey.address")}>
        <Input value={address} onChange={(event) => setAddress(event.target.value)} className="h-12 rounded-2xl border-emerald-100" />
      </Field>
      {servicePreference === "service_center" && (
        <Field label={t("journey.date")}>
          <Input type="date" value={scheduledVisitDate} onChange={(event) => setScheduledVisitDate(event.target.value)} className="h-12 rounded-2xl border-emerald-100" />
        </Field>
      )}
      <PillButton disabled={busy}>{t("journey.acceptQuote")}</PillButton>
    </form>
  );
}

function ScheduleForm({ onSubmit, busy }: { onSubmit: (payload: JourneySchedulePayload) => void; busy: boolean }) {
  const { t } = useCustomerLanguage();
  const [scheduleType, setScheduleType] = useState<JourneySchedulePayload["scheduleType"]>("pickup");
  const [requestedDate, setRequestedDate] = useState("");
  const [requestedTimeWindow, setRequestedTimeWindow] = useState("");
  const [customerNote, setCustomerNote] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({ scheduleType, requestedDate, requestedTimeWindow, customerNote });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={t("journey.schedule")}>
        <select className="h-12 w-full rounded-2xl border border-emerald-100 bg-white px-3 text-sm font-bold" value={scheduleType} onChange={(event) => setScheduleType(event.target.value as JourneySchedulePayload["scheduleType"])}>
          <option value="pickup">{t("journey.pickup")}</option>
          <option value="drop_off">{t("journey.dropOff")}</option>
          <option value="home_visit">{t("journey.homeVisit")}</option>
          <option value="service_center_visit">{t("journey.serviceCenterVisit")}</option>
          <option value="delivery">{t("journey.delivery")}</option>
        </select>
      </Field>
      <Field label={t("journey.date")}>
        <Input type="date" value={requestedDate} onChange={(event) => setRequestedDate(event.target.value)} className="h-12 rounded-2xl border-emerald-100" />
      </Field>
      <Field label={t("journey.timeWindow")}>
        <Input value={requestedTimeWindow} onChange={(event) => setRequestedTimeWindow(event.target.value)} placeholder="10 AM - 1 PM" className="h-12 rounded-2xl border-emerald-100" />
      </Field>
      <Field label={t("journey.note")}>
        <Textarea value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} className="min-h-24 rounded-2xl border-emerald-100" />
      </Field>
      <PillButton disabled={busy}>{t("journey.submit")}</PillButton>
    </form>
  );
}

function RescheduleForm({ schedules, onSubmit, busy }: { schedules: CustomerRepairSchedule[]; onSubmit: (payload: { scheduleId: string; newDate: string; newTimeWindow?: string; customerNote?: string }) => void; busy: boolean }) {
  const { t } = useCustomerLanguage();
  const [scheduleId, setScheduleId] = useState(schedules[0]?.id || "");
  const [newDate, setNewDate] = useState("");
  const [newTimeWindow, setNewTimeWindow] = useState("");
  const [customerNote, setCustomerNote] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!scheduleId || !newDate) return;
    onSubmit({ scheduleId, newDate, newTimeWindow, customerNote });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={t("journey.schedule")}>
        <select className="h-12 w-full rounded-2xl border border-emerald-100 bg-white px-3 text-sm font-bold" value={scheduleId} onChange={(event) => setScheduleId(event.target.value)}>
          {schedules.map((schedule) => (
            <option key={schedule.id} value={schedule.id}>{labelScheduleType(schedule.scheduleType, t)} · {labelJourneyStatus(schedule.status, schedule.status, t)}</option>
          ))}
        </select>
      </Field>
      <Field label={t("journey.date")}>
        <Input type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} className="h-12 rounded-2xl border-emerald-100" />
      </Field>
      <Field label={t("journey.timeWindow")}>
        <Input value={newTimeWindow} onChange={(event) => setNewTimeWindow(event.target.value)} className="h-12 rounded-2xl border-emerald-100" />
      </Field>
      <Field label={t("journey.note")}>
        <Textarea value={customerNote} onChange={(event) => setCustomerNote(event.target.value)} className="min-h-24 rounded-2xl border-emerald-100" />
      </Field>
      <PillButton disabled={busy}>{t("journey.reschedule")}</PillButton>
    </form>
  );
}

function QuestionForm({ onSubmit, busy }: { onSubmit: (question: string) => void; busy: boolean }) {
  const { t } = useCustomerLanguage();
  const [question, setQuestion] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!question.trim()) return;
    onSubmit(question.trim());
    setQuestion("");
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={t("journey.askQuestion")}>
        <Textarea value={question} onChange={(event) => setQuestion(event.target.value)} className="min-h-28 rounded-2xl border-emerald-100" />
      </Field>
      <PillButton disabled={busy}>{t("journey.submit")}</PillButton>
    </form>
  );
}

export default function MyRepairDetailPage() {
  const [, params] = useRoute("/my-repairs/:id");
  const [, setLocation] = useLocation();
  const { t, language } = useCustomerLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState<Sheet>(null);
  const id = params?.id || "";

  const query = useQuery({
    queryKey: ["customerRepairJourney", id],
    queryFn: () => customerRepairJourneysApi.getOne(id),
    enabled: Boolean(id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["customerRepairJourneys"] });
    queryClient.invalidateQueries({ queryKey: ["customerRepairJourney", id] });
  };

  const acceptQuote = useMutation({
    mutationFn: (payload: AcceptJourneyQuotePayload) => customerRepairJourneysApi.acceptQuote(id, payload),
    onSuccess: () => { toast({ title: t("journey.acceptQuote") }); setSheet(null); invalidate(); },
  });
  const schedule = useMutation({
    mutationFn: (payload: JourneySchedulePayload) => customerRepairJourneysApi.requestSchedule(id, payload),
    onSuccess: () => { toast({ title: t("journey.requestSchedule") }); setSheet(null); invalidate(); },
  });
  const reschedule = useMutation({
    mutationFn: (payload: { scheduleId: string; newDate: string; newTimeWindow?: string; customerNote?: string }) => customerRepairJourneysApi.requestReschedule(id, payload),
    onSuccess: () => { toast({ title: t("journey.reschedule") }); setSheet(null); invalidate(); },
  });
  const askQuestion = useMutation({
    mutationFn: (question: string) => customerRepairJourneysApi.askQuestion(id, question),
    onSuccess: () => { toast({ title: t("journey.askQuestion") }); setSheet(null); invalidate(); },
  });

  const detail = query.data;
  const nextAction = detail?.nextAction;
  const actions = useMemo(() => {
    if (!detail) return [];
    const list: { label: string; icon: ReactNode; sheet: Sheet }[] = [];
    if (nextAction === "accept_quote" || detail.currentStage === "quote_sent") list.push({ label: t("journey.acceptQuote"), icon: <CheckCircle2 className="h-4 w-4" />, sheet: "quote" });
    list.push({ label: t("journey.requestSchedule"), icon: <CalendarClock className="h-4 w-4" />, sheet: "schedule" });
    if (detail.schedules.length > 0) list.push({ label: t("journey.reschedule"), icon: <Truck className="h-4 w-4" />, sheet: "reschedule" });
    list.push({ label: t("journey.askQuestion"), icon: <MessageSquare className="h-4 w-4" />, sheet: "question" });
    return list;
  }, [detail, nextAction, t]);

  if (query.isLoading) {
    return <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white px-4 pb-28 pt-6"><Skeleton className="mx-auto h-96 max-w-[560px] rounded-[2rem]" /></div>;
  }

  if (!detail) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white px-4 pb-28 pt-6">
        <div className="mx-auto max-w-[560px] rounded-[2rem] bg-white p-6 text-center">
          <HelpCircle className="mx-auto h-10 w-10 text-rose-500" />
          <h1 className="mt-4 text-xl font-black text-slate-950">{t("track.orderNotFound")}</h1>
          <Link href="/my-repairs"><PillButton className="mt-5">{t("journey.title")}</PillButton></Link>
        </div>
      </main>
    );
  }

  const form = (
    <>
      {sheet === "quote" && <QuoteForm busy={acceptQuote.isPending} onSubmit={(payload) => acceptQuote.mutate(payload)} />}
      {sheet === "schedule" && <ScheduleForm busy={schedule.isPending} onSubmit={(payload) => schedule.mutate(payload)} />}
      {sheet === "reschedule" && <RescheduleForm schedules={detail.schedules} busy={reschedule.isPending} onSubmit={(payload) => reschedule.mutate(payload)} />}
      {sheet === "question" && <QuestionForm busy={askQuestion.isPending} onSubmit={(question) => askQuestion.mutate(question)} />}
    </>
  );
  const stageLabel = labelJourneyStage(detail.currentStage, t);
  const friendlyLabel = labelJourneyFriendly(detail.currentStage, detail.customerFriendlyStatus, t);
  const statusLabel = labelJourneyStatus(detail.currentStatus, stageLabel, t);
  const nextActionLabel = labelNextAction(detail.nextAction, detail.nextActionLabel, t, language);

  return (
    <>
      <main className="md:hidden min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white px-4 pb-28 pt-[calc(env(safe-area-inset-top)+16px)]">
        <div className="mx-auto max-w-[560px] space-y-4">
          <button type="button" onClick={() => setLocation("/my-repairs")} className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-slate-600 shadow-sm">
            <ArrowLeft className="h-4 w-4" /> {t("journey.title")}
          </button>
          <section className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-emerald-900 to-emerald-600 p-5 text-white shadow-xl shadow-emerald-100">
            <RefBadge className="bg-white/15 text-white">{formatJourneyRef(detail)}</RefBadge>
            <h1 className="mt-4 text-3xl font-black tracking-tight">{stageLabel}</h1>
            <p className="mt-3 text-sm leading-6 text-emerald-50/90">{friendlyLabel}</p>
            <StatusChip className="mt-4 bg-white/15 text-white" tone="neutral">{statusLabel}</StatusChip>
          </section>

          {(detail.nextAction || detail.nextActionLabel) && (
            <section className="rounded-[1.75rem] border border-emerald-100 bg-white p-4">
              <SectionEyebrow>{t("journey.nextAction")}</SectionEyebrow>
              <p className="mt-2 text-lg font-black text-slate-950">{nextActionLabel}</p>
            </section>
          )}

          <section className="grid grid-cols-2 gap-2">
            {actions.map((action, index) => (
              <button key={action.label} type="button" onClick={() => setSheet(action.sheet)} className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-3xl border border-emerald-100 bg-white p-3 text-sm font-black text-emerald-700 shadow-sm ${actions.length % 2 === 1 && index === actions.length - 1 ? "col-span-2" : ""}`}>
                {action.icon}{action.label}
              </button>
            ))}
          </section>

          <section className="rounded-[1.75rem] border border-emerald-100 bg-white p-4">
            <SectionEyebrow>{t("journey.timeline")}</SectionEyebrow>
            <div className="mt-4 space-y-4">
              {detail.events.map((event) => (
                <div key={event.id} className="relative pl-6">
                  <span className="absolute left-0 top-1.5 h-3 w-3 rounded-full bg-emerald-500" />
                  <p className="text-sm font-black text-slate-900">{event.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{formatEventMessage(event.message, language)}</p>
                  <p className="mt-1 text-[11px] font-bold text-slate-400">{formatDate(event.createdAt)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-emerald-100 bg-white p-4">
            <SectionEyebrow>{t("journey.schedule")}</SectionEyebrow>
            <div className="mt-3 space-y-2">
              {detail.schedules.length === 0 ? (
                <p className="text-sm text-slate-500">{t("journey.requestSchedule")}</p>
              ) : detail.schedules.map((item) => (
                <div key={item.id} className="rounded-2xl bg-slate-50 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-800">{labelScheduleType(item.scheduleType, t)}</span>
                    <StatusChip tone={toneForStatus(item.status)}>{labelJourneyStatus(item.status, item.status, t)}</StatusChip>
                  </div>
                  <p className="mt-2 text-slate-500">{formatDate(item.confirmedDate || item.requestedDate)} · {item.confirmedTimeWindow || item.requestedTimeWindow || t("journey.timeWindow")}</p>
                  {(item.zone || item.routeOrder || item.assignedDriverId) && (
                    <p className="mt-1 text-xs font-bold text-emerald-700">
                      {[item.zone, item.routeOrder ? "#" + item.routeOrder : null].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      <main className="hidden min-h-screen bg-slate-50 px-8 py-10 md:block">
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_360px] gap-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <Button variant="ghost" className="rounded-full" onClick={() => setLocation("/my-repairs")}><ArrowLeft className="mr-2 h-4 w-4" />{t("journey.title")}</Button>
            <h1 className="mt-6 text-4xl font-black text-slate-950">{stageLabel}</h1>
            <p className="mt-3 max-w-2xl text-slate-500">{friendlyLabel}</p>
            <div className="mt-8 rounded-3xl border border-slate-100 p-5">
              <SectionEyebrow>{t("journey.timeline")}</SectionEyebrow>
              <div className="mt-5 space-y-5">
                {detail.events.map((event) => (
                  <div key={event.id} className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-black text-slate-900">{event.title}</p>
                      <span className="text-xs font-bold text-slate-400">{formatDate(event.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{formatEventMessage(event.message, language)}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <aside className="space-y-4">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionEyebrow>{t("journey.nextAction")}</SectionEyebrow>
              <div className="mt-4 space-y-2">
                {actions.map((action) => (
                  <Button key={action.label} variant="outline" className="h-12 w-full justify-start rounded-2xl" onClick={() => setSheet(action.sheet)}>
                    {action.icon}<span className="ml-2">{action.label}</span>
                  </Button>
                ))}
              </div>
            </section>
            {sheet && <section className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">{form}</section>}
          </aside>
        </div>
      </main>

      <MobileSheet title={sheet ? t(sheet === "quote" ? "journey.acceptQuote" : sheet === "schedule" ? "journey.requestSchedule" : sheet === "reschedule" ? "journey.reschedule" : "journey.askQuestion") : ""} open={Boolean(sheet)} onClose={() => setSheet(null)}>
        {form}
      </MobileSheet>
    </>
  );
}
