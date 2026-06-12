import type { NextFunction, Request, Response } from "express";
import { getReadinessState, isDbReady } from "../services/db-readiness.js";
import { getDefaultPermissionsForRole } from "../../shared/admin-permissions.js";

type CachedResponse = {
  body: unknown;
  contentType?: string | number | string[];
  cachedAt: string;
};

const staleReadCache = new Map<string, CachedResponse>();

const STALE_READ_PATHS = [
  "/api/admin/dashboard",
  "/api/admin/job-overview",
  "/api/job-tickets",
  "/api/job-tickets/list",
  "/api/challans",
  "/api/inventory",
  "/api/pos-transactions/summary",
  "/api/petty-cash/summary",
  "/api/due-records/summary",
  "/api/refunds",
  "/api/manual-payments",
];

const STALE_READ_PERMISSIONS: Record<string, string | null> = {
  "/api/admin/dashboard": "dashboard",
  "/api/admin/job-overview": "dashboard",
  "/api/job-tickets": "jobs",
  "/api/job-tickets/list": "jobs",
  "/api/challans": "challans",
  "/api/inventory": "inventory",
  "/api/pos-transactions/summary": "pos",
  "/api/petty-cash/summary": "finance",
  "/api/due-records/summary": "finance",
  "/api/refunds": "finance",
  "/api/manual-payments": "finance",
};

const MUTATION_PROTECTED_PATHS = [
  "/api/challans",
  "/api/job-tickets",
  "/api/inventory",
  "/api/pos-transactions",
  "/api/petty-cash",
  "/api/due-records",
  "/api/refunds",
  "/api/manual-payments",
  "/api/service-requests",
  "/api/admin/service-requests",
  "/api/offline",
];

function hasPathMatch(pathname: string, paths: string[]): boolean {
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function hasExactPathMatch(pathname: string, paths: string[]): boolean {
  return paths.includes(pathname);
}

function parsePermissions(raw: unknown): Record<string, boolean> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, boolean>;
  if (typeof raw !== "string") return {};
  try {
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}

function canServeStaleRead(req: Request): boolean {
  const session = req.session as any;
  if (!session?.adminUserId) return false;
  const requiredPermission = STALE_READ_PERMISSIONS[req.path];
  if (!requiredPermission) return true;
  const explicitPermissions = parsePermissions(session.adminUserPermissions);
  const defaultPermissions = getDefaultPermissionsForRole(session.adminUserRole || "");
  const permissions = Object.keys(explicitPermissions).length > 0 ? explicitPermissions : defaultPermissions;
  return Boolean(permissions["*"] || permissions[requiredPermission]);
}

function shouldCacheRead(req: Request): boolean {
  if (req.method !== "GET") return false;
  if (req.headers.accept?.includes("text/event-stream")) return false;
  if (!hasExactPathMatch(req.path, STALE_READ_PATHS)) return false;
  return canServeStaleRead(req);
}

function shouldProtectMutation(req: Request): boolean {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return false;
  if (!hasPathMatch(req.path, MUTATION_PROTECTED_PATHS)) return false;
  return true;
}

function addStaleHeaders(res: Response, cachedAt: string): void {
  res.setHeader("X-Data-Freshness", "stale");
  res.setHeader("X-Data-Source", "stale-cache");
  res.setHeader("X-Data-Last-Updated", cachedAt);
}

function withStaleMetadata(body: unknown, cachedAt: string): unknown {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return {
      ...body,
      __stale: true,
      __lastUpdated: cachedAt,
      __source: "stale-cache",
    };
  }
  return body;
}

export function coldStartCacheMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (shouldProtectMutation(req) && !isDbReady()) {
    res.status(503).json({
      error: "Database connecting. Try again in a moment.",
      code: "DB_NOT_READY",
      readiness: getReadinessState(),
    });
    return;
  }

  if (!shouldCacheRead(req)) {
    next();
    return;
  }

  const cacheKey = req.originalUrl;
  const cached = staleReadCache.get(cacheKey);

  if (!isDbReady() && cached) {
    addStaleHeaders(res, cached.cachedAt);
    if (cached.contentType) res.setHeader("Content-Type", cached.contentType);
    res.status(200).json(withStaleMetadata(cached.body, cached.cachedAt));
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      staleReadCache.set(cacheKey, {
        body,
        contentType: res.getHeader("Content-Type"),
        cachedAt: new Date().toISOString(),
      });
      res.setHeader("X-Data-Freshness", "live");
      res.setHeader("X-Data-Source", "postgres");
    }
    return originalJson(body);
  };

  next();
}

export function getColdStartCacheState() {
  return {
    entries: staleReadCache.size,
    paths: [...STALE_READ_PATHS],
  };
}
