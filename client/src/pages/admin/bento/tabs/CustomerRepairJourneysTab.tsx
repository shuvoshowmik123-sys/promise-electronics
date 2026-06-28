import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  FileText,
  MessageSquare,
  Monitor,
  Phone,
  RefreshCw,
  Search,
  UserRound,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { adminRepairJourneysApi, type AdminJourneyListItem } from "@/lib/api/adminApi";
import type { CustomerRepairJourneyDetail } from "@/lib/api/customerApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MobileKpiGrid, MobileScrollContent, MobileSegmentTabs, MobileTabHeader, MobileTabLayout } from "../shared";
import { MobileBottomSheetFrame, MobileBottomSheetHandle } from "@/components/ui/mobile-bottom-sheet";
import { useIsMobile } from "@/hooks/use-mobile";

type Filter = "all" | "active" | "quotes" | "done";
type SourceFilter = "all" | AdminJourneyListItem["sourceType"];
type QuoteFilter = "all" | "sent" | "none";

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

function formatMoney(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return `BDT ${Number(value).toLocaleString("en-US")}`;
}

function sourceLabel(source?: string | null) {
  if (source === "service_request") return "Service Request";
  if (source === "quote_request") return "Quote Request";
  if (source === "walk_in") return "Walk-in";
  if (source === "warranty") return "Warranty";
  return "Unknown Source";
}

function sourceTone(source?: string | null) {
  if (source === "service_request") return "bg-blue-50 text-blue-700 border-blue-100";
  if (source === "quote_request") return "bg-amber-50 text-amber-700 border-amber-100";
  if (source === "walk_in") return "bg-emerald-50 text-emerald-700 border-emerald-100";
  if (source === "warranty") return "bg-violet-50 text-violet-700 border-violet-100";
  return "bg-slate-50 text-slate-600 border-slate-100";
}

function safeRef(label: string, value?: string | null) {
  if (!value) return null;
  const clean = value.length > 12 ? value.slice(-6).toUpperCase() : value.toUpperCase();
  return `${label} ${clean}`;
}

function displayReference(journey: AdminJourneyListItem) {
  return (
    journey.srTicketNumber ||
    safeRef("JOB", journey.jobTicketId) ||
    safeRef("SR", journey.serviceRequestId) ||
    safeRef("QR", journey.quoteRequestId) ||
    safeRef("JOURNEY", journey.id) ||
    "Repair record"
  );
}

function deviceLabel(journey: AdminJourneyListItem) {
  const parts = [journey.deviceBrand, journey.deviceModel].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return "Device not specified";
}

function matchesFilter(journey: AdminJourneyListItem, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "quotes") return Boolean(journey.quoteAmount || journey.quoteStatus || journey.currentStage.includes("quote"));
  if (filter === "done") return ["repair_completed", "delivered", "cancelled"].includes(journey.currentStage);
  return !["delivered", "cancelled"].includes(journey.currentStage);
}

function customerKey(journey: AdminJourneyListItem) {
  return `${journey.customerName || "Unknown Customer"}|${journey.customerPhone || "No phone"}`;
}

function JourneyBadges({ journey }: { journey: AdminJourneyListItem }) {
  const quoteAmount = formatMoney(journey.quoteAmount);
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="outline" className={sourceTone(journey.sourceType)}>{sourceLabel(journey.sourceType)}</Badge>
      {journey.srTicketNumber && <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-100">SR {journey.srTicketNumber}</Badge>}
      {journey.jobTicketId && <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-100">{safeRef("JOB", journey.jobTicketId)}</Badge>}
      {quoteAmount && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-100">Quote {quoteAmount}</Badge>}
      {journey.billingStatus && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-100">{journey.billingStatus}</Badge>}
    </div>
  );
}

function JourneySummaryCard({
  journey,
  selected,
  onSelect,
}: {
  journey: AdminJourneyListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition-colors ${selected ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-100 hover:border-blue-200 hover:bg-blue-50/30"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-black text-slate-950">
            <UserRound className="h-4 w-4 shrink-0 text-blue-500" />
            <span className="truncate">{journey.customerName || "Unknown Customer"}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{journey.customerPhone || "No phone saved"}</span>
          </div>
        </div>
        <Badge variant="outline" className={toneForStage(journey.currentStage)}>{formatStage(journey.currentStage)}</Badge>
      </div>

      <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
        <div className="flex items-start gap-2">
          <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-800">{deviceLabel(journey)}</p>
            <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] font-bold text-slate-500">
              {journey.serialNumber && <span>S/N {journey.serialNumber}</span>}
              {journey.screenSize && <span>{journey.screenSize}"</span>}
              <span>{displayReference(journey)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <JourneyBadges journey={journey} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
        <span className="line-clamp-1 font-semibold text-slate-500">{journey.lastEventTitle || journey.customerFriendlyStatus || "No recent update"}</span>
        <span className="shrink-0 font-bold text-slate-400">{formatDate(journey.lastEventAt || journey.updatedAt)}</span>
      </div>
    </button>
  );
}

function JourneyDetailPanel({
  detail,
  selectedJourney,
  onConfirmSchedule,
  onEvent,
  busy,
}: {
  detail: CustomerRepairJourneyDetail & { adminNote?: string | null };
  selectedJourney?: AdminJourneyListItem;
  onConfirmSchedule: (payload: { scheduleId: string; confirmedDate: string; confirmedTimeWindow: string; adminNote?: string }) => void;
  onEvent: (payload: { eventType: string; title: string; message?: string; isCustomerVisible?: boolean }) => void;
  busy: boolean;
}) {
  const [scheduleId, setScheduleId] = useState(detail.schedules[0]?.id || "");
  const [confirmedDate, setConfirmedDate] = useState("");
  const [confirmedTimeWindow, setConfirmedTimeWindow] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventMessage, setEventMessage] = useState("");

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

  const quoteAmount = selectedJourney ? formatMoney(selectedJourney.quoteAmount) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-blue-500">{selectedJourney ? sourceLabel(selectedJourney.sourceType) : "Repair Journey"}</p>
            <h2 className="mt-2 truncate text-xl font-black text-slate-950">{selectedJourney?.customerName || "Customer repair history"}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{selectedJourney?.customerPhone || "No phone saved"}</p>
          </div>
          <Badge className={toneForStage(detail.currentStage)} variant="outline">{detail.currentStatus}</Badge>
        </div>

        {selectedJourney && (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Device</p>
              <p className="mt-1 text-sm font-black text-slate-900">{deviceLabel(selectedJourney)}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold text-slate-500">
                {selectedJourney.serialNumber && <span>S/N {selectedJourney.serialNumber}</span>}
                {selectedJourney.screenSize && <span>{selectedJourney.screenSize}"</span>}
                <span>{displayReference(selectedJourney)}</span>
              </div>
            </div>
            <JourneyBadges journey={selectedJourney} />
            {quoteAmount && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                <p className="text-[11px] font-black uppercase tracking-wide text-amber-600">Active quote</p>
                <p className="mt-1 text-lg font-black text-amber-800">{quoteAmount}</p>
                <p className="text-xs font-semibold text-amber-700">{selectedJourney.quoteStatus || "Quote sent"}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 space-y-2">
        <p className="text-xs font-black uppercase tracking-wide text-blue-400">Current stage</p>
        <p className="text-sm font-black text-blue-800">{formatStage(detail.currentStage)}</p>
        <p className="text-xs text-blue-600">Stage is managed automatically by service request and job updates.</p>
      </div>

      <form onSubmit={submitSchedule} className="rounded-2xl border border-slate-100 bg-white p-4 space-y-3">
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">Confirm schedule</p>
        <select className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold" value={scheduleId} onChange={(event) => setScheduleId(event.target.value)}>
          <option value="">Select schedule</option>
          {detail.schedules.map((item) => <option key={item.id} value={item.id}>{item.scheduleType} - {item.status}</option>)}
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

      {(() => {
        const questions = detail.events.filter((e) => e.eventType === "customer_question");
        return questions.length > 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-amber-600"><MessageSquare className="h-3.5 w-3.5" /> Customer questions ({questions.length})</p>
            <div className="mt-2 space-y-2">
              {questions.map((q) => (
                <div key={q.id} className="rounded-xl bg-white border border-amber-100 p-3">
                  <p className="text-sm font-semibold text-slate-900">{q.message || q.title}</p>
                  <span className="text-[10px] font-bold text-amber-500">{formatDate(q.createdAt)}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-amber-600">Use Customer-visible update above to reply.</p>
          </div>
        ) : null;
      })()}

      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">Timeline</p>
        <div className="mt-3 space-y-3">
          {detail.events.map((event) => {
            const isQuestion = event.eventType === "customer_question";
            return (
              <div key={event.id} className={`rounded-xl p-3 ${isQuestion ? "bg-amber-50 border border-amber-100" : "bg-slate-50"}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className={`text-sm font-black ${isQuestion ? "text-amber-800" : "text-slate-900"}`}>{isQuestion ? "Question: " : ""}{event.title}</p>
                  <span className="text-[11px] font-bold text-slate-400">{formatDate(event.createdAt)}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{event.message}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function CustomerRepairJourneysTab() {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState<Filter>("active");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [quoteFilter, setQuoteFilter] = useState<QuoteFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  useEffect(() => {
    if (isMobile && mobileDetailOpen) {
      window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: true } }));
      return () => { window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: false } })); };
    }
  }, [isMobile, mobileDetailOpen]);

  const listQuery = useQuery({
    queryKey: ["adminRepairJourneys", filter, sourceFilter, quoteFilter, search],
    queryFn: () => adminRepairJourneysApi.getAll({
      search: search.trim() || undefined,
      sourceType: sourceFilter === "all" ? undefined : sourceFilter,
      hasQuote: quoteFilter === "all" ? undefined : quoteFilter === "sent" ? "true" : "false",
      limit: 150,
    }),
  });

  const journeys = useMemo(() => (listQuery.data || []).filter((journey) => matchesFilter(journey, filter)), [listQuery.data, filter]);
  const selected = selectedId || journeys[0]?.id || null;
  const selectedJourney = useMemo(() => journeys.find((journey) => journey.id === selected), [journeys, selected]);
  const groupedCustomers = useMemo(() => {
    const groups = new Map<string, { customerName: string; customerPhone: string; activeQuote: number | null; journeys: AdminJourneyListItem[] }>();
    for (const journey of journeys) {
      const key = customerKey(journey);
      const existing = groups.get(key) || {
        customerName: journey.customerName || "Unknown Customer",
        customerPhone: journey.customerPhone || "No phone",
        activeQuote: null,
        journeys: [],
      };
      existing.journeys.push(journey);
      if (journey.quoteAmount && !["delivered", "cancelled"].includes(journey.currentStage)) existing.activeQuote = journey.quoteAmount;
      groups.set(key, existing);
    }
    return Array.from(groups.values());
  }, [journeys]);

  const detailQuery = useQuery({
    queryKey: ["adminRepairJourney", selected],
    queryFn: () => adminRepairJourneysApi.getOne(selected || ""),
    enabled: Boolean(selected),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["adminRepairJourneys"] });
    if (selected) queryClient.invalidateQueries({ queryKey: ["adminRepairJourney", selected] });
  };

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
    { label: "Customers", value: groupedCustomers.length, tone: "blue" as const, icon: <UserRound className="h-4 w-4" /> },
    { label: "Active", value: journeys.filter((item) => !["delivered", "cancelled"].includes(item.currentStage)).length, tone: "emerald" as const, icon: <Wrench className="h-4 w-4" /> },
    { label: "Quotes", value: journeys.filter((item) => item.quoteAmount || item.quoteStatus || item.currentStage.includes("quote")).length, tone: "amber" as const, icon: <FileText className="h-4 w-4" /> },
    { label: "Done", value: journeys.filter((item) => item.currentStage === "delivered").length, tone: "violet" as const, icon: <CheckCircle2 className="h-4 w-4" /> },
  ];

  const busy = scheduleMutation.isPending || eventMutation.isPending;
  const sourceOptions: { label: string; value: SourceFilter }[] = [
    { label: "All Sources", value: "all" },
    { label: "Service Request", value: "service_request" },
    { label: "Quote", value: "quote_request" },
    { label: "Walk-in", value: "walk_in" },
    { label: "Warranty", value: "warranty" },
  ];

  return (
    <>
      <MobileTabLayout className="md:hidden">
        <MobileTabHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-500">Customer Repair History</p>
                <h1 className="text-2xl font-black text-slate-950">Repair Journeys</h1>
              </div>
              <Button size="icon" variant="outline" className="rounded-2xl" onClick={() => listQuery.refetch()}><RefreshCw className="h-4 w-4" /></Button>
            </div>
            <MobileKpiGrid items={kpis} collapsible summaryLabel="Journey pulse" />
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full h-10 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="Customer, phone, model, serial" />
            </div>
            <MobileSegmentTabs value={filter} onChange={(value) => setFilter(value as Filter)} items={[
              { label: "Active", value: "active" },
              { label: "Quotes", value: "quotes" },
              { label: "Done", value: "done" },
              { label: "All", value: "all" },
            ]} />
          </div>
        </MobileTabHeader>
        <MobileScrollContent className="space-y-1 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
          {groupedCustomers.map((group) => (
            <section key={`${group.customerName}-${group.customerPhone}`}>
              <div className="flex items-center gap-2 px-1 py-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100">
                  <UserRound className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="truncate text-[13px] font-black text-slate-900">{group.customerName}</span>
                  <span className="ml-2 text-[11px] font-semibold text-slate-400">{group.customerPhone}</span>
                </div>
                <span className="shrink-0 text-[10px] font-bold text-slate-400">{group.journeys.length}</span>
                {group.activeQuote && <Badge variant="outline" className="shrink-0 h-5 px-1.5 text-[9px] bg-amber-50 text-amber-700 border-amber-100">৳{group.activeQuote.toLocaleString()}</Badge>}
              </div>
              <div className="space-y-1.5 pl-2">
                {group.journeys.map((journey) => {
                  const isSelected = selected === journey.id;
                  return (
                    <div key={journey.id} onClick={() => { setSelectedId(journey.id); setMobileDetailOpen(true); }} className={`relative rounded-xl border bg-white overflow-hidden cursor-pointer active:scale-[0.99] transition-transform ${isSelected ? "border-blue-300 ring-1 ring-blue-100" : "border-slate-100"}`}>
                      <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${sourceTone(journey.sourceType).includes("blue") ? "bg-blue-500" : sourceTone(journey.sourceType).includes("amber") ? "bg-amber-500" : sourceTone(journey.sourceType).includes("emerald") ? "bg-emerald-500" : sourceTone(journey.sourceType).includes("violet") ? "bg-violet-500" : "bg-slate-400"}`} />
                      <div className="py-2.5 pl-4 pr-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-black text-slate-900">{deviceLabel(journey)}</p>
                            <p className="mt-0.5 flex items-center gap-2 text-[11px] font-semibold text-slate-400">
                              {journey.serialNumber && <span>S/N {journey.serialNumber}</span>}
                              <span>{displayReference(journey)}</span>
                            </p>
                          </div>
                          <Badge variant="outline" className={`shrink-0 h-5 px-1.5 text-[9px] ${toneForStage(journey.currentStage)}`}>{formatStage(journey.currentStage)}</Badge>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className={`h-5 px-1.5 text-[9px] ${sourceTone(journey.sourceType)}`}>{sourceLabel(journey.sourceType)}</Badge>
                            {journey.quoteAmount && <Badge variant="outline" className="h-5 px-1.5 text-[9px] bg-amber-50 text-amber-700 border-amber-100">৳{journey.quoteAmount.toLocaleString()}</Badge>}
                          </div>
                          <span className="text-[10px] font-bold text-slate-400">{formatDate(journey.lastEventAt || journey.updatedAt)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {!listQuery.isLoading && groupedCustomers.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-400">No repair journeys match this search.</div>
          )}
        </MobileScrollContent>
      </MobileTabLayout>

      {/* Mobile detail bottom sheet */}
      {createPortal(
        <AnimatePresence>
          {isMobile && mobileDetailOpen && detailQuery.data && (
            <div className="fixed inset-0 z-[205] md:hidden">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={() => setMobileDetailOpen(false)} />
              <MobileBottomSheetFrame onClose={() => setMobileDetailOpen(false)} className="absolute inset-x-0 bottom-0 flex max-h-[90dvh] flex-col rounded-t-[2rem] bg-white shadow-2xl">
                <div className="flex-none px-4 pb-2 pt-3">
                  <MobileBottomSheetHandle />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                  <JourneyDetailPanel
                    detail={detailQuery.data}
                    selectedJourney={selectedJourney}
                    onConfirmSchedule={(payload) => scheduleMutation.mutate(payload)}
                    onEvent={(payload) => eventMutation.mutate(payload)}
                    busy={busy}
                  />
                </div>
              </MobileBottomSheetFrame>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <div className="hidden h-full grid-cols-[minmax(0,1fr)_430px] gap-5 p-5 md:grid">
        <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-500">Customer Repair History</p>
              <h1 className="mt-1 text-3xl font-black text-slate-950">Repair Journeys</h1>
              <p className="mt-1 text-sm font-semibold text-slate-500">Customer-first repair records with safe references, source, quote, and device context.</p>
            </div>
            <Button variant="outline" className="rounded-full" onClick={() => listQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(260px,1fr)_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 rounded-2xl pl-9" placeholder="Search customer, phone, TV model, serial, SR or job" />
            </div>
            <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)} className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700">
              {sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select value={quoteFilter} onChange={(event) => setQuoteFilter(event.target.value as QuoteFilter)} className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700">
              <option value="all">All Quotes</option>
              <option value="sent">Quote Sent</option>
              <option value="none">No Quote</option>
            </select>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(["active", "quotes", "done", "all"] as Filter[]).map((item) => (
              <Button key={item} variant={filter === item ? "default" : "outline"} className="rounded-full capitalize" onClick={() => setFilter(item)}>{item}</Button>
            ))}
          </div>

          <div className="mt-5 h-[calc(100vh-18rem)] space-y-4 overflow-y-auto pr-1">
            {groupedCustomers.map((group) => (
              <section key={`${group.customerName}-${group.customerPhone}`} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-blue-500" />
                      <p className="truncate text-sm font-black text-slate-950">{group.customerName}</p>
                    </div>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">{group.customerPhone} - {group.journeys.length} repair record{group.journeys.length === 1 ? "" : "s"}</p>
                  </div>
                  {group.activeQuote && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-100">Active Quote {formatMoney(group.activeQuote)}</Badge>}
                </div>
                <div className="grid gap-3 xl:grid-cols-2">
                  {group.journeys.map((journey) => (
                    <JourneySummaryCard key={journey.id} journey={journey} selected={selected === journey.id} onSelect={() => setSelectedId(journey.id)} />
                  ))}
                </div>
              </section>
            ))}
            {!listQuery.isLoading && groupedCustomers.length === 0 && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">No repair journeys match this search.</div>
            )}
          </div>
        </section>

        <aside className="overflow-y-auto">
          {detailQuery.data ? (
            <JourneyDetailPanel
              detail={detailQuery.data}
              selectedJourney={selectedJourney}
              onConfirmSchedule={(payload) => scheduleMutation.mutate(payload)}
              onEvent={(payload) => eventMutation.mutate(payload)}
              busy={busy}
            />
          ) : (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">Select a customer repair record</div>
          )}
        </aside>
      </div>
    </>
  );
}
