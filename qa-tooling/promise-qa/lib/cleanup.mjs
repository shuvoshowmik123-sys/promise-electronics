/**
 * Truthful cleanup tracking for browsers/contexts/traces/temp files.
 */
import { rmSync, existsSync } from "fs";

export function createCleanupTracker() {
  const browsers = new Set();
  const contexts = new Set();
  const tempPaths = new Set();
  const tracingContexts = new Set();
  let closed = false;

  return {
    trackBrowser(b) {
      if (b) browsers.add(b);
      return b;
    },
    trackContext(c) {
      if (c) contexts.add(c);
      return c;
    },
    trackTracing(c) {
      if (c) tracingContexts.add(c);
    },
    trackTemp(p) {
      if (p) tempPaths.add(p);
    },
    async cleanup() {
      const errors = [];
      for (const c of tracingContexts) {
        try {
          await c.tracing.stop().catch(() => {});
        } catch (e) {
          errors.push("trace:" + (e.message || e));
        }
      }
      tracingContexts.clear();
      for (const c of contexts) {
        try {
          await c.close();
        } catch (e) {
          errors.push("context:" + (e.message || e));
        }
      }
      contexts.clear();
      for (const b of browsers) {
        try {
          await b.close();
        } catch (e) {
          errors.push("browser:" + (e.message || e));
        }
      }
      browsers.clear();
      for (const p of tempPaths) {
        try {
          if (existsSync(p)) rmSync(p, { recursive: true, force: true });
        } catch (e) {
          errors.push("temp:" + (e.message || e));
        }
      }
      tempPaths.clear();
      closed = true;
      return {
        ok: errors.length === 0,
        errors,
        result: errors.length === 0 ? "PASS" : "FAIL",
      };
    },
    get openBrowsers() {
      return browsers.size;
    },
    get openContexts() {
      return contexts.size;
    },
    get isClosed() {
      return closed && browsers.size === 0 && contexts.size === 0;
    },
  };
}
