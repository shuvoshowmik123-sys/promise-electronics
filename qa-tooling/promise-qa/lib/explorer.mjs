/**
 * One call that walks the app by itself, instead of a hundred that ask.
 *
 * The driver's tools are one action each: open, elements, action, anomalies.
 * Driving a thirty-tab crawl through them costs about a hundred and fifty
 * round trips, and every one of them carries JSON in both directions for a
 * reader who only ever wanted the answer at the end. The exploring is not
 * hard — pick an unvisited control, press it, look at what happened, repeat —
 * it is just a loop, and a loop belongs in the process that owns the browser.
 *
 * So this runs the whole walk in one call and returns a verdict. The agent
 * spends roughly one message where it used to spend a hundred and fifty.
 *
 * There is no model in here and there does not need to be. The decisions are
 * "which control have I not pressed yet" and "did the page change", both of
 * which the DOM answers exactly. A vision model would answer them approximately
 * and slowly.
 *
 * ─── The part to read before running it unattended ───
 *
 * A crawler loose in an admin panel will press whatever it finds, and this
 * particular admin panel can delete customers, close a cash register, message
 * people, and issue credentials. It has happened: a QA run once opened a live
 * register on production.
 *
 * So the default is that anything whose label looks destructive is NEVER
 * pressed, only recorded as skipped. Widening that is an explicit argument, not
 * a default, and there is a hard refusal to run against any host that is not
 * local unless someone says so out loud.
 */
import { mkdirSync } from "fs";
import path from "path";

/**
 * Labels that are never pressed.
 *
 * Deliberately broad, and deliberately matched against the visible label rather
 * than a selector: the button that wipes the day's takings is identified by the
 * word on it, not by its class name. False positives here cost a little
 * coverage. False negatives cost real data.
 */
export const DESTRUCTIVE_LABEL = new RegExp([
  "delete", "remove", "destroy", "wipe", "purge", "clear all", "reset",
  "close register", "close shift", "day close", "end of day",
  "sign out", "log out", "logout",
  "cancel order", "cancel job", "cancel request", "void", "refund",
  "send", "submit payment", "pay now", "confirm payment", "checkout",
  "issue", "generate code", "reset link", "revoke",
  "approve", "decline", "reject", "accept quote",
  "publish", "deploy", "migrate", "restore", "backup",
  "assign", "dispatch", "complete", "deliver", "handover",
  "merge", "archive", "block", "blacklist", "suspend", "deactivate",
].join("|"), "i");

/** Controls that navigate away from the app under test. */
const EXTERNAL_HREF = /^(https?:)?\/\//i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A stable fingerprint for "the page as it now stands".
 *
 * Path plus the shape of what can be interacted with. Two renders of the same
 * screen with different data produce the same signature, which is what makes
 * the walk terminate: a list of two hundred repairs is one state, not two
 * hundred.
 */
function stateSignature(pathname, elements) {
  const shape = elements
    .map((element) => `${element.role}:${element.name.slice(0, 24)}`)
    .sort()
    .slice(0, 40)
    .join("|");
  let hash = 2166136261;
  for (const character of shape) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${pathname}#${(hash >>> 0).toString(36)}`;
}

function elementKey(element) {
  return `${element.role}:${element.testId || element.name}`.slice(0, 120);
}

/**
 * How long a person would look at this before touching anything.
 *
 * Not decoration. Pressing the next control 40ms after a screen paints tests a
 * sequence no customer will ever perform, and it hides everything that only
 * appears once the page has settled — the late toast, the list that reflows
 * when its data arrives, the button that moves out from under a thumb.
 */
function readingPauseMs(textLength, random) {
  const words = Math.max(1, Math.round(textLength / 5.5));
  const base = Math.min(2600, 220 + words * 12);
  return Math.round(base * (0.75 + random() * 0.5));
}

export class Explorer {
  /**
   * @param {object} deps
   * @param {import("./promise-qa-driver.mjs").PromiseQaDriver} deps.driver
   * @param {object} deps.session Driver session record.
   * @param {object} [options]
   */
  constructor({ driver, session }, options = {}) {
    this.driver = driver;
    this.session = session;
    this.options = {
      maxSteps: Math.min(400, Math.max(1, Number(options.maxSteps ?? 60))),
      maxMs: Math.min(30 * 60_000, Math.max(5_000, Number(options.maxMs ?? 240_000))),
      maxDepth: Math.min(12, Math.max(1, Number(options.maxDepth ?? 4))),
      /** Press controls whose label looks destructive. Off, and stays off. */
      allowDestructive: options.allowDestructive === true,
      /** Extra labels to leave alone, on top of the built-in list. */
      avoid: options.avoid ? new RegExp(String(options.avoid), "i") : null,
      /** Only walk inside these path prefixes. Empty means anywhere on host. */
      scope: Array.isArray(options.scope) ? options.scope.filter(Boolean) : [],
      /** Scroll the whole page at each new screen before pressing anything. */
      scrollEachState: options.scrollEachState !== false,
      evidenceDir: options.evidenceDir || null,
      seed: Number(options.seed ?? 20260814),
    };

    this.startUrl = null;
    this.visitedStates = new Set();
    this.pressedKeys = new Set();
    this.steps = [];
    this.skipped = [];
    this.startedAt = 0;
    this.shotCount = 0;

    let value = this.options.seed >>> 0;
    this.random = () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 0x100000000;
    };

    if (this.options.evidenceDir) mkdirSync(this.options.evidenceDir, { recursive: true });
  }

  budgetLeft() {
    return this.steps.length < this.options.maxSteps
      && Date.now() - this.startedAt < this.options.maxMs;
  }

  inScope(pathname) {
    if (this.options.scope.length === 0) return true;
    return this.options.scope.some((prefix) => pathname.startsWith(prefix));
  }

  shouldAvoid(element) {
    if (element.disabled) return "disabled";
    if (!element.name && !element.testId) return "unlabelled";
    const label = `${element.name} ${element.testId || ""}`;
    if (!this.options.allowDestructive && DESTRUCTIVE_LABEL.test(label)) return "destructive-label";
    if (this.options.avoid?.test(label)) return "avoid-list";
    if (element.href && EXTERNAL_HREF.test(element.href) && !element.href.includes(this.hostname)) {
      return "external-link";
    }
    return null;
  }

  /**
   * Interactive controls plus the two facts the walk needs that qa_elements
   * does not carry: where a link goes, and how much text is on the screen.
   */
  async survey() {
    const page = this.session.page;
    return page.evaluate(() => {
      const selector = [
        "button", "a[href]", "input:not([type=hidden])", "select", "textarea",
        "[role=button]", "[role=link]", "[role=checkbox]", "[role=radio]",
        "[role=switch]", "[role=tab]", "[role=menuitem]",
      ].join(",");
      const elements = [];
      for (const element of document.querySelectorAll(selector)) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (style.visibility === "hidden" || style.display === "none") continue;
        if (Number.parseFloat(style.opacity || "1") < 0.05) continue;
        const label = element.getAttribute("aria-label")
          || element.getAttribute("placeholder")
          || element.getAttribute("title")
          || (element.labels?.[0]?.textContent || "")
          || (element.textContent || "");
        elements.push({
          role: element.getAttribute("role") || element.tagName.toLowerCase(),
          name: label.trim().replace(/\s+/g, " ").slice(0, 80),
          testId: element.getAttribute("data-testid") || undefined,
          href: element.getAttribute("href") || undefined,
          disabled: Boolean(element.disabled || element.getAttribute("aria-disabled") === "true"),
          inViewport: rect.top < innerHeight && rect.bottom > 0,
        });
        if (elements.length >= 120) break;
      }
      return {
        pathname: location.pathname,
        textLength: (document.body?.innerText || "").length,
        elements,
      };
    }).catch(() => ({ pathname: "", textLength: 0, elements: [] }));
  }

  /**
   * A picture, but only where something went wrong.
   *
   * Screenshots of screens that behaved are the reason evidence folders reach a
   * gigabyte and nobody opens them.
   */
  async captureFinding(label) {
    if (!this.options.evidenceDir) return null;
    this.shotCount += 1;
    const file = path.join(
      this.options.evidenceDir,
      `finding-${String(this.shotCount).padStart(3, "0")}-${label}.png`,
    );
    try {
      await this.session.page.screenshot({ path: file, fullPage: false });
      return file;
    } catch {
      return null;
    }
  }

  async run() {
    this.startedAt = Date.now();
    const page = this.session.page;
    this.startUrl = page.url();
    this.hostname = new URL(this.startUrl).hostname;

    let depth = 0;

    while (this.budgetLeft()) {
      const survey = await this.survey();
      if (!survey.pathname) break;

      const signature = stateSignature(survey.pathname, survey.elements);
      const firstVisit = !this.visitedStates.has(signature);
      this.visitedStates.add(signature);

      // A person reads a new screen before touching it. So does this.
      if (firstVisit) {
        await sleep(readingPauseMs(survey.textLength, this.random));
        if (this.options.scrollEachState) {
          // Scrolling is not navigation: it is how the harness sees the parts
          // of the page that only render, or only misbehave, below the fold.
          await this.driver.scrollToEnd({ session: this.session.name, direction: "down", maxGestures: 8 })
            .catch(() => { });
          await this.driver.scrollToEnd({ session: this.session.name, direction: "up", maxGestures: 8 })
            .catch(() => { });
        }
      }

      const candidate = this.pickNext(survey, signature);

      if (!candidate) {
        // Nothing left here. Go back if there is anywhere to go back to,
        // otherwise return to the start and let the frontier carry the walk.
        if (depth > 0) {
          depth -= 1;
          await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => { });
          await this.driver.waitForStable(page);
          continue;
        }
        const unexplored = await this.returnToStart();
        if (!unexplored) break;
        continue;
      }

      const before = { url: page.url(), signature };
      const stepResult = await this.pressCandidate(candidate, survey);
      const after = page.url();
      if (after !== before.url) depth = Math.min(this.options.maxDepth, depth + 1);

      this.steps.push(stepResult);

      if (depth >= this.options.maxDepth) {
        await this.returnToStart();
        depth = 0;
      }
    }

    return this.summarise();
  }

  pickNext(survey, signature) {
    for (const element of survey.elements) {
      const key = `${signature}::${elementKey(element)}`;
      if (this.pressedKeys.has(key)) continue;
      const avoid = this.shouldAvoid(element);
      if (avoid) {
        // Recorded once, not every time the screen is revisited: "what did it
        // refuse to touch" is a question worth answering, but not 200 times.
        if (!this.pressedKeys.has(key)) {
          this.pressedKeys.add(key);
          this.skipped.push({ name: element.name || element.testId, reason: avoid });
        }
        continue;
      }
      this.pressedKeys.add(key);
      return element;
    }
    return null;
  }

  async pressCandidate(element, survey) {
    const target = element.testId || element.name;
    const startedAt = Date.now();
    const cursor = this.driver.sequence;
    const ledger = this.session.ledger;

    ledger?.noteAction({ action: "press", target, pathname: survey.pathname });

    let error = null;
    try {
      await this.driver.press({ session: this.session.name, target });
    } catch (pressError) {
      error = String(pressError?.message || pressError).slice(0, 200);
    }

    const newIssues = this.session.issues.filter((issue) => issue.sequence > cursor);
    const high = newIssues.filter((issue) => issue.severity === "HIGH");

    let evidence = null;
    if (high.length > 0) {
      evidence = await this.captureFinding(
        `${high[0].code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      );
    }

    return {
      step: this.steps.length + 1,
      pathname: survey.pathname,
      target,
      role: element.role,
      durationMs: Date.now() - startedAt,
      error,
      urlAfter: new URL(this.session.page.url()).pathname,
      findings: high.map((issue) => ({
        code: issue.code,
        target: issue.target,
        severity: issue.severity,
      })),
      evidence,
    };
  }

  /** Back to where the walk began, and say whether anything is left to do. */
  async returnToStart() {
    const before = this.visitedStates.size;
    await this.session.page.goto(this.startUrl, { waitUntil: "domcontentloaded" }).catch(() => { });
    await this.driver.waitForStable(this.session.page);
    const survey = await this.survey();
    const signature = stateSignature(survey.pathname, survey.elements);
    return survey.elements.some((element) => {
      if (this.shouldAvoid(element)) return false;
      return !this.pressedKeys.has(`${signature}::${elementKey(element)}`);
    }) || this.visitedStates.size > before;
  }

  /**
   * What comes back to the agent.
   *
   * Findings grouped by code and target rather than listed one by one: forty
   * occurrences of one overflowing table is one bug, and printing it forty
   * times is how a report becomes unreadable and expensive at the same time.
   */
  summarise() {
    const grouped = new Map();
    for (const step of this.steps) {
      for (const finding of step.findings) {
        const key = `${finding.code}::${finding.target}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.occurrences += 1;
          if (!existing.paths.includes(step.pathname) && existing.paths.length < 6) {
            existing.paths.push(step.pathname);
          }
          continue;
        }
        grouped.set(key, {
          code: finding.code,
          target: finding.target,
          severity: finding.severity,
          occurrences: 1,
          paths: [step.pathname],
          firstStep: step.step,
          evidence: step.evidence || undefined,
        });
      }
    }

    const findings = [...grouped.values()].sort((a, b) => b.occurrences - a.occurrences);
    const failedSteps = this.steps.filter((step) => step.error);
    const skippedByReason = {};
    for (const item of this.skipped) {
      skippedByReason[item.reason] = (skippedByReason[item.reason] || 0) + 1;
    }

    return {
      steps: this.steps.length,
      durationMs: Date.now() - this.startedAt,
      statesVisited: this.visitedStates.size,
      pathsVisited: [...new Set(this.steps.map((step) => step.pathname))].sort(),
      findings,
      /**
       * Not a failure on its own. A control that would not respond is
       * sometimes the bug and sometimes a modal that closed underneath it, and
       * the difference is not decidable from here.
       */
      unreachable: failedSteps.slice(0, 10).map((step) => ({
        target: step.target,
        pathname: step.pathname,
        error: step.error,
      })),
      skipped: skippedByReason,
      budgetExhausted: !this.budgetLeft(),
    };
  }
}
