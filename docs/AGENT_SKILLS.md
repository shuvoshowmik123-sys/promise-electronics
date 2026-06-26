# Agent Skills For Promise Electronics

This is not an external plugin install list. It is the project skill routing guide for Codex, Claude Code, PlotCode, Kimi, GLM, and worker agents.

## Required Working Skills

### Frontend UI Skill

Use when editing React pages, mobile layouts, dashboards, tabs, sheets, dialogs, cards, forms, or navigation.

Must apply:

- `docs/AGENT_FRONTEND_PLAYBOOK.md`
- existing local primitives
- responsive mobile/desktop separation
- light-mode-only visual language
- Bangla/English layout safety

### Grill Me Skill

Use before broad UI redesign, admin mobile visual consistency work, repeated polish loops, or unclear product direction.

Must apply:

- `skills/grill-me/SKILL.md`
- MCQ decisions one at a time
- no implementation until key visual decisions are locked
- record locked decisions in the relevant ledger or handoff
- for admin mobile, use `docs/ADMIN_MOBILE_VISUAL_LEDGER.md`

### Backend Wiring Skill

Use when editing Express routes, services, repositories, auth, DB access, billing, jobs, POS, journeys, notifications, uploads, or permissions.

Must apply:

- ESM `.js` imports
- idempotent DDL via `db.execute(sql`...`)` on the standard PostgreSQL client
- route auth and ownership checks
- no sensitive response fields
- no schema guessing

### QA Skill

Use when testing flows across admin, customer, and corporate portals.

Must apply:

- deterministic Playwright checks for regressions
- Browser Use V2 only for exploratory or stuck-flow diagnosis
- viewport coverage for mobile UI
- data-leak scan on API responses
- role/permission checks

### Agent Handoff Skill

Use at the end of every task.

Must return:

- files changed
- what changed
- desktop touched or untouched
- mobile touched or untouched
- tests run
- risks
- exact feedback block

## Agent Roles

### Codex

- UI/UX architecture
- final visual polish
- cross-agent consistency review
- frontend rules/playbook maintenance
- codebase cross-check

### Claude Code

- backend implementation
- security fixes
- route/API/test implementation
- frontend implementation only from an approved UI spec tied to a ledger row when admin mobile is involved
- browser QA and regression test writing
- must follow `docs/CLAUDE_PROJECT_EXECUTION_PROTOCOL.md`

### PlotCode/Kimi/GLM

- worker implementation only
- must not invent new UI systems
- must follow allowed files and forbidden files
- must return precise handoff report

## Stop Conditions

Stop and report before editing if:

- the task needs a new UI pattern not in the playbook
- admin mobile work is requested without a ledger row or Codex-approved UI spec
- the requested change touches backend and frontend but only one side is specified
- auth/session/schema behavior is unclear
- the file path does not exist
- the agent would need to change unrelated files
