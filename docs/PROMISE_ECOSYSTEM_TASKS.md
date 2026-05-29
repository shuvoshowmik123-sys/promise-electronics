# Promise Electronics — Ecosystem Tasks

> Companion to [`PROMISE_ECOSYSTEM_PLAN.md`](./PROMISE_ECOSYSTEM_PLAN.md)
> Drafted: 2026-05-28
> Localhost only until each phase is signed off.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

---

## Phase A — Client class foundation (keystone)

- [ ] **A1.** Add `client_class` enum to `shared/schema.ts` with values `online | repeat | reference | technician | b2b_normal | b2b_corporate`.
- [ ] **A2.** Add `client_class_policy` table (defaults per class — SLA, priority, payment, credit, AI tone, bill layers).
- [ ] **A3.** Add `client_class` column to `customers` and `brain_sessions` tables. Default `online`.
- [ ] **A4.** Seed `client_class_policy` rows from the table in plan §1.2.
- [ ] **A5.** Backfill script: walk existing customers + job history, infer class:
  - linked to a corporate client row → `b2b_corporate` (MME) or `b2b_normal` (default for any other linked corporate; admin can re-classify later)
  - `total_jobs >= 2` and not linked to corporate → `repeat`
  - rest → `online`
  - Technician class is **not auto-inferred** — staff marks `technician` from inbox/job UI when they recognise one. New "Mark as technician" button on session + job ticket.
- [ ] **A6.** Wire admin UI badge: every session, job card, customer row shows class badge.
- [ ] **A7.** Spot-check 50 random customers — class is right.

Sign-off gate: data audit + spot check pass.

---

## Phase B — Central inbox auto-assign

- [ ] **B1.** Create `staff_presence` table: `staff_id, status, last_seen_at, channels[]`.
- [ ] **B2.** Frontend heartbeat: ping `/api/staff/presence` every 30s while admin tab focused. Mark `away` after 2 min idle, `offline` after 10 min.
- [ ] **B3.** Assignment service `server/services/assignment.service.ts`:
  - Implement algorithm from plan §2.2 (owner → repeat-history → round-robin → AI fallback).
  - Capacity cap (open sessions per staff) configurable.
- [ ] **B4.** Wire assignment service into `whatsapp.routes.ts` and `messenger.routes.ts` inbound handlers.
- [ ] **B5.** Holding-message template (Bangla) when no staff online — send via AI service.
- [ ] **B6.** Visibility filter in `brain.routes.ts` session list: staff sees own + unclaimed; admin sees all.
- [ ] **B7.** Re-assignment endpoint + UI button. Transfers ownership, original loses access.
- [ ] **B8.** Owner-offline-too-long watchdog: cron job re-routes if owner offline >5 min on an open thread.
- [ ] **B9.** 48h shadow run: log assignments without actually routing, compare to manual claims.

Sign-off gate: shadow run shows >90% correct auto-assignment.

---

## Phase C — Credential binding

- [ ] **C1.** Migrate to canonical `customers` table per plan §3. Phone is primary key.
- [ ] **C2.** Phone-match service: on inbound message, hit `customers` by `primary_phone` or `alt_phones`.
- [ ] **C3.** Soft-match suggester: when no phone but name+area resembles known customer, surface in inbox (don't auto-bind).
- [ ] **C4.** Backfill prior sessions: link all unbound sessions on a phone to the customer row when first job is created.
- [ ] **C5.** AI prompt injection in `ai.service.ts`: when `class ∈ (repeat, reference)`, prepend `KNOWN CUSTOMER` block (name, prior jobs, last TV, preferences, referrer).
- [ ] **C6.** Reference customer creation flow: admin-side dialog to mark a customer as `reference` and link `referrer_customer_id`.

Sign-off gate: 20 spot-checked sessions show correct binding + history injection.

---

## Phase C.5 — Universal job-ticket entry (Single / Bulk / Multi-part)

Lives between C and D because every later phase reads its schema.

- [ ] **C5.1.** Add `job_batches` table (`id, customer_id, intake_date, receiver, notes`). Existing `job_tickets` gets nullable `batch_id` FK.
- [ ] **C5.2.** Add `missing_parts` jsonb column to `job_tickets` (incomplete-TV capture — array of strings/enum).
- [ ] **C5.3.** Add `parts_lineitems` jsonb column to `job_tickets` (Mode 3 — per-part charge with `source: ours | local_purchase | customer_supplied`).
- [ ] **C5.4.** Refactor existing `CreateJobDrawer` to support mode switcher: Single | Bulk | Multi-part.
- [ ] **C5.5.** **Bulk mode UI**: spreadsheet grid, CSV/Excel paste-import, barcode scanner row-add, per-row photo upload.
- [ ] **C5.6.** **Multi-part mode UI**: form with "Add Part" repeater. Each part: name, qty, charge, source flag, notes. Customer-supplied parts show no-charge badge.
- [ ] **C5.7.** Class-aware required fields:
  - `technician` → address required, missing_parts visible
  - `b2b_corporate` → serial number required, model match enforced
  - `b2b_normal` → mixed scope allowed on one ticket (TV + parts + assembly all one bill)
- [ ] **C5.8.** Re-use existing `ChallanInWizard` for B2B bulk intake — wire it to write `job_batches` + child `job_tickets`. Audit existing wizard first per preserve-existing rule.
- [ ] **C5.9.** Surface all three modes from inbox quick-action ("Create job from this chat") with mode picker.

Sign-off gate: each mode tested end-to-end across all 6 client classes (12+ flows).

## Phase D — B2B admin panel fix

- [ ] **D1.** Reproduce the error the user reported. Capture exact message, stack trace, network response, browser console.
- [ ] **D2.** Document repro steps in `docs/b2b-panel-bug-repro.md`.
- [ ] **D3.** Apply minimal patch for the reported bug.
- [ ] **D4.** Fix the `useQuery({ enabled: !selectedClientId })` mistake on line 69–73 of `CorporateRepairsTab.tsx` — clients list should always be available for re-selection.
- [ ] **D5.** Wrap `CorporateRepairsTab` in `<CorporateErrorBoundary>` so a throw doesn't take down the whole admin shell.
- [ ] **D6.** Consolidate dialog state: replace per-dialog `useState` flags with single `activeDialog` discriminated union.
- [ ] **D7.** Smoke test in `tests/admin-routes-smoke.test.ts` covers the failing path.
- [ ] **D8.** Verify all corporate routes in `server/routes/corporate.routes.ts` return consistent error shapes — frontend `toast` calls assume `{ message }`.

Sign-off gate: smoke test green + manual UAT on previously-failing flow.

---

## Phase E — Outside parts purchase UI

- [ ] **E1.** Add "Add Outside Purchase" button on job ticket card (`JobDetailsSheet`, `JobTicketsTab`).
- [ ] **E2.** Build `LocalPurchaseDialog` component: part name, supplier, cost, selling price, receipt photo (required), quantity. `purchasedBy` auto-filled from session user.
- [ ] **E3.** Server endpoint already exists via `inventory.service.ts:createLocalPurchase` — wire the new dialog to it.
- [ ] **E4.** Per-job purchase ledger panel on job details sheet: list rows from `local_purchases` for that job with who/when/receipt thumbnail.
- [ ] **E5.** Inbox quick-action: when AI brain detects "out of stock" intent, surface "Log outside purchase" button next to the chat thread.
- [ ] **E6.** Daily outside-purchase report (admin view): total spend, by staff, by supplier, receipt audit trail.
- [ ] **E7.** Block job-close (status transition to `Completed`) if any `local_purchases` row has `status != 'Consumed'` or `receiptImageUrl` is null. Clean books rule.
- [ ] **E8.** Add `outside_purchase_logged` event to notifications stream — admin gets pinged on every new purchase >৫০০০ for fraud check.

Sign-off gate: 1-week audit shows every outside purchase has receipt + staff name.

---

## Phase F — Corporate portal merge into central ecosystem

- [ ] **F1.** Audit `client/src/pages/corporate/*` — list every API call, compare against admin-side equivalents. Identify divergences.
- [ ] **F2.** Two-way sync: every job created/updated in admin B2B panel triggers refresh in `corporate/job-tracker.tsx`.
- [ ] **F3.** Unify notifications: deprecate `corporate-notifications.routes.ts` parallel stream, route through the single `notifications` channel with `audience: 'corporate'` filter.
- [ ] **F4.** Corporate service requests land in central inbox (Messenger/WhatsApp queue) tagged `source: 'corporate_portal'`.
- [ ] **F5.** Hook `CorporateBrandingHeader.tsx` to `customer.branding_config` JSONB so each corporate client gets per-tenant branding.
- [ ] **F6.** Bill visibility: every bill for B2B customer surfaces in their portal with breakdown if `billing_profile.bill_breakdown_allowed = true`.
- [ ] **F7.** Self-serve bill split request: customer can request "split this bill into N invoices" from portal → admin gets approval notification.
- [ ] **F8.** Decision: corporate auth — keep `corporate-auth.routes.ts` JWT or unify with admin session? (Open question, needs user input.)

Sign-off gate: corporate client (MME) UAT signs off.

---

## Phase G — B2B billing engine (both tiers)

### G.audit — preserve existing first

- [ ] **G0.1.** Map every existing module under `server/routes/corporate*.ts`, `server/services/corporate.service.ts`, `client/src/components/admin/corporate/*`. Catalogue what works, what's broken, what's missing.
- [ ] **G0.2.** Catalogue the "1000-foot / thousand-foot" logic the user referenced. Confirm with user which module(s) — record findings inline in this task.
- [ ] **G0.3.** Decide per-feature: patch-in-place vs net-new. No rewrites without explicit sign-off.

### G.normal — `b2b_normal` (simple)

- [ ] **G1.** Add `billing_profile` table per plan §5.1 (with `tier` discriminator).
- [ ] **G2.** Admin UI to create/edit billing profile per B2B customer. Tier-aware (normal vs corporate shows different fields).
- [ ] **G3.** Normal-tier job lifecycle: `intake → diagnose → repair → bill → return`. Allow mixed scope (full TVs + parts + assembly) on one ticket.
- [ ] **G4.** Simple invoice generator for normal tier — single bill, ৳500–1500 expected range, range warning if outside.
- [ ] **G5.** Normal-tier inventory rule: skip stock-level tracking; `local_purchases` audit trail still mandatory (Phase E enforces).

### G.corporate — `b2b_corporate` (scatter-billing)

- [ ] **G6.** Corporate-tier job lifecycle states: `intake → diagnose → quote-by-phone → approval-logged → repair → qa → bill → (optional scatter) → return`.
- [ ] **G7.** `quote_log` table: who called, who approved, verbal amount, date, voice note attachment optional.
- [ ] **G8.** `bills` + `bill_line_items` schema per plan §5.4 (with `superseded_by_bill_ids`, `moved_from_bill_id`).
- [ ] **G9.** `bill_edit_log` table — every create/edit/delete/scatter/merge action logged with before/after JSON, user, timestamp, reason. Corporate dispute protection.
- [ ] **G10.** **Scatter-bill UI**: open original bill → "Scatter into N new bills" → drag/assign TV line items across new bills → original marked superseded → audit log entry → new bills issued with PDF.
- [ ] **G11.** Editable invoice criteria (`invoice_criteria_json`) admin UI per corporate customer.
- [ ] **G12.** Customer-owned spare inventory: add `owner_customer_id` to `parts_inventory`. UI distinguishes "ours" vs "client-owned". Corporate tier only.
- [ ] **G13.** QA-against-criteria gate at job-complete (corporate tier only):
  - `perfect_only` → must pass 100% QA checklist
  - `partial_ok` → allow partial fix with note
  - `per_unit_decision` → admin approval per TV
- [ ] **G14.** Monthly reconciliation report: parts consumed per corporate customer, parts returned unused, balance.
- [ ] **G15.** Per-client invoice template selector (PDF generator picks template by `invoice_template_id`).

### G.shared

- [ ] **G16.** SLA cron: nightly walk open B2B jobs (both tiers), yellow alert at `sla_days - 2`, red alert at `sla_days`, per-policy action.

Sign-off gate: MME pilot (corporate) + one normal-company pilot — one full month, clean reconciliation, clean bill audit log.

---

## Phase H — AI brain class-aware prompts

- [ ] **H1.** Add prompt variants to `server/services/ai.service.ts` per plan §9:
  - `DAKTAR_VAI_WARM` (repeat)
  - `DAKTAR_VAI_REFERRAL` (reference)
  - `DAKTAR_VAI_TECH` (technician)
  - `DAKTAR_VAI_FORMAL` (corporate)
  - `DAKTAR_VAI_B2B_PLANT` (b2b_plant)
- [ ] **H2.** Selector function `selectPromptVariant(session.client_class)` with fallback to default.
- [ ] **H3.** Inject class-specific context (history, billing profile summary, SLA countdown).
- [ ] **H4.** A/B test: 50% of traffic on new variants vs current single prompt. Track reply quality + handoff rate.
- [ ] **H5.** Move all six variants to DB-stored prompts so they can be edited without redeploy (later optimization).

Sign-off gate: A/B test shows non-worse quality, qualitative review approves tone match per class.

---

## Phase I — Acceptance ratio + load distribution

- [ ] **I1.** Background job: nightly compute `staff_acceptance_ratio = converted_jobs / claimed_sessions` over rolling 30 days.
- [ ] **I2.** Store in `staff_metrics` table.
- [ ] **I3.** Round-robin in assignment service weights staff by inverse ratio (higher converter → more priority).
- [ ] **I4.** Admin dashboard widget: per-staff acceptance ratio leaderboard.
- [ ] **I5.** Configurable capacity cap per staff role.
- [ ] **I6.** Manual override: admin can pin a session to a specific staff regardless of ratio/load.

Sign-off gate: 30 days of data first, then weighted assignment goes live.

---

## Cross-cutting tasks (any phase)

- [ ] **X1.** Update [`docs/SYSTEM_COMPREHENSIVE_DOCUMENTATION.md`](./SYSTEM_COMPREHENSIVE_DOCUMENTATION.md) as each phase ships.
- [ ] **X2.** ADR entries in `docs/adr/` for major decisions: client class enum, customer canonicalization, billing profile design.
- [ ] **X3.** Add `client_class` to admin search/filter UI everywhere a customer list appears.
- [ ] **X4.** Telemetry: log every auto-assignment decision with reason code (`owner`, `repeat-history`, `round-robin`, `ai-fallback`) for future analysis.
- [ ] **X5.** Keep AI **NEVER quotes prices** rule active across all class variants (existing security policy).
- [ ] **X6.** Phone number `01886662811` only — `01673999995` must stay out of every AI prompt, seed, and template (existing security policy).

---

## Open decisions blocking start

Update inline as the user answers. Phase A starts only after **Q1** and **Q2** are answered.

1. ~~Q1 — Technician phone list~~ **Resolved.** No seed CSV. Staff marks technician class from inbox/job UI manually. Identity = address mandatory + name (own/shop) + optional phone. Auto-infer NOT used for this class.
2. **Q2 (Phase A blocker)** — B2B roster: explicit list of which existing corporate clients map to `b2b_normal` vs `b2b_corporate`. MME = `b2b_corporate` confirmed. Backfill default = `b2b_normal` for the rest, re-classifiable.
3. ~~Q3 — Scatter-billing mode~~ **Resolved.** Reactive (locked in plan §5.1).
4. ~~Q4 — Normal-tier inventory~~ **Resolved.** No stock tracking, `local_purchases` audit stays.
5. **Q5 (Phase B blocker)** — Capacity cap default: 5? 10? per role?
6. **Q6 (Phase F blocker)** — Corporate portal auth: keep JWT or unify with admin session?
7. **Q7 (Phase G blocker)** — Which existing module is the "1000-foot / thousand-foot" logic? User to point at file/folder name so G0.2 audit can start.

---

## Phase tracking

| Phase | Status | Started | Done | Notes |
|-------|--------|---------|------|-------|
| A     | ready  | –       | –    | unblocked; needs Q2 B2B roster (can default to `b2b_normal` and re-classify) |
| B     | not started | –  | –    | depends on A |
| C     | not started | –  | –    | depends on A |
| C.5   | not started | –  | –    | depends on C; universal 3-mode job ticket |
| D     | not started | –  | –    | independent — can run in parallel |
| E     | not started | –  | –    | independent — can run in parallel |
| F     | not started | –  | –    | depends on A, C |
| G     | not started | –  | –    | depends on A, C.5; **G0 audit first** (Q7) |
| H     | not started | –  | –    | depends on A, C |
| I     | not started | –  | –    | depends on B, 30d data |
