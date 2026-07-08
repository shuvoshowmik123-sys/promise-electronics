import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { randomBytes, createHash } from "crypto";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { normalizePhone as normalizePhoneUtil } from "../utils/phone.js";
import { PERMISSION_CATALOG, ROLE_PRESETS } from "../../shared/permission-catalog.js";

const DEFAULT_INVITE_EXPIRY_MINUTES = 30;
const MIN_INVITE_EXPIRY_MINUTES = 5;
const MAX_INVITE_EXPIRY_MINUTES = 24 * 60;
const VALID_ROLES = ["Manager", "Cashier", "Technician", "Driver"];

const BLOCKED_GRANULAR = ["settings.manage", "users.inviteStaff", "users.editPermissions", "users.deactivate"];
const BLOCKED_LEGACY = ["users", "settings", "systemHealth", "canDelete", "*"];

const VALID_GRANULAR_KEYS = new Set(PERMISSION_CATALOG.map(p => p.key));

const ROLE_PRESET_MAP: Record<string, string> = {
    Driver: "Driver Basic",
    Technician: "Technician Basic",
    Cashier: "Cashier Basic",
    Manager: "Manager Basic",
};

function sanitizeInvitePermissions(role: string, requested: Record<string, boolean>): Record<string, boolean> {
    const hasGranular = Object.keys(requested).some(k => k.includes("."));

    if (hasGranular) {
        const result: Record<string, boolean> = {};
        for (const [key, val] of Object.entries(requested)) {
            if (!val) continue;
            if (BLOCKED_GRANULAR.includes(key)) continue;
            if (BLOCKED_LEGACY.includes(key)) continue;
            if (VALID_GRANULAR_KEYS.has(key)) result[key] = true;
        }
        return result;
    }

    const presetName = ROLE_PRESET_MAP[role];
    if (presetName && ROLE_PRESETS[presetName]) {
        const result: Record<string, boolean> = {};
        for (const k of ROLE_PRESETS[presetName]) {
            if (!BLOCKED_GRANULAR.includes(k)) result[k] = true;
        }
        return result;
    }

    return {};
}

function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

function generateToken(): { raw: string; hash: string } {
    const raw = randomBytes(32).toString("hex");
    return { raw, hash: hashToken(raw) };
}

export function getDefaultInviteExpiryMinutes(): number {
    const parsed = Number(process.env.STAFF_INVITE_EXPIRY_MINUTES);
    if (!Number.isFinite(parsed)) return DEFAULT_INVITE_EXPIRY_MINUTES;
    return Math.min(MAX_INVITE_EXPIRY_MINUTES, Math.max(MIN_INVITE_EXPIRY_MINUTES, Math.round(parsed)));
}

function normalizeInviteExpiryMinutes(value?: unknown): number {
    if (value === undefined || value === null || value === "") return getDefaultInviteExpiryMinutes();
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error("expiresInMinutes must be a number.");
    }
    const rounded = Math.round(parsed);
    if (rounded < MIN_INVITE_EXPIRY_MINUTES || rounded > MAX_INVITE_EXPIRY_MINUTES) {
        throw new Error(`expiresInMinutes must be between ${MIN_INVITE_EXPIRY_MINUTES} and ${MAX_INVITE_EXPIRY_MINUTES} minutes.`);
    }
    return rounded;
}

async function markInviteFailed(id: string) {
    await db.execute(sql`
        UPDATE staff_invitations
        SET status = 'failed'
        WHERE id = ${id} AND status = 'accepting'
    `);
}

export interface StaffInvite {
    id: string;
    role: string;
    permissions: string;
    phone: string | null;
    email: string | null;
    note: string | null;
    status: string;
    expiresAt: string;
    createdBy: string;
    redeemedBy: string | null;
    createdAt: string;
    redeemedAt: string | null;
    revokedAt: string | null;
    regeneratedFromId: string | null;
}

function rowToInvite(row: any): StaffInvite {
    return {
        id: row.id,
        role: row.role,
        permissions: row.permissions ?? "{}",
        phone: row.phone ?? null,
        email: row.email ?? null,
        note: row.note ?? null,
        status: row.status,
        expiresAt: row.expires_at,
        createdBy: row.created_by,
        redeemedBy: row.redeemed_by ?? null,
        createdAt: row.created_at,
        redeemedAt: row.redeemed_at ?? null,
        revokedAt: row.revoked_at ?? null,
        regeneratedFromId: row.regenerated_from_id ?? null,
    };
}

export async function migrateStaffInvitations() {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS staff_invitations (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL,
        permissions TEXT NOT NULL DEFAULT '{}',
        phone TEXT,
        email TEXT,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        expires_at TIMESTAMP NOT NULL,
        created_by TEXT NOT NULL,
        redeemed_by TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        redeemed_at TIMESTAMP,
        revoked_at TIMESTAMP,
        regenerated_from_id TEXT
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_staff_inv_token ON staff_invitations (token_hash)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_staff_inv_status ON staff_invitations (status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_staff_inv_expires ON staff_invitations (expires_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_staff_inv_phone ON staff_invitations (phone)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_staff_inv_email ON staff_invitations (email)`);
}

export async function createStaffInvite(opts: {
    role: string;
    permissions: string;
    phone?: string | null;
    email?: string | null;
    note?: string | null;
    createdBy: string;
    expiresInMinutes?: number;
}): Promise<{ invite: StaffInvite; rawToken: string; setupUrl: string }> {
    if (!VALID_ROLES.includes(opts.role)) {
        throw new Error(`Invalid role: ${opts.role}. Must be one of: ${VALID_ROLES.join(", ")}`);
    }

    let requestedPerms: Record<string, boolean> = {};
    try { requestedPerms = JSON.parse(opts.permissions || "{}"); } catch { /* ignore */ }
    const safePerms = sanitizeInvitePermissions(opts.role, requestedPerms);
    const permStr = JSON.stringify(safePerms);

    const id = nanoid();
    const { raw, hash } = generateToken();
    const expiresInMinutes = normalizeInviteExpiryMinutes(opts.expiresInMinutes);
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    await db.execute(sql`
        INSERT INTO staff_invitations (id, token_hash, role, permissions, phone, email, note, status, expires_at, created_by)
        VALUES (${id}, ${hash}, ${opts.role}, ${permStr}, ${opts.phone ?? null}, ${opts.email ?? null}, ${opts.note ?? null}, 'pending', ${expiresAt}, ${opts.createdBy})
    `);

    const rows = await db.execute(sql`SELECT * FROM staff_invitations WHERE id = ${id}`);
    const invite = rowToInvite(rows.rows[0]);
    return { invite, rawToken: raw, setupUrl: `/admin/setup/${raw}` };
}

export async function listStaffInvites(limit = 50): Promise<StaffInvite[]> {
    const rows = await db.execute(sql`
        SELECT * FROM staff_invitations ORDER BY created_at DESC LIMIT ${limit}
    `);
    return (rows.rows as any[]).map(rowToInvite);
}

export async function getStaffInviteByToken(rawToken: string): Promise<StaffInvite | null> {
    const hash = hashToken(rawToken);
    const rows = await db.execute(sql`SELECT * FROM staff_invitations WHERE token_hash = ${hash}`);
    return rows.rows[0] ? rowToInvite(rows.rows[0]) : null;
}

export async function getStaffInviteById(id: string): Promise<StaffInvite | null> {
    const rows = await db.execute(sql`SELECT * FROM staff_invitations WHERE id = ${id}`);
    return rows.rows[0] ? rowToInvite(rows.rows[0]) : null;
}

export async function acceptStaffInvite(rawToken: string, staffData: {
    name: string;
    username: string;
    password: string;
    phone?: string | null;
    email?: string | null;
}): Promise<{ success: boolean; error?: string; userId?: string }> {
    const hash = hashToken(rawToken);

    // Atomic claim: only one request can consume a pending, non-expired invite
    const claimResult = await db.execute(sql`
        UPDATE staff_invitations
        SET status = 'accepting'
        WHERE token_hash = ${hash} AND status = 'pending' AND expires_at > NOW()
        RETURNING id, role, permissions, phone, email
    `);

    if (claimResult.rows.length === 0) {
        // Check why it failed
        const check = await db.execute(sql`SELECT status, expires_at FROM staff_invitations WHERE token_hash = ${hash}`);
        if (check.rows.length === 0) return { success: false, error: "Setup link not found or invalid." };
        const row = check.rows[0] as any;
        if (row.status === "accepted" || row.status === "accepting" || row.status === "failed") return { success: false, error: "This setup link has already been used. Please ask your admin to generate a new one." };
        if (row.status === "revoked" || row.status === "regenerated") return { success: false, error: "This setup link has been revoked." };
        if (new Date(row.expires_at) < new Date()) return { success: false, error: "This setup link has expired. Please ask your admin to generate a new one." };
        return { success: false, error: "This setup link is no longer valid." };
    }

    const invite = claimResult.rows[0] as any;

    const existingUsername = await db.execute(sql`SELECT id FROM users WHERE LOWER(username) = ${staffData.username.toLowerCase()} LIMIT 1`);
    if (existingUsername.rows.length > 0) {
        await markInviteFailed(invite.id);
        return { success: false, error: "This username is already taken." };
    }

    const phone = staffData.phone || invite.phone;
    const phoneNormalized = phone ? normalizePhoneUtil(phone) : null;
    if (phone) {
        const existingPhone = await db.execute(sql`SELECT id FROM users WHERE phone = ${phone} AND role != 'Customer' LIMIT 1`);
        if (existingPhone.rows.length > 0) {
            await markInviteFailed(invite.id);
            return { success: false, error: "This phone number is already used by another staff account." };
        }
    }

    const email = staffData.email || invite.email;
    if (email) {
        const existingEmail = await db.execute(sql`SELECT id FROM users WHERE LOWER(email) = ${email.toLowerCase()} AND role != 'Customer' LIMIT 1`);
        if (existingEmail.rows.length > 0) {
            await markInviteFailed(invite.id);
            return { success: false, error: "This email is already used by another staff account." };
        }
    }

    const hashedPassword = await bcrypt.hash(staffData.password, 12);
    const userId = nanoid();

    let invitePerms: Record<string, boolean> = {};
    try { invitePerms = JSON.parse(invite.permissions || "{}"); } catch { /* ignore */ }
    const finalPerms = sanitizeInvitePermissions(invite.role, invitePerms);
    const finalPermStr = JSON.stringify(finalPerms);

    const initialPrefs = JSON.stringify({ staffOnboarding: { version: "staff-v1", completed: false, completedAt: null } });

    await db.execute(sql`
        INSERT INTO users (id, username, name, email, phone, phone_normalized, password, role, permissions, preferences, status, joined_at)
        VALUES (${userId}, ${staffData.username}, ${staffData.name}, ${email ?? null}, ${phone ?? null}, ${phoneNormalized},
                ${hashedPassword}, ${invite.role}, ${finalPermStr}, ${initialPrefs}, 'Active', NOW())
    `);

    await db.execute(sql`
        UPDATE staff_invitations
        SET status = 'accepted', redeemed_by = ${userId}, redeemed_at = NOW()
        WHERE id = ${invite.id}
    `);

    return { success: true, userId };
}

export async function revokeStaffInvite(id: string): Promise<boolean> {
    const result = await db.execute(sql`
        UPDATE staff_invitations SET status = 'revoked', revoked_at = NOW()
        WHERE id = ${id} AND status = 'pending'
    `);
    return (result as any).rowCount > 0;
}

export async function regenerateStaffInvite(id: string, createdBy: string, expiresInMinutes?: number): Promise<{ invite: StaffInvite; rawToken: string; setupUrl: string } | null> {
    const old = await getStaffInviteById(id);
    if (!old) return null;
    if (old.status === "accepted") return null;

    await db.execute(sql`
        UPDATE staff_invitations SET status = 'regenerated', revoked_at = NOW()
        WHERE id = ${id} AND status = 'pending'
    `);

    const newId = nanoid();
    const { raw, hash } = generateToken();
    const normalizedExpiry = normalizeInviteExpiryMinutes(expiresInMinutes);
    const expiresAt = new Date(Date.now() + normalizedExpiry * 60 * 1000);

    await db.execute(sql`
        INSERT INTO staff_invitations (id, token_hash, role, permissions, phone, email, note, status, expires_at, created_by, regenerated_from_id)
        VALUES (${newId}, ${hash}, ${old.role}, ${old.permissions}, ${old.phone}, ${old.email}, ${old.note}, 'pending', ${expiresAt}, ${createdBy}, ${id})
    `);

    const rows = await db.execute(sql`SELECT * FROM staff_invitations WHERE id = ${newId}`);
    return { invite: rowToInvite(rows.rows[0]), rawToken: raw, setupUrl: `/admin/setup/${raw}` };
}
