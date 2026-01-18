import { Router } from "express";
import { aiService } from "../services/ai.service.js";
import { storage } from "../storage.js";
import { db } from "../db.js";
import { users, aiInsights, diagnosisTrainingData, jobTickets } from "../../shared/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { aiLimiter } from "./middleware/rate-limit.js";

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

// POST /api/ai/inspect (rate limited - 30/hour)
router.post("/inspect", aiLimiter, async (req, res) => {
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

// POST /api/ai/chat - Enhanced with multimodal and auto-booking (rate limited - 30/hour)
router.post("/chat", aiLimiter, async (req, res) => {
    try {
        const { message, image, history, userId, modelType } = req.body;

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
        console.log("[AI Context Debug] Request received. Session ID:", req.sessionID);
        console.log("[AI Context Debug] Session Customer:", (req.session as any)?.customer);
        console.log("[AI Context Debug] Req User:", req.user);

        let userContext: { id?: string; name?: string; phone?: string; address?: string; role?: string } | undefined = undefined;

        // Try to get from session first (for logged-in users)
        if ((req.session as any).customer) {
            const customer = (req.session as any).customer;
            userContext = {
                id: customer.id,
                name: customer.name || undefined,
                phone: customer.phone,
                address: customer.address || undefined,
                role: customer.role || 'Customer'
            };
        }
        // Fallback: Check for customerId in session (Standard login sets this)
        else if ((req.session as any).customerId) {
            try {
                const customer = await storage.getUser((req.session as any).customerId);
                if (customer) {
                    console.log("[AI Context Debug] Found customer via ID:", customer.phone);
                    userContext = {
                        id: customer.id,
                        name: customer.name || undefined,
                        phone: customer.phone,
                        address: customer.address || undefined,
                        role: customer.role || 'Customer'
                    };
                }
            } catch (err) {
                console.error("[AI Context Debug] Failed to fetch customer:", err);
            }
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
                    userContext = {
                        id: customer.id,
                        name: customer.name,
                        phone: customer.phone || undefined,
                        address: customer.address || undefined,
                        role: "customer"
                    };
                }
            } catch (dbError) {
                console.error("Failed to fetch user context:", dbError);
                // Continue without context - not fatal
            }
        }

        // Fetch business data (Settings for everyone, Stats for Admin)
        let businessData: any = {};

        try {
            // Always fetch shop settings for Daktar Vai context
            const settings = await storage.getAllSettings();
            const shopSettings = settings.reduce((acc, curr) => {
                acc[curr.key] = curr.value;
                return acc;
            }, {} as Record<string, any>);

            businessData.settings = shopSettings;

            // If Admin, fetch additional stats
            if (modelType === 'admin') {
                const [stats, overview] = await Promise.all([
                    storage.getDashboardStats(),
                    storage.getJobOverview()
                ]);
                businessData.stats = stats;
                businessData.overview = overview;
            }
        } catch (err) {
            console.error("Failed to fetch business data for AI context:", err);
        }

        // Check for existing pending ticket for this user context
        let existingTicket: any = null;
        if (userContext) {
            try {
                const { serviceRequests } = await import("../../shared/schema.js");
                const [ticket] = await db
                    .select()
                    .from(serviceRequests)
                    .where(and(
                        userContext.phone ? eq(serviceRequests.phone, userContext.phone) : undefined,
                        eq(serviceRequests.status, "Pending"),
                        // We can also check customerId if available, but phone is often more reliable for chat
                        userContext.id ? eq(serviceRequests.customerId, userContext.id) : undefined
                    ))
                    .orderBy(desc(serviceRequests.createdAt))
                    .limit(1);

                if (ticket) {
                    existingTicket = ticket;
                }
            } catch (err) {
                console.error("Failed to check existing tickets:", err);
            }
        }

        // Call AI service with all parameters, including existing ticket
        const response = await aiService.chatWithDaktarVai(
            message || "Please analyze this image",
            history || [],
            image,
            userContext,
            modelType,
            businessData,
            existingTicket
        );

        // Check for error responses from AI - only 503 if completely unavailable
        if (response.error && response.errorCode === 'AI_SERVICE_UNAVAILABLE') {
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
                const bookingData = response.booking as any;

                let ticket: any;
                let isUpdate = false;

                // Smart Booking Logic: Update if existing pending ticket found AND it seems to be the same item
                // We define "same item" as: Same Brand AND Same Primary Issue
                const isSameItem = existingTicket &&
                    (!bookingData.brand || existingTicket.brand === bookingData.brand) &&
                    (!bookingData.issue || existingTicket.primaryIssue === bookingData.issue);

                if (existingTicket && isSameItem) {
                    isUpdate = true;
                    // Update existing ticket
                    const [updatedTicket] = await db
                        .update(serviceRequests)
                        .set({
                            // Allow updating specific fields if provided, else keep existing
                            customerName: bookingData.customer_name || existingTicket.customerName,
                            phone: bookingData.phone || existingTicket.phone,
                            brand: bookingData.brand || existingTicket.brand,
                            // Primary Issue is the Category (e.g. Display Issue)
                            primaryIssue: bookingData.issue || existingTicket.primaryIssue,
                            // Description is the User's words
                            description: bookingData.description
                                ? `${existingTicket.description}\n[Update]: ${bookingData.description}`
                                : existingTicket.description,
                            address: bookingData.address || existingTicket.address
                        })
                        .where(eq(serviceRequests.id, existingTicket.id))
                        .returning();

                    ticket = updatedTicket;
                    console.log("Existing Pending Ticket updated:", ticket.id);

                } else {
                    // Create NEW ticket (Standard Flow)

                    // Attempt to link to existing customer by phone if not logged in
                    let customerIdToLink = userContext?.id;
                    if (!customerIdToLink && bookingData.phone) {
                        const user = await storage.getUserByPhoneNormalized(bookingData.phone);
                        if (user) {
                            customerIdToLink = user.id;
                        }
                    }

                    // Use storage method to handle ID generation, ticket number, and timeline creation
                    ticket = await storage.createServiceRequest({
                        customerName: bookingData.customer_name,
                        phone: bookingData.phone,
                        address: bookingData.address || null,
                        primaryIssue: bookingData.issue || "Other", // Default to Other if AI fails
                        description: bookingData.description || `AI Chat Booking: ${bookingData.issue}`,
                        brand: bookingData.brand || "Unknown",
                        status: "Pending",
                        customerId: customerIdToLink,
                    });
                    console.log("Auto-booking created:", ticket.id);
                }

                (response as any).ticketData = ticket;
                (response as any).bookingType = isUpdate ? "updated" : "created";

                // If AI didn't explicitly mention it's an update, we might want to hint frontend (optional)
                // but usually the AI text response will cover it if prompt is good.

            } catch (bookingError: any) {
                console.error("Auto-booking failed:", bookingError);
                response.text += "\n\n⚠️ Booking e ektu problem hoyeche. Please call: 01711-XXXXXX";
                (response as any).bookingError = true;
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


// GET /api/ai/morning-brief (Cron only)
router.get("/morning-brief", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        // Calculate stats (simplified for now)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);

        // Placeholder stats - replace with actual DB aggregation later
        const stats = {
            totalJobs: 15,
            completedJobs: 12,
            pendingJobs: 3,
            revenue: 25000,
            topIssues: [{ issue: "Backlight", count: 5 }],
            technicianPerformance: [{ name: "Rahim", jobsCompleted: 5 }],
            lowStockItems: []
        };

        const insights = await aiService.generateMorningBrief(stats);

        if (insights) {
            await db.insert(aiInsights).values([
                { type: 'red', ...insights.red },
                { type: 'green', ...insights.green },
                { type: 'blue', ...insights.blue },
            ]);
        }

        res.json({ success: true, insights });
    } catch (error) {
        console.error("Morning brief error:", error);
        res.status(500).json({ error: "Failed to generate brief" });
    }
});

// GET /api/ai/insights
router.get("/insights", async (req, res) => {
    try {
        const data = await db.select().from(aiInsights).orderBy(desc(aiInsights.createdAt)).limit(10);
        res.json({ insights: data });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch insights" });
    }
});

// POST /api/ai/feedback
router.post("/feedback", async (req, res) => {
    try {
        await db.insert(diagnosisTrainingData).values(req.body);
        res.json({ success: true });
    } catch (error) {
        console.error("Feedback error:", error);
        res.status(500).json({ error: "Failed to save feedback" });
    }
});

// GET /api/ai/debug-suggestions
router.get("/debug-suggestions", requireStaff, async (req, res) => {
    try {
        const { aiDebugSuggestions } = await import("../../shared/schema.js");
        const suggestions = await db.select().from(aiDebugSuggestions).orderBy(desc(aiDebugSuggestions.createdAt)).limit(50);
        res.json(suggestions);
    } catch (error) {
        console.error("Fetch debug suggestions error:", error);
        res.status(500).json({ error: "Failed to fetch suggestions" });
    }
});

// PATCH /api/ai/debug-suggestions/:id
router.patch("/debug-suggestions/:id", requireStaff, async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const { aiDebugSuggestions } = await import("../../shared/schema.js");

        await db.update(aiDebugSuggestions)
            .set({ status })
            .where(eq(aiDebugSuggestions.id, parseInt(id)));

        res.json({ success: true });
    } catch (error) {
        console.error("Update debug suggestion error:", error);
        res.status(500).json({ error: "Failed to update suggestion" });
    }
});

export default router;
