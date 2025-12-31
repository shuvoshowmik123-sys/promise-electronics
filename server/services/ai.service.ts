import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

// Daktar Vai System Prompt
const DAKTAR_VAI_PROMPT = `
  IDENTITY:
  You are 'Daktar Vai' (দাক্তার ভাই), the AI Head Technician for Promise Electronics in Dhaka, Bangladesh.

  PERSONA:
  - You are helpful, expert, and friendly—like a trusted elder brother.
  - You speak in "Banglish" (Bengali words written in English) mixed with English.
  - You use standard Dhaka slang for repairs (e.g., "Set dead", "Display gese", "Sound nai").
  
  LANGUAGE RULES:
  - Keep technical terms in English (Panel, COF, Circuit, Power Supply).
  - Keep sentences short and chatty.
  - If the user speaks English, reply in English. If they use Bangla/Banglish, reply in Banglish.

  RESTRICTIONS:
  - DO NOT talk about politics, religion, or general news.
  - If asked about non-repair topics, say: "Sorry vai, ami shudhu electronics niye kotha boli."
  - DO NOT give fake price estimates. Say: "Price ta inspect korar por bolte parbo" (I can tell the price after inspection).

  BOOKING GOAL:
  Your main goal is to get the user's details for a home visit.
  Collect these 4 items:
  1. Name
  2. Phone Number
  3. TV Brand & Model
  4. Issue Description

  When you have all 4, output ONLY this JSON:
  { "action": "BOOK_TICKET", "name": "...", "phone": "...", "brand": "...", "issue": "..." }
`;

export const aiService = {
    /**
     * Diagnose server errors and suggest fixes
     */
    async diagnoseError(error: any, context: string) {
        try {
            const prompt = `
        You are a Senior Backend Developer. Analyze this 500 Internal Server Error.
        
        Context: ${context}
        Error: ${JSON.stringify(error, null, 2)}
        
        Output a JSON object with:
        1. "cause": A human-readable explanation of the root cause (max 2 sentences).
        2. "fix": A specific code suggestion or action to fix it.
        3. "severity": "Low", "Medium", or "High".
      `;

            const result = await model.generateContent(prompt);
            const response = result.response;
            const text = response.text();

            // Extract JSON from response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            return jsonMatch ? JSON.parse(jsonMatch[0]) : { cause: "Unknown error", fix: "Check logs", severity: "High" };
        } catch (err) {
            console.error("AI Diagnosis failed:", err);
            return { cause: "AI failed to diagnose", fix: "Check raw logs", severity: "High" };
        }
    },

    /**
     * Suggest the best technician for a job
     */
    async suggestTechnician(jobDescription: string, technicians: any[]) {
        try {
            const prompt = `
        You are a Dispatch Manager. Assign the best technician for this job.
        
        Job: "${jobDescription}"
        
        Technicians:
        ${JSON.stringify(technicians.map(t => ({ id: t.id, name: t.name, role: t.role })), null, 2)}
        
        Output a JSON object with:
        1. "technicianId": The ID of the best match.
        2. "reason": Why they are the best fit (max 1 sentence).
      `;

            const result = await model.generateContent(prompt);
            const response = result.response;
            const text = response.text();

            const jsonMatch = text.match(/\{[\s\S]*\}/);
            return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch (err) {
            console.error("AI Suggestion failed:", err);
            return null;
        }
    },

    /**
     * Analyze visual damage from a photo
     * Returns full structure for Flutter Daktar er Lens assess feature
     */
    async analyzeVisualDamage(base64Image: string) {
        try {
            // Remove data URL prefix if present
            const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");

            const prompt = `
        You are an expert TV and electronics repair technician in Bangladesh.
        Analyze this image of an electronic device/component for damage assessment.
        
        Identify:
        1. The component (e.g., Circuit Board, Screen, Port).
        2. Visible damage (burn marks, cracks, corrosion, loose wires).
        3. Likely cause in English and Bengali.
        4. Severity level and estimated repair cost in BDT.
        
        Output JSON:
        {
          "component": "...",
          "damage": ["damage 1", "damage 2"],
          "likelyCause": "Likely cause in English",
          "likelyCauseBn": "সম্ভাব্য কারণ বাংলায়",
          "severity": "Low|Medium|High",
          "estimatedCostMin": 500,
          "estimatedCostMax": 2000
        }
      `;

            const generateWithModel = async (modelName: string) => {
                const currentModel = genAI.getGenerativeModel({ model: modelName });
                return await currentModel.generateContent([
                    prompt,
                    { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
                ]);
            };

            let result;
            try {
                // Primary: gemini-flash-latest
                result = await generateWithModel("gemini-flash-latest");
            } catch (error) {
                console.warn("Gemini Flash Latest failed, falling back to 2.0 Flash:", error);
                // Fallback: gemini-2.0-flash (Experimental/Rate Limited)
                result = await generateWithModel("gemini-2.0-flash");
            }

            const response = result.response;
            const text = response.text();

            const jsonMatch = text.match(/\{[\s\S]*\}/);
            return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch (err) {
            console.error("AI Visual Analysis failed:", err);
            return null;
        }
    },

    /**
     * Identify an electronic component from a photo
     * Returns full structure for Flutter Daktar er Lens feature
     */
    async identifyPart(base64Image: string) {
        try {
            const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
            const prompt = `
                You are an expert TV and electronics repair technician in Bangladesh.
                Analyze this image and identify the electronic component or issue.
                
                Provide:
                1. Component/Issue name in English (label)
                2. Component/Issue name in Bengali (labelBn)
                3. Confidence level (0.0 to 1.0)
                4. Issue type: one of "power", "display", "audio", "connectivity", "physical", "general"
                5. Description of what you see in English
                6. Description in Bengali (descriptionBn)
                
                Examples:
                - "Power Supply Board" (পাওয়ার সাপ্লাই বোর্ড) - power issue
                - "T-Con Board" (টি-কন বোর্ড) - display issue
                - "Capacitor Bulge" (ক্যাপাসিটর ফোলা) - power issue
                - "HDMI Port" (এইচডিএমআই পোর্ট) - connectivity issue
                - "Cracked Screen" (ভাঙা স্ক্রিন) - physical issue
                
                Output JSON only:
                {
                  "label": "Component/Issue name in English",
                  "labelBn": "উপাদান/সমস্যার নাম বাংলায়",
                  "confidence": 0.95,
                  "issueType": "power|display|audio|connectivity|physical|general",
                  "description": "Brief description of the component or issue in English",
                  "descriptionBn": "সংক্ষিপ্ত বিবরণ বাংলায়",
                  "rawText": "Any additional observations"
                }
            `;

            const currentModel = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
            const result = await currentModel.generateContent([
                prompt,
                { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
            ]);

            const response = result.response;
            const text = response.text();
            const jsonMatch = text.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    label: parsed.label || "Unknown Component",
                    labelBn: parsed.labelBn || "অজানা উপাদান",
                    confidence: parsed.confidence || 0.5,
                    issueType: parsed.issueType || "general",
                    description: parsed.description || "",
                    descriptionBn: parsed.descriptionBn || "",
                    rawText: parsed.rawText || text,
                    boundingBox: null // Could be enhanced with vision bounding box in future
                };
            }

            return {
                label: "Unknown Component",
                labelBn: "অজানা উপাদান",
                confidence: 0,
                issueType: "general",
                description: "",
                descriptionBn: "",
                rawText: text
            };
        } catch (err) {
            console.error("AI Part Identification failed:", err);
            return null;
        }
    },

    /**
     * Read barcode or QR code from image
     */
    async readBarcode(base64Image: string) {
        try {
            const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
            const prompt = `
                Read any barcode or QR code in this image.
                Return the exact value found.
                If it looks like a part number, identify it.
                
                Output JSON:
                {
                  "barcode": "...",
                  "type": "QR_CODE/BARCODE",
                  "partInfo": null
                }
            `;

            const currentModel = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
            const result = await currentModel.generateContent([
                prompt,
                { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
            ]);

            const response = result.response;
            const text = response.text();
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch (err) {
            console.error("AI Barcode Reading failed:", err);
            return null;
        }
    },

    /**
     * Chat with Daktar Vai - Enhanced with multimodal support and user context
     */
    async chatWithDaktarVai(
        message: string,
        history: any[] = [],
        image?: string,
        userContext?: { id?: string; name?: string; phone?: string; address?: string; role?: string }
    ) {
        const MAX_RETRIES = 3;
        const RETRY_DELAYS = [1000, 2000, 5000];

        // Build context-aware system prompt
        const buildContextPrompt = () => {
            let contextInfo = "";
            if (userContext?.name) {
                contextInfo = `
  CURRENT USER CONTEXT:
  - Name: ${userContext.name}
  - Phone: ${userContext.phone || "Not provided"}
  - Address: ${userContext.address || "Not provided"}
  - Role: ${userContext.role || "customer"}
  
  IMPORTANT: This user is logged in. Do NOT ask for their name, phone, or address again.
  When booking, confirm: "Rahim bhai, apnar [address] e pathabo?"
`;
            } else {
                contextInfo = `
  CURRENT USER CONTEXT:
  - Guest user (not logged in)
  
  IMPORTANT: You MUST collect name, phone, and address before booking.
`;
            }
            return DAKTAR_VAI_PROMPT + contextInfo;
        };

        let lastError: any;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const chatModel = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

                // Build message parts (text + optional image)
                const messageParts: any[] = [{ text: message }];

                if (image) {
                    // Remove data URL prefix if present
                    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
                    messageParts.push({
                        inlineData: { data: base64Data, mimeType: "image/jpeg" }
                    });
                }

                const chat = chatModel.startChat({
                    history: [
                        { role: "user", parts: [{ text: buildContextPrompt() }] },
                        { role: "model", parts: [{ text: "Assalamu Alaikum! Ami Daktar Vai. TV niye kono pera nicchen?" }] },
                        ...history
                    ],
                });

                const result = await chat.sendMessage(messageParts);
                const response = result.response.text();

                // Check for booking JSON
                const jsonMatch = response.match(/\{[\s\S]*"action":\s*"BOOK_TICKET"[\s\S]*\}/);

                if (jsonMatch) {
                    try {
                        const bookingData = JSON.parse(jsonMatch[0]);
                        // Merge with user context if available
                        if (userContext) {
                            bookingData.customer_name = bookingData.name || userContext.name;
                            bookingData.phone = bookingData.phone || userContext.phone;
                            bookingData.address = bookingData.address || userContext.address;
                            bookingData.is_guest = false;
                        } else {
                            bookingData.is_guest = true;
                        }
                        return {
                            text: "Dhonnobad! Ticket book kora hoyeche. Amader team ekhuni call korbe.",
                            booking: bookingData
                        };
                    } catch (parseError) {
                        console.error("Failed to parse booking JSON:", parseError);
                    }
                }

                return { text: response, booking: null };

            } catch (error: any) {
                lastError = error;
                console.error(`AI attempt ${attempt + 1} failed:`, error.message);

                // Handle specific error types
                if (error.message?.includes('429')) {
                    console.log(`Rate limited, waiting ${RETRY_DELAYS[attempt]}ms...`);
                    await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
                    continue;
                }

                if (error.message?.includes('403')) {
                    console.error("API key invalid or expired");
                    return {
                        text: "দুঃখিত, service temporarily unavailable. Please try again later.",
                        booking: null,
                        error: true,
                        errorCode: 'AI_API_KEY_INVALID'
                    };
                }

                if (error.message?.includes('500') || error.message?.includes('503')) {
                    await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
                    continue;
                }

                // Try fallback model once
                if (attempt === 0) {
                    try {
                        console.log("Trying fallback model gemini-2.0-flash...");
                        const fallbackModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
                        const messageParts: any[] = [{ text: message }];
                        if (image) {
                            const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
                            messageParts.push({
                                inlineData: { data: base64Data, mimeType: "image/jpeg" }
                            });
                        }
                        const chat = fallbackModel.startChat({
                            history: [
                                { role: "user", parts: [{ text: buildContextPrompt() }] },
                                { role: "model", parts: [{ text: "Assalamu Alaikum! Ami Daktar Vai." }] },
                                ...history
                            ],
                        });
                        const result = await chat.sendMessage(messageParts);
                        return { text: result.response.text(), booking: null };
                    } catch (fallbackError) {
                        console.error("Fallback model also failed:", fallbackError);
                    }
                }
            }
        }

        // All retries exhausted
        console.error("All AI retries failed:", lastError);
        return {
            text: "দুঃখিত, আমার brain এ একটু problem হচ্ছে। একটু পরে আবার try করুন।",
            booking: null,
            error: true,
            errorCode: 'AI_SERVICE_UNAVAILABLE'
        };
    }
};

