import { Request, Response, NextFunction } from "express";
import { aiService } from "../../services/ai.service.js";
import { db } from "../../db.js";
import { notifications, users } from "../../../shared/schema.js";
import { pushService } from "../../pushService.js";
import { eq, or } from "drizzle-orm";
import { nanoid } from "nanoid";

// Rate limiting: Map<ErrorSignature, Timestamp>
const errorCache = new Map<string, number>();
const RATE_LIMIT_MS = 60 * 1000; // 1 minute per unique error

function shouldRunAiWatchdog(err: any) {
    if (process.env.ENABLE_AI_ERROR_HANDLER === "true") return true;
    if (process.env.NODE_ENV !== "production") return false;
    if (!process.env.GROQ_API_KEY) return false;

    const text = `${err?.code || ""} ${err?.message || ""} ${err?.stack || ""}`;
    if (/ETIMEDOUT|ECONNRESET|ENETUNREACH|Connection terminated|timeout exceeded|WebSocket was closed/i.test(text)) {
        return false;
    }

    return true;
}

export const aiErrorHandler = async (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // Only handle 500s or unknown errors
    if (res.headersSent) {
        return next(err);
    }

    const statusCode = err.status || err.statusCode || 500;
    if (statusCode < 500) {
        return next(err);
    }

    if (!shouldRunAiWatchdog(err)) {
        console.error("[AI Watchdog] Skipped:", err?.message || err);
        return next(err);
    }

    console.error("[AI Watchdog] Caught error:", err);

    try {
        // Generate error signature to prevent spam
        const errorSignature = `${err.message}-${err.stack?.split("\n")[0]}`;
        const lastReported = errorCache.get(errorSignature);

        if (lastReported && Date.now() - lastReported < RATE_LIMIT_MS) {
            console.log("[AI Watchdog] Error reported recently, skipping AI analysis.");
            return next(err);
        }

        errorCache.set(errorSignature, Date.now());

        // 1. Diagnose with AI
        const context = `
      Method: ${req.method}
      URL: ${req.originalUrl}
      Body: ${JSON.stringify(req.body || {}).substring(0, 500)}
      User: ${req.user ? (req.user as any).id : "Anonymous"}
    `;

        const diagnosis = await aiService.diagnoseError(err, context);

        // 2. Find Super Admins only — system internals must not reach Managers or below
        const admins = await db
            .select()
            .from(users)
            .where(eq(users.role, "Super Admin"));

        // 3. Notify Super Admins with safe, non-diagnostic text
        for (const admin of admins) {
            // Save to DB — no raw cause/fix in the notification body
            await db.insert(notifications).values({
                id: nanoid(),
                userId: admin.id,
                title: "Server Issue Detected",
                message: "A server issue was detected. Super Admin review required.",
                type: "system_alert",
                link: "system-health",
                read: false,
            });

            // Push notification — keep body generic
            await pushService.sendToUser(admin.id, {
                title: "Server Issue Detected",
                body: "A server issue requires your review. Open System Health.",
                data: {
                    type: "server_error",
                    severity: diagnosis.severity,
                },
            });
        }

        console.log("[AI Watchdog] Admins notified of error.");

    } catch (aiError) {
        console.error("[AI Watchdog] Failed to process error:", aiError);
    }

    // Pass to default error handler (or send response if none)
    next(err);
};
