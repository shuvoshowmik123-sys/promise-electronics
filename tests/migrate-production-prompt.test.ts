/**
 * The migration prompt must actually appear on a terminal.
 *
 * The first version of `scripts/migrate-production.mjs` used readline with a
 * muted output hook to hide the pasted URL. On a real terminal readline redraws
 * the line when it takes over, which wiped the prompt that had just been
 * written — so the script printed the npm banner and then absolutely nothing,
 * and waited for a paste with no sign on screen that it wanted one. It looked
 * like a hang, and it was reported as one.
 *
 * The piped path could not catch it: piping never triggers the redraw. So this
 * test fakes a TTY — `isTTY` true and a `setRawMode` that records it was called
 * — and drives the script the way a person would.
 *
 * Two things are asserted, and the second matters more than the first:
 *
 *   the prompt is on screen before anything is typed, and
 *   what is typed is NOT on screen afterwards.
 *
 * A prompt that never appears wastes somebody's afternoon. A password echoed
 * into terminal scrollback is the thing this script exists to prevent.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../scripts/migrate-production.mjs",
);

/** A URL with an obvious password, so an echo of it is unmistakable. */
const PASSWORD = "supersecretpassword";
const URL_UNDER_TEST = `postgres://avnadmin:${PASSWORD}@db.example.com:18395/defaultdb?sslmode=require`;

describe("the production migration prompt", () => {
  let stdout: string;
  let restore: Array<() => void>;
  let exitCode: number | undefined;

  beforeEach(() => {
    stdout = "";
    exitCode = undefined;
    restore = [];

    const fakeStdin = new PassThrough() as any;
    fakeStdin.isTTY = true;
    fakeStdin.setRawMode = () => fakeStdin;

    const realStdin = Object.getOwnPropertyDescriptor(process, "stdin")!;
    Object.defineProperty(process, "stdin", { value: fakeStdin, configurable: true });
    restore.push(() => Object.defineProperty(process, "stdin", realStdin));

    const realWrite = process.stdout.write.bind(process.stdout);
    (process.stdout as any).write = (chunk: any) => {
      stdout += String(chunk);
      return true;
    };
    restore.push(() => {
      (process.stdout as any).write = realWrite;
    });

    const realLog = console.log;
    console.log = (...args: unknown[]) => {
      stdout += args.join(" ") + "\n";
    };
    restore.push(() => {
      console.log = realLog;
    });

    const realExit = process.exit;
    (process as any).exit = (code?: number) => {
      exitCode = code;
      // Unwinding rather than exiting: the real one would take the test runner
      // down with it.
      throw new Error("__exit__");
    };
    restore.push(() => {
      (process as any).exit = realExit;
    });
  });

  afterEach(() => {
    for (const undo of restore.reverse()) undo();
  });

  /**
   * Waits for text to appear rather than sleeping a fixed span and hoping.
   *
   * This test drives a script that prints on module load, so "has it printed
   * yet" is a race against the event loop. A flat 20ms won it on an idle
   * machine and lost it inside the full suite, where the assertion saw an
   * empty stdout — a failure that says nothing about the script. Polling ends
   * as soon as the text lands, so the common path is faster than the sleep it
   * replaces, and only a real hang spends the whole budget.
   */
  async function waitForOutput(text: string, budgetMs = 5_000): Promise<void> {
    const deadline = Date.now() + budgetMs;
    while (!stdout.includes(text)) {
      if (Date.now() > deadline) {
        throw new Error(
          `waited ${budgetMs}ms for ${JSON.stringify(text)}; stdout was: ${JSON.stringify(stdout)}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  it("shows the prompt, hides the paste, and cancels without contacting anything", async () => {
    const stdin = process.stdin as any;

    // Import fresh: the script runs its prompt at module load.
    const running = import(`${SCRIPT}?t=${Date.now()}`).catch((error) => {
      if (!(error instanceof Error) || error.message !== "__exit__") throw error;
    });

    // The prompt must be on screen before anything is typed.
    await waitForOutput("Paste the production DATABASE_URL");

    stdin.write(URL_UNDER_TEST + "\r");
    await new Promise((resolve) => setTimeout(resolve, 20));

    // An empty answer at the confirmation cancels, so nothing is spawned and no
    // database is contacted by this test.
    stdin.write("\n");
    await running;

    expect(stdout, "the pasted password must never reach the screen").not.toContain(PASSWORD);
    expect(stdout).toContain("db.example.com");
    expect(stdout).toContain("Cancelled");
    expect(exitCode).toBe(0);
  });
});
