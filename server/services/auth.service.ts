/**
 * Authentication Service
 * 
 * Handles business logic for authentication, including password verification,
 * status checks, and PIN management.
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { userRepo } from '../repositories/index.js';
import { db } from '../db.js';
import { corporateClients, trustedCorporateDevices, users } from '../../shared/schema.js';
import { eq, and, gt, desc } from 'drizzle-orm';
import type { User } from '../../shared/schema.js';

export class AuthService {
    /**
     * Authenticate an admin user
     */
    async authenticateAdmin(username: string, password: string): Promise<{ user: User } | { error: string, status: number }> {
        const user = await userRepo.getUserByUsername(username);

        if (!user || !user.password) {
            return { error: 'Invalid username or password', status: 401 };
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return { error: 'Invalid username or password', status: 401 };
        }

        if (user.status !== 'Active') {
            return { error: 'Account is inactive', status: 403 };
        }

        // Update last login
        await userRepo.updateUserLastLogin(user.id);

        return { user };
    }

    /**
     * Authenticate a corporate portal user
     */
    async authenticateCorporate(username: string, password: string): Promise<{
        user: User,
        corporateClient?: { shortCode: string, companyName: string }
    } | { error: string, status: number }> {
        const user = await userRepo.getUserByUsername(username);

        if (!user || !user.password) {
            return { error: 'Invalid credentials', status: 401 };
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return { error: 'Invalid credentials', status: 401 };
        }

        if (user.role !== 'Corporate' || !user.corporateClientId) {
            return { error: 'Access restricted to Corporate users only', status: 403 };
        }

        if (user.status !== 'Active') {
            return { error: 'Corporate account is inactive', status: 403 };
        }

        // Get corporate client details
        const [corporateClient] = await db
            .select({
                shortCode: corporateClients.shortCode,
                companyName: corporateClients.companyName
            })
            .from(corporateClients)
            .where(eq(corporateClients.id, user.corporateClientId));

        // Update last login
        await userRepo.updateUserLastLogin(user.id);

        return { user, corporateClient };
    }

    /**
     * Set a manager PIN for a user
     */
    async setManagerPin(actorId: string, targetUserId: string, pin: string): Promise<{ success: boolean; error?: string; status?: number }> {
        const actor = await userRepo.getUser(actorId);

        if (!actor || actor.role !== 'Super Admin') {
            return { success: false, error: 'Only Super Admin can set Manager PINs', status: 403 };
        }

        if (!pin || !/^\d{4}$/.test(pin)) {
            return { success: false, error: 'PIN must be exactly 4 digits', status: 400 };
        }

        const pinHash = await bcrypt.hash(pin, 10);
        await userRepo.updateUser(targetUserId, { pinHash } as any);

        return { success: true };
    }

    /**
     * Verify a manager PIN
     */
    async verifyManagerPin(userId: string, pin: string): Promise<{ valid: boolean; noPinSet?: boolean; error?: string; status?: number }> {
        const user = await userRepo.getUser(userId);

        if (!user) {
            return { error: 'User not found', status: 401, valid: false };
        }

        if (!pin || !/^\d{4}$/.test(pin)) {
            return { valid: false };
        }

        if (!(user as any).pinHash) {
            // First time setup bypass
            const bypassRoles = ['Manager', 'Super Admin', 'Admin'];
            const valid = bypassRoles.includes(user.role || '');
            return { valid, noPinSet: true };
        }

        const valid = await bcrypt.compare(pin, (user as any).pinHash);
        return { valid };
    }

    // --- Hardened Corporate Trusted Device Logic ---

    /**
     * Hash the raw 32-byte token to safely store and compare it.
     */
    private hashTrustedToken(rawToken: string): string {
        return crypto.createHash('sha256').update(rawToken).digest('hex');
    }

    /**
     * Issues a new trusted device token for a corporate user.
     * Enforces a maximum of 5 active devices, revoking the oldest if exceeded.
     */
    async issueCorporateTrustedDeviceToken(userId: string, userAgent?: string): Promise<string> {
        // Enforce max 5 limit
        const activeDevices = await db.select()
            .from(trustedCorporateDevices)
            .where(
                and(
                    eq(trustedCorporateDevices.userId, userId),
                    eq(trustedCorporateDevices.revokedAt, null as any)
                )
            )
            .orderBy(desc(trustedCorporateDevices.lastUsedAt));

        if (activeDevices.length >= 5) {
            // Revoke the oldest ones to make room for the new 1
            const toRevoke = activeDevices.slice(4);
            for (const device of toRevoke) {
                await db.update(trustedCorporateDevices)
                    .set({
                        revokedAt: new Date(),
                        revokedReason: 'max_devices_exceeded'
                    })
                    .where(eq(trustedCorporateDevices.id, device.id));
            }
        }

        // Generate raw 32-byte secret
        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = this.hashTrustedToken(rawToken);

        const trustedUntil = new Date();
        trustedUntil.setDate(trustedUntil.getDate() + 30); // 30 days exactly

        await db.insert(trustedCorporateDevices).values({
            id: crypto.randomUUID(),
            userId,
            tokenHash,
            userAgent,
            trustedUntil
        });

        // Return the RAW token to send to the browser
        return rawToken;
    }

    /**
     * Validates a trusted device token silently.
     * Updates lastUsedAt if valid. Returns userId or null.
     */
    async validateCorporateTrustedDeviceToken(rawToken: string): Promise<string | null> {
        if (!rawToken || rawToken.length !== 64) return null;

        const tokenHash = this.hashTrustedToken(rawToken);
        const now = new Date();

        // Find the device
        const [device] = await db.select()
            .from(trustedCorporateDevices)
            .where(eq(trustedCorporateDevices.tokenHash, tokenHash));

        // Invalid if not found, revoked, or expired
        if (!device || device.revokedAt || new Date(device.trustedUntil) < now) {
            return null;
        }

        // Validate the user themselves is still valid
        const [user] = await db.select({
            id: users.id,
            role: users.role,
            status: users.status,
            corporateClientId: users.corporateClientId
        })
            .from(users)
            .where(eq(users.id, device.userId));

        if (!user || user.status !== 'Active' || user.role !== 'Corporate' || !user.corporateClientId) {
            // Self-healing: if user is no longer valid, automatically revoke the device
            await this.revokeCorporateTrustedDeviceToken(rawToken, 'user_inactive_or_role_changed');
            return null;
        }

        // Valid! Update last used
        await db.update(trustedCorporateDevices)
            .set({ lastUsedAt: now })
            .where(eq(trustedCorporateDevices.id, device.id));

        return user.id;
    }

    /**
     * Revokes a specific trusted token (e.g. on manual logout)
     */
    async revokeCorporateTrustedDeviceToken(rawToken: string, reason = 'logout'): Promise<void> {
        if (!rawToken) return;
        const tokenHash = this.hashTrustedToken(rawToken);

        await db.update(trustedCorporateDevices)
            .set({
                revokedAt: new Date(),
                revokedReason: reason
            })
            .where(eq(trustedCorporateDevices.tokenHash, tokenHash));
    }

    /**
     * Revokes all trusted devices for a given user (e.g. on password change)
     */
    async revokeAllCorporateTrustedDevicesForUser(userId: string, reason = 'security_reset'): Promise<void> {
        await db.update(trustedCorporateDevices)
            .set({
                revokedAt: new Date(),
                revokedReason: reason
            })
            .where(
                and(
                    eq(trustedCorporateDevices.userId, userId),
                    eq(trustedCorporateDevices.revokedAt, null as any)
                )
            );
    }
}

export const authService = new AuthService();
