import bcrypt from 'bcryptjs';
import { randomInt, randomUUID } from 'crypto';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { userRepo } from '../repositories/index.js';
import { authService } from './auth.service.js';

type ResetRequestRow = {
    id: string;
    user_id: string;
    corporate_client_id: string;
    status: string;
    attempts: number;
    max_attempts: number;
    expires_at: Date | string | null;
    used_at: Date | string | null;
    created_at: Date | string;
    updated_at: Date | string | null;
    issued_by_admin_id: string | null;
    requested_ip: string | null;
    name?: string | null;
    username?: string | null;
    email?: string | null;
};

function generateCode() {
    return String(randomInt(100000, 1000000));
}

async function findCorporateUserByIdentifier(identifier: string) {
    const normalized = identifier.trim().toLowerCase();
    const result = await db.execute(sql`
        SELECT id, username, name, email, role, status, corporate_client_id
        FROM users
        WHERE (LOWER(COALESCE(username, '')) = ${normalized} OR LOWER(COALESCE(email, '')) = ${normalized})
        LIMIT 1
    `);
    const user = (result as any)?.rows?.[0];
    if (!user || user.role !== 'Corporate' || !user.corporate_client_id || user.status !== 'Active') return null;
    return user;
}

async function requestReset(identifier: string, ipAddress?: string) {
    const user = await findCorporateUserByIdentifier(identifier);
    if (!user) return null;

    const id = randomUUID();
    await db.execute(sql`
        INSERT INTO corporate_password_reset_requests (
            id,
            user_id,
            corporate_client_id,
            status,
            requested_ip
        )
        VALUES (
            ${id},
            ${user.id},
            ${user.corporate_client_id},
            'requested',
            ${ipAddress || null}
        )
    `);

    return { id, userId: user.id, corporateClientId: user.corporate_client_id };
}

async function issueAdminCode(userId: string, adminId: string) {
    const targetUser = await userRepo.getUser(userId);
    if (!targetUser || targetUser.role !== 'Corporate' || !targetUser.corporateClientId || targetUser.status !== 'Active') {
        throw new Error('Corporate user not found');
    }

    const code = generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.execute(sql`
        UPDATE corporate_password_reset_requests
        SET status = 'cancelled', updated_at = NOW()
        WHERE user_id = ${targetUser.id}
          AND used_at IS NULL
          AND status IN ('requested', 'code_issued')
    `);

    await db.execute(sql`
        INSERT INTO corporate_password_reset_requests (
            id,
            user_id,
            corporate_client_id,
            code_hash,
            status,
            issued_by_admin_id,
            expires_at
        )
        VALUES (
            ${id},
            ${targetUser.id},
            ${targetUser.corporateClientId},
            ${codeHash},
            'code_issued',
            ${adminId},
            ${expiresAt}
        )
    `);

    return {
        request: {
            id,
            userId: targetUser.id,
            username: targetUser.username,
            name: targetUser.name,
            corporateClientId: targetUser.corporateClientId,
            expiresAt,
        },
        code,
    };
}

async function completeReset(identifier: string, code: string, newPassword: string) {
    const user = await findCorporateUserByIdentifier(identifier);
    if (!user) {
        throw new Error('Invalid reset details');
    }

    const result = await db.execute(sql`
        SELECT *
        FROM corporate_password_reset_requests
        WHERE user_id = ${user.id}
          AND code_hash IS NOT NULL
          AND status = 'code_issued'
          AND used_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
    `);
    const request = (result as any)?.rows?.[0] as ResetRequestRow | undefined;

    if (!request || !request.expires_at || new Date(request.expires_at) <= new Date()) {
        if (request) {
            await db.execute(sql`
                UPDATE corporate_password_reset_requests
                SET status = 'expired', updated_at = NOW()
                WHERE id = ${request.id}
            `);
        }
        throw new Error('Invalid or expired reset code');
    }

    if (request.attempts >= request.max_attempts) {
        await db.execute(sql`
            UPDATE corporate_password_reset_requests
            SET status = 'expired', updated_at = NOW()
            WHERE id = ${request.id}
        `);
        throw new Error('Invalid or expired reset code');
    }

    const isValid = await bcrypt.compare(code, (request as any).code_hash);
    if (!isValid) {
        const nextAttempts = request.attempts + 1;
        await db.execute(sql`
            UPDATE corporate_password_reset_requests
            SET attempts = attempts + 1,
                status = CASE WHEN ${nextAttempts} >= max_attempts THEN 'expired' ELSE status END,
                updated_at = NOW()
            WHERE id = ${request.id}
        `);
        throw new Error('Invalid or expired reset code');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await userRepo.updateUser(user.id, { password: hashedPassword } as any);
    await db.execute(sql`
        UPDATE corporate_password_reset_requests
        SET status = 'used',
            used_at = NOW(),
            updated_at = NOW()
        WHERE id = ${request.id}
    `);
    await authService.revokeAllCorporateTrustedDevicesForUser(user.id, 'corporate_otp_password_reset');

    return { userId: user.id, username: user.username };
}

async function getClientResetRequests(corporateClientId: string) {
    const result = await db.execute(sql`
        SELECT
            r.id,
            r.user_id,
            r.corporate_client_id,
            r.status,
            r.attempts,
            r.max_attempts,
            r.expires_at,
            r.used_at,
            r.created_at,
            r.updated_at,
            r.issued_by_admin_id,
            r.requested_ip,
            u.name,
            u.username,
            u.email
        FROM corporate_password_reset_requests r
        JOIN users u ON u.id = r.user_id
        WHERE r.corporate_client_id = ${corporateClientId}
        ORDER BY r.created_at DESC
        LIMIT 30
    `);

    return ((result as any)?.rows || []).map((row: ResetRequestRow) => ({
        id: row.id,
        userId: row.user_id,
        corporateClientId: row.corporate_client_id,
        status: row.status,
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        expiresAt: row.expires_at,
        usedAt: row.used_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        issuedByAdminId: row.issued_by_admin_id,
        requestedIp: row.requested_ip,
        user: {
            name: row.name,
            username: row.username,
            email: row.email,
        },
    }));
}

export const corporatePasswordResetService = {
    requestReset,
    issueAdminCode,
    completeReset,
    getClientResetRequests,
};
