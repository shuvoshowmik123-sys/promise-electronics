import { createApp, getHttpServer, log } from "./app.js";
// Trigger restart v3 - inlined module auth
import { serveStatic } from "./static.js";
import { seedSuperAdmin } from "./seed.js";
import { Request, Response, NextFunction } from "express";
import { aiErrorHandler } from "./middleware/ai-error-handler.js";
import { startDrawerDayCloseScheduler, stopDrawerDayCloseScheduler } from "./services/drawer-day-close.service.js";

(async () => {
  // Seed super admin if not exists
  await seedSuperAdmin();

  const app = await createApp();
  const httpServer = getHttpServer();
  startDrawerDayCloseScheduler();

  // AI Error Handler (Module C)
  app.use(aiErrorHandler);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("[ERROR HANDLER]", err);

    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  // Catch-all for unmet /api routes so they return JSON 404 instead of HTML
  app.use("/api", (req, res) => {
    res.status(404).json({ message: "API route not found" });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5083", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
    },
  );

  // Graceful shutdown — always release the port on exit so EADDRINUSE
  // never occurs on the next startup (especially critical on Windows
  // where sockets can stay in TIME_WAIT/CLOSE_WAIT state).
  const shutdown = (signal: string) => {
    log(`Received ${signal}. Closing HTTP server gracefully...`);
    stopDrawerDayCloseScheduler();
    httpServer.close((err) => {
      if (err) {
        console.error("[Shutdown] Error closing server:", err);
        process.exit(1);
      } else {
        log(`[Shutdown] Server closed. Port ${port} released. Goodbye.`);
        process.exit(0);
      }
    });

    // Force-kill after 10 seconds if connections won't drain
    setTimeout(() => {
      console.error("[Shutdown] Could not drain connections in time, forcing exit.");
      process.exit(1);
    }, 10000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
})().catch((err) => {
  console.error("Fatal error during startup:", err);
  process.exit(1);
});
