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
| Jobs | Native Complete | 2026-06-25 | `raw/jobs-*.json` + `screenshots/confirm-jobs-{rest,detail}.png` | Inspector approved. No blockers. |
| Stock / Inventory | Native Complete | 2026-06-25 | `raw/inventory-*.json` + `screenshots/confirm-inventory-{rest,detail}.png` | Inspector approved. No blockers. |
| Finance | Native Complete | 2026-06-25 | `raw/finance-*.json` + `screenshots/confirm-finance-{rest,invoice}.png` | Inspector approved. No blockers. |
| POS | Native Complete | 2026-06-25 | `raw/pos-*.json` + `screenshots/confirm-pos-{rest,cart}.png` | Inspector approved. Refund dialog centered Radix style — polish later. |
| Service Requests | Native Complete | 2026-06-25 | `raw/sr-mcp-*.json` + `screenshots/confirm-sr-{rest,detail}.png` | Inspector approved. No blockers. |
| Pickups | Native Complete | 2026-06-25 | `raw/pickup-*.json` + `screenshots/confirm-pickup-{rest,action}.png` | Inspector approved. No blockers. |
| Corporate Messages | Native Complete | 2026-06-25 | `raw/corp-msg-*.json` + `screenshots/confirm-corpmsg-{rest,chat}.png` | Inspector approved. No blockers. |

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
| Warranty Claims | Functional Clean | 2026-06-25 | `raw/warranty-claims-*.json` + screenshots | Mobile cards ✓, dropdown actions ✓, dock ✓. |
| Orders | Not Mobile Priority | 2026-06-25 | `raw/orders-*.json` + screenshots | Module disabled — "Access Restricted". Permission-enabled retest needed. |
| Settings | Native Complete | 2026-06-26 | `raw/settings-*.json` + `screenshots/handle-verify-finance-390.png` | Native mobile redesign: grouped rows, compact sections, portaled sheets, real drag handle, no bottom strip, no fake pill, no mobile X button. Inspector approved. |
| Audit Logs | Not Mobile Priority | 2026-06-25 | `raw/audit-logs-*.json` + screenshots | Module disabled — "Access Restricted". Permission-enabled retest needed. |

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
