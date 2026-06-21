import type { CustomerLang, TranslationKey } from "@/contexts/CustomerLanguageContext";
import type { CustomerJourneyStage, CustomerRepairJourney } from "@/lib/api/customerApi";

type Translator = (key: TranslationKey) => string;

type LabelSource = Pick<CustomerRepairJourney, "id" | "jobTicketId" | "serviceRequestId" | "quoteRequestId">;

const stageKeys: Record<CustomerJourneyStage, TranslationKey> = {
  draft: "stage.draft",
  quote_requested: "stage.quote_requested",
  quote_sent: "stage.quote_sent",
  quote_accepted: "stage.quote_accepted",
  schedule_requested: "stage.schedule_requested",
  schedule_confirmed: "stage.schedule_confirmed",
  device_waiting: "stage.device_waiting",
  device_received: "stage.device_received",
  inspection_waiting: "stage.inspection_waiting",
  inspection_started: "stage.inspection_started",
  diagnosis_ready: "stage.diagnosis_ready",
  repair_approval_required: "stage.repair_approval_required",
  repair_approved: "stage.repair_approved",
  repair_in_progress: "stage.repair_in_progress",
  repair_completed: "stage.repair_completed",
  delivery_scheduled: "stage.delivery_scheduled",
  delivered: "stage.delivered",
  cancelled: "stage.cancelled",
};

const friendlyKeys: Record<CustomerJourneyStage, TranslationKey> = {
  draft: "friendly.draft",
  quote_requested: "friendly.quote_requested",
  quote_sent: "friendly.quote_sent",
  quote_accepted: "friendly.quote_accepted",
  schedule_requested: "friendly.schedule_requested",
  schedule_confirmed: "friendly.schedule_confirmed",
  device_waiting: "friendly.device_waiting",
  device_received: "friendly.device_received",
  inspection_waiting: "friendly.inspection_waiting",
  inspection_started: "friendly.inspection_started",
  diagnosis_ready: "friendly.diagnosis_ready",
  repair_approval_required: "friendly.repair_approval_required",
  repair_approved: "friendly.repair_approved",
  repair_in_progress: "friendly.repair_in_progress",
  repair_completed: "friendly.repair_completed",
  delivery_scheduled: "friendly.delivery_scheduled",
  delivered: "friendly.delivered",
  cancelled: "friendly.cancelled",
};

const statusKeys: Record<string, TranslationKey> = {
  active: "status.active",
  pending: "status.pending",
  completed: "status.completed",
  cancelled: "status.cancelled",
  scheduled: "status.scheduled",
  confirmed: "status.confirmed",
  requested: "status.requested",
  accepted: "status.accepted",
  delivered: "status.delivered",
  ready: "status.ready",
  draft: "status.draft",
};

const serviceModeKeys: Record<string, TranslationKey> = {
  quote_only: "journey.quoteOnly",
  home_pickup: "journey.homePickup",
  pickup_and_delivery: "journey.pickupAndDelivery",
  service_center: "journey.serviceCenter",
  service_center_visit: "journey.serviceCenterVisit",
  pickup: "journey.pickup",
  drop_off: "journey.dropOff",
  home_visit: "journey.homeVisit",
  delivery: "journey.delivery",
};

const nextActionKeys: Record<string, TranslationKey> = {
  accept_quote: "journey.nextAcceptQuote",
  request_schedule: "journey.nextRequestSchedule",
  schedule: "journey.nextRequestSchedule",
  schedule_service: "journey.nextRequestSchedule",
  reschedule: "journey.nextReschedule",
  ask_question: "journey.nextAskQuestion",
  approve_repair: "journey.nextApproveRepair",
};

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function translatedLookup(value: string | null | undefined, keys: Record<string, TranslationKey>, t: Translator) {
  if (!value) return "";
  const key = keys[value.toLowerCase()];
  return key ? t(key) : titleCase(value);
}

export function formatJourneyRef(source: LabelSource) {
  if (source.jobTicketId) return source.jobTicketId;
  if (source.serviceRequestId) return source.serviceRequestId;
  if (source.quoteRequestId) return source.quoteRequestId;
  return `Repair JR-${source.id.slice(0, 6).toUpperCase()}`;
}

export function labelJourneyStage(stage: CustomerJourneyStage, t: Translator) {
  return t(stageKeys[stage]);
}

export function labelJourneyFriendly(stage: CustomerJourneyStage, fallback: string, t: Translator) {
  return t(friendlyKeys[stage]) || fallback;
}

export function labelJourneyStatus(status: string | null | undefined, fallback: string, t: Translator) {
  return translatedLookup(status, statusKeys, t) || fallback;
}

export function labelServiceMode(mode: string | null | undefined, t: Translator) {
  return translatedLookup(mode, serviceModeKeys, t);
}

export function labelScheduleType(type: string | null | undefined, t: Translator) {
  return translatedLookup(type, serviceModeKeys, t);
}

export function labelNextAction(action: string | null | undefined, fallback: string | null | undefined, t: Translator, language: CustomerLang) {
  const label = translatedLookup(action, nextActionKeys, t);
  if (label) return label;
  return language === "bn" ? t("journey.noAction") : fallback || t("journey.noAction");
}
