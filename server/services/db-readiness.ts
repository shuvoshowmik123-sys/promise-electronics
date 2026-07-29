import { promises as dnsPromises } from 'dns';
import { db, resetDbPool, getDbPoolDiagnostics } from '../db.js';
import { sql } from 'drizzle-orm';
import { getMainSchemaState, isMainSchemaComplete, isMainSchemaFailed, recordMainSchemaFailed, REQUIRED_MAIN_SCHEMA_VERSION } from './main-schema-migrate.service.js';

type ReadinessState = 'initializing' | 'checking' | 'ready' | 'degraded';

interface OptionalJobStatus {
  name: string;
  status: 'ok' | 'failed' | 'skipped';
  error?: string;
}

interface ReadinessInfo {
  state: ReadinessState;
  dbConnected: boolean;
  mainSchemaComplete: boolean;
  mainSchemaFailed: boolean;
  mainSchemaError: string | null;
  mainSchemaVersion: string | null;
  mainSchemaRequiredVersion: string;
  /** @deprecated HOTFIX-2: observational only — never gates readiness. Prefer optionalJobsComplete. */
  migrationsComplete: boolean;
  /** True when optional MAIN seeds/backfills finished (or were skipped). Never gates /ready. */
  optionalJobsComplete: boolean;
  lastCheck: Date | null;
  lastError: string | null;
  checkCount: number;
  consecutiveFailures: number;
  degradedSince: Date | null;
  optionalJobs: OptionalJobStatus[];
}

let readinessState: ReadinessInfo = {
  state: 'initializing',
  dbConnected: false,
  mainSchemaComplete: false,
  mainSchemaFailed: false,
  mainSchemaError: null,
  mainSchemaVersion: null,
  mainSchemaRequiredVersion: REQUIRED_MAIN_SCHEMA_VERSION,
  migrationsComplete: false,
  optionalJobsComplete: false,
  lastCheck: null,
  lastError: null,
  checkCount: 0,
  consecutiveFailures: 0,
  degradedSince: null,
  optionalJobs: [],
};

const MAX_RETRIES = 10;
const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 10000;
const WATCHDOG_INTERVAL_MS = 45_000;

let watchdogInterval: ReturnType<typeof setInterval> | null = null;
let watchdogInProgress = false;
let startCalled = false;

export function getReadinessState(): ReadinessInfo {
  const mainState = getMainSchemaState();
  return {
    ...readinessState,
    mainSchemaComplete: isMainSchemaComplete(),
    mainSchemaFailed: isMainSchemaFailed(),
    mainSchemaError: mainState.error,
    mainSchemaVersion: mainState.currentVersion,
    mainSchemaRequiredVersion: REQUIRED_MAIN_SCHEMA_VERSION,
  };
}

export function isDbReady(): boolean {
  return readinessState.state === 'ready';
}

export function isMainSchemaVerifiedComplete(): boolean {
  return readinessState.mainSchemaComplete;
}

export function markMainSchemaComplete(version: string | null): void {
  readinessState.mainSchemaComplete = true;
  readinessState.mainSchemaVersion = version;
  updateReadinessState();
  startWatchdog();
  // If first connection check has not finished, re-evaluate ASAP so /ready can flip without waiting for optional jobs.
  if (!readinessState.dbConnected) {
    forceReadinessCheck();
  }
}

/**
 * Re-runs the read-only MAIN schema ledger verification. Supplied by the
 * startup module so this file needs no extra imports and the verification
 * logic stays in one place. Must be read-only — it never applies DDL.
 */
type MainSchemaRevalidator = () => Promise<boolean>;

let mainSchemaRevalidator: MainSchemaRevalidator | null = null;
let lastRevalidateAt = 0;
let revalidateInProgress = false;
const MAIN_SCHEMA_REVALIDATE_INTERVAL_MS = 60_000;

export function setMainSchemaRevalidator(fn: MainSchemaRevalidator | null): void {
  mainSchemaRevalidator = fn;
}

/**
 * The MAIN schema was previously verified only once, at startup. If the
 * database was migrated after the process booted — the normal case when a
 * deploy lands before its migration is applied — the instance stayed
 * fail-closed on 503 for every route until someone manually restarted it. That
 * cost two production outages.
 *
 * The watchdog now re-checks while (and only while) the schema is marked
 * failed, so a late migration recovers the service on its own. Strictly
 * read-only, rate limited to once a minute, and never runs when the schema is
 * already healthy — a healthy instance does no extra work.
 */
async function maybeRevalidateMainSchema(): Promise<void> {
  if (!mainSchemaRevalidator) return;
  if (!readinessState.mainSchemaFailed) return;
  if (revalidateInProgress) return;

  const now = Date.now();
  if (now - lastRevalidateAt < MAIN_SCHEMA_REVALIDATE_INTERVAL_MS) return;
  lastRevalidateAt = now;

  revalidateInProgress = true;
  try {
    const recovered = await mainSchemaRevalidator();
    if (!recovered) return;
    // The revalidator already marked the migrate-service state complete; clear
    // this layer's flag so getReadinessState() stops reporting degraded.
    readinessState.mainSchemaFailed = false;
    readinessState.mainSchemaError = null;
    updateReadinessState();
    console.log(
      "[DBReadiness] MAIN schema re-verified after an earlier failure — service is ready again without a restart.",
    );
  } catch {
    // Stay degraded and try again on the next watchdog tick.
  } finally {
    revalidateInProgress = false;
  }
}

export function markMainSchemaFailed(error: string): void {
  readinessState.mainSchemaFailed = true;
  readinessState.mainSchemaComplete = false;
  readinessState.mainSchemaError = error;
  // Keep main-schema-migrate state in sync — getReadinessState() overwrites flags from isMainSchemaFailed().
  recordMainSchemaFailed(error);
  updateReadinessState();
  startWatchdog();
  // Safe consistency line for ops/proofs — no SQL, connection URL, or raw error body.
  const snap = getReadinessState();
  console.log(
    `[DBReadiness] MAIN schema failure recorded: mainSchemaComplete=${snap.mainSchemaComplete} mainSchemaFailed=${snap.mainSchemaFailed} state=${snap.state}`,
  );
}

export function recordOptionalJob(name: string, status: 'ok' | 'failed' | 'skipped', error?: string): void {
  readinessState.optionalJobs.push({ name, status, error });
}

/**
 * Records that optional MAIN jobs finished (seeds/backfills). Observability only.
 * HOTFIX-2: never gates isDbReady() / /ready / fail-closed middleware.
 */
export function markOptionalJobsComplete(): void {
  readinessState.optionalJobsComplete = true;
  readinessState.migrationsComplete = true; // keep legacy field in sync for older admin readers
  startWatchdog();
}

/** @deprecated Use markOptionalJobsComplete — name implied MAIN readiness ownership. */
export function markMigrationsComplete(): void {
  markOptionalJobsComplete();
}

async function checkDatabaseConnection(): Promise<{ connected: boolean; error: string | null }> {
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    const latency = Date.now() - start;
    console.log(`[DBReadiness] Connection check OK (${latency}ms)`);
    return { connected: true, error: null };
  } catch (error: any) {
    const message = error?.message || String(error);
    console.warn(`[DBReadiness] Connection check failed: ${message.slice(0, 120)}`);
    return { connected: false, error: message };
  }
}

function isConnectionError(error: string | null): boolean {
  if (!error) return false;
  return /timeout exceeded when trying to connect|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(error);
}

function updateReadinessState(): void {
  // HOTFIX-2: MAIN traffic readiness is ONLY db connection + MAIN ledger.
  // Optional MAIN jobs / Brain jobs / markMigrationsComplete must never gate /ready.
  const { dbConnected, mainSchemaComplete, mainSchemaFailed } = readinessState;

  if (!dbConnected) {
    readinessState.state = 'degraded';
    return;
  }

  if (mainSchemaFailed) {
    readinessState.state = 'degraded';
    return;
  }

  if (mainSchemaComplete) {
    readinessState.state = 'ready';
    return;
  }

  // Pending migrate, lock-timeout incomplete, or not yet verified.
  readinessState.state = 'checking';
}

function resolveDnsForLog(hostname: string): void {
  if (!hostname || hostname === '(no pool)' || hostname === '(redacted)') return;
  dnsPromises.lookup(hostname).then((result) => {
    console.log(`[DBReadiness] DNS resolved: ${hostname} -> ${result.address}`);
  }).catch(() => {
    console.warn(`[DBReadiness] DNS lookup failed for: ${hostname}`);
  });
}

async function watchdogTick(): Promise<void> {
  if (watchdogInProgress) return;
  watchdogInProgress = true;
  try {
    readinessState.checkCount++;
    readinessState.lastCheck = new Date();

    const { connected, error } = await checkDatabaseConnection();
    readinessState.dbConnected = connected;
    readinessState.lastError = error;

    if (connected) {
      if (readinessState.state === 'degraded' && !readinessState.mainSchemaFailed) {
        const downSince = readinessState.degradedSince?.toISOString() ?? 'unknown';
        console.log(`[DBReadiness] Watchdog: DB recovered -- was degraded since ${downSince} (${readinessState.consecutiveFailures} failures)`);
        updateReadinessState();
      }
      readinessState.consecutiveFailures = 0;
      readinessState.degradedSince = null;
      // Only meaningful with a live connection, and only acts while failed.
      await maybeRevalidateMainSchema();
    } else {
      const prev = readinessState.state;
      readinessState.state = 'degraded';
      readinessState.consecutiveFailures++;
      if (prev !== 'degraded') {
        readinessState.degradedSince = new Date();
        console.warn(`[DBReadiness] Watchdog: DB unavailable -- ${error?.slice(0, 100)}`);
        const diag = getDbPoolDiagnostics();
        console.warn(`[DBReadiness] Pool diagnostics -- total:${diag.totalCount} idle:${diag.idleCount} waiting:${diag.waitingCount} host:${diag.host} gen:${diag.poolGeneration} resetInProgress:${diag.resetInProgress}`);
        resolveDnsForLog(diag.host);
      } else {
        const diag = getDbPoolDiagnostics();
        console.warn(`[DBReadiness] Watchdog: still degraded (${readinessState.consecutiveFailures} failures) -- pool total:${diag.totalCount} idle:${diag.idleCount} waiting:${diag.waitingCount} gen:${diag.poolGeneration} resetInProgress:${diag.resetInProgress}`);
      }
      if (isConnectionError(error)) {
        resetDbPool('watchdog: ' + (error?.slice(0, 60) ?? 'connection error')).catch(() => {});
      }
    }
  } finally {
    watchdogInProgress = false;
  }
}

function startWatchdog(): void {
  if (watchdogInterval) return;
  watchdogInterval = setInterval(() => {
    watchdogTick().catch(() => {});
  }, WATCHDOG_INTERVAL_MS);
}

async function performReadinessCheck(attempt = 1): Promise<void> {
  readinessState.checkCount++;
  readinessState.lastCheck = new Date();

  const { connected, error } = await checkDatabaseConnection();
  readinessState.dbConnected = connected;
  readinessState.lastError = error;

  updateReadinessState();

  if (readinessState.state === 'ready') {
    console.log('[DBReadiness] Database ready');
    startWatchdog();
    return;
  }

  if (readinessState.dbConnected) {
    startWatchdog();
    return;
  }

  if (attempt < MAX_RETRIES) {
    const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(1.5, attempt - 1), MAX_RETRY_DELAY);
    console.log(`[DBReadiness] Retry ${attempt}/${MAX_RETRIES} in ${delay}ms (state: ${readinessState.state})`);
    setTimeout(() => performReadinessCheck(attempt + 1), delay);
  } else {
    console.warn('[DBReadiness] Max retries reached, staying in degraded state');
    readinessState.state = 'degraded';
    startWatchdog();
  }
}

export function startReadinessChecks(): void {
  if (startCalled) {
    startWatchdog();
    return;
  }
  startCalled = true;
  console.log('[DBReadiness] Starting database readiness checks...');
  performReadinessCheck(1);
}

export function stopReadinessChecks(): void {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
}

export function forceReadinessCheck(): void {
  watchdogTick().catch(() => {});
}

/** Test-only: mark MAIN DB ready without full startup (NODE_ENV=test). */
export function forceReadyForTests(): void {
  if (process.env.NODE_ENV !== "test") return;
  readinessState.dbConnected = true;
  readinessState.mainSchemaComplete = true;
  readinessState.mainSchemaFailed = false;
  readinessState.state = "ready";
}