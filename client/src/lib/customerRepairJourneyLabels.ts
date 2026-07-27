import type { CustomerLang, TranslationKey } from "@/contexts/CustomerLanguageContext";
import type { CustomerJourneyStage, CustomerRepairJourney } from "@/lib/api/customerApi";

type Translator = (key: TranslationKey) => string;

type LabelSource = Pick<CustomerRepairJourney, "id" | "jobTicketId" | "serviceRequestId" | "quoteRequestId">;

/** Public fields the presentation helper may read — no free-form staff notes. */
export type JourneyPresentationSource = {
  currentStage: CustomerJourneyStage | string;
  customerFriendlyStatus?: string | null;
  serviceMode?: string | null;
  pickupRequired?: boolean | null;
  dropoffRequired?: boolean | null;
  srTicketNumber?: string | null;
  lastEventTitle?: string | null;
  lastEventAt?: string | null;
  updatedAt?: string | null;
  events?: Array<{ title?: string | null; createdAt?: string | null }>;
};

export type JourneyPresentation = {
  title: string;
  explanation: string;
  nextLine: string;
  reassurance: string | null;
  toneStage: string;
  isAdditionalInspection: boolean;
  isFinalTesting: boolean;
  isReady: boolean;
  isDelivered: boolean;
};

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
  final_testing: "stage.final_testing",
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
  final_testing: "friendly.final_testing",
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
  walk_in: "journey.serviceCenter",
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

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

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

/** Server-provided safe ticket only — never derive JOB-… / Repair #… / UUIDs in the browser. */
export function safeCustomerTicketRef(source: {
  srTicketNumber?: string | null;
}): string | null {
  const ticket = source.srTicketNumber?.trim();
  return ticket ? ticket : null;
}

/** @deprecated Prefer safeCustomerTicketRef — UUID-derived refs are not customer-safe. */
export function formatJourneyRef(source: LabelSource) {
  void source;
  return "";
}

export function labelJourneyStage(stage: CustomerJourneyStage | string, t: Translator) {
  const key = stageKeys[stage as CustomerJourneyStage];
  return key ? t(key) : titleCase(String(stage || ""));
}

export function labelJourneyFriendly(
  stage: CustomerJourneyStage | string,
  fallback: string,
  t: Translator,
) {
  const key = friendlyKeys[stage as CustomerJourneyStage];
  return (key ? t(key) : "") || fallback;
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

export function labelNextAction(
  action: string | null | undefined,
  fallback: string | null | undefined,
  t: Translator,
  language: CustomerLang,
) {
  const label = translatedLookup(action, nextActionKeys, t);
  if (label) return label;
  return language === "bn" ? t("journey.noAction") : fallback || t("journey.noAction");
}

function isPickupOrDeliveryMode(source: JourneyPresentationSource): boolean {
  const mode = (source.serviceMode || "").toLowerCase();
  if (
    mode.includes("pickup") ||
    mode.includes("delivery") ||
    mode === "home_visit" ||
    mode === "home_pickup" ||
    mode === "pickup_and_delivery"
  ) {
    return true;
  }
  if (mode.includes("service_center") || mode === "walk_in" || mode === "drop_off") {
    return false;
  }
  if (source.pickupRequired || source.dropoffRequired) return true;
  return false;
}

function latestSafeEventTitle(source: JourneyPresentationSource): string {
  if (source.events && source.events.length > 0) {
    const last = source.events[source.events.length - 1];
    return String(last?.title || "").trim();
  }
  return String(source.lastEventTitle || "").trim();
}

function latestSafeEventAt(source: JourneyPresentationSource): Date | null {
  const raw =
    (source.events && source.events.length > 0
      ? source.events[source.events.length - 1]?.createdAt
      : null) ||
    source.lastEventAt ||
    source.updatedAt ||
    null;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isAdditionalInspectionEvent(title: string): boolean {
  return /additional\s*inspection/i.test(title);
}

/**
 * Customer-facing presentation from public journey fields + known-safe latest event title only.
 * Does not read staff notes, invent status from clocks (except display-only 2h reassurance), or set job status.
 */
export function presentCustomerJourney(
  source: JourneyPresentationSource,
  t: Translator,
  now: Date = new Date(),
): JourneyPresentation {
  const stage = String(source.currentStage || "");
  const eventTitle = latestSafeEventTitle(source);
  const pickupMode = isPickupOrDeliveryMode(source);

  if (isAdditionalInspectionEvent(eventTitle) && stage !== "delivered" && stage !== "cancelled") {
    return {
      title: t("stage.additional_inspection"),
      explanation: t("friendly.additional_inspection"),
      nextLine: t("journey.nextAdditionalInspection"),
      reassurance: null,
      toneStage: "repair_in_progress",
      isAdditionalInspection: true,
      isFinalTesting: false,
      isReady: false,
      isDelivered: false,
    };
  }

  if (stage === "final_testing") {
    const eventAt = latestSafeEventAt(source);
    const stale =
      eventAt != null && now.getTime() - eventAt.getTime() >= TWO_HOURS_MS;
    return {
      title: t("stage.final_testing"),
      explanation: t("friendly.final_testing"),
      nextLine: t("journey.nextFinalTesting"),
      reassurance: stale ? t("journey.reassuranceFinalTesting") : null,
      toneStage: "final_testing",
      isAdditionalInspection: false,
      isFinalTesting: true,
      isReady: false,
      isDelivered: false,
    };
  }

  if (stage === "repair_completed") {
    return {
      title: pickupMode ? t("stage.repair_completed_return") : t("stage.repair_completed"),
      explanation: pickupMode ? t("friendly.repair_completed_return") : t("friendly.repair_completed"),
      nextLine: pickupMode ? t("journey.nextReadyReturn") : t("journey.nextReadyCollection"),
      reassurance: null,
      toneStage: "repair_completed",
      isAdditionalInspection: false,
      isFinalTesting: false,
      isReady: true,
      isDelivered: false,
    };
  }

  if (stage === "delivered") {
    return {
      title: pickupMode ? t("stage.delivered") : t("stage.delivered_collected"),
      explanation: pickupMode ? t("friendly.delivered") : t("friendly.delivered_collected"),
      nextLine: t("journey.nextDelivered"),
      reassurance: null,
      toneStage: "delivered",
      isAdditionalInspection: false,
      isFinalTesting: false,
      isReady: false,
      isDelivered: true,
    };
  }

  const stageKey = stage as CustomerJourneyStage;
  const title = stageKeys[stageKey] ? t(stageKeys[stageKey]) : titleCase(stage);
  const explanation =
    (friendlyKeys[stageKey] ? t(friendlyKeys[stageKey]) : "") ||
    source.customerFriendlyStatus ||
    title;

  return {
    title,
    explanation,
    nextLine: t("journey.noAction"),
    reassurance: null,
    toneStage: stage || "active",
    isAdditionalInspection: false,
    isFinalTesting: false,
    isReady: false,
    isDelivered: false,
  };
}

/** Filter customer-safe timeline rows — drop empty / internal-looking titles. */
export function isCustomerSafeEventTitle(title: string | null | undefined): boolean {
  if (!title || !title.trim()) return false;
  if (/FORCED_|HANDOVER_|corporate_declaration|UUID|nanoid/i.test(title)) return false;
  return true;
}
