import { Router } from "express";
import { aiService } from "../services/ai.service.js";

const router = Router();

// POST /api/lens/identify
router.post("/identify", async (req, res) => {
    try {
        const { image } = req.body;
        if (!image) {
            console.log("[Lens] No image provided");
            return res.status(400).json({ message: "Image is required" });
        }

        console.log(`[Lens] Identify request received, image size: ${image.length} chars`);
        const result = await aiService.identifyPart(image);

        if (!result) {
            console.log("[Lens] AI service returned null - check Gemini API key and logs");
            return res.status(500).json({ message: "Failed to identify part - AI service error" });
        }

        console.log(`[Lens] Identify success: ${result.label}`);
        res.json(result);
    } catch (error: any) {
        console.error("[Lens] Identify error:", error?.message || error);
        res.status(500).json({ message: error?.message || "Internal server error" });
    }
});

// POST /api/lens/assess
router.post("/assess", async (req, res) => {
    try {
        const { image } = req.body;
        if (!image) return res.status(400).json({ message: "Image is required" });

        const result = await aiService.analyzeVisualDamage(image);
        if (!result) return res.status(500).json({ message: "Failed to assess damage" });

        // Map severity to Bengali
        const severityMap: Record<string, string> = {
            'Low': 'হালকা',
            'Medium': 'মাঝারি',
            'High': 'গুরুতর'
        };

        // Map to client expectation with Bengali translations
        res.json({
            damage: result.damage || [],
            severity: result.severity || 'Unknown',
            severityBn: severityMap[result.severity] || 'অজানা',
            likelyCause: result.likelyCause || '',
            likelyCauseBn: result.likelyCauseBn || result.likelyCause || '',
            estimatedCostMin: result.estimatedCostMin || null,
            estimatedCostMax: result.estimatedCostMax || null,
            rawText: `Likely cause: ${result.likelyCause}. Severity: ${result.severity}`
        });
    } catch (error) {
        console.error("Lens assess error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// POST /api/lens/barcode
router.post("/barcode", async (req, res) => {
    try {
        const { image } = req.body;
        if (!image) return res.status(400).json({ message: "Image is required" });

        const result = await aiService.readBarcode(image);
        if (!result) return res.status(500).json({ message: "Failed to read barcode" });

        res.json(result);
    } catch (error) {
        console.error("Lens barcode error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

export default router;
