import { Router, Request, Response } from "express";
import { aiService } from "../services/ai.service.js";
import { storage } from "../storage.js";
import ImageKit from "imagekit";
import { JobTicket, ServiceRequest } from "../../shared/schema.js";

const router = Router();

// Configuration
const VERIFY_TOKEN = process.env.MESSENGER_VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.MESSENGER_PAGE_ACCESS_TOKEN;

// Initialize ImageKit
const imagekit = new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY || "",
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "",
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || "",
});

// In-memory session store for Messenger users (Simple Map for history)
// Key: PSID (Page Scoped ID), Value: Chat History Array
const userSessions = new Map<string, any[]>();

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
        // Just a health check if accessed directly
        res.json({ status: "Messenger Webhook Active" });
    }
});

/**
 * Handle Incoming Messages
 */
router.post("/webhook", async (req: Request, res: Response) => {
    const body = req.body;

    if (body.object === "page") {
        // Iterate over each entry - there may be multiple if batched
        for (const entry of body.entry) {
            const webhook_event = entry.messaging[0];
            // console.log("Webhook Event:", webhook_event);

            const sender_psid = webhook_event.sender.id;

            if (webhook_event.message) {
                await handleMessage(sender_psid, webhook_event.message);
            } else if (webhook_event.postback) {
                await handlePostback(sender_psid, webhook_event.postback);
            }
        }

        res.status(200).send("EVENT_RECEIVED");
    } else {
        res.sendStatus(404);
    }
});

/**
 * Handle Message Logic
 */
async function handleMessage(sender_psid: string, message: any) {
    let replyText = "";
    let imageAnalysis: any = null;

    // Get or initialize history
    const history = userSessions.get(sender_psid) || [];

    // Update history with user's message (placeholder)
    // Real history update happens after we process the content

    try {
        // 1. Handle Audio (Voice Note)
        if (message.attachments && message.attachments[0].type === "audio") {
            const audioUrl = message.attachments[0].payload.url;
            console.log(`[Messenger] Received audio from ${sender_psid}`);

            const audioBuffer = await downloadFile(audioUrl);
            const transcribedText = await aiService.transcribeAudio(audioBuffer);

            if (transcribedText) {
                console.log(`[Messenger] Transcribed: "${transcribedText}"`);
                // Treat as text message now
                const response = await aiService.chatWithDaktarVai(
                    transcribedText,
                    history,
                    undefined, // no image
                    { name: "Messenger User", role: "customer" } // Context
                );

                await processAIResponse(sender_psid, response, history);
                return;
            } else {
                await callSendAPI(sender_psid, { text: "দুঃখিত, আমি আপনার ভয়েস বুঝতে পারিনি। দয়া করে লিখে জানান।" });
                return;
            }
        }

        // 2. Handle Image
        if (message.attachments && message.attachments[0].type === "image") {
            const imageUrl = message.attachments[0].payload.url;
            console.log(`[Messenger] Received image from ${sender_psid}`);

            // Upload to ImageKit to get a permanent URL (Messenger URLs expire)
            // Also we need the file for AI analysis.
            // aiService can handle URL or base64. Let's download to buffer first.
            const imageBuffer = await downloadFile(imageUrl);
            const base64Image = imageBuffer.toString("base64");

            // Upload to ImageKit
            const uploadResult = await imagekit.upload({
                file: base64Image,
                fileName: `messenger-${sender_psid}-${Date.now()}.jpg`,
                folder: 'messenger_uploads'
            });

            const permanentUrl = uploadResult.url;

            // Verify/Analyze with AI
            const response = await aiService.chatWithDaktarVai(
                "Here is an image of my problem.", // Implicit prompt
                history,
                base64Image,
                { name: "Messenger User", role: "customer" }
            );

            // Attach the permanent URL to the booking if it exists
            if (response.booking) {
                (response.booking as any).imageUrl = permanentUrl;
            }

            await processAIResponse(sender_psid, response, history);
            return;
        }

        // 3. Handle Text
        if (message.text) {
            console.log(`[Messenger] Received text: "${message.text}"`);
            const response = await aiService.chatWithDaktarVai(
                message.text,
                history,
                undefined,
                { name: "Messenger User", role: "customer" }
            );

            await processAIResponse(sender_psid, response, history);
        }

    } catch (error) {
        console.error("[Messenger] Error handling message:", error);
        await callSendAPI(sender_psid, { text: " দুঃখিত, একটি সমস্যা হয়েছে। দয়া করে পরে আবার চেষ্টা করুন।" });
    }
}

async function handlePostback(sender_psid: string, received_postback: any) {
    // Handle 'Get Started' or other buttons if implemented
    const payload = received_postback.payload;
    if (payload === 'GET_STARTED') {
        const response = await aiService.chatWithDaktarVai(
            "Hello",
            [],
            undefined,
            { name: "New User", role: "customer" }
        );
        await processAIResponse(sender_psid, response, []);
    }
}

/**
 * Process AI Response & Handle Bookings
 */
async function processAIResponse(sender_psid: string, response: any, history: any[]) {
    // Add to history
    // history.push({ role: "user", content: ... }); // logic omitted for brevity, keeping simple
    // history.push({ role: "model", content: response.text });

    // Send the text response
    await callSendAPI(sender_psid, { text: response.text });

    // Handle Booking Action
    if (response.booking && response.booking.action === "BOOK_TICKET") {
        try {
            const booking = response.booking;
            console.log("[Messenger] Creating Service Request:", booking);

            // Create Service Request in DB
            const newRequest = await storage.createServiceRequest({
                brand: booking.brand,
                primaryIssue: booking.issue,
                description: booking.description || "Via Messenger",
                customerName: booking.customer_name || "Messenger User",
                phone: booking.phone || "N/A", // AI should have collected this
                address: booking.address,
                mediaUrls: (booking as any).imageUrl ? JSON.stringify([(booking as any).imageUrl]) : null,
                status: "Pending",
                trackingStatus: "Request Received",
                source: "Facebook Messenger" // Custom field if schema allows, otherwise put in description
            } as any);

            // Send Confirmation
            const ticketMsg = `✅ আপনার টিকিট কনফার্ম হয়েছে!\nTicket ID: ${newRequest.ticketNumber}\nআমরা শীঘ্রই আপনার সাথে যোগাযোগ করব।`;
            await callSendAPI(sender_psid, { text: ticketMsg });

        } catch (err) {
            console.error("[Messenger] Failed to create ticket:", err);
            await callSendAPI(sender_psid, { text: "⚠️ দুঃখিত, টিকিট জেনারেট করতে সমস্যা হচ্ছে। আমাদের হটলাইনে কল করুন।" });
        }
    }

    // Update session store
    userSessions.set(sender_psid, history);
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
        recipient: {
            id: sender_psid
        },
        message: response
    };

    try {
        const fetch = (await import("node-fetch")).default; // Dynamic import for node-fetch if in CommonJS, or standard fetch in Node 18+
        // In newer Node, fetch is global. Let's try global fetch first.

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
