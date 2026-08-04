/**
 * Customer Routes
 * 
 * Handles customer authentication, profile, and SSE connections.
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID, createHash } from 'crypto';
import { and, desc, eq, or, ne, sql } from 'drizzle-orm';
// sql used for session auth time stamp
import { storage } from '../storage.js';
import { userRepo, customerRepo, orderRepo, corporateRepo, notificationRepo } from '../repositories/index.js';
import {
    customerLoginSchema,
    customerRegisterSchema,
    requireCustomerAuth,
    getCustomerId
} from './middleware/auth.js';
import { insertManualPaymentSchema, manualPayments, User } from '../../shared/schema.js';
import { db } from '../db.js';
import {
    addCustomerSSEClient,
    removeCustomerSSEClient,
    notifyAdminUpdate,
    notifyCustomerUpdate
} from './middleware/sse-broker.js';
import { firebaseAdmin } from '../services/firebase.js';
import { authLimiter, registrationLimiter, serviceRequestLimiter, accountRecoveryLimiter, resetLinkLimiter } from './middleware/rate-limit.js';
import { isPhoneBlacklisted } from './blacklist.routes.js';
import { normalizePhone } from '../utils/phone.js';
import { z } from 'zod';
import { customerService } from '../services/customer.service.js';
import {
    establishCustomerSession,
    assertCustomerSessionFresh,
    enforceCustomerLoginPolicy,
    CustomerAccountNotActivatedError,
} from '../services/customer-session.service.js';
import { TIMING_EQUALISER_HASH, isPlaceholderPassword } from '../services/customer-password.js';
import { deriveServiceRequestPaymentState, applyCustomerSafePaymentState } from '../services/service-request-payment-projection.service.js';

const router = Router();

function regenerateSession(req: Request): Promise<void> {
    return new Promise((resolve, reject) => {
        // Do not preserve prior CSRF across regenerate (HOTFIX-2)
        req.session.regenerate((err) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

const customerPaymentSubmissionSchema = insertManualPaymentSchema.pick({
    method: true,
    amount: true,
    senderNumber: true,
    transactionId: true,
    notes: true,
}).extend({
    method: z.enum(["bkash_send_money", "nagad_send_money"]),
    senderNumber: z.string().min(8),
    transactionId: z.string().min(3),
});

async function getCustomerOwnedServiceRequest(serviceRequestId: string, customerId: string) {
    const request = await storage.getServiceRequest(serviceRequestId);
    if (!request) return null;
    if (request.customerId === customerId) return request;

    const user = await userRepo.getUser(customerId);
    if (user?.phone && request.phone === user.phone) {
        return request;
    }

    return null;
}

async function getServiceRequestPayments(serviceRequestId: string, jobTicketId?: string | null) {
    const linkCondition = jobTicketId
        ? or(eq(manualPayments.serviceRequestId, serviceRequestId), eq(manualPayments.jobTicketId, jobTicketId))
        : eq(manualPayments.serviceRequestId, serviceRequestId);

    return db
        .select()
        .from(manualPayments)
        .where(linkCondition)
        .orderBy(desc(manualPayments.createdAt))
        .limit(20);
}

// ============================================
// Customer Authentication
// ============================================

/**
 * POST /api/customer/register - Register new customer
 */
/**
 * Activate the unclaimed account this same browser created by submitting a
 * repair request, and sign the customer in.
 *
 * Sets the password they chose, flips the account to active, and clears the
 * one-time claim marker so the same session cannot claim twice. Deliberately
 * mirrors the normal registration response so the client needs no special case.
 */
async function claimUnclaimedAccount(
    req: Request,
    res: Response,
    existingUser: User,
    validated: { name: string; phone: string; email?: string; address?: string; password: string },
) {
    const hashedPassword = await bcrypt.hash(validated.password, 12);

    const updated = await userRepo.updateUser(existingUser.id, {
        name: validated.name || existingUser.name,
        email: validated.email || existingUser.email,
        address: validated.address || existingUser.address,
        password: hashedPassword,
        customerAccountState: 'active',
        passwordChangedAt: new Date(),
    } as any);

    const user = updated ?? existingUser;

    // Any staff-issued link for this account is now redundant, and leaving one
    // live would keep an unnecessary credential-reset capability open. Same rule
    // the login path already applies.
    await db.execute(sql`
        UPDATE customer_reset_links
        SET invalidated_at = NOW(), invalidated_reason = 'claimed_by_submitter'
        WHERE user_id = ${user.id}
          AND consumed_at IS NULL
          AND invalidated_at IS NULL
    `);

    if (user.phone) {
        await customerService.linkServiceRequestsByPhone(user.phone, user.id);
    }

    await regenerateSession(req);
    const { csrfToken } = await establishCustomerSession(req, res, {
        customerId: user.id,
        authMethod: 'phone',
    });
    // regenerate() already dropped it; being explicit so the intent survives a
    // future refactor of session handling.
    delete req.session.pendingClaimUserId;

    console.log('[CustomerAuth] Unclaimed account claimed by original submitter');

    const { password: _pw, ...safeUser } = user;
    return res.status(201).json({ ...safeUser, csrfToken });
}

router.post('/api/customer/register', registrationLimiter, async (req: Request, res: Response) => {
    try {
        const validated = customerRegisterSchema.parse(req.body);

        const existingUser = await userRepo.getUserByPhoneNormalized(validated.phone);
        if (existingUser) {
            if (existingUser.customerAccountState === 'unclaimed') {
                // Same-session claim: this browser submitted the repair request that
                // created this unclaimed record, so it is the submitter, not a
                // stranger who happens to know the number. Nothing else can hold
                // this session value — knowing the phone is not enough.
                if (req.session.pendingClaimUserId === existingUser.id) {
                    const claimed = await claimUnclaimedAccount(req, res, existingUser, validated);
                    return claimed;
                }

                return res.status(400).json({
                    error: 'This phone is already linked to a repair record. Please contact support to activate online access.',
                    code: 'ACCOUNT_SETUP_REQUIRED',
                });
            }
            return res.status(400).json({ error: 'Phone number already registered. Please login instead.' });
        }

        const hashedPassword = await bcrypt.hash(validated.password, 12);

        const user = await userRepo.createUser({
            username: validated.phone,
            name: validated.name,
            phone: validated.phone,
            email: validated.email || null,
            address: validated.address || null,
            password: hashedPassword,
            role: 'Customer',
            status: 'Active',
            permissions: '{}',
        });

        await customerService.linkServiceRequestsByPhone(validated.phone, user.id);

        await regenerateSession(req);
        const { csrfToken } = await establishCustomerSession(req, res, {
            customerId: user.id,
            authMethod: 'phone',
        });

        const { password: _, ...safeUser } = user;

        notifyAdminUpdate({
            type: 'customer_created',
            data: safeUser,
            createdAt: new Date().toISOString(),
        });

        res.status(201).json({ ...safeUser, csrfToken });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Invalid registration data' });
        }
        console.error('[CustomerAuth] Registration failed:', (error as Error).message);
        res.status(500).json({ error: 'Failed to register. Please try again.' });
    }
});

/**
 * POST /api/customer/login - Customer login
 */
router.post('/api/customer/login', authLimiter, async (req: Request, res: Response) => {
    try {
        const validated = customerLoginSchema.parse(req.body);

        const GENERIC_401 = { error: 'Invalid phone number or password' };

        const user = await userRepo.getUserByPhoneNormalized(validated.phone);

        // Every rejection below must cost the same as a wrong password, or the
        // response time reveals which numbers have accounts here. Comparing
        // against a real hash we control burns the identical CPU without ever
        // matching. Measured gap if skipped: 273ms vs 0.02ms — ~12,000x.
        const rejectInConstantTime = async () => {
            await bcrypt.compare(validated.password, TIMING_EQUALISER_HASH);
            return res.status(401).json(GENERIC_401);
        };

        if (!user || !user.password) {
            return rejectInConstantTime();
        }

        // Unclaimed accounts are rejected BEFORE their stored value is compared.
        // Intake-created rows hold NO_CUSTOMER_PASSWORD, not a hash, so comparing
        // it would return instantly and leak the account's state through timing.
        //
        // This check used to sit after bcrypt.compare, which made it unreachable
        // for those accounts: the placeholder rejected everyone first, so the
        // guard never ran. Reordering makes it effective; the constant-time
        // rejection keeps it silent.
        if (user.customerAccountState === 'unclaimed' || isPlaceholderPassword(user.password)) {
            console.warn('[CustomerAuth] Login rejected: account not activated');
            return rejectInConstantTime();
        }

        const isValid = await bcrypt.compare(validated.password, user.password);
        if (!isValid) {
            return res.status(401).json(GENERIC_401);
        }

        // Shared gate: re-checks activation and kills live reset links. The
        // unclaimed case is already handled above; this remains the single place
        // that invalidates outstanding links on a successful login.
        try {
            await enforceCustomerLoginPolicy({
                userId: user.id,
                accountState: user.customerAccountState,
                authMethod: 'phone',
            });
        } catch (policyErr) {
            if (policyErr instanceof CustomerAccountNotActivatedError) {
                return res.status(401).json(GENERIC_401);
            }
            throw policyErr;
        }

        await userRepo.updateUserLastLogin(user.id);

        await regenerateSession(req);
        const { csrfToken } = await establishCustomerSession(req, res, {
            customerId: user.id,
            authMethod: 'phone',
        });

        if (user.phone) {
            await customerService.linkServiceRequestsByPhone(user.phone, user.id);
        }

        const { password: _, ...safeUser } = user;
        res.json({ ...safeUser, csrfToken });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Invalid login data' });
        }
        console.error('[CustomerAuth] Login failed:', (error as Error).message);
        res.status(500).json({ error: 'Failed to login. Please try again.' });
    }
});

/**
 * POST /api/customer/google-auth - Google Sign-In
 */
router.post('/api/customer/google-auth', authLimiter, async (req: Request, res: Response) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        let decodedToken;
        try {
            decodedToken = await firebaseAdmin.auth().verifyIdToken(token);
        } catch (e) {
            console.error('[CustomerAuth] Token verification failed:', (e as Error).message);
            return res.status(401).json({ error: 'Invalid token' });
        }

        const { uid, email, name, picture } = decodedToken;

        const user = await storage.upsertUserFromGoogle({
            googleSub: uid,
            email: email || null,
            name: name || 'Google User',
            profileImageUrl: picture || null,
        });

        // Google sign-in must not become a side door around staff activation.
        // upsertUserFromGoogle links by email, so proving control of an address
        // attached to an unclaimed account would otherwise hand over a session
        // without the phone check the reset link enforces.
        try {
            await enforceCustomerLoginPolicy({
                userId: user.id,
                accountState: (user as any).customerAccountState,
                authMethod: 'google',
            });
        } catch (policyErr) {
            if (policyErr instanceof CustomerAccountNotActivatedError) {
                return res.status(403).json({
                    error: 'This account has not been set up yet. Please contact us for a setup link.',
                    code: policyErr.code,
                });
            }
            throw policyErr;
        }

        await userRepo.updateUserLastLogin(user.id);

        await regenerateSession(req);
        const { csrfToken } = await establishCustomerSession(req, res, {
            customerId: user.id,
            authMethod: 'google',
        });

        if (user.phone) {
            await customerService.linkServiceRequestsByPhone(user.phone, user.id);
        }

        const { password: _, ...safeUser } = user;
        res.json({ ...safeUser, csrfToken });

    } catch (error) {
        console.error('[CustomerAuth] Google auth failed:', (error as Error).message);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

/**
 * POST /api/customer/link-google - Link Google Account to existing user
 */
router.post('/api/customer/link-google', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const { token } = req.body;
        const currentUserId = req.session.customerId;

        if (!token) {
            return res.status(400).json({ error: 'Google token is required' });
        }

        let decodedToken;
        try {
            decodedToken = await firebaseAdmin.auth().verifyIdToken(token);
        } catch (e) {
            console.error('[CustomerAuth] Token verification failed:', (e as Error).message);
            return res.status(401).json({ error: 'Invalid Google token' });
        }

        const { uid: googleSub, email, picture } = decodedToken;

        // Check if this Google account is already linked to another user
        const existingUser = await storage.getUserByGoogleSub(googleSub);
        if (existingUser && existingUser.id !== currentUserId) {
            return res.status(409).json({ error: 'This Google account is already linked to another user.' });
        }

        // Update current user
        // We will update googleSub, and optionally email/profileImage if they are missing
        const currentUser = await userRepo.getUser(currentUserId!);

        if (!currentUser) {
            return res.status(404).json({ error: 'User not found' });
        }

        const updates: Partial<User> = {
            googleSub: googleSub,
        };

        if (!currentUser.email && email) {
            updates.email = email;
        }

        if (!currentUser.profileImageUrl && picture) {
            updates.profileImageUrl = picture;
        }

        const updatedUser = await userRepo.updateUser(currentUser.id, updates);

        if (!updatedUser) {
            return res.status(500).json({ error: 'Failed to update user' });
        }

        const { password: _, ...safeUser } = updatedUser;
        res.json(safeUser);

    } catch (error) {
        console.error('[CustomerAuth] Link Google failed:', (error as Error).message);
        res.status(500).json({ error: 'Failed to link Google account' });
    }
});

/**
 * TEST-PROCESS ONLY (HOTFIX-2A): strip passwordChangedAtStamp for SESSION_REAUTH_REQUIRED proof.
 * Registered only when NODE_ENV=test AND QA_SESSION_TEST_HOOK=1.
 * Development / production / staging-like: route not registered → normal API 404.
 */
if (process.env.NODE_ENV === "test" && process.env.QA_SESSION_TEST_HOOK === "1") {
    router.post("/api/test/customer-session/strip-password-stamp", async (req: Request, res: Response) => {
        if (!req.session?.customerId) {
            return res.status(401).json({ error: "Not authenticated", code: "NOT_AUTHENTICATED" });
        }
        delete (req.session as any).passwordChangedAtStamp;
        req.session.save((err) => {
            if (err) return res.status(500).json({ error: "Session save failed" });
            res.json({ ok: true });
        });
    });
}

/**
 * POST /api/customer/logout - Customer logout
 */
router.post('/api/customer/logout', (req: Request, res: Response) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('[CustomerAuth] Logout session destroy failed:', (err as Error).message);
            return res.status(500).json({ error: 'Failed to logout' });
        }
        res.clearCookie('customer.sid');
        res.clearCookie('connect.sid');
        res.json({ message: 'Logged out successfully' });
    });
});

// ============================================
// Account Recovery & Password Reset
// ============================================

const recoveryRequestSchema = z.object({
    phone: z.string().min(6).optional(),
    ticketNumber: z.string().optional(),
    name: z.string().optional(),
    message: z.string().optional(),
});
const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6),
});

/**
 * POST /api/customer/account-recovery/request
 * Submits a support-assisted recovery request via the inquiries system.
 */
router.post('/api/customer/account-recovery/request', accountRecoveryLimiter, async (req: Request, res: Response) => {
    try {
        const data = recoveryRequestSchema.parse(req.body);
        const genericOk = { message: 'If the details match an account, support will contact you.' };

        const phone = data.phone || 'not provided';
        const parts = [
            '[ACCOUNT_RECOVERY]',
            data.ticketNumber ? `Ticket: ${data.ticketNumber}` : null,
            data.message || null,
        ].filter(Boolean);

        await storage.createInquiry({
            name: data.name || 'Account Recovery Request',
            phone,
            message: parts.join(' — '),
        });

        notifyAdminUpdate({
            type: 'account_recovery_request',
            data: { phone: phone.slice(-4) },
            createdAt: new Date().toISOString(),
        });

        console.log('[AccountRecovery] Recovery request submitted');

        res.json(genericOk);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Invalid request' });
        }
        console.error('[AccountRecovery] Request failed:', (error as Error).message);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
});


// ============================================
// One-Time Reset Links (staff-issued)
// ============================================

const resetLinkVerifySchema = z.object({
    token: z.string().min(20).max(200),
});
const resetLinkCompleteSchema = z.object({
    token: z.string().min(20).max(200),
    phone: z.string().min(6),
    password: z.string().min(6).max(72),
    confirmPassword: z.string().min(6).max(72),
});

/** SHA-256 hex of a high-entropy token. Fast hash is correct here — see migration note. */
function hashResetToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

/** Max wrong-phone guesses before the link burns. */
const RESET_LINK_MAX_PHONE_ATTEMPTS = 5;

/**
 * POST /api/customer/reset-link/verify
 * Reports only whether the link is still usable. Never consumes it and never
 * reveals whose account it belongs to — a leaked link must not become an
 * identity oracle.
 */
router.post('/api/customer/reset-link/verify', resetLinkLimiter, async (req: Request, res: Response) => {
    try {
        const { token } = resetLinkVerifySchema.parse(req.body);
        const tokenHash = hashResetToken(token);

        const rows = await db.execute(sql`
            SELECT id FROM customer_reset_links
            WHERE token_hash = ${tokenHash}
              AND consumed_at IS NULL
              AND invalidated_at IS NULL
              AND expires_at > NOW()
              AND phone_attempts < ${RESET_LINK_MAX_PHONE_ATTEMPTS}
            LIMIT 1
        `);
        const found = ((rows as any).rows ?? rows) as Array<{ id: string }>;
        res.json({ valid: Array.isArray(found) && found.length > 0 });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.json({ valid: false });
        }
        console.error('[ResetLink] Verify failed:', (error as Error).message);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
});

/**
 * POST /api/customer/reset-link/complete
 * Consumes a one-time link and sets the customer's password.
 *
 * The whole check-and-consume runs in one transaction with SELECT ... FOR UPDATE
 * so two concurrent submissions cannot both succeed. The session is only
 * established after the transaction commits.
 */
router.post('/api/customer/reset-link/complete', resetLinkLimiter, async (req: Request, res: Response) => {
    const genericFail = { error: 'This reset link is no longer valid, or the phone number did not match.' };
    try {
        const { token, phone, password, confirmPassword } = resetLinkCompleteSchema.parse(req.body);

        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'Passwords do not match' });
        }

        const tokenHash = hashResetToken(token);
        const suppliedNorm = normalizePhone(phone);
        if (!suppliedNorm) {
            return res.status(400).json(genericFail);
        }

        const outcome = await db.transaction(async (tx) => {
            const linkRows = await tx.execute(sql`
                SELECT id, user_id, phone_attempts
                FROM customer_reset_links
                WHERE token_hash = ${tokenHash}
                  AND consumed_at IS NULL
                  AND invalidated_at IS NULL
                  AND expires_at > NOW()
                FOR UPDATE
            `);
            const link = (((linkRows as any).rows ?? linkRows) as Array<{
                id: string; user_id: string; phone_attempts: number;
            }>)[0];

            if (!link) return { ok: false as const };

            if (link.phone_attempts >= RESET_LINK_MAX_PHONE_ATTEMPTS) {
                await tx.execute(sql`
                    UPDATE customer_reset_links
                    SET invalidated_at = NOW(), invalidated_reason = 'max_phone_attempts'
                    WHERE id = ${link.id}
                `);
                return { ok: false as const };
            }

            const userRows = await tx.execute(sql`
                SELECT id, phone, phone_normalized FROM users WHERE id = ${link.user_id} LIMIT 1
            `);
            const user = (((userRows as any).rows ?? userRows) as Array<{
                id: string; phone: string | null; phone_normalized: string | null;
            }>)[0];

            // Fall back to normalizing the raw phone for legacy rows with a blank
            // phone_normalized, the same way retail intake does.
            const ownerNorm = user?.phone_normalized?.trim() || normalizePhone(user?.phone ?? null);
            if (!user || !ownerNorm || ownerNorm !== suppliedNorm) {
                await tx.execute(sql`
                    UPDATE customer_reset_links
                    SET phone_attempts = phone_attempts + 1
                    WHERE id = ${link.id}
                `);
                return { ok: false as const };
            }

            const hashedPassword = await bcrypt.hash(password, 12);
            await tx.execute(sql`
                UPDATE users
                SET password = ${hashedPassword},
                    customer_account_state = 'active',
                    password_changed_at = NOW()
                WHERE id = ${user.id}
            `);
            await tx.execute(sql`
                UPDATE customer_reset_links
                SET consumed_at = NOW()
                WHERE id = ${link.id}
            `);
            // Any other live link for this customer dies with the one just used.
            await tx.execute(sql`
                UPDATE customer_reset_links
                SET invalidated_at = NOW(), invalidated_reason = 'superseded_by_use'
                WHERE user_id = ${user.id}
                  AND id <> ${link.id}
                  AND consumed_at IS NULL
                  AND invalidated_at IS NULL
            `);
            return { ok: true as const, userId: user.id, phone: user.phone };
        });

        if (!outcome.ok) {
            return res.status(400).json(genericFail);
        }

        await regenerateSession(req);
        const { csrfToken } = await establishCustomerSession(req, res, {
            customerId: outcome.userId,
            authMethod: 'phone',
        });

        if (outcome.phone) {
            await customerService.linkServiceRequestsByPhone(outcome.phone, outcome.userId);
        }

        const fresh = await userRepo.getUser(outcome.userId);
        const { password: _pw, ...safeUser } = (fresh ?? {}) as any;

        console.log(`[ResetLink] Password set via one-time link for user ${outcome.userId}`);
        res.json({ ...safeUser, csrfToken });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Invalid request' });
        }
        console.error('[ResetLink] Complete failed:', (error as Error).message);
        res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
});

/**
 * POST /api/customer/change-password - Change password (authenticated)
 */
router.post('/api/customer/change-password', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const customerId = getCustomerId(req);
        if (!customerId) {
            return res.status(401).json({ error: 'Not authenticated', code: 'NOT_AUTHENTICATED' });
        }

        const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

        const user = await storage.getCustomer(customerId);
        if (!user || !user.password) {
            return res.status(400).json({ error: 'Password change is not available for this account' });
        }

        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await userRepo.updateUser(customerId, { password: hashedPassword } as any);
        await db.execute(sql`UPDATE users SET password_changed_at = NOW() WHERE id = ${customerId}`);

        console.log(`[CustomerAuth] Password changed for user ${customerId}`);

        res.json({ message: 'Password changed successfully' });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Invalid request' });
        }
        console.error('[CustomerAuth] Change password failed:', (error as Error).message);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

/**
 * GET /api/customer/me - Get current customer
 */
router.get('/api/customer/me', async (req: Request, res: Response) => {
    try {
        if (!req.session?.customerId) {
            return res.status(401).json({
                error: 'Not logged in',
                code: 'NOT_AUTHENTICATED'
            });
        }

        const customer = await storage.getCustomer(req.session.customerId);
        if (!customer) {
            req.session.destroy(() => { });
            return res.status(401).json({
                error: 'Customer not found',
                code: 'INVALID_SESSION'
            });
        }

        const { password: _, ...safeCustomer } = customer;
        res.json(safeCustomer);
    } catch (error) {
        // Infrastructure failure — not an auth failure. Client must not treat this as logout.
        console.error('[CustomerAuth] /me lookup failed:', (error as Error)?.message);
        res.status(503).json({
            error: 'Unable to verify session right now. Please try again.',
            code: 'AUTH_CHECK_UNAVAILABLE',
        });
    }
});

/**
 * PUT /api/customer/profile - Update customer profile
 */
router.put('/api/customer/profile', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const customerId = getCustomerId(req);
        if (!customerId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { phone, address, name, email, avatar, profileImageUrl } = req.body;

        const updates: any = {};
        if (phone !== undefined) updates.phone = phone;
        if (address !== undefined) updates.address = address;
        if (name !== undefined) updates.name = name;
        if (email !== undefined) updates.email = email;
        if (avatar !== undefined) updates.avatar = avatar;
        if (profileImageUrl !== undefined) updates.profileImageUrl = profileImageUrl;

        const oldCustomer = await storage.getCustomer(customerId);
        const isAddingPhone = phone && !oldCustomer?.phone;

        const customer = await storage.updateCustomer(customerId, updates);
        if (!customer) {
            return res.status(404).json({ error: 'Customer not found' });
        }

        if (isAddingPhone && customer.phone) {
            const linkedCount = await customerService.linkServiceRequestsByPhone(customer.phone, customer.id);
            if (linkedCount > 0) {
                console.log(`[CustomerProfile] Linked ${linkedCount} service request(s) to customer ${customer.id}`);
            }
        }

        const { password: _, ...safeCustomer } = customer;
        res.json(safeCustomer);
    } catch (error: any) {
        console.error('[CustomerProfile] Update failed:', (error as Error).message);

        if (error?.code === '23505' && error?.constraint === 'customers_phone_key') {
            return res.status(409).json({
                error: 'This phone number is already in use. Please try a different number.',
                code: 'PHONE_EXISTS'
            });
        }

        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ============================================
// Customer SSE Events
// ============================================

/**
 * GET /api/customer/events - SSE endpoint for customer real-time updates
 */
router.get('/api/customer/events', requireCustomerAuth, (req: Request, res: Response) => {
    const customerId = req.session.customerId!;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    addCustomerSSEClient(customerId, res);

    const heartbeat = setInterval(() => {
        try {
            res.write(`:heartbeat\n\n`);
        } catch (e) {
            clearInterval(heartbeat);
        }
    }, 30000);

    req.on('close', () => {
        clearInterval(heartbeat);
        removeCustomerSSEClient(customerId, res);
    });
});

// ============================================
// Customer Service Requests
// ============================================

/**
 * GET /api/customer/service-requests - Get customer's service requests
 */
router.get('/api/customer/service-requests', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const orders = await storage.getServiceRequestsByCustomerId(req.session.customerId!);
        const enriched = await Promise.all(
            orders.map(async (o) => {
                const state = await deriveServiceRequestPaymentState(o);
                return applyCustomerSafePaymentState(o, state);
            }),
        );
        res.json(enriched);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch service requests' });
    }
});

/**
 * GET /api/customer/service-requests/:id - Get service request details
 */
/**
 * GET /api/customer/service-requests/:id/handover-code
 *
 * The live handover code for the customer's own repair, or an explicit "not
 * yet" so the tracking page can explain what the space is for.
 *
 * The customer can never ask for a code — one exists only after a staff member
 * or driver is standing in front of them and has issued it. That is the whole
 * point of the control: it proves the customer is present and consenting, so
 * letting either side conjure one on demand would defeat it.
 *
 * The code is returned only while its OTP is genuinely live — unverified and
 * unexpired — so it disappears from the screen the moment it is used or times
 * out, rather than lingering as a stale number someone might read out later.
 */
router.get('/api/customer/service-requests/:id/handover-code', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const order = await storage.getServiceRequest(req.params.id);
        if (!order) return res.status(404).json({ error: 'Service request not found' });
        if (order.customerId !== req.session.customerId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const purposes = [`custody_receive:${order.id}`, `custody_delivery:${order.id}`];
        const live = await db.execute(sql`
            SELECT purpose, expires_at
            FROM otp_codes
            WHERE purpose IN (${sql.join(purposes.map((p) => sql`${p}`), sql`, `)})
              AND verified_at IS NULL
              AND expires_at > NOW()
            ORDER BY created_at DESC
            LIMIT 1
        `);
        const row = ((live as any).rows ?? live)[0] as { purpose: string; expires_at: string } | undefined;

        if (!row) {
            return res.json({ active: false });
        }

        // The plaintext lives in the notification that was sent to this
        // customer; otp_codes stores only a hash. Scoped to this customer and
        // to a code that is still live.
        const notif = await db.execute(sql`
            SELECT message FROM notifications
            WHERE user_id = ${req.session.customerId}
              AND type = 'handover_code'
            ORDER BY created_at DESC
            LIMIT 1
        `);
        const message = String((((notif as any).rows ?? notif)[0]?.message) ?? '');
        const code = message.match(/\b(\d{6})\b/)?.[1] ?? null;

        if (!code) return res.json({ active: false });

        return res.json({
            active: true,
            code,
            action: row.purpose.startsWith('custody_delivery') ? 'delivery' : 'receive',
            expiresAt: row.expires_at,
        });
    } catch (error) {
        console.error('[HandoverCode] Lookup failed:', (error as Error).message);
        res.status(500).json({ error: 'Could not load the handover code' });
    }
});

router.get('/api/customer/service-requests/:id', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const order = await storage.getServiceRequest(req.params.id);
        if (!order) {
            return res.status(404).json({ error: 'Service request not found' });
        }

        if (order.customerId !== req.session.customerId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const rawEvents = await storage.getServiceRequestEvents(order.id);
        const { filterCustomerVisibleTimelineEvents } = await import('../services/retail-quote.service.js');
        const events = filterCustomerVisibleTimelineEvents(rawEvents);
        const payments = await getServiceRequestPayments(order.id, order.convertedJobId);
        const paymentState = await deriveServiceRequestPaymentState(order);
        const safeOrder = applyCustomerSafePaymentState(order, paymentState);
        res.json({ ...safeOrder, timeline: events, paymentSubmissions: payments });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch service request details' });
    }
});

router.post('/api/customer/service-requests/:id/payment-submissions', serviceRequestLimiter, requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const order = await getCustomerOwnedServiceRequest(req.params.id, req.session.customerId!);
        if (!order) {
            return res.status(404).json({ error: 'Service request not found' });
        }

        const validated = customerPaymentSubmissionSchema.parse(req.body);

        // Manual blacklist (human-managed): refuse confirmed-abuse numbers with a
        // support-contact message. Checks the typed sender number and the account phone.
        if (await isPhoneBlacklisted(validated.senderNumber) || await isPhoneBlacklisted(order.phone)) {
            return res.status(403).json({
                error: 'We could not accept this payment submission. Please contact support.',
                code: 'PAYMENT_SUBMISSION_BLOCKED',
            });
        }

        // Block duplicate txn IDs that are still in play, but ALLOW resubmitting
        // after a rejection (a wrongly-rejected real payment must be resubmittable).
        const activePayments = await db
            .select()
            .from(manualPayments)
            .where(and(
                eq(manualPayments.serviceRequestId, order.id),
                eq(manualPayments.transactionId, validated.transactionId),
                ne(manualPayments.status, 'rejected'),
            ))
            .limit(1);

        if (activePayments.length > 0) {
            return res.status(409).json({ error: 'This transaction ID was already submitted and is pending or verified for this request' });
        }

        const [payment] = await db.insert(manualPayments).values({
            ...validated,
            id: randomUUID(),
            serviceRequestId: order.id,
            jobTicketId: order.convertedJobId || null,
            customerName: order.customerName,
            customerPhone: order.phone,
            source: 'customer_submission',
            status: 'pending',
            updatedAt: new Date(),
        }).returning();

        notifyAdminUpdate({
            type: 'customer_payment_submitted',
            data: {
                paymentId: payment.id,
                serviceRequestId: order.id,
                ticketNumber: order.ticketNumber,
                amount: payment.amount,
                method: payment.method,
            },
            createdAt: new Date().toISOString(),
        });

        res.status(201).json(payment);
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Invalid payment submission' });
        }
        console.error('[CustomerPayment] Submission failed:', (error as Error).message);
        res.status(400).json({ error: 'Failed to submit payment verification' });
    }
});

/**
 * GET /api/customer/track/:ticketNumber - Track order by ticket number
 *
 * Ownership rules:
 * - Anonymous: limited public projection only (no phone, address, customerId, timeline, payments).
 * - Logged-in customer: full projection only when order.customerId === session.customerId,
 *   or legacy unlinked request whose normalized phone matches the customer's normalized phone.
 * - Never overwrite an existing order.customerId. Never reveal existence of another customer's ticket.
 */
router.get('/api/customer/track/:ticketNumber', async (req: Request, res: Response) => {
    try {
        const order = await storage.getServiceRequestByTicketNumber(req.params.ticketNumber);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Revoked session marker: never silent anonymous downgrade (HOTFIX-2)
        const revoked = (req.session as any)?.customerSessionRevoked as string | undefined;
        if (revoked === 'SESSION_REVOKED' || revoked === 'SESSION_REAUTH_REQUIRED') {
            return res.status(401).json({
                error:
                    revoked === 'SESSION_REVOKED'
                        ? 'Your password was changed. Please sign in again.'
                        : 'Please sign in again to continue.',
                code: revoked,
            });
        }

        const hasCustomerSession =
            Boolean(req.session?.customerId) ||
            Boolean((req as any).isAuthenticated?.() && (req as any).user?.customerId);

        // Anonymous: limited public projection only
        if (!hasCustomerSession) {
            return res.json({
                ticketNumber: order.ticketNumber,
                trackingStatus: order.trackingStatus,
                createdAt: order.createdAt,
                message: 'Login to see full details',
            });
        }

        // Logged-in cookie: freshness required before full projection
        const fresh = await assertCustomerSessionFresh(req, res, { allowMissingSession: false });
        if (!fresh.ok) return;
        const sessionCustomerId = fresh.customerId;

        if (order.customerId && order.customerId !== sessionCustomerId) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (!order.customerId) {
            const customer = await storage.getCustomer(sessionCustomerId);
            const orderPhoneNorm = normalizePhone(order.phone);
            const customerPhoneNorm = normalizePhone(customer?.phone);
            if (!customer || !orderPhoneNorm || !customerPhoneNorm || orderPhoneNorm !== customerPhoneNorm) {
                return res.status(404).json({ error: 'Order not found' });
            }
            await customerService.linkServiceRequestToCustomer(order.id, customer.id);
        }

        const rawEvents = await storage.getServiceRequestEvents(order.id);
        const { filterCustomerVisibleTimelineEvents } = await import('../services/retail-quote.service.js');
        const events = filterCustomerVisibleTimelineEvents(rawEvents);
        const payments = await getServiceRequestPayments(order.id, order.convertedJobId);
        const paymentState = await deriveServiceRequestPaymentState(order);
        const safeOrder = applyCustomerSafePaymentState(order, paymentState);
        res.json({ ...safeOrder, timeline: events, paymentSubmissions: payments });
    } catch (error) {
        res.status(500).json({ error: 'Failed to track order' });
    }
});

/**
 * POST /api/customer/service-requests/link - Link service request to customer
 */
router.post('/api/customer/service-requests/link', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const { ticketNumber } = req.body;
        if (!ticketNumber) {
            return res.status(400).json({ error: 'Ticket number is required' });
        }

        const order = await storage.getServiceRequestByTicketNumber(ticketNumber);
        if (!order) {
            return res.status(404).json({ error: 'Service request not found' });
        }

        const user = await userRepo.getUser(req.session.customerId!);
        if (!user || user.phone !== order.phone) {
            return res.status(403).json({ error: 'Phone number does not match order' });
        }

        const linked = await customerService.linkServiceRequestToCustomer(order.id, user.id);
        res.json(linked);
    } catch (error) {
        res.status(500).json({ error: 'Failed to link service request' });
    }
});

// ============================================
// Customer Warranties
// ============================================

/**
 * GET /api/customer/warranties - Get customer's warranties
 */
router.get('/api/customer/warranties', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const user = await userRepo.getUser(req.session.customerId!);
        if (!user || !user.phone) {
            return res.json([]);
        }

        const jobs = await storage.getJobTicketsByCustomerPhone(user.phone);

        const now = new Date();
        const warranties = jobs
            .filter(job => job.status === 'Completed' && (job.warrantyDays || 0) > 0)
            .map(job => {
                const isActive = job.warrantyExpiryDate ? new Date(job.warrantyExpiryDate) > now : false;
                const remainingDays = job.warrantyExpiryDate
                    ? Math.max(0, Math.ceil((new Date(job.warrantyExpiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
                    : 0;

                return {
                    jobId: job.id,
                    device: job.device,
                    issue: job.issue,
                    completedAt: job.completedAt,
                    serviceWarranty: {
                        days: job.warrantyDays || 0,
                        expiryDate: job.warrantyExpiryDate,
                        isActive: isActive,
                        remainingDays: remainingDays,
                    },
                    partsWarranty: {
                        days: job.warrantyDays || 0,
                        expiryDate: job.warrantyExpiryDate,
                        isActive: isActive,
                        remainingDays: remainingDays,
                    }
                };
            });

        res.json(warranties);
    } catch (error) {
        console.error('[CustomerWarranty] Fetch failed:', (error as Error).message);
        res.status(500).json({ error: 'Failed to fetch warranties' });
    }
});

// ============================================
// Customer Addresses
// ============================================

/**
 * GET /api/customer/addresses - Get customer's saved addresses
 */
router.get('/api/customer/addresses', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const customerId = getCustomerId(req);
        if (!customerId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        const addresses = await customerRepo.getCustomerAddresses(customerId);
        res.json(addresses);
    } catch (error) {
        console.error('[CustomerAddress] Fetch failed:', (error as Error).message);
        res.status(500).json({ error: 'Failed to fetch addresses' });
    }
});

/**
 * POST /api/customer/addresses - Create a new address
 */
router.post('/api/customer/addresses', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const customerId = getCustomerId(req);
        if (!customerId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { label, address, isDefault } = req.body;
        if (!label || !address) {
            return res.status(400).json({ error: 'Label and address are required' });
        }

        const newAddress = await customerRepo.createCustomerAddress({
            customerId,
            label,
            address,
            isDefault: isDefault || false,
        });
        res.status(200).json(newAddress);
    } catch (error) {
        console.error('[CustomerAddress] Create failed:', (error as Error).message);
        res.status(500).json({ error: 'Failed to create address' });
    }
});

/**
 * PATCH /api/customer/addresses/:id - Update an address
 */
router.patch('/api/customer/addresses/:id', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const customerId = getCustomerId(req);
        if (!customerId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { id } = req.params;
        const { label, address, isDefault } = req.body;

        const updates: any = {};
        if (label !== undefined) updates.label = label;
        if (address !== undefined) updates.address = address;
        if (isDefault !== undefined) updates.isDefault = isDefault;

        const updated = await customerRepo.updateCustomerAddress(id, customerId, updates);
        if (!updated) {
            return res.status(404).json({ error: 'Address not found' });
        }
        res.json(updated);
    } catch (error) {
        console.error('[CustomerAddress] Update failed:', (error as Error).message);
        res.status(500).json({ error: 'Failed to update address' });
    }
});

/**
 * DELETE /api/customer/addresses/:id - Delete an address
 */
router.delete('/api/customer/addresses/:id', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const customerId = getCustomerId(req);
        if (!customerId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { id } = req.params;
        const deleted = await customerRepo.deleteCustomerAddress(id, customerId);
        if (!deleted) {
            return res.status(404).json({ error: 'Address not found' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('[CustomerAddress] Delete failed:', (error as Error).message);
        res.status(500).json({ error: 'Failed to delete address' });
    }
});

export default router;

