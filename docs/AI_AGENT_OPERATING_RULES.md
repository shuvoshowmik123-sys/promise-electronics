# AI Agent Operating Rules — Promise Electronics

**Rule Version:** 2026-07-04-v3
**Status:** MASTER

This file is the single source of truth for AI operating policy on this repo. It supersedes duplicated policy blocks in:
- `AGENTS.md`
- `rules.md`
- `docs/AGENT_CURRENT_CONTEXT.md`
- `docs/AGENT_FRONTEND_PLAYBOOK.md`
- `docs/AGENT_BACKEND_PLAYBOOK.md`
- `docs/AGENT_TESTING_PLAYBOOK.md`
- `docs/RELEASE_CHECKLIST.md`

If any playbook or doc conflicts with this file, **this file wins** and the conflict must be reported in the next feedback block.

---

## 1. Scope

These rules govern every AI agent touching this repo: Codex, Claude Code, GLM, Fable, OpenCode, Cursor, PlotCode, Kimi, and future models.

They cover:
- Evidence and testing honesty
- Tool assignment
- QA policy (manual vs automated)
- Git and deployment verification
- Secret handling
- Report format
- Release gates
- Data leak prevention
- Role and permission enforcement

Specialized playbooks retain implementation details only (component patterns, SQL examples, test script templates). They must not restate policy blocks already in this file.

---

## 2. GREEN SIGNAL Rule

GREEN SIGNAL is the agent's declaration that it has read and understood the current operating rules before acting.

**Required before:**
- code edits
- database migrations
- QA claims (PASS/FAIL/UNVERIFIED)
- commits
- pushes
- release decisions
- phase-complete declarations

**NOT required for:**
- simple explanatory answers
- opinion-only responses
- clarification questions

Unless the response declares a phase complete.

**Format:**
> GREEN SIGNAL: Read `docs/AI_AGENT_OPERATING_RULES.md` v2026-07-04-v3. Proceeding with [task].

GREEN SIGNAL alone does not prove compliance. Real enforcement comes from evidence requirements (Section 3), report format (Section 16), and honesty labels (Section 15).

---

## 3. Evidence and Testing Truth Rules

### 3.1 No Fake PASS

An agent must NEVER report PASS for a check it did not run. Partial testing is never convertible to full PASS.

| Situation | Correct Label |
|-----------|---------------|
| Ran check and it passed | `PASS` |
| Ran check and it failed | `FAIL` |
| Did not run check | `NOT VERIFIED` |
| Ran check but skipped a subset | `PARTIAL PASS — [what was skipped]` |

### 3.2 Evidence Boundaries

- Page load only is not full QA.
- Code audit only is not browser QA.
- API test is not visual QA.
- Browser-act desktop test is not mobile QA.
- Desktop QA at 1440x900 does not verify mobile 390x844.
- Mobile QA at 390x844 does not verify desktop 1440x900.

### 3.3 Required Build Checks

Every implementation phase must run:

```bash
npx tsc --noEmit --pretty false    # TypeScript type check
npx vite build --mode development  # Vite build verification
git diff --check                   # Whitespace/line-ending check
```

All three must PASS before reporting completion. If any FAIL, stop and report the failure — do not proceed to the next task.

### 3.4 Evidence Requirements

Every QA claim must include:
- Exact command run
- Tool used (Browser-act / Playwright / Chrome DevTools MCP / API / manual)
- Viewport tested if visual
- Console error count
- Exact PASS / FAIL / NOT VERIFIED label per check
- Screenshot paths only when visual QA was actually run

---

## 4. Tool Usage Rules

| Tool | Use For |
|------|---------|
| **Browser-act CLI** | Desktop 1440x900 human-flow QA (real Chrome browser) |
| **Playwright MCP** | Mobile viewport QA and strict regression — only during explicit QA phase |
| **Chrome DevTools MCP** | Console/network/performance/dynamic import failures |
| **curl / API scripts** | Backend logic, security, permission enforcement |
| **Manual test guide** | Default UI verification when no QA phase is ordered |

### Rules
- Desktop visual QA: attempt Browser-act first. If unavailable (connection error, Chrome closed), document the limitation and use Playwright as fallback.
- Never claim mobile Browser-act QA unless Chrome DevTools device emulation was explicitly configured.
- Never use Playwright for desktop visual QA without documenting why Browser-act was unavailable.
- Chrome DevTools MCP may be used for console/network inspection during any phase, but does not replace visual QA.

---

## 5. Playwright / Manual QA Policy

### 5.1 Default Mode (Implementation Phase)

UI changes must ship with a **manual mobile/desktop test guide** — a short list of steps a human can follow to verify the change on mobile and desktop.

Automated Playwright/MCP mobile QA is **NOT** auto-run after every implementation.

If automated QA was not run, the report must state:
> `Mobile QA: NOT VERIFIED`
> `Desktop QA: NOT VERIFIED` (or PASS if Browser-act or another desktop QA was actually run)

### 5.2 QA Phase (Explicit)

Automated Playwright/MCP mobile QA is required only when:
- The Inspector explicitly orders a QA phase, OR
- The Inspector explicitly requests mobile/Playwright QA for a specific change

During an explicit QA phase:
- Mobile: 390x844
- Mobile: 430x932
- Mobile: 584x918 when relevant
- Desktop: 1440x900
- Console/network errors reported
- Screenshot paths reported
- Clean up `qa-*.png` screenshots after every 2 runs (keep only latest)
- Delete `cookies*.txt` and `*_cookies.txt` files after QA runs

### 5.3 When Visual QA Is Mandatory (Even in Default Mode)

Visual QA (manual or automated) is required when:
- A new UI component or page is created
- An existing UI layout is modified (not just data changes)
- Mobile-specific layout is added or changed
- A modal/dialog/sheet is created or modified

Visual QA is NOT required for:
- Backend-only changes (API, service, repository)
- Documentation changes
- `.gitignore` or config updates

In default mode, "mandatory visual QA" means: provide a manual test guide and label `Mobile QA: NOT VERIFIED` until an explicit QA phase runs.

---

## 6. Server Log Policy

- Server `console.log` must use `[ServiceName] message` format.
- Never log in client code (except error boundaries).
- Never log: passwords, password hashes, session tokens, CSRF tokens, full customer objects, phone numbers in auth flows, raw GPS coordinates, full session objects, customer PII, internal stack traces in API responses.
- API error responses must use `{ "error": "Human-readable message" }` — never expose stack traces, raw SQL errors, or internal paths.
- `console.error` in catch blocks: log `(err as Error).message` only, not the raw error object (which may contain DB connection strings or env values).

---

## 7. Role and Permission Rules

### 7.1 Mutation Middleware

Every admin mutation route must be protected by admin auth plus the narrowest correct permission gate:
- `requireGranularPermission`
- `requireAnyGranularPermission`
- `requireSuperAdmin`
- Legacy `requirePermission` / `requireAnyPermission` for existing unmigrated routes

Never leave POST/PATCH/DELETE routes protected only by `requireAdminAuth` unless explicitly public/internal and documented.

Legacy `requirePermission`/`requireAnyPermission` remain acceptable on existing unmigrated routes; migrate them only when the route is already in scope for the task.

### 7.2 Permission Source of Truth

`shared/permission-catalog.ts` — 67 granular permissions across 20 modules.

- `requireGranularPermission(key)` checks: wildcard → direct → legacy compatibility
- Super Admin gets wildcard `*` — always passes all checks
- Blocked invite permissions: `settings.manage`, `users.inviteStaff`, `users.editPermissions`, `users.deactivate`

### 7.3 Data Safety — Never Return in API Responses

- `password`, `passwordHash`
- `temporaryPassword`, `resetSecret`
- `otpSecret`, `codeHash`
- `tokenHash` (invite tokens)

### 7.4 Portal Session Rule

Customer and corporate portals must never render admin UI or admin data. Admin cookies/sessions may exist in the browser, but customer/corporate UI and APIs must not use them for authorization or display.

### 7.5 Ownership-Scoped Routes

Customer/corporate routes must be ownership-scoped — a customer can only see their own data.

### 7.6 Role Matrix (QA Reference)

| Role | Lands On | Hidden Tabs | Key Checks |
|------|----------|-------------|------------|
| Super Admin | Dashboard | None | All tabs visible, all actions allowed |
| Manager | Dashboard | System Settings, Users | Can assign tech, process POS |
| Technician | /tech | All admin tabs | Sees own jobs only |
| Driver | /admin#pickup | Jobs, POS, Finance, Users | Sees pickup/shift only |
| Cashier | /admin#pos | Users, System Settings | Can process POS, view inventory |
| Customer | /home | All admin | No admin sidebar, no admin data |
| Corporate | /corporate | All admin | No admin UI, no admin endpoints |

---

## 8. Data Leak Rules

### 8.1 Never Expose in UI or API Responses

- `password`, `passwordHash`
- `temporaryPassword`, `resetSecret`
- `otpSecret`, `codeHash`
- `tokenHash`
- Full internal nanoid/UUID as primary visible label
- Raw GPS coordinates in normal UI
- Stack traces
- Raw SQL errors
- Customer PII in logs
- ImageKit private key
- Firebase private key
- Full API keys

### 8.2 Internal Job IDs

Raw nanoid / UUID database IDs must never appear as primary visible labels in UI. Use `getSafeJobDisplayRef()` from `shared/job-display-utils.ts` for all visible job references.

Internal IDs may still be used for: API lookup, joins, selection, search payloads, and mutations.

### 8.3 Public Track Endpoint

`GET /api/public/track/:ticketNumber` must return only safe fields: `ticketNumber, brand, screenSize, primaryIssue, trackingStatus, stage, status, createdAt, serviceMode`. No internal id, customerId, phone, or address.

Input guard required: reject if `ticketNumber.length < 3` or `> 60`.

### 8.4 Notification Bell

Notifications must not expose: stack traces, raw DB IDs (as visible labels), raw GPS coordinates, server logs, internal error messages.

### 8.5 Portal Isolation

- Customer portal: no admin sidebar, no admin data
- Corporate portal: no admin sidebar, no admin UI, no admin endpoints
- Admin cookies/sessions may coexist but must not be used by customer/corporate APIs for authorization or display

---

## 9. Secret Handling

### 9.1 Never Commit Secrets

Never commit to the repo:
- `.env` files
- `cookies*.txt`, `*_cookies.txt`
- Session dumps
- Firebase service account JSON files
- Hard-coded API keys in docs/source/config (`sk-...`, ImageKit private key, Firebase private key)
- `opencode.json` with literal reusable keys if shown to AI agents or copied into reports

### 9.2 Secret Scan Requirement

Until `scripts/check-sensitive-files.ts` exists, every release report must include:
> `Secret scan: MANUAL / PASS / NOT VERIFIED`

The manual scan must check:
- `git status` for `.env`, cookie files, session dumps
- `opencode.json` for literal API keys (should use `${ENV_VAR}` pattern)
- Config files for `sk-...` patterns
- Source files for hard-coded ImageKit/Firebase private keys

### 9.3 If a Secret Is Found

Report:
> `SECRET FOUND — ROTATE REQUIRED`

Do NOT print the key value in any report, commit message, or log.

### 9.4 Future Enforcement Script

**Planned:** `scripts/check-sensitive-files.ts` — will fail on:
- `cookies*.txt`, `*_cookies.txt`
- Session dumps
- `.env` committed accidentally
- Hard-coded API key patterns (`sk-...`, ImageKit private key, Firebase private key)
- `opencode.json` containing a literal API key instead of `${ENV_VAR}`

### 9.5 Known Issue

`opencode.json` is untracked/gitignored but currently contains a literal provider apiKey. It has been visible in local AI sessions. Status: **SECRET FOUND — ROTATE REQUIRED**. Replace with `${PROVIDER_API_KEY}` env var reference after key rotation. Do not print the key.

---

## 10. Frontend UI Rules

### 10.1 Visual System

- Light mode only unless explicitly requested.
- No dark mode, no heavy gradients, no decorative blobs, no oversized marketing sections in admin tools.
- No new palette, shadow style, navigation style, or card shape without approval.
- Prefer existing shadcn/ui components and local primitives.
- Prefer Lucide icons.
- Do not create new card, sheet, modal, dock, KPI, tab, or segmented-control patterns if an existing pattern solves it.
- Do not nest cards inside cards.
- Cards should usually be `rounded-lg` or less in operational UI.

### 10.2 Mobile Rules

- No desktop squeezed into mobile.
- Mobile and desktop layouts must stay separate when workflows differ.
- Bottom dock must not cover final content: final card, final button, or final form field.
- Admin mobile chrome hide/show invariant: if content moves up by `4rem`, content surface must extend down by `4rem` — never leave a white/gray strip.
- Admin mobile sheets use native sheet contract: portal to `document.body` when under transformed shell, real drag pill only, no fake handle, no top-right X on normal sheets, body scroll inside, safe-area footer.
- Bangla and English UI must both fit cleanly.
- Use existing mobile primitives before creating new ones.

### 10.3 Desktop Rules

- Desktop admin is an operational workstation: tables, filters, actions, dense but readable.
- Do not change desktop while fixing mobile unless explicitly requested.

### 10.4 Ownership

- Codex owns final UI/UX direction and visual consistency.
- Claude Code may implement frontend only from a Codex-approved UI spec.
- Worker agents (GLM, PlotCode, Kimi, Fable) must not invent new visual systems.
- Do not introduce a new visual system, palette, mobile shell, dock, card style, or modal pattern without explicit approval.

---

## 11. Backend Rules

### 11.1 Route Files

Routes must be thin: validate input → call service → return result. No business logic in route handlers.

### 11.2 SQL Placement

New backend domains should keep SQL in repositories/services. Existing route-level SQL may be touched only when scoped to the task. Do not expand route-level SQL in unrelated work.

### 11.3 Imports

All `.ts` imports use `.js` extension (ESM convention):
```typescript
import { storage } from '../storage.js';
```

### 11.4 SQL / Drizzle

- Use `db.execute(sql`...`)` for raw queries.
- DDL (CREATE TABLE, ALTER TABLE) must be idempotent (`IF NOT EXISTS`).
- DDL runs at server startup in migration functions.
- Main DB uses `DATABASE_URL` (Aiven PostgreSQL) with standard pg — NOT `neon()`.
- Brain DB uses `BRAIN_DATABASE_URL` (Neon) — only in `server/brain/`.

### 11.5 Audit Logging

State-changing operations must log via `auditLogger` with fire-and-forget (`.catch(() => {})`):
```typescript
await auditLogger.log({
    userId: req.user?.id || 'system',
    action: "ACTION_NAME",
    entity: "EntityName",
    entityId: targetId,
    req,
}).catch(() => {});
```

### 11.6 Error Responses

- 400 for validation errors
- 401 for auth failure
- 403 for permission denied
- 404 for not found
- 500 for server errors
- Never expose stack traces or internal paths
- Format: `{ "error": "Human-readable message" }`

### 11.7 Phone Normalization

Always use `normalizePhone()` from `server/utils/phone.ts` when storing phone numbers. Store both `phone` (raw) and `phoneNormalized` (last 10 digits).

### 11.8 ID Generation

- UUID: `import { randomUUID } from "crypto"` — uuid package not installed.
- Job numbers: `jobRepo.getNextJobNumber()` returns `JOB-YYYY-NNNN` format.
- Service request tickets: `SRV-YYYYMMDD-NNNN` format.
- Never use raw `nanoid()` as a visible job ID — use `getNextJobNumber()` instead.

---

## 12. Testing Gates

### 12.1 Pre-Completion Gate (Every Phase)

All three must PASS before reporting completion:
```bash
npx tsc --noEmit --pretty false
npx vite build --mode development
git diff --check
```

If any FAIL → stop, report failure, do not proceed.

### 12.2 Permission Testing (When Auth Routes Changed)

1. Login as Super Admin — verify 200 on protected routes.
2. Login as restricted role (Driver) — verify 403.
3. Login as legacy role (Manager with broad permissions) — verify backward compatibility.
4. Test malicious payload — verify dangerous permissions are stripped.

### 12.3 Test Data Rules

- Never commit session cookies, auth tokens, or test credentials.
- Test accounts: use obvious names (e.g., `qa_driver`, `reg_tech`).
- Never mix admin and customer sessions without explicit logout between them.
- Store test scripts in scratchpad directory, not in the repo.

---

## 13. Git Rules

### 13.1 Source/Governance Separation

Governance/rule-document phases must not be mixed with production code fixes.

If source files are already modified, finish or stash them before implementing operating-rule docs.

If pending source changes are release-blocking, committing those source fixes takes priority over the governance phase.

The operating-rules commit should include docs/config governance only unless explicitly approved.

### 13.2 Commit Policy

- Only commit when the user explicitly asks.
- Before committing: inspect `git status`, `git diff`, `git log --oneline -10`.
- Stage only intended files — never commit secrets.
- Write a concise commit message matching repo style.
- Do not update git config, skip hooks, use interactive `-i`, force-push, or create empty commits unless explicitly requested.
- If a commit fails or hooks reject it, fix the issue and create a new commit — do not amend the failed commit.

### 13.3 Push Verification

Local commit is not enough. The project previously had fixes committed locally but production was still running old code.

Before declaring a phase "shipped" or "deployed":
1. Confirm the commit is pushed to the remote.
2. Confirm the deployed commit hash matches (see Section 14).

### 13.4 Branch Hygiene

- `git status --short` must be clean except for explicitly ignored local-only folders.
- No untracked source file required by imported code should remain untracked.
- Before committing: `git add` new source files so they are tracked.

---

## 14. Deployment Verification

### 14.1 Deployment Gate

Before declaring a release "deployed" or "live," confirm ALL of the following:

| # | Check | Method |
|---|-------|--------|
| 1 | Local commit is pushed to remote | `git log --oneline origin/main..HEAD` — must be empty |
| 2 | Render backend deployed commit hash includes the signed-off fix | Check Render dashboard or API |
| 3 | Vercel frontend deployed commit hash includes the signed-off fix | Check Vercel dashboard or API |
| 4 | Production domain is not running an older bundle | Visit production URL, verify version |
| 5 | `git status --short` is clean | Except explicitly ignored local-only folders |
| 6 | No untracked source file is required by imported code | `git status` shows no `??` for source files |
| 7 | Secret scan status reported | `PASS` / `MANUAL PASS` / `SECRET FOUND` |

If any check fails, the release is **NOT DEPLOYED** — report `Deployment: NOT VERIFIED` or `Deployment: FAILED`.

### 14.2 Post-Deploy Smoke

- `GET /api/health` returns 200.
- Super Admin can login.
- No 500 errors in first 5 minutes of server logs.
- Customer portal loads.
- Corporate portal loads (if enabled).

---

## 15. Honesty Labels

Every report must use exact labels — no hedging, no ambiguity:

| Label | Meaning |
|-------|---------|
| `PASS` | Check was run and passed |
| `FAIL` | Check was run and failed |
| `NOT VERIFIED` | Check was not run |
| `PARTIAL PASS` | Check was run but subset skipped — must specify what was skipped |
| `BLOCKED` | Could not run — must specify blocker |
| `SECRET FOUND` | Secret detected — must specify file, must NOT print key value |
| `DEPLOYED` | Deployment verified per Section 14 |
| `NOT DEPLOYED` | Deployment not verified or failed |

---

## 16. Report Format

Every agent response that involves code, QA, migration, or release work must end with:

```
---
**FEEDBACK BLOCK**
- Files changed: [list or "none"]
- What was done: [1-2 sentences]
- Confidence: HIGH / MEDIUM / LOW
- Potential issues: [list or "none"]
- Awaiting inspector review.
---
```

QA responses must also include:
- Build checks: `tsc` / `vite build` / `git diff --check` — each with PASS/FAIL/NOT VERIFIED
- QA result: PASS / PARTIAL PASS / FAIL
- Tabs tested / flows tested / security checks (tables)
- Bugs found (with severity: BLOCKER / HIGH / MEDIUM / LOW)
- Mobile QA: PASS / NOT VERIFIED
- Desktop QA: PASS / NOT VERIFIED
- Secret scan: MANUAL PASS / NOT VERIFIED / SECRET FOUND
- Final verdict: GO / GO WITH FIXES / NO GO

Release responses must also include:
- Deployment: DEPLOYED / NOT DEPLOYED (per Section 14 checks)
- Secret scan result

If you cannot complete a task safely, output the FEEDBACK BLOCK with `Confidence: LOW` and explain what's blocking you. Do not guess or hallucinate API shapes. Do not invent file paths. If unsure whether a file exists, state that in the feedback block.

---

## 17. Final Release Gate

Before declaring a release GO:

### 17.1 Build
- [ ] `npx tsc --noEmit --pretty false` — PASS
- [ ] `npx vite build --mode production` — PASS
- [ ] No `console.log` in client code (except error boundaries)
- [ ] `.env` and credential files are NOT in git

### 17.2 Database
- [ ] Production database backup exists (< 1 hour old)
- [ ] Migrations are idempotent (IF NOT EXISTS)
- [ ] No destructive ALTER TABLE (DROP COLUMN) in pending migrations

### 17.3 Role Smoke Tests
- [ ] Super Admin: login → dashboard, all tabs load, can create setup link
- [ ] Manager: login → dashboard, can assign tech / process POS, no System Settings/Users
- [ ] Technician: login → /tech, sees own jobs only, no admin tabs
- [ ] Driver: login → /admin#pickup, sees pickup/shift only, no Jobs/POS/Finance/Users
- [ ] Cashier: login → /admin#pos, can process POS / view inventory, no Users/System Settings
- [ ] Customer portal: submit repair request, view My Repairs, see journey timeline, no admin sidebar
- [ ] Corporate portal: login, dashboard, no admin UI, no admin endpoints

### 17.4 Core Flow Smoke
- [ ] Inventory add/edit: Super Admin can add product without 403
- [ ] Service request → quote → accept → job created
- [ ] Job → assign technician → report outcome → advance status
- [ ] Warranty claim → approve → create linked job → job appears with JOB-YYYY-NNNN ID
- [ ] POS: open register → process payment → receipt generated
- [ ] Attendance: check-in works

### 17.5 Security Smoke
- [ ] Password hashes never returned in any API response
- [ ] `tokenHash` not exposed in staff invite list API
- [ ] Driver cannot access `/api/settings` (403)
- [ ] No raw nanoid/UUID as visible primary label in UI
- [ ] Notification bell: no stack traces, raw IDs, GPS, or server logs
- [ ] Secret scan: PASS or MANUAL PASS

### 17.6 PWA / Reload
- [ ] Dynamic import reload check: reload admin page, no "Failed to fetch dynamically imported module"
- [ ] Service worker registration does not break page loading

### 17.7 Production Health
- [ ] `GET /api/health` returns 200
- [ ] No 500 errors in first 5 minutes of server logs

### 17.8 Deployed Commit Verification
- [ ] Commit pushed to remote
- [ ] Render backend deployed commit hash matches
- [ ] Vercel frontend deployed commit hash matches
- [ ] Production domain not running older bundle
- [ ] `git status --short` clean (except ignored local-only folders)

### 17.9 Rollback Plan
If critical issues found:
1. Revert to previous commit: `git revert HEAD`
2. Redeploy previous build
3. Database: no destructive migrations — rollback is safe
4. Session: users may need to re-login after rollback

---

## 18. Preservation / Enforcement Plan

### 18.1 Single Source of Truth

This file is the master. `AGENTS.md` and `rules.md` may keep short project identity, read-order, and routing notes only. Master policy lives only in `docs/AI_AGENT_OPERATING_RULES.md`.

Specialized playbooks may keep implementation details, but must not restate policy blocks already in the master file.

If any playbook conflicts with this file, this file wins and the conflict must be reported.

### 18.2 File Actions

| File | Action |
|------|--------|
| `AGENTS.md` | Keep project stack, key patterns, code style, communication style. Add pointer to master. Remove duplicated policy blocks. |
| `rules.md` | Short pointer/routing file. Reference master. Keep minimal read order and ownership summary. Remove duplicated hard policy blocks. |
| `docs/AGENT_CURRENT_CONTEXT.md` | Keep current phase + product context. Remove/shorten "Current Working Rules" section. Add reference to master. |
| `docs/AGENT_FRONTEND_PLAYBOOK.md` | Keep UI patterns + mobile primitives. Remove QA policy (now in master Section 5). Add reference to master. |
| `docs/AGENT_BACKEND_PLAYBOOK.md` | Keep server patterns. Remove duplicated permission/data-safety policy. Add reference to master. |
| `docs/AGENT_TESTING_PLAYBOOK.md` | Keep tool detail + API script guidance + role test hints. Point to master Section 5 for QA policy and Section 12 for required checks. Add reference to master. |
| `docs/RELEASE_CHECKLIST.md` | Keep smoke test lists. Add deployed commit verification + git status check + secret scan status. |

### 18.3 Conflict Resolution

When any playbook or doc conflicts with this file:
1. This file wins.
2. The playbook must be updated to match.
3. The conflict must be reported in the next feedback block.

### 18.4 Rule Drift Prevention

- Rule version is tracked in the header (`v2026-07-04-v3`).
- Any change to this file must increment the version.
- Agents must reference the version in their GREEN SIGNAL.
- If an agent's behavior contradicts the versioned rules, the feedback block must flag it.

---

## 19. Implementation Plan

1. Create `docs/AI_AGENT_OPERATING_RULES.md` (this file).
2. Update `AGENTS.md` — add pointer to master, keep stack/code rules, remove duplicated policy.
3. Update `rules.md` — add header pointing to master, keep minimal read order, remove contradictory blocks.
4. Update `docs/AGENT_CURRENT_CONTEXT.md` — remove "Current Working Rules" section, add reference.
5. Update `docs/AGENT_FRONTEND_PLAYBOOK.md` — remove QA policy, add reference to master.
6. Update `docs/AGENT_BACKEND_PLAYBOOK.md` — remove duplicated permission/data-safety, add reference.
7. Update `docs/AGENT_TESTING_PLAYBOOK.md` — align QA policy with master Section 5, add reference.
8. Update `docs/RELEASE_CHECKLIST.md` — add deployment verification from Section 14.
9. Add future task: `scripts/check-sensitive-files.ts` (secret scanner).
10. Rotate/remove hard-coded key in `opencode.json` — replace with `${PROVIDER_API_KEY}` env var.
11. Run `git diff --check` after all doc edits.
12. Do NOT change production code during this doc-only phase.