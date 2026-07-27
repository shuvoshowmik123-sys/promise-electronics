# AI Context Transfer — 2026-07-22

## Purpose

Use this file as the first handoff document for the next AI model. It records the verified state after the development-schema repair and separates completed work from the official queue's older, conflicting text.

## Workspace and safety

- Product root: `D:\PromiseIntegratedSystem\PromiseIntegratedSystem`
- The worktree is intentionally dirty. Preserve unrelated changes; never use reset/clean/checkout to discard them.
- No commit, push, deployment, production/Aiven access, or automatic startup/deployment migration is authorized by this handoff.
- Do not print, copy, log, or persist database URLs, passwords, access tokens, or service-account material. A development Neon password was exposed in chat on 2026-07-22 and must be rotated by its owner.

## Current local application state

- The local server is running at `http://localhost:5083`.
- Verified after restart: `GET /api/ready` returns `ready: true`; the admin login endpoint returns HTTP 200 with the existing local test fixture.
- The server must receive `PORT=5083` when started manually. The `.env` default port is different.
- `DATABASE_URL` in `.env` must be a **raw** `postgresql://...` URL. It must never be a `psql '...'` command wrapper; that wrapper made Node resolve the wrong hostname and caused `MAIN_SCHEMA_PENDING` / 503 responses.

## Schema migration work — complete for development

### Windows utility

- File: `tools/windows_schema_migration.py`
- Launch: `pyw -3 tools/windows_schema_migration.py` (or the installed Python `pythonw.exe`).
- It is the manual operator surface for the canonical TypeScript MAIN migration command. It stores no URL/password/history, passes the URL only through child-process environment, and shows only sanitized outcomes.
- System Settings is **read-only** schema status. It must not run schema DDL or accept a database URL.
- The utility accepts a raw URL and two exact copy/paste wrappers only: `DATABASE_URL=<url>` and `psql '<url>'` (including a quoted `.env` form). It must not accept arbitrary shell commands.
- Utility tests: `python -m unittest tests.test_windows_schema_migration -v` passed **17/17** on 2026-07-22.

### Migration and ledger repair

- Normal server startup is verify-only; it never runs MAIN DDL.
- Development Neon migration was explicitly authorized and run through the same canonical utility path:
  1. preflight: `pending_only`;
  2. canonical migration: `complete`;
  3. post-run read-only preflight: `healthy`.
- No production/Aiven migration, deployment, commit, or push occurred.
- A previous prerequisite gap was repaired with new ledgered migration `2026_07_19_reminders_prerequisite_reconciliation`, placed immediately before its dependent scheduler migration. No historical migration ID, SQL body, or checksum was changed.
- Disposable proofs covered databases both with and without `reminders`; repeat runs reached the canonical head with historic ledger rows preserved.

## Verified gates

- `npx tsc --noEmit --pretty false` — PASS.
- `npm test -- --run tests/reminders-prerequisite-reconciliation.test.ts` — PASS (4/4).
- `npx playwright test e2e/admin/login.spec.ts --reporter=line` — PASS (6/6).
- Windows utility tests — PASS (17/17).
- `git diff --check` — PASS; unrelated CRLF conversion warnings are present but are not errors.

## Queue truth and immediate next work

`docs/PROJECT_WORK_QUEUE.md` is useful but internally stale: its header says eight packages remain while its forward list has twelve lines, and it retains historical blocker text beside newer approval overrides. Do not use its numeric count as truth.

### Immediate next package: WORKFORCE-UX-01

**Goal:** mobile attendance reporting without creating a second attendance owner.

Existing partial work is already in the tree from prior agents: attendance correction requests, Asia/Dhaka day logic, effective check-in/out overlays, one-user-per-day protection, role-and-permission attendance gate, and manager correction review. It was not fully independently runtime-approved at the time of implementation. Start by reviewing the current diff and evidence rather than reimplementing it.

Required completion work:

1. Reconcile the existing attendance changes with `docs/PROJECT_WORK_QUEUE.md` and `docs/BOT.md`.
2. Run focused attendance tests, TypeScript/build gates, disposable migration proof, and real HTTP/browser proof.
3. Complete the planned mobile-native staff attendance report: date/month filter, staff search, present/absent counts, attendance ratio, and per-person calendar/history.
4. Preserve Super Admin Shift Monitor as today's live-duty view; no payroll/leave system or duplicate attendance data owner.

### Then, in order

1. `FINANCE-AND-AFTERCARE-01` — billing/POS pause, due/finance truth, refunds, warranty/claims, and dispute behavior; preserve canonical lifecycle and money ownership.
2. `ADMIN-LIST-KEY-INTEGRITY-00A` — fix real duplicate React-key warnings with stable identities and headed desktop/mobile proof.
3. `ADMIN-WORKSPACE-CLEANUP-00A` — remove only proven-unreachable legacy admin UI after import/route manifest and smoke proof.
4. `ADMIN-WORKSPACE-ROUTING-01` — canonical admin paths and safe legacy redirects; only after cleanup.
5. `AREA-INTELLIGENCE-UX-01` — privacy-safe aggregate micro-area operations; needs data-quality/privacy audit first.
6. `CUSTOMER-LOCATION-BOOKING-01` — Dhaka pickup/drop-off; starts only after Area Intelligence audit and a product decision defining the exact Dhaka service envelope.
7. `PRODUCTION-RELEASE-AND-VERIFICATION-01` — last; use the approved trusted release path and verify Render/Aiven/Vercel. Never use a browser migration button.

### Still-open verification item

`JOB-INTAKE-UNIFICATION-01C-QA-CLOSE` is marked inconsistently in old queue text. Its source and hotfixes have passed, but the full headed QA re-run evidence must be reconciled before calling that package fully closed. Treat it as a verification debt, not a reason to reimplement Customer/Technician intake, QR tracking, B2B batch intake, or the technician queue.

## Product decisions already settled

- Printed QR codes belong on job slips. A single-device job resolves to that job; a batch slip resolves to batch status. They are not customer-issued QR codes and must not expose customer/corporate data.
- Corporate/Corporate Ltd. New Job intake selects existing accounts only. Batch creates a parent plus one canonical job per unit.
- Technician workbench separates active ranked work from waiting work. Waiting reasons are limited to parts, customer decision, NG replacement, and NG review; do not add supplier/order/part-cost/ETA tracking yet.
- Generic work hold is `Awaiting Quote Approval`, permission-gated, and only enters from a workable state. Seven-day active-work alerts are once per active interval, with manager/Super Admin attention for unassigned work.
- Schema DDL is manual through the Windows utility or a separately approved release procedure. It is never performed by normal startup, deployment automatically, or System Settings.

## First actions for the next model

1. Read `docs/AI_AGENT_OPERATING_RULES.md`, this file, `docs/PROJECT_WORK_QUEUE.md`, and the `WORKFORCE-UX-01` brief in `docs/BOT.md`.
2. Inspect the current diff before changing files; preserve unrelated work.
3. Verify the local app remains ready before browser QA: `curl http://127.0.0.1:5083/api/ready`.
4. Do not use or reveal the development database URL. Confirm any remote migration only through the read-only preflight and the approved utility.
