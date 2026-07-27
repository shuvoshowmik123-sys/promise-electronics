import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
    isDbConnectionError,
    logErrorSafe,
    sanitizeErrorForResponse,
} from '../../utils/safe-error.js';

export const errorHandler = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (res.headersSent) {
        return next(err);
    }

    if (isDbConnectionError(err)) {
        logErrorSafe('Error', req, err);
        return res.status(503).json({
            error: 'Database reconnecting. Please try again in 30 seconds.',
            code: 'DB_RECONNECTING',
        });
    }

    if (err instanceof ZodError) {
        logErrorSafe('Error', req, err);
        return res.status(400).json({
            error: 'Validation failed',
            details: err.errors.map((e) => ({
                field: e.path.join('.'),
                message: e.message,
                code: e.code,
            })),
        });
    }

    if (err?.type === 'entity.parse.failed') {
        logErrorSafe('Error', req, err);
        return res.status(400).json({ error: 'Invalid JSON payload' });
    }

    logErrorSafe('Error', req, err);
    const payload = sanitizeErrorForResponse(err);

    if (payload.statusCode === 400 && payload.details) {
        return res.status(payload.statusCode).json({
            error: payload.error,
            details: payload.details,
            ...(payload.code ? { code: payload.code } : {}),
        });
    }

    res.status(payload.statusCode).json({
        error: payload.error,
        ...(payload.code ? { code: payload.code } : {}),
        requestId: (req as any).correlationId,
    });
};