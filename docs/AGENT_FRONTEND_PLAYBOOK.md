# Agent Frontend Playbook

This is the product UI law for Promise Electronics. Follow it before editing frontend files.

## Product Vibe

Promise Electronics is an operational repair business tool, not a generic SaaS template. The UI should feel:

- light
- spacious
- polished
- practical
- fast to scan
- trustworthy for Bangladeshi repair-shop operations

Never introduce dark mode, heavy purple/blue gradients, decorative blobs, oversized marketing sections in admin tools, or random template aesthetics.

## Portal Visual Families

### Admin Mobile

Read [ADMIN_MOBILE_NATIVE_DESIGN.md](./ADMIN_MOBILE_NATIVE_DESIGN.md) before any admin mobile UI task. Dashboard is the native reference pattern; other admin tabs should copy its shell behavior, KPI collapse, card density, bottom-sheet model, and motion rhythm instead of inventing separate mobile designs.

For broad admin mobile work, also read [ADMIN_MOBILE_VISUAL_LEDGER.md](./ADMIN_MOBILE_VISUAL_LEDGER.md) and `skills/grill-me/SKILL.md`. The ledger decides which tab is next, what status it has, and what evidence is required. Do not choose a tab from memory.

Use the admin mobile shell:

- `MobileTabLayout`
- `MobileTabHeader`
- `MobileScrollContent`
- `MobileKpiGrid` where KPI cards take too much space

Rules:

- Keep dense tools compact.
- KPI blocks should be collapsible on mobile when they push lists down.
- Search/filter/action controls should not permanently consume half the viewport.
- Bottom dock must never cover the last card or action.
- Mobile dialogs should be bottom sheets where practical.
- Desktop admin layout must remain untouched unless the task explicitly says desktop.
- Daily Ops tabs must follow the strict native shell: compact header, collapsed KPI when dense, search/filter, card list, and bottom-sheet details/actions.
- Normal list pages hide/reveal top tools and bottom dock together.
- Detail, edit, chat, and action surfaces hide global admin chrome while open and restore it on close.
- Claude Code may implement admin mobile frontend only from a Codex-approved UI spec tied to a ledger row.

### Customer Mobile

Use the customer app direction:

- light premium surface
- emerald accent
- floating dock
- immersive page-owned top sections
- max content width around `520px`, `560px` on larger phones
- no global heavy mobile header unless approved

Rules:

- Customer pages should feel simpler and warmer than admin.
- Bangla and English fixed UI must both fit naturally.
- Dynamic backend content can remain in stored language.
- Do not mix Bangla and English fixed labels in the same language mode.

### Corporate Mobile

Use the corporate portal direction:

- light blue corporate support tone
- clear job cards
- support-chat style interactions
- bottom sheets for filters, attach job, job detail, and review actions

Rules:

- Keep it business-friendly and calm.
- Do not make it look like admin.
- Do not make it look like customer retail pages.

## Desktop Rules

- Desktop admin is an operational workstation: tables, filters, actions, dense but readable.
- Desktop customer/corporate pages can be more open, but must not become marketing pages unless the route is public marketing content.
- Do not change desktop while fixing mobile unless explicitly requested.

## Component Rules

- Prefer existing shadcn/ui components and local primitives.
- Prefer lucide icons.
- Do not create new card, sheet, modal, dock, KPI, tab, or segmented-control patterns if an existing local pattern solves it.
- Do not nest cards inside cards.
- Cards should usually be `rounded-lg` or less in operational UI unless the existing family uses more.
- Text must not overflow, overlap, or hide under fixed chrome.

## Mobile QA Checklist

Check at `390x844`, `430x932`, and `584x918`:

- no horizontal overflow
- final card visible above bottom dock
- final button visible above bottom dock
- keyboard does not hide focused input
- Bangla labels fit
- bottom sheet scrolls naturally
- drag handle does not block inner scrolling
- search/filter controls remain reachable
- no mixed old/new UI styles

## Light-Mode References

Use these as inspiration only. Do not copy templates into the repo.

- shadcn/ui: https://ui.shadcn.com/
- shadcn/ui GitHub: https://github.com/shadcn-ui/ui
- Qualiora Shadboard: https://github.com/Qualiora/shadboard
- shadcnstore dashboard template: https://github.com/shadcnstore/shadcn-dashboard-landing-template

Reference goal: clean component composition, spacing discipline, light surfaces, sensible dashboards. Promise-specific components and flows remain the source of truth.
