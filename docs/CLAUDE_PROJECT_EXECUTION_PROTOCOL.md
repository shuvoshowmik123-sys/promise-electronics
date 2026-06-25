# Claude Project Execution Protocol

Claude Code may work on Promise Electronics only inside this protocol.

## Required Read Order

Before any task, read:

1. `AGENTS.md`
2. `rules.md`
3. `docs/AGENT_CURRENT_CONTEXT.md`
4. `docs/AGENT_FRONTEND_PLAYBOOK.md`
5. `docs/AGENT_SKILLS.md`
6. `docs/AGENT_HANDOFF_TEMPLATE.md`

For admin mobile UI tasks, also read:

1. `docs/ADMIN_MOBILE_NATIVE_DESIGN.md`
2. `docs/ADMIN_MOBILE_VISUAL_LEDGER.md`
3. `skills/grill-me/SKILL.md`

## Work Ownership

- Backend/security/API/schema/test implementation: Claude may own.
- Frontend implementation: Claude may work only from a Codex-approved UI spec.
- Admin mobile frontend: Claude must name the target ledger row before editing.
- Codex owns final UI/UX direction and cross-agent consistency.

## Admin Mobile Execution Rules

Before editing, Claude must state:

- target ledger row
- current ledger status
- approved reference pattern
- scope
- forbidden files/portals
- intended new ledger status

During implementation:

- copy Dashboard C native behavior unless the spec says otherwise
- keep normal list chrome hiding top/bottom together
- hide global chrome for detail/edit/chat/action surfaces
- use bottom sheets as the default mobile detail surface
- keep dense KPI blocks collapsed by default
- keep admin blue/slate as the base system
- do not invent a new mobile shell, dock, card, or modal pattern

After implementation:

- run required checks
- perform mobile QA at required viewports
- report the ledger row update
- include evidence path or screenshots
- return the exact `AGENTS.md` feedback block

## Required Checks

For frontend implementation:

- `npx tsc --noEmit --pretty false`
- `npx vite build --mode development`
- `git diff --check`

For admin mobile implementation, browser QA must include:

- `390x844`
- `430x932`
- `584x918`
- desktop spot-check at `1440x900`

## Stop Conditions

Stop and report before editing if:

- no ledger row is named for admin mobile work
- the requested UI contradicts the visual ledger
- the task needs a new visual system
- the task would touch backend and frontend but only one side is approved
- the implementation requires changing unrelated portals
- the agent cannot verify the behavior it changed
