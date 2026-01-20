import { Request, Response, NextFunction } from "express";
import { aiService } from "../services/ai.service.js";
import { db } from "../db.js";
import { aiDebugSuggestions } from "../../shared/schema.js";

const KNOWN_ERRORS = [
    {
        pattern: /ECONNREFUSED/,
        cause: "Database connection failed",
        fix: "Check if PostgreSQL is running and credentials are correct.",
        severity: "High"
    },
    {
        pattern: /invalid input syntax for type uuid/,
        cause: "Invalid ID format",
        fix: "Ensure the ID passed in the URL is a valid UUID.",
        severity: "Low"
    },
    {
        pattern: /duplicate key value violates unique constraint/,
        cause: "Duplicate entry",
        fix: "The data you are trying to insert already exists (e.g., email or phone).",
        severity: "Medium"
    },
    {
        pattern: /jwt expired/,
        cause: "Token Expired",
        fix: "User needs to login again.",
        severity: "Low"
    }
];

export const aiErrorHandler = async (err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    const stack = err.stack || "";

    // Only analyze 500 errors or explicit system errors
    if (status >= 500) {
        console.error("[AI DEBUGGER] Analyzing error:", message);

        try {
            let diagnosis = null;

            // 1. Check Known Patterns
            const knownMatch = KNOWN_ERRORS.find(e => e.pattern.test(message) || e.pattern.test(stack));

            if (knownMatch) {
                diagnosis = {
                    cause: knownMatch.cause,
                    fix: knownMatch.fix,
                    severity: knownMatch.severity
                };
                console.log("[AI DEBUGGER] Matched known pattern:", diagnosis.cause);
            } else {
                // 2. Ask AI for unknown errors
                console.log("[AI DEBUGGER] Unknown error, asking Gemini...");
                const context = `Route: ${req.method} ${req.url}\nUser: ${(req as any).user?.id || 'Guest'}`;
                diagnosis = await aiService.diagnoseError({ message, stack }, context);
            }

            // 3. Store Suggestion
            if (diagnosis) {
                await db.insert(aiDebugSuggestions).values({
                    error: message,
                    stackTrace: stack.substring(0, 1000), // Limit length
                    suggestion: JSON.stringify(diagnosis),
                    status: 'NEEDS_REVIEW'
                });
            }

        } catch (aiError) {
            console.error("[AI DEBUGGER] Failed to analyze:", aiError);
        }
    }

    // Pass to default error handler
    next(err);
};
