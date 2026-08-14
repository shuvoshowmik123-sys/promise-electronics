#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PromiseQaDriver } from "./lib/promise-qa-driver.mjs";

const driver = new PromiseQaDriver();
const server = new McpServer(
  { name: "promise-human-qa", version: "0.1.0" },
  {
    instructions: [
      "Prefer qa_explore: one call walks the app on its own and returns a verdict.",
      "Driving qa_action in a loop costs a round trip per press and should be reserved",
      "for a specific sequence the walk cannot discover, such as logging in.",
      "Use qa_open once per isolated role and viewport.",
      "Use qa_elements only when the semantic target is unknown.",
      "Console output is split into three lanes: red is returned, amber is summarised,",
      "green is written to disk and never shown. Read qa_console for the counts.",
      "The observer runs continuously without screenshots and reports deterministic anomalies.",
      "Screenshots are written to disk only at the moment of a finding and are never returned as images.",
      "A FAIL or anomaly must never be converted to PASS by retrying around it.",
    ].join(" "),
  },
);

const result = (value) => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});

const failure = (error) => ({
  isError: true,
  content: [{
    type: "text",
    text: JSON.stringify({ status: "ERROR", error: String(error?.message || error || "Unknown error").slice(0, 500) }),
  }],
});

const handle = (callback) => async (input) => {
  try {
    return result(await callback(input));
  } catch (error) {
    return failure(error);
  }
};

server.registerTool(
  "qa_capabilities",
  {
    title: "Promise QA capabilities",
    description: "Return supported viewport profiles and the screenshot-free observation contract.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  handle(async () => ({
    status: "OK",
    profiles: driver.profiles(),
    actions: ["press", "type", "key", "scroll", "scroll-to-end"],
    autonomous: true,
    oneCallWalk: "qa_explore",
    consoleLanes: ["red", "amber", "green"],
    continuousSignals: [
      "layout-shift",
      "layout-jitter",
      "horizontal-overflow",
      "action-out-of-viewport",
      "action-occlusion",
      "bottom-ghost-bar",
      "empty-viewport",
      "main-thread-stall",
      "scroll-stall",
      "console",
      "page-error",
      "network",
    ],
    screenshotsCaptured: false,
    imagesReturned: false,
    sessionIsolation: true,
  })),
);

server.registerTool(
  "qa_open",
  {
    title: "Open isolated QA session",
    description: "Open or navigate a named isolated desktop/mobile browser session and start continuous observation.",
    inputSchema: {
      session: z.string().min(1).max(64),
      profile: z.enum(["desktop", "mobile-390", "mobile-430", "mobile-584"]).default("desktop"),
      url: z.string().default("/"),
    },
  },
  handle((input) => driver.open(input)),
);

server.registerTool(
  "qa_elements",
  {
    title: "Find compact interactive elements",
    description: "Return only visible interactive candidates, optionally filtered by label. Does not return a full DOM or accessibility tree.",
    inputSchema: {
      session: z.string().min(1).max(64),
      query: z.string().max(120).default(""),
      limit: z.number().int().min(1).max(100).default(60),
    },
    annotations: { readOnlyHint: true },
  },
  handle((input) => driver.elements(input)),
);

server.registerTool(
  "qa_action",
  {
    title: "Perform humanized browser action",
    description: "Perform one atomic press, type, key, scroll, or scroll-to-end action and return only state change and new anomalies.",
    inputSchema: {
      session: z.string().min(1).max(64),
      action: z.enum(["press", "type", "key", "scroll", "scroll-to-end"]),
      target: z.string().max(240).optional(),
      text: z.string().max(10000).optional(),
      key: z.string().max(80).optional(),
      replace: z.boolean().default(true),
      direction: z.enum(["down", "up"]).default("down"),
      distance: z.number().int().min(40).max(2000).default(460),
      maxGestures: z.number().int().min(1).max(40).default(18),
    },
  },
  handle(async (input) => {
    if (input.action === "press") {
      if (!input.target) throw new Error("press requires target.");
      return driver.press({ session: input.session, target: input.target });
    }
    if (input.action === "type") {
      if (!input.target) throw new Error("type requires target.");
      if (input.text === undefined) throw new Error("type requires text.");
      return driver.type({ session: input.session, target: input.target, text: input.text, replace: input.replace });
    }
    if (input.action === "key") {
      if (!input.key) throw new Error("key requires key.");
      return driver.key({ session: input.session, key: input.key });
    }
    if (input.action === "scroll") {
      return driver.scroll({
        session: input.session,
        direction: input.direction,
        distance: input.distance,
      });
    }
    return driver.scrollToEnd({
      session: input.session,
      direction: input.direction,
      maxGestures: input.maxGestures,
    });
  }),
);

server.registerTool(
  "qa_explore",
  {
    title: "Walk the app autonomously and return a verdict",
    description: [
      "Run a complete self-directed crawl in one call: pick an unpressed control, press it,",
      "watch what happens, repeat, within a step and time budget.",
      "Returns grouped findings, a console digest, and an evidence directory path.",
      "Never returns screenshots or a DOM. Controls whose label looks destructive",
      "(delete, close register, send, refund, sign out, ...) are skipped and reported as skipped.",
    ].join(" "),
    inputSchema: {
      session: z.string().min(1).max(64),
      maxSteps: z.number().int().min(1).max(400).default(60),
      maxMs: z.number().int().min(5000).max(1_800_000).default(240_000),
      maxDepth: z.number().int().min(1).max(12).default(4),
      scope: z.array(z.string().max(120)).max(20).default([]),
      avoid: z.string().max(400).optional(),
      scrollEachState: z.boolean().default(true),
      allowDestructive: z.boolean().default(false),
      seed: z.number().int().optional(),
    },
  },
  handle((input) => driver.explore(input)),
);

server.registerTool(
  "qa_console",
  {
    title: "Read the console lanes",
    description: [
      "Return the three-lane console digest: red in full (uncaught exceptions, 5xx, dead requests,",
      "each with the action that preceded it), amber as one line each, green as counts only.",
      "Every lane including green is on disk as JSONL; the paths are in the response.",
    ].join(" "),
    inputSchema: {
      session: z.string().min(1).max(64),
      redLimit: z.number().int().min(1).max(100).default(25),
      amberLimit: z.number().int().min(0).max(50).default(10),
    },
    annotations: { readOnlyHint: true },
  },
  handle(async ({ session, redLimit, amberLimit }) => {
    const record = driver.session(session);
    return {
      status: record.ledger.counts.red > 0 ? "FAIL" : "OK",
      session: record.name,
      ...record.ledger.digest({ redLimit, amberLimit }),
    };
  }),
);

server.registerTool(
  "qa_check",
  {
    title: "Run immediate page checks",
    description: "Trigger an immediate geometry scan while the background observer continues running.",
    inputSchema: { session: z.string().min(1).max(64) },
    annotations: { readOnlyHint: true },
  },
  handle((input) => driver.check(input)),
);

server.registerTool(
  "qa_status",
  {
    title: "Get compact QA status",
    description: "Return current session status, URL, observer metrics, and anomaly counts.",
    inputSchema: { session: z.string().min(1).max(64).optional() },
    annotations: { readOnlyHint: true },
  },
  handle((input) => driver.status(input)),
);

server.registerTool(
  "qa_anomalies",
  {
    title: "Read QA anomalies",
    description: "Read bounded anomalies after a cursor without screenshots or full logs.",
    inputSchema: {
      session: z.string().min(1).max(64),
      after: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(200).default(100),
    },
    annotations: { readOnlyHint: true },
  },
  handle((input) => driver.anomalies(input)),
);

server.registerTool(
  "qa_report",
  {
    title: "Create in-memory QA report",
    description: "Return the current deterministic verdict and anomaly counts. Does not write screenshots, videos, traces, cookies, or session state.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  handle(async () => driver.report()),
);

server.registerTool(
  "qa_close",
  {
    title: "Close QA sessions",
    description: "Close one named session or all sessions and release browser resources.",
    inputSchema: { session: z.string().min(1).max(64).optional() },
  },
  handle((input) => driver.close(input)),
);

const shutdown = async () => {
  await driver.close().catch(() => {});
  await server.close().catch(() => {});
};

process.on("SIGINT", async () => {
  await shutdown();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});

try {
  await server.connect(new StdioServerTransport());
} catch (error) {
  console.error(`[PromiseQA] ${String(error?.message || error)}`);
  await shutdown();
  process.exit(1);
}
