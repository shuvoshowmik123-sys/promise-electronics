import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { userRepo } from '../repositories/index.js';
import { auditLogger } from '../utils/auditLogger.js';
import { CorporateSetupError, completeCorporateSetup, lookupSetupToken } from '../services/corporate-setup-token.service.js';

const router = Router();

// GET /api/corporate/setup/:token — validate token (no sensitive data returned)
router.get('/setup/:token', async (req: Request, res: Response) => {
    try {
        const lookup = await lookupSetupToken(req.params.token);
        if (!lookup) {
            return res.json({ valid: false, reason: 'not_found' });
        }
        if (!lookup.valid) {
            return res.json({ valid: false, reason: lookup.reason });
        }

        const user = await userRepo.getUser(lookup.userId);
        if (!user) return res.json({ valid: false, reason: 'not_found' });

        res.json({
            valid: true,
            type: lookup.type,
            email: user.email,
            username: user.username,
            expiresAt: lookup.expiresAt,
        });
    } catch (error) {
        console.error('[CorporateSetup] Token lookup error:', (error as Error).message);
        res.status(500).json({ error: 'Failed to validate link' });
    }
});

const completeSetupSchema = z.object({
    password: z.string().min(8, 'Password must be at least 8 characters').max(64),
    confirmPassword: z.string().min(8).max(64),
}).refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
});

// POST /api/corporate/setup/:token — complete account setup or password reset
router.post('/setup/:token', async (req: Request, res: Response) => {
    try {
        const parsed = completeSetupSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.errors[0]?.message || 'Invalid input' });
        }

        const type = await completeCorporateSetup(req.params.token, parsed.data.password);

        const lookup = await lookupSetupToken(req.params.token);
        auditLogger.log({
            userId: lookup?.userId ?? 'unknown',
            action: type === 'setup' ? 'ACTIVATE' : 'PASSWORD_RESET',
            entity: 'CorporateUser',
            entityId: lookup?.userId ?? 'unknown',
            details: `Corporate user completed ${type} via secure link`,
            severity: 'info',
        }).catch(() => {});

        res.json({
            success: true,
            message: type === 'setup'
                ? 'Account activated. You can now log in.'
                : 'Password updated. You can now log in.',
        });
    } catch (error) {
        if (error instanceof CorporateSetupError) {
            return res.status(400).json({ error: error.message });
        }
        console.error('[CorporateSetup] Complete error:', (error as Error).message);
        res.status(500).json({ error: 'Failed to complete setup' });
    }
});

export default router;
