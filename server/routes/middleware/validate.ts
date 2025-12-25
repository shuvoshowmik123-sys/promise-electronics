/**
 * Validation Middleware
 * 
 * Centralized request body validation using Zod schemas.
 * Use this middleware to validate request bodies before they reach route handlers.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Validation middleware factory
 * 
 * @param schema - Zod schema to validate request body against
 * @returns Express middleware function
 * 
 * @example
 * ```typescript
 * import { validate } from './middleware/validate.js';
 * import { insertUserSchema } from '@shared/schema';
 * 
 * router.post('/users', validate(insertUserSchema), (req, res) => {
 *   // req.body is now validated and typed
 *   const user = req.body;
 * });
 * ```
 */
export function validate<T>(schema: ZodSchema<T>) {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = schema.parse(req.body);
            req.body = result; // Replace with validated & transformed data
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const formattedErrors = error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message,
                    code: err.code,
                }));

                return res.status(400).json({
                    error: 'Validation failed',
                    details: formattedErrors,
                });
            }

            // Non-Zod error - pass to error handler
            next(error);
        }
    };
}

/**
 * Validate query parameters
 * 
 * @param schema - Zod schema to validate query parameters against
 * @returns Express middleware function
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = schema.parse(req.query);
            req.query = result as any;
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const formattedErrors = error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message,
                    code: err.code,
                }));

                return res.status(400).json({
                    error: 'Invalid query parameters',
                    details: formattedErrors,
                });
            }

            next(error);
        }
    };
}

/**
 * Validate URL parameters
 * 
 * @param schema - Zod schema to validate URL parameters against
 * @returns Express middleware function
 */
export function validateParams<T>(schema: ZodSchema<T>) {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            const result = schema.parse(req.params);
            req.params = result as any;
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const formattedErrors = error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message,
                    code: err.code,
                }));

                return res.status(400).json({
                    error: 'Invalid URL parameters',
                    details: formattedErrors,
                });
            }

            next(error);
        }
    };
}

/**
 * Combined validation for body, query, and params
 * 
 * @param options - Object with schemas for body, query, and/or params
 * @returns Express middleware function
 */
export function validateRequest<TBody = any, TQuery = any, TParams = any>(options: {
    body?: ZodSchema<TBody>;
    query?: ZodSchema<TQuery>;
    params?: ZodSchema<TParams>;
}) {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            if (options.body) {
                req.body = options.body.parse(req.body);
            }
            if (options.query) {
                req.query = options.query.parse(req.query) as any;
            }
            if (options.params) {
                req.params = options.params.parse(req.params) as any;
            }
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const formattedErrors = error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message,
                    code: err.code,
                }));

                return res.status(400).json({
                    error: 'Validation failed',
                    details: formattedErrors,
                });
            }

            next(error);
        }
    };
}
