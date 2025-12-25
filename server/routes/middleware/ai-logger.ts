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

        // 2. Find Admins
        const admins = await db
            .select()
            .from(users)
            .where(or(eq(users.role, "Super Admin"), eq(users.role, "Manager")));

        // 3. Notify Admins
        for (const admin of admins) {
            // Save to DB
            await db.insert(notifications).values({
                id: nanoid(),
                userId: admin.id,
                title: `🚨 Server Error: ${diagnosis.severity}`,
                message: `${diagnosis.cause}\nFix: ${diagnosis.fix}`,
                type: "warning",
                link: "/admin/logs",
                read: false,
            });

            // Send Push
            await pushService.sendToUser(admin.id, {
                title: `🚨 Server Alert: ${diagnosis.severity}`,
                body: diagnosis.cause,
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
