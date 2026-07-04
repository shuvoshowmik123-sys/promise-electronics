# Promise Electronics Agent Rules

**Master operating policy:** `docs/AI_AGENT_OPERATING_RULES.md` (v2026-07-04-v3). If any rule conflicts, the master file wins.

This file is a short routing reference. Full policy lives in the master file.

## Read Order

Before any work, read `docs/AI_AGENT_OPERATING_RULES.md`.

Before frontend work, also read:
1. `docs/AGENT_FRONTEND_PLAYBOOK.md`
2. `docs/ADMIN_MOBILE_VISUAL_LEDGER.md` (admin mobile work)
3. `docs/AGENT_HANDOFF_TEMPLATE.md`

Before backend work, also read:
1. `docs/AGENT_BACKEND_PLAYBOOK.md`
2. The route/service/repository files directly involved in the task
3. `docs/AGENT_HANDOFF_TEMPLATE.md`

Before QA work, also read:
1. `docs/AGENT_TESTING_PLAYBOOK.md`

Before release, also read:
1. `docs/RELEASE_CHECKLIST.md`

## Ownership

- Codex owns final UI/UX direction and visual consistency.
- Claude Code may implement frontend when the task includes an approved UI spec.
- Claude Code owns backend-heavy implementation, security patches, API wiring, and broad automated QA.
- Worker agents (PlotCode, Kimi, GLM, Fable) must not invent new visual systems. See master Section 10.4.

## Completion

Every agent must run the task's requested checks and return the feedback block per master Section 16.