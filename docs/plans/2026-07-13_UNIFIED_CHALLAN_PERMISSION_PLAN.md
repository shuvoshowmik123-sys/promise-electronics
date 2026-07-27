# Unified Challan + Corporate Challan Plan<br>
## Permission-First · No Collision · Second-Opinion Ready

**Document ID:** `UNIFIED-CHALLAN-PERM-01`<br>
**Date:** 2026-07-13<br>
**Status:** PLAN ONLY — no implementation in this document<br>
**Audience:** Product owner + second-opinion reviewer<br>
**Related systems today:**<br>
- Retail / ops challans → table `challans`, tab `challans`, routes `server/routes/challans.routes.ts`<br>
- Corporate B2B challans → table `corporate_challans`, tab `b2b` / Unified B2B, routes `server/routes/corporate.routes.ts`<br>
- Permissions: `challans.view` / `challans.manage` vs `corporate.view` / `corporate.manageClients` / `corporate.billing`<br>
- NG workflow lock (JOBS-NG-02G) must remain enforced on any corporate OUT / job status path<br>

---

## 1. Problem statement

Today the shop has **two parallel challan worlds**:

| Surface | Data | UI | Permission gate (today) |
|---|---|---|---|
| **Normal / ops Challan** | `challans` | Admin tab **Challans** | Broad `challans` / `challans.view` / `challans.manage` |
| **Corporate / B2B Challan** | `corporate_challans` + job batching | Admin tab **B2B Area** | Broad `corporate` / granular corporate.* |

### Pain points to solve

1. **Not unified** — staff must know which tab is “real” for which customer type.<br>
2. **Collision risk** — two models, two numbering schemes, two OUT/IN meanings, overlapping language (“challan”).<br>
3. **B2B over-exposure** — legacy `corporate: true` / Manager presets can open the full B2B workspace even when the person only needs a simple delivery challan.<br>
4. **Driver access** — Drivers may need to **view/create operational challans** (pickup/delivery paper trail) without seeing corporate clients, bills, or B2B cockpit.<br>
5. **Permission manager lag** — catalog, role presets, invite designer, sidebar tab map, search, mobile — not one coherent story.<br>
6. **Jobs linkage** — corporate IN creates jobs; corporate OUT delivers jobs. Retail challans may not share the same safety rules (including NG-locked jobs).<br>

### Goal (product)

> One **unified Challan experience** with a single mental model:<br>
> **Document → Direction (IN/OUT) → Party (walk-in customer vs corporate client) → Lines → Handover.**<br>
> From normal challan flow, staff can **start or attach a corporate challan** when the party is B2B — without dumping every staff member into the full B2B area.

---

## 2. Product principles (non-negotiable)

| # | Principle |
|---|---|
| P1 | **Permission before UI** — no tab/action if BE denies. |
| P2 | **B2B is gated** — full B2B workspace never appears unless Super Admin grants B2B permissions. |
| P3 | **Challan ≠ B2B** — ops challan rights do not imply corporate client/billing rights. |
| P4 | **One action, one ownership path** — no double-create of the same physical handover in both tables without explicit link. |
| P5 | **User-specific scope** — Driver sees assigned / self-created / granted scope; Manager sees shop-wide when granted; Super Admin sees all. |
| P6 | **No NG collision** — corporate OUT / any job completion via challan must respect `NG_WORKFLOW_LOCKED` (JOBS-NG-02G). |
| P7 | **Retail money stays POS; B2B money stays corporate bills** — challan is custody/handover, not payment system. |
| P8 | **Backward compatible** — existing `challans` and `corporate_challans` rows remain valid; no forced data rewrite of history. |
| P9 | **Codex owns final UI** — this plan sets UX boundaries; no new visual system invented by worker agents. |

---

## 3. Target mental model

### 3.1 Unified challan document types

| Domain | Direction | Party | Purpose |
|---|---|---|---|
| **Ops / Retail** | OUT / IN (transfer, customer delivery, receive) | Walk-in customer or internal | Paper trail for non-B2B custody |
| **Corporate** | **IN** (receive devices from client) | `corporate_clients` | Creates/links job tickets (existing strength) |
| **Corporate** | **OUT** (return devices to client) | `corporate_clients` | Marks delivery; must not bypass NG/payment policy |

### 3.2 Entry points (unified)

```
Admin shell
├── Challans (unified hub)          ← primary for most staff who have challans.*
│   ├── All / Mine / Assigned
│   ├── Filter: Ops | Corporate (if allowed)
│   ├── Create Ops Challan
│   └── Create Corporate Challan    ← only if corporate.challan* permission
│       └── deep-link into B2B wizard OR embedded slim wizard
│
└── B2B Area (full workspace)       ← only if corporate.view (or successor key)
    ├── Clients, batches, bills, CRR, messages, …
    └── Challans list (same data as corporate filter in hub)
```

**Key product rule:**<br>
- User with **only** `challans.*` → sees **Challans hub**, ops documents only. **No B2B tab.**<br>
- User with **challans + corporate challan create** → Challans hub shows “New corporate challan” but **still no full B2B tab** unless `corporate.view` (or explicit `corporate.workspace`).<br>
- User with **full B2B** → B2B tab + corporate challans inside B2B + same documents appear under Challans hub corporate filter (one data source).

### 3.3 “Create corporate challan from normal challan”

Recommended UX (second-opinion options):

| Option | Description | Recommendation |
|---|---|---|
| **A. Mode switch on Create** | Create drawer: Party type = Customer \| Corporate client | **Recommended** — single create surface |
| **B. Explicit button** | “Convert / Open as Corporate IN” after party selected | Good secondary |
| **C. Deep-link only** | Jump to B2B wizard | Avoid as sole path — re-opens B2B exposure |

When party = Corporate:

- Require `corporate.challanCreate` (new) **or** existing `corporate.manageClients` during transition.<br>
- Require selected `corporateClientId`.<br>
- Run **corporate IN** pipeline (job creation rules) — not retail challan insert.<br>
- Store **link** between documents if both rows exist (see data model).

---

## 4. Data model strategy (no collision)

### 4.1 Do **not** merge tables in v1

Keep:

- `challans` — ops/retail<br>
- `corporate_challans` — B2B<br>

**Why:** Different lifecycle (jobs batch, SLA, bills). Forced merge is high-risk.

### 4.2 Introduce a **unified read model** (logical, not necessarily new table first)

**Phase A (preferred first):** API facade<br>

`GET /api/unified-challans` returns normalized DTOs:

```ts
{
  id: string;
  domain: "ops" | "corporate";
  direction: "in" | "out" | "transfer" | ...; // map legacy types carefully
  partyType: "customer" | "corporate" | "internal";
  partyLabel: string;
  corporateClientId?: string;
  status: string;
  createdAt: string;
  createdByUserId?: string;
  assignedDriverId?: string;
  jobIds?: string[];
  sourceTable: "challans" | "corporate_challans";
  sourceId: string;
}
```

**Phase B (if needed):** thin `challan_links` or columns:

| Column / table | Purpose |
|---|---|
| `challans.corporate_challan_id` (nullable) | Ops doc points to B2B twin |
| `corporate_challans.ops_challan_id` (nullable) | Reverse link |
| `created_by_user_id` / `assigned_driver_id` on both (if missing) | User-specific lists |

### 4.3 Numbering

- Keep existing number generators separate (`CH-…` vs `CLIENT-C-IN-…`).<br>
- Display always with **domain badge**: `OPS` vs `B2B`.<br>
- Never reuse IDs across tables.

### 4.4 Collision rules

| Scenario | Rule |
|---|---|
| Same physical delivery | Exactly **one** corporate OUT **or** one ops OUT for that job set — not both unmarked |
| Corporate job list on ops challan | Forbidden (jobs stay corporate-linked) |
| Ops customer on corporate IN | Forbidden |
| NG-locked job on corporate OUT | **Reject 409** `NG_WORKFLOW_LOCKED` (unify with 02G) |
| Unbilled policy | Product decision: block OUT if unpaid **or** Manager override with audit — **choose in Phase 0** |

---

## 5. Permission model (core of the plan)

### 5.1 Split “Challan” from “B2B workspace”

#### Challan module (granular) — proposed catalog

| Key | Intent | Typical roles |
|---|---|---|
| `challans.viewOwn` | See challans I created or am assigned to | Driver, Tech (optional) |
| `challans.viewAll` | See all **ops** challans | Manager, Super Admin |
| `challans.create` | Create ops challan | Manager, Driver (if granted), Super Admin |
| `challans.edit` | Edit draft / correct ops challan | Manager |
| `challans.print` | Print/export PDF | Driver, Manager |
| `challans.delete` | Delete (critical) | Super Admin only |

Legacy: `challans` / `challans.view` / `challans.manage` map into the above during transition.

#### Corporate / B2B module — proposed additions

| Key | Intent | Notes |
|---|---|---|
| `corporate.workspace` **or** keep `corporate.view` | See **B2B Area tab** (clients, batches, bills UI) | **Default OFF** for Driver/Cashier/Tech |
| `corporate.challanView` | See corporate IN/OUT documents | Can be granted **without** full workspace |
| `corporate.challanCreate` | Create corporate IN/OUT | Manager default; Driver only if you grant |
| `corporate.challanOut` | Execute outgoing handover | Higher risk (job → Delivered) |
| `corporate.manageClients` | Existing | Clients CRUD |
| `corporate.billing` | Existing | Bills — never implied by challan |
| `corporateMessages.*` | Existing | Separate from challan |

**Critical product rule you stated:**

> Staff will **not** see the B2B area at all until you grant permission.

Implementation:

- Sidebar `b2b` tab requires **`corporate.view` or `corporate.workspace` only** — never `challans.*`.<br>
- Manager Basic preset today includes full corporate — **must be revised** so Manager does **not** auto-get B2B unless you want that. Recommend: Manager gets ops challans; B2B is explicit pack “B2B Operator”.

### 5.2 Role intent matrix (target)

| Role | Challans hub | Create ops | Create corporate | Full B2B tab | Default |
|---|---|---|---|---|---|
| Super Admin | All | Yes | Yes | Yes | `*` |
| Manager | All ops (+ corp if granted) | Yes | **Optional grant** | **Optional grant** | Ops-focused |
| Driver | Own/assigned | **Optional grant** | **Optional grant** | **No** | Pickup + optional challan pack |
| Technician | Optional view | No default | No | No | Jobs only |
| Cashier | No default | No | No | No | POS |
| Corporate portal user | N/A (portal) | Portal rules | Portal rules | N/A | Unchanged |

### 5.3 Permission Manager / Coverage updates (everywhere)

Update **all** of:

| Surface | Work |
|---|---|
| `shared/permission-catalog.ts` | New keys, labels, risk, suggestedRoles, coverageCritical |
| `LEGACY_TO_GRANULAR` | Map old `challans` / `corporate` without over-granting B2B |
| `ROLE_PRESETS` | Manager / Driver Basic packs |
| `CUSTOM_PACKS` | e.g. “Driver + Challan”, “B2B Operator”, “Challan only (no B2B)” |
| Permission Designer UI | Module groups: Challans vs Corporate |
| Coverage Health | Include new keys |
| Invite / staff setup | Same catalog |
| `design-concept.tsx` tab → permission map | `challans` vs `b2b` separate |
| Search API `hasPerm('challans')` | Respect viewOwn vs viewAll; never leak corporate without corp keys |
| Mobile / workbench | Same gates |
| Admin notification feed | Corporate events only if workspace/challan perm |

### 5.4 Backend enforcement (mandatory)

| API family | Gate |
|---|---|
| `GET/POST /api/challans` | `challans.viewOwn|viewAll` / `challans.create` — **scope lists** |
| Corporate challan create IN/OUT | `corporate.challanCreate` / `corporate.challanOut` |
| Corporate clients list | `corporate.view` or `corporate.challanCreate` (minimal client lookup for create) — **do not return full B2B analytics** |
| Corporate bills | `corporate.billing` only |
| Unified list | Server filters domains by permissions |

**User-specific list rules (ops):**

- `viewOwn`: `created_by_user_id = me` OR `assigned_driver_id = me`<br>
- `viewAll`: no actor filter<br>
- Never return corporate domain without corporate challan/view rights<br>

---

## 6. UX flow (unified)

### 6.1 Create Ops Challan (Driver or Manager)

1. Open **Challans** → New.<br>
2. Direction: IN / OUT / Transfer.<br>
3. Party: Customer (search by phone/name).<br>
4. Lines: free description / link ready jobs if product allows later.<br>
5. Optional assign driver.<br>
6. Save → print.<br>
7. Audit: `CHALLAN_OPS_CREATED`.

### 6.2 Create Corporate Challan from same hub

1. New → Party type **Corporate**.<br>
2. Permission check fails → toast “B2B challan not granted” (no B2B tab flash).<br>
3. Select client (lightweight lookup endpoint).<br>
4. Choose **IN** (receive) or **OUT** (return).<br>
5. **IN:** device grid / import (reuse ChallanInWizard logic) → jobs created.<br>
6. **OUT:** select eligible jobs only (Ready/Completed, **not NG-locked**, policy for unpaid).<br>
7. Signature / receiver fields.<br>
8. Save → print.<br>
9. Audit: `CHALLAN_CORP_IN_CREATED` / `CHALLAN_CORP_OUT_CREATED`.

### 6.3 Driver day

- Pickup tab remains logistics.<br>
- Challans tab (if granted) shows **my** documents.<br>
- No client master, no bills, no corporate messages unless separately granted.

### 6.4 Manager day

- Sees all ops challans (if `viewAll`).<br>
- Can grant packs to drivers.<br>
- Full B2B only if you enable workspace for that manager.

---

## 7. Collision & safety matrix

| Risk | Prevention |
|---|---|
| Staff open full B2B by mistake | Tab hard-gated; presets don’t include workspace by default |
| Double OUT of same jobs | OUT eligibility service + unique job “delivered” guard |
| NG job delivered via challan | Reuse 02G lock on every job status write |
| Ops challan used for corporate client | Party type validation; corporate requires corp permissions |
| Payment double-count | Challan never records POS/corporate payment |
| Driver sees other drivers’ challans | viewOwn default for Driver pack |
| Permission designer grants `challans.manage` and thinks B2B included | Catalog descriptions + separate modules in UI |

---

## 8. Phased implementation (recommended)

### Phase 0 — Product decisions (1 short workshop)

Decisions to lock:

1. Does **Manager** get B2B by default? (Recommend **No**.)<br>
2. Can **Driver** create corporate OUT, or only ops + view?<br>
3. Corporate OUT if bill unpaid: block / allow with Manager override?<br>
4. Single create surface (mode switch) vs dual buttons?<br>

**Exit:** written answers in this file appendix.

### Phase 1 — Permission foundation (backend + catalog only)

- Add granular keys; map legacy carefully.<br>
- Gate `b2b` tab strictly.<br>
- Fix role presets + packs.<br>
- Scope `GET /api/challans` (own vs all).<br>
- Enforce corporate routes with split keys (transition: accept old `corporate` broad during migrate).<br>
- Audit events for permission denials optional.<br>

**Exit:** matrix QA (Driver without B2B never sees tab; Super Admin sees all).

### Phase 2 — Unified Challans hub (read + create ops)

- Unified list API (ops + corporate rows if allowed).<br>
- Challans UI redesign **inside approved UI system** (Codex direction).<br>
- Create ops challan with `createdBy` / optional driver assignment.<br>

**Exit:** Driver create/view own ops challan E2E.

### Phase 3 — Corporate create from hub

- Embed or slim-wrap corporate IN/OUT wizards behind permissions.<br>
- Link records if dual storage.<br>
- NG lock on OUT job set (must).<br>

**Exit:** Manager with corp challan perm creates IN without opening unrelated B2B modules; user without workspace never sees clients/bills.

### Phase 4 — Hardening & cleanup

- Remove accidental `corporate: true` from Driver/Tech seeds.<br>
- Search, notifications, mobile, coverage health.<br>
- Second-opinion audit like JOBS-NG-02F.<br>
- Deprecate confusing dual entry labels.<br>

### Phase 5 (optional later) — Data unification

- Only if ops pain remains: single physical table or event-sourced ledger.<br>
- **Do not start here.**

---

## 9. Files / surfaces likely to change (implementation map)

| Area | Likely touchpoints |
|---|---|
| Permissions | `shared/permission-catalog.ts`, `admin-permissions.ts`, Permission Designer components |
| Tab shell | `design-concept.tsx` (or current admin shell), workbench category map |
| Ops challan BE | `server/routes/challans.routes.ts`, finance/challan repo |
| Corporate BE | `server/routes/corporate.routes.ts`, `corporate.service.ts`, corporate repo |
| Unified API | **new** `unified-challans` routes/service (recommended) |
| UI | `ChallanTab`, `ChallanInWizard`, `UnifiedB2BTab` / CorporateRepairs |
| Search | `server/routes/search.routes.ts` |
| NG safety | challan OUT → job update path (02G guard) |
| Docs | this plan + later phase reports under `mobile-qa/` |

---

## 10. Testing plan (for second opinion / QA)

### Permission matrix tests

| User fixture | Expect |
|---|---|
| Driver + `challans.viewOwn` + `challans.create` | Challans tab yes; B2B tab no; create ops yes; create corporate no |
| Driver + above + `corporate.challanCreate` | Create corporate yes; still **no** full B2B tab |
| Manager + ops only | All ops challans; no B2B |
| Manager + B2B pack | B2B tab + corp challans |
| Tech default | No challans / no B2B |
| Super Admin | All |

### Collision tests

- Same job cannot be on two open corporate OUTs.<br>
- NG Review Pending job cannot be included in OUT.<br>
- Ops create cannot set `corporateClientId` without corp permission.<br>

### Regression

- Existing corporate portal, bills, messages unchanged for authorized B2B users.<br>
- JOBS-NG-02G locks still pass.<br>
- POS / retail jobs unchanged.

---

## 11. Out of scope (explicit)

- Customer portal challan self-service<br>
- Replacing corporate billing<br>
- Merging retail POS with challan<br>
- NG customer-decision / replacement phases<br>
- Full visual redesign beyond Codex-approved patterns<br>
- Production/Aiven data migration experiments<br>

---

## 12. Risks & open questions for second opinion

| # | Question | Suggested default |
|---|---|---|
| Q1 | Manager Basic includes full corporate today — strip it? | **Yes** — add pack “B2B Operator” |
| Q2 | Driver corporate OUT? | **No** by default; Manager OUT |
| Q3 | Should corporate challan view live only in hub, or also B2B? | **Both**, same API, dual entry for B2B users only |
| Q4 | Minimal client picker without `corporate.view`? | **Yes** — `corporate.challanCreate` grants limited `GET clients-lite` |
| Q5 | One DB table later? | Defer until hub stable |

---

## 13. Success criteria

1. Super Admin can hide entire B2B area from any staff via permissions.<br>
2. Driver can be given challan view/create without any B2B leakage.<br>
3. Manager can run ops challans daily; B2B is opt-in.<br>
4. From Challans hub, authorized users create corporate IN/OUT without confusion.<br>
5. No double handover; NG-locked jobs never leave via challan OUT.<br>
6. Permission Manager shows clear Challans vs Corporate modules.<br>
7. Second-opinion audit finds no FE-visible / BE-open mismatch on B2B tab.

---

## 14. Suggested next step after second opinion

1. Approve **Phase 0 decisions** (Q1–Q5).<br>
2. Implement **Phase 1** only (permissions + tab gate + scoped lists) — highest leverage, lowest UI risk.<br>
3. Then Phase 2–3 for unified hub + corporate create.<br>
4. Independent audit (like JOBS-NG-02F) before calling production-ready.

---

## Appendix A — Current state snapshot (for reviewers)

- Two tables: `challans` vs `corporate_challans`.<br>
- Two admin tabs: `challans` vs `b2b`.<br>
- Catalog already has coarse `challans.view|manage` and `corporate.view|manageClients|billing`.<br>
- Manager Basic preset currently includes full corporate + challans (over-broad for “no B2B until granted”).<br>
- Driver defaults: pickup-focused; challans legacy sometimes true in role defaults — must be cleaned.<br>
- Corporate OUT currently can force job `Delivered` (must integrate NG lock — already identified in JOBS-NG-02G residual).<br>

## Appendix B — Document path

**This file:**<br>
`docs/plans/2026-07-13_UNIFIED_CHALLAN_PERMISSION_PLAN.md`

Share this path for second-opinion review.

---

*End of plan. No product code was modified to create this document.*
