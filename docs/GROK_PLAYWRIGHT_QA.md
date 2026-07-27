# Promise Electronics — Grok Playwright QA System

**Phases:** GROK-PLAYWRIGHT-QA-01 (prototype) · QA-02 / **02H / 02I** (fail-closed harness)<br>
**Rule:** Grok is the only reasoning/vision model. Playwright MCP supplies browser evidence only.

## Prerequisites

- `@playwright/mcp@0.0.75`, `@playwright/test`, Chrome channel
- App: `npm run dev` → `http://127.0.0.1:5083`
- Authoritative project instructions: `docs/AGENT_TESTING_PLAYBOOK.md` and this runbook. Do not depend on a user-home Grok skill.
- MCP: `.mcp.json` → `playwright` + `playwright-mobile` via `launch-mcp.mjs` (unique session dirs)

## Start Grok

```bash
cd D:\PromiseIntegratedSystem\PromiseIntegratedSystem
grok
```

After changing `.mcp.json`, **fully restart Grok** so both MCP servers load.

Before any authenticated QA, start the app separately and require
`http://localhost:5083/api/ready` to return `ready:true`. A readiness 503 is a
test blocker, not a Playwright MCP failure.

```text
/promise-playwright-qa
```

## Fail-closed commands

```bash
# Classifier + evidence validator unit tests
npm run qa:harness-tests

# STRICT infra pilots → unique dir mobile-qa/grok-playwright-mcp-02/<run-id>/
npm run qa:infra-pilots -- --phase-id GROK-PLAYWRIGHT-QA-02I

# FAST mode (stable semantic only)
npm run qa:infra-pilots:fast

# Full validation → report/validation-full.json (exit 1 if incomplete)
npm run qa:validate-report -- --run-dir mobile-qa/grok-playwright-mcp-02/<run-id>

# Schema-only → report/validation-schema.json (incomplete; does not overwrite full)
npm run qa:validate-report -- --run-dir mobile-qa/grok-playwright-mcp-02/<run-id> --schema-only

# HTML evidence index
npm run qa:evidence-index -- --run-dir mobile-qa/grok-playwright-mcp-02/<run-id>

# Traces
npx playwright show-trace mobile-qa/grok-playwright-mcp-02/<run-id>/traces/desktop-public.zip
```

## Nonce-bound MCP evidence

Library pilots alone **cannot** yield INFRA PASS when `requireMcpRuntime` is true.

MCP evidence is **nonce-bound**, not cryptographically non-forgeable. Nonce binding prevents accidental cross-run reuse of challenge/evidence pairs. Operational trust comes from the **live Grok MCP inventory** plus retained screenshots/console/network under the unique run directory. A local process can still fabricate files.

Each run writes challenges to `report/mcp-challenge-*.json`. A live session must write `report/mcp-proof-playwright.json` and `report/mcp-proof-playwright-mobile.json` with:

| Field | Desktop | Mobile |
|-------|---------|--------|
| viewport | **exactly** 1440×900 | **exactly** 390×844 |
| coarsePointer | **false** | **true** |
| touch | optional (Windows may report touch) | **true** |
| maxTouchPoints | may be >0 on touchscreen | **> 0** |
| Evidence files | before / action / after PNG + console + network + a11y paths | same |
| PNG dims | must match claimed viewport | same |

Missing any required item → **NOT VERIFIED** (never PASS). Env flags do not create PASS.

## STRICT vs FAST

| | STRICT | FAST |
|---|--------|------|
| Default | yes | opt-in `--mode FAST` |
| Screenshot+vision every meaningful click | yes | state transitions only |
| Maps / auth / destructive | required | **forbidden** |
| Console/network checkpoints | yes | yes |
| Fail-closed evidence validator | yes | yes |

## Privacy

- Text secret scan: `report/secret-scan.json`
- `binaryEvidencePrivacy`: `NOT VERIFIED` until authenticated screenshot/trace redaction exists
- Authenticated multi-role **cannot** be promoted to PASS while `binaryEvidencePrivacy !== PASS`
- Do not retain storage-state, credentials, cookies, tokens, GPS, or raw PII in reports

## Verdict rules

- **INFRA PASS** — every required step PASS, MCP desktop+mobile evidence PASS, cleanup PASS, secret scan PASS, validation PASS.
- **INFRA NO GO** — any required failure/missing evidence/MCP unverified.
- **PARTIAL** — optional matrix only (e.g. 430/844 not run); exit code **3**.

Never convert PARTIAL → PASS. Infra PASS ≠ product GO.

## Layout of a run

```text
mobile-qa/grok-playwright-mcp-02/<run-id>/
  report/run-report.json
  report/validation-full.json
  report/validation-schema.json   # only if --schema-only was run
  report/evidence-index.html
  report/secret-scan.json
  report/mcp-challenge-*.json
  report/mcp-proof-*.json
  screenshots/
  traces/
  desktop/  mobile/  console/  network/
```

MCP sessions (separate unique folders via `launch-mcp.mjs`):

```text
mobile-qa/grok-playwright-mcp-02/mcp-session_<ts>_<id>/
  mcp-desktop/ or mcp-mobile/
  report/mcp-session-*.json
```

Never overwrites a prior run directory silently. Concurrent runs must not share output dirs.

## Retention

Keep active audit evidence. Do not auto-delete. Archive old runs manually after sign-off.
