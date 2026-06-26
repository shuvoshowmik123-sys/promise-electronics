# Promise Electronics Agent Rules

This file is the shared coordination contract for Codex, Claude Code, PlotCode, Kimi, GLM, and any worker AI touching this repo.

## Read Order

Before frontend work, read:

1. `AGENTS.md`
2. `docs/AGENT_CURRENT_CONTEXT.md`
3. `docs/AGENT_FRONTEND_PLAYBOOK.md`
4. `docs/AGENT_SKILLS.md`
5. `docs/CLAUDE_PROJECT_EXECUTION_PROTOCOL.md` when the worker is Claude Code
6. `docs/AGENT_HANDOFF_TEMPLATE.md`

Before backend work, read:

1. `AGENTS.md`
2. `docs/AGENT_CURRENT_CONTEXT.md`
3. The route/service/repository files directly involved in the task
4. `docs/AGENT_HANDOFF_TEMPLATE.md`

## Ownership

- Codex owns final UI/UX direction and visual consistency.
- Claude Code may implement frontend when the task includes an approved UI spec.
- Claude Code owns backend-heavy implementation, security patches, API wiring, and broad automated QA.
- PlotCode/Kimi/GLM are worker agents only. They must not invent new visual systems.

## Frontend Hard Rules

- Light mode only unless the user explicitly requests otherwise.
- Use existing Promise layout primitives before creating new UI.
- Do not squeeze desktop UI into mobile.
- Mobile and desktop branches must stay separate when layouts differ.
- Bottom docks must never cover the final card, final button, or final form field.
- Admin mobile chrome hide/show has a hard invariant: if content moves up by `4rem`, the mobile content surface must extend down by `4rem`; never leave a white/gray strip at the bottom.
- Admin mobile sheets use one native contract: portal to `document.body` when under the transformed shell, real drag pill only, no fake handle, no top-right X on normal sheets, body scroll inside, safe-area footer.
- Bangla and English UI must both fit cleanly.
- Do not introduce a new palette, shadow style, navigation style, or card shape without approval.
- No decorative gradient blobs, dark dashboards, marketing hero sections inside operational tools, or random template imports.
- Admin mobile UI work must be driven by `docs/ADMIN_MOBILE_VISUAL_LEDGER.md`.
- Broad admin mobile UI work must use `skills/grill-me/SKILL.md` before implementation.
- Claude Code may implement frontend only from a Codex-approved UI spec; admin mobile work must name the ledger row.
- Do not repeat "next polish" work without ledger evidence.

## Backend Hard Rules

- Do not change schema, auth, session, billing, customer, or corporate data flow unless the task explicitly says so.
- No sensitive fields in responses: password, passwordHash, temporaryPassword, resetSecret, otpSecret, codeHash.
- Customer/corporate routes must be ownership-scoped.
- Admin routes must use the right auth and permission middleware.
- DB DDL must use `db.execute(sql`...`)` from drizzle-orm (standard pg). Do NOT use `neon()` for `DATABASE_URL` — only brain services use `neon()` with `BRAIN_DATABASE_URL`.

## Completion

Every agent must run the task's requested checks and return the feedback block from `AGENTS.md`.
