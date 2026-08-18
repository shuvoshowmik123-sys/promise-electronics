import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { applyPortalMeta } from "./lib/portalMeta.js";
import { buildPublicPageMeta, applyPublicPageMeta } from "./lib/publicPageMeta.js";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.warn(`[Static] dist/public not found — skipping static file serving (frontend deployed separately)`);
    return;
  }

  app.use(express.static(distPath));

  const indexPath = path.resolve(distPath, "index.html");
  let indexHtml: string | null = null;
  try {
    indexHtml = fs.readFileSync(indexPath, "utf-8");
  } catch {
    console.warn("[Static] index.html not found in dist/public");
  }

  app.use("*", async (req, res) => {
    if (!indexHtml) {
      return res.sendFile(indexPath);
    }
    let html = applyPortalMeta(req.originalUrl, indexHtml);

    /**
     * A catalogue page tells the crawler about itself.
     *
     * Facebook and WhatsApp never run JavaScript, so whatever is in this head
     * is the entire story they will ever get. Until now that story was one
     * hardcoded card for the whole site, which is why every shared link looked
     * identical and no individual service could be tagged or found.
     *
     * Wrapped in its own try/catch on purpose: a database hiccup must cost the
     * visitor a rich preview, never the page itself. Serving the generic head
     * is a bad day for marketing and a normal one for the customer.
     */
    try {
      const meta = await buildPublicPageMeta(req.originalUrl);
      if (meta) html = applyPublicPageMeta(html, meta);
    } catch (error) {
      console.error("[Static] could not build page meta; serving the generic head:", error);
    }

    res.status(200).set({ "Content-Type": "text/html" }).end(html);
  });
}
