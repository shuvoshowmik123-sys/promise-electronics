import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  MessageSquare,
  Monitor,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
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
type ProfileTab = "active" | "history" | "warranty" | "timeline";

interface CustomerProfile {
  key: string;
  customerName: string;
  customerPhone: string;
  journeys: AdminJourneyListItem[];
  latestJourney: AdminJourneyListItem;
  latestActivityAt: string | null;
  activeCount: number;
  quoteAmount: number | null;
  quoteCount: number;
  warrantyCount: number;
  serviceRequestCount: number;
  walkInCount: number;
  rejectionCount: number;
  questionCount: number;
  attentionScore: number;
}

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

function formatDateTime(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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

function sourceAccent(source?: string | null) {
  if (source === "service_request") return "bg-blue-500";
  if (source === "quote_request") return "bg-amber-500";
  if (source === "walk_in") return "bg-emerald-500";
  if (source === "warranty") return "bg-violet-500";
  return "bg-slate-400";
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
  if (journey.jobTicketId) return "Walk-in repair";
  return "Device not specified";
}

function phoneTail(phone?: string | null) {
  const clean = (phone || "").replace(/\D/g, "");
  if (clean.length < 4) return phone || "No phone";
  return `...${clean.slice(-4)}`;
}

function isTerminal(journey: AdminJourneyListItem) {
  return ["delivered", "cancelled"].includes(journey.currentStage);
}

function matchesFilter(journey: AdminJourneyListItem, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "quotes") return Boolean(journey.quoteAmount || journey.quoteStatus || journey.currentStage.includes("quote"));
  if (filter === "done") return ["repair_completed", "delivered", "cancelled"].includes(journey.currentStage);
  return !isTerminal(journey);
}

function journeyActivityAt(journey: AdminJourneyListItem) {
  return journey.lastEventAt || journey.updatedAt || journey.createdAt || null;
}

function activityTime(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function hasQuestionSignal(journey: AdminJourneyListItem) {
  return /question|asked|reply/i.test(journey.lastEventTitle || "");
}

function hasRejectionSignal(journey: AdminJourneyListItem) {
  return journey.currentStage === "cancelled" || /reject|declin|cancel|not repair/i.test(journey.lastEventTitle || "");
}

function customerKey(journey: AdminJourneyListItem) {
  return `${journey.customerName || "Unknown Customer"}|${journey.customerPhone || "No phone"}`;
}

function buildProfiles(journeys: AdminJourneyListItem[]) {
  const groups = new Map<string, CustomerProfile>();
  for (const journey of journeys) {
    const key = customerKey(journey);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        key,
        customerName: journey.customerName || "Unknown Customer",
        customerPhone: journey.customerPhone || "No phone",
        journeys: [journey],
        latestJourney: journey,
        latestActivityAt: journeyActivityAt(journey),
        activeCount: isTerminal(journey) ? 0 : 1,
        quoteAmount: journey.quoteAmount && !isTerminal(journey) ? journey.quoteAmount : null,
        quoteCount: journey.quoteAmount || journey.quoteStatus || journey.currentStage.includes("quote") ? 1 : 0,
        warrantyCount: journey.sourceType === "warranty" ? 1 : 0,
        serviceRequestCount: journey.sourceType === "service_request" ? 1 : 0,
        walkInCount: journey.sourceType === "walk_in" ? 1 : 0,
        rejectionCount: hasRejectionSignal(journey) ? 1 : 0,
        questionCount: hasQuestionSignal(journey) ? 1 : 0,
        attentionScore: 0,
      });
      continue;
    }
    existing.journeys.push(journey);
    existing.activeCount += isTerminal(journey) ? 0 : 1;
    existing.quoteCount += journey.quoteAmount || journey.quoteStatus || journey.currentStage.includes("quote") ? 1 : 0;
    existing.warrantyCount += journey.sourceType === "warranty" ? 1 : 0;
    existing.serviceRequestCount += journey.sourceType === "service_request" ? 1 : 0;
    existing.walkInCount += journey.sourceType === "walk_in" ? 1 : 0;
    existing.rejectionCount += hasRejectionSignal(journey) ? 1 : 0;
    existing.questionCount += hasQuestionSignal(journey) ? 1 : 0;
    if (journey.quoteAmount && !isTerminal(journey)) existing.quoteAmount = Math.max(existing.quoteAmount || 0, journey.quoteAmount);
    if (activityTime(journeyActivityAt(journey)) > activityTime(existing.latestActivityAt)) {
      existing.latestJourney = journey;
      existing.latestActivityAt = journeyActivityAt(journey);
    }
  }

  return Array.from(groups.values()).map((profile) => {
    profile.journeys.sort((a, b) => activityTime(journeyActivityAt(b)) - activityTime(journeyActivityAt(a)));
    profile.attentionScore =
      profile.questionCount * 5 +
      profile.quoteCount * 3 +
      profile.rejectionCount * 2 +
      profile.activeCount;
    return profile;
  }).sort((a, b) => {
    if (b.attentionScore !== a.attentionScore) return b.attentionScore - a.attentionScore;
    return activityTime(b.latestActivityAt) - activityTime(a.latestActivityAt);
  });
}

function profileJourneys(profile: CustomerProfile, tab: ProfileTab) {
  if (tab === "active") return profile.journeys.filter((journey) => !isTerminal(journey));
  if (tab === "warranty") return profile.journeys.filter((journey) => journey.sourceType === "warranty");
  return profile.journeys;
}

function JourneyBadges({ journey, compact = false }: { journey: AdminJourneyListItem; compact?: boolean }) {
  const quoteAmount = formatMoney(journey.quoteAmount);
  const badgeClass = compact ? "h-5 px-1.5 text-[9px]" : "";
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="outline" className={`${badgeClass} ${sourceTone(journey.sourceType)}`}>{sourceLabel(journey.sourceType)}</Badge>
      {journey.srTicketNumber && <Badge variant="outline" className={`${badgeClass} bg-slate-50 text-slate-600 border-slate-100`}>SR {journey.srTicketNumber}</Badge>}
      {journey.jobTicketId && <Badge variant="outline" className={`${badgeClass} bg-slate-50 text-slate-600 border-slate-100`}>{safeRef("JOB", journey.jobTicketId)}</Badge>}
      {quoteAmount && <Badge variant="outline" className={`${badgeClass} bg-amber-50 text-amber-700 border-amber-100`}>Quote {quoteAmount}</Badge>}
      {journey.billingStatus && <Badge variant="outline" className={`${badgeClass} bg-emerald-50 text-emerald-700 border-emerald-100`}>{journey.billingStatus}</Badge>}
    </div>
  );
}

function ProfileBadges({ profile, compact = false }: { profile: CustomerProfile; compact?: boolean }) {
  const cls = compact ? "h-5 px-1.5 text-[9px]" : "";
  return (
    <div className="flex flex-wrap gap-1.5">
      {profile.activeCount > 0 && <Badge variant="outline" className={`${cls} bg-blue-50 text-blue-700 border-blue-100`}>{profile.activeCount} Active</Badge>}
      {profile.quoteAmount && <Badge variant="outline" className={`${cls} bg-amber-50 text-amber-700 border-amber-100`}>{formatMoney(profile.quoteAmount)}</Badge>}
      {profile.questionCount > 0 && <Badge variant="outline" className={`${cls} bg-amber-50 text-amber-700 border-amber-100`}>{profile.questionCount} Question</Badge>}
      {profile.rejectionCount > 0 && <Badge variant="outline" className={`${cls} bg-rose-50 text-rose-700 border-rose-100`}>{profile.rejectionCount} Closed</Badge>}
      {profile.warrantyCount > 0 && <Badge variant="outline" className={`${cls} bg-violet-50 text-violet-700 border-violet-100`}>{profile.warrantyCount} Warranty</Badge>}
    </div>
  );
}

function ProfileCard({
  profile,
  selected,
  mobile = false,
  onSelect,
}: {
  profile: CustomerProfile;
  selected?: boolean;
  mobile?: boolean;
  onSelect: () => void;
}) {
  const latest = profile.latestJourney;
  if (mobile) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={`min-h-[136px] rounded-2xl border bg-white p-3 text-left shadow-sm transition active:scale-[0.99] ${selected ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-100"}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-black text-slate-950">{profile.customerName}</p>
            <p className="mt-0.5 text-[11px] font-bold text-slate-400">{phoneTail(profile.customerPhone)}</p>
          </div>
          <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700">{profile.journeys.length}</span>
        </div>
        <p className="mt-2 line-clamp-2 min-h-[2rem] text-[11px] font-bold leading-4 text-slate-600">{deviceLabel(latest)}</p>
        <p className="mt-1 truncate text-[10px] font-bold text-slate-400">{displayReference(latest)}</p>
        <div className="mt-2 flex items-center justify-between gap-1">
          <span className="truncate text-[10px] font-bold text-slate-400">{formatDate(profile.latestActivityAt)}</span>
          {profile.attentionScore > 0 && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {profile.quoteAmount && <Badge variant="outline" className="h-5 px-1.5 text-[9px] bg-amber-50 text-amber-700 border-amber-100">Quote</Badge>}
          {profile.warrantyCount > 0 && <Badge variant="outline" className="h-5 px-1.5 text-[9px] bg-violet-50 text-violet-700 border-violet-100">Warranty</Badge>}
          {profile.rejectionCount > 0 && <Badge variant="outline" className="h-5 px-1.5 text-[9px] bg-rose-50 text-rose-700 border-rose-100">Closed</Badge>}
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition-colors ${selected ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-100 hover:border-blue-200 hover:bg-blue-50/30"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 shrink-0 text-blue-500" />
            <p className="truncate text-sm font-black text-slate-950">{profile.customerName}</p>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Phone className="h-3.5 w-3.5" />{profile.customerPhone}</p>
        </div>
        <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-100">{profile.journeys.length} Records</Badge>
      </div>
      <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Latest activity</p>
        <p className="mt-1 truncate text-sm font-black text-slate-900">{latest.lastEventTitle || latest.customerFriendlyStatus || deviceLabel(latest)}</p>
        <p className="mt-1 truncate text-xs font-bold text-slate-500">{deviceLabel(latest)} - {displayReference(latest)}</p>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <ProfileBadges profile={profile} compact />
        <span className="shrink-0 text-xs font-bold text-slate-400">{formatDate(profile.latestActivityAt)}</span>
      </div>
    </button>
  );
}

function JourneyIndexRow({
  journey,
  selected,
  onSelect,
}: {
  journey: AdminJourneyListItem;
  selected?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative w-full overflow-hidden rounded-2xl border bg-white p-3 text-left transition-colors ${selected ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-100 hover:border-blue-200"}`}
    >
      <div className={`absolute left-0 top-0 h-full w-1 ${sourceAccent(journey.sourceType)}`} />
      <div className="pl-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-950">{deviceLabel(journey)}</p>
            <p className="mt-1 truncate text-xs font-bold text-slate-500">{displayReference(journey)}{journey.serialNumber ? ` - S/N ${journey.serialNumber}` : ""}</p>
          </div>
          <Badge variant="outline" className={toneForStage(journey.currentStage)}>{formatStage(journey.currentStage)}</Badge>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <JourneyBadges journey={journey} compact />
          <span className="shrink-0 text-[11px] font-bold text-slate-400">{formatDate(journeyActivityAt(journey))}</span>
        </div>
      </div>
    </button>
  );
}

function ProfileOverview({
  profile,
  selectedJourneyId,
  onSelectJourney,
}: {
  profile: CustomerProfile;
  selectedJourneyId: string | null;
  onSelectJourney: (journeyId: string) => void;
}) {
  const active = profile.journeys.filter((journey) => !isTerminal(journey));
  const history = profile.journeys.filter((journey) => isTerminal(journey));
  const warranties = profile.journeys.filter((journey) => journey.sourceType === "warranty");
  const latest = profile.latestJourney;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-blue-500">Customer profile</p>
            <h2 className="mt-1 truncate text-xl font-black text-slate-950">{profile.customerName}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{profile.customerPhone}</p>
          </div>
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100">{profile.journeys.length} records</Badge>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-black uppercase text-slate-400">Active</p>
            <p className="mt-1 text-lg font-black text-slate-950">{profile.activeCount}</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-3">
            <p className="text-[10px] font-black uppercase text-amber-500">Quotes</p>
            <p className="mt-1 text-lg font-black text-amber-800">{profile.quoteCount}</p>
          </div>
          <div className="rounded-xl bg-violet-50 p-3">
            <p className="text-[10px] font-black uppercase text-violet-500">Warranty</p>
            <p className="mt-1 text-lg font-black text-violet-800">{profile.warrantyCount}</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Latest update</p>
          <p className="mt-1 text-sm font-black text-slate-900">{latest.lastEventTitle || latest.customerFriendlyStatus || "Repair activity updated"}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{deviceLabel(latest)} - {formatDateTime(profile.latestActivityAt)}</p>
        </div>
        <div className="mt-3">
          <ProfileBadges profile={profile} />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">Active repairs</p>
        <div className="mt-3 space-y-2">
          {(active.length ? active : profile.journeys.slice(0, 2)).map((journey) => (
            <JourneyIndexRow key={journey.id} journey={journey} selected={selectedJourneyId === journey.id} onSelect={() => onSelectJourney(journey.id)} />
          ))}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">History index</p>
          <div className="mt-3 space-y-2">
            {(history.length ? history : profile.journeys.slice(0, 3)).map((journey) => (
              <button key={journey.id} type="button" onClick={() => onSelectJourney(journey.id)} className="flex w-full items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-left">
                <span className="min-w-0 truncate text-xs font-bold text-slate-700">{displayReference(journey)}</span>
                <span className="shrink-0 text-[11px] font-bold text-slate-400">{formatDate(journeyActivityAt(journey))}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">Warranty</p>
          <div className="mt-3 space-y-2">
            {warranties.length > 0 ? warranties.map((journey) => (
              <button key={journey.id} type="button" onClick={() => onSelectJourney(journey.id)} className="flex w-full items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-left">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-violet-600" />
                <span className="min-w-0 truncate text-xs font-bold text-violet-800">{deviceLabel(journey)}</span>
              </button>
            )) : <p className="rounded-xl bg-slate-50 px-3 py-4 text-xs font-semibold text-slate-400">No warranty journey in this profile.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineList({
  profile,
  onSelectJourney,
}: {
  profile: CustomerProfile;
  onSelectJourney: (journeyId: string) => void;
}) {
  return (
    <div className="space-y-2">
      {profile.journeys.map((journey) => (
        <button key={journey.id} type="button" onClick={() => onSelectJourney(journey.id)} className="flex w-full items-start gap-3 rounded-2xl border border-slate-100 bg-white p-3 text-left">
          <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${sourceAccent(journey.sourceType)}`} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-slate-900">{journey.lastEventTitle || formatStage(journey.currentStage)}</p>
            <p className="mt-1 truncate text-xs font-semibold text-slate-500">{deviceLabel(journey)} - {displayReference(journey)}</p>
          </div>
          <span className="shrink-0 text-[11px] font-bold text-slate-400">{formatDate(journeyActivityAt(journey))}</span>
        </button>
      ))}
    </div>
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

  useEffect(() => {
    setScheduleId(detail.schedules[0]?.id || "");
    setConfirmedDate("");
    setConfirmedTimeWindow("");
    setAdminNote("");
  }, [detail.id, detail.schedules]);

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
  const questions = detail.events.filter((event) => event.eventType === "customer_question");

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-blue-500">{selectedJourney ? sourceLabel(selectedJourney.sourceType) : "Repair Journey"}</p>
            <h2 className="mt-2 truncate text-xl font-black text-slate-950">{selectedJourney ? deviceLabel(selectedJourney) : "Repair timeline"}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{selectedJourney ? displayReference(selectedJourney) : "Focused detail"}</p>
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

      {questions.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-amber-600"><MessageSquare className="h-3.5 w-3.5" /> Customer questions ({questions.length})</p>
          <div className="mt-2 space-y-2">
            {questions.map((question) => (
              <div key={question.id} className="rounded-xl border border-amber-100 bg-white p-3">
                <p className="text-sm font-semibold text-slate-900">{question.message || question.title}</p>
                <span className="text-[10px] font-bold text-amber-500">{formatDate(question.createdAt)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-amber-600">Use Customer-visible update below to reply.</p>
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">Timeline</p>
        <div className="mt-3 space-y-3">
          {detail.events.map((event) => {
            const isQuestion = event.eventType === "customer_question";
            return (
              <div key={event.id} className={`rounded-xl p-3 ${isQuestion ? "border border-amber-100 bg-amber-50" : "bg-slate-50"}`}>
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
    </div>
  );
}

function ProfileSheetContent({
  profile,
  tab,
  selectedJourneyId,
  detail,
  busy,
  onTabChange,
  onSelectJourney,
  onBackToIndex,
  onConfirmSchedule,
  onEvent,
}: {
  profile: CustomerProfile;
  tab: ProfileTab;
  selectedJourneyId: string | null;
  detail?: CustomerRepairJourneyDetail & { adminNote?: string | null };
  busy: boolean;
  onTabChange: (tab: ProfileTab) => void;
  onSelectJourney: (journeyId: string) => void;
  onBackToIndex: () => void;
  onConfirmSchedule: (payload: { scheduleId: string; confirmedDate: string; confirmedTimeWindow: string; adminNote?: string }) => void;
  onEvent: (payload: { eventType: string; title: string; message?: string; isCustomerVisible?: boolean }) => void;
}) {
  const selectedJourney = selectedJourneyId ? profile.journeys.find((journey) => journey.id === selectedJourneyId) : undefined;

  if (selectedJourneyId && detail) {
    return (
      <div className="space-y-3">
        <Button type="button" variant="outline" className="h-10 rounded-full" onClick={onBackToIndex}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Profile index
        </Button>
        <JourneyDetailPanel detail={detail} selectedJourney={selectedJourney} onConfirmSchedule={onConfirmSchedule} onEvent={onEvent} busy={busy} />
      </div>
    );
  }

  const shownJourneys = profileJourneys(profile, tab);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-blue-500">Customer profile</p>
            <h2 className="mt-1 truncate text-xl font-black text-slate-950">{profile.customerName}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{profile.customerPhone}</p>
          </div>
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100">{profile.journeys.length}</Badge>
        </div>
        <div className="mt-3">
          <ProfileBadges profile={profile} />
        </div>
      </div>

      <MobileSegmentTabs value={tab} onChange={(value) => onTabChange(value as ProfileTab)} items={[
        { label: "Active", value: "active" },
        { label: "History", value: "history" },
        { label: "Warranty", value: "warranty" },
        { label: "Timeline", value: "timeline" },
      ]} />

      {tab === "timeline" ? (
        <TimelineList profile={profile} onSelectJourney={onSelectJourney} />
      ) : (
        <div className="space-y-2">
          {shownJourneys.length > 0 ? shownJourneys.map((journey) => (
            <JourneyIndexRow key={journey.id} journey={journey} onSelect={() => onSelectJourney(journey.id)} />
          )) : (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-center text-sm font-semibold text-slate-400">No records in this section.</div>
          )}
        </div>
      )}
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
  const [selectedProfileKey, setSelectedProfileKey] = useState<string | null>(null);
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false);
  const [profileTab, setProfileTab] = useState<ProfileTab>("active");

  useEffect(() => {
    if (isMobile && mobileProfileOpen) {
      window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: true } }));
      return () => { window.dispatchEvent(new CustomEvent("admin:mobile-chrome", { detail: { hidden: false } })); };
    }
  }, [isMobile, mobileProfileOpen]);

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
  const profiles = useMemo(() => buildProfiles(journeys), [journeys]);
  const selectedProfile = useMemo(() => {
    if (!profiles.length) return null;
    return profiles.find((profile) => profile.key === selectedProfileKey) || profiles[0];
  }, [profiles, selectedProfileKey]);
  const selectedJourney = useMemo(() => {
    if (!selectedProfile || !selectedJourneyId) return undefined;
    return selectedProfile.journeys.find((journey) => journey.id === selectedJourneyId);
  }, [selectedProfile, selectedJourneyId]);

  useEffect(() => {
    if (selectedProfileKey && !profiles.some((profile) => profile.key === selectedProfileKey)) {
      setSelectedProfileKey(null);
      setSelectedJourneyId(null);
    }
  }, [profiles, selectedProfileKey]);

  const detailQuery = useQuery({
    queryKey: ["adminRepairJourney", selectedJourneyId],
    queryFn: () => adminRepairJourneysApi.getOne(selectedJourneyId || ""),
    enabled: Boolean(selectedJourneyId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["adminRepairJourneys"] });
    if (selectedJourneyId) queryClient.invalidateQueries({ queryKey: ["adminRepairJourney", selectedJourneyId] });
  };

  const scheduleMutation = useMutation({
    mutationFn: (payload: { scheduleId: string; confirmedDate: string; confirmedTimeWindow: string; adminNote?: string }) => adminRepairJourneysApi.confirmSchedule(selectedJourneyId || "", payload),
    onSuccess: () => { toast.success("Schedule confirmed"); invalidate(); },
    onError: (error: Error) => toast.error(error.message || "Failed to confirm schedule"),
  });
  const eventMutation = useMutation({
    mutationFn: (payload: { eventType: string; title: string; message?: string; isCustomerVisible?: boolean }) => adminRepairJourneysApi.addEvent(selectedJourneyId || "", payload),
    onSuccess: () => { toast.success("Update added"); invalidate(); },
    onError: (error: Error) => toast.error(error.message || "Failed to add update"),
  });

  const kpis = [
    { label: "Profiles", value: profiles.length, tone: "blue" as const, icon: <UserRound className="h-4 w-4" /> },
    { label: "Active", value: journeys.filter((item) => !isTerminal(item)).length, tone: "emerald" as const, icon: <Wrench className="h-4 w-4" /> },
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

  const selectProfile = (profile: CustomerProfile, openMobile = false) => {
    setSelectedProfileKey(profile.key);
    setSelectedJourneyId(null);
    setProfileTab("active");
    if (openMobile) setMobileProfileOpen(true);
  };

  return (
    <>
      <MobileTabLayout className="md:hidden">
        <MobileTabHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-500">Customer Repair Profiles</p>
                <h1 className="text-2xl font-black text-slate-950">Repair Journeys</h1>
              </div>
              <Button size="icon" variant="outline" className="rounded-2xl" onClick={() => listQuery.refetch()}><RefreshCw className="h-4 w-4" /></Button>
            </div>
            <MobileKpiGrid items={kpis} collapsible summaryLabel="Profile pulse" />
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="Customer, phone, model, serial" />
            </div>
            <MobileSegmentTabs value={filter} onChange={(value) => setFilter(value as Filter)} items={[
              { label: "Active", value: "active" },
              { label: "Quotes", value: "quotes" },
              { label: "Done", value: "done" },
              { label: "All", value: "all" },
            ]} />
          </div>
        </MobileTabHeader>
        <MobileScrollContent className="pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-2 gap-2">
            {profiles.map((profile) => (
              <ProfileCard key={profile.key} profile={profile} mobile selected={selectedProfile?.key === profile.key} onSelect={() => selectProfile(profile, true)} />
            ))}
          </div>
          {!listQuery.isLoading && profiles.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-400">No repair profiles match this search.</div>
          )}
        </MobileScrollContent>
      </MobileTabLayout>

      {createPortal(
        <AnimatePresence>
          {isMobile && mobileProfileOpen && selectedProfile && (
            <div className="fixed inset-0 z-[205] md:hidden">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={() => setMobileProfileOpen(false)} />
              <MobileBottomSheetFrame onClose={() => setMobileProfileOpen(false)} className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-[2rem] bg-white shadow-2xl">
                <div className="flex-none px-4 pb-2 pt-3">
                  <MobileBottomSheetHandle />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
                  <ProfileSheetContent
                    profile={selectedProfile}
                    tab={profileTab}
                    selectedJourneyId={selectedJourneyId}
                    detail={detailQuery.data}
                    busy={busy}
                    onTabChange={(tab) => { setProfileTab(tab); setSelectedJourneyId(null); }}
                    onSelectJourney={setSelectedJourneyId}
                    onBackToIndex={() => setSelectedJourneyId(null)}
                    onConfirmSchedule={(payload) => scheduleMutation.mutate(payload)}
                    onEvent={(payload) => eventMutation.mutate(payload)}
                  />
                </div>
              </MobileBottomSheetFrame>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <div className="hidden h-full grid-cols-[390px_minmax(0,1fr)] gap-5 p-5 md:grid">
        <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-500">Customer Repair Profiles</p>
              <h1 className="mt-1 text-3xl font-black text-slate-950">Repair Journeys</h1>
              <p className="mt-1 text-sm font-semibold text-slate-500">Profiles sorted by customer activity, quotes, questions, warranty, and repair history.</p>
            </div>
            <Button variant="outline" size="icon" className="rounded-full" onClick={() => listQuery.refetch()}><RefreshCw className="h-4 w-4" /></Button>
          </div>

          <div className="mt-5 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 rounded-2xl pl-9" placeholder="Search customer, phone, model, serial, SR or job" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)} className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700">
                {sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <select value={quoteFilter} onChange={(event) => setQuoteFilter(event.target.value as QuoteFilter)} className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700">
                <option value="all">All Quotes</option>
                <option value="sent">Quote Sent</option>
                <option value="none">No Quote</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["active", "quotes", "done", "all"] as Filter[]).map((item) => (
                <Button key={item} variant={filter === item ? "default" : "outline"} className="h-9 rounded-full px-3 capitalize" onClick={() => setFilter(item)}>{item}</Button>
              ))}
            </div>
          </div>

          <div className="mt-5 h-[calc(100vh-18rem)] space-y-3 overflow-y-auto pr-1">
            {profiles.map((profile) => (
              <ProfileCard key={profile.key} profile={profile} selected={selectedProfile?.key === profile.key} onSelect={() => selectProfile(profile)} />
            ))}
            {!listQuery.isLoading && profiles.length === 0 && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">No repair profiles match this search.</div>
            )}
          </div>
        </section>

        <section className="min-w-0 overflow-y-auto rounded-3xl border border-slate-200 bg-slate-50/60 p-5">
          {selectedProfile ? (
            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_430px]">
              <ProfileOverview profile={selectedProfile} selectedJourneyId={selectedJourneyId} onSelectJourney={setSelectedJourneyId} />
              <aside className="min-w-0">
                {selectedJourneyId && detailQuery.data ? (
                  <div className="space-y-3">
                    <Button type="button" variant="outline" className="h-10 rounded-full" onClick={() => setSelectedJourneyId(null)}>
                      <ArrowLeft className="mr-2 h-4 w-4" /> Profile overview
                    </Button>
                    <JourneyDetailPanel
                      detail={detailQuery.data}
                      selectedJourney={selectedJourney}
                      onConfirmSchedule={(payload) => scheduleMutation.mutate(payload)}
                      onEvent={(payload) => eventMutation.mutate(payload)}
                      busy={busy}
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-100 bg-white p-4">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">Timeline index</p>
                      <div className="mt-3">
                        <TimelineList profile={selectedProfile} onSelectJourney={setSelectedJourneyId} />
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-100 bg-white p-4">
                        <Activity className="h-5 w-5 text-blue-500" />
                        <p className="mt-2 text-sm font-black text-slate-900">Recent activity first</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">Select any timeline row to inspect the exact service request, walk-in job, warranty, quote, rejection, or customer-visible event.</p>
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-white p-4">
                        <Clock3 className="h-5 w-5 text-amber-500" />
                        <p className="mt-2 text-sm font-black text-slate-900">Profile owned</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">This tab stays a history browser. Operational work remains in Service Requests, Jobs, and Pickup.</p>
                      </div>
                    </div>
                  </div>
                )}
              </aside>
            </div>
          ) : (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Select a customer profile</div>
          )}
        </section>
      </div>
    </>
  );
}
