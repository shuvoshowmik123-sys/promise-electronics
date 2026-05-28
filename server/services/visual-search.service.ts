import { GoogleGenerativeAI } from "@google/generative-ai";

const geminiKeys = [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
].filter(Boolean) as string[];

let keyIdx = 0;
function getGeminiClient(): GoogleGenerativeAI {
    if (geminiKeys.length === 0) throw new Error("No Gemini API keys configured");
    const key = geminiKeys[keyIdx];
    keyIdx = (keyIdx + 1) % geminiKeys.length;
    return new GoogleGenerativeAI(key);
}

export interface VisualSearchResult {
    deviceTypeGuess: string;
    brand: string | null;
    modelNumber: string | null;
    modelNumberVisible: boolean;
    screenSize: string | null;
    visibleDamage: string[];
    groundedFacts: string[];
    confidence: "high" | "medium" | "low";
}

/**
 * Dose 2 Part C — Analyze device image + Google Search grounding.
 * Uses Gemini 2.5 Flash with googleSearch tool to verify device identity and fetch specs.
 */
export async function visualSearchDevice(
    base64Image: string,
    mimeType: string = "image/jpeg"
): Promise<VisualSearchResult | null> {
    try {
        const genAI = getGeminiClient();
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            tools: [{ googleSearch: {} } as any],
        });

        const result = await model.generateContent([
            { inlineData: { data: base64Image, mimeType } },
            {
                text: `You are an expert TV repair technician in Bangladesh.
Analyze this image carefully. If a model number or brand label is visible, use Google Search to verify.

Identify:
- Is this a TV, computer monitor, CRT, or something else?
- What brand and model number are visible?
- What damage or issues are visible?
- What does Google say about this specific model?

Output JSON only (no markdown, no code fences):
{
  "deviceTypeGuess": "TV or Monitor or CRT or Other or Unknown",
  "brand": "brand name or null",
  "modelNumber": "exact model number if visible else null",
  "modelNumberVisible": true or false,
  "screenSize": "size in inches as string or null",
  "visibleDamage": ["list each visible damage item"],
  "groundedFacts": ["facts verified from Google about this device model — panel type, year, known issues"],
  "confidence": "high or medium or low"
}`
            }
        ]);

        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.warn("[VisualSearch] No JSON in response");
            return null;
        }
        const parsed = JSON.parse(jsonMatch[0]) as VisualSearchResult;
        console.log(`[VisualSearch] ${parsed.deviceTypeGuess} | brand=${parsed.brand} | model=${parsed.modelNumber} | confidence=${parsed.confidence}`);
        return parsed;
    } catch (err: any) {
        console.warn("[VisualSearch] visualSearchDevice failed (non-fatal):", err?.message?.slice(0, 80));
        return null;
    }
}

/**
 * Dose 2 Part D — Look up TV model number via Google Search grounding.
 * Returns repair-relevant facts (panel type, common faults, year, TV vs monitor, etc.)
 */
export async function lookupModelViaGrounding(modelNumber: string): Promise<string[] | null> {
    try {
        const genAI = getGeminiClient();
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            tools: [{ googleSearch: {} } as any],
        });

        const result = await model.generateContent(
            `You are a TV repair expert in Bangladesh. Search Google for model "${modelNumber}".
Retrieve 3-5 key facts useful for a repair technician:
- Is this a TV or a computer monitor?
- Panel type (IPS, VA, OLED, etc.)
- Screen size and year
- Common faults or known issues for this model
- Brand and full name

Output JSON only: {"facts": ["fact1", "fact2", "fact3"]}`
        );

        const text = result.response.text();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        const parsed = JSON.parse(jsonMatch[0]);
        const facts = Array.isArray(parsed.facts) ? parsed.facts.filter(Boolean) : null;
        if (facts && facts.length > 0) {
            console.log(`[VisualSearch] Model lookup "${modelNumber}": ${facts.length} facts`);
        }
        return facts && facts.length > 0 ? facts : null;
    } catch (err: any) {
        console.warn("[VisualSearch] lookupModelViaGrounding failed (non-fatal):", err?.message?.slice(0, 80));
        return null;
    }
}
