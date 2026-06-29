# Testing Playbook

## Tool Assignment

| Tool | Use For |
|------|---------|
| **Browser-act CLI** | Desktop 1440x900 visual/human QA (real Chrome browser) |
| **Playwright MCP** | Mobile viewport QA (390x844, 430x932) |
| **Playwright MCP** | Strict automated regression tests |
| **curl / API scripts** | Backend logic, security, permission enforcement |

### Rules
- Desktop visual QA: attempt Browser-act first. If unavailable (connection error, Chrome closed), document the limitation and use Playwright as fallback.
- Never claim mobile Browser-act QA unless Chrome DevTools device emulation was explicitly configured.
- Never use Playwright for desktop visual QA without documenting why Browser-act was unavailable.

## Required Checks

Every implementation phase must run:
```bash
npx tsc --noEmit --pretty false    # TypeScript type check
npx vite build --mode development  # Vite build verification
git diff --check                   # Whitespace/line-ending check
```

All three must pass before reporting completion.

## When Visual QA Is Mandatory

Visual QA is required when:
- A new UI component or page is created.
- An existing UI layout is modified (not just data changes).
- Mobile-specific layout is added or changed.
- A modal/dialog/sheet is created or modified.

Visual QA is NOT required for:
- Backend-only changes (API, service, repository).
- Documentation changes.
- .gitignore or config updates.

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
