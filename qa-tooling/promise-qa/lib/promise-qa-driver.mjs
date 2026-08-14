import { mkdirSync } from "fs";
import path from "path";

import { chromium, devices } from "playwright";
import { ConsoleLedger } from "./console-ledger.mjs";
import { Explorer } from "./explorer.mjs";
import { promiseQaObserverInit } from "./live-observer.mjs";
import { redactString, sanitizeUrl } from "./redact.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PROFILES = {
  desktop: {
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "Asia/Dhaka",
  },
  "mobile-390": {
    ...devices["iPhone 15"],
    viewport: { width: 390, height: 844 },
    locale: "en-US",
    timezoneId: "Asia/Dhaka",
  },
  "mobile-430": {
    ...devices["iPhone 15"],
    viewport: { width: 430, height: 932 },
    locale: "en-US",
    timezoneId: "Asia/Dhaka",
  },
  "mobile-584": {
    ...devices["iPhone 15"],
    viewport: { width: 584, height: 918 },
    locale: "en-US",
    timezoneId: "Asia/Dhaka",
  },
};

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function seedOf(text) {
  let seed = 2166136261;
  for (const character of String(text)) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function safeSessionName(name) {
  const value = String(name || "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)) {
    throw new Error("Session names must use 1-64 letters, numbers, hyphens, or underscores.");
  }
  return value;
}

function compactError(error) {
  return redactString(String(error?.message || error || "Unknown error")).slice(0, 500);
}

export class PromiseQaDriver {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || process.env.QA_BASE_URL || "http://127.0.0.1:5083";
    this.headless = options.headless ?? process.env.QA_HEADLESS === "1";
    this.channel = options.channel || process.env.QA_BROWSER_CHANNEL || "chrome";
    this.allowedHosts = new Set(
      String(options.allowedHosts || process.env.QA_ALLOWED_HOSTS || "127.0.0.1,localhost")
        .split(",")
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    );
    this.browser = null;
    this.sessions = new Map();
    this.sequence = 0;

    /**
     * One directory per server process, holding the console lanes and any
     * screenshot taken at the moment of a finding.
     *
     * Under mobile-qa/ because that is where this repo keeps QA artefacts and
     * where the cleanup rules already point. Nothing here is ever returned to
     * the agent as an image; the agent gets the path and a human opens it.
     */
    this.runDir = options.runDir
      || process.env.QA_RUN_DIR
      || path.join("mobile-qa", "qa-runs", new Date().toISOString().replace(/[:.]/g, "-"));
    // Created when a session first needs it, not at startup: a server that is
    // launched and never used should leave nothing behind.
  }

  profiles() {
    return Object.keys(PROFILES);
  }

  async ensureBrowser() {
    if (this.browser?.isConnected()) return this.browser;
    this.browser = await chromium.launch({
      channel: this.channel,
      headless: this.headless,
    });
    this.browser.on("disconnected", () => {
      this.browser = null;
      this.sessions.clear();
    });
    return this.browser;
  }

  resolveUrl(raw) {
    const url = new URL(String(raw || "/"), this.baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Promise QA allows only HTTP and HTTPS targets.");
    }
    const hostname = url.hostname.toLowerCase();
    const allowed = [...this.allowedHosts].some((host) => hostname === host || hostname.endsWith(`.${host}`));
    if (!allowed) {
      throw new Error(`Host ${hostname} is not allowed. Set QA_ALLOWED_HOSTS explicitly to add it.`);
    }
    return url.toString();
  }

  pushIssue(session, issue) {
    const now = Date.now();
    const signature = `${issue.code}:${issue.target || issue.url || "page"}`;
    const last = session.issueDedupe.get(signature) || 0;
    if (now - last < 1500) return null;
    session.issueDedupe.set(signature, now);
    const entry = {
      sequence: ++this.sequence,
      session: session.name,
      profile: session.profile,
      timestamp: new Date(now).toISOString(),
      ...issue,
    };
    session.issues.push(entry);
    if (session.issues.length > 500) session.issues.splice(0, session.issues.length - 500);
    return entry;
  }

  /**
   * Everything the browser says goes to the ledger, which sorts it into three
   * lanes and writes all three to disk.
   *
   * Red also raises an anomaly, because an uncaught exception or a 5xx is a
   * finding in its own right and the walk should be able to see it happen.
   * Amber and green do not: they are counted, kept, and stay out of the way.
   * Development noise used to be DROPPED here, which meant nobody could ever
   * check whether it deserved to be.
   */
  attachPageEvents(session, page) {
    const ctx = () => ({ actorState: session.actorState || "unknown" });

    page.on("console", (message) => {
      const row = session.ledger.console(message, ctx());
      if (row.lane === "red") {
        this.pushIssue(session, {
          code: "CONSOLE_ERROR",
          severity: "HIGH",
          target: "page",
          classification: row.classification,
          reason: row.reason,
          message: row.text.slice(0, 300),
          ledgerSeq: row.seq,
        });
      }
    });

    page.on("pageerror", (error) => {
      const row = session.ledger.pageError(error);
      this.pushIssue(session, {
        code: "PAGE_ERROR",
        severity: "HIGH",
        target: "page",
        message: row.text.slice(0, 300),
        ledgerSeq: row.seq,
      });
    });

    page.on("requestfailed", (request) => {
      const row = session.ledger.requestFailed(request);
      if (row.lane !== "red") return;
      this.pushIssue(session, {
        code: "REQUEST_FAILED",
        severity: "HIGH",
        target: "network",
        method: request.method(),
        url: sanitizeUrl(request.url()),
        reason: row.reason,
        ledgerSeq: row.seq,
      });
    });

    page.on("response", (response) => {
      if (response.status() < 400) return;
      const row = session.ledger.response(response, ctx());
      if (row.lane !== "red") return;
      this.pushIssue(session, {
        code: "HTTP_FAILURE",
        severity: "HIGH",
        target: "network",
        method: row.method,
        status: row.status,
        url: row.url,
        classification: row.classification,
        reason: row.reason,
        ledgerSeq: row.seq,
      });
    });
  }

  async createPage(session) {
    const page = await session.context.newPage();
    session.page = page;
    this.attachPageEvents(session, page);
    return page;
  }

  async open({ session: rawName, profile = "desktop", url = "/" }) {
    const name = safeSessionName(rawName);
    if (!PROFILES[profile]) throw new Error(`Unknown profile ${profile}.`);
    const targetUrl = this.resolveUrl(url);
    let session = this.sessions.get(name);
    if (session && session.profile !== profile) {
      throw new Error(`Session ${name} already uses profile ${session.profile}.`);
    }
    if (!session) {
      const browser = await this.ensureBrowser();
      const context = await browser.newContext(PROFILES[profile]);
      const evidenceDir = path.join(this.runDir, name);
      mkdirSync(evidenceDir, { recursive: true });
      session = {
        name,
        profile,
        context,
        page: null,
        issues: [],
        issueDedupe: new Map(),
        pointer: { x: 12, y: 12 },
        actionCount: 0,
        openedAt: new Date().toISOString(),
        evidenceDir,
        ledger: new ConsoleLedger({ dir: evidenceDir, session: name }),
        actorState: "unknown",
      };
      await context.exposeBinding("__promiseQaEmit", (_source, issue) => {
        this.pushIssue(session, issue);
      });
      await context.addInitScript(promiseQaObserverInit, {
        geometryIntervalMs: 500,
        layoutShiftThreshold: 0.005,
        jitterAmplitudePx: 3,
        jitterWindowMs: 2200,
      });
      context.on("page", (page) => {
        if (page === session.page) return;
        session.page = page;
        this.attachPageEvents(session, page);
      });
      this.sessions.set(name, session);
      await this.createPage(session);
    }
    await session.page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    const stability = await this.waitForStable(session.page);
    await this.scan(session);
    return {
      status: "OK",
      session: name,
      profile,
      url: sanitizeUrl(session.page.url()),
      title: (await session.page.title()).slice(0, 120),
      stability,
      anomalyCount: session.issues.length,
    };
  }

  session(rawName) {
    const name = safeSessionName(rawName);
    const session = this.sessions.get(name);
    if (!session?.page || session.page.isClosed()) throw new Error(`Session ${name} is not open.`);
    return session;
  }

  async waitForStable(page, options = {}) {
    const quietMs = Number(options.quietMs || 250);
    const timeoutMs = Number(options.timeoutMs || 3500);
    const started = Date.now();
    let stable = false;
    while (Date.now() - started < timeoutMs) {
      stable = await page.evaluate(({ quietMs }) => {
        const observer = window.__promiseQaObserver;
        if (!observer) return document.readyState !== "loading";
        const snapshot = observer.snapshot();
        const now = performance.now();
        const finiteAnimations = document.getAnimations().filter((animation) => {
          if (animation.playState !== "running") return false;
          const iterations = animation.effect?.getTiming?.().iterations;
          return iterations !== Infinity;
        });
        return now - snapshot.lastMutationAt >= quietMs
          && now - snapshot.lastLayoutAt >= quietMs
          && finiteAnimations.length === 0;
      }, { quietMs }).catch(() => false);
      if (stable) break;
      await sleep(75);
    }
    return { stable, settleMs: Date.now() - started };
  }

  async resolveTarget(page, target) {
    const value = String(target || "").trim();
    if (!value) throw new Error("A target is required.");
    const candidates = [];
    if (/^(#|\.|\[|\/\/|css=|xpath=)/.test(value)) {
      candidates.push({ locator: page.locator(value), source: "selector" });
    }
    candidates.push({ locator: page.getByTestId(value), source: "test-id" });
    const roles = ["button", "link", "textbox", "checkbox", "radio", "switch", "tab", "menuitem", "option"];
    for (const role of roles) {
      candidates.push({ locator: page.getByRole(role, { name: value, exact: true }), source: `role:${role}:exact` });
    }
    candidates.push({ locator: page.getByLabel(value, { exact: true }), source: "label" });
    candidates.push({ locator: page.getByPlaceholder(value, { exact: true }), source: "placeholder" });
    for (const role of roles) {
      candidates.push({ locator: page.getByRole(role, { name: value, exact: false }), source: `role:${role}:partial` });
    }
    candidates.push({ locator: page.getByText(value, { exact: true }), source: "text" });

    for (const candidate of candidates) {
      const count = await candidate.locator.count().catch(() => 0);
      if (!count) continue;
      const locator = candidate.locator.first();
      if (await locator.isVisible().catch(() => false)) return { locator, source: candidate.source, count };
    }
    throw new Error(`No visible target matched ${value}. Call qa_elements for compact candidates.`);
  }

  async humanPress(session, locator) {
    await locator.scrollIntoViewIfNeeded();
    await locator.waitFor({ state: "visible", timeout: 10000 });
    const box = await locator.boundingBox();
    if (!box) throw new Error("Target has no visible bounding box.");
    const random = seededRandom(seedOf(`${session.name}:${session.actionCount}`));
    const x = box.x + box.width * (0.45 + random() * 0.1);
    const y = box.y + box.height * (0.45 + random() * 0.1);
    if (PROFILES[session.profile].hasTouch) {
      const client = await session.context.newCDPSession(session.page);
      await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y, id: 0 }],
      });
      await sleep(55 + Math.round(random() * 55));
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await client.detach();
    } else {
      const start = session.pointer;
      const control1 = { x: start.x + (x - start.x) * 0.35, y: start.y + (random() - 0.5) * 36 };
      const control2 = { x: start.x + (x - start.x) * 0.75, y: y + (random() - 0.5) * 24 };
      for (let step = 1; step <= 14; step += 1) {
        const t = step / 14;
        const inverse = 1 - t;
        const px = inverse ** 3 * start.x
          + 3 * inverse ** 2 * t * control1.x
          + 3 * inverse * t ** 2 * control2.x
          + t ** 3 * x;
        const py = inverse ** 3 * start.y
          + 3 * inverse ** 2 * t * control1.y
          + 3 * inverse * t ** 2 * control2.y
          + t ** 3 * y;
        await session.page.mouse.move(px, py);
        await sleep(6 + Math.round(random() * 5));
      }
      await sleep(35 + Math.round(random() * 45));
      await session.page.mouse.down();
      await sleep(55 + Math.round(random() * 55));
      await session.page.mouse.up();
      session.pointer = { x, y };
    }
  }

  actionResult(session, action, target, startedAt, extra = {}) {
    const afterSequence = Number(extra.afterSequence || 0);
    const anomalies = session.issues.filter((issue) => issue.sequence > afterSequence);
    const { afterSequence: _ignored, ...rest } = extra;
    return {
      status: anomalies.some((issue) => issue.severity === "HIGH") ? "FAIL" : "OK",
      session: session.name,
      profile: session.profile,
      action,
      target,
      durationMs: Date.now() - startedAt,
      anomalyCount: anomalies.length,
      anomalies: anomalies.slice(-20),
      ...rest,
    };
  }

  async press({ session: rawName, target }) {
    const session = this.session(rawName);
    const startedAt = Date.now();
    const afterSequence = this.sequence;
    session.actionCount += 1;
    const resolved = await this.resolveTarget(session.page, target);
    await this.humanPress(session, resolved.locator);
    const stability = await this.waitForStable(session.page);
    await this.scan(session);
    return this.actionResult(session, "press", target, startedAt, {
      afterSequence,
      locatorSource: resolved.source,
      matchedElements: resolved.count,
      stability,
      url: sanitizeUrl(session.page.url()),
    });
  }

  async type({ session: rawName, target, text, replace = true }) {
    const session = this.session(rawName);
    const startedAt = Date.now();
    const afterSequence = this.sequence;
    session.actionCount += 1;
    const resolved = await this.resolveTarget(session.page, target);
    await this.humanPress(session, resolved.locator);
    if (replace) {
      await session.page.keyboard.press("ControlOrMeta+A");
      await session.page.keyboard.press("Backspace");
    }
    const delay = 35 + (seedOf(`${session.name}:${session.actionCount}:type`) % 46);
    await resolved.locator.pressSequentially(String(text), { delay });
    const stability = await this.waitForStable(session.page);
    await this.scan(session);
    return this.actionResult(session, "type", target, startedAt, {
      afterSequence,
      locatorSource: resolved.source,
      characters: [...String(text)].length,
      stability,
    });
  }

  async key({ session: rawName, key }) {
    const session = this.session(rawName);
    const startedAt = Date.now();
    const afterSequence = this.sequence;
    session.actionCount += 1;
    await session.page.keyboard.press(String(key));
    const stability = await this.waitForStable(session.page);
    await this.scan(session);
    return this.actionResult(session, "key", key, startedAt, { afterSequence, stability });
  }

  async scrollSnapshot(page) {
    return page.evaluate(() => {
      const candidates = [document.scrollingElement, ...document.querySelectorAll("*")]
        .filter((element) => {
          if (!(element instanceof HTMLElement)) return false;
          const style = getComputedStyle(element);
          return (style.overflowY === "auto" || style.overflowY === "scroll")
            && element.scrollHeight > element.clientHeight + 4
            && element.clientHeight > 100;
        });
      candidates.sort((left, right) => (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight));
      const element = candidates[0];
      if (!element) return null;
      return {
        scrollTop: Math.round(element.scrollTop),
        maxScroll: Math.max(0, Math.round(element.scrollHeight - element.clientHeight)),
        clientHeight: Math.round(element.clientHeight),
      };
    });
  }

  async humanScroll(session, direction = "down", distance = 460) {
    const page = session.page;
    const viewport = page.viewportSize() || { width: 1440, height: 900 };
    const sign = direction === "up" ? -1 : 1;
    if (PROFILES[session.profile].hasTouch) {
      const client = await session.context.newCDPSession(page);
      const startY = sign > 0 ? viewport.height * 0.76 : viewport.height * 0.28;
      const endY = startY - sign * Math.min(distance, viewport.height * 0.58);
      const steps = 22;
      await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: viewport.width / 2, y: startY, id: 0 }],
      });
      for (let step = 1; step <= steps; step += 1) {
        const t = 1 - (1 - step / steps) ** 3;
        await client.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: viewport.width / 2, y: startY + (endY - startY) * t, id: 0 }],
        });
        await sleep(13);
      }
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await client.detach();
    } else {
      await page.mouse.move(viewport.width / 2, viewport.height * 0.58);
      const weights = [0.18, 0.3, 0.28, 0.16, 0.08];
      for (const weight of weights) {
        await page.mouse.wheel(0, sign * distance * weight);
        await sleep(35);
      }
    }
  }

  async scroll({ session: rawName, direction = "down", distance = 460 }) {
    const session = this.session(rawName);
    if (direction !== "down" && direction !== "up") throw new Error("Direction must be down or up.");
    const startedAt = Date.now();
    const afterSequence = this.sequence;
    session.actionCount += 1;
    const before = await this.scrollSnapshot(session.page);
    await this.humanScroll(session, direction, Number(distance));
    await sleep(180);
    const after = await this.scrollSnapshot(session.page);
    const delta = (after?.scrollTop || 0) - (before?.scrollTop || 0);
    const atBoundary = direction === "down"
      ? Boolean(after && after.scrollTop >= after.maxScroll - 3)
      : Boolean(after && after.scrollTop <= 3);
    if (before && after && Math.abs(delta) < 2 && !atBoundary) {
      this.pushIssue(session, {
        code: "SCROLL_STALLED",
        severity: "HIGH",
        target: "primary-scroll",
        direction,
        scrollTopBefore: before.scrollTop,
        scrollTopAfter: after.scrollTop,
        remainingPx: Math.max(0, after.maxScroll - after.scrollTop),
      });
    }
    const stability = await this.waitForStable(session.page);
    await this.scan(session);
    return this.actionResult(session, "scroll", direction, startedAt, {
      afterSequence,
      before,
      after,
      deltaPx: delta,
      atBoundary,
      stability,
    });
  }

  async scrollToEnd({ session: rawName, direction = "down", maxGestures = 18 }) {
    const session = this.session(rawName);
    const startedAt = Date.now();
    const afterSequence = this.sequence;
    let gestures = 0;
    let reached = false;
    let previous = await this.scrollSnapshot(session.page);
    while (gestures < Math.min(40, Math.max(1, Number(maxGestures)))) {
      if (!previous) {
        reached = true;
        break;
      }
      reached = direction === "down" ? previous.scrollTop >= previous.maxScroll - 3 : previous.scrollTop <= 3;
      if (reached) break;
      await this.humanScroll(session, direction, 480);
      gestures += 1;
      await sleep(150);
      const current = await this.scrollSnapshot(session.page);
      if (!current) {
        reached = true;
        previous = current;
        break;
      }
      if (Math.abs(current.scrollTop - previous.scrollTop) < 2) {
        this.pushIssue(session, {
          code: "SCROLL_STALLED",
          severity: "HIGH",
          target: "primary-scroll",
          direction,
          scrollTopBefore: previous.scrollTop,
          scrollTopAfter: current.scrollTop,
          remainingPx: Math.max(0, current.maxScroll - current.scrollTop),
        });
        previous = current;
        break;
      }
      previous = current;
    }
    if (previous) {
      reached = direction === "down" ? previous.scrollTop >= previous.maxScroll - 3 : previous.scrollTop <= 3;
    }
    if (!reached) {
      this.pushIssue(session, {
        code: "SCROLL_END_NOT_REACHED",
        severity: "HIGH",
        target: "primary-scroll",
        direction,
        gestures,
      });
    }
    const stability = await this.waitForStable(session.page);
    await this.scan(session);
    return this.actionResult(session, "scroll-to-end", direction, startedAt, {
      afterSequence,
      gestures,
      reached,
      final: previous,
      stability,
    });
  }

  async elements({ session: rawName, query = "", limit = 60 }) {
    const session = this.session(rawName);
    const safeLimit = Math.min(100, Math.max(1, Number(limit)));
    const elements = await session.page.evaluate(({ query, limit }) => {
      const selector = [
        "button",
        "a[href]",
        "input:not([type=hidden])",
        "select",
        "textarea",
        "[role=button]",
        "[role=link]",
        "[role=checkbox]",
        "[role=radio]",
        "[role=switch]",
        "[role=tab]",
      ].join(",");
      const needle = query.trim().toLocaleLowerCase();
      const results = [];
      for (const element of document.querySelectorAll(selector)) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (rect.width <= 0 || rect.height <= 0 || style.visibility === "hidden" || style.display === "none") continue;
        const label = element.getAttribute("aria-label")
          || element.getAttribute("placeholder")
          || element.getAttribute("title")
          || (element.labels?.[0]?.textContent || "")
          || (element.textContent || "");
        const normalized = label.trim().replace(/\s+/g, " ").slice(0, 100);
        if (needle && !normalized.toLocaleLowerCase().includes(needle)) continue;
        results.push({
          role: element.getAttribute("role") || element.tagName.toLowerCase(),
          name: normalized,
          testId: element.getAttribute("data-testid") || undefined,
          disabled: Boolean(element.disabled || element.getAttribute("aria-disabled") === "true"),
          box: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        });
        if (results.length >= limit) break;
      }
      return results;
    }, { query: String(query), limit: safeLimit });
    return { status: "OK", session: session.name, count: elements.length, elements };
  }

  async scan(session) {
    return session.page.evaluate(() => {
      const observer = window.__promiseQaObserver;
      if (!observer) return { observerInstalled: false };
      const geometry = observer.scanNow();
      return { observerInstalled: true, geometry, state: observer.snapshot() };
    }).catch((error) => ({ observerInstalled: false, error: compactError(error) }));
  }

  async check({ session: rawName }) {
    const session = this.session(rawName);
    const startedAt = Date.now();
    const afterSequence = this.sequence;
    const scan = await this.scan(session);
    await sleep(50);
    return this.actionResult(session, "check", "page", startedAt, { afterSequence, scan });
  }

  async status({ session: rawName } = {}) {
    if (rawName) {
      const session = this.session(rawName);
      const scan = await this.scan(session);
      const high = session.issues.filter((issue) => issue.severity === "HIGH").length;
      return {
        status: high ? "FAIL" : "OK",
        session: session.name,
        profile: session.profile,
        url: sanitizeUrl(session.page.url()),
        observer: scan,
        anomalyCount: session.issues.length,
        highSeverityCount: high,
        lastSequence: this.sequence,
      };
    }
    const sessions = [];
    for (const session of this.sessions.values()) {
      sessions.push({
        session: session.name,
        profile: session.profile,
        url: sanitizeUrl(session.page?.url() || ""),
        anomalyCount: session.issues.length,
        highSeverityCount: session.issues.filter((issue) => issue.severity === "HIGH").length,
      });
    }
    return {
      status: sessions.some((session) => session.highSeverityCount) ? "FAIL" : "OK",
      browserConnected: Boolean(this.browser?.isConnected()),
      sessionCount: sessions.length,
      sessions,
      lastSequence: this.sequence,
    };
  }

  anomalies({ session: rawName, after = 0, limit = 100 }) {
    const session = this.session(rawName);
    const safeLimit = Math.min(200, Math.max(1, Number(limit)));
    const anomalies = session.issues.filter((issue) => issue.sequence > Number(after)).slice(0, safeLimit);
    return {
      status: anomalies.some((issue) => issue.severity === "HIGH") ? "FAIL" : "OK",
      session: session.name,
      count: anomalies.length,
      anomalies,
      nextCursor: anomalies.at(-1)?.sequence || Number(after),
      hasMore: session.issues.some((issue) => issue.sequence > (anomalies.at(-1)?.sequence || Number(after))),
    };
  }

  /**
   * Walk the app alone and come back with a verdict.
   *
   * The whole reason this exists: the same crawl driven through qa_action from
   * outside costs a round trip per press — about a hundred and fifty of them
   * for a real admin sweep, each carrying JSON both ways for a reader who only
   * wanted the summary. The loop is not the intelligent part. It belongs in
   * the process that already owns the browser.
   *
   * Destructive-looking controls are never pressed unless somebody explicitly
   * asks for that, and the request is refused outright against a host that is
   * not local unless somebody explicitly allows that too. An unattended
   * crawler in this admin panel could otherwise close a register or delete a
   * customer, and that has very nearly happened before.
   */
  async explore(input = {}) {
    const session = this.session(input.session);
    const startedAt = Date.now();

    const hostname = new URL(session.page.url()).hostname.toLowerCase();
    const isLocal = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
    if (!isLocal && process.env.QA_ALLOW_REMOTE_EXPLORE !== "1") {
      throw new Error(
        `Refusing to explore ${hostname} unattended. This walk presses controls on its own; `
        + "set QA_ALLOW_REMOTE_EXPLORE=1 only if you mean it.",
      );
    }
    if (input.allowDestructive && process.env.QA_ALLOW_DESTRUCTIVE !== "1") {
      throw new Error(
        "allowDestructive also needs QA_ALLOW_DESTRUCTIVE=1 in the server environment. "
        + "Two locks, because one of these buttons closes the till.",
      );
    }

    const cursor = this.sequence;
    const explorer = new Explorer({ driver: this, session }, {
      ...input,
      evidenceDir: session.evidenceDir,
    });
    const walk = await explorer.run();

    const anomalies = session.issues.filter((issue) => issue.sequence > cursor);
    const high = anomalies.filter((issue) => issue.severity === "HIGH").length;
    const ledger = session.ledger.digest();

    /**
     * FAIL on evidence, not on effort. A walk that ran out of budget with
     * nothing wrong is not a failure, and a walk that found one uncaught
     * exception is, however far it got.
     */
    return {
      status: high > 0 || ledger.counts.red > 0 ? "FAIL" : "OK",
      session: session.name,
      profile: session.profile,
      durationMs: Date.now() - startedAt,
      walk: {
        steps: walk.steps,
        statesVisited: walk.statesVisited,
        pathsVisited: walk.pathsVisited,
        budgetExhausted: walk.budgetExhausted,
        skipped: walk.skipped,
      },
      findings: walk.findings,
      unreachable: walk.unreachable,
      console: ledger,
      evidenceDir: session.evidenceDir,
    };
  }

  report() {
    const sessions = [];
    const totals = { sessions: 0, anomalies: 0, high: 0, medium: 0 };
    for (const session of this.sessions.values()) {
      const byCode = {};
      for (const issue of session.issues) {
        byCode[issue.code] = (byCode[issue.code] || 0) + 1;
        totals.anomalies += 1;
        if (issue.severity === "HIGH") totals.high += 1;
        else totals.medium += 1;
      }
      sessions.push({
        session: session.name,
        profile: session.profile,
        url: sanitizeUrl(session.page?.url() || ""),
        anomalyCount: session.issues.length,
        byCode,
      });
    }
    totals.sessions = sessions.length;
    return {
      verdict: totals.high ? "FAIL" : sessions.length ? "PASS" : "NOT VERIFIED",
      generatedAt: new Date().toISOString(),
      screenshotsCaptured: 0,
      imagesSentToModel: 0,
      totals,
      sessions,
    };
  }

  async close({ session: rawName } = {}) {
    if (rawName) {
      const name = safeSessionName(rawName);
      const session = this.sessions.get(name);
      if (!session) return { status: "OK", session: name, closed: false };
      await session.context.close();
      this.sessions.delete(name);
      return { status: "OK", session: name, closed: true };
    }
    for (const session of this.sessions.values()) {
      await session.context.close().catch(() => {});
    }
    this.sessions.clear();
    await this.browser?.close().catch(() => {});
    this.browser = null;
    return { status: "OK", closedAll: true };
  }
}
