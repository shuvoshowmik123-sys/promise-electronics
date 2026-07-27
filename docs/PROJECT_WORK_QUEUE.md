# Project Work Queue

**Owner:** Inspector

## Queue Rules

1. Work happens in the listed order unless the Inspector explicitly reprioritizes it.
2. A phase may start only when its stated entry gate is satisfied.
3. Every completion report must update this file in the same change set:
   - move the completed phase to **Completed**;
   - record the completion time in Asia/Dhaka;
   - record the report or evidence path;
   - state the next eligible phase and any remaining NOT VERIFIED work.
4. A phase with a blocker, FAIL, or required NOT VERIFIED item remains open. It is not silently treated as complete.
5. No feature may create a second owner for money, quote, warranty, job, customer, service-center, or device identity data. Stop and resolve ownership conflicts first.
6. New usability ideas are valuable, but do not bypass foundation, security, integrity, or performance work.
7. Codex owns frontend implementation and final UI/UX decisions for queued frontend phases. Do not delegate visual implementation to another model unless the Inspector explicitly approves a written UI specification.

## Current Remaining Queue - 2026-07-21

### Queue Count Correction - 2026-07-25

**Verified remaining main work families: 3.** Earlier text saying 8 is historical and over-counted completed `JOB-INTAKE-UNIFICATION-01A`, `TECHNICIAN-FLOW-01B`, `ADMIN-WORKSPACE-ROUTING-01E-QA-CLOSE`, Finance Disputes Hotfix-2, and now-closed `WORKFORCE-UX-01`. Do not count defect micro-packages or individual Area Intelligence slices as separate main queue families.

1. `AREA-INTELLIGENCE-UX-01` -- **DEFERRED** (`QUEUE-DECISION-AREA-INTELLIGENCE-DEFER-01A`, 2026-07-26 ~21:34). Slice 0 D6 measurement is complete but NOT ACCEPTED: no representative local operational data exists on this workstation. Not deleted; resumable unchanged once a populated local source is provided. Server pin DTO, pin UI, polygons, and status rollups remain locked.
2. `CUSTOMER-LOCATION-BOOKING-01` -- **DEFERRED** (same decision). Was blocked on D6 acceptance and inherits the deferral; separate ownership retained.
3. `PRODUCTION-RELEASE-AND-VERIFICATION-01` -- **ACTIVE, and now the only remaining work family.** Final protected release path and live verification.

### Centralized Execution Roadmap - 2026-07-27

**Authoritative sequence:** `docs/PRODUCTION_READY_PLAN_CODEX_REVIEW.md` (Codex final decision), the authoritative reconciliation evidence `mobile-qa/production-ready-plan-reconciliation-00a/20260727-0157/` with `EVIDENCE-CORRECTION-1.md`, and the accepted release manifest. The duplicate `20260727-0203` folder is retained as a non-authoritative cross-check only.

**Queue count remains unchanged:** one active family (Production Release) and two deferred families (Area Intelligence and Customer Location Booking). The post-release packages below are planned phases, not additional active queue families and not eligible until the release gate closes.

#### Release Completion - Active Now

1. **R0 - `LOCAL-OPENCODE-CONFIG-HYGIENE-01A`:** The ignored, untracked `opencode.json` has no in-repository product consumer, and the operator states that no Anthropic or external provider account is used. Do not call the local `provider.claude.apiKey` field an active Anthropic/product key. Remove the unused local `claude` provider block without reading or printing its value; validate JSON and re-run the manual local-config secret check. No account rotation or production-secret change is assumed.
2. **R1 - G16 release review: CLOSED.** `RELEASE-G16-HUNK-REVIEW-00A` correctly stopped because forced hunk-to-historical-package ownership would require guessing. `RELEASE-G16-RISK-REVIEW-01` passed the substantive high-risk review, and `...EVIDENCE-CORRECTION-1` closed its arithmetic defect: 25 category entries = 17 restrict + 7 neutral + 1 widen; 24 unique changes = 16 restrict + 7 neutral + 1 widen. Manifest closure and held Area Intelligence compatibility remain PASS. No staging occurred.
3. **R2 - `RELEASE-CONTROLLED-INTEGRATION-STAGING-01A`: BLOCKED at 42/285 commands.** The partial index exactly matches manifest commands 1-42 and is preserved. Its staged whitespace gate fails on four existing extra final blank lines; server build also exposes a CJS boot defect in `server/static.ts` (`fileURLToPath(import.meta.url)` receives empty `import.meta`). No commit or clean-clone proof is authorized.
4. **R2a - `RELEASE-STATIC-CJS-AND-WHITESPACE-HOTFIX-01A`: CLOSED.** CJS boot defect removed and four worktree whitespace failures repaired; all local gates pass with zero `empty-import-meta` warning. The 42-entry partial index remains intentionally unchanged, so its old staged whitespace copies still need recovery staging. Evidence: `mobile-qa/release-static-cjs-and-whitespace-hotfix-01a/20260727-1419/REPORT.md`.
5. **R2b - `RELEASE-CONTROLLED-INTEGRATION-STAGING-RECOVERY-01A`: BLOCKED — full manifest staged, Gate 1 fails on pre-existing content.** All 285 manifest entries are now correctly reflected in the index (verified via `git ls-files`, split by command type: 272/272 additions present, 12/12 deletions correctly absent, `skills` correctly absent; 0 unapproved, 0 held, arithmetic reconciles exactly). `tsc`, `vite build`, and `build:server` all pass — `build:server` confirms **zero** `empty-import-meta` warnings under the full candidate. **`git diff --cached --check` fails**: 108 lines / 8 files in three categories, none caused by this package — (A) 2 lines, the two `.sql` whitespace files whose prior fix left one of two trailing blanks; (B) 103 lines across 3 Markdown docs, almost certainly intentional hard-break syntax; (C) 3 lines, genuinely new discoveries in files never staged before this run (`customer-session.service.ts`, `job-status-transition.service.ts`, `technician-queue.service.ts`). No source repaired; the fully-staged index is preserved exactly. Evidence: `mobile-qa/release-controlled-integration-staging-recovery-01a/20260727-1439/REPORT.md`.
6. **R2c - `RELEASE-WHITESPACE-GATE-HOTFIX-01A`: CLOSED.** All 108 pre-existing `git diff --cached --check` findings across the 8 named files resolved in the working tree, with the staged index left untouched. Five files had extra trailing blank lines removed by exact byte truncation; extended byte inspection (not just the warning count) found `job-status-transition.service.ts` had two trailing blanks, not one, unlike the other four. Three Markdown files had their 103 hard-break line endings (exactly two trailing spaces, none deviating) converted to `<br>`, verified three independent ways: replacement count matches the pre-repair count exactly, byte-length delta matches the arithmetic exactly, and line counts are unchanged. All four required gates pass, including zero `empty-import-meta` warnings. Index preserved byte-identical, confirmed both before and after; zero Git index commands run. Evidence: `mobile-qa/release-whitespace-gate-hotfix-01a/20260727-1500/REPORT.md`.
7. **R2d - `RELEASE-CONTROLLED-INTEGRATION-STAGING-GATE-CLOSE-01A`:** stage only the eight repaired files, re-compare the full 285-entry candidate to the manifest, and require `git diff --cached --check` plus all build gates to pass. No source edits, commit, push, migration, deployment, or production access.
8. **R3 - Clean-clone candidate proof:** after R2d passes and a commit is explicitly authorized, build the staged release candidate from a fresh clone and run the real test baseline. The inherited 24/332/356 result is not a release fact until this run proves it.
9. **R4 - `TEST-SUITE-RESTORATION-00A` if R3 exposes failures:** fix or formally quarantine every failure with owner and reason; the suite must be green before production release work resumes.
10. **R5 - Protected production release:** fresh production backup under one hour; trusted MAIN migration CLI; approved commit push; Render/Vercel commit verification; Section 17 role, core-flow, security, reload, and health smoke. Only this phase may declare deployment.

#### Post-Release Roadmap - Locked Until R5 Passes

1. **P0 - `PERFORMANCE-BASELINE-00A`:** read-only observed baseline for request rate, server RSS, and client transfer size. Estimates are not accepted as results.
2. **P1 - `SSE-CONTRACT-ALIGNMENT-00A`:** repair query-tag registry drift, resolve notification-tag ownership, and add a static contract test that demonstrably fails when broken.
3. **P2 - Domain-by-domain real-time work:** one `SSE-EMISSION-SLICE-<domain>` followed by one `POLLING-RETIREMENT-<domain>` only after permission, two-browser, disconnect-fallback, and request-rate proof.
4. **P3 - `ADMIN-TAB-QUERY-GATING-00A`:** gate inactive-tab queries without module-global UI state or unmounting user context.
5. **P4 - `GEN2-RESIDUE-REMOVAL-00A`:** remove only proven unreachable residue; exclude active real-time contract inputs; prove all portals at 390, 430, 844x390, and 1440 with top-to-middle-to-bottom-to-top scroll evidence.
6. **P5 - URL retirement:** writer replacement, registered idempotent stored-link migration, then legacy-parser retirement only after zero legacy rows and navigations are proved.
7. **P6 - Resource safety and measured loading:** separately scope upload memory safety, backend lazy imports, and client CSS splitting; each needs before/after measurements and workflow proof.
8. **P7 - `SCHEDULER-INTERVAL-SLA-00A`:** no interval change without lease analysis and explicit product/SLA approval.

**Current focus:** R0, R1, R2a, and R2c are closed. The staged index still holds R2b's full 285-entry candidate exactly as-is; the eight repaired files are clean in the working tree but not yet re-staged. R2d gate-close is the only eligible next package. Do not promise a production deployment: clean-clone proof, a current production backup, protected migration authorization, and cloud verification remain external release controls.

### Completed - RELEASE-CHANGESET-OWNERSHIP-00A

**Status:** **COMPLETED (plan produced; nothing staged)** — **2026-07-27 00:55 Asia/Dhaka**. **PASS 7 / FAIL 0 / NOT VERIFIED 7 / BLOCKED 0**. **Deployment: NOT DEPLOYED.** `git add` never executed; 0 staged/committed/edited/ignored; 0 builds/tests/DB/browser/production.

**385 paths classified, UNASSIGNED = 0** — 21 owned groups + 12 Inspector-decision groups (102 paths), assigned from import evidence and `package.json` script references, not filenames.

**Dependency closure HOLDS**: 67 required-by-tracked and 10 untracked npm CLI entry points, **0 missing**. Verification overturned the automated map twice: `service-request-intake-migration.service.ts` is **live** (dynamic import at `server/index.ts:237`) and now in the manifest — omitting it would have caused a boot failure; `retail-quote-admin-acceptance-migration.service.ts` is genuinely unused (only a path string in a QA harness) and stays excluded.

**Structural finding:** 80 modified files in `G16-SHARED-INTEGRATION` are *multiply* owned, not unowned — splitting them needs hunk-level splits, so G16 stages atomically and must be reviewed diff-hunk level.

**Top decisions:** D1 Area Intelligence (5 paths, 915 insertions, family DEFERRED, mixed accepted/locked content); D8 `db-baselines/` untracked (adoption proof unreproducible from clean clone); D9 `skills` orphan gitlink with no `.gitmodules` (clean-clone hazard).

Manifest: ordered `git add` lines, text only, dependencies-before-importers, with all required exclusions. Seven post-staging gates specified including the decisive clean-clone build — **no result claimed**. `git diff --check` PASS.

**Independent review: ACCEPTED.** Limit recorded: closure is a static plan; it does not prove the commit builds nor resolve compatibility between held-back Area Intelligence files and shared modified files. Clean-clone build remains decisive.

**Decisions D1 / D8 / D9 RESOLVED — 2026-07-27, RECORD ONLY (nothing executed; 0 staged).** D1 exclude all 5 Area Intelligence paths (D6 lock intact; accepted service-centre pin work also held back). D8 track `db-baselines/` (6 paths; schema-only, safe; adoption proof becomes clean-clone reproducible). D9 `git rm --cached skills` (drops unresolvable mode-160000 gitlink; sequence before feature groups). Codex independently recommended the same three. Manifest now **284 `git add` + 1 `git rm --cached`**; closure still HOLDS. **Remaining 9 decisions RESOLVED as safe defaults — 2026-07-27, RECORD ONLY (nothing executed). All 12 closed; 0 open.** Eight are exclude/leave-untracked (D3 7, D4 20, D5 25, D6 1, D7 36, D10 2, D11 2, D12 2). **D2 is the exception — INCLUDE `qa-tooling/` (18)** because the modified `package.json` names its files across 6 `qa:*` scripts; excluding would ship failing scripts. D10 verified safe to exclude (no source reference; `assets/` not served by `server/static.ts`). D6 residual risk: `.grok/`/`.opencode/` still not gitignored. **Manifest unchanged: 284 `git add` + 1 `git rm --cached`; closure still HOLDS.** Counting correction: "102 paths / 12 decisions" counted only IDR groups — correct total is **125 paths**; the interim "95 remaining" should have read 113 (no decision or manifest change). Next: rotate provider key, then a separate integration/staging package executes. Evidence: `mobile-qa/release-changeset-ownership-00a/20260727-0055/` (`DECISION-RECORD-D1-D8-D9.md`).

### Completed - PRODUCTION-RELEASE-PREP-00A

**Status:** **COMPLETED (inventory produced; release NOT READY)** — **2026-07-27 00:35 Asia/Dhaka**. **PASS 6 / FAIL 2 / NOT VERIFIED 13**. **Deployment: NOT DEPLOYED.** Secret scan **SECRET FOUND**. Read-only: 0 product edits, 0 staged/committed, 0 `.gitignore`/config edits, 0 builds, 0 DB/server/browser/production access.

Counts (one `porcelain=v1` snapshot, start = end): **151 M / 12 D / 163 untracked** = 326.

**Two hard blockers.** (1) **67 untracked source files are imported by the current modified tracked code** — 21 via the current top-level boot path — plus 12 transitive and 5 untracked npm entry points including `server/db-migrate-main.ts`, the trusted release migration CLI. A clean clone of the intended release commit cannot build or boot unless this dependency set is tracked with its importers. (2) **`opencode.json` literal `apiKey`** → SECRET FOUND, rotate (untracked + gitignored, so not a committed-secret incident).

**Independent review correction:** this does not prove an old clean clone of `HEAD` fails: the representative imports are themselves uncommitted. It proves the current release candidate is incomplete and cannot be released until its dependencies are tracked and tested in a clean clone.

**Clean results:** no credential file tracked or stageable; no key literals in tracked source; all 12 deletions safe with **0 still imported**. `git diff --check` PASS (exit 0, 78 CRLF warnings, 0 whitespace errors).

**Correction:** malformed filenames `$null` / `({id` are in the **parent directory**, not the repo — an earlier session summary was wrong.

Ordered remediation plan (rotate → ownership review → classification decisions → grouped staging → **clean-clone** build → protected migration → deploy verify → Section 17 smoke) is in `release-checklist-gap.md`. Evidence: `mobile-qa/production-release-prep-00a/20260727-0035/`.

### Queue Recalculation - 2026-07-26 (`QUEUE-DECISION-AREA-INTELLIGENCE-DEFER-01A`)

**Active families: 1** (`PRODUCTION-RELEASE-AND-VERIFICATION-01`). **Deferred: 2** (Area Intelligence D6, Customer Location Booking) — both blocked by unavailable representative local operational data, established across runs `20260726-2000`, `20260726-2114`, and `20260726-2125`. Neither is deleted and neither gates the release.

**Remaining production-release prerequisites:**

1. **Repository hygiene** — working tree not clean: 150 modified, 12 deleted (the accepted `ADMIN-WORKSPACE-CLEANUP` removals, still uncommitted), 164 untracked (QA screenshots at repo root, `.grok/`, `opencode-temp-excluded/`, `AI-Memory-Vault/`, and two malformed filenames `$null` and `({id`). Sections 13.4 and 14.1 check 5 require clean status.
2. **Secret rotation** — `opencode.json` holds a literal provider `apiKey`: **SECRET FOUND — ROTATE REQUIRED**; replace with `${PROVIDER_API_KEY}`. It is gitignored so not committed; only `.env.example` / `.env.render.example` are tracked. `scripts/check-sensitive-files.ts` absent, so secret scan stays MANUAL.
3. **Production MAIN schema — NOT VERIFIED.** Local head `2026_07_25_work_locations_table` (48). Production head unknown from this session (production access forbidden). Apply only via trusted release CLI after a fresh (<1h) production backup; no browser update button.
4. **Deployment verification** — Render/Vercel deployed commit hashes match the signed-off commit; production domain not serving an older bundle; `/api/health` 200; no 500s in first five minutes.
5. **Release smoke suites** — role matrix, core flows, and security smoke (Sections 17.3–17.5) executed against the release candidate; standing `Production NOT VERIFIED` notes across completed packages convert to real checks only here.

**Not prerequisites:** Area D6, pin DTO/UI, polygons, status rollups, Customer Location Booking.

**Shared unblock:** Local loopback stack proven (`LOCAL-DISPOSABLE-QA-ENVIRONMENT-01A`). MAIN head now `2026_07_25_work_locations_table` (48). **WORKFORCE-UX-01 is closed** after isolated runtime proof and independent evidence-redaction acceptance. The current D6 local source was measured and is non-representative; a different approved populated local read-only source is required. Customer Location Booking waits for D6; production verification is last.

**Local configuration note:** `SERVICE-CENTER-LOCATION-CONFIG-01A` saved the Inspector-approved service-center coordinate in local `promise_dev` only. It is accepted as local configuration, not a production change and not an Area Intelligence pin; it does not alter the queue count (superseded 2026-07-26: 1 active family, 2 deferred).

### Completed - SERVICE-CENTER-LOCATION-CONFIG-01A

**Status:** **DONE** — **2026-07-26 ~20:50 Asia/Dhaka**. Saved `service_center_latitude`/`service_center_longitude` (`23.732714618643694` / `90.41297168195607`, order preserved) through the existing authenticated Settings flow against local source `promise_dev` @ `127.0.0.1:5432`. Read back correct via admin and public settings endpoints; homepage consumer verified live in-browser to compute a valid location from these values. 0 pre-existing settings to preserve (table was empty), 0 Area Intelligence/pins/customer-location touch, 0 product source edits, 0 migrations. `git diff --check` PASS. Evidence: `mobile-qa/service-center-location-config-01a/20260726-2050/REPORT.md`.

### Immediate - FINANCE-AND-AFTERCARE-01.4-UI-01A-HOTFIX-2

**Status:** **COMPLETED (PASS)** — **2026-07-25 Asia/Dhaka**. **PASS 14 / FAIL 0 / NOT VERIFIED 2**. `design-concept.tsx` exclusion includes `disputes`. Headed isolated-stack proof: no Under Development on desk; Open dispute → `DSP-*` auto-open. Evidence: `mobile-qa/finance-aftercare-01-4/20260725-2215-ui-01a-hotfix-2/`. **DEFECT-DISPUTES-PLACEHOLDER-DUAL-1 closed**.

### Immediate - WORKFORCE-UX-01-RETEST-QA-CLOSE-R2

**Status:** **COMPLETED (FAIL)** — **2026-07-25 Asia/Dhaka**. **PASS 8 / FAIL 1 / NOT VERIFIED 9**. Evidence: `mobile-qa/workforce-ux-01/20260725-2230-retest-qa-close-r2/`. Isolated stack OK; **DEFECT-ATTENDANCE-MAIN-GPS-COLUMNS-1** blocks normal check-in (missing GPS columns after full MAIN migrate). No forge/repair. Next: Inspector-directed MAIN schema integrity repair for attendance GPS columns, then re-run R2 visual proof.

### Immediate - ATTENDANCE-MAIN-GPS-COLUMNS-01A

**Status:** **COMPLETED (FAIL — secondary blocker)** — **2026-07-25 Asia/Dhaka**. **PASS 10 / FAIL 1 / NV 1**. Migration `2026_07_25_attendance_records_gps_columns` (head 47). **DEFECT-ATTENDANCE-MAIN-GPS-COLUMNS-1 closed** at catalog. Normal check-in still **500**: **DEFECT-WORK-LOCATIONS-MAIN-MISSING-1** (`work_locations` not on MAIN). Evidence: `mobile-qa/attendance-main-gps-columns-01a/20260725-2245/`. Next: Inspector package for `work_locations` MAIN table, then R3 visual.

### Immediate - WORK-LOCATIONS-MAIN-SCHEMA-01A

**Status:** **COMPLETED (PASS)** — **2026-07-25 Asia/Dhaka**. **PASS 14 / FAIL 0 / NV 1**. Migration `2026_07_25_work_locations_table` (head **48**). **DEFECT-WORK-LOCATIONS-MAIN-MISSING-1 closed**. Check-in **201** / check-out **200**; zero invented rows. Evidence: `mobile-qa/work-locations-main-schema-01a/20260725-2305/`. Next: **WORKFORCE-UX-01-RETEST-QA-CLOSE-R3** (Inspector GREEN SIGNAL only).

### Immediate - WORKFORCE-UX-01-CORRECTED-EFFECTIVE-TIME-HOTFIX-1

**Status:** **SOURCE REPAIR ACCEPTED; QA CLOSE REJECTED** — 2026-07-26 Asia/Dhaka. `AttendanceTab.tsx` now renders effective corrected times/duration correctly at desktop and both mobile viewports. The submitted QA is incomplete: screenshots show `All` rather than a selected staff member, so the required calendar never rendered; no persisted console/network trace exists; the harness swallows errors; report NV accounting is contradictory. No additional product repair is authorized. Next: `WORKFORCE-UX-01-CORRECTED-EFFECTIVE-TIME-QA-CLOSE-1`. Evidence and review: `mobile-qa/workforce-ux-01/20260726-0130-corrected-effective-time-hotfix-1/`.

### Immediate - WORKFORCE-UX-01-CORRECTED-EFFECTIVE-TIME-QA-CLOSE-1

**Status:** **BLOCKED ATTEMPT; INVALID PRE-FLIGHT** — **2026-07-26 16:10 Asia/Dhaka**. The stale head-45 database correctly returned 503, but the task required a new disposable cluster and dual migration to 48, and the run created no disposable database. The three missing migrations from aftercare head 45 are Commission Engine, attendance GPS columns, and `work_locations`; do not migrate any shared/local-existing database. The report's `37/37` focused test count is stale; independent run is `39/39 + 29/29 = 68/68`. Next: `WORKFORCE-UX-01-CORRECTED-EFFECTIVE-TIME-QA-CLOSE-2`. Evidence: `mobile-qa/workforce-ux-01/20260726-1610-corrected-effective-time-qa-close-1/`.

### Immediate - WORKFORCE-UX-01-CORRECTED-EFFECTIVE-TIME-QA-CLOSE-3

**Status:** **PASS** — **2026-07-26 19:10–20:05 Asia/Dhaka**. All three CODEX defects resolved. HTTP 403 `SELF_REVIEW_FORBIDDEN` confirmed via direct curl capture. 39+29=68 tests verified in Vitest verbose output. `console-network-trace.json` present in evidence dir. PASS 82 / FAIL 0 + gates PASS 4. Evidence: `mobile-qa/workforce-ux-01/20260726-1910-corrected-effective-time-qa-close-3/REPORT.md`.

### Completed - WORKFORCE-UX-01-CORRECTED-EFFECTIVE-TIME-QA-EVIDENCE-CORRECTION-1

**Status:** **DONE** — **2026-07-26 Asia/Dhaka**. Evidence-only redaction in the QA-CLOSE-3 folder: raw disposable IDs replaced with `[REDACTED-...]` labels in `REPORT.md`/`results.json`, Source Verification helper name corrected to `resolveDisplayAttendanceTimes()`, zero-match raw-ID search recorded. All PASS totals, gates, tests, screenshots, and trace preserved. `git diff --check` PASS. See `EVIDENCE-CORRECTION-1.md`. Awaiting independent acceptance to close Workforce.

### Historical pre-acceptance record - WORKFORCE-UX-01-CORRECTED-EFFECTIVE-TIME-QA-EVIDENCE-CORRECTION-1

**Superseded:** Workforce was independently accepted and closed after this record. The pre-acceptance `READY` text below is retained only as history.

**Status:** **READY - evidence only.** QA-CLOSE-3 runtime proof is accepted: isolated head-48 cluster, valid 403 `SELF_REVIEW_FORBIDDEN`, persisted redacted trace, 39/39 + 29/29 = 68/68, and selected-staff desktop/mobile proof. Its `REPORT.md` and `results.json` still contain raw disposable UUID/nanoid IDs, contrary to the package redaction rule. Redact those IDs, correct the helper name to `resolveDisplayAttendanceTimes()`, add a correction note and zero-match scan. No server, browser, DB, migration, test fixture, build, product source, commit, push, or deploy. Evidence review: `mobile-qa/workforce-ux-01/20260726-1910-corrected-effective-time-qa-close-3/CODEX-INDEPENDENT-REVIEW.md`.

### Immediate evidence correction - ADMIN-WORKSPACE-ROUTING-01E-QA-EVIDENCE-CORRECTION-1

**Status:** **COMPLETED** — **2026-07-25 Asia/Dhaka**. REPORT + results.json now share explicit six-item NOT VERIFIED list. Totals unchanged **PASS 14 / FAIL 0 / NOT VERIFIED 6**. Note: `EVIDENCE-CORRECTION-1.md`. Path: `mobile-qa/admin-workspace-routing-01e-qa-close/20260725-2115/`.

### Prior - COMMISSION-SCHEMA-INTEGRITY-01A

**Status:** **COMPLETED (PASS)** — **2026-07-25 Asia/Dhaka**. Migration `2026_07_25_commission_engine_tables`; dual migrate; seed 5 rules idempotent; cleanup. Evidence: `mobile-qa/commission-schema-integrity-01a/20260725-2100/`.

**Review note:** Core local repair accepted. Production/shared migration is still **NOT VERIFIED**. Separate optional Brain-store startup failures must be classified in later local runtime QA; they are not evidence that the Commission migration failed.

### Prior - LOCAL-DISPOSABLE-QA-ENVIRONMENT-01A

**Status:** **COMPLETED (infrastructure PASS)** — **2026-07-25 Asia/Dhaka**. Loopback PG **55432**, adoption **PASS**, `/api/ready` true. Product **0**. Does **not** accept Area D6.

### Shared prerequisite - LOCAL-DISPOSABLE-QA-ENVIRONMENT-01A + COMMISSION-SCHEMA-INTEGRITY-01A

**Status:** **COMPLETED.** Isolated loopback stack and commission table migration both proven. Items 2–4 runtime QA unblocked for local stack re-run.

### Current active implementation - AREA-INTELLIGENCE-UX-01B-SLICE-0

**D6 data-source correction:** Empty trusted baseline cannot satisfy D6 (zero operational rows). D6 requires an **approved representative non-production local read-only** source provisioned to the agent session.

**Status:** **BLOCKED** (representative RO path) — **2026-07-25 ~20:23 Asia/Dhaka**. **PASS 7 / FAIL 0 / BLOCKED 1 / NOT VERIFIED 8**. Product **unchanged**. Empty baseline not used. Neon/production/fixtures **0**. Latest: `mobile-qa/area-intelligence-ux-01b-slice-0/20260725-2023/`.

**Blocker:** `APPROVED_REPRESENTATIVE_LOCAL_READONLY_SOURCE_UNAVAILABLE` — instruction named approved RO source, but session has no connection env (`AREA_DQ_READONLY_URL` / equivalent) or documented local DB handle. Dotenv remote-forbidden refused. **D6 open; pin UI locked.**

**Unblock:** Provision approved local RO connection to agent session (never chat) → re-run aggregate-only measurement. No empty baseline for D6 rates. No Neon. No fixtures. No pins. No CUSTOMER-LOCATION-BOOKING-01.

**Restore attempt `20260726-2125` (`LOCAL-REPRESENTATIVE-AREA-DATA-RESTORE-01A`) — BLOCKED, NO SNAPSHOT ARTIFACT:** — **2026-07-26 ~21:25 Asia/Dhaka**. No brief in `docs/BOT.md` and no populated snapshot file anywhere on the workstation (recursive dump/SQL scan across the project + Downloads/Desktop/Documents). The trusted baseline was empirically confirmed schema-only (0 `COPY`/`INSERT` statements), so restoring it would produce a fourth empty database. 0 databases created / 0 restores / 0 migrations / 0 writes / 0 fixtures. Evidence: `mobile-qa/local-representative-area-data-restore-01a/20260726-2125/REPORT.md`. **D6 remains blocked on the same missing data.**

**Retest `20260726-2114` — BLOCKED, SOURCE NOT PRESENT:** — **2026-07-26 ~21:14 Asia/Dhaka**. A populated local read-only source was reported available; a full scan (env vars, all PostgreSQL ports/instances, all 5 local databases, Docker, WSL, dump files) found none. Every candidate database has `service_areas` = 0; `promise_dev` counts are identical to the prior run. **D6 CANNOT BE ACCEPTED; pin UI stays locked.** 0 writes/migrations/fixtures/Neon/production/pins/product edits. PASS 6 / FAIL 0 / BLOCKED 1 / NOT VERIFIED 5. Evidence: `mobile-qa/area-intelligence-ux-01b-slice-0/20260726-2114/REPORT.md`.

**Run `20260726-2000` — MEASURED, NOT REPRESENTATIVE:** — **2026-07-26 ~20:00 Asia/Dhaka**. Identified `promise_dev` @ `127.0.0.1:5432` (the only local non-Neon `DATABASE_URL` in the repo, via `.env.qa`) as a candidate; Inspector confirmed it as the intended source. Measured read-only (0 writes, 0 migrations): `service_requests`/`pos_transactions`/`warranty_claims`/`service_areas` all 0 rows; `job_tickets` 121 rows (102 retail-eligible), 0.0% attribution (0 service areas exist). **Verdict: NOT REPRESENTATIVE.** D6 still not accepted, pin UI still locked. PASS 12 / FAIL 0 / NOT VERIFIED 4 + gates PASS 4. Evidence: `mobile-qa/area-intelligence-ux-01b-slice-0/20260726-2000/REPORT.md`. Next: Inspector names a different populated local source, or D6 stays open.

### Prior - AREA-INTELLIGENCE-UX-01A

**Status:** **COMPLETED (audit only)** + **D1–D7 ACCEPTED** — **2026-07-25 Asia/Dhaka**. Evidence: `mobile-qa/area-intelligence-ux-01a/20260725-1958/`. Pin UI still gated on successful D6 measurement + Inspector acceptance.

### Current completion override - ADMIN-WORKSPACE-ROUTING-01E-QA-CLOSE

**Status:** **COMPLETED** — **2026-07-25 Asia/Dhaka**. **PASS 14 / FAIL 0 / NOT VERIFIED 6**. Headed desktop+mobile on isolated loopback stack. Evidence accounting closed by **01E-QA-EVIDENCE-CORRECTION-1**. Evidence: `mobile-qa/admin-workspace-routing-01e-qa-close/20260725-2115/` (`REPORT.md`, `results.json`, `EVIDENCE-CORRECTION-1.md`).

### Current completion override - ADMIN-WORKSPACE-ROUTING-01D

**Status:** **COMPLETED locally** — **2026-07-25 Asia/Dhaka**. GlobalSearch + NotificationPanel callbacks → canonical paths. **PASS 9 / FAIL 0 / NOT VERIFIED 5** + vitest **20/20**. Evidence: `mobile-qa/admin-workspace-routing-01d/20260725-1932/`.

**Next:** Re-open 01E-QA-CLOSE after local server + auth available.

### Current completion override - ADMIN-WORKSPACE-ROUTING-01C-HOTFIX-1

**Status:** **COMPLETED locally** — **2026-07-25 Asia/Dhaka**. POS leave-tab cleanup covers Wouter push/replace. **PASS 8 / FAIL 0 / NOT VERIFIED 4** + gates **PASS 5**. Evidence: `mobile-qa/admin-workspace-routing-01c-hotfix-1/20260725-1925/`.

### Current completion override - ADMIN-WORKSPACE-ROUTING-01C

**Status:** **COMPLETED locally** — **2026-07-25 Asia/Dhaka**. Operational deep links + role redirects on canonical paths. **PASS 10 / FAIL 0 / NOT VERIFIED 5** + vitest **18/18**. Evidence: `mobile-qa/admin-workspace-routing-01c/20260725-1919/`.

### Current completion override - ADMIN-WORKSPACE-ROUTING-01B

**Status:** **COMPLETED locally** — **2026-07-25 Asia/Dhaka**. Shell `navigateAdminTab` path push. **PASS 10 / FAIL 0 / NOT VERIFIED 5** + vitest **15/15**. Evidence: `mobile-qa/admin-workspace-routing-01b/20260725-1910/`.

### Current completion override - ADMIN-WORKSPACE-ROUTING-01A

**Status:** **COMPLETED locally** — **2026-07-25 Asia/Dhaka**. Path parser + legacy hash bridge. **PASS 9 / FAIL 0 / NOT VERIFIED 5** + vitest **13/13** + gates. Evidence: `mobile-qa/admin-workspace-routing-01a/20260725-1903/`.

### Current completion override - ADMIN-WORKSPACE-ROUTING-00A

**Status:** **COMPLETED (audit)** — **2026-07-25 Asia/Dhaka**. Canonical URL contract written. **PASS 10 / FAIL 0 / NOT VERIFIED 5** + gates **PASS 4**. Evidence: `mobile-qa/admin-workspace-routing-00a/20260725-1854/`. Slice A executed as **01A**.

### Current completion override - ADMIN-WORKSPACE-CLEANUP-01C

**Status:** **COMPLETED locally (frontend)** — **2026-07-25 Asia/Dhaka**. Admin PWA prompt mounted once on design-concept. **PASS 7 / FAIL 0 / NOT VERIFIED 4** + gates **PASS 4**. Evidence: `mobile-qa/admin-workspace-cleanup-01c/20260725-1851/`.

### Current completion override - ADMIN-WORKSPACE-CLEANUP-01B

**Status:** **COMPLETED locally** — **2026-07-25 Asia/Dhaka**. Orphan guided-demo-progress source+test pair removed. **PASS 9 / FAIL 0 / NOT VERIFIED 3** + gates **PASS 4**. Evidence: `mobile-qa/admin-workspace-cleanup-01b/20260725-1847/`.

### Current completion override - ADMIN-WORKSPACE-CLEANUP-01A

**Status:** **COMPLETED locally (frontend)** — **2026-07-25 Asia/Dhaka**. Batch A removed (10 files). **PASS 10 / SKIPPED 1** (`guided-demo-progress` kept for tests; later removed by **01B**). Evidence: `mobile-qa/admin-workspace-cleanup-01a/20260725-1842/`.

### Current active deletion - ADMIN-WORKSPACE-CLEANUP-01B

**Status:** **COMPLETED locally** — **2026-07-25 Asia/Dhaka**. Source+test orphan pair deleted. Evidence: `mobile-qa/admin-workspace-cleanup-01b/20260725-1847/`.

### Current completion override - ADMIN-WORKSPACE-CLEANUP-01A

**Status:** **COMPLETED (one stop-rule preserve; closed by 01B)** - 2026-07-25 Asia/Dhaka. **PASS 10 / FAIL 0 / NOT VERIFIED 4 / SKIPPED 1** + gates **PASS 4**. Ten Batch A paths removed; guided-demo-progress preserve superseded by **01B** deletion of source+test. Evidence: `mobile-qa/admin-workspace-cleanup-01a/20260725-1842/`.

### Historical completion override - ADMIN-WORKSPACE-CLEANUP-00A

**Status:** **COMPLETED (audit)** — **2026-07-25 Asia/Dhaka**. Source reachability only. **PASS 13 / FAIL 0 / NOT VERIFIED 5** + gates **PASS 4**. Product unedited; deletions 0. `AdminLayout` **UNREACHABLE**. Deletion contract Batch A accepted and executed by **01A**. Evidence: `mobile-qa/admin-workspace-cleanup-00a/20260725-1836/`.

### Current completion override - ADMIN-LIST-KEY-INTEGRITY-01A

**Status:** **COMPLETED locally (frontend)** — **2026-07-25 Asia/Dhaka**. R1–R3 secondary keys repaired in `ServiceRequestsTab.tsx`. **PASS 8 / FAIL 0 / NOT VERIFIED 4** + gates **PASS 4**. Evidence: `mobile-qa/admin-list-key-integrity-01a/20260725-1824/`.

**Next:** Optional headed SR detail key/console QA with real data. Do not re-open Disputes QA-CLOSE without `BASELINE_PGPASSWORD`.

### Current completion override - ADMIN-LIST-KEY-INTEGRITY-00A

**Status:** **COMPLETED (audit)** — **2026-07-25 Asia/Dhaka**. Source audit only. **PASS 14 / FAIL 3 / NOT VERIFIED 6** + gates **PASS 4**. No product edits, DB, or browser. Primary row keys already domain IDs; three SR detail index keys FAIL (repaired by **01A**). Evidence: `mobile-qa/admin-list-key-integrity-00a/20260725-1814/`.

### Deferred runtime proof - FINANCE-AND-AFTERCARE-01.4-UI-01A-QA-CLOSE

**Status:** **COMPLETED (FAIL)** then repaired by **HOTFIX-2 PASS** — **2026-07-25 Asia/Dhaka**. QA-CLOSE evidence: `…/20260725-2145-ui-01a-qa-close/`. Hotfix evidence: `…/20260725-2215-ui-01a-hotfix-2/`. **DEFECT-DISPUTES-PLACEHOLDER-DUAL-1 closed**.

This is the current forward-looking list. Historical sections below remain evidence, not additional unfinished work. There are **8 work packages** left. Customer feedback foundation through **01B UI**, Customer/Technician intake, printed technician QR tracking, B2B account batch intake, and the technician active/blocked queue are closed. Inspector direction on 2026-07-21 broadens the former technician intake work into a four-area job-unification program: Customer, Technician, Corporate, and Corporate Ltd.

> **Current status override — 2026-07-21 Asia/Dhaka:** `JOB-INTAKE-UNIFICATION-01A` is green-closed by the host-run `20260721-1905` QA harness (**PASS 105 / FAIL 0 / NV 0**) plus gates. `TECHNICIAN-QR-TRACKING-01` is approved: focused tests **PASS 9**, dedicated MAIN migration proof **PASS 25 / FAIL 0 / BLOCKED 0**, and TypeScript/Vite/server/diff gates pass. `B2B-ACCOUNT-BATCH-01` is approved: focused tests **PASS 6/6** and TypeScript/Vite/server/diff gates pass; browser exercise was not available and is not claimed. The stale item text below is retained as historical evidence only. **Next eligible package: `TECHNICIAN-FLOW-01B`.**

1. **JOB-INTAKE-UNIFICATION-01A** - Shared New Job intake rules plus Customer and external Technician implementation. **Backend + Codex UI shipped.** **01C-HOTFIX-1 runtime PASS**. **01C-QA-CLOSE** last executed run **FAILED—STOPPED** (`20260721-1717`); full re-run package `20260721-1905` still **BLOCKED** (worker shell `IO Error: program not found` on every spawn including node/cmd/powershell) — not closed; PASS 0. **Next:** host-run `mobile-qa/job-intake-unification-01c-qa-close/20260721-1905/run-qa-close.mjs` + gates outside worker shell. Corporate/Corporate Ltd. remains item 3 (`B2B-ACCOUNT-BATCH-01`).
2. **TECHNICIAN-QR-TRACKING-01** - Secure technician/shop QR tracking for only that technician's own jobs and batches, with panel/parts badges and no customer/corporate data leak.
3. **B2B-ACCOUNT-BATCH-01** - Existing Corporate and Corporate Ltd. account selection, single/batch unit intake, per-unit job numbers, simplified Jobs batch presentation, and account-linked batch visibility. No B2B account creation from New Job.
4. **TECHNICIAN-FLOW-01B** - Explainable next-best work queue for technicians.
5. **WORKFORCE-UX-01** - Mobile attendance reporting.
6. **FINANCE-AND-AFTERCARE-01** - Expand the former Finance UX scope: POS/billing selection, billing pause, due/finance truth, refund, warranty, warranty claims, and challenge/dispute behavior without changing the canonical repair lifecycle.
7. **ADMIN-LIST-KEY-INTEGRITY-00A** - Fix duplicate React-key warnings with stable identities.
8. **ADMIN-WORKSPACE-CLEANUP-00A** - Remove verified unreachable legacy admin UI and smoke-test current routes.
9. **ADMIN-WORKSPACE-ROUTING-01** - Canonical admin URLs, back/forward behavior, and safe legacy redirects.
10. **AREA-INTELLIGENCE-UX-01** - Privacy-safe micro-area operations, aggregated reference pins, and an audit-approved data rule.
11. **CUSTOMER-LOCATION-BOOKING-01** - Dhaka-only pickup/drop-off, booking eligibility, and safe address/location fallbacks.
12. **PRODUCTION-RELEASE-AND-VERIFICATION-01** - Inspector chooses/approves the protected release path, applies reviewed migrations through the trusted CLI, then verifies Render/Aiven/Vercel behavior. No browser database update button.

### Deferred release-validation proof - WORKFORCE-UX-01-RETEST-QA-CLOSE

**Status:** **SUPERSEDED BY R2 FAIL** — **2026-07-25 Asia/Dhaka**. Historical password-blocked run: `…/20260725-retest-qa-close/`. R2 stack unblocked but **FAIL** on check-in schema gap: `…/20260725-2230-retest-qa-close-r2/`. **DEFECT-ATTENDANCE-MAIN-GPS-COLUMNS-1**. Corrected UI still **NOT VERIFIED**.

### Current completion override - FINANCE-AND-AFTERCARE-01.4-UI-01A-HOTFIX-2

**Status:** **COMPLETED (PASS)** — **2026-07-25 Asia/Dhaka**. **PASS 14 / FAIL 0 / NV 2**. `design-concept.tsx` exclusion fix. Evidence: `mobile-qa/finance-aftercare-01-4/20260725-2215-ui-01a-hotfix-2/`. Defect closed.

### Current completion override - FINANCE-AND-AFTERCARE-01.4-UI-01A-QA-CLOSE

**Status:** **COMPLETED (FAIL; repaired by HOTFIX-2)** — **2026-07-25 Asia/Dhaka**. Headed disposable-stack run. **PASS 18 / FAIL 1 / NV 5**. Evidence: `mobile-qa/finance-aftercare-01-4/20260725-2145-ui-01a-qa-close/`.

### Current completion override - FINANCE-AND-AFTERCARE-01.4-UI-01A-HOTFIX-1

**Status:** **COMPLETED locally (frontend)** — **2026-07-25 Asia/Dhaka**. Create+view opens new case detail on desk. **PASS 6 / FAIL 0 / NOT VERIFIED 2** + gates **PASS 4**. Evidence: `mobile-qa/finance-aftercare-01-4/20260725-ui-01a-hotfix-1/`. QA-CLOSE **BLOCKED** on disposable baseline.

**Next:** Re-run QA-CLOSE after local disposable credentials.

### Current completion override - FINANCE-AND-AFTERCARE-01.4-UI-01A

**Status:** **COMPLETED locally (frontend)** — **2026-07-25 Asia/Dhaka**. Disputes case desk + contextual Open dispute. **PASS 8 / FAIL 0 / NOT VERIFIED 6** + gates **PASS 4**. Backend unchanged. Evidence: `mobile-qa/finance-aftercare-01-4/20260725-ui-01a/`. Create→detail handoff fixed by **HOTFIX-1**.

**Next:** QA-CLOSE after HOTFIX-1 review.

### Current completion override - FINANCE-AND-AFTERCARE-01.4-UI-00A

**Status:** **COMPLETED (audit only)** — **2026-07-25 Asia/Dhaka**. Dispute API/permission/surface map + Codex UI contract. **PASS 16 / FAIL 0 / NOT VERIFIED 11** + gates **PASS 4**. Implemented by **01.4-UI-01A**. Evidence: `mobile-qa/finance-aftercare-01-4/20260725-ui-00a/`.

### Current completion override - FINANCE-AND-AFTERCARE-01.3-LONG-TABLE-PRINT-HOTFIX-1

**Status:** **COMPLETED locally** — **2026-07-25 Asia/Dhaka**. Footer-only trailing A4 page fixed. **PASS 27 / FAIL 0 / NOT VERIFIED 1** + gates **PASS 4**. File: `client/src/pages/admin/corporate-bill-print.tsx`. Synthetic 40-row PDF: **4 pages**, final page **INVOICE_CONTENT** (subtotal+footer), `footerOnlyPages=[]`. Real two-row still 1 page footer-low. Zero financial writes.

**Independent Codex review:** **ACCEPTED.** The rendered final page has the subtotal plus the one footer, with no blank/footer-only page, overlap, or duplicate footer. Physical-printer output remains NOT VERIFIED.

**Evidence:** `mobile-qa/finance-aftercare-01-3/20260725-long-table-print-hotfix-1/`.

**Next eligible package:** Inspector-directed only — Ticket 04 remains blocked until explicitly ordered. No commit/push/deploy.

### Superseded completion claim - FINANCE-AND-AFTERCARE-01.3-LONG-TABLE-QA-CLOSE

**Superseded by visual review:** The recorded PASS is not a queue gate. The synthetic PDF's final page is footer-only and therefore classified **FAIL**. Follow `FINANCE-AND-AFTERCARE-01.3-LONG-TABLE-PRINT-HOTFIX-1` above before Ticket 04.

**Status:** **COMPLETED (evidence only)** — **2026-07-25 Asia/Dhaka**. Multi-page synthetic DOM stress on canonical A4 invoice. **PASS 24 / FAIL 0 / NOT VERIFIED 1** + gates **PASS 4**. Product source **unchanged**. Zero financial writes.

**Evidence:** `mobile-qa/finance-aftercare-01-3/20260725-long-table-qa-close/` — real 2-row + scroll shots; synthetic 40-row PDF **4 pages**, footer final page only, no row cover.

**Next eligible package:** Inspector-directed only — Ticket 04 remains blocked until explicitly ordered. No commit/push/deploy.

### Current completion override — FINANCE-AND-AFTERCARE-01.3-UI-HOTFIX-2-HOTFIX-1

**Status:** **COMPLETED locally** — **2026-07-25 Asia/Dhaka**. Short A4 invoice footer pinned to page bottom via flex column + `mt-auto`. **PASS 21 / FAIL 0 / NOT VERIFIED 1** (physical printer) + gates **PASS 4**. File: `client/src/pages/admin/corporate-bill-print.tsx`. Fixture `QALTD24-BILL-0001` zero writes. Long-table footer-only page corrected by LONG-TABLE-PRINT-HOTFIX-1.

**Evidence:** `mobile-qa/finance-aftercare-01-3/20260725-a4-footer-hotfix-1/` — `REPORT.md`, `results.json`, `gates.json`, mobile/desktop screenshots, PDF + page1, `pdf-footer-position.json` (ratio ≈ 0.95).

### Current completion override — FINANCE-AND-AFTERCARE-01.3-UI-HOTFIX-2

**Status:** **COMPLETED locally (product + proof)** — **2026-07-25 Asia/Dhaka**. Canonical A4 invoice preview: one table document for desktop/mobile/PDF; mobile cards removed. **PASS 58 / FAIL 0 / NOT VERIFIED 1** (physical printer) + gates **PASS 4**. File: `client/src/pages/admin/corporate-bill-print.tsx`. Fixture `QALTD24` / `QALTD24-BILL-0001` zero writes. B2B washout 5-cycle: not reproduced. **Footer short-page placement corrected by HOTFIX-1 above.**

**Evidence:** `mobile-qa/finance-aftercare-01-3/20260725-a4-preview-hotfix-2/` — `REPORT.md`, `results.json`, `gates.json`, multi-viewport screenshots, `QALTD24-BILL-0001-a4.pdf` + page1 PNG, `b2b-washout-trace.json`.

### Current completion override — FINANCE-AND-AFTERCARE-01.3-UI-HOTFIX-1-QA-EVIDENCE-CLOSE

**Status:** **COMPLETED (evidence only)** — **2026-07-25 Asia/Dhaka**. Product source **unchanged**. Headed library re-proof + **real A4 browser PDF**. **PASS 36 / FAIL 0 / NOT VERIFIED 4** + gates **PASS 4**. Totals in `REPORT.md` and `results.json` agree. Prior UI-HOTFIX-1 product repair retained; prior evidence folder preserved with correction note. **Superseded for screen layout by UI-HOTFIX-2** (cards → scaled A4).

**Evidence:** `mobile-qa/finance-aftercare-01-3/20260725-qa-evidence-close/` — `REPORT.md`, `results.json`, `gates.json`, `tool-availability.json`, `console-request-trace.json`, `fixture-no-write.json`, `QALTD24-BILL-0001-a4.pdf`, `QALTD24-BILL-0001-a4-page1.png`, mobile 390/430 + desktop screenshots.

**Remaining NOT VERIFIED:** Browser-act; Playwright MCP desktop/mobile; physical printer. No production/commit/Ticket 04.

### Current completion override — FINANCE-AND-AFTERCARE-01.3-UI-HOTFIX-1

**Status:** **COMPLETED locally (product)** — **2026-07-25 Asia/Dhaka**. Screen repair shipped. Evidence integrity superseded by **QA-EVIDENCE-CLOSE** above for print/totals. Original: **PASS 24 / FAIL 0 / NOT VERIFIED 3** + gates **PASS 4**. File: `client/src/pages/admin/corporate-bill-print.tsx`. Fixture: `QALTD24` / `QALTD24-BILL-0001`.

**Evidence:** `mobile-qa/finance-aftercare-01-3/20260725-ui-hotfix-1/REPORT.md` (with correction note pointing to evidence-close).

### Current completion override — WORKFORCE-UX-01

**Status:** **PATCHED NEEDS RETEST** — **2026-07-23 Asia/Dhaka**. Source and future-month browser acceptance are closed; checkout-only correction visual evidence remains unavailable. **PASS 68 / FAIL 0 / NOT VERIFIED 3** + gates **PASS 4**. Fixes: (1) Asia/Dhaka elapsed-day denominator for ratio in both server endpoint and client calendar; future days neutral not absent. (2) Single `hasAttendanceCorrection()` helper used in mobile cards, desktop rows, calendar badges. (3) Shared `getAttendanceDateDhaka()` replaces all browser-local `new Date()` decisions. (4) `getByUserMonth()` wired into selected-staff mobile calendar; no duplicate summary logic. (5) Focused tests for 100% ratio, checkout-only correction, Dhaka boundary, endpoint shape. (6) Future-month contract correction: extracted `computeAttendanceMonthSummary()` into `server/services/attendance-day.service.ts`; API contract now keeps `eligibleDays` (elapsed denominator) separate from `daysInMonth`/`calendarDays` (actual calendar length) — `daysInMonth` no longer aliases elapsed days; future month returns `presentDays=0, absentDays=0, ratio=0` and never counts future records as present; client/server `AttendanceMonthSummary` types aligned with the new `eligibleDays` field. (7) Final P1: extracted `buildAttendanceMonthResponse()` pure function; endpoint now returns only `responseRecords = records.filter(record => record.date <= todayDhaka)` — a future-dated attendance row never appears in the selected-staff API response and never renders as Present in `StaffAttendanceCalendar`.

**Evidence:** `tests/attendance-report.test.ts` **PASS 39/39** (incl. 9 real service-level tests exercising `computeAttendanceMonthSummary` for past/current/future months, and 5 route/response-contract tests exercising `buildAttendanceMonthResponse` proving future records are excluded while valid current/past records remain — the future case exercises real summary logic with future-dated mock records, not copied arithmetic); `tests/attendance-correction.test.ts` **PASS 29/29**. TypeScript, Vite, server build, and `git diff --check` **PASS**. Host browser QA: desktop 1440x900 and mobile 390x844 **PASS**; selected August future month returned API `records: []` and `0 present / 0 absent / 0% ratio`, with no post-login console errors or mobile horizontal overflow. Evidence: `mobile-qa/workforce-ux-01/20260722-1932/REPORT.md`, `mobile-qa/workforce-ux-01/20260723-host-browser-qa/REPORT.md`.

**Remaining NOT VERIFIED:** Real approved-correction badge/calendar on desktop+mobile (RETEST-QA-CLOSE **BLOCKED** 2026-07-25 — no disposable local baseline password); multi-viewport mobile; production/remote. Retained PATCHED NEEDS RETEST — not self-approved.

**Next eligible package:** Complete `WORKFORCE-UX-01-RETEST-QA-CLOSE` after disposable local PG credentials; then Inspector-directed Finance Ticket 04 / remaining queue.

### Current completion override — TECHNICIAN-FLOW-01B

**Status:** **APPROVED** — **2026-07-21 Asia/Dhaka**. This supersedes the earlier status override above. The explainable technician queue separates active ranked work from generic waiting reasons, adds the permission-gated generic `Awaiting Quote Approval` hold, and records seven-day active-work alerts once per active interval. It does not create a supplier, parts-order, ETA, or price-data system.

**Evidence:** `tests/technician-queue.test.ts` **PASS 12/12**; `mobile-qa/technician-flow-01b/20260721-2200/run-proof.mjs` **PASS** for the idempotent MAIN migration, ledger, default timer, direct raw insert, and cleanup. TypeScript, Vite, server build, and `git diff --check` **PASS**. Review: Traycer artifact `technician-flow-01b/reviews/implementation-review-1`.

**Remaining NOT VERIFIED:** Desktop/mobile browser interaction was not run because no local app server can be started by the worker. It is not claimed as passing.

**Next eligible package:** `WORKFORCE-UX-01`.

### Completed this session — B2B-ACCOUNT-BATCH-01

**Status:** **APPROVED** — **2026-07-21 Asia/Dhaka**. Existing Corporate and Corporate Ltd. accounts can be selected for dedicated staff-only single or batch intake; the generic retail creator rejects B2B payloads. Optional external references are collision-checked per account, case-insensitively and transaction-safely; batches create a grouping parent plus one canonical job per unit.

**Evidence:** `tests/b2b-account-intake.test.ts` **PASS 6/6**; TypeScript, Vite, server build, and `git diff --check` **PASS**. Review: Traycer artifact `b2b-account-batch-01/reviews/implementation-review-1`.

**Remaining NOT VERIFIED:** Browser interaction was not run because no app server was available to the worker; it is not represented as a passing result.

**Next:** `TECHNICIAN-FLOW-01B`.

### Completed this session — JOB-INTAKE-UNIFICATION-01C-HOTFIX-1

**Status:** **PASS (runtime)** — **2026-07-21 ~18:00 Asia/Dhaka** (status corrected after host supervisor re-run). **PASS 35 / FAIL 0 / BLOCKED 0** + gates **PASS 4**.

**Evidence:** `mobile-qa/job-intake-unification-01c-hotfix-1/20260721-1800/REPORT.md` + `results.json` + `gates.json` + `run-proof.mjs`.

**Shipped in product source:** MAIN id `2026_07_21_canonical_customers`; `REQUIRED_MAIN_SCHEMA_VERSION` advanced; idempotent `CREATE TABLE IF NOT EXISTS customers` + three indexes. No UI/QR/B2B/finance.

**Provenance:** Original worker shell/worktree unavailable (`IO Error: program not found`). Host supervisor ran existing harness + gates on nested product workspace via absolute Node/PostgreSQL/Git. **01C-QA-CLOSE not re-run / not closed.**

**Next:** Re-run full 01C-QA-CLOSE. Hotfix does not self-approve or close Job Intake.

### Completed this session — JOB-INTAKE-UNIFICATION-01C-QA-CLOSE

**Status:** **BLOCKED (full re-run)** — **2026-07-21 Asia/Dhaka**. Worker re-entry for full re-run after HOTFIX-1. Shell still unavailable: every spawn failed with exact `Terminal error: IO Error: program not found` (`node -v`, `where.exe node`, `cmd.exe`, `powershell.exe`, full-path node). **PASS 0 / FAIL 0 / NV 0 / BLOCKED**. Harness remains fixed under `20260721-1905/`; **no headed/API/gate execution**. Last executed run **FAILED—STOPPED** `20260721-1717` (**PASS 59 / FAIL 5 / NV 2**). Product **unchanged**. Not self-approved. No later packages started.

**Evidence (blocked re-run):** `mobile-qa/job-intake-unification-01c-qa-close/20260721-1905/` — `REPORT.md`, `results.json`, `gates.json`, `host-run-blocked.txt`, `shell-probe.txt`, fixed `run-qa-close.mjs`.<br>
**Evidence (last executed):** `mobile-qa/job-intake-unification-01c-qa-close/20260721-1717/REPORT.md`.

**STOP (historical):** **DEFECT-01C-QC-1** hotfixed (MAIN `customers`). Re-QA still open. Harness now forces Jobs return after Corporate before Customer deep checks.

**Next:** Supervisor/host execute outside worker shell:

```bash
cd D:\PromiseIntegratedSystem\PromiseIntegratedSystem
node mobile-qa/job-intake-unification-01c-qa-close/20260721-1905/run-qa-close.mjs
npx tsc --noEmit --pretty false
npx vite build --mode development
npm run build:server
git diff --check
```

No green close until executed re-run.

### Completed this session — JOB-INTAKE-UNIFICATION-01C-00A

**Status:** **COMPLETED (audit/design only)** — **2026-07-21 ~16:25 Asia/Dhaka**. Source **PASS**; lookup API **FAIL**; external UI **FAIL**; viewports **NV**. Gates **PASS 4**. Product **unchanged**.

**Evidence:** `mobile-qa/job-intake-unification-01c-00a/20260721-1625/REPORT.md` + `codex-new-job-ui-spec.md`.

**Findings:** CreateJobDrawer is single retail + B2B handoff only; full customers list unsafe; external APIs unwired. Codex owns next UI.

**Next:** Codex New Job UI implementation GREEN SIGNAL.

### Completed this session — JOB-INTAKE-UNIFICATION-01A-B

**Status:** **COMPLETED locally** — **2026-07-21 ~16:10 Asia/Dhaka**. **PASS 28 / FAIL 0 / NV 1** + gates **PASS 4**.

**Evidence:** `mobile-qa/job-intake-unification-01a-b/20260721-1610/REPORT.md`.

**Shipped:** `POST .../external-technician-intake/single|batch`; isolation from bind/journey/SR; public track 404; duplicate confirm gate.

**Next:** Closed by 01C-00A Codex spec (above).

### Completed this session — JOB-INTAKE-UNIFICATION-01A-A-HOTFIX-1

**Status:** **COMPLETED locally** — **2026-07-21 ~15:40 Asia/Dhaka**. **PASS 24 / FAIL 0** + gates **PASS 4**.

**Evidence:** `mobile-qa/job-intake-unification-01a-a-hotfix-1/20260721-1540/REPORT.md`.

**Shipped:** Migration `2026_07_21_external_party_ref_pair`; paired CHECK on jobs/batches (both null or external_technician+id); old one-way checks dropped.

**Next:** Closed by 01A-B (above).

### Completed this session — JOB-INTAKE-UNIFICATION-01A-A

**Status:** **COMPLETED locally** — **2026-07-21 ~15:24 Asia/Dhaka**. **PASS 28 / FAIL 0 / NV 1** + gates **PASS 4**.

**Evidence:** `mobile-qa/job-intake-unification-01a-a/20260721-1524/REPORT.md`.

**Shipped:** Migration `2026_07_21_external_intake_parties`; dedicated external-party store; job/batch typed prep FKs; `GET/POST /api/admin/external-intake-parties` behind `jobs.create`; compact DTO; walk-in unchanged.

**Next:** Closed by HOTFIX-1 pair integrity (above).

### Completed this session — JOB-INTAKE-UNIFICATION-01A-00A-HOTFIX-2

**Status:** **COMPLETED (documentation/evidence only)** — **2026-07-21 ~15:06 Asia/Dhaka**. **PASS 5 / FAIL 1 / NV 4** + `git diff --check` **PASS**; tsc/vite/server **NOT VERIFIED**. Product **unchanged**.

**Evidence:** `mobile-qa/job-intake-unification-01a-00a-hotfix-2/20260721-1506/REPORT.md`.

**Corrections:** Revoked HOTFIX-1 flags-only external identity. Source: walk-in `bindCustomerToJob` + portal journey by Customer phone; unique `customers.primaryPhone`; ambiguous `job_batches.customerId`. Contract **R1–R6**; recommend dedicated external-party store; external create must skip bind/journey; party-scoped lookup; batch+jobs share canonical party id.

**Next:** Closed by 01A-A foundation (above).

### Completed this session — JOB-INTAKE-UNIFICATION-01A-00A-HOTFIX-1

**Status:** **COMPLETED (documentation/evidence only)** — **2026-07-21 ~14:47 Asia/Dhaka**. **PASS 4 / FAIL 0 / NV 4** + `git diff --check` **PASS**; tsc/vite/server **NOT VERIFIED**. Product **unchanged**.

**Evidence:** `mobile-qa/job-intake-unification-01a-00a-hotfix-1/20260721-1447/REPORT.md` (+ HOTFIX-2 note on I1 revoke).

**Corrections:** Ownership de-dupe (01A = Customer + external Technician + shared rules; B2B/QR/finance separate). Voided false U3/U4/U5/U7 and U1–U15 hard stop. Legacy `panelItems` not Customer Full TV blocker. Corporate/Ltd filter → `B2B-ACCOUNT-BATCH-01`.

**Next:** External identity isolation closed by HOTFIX-2 (above).

### Completed this session — JOB-INTAKE-UNIFICATION-01A-00A

**Status:** **COMPLETED (audit/design only)** — **2026-07-21 ~13:43 Asia/Dhaka**. **PASS 8 / FAIL 4 / NV 4** + gates **PASS 4**. Product **unchanged**.

**Evidence:** `mobile-qa/job-intake-unification-01a-00a/20260721-1343/REPORT.md` (+ HOTFIX-1 correction note).

**Findings:** Four-area New Job not implemented. External Technician ≠ staff role (no intake lane). Corporate/Ltd = one `corporate_clients` table. Challan IN unit lineage **PASS**; retail `panel_only` multi-unit single job **FAIL** (legacy risk). Compact lookup API **FAIL**. Bill stamp keeps jobs **PASS**.

**Next:** Closed entry-gate overblocking via HOTFIX-1 (above).

### Completed this session — TECHNICIAN-FLOW-01A-00A

**Status:** **COMPLETED (audit/design only)** — **2026-07-21 ~12:39 Asia/Dhaka**. **PASS 8 / FAIL 2 / NV 4** + gates **PASS 4**. Product **unchanged**.

**Evidence:** `mobile-qa/technician-flow-01a-00a/20260721-1239/REPORT.md`.

**Findings:** No dedicated tech mobile intake; create = `POST /api/job-tickets` + `jobs.create`; customer prefill today = full admin customers list; SR has 10m duplicate window, walk-in job create has no server duplicate gate; retail vs corporate serials separate. Narrow TECHNICIAN-FLOW-01A superseded by four-area unification.

**Inspector correction:** The narrow contract is partially superseded. New Job must be revised around Customer, Technician, Corporate, and Corporate Ltd. Customer/Technician may be created inline; Corporate/Corporate Ltd. are pre-created B2B accounts and may only be linked here. Technician, Corporate, and Corporate Ltd. can intake Full TVs, panels, parts, and other units as individual jobs or batches. Batch work must create one canonical job per unit. Contract service-request, QR tracking, B2B batch UI, and finance-aftercare boundaries before implementation.

**Next:** Closed into `JOB-INTAKE-UNIFICATION-01A-00A` (completed above).

### Completed this session — CUSTOMER-FEEDBACK-01B-QA-CLOSE

**Status:** **COMPLETED** — **2026-07-21 ~02:52 Asia/Dhaka**. **PASS 96 / FAIL 0 / NV 3** + gates **PASS 4**.

**Evidence:** `mobile-qa/customer-feedback-01b-qa-close/20260721-0230/REPORT.md`.

**Proved:** Headed multi-viewport dual-opportunity isolation; staff Settings workspace; homepage featured/empty; cleanup zero. No product defects. No product code changes.

### Completed this session — CUSTOMER-FEEDBACK-01B

**Status:** **COMPLETED + QA-CLOSE** — UI pack + headed close.

**Evidence:** `mobile-qa/customer-feedback-01b/20260721-0300/REPORT.md` + QA-CLOSE pack above.

**Shipped:** Customer feedback card (EN/BN); Settings Feedback workspace; homepage featured feed only (section hidden when empty). Backend unchanged.

### Completed this session — CUSTOMER-FEEDBACK-01A-HOTFIX-2

**Status:** **COMPLETED locally** — **2026-07-21 ~02:15 Asia/Dhaka**. **PASS 23 / FAIL 0 / NV 2** + gates **PASS 4**.

**Evidence:** `mobile-qa/customer-feedback-01a-hotfix-2/20260721-0215/REPORT.md`.

**Shipped:** Public anonymous featured feed `GET /api/public/service-feedback/featured` with strict eligibility and public DTO. Legacy reviews isolated.

### Completed this session — CUSTOMER-FEEDBACK-01A-HOTFIX-1

**Status:** **COMPLETED locally** — **2026-07-21 ~02:05 Asia/Dhaka**. **PASS 41 / FAIL 0 / NV 2** + gates **PASS 4**.

**Evidence:** `mobile-qa/customer-feedback-01a-hotfix-1/20260721-0205/REPORT.md`.

**Repaired:** renew consent fail-closed; customer wording-only public excerpt; customer DTO without `handoverEventId`; hide/feature audit; recovery allowlist + Driver scope; log hygiene.

### Completed this session — CUSTOMER-FEEDBACK-01A

**Status:** **COMPLETED with HOTFIX-1** — base **2026-07-21 ~01:43 Asia/Dhaka** **PASS 58 / FAIL 0 / NV 3**; integrity hold closed by HOTFIX-1.

**Evidence:** `mobile-qa/customer-feedback-01a/20260721-0132/REPORT.md` + hotfix pack above.

**Shipped:** `2026_07_21_service_feedback` migration; Delivered-only opportunity writers; customer ownership/history/consent APIs; recovery + public/feature/retention permission keys and routes. No UI, no legacy review migration, no live notifications, no production.

### Completed this session — CUSTOMER-FEEDBACK-00A

**Status:** **COMPLETED (audit/design only)** — **2026-07-20 ~21:00 Asia/Dhaka**. **PASS 16 / FAIL 6 / NV 8** + gates **PASS 4**. Product unchanged.

**Evidence:** `mobile-qa/customer-feedback-00a/20260720-2100/REPORT.md`.

**Next:** Inspector decisions D1-D8 accepted; 01A implemented (see above).

### Completed this session — JOB-DETAIL-360-01B + HOTFIX-1 media QA

**Status:** **COMPLETED locally** — media re-proof **2026-07-20 ~00:35 Asia/Dhaka**. Base 01B **PASS 13 / FAIL 1** (media); HOTFIX-1-QA-CLOSE **PASS 13 / FAIL 0** (viewerZ=300 > sheetZ=210 at 390/430/1440). Gates **PASS 4**.

**Evidence:** `mobile-qa/job-detail-360-01b/20260720-1930/`; `mobile-qa/job-detail-360-01b-hotfix-1-qa-close/20260720-2020/REPORT.md`.

### Completed this session — DEVICE-IDENTITY-01A

**Status:** **COMPLETED locally** — **2026-07-20 ~19:05 Asia/Dhaka**. **PASS 14 / FAIL 0 / NV 1** + gates **PASS 4**.

**Evidence:** `mobile-qa/device-identity-01a/20260720-1900/REPORT.md`.

**Shipped:** SR + retail quote conversion no longer write model into `tvSerialNumber`. Corporate unit serial mapping preserved. Historical rows not backfilled. Customer/public serial privacy re-proved.

### Completed this session — DEVICE-IDENTITY-00A

**Status:** **COMPLETED (audit/design only)** — **2026-07-20 ~18:50 Asia/Dhaka**. **PASS 18 / FAIL 3 / NV 8** + gates **PASS 4**. Product unchanged (audit).

**Evidence:** `mobile-qa/device-identity-00a/20260720-1830/REPORT.md`.

**Follow-up:** Future pollution writers closed by **DEVICE-IDENTITY-01A**. Residual: historical pollution (D4), UI/duplicate warnings, UNIQUE (D6).

### Completed this session — JOB-QUALITY-GATE-01C-QA-CLOSE

**Status:** **COMPLETED locally** — **2026-07-20 ~18:25 Asia/Dhaka**. **PASS 20 / FAIL 0 / NV 1** + gates **PASS 4**.

**Evidence:** `mobile-qa/job-quality-gate-01c/20260720-161533/REPORT.md`.

**Residual NV:** Optional public journey URL 404 (anonymous public track privacy PASS). Production/cloud not verified.

**Deferred infrastructure decision:** Redis/Valkey remains intentionally out of scope. The current release method is manual trusted release under I3 until a future protected runner is approved.

## Active Gate

### JOB-CUSTOMER-WORKFLOW-00A - Identity and Status Ownership Audit

**Status:** **COMPLETED (audit/design only)** — **2026-07-19 20:00 Asia/Dhaka**. Product **unchanged**.

**Evidence:** `mobile-qa/job-customer-workflow-00a/20260719-2000/` (`REPORT.md`, `field-visibility-matrix.md`, `status-ownership-map.md`, `customer-safety-contract.md`, `implementation-proof-plan.md`, `results.json`).

**Totals:** PASS **16** / FAIL **5** / NOT VERIFIED **5** (source claims).

**Facts:** Job identity columns exist (device/size/model/serials) but **no brand column**; desktop detail can show serial, mobile list/summary does not; job→SR tracking + journey sync exist; **Ready** is already customer-ready (no testing stage); anonymous track is limited.

**Contract:** `customer-safety-contract.md` proposes public lifecycle (in progress → testing → ready for collection) + field allow/deny. **Implementation blocked** pending Inspector approval.

**Inspector correction:** The audit is accepted, but implementation remains blocked. `JobDetailsSheet` can label `tvSerialNumber` as a model when `modelNumber` is absent. See `INSPECTOR-CORRECTION.md` in the evidence folder. Inspector direction: use a real `Testing` job status; assigned technician moves Testing to Ready after explicit test confirmation; one job transition projects the public state to SR tracking and journey; serials never reach anonymous tracking.

**Next:** **JOB-CUSTOMER-WORKFLOW-00B** completed (audit); implementation remains blocked pending Inspector acceptance of 00B evidence.

### JOB-CUSTOMER-WORKFLOW-00B - Writer and Identity Semantics Audit

**Status:** **COMPLETED (audit only)** — **2026-07-19 18:35 Asia/Dhaka**. Product **unchanged**.

**Evidence:** `mobile-qa/job-customer-workflow-00b/20260719-1835/` (`REPORT.md`, `status-writer-inventory.md`, `serial-semantics-matrix.md`, `corrected-customer-safety-contract.md`, `implementation-proof-plan.md`, `results.json`).

**Totals:** PASS **14** / FAIL **12** / NOT VERIFIED **6** (source claims).

**Facts:** Dual SR+journey only on advance-status / set-outcome / bulk status / rollback approve. Missing dual projection on mobile status, NG path, write-off, abandonment, corporate status/Delivered; POS paid = journey-only. No Testing status (`repair_ok` → Ready). `serialNumber` vs `tvSerialNumber` are independent; convert pollutes tv with model; admin Model fallback and customer journey COALESCE mix meanings; customer `my-repairs` can show S/N; anonymous track has no serial.

**Inspector acceptance:** The 00B contract is accepted for implementation direction. `Testing` is a real internal status; `Ready` remains customer-ready; assigned technician confirms testing without a routine manager bottleneck; one canonical transition must project both SR tracking and repair journey. Full serials remain technician-only. Separate fixes are required for the false Model fallback in JobDetails, EditJobDrawer, and JobPrintTemplate, and for customer journey serial exposure.

**Next:** **JOB-CUSTOMER-WORKFLOW-01A** completed locally; identity/serial UI phase after Inspector accepts 01A.

### JOB-CUSTOMER-WORKFLOW-01A - Canonical Status Spine and Testing

**Status:** **CLOSED by 01A-HOTFIX-1** — base historical evidence `mobile-qa/job-customer-workflow-01a/20260719-1843/` (31/0/4); authorization repair `mobile-qa/job-customer-workflow-01a-hotfix-1/20260719-1904/` (**PASS 29 / FAIL 0 / NOT VERIFIED 4**).

**Prior Inspector finding:** empty auth branch, mobile Ready inference, bulk/rollback auto-confirm — **repaired** in HOTFIX-1.

**Next:** Inspector accepts 01A+HOTFIX-1 before identity/serial UI phase.

### JOB-CUSTOMER-WORKFLOW-01A-HOTFIX-1 - Ready Authorization Repair

**Status:** **COMPLETED locally** — **2026-07-19 Asia/Dhaka**. **PASS 29 / FAIL 0 / NOT VERIFIED 4** + gates **PASS 4**.

**Evidence:** `mobile-qa/job-customer-workflow-01a-hotfix-1/20260719-1904/` (`REPORT.md`, `results.json`, `run-proof.mjs`, `gates.json`, `fixture-manifest.json`).

**Shipped:** Strict Testing→Ready authorization; mobile explicit confirm only; bulk Ready 409; rollback Ready requires Manager/SA + testingConfirmed.

**NOT VERIFIED:** NG/POS/corporate full HTTP; anonymous track; production.

**Next:** Inspector unlock for identity/UI work (if any). No commit/push/deploy in this completion.

### JOB-CUSTOMER-WORKFLOW-01B - Technician Job Detail and Identity UI

**Status:** **UI accepted; privacy closed by 01B-HOTFIX-1** — **2026-07-19 Asia/Dhaka**.

**Evidence (UI):** `mobile-qa/job-customer-workflow-01b/20260719-1927/`.<br>
**Evidence (privacy):** `mobile-qa/job-customer-workflow-01b-hotfix-1/20260719-1953/` (**PASS 12 / FAIL 0**).

**Next:** `JOB-CUSTOMER-WORKFLOW-01B-QA-CLOSE` completed; see below. Then `CUSTOMER-REPAIR-STATUS-UX-01` after Inspector accepts QA-CLOSE.

### JOB-CUSTOMER-WORKFLOW-01B-HOTFIX-1 - Customer Serial Privacy Strip

**Status:** **COMPLETED locally** — **2026-07-19 Asia/Dhaka**. **PASS 12 / FAIL 0 / NOT VERIFIED 0** + gates **PASS 4**.

**Evidence:** `mobile-qa/job-customer-workflow-01b-hotfix-1/20260719-1953/` (`REPORT.md`, `results.json`, `run-privacy-proof.mjs`, `fixture-manifest.json`, `gates.json`).

**Shipped:** Strip serials from customer journey list payloads; strip `estimatedCost` from anonymous job track. Real HTTP/DB planted-serial proof; admin/tech detail serials preserved.

**Next:** Real-session 01B-QA-CLOSE completed; see below.

### JOB-CUSTOMER-WORKFLOW-01B-QA-CLOSE - Real-Session Identity UI Proof

**INSPECTOR CORRECTION - PARTIAL QA ONLY:** The 29 PASS results validate the walk-in Jobs identity surface, but the five corporate Unit Serial checks are required and remain NOT VERIFIED. Corporate jobs correctly do not appear in the walk-in lane; they use separate B2B components (`client/src/components/admin/corporate/JobDetailsSheet.tsx`, `EditJobDialog.tsx`, and CorporateRepairs/B2B-mobile surfaces). The captured corporate screenshots are no-results screens, not corporate identity proof. Do not treat this QA close as full 01B acceptance.

**Status:** **PARTIAL PASS - B2B corporate identity unverified** — **2026-07-20 Asia/Dhaka**. **PASS 29 / FAIL 0 / NOT VERIFIED 5** + gates **PASS 4**. Product **unchanged**.

**Evidence:** `mobile-qa/job-customer-workflow-01b-qa-close/20260720-0042/` (`REPORT.md`, `results.json`, `headed-real-session.mjs`, screenshots, `fixture-manifest.json`, `gates.json`).

**Proved:** Real Super Admin + Technician sessions; retail identity + Final testing; no full serial on list cards; legacy pollution hidden; privacy harness re-run; cleanup zero. No API mocks.

**NOT VERIFIED:** Corporate Unit serial headed open on Jobs walk-in lane (B2B lane filter; API unit serial confirmed).

**Next:** `CORPORATE-JOB-IDENTITY-00A` completed (audit). Customer-status UX remains separate and must not claim the corporate identity work is closed.

### CORPORATE-JOB-IDENTITY-00A - B2B Detail Surface Audit

**Status:** **COMPLETED (audit only)** — **2026-07-20 01:34 Asia/Dhaka**. Product **unchanged**.

**Evidence:** `mobile-qa/corporate-job-identity-00a/20260720-0127/` (`REPORT.md`, surface matrix, status-writer map, `01a-implementation-contract.md`, headed `05-corporate-job-detail-390x844.png`, harness, `results.json`).

**Proved:** B2B owner path `#b2b` → UnifiedB2BTab → CorporateRepairsTab → corporate JobDetailsSheet; real SA 390×844 open; fixture seed/cleanup; API identity; status writers separate from Testing; customer payloads untouched.

**Gap for 01A:** Detail/list/edit/print lack labeled Model + Unit serial (ambiguous SN / missing fields).

**Next:** Inspector-approved `CORPORATE-JOB-IDENTITY-01A` only. Customer-status UX separate.

### CORPORATE-JOB-IDENTITY-01A - B2B Model and Unit Serial UI

**Status:** **COMPLETED locally** — **2026-07-20 01:56 Asia/Dhaka**. **PASS 30 / FAIL 0** + gates **PASS 3**.

**Evidence:** `mobile-qa/corporate-job-identity-01a/20260720-0149/` (`REPORT.md`, `results.json`, headed screenshots, harness, privacy re-run, fixture/module restore).

**Shipped:** B2B Model + Unit serial labels on corporate detail, list/table, edit header, prints, challan detail. Status/backend/customer/schema untouched.

**Next:** `CORPORATE-JOB-STATUS-00B` completed (audit). Customer-status UX remains blocked for corporate-linked jobs until status implementation is accepted.

**Inspector evidence correction:** Local QA remains **PASS 30 / FAIL 0**. Production deployment and production B2B behavior are **NOT VERIFIED**, so the accurate aggregate is **PASS 30 / FAIL 0 / NOT VERIFIED 1**. See `mobile-qa/corporate-job-identity-01a/20260720-0149/INSPECTOR-CORRECTION.md`.

### CORPORATE-JOB-STATUS-00B - Legacy Corporate Status Semantics Audit

**Status:** **COMPLETED (audit/design only)** — **2026-07-20 02:24 Asia/Dhaka**. Product **unchanged**.

**Evidence:** `mobile-qa/corporate-job-status-00b/20260720-0224/` (`REPORT.md`, writer inventory, semantics/aggregates, design-options, implementation-contract, redacted counts, `results.json`).

**Recommendation:** Option A (declaration field + canonical lifecycle). Corporate Ready without Final Testing is a documented product FAIL for customer safety when dual-linked.

**Next:** Inspector acceptance → implementation (contract in evidence). `CUSTOMER-REPAIR-STATUS-UX-01` remains blocked for corporate-linked jobs until then.

**Inspector acceptance:** Option A selected. Repairable corporate jobs require Testing before Ready; historical status text remains untouched; declaration-only backfill may normalize case; Challan OUT customer projection is a later atomic-handover phase.

### CORPORATE-JOB-STATUS-01A - Declaration and Final-Testing Integrity

**Status:** **COMPLETED locally** — **2026-07-20 Asia/Dhaka**. HTTP **PASS 16 / FAIL 0** + gates **PASS**. Headed mobile More→B2B residual FAIL (2).

**Evidence:** `mobile-qa/corporate-job-status-01a/20260720-0240/`.

**Shipped:** Declaration field + backfill; corporate Ready 409; no projection on declaration endpoint; Challan IN Pending+declaration; B2B UI declaration actions + Confirm final testing; Declared OK filter fixed.

**Next:** Closed by **01A-HOTFIX-1**. Corporate-linked customer-status UX remains blocked until 01B.

**Inspector correction (historical):** 01A marked PATCHED NEEDS RETEST — see `…/01a/20260720-0240/INSPECTOR-CORRECTION.md`. Closed by HOTFIX-1.

### CORPORATE-JOB-STATUS-01A-HOTFIX-1 - Boundary and Required-Proof Close

**Status:** **PATCHED NEEDS RETEST** — Inspector correction **2026-07-20 Asia/Dhaka**. Product/HTTP/UI proof passes; release-migration proof is invalid.

**Evidence:** `mobile-qa/corporate-job-status-01a-hotfix-1/20260720-0310/`.

**Shipped:** Non-corporate declaration rejected (`CORPORATE_JOB_REQUIRED`). HTTP/headed proofs closed. The claimed full migration proof used a current-schema dump with a cleared ledger, so it is not a full-chain proof. Production/cloud remain **NOT VERIFIED**.

### CORPORATE-JOB-STATUS-01A-HOTFIX-2 - Release-Realistic Migration Evidence

**Status:** **BLOCKED (evidence)** — **2026-07-20 Asia/Dhaka**. Product unchanged. Evidence: `mobile-qa/corporate-job-status-01a-hotfix-2/20260720-0325/`.

**Finding:** MAIN is incremental; no checked-in pre-`corporate_declaration` schema+ledger baseline. HOTFIX-1 full-chain migrate claim invalidated. HTTP/UI/privacy from HOTFIX-1 preserved.

**Next:** `SYSTEM-FOUNDATION-MAIN-BASELINE-01A` - create and prove a forward-only v31 schema+ledger baseline. Historical full-chain/genesis remains NOT VERIFIED. **01B blocked.**

### SYSTEM-FOUNDATION-MAIN-BASELINE-01A - Forward Release Baseline

**Status:** **COMPLETED locally** — **2026-07-20 03:35 Asia/Dhaka**. **PASS 14 / FAIL 0** + gates.

**Baseline:** `db-baselines/main-schema/v2026_07_20_corporate_declaration/`<br>
**Evidence:** `mobile-qa/system-foundation-main-baseline-01a/20260720-0335/`

**Proved:** Forward schema+ledger capture at registry head; restore/verify/idempotent migrate; no app data; historical genesis still NOT VERIFIED. **01B not started.**

**Inspector close:** Independently restored and re-verified. The runner now requires environment-provided credentials and avoids `shell: true`; historical full-chain/genesis and cloud/production remain NOT VERIFIED.

### CORPORATE-JOB-STATUS-01B - Corporate Challan Handover Projection

**Status:** **COMPLETED locally (backend)** — **2026-07-20 12:02 Asia/Dhaka**. Mobile close via **01B-HOTFIX-1-QA-CLOSE**. Evidence: `mobile-qa/corporate-job-status-01b/20260720-1156/`.

### CORPORATE-JOB-STATUS-01B-HOTFIX-1-QA-CLOSE - Safe Route Log and Mobile Handover Proof

**Status:** **COMPLETED locally** (Ready path) — **2026-07-20 12:12 Asia/Dhaka**. Blocked-toast gap closed by **EVIDENCE-CLOSE**. Evidence: `mobile-qa/corporate-job-status-01b-hotfix-1-qa-close/20260720-1208/`.

### CORPORATE-JOB-STATUS-01B-HOTFIX-1-EVIDENCE-CLOSE - Blocked Handover Toast

**Status:** **COMPLETED locally** — **2026-07-20 12:19 Asia/Dhaka**. **PASS 15 / FAIL 0 / NV 0** + gates **PASS 3**.

**Evidence:** `mobile-qa/corporate-job-status-01b-hotfix-1-evidence-close/20260720-1214/` (`REPORT.md`, `results.json`, `blocked-toast-evidence.mjs`, blocked-toast screenshots, touch traces, `gates.json`).

**Shipped:** None (QA harness only). Visible Clear cockpit filter → Testing → Deliver → **Handover blocked** at 390/430; Testing unchanged; no challan.

**NOT VERIFIED:** production; cloud.

**Inspector acceptance:** Evidence-close is accepted locally. `CUSTOMER-REPAIR-STATUS-UX-01A` executed next.

### CUSTOMER-REPAIR-STATUS-UX-01A - Warm Bilingual Repair Updates

**Status:** **COMPLETED locally** (closed by HOTFIX-1) — **2026-07-20 Asia/Dhaka**.

**Evidence:** `mobile-qa/customer-repair-status-ux-01a/20260720-1232/` + `mobile-qa/customer-repair-status-ux-01a-hotfix-1/20260720-1246/`.

**Shipped:** Bilingual customer status UX; security boundary restored (no customer apiLimiter skip); stale client serial field removed.

**NOT VERIFIED:** production; cloud; live notifications.

### CUSTOMER-REPAIR-STATUS-UX-01A-HOTFIX-1 - Restore Customer API Abuse Protection

**Status:** **COMPLETED locally** — **2026-07-20 12:57 Asia/Dhaka**. **PASS 57 / FAIL 0 / NV 0** + gates **PASS 4**.

**Evidence:** `mobile-qa/customer-repair-status-ux-01a-hotfix-1/20260720-1246/`.

**Shipped:** Admin-only apiLimiter skip restored; `serialNumber` removed from customer enriched TS type; UX re-proved.

**Next:** Inspector accept before next queue phase (`SYSTEM-OBSERVABILITY-01` per current remaining queue).

### SYSTEM-OBSERVABILITY-01A - Safe Incident Center Audit

**Status:** **COMPLETED (audit only)** — **2026-07-20 13:15 Asia/Dhaka**. **PASS 12 / FAIL 0 / NV 5** + gates **PASS 4**. Product **unchanged**. Inspector correction: daily summary advisory is 06:00 Asia/Dhaka, never the backup-owned 02:00 window.

**Evidence:** `mobile-qa/system-observability-01a/20260720-1312/` (`REPORT.md`, inventory, data/UI contracts, inspector-decision-pack, `results.json`, `gates.json`).

**Recommendation:** Event-driven allowlisted incidents from `logBackgroundFailure` + optional daily integrity summary; Super Admin block under System Integrity; no AI/raw logs.

**Inspector defaults accepted:** D1–D7 locked (see BOT). **SYSTEM-OBSERVABILITY-01B** implemented.

### SYSTEM-OBSERVABILITY-01B - Safe Incident Center Implementation

**Status:** **COMPLETED locally** (closed by **01B-HOTFIX-1** + **QA-CLOSE** + evidence-close timing + **QA-ISOLATED-REPROOF**) — parent **2026-07-20 13:35**; hotfix **2026-07-20 13:54**; QA-close **2026-07-20 14:15**; evidence-close **2026-07-20 14:18**; isolated reproof **2026-07-20 14:27 Asia/Dhaka**.

**Evidence:** `…/01b/20260720-1335/` + `…/01b-hotfix-1/20260720-1400/` + `…/01b-hotfix-1-qa-close/20260720-1410/` + `…/01b-hotfix-1-qa-evidence-close/20260720-1420/` + `…/01b-hotfix-1-qa-isolated-reproof/20260720-1425/`.

**Shipped:** Incident register + cap/daily durability + scheduler seams + simultaneous daily claim on disposable baseline DB.

**NOT VERIFIED:** production; cloud multi-instance under load.

### SYSTEM-OBSERVABILITY-01B-HOTFIX-1 - Incident Capacity and Daily Ownership

**Status:** **COMPLETED locally** — **2026-07-20 13:54 Asia/Dhaka** (evidence gap closed by QA-CLOSE **2026-07-20 14:15**). Historical package **PASS 24 / FAIL 0 / NV 0** + gates **PASS 4**; healthy-day/direct-child claims withdrawn in `INSPECTOR-CORRECTION.md`.

**Evidence:** `mobile-qa/system-observability-01b-hotfix-1/20260720-1400/`.

**Shipped:** Advisory-locked 5k cap (CAP_FULL if no resolved reclaim); daily attention once-per-Dhaka-day with no peer count bump.

**Next:** Closed by QA-CLOSE + evidence-close + **QA-ISOLATED-REPROOF** → **SYSTEM-PERFORMANCE-01**.

### SYSTEM-OBSERVABILITY-01B-HOTFIX-1-QA-CLOSE - Daily Healthy and 06:00 Trigger Proof

**Inspector correction (closed):** Sequential `spawnSync` was not simultaneous contention — closed by **QA-EVIDENCE-CLOSE**. See `…/1410/INSPECTOR-CORRECTION-CROSS-PROCESS.md`.

**Status:** **COMPLETED locally** — **2026-07-20 14:15 Asia/Dhaka**. **PASS 27 / FAIL 0 / NOT VERIFIED 0** + gates **PASS 4**.

**Evidence:** `mobile-qa/system-observability-01b-hotfix-1-qa-close/20260720-1410/`.

**Shipped:** Test-only `forceNeedsAttention` false honored; `runSchedulerTickOnce` / `testOnlyRunSchedulerTick` + clock; real 06:00 path, non-06 no-op, later-process count=1, cap_full→same-day retry; cap subset + HTTP/UI non-reg.

**Next:** Closed by evidence-close → **SYSTEM-PERFORMANCE-01**.

### SYSTEM-OBSERVABILITY-01B-HOTFIX-1-QA-EVIDENCE-CLOSE - Simultaneous Cross-Process Daily Claim

**Inspector correction (closed):** Isolation invalid on ambient DB — closed by **QA-ISOLATED-REPROOF**. See `…/1420/INSPECTOR-CORRECTION-ISOLATION.md`.

**Status:** **COMPLETED locally** (timing only; isolation not accepted) — **2026-07-20 14:18 Asia/Dhaka**. **PASS 15 / FAIL 0 / NOT VERIFIED 4** + `git diff --check` **PASS**. Product **unchanged**.

**Evidence:** `mobile-qa/system-observability-01b-hotfix-1-qa-evidence-close/20260720-1420/`.

**Proved (timing):** Barrier two-child claim shape. **Accepted isolated proof:** 1425 package.

**Next:** Closed by isolated reproof → **SYSTEM-PERFORMANCE-01**.

### SYSTEM-OBSERVABILITY-01B-HOTFIX-1-QA-ISOLATED-REPROOF - Disposable Database Barrier Proof

**Status:** **COMPLETED locally** — **2026-07-20 14:27 Asia/Dhaka**. **PASS 29 / FAIL 0 / NOT VERIFIED 5** + `git diff --check` **PASS**. Product **unchanged**.

**Evidence:** `mobile-qa/system-observability-01b-hotfix-1-qa-isolated-reproof/20260720-1425/`.

**Proved:** Disposable `qa_obs01b_*` local DB; baseline restore; real `db:migrate:main` → `system_incidents`; barrier simultaneous claim one writer; drop-only cleanup; ambient DB untouched.

**Next:** Closed → **SYSTEM-PERFORMANCE-01A**.

### SYSTEM-PERFORMANCE-01A - Local Performance Baseline Audit

**Inspector correction:** The map place-search timing includes external Photon/Nominatim provider latency. It is not a local server/database performance result; see `mobile-qa/system-performance-01a/20260720-1440/INSPECTOR-CORRECTION.md`. The remaining local audit evidence is accepted.

**Status:** **COMPLETED (audit only)** — **2026-07-20 14:45 Asia/Dhaka**. Product **unchanged**. **PASS 27 / FAIL 0 / NOT VERIFIED 10** + gates **PASS 4**.

**Evidence:** `mobile-qa/system-performance-01a/20260720-1440/`.

**Measured:** Local public/gate/unauth-boundary probes; map place-search slowest public path (p50 207ms); EXPLAIN list/lineage Seq Scan at small data; pool max 5; auth HTTP paths NV.

**Recommendations (not approved):** map search latency design; authenticated read baseline (session strategy needed); list indexes when volume grows.

**Next:** Inspector accept → **JOB-LIFECYCLE-TRUST-00A** (or reprioritize). Optimization not auto-eligible.

### JOB-LIFECYCLE-TRUST-00A - Post-Custody Writer and Projection Audit

**Status:** **COMPLETED (audit only)** — **2026-07-20 15:05 Asia/Dhaka**. Product **unchanged**. **PASS 18 / FAIL 6 / NV 8** + gates **PASS 4**.

**Evidence:** `mobile-qa/job-lifecycle-trust-00a/20260720-1505/`.

**Shipped:** Source inventory + decision pack only (no product change). Canonical spine confirmed; residuals: SR stage post-convert, logistics journey Delivered, split-commit external projectors, POS Completed, privacy residuals.

**Next:** Slice 1 closed by **01A**; D3/D4 remain for later Slice 2.

### JOB-LIFECYCLE-TRUST-01A - Single Lifecycle Owner Enforcement

**Status:** **COMPLETED locally** — **2026-07-20 15:20 Asia/Dhaka** (legacy completed bypass closed by **HOTFIX-1**). **PASS 16 / FAIL 0 / NV 3** + gates **PASS 4**.

**Evidence:** `mobile-qa/job-lifecycle-trust-01a/20260720-1520/` + hotfix `…/01a-hotfix-1/20260720-1540/`.

**Shipped:** Converted SR post-custody stage **409 JOB_OWNS_LIFECYCLE**; linked retail delivery requires Ready then canonical Job Delivered before task complete.

**Next:** Closed by HOTFIX-1 → **JOB-QUALITY-GATE-01**.

### JOB-LIFECYCLE-TRUST-01A-HOTFIX-1 - Legacy Completed Delivery Guard

**Status:** **COMPLETED locally** — **2026-07-20 15:40 Asia/Dhaka**. **PASS 20 / FAIL 0 / NV 3** + gates **PASS 4**.

**Evidence:** `mobile-qa/job-lifecycle-trust-01a-hotfix-1/20260720-1540/`.

**Shipped:** Already-completed linked delivery never legacy-publishes journey; Delivered no-op; non-Delivered **409 DELIVERY_REQUIRES_RECONCILIATION**; full 01A re-proof.

**Next:** Inspector accept → **JOB-QUALITY-GATE-01**.

### JOB-QUALITY-GATE-01A - Final-Test Evidence and Reinspection Audit

**Status:** **COMPLETED (audit only)** — **2026-07-20 16:00 Asia/Dhaka**. Product **unchanged**. **PASS 14 / FAIL 5 / NV 7** + gates **PASS 4**.

**Evidence:** `mobile-qa/job-quality-gate-01a/20260720-1600/`.

**Shipped:** Decision pack only (no product change). Durable final-test evidence absent; workbench inspection ≠ final test; Ready writers mapped; D1–D6 recommended defaults for Inspector.

**Next:** Closed by **01B** backend.

### JOB-QUALITY-GATE-01B - Durable Final-Test Backend Gate

**Status:** **COMPLETED locally** — **2026-07-20 16:30 Asia/Dhaka**. **PASS 33 / FAIL 0 / NV 3** + gates **PASS 4**.

**Evidence:** `mobile-qa/job-quality-gate-01b/20260720-1630/`.

**Shipped:** MAIN `job_final_test_runs`; record/list API; Ready requires current pass + testingConfirmed; reinspection supersedes; disposable baseline + real HTTP proofs. UI/POS/Device Identity untouched.

**Next:** Codex **01C UI** slice for evidence capture before Ready.

### JOB-QUALITY-GATE-01C - Internal Final-Test UI

**Status:** **COMPLETED locally (QA-CLOSE)** — **2026-07-20 ~18:25 Asia/Dhaka**. Functional **PASS 20 / FAIL 0 / NV 1** + gates **PASS 4**.

**Evidence:** `mobile-qa/job-quality-gate-01c/20260720-161533/REPORT.md`.

**Shipped (prior):** Staff-only Final Test dialog on retail Jobs + Corporate Repairs; pass/fail record before Ready/return; customer DTOs untouched.

**QA-close:** Real Express+PG+sessions+headed Chromium. Retail dialog 390/430/844/1440 PASS; corporate labels 390/430 + pass→Ready PASS; pass order + fail return PASS; Ready without pass blocked PASS; public track privacy PASS; cleanup + module restore PASS. Production NOT VERIFIED.

**Next:** DEVICE-IDENTITY-00A audit completed; Inspector D1–D6 before identity implementation.

### ADMIN-SETTINGS-DESKTOP-POLISH-01A - Business Identity CTA Clearance

**Status:** **COMPLETED locally** — **2026-07-19 Asia/Dhaka**. UI **PASS 3 / FAIL 0** + gates **PASS 3**.

**Evidence:** `mobile-qa/admin-settings-desktop-polish-01a/20260719-173556/` (`REPORT.md`, current `results.json`, harness, screenshots, `gates.json`). Historical first-harness fail: `results-historical-harness-fail.json`.

**Shipped:** Desktop Business Identity `Edit Profile` in flex flow (no absolute overlap). QA harness-only close: scoped CTA geometry, More-sheet mobile path, smoke 390/844.

**NOT VERIFIED:** production, cloud, multi-instance.

**Next:** Inspector unlocks the next queued phase.

### SYSTEM-FOUNDATION-01C-B2-C-B - Scheduler Integrity UI

**Status:** **COMPLETED locally** — **2026-07-19 Asia/Dhaka**. UI **PASS 6 / FAIL 0** + gates **PASS 3**.

**Evidence:** `mobile-qa/system-foundation-01c-b2-c-b/20260719-141206/` (`REPORT.md`, current `results.json`, harness, screenshots, `gates.json`). Historical weak Manager / error-locator evidence kept in `results-historical-error-locator-fail.json`, `results-inspector-corrected.json`, `INSPECTOR-NOTE.md`, `INSPECTOR-CORRECTION-MANAGER.md`.

**Shipped:** Read-only Scheduled work on Super Admin System Integrity (mobile + desktop). QA harness-only: visible error fallback; Manager-hidden requires Settings boot proof then absence of integrity labels.

**NOT VERIFIED:** production, cloud, multi-instance, live non-intercepted Super Admin traffic.

**Next:** Inspector unlocks the next queued foundation phase.

### SYSTEM-FOUNDATION-01C-B2-C-A-HOTFIX-1 - Scheduler Status Truthfulness

**Status:** **COMPLETED locally** — **2026-07-19 05:30 Asia/Dhaka**. **PASS 17 / FAIL 0** + gates **PASS 4**.

**Evidence:** `mobile-qa/system-foundation-01c-b2-c-a-hotfix-1/20260719-0530/` (`REPORT.md`, `results.json`, parent+unreachable child, fixture manifest, gates).

**Repaired:** missing required source table → `unavailable` + null buckets; real unreachable-DB fail (no force hook); positive path on `qa_b2ca_hf1_*`.

**NOT VERIFIED:** Super Admin UI, production, multi-instance, cloud.

**Next:** **SYSTEM-FOUNDATION-01C-B2-C-B** Super Admin UI after Inspector acceptance.

### SYSTEM-FOUNDATION-01C-B2-C-A - Scheduler Integrity Status API

**Status:** **COMPLETED locally** (closed by HOTFIX-1) — base **2026-07-19 05:05**; truthfulness **2026-07-19 05:30 Asia/Dhaka**.

**Evidence:** historical `…/01c-b2-c-a/20260719-0505/` + `INSPECTOR-CORRECTION.md`; close `…/01c-b2-c-a-hotfix-1/20260719-0530/`.

**NOT VERIFIED:** Super Admin UI, production, multi-instance, cloud.

**Next:** **SYSTEM-FOUNDATION-01C-B2-C-B** Super Admin UI after Inspector acceptance.

### SYSTEM-FOUNDATION-01C-B2-B2B - Drawer Day-Close Claim Integrity

**Status:** **COMPLETED locally** — **2026-07-19 04:05 Asia/Dhaka**. **PASS 14 / FAIL 0** + gates **PASS 4**.

**Evidence:** `mobile-qa/system-foundation-01c-b2-b2b/20260719-0405/` (`REPORT.md`, `results.json`, parent+child harness, `p3-trace.json`, child logs, `fixture-manifest.json`, `gates.json`).

**Shipped:** `drawer_day_close_runs` day claim (15m lease/token); shared scheduler/manual ownership; conditional drawer CAS; terminal `no_active_session`; legacy last-run setting display-only.

**QA:** Isolated `qa_b2b2b_*`; real MAIN migrate without ledger seed; two-process P3; T11 late reclaim; tracked cleanup.

**Inspector cross-check:** Core claim/CAS integrity accepted locally. The two-process proof establishes one drawer mutation and one terminal run. A successful persisted audit/notification/SSE delivery was not proven because those side effects are intentionally best-effort and the isolated audit baseline is incomplete; this is **NOT VERIFIED**, not a close-integrity failure.

**NOT VERIFIED:** production, multi-instance live traffic, cloud deploy, UI, successful audit/notification/SSE persistence.

**Next:** Inspector unlocks next queued foundation phase.

### SYSTEM-FOUNDATION-01C-B2-B2A-HOTFIX-1 - Backup Proof Isolation and Two-Process Claim QA

**Status:** **COMPLETED locally** — **2026-07-19 02:55 Asia/Dhaka**. **PASS 14 / FAIL 0** + gates **PASS 4**. Product **unchanged**.

**Evidence:** `mobile-qa/system-foundation-01c-b2-b2a-hotfix-1/20260719-0251/` (parent+child harness, `p3-trace.json`, child logs, `fixture-manifest.json`, `INSPECTOR-CORRECTION.md`, `results.json`, `gates.json`).

**QA repair:** Isolated DB `qa_b2b2a_hf1_*`; real two-process P3; delete only tracked run ids; drop proof DB after prefix check.

**Next:** **SYSTEM-FOUNDATION-01C-B2-B2B** completed; see Active Gate above.

### SYSTEM-FOUNDATION-01C-B2-B2A - Scheduled Backup Day Claim

**Status:** **COMPLETED** (product 02:49; **QA closed by HOTFIX-1** 02:55 Asia/Dhaka).

**Evidence:** product `…/01c-b2-b2a/20260719-0241/`; final multi-process QA `…/01c-b2-b2a-hotfix-1/20260719-0251/`.

**Shipped:** `scheduled_backup_runs` + Dhaka day claim/token. Original harness issues documented in HOTFIX-1 `INSPECTOR-CORRECTION.md`.

**Next:** **SYSTEM-FOUNDATION-01C-B2-B2B** completed (2026-07-19 04:05).

### SYSTEM-FOUNDATION-01C-B2-B1-HOTFIX-1 - Reminder Multi-Device Semantics and T11 Proof

**Status:** **COMPLETED locally** — **2026-07-19 02:32 Asia/Dhaka**. **PASS 14 / FAIL 0** + gates **PASS 4**. **NOT VERIFIED:** production, real FCM/SMS, cloud multi-instance.

**Evidence:** `mobile-qa/system-foundation-01c-b2-b1-hotfix-1/20260719-0230/` (`REPORT.md`, `results.json`, `proof-01c-b2-b1-hotfix-1.mjs`, `gates.json`).

**Fixed:** Multi-device D2-A (success + later hang still delivers); real-service T11 (timeout/reclaim/late resolve). Test-only `providerTimeoutMs`. No backup/day-close/UI/migration shape change.

**Residual (unchanged):** `REQUIRED_MAIN_SCHEMA_VERSION` vs registry head — separate audit item.

**Next:** **SYSTEM-FOUNDATION-01C-B2-B2A** (scheduled backup day claim), then B2-B2B day-close.

### SYSTEM-FOUNDATION-01C-B2-B1 - Reminder and Abandonment Delivery Integrity

**Status:** **COMPLETED locally** — **2026-07-19 02:24 Asia/Dhaka**; **re-proved by HOTFIX-1** — **2026-07-19 02:32**. Base **PASS 13**; HOTFIX-1 **PASS 14** (adds multi-device + real T11).

**Evidence:** base `…/01c-b2-b1/20260719-0216/`; final `…/01c-b2-b1-hotfix-1/20260719-0230/`.

**Shipped:** migration + claim/outbox delivery; HOTFIX-1 multi-device D2-A + real-service T11. Backup/day-close untouched.

**Next:** **SYSTEM-FOUNDATION-01C-B2-B2A** (scheduled backup day claim), then B2-B2B day-close.

### SYSTEM-FOUNDATION-01C-B2-A-HOTFIX-2 - Stale Claim Completion Correction

**Status:** **COMPLETED (documentation only)** — **2026-07-19 02:11 Asia/Dhaka**. Product **unchanged**. No re-audit. No T11 proof run. Audit totals unchanged.

**Evidence:** `mobile-qa/system-foundation-01c-b2-a/20260719-0157/` (`CONTRACT-CORRECTION-2.md`; amended contract, decision pack, REPORT, results).

**Corrected:** `claim_token` on every claim; post-provider updates must match token (stale = no-op); timeout keeps lease until expiry unless cancelled; B2-B matrix adds **T11**. Bounded at-least-once external guarantee unchanged.

**Next:** **01C-B2-B BLOCKED** until Inspector approves D1–D7.

### SYSTEM-FOUNDATION-01C-B2-A-HOTFIX-1 - Claim Contract Coherence Correction

**Status:** **COMPLETED (documentation only)** — **2026-07-19 02:05 Asia/Dhaka**. Product **unchanged**. No re-audit. Audit totals unchanged.

**Evidence:** `mobile-qa/system-foundation-01c-b2-a/20260719-0157/` (`CONTRACT-CORRECTION.md`; amended contract, decision pack, REPORT, results).

**Corrected:** reclaim expired `in_flight`/`running`; logical-event idempotency keys; `next_attempt_at`; timeout ≠ success; narrow FCM/SMS log hygiene for B2-B. D1–D7 reworded; worker chose no policy.

**Next:** further corrected by **HOTFIX-2** (claim_token). **01C-B2-B still BLOCKED** until Inspector D1–D7.

### SYSTEM-FOUNDATION-01C-B2-A - External Delivery and Scheduler Claim Contract Audit

**Status:** **COMPLETED (audit/design only)** — **2026-07-19 01:59 Asia/Dhaka**. **PASS 8 / FAIL 4 / NOT VERIFIED 6**. Product **unchanged**.

**Evidence:** `mobile-qa/system-foundation-01c-b2-a/20260719-0157/` (`REPORT.md`, `scheduler-delivery-ownership-matrix.json`, `01c-b2-implementation-contract.md`, `inspector-decision-pack.md`, `results.json`).

**Findings:** Reminder marks `is_sent` after swallowed FCM; abandonment stamps `last_sms_sent_at` before SMS; backup day guard process-memory; day-close last-run not CAS. Recommend DB lease/claim + outbox + success-after-ack (bounded at-least-once). MAIN migrations needed later.

**Next:** draft contract corrected by **01C-B2-A-HOTFIX-1**. **01C-B2-B still BLOCKED** until Inspector records D1–D7.

### SYSTEM-FOUNDATION-01C-B1-HOTFIX-1 - Release CLI Invalid-URL Containment

**Status:** **COMPLETED locally** — **2026-07-19 01:50 Asia/Dhaka**. **PASS 3 / FAIL 0** + gates **PASS 4**. **NOT VERIFIED:** live prod CLI, external sinks.

**Evidence:** `mobile-qa/system-foundation-01c-b1-hotfix-1/20260719-0148/` (`REPORT.md`, `results.json`, `proof-invalid-url.mjs`, `captured-child-output.txt`, `gates.json`).

**Fix:** one-file `db-migrate-main.ts` safe URL classify + generic invalid-config exit; real child poison proof PASS. **B1 closed.**

**Next:** **SYSTEM-FOUNDATION-01C-B2** notification/claim design (separate phase).
### SYSTEM-FOUNDATION-01C-B1 - Scheduler Lifecycle and Release Log Hygiene

**Status:** **COMPLETED locally** — **2026-07-19 01:44 Asia/Dhaka**. **PASS 5 / FAIL 0** proofs; gates **PASS 4**. **NOT VERIFIED:** external log sinks, multi-instance ownership, live prod logs.

**Evidence:** `mobile-qa/system-foundation-01c-b1/20260719-0138/` (`REPORT.md`, `results.json`, `proof-01c-b1.mjs`, `captured-safe-output.txt`, `residual-inventory.md`, `gates.json`).

**Shipped:** `logBackgroundFailure`; migrate CLI target class only; scheduler raw-error paths cleaned; generic backup FCM; `stopNightlyJobs` + shutdown wiring to readiness stop. **No** DB claims, isSent-before-FCM, Redis, release automation.

**Next:** closed further by **01C-B1-HOTFIX-1** (invalid-URL containment). Then **01C-B2** design.

### SYSTEM-FOUNDATION-01C-A - Runtime Ownership and Log Hygiene Audit

**Status:** **COMPLETED (audit only)** â€” **2026-07-18 23:40 Asia/Dhaka**. **PASS 12 / FAIL 6 / NOT VERIFIED 11**. Product **unchanged**. No server/cloud/DB.

**Entry decision:** Inspector **I3** â€” status-only Super Admin + manual trusted release. Redis deferred. Demo journeys not accessed.

**Evidence:** `mobile-qa/system-foundation-01c-a/20260718-2338/` (`REPORT.md`, `scheduler-ownership-matrix.json`, `log-redaction-inventory.json`, `mutation-sentinel-matrix.json`, `01c-b-implementation-contract.md`).

**Findings:** Background jobs process-local only (reminder/abandonment/backup/day-close multi-instance risk **NV**). `/health`+`/ready` safe source **PASS**. Log hygiene gaps: migrate target log + raw scheduler errors (**FAIL**). Critical mutation domains listed for HTTP sentinels. Rate-limit MemoryStore multi-instance **NV**.

**Next:** **SYSTEM-FOUNDATION-01C-B** only after Inspector reviews the draft contract (not auto-unlocked).

### RELEASE-OPERATIONS-01C-A-HOTFIX-1 - Release-Runner Feasibility Correction

**Status:** **COMPLETED (documentation only)** â€” **2026-07-18 23:33 Asia/Dhaka**. No product/workflow/Blueprint/DB/deploy changes.

**Evidence:** same folder `mobile-qa/release-operations-01c-a/20260718-2320/` â€” added `INSPECTOR-CORRECTION.md`; amended REPORT, inventory, options, 01C-B contract. Gate: `git diff --check`.

**Corrected currently safe state:** Super Admin **status-only** + **manually controlled trusted** `db:migrate:main`. Tracked `render.yaml`: `plan: free`, `autoDeploy: true`, no `preDeployCommand`. Render pre-deploy = **paid-service** vendor feature â†’ **not currently eligible** for free Blueprint. Prior pre-deploy lock **withdrawn**.

**Also documented:** deploy.yml ignore-errors + `/health`â‰ `/ready`; dual autoDeploy+hook risk; CI `db:push || true`; migrate CLI target log hygiene.

**Next / blocked:** **RELEASE-OPERATIONS-01C-B BLOCKED** until Inspector chooses **I1** (paid Render pre-deploy), **I2** (separate protected runner), or **I3** (retain manual). Worker must not select.

### RELEASE-OPERATIONS-01C-A - Controlled Release Handoff Audit

**Status:** **COMPLETED (audit only)** â€” **2026-07-18 23:24 Asia/Dhaka**; **CORRECTED by HOTFIX-1** â€” **2026-07-18 23:33**. Historical PASS 8 / FAIL 0. Product source **unchanged**.

**Purpose:** Define the safe, platform-backed path from a reviewed code release to `db:migrate:main`. Super Admin System Integrity remains status-only. No normal browser/API migration SQL; no credentials in browser or Express runtime.

**Evidence:** `mobile-qa/release-operations-01c-a/20260718-2320/` (original + `INSPECTOR-CORRECTION.md`).

**Corrected conclusion:** Currently safe = status-only + manual trusted release. Pre-deploy is future candidate only after Inspector I1. **01C-B BLOCKED**.

**FACT gap:** `deploy.yml` does not run `db:migrate:main`. Live dashboard / dual deploy / prod ledger: **NOT VERIFIED**.

### SERVICE-INTAKE-RELIABILITY-01E / HOTFIX-1 / HOTFIX-2 / QA-CLOSE / UI-PAGING-QA-CLOSE - Query Pagination

**Status:** **COMPLETED locally** â€” **2026-07-18 17:43 Asia/Dhaka** (UI-PAGING-QA-CLOSE).

**Purpose:** Bounded SQL list queries + honest admin consumers so records past page one are reachable.

**UI-PAGING-QA-CLOSE:** QA-only. CDP touch swipes to paginator (in-viewport + above dock); Next â†’ page 2 â†’ Prev â†’ page 1 for Requests and Jobs at 390Ã—844 and 430Ã—932. **Product source unchanged.**

**Proofs (UI-PAGING):** Headed mobile pager **PASS 4 / FAIL 0**; seed/cleanup **PASS 2**; gates **PASS 4**. Combined **PASS 10 / FAIL 0**. Desktop 1440 **NOT VERIFIED** (out of scope).

**Evidence:** `mobile-qa/service-intake-reliability-01e-hotfix-2-ui-paging-qa-close/20260718-1735/` (+ QA-CLOSE `.../20260718-1723/`, HOTFIX-2 `.../20260718-1547/`).

**NOT VERIFIED (carry-forward):** CorporateTab, TechnicianTab, CreateJobDrawer, SystemHealthTab list migrations; server-side SR lane inventory filter; production; new MAIN index; desktop 1440 pager.

**Next eligible:** was **RELEASE-OPERATIONS-01A** (completed below).

### RELEASE-OPERATIONS-01A - Local Release Preflight

**Status:** **COMPLETED locally â€” development/demo data condition accepted** â€” preflight **2026-07-18 17:50**; lineage correction **2026-07-18 18:05 Asia/Dhaka**; Inspector clarification **2026-07-18**.

**Purpose:** Read-only local safety contract for Super Admin schema-update status (ledger, executor, legacy inventory, readiness) before any control UI.

**Executed:** Ledger vs registry (27/27); executor path clear. Original R4 undercounted journey orphans (3 direct only).

**Evidence (preflight):** `mobile-qa/release-operations-01a/20260718-1748/` (+ `CORRECTION-NOTE.md`).

### RELEASE-OPERATIONS-01A-DATA-LINEAGE-CLOSE

**Status:** **CLOSED â€” local development/demo data only; no repair authorised** â€” **2026-07-18 18:05 Asia/Dhaka**, clarified **2026-07-18**.

**Purpose:** Correct journey lineage inventory; classify breakage; produce repair decision pack **without** mutating data.

**Corrected aggregates (local `promise_dev`):** journeys **86**; broken `service_request_id` **3**; broken `quote_request_id`â†’`service_requests` **83**; broken COALESCE **86**; healthy COALESCE **0**; local `service_requests` rows **0**; job orphans **0**; events **86** (all on broken COALESCE journeys); FKs on journeys **0**. Ledger **27/27** still PASS (does not mean data healthy).

**Inspector clarification:** These 86 local `promise_dev` rows are development/demo credentials/data. Production uses a separate database and is not represented by this local audit. **Do not delete, relink, archive, quarantine, or otherwise mutate these local rows.** This is not a production-data gate. Production lineage remains NOT VERIFIED because it was intentionally not accessed.

### RELEASE-OPERATIONS-01B-A / HOTFIX-1 - Super Admin Status API

**Status:** **COMPLETED locally** â€” HOTFIX-1 **2026-07-18 18:28 Asia/Dhaka**.

**Purpose:** Super Admin-only readiness status API with truthful ledger (including unexpected extras) and bounded lineage aggregate.

**HOTFIX-1:** `ledgerHealthy` / verify `ok` require `extra.length === 0`; DTO `extraCount`; ledger+lineage â‰¤60s TTL; unavailable proven via unreachable `DATABASE_URL` (no DDL); pure mapper test for fabricated extra; query-count cache proof.

**Proofs (HOTFIX-1):** **PASS 13 / FAIL 0 / NV 0** (direct D1â€“D4 + HTTP H1â€“H8 + no-write). Gates **PASS 4**. Frontend **NOT VERIFIED**. The 86-row local lineage count is accepted development/demo data; no repair is authorised.

**Evidence:** `mobile-qa/release-operations-01b-a-hotfix-1/20260718-1821/` (+ prior `.../01b-a-status-api/20260718-1810/`).

**Next eligible:** **RELEASE-OPERATIONS-01B-B** (Codex status UI; no migrate button).

### RELEASE-OPERATIONS-01B-B - Super Admin Status UI

**Status:** **COMPLETED locally** â€” behavior **2026-07-18 19:24**; evidence correction **2026-07-18 19:32 Asia/Dhaka**.

**Purpose:** Present the protected readiness status inside Super Admin Settings without creating any schema-update, data-repair, SQL, or migration-execution control.

**Implemented:** `System Integrity` Super Admin only; mobile Settings rows + desktop Bento card; schema ledger + journey links from `GET /api/admin/readiness`; no migrate/repair/SQL controls in product UI.

**UI-QA-CLOSE proofs (preserved):** **PASS 6 / FAIL 0** â€” Super Admin 844Ã—390, 390Ã—844, 430Ã—932, 1440Ã—900; Manager non-SA section absent; calm error state. Product source **not** changed.

**Evidence correction:** Prior â€œno DMLâ€ wording was **false**. Harness `headed-system-integrity.mjs` **INSERT**ed two local QA users and **DELETE**d them on cleanup. Inspector post-check: **0** tagged QA users remaining; local DB has **no** `session`/`sessions` table. Explicit **NOT VERIFIED:** production/cloud. See `INSPECTOR-CORRECTION.md`.

**Evidence:** `mobile-qa/release-operations-01b-b-ui-qa-close/20260718-1835/` (+ prior smoke `.../20260718-codex/`).

**NOT VERIFIED:** production/cloud. The local 86-row journey count is accepted as development/demo data; no repair is authorised.

**Next:** RELEASE-OPERATIONS-01C-A controlled release handoff audit. Journey lineage requires no action: the 86 local records are accepted development/demo data and no automatic repair is authorised.

### CUSTOMER-HOME-MOBILE-01A - Customer Homepage Visual Pilot

**Status:** COMPLETED locally â€” 2026-07-18 03:22 Asia/Dhaka. Kimi K3 stopped before editing because its local Firebase setup was invalid; Codex completed the contained implementation and headed QA. Evidence: `mobile-qa/customer-home-mobile-01a/20260718-030000/`.

**Purpose:** Ambitiously polish the mobile customer homepage, including map scroll ownership and clear service handoff, while preserving the existing customer visual system and a documented rollback path.

**Entry condition:** satisfied. Local UI proof uses Vite plus controlled public API mocks. Production remains NOT VERIFIED.

**Later phase:** CUSTOMER-MAP-BOOKING-01B owns reverse-address assist and server-enforced Dhaka pickup eligibility. UI-only inference is forbidden.

### CUSTOMER-HOME-MOBILE-01B - Distance Sheet Action Hierarchy

**Status:** COMPLETED locally â€” **2026-07-18 03:57 Asia/Dhaka**.

**Codex visual correction:** Completed locally 2026-07-18 04:11 Asia/Dhaka. The original screenshot exposed dock/chat overlap despite its PASS claim. The sheet now portals to `document.body`, sits above the dock only below the dock breakpoint, and reaches the viewport bottom in wide mobile landscape. Corrective evidence: `mobile-qa/customer-home-mobile-01b/codex-ui-correction-20260718-0411/` - **PASS 6 / FAIL 0 / NOT VERIFIED 2**. Production and route-ready/denied/fallback replay remain NOT VERIFIED.

**Purpose:** Correct the awkward open-sheet composition where the large reserved bottom space makes the final service action and privacy message appear to fall away. Establish compact hierarchy, stable action reachability, and correct dock clearance without changing desktop, booking rules, or map-scroll ownership.

**Delivered:** Mobile sheet two-stage hierarchy; dock-aware padding; fixed viewport sheet for short landscape; quiet privacy footer; pickup primary + visit equal reach (â‰¥48px); handoffs `serviceMode=pickup|service_center`.

**Proofs:** **PASS 4 / FAIL 0** (390Ã—844, 430Ã—932, 844Ã—390 sheets + desktop 1440Ã—900 smoke). Gates: `tsc` 0, `vite build --mode development` 0, `git diff --check` 0.

**Evidence:** `mobile-qa/customer-home-mobile-01b/20260718-034917/` (`REPORT.md`, `ROLLBACK.md`, `results.json`, `headed-sheet-qa.mjs`, screenshots, `touch-traces.json`).

**NOT VERIFIED:** production, live geo/polygons, full repair-form visual preselection.

**Entry condition:** CUSTOMER-HOME-MOBILE-01A local UI proof complete.

**Executor brief:** `docs/BOT.md` section `CUSTOMER-HOME-MOBILE-01B`.

### CUSTOMER-HOME-MOBILE-01C - Map Submenu Navigation

**Status:** COMPLETED locally â€” **2026-07-18 19:47 Asia/Dhaka**. Headed retest **PASS 10 / FAIL 0**. No product repair. Production **NOT VERIFIED**.

**Purpose:** When the customer opens the map submenu, the floating customer dock slides away, the sheet owns the bottom edge, and both a visible left-arrow back control and the existing drag-down handle close it without confusion.

**Proved:** 390Ã—844 open â†’ dock hide â†’ Back restore â†’ reopen â†’ drag close/restore; 844Ã—390 sheet open/back/drag with no phantom dock gap and no horizontal overflow. Gates: `tsc` / `vite build --mode development` / `build:server` / `git diff --check` PASS.

**Evidence:** `mobile-qa/customer-home-mobile-01c/20260718-1944/` (`REPORT.md`, `results.json`, `headed-submenu-nav.mjs`, screenshots, `touch-traces.json`). Prior implementation note: `mobile-qa/customer-home-mobile-01b/submenu-navigation-20260718-0430/REPORT.md`.

### CUSTOMER-MAP-LOCATION-CONTROLS-01 - Map-Level Location and Directions

**Status:** COMPLETED locally â€” **2026-07-18 19:55 Asia/Dhaka**. Headed QA-CLOSE **PASS 8 / FAIL 0**. No product repair. Production / live public geolocation **NOT VERIFIED**.

**Purpose:** Make the mobile map self-explanatory without creating another location or route workflow.

**Delivered:** A visible crosshair control now requests the customer's current location on first use and recenters the existing customer pin later. The dark map label now says exactly what to do before location is known, then changes to route status and invites the customer to open the route and service choices. A separate `Directions` control appears only when both the customer location and configured service-center location exist; it opens the existing Google Maps direction URL.

**Boundaries:** Mobile map only. No raw coordinates in UI, no desktop changes, no new API, no booking or Dhaka-eligibility rule change. No DB DML in QA.

**Headed proof (390Ã—844 + 844Ã—390):** idle label + crosshair; allow+SC â†’ route label + Directions Google Maps URL; allow without SC â†’ Directions absent; deny â†’ calm copy + sheet booking choices reachable; no raw coords / overflow / control overlap.

**Build gates (QA-CLOSE):** `tsc` PASS; `vite build --mode development` PASS; `git diff --check` PASS.

**Evidence:** `mobile-qa/customer-map-location-controls-01/20260718-1951/` (`REPORT.md`, `results.json`, `headed-location-controls.mjs`, screenshots, `touch-traces.json`).

### ADMIN-MOBILE-SCROLL-00A - Headed Interaction Forensics (defect confirmed)

**Status:** QA complete â€” defects confirmed (not a foundation gate change)

**Evidence:** `mobile-qa/admin-mobile-scroll-00a/20260717-162309/` (REPORT.md, results.json, traces, screenshots). Completion: 2026-07-17 16:33 Asia/Dhaka.

**Confirmed FAILs:**
- **Area Intelligence** â€” CDP touch swipes only reached ~26% of scroll max; final content unreachable (map/fixed-layout / gesture capture hypothesis). â†’ **fix attempted in ADMIN-MOBILE-AREA-INTELLIGENCE-01A** (needs headed retest).
- **Repair Journeys** â€” scrolled ~72% but did not reach end; trailing content still below dock clearance after protocol. â†’ **Patched in ADMIN-MOBILE-REPAIR-JOURNEYS-SCROLL-01A**. 01B proved scroll ownership and padding, but its real dock-clearance assertion needs evidence retest.

**PASS:** Dashboard, Overview, Service Requests (same protocol).

### ADMIN-MOBILE-REPAIR-JOURNEYS-SCROLL-01A - Mobile End Reachability

**Status:** COMPLETED locally â€” targeted proof **2026-07-18 20:09 Asia/Dhaka**; shared-primitive regression closed by **01B** at **2026-07-18 21:14 Asia/Dhaka**. Production **NOT VERIFIED**.

**Purpose:** Make the final Repair Journeys cards and actions reachable above the mobile dock without changing journey data, workflow behavior, desktop design, or unrelated tabs.

**Repair:** `MobileScrollContent` class-based dock clearance (tab `pb-*` no longer overridden by inline style); Repair Journeys mobile list `7.25rem` bottom clearance. No second scroller; desktop layout unchanged.

**Proof:** CDP touch 390Ã—844 / 430Ã—932 / 844Ã—390 â€” single owner, atBottom, last card above dock, no jump/dual/overflow/React error; 1440Ã—900 desktop smoke PASS. Local DML tag `QA-RJ-SCROLL-01A` cleaned (24/24/24).

**Evidence:** `mobile-qa/admin-mobile-repair-journeys-scroll-01a/20260718-2000/` (`REPORT.md`, `SOURCE_TRACE.md`, `results.json`, harness, traces, screenshots, seed/cleanup).

**Gates:** `tsc` PASS Â· `vite build --mode development` PASS Â· `git diff --check` PASS.

### ADMIN-MOBILE-SCROLL-PRIMITIVE-REGRESSION-01B - Shared Scroll Clearance Regression QA

**Status:** Base pack COMPLETED **2026-07-18 21:14 Asia/Dhaka** (PASS 35/0; filler-assisted). Evidence-close remains **Patched Needs Retest** (see next section). Production **NOT VERIFIED**.

**Why:** Shared `MobileScrollContent` class-based padding needs multi-tab regression; base pack did not prove real final rows vs a **visible** dock.

**Evidence (base):** `mobile-qa/admin-mobile-scroll-primitive-regression-01b/20260718-2106/`.

### ADMIN-MOBILE-SCROLL-PRIMITIVE-REGRESSION-01B-EVIDENCE-CLOSE - Real End-Content Dock Proof

**Status:** **Patched Needs Retest** â€” **2026-07-18 21:51 Asia/Dhaka**. **PASS 20 / FAIL 2 / NOT VERIFIED 2**.

**Purpose:** Close only the evidence gap in 01B with real final controls above a visible dock.

**Results:** Real tagged fixtures (`QA-01B-EVC`, cleaned to zero). No DOM filler. **PASS:** Repair Journeys visible dock + final profile tappable (pad 136px). **NOT VERIFIED:** Service Requests + Area Intelligence (final geometry would clear dockTop; dock reveal flaky). **FAIL:** Warranty Claims (pad still 88px in session; final under visible dock). One product repair: shell/default clearance **5.5rem â†’ 7.5rem** + tab `pb` overrides. Stop rule: no second repair.

**Smoke:** 844Ã—390 + 1440Ã—900 **PASS** all four. Gates: `tsc` / `vite build --mode development` / `git diff --check` **PASS**.

**Inspector cross-check:** Current source requests 7.5rem / 120px clearance in both `WarrantyClaimsTab` and the active admin shell fallback, but the evidence session measured the pre-repair 88px. Treat the Warranty failure as an unconfirmed stale-client or class-resolution observation until a freshly started local server proves the exact served class and computed style. Do not add more clearance CSS before that confirmation.

### ADMIN-MOBILE-SCROLL-PRIMITIVE-REGRESSION-01B-HOTFIX-1-QA-CLOSE - Fresh-Source Dock Retest

**Status:** COMPLETED locally â€” **2026-07-18 22:41 Asia/Dhaka**. **PASS 28 / FAIL 0 / NOT VERIFIED 0**. Product CSS **unchanged** this phase.

**Evidence:** `mobile-qa/admin-mobile-scroll-primitive-regression-01b-hotfix-1-qa-close/20260718-2157/` (`REPORT.md`, `results.json`, `headed-hotfix1-qa-close.mjs`, CSS JSON, traces, screenshots, seed/cleanup).

**Warranty CSS (fresh Vite + cache-disabled Chrome, 390Ã—844):** class `pb-[calc(7.5rem+env(safe-area-inset-bottom))]`, computed **120px**, shell `--admin-mobile-bottom-clearance` = `calc(7.5rem + 0px)`, tab identity `#warranty` + â€œWarranty Claims / CRRâ€. Prior 88px was wrong tab: `warranty_claims.enabled_admin=false` â†’ SPA fell back to Dashboard (`pb 5.5rem` / 88px).

**Matrix:** Warranty/SR/AI pad **120** Â· RJ **136**. Visible-dock real finals (no filler) + tap **PASS** Ã—4 (dockTop 778). Phantom gap when dock hidden **PASS** Ã—4. ScrollTop unmoved on dock force. 844Ã—390 + 1440Ã—900 smoke **PASS** Ã—8.

**DML:** tag `QA-HF1-01B` cleaned to 0; temporary `warranty_claims` enable restored disabled. Gates: `tsc` / `vite build --mode development` / `git diff --check` **PASS**. Production + module-off Warranty **NOT VERIFIED**.

### PRODUCTION-UI-PARITY-00A - Read-Only Mobile Production Drift Audit

**Status:** QA complete â€” **FAIL** (production defect confirmed at audit time)

**Evidence:** `mobile-qa/production-ui-parity-00a/20260717-164627/`. Completion: **2026-07-17 16:51:11 Asia/Dhaka**.

**Next after audit:** Area Intelligence source fix â†’ **ADMIN-MOBILE-AREA-INTELLIGENCE-01A** (below).

### ADMIN-MOBILE-AREA-INTELLIGENCE-01A - Scroll Ownership and Native Mobile Rebuild

**Status:** Followed by **01A-HOTFIX-1** (below). Base evidence: `mobile-qa/admin-mobile-area-intelligence-01a/20260717-171038/`.

### ADMIN-MOBILE-AREA-INTELLIGENCE-01A-HOTFIX-1

**Status:** Complete (local) â€” **PASS** all required headed viewports. Production **NOT VERIFIED**.

**Evidence (final):** `mobile-qa/admin-mobile-area-intelligence-01a-hotfix-1/20260717-235748/` (`REPORT.md`, `results.json`, screenshots, traces). Completion: **2026-07-18 00:13 Asia/Dhaka**.

**Product fixes:** Removed scroll shield; canvas `pointer-events:none` + pan-y native page scroll; Explore/Details `MobileBottomSheetDragHandle`; health alert unclipped; compact OSM attribution; landscape details body scroll height fix. Desktop unchanged. **No commit/push/deploy.**

**Build:** tsc **PASS** Â· vite **PASS** Â· git diff --check **PASS**.

**Headed QA (CDP touch, 18 seeded areas, cleaned up):**
| Viewport | Result |
|----------|--------|
| 390Ã—844 | **PASS** (map swipes scrollTop 0â†’303; centre stable; explore pan+pinch; details) |
| 430Ã—932 | **PASS** |
| 740Ã—390 mobile-landscape | **PASS** (scrollTop 0â†’526 on map swipes; pinch **PASS**) |
| 1440Ã—900 desktop | **PASS** |
| **Production** | **NOT VERIFIED** |

**Next eligible (not started):** SYSTEM-FOUNDATION-01B-B (blocked pending Inspector); Repair Journeys scroll-00a.

**Does not unblock** SYSTEM-FOUNDATION-01B-B.

### ADMIN-MOBILE-AREA-INTELLIGENCE-01A-CLEANUP-ATTRIBUTION

**Status:** Complete (local) â€” **PASS**

**Evidence:** `mobile-qa/admin-mobile-area-intelligence-01a-cleanup-attribution/20260718-cleanup/` (`REPORT.md`, `results.json`, screenshots, cleanup script). Completion: **2026-07-18 00:42:15 Asia/Dhaka**.

**What was done:**
1. Hard-deleted **126** `QA-AI01A-H1-*` service_areas (not deactivate); dependents had 0 FKs; post-delete DB count **0**; UI search/list **0**.
2. Preview map attribution: single compact `Â© OpenMapTiles Â· Â© OpenStreetMap`; no OpenFreeMap; no MapLibre dual credit. Desktop/Explore control path unchanged.

**Build:** tsc **PASS** Â· vite **PASS** Â· git diff --check **PASS**.

**Headed QA:** 390Ã—844 **PASS**; 740Ã—390 **PASS** (no fixtures; one credit; map-origin swipe scrolls; centre stable).

**Production:** **NOT VERIFIED** (no deploy).

**Next eligible (not started):** SYSTEM-FOUNDATION-01B-B (blocked pending Inspector).

## Foundation Queue

1. **SYSTEM-FOUNDATION-01A - Security Boundary Repair** âœ… COMPLETED
   - Replace broad credentialed `*.vercel.app` CORS acceptance with explicit allowed origins.
   - Standardize safe API errors and redacted server errors/logs.
   - Review authenticated abuse protection and rate-limit storage for multi-instance deployment.
   - **Entry gate:** SYSTEM-UNIFICATION-00C-B-COD-CLOSE complete (incl. HOTFIX-1, HOTFIX-2, and HOTFIX-2A).

2. **SYSTEM-FOUNDATION-01A-SUPPLY-CHAIN-01A - Runtime Dependency Reachability and Safe Remediation** âœ… COMPLETED
   - Reachability-first remediation: updated `multer` 2.1.1â†’2.2.0 (DoS fixes); added npm `overrides` for 6 transitive packages (websocket-driver 0.7.5, form-data 4.0.6, @grpc/grpc-js 1.14.4, dompurify 3.4.12, js-yaml 4.3.0, protobufjs 7.6.5). 7 advisories fixed (1 critical, 3 high, 3 moderate). 14 residual advisories classified: 6 need follow-up phases (xlsx, drizzle-orm, firebase-admin chain, @google-cloud/storage), 8 accepted with mitigation (nodemailer unreachable, uuid low-risk transitive, @capgo mobile-only, exceljs/gaxios/teeny-request/retry-request/imagekit uuid-transitive). 12 PASS / 0 FAIL / 6 NOT VERIFIED. Evidence: `mobile-qa/system-foundation-01a-supply-chain-01a/20260717-030616/`. Completion time: 2026-07-17 03:21 Asia/Dhaka. Next eligible: **SYSTEM-FOUNDATION-01A-SUPPLY-CHAIN-01B**.
   - **Entry gate:** SYSTEM-FOUNDATION-01A complete.

3. **SYSTEM-FOUNDATION-01A-SUPPLY-CHAIN-01B - XLSX Parser Replacement and Upload Hardening** âœ… COMPLETED
   - Removed `xlsx@0.18.5` (Prototype Pollution + ReDoS, no fix on npm) from all runtime code. Replaced with `exceljs@4.4.0` in `corporate-portal.routes.ts` (server) and `service-request.tsx` (browser lazy dynamic import â€” code-split, not in initial bundle). Added header allowlist mapping with dangerous header rejection (`__proto__`, `prototype`, `constructor`). Added per-format validation: ZIP magic bytes check for XLSX/DOCX/PPTX, zero-byte check for CSV. Added processing limits: max 5 worksheets, 5000 rows, 50 columns, 10000 chars/cell. Added `safePortalUpload` wrapper to corporate-portal route (413 for LIMIT_FILE_SIZE, 400 for other MulterError, 400 for zero-byte, next(err) for non-Multer). Replaced all 500 responses that leaked `error.message` with safe 400 JSON. `npm audit --omit=dev`: 14â†’13 (1 high removed â€” XLSX). 15 PASS / 0 FAIL / 4 NOT VERIFIED (DOCX/PPTX valid upload, browser QA, limit boundary tests). Pre-existing bug found: `createJobTicketsBulk` doesn't generate IDs for `job_tickets.id` â€” corporate portal bulk upload has never successfully created jobs (storage-layer bug, outside phase scope). Evidence: `mobile-qa/system-foundation-01a-supply-chain-01b/20260717-035815/`. Completion time: 2026-07-17 04:25 Asia/Dhaka. Next eligible: **SYSTEM-FOUNDATION-01B** (Migration and Startup Reliability).
   - **Entry gate:** SYSTEM-FOUNDATION-01A-SUPPLY-CHAIN-01A complete.

3a. **SYSTEM-FOUNDATION-01A-SUPPLY-CHAIN-01B-CLOSE - Bulk Job ID Generation and Upload Hardening Close** âš ï¸ NEEDS ID INTEGRITY HOTFIX (not full completed)
   - Fixed premature SUPPLY-CHAIN-01B closure: `createJobTicketsBulk` in `server/repositories/job.repository.ts` now wraps insert in `db.transaction()` and calls `getNextJobNumber()` inside the transaction. But the `getNextJobNumber` function reads `MAX(id)` and inserts without a database lock. `job_tickets.id` is a primary key, so concurrent requests can collide and fail. Text ordering also breaks after `JOB-YYYY-9999`. Needs hotfix: canonical allocator with transaction-scoped advisory lock + numeric MAX + rollover support.
   - **Entry gate:** SYSTEM-FOUNDATION-01A-SUPPLY-CHAIN-01B complete.

3b. **SYSTEM-FOUNDATION-01A-JOB-ID-INTEGRITY-HOTFIX-01 - Job ID Allocator Canonicalization** âœ… COMPLETED
   - Created one canonical job-ID allocator in `server/repositories/job.repository.ts`:
     - `allocateJobIdsInTx(tx, count, year?)` â€” acquires `pg_advisory_xact_lock(hashtext('job_seq_<year>'))`, computes `MAX(CAST(SUBSTRING(id FROM <prefixLen+1>::int) AS INTEGER))` via raw SQL (never lexical `ORDER BY id`), supports rollover `JOB-YYYY-9999` â†’ `JOB-YYYY-10000` (no `padStart(4)` cap), allocates N contiguous IDs
     - `allocateJobIdInTx(tx, year?)` â€” convenience wrapper for single ID
   - Migrated all 6 active creators to the canonical allocator:
     - `job.repository.ts:createJobTicket` â€” allocates under advisory lock if no ID supplied; accepts caller-supplied IDs
     - `job.repository.ts:createJobTicketsBulk` â€” acquires per-year advisory lock + uses numeric MAX
     - `corporate.service.ts:createChallanIn` â€” replaced inline `prefix + lastJob + padStart` with `allocateJobIdsInTx`
     - `corporate.repository.ts:createChallanInWithJobs` â€” same migration
     - `job.service.ts:createOrAttach` â€” replaced inline advisory-lock + lexical MAX with `allocateJobIdInTx`
     - `retail-quote.service.ts:acceptAndConvert` â€” same migration
   - Removed out-of-transaction allocation from:
     - `jobs.routes.ts:POST /api/job-tickets` â€” removed `getNextJobNumber` call; `createJobTicket` allocates under lock
     - `warranty.routes.ts:createWarrantyJob` â€” removed `getNextJobNumber` call; fixed broken `storage.createJobTicket` proxy call to use `jobRepo.createJobTicket`
     - `corporate-portal.routes.ts:POST /service-requests` â€” removed `getNextJobNumber` call
   - `getNextJobNumber` kept as legacy preview helper (not used for actual allocation)
   - Completed missed upload hardening:
     - `corporate-portal.routes.ts` Multer: added `files: 1, fields: 10, parts: 10` bounds + explicit error handling for `LIMIT_FILE_COUNT` / `LIMIT_FIELD_COUNT` / `LIMIT_PART_COUNT`
     - `corporate-portal.routes.ts` bulk-json: added max 50 columns per row + dangerous key rejection (normalized `proto`/`prototype`/`constructor`/`__proto__`)
     - `corporate.routes.ts:buildTableImportResult` â€” dangerous headers now **throw** `DANGEROUS_HEADER` (not silently `return`) at both header row and data row levels
     - `corporate.routes.ts:parse-docx` and `parse-pptx` â€” added `DANGEROUS_HEADER` catch blocks returning safe 400
   - 10 PASS / 0 FAIL / 0 NOT VERIFIED. Gates: `tsc` exit 0, `vite build` exit 0 (built in 1m 9s), `npm run build:server` exit 0 (`dist/index.cjs 2.7mb`), `npm ls xlsx` empty, `git diff --check` exit 0. Evidence: `mobile-qa/system-foundation-01a-job-id-integrity-hotfix-01/20260717-080000/`. Completion time: 2026-07-17 09:45 Asia/Dhaka. Next: HOTFIX-02 (client ID injection, preview correctness, legacy resilience, honest DOCX/PPTX HTTP).
   - **Entry gate:** SYSTEM-FOUNDATION-01A-SUPPLY-CHAIN-01B-CLOSE complete.

3c. **SYSTEM-FOUNDATION-01A-JOB-ID-INTEGRITY-HOTFIX-02 - Server-Owned IDs + Preview + Legacy + DOCX/PPTX HTTP** âœ… COMPLETED
   - Server-owned `job_tickets.id`: POST `/api/job-tickets` rejects client-supplied `id` with `400 JOB_ID_SERVER_ASSIGNED`. `createJobTicket` / `createJobTicketsBulk` always strip caller `id` and allocate via canonical allocator. No trusted exception for client-chosen IDs; internal services use `allocateJobIdInTx(s)` + direct insert only.
   - Preview: `getNextJobNumber` returns calculated next `JOB-YYYY-NNNN` (not `0000`); GET response `{ nextNumber, preview: true, reserved: false }`; never write authority. Rollover preview after 9999 â†’ 10000 proven.
   - Legacy resilience: `currentMaxSuffix` / peek only match `^JOB-YYYY-[0-9]+$` before CAST; `JOB-YYYY-TEST` does not block numeric allocation.
   - DOCX/PPTX: minimal valid fixtures with dangerous table header; real authenticated multipart HTTP through Express â†’ safe 400 JSON, no stack/parser leak, zero rows created.
   - 15 PASS / 0 FAIL / 0 NOT VERIFIED (all HTTP/DB). Gates: `tsc` exit 0, `vite build` exit 0 (~1m 14s), `npm run build:server` exit 0 (`dist/index.cjs` 2.7mb), `git diff --check` exit 0. Evidence: `mobile-qa/system-foundation-01a-job-id-integrity-hotfix-02/20260717-120000/`. Completion time: 2026-07-17 16:10 Asia/Dhaka. Next eligible: **SYSTEM-FOUNDATION-01B** (Migration and Startup Reliability).
   - **Entry gate:** SYSTEM-FOUNDATION-01A-JOB-ID-INTEGRITY-HOTFIX-01 complete.

4. **SYSTEM-FOUNDATION-01B-A - Migration and Startup Contract Audit** âœ… COMPLETED (source audit only)
   - Full inventory of startup migrations/seeds (MAIN + Brain), pre-listen session DDL, orphans.
   - Startup timeline: createApp â†’ listen â†’ background migrate â†’ markMigrationsComplete.
   - Proved from source: partial mutation gate only; `/health` 200 while `checking`; failed tasks leave process up and partially usable; MAIN+Brain mixed under one status; no advisory lock/ledger.
   - Concrete hazards H1â€“H12; Inspector decisions D1â€“D4.
   - Proposed 01B-B contract + local PostgreSQL proof plan P1â€“P8 (not executed this phase).
   - Evidence: `mobile-qa/system-foundation-01b-a/20260717-161827/` (`SYSTEM-FOUNDATION-01B-A-AUDIT.md`, `migration-inventory.json`, `startup-timeline.md`, `01B-B-implementation-contract.md`). Completion time: 2026-07-17 16:18 Asia/Dhaka.
   - **Next:** 01B-B blocked until Inspector approval. No production/Aiven work.
   - **Entry gate:** SYSTEM-FOUNDATION-01A-JOB-ID-INTEGRITY-HOTFIX-02 complete.

4b. **SYSTEM-FOUNDATION-01B-B - Migration Ledger + Advisory Lock + Readiness** âœ… COMPLETED
   - Created `promise_schema_migrations` ledger table (project-specific name) with 27 ordered MAIN schema migrations. Each migration has stable ID, SHA-256 checksum, applied_at, applied_by, duration_ms. Checksum mismatch on already-applied migration â†’ fail closed (never silently re-run). Idempotent: existing DB with all columns but empty ledger â†’ migrations run once, ledger populated, subsequent boots skip.
   - One pinned `pg.Client` for lock acquisition, ledger reads/writes, and every migration query. `pg_try_advisory_lock(hashtext('promise_main_schema_migrate'))` with bounded wait (60s default). On timeout: do not mark ready, no retry loop. Lock released on success/failure/disconnect. Ordering preserved: NG reports before NG customer decisions, service areas before POS integrity.
   - `npm run db:migrate:main` command reads DATABASE_URL from environment. Production boot validates ledger state but does not perform uncontrolled background DDL. `SKIP_STARTUP_MIGRATIONS=true` in production refuses to mark ready without verified ledger. No Brain DB for MAIN migrations.
   - Fail-closed readiness middleware: 503 for all dynamic API routes while MAIN schema pending/lock-waiting/failed. `/health` = liveness only (200 while process+DB alive, 503 only if DB down). `/ready` + `/api/ready` = strict traffic gates (503 until ledger complete). No SQL/stack/conn URL/checksums in public responses. Admin readiness shows safe state + version (authorized only).
   - Super Admin seed separated from MAIN readiness (runs as optional job). Brain work separated (cannot delay/fail MAIN readiness). Optional jobs (seeds/backfills/reconciliations) run separately with observable status.
   - 9 PASS / 0 FAIL (P1-P8 + verify). Gates: `tsc` exit 0, `vite build` exit 0 (1m 22s), `npm run build:server` exit 0 (2.7mb), `git diff --check` exit 0. Evidence: `mobile-qa/system-foundation-01b-b/20260717-165534/`. Completion time: 2026-07-17 18:55 Asia/Dhaka. Next eligible: **SYSTEM-FOUNDATION-01C** (Runtime Scale and Log Hygiene).
   - **Entry gate:** Inspector approval of 01B-A contract (D1â€“D4) â€” approved.

4c. **SYSTEM-FOUNDATION-01B-B-HOTFIX-2 - Readiness Decoupling (optional/Brain never gate MAIN)** âœ… COMPLETED (local; closed via 4d)
   - Defect: `isDbReady()`/`/ready` gated on `migrationsComplete` set only after optional MAIN jobs; with `SKIP_STARTUP_MIGRATIONS=true` or slow/failed optional/Brain work, `/ready` stayed 503 despite verified MAIN ledger (HOTFIX-1 P1â€“P3 residual).
   - Fix: MAIN traffic readiness = DB connected + MAIN ledger complete + not failed. `markOptionalJobsComplete()` (legacy alias `markMigrationsComplete`) is observability only. `recordMainSchemaVerified` on prod/SKIP verify path. Schedulers still require verified MAIN schema.
   - Implementation evidence: `mobile-qa/system-foundation-01b-b-hotfix-2/20260718-010000/` (11 PASS). **Completion time: 2026-07-18 02:15 Asia/Dhaka.** Fully closed after QA-close 4d.

4d. **SYSTEM-FOUNDATION-01B-B-HOTFIX-2-QA-CLOSE** âœ… COMPLETED (local) after **4e** P4 re-proof
   - P5/P7/P9/P10 + observability repair: `mobile-qa/system-foundation-01b-b-hotfix-2-qa-close/20260718-022245/`.
   - P4b closed by **4e** with real concurrent `db:migrate:main` (no direct ledger writes).

4e. **SYSTEM-FOUNDATION-01B-B-HOTFIX-2-QA-CLOSE-P4** âœ… COMPLETED (local) â€” **01B-B fully closed**
   - Test-only post-completion advisory lock hold: `NODE_ENV=test` + `MAIN_MIGRATION_TEST_HOLD_LOCK_AFTER_COMPLETE=true`, max 30s, after real ledger writes only (`server/services/main-schema-migrate.service.ts`).
   - **P4a PASS:** incomplete ledger + held lock â†’ `/ready` 503, not failed.
   - **P4b PASS:** real `db:migrate:main` child acquired lock, applied migrations, held lock after complete; verifier lock-timeout re-verify â†’ `/ready` 200; verifier applied **no** MAIN DDL; release exit 0; ledger 27; harness source guard against direct ledger INSERT/UPDATE.
   - **PASS: 2 / FAIL: 0 / NOT VERIFIED: 3** (prod/Aiven, full P1â€“P10 re-run out of scope, 01E not executed).
   - Gates: `tsc` 0, `vite build --mode development` 0, `build:server` 0, `git diff --check` 0.
   - Evidence: `mobile-qa/system-foundation-01b-b-hotfix-2-qa-close-p4/20260718-024745/` (`REPORT.md`, `results.json`, harness, `release-child-log.txt`, `verifier-log.txt`, `child-logs-redacted.txt`, `proof-output.txt`).
   - **Completion time: 2026-07-18 02:52 Asia/Dhaka.** Unlocks **SERVICE-INTAKE-RELIABILITY-01E**. No commit/push/deploy.

5. **SERVICE-INTAKE-RELIABILITY-01E - Query and Pagination Repair** âš ï¸ **Patched Needs Retest** (HOTFIX-1)
   - Product: server paging for admin SR/Jobs tabs; list endpoints fail-closed on schema drift (no load-all); POS uses ready-for-billing.
   - HTTP/SQL 5k proof: **PASS 18 / FAIL 0**. Headed UI: **PASS 1 / FAIL 3** (stop rule after one repair).
   - **NOT VERIFIED:** CorporateTab, TechnicianTab, CreateJobDrawer, SystemHealthTab lists; lane/priority cross-page; production; new MAIN index.
   - Evidence: `mobile-qa/service-intake-reliability-01e-hotfix-1/20260718-152224/`. **Completion attempt: 2026-07-18 15:33 Asia/Dhaka.**
   - **RELEASE-OPERATIONS-01 blocked** until HOTFIX-1 fully passes.
   - **Entry gate:** SYSTEM-FOUNDATION-01B-B + HOTFIX-2-QA-CLOSE + QA-CLOSE-P4 complete.

6. **RELEASE-OPERATIONS-01 - Super Admin Schema Update Status and Controlled Release**
   - **01A - Local Release Preflight:** read-only local audit of ledger state, schema drift/legacy fallbacks, table growth, orphan counts, critical-query plans, release-command ownership, and safety boundaries. No product code or UI. Required before the update-control contract.
   - Add a Super Admin-only desktop/mobile Settings surface that reads the MAIN migration ledger and shows a safe state: up to date, update available, applying, complete, or failed. Once the deployed version is complete, the update notice disappears after refresh.
   - An update action must start an approved controlled release job, never run arbitrary SQL or schema code from a normal web request. The browser and runtime API must not expose `DATABASE_URL` or deployment credentials.
   - Only migrations already shipped in the reviewed application release, with ledger ID and checksum, may be applied. The action must be idempotent, audited, re-authenticated, confirmation-gated, and safe under duplicate clicks.
   - Preserve the existing release command (`npm run db:migrate:main`) as the executor. The UI is a control/status surface, not a second migration engine and not a self-deleting code mechanism; Git history remains the audit record.
   - **Entry gate:** SERVICE-INTAKE-RELIABILITY-01E complete and local release-command rehearsal PASS.

7. **SYSTEM-FOUNDATION-01C - Runtime Scale and Log Hygiene**
   - Replace process-local scheduler flags with a distributed lease or atomic database claim so multiple backend instances cannot duplicate reminders, backups, abandonment work, or day-close work.
   - Validate `trust proxy` against the real deployment chain. Use a shared rate-limit store before horizontal scaling, since current rate-limit counters are process-local.
   - Redis/Valkey is explicitly deferred. Do not configure, deploy, or require it in this phase. Multi-instance cache/rate-limit claims remain NOT VERIFIED until a later approved infrastructure phase.
   - Remove raw database errors from the public health response and replace remaining raw error or phone-number logging with structured, redacted logs.
   - Inventory high-risk mutation routes and add focused HTTP authorization sentinel tests.
   - **Entry gate:** RELEASE-OPERATIONS-01 complete.

8. **SYSTEM-OBSERVABILITY-01 - Super Admin Error Center**
   - Create a Super Admin-only Settings surface that shows structured system incidents, readiness state, background-job failures, and a small daily health summary in plain language.
   - Capture only sanitized incident metadata: stable error signature, component, safe status/category, first/last seen, count, and resolution state. Never store request bodies, passwords, tokens, customer messages, raw SQL, stack traces, or database URLs in the UI-facing record.
   - Deduplicate repeated failures, apply bounded retention and indexes, and use event-driven capture plus low-frequency scheduled summaries. Do not add continuous AI scanning, per-request database writes, or a second logging authority.
   - Make alerts actionable: severity, affected area, safe next step, acknowledge/resolve history, and a support-safe export. It must not claim root cause or auto-repair production data.
   - Reuse the existing centralized redaction/error handling and readiness contracts. API access, exports, and all mutation actions require Super Admin permission and audit logging.
   - **Entry gate:** SYSTEM-FOUNDATION-01C complete and a source audit confirms the existing error/log owners.

9. **SYSTEM-PERFORMANCE-01 - Compute Budget and Load Proof**
   - Measure query counts, latency, payload sizes, connection-pool wait time, and memory under controlled traffic.
   - Remove polling where SSE or bounded refresh is sufficient.
   - Define practical alert thresholds and a production capacity baseline.
   - **Entry gate:** SERVICE-INTAKE-RELIABILITY-01E complete.

10. **JOB-LIFECYCLE-TRUST-00A - Post-Custody Workflow Ownership Audit**
   - Define the Job Ticket as the sole operational-status owner after verified custody and conversion.
   - Keep the Service Request as the original intake/custody record and customer-case identity, but prevent it from independently cancelling, closing, marking unrepairable, rolling back, or publishing a conflicting journey after conversion.
   - Define one allowlisted customer projection: no raw job notes, internal diagnoses, technician IDs, financial margins, audit records, raw database IDs, or exception details.
   - Audit normal, bulk, rollback, technician-workbench, and Service Request mutation paths with real HTTP role/ownership proofs before implementation.
   - **Entry gate:** SYSTEM-PERFORMANCE-01 complete.

11. **JOB-QUALITY-GATE-01 - Repair, Final Testing, and Reinspection Contract**
   - Repair work complete must enter Final Testing, never customer-ready directly.
   - Add structured test evidence, trusted-technician quality permission, reinspection handling, and a confirmed Ready state; delivery/collection remains a separate custody-confirmed event.
   - Customer status messages must be warm, bilingual, and accurate: repair work complete, testing in progress, extra recheck needed, ready, and returned.
   - Use reliable idempotent projection/outbox behavior so Job, Service Request tracking, journey, and notifications cannot silently diverge.
   - **Entry gate:** JOB-LIFECYCLE-TRUST-00A contract approved.

12. **DEVICE-IDENTITY-00A - Canonical TV Identity**
   - Correct the model-number versus serial-number ownership issue.
   - Define serial rules, no-serial device labels, duplicate warnings, and safe matching boundaries.
   - Do not add a global serial uniqueness constraint until real duplicate/format data is audited.
   - **Entry gate:** JOB-QUALITY-GATE-01 complete.

## Future Product Queue

These items are intentionally delayed until the foundation queue is complete.

**Frontend delivery rule:** When a frontend phase becomes eligible, Codex implements it directly. The existing mobile-native base is retained; work must improve a named workflow rather than introduce a parallel desktop/mobile design system.

1. **ADMIN-LIST-KEY-INTEGRITY-00A - Duplicate React-Key Audit and Repair**
   - Trace the duplicate-key console warnings observed in Warranty Claims, Service Requests, and Area Intelligence.
   - Replace only unstable or duplicate list keys with canonical stable identities; do not hide or filter the warnings.
   - Prove sorted, paged, refreshed, and tapped list rows retain their own identity in headed desktop and mobile QA.
   - **Entry gate:** SYSTEM-PERFORMANCE-01 complete.

2. **ADMIN-WORKSPACE-CLEANUP-00A - Legacy UI Removal and Smoke Proof**
   - Build a static import/route manifest before deletion; delete only files proven unreachable, including the legacy `AdminLayout` and legacy dashboard-widget candidates if the manifest remains clean.
   - Do not archive dead frontend code inside `src`; Git history is the archive. Do not delete the current unified workspace or its Bento tabs.
   - Run the full local server and a targeted admin smoke path after removal: login, dashboard, jobs, finance, settings, account, workbench, and corporate print.
   - Build/type-check first. Treat any missing chunk, route, permission, console error, or API error as a blocker.
   - **Entry gate:** SYSTEM-PERFORMANCE-01 complete.

3. **ADMIN-WORKSPACE-ROUTING-01 - Canonical Admin URLs and Naming**
   - Rename the active `design-concept.tsx` component to `AdminWorkspace.tsx`; behavior must remain unchanged during the rename.
   - Replace fragment-only admin navigation with canonical paths such as `/admin/dashboard`, `/admin/jobs`, `/admin/finance`, and `/admin/settings`.
   - Preserve direct links, browser back/forward, permissions, mobile navigation, query parameters, and tab preloading.
   - Redirect old `#tab` bookmarks and malformed legacy `/admin/...` paths safely to the canonical route; do not silently default a valid requested tab to Dashboard.
   - **Entry gate:** ADMIN-WORKSPACE-CLEANUP-00A complete.

4. **WORKFORCE-UX-01 - Mobile Attendance Reporting**
   - Keep Super Admin Shift Monitor focused on today's live duty state.
   - Add a clearly reachable, mobile-native Staff Attendance report with date/month selection, staff search, present/absent counts, attendance ratio, and per-person calendar/history.
   - Reuse the existing attendance records and permission model; do not create a second attendance owner or duplicate report data.

5. **FINANCE-UX-01 - Plain-Language Finance Workspace**
   - Simplify labels and group actions around money received, money to collect, money paid out, refunds, and cash drawer.
   - Preserve canonical POS/refund authority and permission boundaries; improve comprehension without adding a second financial workflow.

6. **TECHNICIAN-FLOW-01A - Smart Device Intake**
   - Fast mobile-first intake.
   - Server-backed repeat-customer lookup by name/phone with explicit selection and safe prefill.
   - Explain optional service area in plain language and make it skippable when unknown.
   - Device-history and warranty hints only after canonical device identity is available.
   - Duplicate warning and confirmation, never a blind automatic merge.
   - Clear progress feedback while lookup is running.

7. **TECHNICIAN-FLOW-01B - Next Best Work Queue**
   - Deterministic ordering by assignment, age, priority, SLA, and skill.
   - Explain why a job is recommended.

8. **CUSTOMER-REPAIR-STATUS-UX-01 - Warm Bilingual Repair Updates**
   - Present a customer-safe repair journey: received, diagnosing, repairing, final testing, ready, and returned.
   - Show a warm English/Bangla explanation, last-updated time, and safe next step; never expose internal workflow labels or raw technical notes.
   - Add delay/reassurance copy only from real configured thresholds or staff-set expectations, never invented delivery promises.
   - **Entry gate:** Canonical Testing/Ready lifecycle and corporate handover are complete locally. Start with `CUSTOMER-REPAIR-STATUS-UX-01A` in `docs/BOT.md`.

9. **JOB-DETAIL-360-01 - Complete Device and Customer Context**
   - Consistent desktop/mobile detail view.
   - Device identity, custody, accessories, media, repairs, final-test state, warranty, claims, billing, and safe customer history.
   - Mobile actions must have clear operational meaning: one primary next action; outside-part purchase, intake correction, and customer document live under contextual secondary actions with their own permissions.
   - **Entry gate:** DEVICE-IDENTITY-00A and CUSTOMER-REPAIR-STATUS-UX-01 complete.

10. **CUSTOMER-FEEDBACK-01 - Post-Service Feedback and Moderation**
   - After confirmed collection or delivery, request a rating, optional comment, and explicit consent for public display.
   - Store every response; allow Super Admin moderation, response, privacy redaction, and publish/hide control without silently changing customer ratings or wording.
   - Route low ratings to a service-recovery workflow. Public reviews must not expose customer contact details, address, job references, or private repair information.
   - **Entry gate:** CUSTOMER-REPAIR-STATUS-UX-01 complete and confirmed handover contract proven.

11. **AREA-INTELLIGENCE-UX-01 - Micro-Area Operations Map**
   - Replace guessed service-area polygon outlines with aggregated micro-area reference pins, such as Banani Block B and Banani Block C.
   - One pin represents an aggregate work cluster, never an exact customer address or a claim of a precise geographic boundary.
   - Color and label every pin with an explainable selected-period state: pending, unscheduled, overdue, busy, stable, or no recent work. Never rely on color alone.
   - Keep the ranked mobile list as the primary workflow; map selection and list selection must open the same safe aggregated micro-area detail view.
   - Require a data-quality audit and minimum aggregation/privacy rule before implementation. Do not expose individual customer locations, raw GPS coordinates, or small-group customer data.
   - **Entry gate:** DEVICE-IDENTITY-00A complete and service-area attribution audit approved.

12. **CUSTOMER-LOCATION-BOOKING-01 - Service Eligibility and Pickup Flow**
   - Join distance checking, repair booking, pickup, and drop-off into one mobile-first customer flow.
   - Pickup and drop-off are available only inside the approved Dhaka service geography. Outside it, disable those choices server-side and show a bilingual alternative using the configured hotline/contact: English: "Pickup and drop-off are currently available only within Dhaka Division. You can visit our service centre or call our hotline for details." Bangla: "à¦ªà¦¿à¦•à¦†à¦ª à¦“ à¦¡à§à¦°à¦ª-à¦…à¦« à¦¸à§‡à¦¬à¦¾ à¦¬à¦°à§à¦¤à¦®à¦¾à¦¨à§‡ à¦¶à§à¦§à§ à¦¢à¦¾à¦•à¦¾ à¦¬à¦¿à¦­à¦¾à¦—à§‡à¦° à¦®à¦§à§à¦¯à§‡ à¦‰à¦ªà¦²à¦¬à§à¦§à¥¤ à¦†à¦ªà¦¨à¦¿ à¦†à¦®à¦¾à¦¦à§‡à¦° à¦¸à¦¾à¦°à§à¦­à¦¿à¦¸ à¦¸à§‡à¦¨à§à¦Ÿà¦¾à¦°à§‡ à¦†à¦¸à¦¤à§‡ à¦ªà¦¾à¦°à§‡à¦¨ à¦…à¦¥à¦¬à¦¾ à¦¬à¦¿à¦¸à§à¦¤à¦¾à¦°à¦¿à¦¤ à¦œà¦¾à¦¨à¦¤à§‡ à¦¹à¦Ÿà¦²à¦¾à¦‡à¦¨à§‡ à¦•à¦² à¦•à¦°à¦¤à§‡ à¦ªà¦¾à¦°à§‡à¦¨à¥¤"
   - Location permission, reverse-geocoded area suggestion, manual address entry, pin adjustment, and confirmed address details must all remain optional fallbacks; no GPS or map failure may block a normal repair request.
   - Never trust a client-side eligibility flag. The server must validate the confirmed location/address at submission and return the same safe availability result.
   - **Inspector decision required before implementation:** confirm whether "Dhaka Division" means the full administrative division or the narrower Dhaka city/metro service envelope.
   - **Entry gate:** AREA-INTELLIGENCE-UX-01 data-quality audit approved.

## Completed Foundation Work

- **SYSTEM-UNIFICATION-00C-A/B/C:** Canonical retail quote, POS money ownership, NG customer decision workflow. Completed before 2026-07-16.
- **SERVICE-LIFECYCLE-R1 through R1H4-HOTFIX:** POS double-bill prevention, refund maker-checker, allocation and rollback integrity. Completed before 2026-07-16.
- **SERVICE-INTAKE-RELIABILITY-01A:** Audit. Completed 2026-07-16 18:22 Asia/Dhaka.
- **SERVICE-INTAKE-RELIABILITY-01B:** Atomic custody conversion and rollback proof. Completed 2026-07-16 18:59 Asia/Dhaka.
- **SERVICE-INTAKE-RELIABILITY-01C and HOTFIX-1/2:** Canonical intake, duplicate controls, HMAC fingerprint, phone normalization, rollback proof. Completed 2026-07-16 20:34 Asia/Dhaka. Signed chat webhook transport remains NOT VERIFIED.
- **SERVICE-INTAKE-RELIABILITY-01D:** Mutation guard implementation and initial HTTP/DB QA. Completed 2026-07-16 23:08 Asia/Dhaka. QA close remains required.
- **SERVICE-INTAKE-RELIABILITY-01D-QA-CLOSE:** Generic mutation guard closed. `paymentStatus` is protected and owned by POS/COD; 18 PASS / 0 FAIL / 1 NOT VERIFIED on local Express + PostgreSQL. Evidence: `mobile-qa/service-intake-reliability-01d-qa-close/20260716-233000/`. Evidence report time: 2026-07-16 23:23 Asia/Dhaka; consolidated handoff time: 2026-07-17 00:08 Asia/Dhaka. The signed WhatsApp/Messenger/AI webhook transport remains NOT VERIFIED, but was explicitly outside this QA-close gate.
- **SYSTEM-UNIFICATION-00C-B-COD-CLOSE (+ HOTFIX-1 + HOTFIX-2 + HOTFIX-2A):** COD collection is a narrow POS adapter calling `createPosSaleAtomic` â€” one atomic POS txn + allocation + petty + job payment projection, with idempotency. No direct petty/drawer/job/SR-payment writers. HOTFIX-1 added a derived read projection so admin/customer SR views show payment state from the canonical linked job/POS (raw `service_requests.payment_status` is never mutated by COD). COD invoice label uses safe SRV ticket / JOB-YYYY-NNNN ref (never raw sr.id); fails 409 `COD_NO_SAFE_REFERENCE` if none. Conflicting body/header idempotency keys rejected 409 `IDEMPOTENCY_KEY_CONFLICT` before any write. HOTFIX-2 split customer-safe projection from admin projection: customer routes return only the backward-compatible top-level `paymentStatus`; the `derivedPayment` debug object is admin-only. HOTFIX-2A hardened `applyCustomerSafePaymentState` to explicitly omit `derivedPayment` via destructuring (fail-closed against future callers passing pre-enriched objects). Anonymous public tracking returns only allowlisted fields. Cross-customer access denied (403/404) with no data leak. HOTFIX-1: 20 PASS. HOTFIX-2: 13 PASS. HOTFIX-2A: 11 PASS / 0 FAIL / 1 NOT VERIFIED (webhook transport) on local Express + PostgreSQL. Evidence: `mobile-qa/system-unification-00c-b-cod-close/20260717-003000/` + `mobile-qa/system-unification-00c-b-cod-close-hotfix-2/20260717-013000/` + `mobile-qa/system-unification-00c-b-cod-close-hotfix-2a/20260717-020000/`. Completion time: 2026-07-17 02:05 Asia/Dhaka. WhatsApp/Messenger/AI signed webhook transport remains NOT VERIFIED (historical residual, outside this gate). Next eligible phase: **SYSTEM-FOUNDATION-01A** (Security Boundary Repair).
- **SYSTEM-FOUNDATION-01A (Security Boundary Repair):** Replaced broad credentialed `*.vercel.app` CORS with an explicit allowlist (`server/utils/cors-config.ts`): exact origins only from prod canonical + `FRONTEND_URL` + `EXTRA_ALLOWED_ORIGINS`; no prefix/suffix wildcards; production fails closed if `FRONTEND_URL` missing or any origin contains `*`. CORS rejection no longer throws (returns `callback(null, false)`). Centralized error redaction via `server/utils/safe-error.ts`: `sanitizeErrorForResponse` strips stack/SQL/db-url/secrets in production 500s; preserves known safe statuses (400/401/403/404/409/410/422/429/451); `redactMessageForLog` strips stack fragments, `node:internal`, `postgresql://`, env secret names, `password:`/`token:`/`authorization:`/`cookie:`/`bearer ` from log lines. `error-handler.ts`, `index.ts` catch-all, `ai-logger.ts` (Groq context), `ai-error-handler.ts` (DB storage + Groq), and `route-error.ts` all use the central redaction path. Request bodies never logged. Rate-limit audit: all 10 limiters use `express-rate-limit` v8 default `MemoryStore` (process-local); no Redis/shared store configured; `trust proxy=1` + default IP keyGenerator means `X-Forwarded-For` spoof sets `req.ip` to first hop (becomes key) â€” distinct IPs have distinct counters; `REDIS_URL` is read only by `cache.ts` and `sse-broker.ts`, never by rate-limit.ts. 19 PASS / 0 FAIL / 1 NOT VERIFIED (multi-instance distributed rate limiting â€” honest limitation: process-local MemoryStore, NOT VERIFIED for multi-Render-instance enforcement) on local Express + PostgreSQL. Evidence: `mobile-qa/system-foundation-01a/20260717-021757/`. Completion time: 2026-07-17 02:35 Asia/Dhaka. Next eligible phase: **SYSTEM-FOUNDATION-01B** (Migration and Startup Reliability).
- **SYSTEM-FOUNDATION-01A-SUPPLY-CHAIN-01A (Runtime Dependency Reachability and Safe Remediation):** Reachability-first remediation of `npm audit --omit=dev` advisories. Updated `multer` 2.1.1â†’2.2.0 (fixes GHSA-72gw-mp4g-v24j DoS via deeply nested field names + GHSA-3p4h-7m6x-2hcm incomplete cleanup of aborted uploads). Added npm `overrides` for 6 transitive packages: `websocket-driver` 0.7.4â†’0.7.5 (critical: message compression/corruption), `form-data` 4.0.5â†’4.0.6 (high: CRLF injection), `@grpc/grpc-js` 1.14.3â†’1.14.4 (high: malformed request/compressed message crash), `dompurify` 3.4.7â†’3.4.12 (moderate: DOMPurify bypasses), `js-yaml` 4.1.1â†’4.3.0 (moderate: DoS in merge key handling), `protobufjs` 7.6.1â†’7.6.5 (moderate: schema-derived name shadowing). All overrides are patch or minor bumps within the same major. No `npm audit fix`, no `--force`, no major upgrades. Audit: 21â†’14 vulnerabilities (1 criticalâ†’0, 6 highâ†’3, 14 moderateâ†’11). 7 fixed. 14 residual classified: `xlsx` (high, no fix on npm, needs parser replacement â€” SUPPLY-CHAIN-01B), `drizzle-orm` (high, major upgrade 0.45.2 deferred â€” dedicated migration phase), `nodemailer` (high, advisory unreachable â€” mailer.ts never uses raw option), `uuid` chain (moderate, v3/v5/v6 with buf only, transitive deps use v4 â€” accepted with mitigation), `firebase-admin`/`@google-cloud/firestore`/`google-gax`/`@google-cloud/storage` (moderate, major upgrade firebase-admin 14.2.0 deferred â€” dedicated migration phase), `@capgo/capacitor-native-biometric` (moderate, mobile client only â€” accepted with mitigation), `exceljs`/`gaxios`/`teeny-request`/`retry-request`/`imagekit` (moderate, uuid-transitive â€” accepted with mitigation). Corporate upload protection audit: `corporate-portal.routes.ts` has 10MB limit + MIME filter; `corporate.routes.ts` has NO limits or fileFilter (pre-existing gap, documented as residual â€” scope constraint prevents route changes this phase). `exceljs@4.4.0` identified as safe replacement for `xlsx@0.18.5` â€” needs focused upload compatibility tests (SUPPLY-CHAIN-01B). 12 PASS / 0 FAIL / 6 NOT VERIFIED on local Express + PostgreSQL. Evidence: `mobile-qa/system-foundation-01a-supply-chain-01a/20260717-030616/`. Completion time: 2026-07-17 03:21 Asia/Dhaka. Next eligible phase: **SYSTEM-FOUNDATION-01A-SUPPLY-CHAIN-01B** (XLSX Parser Replacement and Upload Hardening).

## Current Foundation Findings

- **Production dependency exposure:** `npm audit --omit=dev` after SUPPLY-CHAIN-01B: 13 residual advisories (11 moderate, 2 high, 0 critical). Fixed: multer (DoS), websocket-driver (critical), form-data (CRLF), @grpc/grpc-js (crash), dompurify (bypass), js-yaml (DoS), protobufjs (shadow), xlsx (Prototype Pollution + ReDoS â€” parser replaced with exceljs). Residuals: `drizzle-orm` (high, major upgrade deferred â€” dedicated migration phase), `nodemailer` (high, unreachable â€” accepted), `uuid` chain (moderate, v3/v5/v6 only â€” accepted), `firebase-admin` chain (moderate, major upgrade deferred â€” dedicated migration phase), `@capgo/capacitor-native-biometric` (moderate, mobile-only â€” accepted), `exceljs`/`gaxios`/`teeny-request`/`retry-request`/`imagekit` (moderate, uuid-transitive â€” accepted).
- **Corporate upload hardening:** `corporate.routes.ts` and `corporate-portal.routes.ts` both have safe upload wrappers with 10MB file size limit, 1 file max, bounded multipart fields/parts, ZIP magic bytes validation for XLSX/DOCX/PPTX, zero-byte file rejection, and safe JSON error responses. Resolved by SUPPLY-CHAIN-01B.
- **Pre-existing `createJobTicketsBulk` bug:** RESOLVED by SUPPLY-CHAIN-01B-CLOSE. `server/repositories/job.repository.ts:287` now wraps insert in `db.transaction()` and calls `getNextJobNumber()` inside the transaction to allocate sequential `JOB-YYYY-NNNN` IDs atomically. Single-job creation in `corporate-portal.routes.ts:301` also fixed.
- Whole-table reads still exist for several service-request, job, analytics, and mobile work-queue paths.
- Startup migrations are currently concurrent background work after the server accepts traffic.
- Recurring backup, reminder, abandonment, day-close, and nightly tasks use process-local timers or flags. They can run more than once after horizontal scaling; SYSTEM-FOUNDATION-01C owns a distributed execution contract.
- The unauthenticated `/health` response currently returns an excerpt of the last database error. SYSTEM-FOUNDATION-01C must return a safe health state only.
- ~~Credentialed CORS accepts any Vercel subdomain and must be narrowed.~~ **Resolved by SYSTEM-FOUNDATION-01A.**
- Global error response redaction was resolved by SYSTEM-FOUNDATION-01A, but source audit still found raw error/phone logging and public health error-detail exposure. SYSTEM-FOUNDATION-01C owns the remaining log-hygiene repair.
- The worktree is large and dirty. Create a reviewed checkpoint before any production deployment.
- **Rate-limit multi-instance limitation:** All limiters use process-local MemoryStore. Multi-Render-instance deployments have per-instance counters, NOT a global limit. No Redis/shared store configured. Documented honestly as NOT VERIFIED.
- **Local runtime residual (2026-07-18):** Core server readiness is healthy on `http://127.0.0.1:5083`, but optional startup work exposed two local-only failures: commission-rule seeding cannot find `commission_rules`, and Brain/KG startup is pointed at an invalid local Brain URL and cannot create/read its conversation tables. Neither blocks MAIN schema readiness or public API responses. Audit and repair these owners before any local Brain or commission feature QA; do not hide them by weakening readiness.
- **Release follow-up:** `ServiceRequestsTab` still submits status, tracking status, and payment status through generic PATCH. The protected backend correctly returns 409. Replace those controls with their canonical workflow/POS actions before the next UI release; do not weaken the guard. (Note: the admin/customer read-side now shows a derived payment projection from the canonical job/POS, so the Paid/Due badge is correct even though the raw `service_requests.payment_status` is not mutated by COD â€” see HOTFIX-1.)
- **Money-authority follow-up:** Canonical money ownership is resolved by SYSTEM-UNIFICATION-00C-B-COD-CLOSE (+ HOTFIX-1). COD collection uses the canonical POS path (`createPosSaleAtomic`) and never writes petty cash, drawer cash, or `service_requests.paymentStatus` directly. Customer projection privacy remains active under HOTFIX-2.
