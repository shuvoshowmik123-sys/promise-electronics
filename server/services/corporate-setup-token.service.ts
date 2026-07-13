import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { randomBytes, createHash, randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

const TOKEN_EXPIRY_MINUTES = 30;

function hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
}

export class CorporateSetupError extends Error {
    constructor(public readonly reason: 'invalid' | 'not_found' | 'invalid_state') {
        super('This link is invalid, expired, or has already been used.');
    }
}

export function getCorporateAppBaseUrl(): string | null {
    const configured = process.env.APP_BASE_URL?.trim();
    if (!configured) {
        return process.env.NODE_ENV === 'production' ? null : 'http://localhost:5173';
    }

    try {
        const url = new URL(configured);
        if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') return null;
        if (url.username || url.password || url.search || url.hash) return null;
        const normalizedPath = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
        return `${url.origin}${normalizedPath}`;
    } catch {
        return null;
    }
}

export async function migrateSetupTokens(): Promise<void> {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS corporate_setup_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'setup',
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_corp_setup_tokens_user ON corporate_setup_tokens (user_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_corp_setup_tokens_hash ON corporate_setup_tokens (token_hash)`);
}

export async function createCorporateSetupToken(userId: string, type: 'setup' | 'reset'): Promise<string> {
    const raw = randomBytes(32).toString('hex');
    const hash = hashToken(raw);
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

    await db.execute(sql`
        INSERT INTO corporate_setup_tokens (id, user_id, type, token_hash, expires_at)
        VALUES (${id}, ${userId}, ${type}, ${hash}, ${expiresAt})
    `);

    return raw;
}

export async function invalidateOtherCorporateSetupTokens(
    userId: string,
    type: 'setup' | 'reset',
    keepRawToken: string,
): Promise<void> {
    await db.execute(sql`
        UPDATE corporate_setup_tokens
        SET used_at = NOW()
        WHERE user_id = ${userId}
          AND type = ${type}
          AND token_hash <> ${hashToken(keepRawToken)}
          AND used_at IS NULL
    `);
}

export async function invalidateCorporateSetupToken(rawToken: string): Promise<void> {
    await db.execute(sql`
        UPDATE corporate_setup_tokens
        SET used_at = NOW()
        WHERE token_hash = ${hashToken(rawToken)} AND used_at IS NULL
    `);
}

export async function removeCorporateUserAndTokens(userId: string): Promise<void> {
    await db.transaction(async (tx) => {
        await tx.execute(sql`DELETE FROM corporate_setup_tokens WHERE user_id = ${userId}`);
        const userDelete = await tx.execute(sql`
            DELETE FROM users
            WHERE id = ${userId} AND role = 'Corporate' AND status = 'Pending'
        `);
        if ((userDelete as any)?.rowCount !== 1) {
            throw new Error('Pending corporate user cleanup did not remove exactly one user');
        }
    });
}

export async function lookupSetupToken(rawToken: string): Promise<{
    userId: string;
    type: string;
    expiresAt: Date;
    valid: boolean;
    reason?: string;
} | null> {
    const hash = hashToken(rawToken);
    const result = await db.execute(sql`
        SELECT user_id, type, expires_at, used_at
        FROM corporate_setup_tokens
        WHERE token_hash = ${hash}
        LIMIT 1
    `);
    const row = (result as any)?.rows?.[0];
    if (!row) return null;

    if (row.used_at) {
        return { userId: row.user_id, type: row.type, expiresAt: new Date(row.expires_at), valid: false, reason: 'used' };
    }
    if (new Date(row.expires_at) <= new Date()) {
        return { userId: row.user_id, type: row.type, expiresAt: new Date(row.expires_at), valid: false, reason: 'expired' };
    }

    return { userId: row.user_id, type: row.type, expiresAt: new Date(row.expires_at), valid: true };
}

export async function completeCorporateSetup(rawToken: string, password: string): Promise<'setup' | 'reset'> {
    const passwordHash = await bcrypt.hash(password, 12);
    const tokenHash = hashToken(rawToken);

    return db.transaction(async (tx) => {
        const tokenResult = await tx.execute(sql`
            SELECT user_id, type, used_at, expires_at
            FROM corporate_setup_tokens
            WHERE token_hash = ${tokenHash}
            FOR UPDATE
        `);
        const token = (tokenResult as any)?.rows?.[0];
        if (!token || token.used_at || new Date(token.expires_at) <= new Date()) {
            throw new CorporateSetupError('invalid');
        }
        if (token.type !== 'setup' && token.type !== 'reset') {
            throw new CorporateSetupError('invalid');
        }

        const userResult = await tx.execute(sql`
            SELECT id, role, status
            FROM users
            WHERE id = ${token.user_id}
            FOR UPDATE
        `);
        const user = (userResult as any)?.rows?.[0];
        const expectedStatus = token.type === 'setup' ? 'Pending' : 'Active';
        if (!user || user.role !== 'Corporate' || user.status !== expectedStatus) {
            throw new CorporateSetupError(user ? 'invalid_state' : 'not_found');
        }

        const updateResult = token.type === 'setup'
            ? await tx.execute(sql`
                UPDATE users SET password = ${passwordHash}, status = 'Active'
                WHERE id = ${token.user_id} AND role = 'Corporate' AND status = 'Pending'
            `)
            : await tx.execute(sql`
                UPDATE users SET password = ${passwordHash}
                WHERE id = ${token.user_id} AND role = 'Corporate' AND status = 'Active'
            `);
        if ((updateResult as any)?.rowCount !== 1) {
            throw new CorporateSetupError('invalid_state');
        }

        if (token.type === 'reset') {
            await tx.execute(sql`
                UPDATE trusted_corporate_devices
                SET revoked_at = NOW(), revoked_reason = 'corporate_setup_token_reset'
                WHERE user_id = ${token.user_id} AND revoked_at IS NULL
            `);
        }

        const claimResult = await tx.execute(sql`
            UPDATE corporate_setup_tokens
            SET used_at = NOW()
            WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > NOW()
        `);
        if ((claimResult as any)?.rowCount !== 1) {
            throw new CorporateSetupError('invalid');
        }

        return token.type as 'setup' | 'reset';
    });
}
