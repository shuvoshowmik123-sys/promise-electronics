import type { Request } from "express";

const SAFE_CODE_RE = /^[A-Z][A-Z0-9_]{2,64}$/;

const UNSAFE_MESSAGE_PATTERNS = [
    /at\s.+\.ts:\d+/i,
    /at\s.+\.js:\d+/i,
    /node:internal/i,
    /node_modules\//i,
    /postgresql:\/\//i,
    /postgres:\/\//i,
    / DATABASE_URL /i,
    / SESSION_SECRET /i,
    / INTAKE_FINGERPRINT_SECRET /i,
    /password\s*[:=]/i,
    /token\s*[:=]/i,
    /secret\s*[:=]/i,
    /authorization\s*[:=]/i,
    /cookie\s*[:=]/i,
];

const KNOWN_SAFE_STATUS = new Set([400, 401, 403, 404, 409, 410, 422, 429, 451]);

export interface SafeErrorPayload {
    statusCode: number;
    error: string;
    code?: string;
    details?: unknown;
}

export function sanitizeErrorForResponse(err: any): SafeErrorPayload {
    const statusCode = err?.statusCode || err?.status || 500;
    const isKnownSafe = KNOWN_SAFE_STATUS.has(statusCode);
    const isZod = err?.name === "ZodError" || err?.issues;
    const code = err?.code && SAFE_CODE_RE.test(err.code) ? err.code : undefined;

    if (isZod) {
        return {
            statusCode: 400,
            error: "Validation failed",
            code,
            details: err.issues?.map((e: any) => ({
                field: e.path?.join?.(".") ?? String(e.path ?? ""),
                message: e.message,
                code: e.code,
            })),
        };
    }

    if (err?.type === "entity.parse.failed") {
        return { statusCode: 400, error: "Invalid JSON payload", code };
    }

    if (isKnownSafe && err?.message) {
        return { statusCode, error: err.message, code };
    }

    if (process.env.NODE_ENV === "production") {
        return { statusCode: 500, error: "Internal Server Error" };
    }

    return { statusCode: 500, error: err?.message ?? "Internal Server Error", code };
}

export function isDbConnectionError(err: any): boolean {
    const text = `${err?.message ?? ""} ${err?.code ?? ""}`;
    return /timeout exceeded when trying to connect|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(text);
}

export function redactMessageForLog(msg: string | undefined): string {
    if (!msg) return "";
    let out = msg;
    for (const p of UNSAFE_MESSAGE_PATTERNS) {
        if (p.test(out)) {
            out = out.replace(p, "[REDACTED]");
        }
    }
    return out.slice(0, 500);
}

export function logErrorSafe(scope: string, req: Request, err: any): void {
    const correlationId = (req as any).correlationId ?? "unknown";
    const method = req.method;
    const path = req.path;
    const statusCode = err?.statusCode || err?.status || 500;
    const code = err?.code && SAFE_CODE_RE.test(err.code) ? err.code : "ERR";
    const message = redactMessageForLog(err?.message);
    console.error(`[${scope}][${correlationId}] ${method} ${path} → ${statusCode} ${code}: ${message}`);
}

/**
 * Background scheduler / release-adjacent failure log.
 * Emits only stable scope + code — never raw error objects, messages, hosts, or PII.
 */
export function logBackgroundFailure(scope: string, code: string): void {
    const safeScope = String(scope || "Background")
        .replace(/[^\w.\-:[\] ]/g, "")
        .slice(0, 64) || "Background";
    const safeCode = SAFE_CODE_RE.test(code) ? code : "BACKGROUND_FAILURE";
    console.error(`[${safeScope}] ${safeCode}`);
    // SYSTEM-OBSERVABILITY-01B — durable allowlisted register (never pass error objects).
    try {
        // Lazy import avoids circular load; failures never throw into caller.
        void import("../services/system-incidents.service.js").then((m) => {
            m.recordBackgroundIncidentSafe(safeScope, safeCode);
        });
    } catch {
        /* ignore */
    }
}

export function isSafeToLogBody(req: Request): boolean {
    return false;
}