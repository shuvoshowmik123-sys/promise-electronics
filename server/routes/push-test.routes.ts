/**
 * The push connection test bench. Temporary, and built to be deleted.
 *
 * Every part of the notification chain has been read and looks correct, and not
 * one notification has ever been proven to arrive. Those are different things,
 * and only a real phone can tell them apart — which is what this exists for.
 *
 * **Why a ping that replies.** Asking Firebase to deliver a message and being
 * told "accepted" proves the server's credential works and the token is
 * well-formed. It does not prove the phone is reachable, that the person
 * allowed notifications, that the app survived the battery optimiser, or that
 * anything appeared on a screen. FCM accepts messages for devices that have
 * been switched off for a month. So the message carries a ping id, the app
 * sends it straight back, and the round trip is the only evidence that counts.
 *
 * **Three states, because they fail separately.**
 *   accepted  — Firebase took it. Credential and token are good.
 *   replied   — the app was running and answered by itself. Delivery proven.
 *   opened    — someone tapped the notification. It reached the screen.
 *
 * The distinction matters more than it looks. When the app is killed, a
 * notification message is handled by Android alone and no JavaScript runs, so
 * no automatic reply is possible until the notification is tapped. A test that
 * only looked for the automatic reply would report failure for the exact case
 * this app was built for — an alert arriving with the app closed. "Opened" is
 * the pass mark there, and it is a stronger proof than "replied", not a weaker
 * one: someone saw it.
 *
 * **Nothing is written to the database.** No table, no migration, no schema
 * bump for a feature with a removal date. Results live in memory and are lost
 * when the server restarts, which for a test somebody is watching in real time
 * is a fair trade for leaving no trace behind.
 *
 * **Off unless switched on.** PUSH_TEST_CONSOLE must be set. Turning it off in
 * the host's dashboard removes the whole surface within a restart, with no
 * deploy — which is what makes "temporary in production" a promise rather than
 * a hope. When the green signal comes, delete this file, its mount line, and
 * the page.
 */

import { Router, type Request, type Response } from "express";
import admin from "firebase-admin";
import { randomUUID } from "crypto";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "../db.js";
import { deviceTokens, users } from "../../shared/schema.js";
import { requireAdminAuth, requireSuperAdmin } from "./middleware/auth.js";
import { logRouteError } from "../utils/route-error.js";

const router = Router();

/** The console is absent, not merely hidden, unless this is set. */
function consoleEnabled(): boolean {
    const v = (process.env.PUSH_TEST_CONSOLE || "").trim().toLowerCase();
    return v === "1" || v === "on" || v === "true" || v === "yes";
}

/**
 * A 404, not a 403.
 *
 * A disabled test surface should not advertise that it exists and is merely
 * switched off. There is nothing here to find.
 */
function gate(_req: Request, res: Response, next: () => void) {
    if (!consoleEnabled()) return res.status(404).json({ error: "Not found" });
    next();
}

type PingState = "accepted" | "replied" | "opened" | "failed";

type Ping = {
    id: string;
    /** Who was aimed at. */
    userId: string;
    username: string;
    fullName: string;
    /** Which device. A person may hold several. */
    platform: string;
    tokenTail: string;
    sentAt: number;
    sentBy: string;
    state: PingState;
    /** Firebase's own id for the message, worth keeping for a support ticket. */
    messageId: string | null;
    /** The raw FCM error code, which is the whole diagnosis — see explain(). */
    errorCode: string | null;
    error: string | null;
    /** When the phone answered, and how. */
    repliedAt: number | null;
    openedAt: number | null;
    /** Milliseconds from send to first reply. The number that tells you it is healthy. */
    roundTripMs: number | null;
    title: string;
    body: string;
};

/**
 * The last two hundred pings, newest first.
 *
 * A bounded array rather than a growing one: this runs on a small instance and
 * a test console left switched on for a week should not be the thing that fills
 * its memory.
 */
const MAX_PINGS = 200;
const pings: Ping[] = [];

function recordPing(p: Ping): void {
    pings.unshift(p);
    if (pings.length > MAX_PINGS) pings.length = MAX_PINGS;
}

/**
 * What an FCM error actually means, in words that lead to an action.
 *
 * The codes are precise and unhelpful to read at speed, and each one points at
 * a different part of the setup. Guessing between them is how an afternoon
 * disappears.
 */
function explain(code: string | null): string | null {
    if (!code) return null;
    const c = code.toLowerCase();
    if (c.includes("registration-token-not-registered") || c.includes("unregistered")) {
        return "This device is gone — the app was uninstalled, or the token was replaced. Nothing is wrong with the server. Sign in on the app again to register a fresh one.";
    }
    if (c.includes("sender-id-mismatch") || c.includes("mismatched-credential")) {
        return "The app was built with a different Firebase project than the server sends from. Check google-services.json against the server's credential — this one is a build problem, not a phone problem.";
    }
    if (c.includes("invalid-argument") || c.includes("invalid-registration-token")) {
        return "Firebase rejected the token as malformed. It was stored wrong at registration rather than expiring.";
    }
    if (c.includes("third-party-auth") || c.includes("authentication")) {
        return "The server's own Firebase credential was refused. No device can receive anything until this is fixed.";
    }
    if (c.includes("unavailable") || c.includes("internal")) {
        return "Firebase was temporarily unavailable. Try the ping again before concluding anything.";
    }
    if (c.includes("quota")) {
        return "Sending quota exceeded. Wait, then try again.";
    }
    return null;
}

/**
 * Everyone who could be pinged, and what they are holding.
 *
 * Listed per device rather than per person, because a person with a phone and a
 * tablet has two answers to give and one of them can be broken. Users with no
 * device appear too — an empty row is the single most useful thing on this
 * screen, since it says the app was never signed into and the send button was
 * never going to do anything.
 */
router.get(
    "/api/admin/push-test/devices",
    gate,
    requireSuperAdmin,
    async (_req: Request, res: Response) => {
        try {
            const rows = await db
                .select({
                    userId: users.id,
                    username: users.username,
                    name: users.name,
                    role: users.role,
                    tokenId: deviceTokens.id,
                    token: deviceTokens.token,
                    platform: deviceTokens.platform,
                    isActive: deviceTokens.isActive,
                    registeredAt: deviceTokens.createdAt,
                    lastUsedAt: deviceTokens.lastUsedAt,
                })
                .from(users)
                .leftJoin(
                    deviceTokens,
                    and(eq(deviceTokens.userId, users.id), eq(deviceTokens.isActive, true)),
                )
                // Customers are not staff and hold no staff-app device. Leaving
                // them in would bury the dozen people this is about under
                // thousands of rows that can never be pinged.
                .where(ne(users.role, "Customer"))
                .orderBy(desc(deviceTokens.lastUsedAt));

            /** Grouped so the screen reads as a list of people, not a list of rows. */
            const byUser = new Map<string, {
                userId: string;
                username: string;
                fullName: string;
                role: string;
                devices: Array<{
                    tokenId: string;
                    tokenTail: string;
                    platform: string;
                    registeredAt: Date | null;
                    lastUsedAt: Date | null;
                }>;
            }>();

            for (const r of rows) {
                if (!byUser.has(r.userId)) {
                    byUser.set(r.userId, {
                        userId: r.userId,
                        // username is nullable in the schema; a staff row without
                        // one is still a person who can hold a device, so fall
                        // back to the name rather than dropping them.
                        username: r.username ?? r.name,
                        fullName: r.name,
                        role: r.role,
                        devices: [],
                    });
                }
                if (r.tokenId && r.token) {
                    byUser.get(r.userId)!.devices.push({
                        tokenId: r.tokenId,
                        // Never the whole token. It is a sending credential for
                        // that device, and a screen is a place things get read
                        // off and photographed.
                        tokenTail: `…${r.token.slice(-10)}`,
                        // The left join makes every device column nullable to the
                        // type checker, though a row with a token always has one.
                        platform: r.platform ?? "android",
                        registeredAt: r.registeredAt ?? null,
                        lastUsedAt: r.lastUsedAt ?? null,
                    });
                }
            }

            const list = Array.from(byUser.values()).sort((a, b) => {
                // People who can actually be tested first.
                if (a.devices.length !== b.devices.length) return b.devices.length - a.devices.length;
                return a.username.localeCompare(b.username);
            });

            res.json({
                users: list,
                totals: {
                    people: list.length,
                    withDevice: list.filter((u) => u.devices.length > 0).length,
                    devices: list.reduce((n, u) => n + u.devices.length, 0),
                },
                firebaseReady: admin.apps.length > 0,
            });
        } catch (error) {
            logRouteError("push-test/devices", _req, error);
            res.status(500).json({ error: "Could not read the device list." });
        }
    },
);

/**
 * Ping one person's devices and wait for them to answer.
 *
 * The message carries both a notification block and a data block on purpose.
 * The notification block is what Android draws when the app is closed — the
 * thing being tested. The data block carries the ping id the app needs to
 * reply with, and it survives into the tap handler, so the reply works whether
 * the app was awake or the notification was tapped an hour later.
 */
router.post(
    "/api/admin/push-test/ping",
    gate,
    requireSuperAdmin,
    async (req: Request, res: Response) => {
        const { userId, title, body } = req.body ?? {};
        if (!userId || typeof userId !== "string") {
            return res.status(400).json({ error: "Pick someone to ping." });
        }

        if (!admin.apps.length) {
            return res.status(503).json({
                error: "Firebase is not initialised on this server. No push can be sent from here at all — this is a server credential problem, not a device one.",
            });
        }

        try {
            const target = await db.select().from(users).where(eq(users.id, userId)).limit(1);
            if (!target.length) return res.status(404).json({ error: "No such user." });
            const person = target[0];

            const devices = await db
                .select()
                .from(deviceTokens)
                .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.isActive, true)));

            if (!devices.length) {
                return res.status(409).json({
                    error: `${person.username} has no registered device. They have not signed into the installed app yet — so there is nowhere to send. Nothing is broken; there is simply no address.`,
                });
            }

            const sentBy = (req as any).adminSessionUser?.username ?? "super admin";
            const pingTitle = (typeof title === "string" && title.trim()) || "Connection test";
            const results: Ping[] = [];

            for (const device of devices) {
                const pingId = randomUUID();
                const pingBody =
                    (typeof body === "string" && body.trim()) ||
                    "Tap this to confirm your app is connected.";

                const record: Ping = {
                    id: pingId,
                    userId,
                    username: person.username ?? person.name,
                    fullName: person.name,
                    platform: device.platform,
                    tokenTail: `…${device.token.slice(-10)}`,
                    sentAt: Date.now(),
                    sentBy,
                    state: "accepted",
                    messageId: null,
                    errorCode: null,
                    error: null,
                    repliedAt: null,
                    openedAt: null,
                    roundTripMs: null,
                    title: pingTitle,
                    body: pingBody,
                };

                try {
                    const messageId = await admin.messaging().send({
                        token: device.token,
                        notification: { title: pingTitle, body: pingBody },
                        data: {
                            type: "connection_test",
                            pingId,
                            // Deep-links the tap back into the console, so the
                            // person testing lands where the result is shown.
                            url: "/admin/push-test",
                        },
                        android: {
                            priority: "high",
                            notification: {
                                channelId: "admin_notifications",
                                priority: "high",
                                defaultSound: true,
                            },
                        },
                    });
                    record.messageId = messageId;
                } catch (err) {
                    const e = err as { code?: string; errorInfo?: { code?: string }; message?: string };
                    record.state = "failed";
                    record.errorCode = e.errorInfo?.code ?? e.code ?? "unknown";
                    record.error = e.message ?? "Send failed";
                }

                recordPing(record);
                results.push(record);
            }

            res.json({
                sent: results.length,
                pings: results.map((p) => ({ ...p, explanation: explain(p.errorCode) })),
            });
        } catch (error) {
            logRouteError("push-test/ping", req, error);
            res.status(500).json({ error: "The ping could not be sent." });
        }
    },
);

/**
 * The phone answering.
 *
 * Called by the app itself, not by the console. Authenticated as an ordinary
 * signed-in staff member — whoever is being tested is not a super admin, and
 * requiring one here would mean only a super admin's phone could ever pass.
 *
 * An unknown ping id is answered with 200 and ignored. It means the server
 * restarted since the ping was sent, and a phone doing exactly the right thing
 * should not be handed an error for it.
 */
router.post(
    "/api/admin/push-test/ack",
    gate,
    requireAdminAuth,
    async (req: Request, res: Response) => {
        const { pingId, phase } = req.body ?? {};
        if (!pingId || typeof pingId !== "string") {
            return res.status(400).json({ error: "pingId required" });
        }

        const ping = pings.find((p) => p.id === pingId);
        if (!ping) return res.json({ ok: true, known: false });

        /**
         * Only the person who was pinged may answer for it.
         *
         * Without this the reply proves that *a* phone is connected, not that
         * *theirs* is — which is the entire question being asked.
         */
        const caller = (req as any).adminSessionUser?.id ?? req.session?.adminUserId;
        if (caller !== ping.userId) return res.json({ ok: true, known: false });

        const now = Date.now();
        if (phase === "opened") {
            ping.openedAt = ping.openedAt ?? now;
            // Opened outranks replied: someone saw it with their own eyes.
            ping.state = "opened";
        } else {
            ping.repliedAt = ping.repliedAt ?? now;
            if (ping.state !== "opened") ping.state = "replied";
        }
        ping.roundTripMs = ping.roundTripMs ?? now - ping.sentAt;

        res.json({ ok: true, known: true });
    },
);

/** Everything sent this session, newest first, for the console to poll. */
router.get(
    "/api/admin/push-test/results",
    gate,
    requireSuperAdmin,
    async (_req: Request, res: Response) => {
        res.json({
            pings: pings.map((p) => ({ ...p, explanation: explain(p.errorCode) })),
            firebaseReady: admin.apps.length > 0,
        });
    },
);

export default router;
