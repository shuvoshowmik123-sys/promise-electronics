import type { Request, Response } from "express";
import { addAdminSSEClient, removeAdminSSEClient } from "./middleware/sse-broker.js";
import { getEffectivePermissionsForUser } from "./middleware/auth.js";

export function handleAdminEventStream(req: Request, res: Response): void {
  const adminId = req.session?.adminUserId || (req.session as any)?.adminId;
  const user = (req as any).user;
  const permissions = user ? getEffectivePermissionsForUser(user) : {};

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: "connected", channel: "admin" })}\n\n`);

  if (adminId) {
    addAdminSSEClient(adminId, res, permissions);
  }

  const keepAlive = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(keepAlive);
    }
  }, 30000);

  req.on("close", () => {
    clearInterval(keepAlive);
    if (adminId) {
      removeAdminSSEClient(adminId, res);
    }
  });
}
