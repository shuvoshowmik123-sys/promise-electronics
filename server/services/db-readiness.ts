import { db } from '../db.js';
import { sql } from 'drizzle-orm';

type ReadinessState = 'initializing' | 'checking' | 'ready' | 'degraded';

interface ReadinessInfo {
  state: ReadinessState;
  dbConnected: boolean;
  migrationsComplete: boolean;
  lastCheck: Date | null;
  lastError: string | null;
  checkCount: number;
}

let readinessState: ReadinessInfo = {
  state: 'initializing',
  dbConnected: false,
  migrationsComplete: false,
  lastCheck: null,
  lastError: null,
  checkCount: 0,
};

let readinessCheckInterval: ReturnType<typeof setInterval> | null = null;

const MAX_RETRIES = 10;
const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 10000;

export function getReadinessState(): ReadinessInfo {
  return { ...readinessState };
}

export function isDbReady(): boolean {
  return readinessState.state === 'ready';
}

export function markMigrationsComplete(): void {
  readinessState.migrationsComplete = true;
  updateReadinessState();
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

async function performReadinessCheck(attempt = 1): Promise<void> {
  readinessState.checkCount++;
  readinessState.lastCheck = new Date();

  const { connected, error } = await checkDatabaseConnection();
  readinessState.dbConnected = connected;
  readinessState.lastError = error;

  updateReadinessState();

  if (readinessState.state === 'ready') {
    console.log('[DBReadiness] Database ready');
    stopReadinessChecks();
    return;
  }

  if (attempt < MAX_RETRIES) {
    const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(1.5, attempt - 1), MAX_RETRY_DELAY);
    console.log(`[DBReadiness] Retry ${attempt}/${MAX_RETRIES} in ${delay}ms (state: ${readinessState.state})`);
    setTimeout(() => performReadinessCheck(attempt + 1), delay);
  } else {
    console.warn('[DBReadiness] Max retries reached, staying in degraded state');
    readinessState.state = 'degraded';
  }
}

export function startReadinessChecks(): void {
  if (readinessCheckInterval) {
    clearInterval(readinessCheckInterval);
  }
  
  console.log('[DBReadiness] Starting database readiness checks...');
  performReadinessCheck(1);
}

export function stopReadinessChecks(): void {
  if (readinessCheckInterval) {
    clearInterval(readinessCheckInterval);
    readinessCheckInterval = null;
  }
}

export function forceReadinessCheck(): void {
  performReadinessCheck(1);
}
