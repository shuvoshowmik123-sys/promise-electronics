# Testing Playbook

**Master QA truth policy lives in `docs/AI_AGENT_OPERATING_RULES.md`** — see Section 5 (Playwright/Manual QA Policy) and Section 12 (Testing Gates). If this playbook conflicts with the master, the master wins.

## Tool Assignment

| Tool | Use For |
|------|---------|
| **Browser-act CLI** | Desktop 1440x900 visual/human QA (real Chrome browser) |
| **Playwright MCP** | Mobile viewport QA (390x844, 430x932) |
| **Playwright MCP** | Strict automated regression tests |
| **curl / API scripts** | Backend logic, security, permission enforcement |

## Playwright MCP: Where It Connects

The project owns the Playwright MCP launch configuration; the agent host owns whether an agent receives MCP tools.

| Testing client | Configuration authority | Result |
|---|---|---|
| External **Grok Build CLI** | `.mcp.json` in the project root | Starts the separate desktop and mobile local stdio servers through `qa-tooling/playwright-mcp/launch-mcp.mjs`. Run Grok from the project root and fully restart it after changing `.mcp.json`. |
| External **OpenCode** | `opencode.json` in the project root | Starts its own configured MCP server. It does not share Grok's two-profile evidence harness. |
| **Traycer GUI agent** | Traycer host/session tool attachment | Does **not** read `.mcp.json` or `opencode.json`. If the agent's tool inventory lacks Playwright desktop/mobile tools, label visual QA `NOT VERIFIED`; do not pretend that editing project config attached it. |

For reliable external Grok QA on this Windows workstation:

1. Start the app separately and confirm `http://localhost:5083/api/ready` is `ready:true`.
2. Run `grok` from `D:\PromiseIntegratedSystem\PromiseIntegratedSystem`.
3. Start the project QA skill: `/promise-playwright-qa`.
4. Confirm both `playwright` and `playwright-mobile` MCP tools appear before navigation.
5. Keep the browser headed. The desktop/mobile launcher configs already use headed Chrome, isolated profiles, unique evidence folders, and no saved auth session.

The local Node executable is intentionally explicit in `.mcp.json` so a Grok CLI launched from a GUI can start MCP even if its inherited `PATH` does not contain Node.js.

### Headed QA Preflight

Before opening Browser-act, Playwright MCP, or a headed Chromium fallback for a local QA package:

1. Verify the expected local app port is listening.
2. Verify the local readiness endpoint responds successfully (normally `GET /api/ready`).
3. Verify the app is configured for the approved local/disposable database path; do not start it against a remote/shared `DATABASE_URL`.

If any preflight fails, record the exact blocker and stop **BLOCKED** before opening a browser. A single connection-refused navigation may be used only when TCP/readiness evidence is contradictory; it is not a substitute for preflight and is never browser QA.

### Rules
- Desktop visual QA: attempt Browser-act first. If unavailable (connection error, Chrome closed), document the limitation and use Playwright as fallback.
- Never claim mobile Browser-act QA unless Chrome DevTools device emulation was explicitly configured.
- Never use Playwright for desktop visual QA without documenting why Browser-act was unavailable.

## Required Checks

See master Section 12 for the pre-completion gate. All three must pass before reporting completion:
```bash
npx tsc --noEmit --pretty false    # TypeScript type check
npx vite build --mode development  # Vite build verification
git diff --check                   # Whitespace/line-ending check
```

## When Visual QA Is Mandatory

See master Section 5 for the full Playwright/Manual QA policy. Summary:

- **Default mode (implementation):** UI changes ship with a manual test guide. Label `Mobile QA: NOT VERIFIED` until an explicit QA phase runs.
- **QA phase (explicit):** Automated Playwright/MCP at 390x844, 430x932, 584x918, desktop 1440x900.
- Visual QA is mandatory when: new UI component/page created, existing layout modified, mobile-specific layout changed, modal/dialog/sheet created or modified.
- Visual QA is NOT required for: backend-only changes, documentation changes, config updates.

## Test Data Rules

- Never commit session cookies, auth tokens, or test credentials.
- Clean up `qa-*.png` screenshots after every 2 Playwright runs (keep only latest).
- Delete `cookies*.txt` and `*_cookies.txt` files after QA runs.
- Test accounts created during QA should use obvious names (e.g., `qa_driver`, `reg_tech`, `guide_cashier`).

## Role Separation

- Super Admin: `admin` / `admin123` — used for admin panel testing.
- Staff roles: created via invite flow during QA.
- Customer: separate session via customer login.
- Corporate: separate session via corporate login.

Never mix admin and customer sessions in the same test flow without explicit logout between them.

## API Test Scripts

Write test scripts in bash using curl for backend regression:
```bash
ok()   { PASS=$((PASS+1)); echo "  OK: $1"; }
fail() { FAIL=$((FAIL+1)); echo "  FAIL: $1"; }
```

Store scripts in the scratchpad directory, not in the repo.

## Permission Testing

When testing permission enforcement:
1. Login as Super Admin — verify 200 on protected routes.
2. Login as restricted role (Driver) — verify 403.
3. Login as legacy role (Manager with broad permissions) — verify backward compatibility.
4. Test malicious payload — verify dangerous permissions are stripped.

## Reporting

Every QA result must include:
- Total tests / pass / fail count.
- Viewport tested (desktop 1440, mobile 390, mobile 430).
- Tool used (Browser-act / Playwright / API).
- Console error count.
- Bugs found (0 or list).
