import type { Request, Response, NextFunction } from "express";
import { getReadinessState, isDbReady } from "../services/db-readiness.js";

const HEALTH_PATHS = new Set(["/health", "/api/health", "/ready", "/api/ready"]);
// Super Admin readiness must remain observable while MAIN is pending/failed (safe fields only).
const ADMIN_READINESS_PATHS = new Set(["/api/admin/readiness"]);
const STATIC_ASSET_PATTERNS = ["/assets/", "/static/", "/_vercel/"];

function isHealthOrReadinessPath(pathname: string): boolean {
  return HEALTH_PATHS.has(pathname) || ADMIN_READINESS_PATHS.has(pathname);
}

function isStaticAssetPath(pathname: string): boolean {
  return STATIC_ASSET_PATTERNS.some((p) => pathname.startsWith(p));
}

export function failClosedReadinessMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (isDbReady()) {
    next();
    return;
  }

  if (isHealthOrReadinessPath(req.path)) {
    next();
    return;
  }

  if (isStaticAssetPath(req.path)) {
    next();
    return;
  }

  if (req.method === "OPTIONS") {
    next();
    return;
  }

  res.status(503).json({
    error: "Service is initializing. Please try again in a moment.",
    code: "MAIN_SCHEMA_PENDING",
  });
}