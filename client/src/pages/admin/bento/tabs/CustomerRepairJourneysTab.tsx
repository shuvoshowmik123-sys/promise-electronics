import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Clock3, FileText, MessageSquare, RefreshCw, Wrench } from "lucide-react";
import { toast } from "sonner";
import { adminRepairJourneysApi } from "@/lib/api/adminApi";
import type { CustomerJourneyStage, CustomerRepairJourney, CustomerRepairJourneyDetail, CustomerRepairSchedule } from "@/lib/api/customerApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MobileKpiGrid, MobileScrollContent, MobileSegmentTabs, MobileTabHeader, MobileTabLayout } from "../shared";

const STAGES: CustomerJourneyStage[] = [
  "quote_requested",
  "quote_sent",
  "quote_accepted",
  "schedule_requested",
  "schedule_confirmed",
  "device_waiting",
  "device_received",
  "inspection_waiting",
  "inspection_started",
  "diagnosis_ready",
  "repair_approval_required",
  "repair_approved",
  "repair_in_progress",
  "repair_completed",
  "delivery_scheduled",
  "delivered",
  "cancelled",
];

const DEFAULT_FRIENDLY: Record<string, string> = {
  draft: "We received your request. Our team will review it soon.",
  quote_requested: "Your quote request is being reviewed by our team.",
  quote_sent: "Your quote is ready. Please review and accept when convenient.",
  quote_accepted: "Quote accepted! We will schedule your service shortly.",
  schedule_requested: "Pickup requested. We will confirm a time slot shortly.",
  schedule_confirmed: "Your pickup is confirmed. We will be there at the scheduled time.",
  device_waiting: "Your TV is waiting for inspection. No action is needed from you right now.",
  device_received: "We have received your TV. It is safely in our queue.",
  inspection_waiting: "We are a little busy today, but your TV is safely in our queue.",
  inspection_started: "Inspection has started. We will share findings soon.",
  diagnosis_ready: "Diagnosis is ready. Please review before repair starts.",
  repair_approval_required: "We need your approval to proceed with the repair.",
  repair_approved: "Repair has been approved and will begin shortly.",
  repair_in_progress: "Repair is in progress.",
  repair_completed: "Your TV is ready! We will arrange delivery or you can pick it up.",
  delivery_scheduled: "Delivery is scheduled. Your TV is on its way!",
  delivered: "Your TV has been delivered. Thank you for choosing Promise Electronics!",
  cancelled: "This repair journey has been cancelled.",
};

type Filter = "all" | "active" | "quotes" | "done";

function formatStage(stage?: string) {
  return (stage || "pending").split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function toneForStage(stage?: string) {
  const s = stage || "";
  if (s.includes("quote")) return "bg-amber-50 text-amber-700 border-amber-100";
  if (s.includes("repair") || s.includes("inspection")) return "bg-blue-50 text-blue-700 border-blue-100";
  if (s.includes("delivered") || s.includes("completed")) return "bg-emerald-50 text-emerald-700 border-emerald-100";
  if (s.includes("cancelled")) return "bg-rose-50 text-rose-700 border-rose-100";
  return "bg-slate-50 text-slate-600 border-slate-100";
}

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function matchesFilter(journey: CustomerRepairJourney, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "quotes") return journey.currentStage.includes("quote");
  if (filter === "done") return ["repair_completed", "delivered", "cancelled"].includes(journey.currentStage);
  return !["delivered", "cancelled"].includes(journey.currentStage);
}

function JourneyDetailPanel({
  detail,
  onStage,
  onConfirmSchedule,
  onEvent,
  busy,
}: {
  detail: CustomerRepairJourneyDetail & { adminNote?: string | null };
  onStage: (payload: { stage: CustomerJourneyStage; adminNote?: string; customerFriendlyStatus?: string }) => void;
  onConfirmSchedule: (payload: { scheduleId: string; confirmedDate: string; confirmedTimeWindow: string; adminNote?: string }) => void;
  onEvent: (payload: { eventType: string; title: string; message?: string; isCustomerVisible?: boolean }) => void;
  busy: boolean;
}) {
  const [stage, setStage] = useState<CustomerJourneyStage>(detail.currentStage);
  const [friendly, setFriendly] = useState(detail.customerFriendlyStatus || "");
  const [adminNote, setAdminNote] = useState("");
  const [scheduleId, setScheduleId] = useState(detail.schedules[0]?.id || "");
  const [confirmedDate, setConfirmedDate] = useState("");
  const [confirmedTimeWindow, setConfirmedTimeWindow] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventMessage, setEventMessage] = useState("");

  useEffect(() => {
    setStage(detail.currentStage);
    setFriendly(detail.customerFriendlyStatus || "");
    setAdminNote("");
    setScheduleId(detail.schedules[0]?.id || "");
  }, [detail.id, detail.currentStage, detail.customerFriendlyStatus, detail.schedules]);

  const handleStageChange = (newStage: CustomerJourneyStage) => {
    setStage(newStage);
    setFriendly(DEFAULT_FRIENDLY[newStage] || "");
  };

  const submitStage = (event: FormEvent) => {
    event.preventDefault();
    onStage({ stage, adminNote, customerFriendlyStatus: friendly });
  };

  const submitSchedule = (event: FormEvent) => {
    event.preventDefault();
    if (!scheduleId || !confirmedDate || !confirmedTimeWindow) return;
    onConfirmSchedule({ scheduleId, confirmedDate, confirmedTimeWindow, adminNote });
  };

  const submitEvent = (event: FormEvent) => {
    event.preventDefault();
    if (!eventTitle.trim()) return;
    onEvent({ eventType: "admin_update", title: eventTitle.trim(), message: eventMessage, isCustomerVisible: true });
    setEventTitle("");
    setEventMessage("");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs font-bold text-slate-400">{detail.jobTicketId || detail.serviceRequestId || detail.quoteRequestId || detail.id}</p>
            <h2 className="mt-2 text-xl font-black text-slate-950">{formatStage(detail.currentStage)}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{detail.customerFriendlyStatus}</p>
          </div>
          <Badge className={toneForStage(detail.currentStage)} variant="outline">{detail.currentStatus}</Badge>
        </div>
      </div>

      <form onSubmit={submitStage} className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3">
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">Stage update</p>
        <select className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold" value={stage} onChange={(event) => handleStageChange(event.target.value as CustomerJourneyStage)}>
          {STAGES.map((item) => <option key={item} value={item}>{formatStage(item)}</option>)}
        </select>
        <Textarea value={friendly} onChange={(event) => setFriendly(event.target.value)} className="min-h-20 rounded-xl" placeholder="Customer-friendly status" />
        <Textarea value={adminNote} onChange={(event) => setAdminNote(event.target.value)} className="min-h-20 rounded-xl" placeholder="Private admin note" />
        <Button disabled={busy} className="w-full rounded-xl bg-blue-600 hover:bg-blue-700">Update stage</Button>
      </form>

      <form onSubmit={submitSchedule} className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3">
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">Confirm schedule</p>
        <select className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold" value={scheduleId} onChange={(event) => setScheduleId(event.target.value)}>
          <option value="">Select schedule</option>
          {detail.schedules.map((item) => <option key={item.id} value={item.id}>{item.scheduleType} · {item.status}</option>)}
        </select>
        <Input type="date" value={confirmedDate} onChange={(event) => setConfirmedDate(event.target.value)} className="h-11 rounded-xl" />
        <Input value={confirmedTimeWindow} onChange={(event) => setConfirmedTimeWindow(event.target.value)} className="h-11 rounded-xl" placeholder="10 AM - 1 PM" />
        <Button disabled={busy || !scheduleId} className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700">Confirm schedule</Button>
      </form>

      <form onSubmit={submitEvent} className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3">
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">Customer-visible update</p>
        <Input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} className="h-11 rounded-xl" placeholder="Title" />
        <Textarea value={eventMessage} onChange={(event) => setEventMessage(event.target.value)} className="min-h-20 rounded-xl" placeholder="Message" />
        <Button disabled={busy} variant="outline" className="w-full rounded-xl">Add update</Button>
      </form>

      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">Timeline</p>
        <div className="mt-3 space-y-3">
          {detail.events.map((event) => (
            <div key={event.id} className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-slate-900">{event.title}</p>
                <span className="text-[11px] font-bold text-slate-400">{formatDate(event.createdAt)}</span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{event.message}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CustomerRepairJourneysTab() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listQuery = useQuery({
    queryKey: ["adminRepairJourneys", filter],
    queryFn: () => adminRepairJourneysApi.getAll({ status: filter === "active" ? "active" : undefined, limit: 100 }),
  });
  const journeys = useMemo(() => (listQuery.data || []).filter((journey) => matchesFilter(journey, filter)), [listQuery.data, filter]);
  const selected = selectedId || journeys[0]?.id || null;
  const detailQuery = useQuery({
    queryKey: ["adminRepairJourney", selected],
    queryFn: () => adminRepairJourneysApi.getOne(selected || ""),
    enabled: Boolean(selected),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["adminRepairJourneys"] });
    if (selected) queryClient.invalidateQueries({ queryKey: ["adminRepairJourney", selected] });
  };

  const stageMutation = useMutation({
    mutationFn: (payload: { stage: CustomerJourneyStage; adminNote?: string; customerFriendlyStatus?: string }) => adminRepairJourneysApi.updateStage(selected || "", payload),
    onSuccess: () => { toast.success("Journey updated"); invalidate(); },
    onError: (error: Error) => toast.error(error.message || "Failed to update journey"),
  });
  const scheduleMutation = useMutation({
    mutationFn: (payload: { scheduleId: string; confirmedDate: string; confirmedTimeWindow: string; adminNote?: string }) => adminRepairJourneysApi.confirmSchedule(selected || "", payload),
    onSuccess: () => { toast.success("Schedule confirmed"); invalidate(); },
    onError: (error: Error) => toast.error(error.message || "Failed to confirm schedule"),
  });
  const eventMutation = useMutation({
    mutationFn: (payload: { eventType: string; title: string; message?: string; isCustomerVisible?: boolean }) => adminRepairJourneysApi.addEvent(selected || "", payload),
    onSuccess: () => { toast.success("Update added"); invalidate(); },
    onError: (error: Error) => toast.error(error.message || "Failed to add update"),
  });

  const kpis = [
    { label: "Active", value: journeys.filter((item) => !["delivered", "cancelled"].includes(item.currentStage)).length, tone: "blue" as const, icon: <Wrench className="h-4 w-4" /> },
    { label: "Quotes", value: journeys.filter((item) => item.currentStage.includes("quote")).length, tone: "amber" as const, icon: <FileText className="h-4 w-4" /> },
    { label: "Schedules", value: journeys.filter((item) => item.currentStage.includes("schedule")).length, tone: "violet" as const, icon: <CalendarClock className="h-4 w-4" /> },
    { label: "Done", value: journeys.filter((item) => item.currentStage === "delivered").length, tone: "emerald" as const, icon: <CheckCircle2 className="h-4 w-4" /> },
  ];

  const busy = stageMutation.isPending || scheduleMutation.isPending || eventMutation.isPending;

  return (
    <>
      <MobileTabLayout className="md:hidden">
        <MobileTabHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-500">Customer Care</p>
                <h1 className="text-2xl font-black text-slate-950">Repair Journeys</h1>
              </div>
              <Button size="icon" variant="outline" className="rounded-2xl" onClick={() => listQuery.refetch()}><RefreshCw className="h-4 w-4" /></Button>
            </div>
            <MobileKpiGrid items={kpis} collapsible summaryLabel="Journey pulse" />
            <MobileSegmentTabs value={filter} onChange={(value) => setFilter(value as Filter)} items={[
              { label: "Active", value: "active" },
              { label: "Quotes", value: "quotes" },
              { label: "Done", value: "done" },
              { label: "All", value: "all" },
            ]} />
          </div>
        </MobileTabHeader>
        <MobileScrollContent className="space-y-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
          {journeys.map((journey) => (
            <button key={journey.id} type="button" onClick={() => setSelectedId(journey.id)} className="w-full rounded-[1.5rem] border border-blue-100 bg-white p-4 text-left shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] font-bold text-slate-400">{journey.jobTicketId || journey.serviceRequestId || journey.quoteRequestId || journey.id}</p>
                  <h3 className="mt-1 text-base font-black text-slate-950">{formatStage(journey.currentStage)}</h3>
                </div>
                <Badge variant="outline" className={toneForStage(journey.currentStage)}>{journey.currentStatus}</Badge>
              </div>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{journey.customerFriendlyStatus}</p>
            </button>
          ))}
          {detailQuery.data && (
            <JourneyDetailPanel
              detail={detailQuery.data}
              onStage={(payload) => stageMutation.mutate(payload)}
              onConfirmSchedule={(payload) => scheduleMutation.mutate(payload)}
              onEvent={(payload) => eventMutation.mutate(payload)}
              busy={busy}
            />
          )}
        </MobileScrollContent>
      </MobileTabLayout>

      <div className="hidden h-full grid-cols-[minmax(0,1fr)_420px] gap-5 p-5 md:grid">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-500">Customer Care</p>
              <h1 className="mt-1 text-3xl font-black text-slate-950">Repair Journeys</h1>
            </div>
            <Button variant="outline" className="rounded-full" onClick={() => listQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
          </div>
          <div className="mt-5 flex gap-2">
            {(["active", "quotes", "done", "all"] as Filter[]).map((item) => (
              <Button key={item} variant={filter === item ? "default" : "outline"} className="rounded-full capitalize" onClick={() => setFilter(item)}>{item}</Button>
            ))}
          </div>
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-100">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {journeys.map((journey) => (
                  <tr key={journey.id} onClick={() => setSelectedId(journey.id)} className="cursor-pointer border-t border-slate-100 hover:bg-blue-50/50">
                    <td className="px-4 py-4 font-mono text-xs font-bold text-slate-500">{journey.jobTicketId || journey.serviceRequestId || journey.quoteRequestId || journey.id}</td>
                    <td className="px-4 py-4 font-bold text-slate-900">{formatStage(journey.currentStage)}</td>
                    <td className="px-4 py-4"><Badge variant="outline" className={toneForStage(journey.currentStage)}>{journey.currentStatus}</Badge></td>
                    <td className="px-4 py-4 text-slate-500">{formatDate(journey.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <aside className="overflow-y-auto">
          {detailQuery.data ? (
            <JourneyDetailPanel
              detail={detailQuery.data}
              onStage={(payload) => stageMutation.mutate(payload)}
              onConfirmSchedule={(payload) => scheduleMutation.mutate(payload)}
              onEvent={(payload) => eventMutation.mutate(payload)}
              busy={busy}
            />
          ) : (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Select a journey</div>
          )}
        </aside>
      </div>
    </>
  );
}
