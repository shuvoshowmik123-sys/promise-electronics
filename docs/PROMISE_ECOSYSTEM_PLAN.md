# Promise Electronics — Ecosystem Plan

> Owner: Shadman Shuvo
> Drafted: 2026-05-28
> Status: Pre-build. Localhost only until each phase signs off.
> Companion file: [`PROMISE_ECOSYSTEM_TASKS.md`](./PROMISE_ECOSYSTEM_TASKS.md)

---

## 0. Why this plan exists

The current system treats every client the same. Reality has at least **four distinct client classes**, each with different SLA, billing rule, payment behaviour, priority, and quotation flow:

1. **Online customer** (Messenger/WhatsApp walk-in, no record yet)
2. **Repeat / Reference customer** (credential-bound, history-aware)
3. **Technician** (notorious, low priority, instant cash, no credit)
4. **B2B** — split into two sub-classes:
   - **Normal company** (`b2b_normal`) — mixed scope (full TVs, parts repair, assembly/fitting), consistent simple billing, ৳500–1500 range, no inventory tracked.
   - **Corporate company** (`b2b_corporate`, e.g. MME) — zero-tolerance documentation, **scatter-billing** (bill #27's 10 TVs split across bills #28/29/30 on request, #27 effectively vanishes), per-TV serial + model match, customer-owned spare parts, editable billing criteria per admin, hard 1-week SLA.

This document is the single source of truth for how the **central inbox**, **job board**, **billing engine**, **inventory**, and **AI brain** must read client class and behave accordingly.

It also bundles four urgent fixes the user flagged:
- Outside parts purchase (with auditor name) must be a first-class flow surfaced from inbox & job ticket.
- The existing **B2B admin panel** (`CorporateRepairsTab`, `CorporateBillsTable`, etc.) has a live error to find and fix.
- The existing **corporate client portal** (`client/src/pages/corporate/*`) needs an audit to merge into the larger ecosystem instead of staying a side island.
- **"1000-foot" / B2B corporate internal logic already exists, half-built.** Preserve it. Audit + patch wiring. **No rewrite from scratch.** Anything that already half-works gets fixed in place; only missing pieces are net-new.

---

## 1. Architecture — the keystone primitive

### 1.1 `client_class` enum

Add to `shared/schema.ts`. Every downstream module reads this field.

```ts
export const clientClassEnum = pgEnum('client_class', [
  'online',         // anonymous WA/Messenger walk-in, no customer record yet
  'repeat',         // known customer, credential bound (phone/name/addr)
  'reference',      // friends-of-friends, repeat + referrer field
  'technician',     // notorious, low priority, instant cash only
  'b2b_normal',     // normal company, simple consistent billing, ৳500-1500
  'b2b_corporate',  // corporate (MME-style), scatter-billing, serial match, customer-owned spares
]);
```

### 1.2 `client_class_policy` table

Defaults per class, not hardcoded so we can tune without redeploy.

| Class           | SLA          | Priority | Payment       | Credit | AI Tone           | Billing                                |
|-----------------|--------------|----------|---------------|--------|-------------------|----------------------------------------|
| `online`        | same-day reply | normal | mixed         | no     | warm              | simple                                 |
| `repeat`        | same-day     | high     | mixed         | maybe  | warm + history    | simple                                 |
| `reference`     | same-day     | high     | mixed         | yes    | extra-warm        | simple                                 |
| `technician`    | +2–7 days    | low      | cash only     | no     | curt, factual     | simple                                 |
| `b2b_normal`    | 1 week       | normal   | invoice       | yes    | formal            | consistent simple invoice, ৳500–1500  |
| `b2b_corporate` | 1 week hard  | high     | invoice       | yes    | formal            | scatter-bill, editable criteria, multi-layer |

### 1.3 Modules that must read class

- **Inbox** — sort order, visibility, AI tone selector
- **Job board** — priority, SLA timer, default technician
- **Billing** — template, layer count, breakdown/merge rules
- **Inventory** — customer-owned spares (B2B plant only)
- **AI brain** — system prompt variant + history injection
- **Notifications** — escalation rules

---

## 2. Central Inbox — "never make client wait"

Core principle: **availability-based auto-assignment**, not AI smartness. AI is the safety net.

### 2.1 Staff presence model

```ts
staff_presence:
  staff_id        -- FK to users
  status          -- 'online' | 'away' | 'offline'
  last_seen_at
  channels        -- ['messenger', 'whatsapp']
```

Heartbeat from admin frontend every 30s while tab focused. `away` after 2 min idle, `offline` after 10 min.

### 2.2 Assignment algorithm (no AI, deterministic)

Runs per incoming message:

```
1. Session has owner?
   yes → route to owner
         if owner offline >5 min → re-route to next online staff
   no  → step 2

2. Session.client_class is 'repeat' or 'reference'?
   yes → assign to last-known-good staff for this customer
         (if that staff is offline, fall through to step 3)

3. Round-robin across staff where status='online'
   ↳ skip staff at capacity (>N open sessions)

4. NO staff online anywhere?
   → AI sends gentle holding reply:
     "ভাই, এই মুহূর্তে আমরা একটু ব্যস্ত। কয়েক মিনিটে রিপ্লাই করছি। 🙏"
   → Mark session 'unclaimed', queue for first online staff
```

### 2.3 Visibility rule

- **Staff** sees: own claimed sessions + all `unclaimed` queue.
- **Admin** sees: everything, with assignment metadata.
- **Re-assignment** transfers ownership; original loses access (keeps inbox clean — matches user's earlier preference).

### 2.4 Acceptance ratio (load distribution)

Per-staff metric: `converted_jobs / claimed_sessions` over 30-day window. Sort staff in round-robin by inverse ratio so higher-converters get priority assignment.

---

## 3. Credential binding (repeat & reference)

Phone is the primary key. One canonical customer row per phone.

```ts
customers:
  id                          uuid
  primary_phone               text unique  -- canonical
  alt_phones                  text[]
  name, address, area
  gmail                       text null    -- future
  client_class                client_class
  referrer_customer_id        uuid null    -- for 'reference'
  first_seen_at, last_job_at
  total_jobs                  int
  total_spend                 numeric
  notes                       text         -- internal flags
```

### 3.1 Binding flow on inbound message

1. Match by phone → bind session → mark `repeat`.
2. If no phone yet but name+area looks familiar → suggest match to staff (don't auto-bind, risk of mis-bind).
3. On job-create from chat → backfill customer record + link all prior unbound sessions on that phone.

### 3.2 AI prompt injection

When `class ∈ (repeat, reference)`, inject into system prompt:

```
KNOWN CUSTOMER: Rahim Uddin, 12 prior jobs.
Last TV: Samsung UA43CU7700 — replaced backlight 2026-03.
Preferences: home service, cash payment, Mirpur-10.
Referred by: Ahmed Khan (5 prior jobs).
```

This is the "hassle-free + recommendation" experience the user described.

---

## 4. Technician class — guardrail layer

### 4.1 Identity (no seed list needed)

No CSV roster exists. Technician customer record minimum fields:

```ts
customers (technician variant):
  display_name        text         -- own name OR shop name
  is_shop_name        boolean      -- true if display_name is the shop
  primary_phone       text null    -- optional, often missing
  address             text         -- MANDATORY — main identifier when phone absent
  area                text
  client_class        'technician'
  notes               text         -- past pain points, "no motherboard arrivals", etc.
```

Bind logic on inbound message:
- Match by phone if present.
- Else address-fuzzy-match (street+area) — surface candidate to staff, don't auto-bind.
- New tech walk-in → staff manually marks `client_class = technician` on first job.

### 4.2 Flag on bind

When session class resolves to `technician`, inbox shows red badge:
> ⚠ TECHNICIAN — verify scope + parts before commit.

### 4.3 Job creation rules

- Default SLA: `+3 days` over normal.
- Payment field locked to **cash on completion** (block credit option).
- Mandatory pre-acceptance note field: *"What other tech tried."*
- Address-required on intake (override the optional-address default).
- **Incomplete-TV capture**: a `missing_parts` field on job ticket. Multi-select common items (motherboard, panel, T-Con, power board, remote, base, screws, back cover). Free-text "other" allowed. Goes onto the challan-in receipt so we have proof of delivered condition.
- Lower position in job board sort.
- Service charge multiplier configurable per technician.

### 4.4 AI prompt for technician sessions

Short, factual, no warmth. No specific repair advice (don't give away diagnosis for free). Reply pattern: *"Bring it to shop. We'll diagnose and quote."*

---

## 4.5 Universal job-ticket entry modes (applies to ALL classes)

Three intake modes must be available from every entry point (inbox quick-action, job board, B2B challan-in wizard, technician walk-in, corporate portal request). The mode is chosen by the operator; the underlying schema is the same.

### Mode 1 — Single (current)
One TV, one issue, one ticket. Existing flow stays untouched.

### Mode 2 — Bulk (new)
N TVs in one batch, one customer. Common for B2B both tiers and large technician deliveries.

```
Job batch:
  batch_id, customer_id, class, intake_date, receiver, batch_notes
  → child job_tickets[1..N]
       each: device_model, serial, missing_parts[], reported_defect, initial_status (OK/NG)
```

UI: spreadsheet-like grid, paste/import from CSV/Excel, scan barcode to add row, photo-per-row.

### Mode 3 — One job, multiple parts (new)
One TV, itemized parts list. Common for corporate where every part has its own line item and price.

```
job_ticket:
  device_model, serial, ...
  parts_lineitems[]:
      - part_name, qty, charge_amount, source ('ours' | 'local_purchase' | 'customer_supplied')
      - notes
```

UI: ticket form with "Add Part" repeater. Each part can flag as **customer-supplied** (no charge, but tracked) — critical for corporate `supplies_spare_parts` flow and for technicians delivering incomplete TVs.

### Cross-mode requirements

- All three modes accept the `missing_parts` field (incomplete-TV capture).
- All three feed into the same `job_tickets` table — Mode 2 also writes a `job_batches` parent row.
- `local_purchases` (Phase E) attachable from any mode.
- `client_class`-aware UI: required fields shift per class (e.g. address mandatory for technician, serial mandatory for `b2b_corporate`).

## 5. B2B billing engine — Normal vs Corporate

Two distinct flows. Both use the same `billing_profile` table but with different field values + UI surfaces.

### 5.1 `billing_profile` table (per B2B customer)

```ts
billing_profile:
  customer_id                 uuid
  tier                        enum: 'normal' | 'corporate'

  -- Corporate-only fields ----------------------------------------
  scatter_billing_enabled     boolean     -- default false; true for MME-style
  scatter_billing_mode        enum:
    'reactive'                -- generate normal bill, scatter only on request
    'proactive'               -- always pre-split on generation
  requires_serial_match       boolean     -- per-TV serial verification
  requires_model_match        boolean
  supplies_spare_parts        boolean     -- customer sends backup panels
  spare_part_handling         enum:
    'use_if_needed'
    'return_unused'
    'consume_all'
  acceptance_criteria         enum:
    'perfect_only'
    'partial_ok'
    'per_unit_decision'
  invoice_criteria_json       jsonb       -- editable per-admin rules (corporate only)

  -- Shared fields ------------------------------------------------
  sla_days                    int         -- default 7
  sla_breach_action           enum:
    'auto_return' | 'notify_and_extend' | 'auto_escalate'
  invoice_template_id         text
  quote_channel               enum:
    'phone_verbal' | 'written_required'
  default_amount_range        int4range   -- normal: [500, 1500], corporate: null
```

### 5.2 Normal B2B (`b2b_normal`) — simple flow

```
intake → diagnose → repair → bill (single invoice, ৳500–1500 typical) → return
```

- One invoice per service.
- No inventory tracking for parts (parts sourced ad-hoc as `local_purchases` if needed — audit trail kept, stock not tracked).
- Mixed scope OK on one job ticket: "full TV repair + panel swap + assembly fitting" all on one bill.
- Quote-by-phone OK; less paperwork than corporate.

### 5.3 Corporate B2B (`b2b_corporate`) — scatter-billing flow

```
intake (challan-in)
  → diagnose
  → quote-by-phone (logged as call entry)
  → approval-logged (who called, who approved, date, amount)
  → repair
  → QA against acceptance_criteria
       partial_ok    → partial-accept → bill what was actually fixed
       perfect_only  → reject if not 100% → return
  → bill generation (single bill, per-TV serial line items)
  → optional scatter request (reactive mode):
       customer phones: "split bill 27 across 28, 29, 30, vanish 27"
       admin opens scatter UI: drag 10 TV line items across N new bills
       bill 27 marked `superseded_by: [28, 29, 30]`
       full audit trail (who scattered, when, why)
  → return (challan-out)
```

### 5.4 Scatter-billing data model

```ts
bills:
  id, number, customer_id, total, status
  superseded_by_bill_ids      text[]     -- for scatter: ['28','29','30']
  superseded_at                timestamp
  superseded_by_user           uuid

bill_line_items:
  bill_id                     fk
  device_serial               text
  device_model                text
  charge_description          text
  amount                      numeric
  -- moved_from_bill_id used to track scatter origin
  moved_from_bill_id          text null
  moved_at                    timestamp null
  moved_by_user               uuid null

bill_edit_log:                            -- audit trail (corporate dispute protection)
  bill_id                     fk
  action                      enum: 'create' | 'edit' | 'delete' | 'scatter' | 'merge'
  before_json                 jsonb
  after_json                  jsonb
  performed_by                uuid
  performed_at                timestamp
  reason                      text
```

### 5.5 Customer-owned spare parts

Inventory rows marked `owner_customer_id` (not ours). Corporate tier only. On job-complete:
- Log: *"consumed: 1× panel from MME stock"*
- Log: *"returned unused: 0"*
- Monthly **reconciliation report** per corporate customer.

### 5.6 SLA enforcement (both tiers)

Nightly cron walks open B2B jobs (both tiers, per `billing_profile.sla_days`):

```
days_open >= profile.sla_days - 2 → yellow alert (2 days left)
days_open >= profile.sla_days      → red alert + per-policy action
```

---

## 6. Outside parts purchase (audit-ready)

### 6.1 Existing plumbing (already in schema)

`local_purchases` table already exists with the right shape:
- `partName`, `supplierName`, `costPrice`, `sellingPrice`, `quantity`
- `receiptImageUrl` — mandatory receipt photo
- `purchasedBy` — username who sourced it (audit field already there)
- Auto-appends as a charge to the linked job ticket.

Gap is **UI surface area**, not schema.

### 6.2 What to build

1. **"Add Outside Purchase" button** on job ticket card. One-tap form: part name, supplier, cost, selling price, photo. `purchasedBy` auto-filled from session user.
2. **Inbox-side flow**: when AI brain detects out-of-stock part request, surface a quick action in the staff inbox to log purchase intent immediately (creates a draft `local_purchase` row even before the customer confirms).
3. **Per-job purchase ledger**: side panel on job details sheet showing all outside purchases for that job, who bought, when, receipt photo thumb.
4. **Daily outside-purchase report** for admin: total spend, by staff, by supplier, with receipt photo audit trail.
5. **Block job-close** if any `local_purchases` row for the job has `status != 'Consumed'` or missing receipt — forces clean books.

---

## 7. B2B admin panel — fix the live error

User reports the existing admin-side B2B panel (`client/src/pages/admin/bento/tabs/CorporateRepairsTab.tsx`, 791 lines) is **"not up to the mark"** and has an error.

### 7.1 Audit pass — required before any change

- [ ] Reproduce the error in localhost. Capture exact message, stack trace, network tab response.
- [ ] Walk every state transition in `CorporateRepairsTab.tsx` against `corporate.routes.ts`. Look for:
  - 404s on `/api/corporate/clients/:id`
  - Race conditions between `selectedClientId` state and route effect
  - Stale React Query keys after mutations
  - Missing `enabled` guards causing requests with `undefined` IDs
- [ ] Cross-check `corporateApi` in `client/src/lib/api` matches server route signatures.
- [ ] Run smoke test `tests/admin-routes-smoke.test.ts`.

### 7.2 Known weak spots (from quick scan)

- `useQuery` for `corporate-clients` only fires when `!selectedClientId` — if a client is pre-selected via prop, the list never loads, breaking re-selection UX (line 69-73).
- No error boundary around the tab — any throw nukes the whole admin shell.
- `selectedJobForDetails`, `selectedJobForEdit`, and the dialog flags are duplicated state — a single `activeDialog` discriminated union would prevent inconsistent dialog states.

### 7.3 Fix order

1. Reproduce → log the actual error.
2. Apply minimal patch for the reported bug.
3. Wrap tab in `CorporateErrorBoundary` (component already exists in `client/src/components/corporate/`).
4. Consolidate dialog state.
5. Add Playwright/integration test that exercises the failing path.

---

## 8. Corporate client portal — ecosystem merge

The user-facing portal at `client/src/pages/corporate/*` (dashboard, service-request, job-tracker, messages, notifications, profile) currently runs as a **separate island**. The plan integrates it into the central ecosystem so:

### 8.1 Two-way sync

- Every job logged in admin B2B panel **immediately** shows in customer-facing `job-tracker.tsx`.
- Every service request submitted by the corporate client lands in the **same central inbox** as Messenger/WhatsApp messages, just tagged `source: 'corporate_portal'`, `client_class: 'corporate'` or `'b2b_plant'`.
- Notifications use the **same `notifications` event stream** — no parallel notification system.

### 8.2 Branding per customer

Existing `CorporateBrandingHeader.tsx` can already render per-customer logo/colours. Wire it to read `customer.branding_config` JSONB and let each corporate client get a soft-skinned portal.

### 8.3 Bill visibility

Every bill generated for a B2B plant customer must surface in their portal **with breakdown visible**. If `billing_profile.bill_breakdown_allowed = true`, allow the customer to request a split into N invoices via the portal — admin gets a notification to approve.

### 8.4 SLA timer (already partial)

`SlaTimer.tsx` exists. Make it read `billing_profile.sla_days` instead of a hardcoded constant. Surface it in **both** admin panel and customer portal so both sides see the same clock.

---

## 9. AI brain — class-aware prompting

System prompt is selected per session by `client_class`:

| Class        | Prompt variant key      | Special context injected               |
|--------------|-------------------------|----------------------------------------|
| `online`     | `DAKTAR_VAI_DEFAULT`    | none                                   |
| `repeat`     | `DAKTAR_VAI_WARM`       | customer history block                 |
| `reference`  | `DAKTAR_VAI_REFERRAL`   | history + referrer name                |
| `technician` | `DAKTAR_VAI_TECH`       | terse rules, no diagnosis              |
| `b2b_normal`    | `DAKTAR_VAI_B2B_NORMAL`    | simple billing profile                |
| `b2b_corporate` | `DAKTAR_VAI_B2B_CORPORATE` | acceptance criteria, SLA, serial match |

Prompt variants live in `server/services/ai.service.ts` next to the existing `DAKTAR_VAI_PROMPT`. Default selector logic falls back to `online` when class is unknown.

---

## 10. Build order — phased rollout

Strict dependency order. Each phase is independently shippable; no phase ships to production without sign-off.

| Phase | Title                              | Surface                                 | Localhost? | Prod gate                  |
|-------|------------------------------------|-----------------------------------------|------------|----------------------------|
| A     | Client class foundation            | schema, policy table, backfill         | yes        | data audit + spot check    |
| B     | Central inbox auto-assign          | staff_presence, assignment algo, AI fallback | yes  | 48h shadow run             |
| C     | Credential binding                 | customers table, phone match, AI history inject | yes | spot check 20 sessions    |
| D     | B2B admin panel fix                | reproduce + patch + error boundary      | yes        | no regressions in smoke    |
| E     | Outside parts purchase UI          | job ticket button, ledger panel, daily report | yes  | 1-week audit clean         |
| F     | Corporate portal merge             | two-way sync, branding, bill visibility | yes        | corporate client UAT       |
| G     | B2B billing engine (both tiers)    | billing_profile, scatter-bill UI, audit log, customer-owned spares | yes | MME pilot + reconciliation |
| H     | AI brain class-aware prompts       | variants in ai.service.ts, selector     | yes        | A/B vs current             |
| I     | Acceptance ratio + load distribution | metric calc, weighted round-robin     | yes        | 30-day data first          |

Phase A is the keystone — no other phase can ship without it.

---

## 10.5 Preserve-existing rule (hard constraint)

For every phase that touches B2B / corporate / billing code:
1. **Read existing module first.** Map current logic before changing anything.
2. **Patch in place** when the existing flow is correct-but-broken.
3. **Net-new only for missing pieces.** Schema additions OK; schema replacements need explicit sign-off.
4. **Migration path required** for every schema change touching live tables — no destructive ALTERs without a backfill script.
5. Existing components (`SlaTimer`, `CorporateErrorBoundary`, `CorporateBrandingHeader`, `GenerateBillDialog`, `ChallanInWizard`, etc.) get reused, not duplicated.

This rule overrides any "cleaner rewrite would be nicer" instinct.

## 11. Out of scope (this round)

- Mobile app changes (admin React Native / Flutter — separate roadmap).
- Customer self-onboarding to portal (manual provisioning only for now).
- AI auto-quoting (still phone-call quotation; AI never quotes prices per existing security rule).
- New channels (Instagram DM, Telegram) — locked to WhatsApp + Messenger + Corporate Portal.

---

## 12. Decisions still open (need user input)

1. **Technician phone list** — seed file from user (preferred), or infer from past jobs marked low-priority/cash. User to paste ~10–50 known phones in `docs/seed/technicians.csv`.
2. **B2B customer roster** — list of `b2b_normal` vs `b2b_corporate` customers existing today. MME confirmed `b2b_corporate`. Need explicit list of others.
3. **Scatter-billing mode** — reactive (generate normal bill, scatter on request) vs proactive (always pre-split). User confirmed **reactive** (corporate calls and requests). Locked in §5.1.
4. **Normal-company inventory** — confirmed: no stock-level tracking, but `local_purchases` audit trail stays (receipt + `purchasedBy`).
5. **Acceptance ratio capacity cap** — what is "at capacity" for a staff member? 5 open sessions? 10? Configurable per role?
6. **Corporate portal auth** — keep the existing `corporate-auth.routes.ts` JWT scheme or unify with admin session auth?

Answers go inline in this file under each item once decided.
