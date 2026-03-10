import { Router, Request, Response } from "express";
import { aiService } from "../services/ai.service.js";
import { storage } from "../storage.js";
import ImageKit from "imagekit";
import { brainService } from "../brain/brain.service.js";

const router = Router();

// Configuration
const VERIFY_TOKEN = process.env.MESSENGER_VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
const PAGE_ID = process.env.FACEBOOK_PAGE_ID;

// Initialize ImageKit
function getImageKit() {
    const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
    const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;

    if (!publicKey || !privateKey || !urlEndpoint) {
        return null;
    }

    return new ImageKit({
        publicKey,
        privateKey,
        urlEndpoint,
    });
}

/**
 * Webhook Verification
 */
router.get("/webhook", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token) {
        if (mode === "subscribe" && token === VERIFY_TOKEN) {
            console.log("WEBHOOK_VERIFIED");
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.json({ status: "Messenger Webhook Active" });
    }
});

/**
 * Handle Incoming Messages
 */
router.post("/webhook", (req: Request, res: Response) => {
    const body = req.body;

    if (body.object === "page") {
        res.status(200).send("EVENT_RECEIVED");

        Promise.all(body.entry.map(async (entry: any) => {
            const webhook_event = entry.messaging[0];
            const sender_psid = webhook_event.sender.id;
            const recipient_psid = webhook_event.recipient?.id;

            if (webhook_event.message?.is_echo) {
                if (PAGE_ID && sender_psid === PAGE_ID && webhook_event.message.text && recipient_psid) {
                    const session = await brainService.getSession(recipient_psid);
                    const history = (session.history as any[]) || [];
                    const lastUserMsg = [...history].reverse().find(m => m.role === 'user')?.content || "[Unknown Context]";
                    const humanReplyText = webhook_event.message.text;

                    await brainService.logConversation(recipient_psid, lastUserMsg, humanReplyText, 'human');
                    await brainService.updateSession(recipient_psid, null, humanReplyText);
                    console.log(`[Brain] Logged human reply for customer ${recipient_psid}`);
                }
                return;
            }

            if (webhook_event.message) {
                await handleMessage(sender_psid, webhook_event.message);
            } else if (webhook_event.postback) {
                await handlePostback(sender_psid, webhook_event.postback);
            }
        })).catch(err => {
            console.error('[Messenger Webhook Background Error]', err);
        });
    } else {
        res.sendStatus(404);
    }
});

/**
 * Handle Message Logic
 *
 * Observe Mode: Log everything but send NO reply.
 * Shadow/Autopilot: Generate AI response and send it.
 */
async function handleMessage(sender_psid: string, message: any) {
    // Get persistent history from Brain DB
    const session = await brainService.getSession(sender_psid);
    const history = (session.history as any[]) || [];

    // Check current Brain Mode
    const mode = await brainService.getBrainMode();
    const isObserveMode = mode === 'observe';

    try {
        // ─── 1. Handle Audio (Voice Note) ────────────────────────────────────
        if (message.attachments && message.attachments[0]?.type === "audio") {
            const audioUrl = message.attachments[0].payload.url;
            console.log(`[Messenger] Received audio from ${sender_psid}`);

            const audioBuffer = await downloadFile(audioUrl);
            const transcribedText = await aiService.transcribeAudio(audioBuffer);

            if (!transcribedText) {
                if (!isObserveMode) {
                    await callSendAPI(sender_psid, { text: "দুঃখিত, আমি আপনার ভয়েস বুঝতে পারিনি। দয়া করে লিখে জানান।" });
                }
                return;
            }

            console.log(`[Messenger] Transcribed audio: "${transcribedText}"`);

            // In observe mode: just log the voice note content, don't reply
            if (isObserveMode) {
                await brainService.updateSession(sender_psid, transcribedText, null);
                console.log(`[Brain] [OBSERVE] Logged audio message (transcribed) from ${sender_psid}`);
                return;
            }

            // Active or shadow mode: respond
            const response = await aiService.chatWithDaktarVai(transcribedText, history, undefined, { name: "Messenger User", role: "customer" });

            if (mode === 'shadow') {
                await brainService.saveShadowDraft(sender_psid, transcribedText, response.text);
                await brainService.updateSession(sender_psid, transcribedText, null);
                console.log(`[Brain] [SHADOW] Saved draft response for audio from ${sender_psid}`);
                return;
            }

            await brainService.logConversation(sender_psid, transcribedText, response.text, 'ai');
            await processAIResponse(sender_psid, transcribedText, response, history);
            return;
        }

        // ─── 2. Handle Image ──────────────────────────────────────────────────
        if (message.attachments && message.attachments[0]?.type === "image") {
            const imageUrl = message.attachments[0].payload.url;
            console.log(`[Messenger] Received image from ${sender_psid}`);

            const imageBuffer = await downloadFile(imageUrl);
            const base64Image = imageBuffer.toString("base64");

            let permanentUrl = imageUrl;
            const imagekit = getImageKit();

            if (imagekit) {
                const uploadResult = await imagekit.upload({
                    file: base64Image,
                    fileName: `messenger-${sender_psid}-${Date.now()}.jpg`,
                    folder: 'messenger_uploads'
                });
                permanentUrl = uploadResult.url;
            } else {
                console.warn("[Messenger] ImageKit not configured. Using source attachment URL.");
            }

            // In observe mode: just log the image event, don't reply
            if (isObserveMode) {
                await brainService.updateSession(sender_psid, `[Image sent: ${permanentUrl}]`, null);
                console.log(`[Brain] [OBSERVE] Logged image message from ${sender_psid}`);
                return;
            }

            // Active or shadow mode: analyze and respond
            const response = await aiService.chatWithDaktarVai("Here is an image of my problem.", history, base64Image, { name: "Messenger User", role: "customer" });

            if (mode === 'shadow') {
                await brainService.saveShadowDraft(sender_psid, `[Image sent: ${permanentUrl}]`, response.text);
                await brainService.updateSession(sender_psid, `[Image sent: ${permanentUrl}]`, null);
                console.log(`[Brain] [SHADOW] Saved draft response for image from ${sender_psid}`);
                return;
            }

            if (response.booking) {
                (response.booking as any).imageUrl = permanentUrl;
            }
            await brainService.logConversation(sender_psid, "Here is an image of my problem.", response.text, 'ai');
            await processAIResponse(sender_psid, "Here is an image of my problem.", response, history);
            return;
        }

        // ─── 3. Handle Text ───────────────────────────────────────────────────
        if (message.text) {
            const userText = message.text;
            console.log(`[Messenger] Received text: "${userText}"`);

            // In observe mode: log the message but send NO reply.
            // logConversation is NOT called here because we don't have a reply yet.
            // The reply will be logged when a human agent responds (echo event above).
            if (isObserveMode) {
                await brainService.updateSession(sender_psid, userText, null);
                console.log(`[Brain] [OBSERVE] Logged incoming text from ${sender_psid}. Awaiting human reply.`);
                return;
            }

            // Active or shadow mode: generate AI response
            const response = await aiService.chatWithDaktarVai(userText, history, undefined, { name: "Messenger User", role: "customer" });

            if (mode === 'shadow') {
                await brainService.saveShadowDraft(sender_psid, userText, response.text);
                await brainService.updateSession(sender_psid, userText, null);
                console.log(`[Brain] [SHADOW] Saved draft response for text from ${sender_psid}`);
                return;
            }

            await brainService.logConversation(sender_psid, userText, response.text, 'ai');
            await processAIResponse(sender_psid, userText, response, history);
        }

    } catch (error) {
        console.error("[Messenger] Error handling message:", error);
        if (!isObserveMode) {
            await callSendAPI(sender_psid, { text: "দুঃখিত, একটি সমস্যা হয়েছে। দয়া করে পরে আবার চেষ্টা করুন।" });
        }
    }
}

async function handlePostback(sender_psid: string, received_postback: any) {
    const payload = received_postback.payload;
    if (payload === 'GET_STARTED') {
        const mode = await brainService.getBrainMode();
        if (mode === 'observe') {
            await brainService.updateSession(sender_psid, "Hello", null);
            return;
        }
        const response = await aiService.chatWithDaktarVai("Hello", [], undefined, { name: "New User", role: "customer" });
        await brainService.logConversation(sender_psid, "Hello", response.text, 'ai');
        await processAIResponse(sender_psid, "Hello", response, []);
    }
}

/**
 * Process AI Response & Handle Bookings
 */
async function processAIResponse(sender_psid: string, userMessageText: string | null, response: any, _history: any[]) {
    // Send the text response
    await callSendAPI(sender_psid, { text: response.text });

    // Update session in DB
    await brainService.updateSession(sender_psid, userMessageText, response.text);

    // Handle Booking Action
    if (response.booking?.action === "BOOK_TICKET") {
        try {
            const booking = response.booking;
            console.log("[Messenger] Creating Service Request:", booking);

            const newRequest = await storage.createServiceRequest({
                brand: booking.brand,
                primaryIssue: booking.issue,
                description: booking.description || "Via Messenger",
                customerName: booking.customer_name || "Messenger User",
                phone: booking.phone || "N/A",
                address: booking.address,
                mediaUrls: booking.imageUrl ? JSON.stringify([booking.imageUrl]) : null,
                status: "Pending",
                trackingStatus: "Request Received",
                source: "Facebook Messenger"
            } as any);

            const ticketMsg = `✅ আপনার টিকিট কনফার্ম হয়েছে!\nTicket ID: ${newRequest.ticketNumber}\nআমরা শীঘ্রই আপনার সাথে যোগাযোগ করব।`;
            await callSendAPI(sender_psid, { text: ticketMsg });

        } catch (err) {
            console.error("[Messenger] Failed to create ticket:", err);
            await callSendAPI(sender_psid, { text: "⚠️ দুঃখিত, টিকিট জেনারেট করতে সমস্যা হচ্ছে। আমাদের হটলাইনে কল করুন।" });
        }
    }
}

/**
 * Send API to Messenger
 */
async function callSendAPI(sender_psid: string, response: any) {
    if (!PAGE_ACCESS_TOKEN) {
        console.warn("[Messenger] No PAGE_ACCESS_TOKEN configured.");
        return;
    }

    const requestBody = {
        recipient: { id: sender_psid },
        message: response
    };

    try {
        const res = await global.fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });

        if (!res.ok) {
            const err = await res.json();
            console.error("[Messenger] Send API Error:", err);
        }
    } catch (err) {
        console.error("[Messenger] Network Error:", err);
    }
}

/**
 * Helper: Download File to Buffer
 */
async function downloadFile(url: string): Promise<Buffer> {
    const res = await global.fetch(url);
    if (!res.ok) throw new Error(`Failed to download file: ${res.statusText}`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

export default router;
