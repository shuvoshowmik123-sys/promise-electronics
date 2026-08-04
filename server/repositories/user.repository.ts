/**
 * User Repository
 * 
 * Handles all database operations for users (admin users and customers).
 * Includes authentication-related queries like Google OAuth.
 */

import { db, nanoid, eq, desc, schema, type User, type InsertUser, type UpsertCustomerFromGoogle } from './base.js';
import { count, sql, or, isNull, asc } from 'drizzle-orm';
import { normalizePhone } from '../utils/phone.js';

function isMissingDefaultWorkLocationColumn(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return message.includes('default_work_location_id');
}

function mapLegacyUserRow(row: Record<string, any>): User {
    return {
        id: String(row.id ?? ''),
        username: row.username ?? null,
        name: row.name ?? '',
        email: row.email ?? null,
        phone: row.phone ?? null,
        phoneNormalized: row.phone_normalized ?? row.phoneNormalized ?? null,
        password: row.password ?? '',
        role: row.role ?? 'Customer',
        status: row.status ?? 'Active',
        permissions: row.permissions ?? '{}',
        skills: row.skills ?? null,
        seniorityLevel: row.seniority_level ?? row.seniorityLevel ?? 'Junior',
        performanceScore: Number(row.performance_score ?? row.performanceScore ?? 0),
        joinedAt: row.joined_at ? new Date(row.joined_at) : new Date(),
        lastLogin: row.last_login ? new Date(row.last_login) : null,
        googleSub: row.google_sub ?? row.googleSub ?? null,
        storeId: row.store_id ?? row.storeId ?? null,
        address: row.address ?? null,
        profileImageUrl: row.profile_image_url ?? row.profileImageUrl ?? null,
        avatar: row.avatar ?? null,
        isVerified: Boolean(row.is_verified ?? row.isVerified ?? false),
        preferences: row.preferences ?? '{}',
        corporateClientId: row.corporate_client_id ?? row.corporateClientId ?? null,
        defaultWorkLocationId: row.default_work_location_id ?? row.defaultWorkLocationId ?? null,
    } as User;
}

async function getLegacyUserByWhere(whereClause: ReturnType<typeof sql>): Promise<User | undefined> {
    const result = await db.execute(sql`
        SELECT *
        FROM users
        WHERE ${whereClause}
        LIMIT 1
    `);
    const row = (result as any)?.rows?.[0] as Record<string, any> | undefined;
    return row ? mapLegacyUserRow(row) : undefined;
}

// ============================================
// User Queries
// ============================================

export async function getUser(id: string): Promise<User | undefined> {
    try {
        const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
        return user;
    } catch (error) {
        if (isMissingDefaultWorkLocationColumn(error)) {
            return getLegacyUserByWhere(sql`id = ${id}`);
        }
        throw error;
    }
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return user;
}

export async function getUserByUsername(username: string): Promise<User | undefined> {
    try {
        const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));
        return user;
    } catch (error) {
        if (isMissingDefaultWorkLocationColumn(error)) {
            return getLegacyUserByWhere(sql`username = ${username}`);
        }
        throw error;
    }
}

export async function getUserByPhone(phone: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.phone, phone));
    return user;
}

/**
 * Find user by phone number with normalization.
 * Handles various phone formats: +8801712345678, 8801712345678, 01712345678
 */
export async function getUserByPhoneNormalized(phone: string): Promise<User | undefined> {
    // Canonical normaliser — the same one that WRITES users.phone_normalized
    // (auth.routes.ts, users.routes.ts, retail-intake). Other normalisers in the
    // tree produce different shapes (01xxxxxxxxx, 880xxxxxxxxxx); using one of
    // those here would match nothing and fail silently.
    const targetDigits = normalizePhone(phone);
    if (!targetDigits) return undefined;

    // Indexed read (idx_users_phone_normalized). Covers every row written since
    // the column started being populated.
    const [indexed] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.phoneNormalized, targetDigits))
        .orderBy(asc(schema.users.joinedAt))
        .limit(1);

    if (indexed) return indexed;

    // Legacy rows only: phone_normalized null or blank. This cannot be dropped —
    // the column is not backfilled for every path, so an indexed-only lookup
    // would silently find fewer users than before. Bounded to the legacy set
    // rather than the whole table, which is what this function used to load.
    const legacy = await db
        .select()
        .from(schema.users)
        .where(or(
            isNull(schema.users.phoneNormalized),
            eq(sql`btrim(${schema.users.phoneNormalized})`, ''),
        ))
        .orderBy(asc(schema.users.joinedAt));

    return legacy.find(user => user.phone && normalizePhone(user.phone) === targetDigits);
}

export async function getUserByGoogleSub(googleSub: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.googleSub, googleSub));
    return user;
}

export async function getAllUsers(page: number = 1, limit: number = 50): Promise<{ items: User[], pagination: { total: number, page: number, limit: number, pages: number } }> {
    const offset = (page - 1) * limit;
    const [countResult] = await db.select({ count: count() }).from(schema.users);
    const total = Number(countResult?.count || 0);
    const pages = Math.ceil(total / limit);

    const items = await db.select().from(schema.users)
        .orderBy(desc(schema.users.joinedAt))
        .limit(limit)
        .offset(offset);

    return { items, pagination: { total, page, limit, pages } };
}

// ============================================
// User Mutations
// ============================================

export async function createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(schema.users).values({ ...user, id: nanoid() }).returning();
    return newUser;
}

export async function updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db
        .update(schema.users)
        .set(updates)
        .where(eq(schema.users.id, id))
        .returning();
    return updated;
}

export async function deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(schema.users).where(eq(schema.users.id, id));
    return (result.rowCount ?? 0) > 0;
}

export async function updateUserLastLogin(id: string): Promise<void> {
    await db
        .update(schema.users)
        .set({ lastLogin: new Date() })
        .where(eq(schema.users.id, id));
}

// ============================================
// Google OAuth Operations
// ============================================

/**
 * Create or update a user from Google Sign-In.
 * Handles account linking if email already exists.
 */
export async function upsertUserFromGoogle(data: UpsertCustomerFromGoogle): Promise<User> {
    // First check if user exists with this Google ID
    const existing = await getUserByGoogleSub(data.googleSub);
    if (existing) {
        // Update existing user with latest info from Google
        const [updated] = await db
            .update(schema.users)
            .set({
                name: data.name,
                email: data.email || existing.email,
                profileImageUrl: data.profileImageUrl,
                isVerified: true,
                lastLogin: new Date(),
            })
            .where(eq(schema.users.id, existing.id))
            .returning();
        return updated;
    }

    // Check if user exists with same email (link existing account)
    if (data.email) {
        const existingByEmail = await getUserByEmail(data.email);
        if (existingByEmail) {
            const [updated] = await db
                .update(schema.users)
                .set({
                    googleSub: data.googleSub,
                    profileImageUrl: data.profileImageUrl,
                    isVerified: true,
                    lastLogin: new Date(),
                })
                .where(eq(schema.users.id, existingByEmail.id))
                .returning();
            return updated;
        }
    }

    // Create new user from Google Sign-In
    const [newUser] = await db
        .insert(schema.users)
        .values({
            id: nanoid(),
            googleSub: data.googleSub,
            name: data.name,
            email: data.email,
            profileImageUrl: data.profileImageUrl,
            isVerified: true,
            role: "Customer",
            password: nanoid(), // Random password for Google users
            status: "Active",
            permissions: "{}",
        })
        .returning();
    return newUser;
}

/**
 * Link an existing user account to Google.
 */
export async function linkUserToGoogle(userId: string, data: UpsertCustomerFromGoogle): Promise<User> {
    const [updated] = await db
        .update(schema.users)
        .set({
            googleSub: data.googleSub,
            email: data.email || undefined,
            isVerified: true,
            lastLogin: new Date(),
        })
        .where(eq(schema.users.id, userId))
        .returning();
    return updated;
}

// ============================================
// Customer Aliases (for backward compatibility)
// ============================================

export const getCustomer = getUser;
export const updateCustomer = updateUser;
