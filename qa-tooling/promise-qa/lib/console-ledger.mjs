/**
 * Three ledgers for everything the browser says, instead of one.
 *
 * The driver used to fold console output, page errors and failed requests into
 * the same anomaly array as layout findings, truncate each to 300 characters,
 * and DROP anything classified as development noise. Three things were wrong
 * with that, and each one cost something real:
 *
 *   Dropped noise cannot be audited. When a message is discarded at the point
 *   of classification, nobody can ever check whether the classifier was right
 *   to discard it. A misfiled product error simply never existed.
 *
 *   A truncated stack trace is not a stack trace. 300 characters reaches the
 *   error message and the first frame; the frame that names YOUR file is
 *   usually further down.
 *
 *   One stream means the loud drown the important. A page emitting forty React
 *   key warnings buries the single uncaught TypeError underneath them.
 *
 * So: three ledgers, by what the reader has to do about them.
 *
 *   GREEN   expected, and development noise. Counted, written to disk, and
 *           never shown to anybody. Quarantined, not deleted.
 *   AMBER   product warnings. Counted, one line each, no stack.
 *   RED     uncaught exceptions, 5xx, failed requests, missing assets. Full
 *           text, full stack, and the action that immediately preceded them —
 *           because "what did I just do" is the first question anybody asks.
 *
 * Only RED and the AMBER digest travel back to the agent. Everything, GREEN
 * included, goes to disk as JSONL for inspection afterwards. That is the whole
 * point: cheap to read, complete to audit.
 */
import { appendFileSync, mkdirSync } from "fs";
import path from "path";

import { classifyConsole, classifyNetwork } from "./classify.mjs";
import { redactString, sanitizeUrl } from "./redact.mjs";

/** Lane names are also the file names, so the disk layout explains itself. */
export const LANES = ["red", "amber", "green"];

/**
 * Full text on disk, a readable head in memory.
 *
 * Long enough for a real stack: message plus roughly a dozen frames. The
 * on-disk copy is never truncated at all.
 */
const MEMORY_TEXT_LIMIT = 2000;

/** Beyond this many in one lane, memory keeps the newest and disk keeps all. */
const MEMORY_ROWS_PER_LANE = 200;

/**
 * Which lane a classification belongs in.
 *
 * BLOCKING and PRODUCT ERROR are things the shop would call bugs. PRODUCT
 * WARNING is worth a line. Everything else is noise that has to be kept but
 * must never be read.
 */
export function laneFor(classLabel, { blocksPass = false } = {}) {
  if (blocksPass) return "red";
  switch (classLabel) {
    case "BLOCKING":
    case "PRODUCT ERROR":
    case "SECURITY":
      return "red";
    case "PRODUCT WARNING":
    case "UNCLASSIFIED":
      return "amber";
    default:
      return "green";
  }
}

export class ConsoleLedger {
  /**
   * @param {object} options
   * @param {string} [options.dir] Where the JSONL files go. Omitted means
   *   memory only, which is what the unit tests use.
   * @param {string} [options.session]
   */
  constructor(options = {}) {
    this.dir = options.dir || null;
    this.session = options.session || "default";
    this.rows = { red: [], amber: [], green: [] };
    this.counts = { red: 0, amber: 0, green: 0 };
    /** Reason → count, so a quarantined lane can still be summarised. */
    this.greenReasons = new Map();
    this.sequence = 0;
    /**
     * The last thing the harness did. Attached to every RED row, because the
     * action before an exception is most of the diagnosis.
     */
    this.lastAction = null;

    if (this.dir) mkdirSync(this.dir, { recursive: true });
  }

  /** Called by the explorer before each step. */
  noteAction(action) {
    this.lastAction = action ? { ...action, at: new Date().toISOString() } : null;
  }

  record(entry) {
    const lane = entry.lane;
    this.sequence += 1;
    this.counts[lane] += 1;

    const row = {
      seq: this.sequence,
      at: new Date().toISOString(),
      session: this.session,
      ...entry,
    };

    if (lane === "red" && this.lastAction) row.afterAction = this.lastAction;

    // Disk first, and untruncated. If the process dies mid-run, what it already
    // saw is still on disk.
    if (this.dir) {
      try {
        appendFileSync(path.join(this.dir, `console-${lane}.jsonl`), `${JSON.stringify(row)}\n`);
      } catch {
        /* A ledger that cannot write must not take the run down with it. */
      }
    }

    if (lane === "green") {
      // Counted by reason and otherwise forgotten. Holding the text of forty
      // thousand React warnings in memory helps nobody.
      const key = row.reason || row.classification || "unclassified";
      this.greenReasons.set(key, (this.greenReasons.get(key) || 0) + 1);
      return row;
    }

    const inMemory = { ...row, text: String(row.text || "").slice(0, MEMORY_TEXT_LIMIT) };
    this.rows[lane].push(inMemory);
    if (this.rows[lane].length > MEMORY_ROWS_PER_LANE) this.rows[lane].shift();
    return inMemory;
  }

  /** A console message from the page. */
  console(message, ctx = {}) {
    const type = message.type();
    const text = redactString(message.text());
    const classification = classifyConsole({ type, text }, ctx);

    // Everything below warning is noise by definition — log, info, debug. It is
    // still recorded, because "the page said nothing at all" and "the page
    // logged 900 lines" are different facts about a build.
    const lane = (type === "error" || type === "warning")
      ? laneFor(classification.class, classification)
      : "green";

    const location = message.location?.() || {};
    return this.record({
      lane,
      kind: "console",
      type,
      text,
      classification: classification.class,
      reason: classification.reason,
      source: location.url ? `${sanitizeUrl(location.url)}:${location.lineNumber ?? 0}` : undefined,
    });
  }

  /**
   * An uncaught exception. Always red, never classified.
   *
   * Nothing throws on purpose. If the page raised it and nobody caught it, the
   * shop wants to know regardless of what any allowlist says.
   */
  pageError(error) {
    return this.record({
      lane: "red",
      kind: "pageerror",
      type: "exception",
      text: redactString(String(error?.message || error || "Unknown error")),
      stack: redactString(String(error?.stack || "")),
      classification: "PRODUCT ERROR",
      reason: "uncaught-exception",
    });
  }

  /** A response the server was unhappy about. */
  response(response, ctx = {}) {
    const request = response.request();
    const status = response.status();
    const network = { method: request.method(), status, url: response.url() };
    const classification = classifyNetwork(network, ctx);
    return this.record({
      lane: laneFor(classification.class, classification),
      kind: "network",
      type: `http-${status}`,
      method: network.method,
      status,
      url: sanitizeUrl(network.url),
      text: `${network.method} ${sanitizeUrl(network.url)} → ${status}`,
      classification: classification.class,
      reason: classification.reason,
    });
  }

  /** A request that never got an answer at all. */
  requestFailed(request) {
    const failure = request.failure()?.errorText || "request-failed";
    /**
     * An aborted request is usually the harness itself navigating away, or a
     * cancelled fetch — routine, not a fault.
     */
    const aborted = /ERR_ABORTED|NS_BINDING_ABORTED/i.test(failure);
    return this.record({
      lane: aborted ? "green" : "red",
      kind: "network",
      type: "request-failed",
      method: request.method(),
      url: sanitizeUrl(request.url()),
      text: `${request.method()} ${sanitizeUrl(request.url())} failed: ${failure}`,
      classification: aborted ? "DEVELOPMENT NOISE" : "PRODUCT ERROR",
      reason: aborted ? "aborted-request" : failure,
    });
  }

  /**
   * What the agent is allowed to see.
   *
   * Red in full because it must be acted on. Amber as one line each. Green as
   * counts only — the file path is there for anybody who wants to argue with
   * the classifier.
   */
  digest({ redLimit = 25, amberLimit = 10 } = {}) {
    const green = [...this.greenReasons.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([reason, count]) => `${reason}×${count}`);

    return {
      counts: { ...this.counts },
      red: this.rows.red.slice(-redLimit).map((row) => ({
        seq: row.seq,
        kind: row.kind,
        type: row.type,
        reason: row.reason,
        text: row.text,
        stack: row.stack ? row.stack.split("\n").slice(0, 6).join("\n") : undefined,
        afterAction: row.afterAction
          ? `${row.afterAction.action} ${row.afterAction.target || ""}`.trim()
          : undefined,
      })),
      amber: this.rows.amber.slice(-amberLimit).map((row) => `${row.reason}: ${row.text.slice(0, 160)}`),
      greenTop: green,
      files: this.dir
        ? Object.fromEntries(LANES.map((lane) => [lane, path.join(this.dir, `console-${lane}.jsonl`)]))
        : undefined,
    };
  }
}
