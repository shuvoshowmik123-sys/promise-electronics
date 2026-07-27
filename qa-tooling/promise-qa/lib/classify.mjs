/**
 * Structured console + network classification for Promise QA.
 * Same rules for desktop and mobile.
 */
import { sanitizeUrl } from "./redact.mjs";

/** @typedef {'EXPECTED'|'DEVELOPMENT NOISE'|'PRODUCT WARNING'|'PRODUCT ERROR'|'SECURITY'|'BLOCKING'|'UNCLASSIFIED'} ClassLabel */

/**
 * @typedef {object} ClassifyContext
 * @property {'anonymous'|'authenticated'|'unknown'} [actorState]
 * @property {string} [expectedPath] - pathname that is intentionally expected to fail
 * @property {number[]} [expectedStatuses]
 * @property {boolean} [authenticatedCustomer]
 */

/**
 * Explicit allowlist for expected failures.
 * Anonymous public actor only for customer/me 401.
 */
export const ALLOWLIST = [
  {
    id: "anon-customer-me-401",
    method: "GET",
    path: "/api/customer/me",
    status: 401,
    actorState: "anonymous",
    class: "EXPECTED",
  },
];

export function pathnameOf(url) {
  try {
    return new URL(url, "http://127.0.0.1").pathname;
  } catch {
    return String(url || "").split("?")[0];
  }
}

/**
 * Classify a network response event.
 * @returns {{ class: ClassLabel, reason: string, blocksPass: boolean }}
 */
export function classifyNetwork(entry, ctx = {}) {
  const method = String(entry?.method || "GET").toUpperCase();
  const status = Number(entry?.status || 0);
  const path = pathnameOf(entry?.url || "");
  const actorState = ctx.actorState || "unknown";
  const authCustomer = Boolean(ctx.authenticatedCustomer);

  for (const rule of ALLOWLIST) {
    if (
      rule.method === method &&
      rule.path === path &&
      rule.status === status &&
      (rule.actorState === actorState || (!authCustomer && rule.actorState === "anonymous" && actorState === "anonymous"))
    ) {
      if (authCustomer && path === "/api/customer/me" && status === 401) {
        // Allowlist must not apply to authenticated customer
        break;
      }
      return { class: "EXPECTED", reason: rule.id, blocksPass: false };
    }
  }

  // Authenticated unexpected 401 on customer/me
  if (authCustomer && path === "/api/customer/me" && status === 401) {
    return { class: "BLOCKING", reason: "authenticated-customer-me-401", blocksPass: true };
  }

  if (status >= 500) {
    return { class: "BLOCKING", reason: "http-5xx", blocksPass: true };
  }

  // Static 4xx: only explicitly documented noncritical resources may be non-blocking.
  // Documented noncritical: favicon .ico, source maps. Everything else can block GO.
  if (status >= 400 && !path.startsWith("/api/")) {
    if (/\.ico$/i.test(path) || /\/favicon(\.|$)/i.test(path)) {
      return { class: "DEVELOPMENT NOISE", reason: "favicon-4xx-documented-noncritical", blocksPass: false };
    }
    if (/\.map$/i.test(path)) {
      return { class: "DEVELOPMENT NOISE", reason: "sourcemap-4xx-documented-noncritical", blocksPass: false };
    }
    if (/\.(js|mjs|cjs|css)$/i.test(path) || path.startsWith("/src/") || path.startsWith("/@")) {
      // Vite optional tooling under /@ and node_modules path probes only
      if (path.startsWith("/@") || path.includes("node_modules")) {
        return { class: "DEVELOPMENT NOISE", reason: "vite-optional-4xx-documented-noncritical", blocksPass: false };
      }
      return { class: "PRODUCT ERROR", reason: "missing-js-or-css", blocksPass: true };
    }
    if (/\.(woff2?|ttf|otf|eot)$/i.test(path)) {
      return { class: "PRODUCT ERROR", reason: "missing-font", blocksPass: true };
    }
    if (/\.(png|jpg|jpeg|webp|svg|gif|avif)$/i.test(path)) {
      return { class: "PRODUCT ERROR", reason: "missing-required-image", blocksPass: true };
    }
    // Map tiles: product-blocking when unavailable (no silent GO)
    if (/openfreemap|openmaptiles|tile|\/planet\//i.test(entry?.url || path)) {
      return { class: "PRODUCT ERROR", reason: "missing-map-tile", blocksPass: true };
    }
  }

  if (status === 401 || status === 403) {
    if (ctx.expectedPath === path && (ctx.expectedStatuses || []).includes(status)) {
      return { class: "EXPECTED", reason: "step-expected-status", blocksPass: false };
    }
    // Anonymous public pages often probe session endpoints
    if (
      !authCustomer &&
      actorState === "anonymous" &&
      status === 401 &&
      (path === "/api/customer/me" || path === "/api/admin/me" || path === "/api/corporate/me")
    ) {
      return { class: "EXPECTED", reason: "anon-session-probe-401", blocksPass: false };
    }
    return { class: "BLOCKING", reason: "unexpected-authz", blocksPass: true };
  }

  if (status >= 400) {
    if (ctx.expectedPath === path && (ctx.expectedStatuses || []).includes(status)) {
      return { class: "EXPECTED", reason: "step-expected-status", blocksPass: false };
    }
    if (path.startsWith("/api/")) {
      return { class: "PRODUCT ERROR", reason: "http-4xx-api", blocksPass: true };
    }
    return { class: "PRODUCT WARNING", reason: "http-4xx-non-api", blocksPass: false };
  }

  return { class: "EXPECTED", reason: "2xx-or-3xx", blocksPass: false };
}

/**
 * Detect repeating unauthorized after settle.
 * @param {Array<{url?:string,status?:number,method?:string}>} events
 */
export function detectRepeatedAuthz(events, { windowSize = 8, minCount = 4 } = {}) {
  const recent = events.slice(-windowSize);
  const bad = recent.filter((e) => e.status === 401 || e.status === 403);
  if (bad.length >= minCount) {
    return {
      class: "BLOCKING",
      reason: "repeated-unauthorized-after-settle",
      blocksPass: true,
      count: bad.length,
    };
  }
  return null;
}

/**
 * Detect simple infinite loop: same method+path >= N times in a row.
 */
export function detectRequestLoop(events, { minRepeat = 12 } = {}) {
  if (events.length < minRepeat) return null;
  const keyOf = (e) => `${e.method || "GET"} ${pathnameOf(e.url || "")}`;
  let run = 1;
  for (let i = events.length - 1; i > 0; i--) {
    if (keyOf(events[i]) === keyOf(events[i - 1])) run++;
    else break;
  }
  if (run >= minRepeat) {
    return { class: "BLOCKING", reason: "request-loop", blocksPass: true, run };
  }
  return null;
}

/**
 * Classify a console message, optionally with linked network.
 * @returns {{ class: ClassLabel, reason: string, blocksPass: boolean }}
 */
export function classifyConsole(entry, ctx = {}, linkedNetwork = null) {
  const text = String(entry?.text || entry?.message || "");
  const type = String(entry?.type || "log").toLowerCase();

  if (/react devtools|download the react|extension/i.test(text)) {
    return { class: "DEVELOPMENT NOISE", reason: "devtools-or-extension", blocksPass: false };
  }
  if (/favicon\.ico/i.test(text)) {
    return { class: "DEVELOPMENT NOISE", reason: "favicon", blocksPass: false };
  }

  if (/typeerror|uncaught|react\.children\.only|unhandled promise|invariant|hydrat/i.test(text)) {
    return { class: "BLOCKING", reason: "js-exception", blocksPass: true };
  }
  if (type === "pageerror") {
    return { class: "BLOCKING", reason: "pageerror", blocksPass: true };
  }
  if (/maplibre|webgl|failed to initialize|_calcMatrices|canvas/i.test(text) && /error|fail|crash|null/i.test(text)) {
    return { class: "BLOCKING", reason: "map-canvas-crash", blocksPass: true };
  }
  if (/password|token|secret|authorization|cookie|session/i.test(text) && /leak|exposed|logged/i.test(text)) {
    return { class: "SECURITY", reason: "secret-in-console", blocksPass: true };
  }

  // Failed to load resource with status (Chrome often omits URL in console text)
  const m = text.match(/status of (\d{3})/i);
  if (/failed to load resource/i.test(text) || m) {
    const status = m ? Number(m[1]) : /unauthorized/i.test(text) ? 401 : /forbidden/i.test(text) ? 403 : 0;
    const urlMatch = text.match(/https?:\/\/[^\s]+|\/api\/[^\s:]+/i);
    let url = urlMatch ? urlMatch[0] : linkedNetwork?.url || "";
    // Pair with concurrent network 401/403 when console lacks path
    if (!url && (status === 401 || status === 403) && Array.isArray(ctx.recentNetwork)) {
      const hit = ctx.recentNetwork.find((n) => n.status === status && pathnameOf(n.url || "").startsWith("/api/"));
      if (hit) url = hit.url;
    }
    if ((status === 401 || status === 403) && !url && !ctx.authenticatedCustomer && (ctx.actorState === "anonymous" || !ctx.actorState)) {
      return { class: "EXPECTED", reason: "anon-resource-401-no-url", blocksPass: false };
    }
    const net = classifyNetwork(
      { method: "GET", status: status || linkedNetwork?.status || 0, url },
      ctx,
    );
    if (net.class === "EXPECTED") return { class: "EXPECTED", reason: net.reason, blocksPass: false };
    if (net.blocksPass) return { class: net.class === "BLOCKING" ? "BLOCKING" : "PRODUCT ERROR", reason: net.reason, blocksPass: true };
  }

  if (/chart.*zero|width.*0.*height.*0|invalid.*dimension/i.test(text)) {
    return { class: "PRODUCT WARNING", reason: "chart-zero-size", blocksPass: false };
  }

  if (type === "error") {
    return { class: "UNCLASSIFIED", reason: "error-unclassified", blocksPass: true };
  }
  if (type === "warning") {
    // Known maplibre null number noise from public map — still unclassified unless listed
    if (/expected value to be of type number, but found null/i.test(text)) {
      return { class: "PRODUCT WARNING", reason: "maplibre-null-number", blocksPass: false };
    }
    // Local QA on 127.0.0.1/localhost without Firebase authorized domain
    if (/not authorized for oauth|authorized domains|firebase console/i.test(text)) {
      return {
        class: "DEVELOPMENT NOISE",
        reason: "firebase-local-domain-oauth-warning-documented",
        blocksPass: false,
      };
    }
    return { class: "UNCLASSIFIED", reason: "warning-unclassified", blocksPass: true };
  }

  return { class: "DEVELOPMENT NOISE", reason: "info-log", blocksPass: false };
}

/**
 * Evaluate a batch of console + network for a step.
 * @returns {{ ok: boolean, blocking: Array, classifiedConsole: Array, classifiedNetwork: Array }}
 */
export function evaluateDeltas(consoleDelta = [], networkDelta = [], ctx = {}) {
  const ctxWithNet = { ...ctx, recentNetwork: networkDelta };
  const classifiedNetwork = networkDelta.map((e) => {
    const c = classifyNetwork(e, ctxWithNet);
    return {
      method: e.method,
      status: e.status,
      url: sanitizeUrl(e.url || ""),
      class: c.class,
      reason: c.reason,
      blocksPass: c.blocksPass,
    };
  });
  const classifiedConsole = consoleDelta.map((e) => {
    const c = classifyConsole(e, ctxWithNet);
    return { ...e, class: c.class, reason: c.reason, blocksPass: c.blocksPass, text: e.text };
  });

  const loop = detectRequestLoop(networkDelta);
  const rep = detectRepeatedAuthz(networkDelta);

  const blocking = [
    ...classifiedConsole.filter((x) => x.blocksPass),
    ...classifiedNetwork.filter((x) => x.blocksPass),
  ];
  if (loop) blocking.push(loop);
  if (rep) blocking.push(rep);

  const unclassified = [...classifiedConsole, ...classifiedNetwork].filter(
    (x) => x.class === "UNCLASSIFIED",
  );

  const ok = blocking.length === 0 && unclassified.length === 0;
  return { ok, blocking, unclassified, classifiedConsole, classifiedNetwork };
}
