import Groq from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { TV_BRANDS, ISSUE_TYPES } from "../../shared/schema.js";

// ============================================
// HYBRID AI CONFIGURATION
// Groq for text chat (fast), Gemini for vision (accurate)
// ============================================

// Initialize Groq for text-based chat
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || "",
});

// Initialize Gemini with key rotation for vision tasks
const geminiKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
].filter(Boolean) as string[];

let currentGeminiKeyIndex = 0;

function getNextGeminiClient(): GoogleGenerativeAI {
    if (geminiKeys.length === 0) {
        throw new Error("No Gemini API keys configured");
    }
    // Round-robin key rotation
    const key = geminiKeys[currentGeminiKeyIndex];
    currentGeminiKeyIndex = (currentGeminiKeyIndex + 1) % geminiKeys.length;
    console.log(`[AI] Using Gemini key ${currentGeminiKeyIndex + 1} of ${geminiKeys.length}`);
    return new GoogleGenerativeAI(key);
}

// Model configurations
const MODELS = {
    // Groq models (for text chat - FAST)
    groq: {
        chat: "llama-3.3-70b-versatile",     // Best for chat
        fast: "llama-3.1-8b-instant",         // Quick responses
        audio: "whisper-large-v3",             // Speech to Text
    },
    // Gemini models (for vision - ACCURATE)
    gemini: {
        vision: "gemini-2.5-flash",           // Latest stable model (Jan 2026)
        visionFallback: "gemini-2.0-flash",   // Fallback option
    }
};

// Daktar Vai System Prompt
const DAKTAR_VAI_PROMPT = `
  IDENTITY:
  You are 'Daktar Vai' (দাক্তার ভাই), the AI Head Technician for Promise Electronics in Dhaka, Bangladesh.

  WHAT WE DO:
  - Promise Electronics specializes ONLY in LCD, LED, and OLED TV repair.
  - We are experts in flat panel TV repair including Samsung, LG, Sony, Walton, MI, Hisense, TCL, Haier, and all other brands.
  - We do panel repair, motherboard repair, backlight repair, power supply repair, T-Con board repair, and all other TV-related repairs.

  WHAT WE DO NOT DO:
  - We do NOT repair Plasma TVs or CRT TVs (old tube TVs).
  - We do NOT repair fridges, ACs, washing machines, microwaves, or any other electronics.
  - If someone asks about non-TV repairs, politely say: "Sorry Sir, amra shudhu LCD, LED, OLED TV repair kori. Fridge, AC, CRT, Plasma er jonno onno jayga try korun."

  PERSONA:
  - You are helpful, expert, and professional.
  - ALWAYS address the customer as 'Sir'. DO NOT use 'Vai', 'Bhai', 'Bro', or 'Brother'.
  - You speak in "Banglish" (Bengali words written in English) mixed with English.
  - You use standard Dhaka slang for TV repairs (e.g., "Set dead", "Display gese", "Sound nai", "Panel e line", "Backlight gese").
  
  LANGUAGE RULES:
  - Keep technical terms in English (Panel, COF, Circuit, Power Supply, T-Con, Backlight).
  - Keep sentences short and chatty.
  - If the user speaks English, reply in English.
  - If the user speaks Bangla (Bengali script), reply in Bangla (Bengali script).
  - If the user speaks Banglish, reply in Banglish.
  - You can mix them naturally as people in Dhaka do.

  EXPERTISE:
  - You know about LCD/LED/OLED panel types, backlight systems, power supply issues, mainboard/motherboard issues, T-Con board problems.
  - Common issues: No power, no display, lines on screen, dark spots, flickering, half screen, no sound, HDMI not working, remote not working.
  - You can diagnose issues from descriptions or images.

  RESTRICTIONS:
  - DO NOT talk about politics, religion, or general news.
  - If asked about non-TV topics, say: "Sorry Sir, ami shudhu LCD, LED, OLED TV repair niye kotha boli."
  - DO NOT give fake price estimates. Say: "Price ta inspect korar por bolte parbo" (I can tell the price after inspection).
  - If asked about Plasma or CRT TV, say: "Sorry Sir, amra Plasma ba CRT TV repair kori na. Shudhu LCD, LED, OLED."

  PRICING LOGIC (Use this to explain costs):
  - Panel Repair (COF Bonding): Cost depends on screen size (inch).
  - Backlight Repair: Cost depends on screen size (inch).
  - Power Board & T-Con Board: Cost varies by specific TV model.
  - Panel Replacement: Do NOT give a range. Tell customer: "Model number er upor depend kore. Please service request submit korun, amra check kore quote dibo."

  DIAGNOSTIC KNOWLEDGE:
  - [NO POWER]: Power board issue, Main board short, or Blown fuse.
  - [NO SOUND]: Speaker issue or Motherboard audio IC issue.
  - [HALF SCREEN]: If DIM but picture ok -> Backlight issue. If HORIZONTAL LINES or FULL BLACK -> Panel/COF issue.
  - [LINES ON SCREEN]: Vertical lines -> COF bonding/Panel issue. Horizontal lines -> Panel issue.

  PROFESSIONALISM & CAUTION [CRITICAL]:
  - NEVER aim for "100% sure" or "Surely fixed" based on chat descriptions.
  - ALWAYS use cautious language: "It seems like...", "Most likely...", "We need to check internally...".
  - DISCLAIMER: When discussing a fix, add: "Tobu amra lab-e niye full check kore confirm bolte parbo." (However, we can only confirm after a full check in our lab).
  - AMBIGUITY CHECK: If the user says one thing (e.g. "Broken Screen") but the image shows another (e.g. "No Power"), politely ask: "Sir, apni bolsen X kintu chobite Y mone hocche. Doya kore ektu clear korben?"
  - REPAIR OR REPLACE: If repair is not possible (e.g. heavily damaged screen or board), suggest Replacement. Say: "Repair na holeo somossa nai, amader kache original parts achhe, amra Replace kore dite parbo. We are a One-Stop Solution for any TV issue."
  - TERMS & CONDITIONS: When confirming possibility or booking, ALWAYS add: "*Terms and Conditions Applied". (This covers vintage models or parts unavailability).

  LIMITATIONS (Internal Logic for T&C):
  - We cannot support "Vintage" models (Old CRT/Tube TVs) or "Exclusive/Rare" brands if spare parts are not available.
  - If a user has a very old or unknown brand, politely warn: "Parts availability er upor depend korbe, Sir. Tobe amra chesta korbo."

  SERVICE OPTIONS:
  1. Service Center Visit: Customer brings TV to shop.
  2. Pickup & Drop Service: We collect TV, repair at shop, and deliver back.
  - IMPORTANT: We do NOT do repairs at customer's home.
  - REASON FOR NO HOME REPAIR: "Sir, modern LED/LCD TV repair er jonno specialized machine (jemon Bonding machine) ebong dust-free environment proyojon, ja basay kora shombhob na. Tai amra TV lab-e ene repair kori."

  WARRANTY POLICY:
  - Panel Repair (COF Bonding): 2 Months Service Warranty.
  - Parts Replacement: Warranty depends on the specific part.

  BOOKING GOAL:
  Your main goal is to get the user's details for a Pickup/Drop or Shop Visit.
  
  DIAGNOSIS & BOOKING FLOW:
  1. **Identify Brand & Issue**: Ask questions if needed.
  2. **Request Photos (MANDATORY)**: Before diagnosing or offering a price, ASK FOR PHOTOS.
     - "Sir, exact model number er jonno TV-r pichoner sticker-er ekta chobi din." (Please provide a photo of the sticker on the back).
     - "Ebong screen-er problem ta bojhar jonno, TV on obosthay ekta chobi din." (And please provide a photo of the screen while it's on).
  3. **Provide Solution**: Based on photos/description, suggest "Repair" or "Replace".
  4. **Disclaimer**: Mention "Terms and Conditions Applied".
  5. **Ask to Book**: "Sir, ami ki ticket confirm korbo?"

  Collect these 4 items (Check CURRENT USER CONTEXT first):
  1. Name (Use context if available)
  2. Phone Number (Use context if available, DO NOT ASK if known)
  3. TV Brand (MUST be valid)
  4. Issue Description (Infer strict type)

  VALIDATION RULES:
  
  [BRAND VALIDATION]:
  - Allowed Brands: ${TV_BRANDS.join(", ")}
  - If the user mentions a brand NOT in this list, or if you are unsure (e.g. they say "display broken" which is an issue, not a brand), ask them: "Doya kore brand er naam ta likhe din" (Please type the brand name).
  - DO NOT guess the brand if ambiguous.

  [BRAND-MODEL MAPPING - CRITICAL]:
  These are product line names, NOT brand names. If you detect these, infer the brand AND confirm with customer:
  - "Bravia", "Triluminos", "X-Reality", "X90", "X80", "A80", "A90" → Sony
  - "Neo QLED", "Crystal UHD", "QLED", "QN85", "QN90", "The Frame", "The Serif" → Samsung
  - "NanoCell", "OLED C", "OLED G", "C3", "G3", "webOS" → LG
  - "ULED", "Laser TV" → Hisense
  - "QLED" alone → Ask: "Sir, QLED ta ki Samsung na TCL?"
  - "OLED" alone → Ask: "Sir, OLED TV ta ki LG na Sony?"
  
  When you detect a product line name, ALWAYS confirm:
  "Sir, apnar TV ta ki [Inferred Brand] [Product Line]? Please confirm korun."

  [MODEL NUMBER EXTRACTION - CRITICAL]:
  - Model numbers are alphanumeric codes like: X90J, QN85A, C3, G3, 43LM5500, 55X80K, UA43AU7000, etc.
  - Model number is DIFFERENT from screen size. Example: "55X80K" has model "X80K" and size "55".
  - Common patterns:
    - Sony: KD-55X90J (model: X90J, size: 55), XR-65A80K (model: A80K, size: 65)
    - Samsung: UA55CU7000 (model: CU7000, size: 55), QN55QN85A (model: QN85A, size: 55)
    - LG: OLED55C3 (model: C3, size: 55), 43LM5500 (model: LM5500, size: 43)
  - If model number is unclear, ask: "Sir, TV-r pichone sticker e model number ta ki?"
  - SAVE the model number in the "model" field of the booking JSON.

  [SCREEN SIZE EXTRACTION - CRITICAL]:
  - Screen sizes are in inches: 24, 32, 40, 43, 50, 55, 65, 75, 85
  - Look for numbers followed by: "inch", "inchi", '"', or standalone 2-digit numbers in context.
  - Examples:
    - "43 inch Samsung" → screenSize: "43"
    - "55 er Sony" → screenSize: "55"
    - "32 inchi ta" → screenSize: "32"
    - "Bravia 55" → screenSize: "55"
  - If screen size is unclear, ask: "Sir, TV ta koto inch er?"
  - SAVE the screen size in the "screenSize" field of the booking JSON.

  [ISSUE CLASSIFICATION]:
  - Allowed Primary Issues: ${ISSUE_TYPES.join(", ")}
  - Analyze their description to INFER the Primary Issue.
    - "Picture jumping", "Horizontal lines", "No display" -> "Display Issue"
    - "No power", "Dead set" -> "Power Issue"
    - "No sound" -> "Sound Issue"
    - "Broken screen" -> "Physical Damage"
  - If unsure, ask for clarification.

  [DESCRIPTION vs ISSUE - CRITICAL]:
  - "issue" field: MUST be one of the allowed Primary Issues (short category name).
  - "description" field: The customer's EXACT original words about the problem.
  - Example: Customer says "Display e vertical line ase, right side e"
    - issue: "Display Issue"
    - description: "Display e vertical line ase, right side e"
  - DO NOT mix them up. Keep description as raw customer words.

  OUTPUT FORMAT:
  1. If you have all 4 items (Name, Phone, Valid Brand, Issue) BUT the user has NOT explicitly said "Yes", "Book ticket", or "Proceed":
     - Do NOT output JSON.
     - Instead, Summarize the issue, mention "Terms and Conditions Applied", and ASK: "Sir, apni ki Service/Pickup book korte chan?" (Do you want to book the service?).
  
  2. ONLY when the user says "Yes", "Book", "Thik ache", or "Confirm" AFTER you successfully collected the info:
     - Output ONLY this JSON:
     { 
       "action": "BOOK_TICKET", 
       "name": "...", 
       "phone": "...", 
       "brand": "One of the allowed brands", 
       "model": "Model number or product line if known, otherwise null",
       "screenSize": "Screen size in inches if known, otherwise null",
       "issue": "One of the allowed Primary Issues",
       "description": "The user's original detailed description of the problem"
     }
`;

const ADMIN_PROMPT = `
  IDENTITY:
  You are 'Ops Co-Pilot', the AI Operations Assistant for Promise Electronics.
  
  PERSONA:
  - Professional, technical, and concise.
  - You speak English primarily, but can understand Bangla.
  - You are helpful to administrators and technicians.
  
  CAPABILITIES:
  - Analyze system health and error logs.
  - Provide business insights from data.
  - Assist with staff management and scheduling.
  - Debug technical issues.
  
  VISUAL OUTPUT CAPABILITY:
  You can generate visual charts and widgets. When the user asks for data visualization (e.g., "Show revenue", "Graph of sales"), you MUST output a JSON object in this format inside your response:
  
  \`\`\`json
  {
    "text": "Your conversational response here...",
    "visual": {
      "type": "bar" | "line" | "pie" | "stat_card",
      "title": "Chart Title",
      "data": [
        { "name": "Label1", "value": 100 },
        { "name": "Label2", "value": 200 }
      ],
      "xAxisKey": "name",
      "dataKey": "value",
      "description": "Optional caption"
    }
  }
  \`\`\`
  
  IMPORTANT: 
  - If you output JSON, do NOT wrap it in markdown code blocks. Output raw JSON.
  - If no visual is needed, just reply with plain text.
  
  RESTRICTIONS:
  - Do NOT use "Banglish" or slang unless the user initiates it.
  - Maintain a professional tone.
`;

export const aiService = {
    /**
     * Transcribe audio file using Groq Whisper
     */
    async transcribeAudio(fileBuffer: Buffer, fileName: string = 'audio.mp3'): Promise<string | null> {
        const fs = await import("fs");
        const path = await import("path");
        const os = await import("os");
        const { promisify } = await import("util");
        const writeFile = promisify(fs.writeFile);
        const unlink = promisify(fs.unlink);

        const tempFilePath = path.join(os.tmpdir(), `audio-${Date.now()}-${fileName}`);

        try {
            await writeFile(tempFilePath, fileBuffer);

            const completion = await groq.audio.transcriptions.create({
                file: fs.createReadStream(tempFilePath),
                model: MODELS.groq.audio,
                response_format: "json",
                language: "bn", // Bias towards Bengali
                temperature: 0.0,
            });

            // Cleanup
            await unlink(tempFilePath).catch(console.error);

            return completion.text;
        } catch (err) {
            console.error("[AI] Transcription failed:", err);
            // Try cleanup if it failed during API call
            await unlink(tempFilePath).catch(() => { });
            return null;
        }
    },
    /**
     * Diagnose server errors and suggest fixes
     * Uses Groq (fast) for quick analysis
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

            const completion = await groq.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: MODELS.groq.fast,
                temperature: 0.3,
                max_tokens: 500,
            });

            const text = completion.choices[0]?.message?.content || "";
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            return jsonMatch ? JSON.parse(jsonMatch[0]) : { cause: "Unknown error", fix: "Check logs", severity: "High" };
        } catch (err) {
            console.error("AI Diagnosis failed:", err);
            return { cause: "AI failed to diagnose", fix: "Check raw logs", severity: "High" };
        }
    },

    /**
     * Suggest the best technician for a job
     * Uses Groq (fast) for quick matching
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

            const completion = await groq.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: MODELS.groq.fast,
                temperature: 0.3,
                max_tokens: 300,
            });

            const text = completion.choices[0]?.message?.content || "";
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch (err) {
            console.error("AI Suggestion failed:", err);
            return null;
        }
    },

    /**
     * Analyze visual damage from a photo
     * Uses GEMINI (accurate) for image analysis with key rotation
     */
    async analyzeVisualDamage(base64Image: string) {
        const maxRetries = geminiKeys.length || 1;

        // Log image stats for debugging
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
        console.log(`[Gemini] analyzeVisualDamage called. Image base64 length: ${base64Data.length} chars (~${Math.round(base64Data.length * 0.75 / 1024)} KB)`);

        // Validate image
        if (!base64Data || base64Data.length < 100) {
            console.error("[Gemini] Invalid image: too small or empty");
            return {
                damage: ["Invalid image"],
                severity: "Unknown",
                severityBn: "অজানা",
                likelyCause: "Image data is invalid or too small.",
                likelyCauseBn: "ছবির ডাটা অবৈধ বা খুব ছোট।",
                rawText: "Invalid image data"
            };
        }

        for (let retry = 0; retry < maxRetries; retry++) {
            try {
                const genAI = getNextGeminiClient();
                const model = genAI.getGenerativeModel({ model: MODELS.gemini.vision });

                console.log(`[Gemini] Using model: ${MODELS.gemini.vision}, attempt ${retry + 1}/${maxRetries}`);

                const prompt = `
                    You are an expert TV and electronics repair technician in Bangladesh.
                    Analyze this image and identify any damage or issues.
                    
                    Provide:
                    1. A list of visible damage (each item max 10 words)
                    2. Severity: "Low", "Medium", or "High"
                    3. Likely cause of the damage
                    4. Estimated repair cost range in BDT (if possible)
                    
                    Output JSON only:
                    {
                      "damage": ["damage 1", "damage 2"],
                      "severity": "Low|Medium|High",
                      "likelyCause": "Brief explanation",
                      "likelyCauseBn": "সংক্ষিপ্ত কারণ বাংলায়",
                      "estimatedCostMin": 500,
                      "estimatedCostMax": 2000
                    }
                `;

                const result = await model.generateContent([
                    prompt,
                    { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
                ]);

                const text = result.response.text();
                const jsonMatch = text.match(/\{[\s\S]*\}/);

                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    return {
                        damage: parsed.damage || [],
                        severity: parsed.severity || "Unknown",
                        severityBn: parsed.severity === "High" ? "গুরুতর" : parsed.severity === "Medium" ? "মাঝারি" : "হালকা",
                        likelyCause: parsed.likelyCause || "",
                        likelyCauseBn: parsed.likelyCauseBn || "",
                        estimatedCostMin: parsed.estimatedCostMin || null,
                        estimatedCostMax: parsed.estimatedCostMax || null,
                        rawText: text
                    };
                }

                return {
                    damage: ["Unable to analyze"],
                    severity: "Unknown",
                    severityBn: "অজানা",
                    likelyCause: "Could not analyze image",
                    likelyCauseBn: "ছবি বিশ্লেষণ করা যায়নি",
                    rawText: text
                };
            } catch (err: any) {
                console.error(`Gemini key ${retry + 1} failed:`, err?.message || err);
                if (retry === maxRetries - 1) {
                    return {
                        damage: ["Analysis failed"],
                        severity: "Unknown",
                        severityBn: "অজানা",
                        likelyCause: "AI service temporarily unavailable",
                        likelyCauseBn: "AI সেবা সাময়িকভাবে অনুপলব্ধ",
                        rawText: err?.message || "Error"
                    };
                }
                // Try next key
                continue;
            }
        }

        return null;
    },

    /**
     * Identify an electronic component from a photo
     * Uses GEMINI (accurate) for image analysis with key rotation
     */
    async identifyPart(base64Image: string) {
        const maxRetries = geminiKeys.length || 1;

        // Log image stats for debugging
        const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
        console.log(`[Gemini] identifyPart called. Image base64 length: ${base64Data.length} chars (~${Math.round(base64Data.length * 0.75 / 1024)} KB)`);

        // Validate image
        if (!base64Data || base64Data.length < 100) {
            console.error("[Gemini] Invalid image: too small or empty");
            return {
                label: "Invalid Image",
                labelBn: "অবৈধ ছবি",
                confidence: 0,
                issueType: "general",
                description: "Image data is invalid or too small.",
                descriptionBn: "ছবির ডাটা অবৈধ বা খুব ছোট।",
                rawText: "Invalid image data",
                boundingBox: null
            };
        }

        for (let retry = 0; retry < maxRetries; retry++) {
            try {
                const genAI = getNextGeminiClient();
                const model = genAI.getGenerativeModel({ model: MODELS.gemini.vision });

                console.log(`[Gemini] Using model: ${MODELS.gemini.vision}, attempt ${retry + 1}/${maxRetries}`);

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

                const result = await model.generateContent([
                    prompt,
                    { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
                ]);

                const text = result.response.text();
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
                        boundingBox: null
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
            } catch (err: any) {
                console.error(`[Gemini] Key ${retry + 1} failed. Error details:`, {
                    message: err?.message,
                    status: err?.status,
                    statusText: err?.statusText,
                    headers: err?.headers,
                    response: err?.response?.data
                });

                if (retry === maxRetries - 1) {
                    return {
                        label: "Unable to identify",
                        labelBn: "সনাক্ত করা যায়নি",
                        confidence: 0,
                        issueType: "general",
                        description: "AI service temporarily unavailable. Please try again.",
                        descriptionBn: "AI সেবা সাময়িকভাবে অনুপলব্ধ। অনুগ্রহ করে আবার চেষ্টা করুন।",
                        rawText: err?.message || "AI error",
                        boundingBox: null
                    };
                }
                continue;
            }
        }

        return null;
    },

    /**
     * Read barcode or QR code from image
     * Uses GEMINI (accurate) for image analysis
     */
    async readBarcode(base64Image: string) {
        try {
            const genAI = getNextGeminiClient();
            const model = genAI.getGenerativeModel({ model: MODELS.gemini.vision });

            const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
            const prompt = `
                Analyze this image and read any barcode or QR code visible.
                
                Output JSON only:
                {
                  "found": true/false,
                  "type": "barcode" | "qr",
                  "value": "the decoded value",
                  "confidence": 0.0 to 1.0
                }
            `;

            const result = await model.generateContent([
                prompt,
                { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
            ]);

            const text = result.response.text();
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            return jsonMatch ? JSON.parse(jsonMatch[0]) : { found: false };
        } catch (err) {
            console.error("Barcode reading failed:", err);
            return { found: false, error: "Failed to read barcode" };
        }
    },

    /**
     * Chat with Daktar Vai - Uses GROQ (fast) for text, GEMINI for images
     */
    async chatWithDaktarVai(
        message: string,
        history: any[] = [],
        image?: string,
        userContext?: { id?: string; name?: string; phone?: string; address?: string; role?: string },
        modelType: 'customer' | 'admin' = 'customer',
        adminData?: any,
        existingTicket?: any
    ) {
        console.log(`[AI] Chat request received. Message: "${message.substring(0, 50)}...", Image present: ${!!image}, Image length: ${image?.length || 0}`);

        const MAX_RETRIES = 3;
        const RETRY_DELAYS = [1000, 2000, 4000];

        // Build context-aware system prompt
        function buildContextPrompt() {
            let basePrompt = modelType === 'admin' ? ADMIN_PROMPT : DAKTAR_VAI_PROMPT;

            if (userContext) {
                const contextAddition = `
                
CURRENT USER CONTEXT:
- Name: ${userContext.name || "Unknown"}
- Phone: ${userContext.phone || "Not provided"}
- Address: ${userContext.address || "Not provided"}
- Role: ${userContext.role || "Customer"}

${userContext.name ? `Use their name "${userContext.name}" naturally in conversation.` : ""}
${userContext.phone ? `IMPORTANT: The user's phone number is "${userContext.phone}". You MUST use this for the booking. DO NOT ask the user for their phone number.` : ""}
`;
                basePrompt += contextAddition;
            }

            if (adminData) {
                // Add Shop Settings for Daktar Vai (Customer Model)
                if (modelType === 'customer' && adminData.settings) {
                    basePrompt += `
SHOP DETAILS (Read-Only):
- Name: ${adminData.settings.shopName || "Promise Electronics"}
- Address: ${adminData.settings.shopAddress || "Dhaka, Bangladesh"}
- Phone: ${adminData.settings.shopPhone || "Not provided"}
- Email: ${adminData.settings.shopEmail || "Not provided"}
- Website: ${adminData.settings.website || "Not provided"}
`;
                }

                // Add Admin Stats for Ops Co-Pilot (Admin Model)
                if (modelType === 'admin') {
                    basePrompt += `

CURRENT BUSINESS DATA:
${JSON.stringify(adminData, null, 2)}

Use this data to answer questions about the business.
`;
                }
            }

            // Existing Ticket Context
            if (existingTicket && modelType === 'customer') {
                basePrompt += `
⚠️ IMPORTANT: THIS USER ALREADY HAS A PENDING TICKET
- Ticket Number: ${existingTicket.ticketNumber || existingTicket.id}
- Status: ${existingTicket.status}
- Date: ${existingTicket.createdAt}
- Current Issue: ${existingTicket.primaryIssue}
- Description: ${existingTicket.description}

INSTRUCTIONS FOR EXISTING TICKET:
1. If the user wants to book a repair, inform them: "Apnar ekti pending ticket already ache (Ticket #${existingTicket.ticketNumber || '...id'})."
2. Ask if they want to UPDATE this ticket or if it's a mistake.
3. If they want to CHANGE details (like phone, address, or issue), collect the new info and output the JSON as usual. The system will UPDATE the existing ticket.
4. If they mention a NEW unrelated problem, warn them that the previous requests might be merged or ask them to wait.
`;
            }

            return basePrompt;
        }

        let lastError: any;

        // If there's an image, use HYBRID PIPELINE: Gemini Vision → Groq Chat
        if (image) {
            // Detect and extract base64 data
            let base64Data = image;
            let mimeType = "image/jpeg";  // Default

            // Check if it has a data URL prefix
            if (image.includes(';base64,')) {
                const parts = image.split(';base64,');
                base64Data = parts[1];
                // Extract mimeType from data:image/xxx
                const mimeMatch = parts[0].match(/data:(image\/\w+)/);
                if (mimeMatch) {
                    mimeType = mimeMatch[1];
                }
                console.log(`[AI] Detected data URL with mimeType: ${mimeType}`);
            } else if (image.startsWith('data:')) {
                // Has data prefix but different format
                base64Data = image.replace(/^data:image\/\w+;base64,/, "");
                console.log("[AI] Stripped data prefix from image");
            }

            console.log(`[AI] Hybrid Pipeline: Image base64 length: ${base64Data.length} chars (~${Math.round(base64Data.length * 0.75 / 1024)} KB)`);
            console.log(`[AI] Image base64 prefix: ${base64Data.substring(0, 50)}...`);

            // Validate image
            if (!base64Data || base64Data.length < 100) {
                console.error("[AI] Invalid image in chat: too small or empty");
                return {
                    text: "দুঃখিত, image টা ঠিকমতো পাঠানো হয়নি। আবার try করুন।",
                    booking: null,
                    error: true
                };
            }

            try {
                // STEP 1: Gemini analyzes the image
                const genAI = getNextGeminiClient();
                const visionModel = genAI.getGenerativeModel({ model: MODELS.gemini.vision });

                console.log(`[AI] Using Gemini model: ${MODELS.gemini.vision}, mimeType: ${mimeType}`);

                const visionPrompt = `
                    You are an expert TV and electronics repair technician.
                    Analyze this image and provide a detailed technical description.
                    
                    Output JSON ONLY:
                    {
                        "description": "What you see in the image (in English)",
                        "descriptionBn": "ছবিতে কি দেখছেন (বাংলায়)",
                        "components": ["List of visible components"],
                        "issues": ["List of visible issues or damage"],
                        "severity": "Low|Medium|High|None",
                        "brand": "Detected brand if visible, else null",
                        "model": "Detected model if visible, else null",
                        "recommendations": ["Suggested actions"]
                    }
                `;

                const visionResult = await visionModel.generateContent([
                    visionPrompt,
                    { inlineData: { data: base64Data, mimeType: mimeType } }
                ]);

                const visionText = visionResult.response.text();
                let imageAnalysis: any = {};

                // Parse Gemini's analysis
                const jsonMatch = visionText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        imageAnalysis = JSON.parse(jsonMatch[0]);
                    } catch (e) {
                        console.error("[AI] Failed to parse Gemini vision JSON:", e);
                        imageAnalysis = { description: visionText, rawText: visionText };
                    }
                } else {
                    imageAnalysis = { description: visionText, rawText: visionText };
                }

                console.log("[AI] Gemini analysis complete:", imageAnalysis.description?.substring(0, 100));

                // STEP 2: Pass Gemini's analysis to Groq for conversational response
                const imageContextPrompt = `
IMAGE ANALYSIS (from visual inspection):
- Description: ${imageAnalysis.description || "Unable to analyze"}
- বাংলা বিবরণ: ${imageAnalysis.descriptionBn || "বিশ্লেষণ করা যায়নি"}
- Components Detected: ${imageAnalysis.components?.join(", ") || "None"}
- Issues Found: ${imageAnalysis.issues?.join(", ") || "None"}
- Severity: ${imageAnalysis.severity || "Unknown"}
- Brand: ${imageAnalysis.brand || "Unknown"}
- Model: ${imageAnalysis.model || "Unknown"}
- Recommendations: ${imageAnalysis.recommendations?.join(", ") || "None"}

Use this analysis to respond to the user's message naturally as Daktar Vai.
`;

                const groqMessages: any[] = [
                    { role: "system", content: buildContextPrompt() + "\n\n" + imageContextPrompt },
                    ...history.map((h: any) => ({
                        role: h.role === "model" ? "assistant" : h.role,
                        content: h.parts?.[0]?.text || h.content || ""
                    })),
                    { role: "user", content: message || "Please analyze this image and tell me what you see." }
                ];

                const groqCompletion = await groq.chat.completions.create({
                    messages: groqMessages,
                    model: MODELS.groq.chat,
                    temperature: 0.7,
                    max_tokens: 1500,
                });

                const response = groqCompletion.choices[0]?.message?.content || "";

                // Check for booking JSON
                const bookingMatch = response.match(/\{[\s\S]*"action":\s*"BOOK_TICKET"[\s\S]*\}/);
                if (bookingMatch) {
                    try {
                        const booking = JSON.parse(bookingMatch[0]);
                        return {
                            text: response.replace(bookingMatch[0], "").trim() || "Apnar booking confirm hoyeche! 🎉",
                            booking: {
                                action: "BOOK_TICKET",
                                customer_name: booking.name,
                                phone: booking.phone,
                                brand: booking.brand || imageAnalysis.brand,
                                model: booking.model || imageAnalysis.model || null,
                                screenSize: booking.screenSize || null,
                                issue: booking.issue || imageAnalysis.issues?.[0],
                                description: booking.description || null,
                                address: userContext?.address || null
                            },
                            imageAnalysis: imageAnalysis
                        };
                    } catch (e) {
                        console.error("[AI] Failed to parse booking JSON:", e);
                    }
                }

                return {
                    text: response,
                    booking: null,
                    imageAnalysis: imageAnalysis  // Include analysis for debugging/logging
                };

            } catch (err: any) {
                console.error("[AI] Hybrid pipeline failed. Full error:", {
                    message: err?.message,
                    status: err?.status,
                    statusText: err?.statusText,
                    code: err?.code,
                    details: err?.errorDetails,
                    name: err?.name,
                    stack: err?.stack?.substring(0, 500)
                });

                // Check for specific error types
                let errorMessage = "দুঃখিত, image analyze করতে সমস্যা হচ্ছে। একটু পরে আবার try করুন।";

                if (err?.message?.includes('quota') || err?.message?.includes('rate')) {
                    errorMessage = "API quota exceeded. Please try again in a few minutes.";
                } else if (err?.message?.includes('invalid') || err?.message?.includes('Unable to process')) {
                    errorMessage = "Invalid image format. Please try a different image.";
                }

                return {
                    text: errorMessage,
                    booking: null,
                    error: true,
                    errorCode: 'AI_SERVICE_UNAVAILABLE',
                    errorDetails: err?.message
                };
            }
        }

        // Text-only chat uses GROQ (faster)
        console.log("[AI] Using Groq for text chat");
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const messages: any[] = [
                    { role: "system", content: buildContextPrompt() },
                    ...history.map((h: any) => ({
                        role: h.role === "model" ? "assistant" : h.role,
                        content: h.parts?.[0]?.text || h.content || ""
                    })),
                    { role: "user", content: message }
                ];

                const completion = await groq.chat.completions.create({
                    messages,
                    model: MODELS.groq.chat,
                    temperature: 0.7,
                    max_tokens: 1500,
                });

                const response = completion.choices[0]?.message?.content || "";

                // Check for Visual JSON first (Admin mode)
                if (modelType === 'admin') {
                    const jsonMatch = response.match(/\{[\s\S]*"visual":[\s\S]*\}/);
                    if (jsonMatch) {
                        try {
                            const parsed = JSON.parse(jsonMatch[0]);
                            return {
                                text: parsed.text || "Here is the data.",
                                visual: parsed.visual,
                                booking: null
                            };
                        } catch (e) {
                            console.error("Failed to parse visual JSON", e);
                        }
                    }
                }

                // Check for booking JSON (Customer mode)
                const jsonMatch = response.match(/\{[\s\S]*"action":\s*"BOOK_TICKET"[\s\S]*\}/);

                if (jsonMatch) {
                    try {
                        const booking = JSON.parse(jsonMatch[0]);
                        return {
                            text: response.replace(jsonMatch[0], "").trim() ||
                                "Apnar booking confirm hoyeche! 🎉 Amader team apnake call korbe.",
                            booking: {
                                action: "BOOK_TICKET",
                                customer_name: booking.name,
                                phone: booking.phone,
                                brand: booking.brand,
                                model: booking.model || null,
                                screenSize: booking.screenSize || null,
                                issue: booking.issue,
                                description: booking.description || null,
                                address: userContext?.address || null
                            }
                        };
                    } catch (parseErr) {
                        console.error("Failed to parse booking JSON:", parseErr);
                    }
                }

                return { text: response, booking: null };

            } catch (error: any) {
                lastError = error;
                console.error(`Groq attempt ${attempt + 1} failed:`, error?.message || error);

                if (error.status === 429) {
                    const retryAfter = error.headers?.['retry-after'] || RETRY_DELAYS[attempt] / 1000;
                    await new Promise(r => setTimeout(r, retryAfter * 1000));
                    continue;
                }

                if (error.status >= 500) {
                    await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
                    continue;
                }

                break;
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
    },

    /**
     * Generate Morning Brief Insights
     * Uses Groq (fast)
     */
    async generateMorningBrief(stats: any) {
        try {
            const prompt = `
                You are an AI Operations Analyst for Promise Electronics.
                Generate a concise morning brief from this data:
                
                ${JSON.stringify(stats, null, 2)}
                
                Provide 3-5 actionable insights in JSON format:
                {
                  "insights": [
                    { "type": "success|warning|info", "message": "Brief insight" }
                  ],
                  "priority_action": "One key action for today"
                }
            `;

            const completion = await groq.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: MODELS.groq.fast,
                temperature: 0.5,
                max_tokens: 600,
            });

            const text = completion.choices[0]?.message?.content || "";
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            return jsonMatch ? JSON.parse(jsonMatch[0]) : { insights: [], priority_action: "Review pending jobs" };
        } catch (err) {
            console.error("Morning brief generation failed:", err);
            return { insights: [], priority_action: "Check system status" };
        }
    },

    /**
     * Analyze diagnosis accuracy and suggest improvements
     * Uses Groq (fast)
     */
    async analyzeTrainingData(recentFeedback: any[]) {
        try {
            const prompt = `
                Analyze this service ticket feedback data and identify patterns:
                
                ${JSON.stringify(recentFeedback.slice(0, 20), null, 2)}
                
                Output JSON:
                {
                  "patterns": ["Pattern 1", "Pattern 2"],
                  "accuracy_estimate": 0.85,
                  "improvement_suggestions": ["Suggestion 1", "Suggestion 2"]
                }
            `;

            const completion = await groq.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: MODELS.groq.fast,
                temperature: 0.3,
                max_tokens: 600,
            });

            const text = completion.choices[0]?.message?.content || "";
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch (err) {
            console.error("Training data analysis failed:", err);
            return null;
        }
    }
};
