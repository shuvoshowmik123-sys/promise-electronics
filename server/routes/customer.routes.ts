/**
 * Customer Routes
 * 
 * Handles customer authentication, profile, and SSE connections.
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { and, desc, eq, or, ne, sql } from 'drizzle-orm';
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
import { authLimiter, registrationLimiter, serviceRequestLimiter, accountRecoveryLimiter } from './middleware/rate-limit.js';
import { isPhoneBlacklisted } from './blacklist.routes.js';
import { normalizePhone } from '../utils/phone.js';
import { z } from 'zod';
import { customerService } from '../services/customer.service.js';

const router = Router();

function regenerateSession(req: Request): Promise<void> {
    return new Promise((resolve, reject) => {
        const oldData = { csrfToken: req.session?.csrfToken };
        req.session.regenerate((err) => {
            if (err) return reject(err);
            if (oldData.csrfToken) req.session.csrfToken = oldData.csrfToken;
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
router.post('/api/customer/register', registrationLimiter, async (req: Request, res: Response) => {
    try {
        const validated = customerRegisterSchema.parse(req.body);

        const existingUser = await userRepo.getUserByPhoneNormalized(validated.phone);
        if (existingUser) {
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
        req.session.customerId = user.id;
        req.session.authMethod = 'phone';
        req.session.authenticatedAt = Date.now();

        const { password: _, ...safeUser } = user;

        notifyAdminUpdate({
            type: 'customer_created',
            data: safeUser,
            createdAt: new Date().toISOString(),
        });

        res.status(201).json(safeUser);
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

        const user = await userRepo.getUserByPhoneNormalized(validated.phone);
        if (!user) {
            return res.status(401).json({ error: 'Invalid phone number or password' });
        }

        if (!user.password) {
            return res.status(401).json({ error: 'Invalid phone number or password' });
        }

        const isValid = await bcrypt.compare(validated.password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid phone number or password' });
        }

        await userRepo.updateUserLastLogin(user.id);

        await regenerateSession(req);
        req.session.customerId = user.id;
        req.session.authMethod = 'phone';
        req.session.authenticatedAt = Date.now();

        if (user.phone) {
            await customerService.linkServiceRequestsByPhone(user.phone, user.id);
        }

        const { password: _, ...safeUser } = user;
        res.json(safeUser);
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

        await userRepo.updateUserLastLogin(user.id);

        await regenerateSession(req);
        req.session.customerId = user.id;
        req.session.authMethod = 'google';
        req.session.authenticatedAt = Date.now();

        if (user.phone) {
            await customerService.linkServiceRequestsByPhone(user.phone, user.id);
        }

        const { password: _, ...safeUser } = user;
        res.json(safeUser);

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
const staffResetCompleteSchema = z.object({
    phone: z.string().min(6),
    code: z.string().min(4).max(8),
    newPassword: z.string().min(6),
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

/**
 * POST /api/customer/password-reset/complete
 * Validates a staff-created reset code (stored in DB, not memory).
 */
router.post('/api/customer/password-reset/complete', accountRecoveryLimiter, async (req: Request, res: Response) => {
    try {
        const { phone, code, newPassword } = staffResetCompleteSchema.parse(req.body);
        const genericFail = { error: 'Invalid or expired reset code' };

        const user = await userRepo.getUserByPhoneNormalized(phone);
        if (!user) {
            return res.status(400).json(genericFail);
        }

        const rows = await db.execute(
            sql`SELECT id, code_hash, expires_at, attempts, used
                FROM staff_reset_codes
                WHERE user_id = ${user.id} AND used = FALSE
                ORDER BY created_at DESC LIMIT 1`
        );
        const entry = rows.rows[0] as { id: string; code_hash: string; expires_at: string; attempts: number; used: boolean } | undefined;
        if (!entry) {
            return res.status(400).json(genericFail);
        }

        if (new Date(entry.expires_at) < new Date()) {
            await db.execute(sql`UPDATE staff_reset_codes SET used = TRUE WHERE id = ${entry.id}`);
            return res.status(400).json(genericFail);
        }

        if (entry.attempts >= 5) {
            await db.execute(sql`UPDATE staff_reset_codes SET used = TRUE WHERE id = ${entry.id}`);
            return res.status(429).json({ error: 'Too many failed attempts. Please contact support again.' });
        }

        const valid = await bcrypt.compare(code, entry.code_hash);
        if (!valid) {
            await db.execute(sql`UPDATE staff_reset_codes SET attempts = attempts + 1 WHERE id = ${entry.id}`);
            return res.status(400).json(genericFail);
        }

        await db.execute(sql`UPDATE staff_reset_codes SET used = TRUE WHERE id = ${entry.id}`);

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await userRepo.updateUser(user.id, { password: hashedPassword } as any);
        await db.execute(sql`UPDATE users SET password_changed_at = NOW() WHERE id = ${user.id}`);

        console.log(`[AccountRecovery] Staff-assisted password reset completed for user ${user.id}`);

        res.json({ message: 'Password has been reset. Please sign in with your new password.' });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: 'Invalid request' });
        }
        console.error('[AccountRecovery] Reset complete failed:', (error as Error).message);
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
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch service requests' });
    }
});

/**
 * GET /api/customer/service-requests/:id - Get service request details
 */
router.get('/api/customer/service-requests/:id', requireCustomerAuth, async (req: Request, res: Response) => {
    try {
        const order = await storage.getServiceRequest(req.params.id);
        if (!order) {
            return res.status(404).json({ error: 'Service request not found' });
        }

        if (order.customerId !== req.session.customerId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const events = await storage.getServiceRequestEvents(order.id);
        const payments = await getServiceRequestPayments(order.id, order.convertedJobId);
        res.json({ ...order, timeline: events, paymentSubmissions: payments });
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

        const sessionCustomerId = req.session?.customerId;

        if (!sessionCustomerId) {
            return res.json({
                ticketNumber: order.ticketNumber,
                trackingStatus: order.trackingStatus,
                createdAt: order.createdAt,
                message: 'Login to see full details',
            });
        }

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

        const events = await storage.getServiceRequestEvents(order.id);
        const payments = await getServiceRequestPayments(order.id, order.convertedJobId);
        res.json({ ...order, timeline: events, paymentSubmissions: payments });
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

