/**
 * Thin fail-closed launcher for the disposable baseline adoption proof harness.
 *
 * Always re-execs under the project TSX CLI so TypeScript server services
 * (ESM `.js` import paths → `.ts` sources) resolve correctly.
 * Do not use plain Node to import those services directly.
 *
 * Prefer: npm run schema:adoption:proof
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TSX_CLI = path.join(ROOT, "node_modules/tsx/dist/cli.mjs");
const HARNESS_TS = path.join(__dirname, "disposable-baseline-adoption-proof.ts");

if (!existsSync(TSX_CLI)) {
  console.error(
    "[adoption-proof] FAIL-CLOSED: project tsx CLI missing at node_modules/tsx/dist/cli.mjs — run npm install"
  );
  process.exit(1);
}
if (!existsSync(HARNESS_TS)) {
  console.error(
    "[adoption-proof] FAIL-CLOSED: harness TypeScript entry missing: scripts/disposable-baseline-adoption-proof.ts"
  );
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [TSX_CLI, HARNESS_TS, ...process.argv.slice(2)],
  {
    stdio: "inherit",
    cwd: ROOT,
    env: {
      ...process.env,
      ADOPTION_PROOF_UNDER_TSX: "1",
    },
  }
);

if (result.error) {
  console.error(
    "[adoption-proof] FAIL-CLOSED: failed to spawn tsx:",
    result.error.message?.slice(0, 200)
  );
  process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
