/**
 * User Repository
 * 
 * Handles all database operations for users (admin users and customers).
 * Includes authentication-related queries like Google OAuth.
 */

import { db, nanoid, eq, desc, schema, type User, type InsertUser, type UpsertCustomerFromGoogle } from './base.js';

// ============================================
// User Queries
// ============================================

export async function getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return user;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return user;
}

export async function getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));
    return user;
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
    const normalizeToDigits = (p: string): string => {
        let digits = p.replace(/\D/g, '');
        if (digits.startsWith('880')) digits = digits.slice(3);
        if (digits.startsWith('0')) digits = digits.slice(1);
        return digits.slice(-10);
    };

    const targetDigits = normalizeToDigits(phone);

    // Get all users and filter in memory
    // TODO: Add normalized_phone column for better performance at scale
    const users = await db.select().from(schema.users);

    return users.find(user => {
        if (!user.phone) return false;
        return normalizeToDigits(user.phone) === targetDigits;
    });
}

export async function getUserByGoogleSub(googleSub: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.googleSub, googleSub));
    return user;
}

export async function getAllUsers(): Promise<User[]> {
    return db.select().from(schema.users).orderBy(desc(schema.users.joinedAt));
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
