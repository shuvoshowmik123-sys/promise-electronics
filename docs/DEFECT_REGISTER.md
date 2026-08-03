# Defect Register

**Created:** 2026-08-02 Asia/Dhaka
**Maintainer:** Inspector session
**Purpose:** Single authoritative list of every open defect across all audit phases. One row per defect. Update status here when a fix lands — do not track defect state in individual audit reports, which are point-in-time snapshots.

**Status values:** `OPEN` · `CONFIRMED` (verified in source by Inspector) · `FIXED` · `RESOLVED` (fixed by configuration, no code change) · `WONTFIX` · `NEEDS-REPRO`

---

## Severity summary

| Severity | Open | IDs |
| --- | --- | --- |
| **HIGH** | 6 | DR-15, DR-01, DR-02, DR-03, DR-04, DR-05 |
| **MEDIUM** | 6 | DR-17, DR-13, DR-14, DR-06, DR-07, DR-08 |
| **LOW** | 3 | DR-18, DR-09, DR-10 |
| **RESOLVED** | 1 | DR-11 |

Total open: **12**

**Highest priority: DR-15** — ungated mutation routes require separate triage.

---

## HIGH

### DR-16 — Google sign-up creates a half-account the user can get trapped in
**Status:** CONFIRMED (Inspector, 2026-08-03) · **Severity:** HIGH
**Component:** `client/src/components/auth/ProfileCompletionModal.tsx:74` · `client/src/contexts/CustomerAuthContext.tsx:166` · `server/customerGoogleAuth.ts`

**Symptom (operator-reported, reproduced in source).** A new customer clicks *Continue with Google*, the account is created, then a form asks for phone and address. If they close it, lose connection, or the submit fails, the flow breaks and retrying keeps failing.

**Root cause — three things combine:**

1. `upsertUserFromGoogle()` creates the account **before** the phone is collected. The user now exists with `phone = null`.
2. `needsProfileCompletion = !!customer && !customer.phone` — so the modal reappears on every visit until a phone is saved.
3. `<Dialog open={open} onOpenChange={() => {}}>` — **the modal cannot be dismissed.** `onOpenChange` is a no-op, so Escape, the overlay, and the close button all do nothing.

The user is authenticated, cannot use the site, and cannot close the blocker. If the submit fails — offline, duplicate phone, server error — there is no exit. `PublicLayout.tsx:88` has a `profileSkipped` escape hatch, but nothing in the modal appears to set it.

**Why it is HIGH.** It is the first experience a new customer has, and the failure state is a locked account with no self-service recovery.

**Fix direction (not applied).** Allow dismissal and set `profileSkipped`; make the account usable in a limited state until the phone is supplied; or collect the phone *before* creating the account. Any of the three breaks the trap.

---

### DR-17 — Location permission is checked once and never re-checked
**Status:** CONFIRMED (Inspector, 2026-08-03) · **Severity:** MEDIUM
**Component:** `client/src/pages/admin/bento/tabs/ShiftTab.tsx:354-366`, message at `:66`

**Symptom (operator-reported, reproduced in source).** Staff open attendance with location off. The check-in button greys out. They enable location — **the button stays grey**. Only a full page reload recovers.

**Root cause.**

```ts
useEffect(() => {
    ...
    navigator.geolocation.getCurrentPosition(..., (err) =>
        setGpsState(err.code === 1 ? "denied" : "error"), ...);
}, [isSuperAdmin, isLoading, isCheckedIn]);
```

The GPS read runs **once on mount**. Its dependency array contains no permission signal, so re-granting permission never re-runs it. `gpsState` stays `"denied"` for the lifetime of the component.

The UI even instructs the user to work around it: *"Enable it in your browser settings **and reload the page**."*

**Why it matters.** Staff cannot check in until they discover the reload trick, and attendance drives payroll. `navigator.permissions.query({name:'geolocation'})` exposes an `onchange` event that would make this automatic.

**Fix direction (not applied).** Re-attempt the GPS read when the disabled button is clicked, add an explicit *Try again* control, and subscribe to permission `onchange`. `PickupLocationPicker.tsx` has the same one-shot pattern with **zero** retry affordance — check it too.

---

### DR-18 — Google consent screen shows an internal project name to customers
**Status:** CONFIRMED · **Severity:** LOW (cosmetic, but customer-facing)

**Symptom.** The Google sign-in popup reads *"Continue to Promise Electronics admin app"*. Customers are shown an internal, admin-oriented name. The underlying Firebase project is also misspelled: **`promsie-electronics-admin`**.

**Root cause.** The OAuth consent screen inherits the Firebase project's public-facing name. It was never set for a customer audience.

**Fix direction (not applied).** Change the public-facing name to *Promise Electronics* in Firebase project settings. The project **ID** cannot be renamed, but customers never see the ID — only the display name. No re-verification is required: the app requests only `profile` and `email`, which are non-sensitive scopes.

---

### DR-15 — Mutation routes with no permission gate at all
**Status:** OPEN — NEEDS TRIAGE
**Component:** ~25 routes across `server/routes/*.ts`
**Source:** Inspector sweep 2026-08-03, found while resolving DR-12

**Symptom.** Roughly 25 `POST`/`PATCH`/`DELETE` routes are protected by `requireAdminAuth` alone, with **no permission check**. Any authenticated admin-panel session — Technician, Driver, Cashier — reaches them regardless of role.

This violates operating-rules §7.1: *"Never leave POST/PATCH/DELETE routes protected only by `requireAdminAuth` unless explicitly public/internal and documented."*

**Not all are defects — this needs triage, not a blanket fix.** Several are legitimate self-service:
`/api/admin/leave/apply` (own leave) · `/api/admin/push/register` · `/api/mobile/device-token` · `/api/users/presence`

**The ones that act on other users' or shared records are the concern:**

| Route | Why it matters |
| --- | --- |
| `PATCH /api/admin/users/:id` | Edit any admin user — most serious |
| `PATCH /api/admin/leave/:id/approve` | Approve leave, potentially one's own |
| `PATCH /api/admin/leave/:id/reject` | Same |
| `POST /api/mobile/jobs/:id/status` | Change any job's status |
| `POST /api/mobile/service-requests/:id/advance` | Advance any service request |
| `PATCH /api/admin/pickups/:id` · `/status` | Modify any pickup |
| `DELETE /api/admin/reviews/:id` | Delete any review |
| `PATCH /api/admin/reviews/:id/approval` | Approve any review |

**Why the role audit missed it.** `ROLE-MATRIX-PERMISSION-AUDIT-01A` probed a fixed endpoint list (settings, users list, reset-link, inventory) and found correct 403s. These routes were never probed, so "all probes 403" does not cover them.

**Fix direction.** Triage all ~25 into *legitimate self-service* vs *needs a gate*. For the latter, add the correct granular permission — and for self-service routes, verify they are scoped to the caller's own record rather than accepting an arbitrary `:id`. **Own phase; do not fold into DR-12.**

---

### DR-12 — Read-only permission satisfies write-gated routes (privilege escalation)
**Status:** FIXED (verified 2026-08-03)
**Component:** `shared/permission-catalog.ts` (`LEGACY_TO_GRANULAR`) + `server/routes/middleware/auth.ts` (`hasLegacyOrMappedPermission`)
**Source:** ROLE-MATRIX-PERMISSION-AUDIT-01A · `DEFECT-ROLE-LEGACY-USERS-BRIDGE-1`

**Symptom.** A Manager holding only `users.viewStaff` can list staff **and** `PATCH /api/admin/customers/:id` — both returning 200 — despite holding no write permission.

**Root cause.** The legacy bridge maps a broad legacy key to a **read-only** granular key:

```ts
LEGACY_TO_GRANULAR.users = ["users.viewStaff"]
```

and the check passes if *any* mapped key is held:

```ts
const mappedKeys = LEGACY_TO_GRANULAR[legacyKey];
if (mappedKeys) {
    return mappedKeys.some(k => effectivePermissions[k] === true);
}
```

So `users.viewStaff` (view) satisfies `requirePermission("users")`, which gates writes — including `router.patch('/api/admin/customers/:id', ..., requirePermission('users'), ...)`.

**Why it matters.** This is privilege escalation, not a UI defect. It **compounds DR-01**: that same route has no input validation, so a "view staff" Manager can silently wipe customer names. Any other route gated by a legacy key whose mapping contains a read-only granular key has the same hole.

**Fix direction.** Do not map a write-gated legacy key onto a read-only granular key. Either split the legacy `users` gate into read vs write variants, or replace `requirePermission('users')` on mutation routes with the correct granular write permission (`requireGranularPermission('users.editStaff')` or equivalent). **Audit every entry in `LEGACY_TO_GRANULAR` for the same read-satisfies-write pattern before fixing only this one.**

**Fix status.** FIXED 2026-08-03. All 20 approved mutation routes now use their specific granular authority. Four new keys (`users.editStaff`, `customers.create`, `customers.delete`, `jobs.rollback`) are catalogued but granted to no role or legacy mapping by default. Existing direct legacy grants remain compatible only for the pre-existing mapped write keys; read-only granular keys do not satisfy write gates. Proof: `mobile-qa/fix-dr-12-permission-bridge-01a/20260803-1122/REPORT.md`.

---

### DR-14 — Empty legacy capability mappings fail closed for granular-only staff
**Status:** OPEN
**Severity:** MEDIUM
**Component:** `shared/permission-catalog.ts` (`canCreate`, `canEdit`, `canDelete`)
**Source:** FIX-DR-12-PERMISSION-BRIDGE-01A

**Symptom.** Granular-only staff cannot satisfy legacy `requirePermission('canCreate')` or `requirePermission('canEdit')` gates, including corporate user creation and corporate reset/setup routes.

**Root cause.** `canCreate`, `canEdit`, and `canDelete` map to empty arrays. The bridge uses `.some()`, so these entries fail closed for every granular-only account.

**Fix direction.** Do not repair as part of DR-12. Define route-specific replacement permissions in a separate authorization decision, then migrate the affected routes without widening access.

---

### DR-13 — Attendance gate returns 412 where 403 is expected
**Status:** OPEN (reported)
**Severity:** MEDIUM
**Component:** attendance/check-in middleware on `/api/admin/*`
**Source:** ROLE-MATRIX-PERMISSION-AUDIT-01A

**Symptom.** Before a staff member checks in, `/api/admin/*` returns **412** rather than a permission-based 403. Access is still denied, so this is not a security hole — but the status masks whether the real reason is permission or attendance state, which makes permission testing ambiguous.

**Fix direction.** Confirm the intended contract. If the attendance gate is deliberately ordered before permission checks, document it; otherwise evaluate permissions first so 403 surfaces correctly.

---

### DR-01 — Customer update route has no input validation at all
**Status:** CONFIRMED (Inspector read source 2026-08-02)
**Component:** `server/routes/users.routes.ts:1076`
**Source:** CRUD-AUDIT-01A · reported as "empty name wipes name"

**Symptom.** `PATCH /api/admin/customers/:id` with `{"name": ""}` returns `200` and silently wipes the customer's name.

**Actual root cause — broader than reported.** The handler performs no validation whatsoever:

```ts
const { name, email, phone, address, isVerified } = req.body;
const updates: any = {};
if (name !== undefined) updates.name = name;
if (email !== undefined) updates.email = email;
if (phone !== undefined) updates.phone = phone;
if (address !== undefined) updates.address = address;
if (isVerified !== undefined) updates.isVerified = isVerified;
```

There is no Zod schema on this route. Every field writes straight to the database. So beyond empty names this also accepts malformed emails, non-numeric phone values (breaking `normalizePhone` expectations downstream), and wrong-typed `isVerified`.

**Why it matters.** Silent destructive write returning 200. Staff see success; the record is damaged. No audit trail distinguishes it from a legitimate edit.

**Fix direction.** Add a Zod schema mirroring the pattern already used at `users.routes.ts:609` (`name: z.string().min(1, "Name is required")`). Validate email format, run phone through `normalizePhone`, coerce `isVerified` to boolean. Reject with 400.

---

### DR-02 — Inventory create accepts an empty name
**Status:** CONFIRMED
**Component:** `shared/schema.ts:579` → consumed at `server/routes/inventory.routes.ts:205`
**Source:** CRUD-AUDIT-01A

**Symptom.** `POST /api/inventory` with `{"name": ""}` returns `201`.

**Root cause.** The route *does* validate (`insertInventoryItemSchema.parse(req.body)`), but the schema is a bare generated schema with no refinements:

```ts
export const insertInventoryItemSchema = createInsertSchema(inventoryItems)
  .omit({ createdAt: true, updatedAt: true })
  .partial({ id: true });
```

`createInsertSchema()` maps a `NOT NULL TEXT` column to plain `z.string()`, which accepts `""`. The database constraint is satisfied — `""` is not null — so nothing rejects it at any layer.

**Fix direction.** Extend the schema with `.extend({ name: z.string().min(1, "Name is required") })`. Audit the other columns on `inventoryItems` for the same gap (notably `sku`) while making the change.

---

### DR-03 — Inventory update wipes the name
**Status:** CONFIRMED
**Component:** `server/routes/inventory.routes.ts:235`
**Source:** CRUD-AUDIT-01A

**Symptom.** `PATCH /api/inventory/:id` with `{"name": ""}` returns `200` and clears the name.

**Root cause.** Same as DR-02. The route uses `insertInventoryItemSchema.partial().parse(req.body)` — inheriting the missing `.min(1)` constraint.

**Fix direction.** Fixing DR-02 at the schema level repairs this simultaneously. Verify both paths after the change; do not fix them separately.

---

### DR-04 — Desktop "Generate Account Setup Link" control is unreachable
**Status:** CONFIRMED (measured)
**Component:** `client/src/pages/admin/bento/tabs/CustomersTab.tsx` (desktop branch ~line 768, mobile ~line 1131)
**Source:** UI-SURFACE-DISCOVERY-AND-BUG-AUDIT-01A (D3), re-measured in CRUD-AUDIT-01A

**Symptom.** At 1440×900, the only setup-link control present in the DOM is `button-mobile-generate-reset-link`, rendered at **0×0 with `parentHidden=true`**. The desktop control does not render.

**Evidence note.** An Inspector session on 2026-07-30 clicked "Generate Reset Link" successfully at 1440×900, so this is likely a **regression** introduced by the sheet-close fix in `CustomersTab.tsx` shipped in commit `7192c93`. Both controls are gated identically by `isSuperAdmin`, so permission is not the cause.

**Why it matters.** Super Admins cannot issue account setup links from a desktop browser — the primary admin environment. The feature is only reachable on mobile viewports.

**Fix direction.** Diff `CustomersTab.tsx` against `7bce71b` around the activity-sheet render branches. Determine why the desktop branch stopped rendering its control and whether the mobile branch is now mounting unconditionally.

---

### DR-05 — Hard-coded `localhost:5173` fallback for setup-link origin
**Status:** OPEN (production mitigated by configuration — see DR-11)
**Component:** `server/services/corporate-setup-token.service.ts:21`
**Source:** UI-SURFACE-DISCOVERY-AND-BUG-AUDIT-01A (D4)

**Symptom.** Generated setup links point at `http://localhost:5173`, which nothing serves. The dev server runs on **5083**.

**Root cause.**

```ts
if (!configured) {
    return process.env.NODE_ENV === 'production' ? null : 'http://localhost:5173';
}
```

Production fails closed (returns `null` → 500), which is correct. Development silently returns a port that has never been correct for this project.

**Blast radius — three routes consume this helper:**
- `POST /api/admin/corporate-users` (`users.routes.ts:626`) — corporate user creation
- `POST /api/admin/corporate-users/:id/reset-password` (`users.routes.ts:700`)
- `POST /api/admin/customers/:id/reset-link` (`users.routes.ts:1158`)

Helper introduced 2026-07-13. `APP_BASE_URL` was unset in production until 2026-08-02, so the first two features returned 500 in production for roughly three weeks, unnoticed.

**Fix direction.** Change the dev fallback to `http://localhost:5083`, or better, derive it from `process.env.PORT`. Add `APP_BASE_URL` to `render.yaml` (see DR-09) so the value is declared, not only set in a dashboard.

---

## MEDIUM

### DR-06 — Bangla labels fall back to English text
**Status:** CONFIRMED
**Component:** `client/src/components/mobile/MobileServiceWizard.tsx:287-290`
**Source:** UI-SURFACE-DISCOVERY-AND-BUG-AUDIT-01A (D1)

**Symptom.** Admin-configured symptoms display English text to Bangla users.

**Root cause.** When a configured symptom does not match a `DEFAULT_PROBLEM_OPTIONS` entry, the fallback assigns the same raw string to both language fields:

```ts
return { id: symptom, bn: symptom, en: symptom, ... };
```

`bn` is not a translation — it is the English string relabelled.

**Fix direction.** Either surface the English label explicitly (so the UI can show "no translation available" semantics), or require a `bn` value when symptoms are configured in settings. Do not silently present English as Bangla.

---

### DR-07 — Validation toasts stack on repeated submission
**Status:** OPEN (reported, not independently verified)
**Component:** `client/src/components/mobile/MobileServiceWizard.tsx`
**Source:** UI-SURFACE-DISCOVERY-AND-BUG-AUDIT-01A (D2)

**Symptom.** Repeatedly pressing Continue on an incomplete step stacks multiple "Please complete this step first" toasts.

**Fix direction.** De-duplicate by toast id, or guard so an identical message cannot be queued while already visible.

---

### DR-08 — Inventory permits duplicate item names
**Status:** OPEN (reported, not independently verified)
**Component:** `shared/schema.ts` (`inventoryItems`) / `server/routes/inventory.routes.ts`
**Source:** CRUD-AUDIT-01A

**Symptom.** Two inventory items can share an identical name.

**Open question.** May be intentional — items are likely identified by SKU, not name. **Confirm the business rule before changing anything.** If duplicates are legitimate, mark WONTFIX and record why.

---

## LOW

### DR-09 — `APP_BASE_URL` not declared in `render.yaml`
**Status:** OPEN (configuration drift)
**Component:** `render.yaml`

**Symptom.** The variable is set in the Render dashboard but absent from the Blueprint. If the service is ever recreated from `render.yaml`, three link-generating features break immediately with 500s.

**Fix direction.** Add `- key: APP_BASE_URL` with `sync: false` alongside the other declared variables.

---

### DR-10 — `BRAIN_DATABASE_URL` is malformed
**Status:** OPEN
**Component:** `.env` (local development only)

**Symptom.** Startup logs:
```
[Brain] Phase 6 migration skipped: Failed to parse URL from https://api.0.0.1/sql
[Brain] seedPhase2ConversationsIfNeeded failed: relation "conversations" does not exist
```

**Root cause.** The value carries a stray leading double-quote and points at `127.0.0.1:5432/promise_dev`, a local Postgres that is not running.

**Impact.** Brain features are silently disabled in development. Non-blocking, but it produces recurring error noise that masks real failures during audits — directly relevant to L5 server-log verification.

---

## RESOLVED

### DR-11 — Setup links returned 500 in production
**Status:** RESOLVED 2026-08-02 (configuration)

`APP_BASE_URL` was unset in production, so `getCorporateAppBaseUrl()` returned `null` and all three consuming routes returned 500. Operator set `APP_BASE_URL=https://www.promiseelectronics.com` in the Render dashboard.

**Not yet verified end-to-end.** No successful production setup-link generation has been observed. The value's acceptance is unconfirmed — the helper rejects non-HTTPS URLs and any URL containing credentials, a query string, or a fragment. **Requires a production smoke test before this can be considered closed.** DR-05 (the code-level fallback) and DR-09 (the Blueprint declaration) both remain open.

---

## Operational items (not code defects)

| Item | Status | Action |
| --- | --- | --- |
| Aiven `avnadmin` password exposed in chat transcript | **URGENT** | Rotate in Aiven, update `DATABASE_URL` in Render, redeploy |
| Vercel and Render serve different frontend bundles (`index-CLfR9jec.js` vs `index-C0c0cQ_m.js`) | OPEN | Decide on one frontend host. Render now serves the full app on one origin. |
| `AI_AGENT_OPERATING_RULES.md` §9.5 claims `opencode.json` holds a literal API key | STALE | Verified false — the file uses `${ENV_VAR}` references. Correct the rule; it misleads every agent that reads it. |
| Leftover `qa_crud_*` test rows in the dev database | OPEN | Clean per the CRUD-AUDIT-01A teardown list |
| `scripts/inspect-ledger.mjs` untracked | OPEN | Keep and commit, or delete |

---

## Verification status legend

- **CONFIRMED** — Inspector independently read the source and reproduced the reasoning
- **OPEN (reported)** — an audit agent observed it; Inspector has not independently verified
- Defects marked CONFIRMED are safe to fix directly. Defects marked reported-only should be reproduced first.
