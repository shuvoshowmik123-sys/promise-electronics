import { promises as dnsPromises } from 'dns';
import { db, resetDbPool, getDbPoolDiagnostics } from '../db.js';
import { sql } from 'drizzle-orm';

type ReadinessState = 'initializing' | 'checking' | 'ready' | 'degraded';

interface ReadinessInfo {
  state: ReadinessState;
  dbConnected: boolean;
  migrationsComplete: boolean;
  lastCheck: Date | null;
  lastError: string | null;
  checkCount: number;
  consecutiveFailures: number;
  degradedSince: Date | null;
}

let readinessState: ReadinessInfo = {
  state: 'initializing',
  dbConnected: false,
  migrationsComplete: false,
  lastCheck: null,
  lastError: null,
  checkCount: 0,
  consecutiveFailures: 0,
  degradedSince: null,
};

const MAX_RETRIES = 10;
const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 10000;
const WATCHDOG_INTERVAL_MS = 45_000;

let watchdogInterval: ReturnType<typeof setInterval> | null = null;
let watchdogInProgress = false;
let startCalled = false;

export function getReadinessState(): ReadinessInfo {
  return { ...readinessState };
}

export function isDbReady(): boolean {
  return readinessState.state === 'ready';
}

export function markMigrationsComplete(): void {
  readinessState.migrationsComplete = true;
  updateReadinessState();
  startWatchdog(); // ensure watchdog is running even if markMigrationsComplete fires late
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
  const { dbConnected, migrationsComplete } = readinessState;
  if (dbConnected && migrationsComplete) {
    readinessState.state = 'ready';
  } else if (dbConnected && !migrationsComplete) {
    readinessState.state = 'checking';
  } else {
    readinessState.state = 'degraded';
  }
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
      if (readinessState.state === 'degraded') {
        const downSince = readinessState.degradedSince?.toISOString() ?? 'unknown';
        console.log(`[DBReadiness] Watchdog: DB recovered -- was degraded since ${downSince} (${readinessState.consecutiveFailures} failures)`);
        readinessState.state = readinessState.migrationsComplete ? 'ready' : 'checking';
      }
      readinessState.consecutiveFailures = 0;
      readinessState.degradedSince = null;
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

  // DB is up but migrations still pending — start watchdog and let markMigrationsComplete() transition to ready
  if (readinessState.dbConnected) {
    startWatchdog();
    return;
  }

  // DB not reachable — retry with backoff
  if (attempt < MAX_RETRIES) {
    const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(1.5, attempt - 1), MAX_RETRY_DELAY);
    console.log(`[DBReadiness] Retry ${attempt}/${MAX_RETRIES} in ${delay}ms (state: ${readinessState.state})`);
    setTimeout(() => performReadinessCheck(attempt + 1), delay);
  } else {
    console.warn('[DBReadiness] Max retries reached, staying in degraded state');
    readinessState.state = 'degraded';
    startWatchdog(); // keep watching so we recover when DB comes back
  }
}

export function startReadinessChecks(): void {
  if (startCalled) {
    // Idempotent: second call just ensures watchdog is running
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
