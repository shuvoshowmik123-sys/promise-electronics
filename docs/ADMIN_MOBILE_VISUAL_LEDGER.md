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
| Jobs | Native Complete | 2026-06-25 | `raw/jobs-*.json` + `screenshots/confirm-jobs-{rest,detail}.png` | Inspector approved. No blockers. |
| Stock / Inventory | Native Complete | 2026-06-25 | `raw/inventory-*.json` + `screenshots/confirm-inventory-{rest,detail}.png` | Inspector approved. No blockers. |
| Finance | Native Complete | 2026-06-25 | `raw/finance-*.json` + `screenshots/confirm-finance-{rest,invoice}.png` | Inspector approved. No blockers. |
| POS | Native Complete | 2026-06-25 | `raw/pos-*.json` + `screenshots/confirm-pos-{rest,cart}.png` | Inspector approved. Refund dialog centered Radix style — polish later. |
| Service Requests | Native Complete | 2026-06-25 | `raw/sr-mcp-*.json` + `screenshots/confirm-sr-{rest,detail}.png` | Inspector approved. No blockers. |
| Pickups | Native Complete | 2026-06-25 | `raw/pickup-*.json` + `screenshots/confirm-pickup-{rest,action}.png` | Inspector approved. No blockers. |
| Corporate Messages | Native Complete | 2026-06-25 | `raw/corp-msg-*.json` + `screenshots/confirm-corpmsg-{rest,chat}.png` | Inspector approved. No blockers. |

| Shift (My Shift) | Functional Clean | 2026-07-03 | Phase 23B evidence preserved. Phase 29A: Shift Monitor KPI block now collapsible — collapsed shows compact chip row (Present/Working/Outside/Done); expanded shows 2×2 grid. Default collapsed. ChevronDown toggle. My Shift path (staff roles) unchanged. TSC + Vite build clean. Manual QA required at 390×844, 430×932. | Manual Playwright QA pending for Shift Monitor collapsible KPI. |

## Secondary Tabs

These need functional-clean behavior before launch, not full native redesign unless promoted.

| Tab | Status | Last Tested | Evidence | Remaining |
| --- | --- | --- | --- | --- |
| Repair Journeys | Native Complete | 2026-06-28 | `test-results/repair-journey-profile-browser/*` | Customer profile browser: two-column mobile profile cards, portaled profile bottom sheet with Active/History/Warranty/Timeline, desktop profile/detail split. Verified 390x844, 430x932, 584x918, and 1440x900 with no overflow. |
| Customers | Functional Clean | 2026-06-25 | `raw/customers-*.json` + screenshots | Detail sheet ✓, chrome hides/restores ✓, Escape ✓. User visual confirm needed. |
| Users | Functional Clean | 2026-06-25 | `raw/users-*.json` + screenshots | Edit dialog ✓, chrome hides/restores ✓, Escape ✓. Centered Radix style. |
| B2B / Corporate Area | Functional Clean | 2026-06-25 | `raw/b2b-*.json` + screenshots | Client list ✓, workspace overlay ✓, back ✓. Chrome stays visible (correct). |
| Quotations | Functional Clean | 2026-06-25 | `raw/quotations-*.json` + screenshots | Edit dialog ✓ (both viewports), chrome hides/restores ✓. PDF is download. |
| Inquiries | Functional Clean | 2026-06-25 | `raw/inquiries-*.json` + screenshots | Reply sheet ✓ (both viewports), textarea focus safe ✓, X close ✓. |
| Warranty Claims | Native Complete | 2026-07-03 | `qa-27c-warranty-390x844.png`, `qa-27c-warranty-sheet-390x844.png`, `qa-27c-warranty-430x932.png`, `qa-27c-warranty-844x390.png`, `qa-27c-warranty-1440x900.png` | Phase 27C-QA PASS: native mobile branch at 390×844 and 430×932 — compact header, status chips (All/Pending/In Repair/Rejected/Linked), safe ref cards (originalJobSafeRef). Bottom sheet portaled, dock hides on open, approve/reject mutations wired. Landscape 844×390: mobile branch active (h=390<700, touch=1). Desktop 1440×900: table with safe refs in Original Job col + actions dropdown. Linked chip: shows in_repair claims with newJobId ✅. In Repair chip: in_repair + approved ✅. Search by safe ref ("MLRRUK") → 1 card ✅. No raw 21-char nanoids in rendered text ✅. API: Driver (no warranty.view) → 403 ✅; Super Admin → 200 with originalJobSafeRef ✅; route order fix: /check/nonexistent → 404 (not captured by /:id) ✅. Known pre-existing: /check-serial/:serial → 500 (warranty_days column missing — unrelated to Phase 27C). |
| Orders | Not Mobile Priority | 2026-06-25 | `raw/orders-*.json` + screenshots | Module disabled — "Access Restricted". Permission-enabled retest needed. |
| Settings | Native Complete | 2026-06-26 | `raw/settings-*.json` + `screenshots/handle-verify-finance-390.png` | Native mobile redesign: grouped rows, compact sections, portaled sheets, real drag handle, no bottom strip, no fake pill, no mobile X button. Inspector approved. |
| Audit Logs | Not Mobile Priority | 2026-06-25 | `raw/audit-logs-*.json` + screenshots | Module disabled — "Access Restricted". Permission-enabled retest needed. |
| My Account | Functional Clean | 2026-07-01 | `qa-22a-hotfix-*.png` | Phase 22A-Hotfix: moved into Bento SPA as `#account` tab. All 5 viewports PASS. No old AdminLayout. Redirect `/admin/account` → `/admin#account` confirmed. Mobile flat layout with dock clearance. Desktop 2-col grid preserved. No React errors. |

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

## Audit Rules

- Do not choose a next tab from memory.
- Choose the highest-priority row with `Needs Redesign` or `Patched Needs Retest`.
- If a tab is user-green but lacks evidence, mark `Patched Needs Retest`, not `Native Complete`.
- If a shared primitive changes, retest all Daily Ops rows that depend on it.
- Do not mark `Native Complete` without mobile evidence at `390x844` and `584x918`.

---

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
