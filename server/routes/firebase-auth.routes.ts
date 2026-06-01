import { Router } from "express";
import { verifyFirebaseToken } from "../services/firebase.js";
import { db } from "../db.js";
import { users } from "../../shared/schema.js";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

// POST /api/auth/firebase — exchange Firebase idToken for Express session
router.post("/api/auth/firebase", async (req, res) => {
    const { idToken } = req.body as { idToken?: string };
    if (!idToken) return res.status(400).json({ error: "idToken required" });

    try {
        const firebaseUser = await verifyFirebaseToken(idToken);

        // Find by firebaseUid first, then fall back to googleSub for migration continuity
        let user = await db.query.users.findFirst({
            where: eq(users.firebaseUid as any, firebaseUser.uid),
        }).catch(() => null);

        if (!user) {
            // Fallback: existing user who signed in with Google before Firebase migration
            if (firebaseUser.email) {
                user = await db.query.users.findFirst({
                    where: eq(users.email, firebaseUser.email),
                }).catch(() => null);

                // Stamp firebaseUid on migrated user
                if (user) {
                    await db.update(users)
                        .set({ firebaseUid: firebaseUser.uid } as any)
                        .where(eq(users.id, user.id))
                        .catch(() => {});
                }
            }
        }

        if (!user) {
            // New user — create with Customer role
            const newId = randomUUID();
            [user] = await db.insert(users).values({
                id: newId,
                name: firebaseUser.name ?? firebaseUser.email ?? "Customer",
                email: firebaseUser.email ?? undefined,
                password: "",          // no password for Firebase auth users
                role: "Customer",
                firebaseUid: firebaseUser.uid,
                profileImageUrl: firebaseUser.picture ?? undefined,
                isVerified: true,      // Firebase already verified the identity
            } as any).returning();
        }

        // Set Express session. The customer app authenticates off session.customerId
        // (requireCustomerAuth / getCustomerId / /api/customer/me all read customerId).
        // Setting only userId left Google logins unrecognized → instant 401 / "logged
        // out" despite a successful token exchange.
        (req.session as any).customerId = user!.id;
        (req.session as any).userId = user!.id;
        (req.session as any).role = user!.role;
        (req.session as any).authMethod = "firebase";

        res.json({
            ok: true,
            user: {
                id: user!.id,
                name: user!.name,
                email: user!.email,
                role: user!.role,
                profileImageUrl: (user! as any).profileImageUrl,
            },
        });
    } catch (e: any) {
        console.error("[Firebase Auth] Token verify failed:", e.message?.slice(0, 120));
        res.status(401).json({ error: "Invalid or expired Firebase token" });
    }
});

// POST /api/auth/firebase/logout
router.post("/api/auth/firebase/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
});

export default router;
