/**
 * Rate Limiting Middleware
 * 
 * Protects public endpoints from abuse and brute-force attacks.
 */

import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * General API rate limiter
 * Allows 100 requests per minute per IP
 */
export const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: {
        error: 'Too many requests',
        message: 'Please try again in a minute',
        retryAfter: 60,
    },
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false, // Disable X-RateLimit-* headers
    // Skip rate limiting for admin users (optional)
    skip: (req: Request) => {
        return !!(req.session as any)?.adminUserId;
    },
});

/**
 * Strict rate limiter for authentication endpoints
 * Prevents brute-force login attacks
 * Allows 5 attempts per 15 minutes per IP
 */
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // 50 attempts (increased for development)
    message: {
        error: 'Too many login attempts',
        message: 'Please try again after 15 minutes',
        retryAfter: 900,
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Track failed attempts only
    skipSuccessfulRequests: true,
});

/**
 * Rate limiter for service request submissions
 * Prevents spam submissions
 * Allows 10 submissions per hour per IP
 */
export const serviceRequestLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 submissions per hour
    message: {
        error: 'Too many service requests',
        message: 'You can submit up to 10 requests per hour. Please try again later.',
        retryAfter: 3600,
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Rate limiter for file uploads
 * Prevents storage abuse
 * Allows 20 uploads per hour per IP
 */
export const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 uploads per hour
    message: {
        error: 'Too many uploads',
        message: 'Upload limit reached. Please try again later.',
        retryAfter: 3600,
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Rate limiter for AI endpoints (expensive operations)
 * Protects against API cost abuse
 * Allows 30 requests per hour per IP
 */
export const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 30, // 30 AI requests per hour
    message: {
        error: 'AI rate limit reached',
        message: 'You have reached the AI usage limit. Please try again later.',
        retryAfter: 3600,
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Rate limiter for customer registration
 * Prevents mass account creation
 * Allows 3 registrations per hour per IP
 */
export const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 registrations per hour
    message: {
        error: 'Registration limit reached',
        message: 'Too many registration attempts. Please try again later.',
        retryAfter: 3600,
    },
    standardHeaders: true,
    legacyHeaders: false,
});
