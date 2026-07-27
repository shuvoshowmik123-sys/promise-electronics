import type { Request } from "express";
import { redactMessageForLog } from "./safe-error.js";

export function logRouteError(scope: string, req: Request, error: unknown): void {
    const correlationId = (req as any).correlationId ?? "unknown";
    const method = req.method;
    const path = req.path;
    const err = error as any;
    const statusCode = err?.statusCode || err?.status || 500;
    const code = err?.code && /^[A-Z][A-Z0-9_]{2,64}$/.test(err.code) ? err.code : "ERR";
    const message = redactMessageForLog(err?.message);
    console.error(`[${scope}][${correlationId}] ${method} ${path} → ${statusCode} ${code}: ${message}`);
}