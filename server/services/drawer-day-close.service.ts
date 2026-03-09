import { notificationRepo, posRepo, settingsRepo, userRepo } from "../repositories/index.js";
import { auditLogger } from "../utils/auditLogger.js";
import { broadcastAdminEvent } from "../routes/middleware/sse-broker.js";

const DAY_CLOSE_ENABLED_KEY = "drawer_day_close_enabled";
const DAY_CLOSE_TIME_KEY = "drawer_day_close_time";
const DAY_CLOSE_TIMEZONE_KEY = "drawer_day_close_timezone";
const DAY_CLOSE_LAST_RUN_DATE_KEY = "drawer_day_close_last_run_date";

const DEFAULT_DAY_CLOSE_TIME = "23:59";
const DEFAULT_DAY_CLOSE_TIMEZONE = "Asia/Dhaka";
const SCHEDULER_INTERVAL_MS = 60_000;

type DayCloseTrigger = "scheduler" | "manual";

export type DrawerDayCloseRunResult = {
  executed: boolean;
  reason?: string;
  sessionId?: string;
  updatedStatus?: string;
  closedAt?: string;
  outcome?: string;
  notes?: string;
};

type DrawerDayCloseConfig = {
  enabled: boolean;
  cutoffTime: string;
  timezone: string;
  lastRunDate?: string;
};

let schedulerHandle: NodeJS.Timeout | null = null;
let schedulerTickInProgress = false;
let pipelineInProgress = false;

function parseBooleanValue(value: unknown, fallback: boolean = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return fallback;
}

function normalizeCutoffTime(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_DAY_CLOSE_TIME;
  const trimmed = value.trim();
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(trimmed) ? trimmed : DEFAULT_DAY_CLOSE_TIME;
}

function normalizeTimezone(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_DAY_CLOSE_TIMEZONE;
  const candidate = value.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_DAY_CLOSE_TIMEZONE;
  }
}

function formatLocalDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

function formatLocalHm(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";

  return `${hour}:${minute}`;
}

function appendAutoCloseNotes(existing: string | null | undefined, message: string): string {
  const base = (existing ?? "").trim();
  return base ? `${base}\n${message}` : message;
}

function normalizeRole(role: unknown): string {
  if (typeof role !== "string") return "";
  return role.trim().toLowerCase().replace(/\s+/g, "_");
}

async function getDayCloseConfig(): Promise<DrawerDayCloseConfig> {
  const [enabledSetting, timeSetting, timezoneSetting, lastRunSetting] = await Promise.all([
    settingsRepo.getSetting(DAY_CLOSE_ENABLED_KEY),
    settingsRepo.getSetting(DAY_CLOSE_TIME_KEY),
    settingsRepo.getSetting(DAY_CLOSE_TIMEZONE_KEY),
    settingsRepo.getSetting(DAY_CLOSE_LAST_RUN_DATE_KEY),
  ]);

  return {
    enabled: parseBooleanValue(enabledSetting?.value, true),
    cutoffTime: normalizeCutoffTime(timeSetting?.value),
    timezone: normalizeTimezone(timezoneSetting?.value),
    lastRunDate: lastRunSetting?.value?.trim() || undefined,
  };
}

async function notifyAdmins(title: string, message: string, type: "info" | "alert"): Promise<void> {
  const usersResult = await userRepo.getAllUsers(1, 500);
  const adminUsers = usersResult.items.filter((user: any) => {
    const role = normalizeRole(user?.role);
    return role === "super_admin" || role === "admin";
  });

  for (const admin of adminUsers) {
    await notificationRepo.createNotification({
      userId: admin.id,
      title,
      message,
      type,
    });
  }
}

async function executeDayClosePipeline(
  trigger: DayCloseTrigger,
  triggeredBy?: { id: string; name: string }
): Promise<DrawerDayCloseRunResult> {
  if (pipelineInProgress) {
    return { executed: false, reason: "day_close_in_progress" };
  }

  pipelineInProgress = true;
  try {
    const activeSession = await posRepo.getCurrentDrawerSession();
    if (!activeSession) {
      return { executed: false, reason: "no_active_session" };
    }

    const now = new Date();
    const triggerLabel = trigger === "manual" ? "manual run-now trigger" : "scheduled cutoff";
    const closedAtLabel = now.toISOString();

    let nextStatus: string;
    let autoCloseNote: string;
    let outcome: string;

    if (activeSession.status === "open") {
      nextStatus = "counting";
      autoCloseNote = `[AUTO DAY-CLOSE ${closedAtLabel}] Register auto-closed at cutoff; blind drop missing; review required.`;
      outcome = "auto_closed_open_session";
    } else if (activeSession.status === "counting") {
      nextStatus = "counting";
      autoCloseNote = `[AUTO DAY-CLOSE ${closedAtLabel}] Register auto-closed pending Super Admin reconciliation.`;
      outcome = "auto_closed_counting_session";
    } else {
      return {
        executed: false,
        reason: "unsupported_status",
        sessionId: activeSession.id,
        updatedStatus: activeSession.status,
      };
    }

    const mergedNotes = appendAutoCloseNotes(activeSession.notes, autoCloseNote);
    const updated = await posRepo.updateDrawerSession(activeSession.id, {
      status: nextStatus,
      closedAt: now,
      notes: mergedNotes,
    });

    if (!updated) {
      return {
        executed: false,
        reason: "session_update_failed",
        sessionId: activeSession.id,
      };
    }

    const actorName = triggeredBy?.name || "System";
    const notifyTitle = "Drawer auto-closed at day-end";
    const notifyMessage = `Session ${updated.id} opened by ${updated.openedByName} was closed by ${triggerLabel}. Review required before reconciliation.`;

    try {
      await notifyAdmins(notifyTitle, notifyMessage, "alert");
    } catch (notificationError) {
      console.error("[Drawer Day-Close] Failed to notify admins:", notificationError);
    }

    await auditLogger.log({
      userId: triggeredBy?.id || updated.openedBy,
      action: "AUTO_DAY_CLOSE",
      entity: "DrawerSession",
      entityId: updated.id,
      details: `${actorName} executed ${triggerLabel}. ${autoCloseNote}`,
      newValue: {
        status: updated.status,
        closedAt: updated.closedAt,
        trigger,
      },
      severity: "warning",
    });

    broadcastAdminEvent({
      topic: 'pos',
      action: 'status_changed',
      invalidate: ["dashboardStats", "cashDrawer", "pos"],
      payload: {
        sessionId: updated.id,
        status: updated.status,
        trigger,
      },
      toast: {
        level: 'info',
        title: 'Drawer session auto-closed',
        message: `A drawer session was automatically closed by the background scheduler.`,
        sound: true,
      }
    });

    return {
      executed: true,
      sessionId: updated.id,
      updatedStatus: updated.status,
      closedAt: updated.closedAt ? new Date(updated.closedAt).toISOString() : now.toISOString(),
      outcome,
      notes: autoCloseNote,
    };
  } finally {
    pipelineInProgress = false;
  }
}

export async function runDrawerDayCloseNow(triggeredBy?: { id: string; name: string }): Promise<DrawerDayCloseRunResult> {
  return executeDayClosePipeline("manual", triggeredBy);
}

export async function runScheduledDrawerDayCloseTick(): Promise<DrawerDayCloseRunResult | null> {
  const config = await getDayCloseConfig();
  if (!config.enabled) return null;

  const now = new Date();
  const todayLocal = formatLocalDate(now, config.timezone);
  const currentHm = formatLocalHm(now, config.timezone);
  const activeSession = await posRepo.getCurrentDrawerSession();

  let hasStaleUnresolvedSession = false;
  if (activeSession?.openedAt) {
    const openedAt = new Date(activeSession.openedAt);
    if (!Number.isNaN(openedAt.getTime())) {
      const openedLocalDate = formatLocalDate(openedAt, config.timezone);
      hasStaleUnresolvedSession = openedLocalDate < todayLocal;
    }
  }

  if (currentHm < config.cutoffTime && !hasStaleUnresolvedSession) return null;
  if (config.lastRunDate === todayLocal) {
    return { executed: false, reason: "already_ran_today" };
  }

  const result = await executeDayClosePipeline("scheduler");

  if (result.reason !== "day_close_in_progress" && result.reason !== "session_update_failed") {
    await settingsRepo.upsertSetting({
      key: DAY_CLOSE_LAST_RUN_DATE_KEY,
      value: todayLocal,
    });
  }

  return result;
}

async function schedulerTick(): Promise<void> {
  if (schedulerTickInProgress) return;
  schedulerTickInProgress = true;
  try {
    const result = await runScheduledDrawerDayCloseTick();
    if (result?.executed) {
      console.log(`[Drawer Day-Close] Auto-closed session ${result.sessionId} (${result.updatedStatus}).`);
    } else if (result?.reason === "already_ran_today") {
      console.log("[Drawer Day-Close] Skip: already ran today.");
    }
  } catch (error) {
    console.error("[Drawer Day-Close] Scheduler tick failed:", error);
  } finally {
    schedulerTickInProgress = false;
  }
}

export function startDrawerDayCloseScheduler(): void {
  if (schedulerHandle) return;

  schedulerHandle = setInterval(() => {
    void schedulerTick();
  }, SCHEDULER_INTERVAL_MS);
  schedulerHandle.unref?.();

  void schedulerTick();
  console.log("[Drawer Day-Close] Scheduler started (1-minute cadence).");
}

export function stopDrawerDayCloseScheduler(): void {
  if (!schedulerHandle) return;
  clearInterval(schedulerHandle);
  schedulerHandle = null;
  console.log("[Drawer Day-Close] Scheduler stopped.");
}
