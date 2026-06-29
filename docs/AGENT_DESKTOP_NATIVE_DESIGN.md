# Admin Desktop Design Guide

## Core Principle

The admin panel is an operational tool, not a marketing site. Staff uses it 8+ hours a day. Every pixel must earn its space.

## Layout Patterns

### Sidebar + Content
- Fixed left sidebar (256px) with nav groups.
- Main content area with sticky header (56px).
- Header shows: breadcrumb, search, notifications, user menu.

### List + Detail (Split View)
- Left: scrollable list/table with filters and search.
- Right: detail panel for selected item.
- Used in: Jobs, Service Requests, Repair Journeys, Pickup.

### Tab-based Bento Dashboard
- Hash-routed tabs (`#dashboard`, `#jobs`, `#users`).
- Each tab is a lazy-loaded component.
- Tabs are permission-filtered — users only see tabs they have access to.

## Visual Rules

### Do
- Dense but readable layouts — 14px base, 12px labels.
- Clear visual hierarchy: section headers → content → actions.
- Consistent card style: `rounded-2xl border border-slate-200 bg-white`.
- Status badges with semantic colors (emerald=active, amber=warning, rose=error).
- Tables for data-heavy views; cards for overview/summary.
- Sticky action bars when forms scroll.

### Do Not
- Oversized hero sections or marketing banners inside admin.
- Nested cards (card inside card inside card).
- Decorative gradient blobs or background patterns.
- Giant icons as page decoration.
- Dark mode or heavy purple/blue gradients.
- Full-width stretched form fields without max-width.

## Modal / Dialog Sizing

| Type | Max Width | Use |
|------|-----------|-----|
| Confirmation | `sm:max-w-md` | Delete, status change |
| Form dialog | `sm:max-w-lg` | Edit profile, create record |
| Wizard | `max-w-2xl` | Permission Designer, Invite Wizard |
| Detail panel | `max-w-3xl` or split-view | Job detail, SR detail |

Portaled modals (`createPortal(node, document.body)`) are required when rendering inside the Bento scroll container.

## Icon Usage

- Lucide icons only — no emoji, no custom SVGs for UI actions.
- Icon size: 16px in buttons, 20px in cards, 14px in badges.
- No decorative oversized icons (>24px) except in empty states.

## Permission / Risk UI

- Risk badges: `low=emerald`, `medium=amber`, `high=orange`, `critical=rose`.
- Impact-first: show what the permission allows before the toggle.
- Critical permissions require explicit checkbox confirmation.
- Coverage warnings use: red (missing), amber (single-person), green (covered).

## Action Hierarchy

Primary actions (blue): Create, Save, Submit, Generate Link.
Secondary actions (outline): Edit, Back, Cancel.
Destructive actions (rose): Delete, Deactivate, Write Off.
Disabled state: `opacity-50 pointer-events-none`.

## Desktop QA

Use Browser-act CLI for desktop visual QA at 1440x900. If Browser-act is unavailable, document the fallback and use Playwright.

## Example Patterns

- **Users tab**: KPI cards → Coverage Health → Staff Directory table → action dropdown per row.
- **Jobs tab**: filter chips → table → side detail panel → status advancement dialog.
- **Service Requests**: stage-grouped table → detail panel → action buttons (reply, quote, convert).
- **Repair Journeys**: customer profile browser → left list, right detail.
- **Pickup**: lane chips (Today/All/Pickups/Deliveries) → task table → driver assignment.
