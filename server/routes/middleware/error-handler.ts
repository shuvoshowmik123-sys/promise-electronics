import { Request, Response, NextFunction } from 'express';
import { ApiErrorPayload } from '../../../shared/types/api-error.js';
import { ZodError } from 'zod';

/**
 * Centralized error handler for the Express application.
 * Formats all uncaught errors into a standardized ApiErrorPayload.
 */
function isDbConnectionError(err: any): boolean {
    const text = `${err?.message ?? ''} ${err?.code ?? ''}`;
    return /timeout exceeded when trying to connect|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(text);
}

export const errorHandler = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // If headers have already been sent, delegate to default Express error handler
    if (res.headersSent) {
        return next(err);
    }

    // DB connection errors (incl. connect-pg-simple session store failures) become
    // 503 so the client knows to retry rather than treating it as an app bug.
    if (isDbConnectionError(err)) {
        console.warn(`[Error] DB connection error on ${req.method} ${req.path}:`, err?.message?.slice(0, 80));
        return res.status(503).json({
            error: 'Database reconnecting. Please try again in 30 seconds.',
            code: 'DB_RECONNECTING',
        });
    }

    console.error(`[Error] ${req.method} ${req.path}`, err);

    const payload: ApiErrorPayload = {
        error: 'Internal Server Error',
        requestId: (req as any).requestId, // Will be populated in Phase 6
    };

    let statusCode = 500;

    if (err instanceof ZodError) {
        statusCode = 400;
        payload.error = 'Validation failed';
        payload.details = err.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
            code: e.code,
        }));
    } else if (err.type === 'entity.parse.failed') {
        // Body-parser syntax errors
        statusCode = 400;
        payload.error = 'Invalid JSON payload';
    } else if (err.statusCode || err.status) {
        statusCode = err.statusCode || err.status;
        payload.error = err.message || payload.error;
        if (err.code) payload.code = err.code;
    } else if (err instanceof Error) {
        // Don't leak internal error messages in production unless it's a known safe error
        // For now we pass the message, but ideally we only do this for custom AppError types
        payload.error = err.message;
    }

    res.status(statusCode).json(payload);
};
