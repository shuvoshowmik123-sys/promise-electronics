import { Router, Request, Response } from "express";
import { verifyFirebaseToken } from "../services/firebase.js";
import { db } from "../db.js";
import { users } from "../../shared/schema.js";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
    enforceCustomerLoginPolicy,
    establishCustomerSession,
    CustomerAccountNotActivatedError,
} from "../services/customer-session.service.js";
import { toCustomerSessionView } from "../services/customer-session-view.js";
import { NO_CUSTOMER_PASSWORD } from "../services/customer-password.js";

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
                /**
                 * Customers only. This matched any row with the address,
                 * so a staff member whose personal Gmail was on their user
                 * record could be signed into by whoever held that Google
                 * account — no password, no phone check. It does not hand out
                 * an admin session, but it does bind a stranger's Google
                 * identity to a staff row and open the portal as them.
                 *
                 * The address is also not unique in this table, so two rows
                 * sharing one email made this a coin toss. Matching one role
                 * narrows it; the phone remains the identity that decides.
                 */
                user = await db.query.users.findFirst({
                    where: and(eq(users.email, firebaseUser.email), eq(users.role, "Customer")),
                }).catch(() => null);

                if (user) {
                    // Gate BEFORE linking: attaching the Firebase UID to an
                    // unclaimed account would hand that account a permanent
                    // second key, even though the login itself is refused.
                    await enforceCustomerLoginPolicy({
                        userId: user.id,
                        accountState: (user as any).customerAccountState,
                        authMethod: "firebase",
                    });

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
                /**
                 * The shop's own "this account has no password" marker, not an
                 * empty string. Both are refused at login, but only the marker
                 * is recognised by isPlaceholderPassword — so with "" the
                 * account looked to the rest of the system like it had a real
                 * password, and could never be given one.
                 */
                password: NO_CUSTOMER_PASSWORD,
                role: "Customer",
                firebaseUid: firebaseUser.uid,
                profileImageUrl: firebaseUser.picture ?? undefined,
                isVerified: true,
            } as any).returning();
        }

        // Covers the firebaseUid-match branch (existing linked account) and, for
        // the freshly-created branch, is a cheap no-op that also clears any link
        // issued against a pre-existing row.
        await enforceCustomerLoginPolicy({
            userId: user!.id,
            accountState: (user as any)?.customerAccountState,
            authMethod: "firebase",
        });

        await regenerateSession(req);
        // ITEM 6: shared helper sets passwordChangedAtStamp so requireCustomerAuth
        // freshness checks pass (hand-rolled fields left stamp missing → SESSION_REAUTH_REQUIRED).
        await establishCustomerSession(req, res, {
            customerId: user!.id,
            authMethod: "firebase",
        });

        req.session.save((saveErr) => {
            if (saveErr) {
                console.error("[FirebaseAuth] Session save failed:", (saveErr as Error).message);
                return res.status(500).json({ error: "Session creation failed" });
            }
            // Was a hand-written five-field object that omitted `phone`, so the
            // client concluded the account had no phone number and demanded
            // profile completion. See customer-session-view.ts.
            res.json({ ok: true, user: toCustomerSessionView(user!) });
        });
    } catch (e: any) {
        if (e instanceof CustomerAccountNotActivatedError) {
            return res.status(403).json({
                error: "This account has not been set up yet. Please contact us for a setup link.",
                code: e.code,
            });
        }
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
