import { Router } from "express";
import { aiService } from "../services/ai.service.js";

const router = Router();

// POST /api/lens/identify
router.post("/identify", async (req, res) => {
    try {
        const { image } = req.body;
        if (!image) return res.status(400).json({ message: "Image is required" });

        const result = await aiService.identifyPart(image);
        if (!result) return res.status(500).json({ message: "Failed to identify part" });

        res.json(result);
    } catch (error) {
        console.error("Lens identify error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// POST /api/lens/assess
router.post("/assess", async (req, res) => {
    try {
        const { image } = req.body;
        if (!image) return res.status(400).json({ message: "Image is required" });

        const result = await aiService.analyzeVisualDamage(image);
        if (!result) return res.status(500).json({ message: "Failed to assess damage" });

        // Map to client expectation
        res.json({
            damage: result.damage || [],
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
