import { createHmac, timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";

type RawBodyRequest = Request & { rawBody?: Buffer };

export function requireMetaWebhookSignature(provider: string, appSecret: string | undefined) {
    return (req: RawBodyRequest, res: Response, next: NextFunction) => {
        const signature = req.get("x-hub-signature-256");

        if (!appSecret) {
            console.error(`[${provider}] Webhook signature secret is not configured`);
            return res.status(503).json({ error: "Webhook verification is unavailable" });
        }

        if (!signature?.startsWith("sha256=") || !req.rawBody) {
            return res.status(401).json({ error: "Invalid webhook signature" });
        }

        const expected = `sha256=${createHmac("sha256", appSecret).update(req.rawBody).digest("hex")}`;
        const actualBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expected);

        if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
            return res.status(401).json({ error: "Invalid webhook signature" });
        }

        next();
    };
}
