/**
 * TV Model Knowledge Base
 * 
 * This file contains mappings for common TV product lines, model series,
 * and brand hints to help the AI accurately identify brands from customer
 * descriptions that may only mention product line names.
 * 
 * Usage: The AI prompt references these patterns, and this file can be used
 * for pre-processing customer messages to suggest brand corrections.
 */

// Brand-Product Line Mappings
// Key: lowercase hint word, Value: brand and series info
export const TV_MODEL_HINTS: Record<string, { brand: string; series?: string; model?: string; type?: string }> = {
    // Sony
    "bravia": { brand: "Sony", series: "Bravia" },
    "triluminos": { brand: "Sony" },
    "x-reality": { brand: "Sony" },
    "x90j": { brand: "Sony", model: "X90J" },
    "x90k": { brand: "Sony", model: "X90K" },
    "x85j": { brand: "Sony", model: "X85J" },
    "x85k": { brand: "Sony", model: "X85K" },
    "x80j": { brand: "Sony", model: "X80J" },
    "x80k": { brand: "Sony", model: "X80K" },
    "a80j": { brand: "Sony", model: "A80J", type: "OLED" },
    "a80k": { brand: "Sony", model: "A80K", type: "OLED" },
    "a90j": { brand: "Sony", model: "A90J", type: "OLED" },
    "a95k": { brand: "Sony", model: "A95K", type: "QD-OLED" },

    // Samsung
    "neo qled": { brand: "Samsung", series: "Neo QLED" },
    "crystal uhd": { brand: "Samsung", series: "Crystal UHD" },
    "the frame": { brand: "Samsung", series: "The Frame" },
    "the serif": { brand: "Samsung", series: "The Serif" },
    "qn85a": { brand: "Samsung", model: "QN85A" },
    "qn90a": { brand: "Samsung", model: "QN90A" },
    "qn85b": { brand: "Samsung", model: "QN85B" },
    "qn90b": { brand: "Samsung", model: "QN90B" },
    "cu7000": { brand: "Samsung", model: "CU7000" },
    "cu8000": { brand: "Samsung", model: "CU8000" },
    "au7000": { brand: "Samsung", model: "AU7000" },
    "au8000": { brand: "Samsung", model: "AU8000" },

    // LG
    "nanocell": { brand: "LG", series: "NanoCell" },
    "webos": { brand: "LG" },
    "oled c3": { brand: "LG", model: "C3", type: "OLED" },
    "oled g3": { brand: "LG", model: "G3", type: "OLED" },
    "oled c2": { brand: "LG", model: "C2", type: "OLED" },
    "oled g2": { brand: "LG", model: "G2", type: "OLED" },
    "c3": { brand: "LG", model: "C3", type: "OLED" },
    "g3": { brand: "LG", model: "G3", type: "OLED" },
    "c2": { brand: "LG", model: "C2", type: "OLED" },
    "b3": { brand: "LG", model: "B3", type: "OLED" },
    "lm5500": { brand: "LG", model: "LM5500" },
    "uq8000": { brand: "LG", model: "UQ8000" },

    // Hisense
    "uled": { brand: "Hisense", series: "ULED" },
    "laser tv": { brand: "Hisense", series: "Laser TV" },
    "u7h": { brand: "Hisense", model: "U7H" },
    "u8h": { brand: "Hisense", model: "U8H" },

    // TCL
    "roku tv": { brand: "TCL", series: "Roku TV" },
    "google tv": { brand: "TCL", series: "Google TV" },
    "c835": { brand: "TCL", model: "C835" },
    "c845": { brand: "TCL", model: "C845" },

    // Local Bangladeshi Brands
    "walton primo": { brand: "Walton", series: "Primo" },
    "primo": { brand: "Walton", series: "Primo" },
    "vision plus": { brand: "Vision", series: "Plus" },
    "minister": { brand: "Minister" },
    "singer": { brand: "Singer" },
    "jamuna": { brand: "Jamuna" },
    "rangs": { brand: "Rangs" },
    "myone": { brand: "MyOne" },
};

// Ambiguous terms that require clarification
export const AMBIGUOUS_TERMS: Record<string, string[]> = {
    "qled": ["Samsung", "TCL"], // QLED is used by both
    "oled": ["LG", "Sony"],     // Both have OLED lines
    "smart tv": [],              // Too generic
    "android tv": [],            // Too generic
};

// Common screen sizes (in inches)
export const VALID_SCREEN_SIZES = [24, 32, 40, 43, 50, 55, 65, 75, 85, 98] as const;

// Regex patterns for extracting model numbers
export const MODEL_NUMBER_PATTERNS = {
    sony: /(?:KD|XR|KLV)-?(\d{2})([A-Z]\d+[A-Z]?)/i,      // KD-55X90J, XR-65A80K
    samsung: /(?:UA|QN|QE)?(\d{2})([A-Z]+\d+[A-Z]?)/i,    // UA55CU7000, QN55QN85A
    lg: /(?:OLED)?(\d{2})([A-Z]+\d*)/i,                   // OLED55C3, 43LM5500
};

// Extract brand hint from message
export function extractBrandHint(message: string): { brand?: string; model?: string; series?: string } | null {
    const lowerMessage = message.toLowerCase();

    for (const [hint, info] of Object.entries(TV_MODEL_HINTS)) {
        if (lowerMessage.includes(hint)) {
            return info;
        }
    }

    return null;
}

// Check if a term is ambiguous
export function isAmbiguousTerm(term: string): string[] | null {
    const lowerTerm = term.toLowerCase();
    return AMBIGUOUS_TERMS[lowerTerm] || null;
}

// Extract screen size from message
export function extractScreenSize(message: string): number | null {
    // Match patterns like "55 inch", "55"", "55 er", "55 inchi"
    const patterns = [
        /(\d{2})\s*(?:inch|inchi|"|er\b)/i,
        /(\d{2})\s+(?:inch|inchi)/i,
    ];

    for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match) {
            const size = parseInt(match[1], 10);
            if (VALID_SCREEN_SIZES.includes(size as any)) {
                return size;
            }
        }
    }

    return null;
}
