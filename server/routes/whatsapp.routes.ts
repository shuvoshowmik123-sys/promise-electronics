import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { aiService } from "../services/ai.service.js";
import { storage } from "../storage.js";
import { brainService } from "../brain/brain.service.js";
import { assignSession } from "../services/assignment.service.js";
import { findCustomerByPhone } from "../services/canonical-customer.service.js";

const router = Router();

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

/**
 * Webhook Verification — Meta sends GET to confirm your URL owns this token
 */
router.get("/webhook", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("[WhatsApp] Webhook verified");
        res.status(200).send(challenge);
    } else if (mode || token) {
        console.warn("[WhatsApp] Webhook verification failed — token mismatch");
        res.sendStatus(403);
    } else {
        res.json({ status: "WhatsApp Webhook Active" });
    }
});

/**
 * Incoming Messages
 */
router.post("/webhook", (req: Request, res: Response) => {
    const body = req.body;

    if (body.object !== "whatsapp_business_account") {
        return res.sendStatus(404);
    }

    res.status(200).send("EVENT_RECEIVED");

    Promise.all((body.entry ?? []).map(async (entry: any) => {
        const changes = entry.changes ?? [];
        for (const change of changes) {
            if (change.field !== "messages") continue;
            const value = change.value;
            const messages = value.messages ?? [];
            const contacts = value.contacts ?? [];

            for (const message of messages) {
                const senderPhone = message.from; // e.g. "8801XXXXXXXXX"
                const senderName = contacts[0]?.profile?.name ?? senderPhone;

                // Use phone as session key, prefixed to avoid collision with Messenger PSIDs
                const sessionKey = `wa_${senderPhone}`;

                // Mark message as read immediately — turns grey ticks → blue ticks
                markAsRead(message.id).catch(() => {});

                await handleWhatsAppMessage(sessionKey, senderPhone, senderName, message);
            }
        }
    })).catch(err => {
        console.error("[WhatsApp Webhook Error]", err);
    });
});

async function handleWhatsAppMessage(
    sessionKey: string,
    senderPhone: string,
    senderName: string,
    message: any
) {
    const [session, mode] = await Promise.all([
        brainService.getSession(sessionKey),
        brainService.getBrainMode(),
    ]);
    const history = (session.history as any[]) ?? [];

    // Persist name + phone so inbox shows real identity (not just raw psid)
    brainService.updateSessionMeta(sessionKey, senderName, senderPhone).catch(() => {});

    // Auto-assign if no owner or owner offline (Phase B). Fire-and-forget — don't block response.
    assignSession(sessionKey).catch(() => {});
    const isObserveMode = mode === "observe";

    try {
        // ── Text ──────────────────────────────────────────────────────────────
        if (message.type === "text") {
            const userText = message.text?.body ?? "";
            console.log(`[WhatsApp] Text from ${senderPhone}: "${userText}"`);

            if (isObserveMode) {
                await brainService.updateSession(sessionKey, userText, null);
                console.log(`[Brain] [OBSERVE] WhatsApp text logged from ${senderPhone}`);
                return;
            }

            const customerRecord = await findCustomerByPhone(senderPhone).catch(() => null);
            const response = await aiService.chatWithDaktarVai(
                userText, history, undefined,
                { name: senderName, phone: senderPhone, role: "customer", customerRecord }
            );

            if (mode === "shadow") {
                await brainService.saveShadowDraft(sessionKey, userText, response.text);
                await brainService.updateSession(sessionKey, userText, null);
                return;
            }

            await brainService.logConversation(sessionKey, userText, response.text, "ai");
            await processResponse(sessionKey, senderPhone, senderName, userText, response, history);
            return;
        }

        // ── Image ─────────────────────────────────────────────────────────────
        if (message.type === "image") {
            const mediaId = message.image?.id;
            const mimeType: string = message.image?.mime_type || "image/jpeg";
            const imageId = randomUUID();
            console.log(`[WhatsApp] Image from ${senderPhone}, media_id=${mediaId}, imageId=${imageId}`);

            const imageBuffer = await downloadWhatsAppMedia(mediaId);

            // Store in brain_media (24h TTL) + /tmp cache — AI can fetch via /api/brain/media/:imageId
            await brainService.storeMedia(imageId, sessionKey, mimeType, imageBuffer);
            // Push structured image ref into session history (no blob in JSONB)
            await brainService.appendToHistory(sessionKey, {
                role: "user", type: "image", content: "[Image]", imageId, mimeType
            });

            if (isObserveMode) {
                console.log(`[Brain] [OBSERVE] WhatsApp image stored, imageId=${imageId}`);
                return;
            }

            const base64Image = imageBuffer.toString("base64");
            const response = await aiService.chatWithDaktarVai(
                "Here is an image of my problem.", history, base64Image, { name: senderName, role: "customer" }
            );

            if (mode === "shadow") {
                await brainService.saveShadowDraft(sessionKey, "[Image]", response.text);
                return;
            }

            await brainService.logConversation(sessionKey, "Here is an image of my problem.", response.text, "ai");
            await processResponse(sessionKey, senderPhone, senderName, "Here is an image of my problem.", response, history);
            return;
        }

        // ── Audio ─────────────────────────────────────────────────────────────
        if (message.type === "audio") {
            const mediaId = message.audio?.id;
            console.log(`[WhatsApp] Audio from ${senderPhone}, media_id=${mediaId}`);

            const audioBuffer = await downloadWhatsAppMedia(mediaId);
            const transcribed = await aiService.transcribeAudio(audioBuffer);

            if (!transcribed) {
                if (!isObserveMode) {
                    await sendWhatsApp(senderPhone, "দুঃখিত, আমি আপনার ভয়েস বুঝতে পারিনি। দয়া করে লিখে জানান।");
                }
                return;
            }

            console.log(`[WhatsApp] Transcribed: "${transcribed}"`);

            if (isObserveMode) {
                await brainService.updateSession(sessionKey, transcribed, null);
                return;
            }

            const response = await aiService.chatWithDaktarVai(
                transcribed, history, undefined, { name: senderName, role: "customer" }
            );

            if (mode === "shadow") {
                await brainService.saveShadowDraft(sessionKey, transcribed, response.text);
                await brainService.updateSession(sessionKey, transcribed, null);
                return;
            }

            await brainService.logConversation(sessionKey, transcribed, response.text, "ai");
            await processResponse(sessionKey, senderPhone, senderName, transcribed, response, history);
            return;
        }

        console.log(`[WhatsApp] Unhandled message type: ${message.type}`);

    } catch (err) {
        console.error("[WhatsApp] Error handling message:", err);
        if (!isObserveMode) {
            await sendWhatsApp(senderPhone, "দুঃখিত, একটি সমস্যা হয়েছে। দয়া করে পরে আবার চেষ্টা করুন।");
        }
    }
}

async function processResponse(
    sessionKey: string,
    senderPhone: string,
    _senderName: string,
    userText: string,
    response: any,
    _history: any[]
) {
    await sendWhatsApp(senderPhone, response.text);
    await brainService.updateSession(sessionKey, userText, response.text);

    if (response.booking?.action === "BOOK_TICKET") {
        try {
            const booking = response.booking;
            const newRequest = await storage.createServiceRequest({
                brand: booking.brand,
                primaryIssue: booking.issue,
                description: booking.description ?? "Via WhatsApp",
                customerName: booking.customer_name ?? "WhatsApp User",
                phone: booking.phone ?? senderPhone,
                address: booking.address,
                status: "Pending",
                trackingStatus: "Request Received",
                source: "WhatsApp",
            } as any);

            await sendWhatsApp(
                senderPhone,
                `✅ আপনার টিকিট কনফার্ম হয়েছে!\nTicket ID: ${newRequest.ticketNumber}\nআমরা শীঘ্রই আপনার সাথে যোগাযোগ করব।`
            );
        } catch (err) {
            console.error("[WhatsApp] Failed to create ticket:", err);
            await sendWhatsApp(senderPhone, "⚠️ দুঃখিত, টিকিট জেনারেট করতে সমস্যা হচ্ছে। আমাদের হটলাইনে কল করুন।");
        }
    }
}

/**
 * Mark an incoming message as read — turns grey ticks blue on sender's phone
 */
async function markAsRead(messageId: string) {
    if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) return;
    await global.fetch(
        `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${ACCESS_TOKEN}`,
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                status: "read",
                message_id: messageId,
            }),
        }
    ).catch(() => {});
}

/**
 * Send a text message via WhatsApp Cloud API
 */
async function sendWhatsApp(to: string, text: string) {
    if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
        console.warn("[WhatsApp] Missing ACCESS_TOKEN or PHONE_NUMBER_ID — cannot send");
        return;
    }

    try {
        const res = await global.fetch(
            `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${ACCESS_TOKEN}`,
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    to,
                    type: "text",
                    text: { body: text },
                }),
            }
        );

        if (!res.ok) {
            const err = await res.json();
            console.error("[WhatsApp] Send error:", err);
        }
    } catch (err) {
        console.error("[WhatsApp] Network error:", err);
    }
}

/**
 * Download media (image/audio) from WhatsApp Cloud API using media ID
 */
async function downloadWhatsAppMedia(mediaId: string): Promise<Buffer> {
    if (!ACCESS_TOKEN) throw new Error("No WHATSAPP_ACCESS_TOKEN");

    // Step 1: get the download URL
    const metaRes = await global.fetch(
        `https://graph.facebook.com/v19.0/${mediaId}`,
        { headers: { "Authorization": `Bearer ${ACCESS_TOKEN}` } }
    );
    if (!metaRes.ok) throw new Error(`Failed to get media URL: ${metaRes.statusText}`);
    const metaJson = await metaRes.json() as any;

    // Step 2: download the actual file
    const fileRes = await global.fetch(metaJson.url, {
        headers: { "Authorization": `Bearer ${ACCESS_TOKEN}` }
    });
    if (!fileRes.ok) throw new Error(`Failed to download media: ${fileRes.statusText}`);

    const arrayBuffer = await fileRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

export default router;
