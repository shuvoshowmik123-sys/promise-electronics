import { Request, Response, NextFunction } from 'express';
import { ApiErrorPayload } from '../../../shared/types/api-error.js';
import { ZodError } from 'zod';

/**
 * Centralized error handler for the Express application.
 * Formats all uncaught errors into a standardized ApiErrorPayload.
 */
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
