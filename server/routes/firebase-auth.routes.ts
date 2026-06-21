import { Router, Request, Response } from "express";
import { verifyFirebaseToken } from "../services/firebase.js";
import { db } from "../db.js";
import { users } from "../../shared/schema.js";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

function regenerateSession(req: Request): Promise<void> {
    return new Promise((resolve, reject) => {
        const oldCsrf = req.session?.csrfToken;
        req.session.regenerate((err) => {
            if (err) return reject(err);
            if (oldCsrf) req.session.csrfToken = oldCsrf;
            resolve();
        });
    });
}

router.post("/api/auth/firebase", async (req: Request, res: Response) => {
    const { idToken } = req.body as { idToken?: string };
    if (!idToken) return res.status(400).json({ error: "idToken required" });

    try {
        const firebaseUser = await verifyFirebaseToken(idToken);

        let user = await db.query.users.findFirst({
            where: eq(users.firebaseUid as any, firebaseUser.uid),
        }).catch(() => null);

        if (!user) {
            if (firebaseUser.email) {
                user = await db.query.users.findFirst({
                    where: eq(users.email, firebaseUser.email),
                }).catch(() => null);

                if (user) {
                    await db.update(users)
                        .set({ firebaseUid: firebaseUser.uid } as any)
                        .where(eq(users.id, user.id))
                        .catch(() => {});
                }
            }
        }

        if (!user) {
            const newId = randomUUID();
            [user] = await db.insert(users).values({
                id: newId,
                name: firebaseUser.name ?? firebaseUser.email ?? "Customer",
                email: firebaseUser.email ?? undefined,
                password: "",
                role: "Customer",
                firebaseUid: firebaseUser.uid,
                profileImageUrl: firebaseUser.picture ?? undefined,
                isVerified: true,
            } as any).returning();
        }

        await regenerateSession(req);
        (req.session as any).customerId = user!.id;
        (req.session as any).userId = user!.id;
        (req.session as any).role = user!.role;
        (req.session as any).authMethod = "firebase";
        (req.session as any).authenticatedAt = Date.now();

        req.session.save((saveErr) => {
            if (saveErr) {
                console.error("[FirebaseAuth] Session save failed:", (saveErr as Error).message);
                return res.status(500).json({ error: "Session creation failed" });
            }
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
        });
    } catch (e: any) {
        console.error("[FirebaseAuth] Token verify failed:", (e as Error).message?.slice(0, 120));
        res.status(401).json({ error: "Invalid or expired Firebase token" });
    }
});

router.post("/api/auth/firebase/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("[FirebaseAuth] Session destroy failed:", (err as Error).message);
        }
        res.clearCookie("customer.sid");
        res.clearCookie("connect.sid");
        res.json({ ok: true });
    });
});

export default router;
