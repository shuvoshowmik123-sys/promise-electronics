import { Router } from "express";
import { aiService } from "../services/ai.service.js";
import { db } from "../db.js";
import { users } from "../../shared/schema.js";
import { eq, and } from "drizzle-orm";

const router = Router();

// Middleware to check if user is admin/staff
const requireStaff = (req: any, res: any, next: any) => {
    if (!req.user || req.user.role === "Customer") {
        return res.status(403).json({ message: "Access denied" });
    }
    next();
};

// POST /api/ai/suggest-tech
router.post("/suggest-tech", requireStaff, async (req, res) => {
    try {
        const { jobDescription } = req.body;

        if (!jobDescription) {
            return res.status(400).json({ message: "Job description is required" });
        }

        // Fetch active technicians
        const technicians = await db
            .select({
                id: users.id,
                name: users.name,
                role: users.role,
            })
            .from(users)
            .where(and(eq(users.role, "Technician"), eq(users.status, "Active")));

        if (technicians.length === 0) {
            return res.status(404).json({ message: "No active technicians found" });
        }

        const suggestion = await aiService.suggestTechnician(jobDescription, technicians);
        res.json(suggestion);
    } catch (error) {
        console.error("Tech suggestion error:", error);
        res.status(500).json({ message: "Failed to suggest technician" });
    }
});

// POST /api/ai/inspect
router.post("/inspect", async (req, res) => {
    try {
        const { image } = req.body;

        if (!image) {
            return res.status(400).json({ message: "Image is required" });
        }

        const diagnosis = await aiService.analyzeVisualDamage(image);

        if (!diagnosis) {
            return res.status(500).json({ message: "Failed to analyze image" });
        }

        res.json(diagnosis);
    } catch (error) {
        console.error("Visual inspection error:", error);
        res.status(500).json({ message: "Failed to perform visual inspection" });
    }
});

// POST /api/ai/chat - Enhanced with multimodal and auto-booking
router.post("/chat", async (req, res) => {
    try {
        const { message, image, history, userId } = req.body;

        // Input validation
        if (!message && !image) {
            return res.status(400).json({
                error: "INVALID_INPUT",
                message: "Message or image is required"
            });
        }

        if (message && message.length > 5000) {
            return res.status(400).json({
                error: "MESSAGE_TOO_LONG",
                message: "Message must be under 5000 characters"
            });
        }

        if (image && image.length > 10_000_000) {
            return res.status(400).json({
                error: "IMAGE_TOO_LARGE",
                message: "Image must be under 5MB"
            });
        }

        // Get user context from session or userId
        let userContext = null;

        // Try to get from session first (for logged-in users)
        if (req.session?.customer) {
            userContext = {
                id: req.session.customer.id,
                name: req.session.customer.name,
                phone: req.session.customer.phone,
                address: req.session.customer.address,
                role: "customer"
            };
        }

        // Or fetch by userId if provided
        if (!userContext && userId) {
            try {
                const [customer] = await db
                    .select({
                        id: users.id,
                        name: users.name,
                        phone: users.phone,
                        address: users.address,
                    })
                    .from(users)
                    .where(eq(users.id, userId))
                    .limit(1);

                if (customer) {
                    userContext = { ...customer, role: "customer" };
                }
            } catch (dbError) {
                console.error("Failed to fetch user context:", dbError);
                // Continue without context - not fatal
            }
        }

        // Call AI service with all parameters
        const response = await aiService.chatWithDaktarVai(
            message || "Please analyze this image",
            history || [],
            image,
            userContext
        );

        // Check for error responses from AI
        if (response.error) {
            return res.status(503).json({
                error: response.errorCode,
                message: response.text,
                retryAfter: 30
            });
        }

        // Handle auto-booking if AI detected booking intent
        if (response.booking) {
            try {
                // Import serviceRequests schema if needed
                const { serviceRequests } = await import("../../shared/schema.js");

                const [ticket] = await db.insert(serviceRequests).values({
                    customerName: response.booking.customer_name || response.booking.name,
                    phone: response.booking.phone,
                    address: response.booking.address || null,
                    primaryIssue: response.booking.issue || response.booking.symptom || "AI Diagnosed Issue",
                    description: `AI Chat Booking: ${response.booking.issue || response.booking.symptom}`,
                    brand: response.booking.brand || "Unknown",
                    status: "Pending",
                    // source: "AI_CHAT" // Add this field to schema if needed
                }).returning();

                response.ticketData = ticket;
                console.log("Auto-booking created:", ticket.id);

            } catch (bookingError: any) {
                console.error("Auto-booking failed:", bookingError);
                response.text += "\n\n⚠️ Booking e ektu problem hoyeche. Please call: 01711-XXXXXX";
                response.bookingError = true;
            }
        }

        res.json(response);

    } catch (error: any) {
        console.error("Chat endpoint error:", error);
        res.status(500).json({
            error: "INTERNAL_ERROR",
            message: "Sorry, something went wrong. Please try again."
        });
    }
});

export default router;
