/**
 * POST /api/tv-model/check — "does this model number match what you told us?"
 *
 * Answers with at most one suggestion and never with a list. This endpoint is
 * unauthenticated because it sits on the public homepage, which means anything
 * it returns is effectively published: a browsable catalogue of every model the
 * shop has ever repaired would be handed to competitors one request at a time.
 * So a caller must bring a model number and gets back only a verdict on that
 * model.
 *
 * The pattern reader runs first because it is free, instant and offline. The
 * learned encyclopedia is consulted only for what the pattern reader could not
 * resolve — which is precisely the local brands it was built for.
 */
import { Router, Request, Response } from "express";
import { publicMapSearchLimiter } from "./middleware/rate-limit.js";
import { sizeFromModel, brandFromModel, looksLikeModel } from "../../shared/tv-model.js";

const router = Router();

export type ModelCheckResponse = {
  /** 'ok' — nothing to say. 'notice' — worth mentioning. 'unreadable' — not a model number. */
  status: "ok" | "notice" | "unreadable";
  /** What we believe, when we believe anything. */
  brand?: string;
  sizeInches?: number;
  /** 'pattern' read it from the number itself; 'history' means we have repaired it. */
  source?: "pattern" | "history";
  /** Only a verified reading may contradict; a suggestion may only be offered. */
  confidence?: "suggest" | "verified";
  /** Which of the customer's answers disagrees. */
  mismatch?: { brand?: boolean; size?: boolean };
};

router.post(
  "/api/tv-model/check",
  publicMapSearchLimiter,
  async (req: Request, res: Response) => {
    try {
      const model = String(req.body?.model ?? "").trim();
      const brand = String(req.body?.brand ?? "").trim();
      const size = Number.parseInt(String(req.body?.size ?? "").replace(/[^0-9]/g, ""), 10);
      const chosenSize = Number.isFinite(size) ? size : null;

      if (!model) return res.json({ status: "ok" } as ModelCheckResponse);
      if (!looksLikeModel(model)) {
        return res.json({ status: "unreadable" } as ModelCheckResponse);
      }

      // 1. The number itself, for free.
      let knownBrand = brandFromModel(model);
      let knownSize = sizeFromModel(model);
      let source: "pattern" | "history" = "pattern";
      let confidence: "suggest" | "verified" = "verified";

      // 2. Only what the pattern could not read, and only if the brain is
      //    configured on this instance. A missing brain is not an error here.
      if ((!knownBrand || !knownSize) && process.env.BRAIN_DATABASE_URL) {
        try {
          const { lookupModel } = await import("../brain/tv-encyclopedia.service.js");
          const verdict = await lookupModel(model);
          if (verdict.known && !("ambiguous" in verdict && verdict.ambiguous)) {
            const v = verdict as Extract<typeof verdict, { ambiguous: false }>;
            if (!knownBrand) { knownBrand = v.brand; source = "history"; confidence = v.confidence; }
            if (!knownSize && v.sizeInches != null) { knownSize = v.sizeInches; source = "history"; confidence = v.confidence; }
          }
          // An ambiguous verdict deliberately falls through as "nothing known".
        } catch (error: any) {
          // The brain being unreachable must never break the homepage. Say
          // nothing rather than fail the request.
          console.error("[TVModel] brain lookup failed:", (error as Error).message);
        }
      }

      if (!knownBrand && !knownSize) return res.json({ status: "ok" } as ModelCheckResponse);

      const mismatch = {
        brand: !!(knownBrand && brand && knownBrand.toLowerCase() !== brand.toLowerCase()),
        size: !!(knownSize && chosenSize && knownSize !== chosenSize),
      };

      const body: ModelCheckResponse = {
        status: mismatch.brand || mismatch.size || !brand || !chosenSize ? "notice" : "ok",
        ...(knownBrand ? { brand: knownBrand } : {}),
        ...(knownSize ? { sizeInches: knownSize } : {}),
        source,
        confidence,
        mismatch,
      };
      return res.json(body);
    } catch (error: any) {
      console.error("[TVModel] check failed:", (error as Error).message);
      // Silence is the safe answer for a decorative check on a public page.
      return res.json({ status: "ok" } as ModelCheckResponse);
    }
  },
);

export default router;
