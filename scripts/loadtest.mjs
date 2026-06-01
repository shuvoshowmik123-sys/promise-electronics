/**
 * API load test — read-only endpoints only.
 *
 * SAFETY: point this at a server connected to a THROWAWAY Neon branch, never prod.
 * Read-only GETs, but auth/session + DB read load still hit whatever DB the
 * server is wired to. See scripts/LOADTEST.md for the Neon-branch setup.
 *
 * Run:  node scripts/loadtest.mjs
 * Env:  BASE_URL   (default http://localhost:5083)
 *       DURATION   seconds per endpoint (default 15)
 *       CONNS      concurrent connections (default 50)
 *       COOKIE     admin session cookie, e.g. "connect.sid=s%3A..."  (optional)
 */
import autocannon from "autocannon";

const BASE = process.env.BASE_URL || "http://localhost:5083";
const DURATION = Number(process.env.DURATION || 15);
const CONNS = Number(process.env.CONNS || 50);
const COOKIE = process.env.COOKIE || "";

// Read-only endpoints. Public ones need no cookie; admin ones need COOKIE set.
const ENDPOINTS = [
  { path: "/health", auth: false },
  { path: "/api/public/settings", auth: false },
  { path: "/api/shop/inventory", auth: false },
  { path: "/api/job-tickets?page=1&limit=25", auth: true },
  { path: "/api/pos-transactions?page=1&limit=25", auth: true },
  { path: "/api/petty-cash/summary", auth: true },
  { path: "/api/due-records?page=1&limit=25", auth: true },
  { path: "/api/refunds", auth: true },
  { path: "/api/notifications", auth: true },
];

const headers = COOKIE ? { cookie: COOKIE } : {};

function run(path) {
  return new Promise((resolve) => {
    const inst = autocannon(
      { url: BASE + path, connections: CONNS, duration: DURATION, headers },
      (err, res) => {
        if (err) { console.log(`\n${path} -> ERROR ${err.message}`); return resolve(); }
        const p = res.latency;
        const non2xx = res.non2xx;
        console.log(
          `\n${path}\n` +
          `  req/sec  avg ${res.requests.average.toFixed(0)}  (min ${res.requests.min})\n` +
          `  latency  p50 ${p.p50}ms  p97.5 ${p.p97_5}ms  max ${p.max}ms\n` +
          `  total    ${res.requests.total} reqs, ${res["2xx"]} ok, ${non2xx} non-2xx, ${res.errors} errors`
        );
        resolve();
      }
    );
    autocannon.track(inst, { renderProgressBar: false });
  });
}

(async () => {
  console.log(`Load test -> ${BASE}  (${CONNS} conns, ${DURATION}s each)`);
  if (!COOKIE) console.log("No COOKIE set: admin endpoints will return 401 (still load-tests routing/DB-less path).");
  for (const e of ENDPOINTS) {
    if (e.auth && !COOKIE) { console.log(`\n${e.path} -> skipped (needs COOKIE)`); continue; }
    await run(e.path);
  }
  console.log("\nDone. Watch the Neon branch dashboard for CPU/connection spikes.");
})();
