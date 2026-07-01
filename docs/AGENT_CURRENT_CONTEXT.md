# Agent Current Context

Last updated: 2026-07-01

## Product

Promise Electronics is a TV repair shop management system for Dhaka, Bangladesh.

Portals:

- Admin panel: operations, jobs, inventory, finance, users, service requests, POS, pickup, corporate, repair journeys.
- Customer portal: public/customer repair booking, quote, journey tracking, shop/cart, profile, support, bilingual UI.
- Corporate portal: B2B client jobs, support chat, intake verification, notifications, profile.

## Current Phase

Post-security-audit, preparing for pilot with P0 fixes pending.

### Recently Completed
- **Phase 15 (A–J)**: Staff onboarding — invite-based setup links, dedicated setup page, account settings, role-based landing, first-login guide. All regression-tested.
- **Phase 16 (A–H)**: Granular permission system — 67 permissions, 20 modules, Permission Designer UI, Invite Wizard, Coverage Health dashboard, backend enforcement bridge. All regression-tested.
- **Phase 17 (A–C)**: Repo cleanup — deleted junk files, archived stale docs, relocated design references, renamed mock-data.ts, hardened .gitignore.
- **Phase 18 (A–G)**: Architecture audit, root tree cleanup, governance docs, lazy loading (70% chunk reduction), desktop KPI polish. GO verdict.
- **Phase 19A-BE**: Backend security audit — 1 password hash leak found (corporate login error path), 3 unprotected financial routes (refunds, approvals, offline-sync), 4 missing-permission routes. GO WITH FIXES.
- **Phases 19B-BE / 20A-E**: Security fixes applied. 3-portal PWA system built (manifests, icons, install prompts, server-side manifest fidelity). All pushed to GitHub.
- **Phase 21A**: P2 security closed (lens auth, quotes convert auth, 6 PII log redactions). Production health documented. PWA real-device checklist written. TSC + Vite build pass. **GO WITH MANUAL CHECK.**

### Release Readiness
- Permission system: **GO** — 37/37 regression tests pass.
- Staff onboarding: **GO** — 51/51 regression tests pass.
- Repo: cleaned — no temp files, no Python artifacts, stale docs archived.

## Current UI Direction

- Light mode only.
- Admin mobile uses compact operational shell.
- Customer mobile uses premium emerald floating-dock app shell.
- Corporate mobile uses light blue business support shell.
- Mobile and desktop layouts should stay separate when their workflows differ.

## QA Tool Assignment

- **Browser-act CLI**: Desktop 1440x900 visual/human QA (real Chrome).
- **Playwright MCP**: Mobile viewport QA (390x844, 430x932) + strict regression.
- **API/curl scripts**: Backend permission enforcement + security testing.
- See `docs/AGENT_TESTING_PLAYBOOK.md` for full rules.

## Current High-Risk Areas

- Admin mobile scroll/chrome behavior.
- Bottom dock clearance on mobile list pages.
- Mixed old/new customer mobile pages.
- Bangla/English fixed UI translation and text fit.
- Legacy users with broad permissions (need individual migration via Permission Designer).

## Current Working Rules

- Do not freely redesign frontend.
- Do not change backend during UI tasks.
- Do not change customer/corporate while fixing admin unless explicitly requested.
- Do not hide content under fixed bottom navigation.
- Do not add dark mode.
- Do not import full external UI templates.

## Planned Next Phases

- **19A-BE P0 Fixes**: corporate-auth leak, refunds/approvals/offline-sync auth, upload auth, drawer/settings permissions, POS transaction auth, SMS log redaction.
- **19B**: Frontend security audit (if needed).
- **20**: Backend modularization (domain modules).

## Developer Guides

| Doc | Purpose |
|-----|---------|
| `AGENTS.md` | Agent role, stack, code rules |
| `rules.md` | Coordination contract |
| `docs/AGENT_FRONTEND_PLAYBOOK.md` | UI patterns, mobile primitives |
| `docs/AGENT_BACKEND_PLAYBOOK.md` | Server patterns, permissions, SQL |
| `docs/AGENT_DESKTOP_NATIVE_DESIGN.md` | Desktop admin layout rules |
| `docs/AGENT_TESTING_PLAYBOOK.md` | QA tools, test rules, reporting |
| `docs/AGENT_SKILLS.md` | Skill registry |
| `docs/AGENT_HANDOFF_TEMPLATE.md` | Session handoff format |
| `docs/RELEASE_CHECKLIST.md` | Pre-deploy verification |
