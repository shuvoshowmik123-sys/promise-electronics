# Inspector Handoff Context

Last updated: 2026-07-21 Asia/Dhaka

Read `docs/AI_AGENT_OPERATING_RULES.md` first. This file is a compact transfer summary, not a replacement for `docs/BOT.md` or `docs/PROJECT_WORK_QUEUE.md`.

## Current Position

The active package is `JOB-INTAKE-UNIFICATION-01A`: a fast New Job flow for two lanes only.

- Customer: Full TV jobs only. A repeat customer can be selected from a compact card, or a first-time customer can be entered inline.
- External Technician/shop: separate external party, not an internal staff user and not a customer. Supports single or batch physical units. Every batch row creates a separate job number.
- Corporate and Corporate Ltd.: shown only as handoffs to the later B2B package. New Job must not create those accounts.

Backend external-party and external single/batch intake are complete locally. Codex rebuilt `CreateJobDrawer` and added a compact customer lookup. The first real headed QA close stopped on a real schema defect.

## Cross-Checked Defect

`DEFECT-01C-QC-1` is real and correctly stopped the package.

- `shared/schema.ts` defines the canonical `customers` table.
- `server/services/canonical-customer.service.ts` already reads and writes that table.
- `server/routes/jobs.routes.ts` compact lookup reads `FROM customers`.
- The trusted baseline `v2026_07_20_corporate_declaration` plus real `db:migrate:main` twice leaves `public.customers` absent.
- The current MAIN migration registry has no migration that creates `customers`.

Therefore a clean MAIN-migrated database cannot perform repeat-customer lookup, and other canonical customer writes are also unsafe there. The correct repair is an idempotent MAIN migration that creates the canonical `customers` table and its required indexes from the existing shared schema. Do not retarget lookup to `users`; `users` is portal identity, not the canonical customer record.

Evidence: `mobile-qa/job-intake-unification-01c-qa-close/20260721-1717/REPORT.md`.

## QA Result Interpretation

The QA result is correctly **FAILED - STOPPED**. Do not treat the 59 PASS results as a green close because the harness created a disposable `customers` table after recording the schema failure.

The five Customer name-input UI failures are probably harness order, not a confirmed UI defect. The harness clicks Corporate, which closes New Job and changes to B2B, then calls `openNewJob` without asserting that it returned to the Jobs screen. It consequently searches for Customer fields outside the drawer. Re-run this after the schema hotfix with an explicit return-to-Jobs step before assigning any product defect.

The duplicate-confirm dialog and browser network proof are not closed. They must be deliberately exercised in the re-run.

## Immediate Next Work

`JOB-INTAKE-UNIFICATION-01C-HOTFIX-1` - backend schema repair only.

1. Read backend playbook and the QA evidence above.
2. Add one appended, idempotent MAIN migration for the existing `customers` schema and indexes. Do not modify historical migrations or create a parallel customer authority.
3. Advance `REQUIRED_MAIN_SCHEMA_VERSION`.
4. Prove on a disposable baseline database: baseline restore, real MAIN migration twice, `to_regclass('public.customers')` present, schema/index shape matches the canonical table, and compact lookup works with only `{ id, name, phone, shortAddress }`.
5. Preserve existing Customer bind/journey behavior and external Technician isolation. No UI, QR, B2B, finance, backfill, production, commit, push, or deploy.
6. After this hotfix passes, re-run `JOB-INTAKE-UNIFICATION-01C-QA-CLOSE` in full. It is the only route to close Job Intake.

## Queue: 12 Packages Including Active Repair

1. `JOB-INTAKE-UNIFICATION-01A` - currently blocked on the customers MAIN-schema hotfix, then headed QA re-run.
2. `TECHNICIAN-QR-TRACKING-01` - private QR tracking for external shops only.
3. `B2B-ACCOUNT-BATCH-01` - Corporate and Corporate Ltd. existing-account selection and B2B batch jobs.
4. `TECHNICIAN-FLOW-01B` - technician next-best-work queue.
5. `WORKFORCE-UX-01` - mobile attendance.
6. `FINANCE-AND-AFTERCARE-01` - billing pause, due, refund, warranty, claims, and disputes.
7. `ADMIN-LIST-KEY-INTEGRITY-00A` - duplicate React key repair.
8. `ADMIN-WORKSPACE-CLEANUP-00A` - remove unreachable legacy admin UI.
9. `ADMIN-WORKSPACE-ROUTING-01` - safe admin URL and browser navigation behavior.
10. `AREA-INTELLIGENCE-UX-01` - privacy-safe local-area operations.
11. `CUSTOMER-LOCATION-BOOKING-01` - Dhaka pickup/drop-off booking.
12. `PRODUCTION-RELEASE-AND-VERIFICATION-01` - approved migration/deploy/live verification.

## QA Method

For backend/data work: use a disposable, prefix-checked PostgreSQL database restored from the trusted baseline; run the real `db:migrate:main` command twice; use real Express sessions and real HTTP; record auth, privacy, migration, cleanup, and DB-drop evidence. Never create schema or fixtures in shared/dev databases.

For UI work: use real Express plus Vite and headed browser sessions. Test 390x844, 430x932, 844x390, and 1440x900. Capture console and network summaries, verify no horizontal overflow, safe bottom action clearance, sheet close/restore behavior, and exact role boundaries. Route mocks are prohibited for these package closes.

Every implementation must run: `npx tsc --noEmit --pretty false`, `npx vite build --mode development`, `npm run build:server`, and `git diff --check`. A passed build is not visual QA; a passed UI shell is not a database proof.

## Non-Negotiable Boundaries

- Do not use external Technician phone/name data to create or bind a customer or customer journey.
- Do not use internal staff Technician users as outside shops.
- Do not create Corporate or Corporate Ltd. accounts from New Job.
- Do not begin QR, B2B, finance, release, commit, push, deploy, production, or cloud work while Job Intake is blocked.
- The worktree contains unrelated changes. Do not revert them.
