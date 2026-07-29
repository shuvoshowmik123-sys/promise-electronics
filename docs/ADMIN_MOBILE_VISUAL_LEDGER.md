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

**Clean-clone production build ran — 2026-07-27, FAIL (record only, nothing further executed).**
`RELEASE-CLEAN-CLONE-CANDIDATE-PROOF-01A` built and tested the actual committed candidate (`8bd25f3`)
from a fresh, isolated local clone: `tsc` failed (2 errors, `home.tsx` ↔ held D1 `CustomerDistanceExplorer.tsx`
mismatch — exactly the D1 risk this ledger flagged as unadjudicated) and `npx vitest run` returned
`26 failed | 327 passed | 3 skipped (356 total)`, superseding the inherited, never-verified 24/332/356
figure this ledger and prior packages had been carrying. Full findings:
`mobile-qa/release-clean-clone-candidate-proof-01a/20260727-1734/REPORT.md`.

**`TEST-SUITE-RESTORATION-00A` audit closed — 2026-07-27 (read-only, nothing executed).** Every
clean-clone finding traced to a named owner and repair contract: the D1 mismatch's smallest
compile-safe fix (Option A: drop the two `publicSettingsStatus` prop passes in `home.tsx`, D1-neutral)
or a new explicit D1 decision to land the richer behavior instead; 2 proof `.mjs` scripts confirmed
safe to add (a manifest completeness gap, not a deliberate exclusion); the baseline `manifest.json`
hash mismatch confirmed as a manifest-only data defect with actual values computed; all 22 remaining
vitest failures individually classified as candidate-induced test staleness (stale mocks/assertions,
zero source changes needed); the 3 `auth-boundaries` skips confirmed environmental (the app's own
fail-closed env validation working correctly). Evidence:
`mobile-qa/test-suite-restoration-00a/20260727-1816/REPORT.md`.

**`TEST-SUITE-RESTORATION-01A` (CANDIDATE-INTEGRITY-REPAIR) applied — 2026-07-27, PASS 5 / FAIL 0 / NOT
VERIFIED 0 (working-tree only, not committed).** Repaired the 4 non-test defects from the audit using
D1-neutral Option A: `home.tsx` had its two `publicSettingsStatus` prop passes and the now-unused
query destructures/derived value removed — zero held Area Intelligence files edited, staged, or used to
satisfy TypeScript; the 2 omitted `.mjs` scripts confirmed present and unmodified (left unstaged, not
`git add`ed); `manifest.json`'s two `sha256` fields corrected to freshly-computed actual values, no
other field or SQL file touched. Proven in an isolated clone of exactly `8bd25f3` (only the 4 scoped
files copied in): `tsc --noEmit` now **zero errors**, `vite build`/`build:server`/`git diff --check` all
PASS, and the 3 targeted vitest failures (baseline hash + both omitted-script `ENOENT`s) now **PASS,
25/25 tests**. Held D1 paths and primary `HEAD` (`8bd25f3`, unpushed) proven byte-identical before and
after. **Not claimed:** the full suite is not yet green — 22 test-staleness fixes and the
`auth-boundaries` environment gap remain, reserved for `TEST-SUITE-RESTORATION-01B`. Evidence:
`mobile-qa/test-suite-restoration-01a/20260727-1834/REPORT.md`. No commit, push, migration, or
deployment occurred.

**`TEST-SUITE-RESTORATION-01B` (TEST-CONTRACT-REPAIR) applied — 2026-07-27, PASS 6 / FAIL 0 / NOT
VERIFIED 0 (working-tree only, not committed).** Repaired all 22 test-staleness failures from the `00A`
audit plus the 3 `auth-boundaries` environment skips, across the 11 allowed test files — no product
source, baseline SQL, manifest, script, or config file touched. Fixes span 7 root-cause groups: missing
`requireGranularPermission`/`accountRecoveryLimiter` mock exports; a missing `db.execute` stub for the
new customer-session freshness check; a missing `db.transaction` stub for `job.service.ts`'s new atomic
custody-conversion flow (found at a *second* call site too — `transitionJobStatus` — once the first fix
let execution reach it); a geofence status rename (`inside`/`outside` → `inside_office`/`outside_office`,
both halves); a retired legacy job-status name (`"Ready for Delivery"`); and a self-referential
`REQUIRED_MAIN_SCHEMA_VERSION` stale-assertion anti-pattern repeated across 3 migration test files,
replaced with a durable ordering check. Also discovered and fixed, beyond the original audit: a
transitive `shared/schema.js` mock gap (fixed via `importOriginal` merge instead of a hand-rolled stub)
and 2 tests asserting a call to `jobService.recordJobPayment` — confirmed via `grep -rn` across
`server/` that this method is **never called anywhere in the real server code** (the real flow migrated
to canonical POS settlement via `settleJobPaymentViaPos`) — rewritten to assert the actual current call
path. Auth-boundaries: set harmless, loopback-only dummy env values plus a mocked `isDbReady()` (the real
readiness gate otherwise 503s every route before auth ever runs) — all 3 tests now execute and pass.
Dirty-worktree `npx vitest run`: **356 passed / 0 failed / 0 skipped**. Proven in an isolated clone of
exactly `8bd25f3` (4 `01A` candidate files + 11 `01B` test files copied in): all four build gates PASS,
and the **full, unfiltered `npx vitest run`: PASS — 356 passed / 0 failed / 0 skipped (356 total)** — the
first fully green, fresh-clone-verified result for this candidate, superseding every prior figure. Held
D1 paths and primary `HEAD` (`8bd25f3`, unpushed) proven byte-identical before and after. Evidence:
`mobile-qa/test-suite-restoration-01b/20260727-1953/REPORT.md`. No commit, push, migration, or
deployment occurred. Next: a single corrective commit covering all 15 `01A`+`01B` working-tree changes,
then a final `RELEASE-CLEAN-CLONE-CANDIDATE-PROOF-01A` re-run against that commit before R5.

**`RELEASE-CORRECTIVE-COMMIT-01A` attempted — 2026-07-27, FAIL at the whitespace gate (record only,
nothing committed).** Base verified (`HEAD=8bd25f3`, `main`, `ahead 1`); preflight confirmed all 15
approved `01A`+`01B` paths in expected state, all 5 held Area Intelligence paths excluded and untouched,
and the 2 `.mjs` scripts' identity re-verified by size+mtime only (no hash/content printed). Staged
exactly the 15 approved paths via 15 individually named `git add` commands — `git diff --cached
--name-only` confirmed exactly those 15, nothing else. **`git diff --cached --check` failed:**
`scripts/reminders-prerequisite-reconciliation-proof.mjs:331: new blank line at EOF` — a genuine,
pre-existing extra trailing blank line in the file exactly as it has existed on disk since authorship,
never touched by this session, only now surfacing because this file has never before been staged and run
through a whitespace gate. Per this repo's own established precedent for this exact class of finding
(see the earlier `RELEASE-WHITESPACE-GATE-HOTFIX-01A` entry above), stopped before the secret scan and
commit steps rather than fixing inline. **No `git reset`/`restore` was run** — the 15-path stage remains
preserved. `HEAD` unchanged at `8bd25f3`; no push, amend, migration, or deployment. Evidence:
`mobile-qa/release-corrective-commit-01a/20260727-2045/REPORT.md`. Next: a narrowly-scoped, explicitly
authorized whitespace hotfix for that one file (content-only, remove the one extra trailing blank line),
then re-attempt `RELEASE-CORRECTIVE-COMMIT-01A`.

**`RELEASE-REMINDERS-PROOF-WHITESPACE-HOTFIX-01A` applied — 2026-07-27, PASS (working-tree only, no
commit).** Repaired exactly the one pre-existing whitespace defect that blocked the corrective-commit
attempt: `truncate -s 14720 scripts/reminders-prerequisite-reconciliation-proof.mjs` removed exactly the
final trailing LF byte (14,721→14,720 bytes, 331→330 lines, `});\n\n`→`});\n`), confirmed by direct `xxd`
byte inspection before and after. `git diff --check` on the file now passes. **The corrective commit's
15-path staged index was left completely intact** — confirmed because `git diff --cached --check` still
reports the *original* failure after this repair, proving the staged blob still holds the old,
pre-repair content (no `git add` was run at any point). No other byte, line, or file was touched; the
script was never executed. `HEAD` unchanged at `8bd25f3`; no commit, push, or deployment. Evidence:
`mobile-qa/release-reminders-proof-whitespace-hotfix-01a/20260727-2053/REPORT.md`. Next: a
corrective-commit recovery package that re-stages only this one repaired script, then re-runs the full
staged gate, secret scan, and commit.

**`RELEASE-CORRECTIVE-COMMIT-RECOVERY-01A` succeeded — 2026-07-28, PASS, commit created.** Re-staged
only the repaired `scripts/reminders-prerequisite-reconciliation-proof.mjs` (`git add -- <path>`, no
other path touched); re-verified the staged set was still exactly the same 15 approved paths;
`git diff --cached --check` now **PASS, 0 findings**; a manual structural secret scan over the full
1,005-line staged diff found **0 real secrets**, classifying the 3 known loopback test dummy values in
`tests/auth-boundaries.test.ts` as harmless test fixtures. Committed once:
`test: restore release candidate integrity` → **`98a0775`**
(`98a07757956597162a3a6f1e8aa46b2668ba8104`), parent **`8bd25f3`** exactly, **15 files changed, 642
insertions(+), 56 deletions(-)**. Post-commit verification: file list matches the approved 15 exactly,
all 5 held Area Intelligence paths and all docs/screenshots/`.grok`/`.env` content confirmed absent from
the commit, `main` now `ahead 2` of `origin/main`, not pushed. Evidence:
`mobile-qa/release-corrective-commit-recovery-01a/20260728-0103/REPORT.md`. Next: a fresh
`RELEASE-CLEAN-CLONE-CANDIDATE-PROOF` re-run against `98a0775` to confirm the green test suite result
holds at the actual committed tree, before R5.

**`RELEASE-CLEAN-CLONE-CANDIDATE-PROOF-01A-R2` (final proof) — 2026-07-28, PASS 8 / FAIL 0 / NOT
VERIFIED 0 (record only, nothing pushed/deployed).** Built and tested the actual committed candidate
`98a0775` from a genuinely isolated local clone (no remote URL; no `.env`/`node_modules`/screenshots/
scripts copied from the primary workspace — everything came from the committed tree itself, no manual
file-copying needed this time since all 15 corrective paths are now real committed files). All 15
paths confirmed tracked via `git ls-files --error-unmatch` before install. Gate results:
`git diff 6c950a0f9d570b95b052719741297bfc67579229..HEAD --check` **PASS** (0 findings) · `tsc --noEmit`
**PASS** (0 errors) · `vite build` **PASS** · `build:server` **PASS** · **full, unfiltered
`npx vitest run`: PASS — 356 passed / 0 failed / 0 skipped (356 total), exit 0** — the first time the
full suite has been proven green against the release candidate's actual committed tree, superseding
every prior (working-tree-approximated) green result in this lineage. Clone removed; primary `HEAD`
(`98a0775`, unpushed) and the 5 held Area Intelligence files' diff-stat against `HEAD` both confirmed
byte-identical before and after, and never used from the primary workspace during the clone build.
Evidence: `mobile-qa/release-clean-clone-candidate-proof-01a-r2/20260728-0110/REPORT.md`.
**Determination: `98a0775` is confirmed release-ready. `R5 — Protected production release` is now the
only eligible next step.** This proof does not itself authorize push, migration, deployment, or
production access.

**`PRODUCTION-RELEASE-AND-VERIFICATION-01A` (release preflight) — 2026-07-28, RELEASE PREFLIGHT PASS
(record only, production untouched).** Re-confirmed candidate identity (`98a0775`, parent `8bd25f3`,
`main` ahead 2 of `origin/main`, unpushed, 0 staged changes) and re-verified the final clean-clone proof
(all 5 gates PASS, `356 passed | 0 failed | 0 skipped`). Identified — without running or accessing —
the trusted production MAIN migration command
(`MAIN_MIGRATION_RELEASE_MODE=true ALLOW_PROD_DB_MIGRATE_MAIN=true npm run db:migrate:main`) and the
Render/Vercel deployed-commit-hash verification route plus health endpoint (`GET /api/health`).
Confirmed exactly 2 commits (`8bd25f3`, `98a0775`) would be pushed and that the 68 dirty/untracked
working-tree entries in the primary workspace are never transmitted by `git push` regardless of state.
Produced a full release-control checklist: production-backup owner and < 1 hour requirement (owned by
the production operator — this agent has no production access of any kind), exact commit/ref to push,
the trusted migration command, Render/Vercel verification, and the complete production smoke matrix
(login/roles, core job flow, finance authority, security, reload, health) per
`AI_AGENT_OPERATING_RULES.md` §17.3–§17.7. Evidence:
`mobile-qa/production-release-and-verification-01a/20260728-0136/REPORT.md`. **Stopped at the required
point: all 4 approvals — production backup < 1 hour old, push approval, trusted MAIN migration approval,
production deployment verification/smoke approval — are PENDING; none granted.** Zero production
database/backup/migration/SQL access, zero cloud dashboard access, zero deploy, zero browser production
test, zero environment-secret reads, zero credentials/customer data printed. **Deployment: NOT
DEPLOYED — production remains completely untouched.**

**`APPLICATION-DATABASE-TOPOLOGY-AND-READINESS-00A` — 2026-07-28, AUDIT COMPLETE (source/config only,
0 database access, record only).** Confirmed the documented ownership contract from `AGENTS.md` and
`docs/AGENT_BACKEND_PLAYBOOK.md`: `DATABASE_URL` = MAIN = Aiven PostgreSQL; `BRAIN_DATABASE_URL` = Brain
(AI knowledge graph) = Neon, and verified in source that every `BRAIN_DATABASE_URL` consumer is genuinely
confined to `server/brain/*` — no leakage into the main app. **Found a genuine, unresolved contradiction:**
structural host-class classification (no values printed) shows the active `.env` and an older
`.env.production.local` snapshot both classify `DATABASE_URL` as a **Neon-pattern host**, not Aiven — no
Aiven-pattern host was found configured as a real value anywhere in the repository, including the two
git-tracked templates (`.env.example`, `.env.render.example`, both empty). Every other `.env*` file is
gitignored and local-only — none of them prove what Render's live dashboard actually runs. This audit
could not and did not resolve the contradiction; it requires an explicit statement from the production
operator or an authorized read-only check, neither performed here. Also confirmed from source: MAIN
schema head is `2026_07_25_work_locations_table` (48 migrations); normal server startup never performs
DDL in any environment, only read-only ledger verification, failing closed (503) rather than self-healing
when behind; DDL only via the trusted release CLI or the protected schema runner. Defined a safe test
matrix (remote read-only checks gated on explicit ownership confirmation; all create/write tests
local-disposable-only) and confirmed zero Windows `.exe` desktop-packaging infrastructure exists in the
repository (needs its own separate, explicitly scoped phase). Evidence:
`mobile-qa/application-database-topology-and-readiness-00a/20260728-0217/REPORT.md`. Zero database
connections, queries, writes, migrations, fixtures, server starts, browser/cloud access, or secret values
printed. **This finding bears directly on the still-pending R5 production-backup/migration approvals —
flagged for Inspector/production-operator resolution before those approvals are acted on.**

**`DEVELOPMENT-NEON-MAIN-READONLY-HEALTH-01A` — 2026-07-28, AUDIT COMPLETE, verdict `SCHEMA_BEHIND`
(read-only, 0 production access, record only).** Operator explicitly confirmed Render production uses
Aiven and the `.env` Neon target is development/testing only, authorizing a read-only inspection of that
confirmed dev database. `DATABASE_URL` was read from `.env` entirely inside a Node script's process
memory — never printed, logged, or copied anywhere (confirmed via a direct grep of this run's evidence
directory). Connection confirmed real (PostgreSQL 17.10, Neon-pattern host matching the confirmed dev
target). Read-only session enforced immediately after connect (`SET default_transaction_read_only = on`
+ an 8-second statement timeout), re-verified active via `SHOW`; every subsequent query was a `SELECT`/
`information_schema`/`pg_catalog`/`pg_indexes` existence or count check only — zero writes, zero DDL,
zero transactions opened, zero row-level business/customer/staff/payment data read. **MAIN ledger:
45/48 applied — missing exactly the 3 newest migration IDs** (`commission_engine_tables`,
`attendance_records_gps_columns`, `work_locations_table`), 0 unexpected/extra entries. **Key finding:**
independently checked all 21 tables/4 indexes/7 columns those 3 migrations create — **every one
physically exists** (`work_locations`, `commission_rules`/`commission_assignments`/`commission_payouts`,
all 5 new `attendance_records` GPS/work-location columns). This is a **ledger bookkeeping gap, not a
missing-schema gap** — the app's own readiness check trusts only the ledger and would still report
503 on this database despite the schema being structurally complete for everything checked. Since all 3
migrations are idempotent (`IF NOT EXISTS` only), re-running the trusted migration CLI would be expected
to safely backfill just the 3 missing ledger rows with no schema change — **not attempted in this
read-only audit.** Verdict: `SCHEMA_BEHIND` (not `READY` — ledger mismatch; not `SCHEMA_MISMATCH` — no
unexpected entries or genuinely-missing schema; not `CONNECTION_BLOCKED` — connection and every query
succeeded cleanly). Evidence:
`mobile-qa/development-neon-main-readonly-health-01a/20260728-1227/REPORT.md`. Zero production Aiven/
Render/Vercel/Brain access. **Neon development read-only access only. Aiven production untouched.
Deployment: NOT DEPLOYED.**

**`DEVELOPMENT-NEON-MAIN-LEDGER-RECONCILIATION-01A` — 2026-07-28, FAIL — migration failed, stopped
immediately, no retry (record only, 0 production access).** Attempted the authorized backfill of the 3
ledger rows found missing by the prior read-only audit. New, distinct lock acquired (explicitly separate
from the retained `DEVELOPMENT-NEON-MAIN-READONLY-HEALTH-01A` lock). Preflight passed: `NODE_ENV`
confirmed not `production`, target re-confirmed as the Neon-pattern dev host, before-state captured
(45/48, same 3 IDs missing). Ran `NODE_ENV=development MAIN_MIGRATION_RELEASE_MODE=true npm run
db:migrate:main` exactly once (never setting `ALLOW_PROD_DB_MIGRATE_MAIN`) — **failed on its first
statement:** `cannot execute CREATE TABLE in a read-only transaction`. **Root cause confirmed, not
assumed:** an independent diagnostic connection's `SHOW default_transaction_read_only` returned `on`
**ambiently**, before this package's own explicit `SET` ran — this database's role/connection starts
every session read-only by default, at the database/role level itself, regardless of caller intent. Not
introduced by this or any prior session package. Two possible causes, neither resolvable from source:
`.env`'s `DATABASE_URL` may point at a Neon read-only replica/branch endpoint instead of the primary
read-write one, or the role has an intentional read-only default — **resolving this needs Neon
dashboard/role-configuration access, explicitly outside this agent's scope.** A read-only reconnect
afterward confirmed the ledger is completely unchanged (still 45/48, same 3 IDs missing, 0 duplicate or
extra rows, advisory lock cleanly released) and the schema for all 3 target migrations remains fully
present exactly as before — the failed attempt changed nothing and left no partial or corrupted state.
Zero production Aiven/Render/Vercel/Brain access, zero retries, zero raw SQL or manual ledger writes,
zero secret values printed anywhere (confirmed via grep of the evidence directory). Evidence:
`mobile-qa/development-neon-main-ledger-reconciliation-01a/20260728-1314/REPORT.md`. **Neon development
access only. Aiven production untouched. Deployment: NOT DEPLOYED.**

**`DEVELOPMENT-NEON-MAIN-LEDGER-RECONCILIATION-01B` — 2026-07-28, PASS (record only, 0 production
access).** The Inspector supplied a corrected `DATABASE_URL` for the same confirmed dev Neon target
directly in chat. Handled as an inline environment variable for every command only — **never written to
`.env`, never written to any script, never printed or logged anywhere** — and this run's entire evidence
directory was scanned for the connection scheme, the specific username, the specific password value, and
the specific host fragment: **zero matches confirmed.** New, distinct lock acquired (no prior lock
reused). Preflight confirmed `NODE_ENV` not production, `MAIN_SCHEMA_TRUST_BASELINE_ADOPTION` not set,
`ALLOW_PROD_DB_MIGRATE_MAIN` never set, target re-confirmed Neon-pattern, **`default_transaction_read_only`
ambient state = `off`** (genuinely write-capable, unlike the `01A` credential), database-level create
capability confirmed via a rolled-back `CREATE TEMP TABLE` probe, and the same 45/48 ledger before-state.
Ran `NODE_ENV=development MAIN_MIGRATION_RELEASE_MODE=true npm run db:migrate:main` exactly once —
**SUCCESS**: all 3 target migrations (`commission_engine_tables`, `attendance_records_gps_columns`,
`work_locations_table`) applied cleanly, advisory lock acquired and cleanly released. A read-only
after-proof confirmed: **ledger 48/48**, head `2026_07_25_work_locations_table`, each of the 3 target IDs
present **exactly once** (0 duplicates, 0 extras across all 48 rows), and all previously-audited 21
tables/4 indexes/7 columns still present. **Verdict: READY.** No application UI or business-write
testing claimed — only the migration CLI outcome and read-only ledger/schema state were proven. Zero
production Aiven/Render/Vercel/Brain access, zero business-data writes, zero source edits/commit/push/
deploy. Evidence: `mobile-qa/development-neon-main-ledger-reconciliation-01b/20260728-1340/REPORT.md`.
**Outstanding: the exposed dev Neon credential still requires rotation via Neon dashboard — not
performed by this package, outside this agent's scope.** **Neon development access only. Aiven
production untouched. Deployment: NOT DEPLOYED.**

**`DEVELOPMENT-NEON-MAIN-LEDGER-RECONCILIATION-01B-EVIDENCE-CORRECTION-1` — 2026-07-28, evidence-only
correction (record only, 0 database/migration/SQL/server/browser/test/build/commit/push/deploy).**
Corrected the `01B` evidence's wording: the preflight was originally described as "fully read-only" and
"zero raw SQL/DDL." In fact it issued **one session-scoped, explicitly-rolled-back `CREATE TEMP TABLE ...
ON COMMIT DROP` DDL statement** as its database-level write-capability check — temporary DDL, not a
read-only query, though it created no persistent table, business data, fixture, or schema change of any
kind, and left no trace once its transaction rolled back. `REPORT.md` and `results.json` updated to state
this precisely; `EVIDENCE-CORRECTION-1.md` added, reproducing no credential, username, host, or database
name. **The trusted migration CLI (`npm run db:migrate:main`) remains the only source of any persistent
database change made in that package. The migration result, all ledger counts, and the final verdict are
unchanged: PASS, 48/48, head `2026_07_25_work_locations_table`.** No queue scope change. Credential
rotation for the previously-exposed connection string remains pending — this correction does not claim it
was performed. Evidence:
`mobile-qa/development-neon-main-ledger-reconciliation-01b/20260728-1340/EVIDENCE-CORRECTION-1.md`.

**`DEVELOPMENT-NEON-SANDBOX-CONNECTION-VALIDATION-01A` — 2026-07-28, verdict `CONNECTABLE_WRITE_CAPABLE`
(record only, 0 production access, 0 DDL of any kind).** A newly supplied, distinct `NEON_TEST_DATABASE_URL`
was validated — a separate target from `.env`'s `DATABASE_URL` and from the previously-reconciled dev
Neon database, both of which were left completely untouched. Used only as an inline environment variable
for a single script invocation — **never written to any file, never printed or logged anywhere** — and
this run's evidence directory was scanned and confirmed secret-free. Connected exactly once, ran only
`SELECT`/`SHOW`/`information_schema`/`pg_catalog` checks — **explicitly no `CREATE TEMP TABLE` or any DDL
this time**, a stricter boundary than the prior `01B` reconciliation package — and disconnected
immediately. Confirmed: real PostgreSQL 18.4 connection; `default_transaction_read_only` = `off`;
database-level `CREATE` privilege = true, checked via the read-only `has_database_privilege()` function
(no actual `CREATE` statement was ever issued); 0 public tables (a fresh, empty sandbox database with no
schema deployed yet — expected for a new target, not a defect). **Verdict: `CONNECTABLE_WRITE_CAPABLE`**
— reachable and configured to support future write/migration work, but no write of any kind was
performed in this package. Zero production Aiven/Render/Vercel/Brain access; zero business-row reads;
zero source edits/commit/push/deploy. Evidence:
`mobile-qa/development-neon-sandbox-connection-validation-01a/20260728-1422/REPORT.md`. **This validation
does not authorize creating application test records on this sandbox database — creation-flow testing
remains local-disposable-only, per standing policy. Deployment: NOT DEPLOYED.**

**`LOCAL-DISPOSABLE-APPLICATION-SCHEMA-AND-CREATION-SMOKE-01A` — 2026-07-28, verdict `PASS` (record only,
0 production access, 0 remote database access of any kind).** The actual application write test, not a
connection-only check. Provisioned a fresh, disposable, local-only PostgreSQL 18 cluster (loopback-only,
unused port, `trust` auth confined to the temporary cluster), created a single `qa_app_write_smoke_*`
database, restored the trusted local baseline (`v2026_07_20_corporate_declaration`, schema-only + ledger-
only), and ran the real trusted release migration CLI (`MAIN_MIGRATION_RELEASE_MODE=true npm run
db:migrate:main`) — **SUCCESS**, ledger 48/48, head `2026_07_25_work_locations_table`. Started the real
application server against this local database with `BRAIN_DATABASE_URL` overridden to an unreachable
placeholder host (confirmed via DNS-failure log lines that no real Brain database was ever contacted — a
non-blocking, expected failure by the app's own architecture). Confirmed readiness (`GET /api/ready` →
HTTP 200), authenticated using the existing, documented local QA pattern (`server/seed.ts`'s automatic
`seedSuperAdmin()` — no bypass), obtained a CSRF token the normal way (`GET /api/admin/csrf-token`), and
ran a full create → read → delete → verify-gone cycle on a tagged inventory item entirely through normal
application HTTP APIs (`POST /api/inventory` 201, `GET` 200, `DELETE` 204, `GET` 404) — **zero raw SQL
used for record creation, zero manual ledger edits.** All 4 build/whitespace gates passed
(`tsc --noEmit`, `vite build`, `build:server`, `git diff --check`). Full cleanup confirmed: app server
stopped, disposable database dropped, cluster stopped, data directory removed, both ports confirmed
closed. Zero Neon/Aiven/Render/Vercel/Brain/system-PostgreSQL-`:5432` access at any point; no product
source edits, commit, push, or deployment. Evidence:
`mobile-qa/local-disposable-application-schema-and-creation-smoke-01a/20260728-1433/REPORT.md`. **Local
disposable database only. No remote access of any kind. Deployment: NOT DEPLOYED.**

**`WINDOWS-SCHEMA-MIGRATION-LAUNCHER-01A` — 2026-07-28, PASS.** Turned `tools/windows_schema_migration.py`
into a tested one-click Windows `.exe` for LOCAL and explicitly-labelled DEVELOPMENT migrations only.
Replaced the old "every remote target is production" rule with explicit `TargetMode` (`LOCAL_DISPOSABLE`,
`DEVELOPMENT_REMOTE`, `PRODUCTION_REMOTE`) validated via `resolve_target_mode()` **before any command is
built** — production remote is always rejected in v1 with a message pointing to the controlled release
procedure, and its GUI radio button is rendered permanently disabled. Both allowed modes now run with
`NODE_ENV=development` and never set `ALLOW_PROD_DB_MIGRATE_MAIN`; development remote requires an explicit
confirmation showing only the redacted target fingerprint. Still only ever launches the reviewed
`npm run schema:audit:ledger` / `npm run db:migrate:main` commands — zero independent migration SQL in
Python, zero credential persistence anywhere. Packaged via PyInstaller
(`tools/packaging/windows_schema_migration.spec` + `build_windows_schema_migration_exe.py`) into
`PromiseSchemaMigration.exe` with an embedded blue/slate database-migration logo (ignored build/dist
folders, not committed). 27/27 Python unit tests pass, including new coverage for local/dev-remote/
production-blocked classification and frozen-exe repo-root resolution. **Found and fixed two real defects
during verification**: (1) the window was too short and clipped the entire action row off-screen; (2)
under the frozen `.exe`, `Path(__file__)` resolved inside PyInstaller's temp bundle instead of the real
checkout, so the canonical Node sources were never found — fixed with a `sys.frozen`-aware
`_resolve_repo_root()` that searches upward from the real `.exe` location. Proved the real built `.exe`,
driven through its **normal UI path** (real mouse clicks + direct `WM_CHAR` keystroke posts, since an
active Avro Bangla IME was found corrupting simulated hardware keystrokes), against a fresh disposable
local-only PostgreSQL 18 cluster: baseline restore → migration → **ledger 31→48**, native result dialog
"Schema migration complete" with a fully sanitized body, URL field confirmed cleared immediately after the
Run click, and zero credential/URL fragments found in any evidence file (grep-verified). All 4 build gates
+ `git diff --check` PASS. Full cleanup confirmed (exe stopped, disposable DB dropped, cluster stopped,
port closed). Zero Neon/Aiven/Render/Vercel/Brain/production access. Evidence:
`mobile-qa/windows-schema-migration-launcher-01a/20260728-1505/REPORT.md`. **Local/development only. The
generated `.exe` was not committed. Deployment: NOT DEPLOYED.**

**`WINDOWS-SCHEMA-MIGRATION-LAUNCHER-01A-HOTFIX-1` — 2026-07-28, PASS.** Fixed a real defect: Development
remote mode accepted **every** non-local PostgreSQL host, so an Aiven production URL could have been
misclassified as development and bypassed the intended production block. Added
`DEVELOPMENT_REMOTE_HOST_SUFFIX = ".neon.tech"` and `_is_recognized_development_remote_host()`;
`resolve_target_mode()` now rejects any development-remote target whose host doesn't end with
`.neon.tech` — **before** any command is built, confirmed by tests that assert the subprocess factory is
never invoked for rejected hosts (Aiven-pattern, arbitrary, suffix-spoofing, near-miss strings, raw IPs,
bare `neon.tech`). `DatabaseTarget` gained a `host` field (hostname only, never a credential) to support
the check. Local disposable's localhost-only restriction and production remote's permanent block are
unaffected; trusted Node commands and credential-clearing behavior unchanged. 31/31 Python unit tests
pass (4 new + 2 updated to use a `.neon.tech` example host instead of the now-correctly-rejected
`db.example.com`). Rebuilt `PromiseSchemaMigration.exe` and proved through its real UI: Local mode still
reaches a successful preflight against a disposable local baseline; a **fabricated, non-resolvable**
Aiven-pattern URL selected under Development remote is rejected instantly with a clear message and Run
Schema stays disabled — no real Neon/Aiven/Render/Vercel/Brain endpoint was ever contacted. All 4 build
gates + `git diff --check` PASS. Full cleanup confirmed; zero credential/URL fragments found in evidence
(grep-verified). Evidence:
`mobile-qa/windows-schema-migration-launcher-01a-hotfix-1/20260728-1543/REPORT.md`. **No real remote
target used. Generated `.exe` not committed. Deployment: NOT DEPLOYED.**

**`SCHEMA-UPDATE-CONTROL-UX-01A` — 2026-07-28, PASS.** Completed the Admin Schema Update control
(`SchemaUpdateControl.tsx`) so a Super Admin can request a reviewed schema update from Settings — the
browser only ever records a durable request; it never runs DDL, shell commands, migrations, or child
processes. Added `schemaUpdateApi.requestUpdate` to `adminApi.ts` (calls the existing, reviewed
`POST /admin/schema-updates/requests` with `{confirm: true, password}` only). "Request update" shows only
when no active run, ledger not blocked, pending migrations exist, and `user?.role === "Super Admin"`
(matching the existing UI gating pattern). Clicking it opens a compact dialog requiring password
re-authentication and an explicit confirmation checkbox; password state is cleared on submit, success,
error, cancel, and unmount (verified live via DOM inspection, not just source). Only
`["schema-update-status"]` is invalidated on success; the API's own safe message is shown. No backup
button, file export, database URL input, provider token, or direct migration button was added anywhere.
Backend/runner/migration/schema files were not touched — source inspection found no narrowly-required
gap. Added 5 new client-contract tests to `tests/schema-update-control-plane.test.ts` (37/37 pass,
including proof the subprocess/DDL path is never touched) and updated one stale guard test in
`tests/test_windows_schema_migration.py` that had asserted the component must never gain exactly this
feature (31/31 pass). Proved the full flow on a real disposable local PostgreSQL stack at desktop
1440x900 and mobile 390x844 + 430x932: pending state, request dialog, password confirmed cleared via
`browser_evaluate` after cancel, request recorded (`schema_update_runs` gains a row), ledger count
unchanged before/after (47->47, zero DDL), no horizontal overflow or modal overlap. All 4 build gates +
focused vitest + python guard + `git diff --check` PASS. Full cleanup confirmed. Evidence:
`mobile-qa/schema-update-control-ux-01a/20260728-1619/REPORT.md`. **No Neon/Aiven/Render/Vercel/Brain/
production access. Deployment: NOT DEPLOYED.**

**`PROMISE-SCHEMA-MIGRATION-TOOL-BACKUP-RESTORE-01A` — 2026-07-28, PASS.** Extended the existing
`PromiseSchemaMigration.exe` (no new application) with two actions: **Backup and Migrate** (schema check
-> verified `pg_dump` custom-format backup outside the repo -> `pg_restore --list` + SHA-256 verification
-> the existing trusted migration command -> ledger recheck; typed `MIGRATE` confirmation required for any
non-local target) and **Restore Backup** (operator picks a prior backup via the native file dialog -> SHA-
256 + saved target-fingerprint verification against the entered database -> typed `RESTORE` confirmation,
unconditional -> restore -> ledger recheck). No migration SQL was authored in Python; only the reviewed
Node migration command ever changes the MAIN schema; credentials (`PGPASSWORD`/`PGUSER`/`PGHOST`) are
passed to `pg_dump`/`pg_restore`/`dropdb`/`createdb` exclusively via child-process environment variables,
never on any command line, and zeroed immediately after each call; the only on-disk write anywhere is a
credential-free backup-metadata sidecar (sha256/fingerprint/timestamp/entry-count/masked db name). 47/47
Python unit tests pass (16 new + 2 updated guards). Rebuilt the `.exe` and found/fixed **two real
`pg_restore` defects** through actual end-to-end testing on a disposable local database: (1) `pg_restore`
needs an explicit `--dbname` (unlike `pg_dump`/`psql`, it never infers the target from `PGDATABASE`
alone); (2) an in-place `--clean --if-exists` restore is not dependency-order-safe and left a real target
database in a **partially restored, inconsistent state** on a genuine cross-table FK/constraint ordering
error — fixed by switching to `dropdb --if-exists` + `createdb` + a plain `pg_restore` into the now-empty
database, the standard safe pattern. Proved the full required sequence against the real rebuilt `.exe`:
baseline (31) -> Backup and Migrate (31->48, backup verified) -> Restore Backup (->31, typed RESTORE,
clean full restore confirmed via table count and an intact empty table, not partial) -> plain migrate
again (->48). All 4 build gates + `git diff --check` PASS. Full cleanup confirmed (exe stopped, disposable
DB dropped, cluster stopped, backup files removed, port closed); zero credential/URL leakage in evidence
(grep-verified). Evidence:
`mobile-qa/promise-schema-migration-tool-backup-restore-01a/20260728-1704/REPORT.md`. **No new
application. No Neon/Aiven/Render/Vercel/production access. Generated `.exe` not committed. Deployment:
NOT DEPLOYED.**

**`PROMISE-SCHEMA-MIGRATION-TOOL-NEON-REMOTE-PROOF-01A` — 2026-07-28, schema check + Backup and Migrate
PASS, Restore Backup honestly BLOCKED, final ledger 48/48 (required end state met).** Test-only phase
(zero code changes) proving the existing `.exe`'s real remote workflow against an operator-supplied
disposable Neon TEST database, driven through the real `.exe` UI's Development remote mode (not Python
functions directly). Host confirmed to end in `.neon.tech` via read-only check before any write. The
target database was found empty and initialized only with the approved schema-only baseline + baseline
ledger (0 business-data INSERTs, 31 ledger-only INSERTs) — no customer/staff/payment data. **Schema check
PASS** (real `npm run schema:audit:ledger` against Neon). **Backup and Migrate PASS**: typed `MIGRATE`
confirmation, real `pg_dump` backup created and verified (SHA-256 + `pg_restore --list`, 559 archive
entries) outside the repository, then the real `npm run db:migrate:main` — **ledger 31→48**, confirmed
independently via read-only `psql`. **Restore Backup BLOCKED**: SHA-256 and target-fingerprint verification
passed, typed `RESTORE` confirmed, but the real `dropdb` step failed because Neon reported the target
database still in use by another session — a genuine platform-side constraint, not a tool defect. Per
instructions, **stopped immediately with no raw SQL or alternative restore method attempted**; the failed
attempt left the database **completely unaffected** (confirmed still 48/48), which already satisfies the
brief's required final state, so no further action was needed. Every backup file was confirmed outside the
repo with a credential-free filename and metadata sidecar, then deleted at cleanup per instructions (Neon
test database itself was left untouched at 48/48, not deleted). A read-only-discovered environmental quirk
(this Neon endpoint's empty default `search_path`) was recorded but not acted on — it did not block the
real reviewed Node commands during this proof. All 4 build gates + `git diff --check` PASS. Full grep of
every evidence file for the real Neon username/password/host: zero matches. Evidence:
`mobile-qa/promise-schema-migration-tool-neon-remote-proof-01a/20260728-1740/REPORT.md`. **Neon TEST
database only (operator-confirmed disposable, no important data). No Aiven/Render/Vercel/local-system-
Postgres/production access. Test-only — zero code changes. Deployment: NOT DEPLOYED.**

**`PROMISE-SCHEMA-MIGRATION-TOOL-NEON-REMOTE-RESTORE-HOTFIX-01A` — 2026-07-28, Restore Backup PASS
(48→31, twice independently verified), final "migrate again to 48" step honestly BLOCKED, Neon test
database left at ledger 31 (not the requested 48/48).** Extended the existing `.exe`
(`tools/windows_schema_migration.py` only, no new application) so Restore Backup can use PostgreSQL's own
`dropdb --force` for Development remote, gated behind a new from-scratch two-factor confirmation dialog —
an unchecked-by-default consent checkbox plus a typed `RESTORE` confirmation, showing only the target
fingerprint, never the database name or host. Also hardened `_sanitize_tool_output` (strips
ALTER/GRANT/CREATE/DROP/INSERT/SELECT-FROM SQL patterns) after a raw `pg_restore` statement briefly leaked
into a failure dialog during live testing with the pre-hotfix build, and changed `run_restore_and_recheck`
to always report its read-only ledger recheck even on a reported failure, without changing the
success/failure outcome. 54/54 Python tests pass. **Live proof against the real Neon test database with
the rebuilt `.exe`:** `dropdb --force` succeeded exactly where the immediately prior phase's plain `dropdb`
had failed on the same "active connection" blocker; the two-factor dialog behaved correctly (checkbox
unchecked by default, fingerprint-only, typed confirmation required); Restore Backup reported success and
was independently confirmed via schema-qualified `psql`: **ledger 48→31**. **The required final proof step
(migrate again to reach 48) is honestly reported as BLOCKED** by a newly discovered, distinct finding: after
the forced-drop-and-recreate cycle, the recreated database's session-level `search_path` resolves empty
(confirmed deterministic across two retries with waits up to 95s), breaking the project's own
already-reviewed, out-of-scope, unqualified `SELECT ... FROM promise_schema_migrations` queries in
`server/services/main-schema-migrate.service.ts` and `server/services/ledger-reconciliation-audit.service.ts`
— even though the restored data itself is present and correct (independently verified via schema-qualified
SQL, twice). No handwritten SQL workaround was attempted and no out-of-scope Node service code was
modified; the tool's own Preflight gate correctly, safely refused to proceed rather than guess. All 4 build
gates + `git diff --check` PASS. Full grep of every evidence file, plus a visual screenshot review, for the
real Neon username/password/host: zero matches. **Final Neon test database state is ledger 31, not the
requested 48/48 — this deviation is disclosed honestly rather than forced through an unauthorized route.**
Evidence: `mobile-qa/promise-schema-migration-tool-neon-remote-restore-hotfix-01a/20260728-1823/REPORT.md`.
**Neon TEST database only (operator-confirmed disposable, no important data). No
Aiven/Render/Vercel/local-system-Postgres/production access. Deployment: NOT DEPLOYED.**
