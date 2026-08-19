/**
 * Token login for the native app, and the controls that end it.
 *
 * Sign-in happens once per install. After that the app sends its token and the
 * rest of the API behaves exactly as it does for the web admin, because
 * staffDeviceAuthMiddleware installs the same session shape every guard already
 * reads.
 *
 * The revoke endpoints matter as much as the login. A phone that is lost, sold,
 * or carried out of the door by somebody who has resigned tells the server
 * nothing at all — so "signed in until they uninstall" would mean signed in
 * forever. Revoke and expiry are how a token actually ends.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { authService } from "../services/auth.service.js";
import { storage } from "../storage.js";
import {
    DEVICE_TOKEN_TTL_DAYS,
    issueDeviceToken,
    listDevicesForUser,
    revokeAllDevicesForUser,
    revokeDevice,
} from "../services/staff-device.service.js";
import { requireAdminAuth, requireSuperAdmin } from "./middleware/auth.js";
import { authLimiter } from "./middleware/rate-limit.js";
import { auditLogger } from "../utils/auditLogger.js";
import { logRouteError } from "../utils/route-error.js";
import { getEffectivePermissionsForUser } from "./middleware/auth.js";

const router = Router();

const deviceLoginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
    /**
     * Shown in the revoke list so a person can tell one handset from another.
     * Not an identifier and not trusted: Android hardware ids are per-app,
     * reset with the device, and mostly unavailable since Android 10, so the
     * token is the identity and this is only a label to read.
     */
    deviceLabel: z.string().max(120).optional(),
    platform: z.enum(["android", "ios"]).optional(),
    appVersion: z.string().max(40).optional(),
});

/** password_changed_at as a number, with "never changed" as a real value. */
function passwordStampOf(user: unknown): number {
    const raw = (user as { passwordChangedAt?: Date | string | null })?.passwordChangedAt;
    return raw ? new Date(raw).getTime() : 0;
}

/**
 * Sign in once and receive a device token.
 *
 * Rate-limited with the same limiter as the web login: this endpoint accepts a
 * username and password, so leaving it off would make it the softer of two
 * doors into the same accounts.
 */
router.post(
    "/api/admin/device/login",
    authLimiter,
    async (req: Request, res: Response) => {
        try {
            const parsed = deviceLoginSchema.safeParse(req.body);
            if (!parsed.success) {
                return res.status(400).json({ error: "Username and password are required." });
            }

            const { username, password, deviceLabel, platform, appVersion } = parsed.data;

            /**
             * Deliberately the same authenticateAdmin the web login uses. A
             * second password check here would be a second place to keep the
             * inactive-account rule and the hashing correct, and the two would
             * eventually disagree.
             */
            const result = await authService.authenticateAdmin(username, password);
            if ("error" in result) {
                return res.status(result.status).json({ error: result.error });
            }

            const user = result.user;
            const passwordStamp = passwordStampOf(user);

            const issued = await issueDeviceToken({
                userId: user.id,
                passwordStamp,
                deviceLabel,
                platform,
                appVersion,
            });

            await auditLogger.log({
                userId: user.id,
                action: "STAFF_DEVICE_TOKEN_ISSUED",
                entity: "User",
                entityId: user.id,
                details: `${user.username} signed in from a device (${deviceLabel || "unlabelled"}, ${platform || "android"})`,
                severity: "warning",
                req,
            }).catch(() => {});

            const { password: _discard, ...safeUser } = user as Record<string, unknown> & { password?: string };

            /**
             * The token is returned here and never again — only its hash is
             * kept. If the app loses it, the person signs in again; there is no
             * way to read it back, by design.
             */
            res.status(201).json({
                token: issued.token,
                deviceId: issued.deviceId,
                expiresAt: issued.expiresAt.toISOString(),
                ttlDays: DEVICE_TOKEN_TTL_DAYS,
                user: safeUser,
                permissions: getEffectivePermissionsForUser(user as { role: string; permissions?: string | null }),
            });
        } catch (error) {
            logRouteError("POST /api/admin/device/login", req, error);
            res.status(500).json({ error: "Could not sign in." });
        }
    },
);

/**
 * Confirms a token still works and returns who it belongs to.
 *
 * The app calls this on launch. Expiry is extended by the middleware on every
 * authenticated request, so a person who uses the app never has to think about
 * renewal; there is no separate refresh step to get wrong.
 */
router.get("/api/admin/device/me", requireAdminAuth, async (req: Request, res: Response) => {
    const user = (req as { user?: Record<string, unknown> }).user;
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const { password: _discard, ...safeUser } = user as Record<string, unknown> & { password?: string };
    res.json({
        user: safeUser,
        permissions: getEffectivePermissionsForUser(user as unknown as { role: string; permissions?: string | null }),
        deviceId: (req as { deviceAuth?: { deviceId: string } }).deviceAuth?.deviceId ?? null,
    });
});

/** Signing out on the handset itself — ends this install only. */
router.post("/api/admin/device/logout", requireAdminAuth, async (req: Request, res: Response) => {
    try {
        const deviceAuth = (req as { deviceAuth?: { deviceId: string } }).deviceAuth;
        if (!deviceAuth) {
            return res.status(400).json({ error: "Not signed in from a device." });
        }
        await revokeDevice(deviceAuth.deviceId, "signed_out_on_device");
        res.json({ ok: true });
    } catch (error) {
        logRouteError("POST /api/admin/device/logout", req, error);
        res.status(500).json({ error: "Could not sign out." });
    }
});

/**
 * The list a Super Admin reads when a phone goes missing.
 *
 * Super Admin only, matching the reset-link endpoints: knowing which handsets
 * hold a live token for somebody, and being able to end them, is the same
 * authority as being able to reset their password.
 */
router.get(
    "/api/admin/users/:id/devices",
    requireAdminAuth,
    requireSuperAdmin,
    async (req: Request, res: Response) => {
        try {
            const target = await storage.getUser(req.params.id);
            if (!target) return res.status(404).json({ error: "User not found" });

            res.json({ devices: await listDevicesForUser(req.params.id) });
        } catch (error) {
            logRouteError("GET /api/admin/users/:id/devices", req, error);
            res.status(500).json({ error: "Could not read devices." });
        }
    },
);

/** Ends one handset. This is the button pressed the day a phone is lost. */
router.post(
    "/api/admin/devices/:deviceId/revoke",
    requireAdminAuth,
    requireSuperAdmin,
    async (req: Request, res: Response) => {
        try {
            const actor = (req as { user?: { id: string; name?: string; username?: string } }).user;
            await revokeDevice(req.params.deviceId, "revoked_by_admin", actor?.id);

            await auditLogger.log({
                userId: actor?.id || "system",
                action: "STAFF_DEVICE_REVOKED",
                entity: "StaffDevice",
                entityId: req.params.deviceId,
                details: `${actor?.name || actor?.username || "A Super Admin"} revoked a device token`,
                severity: "critical",
                req,
            }).catch(() => {});

            res.json({ ok: true });
        } catch (error) {
            logRouteError("POST /api/admin/devices/:deviceId/revoke", req, error);
            res.status(500).json({ error: "Could not revoke the device." });
        }
    },
);

/** Ends every handset for one person — used when somebody leaves. */
router.post(
    "/api/admin/users/:id/devices/revoke-all",
    requireAdminAuth,
    requireSuperAdmin,
    async (req: Request, res: Response) => {
        try {
            const actor = (req as { user?: { id: string; name?: string; username?: string } }).user;
            const target = await storage.getUser(req.params.id);
            if (!target) return res.status(404).json({ error: "User not found" });

            await revokeAllDevicesForUser(req.params.id, "revoked_by_admin", actor?.id);

            await auditLogger.log({
                userId: actor?.id || "system",
                action: "STAFF_DEVICE_REVOKED_ALL",
                entity: "User",
                entityId: req.params.id,
                details: `${actor?.name || actor?.username || "A Super Admin"} revoked every device for ${target.username}`,
                severity: "critical",
                req,
            }).catch(() => {});

            res.json({ ok: true });
        } catch (error) {
            logRouteError("POST /api/admin/users/:id/devices/revoke-all", req, error);
            res.status(500).json({ error: "Could not revoke devices." });
        }
    },
);

export default router;
