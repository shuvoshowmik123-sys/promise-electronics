# Admin panel slow-load — causes & fixes

Diagnosed 2026-06-05. Symptom: admin panel takes a long time to load, especially
after the site has been idle.

## Root cause (ranked)

1. **Render `plan: free` cold start (~80% of the pain).** Free web services spin
   down after ~15 min idle; the next request waits ~50 s for a cold boot.
2. **Boot-time migrations blocked `listen()`.** `server/index.ts` ran ~10 serial
   seed/migration round-trips to a cold Neon DB *before* the server accepted any
   connection (incl. `/health`). **Fixed** — see below.
3. **Neon autosuspend.** Both DBs (`ep-muddy-salad`, `ep-misty-water`,
   ap-southeast-1) scale to zero after ~5 min → +1–3 s wake on first query.
4. **Entry bundle weight.** `index.js` ~780 KB + `vendor-react` ~632 KB.

## Fixes applied (code)

- `server/index.ts`: server now calls `httpServer.listen()` **first**; seeds +
  migrations run in the background via `runStartupMigrations()` after the port is
  open. Migrations also run concurrently (`Promise.allSettled`) instead of serial.
  New env `SKIP_STARTUP_MIGRATIONS=true` disables them (use once they're moved to
  a dedicated deploy/release step).
- `vite.config.ts`: all `node_modules` now land in long-cached `vendor*` chunks
  (icons / charts / pdf split out), shrinking the entry `index.js` to app code.

## Fixes you must do (dashboard / ops — no code)

1. **Stop Render spin-down (biggest win):**
   - Best: upgrade Render `free` → **Starter ($7/mo)** = no sleep.
   - Free workaround: external uptime pinger (UptimeRobot, cron-job.org) hitting
     `https://<render-app>/health` every **10 min**. NOTE: a *self*-ping inside the
     app cannot work — when Render sleeps, the whole process is stopped. Must be
     external.
2. **Neon:** use the pooled host (`...-pooler.neon.tech`) in `DATABASE_URL`; disable
   autosuspend on a paid plan, or accept the ~2 s wake (the keep-warm ping above
   also keeps it awake if it issues a query).
3. **Move startup migrations to a deploy step** (Render `preDeployCommand`) and set
   `SKIP_STARTUP_MIGRATIONS=true`, so schema changes never touch normal boots.
