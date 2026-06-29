import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { applyPortalMeta } from "./lib/portalMeta.js";

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

  app.use("*", (req, res) => {
    if (!indexHtml) {
      return res.sendFile(indexPath);
    }
    const html = applyPortalMeta(req.originalUrl, indexHtml);
    res.status(200).set({ "Content-Type": "text/html" }).end(html);
  });
}
