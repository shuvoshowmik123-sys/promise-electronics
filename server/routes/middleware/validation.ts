import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

/**
 * Middleware to validate request body, query, or params against a Zod schema.
 * 
 * @param schema - The Zod schema to validate against
 * @param source - The part of the request to validate ('body', 'query', 'params')
 */
export const validateRequest = (schema: AnyZodObject, source: 'body' | 'query' | 'params' = 'body') => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const data = await schema.parseAsync(req[source]);
            req[source] = data; // Replace with parsed/transformed data
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                return res.status(400).json({
                    error: 'Validation Error',
                    details: error.errors.map(err => ({
                        field: err.path.join('.'),
                        message: err.message
                    }))
                });
            }
            next(error);
        }
    };
};
