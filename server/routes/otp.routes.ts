/**
 * OTP Routes
 * 
 * Handles phone verification via SMS OTP.
 * Rate limited to prevent abuse.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { db } from '../db.js';
import { otpCodes } from '../../shared/schema.js';
import { smsService } from '../services/sms.service.js';
import { eq, and, gt, desc } from 'drizzle-orm';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiters
const otpSendLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 OTP requests per IP per hour
    message: { error: 'Too many OTP requests. Please try again in 1 hour.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const otpVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 verification attempts per IP
    message: { error: 'Too many verification attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Hash an OTP code for secure storage
 */
function hashOtpCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * POST /api/otp/send - Send OTP to phone number
 */
router.post('/api/otp/send', otpSendLimiter, async (req: Request, res: Response) => {
    try {
        const { phone, purpose = 'request_verification' } = req.body;

        // Validate phone
        if (!phone) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

        if (!smsService.isValidBangladeshPhone(phone)) {
            return res.status(400).json({
                error: 'Invalid phone number format. Please enter a valid Bangladesh phone number (e.g., 01712345678)'
            });
        }

        const normalizedPhone = smsService.normalizePhoneNumber(phone);

        // Check for existing unexpired OTP (cooldown)
        const existingOtps = await db
            .select()
            .from(otpCodes)
            .where(
                and(
                    eq(otpCodes.phone, normalizedPhone),
                    gt(otpCodes.expiresAt, new Date())
                )
            )
            .orderBy(desc(otpCodes.createdAt))
            .limit(1);

        if (existingOtps.length > 0) {
            const lastOtp = existingOtps[0];
            const createdAt = new Date(lastOtp.createdAt);
            const cooldownEnd = new Date(createdAt.getTime() + 60000); // 60 second cooldown
            const now = new Date();

            if (now < cooldownEnd) {
                const secondsRemaining = Math.ceil((cooldownEnd.getTime() - now.getTime()) / 1000);
                return res.status(429).json({
                    error: `Please wait ${secondsRemaining} seconds before requesting a new OTP`,
                    retryAfterSeconds: secondsRemaining,
                });
            }
        }

        // Generate 6-digit OTP
        const code = smsService.generateOtpCode();
        const codeHash = hashOtpCode(code);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        // Store OTP
        const otpId = uuidv4();
        await db.insert(otpCodes).values({
            id: otpId,
            phone: normalizedPhone,
            codeHash,
            purpose,
            attempts: 0,
            maxAttempts: 3,
            expiresAt,
            ipAddress: req.ip || null,
        });

        // Send SMS
        const smsResult = await smsService.sendOtpSms(normalizedPhone, code);

        if (!smsResult.success) {
            console.error('[OTP] Failed to send SMS:', smsResult.error);
            return res.status(500).json({
                error: 'Failed to send OTP. Please try again.',
                details: process.env.NODE_ENV === 'development' ? smsResult.error : undefined
            });
        }

        console.log(`[OTP] Sent to ${normalizedPhone.slice(-4)}, expires at ${expiresAt.toISOString()}`);

        res.json({
            success: true,
            message: 'OTP sent successfully',
            otpSessionId: otpId,
            expiresAt: expiresAt.toISOString(),
            phone: `+${normalizedPhone.slice(0, 5)}*****${normalizedPhone.slice(-2)}`, // Masked phone
        });

    } catch (error: any) {
        console.error('[OTP] Error sending OTP:', error);
        res.status(500).json({ error: 'Failed to send OTP' });
    }
});

/**
 * POST /api/otp/verify - Verify OTP code
 */
router.post('/api/otp/verify', otpVerifyLimiter, async (req: Request, res: Response) => {
    try {
        const { otpSessionId, code, phone } = req.body;

        if (!code || (!otpSessionId && !phone)) {
            return res.status(400).json({ error: 'OTP code and session ID or phone are required' });
        }

        // Find the OTP record
        let otpRecord;

        if (otpSessionId) {
            const records = await db
                .select()
                .from(otpCodes)
                .where(eq(otpCodes.id, otpSessionId))
                .limit(1);
            otpRecord = records[0];
        } else if (phone) {
            const normalizedPhone = smsService.normalizePhoneNumber(phone);
            const records = await db
                .select()
                .from(otpCodes)
                .where(
                    and(
                        eq(otpCodes.phone, normalizedPhone),
                        gt(otpCodes.expiresAt, new Date())
                    )
                )
                .orderBy(desc(otpCodes.createdAt))
                .limit(1);
            otpRecord = records[0];
        }

        if (!otpRecord) {
            return res.status(400).json({ error: 'OTP not found or expired. Please request a new one.' });
        }

        // Check if already verified
        if (otpRecord.verifiedAt) {
            return res.status(400).json({ error: 'This OTP has already been used' });
        }

        // Check expiry
        if (new Date() > new Date(otpRecord.expiresAt)) {
            return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
        }

        // Check attempts
        if (otpRecord.attempts >= otpRecord.maxAttempts) {
            return res.status(400).json({ error: 'Maximum verification attempts exceeded. Please request a new OTP.' });
        }

        // Verify the code
        const codeHash = hashOtpCode(code.toString().trim());

        if (codeHash !== otpRecord.codeHash) {
            // Increment attempts
            await db
                .update(otpCodes)
                .set({ attempts: otpRecord.attempts + 1 })
                .where(eq(otpCodes.id, otpRecord.id));

            const remainingAttempts = otpRecord.maxAttempts - otpRecord.attempts - 1;
            return res.status(400).json({
                error: `Invalid OTP code. ${remainingAttempts} attempts remaining.`,
                remainingAttempts
            });
        }

        // Mark as verified
        await db
            .update(otpCodes)
            .set({ verifiedAt: new Date() })
            .where(eq(otpCodes.id, otpRecord.id));

        console.log(`[OTP] Verified for phone ${otpRecord.phone.slice(-4)}`);

        res.json({
            success: true,
            message: 'Phone number verified successfully',
            phone: otpRecord.phone,
            verifiedAt: new Date().toISOString(),
        });

    } catch (error: any) {
        console.error('[OTP] Error verifying OTP:', error);
        res.status(500).json({ error: 'Failed to verify OTP' });
    }
});

/**
 * POST /api/otp/resend - Resend OTP (just calls send again with same phone)
 */
router.post('/api/otp/resend', otpSendLimiter, async (req: Request, res: Response) => {
    // This is essentially the same as /send but semantically different for the frontend
    const { otpSessionId } = req.body;

    if (otpSessionId) {
        // Find the original OTP to get the phone number
        const records = await db
            .select()
            .from(otpCodes)
            .where(eq(otpCodes.id, otpSessionId))
            .limit(1);

        if (records.length > 0) {
            req.body.phone = records[0].phone;
        }
    }

    // Forward to /send logic
    // Redirect the client to retry the send endpoint with the correct phone number
    // This is cleaner than trying to internally dispatch within Express
    res.redirect(307, '/api/otp/send');
});

export default router;
