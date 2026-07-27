# Admin Mobile Visual Ledger

This is the source of truth for admin mobile visual consistency. Use it before asking "what tab is next?" or sending work to Claude Code.

## Locked Decisions

- Reference screen: Dashboard C.
- Normal list pages: top tools and bottom dock hide/reveal together.
- Detail, edit, chat, and action surfaces: hide global admin top/bottom chrome while open.
- Default detail pattern: bottom sheet.
- Dense KPI blocks: collapsed by default.
- Admin mobile color system: blue/slate base; status colors only for real state.
- Daily Ops tabs must use the strict native shell:
  - compact header
  - collapsed KPI summary when dense
  - search/filter controls
  - card list
  - bottom-sheet details/actions
- Automatic fail:
  - content hidden behind dock/chrome
  - unreachable final card/button/form field
  - trapped scroll
  - ghost/white bar after sheet or chrome transition
  - detail/action surface covered by global chrome

## Accepted Bottom-Sheet Baseline (2026-06-26)

All admin mobile bottom sheets must follow:
- Portaled to `document.body` if inside a transformed parent (Settings sheets)
- Gray drag pill via `MobileBottomSheetHandle` with default spacing `mt-4 mb-3`
- Whole sheet drags as one surface (full-sheet `drag="y"` on `MobileBottomSheetFrame`)
- No independent pill drag (no `MobileBottomSheetDragHandle` unless proven needed)
- No mobile top-right X button on normal sheets — close via drag down, backdrop tap, Escape, or footer Cancel
- Footer actions clear safe area with `pb-[calc(...+env(safe-area-inset-bottom))]`
- Overlay covers full viewport (`fixed inset-0`, height=844 on 844px viewport)
- No 64px bottom ghost strip (inner wrapper uses `h-[calc(100%+4rem)]` when chrome hidden)
- Body scrolls normally inside `overflow-y-auto` containers
- Inputs focus normally — sheet drag does not interfere
- Chrome hides while sheet is open, restores on close

## Status Labels

- `Native Complete`: matches Dashboard C behavior and passed mobile/desktop verification.
- `Patched Needs Retest`: code was changed, but browser/mobile evidence is not final.
- `Needs Redesign`: structurally or visually not native enough for launch quality.
- `Functional Clean`: usable and safe, but not a full native redesign priority.
- `Not Mobile Priority`: acceptable for desktop or low-frequency mobile use for now.

## Daily Ops Launch Priority

These tabs must be native-polished before launch:

| Tab | Status | Last Tested | Evidence | Remaining |
| --- | --- | --- | --- | --- |
| Dashboard | Native Complete | 2026-06-25 | `raw/dashboard-*.json` + `screenshots/confirm-dashboard-rest.png` | Inspector approved. No blockers. |
| Overview | Native Complete | 2026-07-02 | `qa-22b-overview-390x844.png`, `qa-22b-overview-430x932-c.png`, `qa-22b-overview-844x390.png`, `qa-22b-overview-932x430.png`, `qa-22b-overview-1440x900.png` | Phase 22B: hook-branched mobile/desktop layout. Mobile: compact header, KPI chips, urgent jobs list, ready-for-delivery list, technician progress rows — no Recharts. Desktop: gradient BentoCards + BarChart preserved. Landscape: mobile branch active (useAdminMobileMode h<700). All 5 viewports PASS. Console clean. TSC + Vite build clean. |
| Jobs | Detail 360 + media complete; **New Job headed QA FAILED—STOPPED** | 2026-07-21 | Detail: prior; QA-CLOSE: `mobile-qa/job-intake-unification-01c-qa-close/20260721-1717/` | Shell lanes / Corp handoff / Full TV only / no H overflow / tech no-customer-fields / tech batch mode / close Jobs at 390/430/844×390/1440 **PASS**. Customer name-field deep fill **FAIL** (harness may contribute). **DEFECT-01C-QC-1:** `customers` missing after MAIN migrate blocks clean compact lookup. Gates **PASS 4**. Package **not green**. Production NOT VERIFIED. |
| Stock / Inventory | Native Complete | 2026-06-25 | `raw/inventory-*.json` + `screenshots/confirm-inventory-{rest,detail}.png` | Inspector approved. No blockers. |
| Finance | Native Complete | 2026-06-25 | `raw/finance-*.json` + `screenshots/confirm-finance-{rest,invoice}.png` | Inspector approved. No blockers. |
| POS | Native Complete | 2026-06-25 | `raw/pos-*.json` + `screenshots/confirm-pos-{rest,cart}.png` | Inspector approved. Refund dialog centered Radix style — polish later. |
| Service Requests | Native Complete | 2026-06-25 | `raw/sr-mcp-*.json` + `screenshots/confirm-sr-{rest,detail}.png` | Inspector approved. No blockers. |
| Pickups | Native Complete | 2026-06-25 | `raw/pickup-*.json` + `screenshots/confirm-pickup-{rest,action}.png` | Inspector approved. No blockers. |
| Corporate Messages | Native Complete | 2026-06-25 | `raw/corp-msg-*.json` + `screenshots/confirm-corpmsg-{rest,chat}.png` | Inspector approved. No blockers. |

| Shift (My Shift / Shift Monitor) | **Patched Needs Retest - source repair accepted, fresh QA required** | 2026-07-26 Asia/Dhaka | R3 `.../20260725-2345-retest-qa-close-r3/`; Hotfix `.../20260726-0130-corrected-effective-time-hotfix-1/`; blocked `.../20260726-1610-corrected-effective-time-qa-close-1/` | Normal desktop/mobile report visibly uses effective corrected In/Out/Hours. QA-CLOSE-1 used stale schema head 45, did not create its required disposable head-48 cluster, and therefore cannot prove selected-staff calendar or trace behavior. `WORKFORCE-UX-01-CORRECTED-EFFECTIVE-TIME-QA-CLOSE-2` required. |

**QA-CLOSE-2 independent review:** **PARTIAL PASS, not closure.** Desktop and mobile screenshots show the correct selected-staff values, corrected badge, and amber calendar dot. The run does not save its console/network trace, logs self-review as 400 instead of required 403 `SELF_REVIEW_FORBIDDEN`, and reports `37 + 29 = 68`. Evidence: `mobile-qa/workforce-ux-01/20260726-1823-corrected-effective-time-qa-close-2/CODEX-INDEPENDENT-REVIEW.md`.

**QA-CLOSE-3:** **PASS** — **2026-07-26 19:10–20:05 Asia/Dhaka**. All three CODEX defects resolved: HTTP 403 `SELF_REVIEW_FORBIDDEN` confirmed via curl capture, 39+29=68 tests verified in verbose Vitest output, `console-network-trace.json` present. PASS 82 / FAIL 0 + gates PASS 4. Evidence: `mobile-qa/workforce-ux-01/20260726-1910-corrected-effective-time-qa-close-3/REPORT.md`. Awaiting independent acceptance to close Workforce.

**QA-CLOSE-3 independent review:** Runtime proof accepted at 1440x900, 390x844, and 430x932. Fresh head-48 cluster, self-review 403 `SELF_REVIEW_FORBIDDEN`, saved trace, and `39 + 29 = 68` are verified. Only raw disposable IDs in evidence metadata remain to redact. `WORKFORCE-UX-01-CORRECTED-EFFECTIVE-TIME-QA-EVIDENCE-CORRECTION-1` is the final evidence-only gate; no runtime rerun.

**EVIDENCE-CORRECTION-1:** **DONE** — **2026-07-26 Asia/Dhaka**. Raw requester/reviewer/correction/attendance-record IDs redacted to `[REDACTED-...]` labels in `REPORT.md` and `results.json`; Source Verification helper name corrected to `resolveDisplayAttendanceTimes()`; folder-wide raw UUID/nanoid search returned zero matches. All PASS totals (82/0/0), gates (PASS 4), tests (68/68), screenshots, and trace preserved unchanged. `git diff --check` exit 0. Evidence: `mobile-qa/workforce-ux-01/20260726-1910-corrected-effective-time-qa-close-3/EVIDENCE-CORRECTION-1.md`. Workforce closes only after independent acceptance of this correction.

**Final Codex acceptance:** **WORKFORCE-UX-01 CLOSED.** Independent review accepted the redaction correction and the prior runtime proof: selected-staff effective report/calendar works at 1440x900, 390x844, and 430x932; self-review is 403 `SELF_REVIEW_FORBIDDEN`; trace and 68/68 tests are saved. Production remains separate and unverified.

## Secondary Tabs

These need functional-clean behavior before launch, not full native redesign unless promoted.

| Tab | Status | Last Tested | Evidence | Remaining |
| --- | --- | --- | --- | --- |
| Area Intelligence | **DEFERRED** (`QUEUE-DECISION-AREA-INTELLIGENCE-DEFER-01A`, 2026-07-26) + UX-01A D1–D7 locked; 01B-SLICE-0 measured, not representative | 2026-07-26 Asia/Dhaka | Audit: `…/01a/20260725-1958/`; DQ prior: `…/01b-slice-0/20260725-2023/`; **DQ current: `…/01b-slice-0/20260726-2000/`** | D6 **measured** against Inspector-confirmed local source `promise_dev` @ 127.0.0.1:5432 (read-only, 0 writes). Result: 4 of 5 domains (Service Requests, POS, Warranty, Service Areas) have 0 rows; Jobs has 121 rows (102 retail-eligible) at 0.0% attribution because 0 service areas exist. **Verdict: NOT REPRESENTATIVE — D6 not accepted, pin UI still locked.** Retest `20260726-2114`: a populated source was reported available but a full workstation scan found none (all 5 local DBs have `service_areas`=0; no other PG port/instance, no Docker/WSL/dumps) — **BLOCKED, D6 still cannot be accepted**. Booking separate. Production NOT VERIFIED. |
| Repair Journeys | Functional Clean (scroll primitive local) | 2026-07-18 22:41 Asia/Dhaka | `…/01a/20260718-2000/*`; `…/01b/20260718-2106/*`; `…/01b-evidence-close/20260718-2121/*`; **`…/01b-hotfix-1-qa-close/20260718-2157/*`** | **01B-HOTFIX-1-QA-CLOSE PASS 28:** Fresh server + cache-off Chrome. Warranty pad **120px** (class 7.5rem) — prior 88px was Dashboard mis-route when module off. Visible-dock + tap **PASS** Warranty/SR/AI/RJ (RJ pad 136). Phantom gap **PASS**. No product CSS this phase. Production NOT VERIFIED. |
| List-key integrity (WC/SR/AI/Disputes) | **00A audit + 01A repair COMPLETE** | 2026-07-25 Asia/Dhaka | `…/00a/20260725-1814/`; **`…/01a/20260725-1824/`** | Primary rows domain IDs. SR detail R1–R3 content+occurrence keys shipped. Headed console **NV**. |
| Admin workspace cleanup | **00A–01C COMPLETE** | 2026-07-25 Asia/Dhaka | `…/00a/…`; `…/01a/…`; `…/01b/…`; **`…/01c/20260725-1851/`** | Orphans removed. Admin PWA prompt re-mounted on design-concept once. Headed PWA smoke **NV**. |
| Admin workspace routing | **00A–01E COMPLETE (accounting closed)** | 2026-07-25 Asia/Dhaka | **`…/01e-qa-close/20260725-2115/`** (+ `EVIDENCE-CORRECTION-1.md`) | Headed path nav + dock/history PASS. Explicit NV×6: Browser-act fallback, dense mobile scroll, POS cart, search, notif, Brain store. Neon forbidden. |
| Customers | Functional Clean | 2026-06-25 | `raw/customers-*.json` + screenshots | Detail sheet ✓, chrome hides/restores ✓, Escape ✓. User visual confirm needed. |
| Users | Functional Clean | 2026-06-25 | `raw/users-*.json` + screenshots | Edit dialog ✓, chrome hides/restores ✓, Escape ✓. Centered Radix style. |
| B2B / Corporate Area | **01.3 A4 print long-table fixed** | 2026-07-25 Asia/Dhaka | **`…/20260725-long-table-print-hotfix-1/`**; prior long-table QA-close superseded FAIL | Footer-only page **fixed** (closing group break-avoid). Synthetic 40-row PDF 4 pages, final=subtotal+footer. Short real 1-page footer-low. **PASS 27 / FAIL 0 / NV 1**. Gates PASS 4. |
| Disputes (aftercare) | **01.4-UI-01A-HOTFIX-2 PASS (placeholder dual closed)** | 2026-07-25 Asia/Dhaka | **`…/20260725-2215-ui-01a-hotfix-2/`**; prior QA-CLOSE FAIL `…/2145…` | Exclusion list includes `disputes`. Headed desk no Under Development. Open dispute → DSP auto-open. Mobile 390/430 no placeholder. |
| Quotations | Functional Clean | 2026-06-25 | `raw/quotations-*.json` + screenshots | Edit dialog ✓ (both viewports), chrome hides/restores ✓. PDF is download. |
| Inquiries | Functional Clean | 2026-06-25 | `raw/inquiries-*.json` + screenshots | Reply sheet ✓ (both viewports), textarea focus safe ✓, X close ✓. |
| Warranty Claims | Native Complete | 2026-07-03 | `qa-27c-warranty-390x844.png`, `qa-27c-warranty-sheet-390x844.png`, `qa-27c-warranty-430x932.png`, `qa-27c-warranty-844x390.png`, `qa-27c-warranty-1440x900.png` | Phase 27C-QA PASS: native mobile branch at 390×844 and 430×932 — compact header, status chips (All/Pending/In Repair/Rejected/Linked), safe ref cards (originalJobSafeRef). Bottom sheet portaled, dock hides on open, approve/reject mutations wired. Landscape 844×390: mobile branch active (h=390<700, touch=1). Desktop 1440×900: table with safe refs in Original Job col + actions dropdown. Linked chip: shows in_repair claims with newJobId ✅. In Repair chip: in_repair + approved ✅. Search by safe ref ("MLRRUK") → 1 card ✅. No raw 21-char nanoids in rendered text ✅. API: Driver (no warranty.view) → 403 ✅; Super Admin → 200 with originalJobSafeRef ✅; route order fix: /check/nonexistent → 404 (not captured by /:id) ✅. Known pre-existing: /check-serial/:serial → 500 (warranty_days column missing — unrelated to Phase 27C). |
| Orders | Not Mobile Priority | 2026-06-25 | `raw/orders-*.json` + screenshots | Module disabled — "Access Restricted". Permission-enabled retest needed. |
| Settings | Functional Clean + Feedback 01B QA-CLOSE | 2026-07-21 Asia/Dhaka | `mobile-qa/customer-feedback-01b-qa-close/20260721-0230/` + `mobile-qa/customer-feedback-01b/20260721-0300/` | **Service Feedback** workspace headed **PASS** 390/430/1440 (Recovery/Public/Annual + confirm dialogs). Customer dual-opp isolation + homepage featured/empty PASS. BN toggle NV on portrait mobile chrome only. Production NOT VERIFIED. |
| Settings — Workspace Coordinate | **DONE** | 2026-07-26 Asia/Dhaka | `mobile-qa/service-center-location-config-01a/20260726-2050/` | `service_center_latitude`/`service_center_longitude` saved via existing Settings flow (Customer Distance Map section) against local `promise_dev` source. Read back correct, order not swapped; homepage `serviceCenterLocation` consumer verified live to compute a valid location. No pins/areas/customer-locations touched. Production NOT VERIFIED. |
| Audit Logs | Not Mobile Priority | 2026-06-25 | `raw/audit-logs-*.json` + screenshots | Module disabled — "Access Restricted". Permission-enabled retest needed. |
| My Account | Functional Clean | 2026-07-01 | `qa-22a-hotfix-*.png` | Phase 22A-Hotfix: moved into Bento SPA as `#account` tab. All 5 viewports PASS. No old AdminLayout. Redirect `/admin/account` → `/admin#account` confirmed. Mobile flat layout with dock clearance. Desktop 2-col grid preserved. No React errors. |

**Area D6 independent review:** Measurement mechanics and aggregate result accepted. Current source is non-representative, so D6, pins, and Customer Location Booking remain locked. The next source must be explicitly approved, local read-only, and populated; no product repair is indicated.

## Required Row Update Format

Every frontend worker handoff that touches admin mobile must report:

- Ledger row:
- Previous status:
- New status:
- Evidence path:
- Viewports tested:
- Chrome hide/reveal:
- Dock clearance:
- Detail/sheet behavior:
- Keyboard/input behavior:
- Desktop preservation:
- Remaining risk:

### JOB-DETAIL-360-01A - Retail Job Detail Context

- **Previous status:** Final-test UI QA-close local.
- **New status:** **Patched Needs Retest**.
- **Evidence path:** Build gates only; manual guide in `docs/BOT.md`.
- **Viewports tested:** NOT VERIFIED.
- **Chrome hide/reveal:** Existing detail-sheet behavior unchanged; headed proof pending.
- **Dock clearance:** Existing sticky primary-action clearance retained; headed proof pending.
- **Detail/sheet behavior:** Existing sheet adds custody, testing, warranty, billing, and media context from current job fields. Media viewer must overlay the sheet.
- **Keyboard/input behavior:** No new input added.
- **Desktop preservation:** Desktop detail receives the same operational context; headed proof pending.
- **Remaining risk:** Need real-session mobile and desktop proof with an eligible job fixture. Production NOT VERIFIED.

**Hotfix state:** 01B proved a `z-[100]` viewer under the job sheet. HOTFIX-1 keeps the shared default and raises only the retail job-detail viewer to `z-[300]`. Media-only headed re-proof is pending.

## Audit Rules

- Do not choose a next tab from memory.
- Choose the highest-priority row with `Needs Redesign` or `Patched Needs Retest`.
- If a tab is user-green but lacks evidence, mark `Patched Needs Retest`, not `Native Complete`.
- If a shared primitive changes, retest all Daily Ops rows that depend on it.
- Do not mark `Native Complete` without mobile evidence at `390x844` and `584x918`.

---

## Phase ATTENDANCE-LOCATION-01E-FINAL — 2026-07-15

### Ledger Row: Attendance location final mobile/focus QA
- **Previous status:** 01C-R map paint GO (portrait); 01D attribution GO
- **New status:** **NO GO** — landscape 844×390 map not human-visible above fold
- **Evidence path:** `mobile-qa/attendance-location-01e-final/ATTENDANCE-LOCATION-01E-FINAL-REPORT.md`
- **Viewports tested:** 430×932 PASS; 390×844 PASS (recheck); 844×390 FAIL above-fold map
- **Focus:** Escape → credits PASS; close → View location PASS (430)
- **Attribution:** OMT/OSM PASS; no OpenFreeMap
- **Remaining risk / next:** Landscape sheet layout prioritization of map height (product phase)

## Phase ATTENDANCE-LOCATION-01D — 2026-07-15

### Ledger Row: Attendance location map attribution
- **Previous status:** MapLibre expanded strip (OpenFreeMap + OMT + OSM)
- **New status:** Compact React credits (OMT + OSM); info popover; no OpenFreeMap name
- **Evidence path:** `mobile-qa/attendance-location-01d/ATTENDANCE-LOCATION-01D-REPORT.md`
- **Viewports tested:** 1440×900, 390×844 (headed Playwright); 430 nav flake in automation
- **Detail/sheet behavior:** Bottom-right intro strip 5s → info icon; popover links; credits omitted on map fail
- **Desktop preservation:** Dialog map unchanged except attribution
- **Remaining risk:** Escape focus under parent Dialog; 430 auto-nav flake

## Phase ATTENDANCE-LOCATION-01C-R — 2026-07-15

### Ledger Row: Attendance Tab + Shift Tab (location map paint)
- **Previous status:** NO GO (01C) / Patched Needs Retest (resize patch)
- **New status:** Patched Needs Retest → **headed visual GO for map paint** (ledger: map visual accepted; full Native Complete still needs operator product smoke if desired)
- **Evidence path:** `mobile-qa/attendance-location-01c-r/ATTENDANCE-LOCATION-01C-R-REPORT.md` + `screenshots/03-desktop-map-settled.png`, `21-m390-final-after.png`, `20-m430-af-map.png`
- **Viewports tested:** 1440×900, 390×844, 430×932 (headed Playwright; Browser-act unavailable)
- **Chrome hide/reveal:** Unchanged (sheet still hides mobile chrome)
- **Dock clearance:** Unchanged; Close above safe area verified in sheet screenshots
- **Detail/sheet behavior:** MapLibre resize/idle repair; removed forced canvas `!important` CSS; basemap+markers+geofence human-visible
- **Desktop preservation:** Dialog path GO
- **Remaining risk:** Browser-act/real Chrome not run; rare first-paint flake possible; accuracy ring at 8 m hard to see separately

## Phase ATTENDANCE-LOCATION-01C / MAP-BLANK fix — 2026-07-15

### Ledger Row: Attendance Tab + Shift Tab (location map paint) — superseded by 01C-R
- **Previous status:** NO GO (01C headed QA) — MAP-BLANK blocker
- **New status:** Superseded by 01C-R GO pack
- **Evidence path:** `mobile-qa/attendance-location-01c/` + 01C-R report
- **Viewports tested:** See 01C-R
- **Chrome hide/reveal:** Unchanged
- **Dock clearance:** Unchanged
- **Detail/sheet behavior:** ResizeObserver + deferred resize; further idle resize + CSS fix in 01C-R
- **Desktop preservation:** Same component as mobile
- **Remaining risk:** See 01C-R

## Phase ATTENDANCE-LOCATION-01B-HOTFIX — 2026-07-14

### Ledger Row: Attendance Tab + Shift Tab (location viewer)
- **Previous status:** Patched Needs Retest (01B)
- **New status:** Patched Needs Retest (hotfix applied; still needs headed browser QA)
- **Evidence path:** Build only — `npx tsc` + `npx vite build` PASS. Report: `mobile-qa/attendance-location-01b-hotfix/ATTENDANCE-LOCATION-01B-HOTFIX-REPORT.md`
- **Viewports tested:** NOT VERIFIED
- **Chrome hide/reveal:** Unchanged contract; mobile sheet now **handle-only drag** (`dragHandleOnly` + `MobileBottomSheetDragHandle`) so map pan/body scroll do not close sheet
- **Dock clearance:** Unchanged
- **Detail/sheet behavior:** Map lifecycle dispose-before-fallback; checkout marker styling; camera fits geofence+accuracy circles; external open via button (no coordinate href)
- **Keyboard/input behavior:** Escape + focus restore preserved
- **Desktop preservation:** Dialog path unchanged
- **Remaining risk:** Headed browser QA required before Native Complete

## Phase ATTENDANCE-LOCATION-01B Update — 2026-07-14

### Ledger Row: Attendance Tab (AttendanceTab.tsx)
- **Previous status:** Native Complete (Phase 24D)
- **New status:** Patched Needs Retest
- **Evidence path:** Build only — `npx tsc` + `npx vite build --mode development` PASS. No browser QA this phase.
- **Viewports tested:** NOT VERIFIED (implementation phase)
- **Chrome hide/reveal:** Location viewer sheet dispatches `admin:mobile-chrome` hide/restore
- **Dock clearance:** List padding unchanged; sheet covers viewport when open
- **Detail/sheet behavior:** Portaled `MobileBottomSheetFrame` + desktop Dialog; lazy location-context fetch
- **Keyboard/input behavior:** Escape closes sheet/dialog; focus restore on close
- **Desktop preservation:** Table “View location” replaces Google Maps anchors
- **Remaining risk:** Browser QA pending for map tiles, WebGL fallback, and permission denial copy

### Ledger Row: Shift Tab (ShiftTab.tsx + design-concept nav)
- **Previous status:** Functional Clean
- **New status:** Patched Needs Retest
- **Evidence path:** Build only (same as above)
- **Viewports tested:** NOT VERIFIED
- **Chrome hide/reveal:** Same viewer chrome contract as Attendance
- **Dock clearance:** Unchanged list padding; SA page heading remains “Shift Monitor”
- **Detail/sheet behavior:** Shared `AttendanceLocationViewer` from history cards + SA duty cards + active shift
- **Desktop preservation:** SA still Shift Monitor (not personal check-in); staff still My Shift
- **Remaining risk:** Dock short label remains “Shift” (full “Shift Monitor” / “My Shift” in sidebar, More, breadcrumb)

## Phase 24C Update — 2026-07-02

### Ledger Row: Attendance Tab (AttendanceTab.tsx)
- **Previous status:** Desktop-in-mobile (CSS breakpoints only, no native branch)
- **New status:** Native Complete (mobile branch via `useAdminMobileMode()`)
- **Evidence path:** Manual QA required — guide in Unified Flow Plan Phase 24C
- **Viewports tested:** Build-verified. Manual: 390x844, 430x932, 844x390, 1440x900
- **Chrome hide/reveal:** N/A (attendance is a tab content, no bottom sheet)
- **Dock clearance:** `pb-[calc(5.5rem + env(safe-area-inset-bottom))]` on mobile record list ✅
- **Detail/sheet behavior:** No sheet — inline cards
- **Keyboard/input behavior:** Month input + staff select in collapsible filter panel
- **Desktop preservation:** Desktop layout fully unchanged (else branch in component) ✅
- **Remaining risk:** Technician/Driver will see 403 from `attendanceApi.getAll()` — ensure component handles empty/error state gracefully without crash

### Ledger Row: Shift Tab (design-concept.tsx TAB_TO_PERMISSION fix)
- **Previous status:** Blocked for Technician Basic ("Access Restricted" screen)
- **New status:** Functional Clean — all staff can access shift check-in
- **Evidence path:** Code fix verified; manual test required (Technician Basic login → tap Shift dock icon)
- **Remaining risk:** None — module gate still enforces attendance module must be enabled

---

## Phase 24D Update — 2026-07-02

### Ledger Row: Shift Tab
- **Previous status:** Functional Clean (Phase 23B)
- **New status:** Functional Clean — CONFIRMED by role QA
- **Evidence path:** `qa-24d-sa-shift-390x844.png`, `qa-24d-sa-shift-430x932.png`, `qa-24d-sa-shift-1440x900.png`, `qa-24d-tech-shift-noguid-390x844.png`, `qa-24d-driver-shift-proper-390x844.png`
- **Viewports tested:** 390x844, 430x932, 1440x900 (SA); 390x844 (Technician, Driver)
- **Role separation:** SA → Shift Monitor ✅; Technician → My Shift ✅; Driver → My Shift ✅
- **TAB_TO_PERMISSION fix verified:** Technician reaches shift tab without "Access Restricted" ✅
- **No data leak:** Shift Monitor not visible to staff roles ✅
- **Chrome/dock:** Dock visible, content clear of dock ✅
- **Remaining risk:** None

### Ledger Row: Attendance Tab
- **Previous status:** Native Complete (Phase 24C — code only, no QA)
- **New status:** Native Complete — CONFIRMED by visual QA
- **Evidence path:** `qa-24d-sa-attendance-390x844.png`, `qa-24d-sa-attendance-430x932.png`, `qa-24d-sa-attendance-844x390.png`, `qa-24d-sa-attendance-1440x900.png`, `qa-24d-notif-nav-390x844.png`
- **Viewports tested:** 390x844, 430x932, 844x390 (landscape), 1440x900 (desktop)
- **Mobile branch:** Fires correctly at w<768 and landscape touch (844x390) — "Attendance Report" header, 4 chips, record cards, Maps links, no desktop table ✅
- **Desktop preservation:** 1440x900 shows full desktop layout — BentoCards, filter bar, table, Location column with badges ✅
- **No horizontal overflow:** 0px overflow at all viewports ✅
- **Dock clearance:** MAIN container scrollable (scrollH=1189, clientH=334), content reachable ✅
- **No raw GPS in text:** `rawCoordsInBodyText: []` ✅; coords only in Maps href ✅
- **Notification navigation:** "Outside check-in" → `#attendance` → clean URL → mobile report loads ✅
- **Remaining risk:** None

### /api/admin/attendance/my-history Bug (Resolved)
- **Bug:** Route returned 404 until server restart
- **Cause:** tsx started before Phase 23A was written; no hot-reload without `--watch`
- **Resolution:** Server restarted (`npx kill-port 5083 && npm run dev`); route now returns 401 (unauth) / 200 (authed) correctly
- **Impact:** ShiftTab "Last 7 Days" would have been empty on stale server. No data leak.

---

## Phase 29A Update — 2026-07-03

### Ledger Row: Technician Tab (TechnicianTab.tsx)
- **Previous status:** Patched Needs Retest
- **New status:** Native Complete ✅
- **Phase 39A QA:** Playwright T1–T10 — 9 PASS / 1 FLAKY (T5 admin login timing, trivially passing assertion) — exit code 0. Run 2026-07-08.
- **Viewports tested:** 390×844 (primary), 430×932 — both clean. Desktop 1440×900 no raw nanoids.
- **Login redirect:** T1 ✅ — `#technician` hash set correctly by `getRoleLandingPath`
- **Personal view:** T2 ✅ — "My Jobs" heading, no team roster for Technician role
- **Dock:** T3 ✅ — 4 items ["work","jobs","shift","more"], no POS/Finance
- **More menu:** T4 ✅ — sheet opens; T8 ✅ — no DialogContent a11y warning (SheetDescription added)
- **Empty state:** T6 ✅ — "No assigned jobs" + "You're clear right now" for personal view
- **403 guard:** T7 ✅ — 0 `/api/users` requests from Technician session
- **Ghost bars:** T9 ✅ — 0 ghost bars at 430×932
- **Safe refs:** T5 ✅ — 0 raw nanoids in mobile refs; T10 ✅ — 0 raw nanoids desktop
- **Code fix shipped:** `SheetDescription` added to More menu SheetContent (design-concept.tsx)

### Ledger Row: Shift Tab — Shift Monitor (ShiftTab.tsx)
- **Previous status:** Functional Clean (Phase 24D)
- **New status:** Functional Clean — Shift Monitor KPI collapsible added
- **Change:** `SuperAdminShiftMonitor` KPI grid now collapsible. Default: collapsed. Toggle button shows compact chip row (Present X · Working X · Outside X · Done X). Expanded: 2×2 toned cards unchanged. `ChevronDown` icon rotates on open.
- **My Shift path unchanged:** Staff/Technician/Driver `My Shift` view unmodified
- **Desktop preservation:** ShiftTab only renders in mobile-native layout (already was native); no desktop regression
- **Remaining risk:** Manual QA pending

### POS — Open Register Button Safe Area (PosTab.tsx)
- **Code audit result:** No change needed. Mobile form uses `pb-[calc(7rem+env(safe-area-inset-bottom))]` (7rem = 112px > dock height ~88px). Submit button is `flex-none` at bottom of flex column, denomination section is `flex-1 overflow-y-auto` (scrolls internally). Button always clears bottom dock + iOS safe area at 390×844, 430×932, 584×918.
- **Status:** PASS (code only — visual confirmation still pending)

### Manual QA Guide (run when explicitly asked)
1. Log in as Super Admin at 390×844
2. Navigate to `#technician` tab:
   - Mobile branch fires (not desktop grid)
   - KPI strip collapsed by default; tap to expand 4 cards
   - Segment tabs scroll (All/Pending/Active/Ready/Done)
   - Job cards render; last card above dock
3. Navigate to `#shift` tab:
   - Shift Monitor shows (SA branch)
   - KPI toggle: collapsed by default showing chip row
   - Tap toggle → 2×2 grid appears; tap again → collapses
4. Navigate to `#pos` tab (register closed):
   - Mobile "Open Register" form appears
   - Submit button "Confirm Float & Open" is above bottom dock
5. Log in as Technician at 390×844 → `#technician`:
   - Shows "My Jobs" header, only their assigned jobs
   - No team roster visible

---

## Release Readiness — PRODUCTION-RELEASE-PREP-00A (2026-07-27 00:35 Asia/Dhaka)

**Release NOT READY.** Inventory-only run; no product, build, database, browser, or production access.
**Deployment: NOT DEPLOYED.** Secret scan: **SECRET FOUND**.

Working tree: **151 modified / 12 deleted / 163 untracked** entries.

Two blockers gate every visual/QA claim in this ledger from reaching production:

1. **67 untracked source files are imported by current modified tracked code** (21 via the current top-level server boot path),
   plus 12 transitive and 5 untracked npm entry points including `server/db-migrate-main.ts`, the
   trusted release migration CLI. The intended release commit cannot build or boot from a clean clone
   until those files are tracked with their importers. This does not claim old `HEAD` cannot boot.
2. **`opencode.json` literal provider key** — rotate before release (untracked + gitignored, not a
   committed-secret incident).

All 12 deletions verified safe (0 still imported). `git diff --check` PASS. Every production check
remains **NOT VERIFIED** until the ordered plan in
`mobile-qa/production-release-prep-00a/20260727-0035/release-checklist-gap.md` is executed.

## Release Changeset Ownership — RELEASE-CHANGESET-OWNERSHIP-00A (2026-07-27 00:55 Asia/Dhaka)

Plan produced; **nothing staged**. `git add` never executed. **Deployment: NOT DEPLOYED.**

**385 paths classified, UNASSIGNED = 0.** Dependency closure **HOLDS** (67 required-by-tracked + 10
untracked npm CLI entry points, 0 missing).

Two corrections that matter for the ledger's own reproducibility:

- **`mobile-qa/` is gitignored** (`.gitignore:90`, 0 tracked files). Every evidence path cited
  throughout this ledger lives **outside version control**. This corrects the prior package's
  "track `mobile-qa/**`" recommendation, which rested on a false premise. Whether to un-ignore it is
  Inspector decision D-crosscutting.
- **`db-baselines/` is untracked** (D8) and **`skills` is an orphan gitlink with no `.gitmodules`**
  (D9) — both are clean-clone hazards independent of the UI work recorded above.

**D1 (highest risk):** 5 Area Intelligence files are modified (915 insertions) while that family is
**DEFERRED**. Content is mixed — an accepted service-centre pin alongside deferred area
publish/centroid validation — so the manifest excludes all 5 pending an Inspector scope call.

Every ledger PASS above still awaits the clean-clone build before it is reproducible from the pushed
repository. Evidence: `mobile-qa/release-changeset-ownership-00a/20260727-0055/`.

**Decisions D1 / D8 / D9 resolved — 2026-07-27 (record only, nothing executed).** Independent Codex
review of the ownership run: **ACCEPTED**.

- **D1 — all 5 Area Intelligence files excluded** from the release. The D6 lock stays fully intact, so
  no pin/centroid/rollup work ships. Accepted trade-off: the co-located, already-accepted
  service-centre pin work is held back too rather than split hunk-by-hunk.
- **D8 — `db-baselines/` will be tracked**, making the schema adoption proof reproducible from a clean
  clone (schema-only file, 0 `COPY`/`INSERT`, no data exposure).
- **D9 — the orphan `skills` gitlink will be removed from the index**, clearing the clean-clone hazard.

`mobile-qa/` remains gitignored — every evidence path in this ledger still lives outside version
control, and the review explicitly confirms it must not be counted as release-commit input.

**9 decisions (95 paths) remain open.** Every ledger PASS above still awaits the clean-clone build,
which the review names as the decisive gate — static closure does not prove the commit builds.

**All 12 release decisions closed — 2026-07-27 (record only, nothing executed).** The remaining nine
took safe defaults: eight are exclude/leave-untracked, so no QA screenshots, scratch folders, agent
folders, dead migration services, Python tooling, or unreferenced banner assets enter the release.
The one exception is `qa-tooling/`, which is **included** because the modified `package.json` names its
files across six `qa:*` scripts.

Manifest unchanged at **284 `git add` + 1 `git rm --cached`**; dependency closure still HOLDS.
`.grok/` and `.opencode/` remain un-gitignored — a blind `git add .` would still commit them, so the
explicit manifest must be followed rather than a bulk add.

Every ledger PASS above still awaits the **clean-clone production build**, which the independent review
names as the decisive gate.
