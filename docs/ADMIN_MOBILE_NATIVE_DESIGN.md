# Admin Mobile Native Design System

This is the source of truth for Promise Electronics admin mobile UI. The Dashboard mobile view is the completed reference. New or repaired tabs must copy its behavior, spacing discipline, motion, and interaction model before adding tab-specific details.

## Reference Screen

Dashboard is the native pattern.

Use it as the visual baseline for:
- shell spacing
- collapsible KPI behavior
- card density
- bottom-sheet detail behavior
- chrome hide/show rhythm
- touch target sizing
- animation weight
- empty/loading/error states

Do not create a new mobile language per tab.

## Core Principles

1. Mobile is an app surface, not a squeezed desktop page.
2. One tab equals one focused workflow.
3. The first viewport must show useful work, not only decoration.
4. KPI cards are optional context, not permanent blockage.
5. Detail, create, edit, filter, and confirm flows open as bottom sheets.
6. The bottom dock never covers active content or actions.
7. Every list reaches its final item cleanly.
8. Every touch target is at least 44px.
9. Motion is short, useful, and consistent.
10. Desktop layout stays separate.

## Native Mobile Page Anatomy

Every admin mobile tab should follow this order:

1. Compact tab header
   - title
   - short supporting label
   - one primary action if needed
   - no oversized hero cards

2. Search or primary filter
   - visible early
   - height 44-48px
   - icon left, clear affordance when needed

3. Collapsible KPI block
   - collapsed by default on dense tabs
   - expanded state shows KPI cards
   - collapsed state shows one compact summary row
   - must not permanently push the list down

4. Workflow controls
   - segmented status filters
   - compact chips
   - secondary actions
   - placed in scrollable content if they are not always needed

5. Main work list
   - one-column card list
   - dense but breathable
   - stable card height where possible
   - final card must clear the bottom dock

6. Bottom-sheet detail/action flows
   - view detail
   - edit/create
   - filter
   - assignment
   - payment/review
   - destructive confirmation

## Spacing Tokens

Use these as defaults unless the existing component already defines them:

- page horizontal padding: 16px
- compact vertical section gap: 12px
- normal vertical section gap: 16px
- card padding: 12-16px
- dense list card padding: 12px
- rounded cards: 20-24px on mobile admin
- icon tile: 36-44px
- input/control height: 44-48px
- bottom dock clearance: at least 96px plus safe area
- bottom-sheet footer clearance: env(safe-area-inset-bottom)

Avoid large empty top spaces. Avoid permanent KPI blocks above long lists.

## Color Tokens

Admin mobile uses:

- primary: blue
- surface: white
- page background: slate-50 / #f8fafc
- text: slate-950 / slate-800
- muted text: slate-500
- border: slate-100 / slate-200
- success: emerald
- warning: amber/orange
- danger: rose

Do not use customer emerald as the admin primary.
Do not introduce dark mode.
Do not make a one-color page. Blue is the action color, not the whole design.

## KPI Pattern

KPI blocks must be collapsible on dense mobile tabs.

Collapsed state:
- one slim row
- shows 2-4 key totals
- includes expand chevron
- max height around 56-72px

Expanded state:
- 2-column grid when useful
- cards are compact
- collapse control remains visible

Use KPI collapse on:
- Dashboard when content is dense
- Service Requests
- Inventory / Stock
- Finance
- Customers
- Users
- Repair Journeys
- POS

Do not force KPI cards above every list forever.

## Card Pattern

List cards must show:

- primary label
- short secondary metadata
- status chip
- one clear next action or tap-to-open behavior

Card rules:
- no nested cards
- no heavy shadows
- no text overflow
- no random colored borders
- status chips use consistent colors
- risky states can use a left border or tinted badge, not a full red card

## Bottom Sheet Pattern

Mobile bottom sheets are the native detail/action surface.

Rules:
- render above the admin dock
- portal to document.body when parent stacking contexts exist
- include one drag handle
- no duplicate close buttons
- internal content scrolls
- background page does not scroll while sheet is active
- final action clears safe area
- close/reopen leaves no ghost shadow or handle

Use bottom sheets for:
- detail view
- create/edit form
- filters
- assignment
- payment/review
- destructive confirmation

Desktop can keep dialog/drawer patterns.

## Motion Rules

Motion should feel consistent with Dashboard:

- chrome hide/show: 180-220ms
- sheet open/close: 220-300ms
- card press: active scale 0.98-0.99
- KPI expand/collapse: 180-240ms
- avoid springy overshoot on operational screens
- avoid layout jumps during scroll

When top and bottom chrome hide, they must move in sync.

## Scroll Rules

Every mobile tab must pass:

- scroll down works
- scroll up works
- last card is fully visible
- bottom dock does not cover content
- no white bar after chrome hides
- no scroll trap inside nested containers
- sheet scroll does not move background page

For fixed-layout tabs, use one intended scroll container. Do not stack three competing scroll containers.

## Native Tab Types

### Operational List Tab

Examples: Jobs, Service Requests, Pickups, Repair Journeys.

Structure:
- compact header
- search
- collapsible KPI summary
- status chips
- work cards
- bottom-sheet detail/action

### Finance / POS Tab

Structure:
- compact register/status header
- collapsible summary
- primary work zone
- sticky action only when it does not block content
- payment/review sheets above dock

### Directory Tab

Examples: Customers, Users.

Structure:
- compact header
- search
- role/status filters
- person cards
- create/edit/detail bottom sheets

### Settings / Admin Utility Tab

Structure:
- compact grouped rows
- no dashboard-scale hero
- risky actions use confirmation sheets
- desktop-only advanced panels can remain desktop-only if mobile use is unrealistic

## Completed Reference Checklist

A tab can be marked native-ready only when:

- mobile and desktop are intentionally separate
- top area is compact
- KPI block is collapsible if dense
- list final item clears dock
- all mobile details/actions are bottom sheets
- all sheets appear above dock
- sheet drag/close is clean
- no duplicate close buttons
- no horizontal overflow at 390px
- no clipped Bangla/English text if bilingual
- tsc/build pass
- browser QA completed at 390x844 and 584x918

## Status Ledger

Use this table to track adoption.

| Tab | Status | Reference Notes |
| --- | --- | --- |
| Dashboard | Native reference | Completed baseline |
| Jobs | Needs audit | Match Dashboard chrome, cards, and sheet behavior |
| POS | Needs mobile refinement | Keep POS logic, normalize sheets and spacing |
| Inventory / Stock | Needs sheet consistency | Detail/filter sheets must clear dock |
| Finance | Needs dense-tab audit | KPI collapse and sheet consistency |
| Service Requests | Near-native | Keep compact top, command rail scrolls away |
| Pickups | Needs scroll verification | One mobile scroll container only |
| Customers | Needs portal sheet fix | Customer sheets must clear dock |
| Users | Needs mobile sheet pass | Create/edit/permissions bottom sheets |
| Repair Journeys | Needs dense-tab audit | Timeline/detail sheets must match native model |
| Settings | Secondary mobile | Keep compact, avoid desktop dialogs on mobile |

## Worker Rule

When Claude, PlotCode, Kimi, GLM, or any worker edits admin mobile UI:

1. Read this file first.
2. Name the reference pattern being copied.
3. Change one tab or one shared primitive at a time.
4. Do not invent a new visual system.
5. Report which checklist items passed.
